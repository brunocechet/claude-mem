/**
 * extractActionableSignals tests
 *
 * Verifies the pure scan utility correctly surfaces TODOs, FIXMEs, blockers,
 * decision-needed phrases, and unresolved questions from observation
 * narratives + facts.
 */

import { describe, it, expect } from 'bun:test';
import { extractActionableSignals } from '../../../src/services/context/utils/extractActionableSignals.js';
import type { Observation } from '../../../src/services/context/types.js';

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: 1,
    memory_session_id: 'session-test',
    type: 'discovery',
    title: 'Test',
    subtitle: null,
    narrative: null,
    facts: null,
    concepts: null,
    files_read: null,
    files_modified: null,
    discovery_tokens: 0,
    created_at: '2025-01-01T00:00:00Z',
    created_at_epoch: 0,
    verified_at: null,
    stale: 0,
    ...overrides,
  };
}

describe('extractActionableSignals', () => {
  describe('positive cases per kind', () => {
    it('matches TODO in narrative', () => {
      const obs = makeObservation({
        narrative: 'Did some work. TODO: wire up the new endpoint to the dashboard.',
      });
      const signals = extractActionableSignals(obs);
      expect(signals).toHaveLength(1);
      expect(signals[0].kind).toBe('todo');
      expect(signals[0].text).toContain('wire up the new endpoint');
      expect(signals[0].observationId).toBe(1);
    });

    it('matches FIXME in narrative', () => {
      const obs = makeObservation({
        narrative: 'FIXME: race condition between worker startup and migration.',
      });
      const signals = extractActionableSignals(obs);
      expect(signals).toHaveLength(1);
      expect(signals[0].kind).toBe('fixme');
      expect(signals[0].text).toContain('race condition');
    });

    it('matches "blocked by" as blocker', () => {
      const obs = makeObservation({
        narrative: 'Implementation is blocked by the upstream auth refactor merging first.',
      });
      const signals = extractActionableSignals(obs);
      expect(signals.some(s => s.kind === 'blocker')).toBe(true);
    });

    it('matches "decide whether" as decision_needed', () => {
      const obs = makeObservation({
        narrative: 'Need to decide whether to keep the legacy fallback or remove it.',
      });
      const signals = extractActionableSignals(obs);
      expect(signals.some(s => s.kind === 'decision_needed')).toBe(true);
    });

    it('matches "still need" as unresolved_question', () => {
      const obs = makeObservation({
        narrative: 'We still need a migration script for the existing rows.',
      });
      const signals = extractActionableSignals(obs);
      expect(signals.some(s => s.kind === 'unresolved_question')).toBe(true);
    });

    it('matches "open question" as unresolved_question', () => {
      const obs = makeObservation({
        narrative: 'Open question: should embeddings be batched per session or per project?',
      });
      const signals = extractActionableSignals(obs);
      expect(signals.some(s => s.kind === 'unresolved_question')).toBe(true);
    });
  });

  describe('negative cases', () => {
    it('returns empty array when nothing matches', () => {
      const obs = makeObservation({
        narrative: 'A peaceful narrative with no signals at all.',
        facts: JSON.stringify(['just a fact', 'another mundane note']),
      });
      expect(extractActionableSignals(obs)).toEqual([]);
    });

    it('handles missing narrative and facts gracefully', () => {
      const obs = makeObservation({ narrative: null, facts: null });
      expect(extractActionableSignals(obs)).toEqual([]);
    });

    it('does not match when capture is too short (<10 chars)', () => {
      const obs = makeObservation({ narrative: 'TODO: too sht' });
      // "too sht" is 7 chars (no period), falls below the 10-char minimum.
      expect(extractActionableSignals(obs)).toEqual([]);
    });
  });

  describe('multi-signal scanning', () => {
    it('returns multiple signals from a single observation', () => {
      const obs = makeObservation({
        narrative:
          'TODO: ship the dashboard fix. FIXME: also clean up the cache invalidation logic.',
      });
      const signals = extractActionableSignals(obs);
      expect(signals.length).toBeGreaterThanOrEqual(2);
      expect(signals.some(s => s.kind === 'todo')).toBe(true);
      expect(signals.some(s => s.kind === 'fixme')).toBe(true);
    });

    it('does not bleed adjacent signals into one capture (sentence boundary)', () => {
      const obs = makeObservation({
        narrative: 'TODO: fix the cache. FIXME: also the auth.',
      });
      const signals = extractActionableSignals(obs);
      const todo = signals.find(s => s.kind === 'todo');
      const fixme = signals.find(s => s.kind === 'fixme');
      expect(todo?.text).toBe('fix the cache');
      expect(fixme?.text).toBe('also the auth');
    });

    it('matches in narrative AND facts', () => {
      const obs = makeObservation({
        narrative: 'TODO: ship the dashboard fix soon.',
        facts: JSON.stringify([
          'plain fact, nothing interesting',
          'FIXME: refactor the worker spawner before next release.',
        ]),
      });
      const signals = extractActionableSignals(obs);
      expect(signals.some(s => s.kind === 'todo')).toBe(true);
      expect(signals.some(s => s.kind === 'fixme')).toBe(true);
    });
  });

  describe('case-insensitive matching', () => {
    it('matches uppercase TODO', () => {
      const obs = makeObservation({ narrative: 'TODO: write the rest of the docs section.' });
      expect(extractActionableSignals(obs)).toHaveLength(1);
    });

    it('matches lowercase todo', () => {
      const obs = makeObservation({ narrative: 'todo: write the rest of the docs section.' });
      expect(extractActionableSignals(obs)).toHaveLength(1);
    });

    it('matches mixed-case Todo', () => {
      const obs = makeObservation({ narrative: 'Todo: write the rest of the docs section.' });
      expect(extractActionableSignals(obs)).toHaveLength(1);
    });
  });

  describe('text trimming', () => {
    it('caps text at 200 chars', () => {
      const long = 'x'.repeat(500);
      const obs = makeObservation({ narrative: `TODO: ${long}` });
      const signals = extractActionableSignals(obs);
      expect(signals).toHaveLength(1);
      expect(signals[0].text.length).toBeLessThanOrEqual(200);
    });

    it('trims surrounding whitespace from captured text', () => {
      const obs = makeObservation({ narrative: 'TODO:    finalize the spec wording' });
      const signals = extractActionableSignals(obs);
      expect(signals[0].text.startsWith('finalize')).toBe(true);
    });
  });

  describe('malformed facts', () => {
    it('treats non-JSON facts as empty without throwing', () => {
      const obs = makeObservation({ facts: 'not-json-at-all' });
      expect(() => extractActionableSignals(obs)).not.toThrow();
      expect(extractActionableSignals(obs)).toEqual([]);
    });

    it('treats non-array JSON facts as empty', () => {
      const obs = makeObservation({ facts: JSON.stringify({ k: 'v' }) });
      expect(extractActionableSignals(obs)).toEqual([]);
    });
  });
});
