#!/usr/bin/env node
/**
 * Retrieval quality eval harness.
 *
 * Modes:
 *   node run.mjs                        Run all fixtures, print MRR@10 + recall@20
 *   node run.mjs --capture              For each query, print top-20 IDs to help label fixtures
 *   node run.mjs --fixtures path/to.json  Use a custom fixtures file
 *   node run.mjs --port 37777           Override worker port (default: env CLAUDE_MEM_PORT or 37777)
 *   node run.mjs --token <tok>          Override auth token (default: reads ~/.claude-mem/auth.token)
 *
 * Metrics:
 *   MRR@K  — Mean Reciprocal Rank at K (quality of the first relevant result)
 *   R@K    — Recall at K (fraction of relevant results found in top K)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// --- Config ---

const args = process.argv.slice(2);
const captureMode = args.includes('--capture');

function flagValue(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const fixturesPath = flagValue('--fixtures') ?? new URL('./fixtures.json', import.meta.url).pathname;
const port = flagValue('--port') ?? process.env.CLAUDE_MEM_PORT ?? '37777';
const host = `http://127.0.0.1:${port}`;

function readToken() {
  const envToken = process.env.CLAUDE_MEM_TOKEN?.trim();
  if (envToken) return envToken;
  const tokenArg = flagValue('--token');
  if (tokenArg) return tokenArg;
  const defaultPath = join(homedir(), '.claude-mem', 'auth.token');
  if (existsSync(defaultPath)) return readFileSync(defaultPath, 'utf-8').trim() || null;
  return null;
}

// --- Search ---

async function search(query, limit = 20) {
  const token = readToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const url = `${host}/api/search/observations?query=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Search failed: ${res.status} ${await res.text()}`);
  const data = await res.json();

  // Endpoint returns MCP-style { content: [{ type: 'text', text: '...' }] } where
  // results are formatted as a markdown table. IDs appear in the first column as `#<id>`.
  // Order in the text reflects the ranking returned by the search backend.
  if (Array.isArray(data.content)) {
    const text = data.content.map(c => c.text ?? '').join('\n');
    const ids = [];
    for (const match of text.matchAll(/^\|\s*#(\d+)\s*\|/gm)) {
      ids.push(Number(match[1]));
    }
    return ids;
  }
  // Defensive fallback for any future structured response shape
  return (data.results ?? data.observations ?? []).map(r => r.id ?? r.observation_id);
}

// --- Metrics ---

function mrr(rankedIds, expectedIds, k) {
  const expected = new Set(expectedIds);
  for (let i = 0; i < Math.min(rankedIds.length, k); i++) {
    if (expected.has(rankedIds[i])) return 1 / (i + 1);
  }
  return 0;
}

function recall(rankedIds, expectedIds, k) {
  if (expectedIds.length === 0) return null;
  const expected = new Set(expectedIds);
  const found = rankedIds.slice(0, k).filter(id => expected.has(id)).length;
  return found / expectedIds.length;
}

// --- Main ---

async function main() {
  const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf-8'));
  const queries = fixtures.queries ?? [];

  if (queries.length === 0) {
    console.error('No queries in fixtures file');
    process.exit(1);
  }

  // Health check
  try {
    const token = readToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${host}/api/health`, { headers });
    if (!res.ok) throw new Error(`Status ${res.status}`);
  } catch (err) {
    console.error(`Worker not reachable at ${host}: ${err.message}`);
    process.exit(1);
  }

  if (captureMode) {
    console.log(`Capture mode — showing top-20 IDs for each query to help label fixtures.\n`);
    for (const q of queries) {
      console.log(`\n[${q.id}] ${q.description}`);
      console.log(`  Query: "${q.query}"`);
      try {
        const ids = await search(q.query, 20);
        console.log(`  Top-20 IDs: ${ids.join(', ') || '(none)'}`);
      } catch (err) {
        console.log(`  Error: ${err.message}`);
      }
    }
    console.log('\nAdd the relevant IDs to fixtures.json expected_ids arrays, then run without --capture.');
    return;
  }

  // Eval mode
  const MRR_K = 10;
  const RECALL_K = 20;

  let totalMrr = 0;
  let recallSum = 0;
  let recallCount = 0;
  const rows = [];

  for (const q of queries) {
    let ids = [];
    let err = null;
    try {
      ids = await search(q.query, RECALL_K);
    } catch (e) {
      err = e.message;
    }

    const m = err ? 0 : mrr(ids, q.expected_ids, MRR_K);
    const r = err ? null : recall(ids, q.expected_ids, RECALL_K);

    totalMrr += m;
    if (r !== null) { recallSum += r; recallCount++; }

    const unlabeled = q.expected_ids.length === 0;
    rows.push({ id: q.id, query: q.query, mrr: m, recall: r, unlabeled, err });
  }

  const labeled = rows.filter(r => !r.unlabeled);
  const meanMrr = labeled.length > 0 ? labeled.reduce((s, r) => s + r.mrr, 0) / labeled.length : null;
  const meanRecall = recallCount > 0 ? recallSum / recallCount : null;

  console.log(`\nRetrieval Eval Results`);
  console.log(`${'─'.repeat(70)}`);
  console.log(`  Queries:   ${queries.length} total, ${labeled.length} labeled`);
  console.log(`  MRR@${MRR_K}:    ${meanMrr !== null ? meanMrr.toFixed(4) : 'n/a (no labeled queries)'}`);
  console.log(`  Recall@${RECALL_K}: ${meanRecall !== null ? meanRecall.toFixed(4) : 'n/a (no labeled queries)'}`);
  console.log(`${'─'.repeat(70)}`);

  for (const r of rows) {
    const label = r.unlabeled ? ' [unlabeled]' : '';
    const mrrStr = r.err ? `ERR: ${r.err}` : `MRR=${r.mrr.toFixed(3)} R@${RECALL_K}=${r.recall !== null ? r.recall.toFixed(3) : 'n/a'}`;
    console.log(`  ${r.id}${label}: ${mrrStr}`);
  }

  console.log('');

  if (labeled.length === 0) {
    console.log('No labeled queries yet. Run with --capture to discover IDs, then update fixtures.json.');
    process.exit(0);
  }

  // Exit with non-zero if MRR drops below 0.3 (useful for CI gating)
  const MRR_THRESHOLD = parseFloat(process.env.EVAL_MRR_THRESHOLD ?? '0.3');
  if (meanMrr !== null && meanMrr < MRR_THRESHOLD) {
    console.error(`MRR@${MRR_K} ${meanMrr.toFixed(4)} below threshold ${MRR_THRESHOLD} — failing`);
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
