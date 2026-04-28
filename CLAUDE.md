# Claude-Mem: AI Development Instructions

Claude-mem is a Claude Code plugin providing persistent memory across sessions. It captures tool usage, compresses observations using the Claude Agent SDK, and injects relevant context into future sessions.

## Architecture

**5 Lifecycle Hooks**: SessionStart → UserPromptSubmit → PostToolUse → Summary → SessionEnd

**Hooks** (`src/hooks/*.ts`) - TypeScript → ESM, built to `plugin/scripts/*-hook.js`

**Worker Service** (`src/services/worker-service.ts`) - Express API on port 37777, Bun-managed, handles AI processing asynchronously

**Database** (`src/services/sqlite/`) - SQLite3 at `~/.claude-mem/claude-mem.db`

**Search Skill** (`plugin/skills/mem-search/SKILL.md`) - HTTP API for searching past work, auto-invoked when users ask about history

**Planning Skill** (`plugin/skills/make-plan/SKILL.md`) - Orchestrator instructions for creating phased implementation plans with documentation discovery

**Execution Skill** (`plugin/skills/do/SKILL.md`) - Orchestrator instructions for executing phased plans using subagents

**Chroma** (`src/services/sync/ChromaSync.ts`) - Vector embeddings for semantic search

**Viewer UI** (`src/ui/viewer/`) - React interface at http://localhost:37777, built to `plugin/ui/viewer.html`

## Privacy Tags
- `<private>content</private>` - User-level privacy control (manual, prevents storage)

**Implementation**: Tag stripping happens at hook layer (edge processing) before data reaches worker/database. See `src/utils/tag-stripping.ts` for shared utilities.

## Build Commands

```bash
npm run build-and-sync        # Build, sync to marketplace, restart worker
```

## Configuration

Settings are managed in `~/.claude-mem/settings.json`. The file is auto-created with defaults on first run.

## File Locations

- **Source**: `<project-root>/src/`
- **Built Plugin**: `<project-root>/plugin/`
- **Installed Plugin**: `~/.claude/plugins/marketplaces/thedotmack/`
- **Database**: `~/.claude-mem/claude-mem.db`
- **Chroma**: `~/.claude-mem/chroma/`

## Exit Code Strategy

Claude-mem hooks use specific exit codes per Claude Code's hook contract:

- **Exit 0**: Success or graceful shutdown (Windows Terminal closes tabs)
- **Exit 1**: Non-blocking error (stderr shown to user, continues)
- **Exit 2**: Blocking error (stderr fed to Claude for processing)

**Philosophy**: Worker/hook errors exit with code 0 to prevent Windows Terminal tab accumulation. The wrapper/plugin layer handles restart logic. ERROR-level logging is maintained for diagnostics.

See `private/context/claude-code/exit-codes.md` for full hook behavior matrix.

## Requirements

- **Bun** (all platforms - auto-installed if missing)
- **uv** (all platforms - auto-installed if missing, provides Python for Chroma)
- Node.js

## Documentation

**Public Docs**: https://docs.claude-mem.ai (Mintlify)
**Source**: `docs/public/` - MDX files, edit `docs.json` for navigation
**Deploy**: Auto-deploys from GitHub on push to main

## Pro Features Architecture

Claude-mem is designed with a clean separation between open-source core functionality and optional Pro features.

**Open-Source Core** (this repository):

- All worker API endpoints on localhost:37777 remain fully open and accessible
- Pro features are headless - no proprietary UI elements in this codebase
- Pro integration points are minimal: settings for license keys, tunnel provisioning logic
- The architecture ensures Pro features extend rather than replace core functionality

**Pro Features** (coming soon, external):

- Enhanced UI (Memory Stream) connects to the same localhost:37777 endpoints as the open viewer
- Additional features like advanced filtering, timeline scrubbing, and search tools
- Access gated by license validation, not by modifying core endpoints
- Users without Pro licenses continue using the full open-source viewer UI without limitation

This architecture preserves the open-source nature of the project while enabling sustainable development through optional paid features.

## Observation Type Vocabulary (synonyms + raw_type)

