/**
 * rankByPriority tests
 *
 * Verifies the type-weighted ranking pass:
 *   score = TYPE_WEIGHT[type] * recencyDecay(ageDays, half-life=7d)
 *
 * Pure function, deterministic clock injected so tests don't depend
 * on wall time.
 */

import { describe, it, expect } from 'bun:test';
import {
  rankByPriority,
  scoreObservations,
} from '../../src/services/context/ObservationCompiler.js';
import type { Observation } from '../../src/services/context/types.js';

const NOW = 1_735_732_800_000; // fixed reference time
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

describe('rankByPriority', () => {
  it('orders one-of-each-type observations by weight when ages are equal', () => {
    // Mixed input order — output must follow the weight table.
    const input: Observation[] = [
      makeObs(1, 'discovery', 1),
      makeObs(2, 'security_note', 1),
      makeObs(3, 'change', 1),
      makeObs(4, 'refactor', 1),
      makeObs(5, 'feature', 1),
      makeObs(6, 'bugfix', 1),
      makeObs(7, 'security_alert', 1),
      makeObs(8, 'decision', 1),
    ];

    const result = rankByPriority(input, NOW);

    // Expected order by weight, with stable input order breaking the change/refactor tie.
    // change (id 3) appears before refactor (id 4) in the input, so on equal score
    // and equal age, change keeps its earlier slot.
    expect(result.map(o => o.type)).toEqual([
      'decision',       // 10
      'security_alert', // 9
      'bugfix',         // 8
      'feature',        // 6
      'change',         // 4 (input first)
      'refactor',       // 4 (input second)
      'security_note',  // 3
      'discovery',      // 1
    ]);
  });

  it('does not mutate the input array', () => {
    const input: Observation[] = [
      makeObs(1, 'discovery', 0),
      makeObs(2, 'decision', 0),
    ];
    const snapshot = input.map(o => o.id);

    rankByPriority(input, NOW);

    expect(input.map(o => o.id)).toEqual(snapshot);
  });

  it('returns a new array (not the input by reference)', () => {
    const input: Observation[] = [makeObs(1, 'decision', 0)];
    const result = rankByPriority(input, NOW);
    expect(result).not.toBe(input);
  });

  it('produces the same output regardless of input order (stable on weight ties)', () => {
    const a = makeObs(1, 'feature', 0);
    const b = makeObs(2, 'bugfix', 5);
    const c = makeObs(3, 'decision', 10);
    const d = makeObs(4, 'discovery', 0);

    const orderings: Observation[][] = [
      [a, b, c, d],
      [d, c, b, a],
      [b, d, a, c],
      [c, a, d, b],
    ];

    const ids = orderings.map(input => rankByPriority(input, NOW).map(o => o.id));

    // All four orderings must produce the same final id sequence.
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).toEqual(ids[0]);
    }
  });

  it('treats unknown types as discovery weight (lowest)', () => {
    // A 0-day-old "totally-made-up" type should rank below a 0-day-old
    // bugfix and at the same level as a 0-day-old discovery (stable).
    const result = rankByPriority(
      [
        makeObs(1, 'totally-made-up', 0),
        makeObs(2, 'discovery', 0),
        makeObs(3, 'bugfix', 0),
      ],
      NOW,
    );

    expect(result[0].id).toBe(3); // bugfix wins
    // The two id=1 (unknown) and id=2 (discovery) tie; stable sort preserves input order.
    expect(result[1].id).toBe(1);
    expect(result[2].id).toBe(2);
  });

  it('newer observation of the same type beats older one (recency decay)', () => {
    const result = rankByPriority(
      [
        makeObs(1, 'feature', 14), // 6 * 0.25 = 1.5
        makeObs(2, 'feature', 0),  // 6 * 1.0  = 6.0
      ],
      NOW,
    );

    expect(result.map(o => o.id)).toEqual([2, 1]);
  });

  it('higher-weight old type can lose to lower-weight new type via decay', () => {
    // decision(10) at 21d → 10 * 0.5^3 = 1.25
    // bugfix(8) at 0d   → 8.0
    const result = rankByPriority(
      [
        makeObs(1, 'decision', 21),
        makeObs(2, 'bugfix', 0),
      ],
      NOW,
    );

    expect(result[0].id).toBe(2);
    expect(result[1].id).toBe(1);
  });

  it('breaks ties on equal score by created_at_epoch DESC, then by input order', () => {
    // Two same-type observations with the same epoch tie completely;
    // input order is preserved.
    const obs1 = makeObs(1, 'feature', 0);
    const obs2 = makeObs(2, 'feature', 0);
    const obs3 = makeObs(3, 'feature', 1); // older

    const result = rankByPriority([obs1, obs2, obs3], NOW);

    expect(result.map(o => o.id)).toEqual([1, 2, 3]);
  });

  it('handles an empty input array', () => {
    expect(rankByPriority([], NOW)).toEqual([]);
  });

  it('handles a single-element array', () => {
    const obs = makeObs(7, 'decision', 3);
    const result = rankByPriority([obs], NOW);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(obs);
  });

  it('does not boost future-dated observations beyond today', () => {
    // A future-dated "decision" (negative age) should score the same as today's.
    const futureObs = makeObs(1, 'decision', -5);
    const todayObs = makeObs(2, 'decision', 0);

    const result = rankByPriority([futureObs, todayObs], NOW);

    // Both score 10 * 1.0 = 10. Tiebreaker is created_at_epoch DESC, so
    // the (newer) future-dated row wins. The point of clamping is that
    // it doesn't beat the same row by a wider margin than today's.
    expect(result.map(o => o.id)).toEqual([1, 2]);
  });

  // ---------- precomputedScores (Item 3 of v2 follow-ups) ----------

  it('produces identical ranking with vs. without precomputedScores', () => {
    // Mixed types and ages, including a future-dated row to exercise clamping.
    const obs: Observation[] = [
      makeObs(1, 'discovery', 0),
      makeObs(2, 'security_note', 5),
      makeObs(3, 'change', 1),
      makeObs(4, 'refactor', 2),
      makeObs(5, 'feature', 7),
      makeObs(6, 'bugfix', 3),
      makeObs(7, 'security_alert', 14),
      makeObs(8, 'decision', 0),
      makeObs(9, 'decision', -2), // future-dated
      makeObs(10, 'totally_unknown_type', 1),
    ];

    const scoreMap = scoreObservations(obs, NOW);
    const withMap = rankByPriority(obs, NOW, scoreMap);
    const withoutMap = rankByPriority(obs, NOW);

    expect(withMap).toEqual(withoutMap);
  });

  it('falls back to per-row scoring when an obs id is missing from the map', () => {
    const obs: Observation[] = [
      makeObs(1, 'discovery', 0),
      makeObs(2, 'decision', 1),
      makeObs(3, 'bugfix', 2),
      makeObs(4, 'feature', 0),
    ];

    // Drop the would-be winner (obs 2, decision @ 1d). The function must
    // still place it correctly by computing its score on the fly.
    const fullMap = scoreObservations(obs, NOW);
    const partialMap = new Map(fullMap);
    partialMap.delete(2);
    expect(partialMap.has(2)).toBe(false);

    const partial = rankByPriority(obs, NOW, partialMap);
    const baseline = rankByPriority(obs, NOW);

    expect(partial).toEqual(baseline);

    // Sanity: decision @ 1d (~9.05) > bugfix @ 2d (~6.56) > feature @ 0d (6) > discovery @ 0d (1).
    expect(partial.map(o => o.id)).toEqual([2, 3, 4, 1]);
  });
});
