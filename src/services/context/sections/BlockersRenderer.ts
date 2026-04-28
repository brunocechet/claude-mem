/**
 * BlockersRenderer - 🚧 Pending decisions / blockers section
 *
 * Aggregates ActionableSignals from all observations, deduplicates similar
 * texts (substring containment, then Jaccard ≥ 0.7), sorts most-recent-first,
 * caps at config.maxBlockers, and renders bullets.
 *
 * Pure function: no I/O, no logging.
 *
 * Output shape (no trailing newline; caller joins with \n surrounding blocks):
 *
 *   🚧 Pending decisions / blockers
 *     - <text> (#<id> · <time>)
 *     - decide whether: <text> (#<id> · <time>)
 *     - open question: <text> (#<id> · <time>)
 *     + N more
 *
 * Returns null when no signals survive deduplication.
 */

import type { ContextConfig, Observation } from '../types.js';
import { extractActionableSignals, type ActionableSignal } from '../utils/extractActionableSignals.js';
import { formatTime } from '../../../shared/timeline-formatting.js';

const SECTION_HEADER = '🚧 Pending decisions / blockers';
const BULLET_INDENT = '  ';
const FOOTNOTE_INDENT = '  ';
const MAX_DISPLAY_LENGTH = 100;
const TRUNCATION_SUFFIX = '…';
const JACCARD_THRESHOLD = 0.7;

/**
 * Defensive cap on signals fed into dedupeSignals.
 *
 * dedupeSignals is O(S²) in the count of total ActionableSignals across all
 * observations. In practice S is well under 100 for any real project, but
 * a pathologically signal-dense observation set (e.g. 50 TODOs per
 * narrative × 200 obs = 10k signals → 50M comparisons) would slow the hook
 * past acceptable latency. The cap keeps worst-case latency bounded
 * without affecting normal operation.
 *
 * Newer signals win when truncating: signals are sorted by their owning
 * observation's created_at_epoch DESC and the cap is applied before dedup.
 *
 * See docs/CONTEXT-DIGEST-V2-FOLLOWUPS-PLAN.md item 2.
 */
const MAX_SIGNALS_BEFORE_DEDUP = 500;

/**
 * One enriched signal carrying everything we need to render and dedupe.
 *
 * Carrying the parent observation lets us read `created_at_epoch` and
 * `created_at` for sorting and rendering without re-walking the source array.
 */
interface EnrichedSignal {
  signal: ActionableSignal;
  obs: Observation;
  /** Lower-cased + punctuation-stripped form used by the dedup matchers. */
  normalized: string;
}

/**
 * Lowercase + strip leading/trailing whitespace and punctuation.
 *
 * Punctuation stripping is intentionally narrow — only at the edges, never
 * mid-string — so phrases like "fix the auth callback" and "fix the auth call"
 * still have most of their characters in common for substring/Jaccard checks.
 */
function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .trim()
    // Remove leading punctuation: anything that isn't a letter/digit/whitespace.
    .replace(/^[^\p{L}\p{N}\s]+/u, '')
    // Same on the trailing side.
    .replace(/[^\p{L}\p{N}\s]+$/u, '')
    .trim();
}

/**
 * Tokenize on whitespace runs after collapsing internal whitespace.
 * Empty strings → empty token list.
 */
function tokenize(normalized: string): string[] {
  if (!normalized) return [];
  return normalized.split(/\s+/u).filter(token => token.length > 0);
}

/**
 * Jaccard similarity over whitespace-tokenized words.
 * |A ∩ B| / |A ∪ B|. Empty inputs → 0.
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const unionSize = setA.size + setB.size - intersection;
  if (unionSize === 0) return 0;
  return intersection / unionSize;
}

/**
 * Deduplicate by similar text.
 *
 * Two-pass dedup that mirrors the algorithm in the Phase 3 plan:
 *
 *   1. Substring containment: if one normalized text is a substring of
 *      another, keep the LONGER one (more information). When lengths tie
 *      and they're equal substrings, keep the lower observation id (older
 *      = more authoritative claim of having been seen first).
 *   2. Jaccard ≥ threshold: keep the lower observation id (older).
 *
 * Order-preserving: we walk the input list in order, and for each candidate
 * decide whether it's a duplicate of something already kept. If the candidate
 * "wins" against a kept entry (longer substring or older id), we replace the
 * kept entry in place — this preserves the original first-seen ordering for
 * non-duplicates while still upholding the keep-rules.
 */
