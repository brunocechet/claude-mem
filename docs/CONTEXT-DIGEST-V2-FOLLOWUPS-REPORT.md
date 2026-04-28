# Context Digest v2 — Follow-ups Report

**Status:** All 3 items shipped. ✅
**Branch:** `wave-3` on `git@github.com-personal:brunocechet/claude-mem.git`
**Plan:** [`docs/CONTEXT-DIGEST-V2-FOLLOWUPS-PLAN.md`](CONTEXT-DIGEST-V2-FOLLOWUPS-PLAN.md)
**Generated:** 2026-04-28 (overnight autonomous execution)

## Summary

Three deferred items from the v2 final review, executed sequentially on dedicated branches with full subagent flow (implementer → spec review → code-quality review → fix loop) per item. All 3 merged to `wave-3` and pushed to your fork.

| # | Item | Branch | Final SHA | Net new tests | Outcome |
|---|---|---|---|---|---|
| 1 | E2E test for `buildContextOutput` | `feature/context-digest-v2-e2e` | `c3bdfd03` (merge) | +21 | ✅ Approved with minor fixes (comment-only) |
| 2 | Cap on `dedupeSignals` input | `feature/context-digest-v2-dedup-cap` | `2a7bd3ee` (merge) | +4 | ✅ Approved with minor fixes (test polish) |
| 3 | Reuse pre-scored map | `feature/context-digest-v2-score-reuse` | `9e12bcea` (merge) | +10 | ✅ Approved (cosmetic polish applied) |

**Aggregate:** 6 new commits on `wave-3`, +35 new tests (171 → 206), 0 production behavior changes, 1 perf cleanup.

## State of the v2 feature post-followups

```
tests/context/:           206 pass / 0 fail (was 171 before follow-ups, +35)
Baseline tsc errors:      0 in src/* (was 5 — cleared by intervening upstream merge)
Section ordering contract:locked by E2E test against future regressions
dedupeSignals worst case: bounded at S=500 (was unbounded)
Double-scoring seam:      eliminated (one Map shared between rank + cluster)
```

## Per-item details

### Item 1 — E2E test for `buildContextOutput`

**Branch:** `feature/context-digest-v2-e2e` (merged as `c3bdfd03`)
**Implementation commit:** `b1188a10`

What landed:
- New `tests/context/integration/context-builder.test.ts` (513 lines, 21 tests).
- Single non-test source change: `function buildContextOutput` → `export function buildContextOutput` in `src/services/context/ContextBuilder.ts`. JSDoc note steers production callers to `generateContext`. Zero logic changes.

Coverage matrix (4 config combos × multiple assertions per combo):
| Combo | Settings | Assertions |
|---|---|---|
| **A** All-on (v2 defaults) | state+blockers+clustering+ranking ON, verbose OFF | 7 — blockers section, collapsed economics, no preamble, cluster headers, blockers-before-banner, header-before-clusters, priority-ranked clusters |
| **B** All-off (rollback) | all off + verbose ON | 7 — no `📍`, Legend present, Stats: 4-line block present, no blockers, no clusters, flat day headers |
| **C** Clustering off + ranking on | clustering off, others on | 4 — flat timeline + day headers, blockers still on, decision-before-discovery same day, v2 economics |
| **D** Empty project | 0 obs / 0 summaries, all flags on | 2 — `renderAgentEmptyState` shape, `buildContextOutput` doesn't crash on empty arrays |

Reviewer notes addressed:
- Stale per-test score-annotation comments fixed against the fixture's authoritative JSDoc.
- Combo D second `it` clarified to call out that it complements the first by exercising the orchestrator directly.

Risk: low. Pure additive coverage + minimal export change.

### Item 2 — Cap on `dedupeSignals` input

**Branch:** `feature/context-digest-v2-dedup-cap` (merged as `2a7bd3ee`)
**Implementation commit:** `8e606b3c`

What landed:
- `MAX_SIGNALS_BEFORE_DEDUP = 500` constant + 14-line docblock in `src/services/context/sections/BlockersRenderer.ts`.
- Step 1.5 between aggregation and dedup: when `enrichedAll.length > 500`, sort by `obs.created_at_epoch DESC` (tiebreaker `signal.observationId DESC`), truncate to 500. No-op fast path otherwise.
- Dedup algorithm itself unchanged.
- 4 new tests in `tests/context/sections/blockers-renderer.test.ts`:
  - Cap fires at 600 signals → respects `maxBlockers`, top 5 are newest, oldest dropped.
  - Cap is no-op at 50 signals (small-input regression check).
  - Cap is no-op at exactly 500 signals (boundary case).
  - `observationId DESC` tiebreaker decides when `created_at_epoch` is equal (forces 502 obs to share an epoch via direct override).

Why 500: at S=500 worst case ~125k comparisons × 2 string-includes + Jaccard each → comfortably <100ms on Node/V8. Real-world S is well under 100; the cap only fires on pathological signal-density.

Risk: very low. Additive guard before existing logic. No behavior change for normal inputs.

Reviewer notes addressed:
- Tiebreaker test added (was uncovered before).
- Vacuous `not.toContain('#501')` loop replaced with explanatory comment (positive `every(id => id <= 5)` already does the work).
- Exact-boundary test added.

### Item 3 — Reuse pre-scored map between rank and cluster

**Branch:** `feature/context-digest-v2-score-reuse` (merged as `9e12bcea`)
**Implementation commit:** `f3e091e3`

