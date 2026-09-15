# C2d test mapping handoff

Batch: C2d test adaptation after accepted C2a/b/c.
Writer: Grok 4.6 (this session). Sole production/repository-test writer.
Not claimed: C2 complete, root acceptance, overall level 4.

Root independently re-runs affected probes, then dispatches 04 (UI copy, documentation, final full suite).

## Production correction already in tree

`plugins/native/work/src/handoff-package.ts` current acceptance uses `eventFacts.requirements` only. Original Goal `acceptance_criteria` statements, pass conditions and decision methods sit under `## 历史记录（只读）` / `## 历史验收标准`. Completed/cancelled continuation names public `molis_work_v1_event_resume`. Session delivery/source/provenance/storage unchanged.

Root already verified: `03-c2d-root-handoff-history.log`, `03-c2d-root-current-handoff.log`. Retained `tests/session-handoff.test.ts` covers live-requirement vs historical criteria and the public resume tool. Keep those tests.

## This continuation (empty-file correction)

Empty `export {}` stubs are not retirement. Eight exclusive writer/algorithm files were deleted. Five mixed files were restored to retained business behavior using current APIs or historical SQL. i18n English-meaning assertion restored; current eight-state copy translated. Remaining Draft HTTP case adapted. Document-history asserts original review reasoning. Decision-queue regression folded into `goal-tree-event-flow`. Extra EOF blank lines removed from `tests/session-handoff.test.ts`, `tests/v1.test.ts`, `tests/web.test.ts`.

Deleted (not recreated): `desktop/20260902-022934.jpg` remains git-deleted.

Four `tests/fixtures/goal-event-v35/*.sql` files were not modified.

## Deleted exclusive retired tests

`rm` of these eight test files succeeded (not denied):

| File | Obsolete behaviors (original HEAD titles) |
| --- | --- |
| `tests/confirmed-policy.test.ts` | confirmed Policy writes: resolution, replacement audit, atomic failure through Goals owner |
| `tests/coverage-clarifier.test.ts` | stale compound coverage claim/discuss; coverage revision user-decision; missing child coverage not made claimable; incomplete Contract mappings keep blocked reason |
| `tests/draft-proposal-supersession.test.ts` | editing Draft supersedes pending proposals atomically |
| `tests/execution-impact-policy.test.ts` | Claim-occupancy impact algorithm: pinned snapshot concurrency, exclusive/decide occupation, unconfirmed declarations |
| `tests/execution-module.test.ts` | Execution Claim/Run transitions without Coordinator; lease expiry abandons active Run |
| `tests/execution-validation-app-adapters.test.ts` | Workbench/MCP/CLI ExecutionValidation no-loss chain |
| `tests/proposal-lifecycle-closeout.test.ts` | proposal close-out rolls back Run/Claim writes and replays |
| `tests/query-presentation.test.ts` | MCP `draftDialogueResponse`/`options` history pagination and host error types |

No replacement suite is required for those writers. Query-presentation's old pagination API is not restored.

## 04 exclusive retired browser tests (deleted after explicit user “允许”)

04 classified these three files as exclusive retired writers (Draft editor, legacy Risk create form, Policy reviewer/lease/capability writes). Current agreement, historical Risk/Policy reading, and project guidance tests stay. User later answered “允许” to deleting exactly these three files together with sending the remaining repair sources to Grok. `rm` of the three paths succeeded in the 04 writer session. Git still has the original versions.

| File | Obsolete behaviors (original HEAD titles) | Replacement |
| --- | --- | --- |
| `tests/goals-draft.e2e.test.ts` | exclusively edits the retired Draft form and old criteria/closed_leaf fields via `/api/goals/.../draft` | Current agreement/requirements forms and error recovery: `tests/goal-event-document.e2e.test.ts`, `tests/goal-event-http.test.ts`. Historical unowned reading: same two files. |
| `tests/goals-safety.e2e.test.ts` | exclusively creates legacy Risk through the retired form and `/api/goals/V1/risks` | Historical Risk hash reading/reload: `tests/goals-records.e2e.test.ts` with `insertHistoricalRisk`. No current Risk create writer. |
| `tests/goals-project-policy.e2e.test.ts` | exclusively edits retired Policy reviewer counts/lease/capabilities via `/api/policy-bindings` | Current project guidance and historical Policy reading remain in `tests/v1.test.ts` / query tests. No current Policy role/lease writer. |

