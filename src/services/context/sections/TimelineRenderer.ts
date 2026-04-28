/**
 * TimelineRenderer - Renders the chronological timeline of observations and summaries
 *
 * Handles day grouping and rendering. In agent (LLM) mode, uses flat compact lines.
 * In human (terminal) mode, uses file grouping with visual formatting.
 */

import type {
  ContextConfig,
  Observation,
  TimelineItem,
  SummaryTimelineItem,
} from '../types.js';
import type { ObservationCluster } from '../ObservationCompiler.js';
import { formatTime, formatDate, formatDateTime, extractFirstFile, parseJsonArray } from '../../../shared/timeline-formatting.js';
import * as Agent from '../formatters/AgentFormatter.js';
import * as Human from '../formatters/HumanFormatter.js';
import { ModeManager } from '../../domain/ModeManager.js';

/**
 * Group timeline items by day
 */
export function groupTimelineByDay(timeline: TimelineItem[]): Map<string, TimelineItem[]> {
  const itemsByDay = new Map<string, TimelineItem[]>();

  for (const item of timeline) {
    const itemDate = item.type === 'observation' ? item.data.created_at : item.data.displayTime;
    const day = formatDate(itemDate);
    if (!itemsByDay.has(day)) {
      itemsByDay.set(day, []);
    }
    itemsByDay.get(day)!.push(item);
  }

  // Sort days chronologically
  const sortedEntries = Array.from(itemsByDay.entries()).sort((a, b) => {
    const aDate = new Date(a[0]).getTime();
    const bDate = new Date(b[0]).getTime();
    return aDate - bDate;
  });

  return new Map(sortedEntries);
}

/**
 * Get detail field content for full observation display
 */
function getDetailField(obs: Observation, config: ContextConfig): string | null {
  if (config.fullObservationField === 'narrative') {
    return obs.narrative;
  }
  return obs.facts ? parseJsonArray(obs.facts).join('\n') : null;
}

/**
 * Render a single day's timeline items (agent/LLM mode - flat compact lines)
 */
function renderDayTimelineAgent(
  day: string,
  dayItems: TimelineItem[],
  fullObservationIds: Set<number>,
  config: ContextConfig,
): string[] {
  const output: string[] = [];

  output.push(...Agent.renderAgentDayHeader(day));

  let lastTime = '';

  for (const item of dayItems) {
    if (item.type === 'summary') {
      const summary = item.data as SummaryTimelineItem;
      const formattedTime = formatDateTime(summary.displayTime);
      output.push(...Agent.renderAgentSummaryItem(summary, formattedTime));
    } else {
      const obs = item.data as Observation;
      const time = formatTime(obs.created_at);
      const showTime = time !== lastTime;
      const timeDisplay = showTime ? time : '';
      lastTime = time;

      const shouldShowFull = fullObservationIds.has(obs.id);

      if (shouldShowFull) {
        const detailField = getDetailField(obs, config);
        output.push(...Agent.renderAgentFullObservation(obs, timeDisplay, detailField, config));
      } else {
        output.push(Agent.renderAgentTableRow(obs, timeDisplay, config));
      }
    }
  }

  return output;
}

/**
 * Render a single day's timeline items (human/terminal mode - file grouped with tables)
 */
function renderDayTimelineHuman(
  day: string,
  dayItems: TimelineItem[],
  fullObservationIds: Set<number>,
  config: ContextConfig,
  cwd: string,
): string[] {
  const output: string[] = [];

  output.push(...Human.renderHumanDayHeader(day));

  let currentFile: string | null = null;
  let lastTime = '';

  for (const item of dayItems) {
    if (item.type === 'summary') {
      currentFile = null;
      lastTime = '';

      const summary = item.data as SummaryTimelineItem;
      const formattedTime = formatDateTime(summary.displayTime);
      output.push(...Human.renderHumanSummaryItem(summary, formattedTime));
    } else {
      const obs = item.data as Observation;
      const file = extractFirstFile(obs.files_modified, cwd, obs.files_read);
      const time = formatTime(obs.created_at);
      const showTime = time !== lastTime;
      lastTime = time;

      const shouldShowFull = fullObservationIds.has(obs.id);

      // Check if we need a new file section
      if (file !== currentFile) {
        output.push(...Human.renderHumanFileHeader(file));
        currentFile = file;
      }

      if (shouldShowFull) {
        const detailField = getDetailField(obs, config);
        output.push(...Human.renderHumanFullObservation(obs, time, showTime, detailField, config));
      } else {
        output.push(Human.renderHumanTableRow(obs, time, showTime, config));
      }
    }
  }

  output.push('');

  return output;
}