What landed:
- New exported helper `scoreObservations(obs, now): ReadonlyMap<number, number>` in `src/services/context/ObservationCompiler.ts`.
- Both `rankByPriority` and `clusterBySubject` gained optional `precomputedScores?: ReadonlyMap<number, number>` parameter. Per-row fallback when key missing: `precomputedScores?.get(obs.id) ?? scoreObservation(obs, now)`. Partial maps are safe.
- `src/services/context/ContextBuilder.ts` hoisted `now = Date.now()` once and computes `scoreMap = scoreObservations(observationsRaw, now)` once when either feature is enabled. Both consumers receive `(obs, now, scoreMap)` — same `now`, same map.
- 10 new tests:
  - `tests/context/score-observations.test.ts` (NEW, 6 tests) — Map shape, equivalence to `scoreObservation`, empty input, determinism, immutability, default `now`.
  - `tests/context/cluster-by-subject.test.ts` (+2) — golden equivalence (with vs without map produces deeply-equal output) + partial-map fallback.
  - `tests/context/rank-by-priority.test.ts` (+2) — analogous equivalence + fallback.

Behavior: zero change. Verified by `expect(withMap).toEqual(withoutMap)` golden tests across mixed-type, mixed-age inputs (including future-dated and unknown types).

Perf: when both `priorityRanking` and `subjectClustering` are on (the default), each observation is now scored ONCE instead of twice. For a 200-obs digest that's 200 fewer `Math.pow` calls per `SessionStart` — negligible in absolute terms but eliminates the architectural seam.

Reviewer notes addressed:
- `scoreObservations` return type tightened from `Map` to `ReadonlyMap` so callers can't accidentally mutate it post-hand-off.
- JSDoc on `precomputedScores` parameters tightened in both consumers to make explicit that the map MUST be keyed by ids from the same `observations` array passed in (mismatched ids fall back silently to local scoring — safe but defeats the perf benefit).

Risk: medium (touched shared scorer used by 2 callers). Guarded by the E2E test from Item 1 + explicit golden equivalence tests. Approved by code reviewer outright (no required fixes; cosmetic-only follow-ups applied).

## Subagent flow per item

Each item went through:
1. **Worktree** at `.claude/worktrees/v2-followup-<name>` on a fresh branch off `wave-3`
2. **Implementer subagent** (general-purpose, full task spec inline)
3. **Spec compliance reviewer** (general-purpose, code-reading verification, never trusts implementer's report)
4. **Code quality reviewer** (typescript-reviewer specialist)
5. **Fix subagent** when reviewers found issues (all amended into the original commit, no separate fix commits)
6. **Re-verify** before merge
7. **Merge with `--no-ff`** to preserve commits
8. **Push to fork** (`origin/wave-3`)
9. **Worktree teardown** + branch cleanup

Items 1 and 2 had review fix loops (test comment polish + tiebreaker coverage). Item 3 was approved outright; the two cosmetic improvements were applied as polish.

The spec reviewer for Item 3 hit a usage limit mid-pass and was substituted with manual code-reading verification (signatures + key plumbing inspected directly). All facts the spec reviewer would have checked were verified — see Item 3's "What landed" details.

## Hygiene

| Action | Status |
|---|---|
| All 3 worktrees torn down | ✅ |
| All 3 feature branches deleted (commits preserved on wave-3 via merges) | ✅ |
| Pushed to `origin/wave-3` (your fork) | ✅ |
| `tests/context/`: 206 pass / 0 fail | ✅ |
| Baseline tsc errors in src/*: 0 (was 5 — cleared by upstream merge state) | ✅ |
| Build artifacts (.cjs in `plugin/scripts/`) regenerated by `npm run build-and-sync` | Pending — see "Loose ends" below |

## Loose ends for tomorrow

Three trivial cleanups when you wake up:

1. **Run `npm run build-and-sync`** in the main repo to regenerate the `plugin/scripts/*.cjs` files from the v2 + follow-up changes and refresh the live worker. The `wave-3` working tree currently shows `M plugin/scripts/context-generator.cjs`, `M plugin/scripts/mcp-server.cjs`, `M plugin/scripts/worker-service.cjs` from intermediate `bun install` activity in the worktrees — running build-and-sync will produce the canonical outputs.

2. **Re-test in a real ana-v2 session** to see the production digest with the v2 features + follow-ups live. The integration tests prove the contract holds; the lived experience tells you whether the section ordering, blocker surfacing, and clustering actually feel useful in your workflow.

3. **Decide on telemetry-driven tuning** for the file-context hook gate (`MIN_OBS_FOR_TRUNCATION`, `MIN_RECENT_OBS_FOR_TRUNCATION`, `RECENCY_WINDOW_DAYS`). After ~2 weeks of real sessions, `~/.claude-mem/file-context-events.jsonl` will have enough samples for the analyzer to recommend tuned thresholds. Could schedule an agent to do this.

## What I would NOT recommend touching

- The `MAX_SIGNALS_BEFORE_DEDUP = 500` constant — too rare to fire in practice; making it configurable would add surface area for no real-world value.
- The `now` threading from `ContextBuilder` → consumers — works, no need to refactor into a context object.
- The `precomputedScores` parameter naming — matches `scoreObservations` clearly; renaming risks breaking call sites without benefit.

## Final commit graph (wave-3 from plan-doc to current HEAD)

```
9e12bcea Merge: reuse pre-scored map between rank and cluster (Item 3 / v2 follow-ups)
f3e091e3   perf(context): reuse pre-scored map between rank and cluster
2a7bd3ee Merge: cap dedupeSignals input at 500 (Item 2 / v2 follow-ups)
8e606b3c   fix(context): cap dedupeSignals input at 500 signals
c3bdfd03 Merge: E2E test for buildContextOutput (Item 1 / v2 follow-ups)
b1188a10   test(context): E2E integration test for buildContextOutput
4af0e0eb docs: plan for context digest v2 follow-ups
... (v2 base merge below this)
```

All linear, all merge-bubbled per item for clean history. Each item is independently revertible if needed.
