#!/usr/bin/env node
/**
 * Analyze file-context hook telemetry to tune truncation gate thresholds.
 *
 * Reads ~/.claude-mem/file-context-events.jsonl, pairs truncated events with
 * follow-up Reads on the same file in the same session, and reports:
 *   - re-read rate (timeline didn't satisfy → agent re-read in full)
 *   - follow-up rate (next event was another file-context invocation soon after)
 *   - silent rate (no follow-up — timeline was sufficient OR session ended)
 *   - per-file worst offenders (highest re-read rate, sorted by event count)
 *
 * Usage:
 *   node scripts/analyze-file-context.mjs              Last 7 days, all sessions
 *   node scripts/analyze-file-context.mjs --days 30    Last 30 days
 *   node scripts/analyze-file-context.mjs --json       Machine-readable output
 *   node scripts/analyze-file-context.mjs --top 20     Top N worst-offender files
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const EVENTS_PATH = join(homedir(), '.claude-mem', 'file-context-events.jsonl');
const REREAD_WINDOW_MS = 5 * 60 * 1000; // events on same file within 5min count as re-read

const args = process.argv.slice(2);
const flagValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const days = parseInt(flagValue('--days') ?? '7', 10);
const topN = parseInt(flagValue('--top') ?? '10', 10);
const jsonOut = args.includes('--json');

if (!existsSync(EVENTS_PATH)) {
  console.error(`No telemetry file at ${EVENTS_PATH}`);
  console.error('The hook writes to this on every PreToolUse:Read with prior observations.');
  console.error('Run some Reads in a project tracked by claude-mem first.');
  process.exit(1);
}

const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
const lines = readFileSync(EVENTS_PATH, 'utf-8').split('\n').filter(Boolean);
const events = [];
for (const line of lines) {
  try {
    const ev = JSON.parse(line);
    if (ev.ts >= cutoff) events.push(ev);
  } catch {
    // Skip malformed lines
  }
}

if (events.length === 0) {
  console.error(`No events in last ${days} days.`);
  process.exit(1);
}

// Sort by time so we can pair truncated events with their follow-ups
events.sort((a, b) => a.ts - b.ts);

// Group by session+file for re-read detection
const groupKey = (ev) => `${ev.session_id ?? 'no-session'}|${ev.file}`;
const grouped = new Map();
for (const ev of events) {
  const key = groupKey(ev);
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(ev);
}

// For each truncated event, look for a re-read within REREAD_WINDOW_MS
let truncatedTotal = 0;
let truncatedRereadInWindow = 0;
let truncatedNoFollowUp = 0;
const perFile = new Map(); // file → { truncated, reread }

for (const [, sessFileEvents] of grouped) {
  for (let i = 0; i < sessFileEvents.length; i++) {
    const ev = sessFileEvents[i];
    if (!ev.truncated) continue;
    truncatedTotal++;

    const fileStats = perFile.get(ev.file) ?? { truncated: 0, reread: 0 };
    fileStats.truncated++;

    const next = sessFileEvents[i + 1];
    if (next && next.ts - ev.ts < REREAD_WINDOW_MS) {
      truncatedRereadInWindow++;
      fileStats.reread++;
    } else {
      truncatedNoFollowUp++;
    }
    perFile.set(ev.file, fileStats);
  }
}

const totalEvents = events.length;
const truncatedRate = truncatedTotal / totalEvents;
const rereadRate = truncatedTotal > 0 ? truncatedRereadInWindow / truncatedTotal : 0;
const silentRate = truncatedTotal > 0 ? truncatedNoFollowUp / truncatedTotal : 0;

// Per-file worst offenders: highest re-read rate, sorted by truncated count
const fileRows = Array.from(perFile.entries())
  .map(([file, stats]) => ({
    file,
    truncated: stats.truncated,
    reread: stats.reread,
    reread_rate: stats.truncated > 0 ? stats.reread / stats.truncated : 0,
  }))
  .filter(r => r.truncated >= 2) // ignore one-offs
  .sort((a, b) => b.reread_rate - a.reread_rate || b.truncated - a.truncated)
  .slice(0, topN);

// Aggregate density stats — useful for tuning MIN_OBS_FOR_TRUNCATION
const obsCountBuckets = { '1': 0, '2': 0, '3-5': 0, '6-10': 0, '11+': 0 };
for (const ev of events) {
  if (ev.obs_count === 1) obsCountBuckets['1']++;
  else if (ev.obs_count === 2) obsCountBuckets['2']++;
  else if (ev.obs_count <= 5) obsCountBuckets['3-5']++;
  else if (ev.obs_count <= 10) obsCountBuckets['6-10']++;
  else obsCountBuckets['11+']++;
}

if (jsonOut) {
  console.log(JSON.stringify({
    window_days: days,
    total_events: totalEvents,
    truncated_total: truncatedTotal,
    truncated_rate: truncatedRate,
    reread_rate: rereadRate,
    silent_rate: silentRate,
    obs_count_buckets: obsCountBuckets,
    worst_offenders: fileRows,
  }, null, 2));
} else {
  const pct = (n) => `${(n * 100).toFixed(1)}%`;
  console.log(`\nFile-context hook telemetry — last ${days} days`);
  console.log('─'.repeat(70));
  console.log(`  Total hook invocations: ${totalEvents}`);
  console.log(`  Truncated reads:        ${truncatedTotal} (${pct(truncatedRate)})`);
  console.log(`  Of those:`);
  console.log(`    Re-read within 5min:  ${truncatedRereadInWindow} (${pct(rereadRate)})  ← timeline insufficient`);
  console.log(`    No follow-up:         ${truncatedNoFollowUp} (${pct(silentRate)})  ← timeline sufficient OR session ended`);
  console.log('');
  console.log('  Observation count distribution (all invocations):');
  for (const [bucket, n] of Object.entries(obsCountBuckets)) {
    const bar = '█'.repeat(Math.round(40 * n / totalEvents));
    console.log(`    ${bucket.padEnd(5)} ${String(n).padStart(5)}  ${bar}`);
  }
  console.log('');
  if (fileRows.length > 0) {
    console.log(`  Worst-offender files (highest re-read rate, ≥2 truncations):`);
    console.log(`    ${'rate'.padEnd(7)} ${'reread/trunc'.padEnd(13)} file`);
    for (const r of fileRows) {
      console.log(`    ${pct(r.reread_rate).padEnd(7)} ${(r.reread + '/' + r.truncated).padEnd(13)} ${r.file}`);
    }
  } else {
    console.log('  No files with ≥2 truncations yet.');
  }
  console.log('─'.repeat(70));
  console.log('Tuning suggestions:');
  if (rereadRate > 0.5) {
    console.log('  ⚠ Re-read rate >50%: timeline rarely satisfies. Consider raising MIN_OBS_FOR_TRUNCATION.');
  } else if (rereadRate < 0.15) {
    console.log('  ✓ Low re-read rate: gate threshold may be too conservative; consider lowering it.');
  } else {
    console.log('  Gate behavior is in a reasonable range.');
  }
  console.log('');
}
