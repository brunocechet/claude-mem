/**
 * Context Types - Shared types for context generation module
 */

/**
 * Input parameters for context generation
 */
export interface ContextInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  source?: "startup" | "resume" | "clear" | "compact";
  /** Array of projects to query (for worktree support: [parent, worktree]) */
  projects?: string[];
  /** When true, return ALL observations with no limit */
  full?: boolean;
  [key: string]: any;
}

/**
 * Configuration for context generation
 */
export interface ContextConfig {
  // Display counts
  totalObservationCount: number;
  fullObservationCount: number;
  sessionCount: number;

  // Token display toggles
  showReadTokens: boolean;
  showWorkTokens: boolean;
  showSavingsAmount: boolean;
  showSavingsPercent: boolean;

  // Filters
  observationTypes: Set<string>;
  observationConcepts: Set<string>;

  // Display options
  fullObservationField: 'narrative' | 'facts';
  showLastSummary: boolean;
  showLastMessage: boolean;

  // Budget & staleness (0 = disabled)
  contextBudgetTokens: number;
  stalenessCutoffEpoch: number;
  // When true (full mode / explicit recall), include stale observations
  includeStale: boolean;
  /**
   * Restore the verbose pre-v2 boilerplate blocks (legend, column key,
   * context-index preamble, 4-line economics) in formatter output. Does
   * NOT disable the v2 sections — for full rollback to pre-v2 shape, also
   * set CLAUDE_MEM_CONTEXT_STATE_HEADER, CLAUDE_MEM_CONTEXT_BLOCKERS_SECTION,
   * and CLAUDE_MEM_CONTEXT_SUBJECT_CLUSTERING to 'false'.
   */
  verbose: boolean;
  // When true (default), render the live git state header (📍 project · branch · dirty · …)
  // at the very top of the digest. Set to false to revert to pre-Phase-2 layout.
  showStateHeader: boolean;
  // When true (default), reorder observations by TYPE_WEIGHT × recencyDecay so high-signal
  // rows surface first. When false, fall back to chronological ordering.
  priorityRanking: boolean;
  // When true (default), render the 🚧 Pending decisions / blockers section between
  // the state header and the main timeline. Backed by extractActionableSignals.
  showBlockers: boolean;
  // Maximum number of blocker bullets to render before folding into a "+ N more" footnote.
  maxBlockers: number;
  // When true (default), group timeline observations by normalized subject (file basename or
  // title-derived) and render one cluster per subject with the top-priority winner first.
  // When false, fall back to the legacy flat per-day rendering.
  subjectClustering: boolean;
}

/**
 * Observation record from database
 */
export interface Observation {
  id: number;
  memory_session_id: string;
  platform_source?: string;
  type: string;
  title: string | null;
  subtitle: string | null;
  narrative: string | null;
  facts: string | null;
  concepts: string | null;
  files_read: string | null;
  files_modified: string | null;
  discovery_tokens: number | null;
  created_at: string;
  created_at_epoch: number;
  verified_at: number | null;
  stale: number;
  /** Project this observation belongs to (for multi-project queries) */
  project?: string;
}

/**
 * Session summary record from database
 */
export interface SessionSummary {
  id: number;
  memory_session_id: string;
  platform_source?: string;
  request: string | null;
  investigated: string | null;
  learned: string | null;
  completed: string | null;
  next_steps: string | null;
  created_at: string;
  created_at_epoch: number;
  /** Project this summary belongs to (for multi-project queries) */
  project?: string;
}

/**
 * Summary with timeline display info
 */
export interface SummaryTimelineItem extends SessionSummary {
  displayEpoch: number;
  displayTime: string;
  shouldShowLink: boolean;
}

/**
 * Timeline item - either observation or summary
 */
export type TimelineItem =
  | { type: 'observation'; data: Observation }
  | { type: 'summary'; data: SummaryTimelineItem };

/**
 * Token economics data
 */
export interface TokenEconomics {
  totalObservations: number;
  totalReadTokens: number;
  totalDiscoveryTokens: number;
  savings: number;
  savingsPercent: number;
}

/**
 * Prior messages from transcript
 */
export interface PriorMessages {
  userMessage: string;
  assistantMessage: string;
}

/**
 * ANSI color codes for terminal output
 */
export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
};

/**
 * Configuration constants
 */
export const CHARS_PER_TOKEN_ESTIMATE = 4;
export const SUMMARY_LOOKAHEAD = 1;
