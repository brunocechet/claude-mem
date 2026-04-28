/**
 * ObservationCompiler - Query building and data retrieval for context
 *
 * Handles database queries for observations and summaries, plus transcript extraction.
 */

import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { SessionStore } from '../sqlite/SessionStore.js';
import { logger } from '../../utils/logger.js';
import { SYSTEM_REMINDER_REGEX } from '../../utils/tag-stripping.js';
import { CLAUDE_CONFIG_DIR } from '../../shared/paths.js';
import type {
  ContextConfig,
  Observation,
  SessionSummary,
  SummaryTimelineItem,
  TimelineItem,
  PriorMessages,
} from './types.js';
import { SUMMARY_LOOKAHEAD } from './types.js';
import { normalizeSubject } from './utils/normalizeSubject.js';
import { parseJsonArray } from '../../shared/timeline-formatting.js';

/**
 * Query observations from database with type and concept filtering
 */
export function queryObservations(
  db: SessionStore,
  project: string,
  config: ContextConfig
): Observation[] {
  const typeArray = Array.from(config.observationTypes);
  const typePlaceholders = typeArray.map(() => '?').join(',');
  const conceptArray = Array.from(config.observationConcepts);
  const conceptPlaceholders = conceptArray.map(() => '?').join(',');
  const stalenessClause = config.stalenessCutoffEpoch > 0
    ? 'AND o.created_at_epoch > ?'
    : '';
  const staleClause = config.includeStale ? '' : 'AND (o.stale IS NULL OR o.stale = 0)';

  return db.db.prepare(`
    SELECT
      o.id,
      o.memory_session_id,
      COALESCE(s.platform_source, 'claude') as platform_source,
      o.type,
      o.title,
      o.subtitle,
      o.narrative,
      o.facts,
      o.concepts,
      o.files_read,
      o.files_modified,
      o.discovery_tokens,
      o.created_at,
      o.created_at_epoch,
      o.verified_at,
      COALESCE(o.stale, 0) as stale
    FROM observations o
    LEFT JOIN sdk_sessions s ON o.memory_session_id = s.memory_session_id
    WHERE (o.project = ? OR o.merged_into_project = ?)
      AND type IN (${typePlaceholders})
      AND EXISTS (
        SELECT 1 FROM json_each(o.concepts)
        WHERE value IN (${conceptPlaceholders})
      )
      ${stalenessClause}
      ${staleClause}
    ORDER BY o.created_at_epoch DESC
    LIMIT ?
  `).all(
    project,
    project,
    ...typeArray,
    ...conceptArray,
    ...(config.stalenessCutoffEpoch > 0 ? [config.stalenessCutoffEpoch] : []),
    config.totalObservationCount
  ) as Observation[];
}

/**
 * Query recent session summaries from database
 */
export function querySummaries(
  db: SessionStore,
  project: string,
  config: ContextConfig
): SessionSummary[] {
  return db.db.prepare(`
    SELECT
      ss.id,
      ss.memory_session_id,
      COALESCE(s.platform_source, 'claude') as platform_source,
      ss.request,
      ss.investigated,
      ss.learned,
      ss.completed,
      ss.next_steps,
      ss.created_at,
      ss.created_at_epoch
    FROM session_summaries ss
    LEFT JOIN sdk_sessions s ON ss.memory_session_id = s.memory_session_id
    WHERE (ss.project = ? OR ss.merged_into_project = ?)
    ORDER BY ss.created_at_epoch DESC
    LIMIT ?
  `).all(project, project, config.sessionCount + SUMMARY_LOOKAHEAD) as SessionSummary[];
}

/**
 * Query observations from multiple projects (for worktree support)
 *
 * Returns observations from all specified projects, interleaved chronologically.
 * Used when running in a worktree to show both parent repo and worktree observations.
 */
