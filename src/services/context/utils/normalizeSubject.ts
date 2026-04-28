/**
 * normalizeSubject - Pure subject extraction for clustering
 *
 * Given an observation title (and the list of files it modified), produce a
 * short normalized subject token usable as a cluster key in the digest.
 *
 * Pure function: no I/O, no logging.
 */

const PREAMBLE_PATTERNS: ReadonlyArray<RegExp> = [
  /^code references to\s+/i,
  /^discovery of\s+/i,
  /^test setup for\s+/i,
  /^examined\s+/i,
  /^identified\s+/i,
  /^located\s+/i,
  /^found\s+/i,
  /^analyzing\s+/i,
  /^analysis of\s+/i,
];

const MAX_LENGTH = 60;

/**
 * Generic basenames where the parent dir is more meaningful than the file
 * itself (e.g. `index.ts`, `mod.rs`, `main.py`, `lib.rs`, `utils.ts`).
 */
const GENERIC_BASENAMES: ReadonlySet<string> = new Set([
  'index',
  'mod',
  'main',
  'lib',
  'utils',
]);

/**
 * Extract a candidate subject from a single file path.
 *
 * Examples:
 *   "src/foo/bar.ts"            -> "bar"
 *   "supabase/.../index.ts"     -> "<parent dir>"
 *   "src/foo/main.py"           -> "<parent dir>"
 */
function subjectFromPath(filePath: string): string | null {
  // Normalize separators and split.
  const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length === 0) return null;

  const filename = parts[parts.length - 1];
  const lastDot = filename.lastIndexOf('.');
  const basename = lastDot > 0 ? filename.slice(0, lastDot) : filename;

  if (GENERIC_BASENAMES.has(basename.toLowerCase()) && parts.length >= 2) {
    return parts[parts.length - 2];
  }

  return basename || null;
}

/**
 * Strip leading prepositional/preamble phrases from a title.
 */
function stripPreambles(title: string): string {
  let current = title;
  // Strip iteratively in case of accidental nesting (e.g. "found discovery of …").
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of PREAMBLE_PATTERNS) {
      const next = current.replace(pattern, '');
      if (next !== current) {
        current = next;
        changed = true;
        break;
      }
    }
  }
  return current;
}

/**
 * Truncate to MAX_LENGTH, breaking at the last word boundary ≤ limit.
 * Falls back to a hard cut when no boundary exists in range.
 */
function truncateAtWord(input: string, limit: number): string {
  if (input.length <= limit) return input;
  const slice = input.slice(0, limit);
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > 0) {
    return slice.slice(0, lastSpace).trimEnd();
  }
  return slice;
}

/**
 * Collapse internal whitespace to single space and trim.
 */
function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

/**
 * Extract a normalized subject for clustering observations.
 *
 * Rules (in order):
 *   1. If exactly one file is modified, use the basename (without extension)
 *      — or the parent dir when the basename is generic (index/mod/main/…).
 *   2. Strip leading preamble phrases ("Code references to", "discovery of", …).
 *   3. Lowercase + collapse whitespace.
 *   4. Truncate to 60 chars at the last word boundary.
 *
 * If everything is stripped to empty, falls back to the lowercased original
 * title (truncated to 60 chars).
 */
export function normalizeSubject(title: string | null, filesModified: string[]): string {
  // Rule 1: single-file path wins.
  if (filesModified.length === 1) {
    const fromPath = subjectFromPath(filesModified[0]);
    if (fromPath) {
      const normalized = collapseWhitespace(fromPath).toLowerCase();
      return truncateAtWord(normalized, MAX_LENGTH);
    }
  }

  const safeTitle = title ?? '';

  // Rule 2 + 3: strip preambles, lowercase, collapse whitespace.
  const stripped = collapseWhitespace(stripPreambles(safeTitle)).toLowerCase();

  if (stripped.length === 0) {
    // Fallback: lowercased original, truncated.
    const fallback = collapseWhitespace(safeTitle).toLowerCase();
    return truncateAtWord(fallback, MAX_LENGTH);
  }

  // Rule 4: truncate at word boundary.
  return truncateAtWord(stripped, MAX_LENGTH);
}
