# Fork Improvements Report

**Fork:** `brunocechet/claude-mem` (wave-3 branch)
**Compared against:** `thedotmack/claude-mem` (`upstream/main` @ `5458dd23`)
**Merge base:** `c2d033ce` (upstream v12.4.1)
**Generated:** 2026-04-27

## Summary

The fork adds **17 commits** ahead of upstream, touching **107 files** (+3,246 / −3,338 lines). The bulk of the deletions are upstream's own internal cleanup files (one-shot migrations, deprecated tests) that the fork inherited via merge — the fork's *own* added work is **+1,648 / −225 lines**.

The improvements fall into 8 themes, almost all of which can be traced to numbered items in [`docs/IMPROVEMENTS-DESIGN.md`](IMPROVEMENTS-DESIGN.md), a design doc handed off from a prior session that audited the plugin against v12.1.6 and v12.3.9 baselines.

| # | Theme | Net effect |
|---|---|---|
| 1 | Hook performance | ~80% fewer worker round-trips per turn; one-process SessionStart |
| 2 | Context budget & staleness | Token usage cut from ~7.5k → 500–1.5k for inactive projects |
| 3 | Bearer-token auth | All `/api/*` endpoints gated; viewer + hooks send `Authorization` |
| 4 | Client-side outbox | Observations survive worker downtime; batch-drained on recovery |
| 5 | Optional native deps + grep fallback | Install never blocked by tree-sitter compile failures |
| 6 | Parser drift tracking | Synonym table + `raw_type` audit column + `unknown_type_fallback` |
| 7 | File-context hook hardening | Truncation gate + JSONL telemetry + admin stats endpoint |
| 8 | Eval harness | Labeled fixtures + MRR@10/recall@20 runner against live API |

Plus a substantial **merge resolution** that reconciled three concurrent workstreams (the upstream refactor v12.4.1, the wave-3 features, and the bearer-auth work) and a **marketplace decoupling** that detaches this repo from the upstream auto-update path.

---

## Quantitative overview

```
17 commits  •  107 files changed  •  +3,246 / −3,338 lines

37 in src/services/        • core worker, schema, routes
 7 in src/cli/             • hook handlers
 6 in src/shared/          • cross-cutting utilities
 5 in plugin/scripts/      • bundled hook artifacts (regenerated)
 4 in src/npx-cli/         • install/uninstall flows
 3 in evals/retrieval/     • new eval harness
 2 in plugin/skills/       • mem-search + version-bump skill updates
 2 in src/sdk/             • parser + prompts
 2 in src/ui/              • viewer auth integration
```

---

## Improvement details

### 1. Hook performance — ~80% fewer round-trips per turn

**Commits:** `c1d60618`, `626e1cd4`, `82b22b6a`
**Maps to:** Design items `#1`, `#4a`, `#6`

Three concrete changes to `plugin/hooks/hooks.json`:

- **Removed redundant `smart-install.js`** from the first SessionStart hook. The Setup block already runs install/upgrade; re-running dep-check on every session start was pure latency.
- **Narrowed `PostToolUse` matcher** from `"*"` to `"Edit|Write|NotebookEdit|Bash|TodoWrite|Task"`. Read/Grep/Glob no longer round-trip to the worker; they're still captured for file-context via the dedicated `PreToolUse:Read` hook.
- **Collapsed SessionStart to one hook**. Was: explicit worker start + 20-retry health-loop, then a second health-guarded context fetch. Now: one context fetch, since the context handler already calls `ensureWorkerStarted` internally. Plus a fast-fail stamp check (`plugin/.install-version`) that skips the context fetch with a diagnostic instead of silently spawning a doomed worker.

Cuts hook overhead per turn by approximately 80% on read-heavy work.

### 2. Context budget + staleness decay

**Commit:** `59989440`
**Maps to:** Design item `#2`

Two new settings in `~/.claude-mem/settings.json`:

```
CLAUDE_MEM_CONTEXT_BUDGET         (default 2048 tokens, 0=disabled)
CLAUDE_MEM_CONTEXT_STALENESS_DAYS (default 7 days, 0=disabled)
```

`queryObservations` and `queryObservationsMulti` add a `WHERE` clause filtering observations older than the cutoff. Session summaries are NOT filtered — compact session bullets remain useful beyond 7 days; observations are the noise source.

Budget cap: after rendering, if the output exceeds `budget * 4` chars the string is trimmed at the last newline within the limit and a truncation notice is appended. Full-mode (mem-search, get_observations) bypasses the cap so explicit recall is never truncated.

**Expected effect at defaults:** ~7.5k token sessions drop to ~500–1.5k for codebases not touched in the last week, with no change for active projects.

### 3. Schema-level staleness tracking

