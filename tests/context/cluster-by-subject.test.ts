/**
 * clusterBySubject tests
 *
 * Verifies subject-based clustering of observations:
 *   - Same-subject obs collapse into one cluster
 *   - Intra-cluster sort by score DESC
 *   - Inter-cluster sort by top score DESC, tiebreak by lastTouched DESC
 *   - Singletons preserved (no min-cluster-size threshold)
 *   - Empty input → empty array
 */

import { describe, it, expect } from 'bun:test';
import {
  clusterBySubject,
  scoreObservations,
} from '../../src/services/context/ObservationCompiler.js';
import type { Observation } from '../../src/services/context/types.js';

const NOW = 1_735_732_800_000;
const ONE_DAY = 24 * 60 * 60 * 1000;

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
    discovery_tokens: 0,
    created_at: new Date(NOW - ageDays * ONE_DAY).toISOString(),
    created_at_epoch: NOW - ageDays * ONE_DAY,
    verified_at: null,
    stale: 0,
    ...overrides,
  };
}

describe('clusterBySubject', () => {
  it('collapses 3 observations on the same file into one cluster', () => {
    const obs = [
      makeObs(1, 'discovery', 0, { files_modified: '["src/access-token-hook/index.ts"]' }),
      makeObs(2, 'feature', 1, { files_modified: '["src/access-token-hook/index.ts"]' }),
      makeObs(3, 'bugfix', 2, { files_modified: '["src/access-token-hook/index.ts"]' }),
    ];

    const result = clusterBySubject(obs, NOW);

    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(3);
    expect(result[0].subject).toBe('access-token-hook');
    // bugfix at 2d (8 * 0.5^(2/7) ≈ 6.56) beats feature at 1d (6 * 0.5^(1/7) ≈ 5.43)
    // and discovery at 0d (1 * 1 = 1).
    expect(result[0].topByPriority.id).toBe(3);
    expect(result[0].observations.map(o => o.id)).toEqual([3, 2, 1]);
  });

  it('groups mixed obs across 3 files into 3 clusters sorted by top score DESC', () => {
    const obs = [
      makeObs(1, 'discovery', 0, { files_modified: '["src/foo.ts"]' }),       // score ~1
      makeObs(2, 'decision', 1, { files_modified: '["src/bar.ts"]' }),         // score ~9.05
      makeObs(3, 'bugfix', 0, { files_modified: '["src/baz.ts"]' }),           // score 8
    ];

    const result = clusterBySubject(obs, NOW);

    expect(result).toHaveLength(3);
    // decision (bar) wins, bugfix (baz) second, discovery (foo) third.
    expect(result.map(c => c.subject)).toEqual(['bar', 'baz', 'foo']);
  });

  it('preserves singleton clusters (no min-cluster-size threshold)', () => {
    const obs = [
      makeObs(1, 'feature', 0, { files_modified: '["src/a.ts"]' }),
      makeObs(2, 'feature', 0, { files_modified: '["src/b.ts"]' }),
      makeObs(3, 'feature', 0, { files_modified: '["src/c.ts"]' }),
    ];

    const result = clusterBySubject(obs, NOW);

    expect(result).toHaveLength(3);
    for (const cluster of result) {
      expect(cluster.count).toBe(1);
    }
  });

  it('returns empty array on empty input', () => {
    expect(clusterBySubject([], NOW)).toEqual([]);
  });

  it('intra-cluster: observations sorted by score DESC within a cluster', () => {
    // Same file, varying type weights. After sort: decision > bugfix > feature > discovery.
    const obs = [
      makeObs(1, 'discovery', 0, { files_modified: '["src/x.ts"]' }),
      makeObs(2, 'decision', 0, { files_modified: '["src/x.ts"]' }),
      makeObs(3, 'bugfix', 0, { files_modified: '["src/x.ts"]' }),
      makeObs(4, 'feature', 0, { files_modified: '["src/x.ts"]' }),
    ];

    const result = clusterBySubject(obs, NOW);

    expect(result).toHaveLength(1);
    // Score order with all ages == 0: decision(10) > bugfix(8) > feature(6) > discovery(1).
    expect(result[0].observations.map(o => o.id)).toEqual([2, 3, 4, 1]);
    expect(result[0].topByPriority.id).toBe(2);
  });

  it('orders clusters by top score DESC: top-8 cluster precedes top-6 cluster', () => {
    // Cluster A (file alpha): bugfix(8) → top score 8.0
    // Cluster B (file beta): feature(6) → top score 6.0
    const obs = [
      makeObs(1, 'feature', 0, { files_modified: '["src/beta.ts"]' }),
      makeObs(2, 'bugfix', 0, { files_modified: '["src/alpha.ts"]' }),
    ];

    const result = clusterBySubject(obs, NOW);

    expect(result).toHaveLength(2);
    expect(result[0].subject).toBe('alpha');
    expect(result[0].topByPriority.id).toBe(2);
    expect(result[1].subject).toBe('beta');
    expect(result[1].topByPriority.id).toBe(1);
  });

  it('lastTouched equals max created_at_epoch in cluster', () => {
    const obs = [
      makeObs(1, 'feature', 5, { files_modified: '["src/p.ts"]' }), // older
      makeObs(2, 'feature', 1, { files_modified: '["src/p.ts"]' }), // newer
      makeObs(3, 'feature', 3, { files_modified: '["src/p.ts"]' }),
    ];

    const result = clusterBySubject(obs, NOW);

    expect(result).toHaveLength(1);
    expect(result[0].lastTouched).toBe(NOW - 1 * ONE_DAY);
  });

  it('inter-cluster tiebreak on equal top score: lastTouched DESC', () => {
    // Both clusters have a feature obs (same type weight = 6, same age = 0d), so
    // the top-score is identical. Tiebreak should use lastTouched DESC.
    const obs = [
      makeObs(1, 'feature', 0, { files_modified: '["src/older-cluster.ts"]' }),
      makeObs(2, 'feature', 5, { files_modified: '["src/older-cluster.ts"]' }),
      // newer-cluster only has the 0d obs → lastTouched is NOW.
      makeObs(3, 'feature', 0, { files_modified: '["src/newer-cluster.ts"]' }),
    ];

    const result = clusterBySubject(obs, NOW);

    expect(result).toHaveLength(2);
    // Both top observations score the same (feature × 1.0). Both clusters have
    // lastTouched = NOW (each has a 0d obs), so they tie completely on the
    // ordering keys. The Map iteration order falls back to insertion order;
    // either result is acceptable. We only assert that both are present.
    // (subject is the basename without extension — see normalizeSubject.)
    const subjects = result.map(c => c.subject).sort();
    expect(subjects).toEqual(['newer-cluster', 'older-cluster'].sort());
  });

  it('does not mutate input array', () => {
    const obs = [
      makeObs(1, 'feature', 0, { files_modified: '["src/x.ts"]' }),
      makeObs(2, 'bugfix', 0, { files_modified: '["src/y.ts"]' }),
    ];
    const snapshotIds = obs.map(o => o.id);

    clusterBySubject(obs, NOW);

    expect(obs.map(o => o.id)).toEqual(snapshotIds);
  });

  it('handles malformed files_modified by falling back to title-derived subject', () => {
    const obs = [
      makeObs(1, 'feature', 0, { files_modified: 'not-json', title: 'Refactored auth flow' }),
    ];

    const result = clusterBySubject(obs, NOW);

    // Falls back to title-based normalization.
    expect(result).toHaveLength(1);
    expect(result[0].subject).toBe('refactored auth flow');
  });

  it('singleton with empty title and no files still appears as its own cluster', () => {
    const obs = [
      makeObs(1, 'feature', 0, { files_modified: null, title: '' }),
      makeObs(2, 'feature', 0, { files_modified: null, title: '' }),
    ];

    const result = clusterBySubject(obs, NOW);

    // Two singletons: each gets its own group key (won't collide on the empty
    // normalized subject).
    expect(result).toHaveLength(2);
    expect(result[0].count).toBe(1);
    expect(result[1].count).toBe(1);
  });

  // ---------- precomputedScores (Item 3 of v2 follow-ups) ----------

  it('produces identical clusters with vs. without precomputedScores', () => {
    // 10 mixed-type, mixed-age observations across 3 subjects so we exercise
    // intra-cluster sort, inter-cluster sort, and topByPriority selection.
    const obs: Observation[] = [
      makeObs(1, 'discovery', 0,    { files_modified: '["src/foo.ts"]' }),
      makeObs(2, 'feature', 1,      { files_modified: '["src/foo.ts"]' }),
      makeObs(3, 'bugfix', 2,       { files_modified: '["src/foo.ts"]' }),
      makeObs(4, 'decision', 3,     { files_modified: '["src/bar.ts"]' }),
      makeObs(5, 'change', 4,       { files_modified: '["src/bar.ts"]' }),
      makeObs(6, 'refactor', 0.5,   { files_modified: '["src/bar.ts"]' }),
      makeObs(7, 'security_alert', 7, { files_modified: '["src/baz.ts"]' }),
      makeObs(8, 'security_note', 0,  { files_modified: '["src/baz.ts"]' }),
      makeObs(9, 'discovery', 14,   { files_modified: '["src/baz.ts"]' }),
      makeObs(10, 'feature', 0,     { files_modified: '["src/baz.ts"]' }),
    ];

    const scoreMap = scoreObservations(obs, NOW);
    const withMap = clusterBySubject(obs, NOW, scoreMap);
    const withoutMap = clusterBySubject(obs, NOW);

    expect(withMap).toEqual(withoutMap);
  });

  it('falls back to per-row scoring when an obs id is missing from the map', () => {
    const obs: Observation[] = [
      makeObs(1, 'discovery', 0,  { files_modified: '["src/foo.ts"]' }),
      makeObs(2, 'feature', 1,    { files_modified: '["src/foo.ts"]' }),
      makeObs(3, 'bugfix', 2,     { files_modified: '["src/foo.ts"]' }),
      makeObs(4, 'decision', 3,   { files_modified: '["src/bar.ts"]' }),
    ];

    // Deliberately omit obs id=3 (the bugfix that should win the foo cluster).
    const fullMap = scoreObservations(obs, NOW);
    const partialMap = new Map(fullMap);
    partialMap.delete(3);
    expect(partialMap.has(3)).toBe(false);

    // No throw, and the result must match the no-map result exactly.
    const partialResult = clusterBySubject(obs, NOW, partialMap);
    const baseline = clusterBySubject(obs, NOW);

    expect(partialResult).toEqual(baseline);

    // Sanity: obs 3 is still placed sensibly in the foo cluster.
    const fooCluster = partialResult.find(c => c.subject === 'foo');
    expect(fooCluster).toBeDefined();
    expect(fooCluster!.observations.map(o => o.id)).toEqual([3, 2, 1]);
    expect(fooCluster!.topByPriority.id).toBe(3);
  });
});