Each mode in [plugin/modes/*.json](plugin/modes/) declares a closed list of `observation_types`. The parser ([src/sdk/parser.ts](src/sdk/parser.ts)) resolves the LLM-emitted type with three steps:

1. **Exact id match** — canonical case, no coercion.
2. **Synonym match** — case-insensitive lookup against each type's optional `synonyms: string[]` array. Use this to absorb known LLM drift (e.g. `evaluation-result | eval | analysis` → `discovery`).
3. **`unknown_type_fallback`** — top-level mode field naming the type id to use when nothing matches. Pick the most semantically forgiving id (for `code`, this is `discovery`, not `bugfix` — uncategorized model output is usually closer to "I learned something" than "I fixed a bug").

When coercion happens (steps 2 or 3), the LLM's original string is stored in the `raw_type` column on the observation row (migration v30). NULL means no coercion. Use `raw_type` for auditing model drift and growing the synonym table over time.

**To grow the synonym table:**
- The parser logs `WARN PARSER Invalid observation type: X, using "Y"` whenever step 3 fires.
- Run `node scripts/synonym-suggestions.mjs` to surface the most common unknown types from worker logs.
- Edit the relevant mode's JSON to add the synonym to the appropriate type, or add a brand-new type if there's a real semantic gap.

## File-Context Hook (PreToolUse:Read)

[src/cli/handlers/file-context.ts](src/cli/handlers/file-context.ts) injects a timeline of prior observations when an agent reads a file. For unconstrained reads of >1.5KB files where the timeline is dense AND recent (≥3 obs, ≥1 in last 60 days), the hook **forcibly truncates the Read to line 1** so the agent leans on the timeline. Tune via `MIN_OBS_FOR_TRUNCATION`, `MIN_RECENT_OBS_FOR_TRUNCATION`, `RECENCY_WINDOW_DAYS` constants.

The hook never inserts leading-question framing ("already know enough?") — the agent is the right judge of "enough." It only injects neutral data + a recovery menu when truncation occurs.

**Telemetry**: each invocation appends one JSONL line to `~/.claude-mem/file-context-events.jsonl`. Analyze with:
- `node scripts/analyze-file-context.mjs --days 30` — terminal report
- `curl -sS http://127.0.0.1:37777/api/admin/file-context-stats?days=30` — JSON for dashboards

Tune the gate constants based on `reread_rate`: if >50%, the timeline isn't satisfying agents and the gate is too aggressive; if <15%, the gate may be too conservative and could truncate more.

## Auto-Update Recovery (lessons from 2026-04-25)

The marketplace plugin updater (12.3.9 → 12.4.4) rsynced upstream files **through a symlinked marketplace dir into this repo**, leaving conflict markers across ~6 files and silently overwriting all uncommitted edits. Recovery required manual conflict resolution + re-applying ~10 files of work.

**Prevention**: do NOT symlink `~/.claude/plugins/marketplaces/thedotmack` to this repo. The marketplace dir should be a normal directory the updater owns. Use `npm run build-dev` (which runs `sync-marketplace:force`) to push from this repo into the marketplace dir explicitly. After every meaningful edit, **commit immediately** — uncommitted work is at risk if the updater fires.

## Merge Divergence Policy (this fork stays local)

This fork is permanent — there are no upstream PRs planned. Strategy is to minimize the surface area where local changes touch upstream-tracked files, and protect the unavoidable diverged files from silent merge regressions.

**Owned shim layer**: hook entry points live in [plugin/scripts/claude-mem-hooks/](plugin/scripts/claude-mem-hooks/) — a path upstream does not ship. Hooks call our `runner.cjs` instead of upstream's `bun-runner.js`, so changes to upstream's runner cannot break our hook contract. The runner clamps every exit to 0, logs failures to `~/.claude-mem/logs/hook-failures-YYYY-MM-DD.jsonl`, and bails cleanly on missing install-stamp / missing bun.

**Always-take-ours merge driver**: [.gitattributes](.gitattributes) marks `plugin/hooks/hooks.json` as `merge=ours`. Run [`scripts/setup-merge-drivers.sh`](scripts/setup-merge-drivers.sh) once after cloning (and after any `git config --unset` mishap) to register the driver in local git config. Re-running is idempotent. The 2026-04-27 merge of upstream main silently dropped wave-1's SessionStart collapse because hooks.json had no protection — this is what stops it from happening again.

**When merging upstream**: after `git merge origin/main`, manually inspect any file that *isn't* `merge=ours` but is also intentionally divergent (currently: `src/services/worker-service.ts` for the `ensureWorkerStarted` hardening). If those conflict, prefer ours and re-apply upstream's actual changes by hand. Add files to `.gitattributes` over time as the divergent surface stabilizes.

**Worker-startup diagnostics**: every `return false` path in `ensureWorkerStarted` ([src/services/worker-spawner.ts](src/services/worker-spawner.ts)) appends one JSONL line to `~/.claude-mem/logs/worker-startup-failures-YYYY-MM-DD.jsonl` with the failure reason (`script-path-missing`, `live-pid-health-timeout`, `port-in-use-no-response`, `windows-cooldown`, `spawn-daemon-failed`, `post-spawn-health-timeout`, etc.). When a hook fails silently and `claude-mem-hooks/runner.cjs` logs `child-nonzero` to `hook-failures-*.jsonl`, cross-reference the timestamp here to find which spawn path actually broke.

## Important

No need to edit the changelog ever, it's generated automatically.

## Daily Maintenance

Run a daily version check across all package manifests and upgrade every dependency to its latest version — including major version bumps. Staying on the latest is the goal; do not skip majors.

- Check `package.json` (root) and all nested `package.json` files (e.g. `plugin/`, `openclaw/`) for outdated dependencies via `npm outdated`.
- Upgrade every package to `latest` (use `npm install <pkg>@latest` for each, or `npx npm-check-updates -u && npm install`). Bump majors too.
- Run `npm audit fix` to resolve advisories.
- After upgrades, run `npm run build-and-sync` and verify the worker starts and tests pass. Fix any breakage caused by major bumps in the same change.
- Commit the updated `package.json` and `package-lock.json` files.
