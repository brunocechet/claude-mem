# claude-mem — Improvements Design

Design doc handed off from a prior session. Addresses 9 specific cons identified during a plugin review against the installed cache (v12.1.6) and the working repo (v12.3.9). Item #7 (AGPL license) is out of scope.

## Context

- Repo: `/Users/bcechet/projects/personal/claude-mem` (v12.3.9)
- Installed cache reviewed: `~/.claude/plugins/cache/thedotmack/claude-mem/12.1.6/`
- Hooks config: `plugin/hooks/hooks.json`
- Server: binds `127.0.0.1` by default (`src/shared/SettingsDefaultsManager.ts:95`), `requireLocalhost` middleware applies to admin endpoints only (`src/services/server/Server.ts:236-289`).
- Supervisor exists: `src/supervisor/`.
- SQLite-backed store: `src/services/sqlite/`.
- Context rendering: `src/services/context/ContextBuilder.ts`, `ObservationCompiler.ts`, `TokenCalculator.ts`.

## Requirements

Keep the plugin's value (cross-session recall, structured observations, AST-aware search) while making it:
- **Cheaper** — fewer tokens per session, fewer hook invocations per turn.
- **Safer** — no ambient-authority local HTTP server, no unsanctioned writers.
- **Less intrusive** — SessionStart not a ~500ms stall, PostToolUse not a per-tool-call hop.
- **More honest** — stale observations surface as stale, not as fact.

---

## Fixes

### #1 Heavy SessionStart (three chained hooks, 300s + 60s + 60s timeouts)

**Root cause.** `plugin/hooks/hooks.json` runs three commands serially: `smart-install.js`, worker-service start + 20-retry curl loop on `/health`, then context fetch. Each re-computes PATH and re-resolves plugin root. Smart-install runs on *every* session start even when nothing changed.

**Fix.**
- Collapse into one hook invoking `scripts/session-start.js`: fast-path check → start-if-needed → fetch context. One process, one PATH resolution, one health check.
- **Fast-path bail:** compute a digest of `(plugin version, node version, platform, package-lock hash)`. Skip install when unchanged (touch `.installed.stamp`).
- **Non-blocking context:** return `{"continue": true, "suppressOutput": true}` within ~200ms. Run context fetch async; let `UserPromptSubmit` pick up the rendered file.
- Add `--sync` opt-in for users who want context blocking.

**Targets:** `plugin/hooks/hooks.json`, new `plugin/scripts/session-start.js`, logic lifted from `plugin/scripts/smart-install.js`.

**Scope:** M. **Trade-off:** cold start loses "recent activity" on the first prompt. Acceptable default.

### #2 Always-on context injection (~7.5k tokens/session)

**Root cause.** `ContextBuilder.ts` + `ObservationCompiler.ts` build a fixed recency window every session. No query intent, no opt-in, no budget enforcement.

**Fix.**
- **Budget-driven renderer.** Add `CLAUDE_MEM_CONTEXT_BUDGET` (default 2k tokens). `TokenCalculator.ts` already measures — treat the budget as a hard cap.
- **Tiered injection.**
  - Tier 0 (default): ~10–15 most-recent session-level titles, no observation detail. ~500 tokens.
  - Tier 1 (on demand): `mem-search` / `get_observations` remain the way to pull detail.
  - Tier 2 (heuristic): if current working dir matches the session's repo and there are obs from the same branch in last 24h, include those. Otherwise skip.
- **Staleness decay:** drop obs older than N days from the default window (default 7, configurable).

**Targets:** `src/services/context/ContextBuilder.ts`, `ContextConfigLoader.ts`.

**Scope:** M. **Trade-off:** "forgets" more by default; users wanting the firehose raise the budget.

### #3 Unauthenticated HTTP on :37777