export function queryObservationsMulti(
  db: SessionStore,
  projects: string[],
  config: ContextConfig
): Observation[] {
  const typeArray = Array.from(config.observationTypes);
  const typePlaceholders = typeArray.map(() => '?').join(',');
  const conceptArray = Array.from(config.observationConcepts);
  const conceptPlaceholders = conceptArray.map(() => '?').join(',');
  const projectPlaceholders = projects.map(() => '?').join(',');
  const stalenessClause = config.stalenessCutoffEpoch > 0
    ? 'AND o.created_at_epoch > ?'
    : '';
  const staleClause = config.includeStale ? '' : 'AND (o.stale IS NULL OR o.stale = 0)';

  return db.db.prepare(`
    SELECT
      o.id,
      o.memory_session_id,
      COALESCE(s.platform_source, 'claude') as platform_source,
      o.type,
      o.title,
      o.subtitle,
      o.narrative,
      o.facts,
      o.concepts,
      o.files_read,
      o.files_modified,
      o.discovery_tokens,
      o.created_at,
      o.created_at_epoch,
      o.verified_at,
      COALESCE(o.stale, 0) as stale,
      o.project
    FROM observations o
    LEFT JOIN sdk_sessions s ON o.memory_session_id = s.memory_session_id
    WHERE (o.project IN (${projectPlaceholders})
           OR o.merged_into_project IN (${projectPlaceholders}))
      AND type IN (${typePlaceholders})
      AND EXISTS (
        SELECT 1 FROM json_each(o.concepts)
        WHERE value IN (${conceptPlaceholders})
      )
      ${stalenessClause}
      ${staleClause}
    ORDER BY o.created_at_epoch DESC
    LIMIT ?
  `).all(
    ...projects,
    ...projects,
    ...typeArray,
    ...conceptArray,
    ...(config.stalenessCutoffEpoch > 0 ? [config.stalenessCutoffEpoch] : []),
    config.totalObservationCount
  ) as Observation[];
}

/**
 * Query session summaries from multiple projects (for worktree support)
 *
 * Returns summaries from all specified projects, interleaved chronologically.
 * Used when running in a worktree to show both parent repo and worktree summaries.
 */
export function querySummariesMulti(
  db: SessionStore,
  projects: string[],
  config: ContextConfig
): SessionSummary[] {
  // Build IN clause for projects
  const projectPlaceholders = projects.map(() => '?').join(',');

  return db.db.prepare(`
    SELECT
      ss.id,
      ss.memory_session_id,
      COALESCE(s.platform_source, 'claude') as platform_source,
      ss.request,
      ss.investigated,
      ss.learned,
      ss.completed,
      ss.next_steps,
      ss.created_at,
      ss.created_at_epoch,
      ss.project
    FROM session_summaries ss
    LEFT JOIN sdk_sessions s ON ss.memory_session_id = s.memory_session_id
    WHERE (ss.project IN (${projectPlaceholders})
           OR ss.merged_into_project IN (${projectPlaceholders}))
    ORDER BY ss.created_at_epoch DESC
    LIMIT ?
  `).all(...projects, ...projects, config.sessionCount + SUMMARY_LOOKAHEAD) as SessionSummary[];
}

/**
 * Convert cwd path to dashed format for transcript lookup
 */
function cwdToDashed(cwd: string): string {
  return cwd.replace(/\//g, '-');
}

/**
 * Find the last assistant message text from parsed transcript lines.
 */
function parseAssistantTextFromLine(line: string): string | null {
  if (!line.includes('"type":"assistant"')) return null;

  const entry = JSON.parse(line);
  if (entry.type === 'assistant' && entry.message?.content && Array.isArray(entry.message.content)) {
    let text = '';
    for (const block of entry.message.content) {
      if (block.type === 'text') text += block.text;
    }
    text = text.replace(SYSTEM_REMINDER_REGEX, '').trim();
    if (text) return text;
  }
  return null;
}

function findLastAssistantMessage(lines: string[]): string {
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const result = parseAssistantTextFromLine(lines[i]);
      if (result) return result;
    } catch (parseError) {
      if (parseError instanceof Error) {
        logger.debug('WORKER', 'Skipping malformed transcript line', { lineIndex: i }, parseError);
      } else {
        logger.debug('WORKER', 'Skipping malformed transcript line', { lineIndex: i, error: String(parseError) });
      }
      continue;
    }
  }
  return '';
}

/**
 * Extract prior messages from transcript file
 */
