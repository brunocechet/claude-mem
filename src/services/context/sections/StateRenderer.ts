/**
 * StateRenderer - Renders live git state at the top of the context digest.
 *
 * Output shape (single string, two lines max, joined by `\n`):
 *
 *   📍 <projectName> · <branch> · <N> dirty · <ahead> ahead/<behind> behind <baseBranch>
 *      Last commit (<relative-time>): <subject>
 *
 * All git execution is bounded (500ms wall-clock per command) and every
 * failure mode is treated as "skip that part of the line." If the entire
 * call can't produce something useful (e.g. the cwd is not a git repo),
 * the function returns `null` so the caller can render a digest without
 * a state header.
 *
 * Pure: no logging, no global state, no caching. Tests inject a fake
 * git executor via `_testGitExec` to avoid spawning real processes.
 */

import { execFileSync } from 'child_process';

const GIT_TIMEOUT_MS = 500;
const MAX_SUBJECT_LENGTH = 80;
const TRUNCATION_SUFFIX = '…';
const STATE_EMOJI = '📍';

/**
 * Function shape used to invoke git. Production wires `execFileSync`.
 * Tests pass a stub. Implementations MUST throw on any non-zero exit
 * or timeout — null returns are not used here.
 */
export type GitExec = (args: ReadonlyArray<string>) => string;

/**
 * Default git executor. Bounded timeout, captured stdio, utf-8 decoding.
 * Throws on any non-zero exit or timeout, which the renderer handles.
 */
function defaultGitExec(cwd: string): GitExec {
  return (args: ReadonlyArray<string>): string => {
    return execFileSync('git', [...args], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  };
}

/**
 * Try a git command and return trimmed stdout, or null if anything fails.
 */
function tryGit(exec: GitExec, args: ReadonlyArray<string>): string | null {
  try {
    const output = exec(args);
    return output.trim();
  } catch {
    return null;
  }
}

/**
 * Read the current branch name. Returns `(detached)` for a detached HEAD.
 * Returns null only when the command fails entirely.
 */
function getBranch(exec: GitExec): string | null {
  const result = tryGit(exec, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (result === null) return null;
  if (result === 'HEAD') return '(detached)';
  return result;
}

/**
 * Count dirty paths from `git status --porcelain`.
 * Each non-empty line is one path with a status code.
 */
function getDirtyCount(exec: GitExec): number | null {
  const result = tryGit(exec, ['status', '--porcelain']);
  if (result === null) return null;
  if (result.length === 0) return 0;
  return result.split('\n').filter(line => line.trim().length > 0).length;
}

/**
 * Returned by getAheadBehind: counts relative to the chosen base branch.
 */
interface AheadBehind {
  ahead: number;
  behind: number;
  baseBranch: string;
}

/**
 * Try `main` first, then `master`. If neither resolves, return null.
 *
 * `git rev-list --left-right --count <base>...HEAD` returns
 * `<behind>\t<ahead>`: the LEFT side of `A...B` is reachable from A but
 * not B (commits behind), the RIGHT side is reachable from B but not A
 * (commits ahead).
 */
function getAheadBehind(exec: GitExec): AheadBehind | null {
  for (const baseBranch of ['main', 'master']) {
    const result = tryGit(exec, ['rev-list', '--left-right', '--count', `${baseBranch}...HEAD`]);
    if (result === null) continue;

    // git rev-list --left-right --count emits a single tab-separated line.
    // Trim removes any trailing newline; explicit \t split avoids over-splitting
    // if a base branch name (or other field) contained internal whitespace.
    const parts = result.trim().split('\t');
    if (parts.length !== 2) continue;

    const behind = parseInt(parts[0], 10);
    const ahead = parseInt(parts[1], 10);
    if (Number.isNaN(behind) || Number.isNaN(ahead)) continue;

    return { ahead, behind, baseBranch };
  }
  return null;
}

/**
 * Returned by getLastCommit: relative time + truncated subject.
 */
interface LastCommit {
  relativeTime: string;
  subject: string;
}

/**
 * Read the last commit's relative time and subject.
 * Format: `<relative-time>|<subject>`.
 */
function getLastCommit(exec: GitExec): LastCommit | null {
  const result = tryGit(exec, ['log', '-1', '--format=%cr|%s']);
  if (result === null || result.length === 0) return null;

  const sepIdx = result.indexOf('|');
  if (sepIdx <= 0) return null;

  const relativeTime = result.slice(0, sepIdx).trim();
  const rawSubject = result.slice(sepIdx + 1).trim();
  if (!relativeTime || !rawSubject) return null;

  // Iterate by code points (not UTF-16 code units) so that emoji or other
  // surrogate-pair characters at the truncation boundary stay paired and
  // never produce a dangling surrogate.
  const codepoints = Array.from(rawSubject);
  const subject = codepoints.length > MAX_SUBJECT_LENGTH
    ? codepoints.slice(0, MAX_SUBJECT_LENGTH - TRUNCATION_SUFFIX.length).join('') + TRUNCATION_SUFFIX
    : rawSubject;

  return { relativeTime, subject };
}

/**
 * Build the header line from the parts we managed to fetch.
 * Returns null if the line would carry no useful info.
 */
function buildHeaderLine(
  projectName: string,
  branch: string | null,
  dirtyCount: number | null,
  aheadBehind: AheadBehind | null,
): string | null {
  if (!branch) return null;

  const segments: string[] = [projectName, branch];

  if (dirtyCount !== null) {
    segments.push(dirtyCount === 0 ? 'clean' : `${dirtyCount} dirty`);
  }

  if (aheadBehind && (aheadBehind.ahead > 0 || aheadBehind.behind > 0)) {
    segments.push(`${aheadBehind.ahead} ahead/${aheadBehind.behind} behind ${aheadBehind.baseBranch}`);
  }

  return `${STATE_EMOJI} ${segments.join(' · ')}`;
}

/**
 * Render the live git state header for the primary project.
 *
 * @param cwd - Working directory of the primary project
 * @param projectName - Display name to show in the header
 * @param testGitExec - Optional git executor injection (test-only)
 * @returns Two-line state header, or `null` if the cwd is not a git repo
 *          or the result would be empty/uninformative.
 */
export function renderStateHeader(
  cwd: string,
  projectName: string,
  testGitExec?: GitExec,
): string | null {
  if (!cwd || !projectName) return null;

  const exec = testGitExec ?? defaultGitExec(cwd);

  // Quick check: is this a git repo at all? rev-parse fails outside one.
  const insideRepo = tryGit(exec, ['rev-parse', '--is-inside-work-tree']);
  if (insideRepo !== 'true') return null;

  const branch = getBranch(exec);
  if (!branch) return null;

  const dirtyCount = getDirtyCount(exec);
  const aheadBehind = getAheadBehind(exec);
  const lastCommit = getLastCommit(exec);

  const headerLine = buildHeaderLine(projectName, branch, dirtyCount, aheadBehind);
  if (!headerLine) return null;

  if (!lastCommit) return headerLine;

  const lastCommitLine = `   Last commit (${lastCommit.relativeTime}): ${lastCommit.subject}`;
  return `${headerLine}\n${lastCommitLine}`;
}