function dedupeSignals(input: EnrichedSignal[]): EnrichedSignal[] {
  const kept: EnrichedSignal[] = [];

  outer: for (const candidate of input) {
    const candTokens = tokenize(candidate.normalized);

    for (let i = 0; i < kept.length; i++) {
      const existing = kept[i];

      // Rule 1: substring containment.
      const candIn = existing.normalized.includes(candidate.normalized);
      const existIn = candidate.normalized.includes(existing.normalized);

      if (candIn || existIn) {
        // Keep the longer one. If equal length, keep lower observationId
        // (older = first-seen-wins per the plan).
        const candLen = candidate.normalized.length;
        const existLen = existing.normalized.length;

        if (candLen > existLen) {
          kept[i] = candidate;
        } else if (candLen === existLen) {
          if (candidate.signal.observationId < existing.signal.observationId) {
            kept[i] = candidate;
          }
          // else: keep existing
        }
        // else: existing is longer, drop candidate
        continue outer;
      }

      // Rule 2: Jaccard ≥ threshold (only relevant when neither contains the other).
      const existTokens = tokenize(existing.normalized);
      const similarity = jaccardSimilarity(candTokens, existTokens);
      if (similarity >= JACCARD_THRESHOLD) {
        // Keep the lower observation id (older).
        if (candidate.signal.observationId < existing.signal.observationId) {
          kept[i] = candidate;
        }
        continue outer;
      }
    }

    kept.push(candidate);
  }

  return kept;
}

/**
 * Render the kind-aware prefix.
 *
 * `decision_needed`         → "decide whether: " (the verb is implied by the kind)
 * `unresolved_question` …
 *   matched via "open question" → "open question: "
 *   matched via "still need/missing/unresolved" → no prefix (verb in text)
 * `todo` / `fixme` / `blocker` → no prefix (kind is already a verb-or-keyword)
 *
 * The "open question" branch can't be detected from the signal kind alone
 * (both unresolved_question subtypes share the same kind), so we re-scan the
 * raw extracted text for the literal "open question" leader. The pattern in
 * extractActionableSignals consumes the leader before capturing, so we look
 * for it via a heuristic: the signal text starts at the position right after
 * the leader, but ActionableSignal.text doesn't preserve which pattern won.
 *
 * Workaround: signals from the "open question" pattern start with text that
 * follows the original leader. We re-emit the prefix by checking if the
 * raw observation source still contains the literal phrase "open question"
 * within a small window before the captured text. To keep this pure and
 * cheap, we accept a small false-negative rate: if the heuristic can't
 * decide, default to no prefix (the captured text is still readable).
 */
function buildPrefix(signal: ActionableSignal, obs: Observation): string {
  if (signal.kind === 'decision_needed') return 'decide whether: ';

  if (signal.kind === 'unresolved_question') {
    // Re-scan the source to distinguish "open question: …" from "still need …".
    // Observation narrative + facts both contribute; we just need the broad
    // hint of "open question" appearing close to the captured text.
    const haystack = `${obs.narrative ?? ''}\n${obs.facts ?? ''}`.toLowerCase();
    const needleIdx = haystack.indexOf(signal.text.toLowerCase());
    if (needleIdx > 0) {
      // Look ~30 chars left of the capture for the "open question" leader.
      const window = haystack.slice(Math.max(0, needleIdx - 30), needleIdx);
      if (/\bopen question\b/.test(window)) {
        return 'open question: ';
      }
    }
    return '';
  }

  // todo / fixme / blocker: no prefix.
  return '';
}

/**
 * Truncate to MAX_DISPLAY_LENGTH using a code-point–aware slice so emoji or
 * other surrogate-pair characters at the cut boundary stay paired.
 *
 * Mirrors the StateRenderer subject-truncation hygiene.
 */
function truncateUnicodeSafe(text: string, limit: number): string {
  const codepoints = Array.from(text);
  if (codepoints.length <= limit) return text;
  const sliceLen = Math.max(1, limit - TRUNCATION_SUFFIX.length);
  return codepoints.slice(0, sliceLen).join('') + TRUNCATION_SUFFIX;
}