export function extractPriorMessages(transcriptPath: string): PriorMessages {
  try {
    if (!existsSync(transcriptPath)) return { userMessage: '', assistantMessage: '' };
    const content = readFileSync(transcriptPath, 'utf-8').trim();
    if (!content) return { userMessage: '', assistantMessage: '' };

    const lines = content.split('\n').filter(line => line.trim());
    const lastAssistantMessage = findLastAssistantMessage(lines);
    return { userMessage: '', assistantMessage: lastAssistantMessage };
  } catch (error) {
    if (error instanceof Error) {
      logger.failure('WORKER', 'Failed to extract prior messages from transcript', { transcriptPath }, error);
    } else {
      logger.warn('WORKER', 'Failed to extract prior messages from transcript', { transcriptPath, error: String(error) });
    }
    return { userMessage: '', assistantMessage: '' };
  }
}

/**
 * Get prior session messages if enabled
 */
export function getPriorSessionMessages(
  observations: Observation[],
  config: ContextConfig,
  currentSessionId: string | undefined,
  cwd: string
): PriorMessages {
  if (!config.showLastMessage || observations.length === 0) {
    return { userMessage: '', assistantMessage: '' };
  }

  const priorSessionObs = observations.find(obs => obs.memory_session_id !== currentSessionId);
  if (!priorSessionObs) {
    return { userMessage: '', assistantMessage: '' };
  }

  const priorSessionId = priorSessionObs.memory_session_id;
  const dashedCwd = cwdToDashed(cwd);
  // Use CLAUDE_CONFIG_DIR to support custom Claude config directories
  const transcriptPath = path.join(CLAUDE_CONFIG_DIR, 'projects', dashedCwd, `${priorSessionId}.jsonl`);
  return extractPriorMessages(transcriptPath);
}

/**
 * Prepare summaries for timeline display
 */
export function prepareSummariesForTimeline(
  displaySummaries: SessionSummary[],
  allSummaries: SessionSummary[]
): SummaryTimelineItem[] {
  const mostRecentSummaryId = allSummaries[0]?.id;

  return displaySummaries.map((summary, i) => {
    const olderSummary = i === 0 ? null : allSummaries[i + 1];
    return {
      ...summary,
      displayEpoch: olderSummary ? olderSummary.created_at_epoch : summary.created_at_epoch,
      displayTime: olderSummary ? olderSummary.created_at : summary.created_at,
      shouldShowLink: summary.id !== mostRecentSummaryId
    };
  });
}

/**
 * Build unified timeline from observations and summaries
 */
export function buildTimeline(
  observations: Observation[],
  summaries: SummaryTimelineItem[]
): TimelineItem[] {
  const timeline: TimelineItem[] = [
    ...observations.map(obs => ({ type: 'observation' as const, data: obs })),
    ...summaries.map(summary => ({ type: 'summary' as const, data: summary }))
  ];

  // Sort chronologically
  timeline.sort((a, b) => {
    const aEpoch = a.type === 'observation' ? a.data.created_at_epoch : a.data.displayEpoch;
    const bEpoch = b.type === 'observation' ? b.data.created_at_epoch : b.data.displayEpoch;
    return aEpoch - bEpoch;
  });

  return timeline;
}

/**
 * Get set of observation IDs that should show full details
 */
export function getFullObservationIds(observations: Observation[], count: number): Set<number> {
  return new Set(
    observations
      .slice(0, count)
      .map(obs => obs.id)
  );
}

/**
 * Type-weight table for priority ranking.
 *
 * Higher numbers surface first when ties on recency are broken. Unknown
 * observation types fall back to the discovery weight (the most generic
 * "I learned something" bucket — see CLAUDE.md).
 */
const TYPE_WEIGHT: Record<string, number> = {
  decision: 10,
  security_alert: 9,
  bugfix: 8,
  feature: 6,
  change: 4,
  refactor: 4,
  security_note: 3,
  discovery: 1,
};

// Default weight when observation type is not recognized; matches discovery's weight.
const UNKNOWN_TYPE_WEIGHT = 1;
const RECENCY_HALF_LIFE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Half-life recency decay. Today → 1.0, 7d ago → 0.5, 14d ago → 0.25.
 *
 * Negative ages (clock skew, future-dated rows) are clamped to 0 so they
 * don't get artificially boosted above today's score.
 */
function recencyDecay(ageDays: number): number {
  const safeAge = Math.max(0, ageDays);
  return Math.pow(0.5, safeAge / RECENCY_HALF_LIFE_DAYS);
}

