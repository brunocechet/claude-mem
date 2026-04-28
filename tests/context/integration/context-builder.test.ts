/**
 * ContextBuilder integration tests
 *
 * End-to-end coverage for `buildContextOutput` — the orchestrator that
 * assembles the final digest from pre-loaded observations + summaries plus
 * the resolved phase-2/phase-3 inputs (state header, blockers, clusters).
 *
 * Per-component tests live in cluster-by-subject.test.ts, rank-by-priority.test.ts,
 * sections/state-renderer.test.ts, sections/blockers-renderer.test.ts, etc.
 * This file locks the section-ordering contract and the per-feature rollback
 * behavior across 4 config combos:
 *
 *   A — All-on (v2 defaults): state header + blockers + ranking + clustering
 *   B — All-off (pre-v2 rollback shape): verbose, no blockers, no clusters
 *   C — Clustering off + ranking on: flat timeline, but priority-ordered
 *   D — Empty project (0 obs, 0 summaries): empty-state output, no v2 sections
 */

import { describe, it, expect, mock } from 'bun:test';

// Mock ModeManager before importing anything that touches the formatter pipeline.
// The integration target pulls in HumanFormatter / AgentFormatter / TimelineRenderer
// transitively, all of which call ModeManager.getInstance() at render time.
mock.module('../../../src/services/domain/ModeManager.js', () => ({
  ModeManager: {
    getInstance: () => ({
      getActiveMode: () => ({
        name: 'code',
        prompts: {},
        observation_types: [
          { id: 'decision', emoji: 'D' },
          { id: 'bugfix', emoji: 'B' },
          { id: 'feature', emoji: 'F' },
          { id: 'discovery', emoji: 'I' },
        ],
        observation_concepts: [],
      }),
      getTypeIcon: (type: string) => {
        const icons: Record<string, string> = {
          decision: 'D',
          bugfix: 'B',
          feature: 'F',
          discovery: 'I',
        };
        return icons[type] || '?';
      },
      getWorkEmoji: () => 'W',
    }),
  },
}));

import { buildContextOutput } from '../../../src/services/context/ContextBuilder.js';
import {
  rankByPriority,
  clusterBySubject,
} from '../../../src/services/context/ObservationCompiler.js';
import { renderBlockersSection } from '../../../src/services/context/sections/BlockersRenderer.js';
import { renderAgentEmptyState } from '../../../src/services/context/formatters/AgentFormatter.js';
import type {
  ContextConfig,
  Observation,
  SessionSummary,
} from '../../../src/services/context/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = 1_735_732_800_000;
const ONE_DAY = 24 * 60 * 60 * 1000;

const PROJECT = 'test-project';
// `/dev/null` is not a git repo, so renderStateHeader() returns null naturally.
// Combos A and C therefore exercise the "state header was requested but unavailable"
// path — the configured flag is true but the rendered string is null. That mirrors
// production behavior for non-git cwds.
const NON_GIT_CWD = '/dev/null';

function makeObs(
  id: number,
  type: string,
  ageDays: number,
  overrides: Partial<Observation> = {},
): Observation {
  return {
    id,
    memory_session_id: `s-${id}`,
    type,
    title: `obs-${id}`,
    subtitle: null,
    narrative: null,
    facts: null,
    concepts: null,
    files_read: null,
    files_modified: null,
    discovery_tokens: 100,
    created_at: new Date(NOW - ageDays * ONE_DAY).toISOString(),
    created_at_epoch: NOW - ageDays * ONE_DAY,
    verified_at: null,
    stale: 0,
    ...overrides,
  };
}

function makeSummary(id: number, ageDays: number, request: string): SessionSummary {
  return {
    id,
    memory_session_id: `s-summary-${id}`,
    request,
    investigated: 'investigated stuff',
    learned: 'learned stuff',
    completed: 'completed stuff',
    next_steps: null,
    created_at: new Date(NOW - ageDays * ONE_DAY).toISOString(),
    created_at_epoch: NOW - ageDays * ONE_DAY,
  };
}

/**
 * 12 synthetic observations across 3 subjects (4 obs each), 4 types, with one
 * TODO line and one priority winner per cluster.
 *
 * Subjects are derived by `normalizeSubject` from `files_modified`. We use
 * `index.ts` files inside each subject directory because the GENERIC_BASENAMES
 * rule promotes the parent dir to the cluster name — so all four files in
 * `src/auth-flow/` collapse into one "auth-flow" cluster.
 *
 * Types per subject (chosen so cluster ordering is unambiguous):
 *   - auth-flow: decision (#1), feature (#2), discovery (#3 with TODO), bugfix (#4)
 *               → top by priority is decision (weight 10)
 *   - database:  feature (#5), bugfix (#6), discovery (#7), discovery (#8)
 *               → top is bugfix (weight 8)
 *   - viewer:    feature (#9), bugfix (#10), discovery (#11), discovery (#12)
 *               → top is bugfix (weight 8) but at age 6d, so decays below database's bugfix at 1d
 *
 * Cluster ordering (top-priority DESC):
 *   auth-flow (decision @ 0d, ~10.0) > database (bugfix @ 1d, ~7.24) > viewer (bugfix @ 6d, ~3.97)
 */
