# 04 writer handoff

Writer: Grok 4.6 / xhigh / no-subagents. Sole production and repository-test writer.
Not claimed: root acceptance, overall completion level 4, install/release.

Root owns main spec/progress/acceptance, preview restart, and independent 1440/390 plus the English historical-page probe after this English mapping.

## What a user can do now (this slice)

- Unowned historical Goals show original description, requirements, planning and history reading. They do not advertise note/type/agreement/decision/closure/resume/draft-edit write controls. Valid protected POST still rejects `event_state.not_owner` with SQLite unchanged (root `04-fresh-root-historical.log`).
- Event-owned Goals keep current note/type/agreement/report/concern/decision/closure and reasoned completed/cancelled resume.
- Draft event-owned Goals can be set as the Board current Goal (the old accepted-only gate is gone). Missing and trashed Goals still reject.
- Packed fresh install walks current Runtime intent/note/state, same-key replay after restart, old-tool non-discovery and dispatch rejection, then removal and upgrade.

## Production changes

- `plugins/native/goals/src/event-document-ui.ts` / `event-document-forms.ts`: hide write buttons and forms unless `isEventStateOwner`; remove `legacyDraftEditorAvailable` / `data-open-goal-edit`; unowned next copy is historical reading, not “open to record”; set-active is available for non-archived, non-completed Goals.
- `apps/workbench/src/renderer.ts`: relation editor only when the Goal has an event owner. Reading of active and inactive relations remains.
- `modules/goals/src/board-commands.ts`: `setActiveGoal` no longer requires `definition_state === "accepted"`; trash/archive/satisfied checks stay.
- `apps/workbench/src/i18n/en.ts`: English for `阅读原来的说明、要求和历史。这里不能写入。` and `没有可记录的事件类型。`
- `scripts/check-package-boundaries.mjs`: drop retired `submitAuthorizedReview` token; keep `authority_source` / `conversation_ref` / `materializeAtomically` / `assert.throws` / `runtime_dialogue`.

## Tests adapted or deleted

Deleted (authorized): `tests/goals-draft.e2e.test.ts`, `tests/goals-safety.e2e.test.ts`, `tests/goals-project-policy.e2e.test.ts`. Mapping in `03c-handoff.md`.

Adapted, business kept:

| File | What was kept | What changed |
| --- | --- | --- |
| `tests/goal-event-document.e2e.test.ts` | Real UI planning/report/concern/decision/closure, stale rejection, input/retry | Closure conflict is `setAgreement` outcome change, not config-only `new_requirements`. Historical case uses a genuine unowned `createGoal` plus exact Claim/Run/Evidence, not demo V1. |
| `tests/goal-event-http.test.ts` | Original fields, old Draft POST 404, snapshot unchanged | Unowned pages must not emit write forms. |
| `tests/goals-document-ui.test.ts` | Draft editor absence | Unowned hides write triggers; event-owned keeps note. |
| `tests/e2e.test.ts` | Pack, Web setup, Codex/Claude backup, bind, generic-session recovery, remove, upgrade | Installed Runtime uses intent/note/state; old tools absent and dispatch-rejected; `McpClient.close` in `finally` immediately after create. |
| `tests/goal-read-entry.test.ts` | Current-Goal replay, payload collision, Host restart, scoped Goal URL | Host `createIntent`; reject missing/trashed, not “draft unworkable”; `goal_state` instead of Contract. |
| `tests/home-backup-recovery.test.ts` | Exact snapshot, Artifact v1/v2, Session history/encrypted body, missing-key recovery | Creation via `createGoalIntentCapability`. |
| `tests/goals-navigation.e2e.test.ts` | Network-fail current Goal and archive retry/reload/unarchive | After open, seed CORE Claim/Run/Evidence; capture `seeded` then assert those original records and Evidence body survive. |
| `tests/goals-records.e2e.test.ts` | Exact `RISK-FIRST-RESTART` hash navigation | Seed historical Risk, then read/reload. |
| `tests/goals-relation.e2e.test.ts` | Incoming `part_of` direction; inactive history reason/kind; reload unchanged | Direct create/deactivate form retired. Inactive `extends` + `relation.deactivated` event inserted via SQL. Mutations remain `tests/goals-proposal.e2e.test.ts`. |

## Commands and results

`pnpm_config_verify_deps_before_run=warn` on pnpm. No install.