**Root cause.** Binds `127.0.0.1` (good), but no auth on data endpoints. Any local process — a malicious npm postinstall, a browser tab with a CORS misconfig, a rogue extension — can POST observations or read memory. `requireLocalhost` only gates admin endpoints.

**Fix.**
- **Per-install bearer token.** At `smart-install.js` time, generate a 256-bit token, write to `~/.claude-mem/auth.token` (mode 0600). Expose via env `CLAUDE_MEM_TOKEN`. Worker requires `Authorization: Bearer <token>` on all non-health endpoints.
- **CORS lockdown.** Already allows `http://localhost:*` and `http://127.0.0.1:*` (`src/services/worker/http/middleware.ts:31-34`). CORS alone doesn't stop non-browser callers — require the bearer.
- **Unix domain socket option.** Add `CLAUDE_MEM_WORKER_SOCKET=/path/to.sock` as an alternative to TCP. Supervisor already exists to manage lifecycle.
- **Origin pinning on SSE.** `SSEBroadcaster.ts` — require matching `Origin` header + token.

**Targets:** `src/services/worker/http/middleware.ts`, `src/services/server/Server.ts`, `plugin/scripts/smart-install.js`, UI at `src/ui/viewer/`.

**Scope:** M. **Trade-off:** every client (MCP server, hooks, viewer) needs the token. One-time setup friction.

### #4 `PostToolUse` on `*`

**Root cause.** `plugin/hooks/hooks.json` PostToolUse matcher is `*`, so every `Read`/`Grep`/`Bash` POSTs to the worker. Latency per tool call; failures propagate.

**Fix.**
- **Narrow the matcher** to state-changing tools: `Edit|Write|NotebookEdit|Bash|TodoWrite|Task`. Skip read-only orientation tools.
- **Client-side batching.** Buffer observations in-process; flush every N ms or on `Stop`/`SessionEnd`. One network call per turn instead of ~20.
- **Fire-and-forget with local outbox.** If the worker is down or slow, spool to `~/.claude-mem/outbox/` and drain on next health check. Today a worker failure affects the turn.

**Targets:** `plugin/hooks/hooks.json`, new `plugin/scripts/observation-client.js`.

**Scope:** S (matcher) + M (batching + outbox). **Trade-off:** observation latency drifts — a `Bash` at T=0 may not land until T=5s. Fine for cross-session recall.

### #5 Fat install footprint (hundreds of MB of tree-sitter natives)

**Root cause.** `node_modules` ships `tree-sitter` + `tree-sitter-{go,python,bash,sql,elixir,js,ts,...}` pre-built natives. `smart-explore` needs them. Most users touch 2–3 languages.

**Fix.**
- **Language packs, lazy-install.** Ship `smart-explore` core without any `tree-sitter-*` language. On first use, install the language pack on-demand (cache per-machine). 5–10x base-install reduction.
- **Grep fallback.** If tree-sitter isn't available, degrade to regex-based structural search (`Search.ts` already present). Beats hard-failing.
- **Prebuild-free option.** Ship a WASM build (`web-tree-sitter`) for users who don't want native modules. Slower parse, no `node-gyp`, no per-platform builds.

**Targets:** `src/services/smart-file-read/`, `package.json` dependencies (move to `optionalDependencies` + peer-install script).

**Scope:** L. **Trade-off:** first use of a new language costs a 3–10s download. Cache amortizes.

### #6 Smart-install runs twice per SessionStart

**Root cause.** `smart-install.js` appears in both the `Setup` block and the first `SessionStart` entry of `plugin/hooks/hooks.json`. Redundant.

**Fix.**
- Remove from `SessionStart` entirely. `Setup` handles install/upgrade; `SessionStart` shouldn't re-check deps.
- Combine with the stamp from #1: if the stamp is missing at `SessionStart`, fail fast with a message asking the user to run `claude-mem install`.

**Targets:** `plugin/hooks/hooks.json`.

**Scope:** S — one JSON edit. Good first PR.

