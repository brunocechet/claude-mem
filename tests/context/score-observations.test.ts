/**
 * scoreObservations tests
 *
 * Verifies the batched score helper used by ContextBuilder to share a
 * single TYPE_WEIGHT × recency-decay pass across rankByPriority and
 * clusterBySubject (Item 3 of context digest v2 follow-ups).
 *
 *   - Returns a Map keyed by obs.id
 *   - Same scores as scoreObservation called per-row
 *   - Empty input → empty map
 *   - Deterministic for a given `now`
 */

import { describe, it, expect } from 'bun:test';
import {
  scoreObservation,
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

describe('scoreObservations', () => {
  it('returns a Map keyed by obs.id', () => {
    const obs = [
      makeObs(11, 'decision', 0),
      makeObs(22, 'feature', 1),
      makeObs(33, 'discovery', 5),
    ];

    const scores = scoreObservations(obs, NOW);

    expect(scores).toBeInstanceOf(Map);
    expect(scores.size).toBe(3);
    expect(scores.has(11)).toBe(true);
    expect(scores.has(22)).toBe(true);
    expect(scores.has(33)).toBe(true);
    expect(scores.has(99)).toBe(false);
  });

  it('produces scores identical to scoreObservation called per-row', () => {
    // Mixed ages (incl. future-dated) and a mix of weighted + unknown types.
    const obs = [
      makeObs(1, 'decision', 0),
      makeObs(2, 'security_alert', 2),
      makeObs(3, 'bugfix', 7),
      makeObs(4, 'feature', 14),
      makeObs(5, 'change', 0.5),
      makeObs(6, 'refactor', 3),
      makeObs(7, 'security_note', 21),
      makeObs(8, 'discovery', 1),
      makeObs(9, 'totally_unknown_type', 0),
      makeObs(10, 'decision', -3), // clock-skew / future-dated
    ];

    const map = scoreObservations(obs, NOW);

    for (const o of obs) {
      // Use toBeCloseTo for floating-point safety, but the implementations
      // share the exact same code path so equality should hold bit-for-bit.
      expect(map.get(o.id)).toBe(scoreObservation(o, NOW));
    }
  });

  it('returns an empty Map for empty input', () => {
    const scores = scoreObservations([], NOW);
    expect(scores).toBeInstanceOf(Map);
    expect(scores.size).toBe(0);
  });

  it('is deterministic for a given `now`', () => {
    const obs = [
      makeObs(1, 'decision', 0),
      makeObs(2, 'feature', 5),
      makeObs(3, 'discovery', 10),
    ];

    const a = scoreObservations(obs, NOW);
    const b = scoreObservations(obs, NOW);

    expect(a.size).toBe(b.size);
    for (const [id, score] of a) {
      expect(b.get(id)).toBe(score);
    }
  });

  it('does not mutate the input array', () => {
    const obs = [
      makeObs(1, 'decision', 0),
      makeObs(2, 'feature', 1),
    ];
    const snapshot = obs.map(o => ({ ...o }));

    scoreObservations(obs, NOW);

    expect(obs).toEqual(snapshot);
  });

  it('defaults `now` to Date.now() when omitted', () => {
    // We can't pin Date.now() easily without monkey-patching, but we can
    // verify the call signature accepts a single arg and returns a Map.
    const obs = [makeObs(1, 'decision', 0)];
    const scores = scoreObservations(obs);
    expect(scores).toBeInstanceOf(Map);
    expect(scores.has(1)).toBe(true);
  });
});