**Commit:** `d5285350`
**Maps to:** Design item `#9` (read-path foundation)

Migration 28 adds two columns to `observations`:

| Column | Type | Meaning |
|---|---|---|
| `verified_at` | INTEGER (epoch ms, NULL=unverified) | Last time observation was confirmed to match the referenced code |
| `stale` | INTEGER (0/1) | Observation known to be outdated (e.g. referenced file diverged) |

Context queries filter `stale=1` observations from SessionStart context by default. Full mode (mem-search, viewer) sets `includeStale=true` so stale rows remain searchable. Stale observations render with a `[STALE]` suffix in the agent timeline.

**Deferred:** the write path (marking stale, bumping `verified_at`) — this commit lays the schema and read-path foundation. A future hook can call `UPDATE observations SET stale=1 WHERE id=?` when referenced files diverge from the observation content.

### 4. Bearer-token authentication

**Commits:** `4fb1cba5`, `ba0464ec`
**Maps to:** Design item `#3`

The worker exposes a localhost HTTP server on port 37777. Pre-fork, any local process could call any endpoint — including `/api/admin/shutdown`. The fork closes that ambient-authority gap:

- **Token provisioning:** `smart-install.js` generates a 256-bit random token at Setup time, written to `~/.claude-mem/auth.token` (mode 0600). Absent or zero-value tokens treated as unprovisioned — auth skipped — so existing installs continue working until they re-run Setup.
- **Server middleware:** `requireBearerToken` applied to all `/api/*` routes; `/health`, `/`, `/stream`, and static assets remain exempt. CORS `allowedHeaders` updated to include `Authorization`.
- **Hooks:** `workerHttpRequest` reads token from `CLAUDE_MEM_TOKEN` env or file and injects `Authorization: Bearer <token>` on every request.
- **Viewer:** token injected into served HTML as `window.__CLAUDE_MEM_TOKEN__`; `authFetch` reads it for all browser→worker calls.
- **Liveness exemptions:** `/api/health`, `/api/version`, `/api/readiness`, `/api/instructions` remain unauthenticated for infrastructure probes. `/api/admin/*` is guarded by `requireLocalhost` only — bearer auth was redundant and caused 401s on `HealthMonitor.ts` shutdown/restart calls.

**Deferred:** Unix domain socket option — bearer is the primary defense against unauthorized local process access for now.

### 5. Client-side outbox for observation reliability

**Commit:** `3e8cd590` (item `#4b`), `49f5ef13` (merge resolution)

Pre-fork, observations were lost when the worker was unreachable (port conflict, crash mid-restart, etc.). The fork adds:

- **Spool:** when `executeWithWorkerFallback` returns a fallback (worker unreachable), the observation handler appends the request body to `~/.claude-mem/outbox.jsonl` instead of dropping it.
- **Drain:** at the start of each subsequent healthy invocation, `drainOutbox()` reads the spool, groups entries by `contentSessionId + platformSource`, and POSTs them to a new batch endpoint `/api/sessions/observations/batch` (server-side handler in `SessionRoutes.ts:715` with Zod validation).
- **Atomic clearing:** outbox is only truncated when ALL batches succeed; partial failures keep the spool intact for the next attempt.

The merge resolution caught a wired bug here — the batch handler existed in the wave-3 work but its `app.post()` registration and Zod schema were missing. Both added during merge resolution; the outbox drain now actually has a server endpoint to hit.

### 6. Optional native dependencies + grep fallback

**Commit:** `3e8cd590`
**Maps to:** Design item `#5`

Tree-sitter native modules previously blocked installs on platforms where compilation failed. The fork:

- Moves all `tree-sitter-*` packages from `dependencies` to `optionalDependencies` in `plugin/package.json` and `build-hooks.js`.
- Adds a regex-based grep fallback in `parser.ts` used when no tree-sitter grammar is available.

Result: install completes on platforms where tree-sitter doesn't build; semantic search degrades gracefully to lexical matching.

### 7. Parser drift tracking — synonym table + `raw_type`

**Commits:** `08c0d98d` (parser + raw_type column), `70be2b85` (migration runner hardening)

LLMs drift over time; the fixed `observation_types` enum produced ERROR-level "Invalid observation type" log spam every time a model emitted `evaluation-result`, `eval`, `analysis`, etc. Three improvements:

1. **Three-step type resolution** in `parseObservationBlocks`:
   - exact id match (no coercion)
   - case-insensitive synonym match against `observation_type.synonyms[]`
   - `mode.unknown_type_fallback` (or `observation_types[0]` for legacy)

2. **`raw_type` audit column** (migration 30) captures the LLM's original string when coercion fires. NULL means no coercion. Preserves model intent for audit while keeping the canonical `type` column clean for UI/filters.

