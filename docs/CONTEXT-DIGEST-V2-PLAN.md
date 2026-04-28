# Context Digest v2 — Implementation Plan

**Goal:** Make the SessionStart context injection *worth* its tokens by restructuring what goes in it, not by shrinking it. Keep the existing pipeline shape — extend, don't rewrite.

**Scope:** Items #5, #1, #4, Bonus, #2 from the digest critique:

| # | Change |
|---|---|
| #5 | Live git/working-tree state header |
| #1 | Type-weighted ranking (decisions > bugfixes > discoveries) |
| #4 | Surface blockers / TODOs / open decisions |
| Bonus | Drop legend, column key, trust-this-index sentence, collapse economics block |
| #2 | Cluster observations by subject, not file path |

**Non-goals (this plan):**
- Schema changes (migration columns) — items #8, #9 are deferred to a v3 plan.
- Activity-driven sizing (#10) — drops out naturally if v2 quality is good.
- Outcome linkage (#8) — needs schema; deferred.
- Stronger dedup via embeddings (#7) — deferred.

---

## Architecture: extend, don't rewrite

The existing pipeline is sound. Three pluggable layers:

```
┌────────────────────────────────────────────────────────────┐
│ ContextBuilder (orchestrator)                              │
│                                                            │
│  loadContextConfig ──► query DB ──► compile ──► render     │
│       │                  │             │          │        │
│       ▼                  ▼             ▼          ▼        │
│  ContextConfig    queryObservations  *new*    AgentFormatter│
│                   querySummaries    *new*    HumanFormatter │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Insertion points (all additive, no breaking changes):**

1. `ContextConfigLoader` — read 4 new settings (defaults preserve current behavior).
2. `ObservationCompiler` — add 3 pure-function compile passes after query, before render.
3. `sections/` — add 2 new renderers (`StateRenderer`, `BlockersRenderer`).
4. `sections/TimelineRenderer` — minor modifications to consume clustered + ranked input.
5. `formatters/AgentFormatter` — drop boilerplate, render new sections.

No file gets rewritten. Each new piece can be A/B'd via setting flags.

---

## Phased rollout

Each phase ships independently. Each has settings flags so the user can roll back per-feature without touching code.

| Phase | Items | Files touched | Estimated effort | Ships behind flag |
|---|---|---|---|---|
| 1 | Bonus (boilerplate cuts) + helper utilities | 2 | ~1 hr | `CLAUDE_MEM_CONTEXT_VERBOSE` (default `false`) |
| 2 | #5 git state + #1 type ranking | 4 | ~3 hrs | `CLAUDE_MEM_CONTEXT_STATE_HEADER`, `CLAUDE_MEM_CONTEXT_PRIORITY_RANKING` |
| 3 | #4 blockers + #2 subject clustering | 5 | ~6 hrs | `CLAUDE_MEM_CONTEXT_BLOCKERS_SECTION`, `CLAUDE_MEM_CONTEXT_SUBJECT_CLUSTERING` |

Total: ~10 hours of focused work, shippable in 3 PRs.

---

## Phase 1 — Boilerplate cuts + helpers (~1 hr)

### 1.1 Drop boilerplate from `AgentFormatter.ts`

Remove four blocks that print every session regardless of project:
- Legend (`Legend: session-request | 🔴 bugfix | …`) — agent learns once, in CLAUDE.md.
- Column Key (`Read: Tokens to read… Work: Tokens spent…`) — never referenced.
- "Context Index" + "Trust this index over re-reading code" preamble — gentle nudge, expensive cumulatively.
- Collapse `Context Economics` 4-line block to a single line: `📊 20 obs · 99% recall savings`.

**Settings:** add `CLAUDE_MEM_CONTEXT_VERBOSE` (default `false`). When `true`, render the old boilerplate (rollback path).

**Tokens saved per injection:** ~150.

### 1.2 New helper: `src/services/context/utils/extractActionableText.ts`

Pure function used by Phase 3. Scans an observation's narrative + facts for actionable signals:

```ts
export interface ActionableSignal {
  kind: 'todo' | 'fixme' | 'blocker' | 'decision_needed' | 'unresolved_question';
  text: string;
  observationId: number;
}

export function extractActionableSignals(obs: Observation): ActionableSignal[]
```

Patterns (case-insensitive, anchored to start of sentence/line):
- `\bTODO\b[:\s]+(.{10,200})`
- `\bFIXME\b[:\s]+(.{10,200})`
- `\bblocked by\b\s+(.{10,200})`
- `\bdecide whether\b\s+(.{10,200})`
- `\bstill\s+(?:need|missing|unresolved)\b\s+(.{10,200})`
- `\bopen question\b[:\s]+(.{10,200})`

Return empty array when nothing matches. Used by both #4 (renderer) and future telemetry.

**Tests:** unit tests with positive + negative samples per kind.

### 1.3 New helper: `src/services/context/utils/normalizeSubject.ts`

Pure function used by Phase 3. Extract a subject token from an observation title for clustering:

```ts
export function normalizeSubject(title: string, filesModified: string[]): string
```

Rules (in order):
1. If `files_modified` has exactly one path, use the filename without extension as the subject hint.
2. Strip leading "code references to", "discovery of", "test setup for", etc.
3. Lowercase + collapse whitespace.
4. Take first 60 chars after stripping.

Used by `SubjectClusterer` in Phase 3.

**Tests:** golden tests pinning the canonical form for representative titles.

---

## Phase 2 — State header + type ranking (~3 hrs)

### 2.1 New section: `src/services/context/sections/StateRenderer.ts`

Renders the live git state at the top of the digest:

```
📍 ana-v2 · m-004/pr04b-bundle · 12 dirty · 3 ahead/0 behind main
   Last commit (2h ago): feat(audit): emit W2 bundle for audit_log
```

**Implementation:**
- Pure function `renderStateHeader(cwd: string): string | null`. Returns `null` if not a git repo (graceful no-op).
- Use `child_process.execFileSync('git', [...], { cwd, timeout: 500 })` — bounded wall-clock so a slow git never blocks the hook.
- Three commands:
  - `git rev-parse --abbrev-ref HEAD` → branch name.
  - `git status --porcelain` → count dirty files (`wc -l`-like).
  - `git rev-list --left-right --count main...HEAD` → ahead/behind count.
  - `git log -1 --format=%cr|%s` → relative time + subject of last commit.
- Failures (no git, no main branch, detached HEAD, etc.): return `null` and log debug. Never throw.

**Multi-project handling:** `ContextInput` already supports `allProjects[]` for parent + worktree merging. Render one state line per project that has a git dir; collapse to one line for the primary project.

**Settings:** `CLAUDE_MEM_CONTEXT_STATE_HEADER` (default `true`). When `false`, section omitted entirely.

**Tests:**
- Mock `execFileSync` to return canned outputs for: clean repo, dirty repo, ahead-only, ahead+behind, detached HEAD, missing main branch.
- Integration test: spawn a temp git repo, render state, verify expected lines.

**Wire into `ContextBuilder.buildContextOutput`:** prepend before `renderHeader`.

### 2.2 Type-weighted ranking pass

New pure function in `ObservationCompiler.ts`:

```ts
export function rankByPriority(observations: Observation[]): Observation[]
```

Score each observation by:
```
score = TYPE_WEIGHT[type] * recencyDecay(age_days)
```

Constants:
```ts
const TYPE_WEIGHT: Record<string, number> = {
  decision: 10,
  security_alert: 9,
  bugfix: 8,
  feature: 6,
  change: 4,
  refactor: 4,
  security_note: 3,
  discovery: 1,
};

function recencyDecay(ageDays: number): number {
  // Half-life: 7 days. obs from today scores 1.0; from 7d ago scores 0.5; from 14d ago scores 0.25.
  return Math.pow(0.5, ageDays / 7);
}
```

Sorted descending by score, then by `created_at_epoch` descending as tiebreaker. **Stable sort.**

Apply in `ContextBuilder.buildContextOutput` between `queryObservations` and any clustering/rendering.

**Settings:** `CLAUDE_MEM_CONTEXT_PRIORITY_RANKING` (default `true`). When `false`, falls back to current chronological ordering.

**Tests:**
- Unit: 6 obs across all type weights with mixed ages → assert exact order.
- Property: shuffling input must not change output (stable sort behavior).
- Edge: unknown type id → `discovery` weight (lowest).

### 2.3 Wire into pipeline

`ContextBuilder.buildContextOutput`:

```diff
  const observations = await queryObservations(...);
+ const stateHeader = config.showStateHeader
+   ? renderStateHeader(input.cwd)
+   : null;
+ const rankedObservations = config.priorityRanking
+   ? rankByPriority(observations)
+   : observations;
  const summaries = await querySummaries(...);
- const timeline = buildTimeline(observations, summaries);
+ const timeline = buildTimeline(rankedObservations, summaries);
```

`AgentFormatter`:
```diff
+ if (stateHeader) lines.push(stateHeader, '');
  lines.push(renderHeader(...));
```

---

## Phase 3 — Blockers + subject clustering (~6 hrs)

### 3.1 New section: `src/services/context/sections/BlockersRenderer.ts`

```ts
export function renderBlockersSection(
  observations: Observation[],
  config: ContextConfig
): string | null
```

**Algorithm:**
1. For each observation, run `extractActionableSignals(obs)` from Phase 1.2.
2. Aggregate all signals across all observations.
3. De-duplicate by similar text (case-insensitive substring or Jaccard ≥ 0.7).
4. Limit to `config.maxBlockers` (default 5).
5. If empty → return `null`.

**Output shape:**
```
🚧 Pending decisions / blockers
  - Track B CI enforcement brittleness (#22661 · 6:53 PM)
  - Missing test cases for validation edge scenarios (#22659 · 6:53 PM)
  - decide whether: Lazy SQL init via class vs. closure (#22663 · 6:53 PM)
```

Each line: signal text + ID + relative timestamp. Truncate signal text at 100 chars.

**Settings:**
- `CLAUDE_MEM_CONTEXT_BLOCKERS_SECTION` (default `true`).
- `CLAUDE_MEM_CONTEXT_BLOCKERS_MAX` (default `5`).

**Tests:**
- Synthetic obs with 3 TODOs, 2 FIXMEs, 1 blocker → expected ordered output.
- Obs with no signals → returns `null`.
- More signals than `max` → truncated, count footnote (`+ 4 more`).
- Substring dedup: "TODO: write test" + "todo: WRITE test" → 1 item.

**Wire in:** between `StateRenderer` and `HeaderRenderer` so the agent sees blockers immediately after the state line.

### 3.2 Subject clustering

New pure function in `ObservationCompiler.ts`:

```ts
export interface ObservationCluster {
  subject: string;        // normalized subject (from normalizeSubject)
  observations: Observation[];
  topByPriority: Observation; // highest-scored obs in cluster
  count: number;
  lastTouched: number;    // max created_at_epoch
}

export function clusterBySubject(observations: Observation[]): ObservationCluster[]
```

**Algorithm:**
1. For each obs, compute `normalizeSubject(title, files_modified)` → cluster key.
2. Group by key.
3. Within each cluster, sort by priority score descending (Phase 2.2).
4. `topByPriority` is the first obs in sorted order.
5. Return clusters sorted by `max(score-of-top-obs)` descending → most-important-cluster first.

**Settings:** `CLAUDE_MEM_CONTEXT_SUBJECT_CLUSTERING` (default `true`). When `false`, fall back to flat per-day grouping.

**Tests:**
- 3 obs all on `access-token-hook` index.ts → 1 cluster, count=3.
- Mixed obs across 3 files → 3 clusters.
- Singleton clusters preserved (no min-cluster-size threshold; rendering decides).

### 3.3 Modify `TimelineRenderer.ts`

Render either flat (current) or clustered (new) based on config:

**Clustered output:**
```
🟣 access-token-hook (13 obs · last 6:53 PM)
  ⚖️  #22663  Lazy SQL init via DI (decided pattern)
        +3 supporting discoveries: lazy memoization soundness, init rationale, …
  🔵  #22674  README clarifies purpose, contract, failure modes
        Full narrative: <truncated body>

🔵 m4-pr04b/audit_log (3 obs · last 5:31 PM)
  ⚖️  #22660  Silent failure detection and Deno idioms
  🔵  #22656  Ajv schema validation for dependencies
        +1 supporting
```

Within each cluster:
- Show `topByPriority` with its full title + ID + emoji.
- If `count > 1`, render `+N supporting` line summarizing the rest. Optionally include up to 3 supporting titles in a compact comma-separated list.
- If the obs is the "full" observation per `CLAUDE_MEM_CONTEXT_FULL_COUNT`, render its narrative under a 2-space indent.

**Implementation:**
- `renderTimeline(clusters: ObservationCluster[], summaries: SessionSummary[], config): string`
- Cluster header: `${typeEmoji(top.type)} ${top.subject ?? top.title} (${count} obs · last ${relativeTime(lastTouched)})`
- Iterate clusters in input order (already priority-sorted).

**Tests:**
- Single cluster, single obs → renders as before (no "+N supporting" line).
- Cluster of 5 obs → renders top + "+4 supporting".
- Cluster mixing types (1 decision, 4 discoveries) → header shows ⚖️ (decision wins).

### 3.4 Wire into pipeline

`ContextBuilder.buildContextOutput`:
```diff
- const timeline = buildTimeline(rankedObservations, summaries);
+ const clusters = config.subjectClustering
+   ? clusterBySubject(rankedObservations)
+   : null;
+ const blockersSection = config.blockersSection
+   ? renderBlockersSection(rankedObservations, config)
+   : null;
+ const timeline = clusters
+   ? renderClusteredTimeline(clusters, summaries, config)
+   : buildTimeline(rankedObservations, summaries);
```

---

## Settings summary (added by this plan)

```jsonc
{
  // Phase 1
  "CLAUDE_MEM_CONTEXT_VERBOSE": "false",                 // restore boilerplate

  // Phase 2
  "CLAUDE_MEM_CONTEXT_STATE_HEADER": "true",             // git state line
  "CLAUDE_MEM_CONTEXT_PRIORITY_RANKING": "true",         // type×recency sort

  // Phase 3
  "CLAUDE_MEM_CONTEXT_BLOCKERS_SECTION": "true",         // 🚧 section
  "CLAUDE_MEM_CONTEXT_BLOCKERS_MAX": "5",
  "CLAUDE_MEM_CONTEXT_SUBJECT_CLUSTERING": "true"        // group by subject vs flat
}
```

All defaults adopt the new behavior. Setting any to `false`/old-value reverts to current shape per-feature. The existing knobs (`CLAUDE_MEM_CONTEXT_OBSERVATIONS`, `_FULL_COUNT`, `_SESSION_COUNT`, `_BUDGET`, `_STALENESS_DAYS`) are unchanged.

---

## What the digest looks like after all 5 changes

**Before (current, ana-v2 example):**
```
[ana-v2] recent context, 2026-04-27 10:33pm GMT-3
────────────────────────────
Legend: session-request | 🔴 bugfix | 🟣 feature | …
Column Key
  Read: Tokens to read this observation
  Work: Tokens spent on work that produced this record
Context Index: This semantic index (titles, types, files, tokens) is …
When you need implementation details, rationale, or debugging context:
  - Fetch by ID …
  - Search history …
  - Trust this index over re-reading code …

Context Economics
  Loading: 20 observations (6,324 tokens to read)
  Work investment: 489,675 tokens spent on research, building, and decisions
  Your savings: 99% reduction from reuse

Apr 27, 2026
#S337 Summarize progress on W2 bundle for audit_log and platform_flags
#S338 Update worktree with W2/PR04B changes and review findings
#S339 Summarize progress on W3B (database tests) and readiness for W3A
#S340 Summarize progress on the access-token hook implementation
#S341 Session Resume and Context Decision

supabase/functions/access-token-hook/index.ts
  #22644  6:29 PM  🔵  Code References to `profiles` table and related fields
  #22654           🔵  Lazy getSql() memoization soundness in Deno Edge Functions
  #22662           🔄  Golden serialization test for access-token hook
  ... (17 more)

Access 490k tokens of past research & decisions for just 6,324t.
```
~3,046 chars / ~760 tokens. Top of digest is 200+ chars of boilerplate.

**After:**
```
📍 ana-v2 · m-004/pr04b-bundle · 12 dirty · 3 ahead/0 behind main
   Last commit (2h ago): feat(audit): emit W2 bundle for audit_log

🚧 Pending decisions / blockers
  - Track B CI enforcement brittleness (#22661 · 6:53 PM)
  - Missing test cases for validation edge scenarios (#22659 · 6:53 PM)
  - decide whether: Lazy SQL init via class vs. closure (#22663 · 6:53 PM)

[ana-v2] recent context, 2026-04-27 10:33pm

📊 20 obs · 99% recall savings · use mem-search for deeper history

🟣 access-token-hook (13 obs · last 6:53 PM)
  🔄  #22663  Lazy SQL init via DI (decided pattern)
        + 3 supporting: memoization soundness, init rationale, PG client init
  🟣  #22664  Golden serialization tests for access-token hook
  🔵  #22674  README clarifies purpose, contract, failure modes
        <full narrative>

⚖️ session: w3-w4-bundle-decisions (5 obs · 2:29-5:31 PM)
  S341  Session Resume and Context Decision (5:31 PM)
        Decided: Track B PR 04B continues on m-004/pr04b-bundle.
        Next:    W6 staged migration runbook (docs/runbooks/w6-pr04b-integration.md)
        Blocked: none

🔵 m4-pr04b/schema (3 obs · last 5:31 PM)
  ⚖️  #22660  Silent failure detection and Deno idioms
  🔵  #22656  Ajv schema validation for dependencies
        + 1 supporting
```
~1,800 chars / ~450 tokens. Top of digest is the actionable `where am I`.

**Net: −300 tokens AND every remaining token earns its place.** The agent now sees:
1. Where it is (branch, dirty count, last commit) — line 1.
2. What's blocked / pending decisions — section 2.
3. Recent work clustered by subject with priority winners surfaced.
4. Sessions converted from "what got summarized" to "what was decided / what's next".

---

## Test strategy

Each pure function gets unit tests. Integration test: run a fixture project through the full pipeline and golden-match the output.

**New test files:**
- `tests/services/context/utils/extractActionableSignals.test.ts`
- `tests/services/context/utils/normalizeSubject.test.ts`
- `tests/services/context/sections/StateRenderer.test.ts` (mock `execFileSync`)
- `tests/services/context/sections/BlockersRenderer.test.ts`
- `tests/services/context/ObservationCompiler.rankByPriority.test.ts`
- `tests/services/context/ObservationCompiler.clusterBySubject.test.ts`
- `tests/services/context/integration/ContextBuilder.v2-shape.test.ts` (golden output)

**Regression coverage:** existing context tests must pass with all new flags off (verifies backwards compatibility).

---

## Rollout & rollback

**Per-phase rollout:**
1. Phase 1 lands → users see boilerplate cuts immediately. Set `CLAUDE_MEM_CONTEXT_VERBOSE=true` to revert.
2. Phase 2 lands → state header + ranking. Either flag false reverts.
3. Phase 3 lands → blockers + clustering. Either flag false reverts.

**Failure modes & graceful degradation:**
- Git not installed / not a repo → state header omitted (returns `null`).
- Subject normalization fails → falls back to title-as-subject.
- Blocker scan misfires → renders empty, doesn't break digest.
- Clustering fails → falls back to flat rendering.

Every new code path has the existing path as a fallback. No new failure mode can take down the digest.

---

## Out of scope (future work)

- **#9 auto-stale via cron** — needs worker scheduling + git introspection. Schema already has `stale` column; this is the write-path companion. Plan separately.
- **#8 outcome linkage** — `resolves_observation_id` migration + parser changes. Schema work.
- **#7 stronger dedup** — title-similarity via embeddings. Needs Chroma integration changes.
- **#10 activity-driven sizing** — natural follow-on once v2 is in, since clustering already groups well.

---

## Build order summary

```
Phase 1 (1 hr)
├── 1.1 AgentFormatter: drop boilerplate    [1 file]
├── 1.2 utils/extractActionableSignals.ts  [new]
└── 1.3 utils/normalizeSubject.ts          [new]
Phase 2 (3 hrs)
├── 2.1 sections/StateRenderer.ts          [new]
├── 2.2 ObservationCompiler.rankByPriority [extend]
├── 2.3 ContextConfigLoader: 2 settings    [extend]
└── 2.4 ContextBuilder + AgentFormatter wiring
Phase 3 (6 hrs)
├── 3.1 sections/BlockersRenderer.ts       [new]
├── 3.2 ObservationCompiler.clusterBySubject [extend]
├── 3.3 sections/TimelineRenderer: clustered render path [extend]
└── 3.4 ContextBuilder wiring + 3 settings
```

3 PRs, ~10 hours total, fully reversible per-feature via settings.
