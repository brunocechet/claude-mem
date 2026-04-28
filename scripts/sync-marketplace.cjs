#!/usr/bin/env node
/**
 * Sync local plugin source → Claude Code's directory-source plugin cache.
 *
 * This repo is registered as a *directory-source* marketplace
 * (`~/.claude/settings.json` → extraKnownMarketplaces.thedotmack-local), so
 * Claude Code mirrors the plugin into a versioned cache dir on install/update.
 * Edits to plugin/* are not visible to running hooks until that cache is
 * refreshed — `claude plugin update` only refreshes when package.json bumps.
 *
 * This script forces a cache refresh without bumping versions: rsyncs the
 * live plugin/ tree into ~/.claude/plugins/cache/thedotmack-local/claude-mem/<v>/
 * and triggers a worker restart so the new code is picked up.
 *
 * Note: there is intentionally NO marketplace-clone rsync. The old auto-update
 * incident on 2026-04-25 (CLAUDE.md "Auto-Update Recovery") happened because
 * the marketplace dir was a github-source clone that the updater pulled from.
 * Directory-source marketplaces have no clone — the source IS this working tree.
 */

const { execSync } = require('child_process');
const { existsSync, readFileSync, mkdirSync } = require('fs');
const path = require('path');
const os = require('os');

const MARKETPLACE_NAME = 'thedotmack-local';
const CACHE_BASE_PATH = path.join(
  os.homedir(),
  '.claude',
  'plugins',
  'cache',
  MARKETPLACE_NAME,
  'claude-mem'
);

function getGitignoreExcludes(basePath) {
  const gitignorePath = path.join(basePath, '.gitignore');
  if (!existsSync(gitignorePath)) return '';

  const lines = readFileSync(gitignorePath, 'utf-8').split('\n');
  return lines
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !line.startsWith('!'))
    .map(pattern => `--exclude=${JSON.stringify(pattern)}`)
    .join(' ');
}

function getPluginVersion() {
  try {
    const pluginJsonPath = path.join(__dirname, '..', 'plugin', '.claude-plugin', 'plugin.json');
    const pluginJson = JSON.parse(readFileSync(pluginJsonPath, 'utf-8'));
    return pluginJson.version;
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', 'Failed to read plugin version:', error.message);
    process.exit(1);
  }
}

const rootDir = path.join(__dirname, '..');
const pluginDir = path.join(rootDir, 'plugin');
const version = getPluginVersion();
const CACHE_VERSION_PATH = path.join(CACHE_BASE_PATH, version);

if (!existsSync(CACHE_VERSION_PATH)) {
  mkdirSync(CACHE_VERSION_PATH, { recursive: true });
}

try {
  const pluginGitignoreExcludes = getGitignoreExcludes(pluginDir);

  console.log(`Syncing plugin/ → cache (version ${version})...`);
  execSync(
    `rsync -av --delete --exclude=.git ${pluginGitignoreExcludes} plugin/ "${CACHE_VERSION_PATH}/"`,
    { stdio: 'inherit' }
  );

  console.log(`Running bun install in cache folder (version ${version})...`);
  execSync('bun install', { cwd: CACHE_VERSION_PATH, stdio: 'inherit' });

  console.log('\x1b[32m%s\x1b[0m', 'Sync complete!');

  console.log('\n🔄 Triggering worker restart...');
  const http = require('http');
  const uid = typeof process.getuid === 'function' ? process.getuid() : 77;
  const workerPort = parseInt(
    process.env.CLAUDE_MEM_WORKER_PORT || String(37700 + (uid % 100)),
    10
  );
  const req = http.request(
    {
      hostname: '127.0.0.1',
      port: workerPort,
      path: '/api/admin/restart',
      method: 'POST',
      timeout: 2000,
    },
    res => {
      if (res.statusCode === 200) {
        console.log('\x1b[32m%s\x1b[0m', '✓ Worker restart triggered');
      } else {
        console.log('\x1b[33m%s\x1b[0m', `ℹ Worker restart returned status ${res.statusCode}`);
      }
    }
  );
  req.on('error', () => {
    console.log('\x1b[33m%s\x1b[0m', 'ℹ Worker not running, will start on next hook');
  });
  req.on('timeout', () => {
    req.destroy();
    console.log('\x1b[33m%s\x1b[0m', 'ℹ Worker restart timed out');
  });
  req.end();
} catch (error) {
  console.error('\x1b[31m%s\x1b[0m', 'Sync failed:', error.message);
  process.exit(1);
}
