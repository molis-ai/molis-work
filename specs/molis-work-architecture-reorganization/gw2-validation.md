# GW2 Goal Lifecycle and data migration validation

Goal: `goal-reorg-gw2`  
Contract revision: `1`  
Completion level: functional migration with repository-wide compatibility verification

## gw2-boundary

- Public owner: `@molis-ai/molis-work-module-goals` now advertises `goals.lifecycle.v1` from its package manifest, runtime descriptor, and workspace inventory.
- Public implementation: `GoalsModule.lifecycle` exposes Draft acceptance, Contract revision, revalidation, completion, archive, trash/restore, validity changes, compound reconciliation, and lifecycle migration functions through `modules/goals/src/index.ts`.
- Lifecycle implementation is split by responsibility:
  - `lifecycle-archive.ts`: archive and recoverable trash.
  - `lifecycle-revalidation.ts`: validity and revalidation.
  - `lifecycle-completion.ts`: leaf/compound completion and reopening.
  - `lifecycle-revisions.ts`: accepted Contract revision and same-ID version increments.
  - `migrations.ts`: schema and historical-state reconciliation.
- The largest Goals owner source is 691 lines. The old 952-line Lifecycle class is now a 205-line facade; the boundary scanner rejects any Goals source above 700 lines.
- Claims/Runs, Review obligations, Project active Goal, and Action projection are consumed through narrow ports. Non-migration Lifecycle source is forbidden from querying or mutating `claims`, `runs`, or `review_obligations` directly.
- `tooling/migrations` is intentionally not a workspace package. Its read-only audit script checks required migration markers and unreconciled historical states without creating a second runtime implementation.
- `CI=true pnpm boundary:check`: 48 packages, 101 package source files, 150 imports, 54 dependency edges, 30 Contract subpaths, 0 errors.
- `CI=true pnpm boundary:test`: 9/9 passed.
- `CI=true pnpm build`: passed, including every migrated package and the root TypeScript/Web build.

## gw2-legacy-exit

- `MolisWorkCoordinator` public archive, trash, restore/list, revalidate, and completion methods are thin calls to `GoalsModule.lifecycle`.
- Draft acceptance, accepted Contract revision, accepted compound closure, validity changes, and automatic completion/reopening no longer write Goal lifecycle facts in the Coordinator.
- Contract revision still preserves the same `goal_id`; `current_contract_revision` increments and a matching `goal_contract_revisions` row records `metadata`, `revalidate`, or `rework` effect.
- Cross-owner revision effects remain in a narrow Coordinator port until the Execution and Governance owners migrate: material changes abandon/revoke old Run/Claim state and waive old Review obligations; metadata-only changes advance the active Claim revision without restarting work.
- `src/v1/store.ts` calls the five exported Goals migrations for migration IDs 4, 11, 12, 13, and 21. The old private archive, trash, lifecycle, active-Goal, and Contract-coverage migration methods have been deleted.
- Boundary checks reject reintroducing direct lifecycle-field SQL in the Coordinator, duplicate Store migration methods, deep imports, cross-owner Lifecycle Store access, or a new oversized Goals owner file.
- `src/v1/coordinator.ts`: 15,168-line architecture baseline → 13,920 after GW1 → 12,771 after GW2.
- `src/v1/types.ts`: 1,238-line baseline → 933; Goal lifecycle result/reason/revision types now come from the public Goals Contract.
- `src/v1/store.ts`: 2,489 lines and only orchestrates the exported Goals migrations for this slice.

## gw2-result

- Direct public-API test proves Draft acceptance, same-ID revision 2, metadata continuity, completion, archive/unarchive, trash/restore, and retained version history.
- Direct migration rollback test forces migration 12's audit event to fail after a historical Run update would have occurred. The transaction restores the Run to `started`, keeps `ended_at` null, and leaves migration marker 12 absent.
- Existing characterization tests cover archive eligibility, trash relation restoration, active-work protection, transaction rollback, dependency/compound reopening, revalidation gates, revision compatibility, metadata-only active Run continuity, migration 12/13 idempotence, and multi-process Claim concurrency.
- `CI=true pnpm exec tsx --test tests/goals-command-module.test.ts tests/v1.test.ts`: 119/119 passed, 0 failed, 0 skipped.
- `CI=true pnpm test`: build passed; 491/491 repository tests passed, 0 failed, 0 skipped. This includes Web, MCP, CLI, Desktop, installation, migrations, concurrency, and all V1 compatibility behavior.
- `node --check tooling/migrations/audit-goal-lifecycle.mjs`: passed.
- `git diff --check`: passed.

Acceptance status:

- `gw2-boundary`: passed.
- `gw2-legacy-exit`: passed.
- `gw2-result`: passed.
