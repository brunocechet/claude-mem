#!/usr/bin/env node
/**
 * Surface the most common unknown observation types from worker logs so the
 * operator can decide which to add as synonyms (or as new canonical types).
 *
 * Reads ~/.claude-mem/logs/worker-YYYY-MM-DD.log files and greps for the parser's
 * coercion WARN line: `Invalid observation type: X, using "Y"`. Counts each X
 * and prints a markdown table sorted by frequency.
 *
 * Usage:
 *   node scripts/synonym-suggestions.mjs              Last 14 days of logs
 *   node scripts/synonym-suggestions.mjs --days 60    Custom window
 *   node scripts/synonym-suggestions.mjs --min 3      Only show types seen ≥3 times
 *
 * Workflow:
 *   1. Run this script periodically (e.g. monthly).
 *   2. For each frequent unknown type, decide:
 *      - "Drift" (model emits a near-synonym of an existing type) → add to that
 *        type's `synonyms[]` in the relevant plugin/modes/*.json
 *      - "Real gap" (the model is consistently asking for a category that doesn't
 *        exist) → add as a new canonical type with its own emoji and description
 *   3. Rebuild and restart: `npm run build-dev`
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const LOG_DIR = join(homedir(), '.claude-mem', 'logs');

const args = process.argv.slice(2);
const flagValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const days = parseInt(flagValue('--days') ?? '14', 10);
const minCount = parseInt(flagValue('--min') ?? '2', 10);

if (!existsSync(LOG_DIR)) {
  console.error(`No log directory at ${LOG_DIR}`);
  process.exit(1);
}

// Pick log files within the window (filenames are worker-YYYY-MM-DD.log)
const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const cutoffStr = cutoff.toISOString().slice(0, 10);

const logFiles = readdirSync(LOG_DIR)
  .filter(name => name.startsWith('worker-') && name.endsWith('.log'))
  .filter(name => {
    const dateMatch = name.match(/worker-(\d{4}-\d{2}-\d{2})\.log/);
    return dateMatch && dateMatch[1] >= cutoffStr;
  });

if (logFiles.length === 0) {
  console.error(`No worker logs from the last ${days} days found in ${LOG_DIR}`);
  process.exit(1);
}

// Match: `Invalid observation type: <captured>, using "<fallback>"`
const lineRegex = /Invalid observation type:\s*(\S+?)\s*,\s*using\s+"([^"]+)"/;

const counts = new Map(); // raw_type → { count, fallbacks: Map<canonical, count> }

for (const fname of logFiles) {
  let lines;
  try {
    lines = readFileSync(join(LOG_DIR, fname), 'utf-8').split('\n');
  } catch {
    continue;
  }
  for (const line of lines) {
    const m = lineRegex.exec(line);
    if (!m) continue;
    const [, rawType, fallback] = m;
    if (!counts.has(rawType)) {
      counts.set(rawType, { count: 0, fallbacks: new Map() });
    }
    const entry = counts.get(rawType);
    entry.count++;
    entry.fallbacks.set(fallback, (entry.fallbacks.get(fallback) ?? 0) + 1);
  }
}

const rows = Array.from(counts.entries())
  .filter(([, e]) => e.count >= minCount)
  .map(([rawType, e]) => {
    // Most-frequent fallback (the canonical type this raw_type usually got coerced to)
    const sortedFallbacks = Array.from(e.fallbacks.entries()).sort((a, b) => b[1] - a[1]);
    const [topFallback, topCount] = sortedFallbacks[0];
    const fallbackPct = ((topCount / e.count) * 100).toFixed(0);
    return { rawType, count: e.count, suggestedType: topFallback, fallbackPct };
  })
  .sort((a, b) => b.count - a.count);

if (rows.length === 0) {
  console.log(`No unknown types seen ≥${minCount} times in the last ${days} days. (Either the model is well-aligned with the vocabulary, or there's not enough activity yet.)`);
  process.exit(0);
}

console.log(`\nUnknown observation types — last ${days} days, min ${minCount} occurrences\n`);
console.log('| Count | Raw type emitted by model | Add to (suggested) | Confidence |');
console.log('|-------|---------------------------|--------------------|------------|');
for (const r of rows) {
  console.log(`| ${String(r.count).padEnd(5)} | ${r.rawType.padEnd(25)} | ${r.suggestedType.padEnd(18)} | ${r.fallbackPct}% |`);
}
console.log('');
console.log('Decision guide:');
console.log('  • "drift" (model used a near-synonym of an existing type)');
console.log('     → add the raw type to that type\'s synonyms[] in plugin/modes/<mode>.json');
console.log('  • "real gap" (the model keeps asking for something not in the vocabulary)');
console.log('     → add a brand-new entry to observation_types[] with its own emoji + description');
console.log('');
console.log('Then: npm run build-dev');
console.log('');