/**
 * Compute the priority score for one observation.
 *
 * Pure: depends only on the row's `type` and `created_at_epoch`.
 *
 * Exposed (rather than module-private) so both `rankByPriority` and
 * `clusterBySubject` share the exact same scoring — there is one
 * TYPE_WEIGHT table and one recency decay curve in the codebase.
 */
export function scoreObservation(obs: Observation, nowEpoch: number): number {
  const weight = TYPE_WEIGHT[obs.type] ?? UNKNOWN_TYPE_WEIGHT;
  const ageDays = (nowEpoch - obs.created_at_epoch) / MS_PER_DAY;
  return weight * recencyDecay(ageDays);
}

/**
 * Compute priority scores for a list of observations.
 *
 * Returns a Map keyed by observation id. Use this when you need to score the
 * same observations for multiple consumers (e.g. rankByPriority then
 * clusterBySubject) — avoids the second pass over scoreObservation per obs.
 *
 * For single-consumer paths, prefer the existing rankByPriority/
 * clusterBySubject helpers and let them score internally.
 *
 * Pure: returns a new Map; the input is not mutated.
 */
export function scoreObservations(
  observations: ReadonlyArray<Observation>,
  now: number = Date.now(),
): ReadonlyMap<number, number> {
  const scores = new Map<number, number>();
  for (const obs of observations) {
    scores.set(obs.id, scoreObservation(obs, now));
  }
  return scores;
}

/**
 * Reorder observations by priority (TYPE_WEIGHT × recency decay), most
 * relevant first. Stable: rows with the same score keep their input
 * order, with `created_at_epoch` descending as the explicit tiebreaker.
 *
 * Pure: returns a new array; the input is not mutated.
 *
 * @param observations - Source list (caller-owned, untouched)
 * @param now - Optional reference time (millis since epoch). Defaults to
 *              `Date.now()`. Tests inject a fixed clock here.
 * @param precomputedScores - Optional Map<obs.id, score> to skip the
 *              per-row `scoreObservation` call. The map MUST be keyed
 *              by ids from the same `observations` array passed here —
 *              mismatched ids fall back silently to local scoring,
 *              which is safe but defeats the perf benefit. Pass when
 *              the caller already scored THIS list for another consumer
 *              (e.g. `clusterBySubject`).
 */
export function rankByPriority(
  observations: ReadonlyArray<Observation>,
  now: number = Date.now(),
  precomputedScores?: ReadonlyMap<number, number>,
): Observation[] {
  // Decorate with stable index so we can preserve input order on score ties.
  const decorated = observations.map((obs, index) => ({
    obs,
    index,
    score: precomputedScores?.get(obs.id) ?? scoreObservation(obs, now),
  }));

  decorated.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.obs.created_at_epoch !== b.obs.created_at_epoch) {
      return b.obs.created_at_epoch - a.obs.created_at_epoch;
    }
    return a.index - b.index;
  });

  return decorated.map(entry => entry.obs);
}

/**
 * One cluster of observations sharing a normalized subject (a file basename,
 * a parent dir for generic basenames, or a title-derived token).
 *
 * Built and consumed by the timeline rendering pipeline when
 * `config.subjectClustering` is true.
 */
export interface ObservationCluster {
  /** Normalized cluster key (see normalizeSubject). */
  subject: string;
  /** Observations in score-DESC order; index 0 is `topByPriority`. */
  observations: Observation[];
  /** Highest-priority observation in the cluster. */
  topByPriority: Observation;
  /** Number of observations in the cluster (== observations.length). */
  count: number;
  /** Most recent created_at_epoch in the cluster. */
  lastTouched: number;
}

/**
 * Best-effort parse of `obs.files_modified` into a string[].
 *
 * The DB column is JSON-stringified text. Treat malformed/empty content as
 * "no files" rather than throwing, mirroring how parseFacts handles its
 * counterpart in extractActionableSignals.
 */
function parseFilesModified(rawFiles: string | null): string[] {
  return parseJsonArray(rawFiles);
}