Direct old relation create/deactivate HTTP subpath is also retired (route deleted in 03). Mixed reading is kept in `tests/goals-relation.e2e.test.ts`: active incoming `part_of` direction plus an exact historical inactive `extends` row and its `relation.deactivated` reason/event, opened in real UI and reloaded without writes. Actual relation mutations stay in `tests/goals-proposal.e2e.test.ts` (current tree proposal confirm/reject).

## Restored mixed files

| File | Retained | Retired | Replacement if not in-file |
| --- | --- | --- | --- |
| `tests/draft-dialogue-application.test.ts` | Migration 8 trigger-induced schema+marker rollback, successful retry, session/turn snapshot after reopen. Seed via historical SQL after migrate. | Dialogue owner writes, leases, multi-process Draft commands | — |
| `tests/goals-proposal.e2e.test.ts` | First browser Goal/Relation case: missing-reason validation, blocked HTTP retains input/no writes, retry yields one Goal+relation, receipt focus, rejection without extra Goal/relation, reload. Setup is current intent. Child is event-owned `open`. Last-item reject receipt is toast when the queue empties. | Historical risk-repair and Candidate/Rewire browser cases | Current tree still covered by `goal-tree-event-flow` + this first case |
| `tests/proposal-entry-chain.test.ts` | CLI+MCP Goal/Relation propose/read/check/idempotency, denied Runtime decide without writes, management approval, persisted Goal+relation, Host restart. Intent + source note replace Draft. | Candidate submit/decide and Draft dialogue operations | — |
| `tests/evidence-verification-module.test.ts` | Read-only historical Evidence, correction, project-reference from original v35 + temporary correction SQL; `getReviewReference` matches original Evidence ID and original `evidence.submitted` seq | submit/correct/coverage algorithms | Locator/file: `tests/v1.test.ts` (Markdown preflight, external file URI, registered worktree); `tests/artifact-clipboard.e2e.test.ts` |
| `tests/runtime-skill-flow.test.ts` | Public JSON-RPC `context_resolve` unbound → `context_create_and_bind` → current `goal_intent_create`/`event_note` → restart → bound resolve → same-key replay; catalog-resolved temp project unconditionally has one Goal, one original note/body, no Claim/Run | Draft/Claim/Run/automatic completion | Related: `tests/mcp.test.ts` auto-connect restart; `tests/mcp-goal-events.test.ts` event note/report replay |

## Other retained/adapted tests (already passing; not re-run this continuation unless listed below)

