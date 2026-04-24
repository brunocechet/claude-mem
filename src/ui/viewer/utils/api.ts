/**
 * Fetch wrapper for viewer API calls.
 * Injects the bearer token injected into window.__CLAUDE_MEM_TOKEN__ by the
 * server when serving the viewer HTML. Falls back to unauthenticated fetch on
 * unprovisioned installs (no token file yet).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function authFetch(input: any, init?: any): Promise<any> {
  const token = (globalThis as Record<string, unknown>).__CLAUDE_MEM_TOKEN__;
  if (typeof token !== 'string' || !token) {
    return fetch(input, init);
  }
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