function buildSyntheticObservations(): Observation[] {
  return [
    // auth-flow cluster (subject = parent dir because basename "index" is generic)
    makeObs(1, 'decision', 0, {
      title: 'Pick JWT vs session cookies',
      files_modified: '["src/auth-flow/index.ts"]',
      narrative: 'Decided on JWT for stateless verification.',
    }),
    makeObs(2, 'feature', 1, {
      title: 'Wire token refresh',
      files_modified: '["src/auth-flow/index.ts"]',
      narrative: 'Implemented refresh handler.',
    }),
    makeObs(3, 'discovery', 0, {
      title: 'Auth callback edge case',
      files_modified: '["src/auth-flow/index.ts"]',
      // TODO leader + 10-200 char tail triggers extractActionableSignals.
      narrative:
        'TODO: handle the case where the auth callback receives an expired refresh token mid-flight',
    }),
    makeObs(4, 'bugfix', 2, {
      title: 'Fix token expiry off-by-one',
      files_modified: '["src/auth-flow/index.ts"]',
      narrative: 'Off-by-one in expiry check.',
    }),

    // database cluster
    makeObs(5, 'feature', 0, {
      title: 'Add migration scaffolding',
      files_modified: '["src/database/index.ts"]',
      narrative: 'New migration runner.',
    }),
    makeObs(6, 'bugfix', 1, {
      title: 'Fix migration ordering',
      files_modified: '["src/database/index.ts"]',
      narrative: 'Ordering bug in v3 migration.',
    }),
    makeObs(7, 'discovery', 4, {
      title: 'DB connection pool tuning',
      files_modified: '["src/database/index.ts"]',
      narrative: 'Pool size tuned to 20.',
    }),
    makeObs(8, 'discovery', 5, {
      title: 'DB schema overview',
      files_modified: '["src/database/index.ts"]',
      narrative: 'Schema description.',
    }),

    // viewer cluster
    makeObs(9, 'feature', 5, {
      title: 'New viewer panel',
      files_modified: '["src/viewer/index.ts"]',
      narrative: 'Panel component for viewer.',
    }),
    makeObs(10, 'bugfix', 6, {
      title: 'Viewer reload jitter',
      files_modified: '["src/viewer/index.ts"]',
      narrative: 'Jitter on reload.',
    }),
    makeObs(11, 'discovery', 7, {
      title: 'Viewer perf notes',
      files_modified: '["src/viewer/index.ts"]',
      narrative: 'Perf notes.',
    }),
    makeObs(12, 'discovery', 8, {
      title: 'Viewer rendering pipeline',
      files_modified: '["src/viewer/index.ts"]',
      narrative: 'Pipeline notes.',
    }),
  ];
}

function buildSyntheticSummaries(): SessionSummary[] {
  // Most-recent-first ordering matches what the SessionStore returns.
  return [
    makeSummary(101, 0, 'Wire up auth flow'),
    makeSummary(102, 3, 'Database refactor'),
    makeSummary(103, 7, 'Initial viewer scaffold'),
  ];
}

/**
 * Default v2 ContextConfig. Each combo overrides what it needs.
 */