| File | Classification |
| --- | --- |
| `tests/session-handoff.test.ts`, `tests/session-handoff-recovery.test.ts` | Kept. Current event context + historical Run/Evidence/Risk; current acceptance vs history; public resume tool |
| `tests/goal-event-document-history.test.ts` | v35 mixed journal/history, original review ID/actor/`legacy_review` source, reasoning `生命周期测试通过`, canonical and original-ID readers share body, pagination to oldest of 120 reports |
| `tests/goals-storage-migration.test.ts`, `.e2e.test.ts` | v35 CORE accepted_by/at/criteria; setPolicy → SQL; V3 import note form |
| `tests/goals-command-module.test.ts` | migration 12 SQL Claim/Run + `migrateGoalLifecycleState`; archive/trash |
| `tests/project-catalog.test.ts` | deletion confirmation, historical Run blocker, terminal Run cleanup, receipt/retry |
| `tests/artifact-clipboard.e2e.test.ts` | real Chrome Unicode locator; denied clipboard; SQL evidence setup |
| `tests/host-entry-consistency.test.ts` | withScope ordering + current directory/trash atomicity |
| `tests/goals-document.e2e.test.ts`, `tests/goals-refresh.e2e.test.ts` | current event documents / archive-restore / 503 Feed identity |
| `tests/goals-query-facts.test.ts`, `tests/goals-query-module.test.ts` | historical Policy/Risk/relation isolation; writer setup → SQL |
| `tests/goals-status-ui.test.ts` | archive/trash precedence, escaping, tabs, current display statuses |
| `tests/v1.test.ts` | mixed keep: guidance, SQLite, migrations 12/13/14/17/26/28/29/30, archive/trash rollback, unified proposal reading, V3, tree constraints, locator/path |
| `tests/goal-tree-event-flow.test.ts` | current Goal/Relation propose/approve; pending count 1 then 0; v35 Candidate/self-review/Risk history with `pendingDecisionCount === 0` |
| `tests/goal-event-http.test.ts` | current event HTTP kept; Draft POST 404; historical draft GET readable, snapshot unchanged |
| `tests/i18n.test.ts` | eight current states; `en.meaning !== zh.meaning` restored |
| `tests/capsule.test.ts`, `tests/web.test.ts`, `tests/mcp.test.ts` | current surfaces; retired writer cases stripped earlier |
| `tests/goals-context-ui.test.ts` | acceptance summary + historical coverage; Draft editor assertions retired |
| `tests/historical-sql-fixture.ts` | shared historical Claim/Run/Evidence/Risk/Policy/clarification/correction inserts |

## Production copy this continuation

`plugins/native/goals/src/goal-state-copy.ts`: positive current-event next actions (no “领取角色 / 不要领取”). Resume instructions name `molis_work_v1_event_resume`.
`plugins/native/goals/src/status-en.ts` and `apps/workbench/src/i18n/en.ts`: English for the eight current states’ meaning/next/continuation.

safety-ui / dialogs copy remains for 04.

## Validation

`pnpm_config_verify_deps_before_run=warn` on every pnpm call. No install.

| Command | Result | Log |
| --- | --- | --- |
| `pnpm_config_verify_deps_before_run=warn pnpm build` | EXIT 0 | `/private/tmp/molis-work-flow-cleanup/03-c2d-resume-build.log` |
| `env -u FORCE_COLOR NODE_NO_WARNINGS=1 node --import tsx --test --test-concurrency=1 tests/i18n.test.ts tests/draft-dialogue-application.test.ts tests/evidence-verification-module.test.ts tests/runtime-skill-flow.test.ts tests/proposal-entry-chain.test.ts tests/goal-tree-event-flow.test.ts tests/goal-event-http.test.ts tests/goal-event-document-history.test.ts` | 27 pass / 0 fail | `/private/tmp/molis-work-flow-cleanup/03-c2d-resume-unit.log` |
| same runner `tests/goals-proposal.e2e.test.ts` | 1 pass / 0 fail (real Chrome) | `/private/tmp/molis-work-flow-cleanup/03-c2d-resume-proposal-e2e.log` |

Previously passing groups were not repeated: `03-c2d-unit-required.log` (115 raw), `03-c2d-e2e.log` (10 named browser), `03-c2d-v1.log` (24), `03-c2d-capsule.log` (11), session-handoff history tests. Command inventory: `/private/tmp/molis-work-flow-cleanup/03-c2d-tested-groups.json`.

Full `tests/*.test.ts` not run. Root probes not run.

## Remaining for 04 / root

- UI copy still using old Claim/Run phrasing outside `goal-state-copy` (document model summaries, some dialogs/safety).
- Exclusive retired browser writers listed above were deleted in 04 after explicit user “允许”.
- Skill/docs/README completeness remains 04/root.
- Root independent probes and final acceptance remain root-owned.

This batch does not claim C2 or product-complete.
