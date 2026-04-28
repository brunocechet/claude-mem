/**
 * extractActionableSignals - Pure scan utility
 *
 * Scans an observation's narrative + facts for actionable signals (TODOs,
 * FIXMEs, blockers, unresolved decisions/questions). Used by the context
 * digest to surface follow-ups at session start.
 *
 * Pure function: no I/O, no logging, no allocations beyond the result.
 */

import type { Observation } from '../types.js';

/**
 * A single actionable signal extracted from an observation.
 */
export interface ActionableSignal {
  kind: 'todo' | 'fixme' | 'blocker' | 'decision_needed' | 'unresolved_question';
  /** Matched text, trimmed, capped to 200 chars. */
  text: string;
  observationId: number;
}

/**
 * Pattern table. Each entry maps a kind to a regex with a single capturing
 * group that holds the human-readable signal text (10–200 chars).
 *
 * All patterns are case-insensitive and global so we can match multiple
 * occurrences within one source string.
 */
const PATTERNS: ReadonlyArray<{ kind: ActionableSignal['kind']; regex: RegExp }> = [
  { kind: 'todo', regex: /\bTODO\b[:\s]+([^.\n!?]{10,200})/gi },
  { kind: 'fixme', regex: /\bFIXME\b[:\s]+([^.\n!?]{10,200})/gi },
  { kind: 'blocker', regex: /\bblocked by\b\s+([^.\n!?]{10,200})/gi },
  { kind: 'decision_needed', regex: /\bdecide whether\b\s+([^.\n!?]{10,200})/gi },
  { kind: 'unresolved_question', regex: /\bstill\s+(?:need|missing|unresolved)\s+([^.\n!?]{10,200})/gi },
  { kind: 'unresolved_question', regex: /\bopen question\b[:\s]+([^.\n!?]{10,200})/gi },
];

const MAX_TEXT_LENGTH = 200;

/**
 * Best-effort parse of the `facts` column. Stored as JSON in SQLite; treat
 * malformed data as "no facts" rather than throwing.
 */
function parseFacts(rawFacts: string | null): string[] {
  if (!rawFacts) return [];
  try {
    const parsed: unknown = JSON.parse(rawFacts);
    if (Array.isArray(parsed)) {
      return parsed.filter((f): f is string => typeof f === 'string');
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Run all patterns against a source string and emit signals.
 */
function scanString(
  source: string,
  observationId: number,
): ActionableSignal[] {
  if (!source) return [];

  const signals: ActionableSignal[] = [];

  for (const { kind, regex } of PATTERNS) {
    // Reset lastIndex because regexes are reused across calls (global flag).
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(source)) !== null) {
      const captured = match[1] ?? '';
      const text = captured.trim().slice(0, MAX_TEXT_LENGTH);
      if (text.length === 0) continue;
      signals.push({ kind, text, observationId });
    }
  }

  return signals;
}

/**
 * Extract actionable signals from an observation. Returns an empty array
 * when nothing matches.
 */
export function extractActionableSignals(obs: Observation): ActionableSignal[] {
  const sources: string[] = [];
  if (obs.narrative) sources.push(obs.narrative);
  for (const fact of parseFacts(obs.facts)) {
    sources.push(fact);
  }

  const signals: ActionableSignal[] = [];
  for (const source of sources) {
    signals.push(...scanString(source, obs.id));
  }
  return signals;
}