/**
 * Group observations by normalized subject, sort each cluster by priority
 * score DESC, return clusters sorted by their top observation's score DESC.
 *
 * Pure: returns a new array; input observations are not mutated.
 *
 * Algorithm:
 *   1. For each obs, compute the cluster key via `normalizeSubject(title, files)`.
 *      An empty/whitespace key falls back to a per-row singleton key derived
 *      from the original title (or the obs id if title is also blank), so that
 *      degenerate rows still appear and never collide with each other.
 *   2. Within each cluster, sort observations by `scoreObservation` DESC,
 *      tiebreaker by `created_at_epoch` DESC, then by stable input index.
 *   3. Sort clusters by their top observation's score DESC, tiebreaker by
 *      `lastTouched` DESC.
 *
 * @param observations - Source list (caller-owned, untouched)
 * @param now - Optional reference time (millis since epoch). Defaults to
 *              `Date.now()`. Tests inject a fixed clock here.
 * @param precomputedScores - Optional Map<obs.id, score> to skip the
 *              per-row `scoreObservation` call (used by both intra-cluster
 *              sort and the `topByPriority` selection). The map MUST be
 *              keyed by ids from the same `observations` array passed
 *              here — mismatched ids fall back silently to local scoring,
 *              which is safe but defeats the perf benefit. Pass when the
 *              caller already scored THIS list for another consumer
 *              (e.g. `rankByPriority`).
 */
export function clusterBySubject(
  observations: ReadonlyArray<Observation>,
  now: number = Date.now(),
  precomputedScores?: ReadonlyMap<number, number>,
): ObservationCluster[] {
  if (observations.length === 0) return [];

  interface Decorated {
    obs: Observation;
    index: number;
    score: number;
  }

  // Decorate so we have a stable input index (for tiebreakers) and a score
  // that we can compute once and reuse for both intra- and inter-cluster sort.
  const groups = new Map<string, Decorated[]>();

  for (let index = 0; index < observations.length; index++) {
    const obs = observations[index];
    const filesModified = parseFilesModified(obs.files_modified);
    const candidate = normalizeSubject(obs.title, filesModified);
    const trimmed = candidate.trim();

    // Empty key → singleton: use a unique key per row so they don't collide.
    // Visible subject becomes the (collapsed-lowercased) title or, last
    // resort, a stable "obs-<id>" placeholder. This preserves the row in
    // the digest without polluting any real cluster.
    const subject = trimmed.length > 0
      ? trimmed
      : ((obs.title ?? '').replace(/\s+/g, ' ').trim().toLowerCase() || `obs-${obs.id}`);
    const groupKey = trimmed.length > 0 ? `subject:${subject}` : `singleton:${obs.id}`;

    const decorated: Decorated = {
      obs,
      index,
      score: precomputedScores?.get(obs.id) ?? scoreObservation(obs, now),
    };

    let bucket = groups.get(groupKey);
    if (!bucket) {
      bucket = [];
      groups.set(groupKey, bucket);
    }
    bucket.push(decorated);
  }

  // Build clusters with intra-cluster sort.
  const clusters: Array<ObservationCluster & { topScore: number }> = [];
  for (const [groupKey, bucket] of groups) {
    bucket.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.obs.created_at_epoch !== b.obs.created_at_epoch) {
        return b.obs.created_at_epoch - a.obs.created_at_epoch;
      }
      return a.index - b.index;
    });

    const sortedObservations = bucket.map(d => d.obs);
    const top = bucket[0];
    const lastTouched = bucket.reduce(
      (acc, d) => Math.max(acc, d.obs.created_at_epoch),
      bucket[0].obs.created_at_epoch,
    );

    // Re-derive the visible subject from the group key. Singletons keep their
    // synthesized subject (lowercased title or `obs-<id>`); real clusters use
    // the normalized subject directly.
    const subject = groupKey.startsWith('subject:')
      ? groupKey.slice('subject:'.length)
      : ((top.obs.title ?? '').replace(/\s+/g, ' ').trim().toLowerCase() || `obs-${top.obs.id}`);

    clusters.push({
      subject,
      observations: sortedObservations,
      topByPriority: top.obs,
      count: sortedObservations.length,
      lastTouched,
      topScore: top.score,
    });
  }

  // Sort clusters: top score DESC, tiebreaker by lastTouched DESC.
  clusters.sort((a, b) => {
    if (a.topScore !== b.topScore) return b.topScore - a.topScore;
    return b.lastTouched - a.lastTouched;
  });

  // Strip the helper field before returning.
  return clusters.map(({ topScore: _topScore, ...rest }) => rest);
}
