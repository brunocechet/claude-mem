/**
 * normalizeSubject tests
 *
 * Verifies the pure subject-extraction utility used by digest clustering.
 */

import { describe, it, expect } from 'bun:test';
import { normalizeSubject } from '../../../src/services/context/utils/normalizeSubject.js';

describe('normalizeSubject', () => {
  describe('single-file path heuristic', () => {
    it('returns basename without extension for a regular file', () => {
      const result = normalizeSubject('Some random title here', ['src/services/foo/bar.ts']);
      expect(result).toBe('bar');
    });

    it('returns parent dir when basename is generic index.ts', () => {
      const result = normalizeSubject(
        'Test for the access token hook',
        ['supabase/functions/access-token-hook/index.ts'],
      );
      expect(result).toBe('access-token-hook');
    });

    it('returns parent dir for generic main.py', () => {
      const result = normalizeSubject('something', ['app/cli/main.py']);
      expect(result).toBe('cli');
    });

    it('returns parent dir for generic mod.rs', () => {
      const result = normalizeSubject('something', ['crates/core/src/mod.rs']);
      expect(result).toBe('src');
    });

    it('returns parent dir for generic lib basename', () => {
      const result = normalizeSubject('something', ['packages/utils/lib.ts']);
      expect(result).toBe('utils');
    });

    it('returns parent dir for generic utils basename', () => {
      const result = normalizeSubject('something', ['shared/auth/utils.ts']);
      expect(result).toBe('auth');
    });

    it('handles backslash-style paths', () => {
      const result = normalizeSubject('whatever', ['src\\foo\\bar.ts']);
      expect(result).toBe('bar');
    });

    it('lowercases the path-derived basename', () => {
      const result = normalizeSubject('whatever', ['src/MyComponent.tsx']);
      expect(result).toBe('mycomponent');
    });
  });

  describe('multi-file or empty path → preamble stripping', () => {
    it('strips "Code references to" prefix', () => {
      const result = normalizeSubject('Code references to TokenCalculator', []);
      expect(result).toBe('tokencalculator');
    });

    it('strips "discovery of" prefix', () => {
      const result = normalizeSubject('discovery of dead session cleanup logic', []);
      expect(result).toBe('dead session cleanup logic');
    });

    it('strips "test setup for" prefix', () => {
      const result = normalizeSubject('Test setup for the worker spawner', []);
      expect(result).toBe('the worker spawner');
    });

    it('strips "examined" prefix', () => {
      const result = normalizeSubject('Examined the migration runner', []);
      expect(result).toBe('the migration runner');
    });

    it('strips "identified" prefix', () => {
      const result = normalizeSubject('Identified missing index on observations.session_id', []);
      expect(result).toBe('missing index on observations.session_id');
    });

    it('strips "located" prefix', () => {
      const result = normalizeSubject('Located the auth route handler', []);
      expect(result).toBe('the auth route handler');
    });

    it('strips "found" prefix', () => {
      const result = normalizeSubject('Found a duplicate import in HookRouter', []);
      expect(result).toBe('a duplicate import in hookrouter');
    });

    it('strips "analyzing" prefix', () => {
      const result = normalizeSubject('Analyzing tier routing fallback', []);
      expect(result).toBe('tier routing fallback');
    });

    it('strips "analysis of" prefix', () => {
      const result = normalizeSubject('Analysis of memory leak in spawner', []);
      expect(result).toBe('memory leak in spawner');
    });

    it('strips multi-file path (cannot use single-file heuristic)', () => {
      const result = normalizeSubject('Code references to FooBar', [
        'src/a.ts',
        'src/b.ts',
      ]);
      expect(result).toBe('foobar');
    });

    it('does not crash on stripping when filesModified array is empty', () => {
      const result = normalizeSubject('discovery of cache eviction', []);
      expect(result).toBe('cache eviction');
    });
  });

  describe('truncation', () => {
    it('truncates a long title at the last word boundary ≤ 60 chars', () => {
      const longTitle =
        'this is a fairly long title that should definitely be truncated somewhere reasonable in the middle';
      const result = normalizeSubject(longTitle, []);
      expect(result.length).toBeLessThanOrEqual(60);
      // Should not slice mid-word — last char before any cut should be a complete word.
      expect(result.endsWith(' ')).toBe(false);
      // Sanity: result is a prefix-ish form of original.
      expect(longTitle.toLowerCase().startsWith(result)).toBe(true);
    });

    it('does not truncate short titles', () => {
      const result = normalizeSubject('short title', []);
      expect(result).toBe('short title');
    });
  });

  describe('graceful edge cases', () => {
    it('returns empty-fallback for empty title (no path)', () => {
      const result = normalizeSubject('', []);
      expect(result).toBe('');
    });

    it('returns empty-fallback for whitespace-only title', () => {
      const result = normalizeSubject('   \t  ', []);
      expect(result).toBe('');
    });

    it('falls back to lowercased original when stripping leaves empty', () => {
      // "Found" alone → strip → '' → fallback to lowercased original "found"
      const result = normalizeSubject('Found', []);
      expect(result).toBe('found');
    });

    it('collapses internal whitespace', () => {
      const result = normalizeSubject('Many    spaces   between\twords', []);
      expect(result).toBe('many spaces between words');
    });

    it('returns empty string for null title with no files', () => {
      const result = normalizeSubject(null, []);
      expect(result).toBe('');
    });

    it('falls back to file-derived subject when title is null but files are present', () => {
      const result = normalizeSubject(null, ['/path/to/file.ts']);
      expect(result).toBe('file');
    });
  });
});
