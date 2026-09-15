# Goals Query migration validation

Goal: `goal-f826dfb8-bf63-4e98-b6b7-57f6b4b7c3b8`  
Contract revision: `1`  
Completion level: functional migration with repository-wide compatibility verification

## goals-query-callers

- `@molis-ai/molis-work-contracts/modules/goals` defines the stable Query records and `GoalsQueryApi` for Board, Goal, Relation, Risk link, Policy, Guidance, trash, and Goal-owned snapshot reads.
- `GoalsModule.query` implements that Contract through `GoalsQueryService`; Goal fact SQL and row mapping stay in `GoalsRepository` rather than in Web, MCP, CLI, or the legacy Coordinator.
- Web, MCP, and CLI Goal detail, Policy, Guidance, and trash callers use `coordinator.goalQueries`, which is a separate 108-line application read boundary. The old Coordinator methods are compatibility delegates rather than query implementations.
- `GoalReadApplication` composes Goal-owned facts from `GoalsQueryApi` with narrow read-only ports for Execution, Evidence, and Governance. It neither imports `GoalsRepository` nor accesses a database or the legacy Store directly. Cross-owner work/action projection remains owned by EX4 instead of being absorbed into Goals.
- `src/v1/store.ts` Goal list, trash, relation, Risk, Policy, Guidance, and snapshot slices delegate to the public Goals owner. This preserves existing application snapshots while removing the duplicate Goal query implementation.
- The package advertises `goals.query.v1`; the workspace boundary scanner requires the Contract, Query service, application boundary, caller usage, and direct public-API tests.
- The boundary scanner also rejects any later `GoalReadApplication` import of `GoalsRepository`, SQL statement, or direct `db`/`store` access.
- `CI=true pnpm boundary:check`: 48 packages, 108 package source files, 177 imports, 54 dependency edges, 30 Contract subpaths, 18 compatibility allowlist entries, 14 legacy huge files, 0 errors.
- `CI=true pnpm boundary:test`: 9/9 passed.

## goals-query-parity

- The direct Query test verifies Board/Goal lookup, active Goal lists, relations, linked Risks, resolved Policy, project Guidance, trash isolation, and Goal-owned snapshot through `GoalsModule.query`.
- The same test compares the new Query result with the existing Store snapshot and Coordinator compatibility Contract. Cross-board lookup returns `null`; missing required Goals retain the existing stable error behavior.
- Web, MCP, CLI, and legacy V1 integration coverage passed together: `CI=true pnpm exec tsx --test tests/goals-query-module.test.ts tests/goals-command-module.test.ts tests/mcp.test.ts tests/web.test.ts tests/v1.test.ts` → 211/211 passed, 0 failed, 0 skipped.
- `CI=true pnpm build`: passed.
- `CI=true pnpm test`: build passed; 493/493 repository tests passed, 0 failed, 0 skipped. This includes Web, MCP, CLI, Desktop, SQLite migrations, concurrency, fresh-home install, repair, upgrade rollback, bundled launchers, and packed-release end-to-end verification.
- `src/v1/coordinator.ts` is now 12,621 lines and `src/v1/store.ts` is 2,276 lines. The new owner implementation is split into a 211-line Query service and 442-line Repository instead of moving another huge class intact.
- Existing front-end and back-end behavior remains available through compatible entrypoints. This migration changes ownership and call paths; it does not add, remove, or rewrite user data.
- Draft dialogue and final Goal write caller/facade cleanup remain GW4. Execution/Evidence/Governance work state and action projection remain EX4; this Goal does not claim those later responsibilities are complete.
- `git diff --check`: passed.

Acceptance status:

- `goals-query-callers`: passed.
- `goals-query-parity`: passed.
