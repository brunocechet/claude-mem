/**
 * BlockersRenderer tests
 *
 * Verifies the 🚧 Pending decisions / blockers section:
 *   - Aggregates ActionableSignals from observations
 *   - Sorts most-recent-first
 *   - Caps at config.maxBlockers (with "+ N more" footnote)
 *   - Deduplicates by substring containment + Jaccard ≥ 0.7
 *   - Returns null when nothing survives
 *   - Applies kind-aware prefixes (decide whether / open question)
 */

import { describe, it, expect } from 'bun:test';
import { renderBlockersSection } from '../../../src/services/context/sections/BlockersRenderer.js';
import type { ContextConfig, Observation } from '../../../src/services/context/types.js';

const NOW = 1_735_732_800_000;
const ONE_HOUR = 60 * 60 * 1000;

function makeObs(
  id: number,
  ageHours: number,
  narrative: string | null,
  overrides: Partial<Observation> = {},
): Observation {
  return {
    id,
    memory_session_id: `s-${id}`,
    type: 'discovery',
    title: `obs-${id}`,
    subtitle: null,
    narrative,
    facts: null,
    concepts: null,
    files_read: null,
    files_modified: null,
    discovery_tokens: 0,
    created_at: new Date(NOW - ageHours * ONE_HOUR).toISOString(),
    created_at_epoch: NOW - ageHours * ONE_HOUR,
    verified_at: null,
    stale: 0,
    ...overrides,
  };
}

function makeConfig(maxBlockers: number = 5): ContextConfig {
  return {
    totalObservationCount: 50,
    fullObservationCount: 0,
    sessionCount: 10,
    showReadTokens: false,
    showWorkTokens: false,
    showSavingsAmount: false,
    showSavingsPercent: true,
    observationTypes: new Set(),
    observationConcepts: new Set(),
    fullObservationField: 'narrative',
    showLastSummary: true,
    showLastMessage: false,
    contextBudgetTokens: 0,
    stalenessCutoffEpoch: 0,
    includeStale: false,
    verbose: false,
    showStateHeader: true,
    priorityRanking: true,
    showBlockers: true,
    maxBlockers,
    subjectClustering: true,
  };
}