/**
 * Render one signal as a bullet line.
 */
function renderBullet(enriched: EnrichedSignal): string {
  const { signal, obs } = enriched;
  const prefix = buildPrefix(signal, obs);
  const fullText = `${prefix}${signal.text}`;
  const display = truncateUnicodeSafe(fullText, MAX_DISPLAY_LENGTH);
  const time = formatTime(obs.created_at);
  return `${BULLET_INDENT}- ${display} (#${obs.id} · ${time})`;
}

/**
 * Render the 🚧 Pending decisions / blockers section.
 *
 * Algorithm (matches the plan in CLAUDE.md / Phase 3):
 *   1. Run extractActionableSignals on every observation.
 *   2. Aggregate, normalize, and deduplicate (substring, then Jaccard).
 *   3. Sort by created_at_epoch DESC (most recent first), tiebreaker id DESC.
 *   4. Cap at config.maxBlockers; append "+ N more" footnote when truncated.
 *
 * Returns null when nothing survives — caller skips emitting a blank section.
 *
 * Pure: no I/O, no logging. Per-observation extraction is wrapped in try/catch
 * so a malformed row never poisons the whole section (matches StateRenderer's
 * failure-isolation hygiene).
 */
export function renderBlockersSection(
  observations: ReadonlyArray<Observation>,
  config: ContextConfig,
): string | null {
  if (observations.length === 0) return null;

  // Step 1: aggregate signals across all observations, indexed back to the row.
  const obsById = new Map<number, Observation>();
  const enrichedAll: EnrichedSignal[] = [];

  for (const obs of observations) {
    obsById.set(obs.id, obs);
    let signals: ActionableSignal[];
    try {
      signals = extractActionableSignals(obs);
    } catch {
      // Per-row isolation: a malformed observation cannot kill the section.
      continue;
    }
    for (const signal of signals) {
      const normalized = normalizeForCompare(signal.text);
      if (!normalized) continue;
      enrichedAll.push({ signal, obs, normalized });
    }
  }

  if (enrichedAll.length === 0) return null;

  // Step 1.5: defensive cap before the O(S²) dedup loop. When the input
  // exceeds MAX_SIGNALS_BEFORE_DEDUP we sort by recency (created_at_epoch
  // DESC, tiebreaker observationId DESC) and keep only the newest. Oldest
  // signals are dropped first so the most relevant blockers always survive.
  // This is a no-op at normal scale; only fires on pathologically dense input.
  let prepared: EnrichedSignal[] = enrichedAll;
  if (enrichedAll.length > MAX_SIGNALS_BEFORE_DEDUP) {
    prepared = enrichedAll
      .slice()
      .sort((a, b) => {
        if (a.obs.created_at_epoch !== b.obs.created_at_epoch) {
          return b.obs.created_at_epoch - a.obs.created_at_epoch;
        }
        return b.signal.observationId - a.signal.observationId;
      })
      .slice(0, MAX_SIGNALS_BEFORE_DEDUP);
  }

  // Step 2: dedupe.
  const deduped = dedupeSignals(prepared);
  if (deduped.length === 0) return null;

  // Step 3: sort by recency DESC, tiebreaker by observation id DESC.
  deduped.sort((a, b) => {
    if (a.obs.created_at_epoch !== b.obs.created_at_epoch) {
      return b.obs.created_at_epoch - a.obs.created_at_epoch;
    }
    return b.signal.observationId - a.signal.observationId;
  });

  // Step 4: cap and emit footnote when truncated.
  // Coerce 0/negative to 1: the documented disable path is
  // CLAUDE_MEM_CONTEXT_BLOCKERS_SECTION=false, not maxBlockers=0.
  const cap = Math.max(1, config.maxBlockers);
  const visible = deduped.slice(0, cap);
  const overflow = deduped.length - visible.length;

  const lines: string[] = [SECTION_HEADER];
  for (const enriched of visible) {
    lines.push(renderBullet(enriched));
  }
  if (overflow > 0) {
    lines.push(`${FOOTNOTE_INDENT}+ ${overflow} more`);
  }

  return lines.join('\n');
}
