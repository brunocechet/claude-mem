/**
 * Auth token reader for claude-mem bearer authentication.
 *
 * Token provisioned by smart-install.js at Setup time, stored at
 * ~/.claude-mem/auth.token (mode 0600). Callers may also override via
 * CLAUDE_MEM_TOKEN env var (useful for CI or scripted access).
 *
 * Result is cached in-process after the first call.
 */

import { existsSync, readFileSync } from 'fs';
import { AUTH_TOKEN_PATH } from './paths.js';

let _cachedToken: string | null | undefined;

export function readAuthToken(): string | null {
  if (_cachedToken !== undefined) return _cachedToken;

  const envToken = process.env.CLAUDE_MEM_TOKEN?.trim();
  if (envToken) {
    _cachedToken = envToken;
    return _cachedToken;
  }

  try {
    if (existsSync(AUTH_TOKEN_PATH)) {
      _cachedToken = readFileSync(AUTH_TOKEN_PATH, 'utf-8').trim() || null;
    } else {
      _cachedToken = null;
    }
  } catch {
    _cachedToken = null;
  }

  return _cachedToken;
}
