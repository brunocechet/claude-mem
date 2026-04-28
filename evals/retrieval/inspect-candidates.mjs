#!/usr/bin/env node
/**
 * Helper for labeling fixtures: for each query in fixtures.json, fetch the top-K
 * candidate observations with their titles so a human can pick which IDs belong
 * in expected_ids. Prints a labeling-friendly view; does NOT modify fixtures.
 *
 *   node evals/retrieval/inspect-candidates.mjs [--top N]
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const topN = parseInt(args[args.indexOf('--top') + 1], 10) || 8;
const port = process.env.CLAUDE_MEM_PORT ?? '37777';
const host = `http://127.0.0.1:${port}`;

const tokenPath = join(homedir(), '.claude-mem', 'auth.token');
const token = process.env.CLAUDE_MEM_TOKEN?.trim()
  || (existsSync(tokenPath) ? readFileSync(tokenPath, 'utf-8').trim() : null);
const headers = { 'Content-Type': 'application/json' };
if (token) headers['Authorization'] = `Bearer ${token}`;

async function search(query, limit) {
  const url = `${host}/api/search/observations?query=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const data = await res.json();
  const text = (data.content ?? []).map(c => c.text ?? '').join('\n');
  const ids = [];
  for (const m of text.matchAll(/^\|\s*#(\d+)\s*\|/gm)) ids.push(Number(m[1]));
  return ids;
}

async function batchFetch(ids) {
  if (ids.length === 0) return [];
  const res = await fetch(`${host}/api/observations/batch`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ids })
  });
  if (!res.ok) throw new Error(`Batch fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

const fixtures = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf-8'));

for (const q of fixtures.queries) {
  const ids = await search(q.query, topN);
  const obs = await batchFetch(ids);
  const byId = new Map(obs.map(o => [o.id, o]));

  console.log(`\n[${q.id}] ${q.description}`);
  console.log(`  Query: "${q.query}"`);
  for (const id of ids) {
    const o = byId.get(id);
    const type = o?.type ?? '?';
    const title = (o?.title ?? '(missing)').slice(0, 110);
    console.log(`    #${id}  [${type}]  ${title}`);
  }
}
