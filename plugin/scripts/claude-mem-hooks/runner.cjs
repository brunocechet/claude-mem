#!/usr/bin/env node
/**
 * claude-mem owned hook runner — hardened drop-in for bun-runner.js.
 *
 * Lives in plugin/scripts/claude-mem-hooks/, a path upstream thedotmack/claude-mem
 * does not ship. Any future upstream changes to bun-runner.js cannot affect the
 * hook contract because hooks.json calls this file directly.
 *
 * Contract:
 *   node runner.cjs <bundled-script.cjs> [args...]
 *
 * Guarantees:
 *   - Exit code is always 0 or 2. Any other outcome is clamped to 0.
 *   - Failures append a JSONL line to ~/.claude-mem/logs/hook-failures-YYYY-MM-DD.jsonl
 *     so silent exits remain diagnosable despite Claude Code's stderr suppression.
 *   - install-stamp bail: missing plugin/.install-version → log + exit 0 instead
 *     of spawning a doomed worker.
 *   - bun-not-found bail: log + exit 0 instead of failing with a stderr message
 *     that hook-command.ts will swallow anyway.
 */

const { spawn, spawnSync } = require('child_process');
const { existsSync, readFileSync, mkdirSync, appendFileSync } = require('fs');
const { join, dirname, resolve } = require('path');
const { homedir } = require('os');

const IS_WINDOWS = process.platform === 'win32';
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || resolve(__dirname, '..', '..');
const LOG_DIR = join(homedir(), '.claude-mem', 'logs');

function logFailure(reason, extra) {
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const file = join(LOG_DIR, `hook-failures-${day}.jsonl`);
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      pid: process.pid,
      reason,
      args: process.argv.slice(2),
      cwd: process.cwd(),
      pluginRoot: PLUGIN_ROOT,
      pathFirst: (process.env.PATH || '').split(IS_WINDOWS ? ';' : ':').slice(0, 5),
      ...extra,
    });
    appendFileSync(file, line + '\n');
  } catch {
    // Never let logging itself break the hook.
  }
}

function exitOk(code) {
  process.exit(code === 0 || code === 2 ? code : 0);
}

process.on('uncaughtException', (err) => {
  logFailure('uncaughtException', { error: String(err && err.stack || err) });
  exitOk(0);
});
process.on('unhandledRejection', (err) => {
  logFailure('unhandledRejection', { error: String(err && err.stack || err) });
  exitOk(0);
});

function isPluginDisabled() {
  try {
    const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
    const settingsPath = join(configDir, 'settings.json');
    if (!existsSync(settingsPath)) return false;
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    return (
      settings?.enabledPlugins?.['claude-mem@thedotmack-local'] === false ||
      settings?.enabledPlugins?.['claude-mem@thedotmack'] === false
    );
  } catch {
    return false;
  }
}

function findBun() {
  const probe = IS_WINDOWS
    ? spawnSync('where bun', { encoding: 'utf-8', shell: true })
    : spawnSync('which', ['bun'], { encoding: 'utf-8' });
  if (probe.status === 0 && probe.stdout && probe.stdout.trim()) {
    if (IS_WINDOWS) {
      const cmd = probe.stdout.split('\n').find((l) => l.trim().endsWith('bun.cmd'));
      if (cmd) return cmd.trim();
    }
    return 'bun';
  }
  const candidates = IS_WINDOWS
    ? [join(homedir(), '.bun', 'bin', 'bun.exe')]
    : [
        join(homedir(), '.bun', 'bin', 'bun'),
        '/usr/local/bin/bun',
        '/opt/homebrew/bin/bun',
        '/home/linuxbrew/.linuxbrew/bin/bun',
      ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function fixBrokenScriptPath(p) {
  if (typeof p === 'string' && p.startsWith('/scripts/') && !existsSync(p)) {
    const fixed = join(PLUGIN_ROOT, p);
    if (existsSync(fixed)) return fixed;
  }
  return p;
}

async function collectStdin() {
  return new Promise((resolveStdin) => {
    if (process.stdin.isTTY) return resolveStdin(null);
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolveStdin(chunks.length ? Buffer.concat(chunks) : null));
    process.stdin.on('error', () => resolveStdin(null));
    setTimeout(() => {
      process.stdin.removeAllListeners();
      process.stdin.pause();
      resolveStdin(chunks.length ? Buffer.concat(chunks) : null);
    }, 5000);
  });
}

(async function main() {
  if (isPluginDisabled()) exitOk(0);

  const args = process.argv.slice(2);
  if (args.length === 0) {
    logFailure('no-args', {});
    exitOk(0);
  }
  args[0] = fixBrokenScriptPath(args[0]);

  const stamp = join(PLUGIN_ROOT, '.install-version');
  if (!existsSync(stamp)) {
    logFailure('install-stamp-missing', { stamp });
    exitOk(0);
  }

  const bunPath = findBun();
  if (!bunPath) {
    logFailure('bun-not-found', {});
    exitOk(0);
  }

  const stdinData = await collectStdin();

  const spawnCmd = IS_WINDOWS ? 'cmd' : bunPath;
  const spawnArgs = IS_WINDOWS ? ['/c', bunPath, ...args] : args;
  const child = spawn(spawnCmd, spawnArgs, {
    stdio: ['pipe', 'inherit', 'inherit'],
    windowsHide: true,
    env: process.env,
  });

  if (child.stdin) {
    try {
      child.stdin.write(stdinData || '{}');
      child.stdin.end();
    } catch (err) {
      logFailure('stdin-write-failed', { error: String(err) });
    }
  }

  child.on('error', (err) => {
    logFailure('spawn-error', { error: String(err && err.message || err) });
    exitOk(0);
  });

  child.on('close', (code, signal) => {
    if (code === 0 || code === 2) {
      exitOk(code);
      return;
    }
    logFailure('child-nonzero', { code, signal });
    exitOk(0);
  });
})();
