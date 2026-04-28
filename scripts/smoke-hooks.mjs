#!/usr/bin/env node
/**
 * Smoke test for the owned hook shim layer (plugin/scripts/claude-mem-hooks/).
 *
 * Catches the regression class that produced the silent SessionStart exit-1
 * banner before the runner.cjs hardening:
 *   - hooks.json points at a path that doesn't exist
 *   - runner.cjs throws or exits non-zero on a failure mode it should clamp
 *   - install-stamp bail path stops working
 *
 * Wired into npm scripts after sync-marketplace so a regression breaks the
 * build before it reaches a session, not after.
 *
 * Usage:
 *   node scripts/smoke-hooks.mjs                # tests against the deployed cache
 *   node scripts/smoke-hooks.mjs <plugin-root>  # tests against an explicit dir
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';

const C = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', dim: '\x1b[2m', reset: '\x1b[0m' };

function resolvePluginRoot(arg) {
  if (arg) return arg;
  const cacheBase = join(homedir(), '.claude/plugins/cache/thedotmack-local/claude-mem');
  if (!existsSync(cacheBase)) {
    fail(`Cache dir not found: ${cacheBase}. Run \`npm run build-and-sync\` first, or pass a plugin root explicitly.`);
  }
  const versions = readdirSync(cacheBase).filter((d) => /^\d/.test(d)).sort();
  if (!versions.length) fail(`No version dirs in ${cacheBase}`);
  return join(cacheBase, versions[versions.length - 1]);
}

function fail(msg) {
  console.error(`${C.red}FAIL:${C.reset} ${msg}`);
  process.exit(1);
}

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ${C.green}✓${C.reset} ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ${C.red}✗${C.reset} ${name}\n    ${C.dim}${err.message}${C.reset}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const PLUGIN_ROOT = resolvePluginRoot(process.argv[2]);
const RUNNER = join(PLUGIN_ROOT, 'scripts/claude-mem-hooks/runner.cjs');
const HOOKS_JSON = join(PLUGIN_ROOT, 'hooks/hooks.json');

console.log(`${C.dim}Plugin root:${C.reset} ${PLUGIN_ROOT}\n`);

// ─────────────────────────────────────────────────────────────────────────
// Group 1: file layout — the things that must exist for hooks to fire at all
// ─────────────────────────────────────────────────────────────────────────
console.log('File layout');

check('runner.cjs exists', () => assert(existsSync(RUNNER), `missing: ${RUNNER}`));
check('runner.cjs is executable', () => {
  const r = spawnSync('node', ['-c', RUNNER], { encoding: 'utf-8' });
  assert(r.status === 0, `node syntax-check failed: ${r.stderr}`);
});
check('hooks.json exists and parses', () => {
  assert(existsSync(HOOKS_JSON), `missing: ${HOOKS_JSON}`);
  JSON.parse(readFileSync(HOOKS_JSON, 'utf-8'));
});
check('hooks.json references runner.cjs (not bun-runner.js) for SessionStart', () => {
  const hooks = JSON.parse(readFileSync(HOOKS_JSON, 'utf-8'));
  const sessionStart = hooks.hooks?.SessionStart?.[0]?.hooks ?? [];
  assert(sessionStart.length === 1, `SessionStart should be 1 hook, got ${sessionStart.length} (re-expansion regression)`);
  const cmd = sessionStart[0].command || '';
  assert(cmd.includes('claude-mem-hooks/runner.cjs'), 'SessionStart does not call runner.cjs');
  assert(!cmd.includes('bun-runner.js'), 'SessionStart still calls bun-runner.js (Move 1 regressed)');
});
check('hooks.json references runner.cjs for every event except Setup', () => {
  const hooks = JSON.parse(readFileSync(HOOKS_JSON, 'utf-8'));
  for (const [event, defs] of Object.entries(hooks.hooks)) {
    if (event === 'Setup') continue;
    for (const def of defs) {
      for (const h of def.hooks || []) {
        const cmd = h.command || '';
        assert(cmd.includes('claude-mem-hooks/runner.cjs'), `${event}: command does not call runner.cjs`);
      }
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Group 2: runner.cjs failure-mode contract — exit 0 in every failure shape
// ─────────────────────────────────────────────────────────────────────────
console.log('\nrunner.cjs failure-mode contract');

function runRunner({ args = [], env = {}, input = '{}', timeout = 10000 } = {}) {
  return spawnSync('node', [RUNNER, ...args], {
    encoding: 'utf-8',
    input,
    timeout,
    env: { ...process.env, ...env },
  });
}

check('no args → exit 0', () => {
  const r = runRunner({ args: [] });
  assert(r.status === 0, `exit ${r.status}, stderr=${(r.stderr || '').slice(0, 200)}`);
});

check('missing install-stamp → exit 0', () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'claude-mem-smoke-'));
  // Ensure no .install-version exists in tmpRoot
  const r = runRunner({ args: ['anything.cjs'], env: { CLAUDE_PLUGIN_ROOT: tmpRoot } });
  assert(r.status === 0, `exit ${r.status}, stderr=${(r.stderr || '').slice(0, 200)}`);
});

check('script path that does not exist → exit 0 (child-nonzero clamped)', () => {
  const r = runRunner({ args: ['/tmp/definitely-does-not-exist.cjs', 'foo'] });
  assert(r.status === 0, `exit ${r.status}, stderr=${(r.stderr || '').slice(0, 200)}`);
});

// ─────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