function makeBaseConfig(overrides: Partial<ContextConfig> = {}): ContextConfig {
  return {
    totalObservationCount: 50,
    fullObservationCount: 1,
    sessionCount: 5,
    showReadTokens: false,
    showWorkTokens: false,
    showSavingsAmount: false,
    showSavingsPercent: true,
    observationTypes: new Set(['decision', 'bugfix', 'feature', 'discovery']),
    observationConcepts: new Set<string>(),
    fullObservationField: 'narrative',
    showLastSummary: false,
    showLastMessage: false,
    contextBudgetTokens: 0,
    stalenessCutoffEpoch: 0,
    includeStale: true,
    verbose: false,
    showStateHeader: true,
    priorityRanking: true,
    showBlockers: true,
    maxBlockers: 5,
    subjectClustering: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test combos
// ---------------------------------------------------------------------------

describe('buildContextOutput integration', () => {
  describe('Combo A — all-on (v2 defaults)', () => {
    const config = makeBaseConfig();
    const obsRaw = buildSyntheticObservations();
    const observations = rankByPriority(obsRaw, NOW);
    const summaries = buildSyntheticSummaries();
    const blockersSection = renderBlockersSection(observations, config);
    const clusters = clusterBySubject(observations, NOW);
    // /dev/null isn't a git repo — renderStateHeader returns null. We pass null
    // directly so we don't actually shell out during the test.
    const stateHeader = null;

    const output = buildContextOutput(
      PROJECT,
      observations,
      summaries,
      config,
      NON_GIT_CWD,
      undefined,
      false,
      stateHeader,
      blockersSection,
      clusters,
    );

    it('emits the blockers section because the synthetic data carries a TODO', () => {
      expect(output).toContain('🚧 Pending decisions / blockers');
    });

    it('emits the v2 collapsed economics line, not the verbose 4-line block', () => {
      // Collapsed economics line: "📊 N obs · ... · use mem-search skill for deeper history"
      expect(output).toMatch(/📊 \d+ obs/);
      expect(output).toContain('use mem-search skill for deeper history');

      // Verbose 4-line block markers must be absent.
      expect(output).not.toContain('Stats: ');
      expect(output).not.toContain('Loading: ');
      expect(output).not.toContain('Work investment: ');
    });

    it('omits the legend, column key, and Context Index preamble when verbose=false', () => {
      expect(output).not.toContain('Legend: ');
      expect(output).not.toContain('Read: Tokens');
      expect(output).not.toContain('Context Index: ');
    });

    it('renders a clustered timeline with cluster headers', () => {
      // Cluster header pattern: "<emoji> <subject> (N obs · last <time>)"
      expect(output).toMatch(/\(\d+ obs · last /);
    });

    it('orders sections: blockers BEFORE the [project] recent context banner', () => {
      const blockersIdx = output.indexOf('🚧 Pending decisions / blockers');
      const headerIdx = output.indexOf(`[${PROJECT}] recent context`);
      expect(blockersIdx).toBeGreaterThanOrEqual(0);
      expect(headerIdx).toBeGreaterThan(0);
      expect(blockersIdx).toBeLessThan(headerIdx);
    });

    it('orders sections: header BEFORE the cluster timeline', () => {
      const headerIdx = output.indexOf(`[${PROJECT}] recent context`);
      const clusterIdx = output.search(/\(\d+ obs · last /);
      expect(headerIdx).toBeGreaterThan(0);
      expect(clusterIdx).toBeGreaterThan(0);
      expect(headerIdx).toBeLessThan(clusterIdx);
    });

    it('surfaces the highest-priority cluster (decision-led auth-flow) before lower-priority ones', () => {
      // Cluster order is by top-priority score DESC. With our fixture:
      //   - auth-flow has decision(#1, weight 10) at age 0 → ~10.0
      //   - database has bugfix(#6, weight 8) at age 1d → ~7.24
      //   - viewer   has bugfix(#10, weight 8) at age 6d → ~3.97
      // Subject order in normalizeSubject is the basename without extension or
      // the directory — for files_modified="src/auth-flow/index.ts" the subject
      // is "auth-flow" (parent dir name when basename is "index.ts").
      const authIdx = output.indexOf('auth-flow');
      const dbIdx = output.indexOf('database');
      const viewerIdx = output.indexOf('viewer');
      expect(authIdx).toBeGreaterThan(0);
      expect(dbIdx).toBeGreaterThan(authIdx);
      expect(viewerIdx).toBeGreaterThan(dbIdx);
    });

    it('renders the TODO blocker line referencing the source observation id (#3)', () => {
      // BlockersRenderer emits: "  - <text> (#<id> · <time>)"
      // The TODO is on observation #3.
      expect(output).toContain('#3');
      // The TODO text we planted ends in "mid-flight" before truncation.
      expect(output).toMatch(/handle the case where the auth callback/);
    });
  });

  describe('Combo B — all-off (pre-v2 rollback shape)', () => {
    const config = makeBaseConfig({
      verbose: true,
      showStateHeader: false,
      priorityRanking: false,
      showBlockers: false,
      subjectClustering: false,
    });
    const observations = buildSyntheticObservations(); // no rankByPriority
    const summaries = buildSyntheticSummaries();

    const output = buildContextOutput(
      PROJECT,
      observations,
      summaries,
      config,
      NON_GIT_CWD,
      undefined,
      false,
      null, // showStateHeader=false → caller passes null
      null, // showBlockers=false → caller passes null
      null, // subjectClustering=false → caller passes null
    );

    it('does not begin with the 📍 state header line', () => {
      expect(output.startsWith('📍 ')).toBe(false);
    });

    it('renders the verbose Legend block', () => {
      // Agent verbose legend: "Legend: 🎯session ..."
      expect(output).toContain('Legend: ');
    });

    it('renders the verbose Stats line (4-line agent economics)', () => {
      // Agent verbose economics emits "Stats: N obs (Xt read) | Yt work | ..."
      expect(output).toContain('Stats: ');
    });

    it('does NOT contain the 🚧 Pending decisions / blockers section', () => {
      expect(output).not.toContain('🚧 Pending decisions / blockers');
    });

    it('does NOT contain a clustered timeline header', () => {
      // Cluster header pattern; absent in flat timeline path.
      expect(output).not.toMatch(/\(\d+ obs · last /);
    });

    it('renders a flat per-day timeline (### day headers)', () => {
      // AgentFormatter.renderAgentDayHeader → "### <day>"
      expect(output).toMatch(/### \w+ \d+/);
    });

    it('orders sections: header BEFORE the flat day timeline', () => {
      const headerIdx = output.indexOf(`[${PROJECT}] recent context`);
      const dayIdx = output.search(/### \w+ \d+/);
      expect(headerIdx).toBeGreaterThanOrEqual(0);
      expect(dayIdx).toBeGreaterThan(headerIdx);
    });
  });

  describe('Combo C — clustering off + ranking on', () => {
    const config = makeBaseConfig({
      subjectClustering: false,
      // Verbose stays false so blocker/state header gating is the only difference
      // versus combo A.
    });
    const obsRaw = buildSyntheticObservations();
    const observations = rankByPriority(obsRaw, NOW);
    const summaries = buildSyntheticSummaries();
    const blockersSection = renderBlockersSection(observations, config);

    const output = buildContextOutput(
      PROJECT,
      observations,
      summaries,
      config,
      NON_GIT_CWD,
      undefined,
      false,
      null, // /dev/null is not a git repo → renderStateHeader returned null
      blockersSection,
      null, // subjectClustering=false → caller passes null
    );

    it('uses the FLAT timeline (no cluster headers)', () => {
      expect(output).not.toMatch(/\(\d+ obs · last /);
      // …but still has day-grouped headers from the flat path.
      expect(output).toMatch(/### \w+ \d+/);
    });

    it('still renders the blockers section (showBlockers=true)', () => {
      expect(output).toContain('🚧 Pending decisions / blockers');
    });

    it('orders observations by priority within the flat timeline', () => {
      // Pull all "ID TIME TYPE TITLE" lines from the flat agent timeline.
      // The format is e.g. "1 9:00a D Pick JWT vs session cookies" or "1 D Pick..."
      // Our mocked icons are single letters: D=decision, B=bugfix, F=feature, I=discovery.
      // Within a single day, the priority-ranked order should put the decision
      // (#1, weight 10, age 0) before any discovery (weight 1) on the same day.
      const decisionIdx = output.indexOf('Pick JWT vs session cookies');
      const auth0DiscoveryIdx = output.indexOf('Auth callback edge case');
      expect(decisionIdx).toBeGreaterThan(0);
      expect(auth0DiscoveryIdx).toBeGreaterThan(0);
      // Decision (weight 10) comes before discovery (weight 1) at same age.
      expect(decisionIdx).toBeLessThan(auth0DiscoveryIdx);
    });

    it('emits the v2 collapsed economics line (verbose=false)', () => {
      expect(output).toMatch(/📊 \d+ obs/);
      expect(output).not.toContain('Stats: ');
    });
  });

  describe('Combo D — empty project (0 obs, 0 summaries)', () => {
    // The empty-state branch in `generateContext` short-circuits before
    // `buildContextOutput` is called. We exercise the same code path here
    // by asserting on `renderAgentEmptyState` directly — which is what
    // `generateContext` returns when observations + summaries are both empty.
    it('returns the agent empty-state output (no v2 sections)', () => {
      const output = renderAgentEmptyState(PROJECT);

      // Empty-state header still carries the "[project] recent context" banner.
      expect(output).toContain(`[${PROJECT}] recent context`);
      expect(output).toContain('No previous sessions found');

      // None of the v2 sections leak into the empty state.
      expect(output).not.toContain('🚧 Pending decisions / blockers');
      expect(output).not.toMatch(/\(\d+ obs · last /);
      expect(output).not.toContain('📊 ');
      expect(output).not.toContain('Stats: ');
    });

    // Complement the renderAgentEmptyState test above: directly exercise
    // buildContextOutput with empty arrays to verify the orchestrator
    // itself doesn't crash on the empty-input path.
    it('buildContextOutput does not throw when handed empty arrays directly', () => {
      // Defensive check: in case future refactors route empty inputs through
      // the orchestrator, it must not crash. The output may be sparse, but
      // it should at least include the project header banner.
      const config = makeBaseConfig();
      let output = '';
      expect(() => {
        output = buildContextOutput(
          PROJECT,
          [],
          [],
          config,
          NON_GIT_CWD,
          undefined,
          false,
          null,
          null,
          null,
        );
      }).not.toThrow();
      expect(output).toContain(`[${PROJECT}] recent context`);
    });
  });
});