**Trade-off:** manual installs that skip `Setup` fail loudly instead of self-healing. Acceptable with a clear error.

### #8 No visible eval / ranking story at ~9k+ obs/project

**Root cause.** `src/services/worker/search/` + `SearchManager.ts` do retrieval, but there's no CI-tracked retrieval quality. At scale, search quality *is* the product.

**Fix.**
- **Eval harness.** `evals/retrieval/` with a frozen corpus snapshot + 30–50 hand-labeled queries (each with "correct" obs IDs). Run in CI. Track MRR@10, recall@20.
- **Embedding reranker.** Likely FTS5 today (`src/services/sqlite/`). Add a local embedding model (`@xenova/transformers` all-MiniLM-L6-v2 — in-process, no server). Score `0.6 * bm25 + 0.4 * cosine`. On-disk ANN via `hnswlib-node`.
- **Time-decay boost.** Recent obs rank higher unless the query asks for history.
- **Per-project scoping.** When a query fires from a repo, bias toward obs tagged with that repo. Cuts cross-project noise.

**Targets:** new `evals/retrieval/`, extend `src/services/worker/search/`, add CI workflow.

**Scope:** L. **Trade-off:** embeddings add a ~100MB one-time model download and ~20ms/query. Gate behind a setting; worth it above a few thousand obs.

### #9 Staleness / no TTL / no verification

**Root cause.** An observation like "updated delete assertion to `FORBIDDEN`" is permanent truth in the store. Later code changes don't invalidate it. No TTL, no verification pass.

**Fix.**
- **Soft TTL by type.** In `shared/` types, assign retention profiles: `discovery`=30d, `bugfix`=90d, `decision`=indefinite, `session`=14d. Past TTL, obs stays searchable but gets down-ranked and hidden from default context.
- **Verification flag.** Add `verified_at: timestamp | null`. When Claude reads code during recall and it matches the obs, bump `verified_at`. When it doesn't, mark `stale: true` and surface in rendered context: `[STALE: file no longer contains X]`.
- **Auto-unverify on commit.** Optional `Stop` or post-commit hook: for obs referencing files in the diff, clear `verified_at`. Forces the next reader to re-check.
- **User-driven purge.** `claude-mem prune --older-than 90d --type discovery`. CLI already at `src/cli/`.

**Targets:** `src/services/sqlite/` schema migration, `src/cli/`, `ContextBuilder.ts` (render staleness).

**Scope:** M. **Trade-off:** verification adds work per recall. Up-weighting/down-weighting is cheap; the commit hook is optional.

---

## Rollout order

Group by leverage-per-effort:

**Wave 1 — quick wins, each a small PR.**
- #6 dedup smart-install — one JSON edit.
- #4a narrow PostToolUse matcher — one JSON edit + obs-type mapping in worker.
- #1 collapse SessionStart to one hook + stamp-based bail.

**Wave 2 — contained features.**
- #3 bearer-token auth + UDS option.
- #2 budget-driven context renderer with tiered injection.
- #9 TTL + verification flag (schema migration).

**Wave 3 — bigger bets.**
- #5 lazy language packs / WASM tree-sitter.
- #4b client-side batching + local outbox.
- #8 eval harness + embedding retrieval.

## What I'd revisit at scale

At 50k+ obs per project, SQLite FTS5 + HNSW still holds — but you'll want sharded DBs per project (not one global store) and a TTL-enforced compactor that collapses runs of related obs into summary obs (e.g. 40 `✅` commits in one PR → 1 "merged PR #733" obs). The "one line per obs" index format also breaks at 10k+ rows in the SessionStart block — paginate by recency, don't render the full index.

## First PR to pick up

**#6 (dedup smart-install).** One edit in `plugin/hooks/hooks.json` — remove `smart-install.js` from the `SessionStart` block, leave it in `Setup`. Smallest possible patch, immediate SessionStart latency win.