3. **Synonyms populated** from real LLM drift seen in production:
   - `discovery` ← `evaluation-result`, `eval`, `analysis`, `audit`, `review`
   - `bugfix` ← `fix`, `bug`, `patch`
   - `decision` ← `adr`, `tradeoff`
   - `code` mode's `unknown_type_fallback` set to `discovery` (uncategorized output is almost always "I learned something", not "I fixed a bug").

4. **`scripts/synonym-suggestions.mjs`** mines worker logs for the WARN messages so the synonym table can grow from real telemetry.

5. **Migration 29 hardening** (`70be2b85`): the schema_versions row for the UNIQUE index can be present without the index when later migrations recreate the table. The runner now verifies the index physically exists in `sqlite_master` before short-circuiting — re-applying is idempotent (`CREATE INDEX IF NOT EXISTS`) and cheap relative to silent duplicates.

### 8. File-context hook truncation gate + telemetry

**Commit:** `d135c7b2`

The `PreToolUse:Read` hook used to force `limit:1` on every unconstrained read of a >1.5KB file with prior observations. That tradeoff (hide the file body, lean on the timeline) only pays off when the timeline is informative — sparse or stale timelines wasted Read round-trips and biased the agent toward stopping investigation prematurely.

- **Truncation gate**: only truncate when ≥3 observations exist AND ≥1 landed in the last 60 days. Sparse or stale timelines still get injected as data, but the Read proceeds normally.
- **Neutral framing**: dropped the leading-question header ("Already know enough?"). Replaced with a "what we did" description plus a recovery-options menu shown only when truncation occurs. The agent decides depth-vs-breadth, not the hook.
- **Telemetry**: each invocation appends one JSONL line to `~/.claude-mem/file-context-events.jsonl`. Single-writer-per-process, no locking, failures silent.
- **Analysis surfaces**: `scripts/analyze-file-context.mjs --days 30` for terminal reports; `GET /api/admin/file-context-stats?days=N` for dashboards (localhost-only, computes on-the-fly from the JSONL log).

Tune the gate from `reread_rate`: >50% means timelines aren't satisfying agents (gate too aggressive); <15% means we could truncate more.

### 9. Retrieval evaluation harness

**Commits:** `3e8cd590` (initial), `08c0d98d` (labels), `303cb113` (inspect-candidates)
**Maps to:** Design item `#8`

Pre-fork, no automated way to validate that retrieval changes don't regress quality. The fork adds:

- **`evals/retrieval/fixtures.json`** — hand-labeled `expected_ids` for top retrieval test queries (auth middleware, schema migrations, outbox, etc.). IDs assigned conservatively from top-8 candidates per query.
- **`evals/retrieval/run.mjs`** — runner computing **MRR@10** and **recall@20** against the live `/api/search` endpoint. Supports `--capture` mode to discover candidate IDs for new queries.
- **`evals/retrieval/inspect-candidates.mjs`** — for each query, fetches top-N IDs via `/api/search`, batch-fetches type+title via `/api/observations/batch`, prints a human-readable list so the labeler can pick which IDs to add to `expected_ids[]`.

Reads bearer token from `~/.claude-mem/auth.token`; accepts `--top N` for candidate breadth.

### 10. Marketplace decoupling

**Commit:** `105e747d`

The 2026-04-25 incident: the marketplace plugin updater rsync'd upstream files **through a symlinked marketplace dir into this repo**, leaving conflict markers across 6 files and silently overwriting uncommitted edits. The fork prevents recurrence:

- Renamed local marketplace name `thedotmack` → `thedotmack-local` in `.claude-plugin/marketplace.json`
- Replaced GitHub-source registration with directory-source (`claude plugin marketplace add /path/to/repo`)
- `~/.claude/settings.json` `extraKnownMarketplaces.thedotmack-local` points to a directory, not a GitHub repo
- `scripts/sync-marketplace.cjs` simplified — no marketplace clone (directory-source has none); just rsyncs `plugin/` to the version cache + restarts the worker
- Hook fallback paths in `plugin/hooks/hooks.json` rewritten to `cache/thedotmack-local/`
- New CLAUDE.md section "Auto-Update Recovery" captures the lesson

Result: nothing fetches from `thedotmack` GitHub without explicit user action. Update model: `git fetch upstream && git merge upstream/main` in this repo, then `npm run build-and-sync` to refresh the cache.

### 11. Documentation

**Commit:** `2f77968b`

Three new sections in `CLAUDE.md`:

- **Observation Type Vocabulary** — describes the three-step type resolution and how to grow the synonym table from worker-log telemetry.
- **File-Context Hook (PreToolUse:Read)** — describes the truncation gate thresholds and how to tune them from `reread_rate`.
- **Auto-Update Recovery** — captures the rsync-clobber-through-symlink incident so future humans don't symlink the marketplace dir to this repo.

