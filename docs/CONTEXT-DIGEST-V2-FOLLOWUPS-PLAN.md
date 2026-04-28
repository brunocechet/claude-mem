# Context Digest v2 — Follow-ups Plan

Three deferred items from the v2 final review. Executing sequentially, one branch per item, merged to `wave-3` after each passes review.

## Order rationale

| # | Item | Why this order |
|---|---|---|
| 1 | E2E test for `buildContextOutput` | Lands first so it acts as a regression net for items 2 and 3 |
| 2 | Cap on `dedupeSignals` input | Pure addition (no behavior change for normal-size inputs), safest after E2E exists |
| 3 | Reuse pre-scored map between `rankByPriority` and `clusterBySubject` | Touches shared scorer, riskiest — done last, with E2E + cap already in place |

## Per-item execution pattern (subagent-driven-development)

For each item:
1. **Worktree** at `.claude/worktrees/v2-followup-N` on a fresh branch off wave-3
2. **Implementer** subagent (Task tool, full task spec inline, no plan-file reading)
3. **Spec compliance reviewer** subagent — verify code matches spec line-by-line
4. **Code quality reviewer** subagent (typescript-reviewer)
5. **Fix loop** until both reviewers approve
6. **Merge** to wave-3 with `--no-ff` (preserve commits)
7. **Push** to `origin/wave-3` (the fork)
8. **Tear down** worktree and feature branch
9. Move to next item

## Item 1 — E2E test for `buildContextOutput`

**Goal:** lock the assembled output shape against future regressions; verify the section ordering contract (`state → blockers → header → economics → timeline → footer`) and the per-feature rollback paths.

**Branch:** `feature/context-digest-v2-e2e`

**Scope:**
- New test file `tests/context/integration/context-builder.test.ts` (or whatever fits the existing test layout).
- Fixture: a small synthetic `observations[]` + `summaries[]` (10–15 obs covering 3+ subjects, 2+ types, with at least one `TODO:` in narrative for blocker coverage and one obs marked as full-narrative).
- Test 4 config combos minimum:
  - **All-on** (defaults): state header, blockers, clustering, priority ranking — full v2 shape.
  - **All-off** (`STATE_HEADER=false`, `BLOCKERS_SECTION=false`, `SUBJECT_CLUSTERING=false`, `PRIORITY_RANKING=false`, `VERBOSE=true`) — restored pre-v2 shape.
  - **Clustering off + ranking on** — flat timeline but priority-sorted within.
  - **0-obs project** — empty digest path; should not crash; state header still renders if available.
- Assertions: section order (regex on the assembled string), presence/absence of section headers under each combo, ordering of the top observation in clustered output.
- The state header is environment-dependent. Either inject a mock git-exec function (Phase 2 already exposes `testGitExec`) or pass a `cwd` of `'/dev/null'` so it returns null cleanly.

**Settings flag changes:** none.

**Tests to add:** ~6–10 new test cases.

**Risk:** low. Pure additive coverage.

**Estimated effort:** 1 hour.

## Item 2 — Cap on `dedupeSignals` input

**Goal:** prevent theoretical O(S²) blowup in `BlockersRenderer.dedupeSignals` if a project ever produces pathologically signal-dense observations.

**Branch:** `feature/context-digest-v2-dedup-cap`

**Scope:**
- Edit `src/services/context/sections/BlockersRenderer.ts`.
- Before passing to dedup, sort enriched signals by recency (`created_at_epoch DESC`) and truncate to a constant ceiling. Suggested constant: `MAX_SIGNALS_BEFORE_DEDUP = 500` (well above any real-world observation count × signals-per-obs, but caps the worst case).
- Document the choice with a code comment + reference to this plan.
- Add a unit test asserting that with `>500` synthetic signals, dedup completes and no signal beyond the cap appears in output.

**Settings flag changes:** none. The cap is internal; users never see it.

**Risk:** very low. Additive guard before existing logic.

**Estimated effort:** 30 minutes.

## Item 3 — Reuse pre-scored map between `rankByPriority` and `clusterBySubject`

**Goal:** eliminate the architectural seam where both functions compute scores independently. When clustering follows ranking, the rank pass already scored every observation; passing the score map to clustering avoids the second `Math.pow` call per obs.

**Branch:** `feature/context-digest-v2-score-reuse`

**Scope:**
- Edit `src/services/context/ObservationCompiler.ts`.
- Change `rankByPriority` to optionally return both the sorted array and the score map (or expose a `scoreObservations(obs[], now): Map<id, score>` helper that both consumers can call).
- Add an optional `precomputedScores?: Map<number, number>` parameter to `clusterBySubject`. When provided, skip the inner `scoreObservation` call and look up from the map. When absent, behavior is unchanged.
- Edit `src/services/context/ContextBuilder.ts` to:
  - Compute the score map once when `priorityRanking` is on.
  - Pass it into both `rankByPriority` (sort using map) and `clusterBySubject` (intra-cluster sort using map).
- Tests: extend existing `cluster-by-subject.test.ts` with a case asserting `precomputedScores` produces identical output to the no-arg case (golden equivalence). Property test: shuffle inputs, run with vs. without precomputed map, results equal.

**Settings flag changes:** none.

**Risk:** medium — touches shared scorer used by 2 callers. The E2E test from item 1 plus golden equivalence checks should catch regressions.

**Estimated effort:** 1.5 hours.

## Total estimated effort

~3 hours of focused subagent work, possibly more with review loops. Plus the final report.

## Final report

When all 3 items merge, write `docs/CONTEXT-DIGEST-V2-FOLLOWUPS-REPORT.md` summarizing:
- What landed per item (commits, test counts, perf-relevant numbers if measured)
- Any deviations from this plan and why
- Updated state of the v2 feature post-followups
- Anything new flagged during review that wasn't already known

## Branch hygiene

After each merge:
1. `git push origin wave-3`
2. `git worktree remove .claude/worktrees/<dir>`
3. `git branch -d feature/<name>` (local cleanup; the merge commit retains the history)
