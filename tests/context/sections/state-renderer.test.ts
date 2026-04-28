/**
 * StateRenderer tests
 *
 * Verifies the live git state header renders correctly for all the
 * shapes the digest can encounter (clean, dirty, ahead/behind, detached,
 * missing main/master, total git failure). The renderer uses a pluggable
 * git executor (`GitExec`) so we can simulate every branch without
 * spawning real git subprocesses.
 */

import { describe, it, expect } from 'bun:test';
import {
  renderStateHeader,
  type GitExec,
} from '../../../src/services/context/sections/StateRenderer.js';

/**
 * Build a stub GitExec that maps a normalized arg-string to a fixed
 * stdout (or to an Error to simulate non-zero exit / timeout).
 *
 * Args are matched by joining with a single space — e.g.
 *   ['rev-parse', '--abbrev-ref', 'HEAD'] → 'rev-parse --abbrev-ref HEAD'
 */
function makeGitExec(table: Record<string, string | Error>): GitExec {
  return (args: ReadonlyArray<string>): string => {
    const key = args.join(' ');
    const value = table[key];
    if (value === undefined) {
      throw new Error(`unmocked git invocation: ${key}`);
    }
    if (value instanceof Error) throw value;
    return value;
  };
}

describe('renderStateHeader', () => {
  describe('happy path', () => {
    it('renders full two-line header when everything succeeds (dirty + ahead/behind)', () => {
      const exec = makeGitExec({
        'rev-parse --is-inside-work-tree': 'true\n',
        'rev-parse --abbrev-ref HEAD': 'm-004/pr04b-bundle\n',
        'status --porcelain':
          ' M src/foo.ts\n M src/bar.ts\n M src/baz.ts\n M src/a.ts\n M src/b.ts\n M src/c.ts\n M src/d.ts\n M src/e.ts\n M src/f.ts\n M src/g.ts\n M src/h.ts\n M src/i.ts\n',
        'rev-list --left-right --count main...HEAD': '0\t3\n',
        'log -1 --format=%cr|%s': '2 hours ago|feat(audit): emit W2 bundle for audit_log\n',
      });

      const result = renderStateHeader('/repo', 'ana-v2', exec);

      expect(result).toBe(
        '📍 ana-v2 · m-004/pr04b-bundle · 12 dirty · 3 ahead/0 behind main\n' +
          '   Last commit (2 hours ago): feat(audit): emit W2 bundle for audit_log',
      );
    });

    it('renders "clean" when dirty count is 0 and omits ahead/behind when 0/0', () => {
      const exec = makeGitExec({
        'rev-parse --is-inside-work-tree': 'true',
        'rev-parse --abbrev-ref HEAD': 'main',
        'status --porcelain': '',
        'rev-list --left-right --count main...HEAD': '0\t0',
        'log -1 --format=%cr|%s': '5 minutes ago|chore: bump version',
      });

      const result = renderStateHeader('/repo', 'ana-v2', exec);

      expect(result).toBe(
        '📍 ana-v2 · main · clean\n' +
          '   Last commit (5 minutes ago): chore: bump version',
      );
    });

    it('renders detached HEAD label and skips branch comparison gracefully', () => {
      const exec = makeGitExec({
        'rev-parse --is-inside-work-tree': 'true',
        'rev-parse --abbrev-ref HEAD': 'HEAD',
        'status --porcelain': '',
        'rev-list --left-right --count main...HEAD': '0\t0',
        'log -1 --format=%cr|%s': '1 hour ago|wip',
      });

      const result = renderStateHeader('/repo', 'ana-v2', exec);

      expect(result).toBe('📍 ana-v2 · (detached) · clean\n   Last commit (1 hour ago): wip');
    });

    it('renders ahead-only without behind segment when behind is 0', () => {
      const exec = makeGitExec({
        'rev-parse --is-inside-work-tree': 'true',
        'rev-parse --abbrev-ref HEAD': 'feature/x',
        'status --porcelain': '',
        'rev-list --left-right --count main...HEAD': '0\t5',
        'log -1 --format=%cr|%s': '3 hours ago|feat: x',
      });

      const result = renderStateHeader('/repo', 'proj', exec);

      // ahead/behind shows the segment because at least one is non-zero.
      expect(result).toContain('5 ahead/0 behind main');
    });

    it('renders both ahead and behind when both are non-zero', () => {
      const exec = makeGitExec({
        'rev-parse --is-inside-work-tree': 'true',
        'rev-parse --abbrev-ref HEAD': 'feature/x',
        'status --porcelain': '',
        'rev-list --left-right --count main...HEAD': '2\t5',
        'log -1 --format=%cr|%s': '3 hours ago|feat: x',
      });

      const result = renderStateHeader('/repo', 'proj', exec);

      expect(result).toContain('5 ahead/2 behind main');
    });
  });

  describe('fallback paths', () => {
    it('falls back to master when main is missing', () => {
      const exec = makeGitExec({
        'rev-parse --is-inside-work-tree': 'true',
        'rev-parse --abbrev-ref HEAD': 'develop',
        'status --porcelain': ' M file.ts\n',
        'rev-list --left-right --count main...HEAD': new Error('no main'),
        'rev-list --left-right --count master...HEAD': '1\t2',
        'log -1 --format=%cr|%s': '10 minutes ago|fix',
      });

      const result = renderStateHeader('/repo', 'proj', exec);

      expect(result).toContain('2 ahead/1 behind master');
    });

    it('omits ahead/behind segment entirely when both main and master are missing', () => {
      const exec = makeGitExec({
        'rev-parse --is-inside-work-tree': 'true',
        'rev-parse --abbrev-ref HEAD': 'topic',
        'status --porcelain': '',
        'rev-list --left-right --count main...HEAD': new Error('no main'),
        'rev-list --left-right --count master...HEAD': new Error('no master'),
        'log -1 --format=%cr|%s': '1 minute ago|hello',
      });

      const result = renderStateHeader('/repo', 'proj', exec);

      expect(result).toBe('📍 proj · topic · clean\n   Last commit (1 minute ago): hello');
      expect(result).not.toContain('ahead');
      expect(result).not.toContain('behind');
    });

    it('omits the second line when last-commit fetch fails', () => {
      const exec = makeGitExec({
        'rev-parse --is-inside-work-tree': 'true',
        'rev-parse --abbrev-ref HEAD': 'main',
        'status --porcelain': '',
        'rev-list --left-right --count main...HEAD': '0\t0',
        'log -1 --format=%cr|%s': new Error('no commits yet'),
      });

      const result = renderStateHeader('/repo', 'proj', exec);

      expect(result).toBe('📍 proj · main · clean');
      expect(result).not.toContain('Last commit');
    });

    it('omits dirty count cleanly when status fails (renders branch + ahead/behind only)', () => {
      const exec = makeGitExec({
        'rev-parse --is-inside-work-tree': 'true',
        'rev-parse --abbrev-ref HEAD': 'main',
        'status --porcelain': new Error('boom'),
        'rev-list --left-right --count main...HEAD': '0\t1',
        'log -1 --format=%cr|%s': '2 hours ago|x',
      });

      const result = renderStateHeader('/repo', 'proj', exec);

      // No "clean"/"dirty" segment, but branch + ahead/behind + last-commit still rendered.
      expect(result).toContain('📍 proj · main · 1 ahead/0 behind main');
      expect(result).not.toContain('clean');
      expect(result).not.toContain('dirty');
    });
  });

  describe('graceful failure (returns null)', () => {
    it('returns null when not inside a git work tree', () => {
      const exec = makeGitExec({
        'rev-parse --is-inside-work-tree': new Error('not a git repository'),
      });
      expect(renderStateHeader('/tmp/not-a-repo', 'proj', exec)).toBeNull();
    });

    it('returns null when rev-parse returns something other than "true"', () => {
      const exec = makeGitExec({
        'rev-parse --is-inside-work-tree': 'false',
      });
      expect(renderStateHeader('/somewhere', 'proj', exec)).toBeNull();
    });

    it('returns null when branch lookup fails after the work-tree check passes', () => {
      const exec = makeGitExec({
        'rev-parse --is-inside-work-tree': 'true',
        'rev-parse --abbrev-ref HEAD': new Error('weird state'),
      });
      expect(renderStateHeader('/repo', 'proj', exec)).toBeNull();
    });

    it('returns null when cwd is empty', () => {
      const exec = makeGitExec({});
      expect(renderStateHeader('', 'proj', exec)).toBeNull();
    });

    it('returns null when projectName is empty', () => {
      const exec = makeGitExec({});
      expect(renderStateHeader('/repo', '', exec)).toBeNull();
    });
  });

  describe('subject truncation', () => {
    it('truncates subject longer than 80 chars with an ellipsis', () => {
      const longSubject =
        'feat(very-long-scope): this commit message is significantly longer than eighty characters and should be truncated';
      const exec = makeGitExec({
        'rev-parse --is-inside-work-tree': 'true',
        'rev-parse --abbrev-ref HEAD': 'main',
        'status --porcelain': '',
        'rev-list --left-right --count main...HEAD': '0\t0',
        'log -1 --format=%cr|%s': `2 hours ago|${longSubject}`,
      });

      const result = renderStateHeader('/repo', 'proj', exec);
      expect(result).not.toBeNull();
      const lastLine = result!.split('\n')[1];
      // Pull just the subject part out of the last line. The "Last commit (TIME): "
      // prefix is fixed-shape, so non-greedy match on the time inside parens works.
      const match = lastLine.match(/^   Last commit \([^)]+\): (.+)$/);
      expect(match).not.toBeNull();
      const subject = match![1];
      expect(subject.length).toBeLessThanOrEqual(80);
      expect(subject.endsWith('…')).toBe(true);
      // Sanity: prefix matches original.
      expect(longSubject.startsWith(subject.slice(0, -1))).toBe(true);
    });

    it('does not truncate a subject exactly 80 chars long', () => {
      const exact80 = 'a'.repeat(80);
      const exec = makeGitExec({
        'rev-parse --is-inside-work-tree': 'true',
        'rev-parse --abbrev-ref HEAD': 'main',
        'status --porcelain': '',
        'rev-list --left-right --count main...HEAD': '0\t0',
        'log -1 --format=%cr|%s': `1 minute ago|${exact80}`,
      });

      const result = renderStateHeader('/repo', 'proj', exec);
      expect(result).toContain(exact80);
      expect(result).not.toContain('…');
    });

    it('truncates safely when an emoji sits at the truncation boundary', () => {
      // Build an 85-char (by code point) subject with a 🔴 emoji at code-point 79 —
      // i.e. straddling the truncation cut. Naive UTF-16 .slice() would split
      // the surrogate pair and produce a dangling lone surrogate.
      const prefix = 'a'.repeat(79);
      const longSubject = `${prefix}🔴extra`;
      // Quick sanity: code-point length is 85, but UTF-16 length is 86 (emoji = 2 units).
      expect(Array.from(longSubject).length).toBe(85);

      const exec = makeGitExec({
        'rev-parse --is-inside-work-tree': 'true',
        'rev-parse --abbrev-ref HEAD': 'main',
        'status --porcelain': '',
        'rev-list --left-right --count main...HEAD': '0\t0',
        'log -1 --format=%cr|%s': `5 minutes ago|${longSubject}`,
      });

      const result = renderStateHeader('/repo', 'proj', exec);
      expect(result).not.toBeNull();
      const lastLine = result!.split('\n')[1];
      const match = lastLine.match(/^   Last commit \([^)]+\): (.+)$/);
      expect(match).not.toBeNull();
      const subject = match![1];

      // Subject must end with the truncation suffix (not a half-emoji).
      expect(subject.endsWith('…')).toBe(true);

      // No replacement char (U+FFFD) and no standalone (unpaired) surrogate.
      expect(subject).not.toContain('�');
      for (let i = 0; i < subject.length; i++) {
        const code = subject.charCodeAt(i);
        const isHighSurrogate = code >= 0xd800 && code <= 0xdbff;
        const isLowSurrogate = code >= 0xdc00 && code <= 0xdfff;
        if (isHighSurrogate) {
          // High surrogate must be immediately followed by a low surrogate.
          const next = subject.charCodeAt(i + 1);
          expect(next >= 0xdc00 && next <= 0xdfff).toBe(true);
          i++; // skip the paired low surrogate
        } else if (isLowSurrogate) {
          // Hitting a low surrogate without a preceding high surrogate is a bug.
          throw new Error(`Dangling low surrogate at position ${i}`);
        }
      }
    });
  });
});