/**
 * Render a single day's timeline items
 */
export function renderDayTimeline(
  day: string,
  dayItems: TimelineItem[],
  fullObservationIds: Set<number>,
  config: ContextConfig,
  cwd: string,
  forHuman: boolean
): string[] {
  if (forHuman) {
    return renderDayTimelineHuman(day, dayItems, fullObservationIds, config, cwd);
  }
  return renderDayTimelineAgent(day, dayItems, fullObservationIds, config);
}

/**
 * Render the complete timeline
 */
export function renderTimeline(
  timeline: TimelineItem[],
  fullObservationIds: Set<number>,
  config: ContextConfig,
  cwd: string,
  forHuman: boolean
): string[] {
  const output: string[] = [];
  const itemsByDay = groupTimelineByDay(timeline);

  for (const [day, dayItems] of itemsByDay) {
    output.push(...renderDayTimeline(day, dayItems, fullObservationIds, config, cwd, forHuman));
  }

  return output;
}

const CLUSTER_BULLET_INDENT = '  ';
const CLUSTER_DETAIL_INDENT = '        ';
const SUPPORTING_TITLE_PREVIEW_LIMIT = 30;
const SUPPORTING_PREVIEW_MAX_COUNT = 3;

/**
 * Truncate a string at code-point boundaries (emoji-safe), used for the
 * comma-separated supporting-titles preview.
 */
function truncateForPreview(input: string, limit: number): string {
  const codepoints = Array.from(input);
  if (codepoints.length <= limit) return input;
  return codepoints.slice(0, Math.max(1, limit - 1)).join('') + '…';
}

/**
 * Build the comma-separated supporting-titles preview ("foo, bar, baz").
 *
 * Returns an empty string when:
 *   - The cluster has only 1 observation (no supporting items).
 *   - There are more than `SUPPORTING_PREVIEW_MAX_COUNT + 1` total observations
 *     (i.e. > 4 — see plan: omit comma-separated preview at high counts).
 *
 * Otherwise, returns up to SUPPORTING_PREVIEW_MAX_COUNT titles after the
 * top-priority winner, each truncated to ~SUPPORTING_TITLE_PREVIEW_LIMIT chars.
 */
function buildSupportingPreview(cluster: ObservationCluster): string {
  if (cluster.count <= 1) return '';
  // Plan: "If more than 4 total, omit the comma-separated preview."
  if (cluster.count > SUPPORTING_PREVIEW_MAX_COUNT + 1) return '';

  const supporting = cluster.observations
    .slice(1, 1 + SUPPORTING_PREVIEW_MAX_COUNT)
    .map(obs => truncateForPreview((obs.title ?? 'untitled').trim(), SUPPORTING_TITLE_PREVIEW_LIMIT));

  return supporting.join(', ');
}

/**
 * Detail field accessor reused from the flat timeline path.
 *
 * `getDetailField` is a closure over config; we re-implement here at module
 * scope to keep `renderTimelineClustered` standalone (no shared mutable
 * state) and to avoid leaking the helper into the public surface.
 */
function getClusterDetailField(obs: Observation, config: ContextConfig): string | null {
  if (config.fullObservationField === 'narrative') {
    return obs.narrative;
  }
  return obs.facts ? parseJsonArray(obs.facts).join('\n') : null;
}