describe('renderBlockersSection', () => {
  it('renders todos + fixmes + blocker in expected order (most recent first)', () => {
    const observations = [
      // newest at top
      makeObs(10, 0, 'TODO: wire dashboard endpoint to the new API'),
      makeObs(9, 1, 'TODO: cover edge cases in the validator'),
      makeObs(8, 2, 'TODO: add migration for legacy rows'),
      makeObs(7, 3, 'FIXME: race condition between worker startup and migration'),
      makeObs(6, 4, 'FIXME: leaking connection in retry path'),
      makeObs(5, 5, 'Implementation is blocked by upstream auth refactor merging'),
    ];

    const result = renderBlockersSection(observations, makeConfig(10));

    expect(result).not.toBeNull();
    const lines = result!.split('\n');
    expect(lines[0]).toBe('🚧 Pending decisions / blockers');
    // 6 bullets — all visible at maxBlockers=10. Order is recent → old by obs id.
    expect(lines).toHaveLength(7);
    expect(lines[1]).toContain('#10');
    expect(lines[6]).toContain('#5');
    // Bullet shape: 2-space indent + "- "
    expect(lines[1].startsWith('  - ')).toBe(true);
  });

  it('returns null when no signals are extracted', () => {
    const observations = [
      makeObs(1, 0, 'Just a routine refactor with no actionable items'),
      makeObs(2, 1, 'Tweaked styling and updated copy'),
    ];

    const result = renderBlockersSection(observations, makeConfig());

    expect(result).toBeNull();
  });

  it('truncates with "+ N more" footnote when more signals than maxBlockers', () => {
    // Use clearly distinct phrases so neither substring containment nor
    // Jaccard ≥ 0.7 fires across these signals.
    const observations = [
      makeObs(10, 0, 'TODO: wire authentication telemetry into the dashboard'),
      makeObs(9, 1, 'TODO: investigate flaky integration test on Postgres'),
      makeObs(8, 2, 'TODO: backport regex fix to the previous release branch'),
      makeObs(7, 3, 'TODO: document the new CLI flag in the user guide'),
      makeObs(6, 4, 'TODO: add jitter to retry backoff for the queue worker'),
      makeObs(5, 5, 'TODO: rotate signing key before next deploy window'),
      makeObs(4, 6, 'TODO: replace deprecated crypto helper across services'),
    ];

    const result = renderBlockersSection(observations, makeConfig(5));

    expect(result).not.toBeNull();
    const lines = result!.split('\n');
    // 1 header + 5 bullets + 1 footnote = 7 lines.
    expect(lines).toHaveLength(7);
    expect(lines[lines.length - 1]).toBe('  + 2 more');
  });

  it('substring dedup: "TODO: write test" + "todo: WRITE test" → 1 item kept', () => {
    // Both extracted texts will normalize to the same lowercased string. The
    // older observation (lower id) wins on ties.
    const observations = [
      makeObs(1, 1, 'TODO: write test for the parser fallback path'),
      makeObs(2, 0, 'todo: WRITE test for the parser fallback path'),
    ];

    const result = renderBlockersSection(observations, makeConfig());

    expect(result).not.toBeNull();
    const bulletLines = result!.split('\n').slice(1);
    expect(bulletLines).toHaveLength(1);
    // Older (#1) wins on equal-length tie.
    expect(bulletLines[0]).toContain('#1');
  });

  it('substring dedup: shorter text drops, longer text kept', () => {
    const observations = [
      makeObs(1, 1, 'TODO: write test for parser fallback path with edge cases'),
      makeObs(2, 0, 'TODO: write test for parser fallback path'),
    ];

    const result = renderBlockersSection(observations, makeConfig());

    expect(result).not.toBeNull();
    const bulletLines = result!.split('\n').slice(1);
    expect(bulletLines).toHaveLength(1);
    // The longer text wins regardless of which obs is older.
    expect(bulletLines[0]).toContain('with edge cases');
  });

  it('Jaccard 0.7+ dedup: very similar phrases collapse to one bullet', () => {
    // "fix the auth callback handler bug" vs "fix the auth callback handler issue"
    // Tokens differ only in last word → 5/6 = 0.833 Jaccard.
    const observations = [
      makeObs(1, 1, 'TODO: fix the auth callback handler bug found in review'),
      makeObs(2, 0, 'TODO: fix the auth callback handler issue found in review'),
    ];

    const result = renderBlockersSection(observations, makeConfig());

    expect(result).not.toBeNull();
    const bulletLines = result!.split('\n').slice(1);
    expect(bulletLines).toHaveLength(1);
    // Older (#1) wins on Jaccard match.
    expect(bulletLines[0]).toContain('#1');
  });

  it('decision_needed → "decide whether: " prefix', () => {
    const observations = [
      makeObs(1, 0, 'Need to decide whether to keep the legacy fallback path or remove it now'),
    ];

    const result = renderBlockersSection(observations, makeConfig());

    expect(result).not.toBeNull();
    const bullet = result!.split('\n')[1];
    expect(bullet).toContain('decide whether: ');
    expect(bullet).toContain('to keep the legacy fallback');
  });

  it('unresolved_question via "open question" → "open question: " prefix', () => {
    const observations = [
      makeObs(1, 0, 'open question: should retries use exponential backoff or jitter'),
    ];

    const result = renderBlockersSection(observations, makeConfig());

    expect(result).not.toBeNull();
    const bullet = result!.split('\n')[1];
    expect(bullet).toContain('open question: ');
    expect(bullet).toContain('should retries');
  });

  it('unresolved_question via "still need" → no prefix (verb already in text)', () => {
    const observations = [
      makeObs(1, 0, 'We still need a migration script for the existing rows in production'),
    ];

    const result = renderBlockersSection(observations, makeConfig());

    expect(result).not.toBeNull();
    const bullet = result!.split('\n')[1];
    // Should NOT contain either decoration.
    expect(bullet).not.toContain('decide whether:');
    expect(bullet).not.toContain('open question:');
    expect(bullet).toContain('a migration script');
  });

  it('truncates very long signal text at 100 chars (Unicode-safe)', () => {
    const longTail = 'x'.repeat(200);
    const observations = [
      makeObs(1, 0, `TODO: ${longTail}`),
    ];

    const result = renderBlockersSection(observations, makeConfig());

    expect(result).not.toBeNull();
    const bullet = result!.split('\n')[1];
    // Extract just the part between "- " and " (#" to measure the text portion.
    const match = bullet.match(/^  - (.+) \(#\d+/);
    expect(match).not.toBeNull();
    const displayText = match![1];
    // ≤ 100 code points.
    expect(Array.from(displayText).length).toBeLessThanOrEqual(100);
    expect(displayText.endsWith('…')).toBe(true);
  });

  it('returns null for empty observation list', () => {
    expect(renderBlockersSection([], makeConfig())).toBeNull();
  });

  it('caps dedup input at 500 signals, dropping oldest first', () => {
    // Generate 600 observations, each with a single distinct TODO. Use
    // ageHours = id so id=1 is newest (age 1h) and id=600 is oldest
    // (age 600h). The cap should keep the newest 500 (id=1..500) and drop
    // the oldest 100 (id=501..600). With maxBlockers=5, the rendered output
    // should pull from the 5 newest (id=1..5) — none from the dropped 100.
    //
    // Phrasings need <70% Jaccard overlap and no substring containment so the
    // existing dedup doesn't collapse them. Three independently-varying
    // tokens (verb, noun, locale) make the overlap < 0.7 across pairs.
    const verbs = ['audit', 'rewrite', 'migrate', 'profile', 'document', 'rotate', 'cache', 'shard', 'index', 'paginate'];
    const nouns = ['logger', 'parser', 'queue', 'cache', 'router', 'session', 'worker', 'schema', 'crontab', 'binary'];
    const locales = ['module', 'service', 'endpoint', 'package', 'fixture', 'controller', 'helper', 'middleware', 'agent', 'view'];
    const observations: Observation[] = [];
    for (let i = 1; i <= 600; i++) {
      const verb = verbs[i % verbs.length];
      const noun = nouns[Math.floor(i / verbs.length) % nouns.length];
      const locale = locales[Math.floor(i / (verbs.length * nouns.length)) % locales.length];
      observations.push(
        makeObs(i, i, `TODO: ${verb} the ${noun} ${locale} marker${i}`),
      );
    }

    const result = renderBlockersSection(observations, makeConfig(5));

    expect(result).not.toBeNull();
    const lines = result!.split('\n');
    // Header + 5 bullets + footnote.
    expect(lines).toHaveLength(7);
    expect(lines[0]).toBe('🚧 Pending decisions / blockers');

    const bulletLines = lines.slice(1, 6);
    // The 5 visible bullets should be from the newest signals (id=1..5).
    // This positive assertion implies the dropped oldest 100 (id=501..600)
    // are absent — no need for a vacuous `not.toContain` loop.
    const visibleIds = bulletLines
      .map(line => {
        const match = line.match(/#(\d+)/);
        return match ? Number(match[1]) : null;
      })
      .filter((id): id is number => id !== null);
    expect(visibleIds).toHaveLength(5);
    for (const id of visibleIds) {
      expect(id).toBeGreaterThanOrEqual(1);
      expect(id).toBeLessThanOrEqual(5);
    }
  });

  it('cap is a no-op at exactly the threshold (500 signals)', () => {
    // Boundary case: enrichedAll.length === MAX_SIGNALS_BEFORE_DEDUP. The
    // `> MAX` guard means we skip the sort+truncate path; all 500 signals
    // reach dedup unchanged. Use the same verb/noun/locale rotation as the
    // cap-fires test so phrasings don't collapse via Jaccard or substring.
    const verbs = ['audit', 'rewrite', 'migrate', 'profile', 'document', 'rotate', 'cache', 'shard', 'index', 'paginate'];
    const nouns = ['logger', 'parser', 'queue', 'cache', 'router', 'session', 'worker', 'schema', 'crontab', 'binary'];
    const locales = ['module', 'service', 'endpoint', 'package', 'fixture', 'controller', 'helper', 'middleware', 'agent', 'view'];
    const observations: Observation[] = [];
    for (let i = 1; i <= 500; i++) {
      const verb = verbs[i % verbs.length];
      const noun = nouns[Math.floor(i / verbs.length) % nouns.length];
      const locale = locales[Math.floor(i / (verbs.length * nouns.length)) % locales.length];
      observations.push(
        makeObs(i, i, `TODO: ${verb} the ${noun} ${locale} marker${i}`),
      );
    }

    const result = renderBlockersSection(observations, makeConfig(500));

    expect(result).not.toBeNull();
    const lines = result!.split('\n');
    // Header + 500 bullets, no footnote (500 == maxBlockers).
    expect(lines).toHaveLength(501);
    expect(lines[0]).toBe('🚧 Pending decisions / blockers');
    // Newest first: id=1 has ageHours=1 (newest); id=500 has ageHours=500 (oldest).
    expect(lines[1]).toContain('#1');
    expect(lines[500]).toContain('#500');
    // No "+ N more" footnote when nothing is truncated.
    expect(lines[lines.length - 1].startsWith('  + ')).toBe(false);
  });

  it('observationId DESC tiebreaker decides when created_at_epoch is equal', () => {
    // 502 obs all created at the SAME epoch — the recency comparator falls
    // through to `signal.observationId DESC`, so the lowest two IDs (1, 2)
    // are dropped by the cap. With maxBlockers=2 the rendered bullets must
    // reference IDs > 2.
    const sameEpoch = new Date('2026-04-27T12:00:00Z').getTime();
    const verbs = ['audit', 'rewrite', 'migrate', 'profile', 'document', 'rotate', 'cache', 'shard', 'index', 'paginate'];
    const nouns = ['logger', 'parser', 'queue', 'cache', 'router', 'session', 'worker', 'schema', 'crontab', 'binary'];
    const locales = ['module', 'service', 'endpoint', 'package', 'fixture', 'controller', 'helper', 'middleware', 'agent', 'view'];
    const observations: Observation[] = [];
    for (let i = 1; i <= 502; i++) {
      const verb = verbs[i % verbs.length];
      const noun = nouns[Math.floor(i / verbs.length) % nouns.length];
      const locale = locales[Math.floor(i / (verbs.length * nouns.length)) % locales.length];
      // ageHours is irrelevant here — we override created_at_epoch to be
      // identical across every row so the tiebreaker is what decides.
      observations.push(
        makeObs(i, 0, `TODO: ${verb} the ${noun} ${locale} marker${i}`, {
          created_at: new Date(sameEpoch).toISOString(),
          created_at_epoch: sameEpoch,
        }),
      );
    }

    const result = renderBlockersSection(observations, makeConfig(2));

    expect(result).not.toBeNull();
    const lines = result!.split('\n');
    // Header + 2 bullets + footnote.
    expect(lines).toHaveLength(4);
    const bulletLines = lines.slice(1, 3);
    const visibleIds = bulletLines
      .map(line => {
        const match = line.match(/#(\d+)/);
        return match ? Number(match[1]) : null;
      })
      .filter((id): id is number => id !== null);
    expect(visibleIds).toHaveLength(2);
    // The cap dropped IDs 1 and 2 via observationId DESC tiebreaker, so every
    // surviving rendered ID must be greater than 2.
    expect(visibleIds.every(id => id > 2)).toBe(true);
  });

  it('cap is a no-op when input is at or below 500 signals', () => {
    // 50 obs × 1 TODO = 50 signals. Well below the 500 cap. Verify the
    // existing dedup paths render every signal and behave identically to
    // the un-capped path. Use the same verb/noun/locale rotation as the
    // cap-fires test so phrasings are mutually distinct.
    const verbs = ['audit', 'rewrite', 'migrate', 'profile', 'document', 'rotate', 'cache', 'shard', 'index', 'paginate'];
    const nouns = ['logger', 'parser', 'queue', 'cache', 'router', 'session', 'worker', 'schema', 'crontab', 'binary'];
    const locales = ['module', 'service', 'endpoint', 'package', 'fixture', 'controller', 'helper', 'middleware', 'agent', 'view'];
    const observations: Observation[] = [];
    for (let i = 1; i <= 50; i++) {
      const verb = verbs[i % verbs.length];
      const noun = nouns[Math.floor(i / verbs.length) % nouns.length];
      const locale = locales[Math.floor(i / (verbs.length * nouns.length)) % locales.length];
      observations.push(
        makeObs(i, i, `TODO: ${verb} the ${noun} ${locale} marker${i}`),
      );
    }

    const result = renderBlockersSection(observations, makeConfig(100));

    expect(result).not.toBeNull();
    const lines = result!.split('\n');
    // Header + 50 bullets, no footnote (50 < maxBlockers=100).
    expect(lines).toHaveLength(51);
    expect(lines[0]).toBe('🚧 Pending decisions / blockers');
    // First bullet is newest (id=1, age=1h); last is oldest (id=50, age=50h).
    expect(lines[1]).toContain('#1');
    expect(lines[50]).toContain('#50');
    // No "+ N more" footnote when nothing is truncated.
    expect(lines[lines.length - 1].startsWith('  + ')).toBe(false);
  });

  it('one obs failing extraction does not poison the section', () => {
    // The current extractor never throws on shape, but we still verify the
    // contract by mixing a normal row with one whose narrative is a malformed
    // shape. The section should still render the surviving signal.
    const observations = [
      makeObs(1, 0, 'TODO: ship the worker restart hardening'),
      // Empty narrative → no signals from this row, but no crash either.
      makeObs(2, 1, ''),
    ];

    const result = renderBlockersSection(observations, makeConfig());

    expect(result).not.toBeNull();
    const lines = result!.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('#1');
  });
});