| Command | Result |
| --- | --- |
| `pnpm_config_verify_deps_before_run=warn pnpm build` (after production/UI) | EXIT 0. Root copy: `04-fresh-build.log`. |
| `pnpm_config_verify_deps_before_run=warn pnpm boundary:check` | `errors: []`. Root copy: `04-fresh-boundary.log`. |
| `node --import tsx --test --test-concurrency=1 tests/goals-document-ui.test.ts tests/goal-read-entry.test.ts tests/home-backup-recovery.test.ts tests/governance-collaboration-module.test.ts` | 13 pass / 0 fail / 0 skip. Root copy: `04-fresh-unit.log`. |
| same runner `tests/goal-event-http.test.ts` | 12 pass / 0 fail / 0 skip. Root copy: `04-fresh-http.log`. |
| `pnpm_config_verify_deps_before_run=warn pnpm build` (after English mapping + archive/relation fixtures) | EXIT 0. |
| six-file browser group (first attempt after English/fixtures) | 10 tests, 9 pass, 1 fail (`legacy unfinished Goal history`, `SQLITE_CONSTRAINT_CHECK` from Evidence `result: "pass"`). Other five files all passed, including archive history, risk hash, relation inactive history, dialogs, review pointer path, and the current-event document write path. |
| same runner `tests/goal-event-document.e2e.test.ts` after `result: "passed"` | 2 pass / 0 fail. |
| same runner `tests/goals-proposal.e2e.test.ts` | 1 pass / 0 fail. |
| same runner `tests/e2e.test.ts` | 1 pass / 0 fail, 136578ms. Packed install, current intent/note/state, restart replay, old-tool rejection, removal, upgrade. |
| same runner `tests/i18n.test.ts` | 8 pass / 0 fail, including “every static renderer label has an English translation”. |

Root independent (not launched by this writer): `04-fresh-root-historical.log` PASS; `04-fresh-root-ui.log` PASS 1440 and 390. Chinese renderer strings were not changed after those probes; only English mappings were added.

## Original full-suite 17 failures

First full suite: 644 / 627 pass / 17 fail / 0 skip, EXIT 1. No second full suite.

| Original failure | Disposition | Evidence |
| --- | --- | --- |
| desktop Skill / shared Web-Desktop | kept; already passing in `04-targeted-fix.log` | that log 44/45, these two passed |
| packed install Runtime path | adapted, passing | `tests/e2e.test.ts` 1/1 |
| event document writes + stale closure | adapted, passing | document e2e first test |
| historical unowned reading | adapted to real unowned fixture, passing | document e2e second test; HTTP historical; root historical probe |
| event pointer/requirement/note/resume | already used `setAgreement`; passing | review e2e |
| CLI/MCP current Goal | adapted, passing | `goal-read-entry` unit |
| dialogs create/trash | already adapted earlier; passing | dialogs e2e in six-file group |
| `goals-draft.e2e` | deleted | 03c mapping |
| navigation model / tree copy | kept; passing in `04-targeted-fix.log` | that log |
| current Goal + archive history | seeded CORE Claim/Run/Evidence; passing | navigation e2e second test |
| `goals-project-policy.e2e` | deleted | 03c mapping |
| historical Risk hash | seeded Risk; passing | records e2e |
| relation incoming + inactive history | reading kept; direct form retired; passing | relation e2e + proposal e2e |
| `goals-safety.e2e` | deleted | 03c mapping |
| collection status copy | kept; passing in `04-targeted-fix.log` | that log |
| offline Home restore | fixture to current intent; passing | home-backup unit |

## Not run / blocked

- Full `tests/*.test.ts` not rerun (627 unaffected successes already counted).
- Skill `quick_validate.py` not rerun; no Skill files changed in this slice.
- Root English historical probe and any preview restart: root-owned.
- No commit, push, user install, real DB, or dependency change.

Four `tests/fixtures/goal-event-v35/*.sql` files were not modified. `desktop/20260902-022934.jpg` remains git-deleted.

## Root final acceptance — 2026-09-11

Root has reviewed the scoped changes and all retained original failure dispositions. `04-resumed-root-historical-language.log` passed the actual English HTTP page after the mapping fix; `04-fresh-root-ui.log` remains valid for1440/390 because the subsequent production edit only adds English mappings. Final isolated preview is http://127.0.0.1:62811/goals/V1 and returnedHTTP200 with the current Goal document. Overall F1–F9 level4 acceptance is complete; see `../../acceptance.md`. No user-environment install/migration, commit or push was performed.