/**
 * Render one cluster as a small block of lines.
 *
 *   <emoji> <subject> (<count> obs · last <time>)
 *     <emoji> #<id> <title>
 *           + N supporting[: a, b, c]
 *           Full narrative: <body>
 *
 * The "supporting" line and the "Full narrative" line are independently
 * conditional. The narrative is shown only when the top-priority observation
 * is one of the "full" observations selected by config.fullObservationCount
 * (computed by the caller and passed in via `fullObservationIds`).
 */
function renderClusterBlock(
  cluster: ObservationCluster,
  fullObservationIds: Set<number>,
  config: ContextConfig,
): string[] {
  const top = cluster.topByPriority;
  const mode = ModeManager.getInstance();
  const headerEmoji = mode.getTypeIcon(top.type);
  const lastTouchedTime = formatTime(cluster.lastTouched);

  const lines: string[] = [];
  lines.push(`${headerEmoji} ${cluster.subject} (${cluster.count} obs · last ${lastTouchedTime})`);

  // Primary line: top-priority winner.
  const primaryEmoji = mode.getTypeIcon(top.type);
  const primaryTitle = (top.title ?? 'Untitled').trim() || 'Untitled';
  // Stale tag mirrors AgentFormatter's compact line, kept here for parity
  // when rows are surfaced through the cluster path.
  const staleTag = top.stale ? ' [STALE]' : '';
  lines.push(`${CLUSTER_BULLET_INDENT}${primaryEmoji}  #${top.id}  ${primaryTitle}${staleTag}`);

  // Supporting line, if cluster.count > 1.
  if (cluster.count > 1) {
    const preview = buildSupportingPreview(cluster);
    const supportingCount = cluster.count - 1;
    const supportingLine = preview
      ? `${CLUSTER_DETAIL_INDENT}+ ${supportingCount} supporting: ${preview}`
      : `${CLUSTER_DETAIL_INDENT}+ ${supportingCount} supporting`;
    lines.push(supportingLine);
  }

  // Full narrative line, if the top obs is in the "full" set.
  if (fullObservationIds.has(top.id)) {
    const detail = getClusterDetailField(top, config);
    if (detail) {
      // Collapse newlines so the narrative stays on one logical line under
      // the cluster — matches the example shape in the plan ("Full narrative:
      // <truncated body>"). We keep raw spacing otherwise.
      const collapsed = detail.replace(/\s+/g, ' ').trim();
      lines.push(`${CLUSTER_DETAIL_INDENT}Full narrative: ${collapsed}`);
    }
  }

  return lines;
}

/**
 * Render a clustered timeline.
 *
 * Iterates clusters in input order (already sorted by `clusterBySubject`,
 * top-priority cluster first), renders each as a small block, and appends
 * any session summaries (chronological) at the end so context still surfaces
 * "what happened" alongside "what files mattered."
 *
 * No day grouping in the clustered path: clusters are organized by subject,
 * not by date. The cluster header carries `last <time>` to anchor recency.
 */
export function renderTimelineClustered(
  clusters: ObservationCluster[],
  summaries: SummaryTimelineItem[],
  fullObservationIds: Set<number>,
  config: ContextConfig,
  forHuman: boolean,
): string[] {
  const output: string[] = [];

  for (const cluster of clusters) {
    output.push(...renderClusterBlock(cluster, fullObservationIds, config));
    output.push('');
  }

  // Append session summaries at the bottom in chronological-DESC order so the
  // most recent session is closest to the cluster blocks.
  const sortedSummaries = [...summaries].sort((a, b) => b.displayEpoch - a.displayEpoch);
  for (const summary of sortedSummaries) {
    const formattedTime = formatDateTime(summary.displayTime);
    if (forHuman) {
      output.push(...Human.renderHumanSummaryItem(summary, formattedTime));
    } else {
      output.push(...Agent.renderAgentSummaryItem(summary, formattedTime));
    }
  }

  return output;
}