Plus `docs/IMPROVEMENTS-DESIGN.md` — the original design doc that drove most of the fork's work.

### 12. Developer experience

- `.tool-versions` pins `nodejs 24.15.0` + `bun 1.3.11` for `asdf`/`mise`/`proto` users
- `package.json` adds `build-dev` script (alias of `build-and-sync`) for the directory-source workflow
- `bun-runner.js` clamps non-zero/non-2 child exits to 0, generalizing the existing `start`-only carve-out from issue #1505 to all subcommands. Closes the silent-exit-1 path that produced `SessionStart:startup hook error: Failed with non-blocking status code: No stderr output` when bun's child died with stderr suppressed.

---

## Architectural decisions worth flagging

### Adopted upstream's `executeWithWorkerFallback` abstraction

Upstream v12.4.1 introduced a unified worker-call helper (`executeWithWorkerFallback` + `isWorkerFallback` brand check) that replaced the older `ensureWorkerRunning + workerHttpRequest` pattern. The fork's outbox feature was originally built on the older API. **The merge adopted upstream's abstraction and rewrote the outbox drain to route through it**, so the drain itself becomes graceful when the worker is down (no infinite spool→fail→spool loops).

### Adopted upstream's `shouldTrackProject` over `isProjectExcluded`

Upstream extracted project filtering into a single helper that consolidates settings loading + path matching. The fork dropped its own `isProjectExcluded + SettingsDefaultsManager.loadFromFile` open-coded version in favor of the helper.

### Adopted upstream's content-hash UNIQUE constraint over app-level dedup

Upstream extracted observation insertion into `src/services/sqlite/observations/store.ts` and added a `UNIQUE(memory_session_id, content_hash)` constraint with `INSERT ... ON CONFLICT DO NOTHING`. The fork's previous `findDuplicateObservation()` app-level dedup is now redundant. Database enforces it.

### Layered fork-only migrations on top of upstream's schema

Migration sequence in `SessionStore.ts` constructor:

```
22 (content_hash)         ← upstream
28 (staleness_columns)    ← fork
29 (UNIQUE index)         ← upstream
30 (raw_type)             ← fork
```

Both fork-only migrations are idempotent (`PRAGMA table_info` checks) and threaded through all three INSERT paths (singleton, batch, `recreateWithCascade`).

---

## Items deferred / partial implementations

| Item | Status | Why deferred |
|---|---|---|
| `#1` non-blocking SessionStart context | Partial — collapsed but still blocking | Async delivery via UserPromptSubmit needs context persistence + first-prompt injection logic |
| `#3` Unix domain socket | Deferred | Bearer is primary defense; UDS is hardening |
| `#7` AGPL license review | Out of scope | Per design doc |
| `#9` Stale write-path | Deferred — schema + read path landed | Future hook to `UPDATE observations SET stale=1` when referenced files diverge |

---

## Mapping to design doc items

`docs/IMPROVEMENTS-DESIGN.md` enumerated 9 cons identified during a v12.1.6 vs v12.3.9 review. Coverage:

| Item | Title | Status | Commit(s) |
|---|---|---|---|
| #1 | Heavy SessionStart | ✓ Mostly | `82b22b6a`, `c1d60618` |
| #2 | Context budget | ✓ | `59989440` |
| #3 | Local HTTP ambient authority | ✓ Bearer | `4fb1cba5`, `ba0464ec` |
| #4a | Per-tool hook hops | ✓ | `626e1cd4` |
| #4b | Outbox for hook failures | ✓ | `3e8cd590` |
| #5 | Tree-sitter install fragility | ✓ | `3e8cd590` |
| #6 | Redundant smart-install | ✓ | `c1d60618` |
| #7 | License | — Out of scope | — |
| #8 | Eval harness | ✓ | `3e8cd590`, `08c0d98d`, `303cb113` |
| #9 | Stale observations | ✓ Read path | `d5285350` |

8 of 9 in-scope items implemented (some partial); 1 explicitly deferred for follow-up.

---

## Workflow changes for fork maintenance

```bash
# Bring upstream changes in:
git fetch upstream
git checkout wave-3
git merge upstream/main          # or rebase
# Resolve conflicts (most common: schema migrations + route refactors).
git push                         # to YOUR fork's wave-3
npm run build-and-sync           # refresh plugin cache + restart worker

# Sync fork's main with upstream:
git sync-upstream                # alias for fetch+ff-merge+push to origin/main
```

The marketplace updater can no longer clobber this repo. The plugin source is read directly from `/Users/bcechet/projects/personal/claude-mem` via Claude Code's directory-source marketplace mechanism. Updates only happen when the user runs `npm run build-and-sync`.
