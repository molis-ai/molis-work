# GW3 Goal Planning Engine validation

Goal: `goal-reorg-gw3`  
Contract revision: `1`  
Completion level: functional migration with repository-wide compatibility verification

## gw3-boundary

- Public owner: `@molis-ai/molis-work-module-goals` advertises `goals.planning.v1` from its package manifest, runtime descriptor, and workspace inventory.
- Public Contract: `@molis-ai/molis-work-contracts/modules/goals` defines method selection/composition, proposal-shaped validation input, graph diagnostics, execution metrics, change impact, persistence input, and `GoalsPlanningApi`.
- Public implementation: `GoalsModule.planning` owns effective method selection, project composition, user-confirmed method version increments, graph validation, execution metrics, decomposition checks, and change-impact analysis.
- Planning implementation is split by responsibility under `modules/goals/src/planning/`: catalog loading, method packs, engine composition, graph analysis, leaf validation, and compound/subtree coverage. The largest source is 635 lines; the boundary scanner rejects a Goals owner source above 700 lines.
- The 37 built-in Planning methods have one source owner under `modules/goals/methods/` and are included in the package release. The installed Runtime Skill receives a contained compatibility symlink to that packaged directory; there is no second source copy under `skills/goal-advance/methods/`.
- Proposal and Decision persistence did not move into Planning. Planning only validates proposal-shaped input; Governance remains the fact owner.
- `CI=true pnpm boundary:check`: 48 packages, 107 package source files, 172 imports, 54 dependency edges, 30 Contract subpaths, 18 compatibility allowlist entries, 14 legacy huge files, 0 errors.
- `CI=true pnpm boundary:test`: 9/9 passed.
- The boundary scanner now rejects a missing Planning capability, missing/miscounted method assets, duplicate Skill source assets, a missing installed-Skill compatibility link, legacy Planning implementation, direct Planning SQL in the root Store, or a new oversized Goals owner file.

## gw3-legacy-exit

- `MolisWorkCoordinator` planning composition, method persistence, change analysis, whole-board graph validation, and internal graph callers delegate to `GoalsModule.planning`.
- `src/planning/goal-graph.ts`, `src/planning/method-catalog.ts`, `src/planning/method-packs.ts`, and `src/v1/goal-decomposition-validation.ts` are thin public-package re-exports. Their current line counts are 12, 6, 24, and 16.
- The former 1,126-line decomposition validator is split into 635-line leaf/shared validation and 511-line compound/subtree coverage owners instead of being renamed and moved intact.
- `GoalsRepository` owns project Planning method reads/writes. `src/v1/store.ts` no longer contains `planning_method_packs` SQL or a private Planning migration; startup invokes the public Goals migration.
- Existing Web, MCP, project catalog, action projection, lifecycle reconciliation, and V1 callers import the public Goals package or Contract rather than deep-importing the new implementation.
- `src/v1/coordinator.ts`: 15,168-line architecture baseline → 13,920 after GW1 → 12,771 after GW2 → 12,723 after GW3.
- `src/v1/store.ts`: 2,447 lines after Planning persistence/migration ownership moved to Goals.
- `src/v1/types.ts`: 933 lines; public Planning types now come from the Goals Contract.
- Goals Query, Draft dialogue ownership, final Web/MCP/CLI adapter cleanup, and deletion of compatibility facades remain explicit later Goals; GW3 does not claim those are complete.

## gw3-result

- Planning tests verify built-in catalog loading, precedence, complete instruction composition, dependency checks, project/personal persistence, version increments, decomposition coverage, graph cycles, execution metrics, and local downstream change impact through the public Goals API.
- `CI=true pnpm exec tsx --test tests/planning-engine.test.ts`: 14/14 passed, 0 failed, 0 skipped.
- `CI=true pnpm test`: build passed; 492/492 repository tests passed, 0 failed, 0 skipped. This includes Web, MCP, CLI, Desktop, SQLite migrations, concurrency, fresh home install, upgrade/rollback, bundled Node launchers, and the packed-release end-to-end flow.
- The packed-release test proves the installed Molis Work Skill can still read the full Planning method catalog after its source checkout is removed. Install tests also prove same-version refresh, repair, failed-upgrade rollback, flattened workspace dependencies, and containment checks.
- Existing front-end and back-end behavior stays compatible through the old public entrypoints while implementation ownership moves behind them. GW3 adds no new user-facing feature claim and performs no data rewrite beyond the existing idempotent Planning schema migration.
- `git diff --check`: passed.

Acceptance status:

- `gw3-boundary`: passed.
- `gw3-legacy-exit`: passed.
- `gw3-result`: passed.
