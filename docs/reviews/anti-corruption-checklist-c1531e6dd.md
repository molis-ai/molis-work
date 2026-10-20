# Anti-corruption checklist

Reviewed commit: `c1531e6dd1bc2692826c3bf3e9b8a86317a98be6` (`main` of the review checkout, equal to `origin/main`).

Measurement: `node scripts/check-health-gates.mjs --base origin/main --report` (see `health-gates.txt`, merge-base `c1531e6d`, exit 0). A checked item is either **pass** or names a finding in `anti-corruption-report.md`. No item is unchecked.

Groups: category, scenario, feature, path.

## Category

Health-gate families (only-decrease unless noted):

- [x] C-GATE-GIANT giant units: partial, finding F-03. Health report: 143 units, base 143; 4 stylesheet/static-data exceptions; 139 still to split.
- [x] C-GATE-TEST-IMPORTS test-internal imports: partial, finding F-04. 494 in 244 files, base 494.
- [x] C-GATE-SPLITS same-package source/build splits: pass. 0 in 0 files.
- [x] C-GATE-COMPAT compatibility markers: partial, finding F-05. 9 in 6 files, base 9.
- [x] C-GATE-PATCHES in-place schema patches: pass. 0.
- [x] C-GATE-OLDNAMES old names: partial, finding F-06. 3 in 3 files, base 3.
- [x] C-GATE-EMPTY-SCRIPT browser-script empty catches: partial, finding F-07. 136 in 52 files, base 136.
- [x] C-GATE-FETCH raw fetch in browser programs: partial, finding F-08. 87 in 44 files, base 87. This run exited 0, so the workbench zero rule held.
- [x] C-GATE-ERROR-CLASS error subclasses: partial, finding F-09. 28 in 28 files, base 28.
- [x] C-GATE-ERROR-SHAPE error-code shape: pass. 0 files.
- [x] C-GATE-HTTP hand-chosen HTTP statuses: partial, finding F-10. 87 in 24 files, base 87.
- [x] C-GATE-ERROR-OWNER error-code ownership: partial, finding F-11. Prefix violations 0. 57 owners over 1643 source files, 431 more that nobody owns.
- [x] C-GATE-TYPED typed host capabilities: partial, finding F-12. 190 in 24 entries, base 190.
- [x] C-GATE-ASSEMBLY hand assembly counts: partial, finding F-13. Host plugin files 30, `registerProvider` 24 in 13 files, hybrid plugins 16 in 5 entries. Base equals each count.
- [x] C-GATE-I18N translation conflicts: partial, finding F-14. Conflicting keys 192, base 192. Missing English 0. Dead keys 2437 are report-only.
- [x] C-GATE-API public API snapshots: pass. 64 snapshot files, 2481 declarations. This run exited 0.
- [x] C-GATE-SCRIPT-TEXT browser programs kept as text: partial, finding F-42. 130 in 100 files, base 130.
- [x] C-GATE-ANY explicit any: partial, finding F-16. 515 in 153 files, base 515.
- [x] C-GATE-CAST `as unknown as`: partial, finding F-17. 188 in 116 files, base 188.
- [x] C-GATE-FLOAT floating promises: partial, finding F-18. 3 in 2 files, base 3.
- [x] C-GATE-CONSOLE console calls: partial, finding F-19. 28 in 17 files, base 28.
- [x] C-GATE-TS-CATCH TypeScript empty catches: partial, finding F-20. 3 in 3 files, base 3.
- [x] C-GATE-PURITY contracts purity: partial, finding F-21. 6 in 6 entries, base 6.
- [x] C-GATE-EXPORT host `export *`: partial, finding F-22. 11 in 1 entry, base 11.
- [x] C-GATE-LAYER layer exceptions: partial, finding F-23. 10 in 11 entries, base 10.
- [x] C-GATE-REPO module repository exports: partial, finding F-24. 21 in 21 entries, base 21.
- [x] C-GATE-OUTSIDE plugin outside mentions: partial, finding F-25. 418 in 26 entries, base 418.
- [x] C-GATE-VENDOR vendored Prologue SDK count: pass. 1, limit 2. Package identity is F-32.
- [x] C-GATE-STRAY root strays: pass. 0.
- [x] C-GATE-SPEC-STATUS spec status lines: pass. Every `specs/` root directory has one.
- [x] C-GATE-DOCS document references: pass. None broken.
- [x] C-GATE-DEBUG debugger statements: pass. 0.
- [x] C-GATE-PARSE lint parse errors: pass. 0.
- [x] C-GATE-IGNORE biome-ignore: pass. 0.
- [x] C-GATE-SPEC-IDS spec acceptance ids: partial, finding F-26. Report-only: 15 of 30 specs numbered, 39 of 373 criteria cited, 300 problems.
- [x] C-RAC-01: pass on the plan branch. `form` is in `RUNTIME_ASSEMBLED` and `apps/local-host/src/project-plugins.ts` starts `createFormPlugin`. The frozen remainder is F-01. The migration doc's status sentence is F-40. The spec's 2026-10-12 verdict row still says the Form sample is unmerged (F-41); that row does not change this pass.
- [x] C-RAC-02: open finding F-02. `scripts/replay-plugins.mjs` is absent. `docs/system/CONTRACT-CHANGES.md` line 56 says the replay tool does not exist yet.
- [x] C-RAC-03: open finding F-39. `docs/system/EXTENSION-POINTS.md` section 2 (lines 37–51) writes 15 directions. Drills F1–F6 are lines 238–243 and stay above their targets. Directions 3, 6, 7, 9, 12, and 13 still say 无切片. Line 299 says X-1 through X-7 are not commitments until they are on the roadmap.
- [x] C-RAC-04: open finding F-03. `editor-browser.ts` is 3854 lines. `assistant-service.ts` is file 2081 and class `AssistantService` 1663 lines / 99 methods.
- [x] C-RAC-05: pass for structure. SSOT/CODEOWNERS generation, the contract-change document, and the CI product-subset job exist. This local health exit is not remote CI.
- [x] C-RAC-06: pass. `docs/system/PARALLEL-DEVELOPMENT.md` is the collaboration rule AGENTS.md points at.
- [x] C-RAC-07: partial, finding F-02, measurement limit F-33. This health capture ran static checks and public API snapshots. It did not run the page-asset budget. That budget is `node scripts/gates/page-assets.mjs`, a separate CI step at `.github/workflows/ci.yml:193` that reads the built host. The plugin replay corpus is absent.
- [x] C-RAC-08: partial, finding F-12. Typed host capabilities are still 190.
- [x] C-RAC-09: partial, findings F-10 and F-27. `effectGuard` re-checks authority after awaits. 87 tests still choose an HTTP status.
- [x] C-RAC-10: pass for only-decrease. Giant units 143 and test-internal imports 494 equal their bases. The remainder is F-03 and F-04.
- [x] C-RAC-11: open finding F-28. No isolated-Home skill smoke stands in for the missing replay script.
- [x] C-RAC-12: partial, findings F-05 and F-29. In-place schema patches are 0. Nine compatibility markers remain. The derived search index rebuilds on a version mismatch.
- [x] C-RAC-13: partial, findings F-29 and F-30. `homeStores()` in `apps/local-host/src/home-stores.ts` is the registry `docs/system/HOME-DATA.md` line 7 names. Line 7 still says the product backup command and the backup class on the registry are absent. The derived search index rebuilds. `spec.md` §12.4 line 2004 still says W4-11 is undelivered (F-41).
- [x] C-RAC-14: open finding F-30. `docs/system/HOME-DATA.md` lines 6 and 293 say the real Home listing did not open databases.
- [x] C-RAC-15: pass for the machinery. This health run compared merge-base `c1531e6d` and exited 0. Unmarked compatibility remains F-05 and F-29.
- [x] C-RAC-16: open finding F-31. The spec status line still says the whole line is unfinished. The migration status sentence is F-40. Two §12.4 rows contradict this tree (F-41).
- [x] C-RAC-17: partial, findings F-27 and F-32. The invariant table shape was checked by this health run. `security-invariants` is `continue-on-error` and is not in `Verify` needs. The vendored package is `e4afd1a7`.
- [x] C-RAC-18: open finding F-33. This review ran health gates only. That capture is static checks and API snapshots. The page-asset budget at `.github/workflows/ci.yml:193` was not run.
- [x] C-RAC-19: open finding F-01. Waves 4 through 6 are not finished. Form on the Runtime, the W4-11 registry, and W4-03 slice 1 are in the tree. Todo and 16 other build-time ids, the replay script, the drills, and the giant split remain.

## Scenario

- [x] S-AUTH tail after the last await: pass. `packages/kernel/src/action-settlement.ts` line 40 calls `assertAuthority()` after the awaits in `beforeEffect`. `tests/mcp-effect-authority.test.ts` and `tests/action-authority-tail.test.ts` exist. Not executed.
- [x] S-MODEL-SWITCH: pass for package identity. Provenance `source.commit` is `e4afd1a718bd8a8629d52526b953bbe75149baa6`, and `docs/system/SECURITY-INVARIANTS.md` line 71 names `prologue-sdk-0.0.0-rc.1-found-tools.tgz` and `e4afd1a7`. `tests/agent-sdk-effects.test.ts` line 193 names `W2-18-MODEL-SWITCH-01/02`. Not executed. CI scope remains F-32.
- [x] S-MCP effect authority: pass for the source shape in S-AUTH. The named test file exists. Not executed (F-33).
- [x] S-PREPARE refusal: pass for the test file existing. `tests/action-prepare-refusal.test.ts` is in the tree. Not executed. The shared-path HTTP remainder is F-10 and F-27.
- [x] S-SEARCH revoke while the index catches up: pass for the test name existing in `tests/system-search.test.ts` as cited by the spec's C-03 row. Not executed (F-33). The derived index rebuild is F-29.
- [x] S-PAGES stopped reply: pass for the test file `tests/assistant-thread-reply.test.ts` being the name the spec's C-02 row cites. Not executed (F-33).
- [x] S-PURGE scope: partial, finding F-30. `apps/local-host/src/installer/uninstall.ts:47` reads `homeStores().paths(this.homeDirectory)` when purge is on. Line 7 still says there is no product backup command.
- [x] S-CHARACTERS schema: partial, finding F-38. `characters` stays in `HYBRID_RUNTIME_PLUGINS` and `apps/local-host/src/characters-host.ts` exists. The health report line records decision 26.
- [x] S-COMPUTER refusals: partial, finding F-32. `docs/system/SECURITY-INVARIANTS.md` line 74 says the four on-device refusals are not recorded and the tests run locally only.
- [x] S-GOALS restore: pass. `modules/goals/src/lifecycle-archive.ts:264` calls `validateRelationGraph`. `tests/goals-lifecycle-actions.test.ts` line 25 names `W2-18-GOALS-01/02`. Not executed.
- [x] S-ASSISTANT-SEND intent before await: pass. `apps/workbench/src/scripts/client/assistant-send.ts` line 24 builds `intent` and line 36 `await draftWrite`. `tests/assistant-send-intent.e2e.test.ts` line 6 names `W2-18-SEND-01` and line 158 names `W2-18-SEND-02`. Not executed.
- [x] S-SCHEDULE projects.schedules: pass. `apps/local-host/src/web-project-schedulers.ts:49` registers `id: "projects.schedules"`. `tests/host-periodic-tasks.test.ts` exists. Not executed.
- [x] S-GMAIL history page longer than the batch: pass. `plugins/official-integrations/gmail/src/history-cursor.ts:71` keeps `position: { historyId, offset }`. `tests/integration-pagination.test.ts` names `W2-18-GMAIL-01` at lines 20, 64, and 94, and `W2-18-GMAIL-02` at lines 20, 94, and 124. Not executed.
- [x] S-SEARCH-INDEX rebuild: open finding F-29. `packages/storage/src/adapters/text-search-index.ts` line 23 is `SCHEMA_VERSION = "2"`. Line 146 drops `search_fts`, `search_documents`, and `search_sources` when the version mismatches. Line 160 writes the schema. `HOME-DATA.md` line 30 says this derived store is outside refusal.
- [x] S-FRAME clickjacking header: pass for the invariant row S-21 naming `web-server.ts` and `PAGE_CSP`. Not executed (F-33).
- [x] S-SECRET not returned: pass for the salt remaining an old name (F-06) while the store file exists. `file-secret-store.ts:65` is `ENV_KEY_SALT = "goalboard-feed-secretstore-v1"`.
- [x] S-PUBLIC-ADDRESS five implementations: open finding F-34. `isPublicAddress`, `publicAddress`, `isJellyPublicAddress`, AnySearch `BlockList`, and `isPublicDnsHostname` are five separate functions. Section 4 line 72 says so.
- [x] S-DESKTOP-IPC: open finding F-35. `apps/desktop/src-tauri/tauri.conf.json` has `"csp": null`. Section 4 line 67 says the iframe reach of `pty_spawn` was not measured.
- [x] S-TOKEN wide file kept: open finding F-36. Section 4 line 70. Resolver named by S-06 is `apps/local-host/src/web-control-token.ts`.
- [x] S-SEATBELT macOS only: open finding F-32. Section 4 line 73.
- [x] S-EXT drills: open finding F-39. F1 is 12 against a target of 1. Direction 1's current count is 11, and the drill table was not remeasured.

## Feature

- [x] FTR-FORM: pass for Runtime start. `RUNTIME_ASSEMBLED` maps `form` to `@molis-ai/molis-work-plugin-form`. `project-plugins.ts` lines 16, 187, and 204 start `createFormPlugin` with `FORM_DATABASE`. `plugins/native/form/src/client.ts` is 8 lines at this commit, so it is not a giant file. Host files `form-actions.ts` and `form-native-plugin-http.ts` are absent.
- [x] FTR-TODO: open finding F-01. `todo` is on `BUILD_TIME_ASSEMBLED`. `plugins/native/todo/src/client.ts` is a giant file of 1240 lines (F-03).
- [x] FTR-CHARACTERS: open finding F-38. Hybrid, and `characters-host.ts` remains.
- [x] FTR-SHELF: partial, findings F-13 and F-03. Hybrid. `client.ts` is 1708 lines. Browser-script empty catches: 8 in `client.ts` and 8 in `settings-client.ts` (F-07).
- [x] FTR-CODING: partial, findings F-13 and F-03. Hybrid. `client.ts` is 1642 lines. Browser-script empty catches: 13 (F-07).
- [x] FTR-GIT: partial, finding F-13. Hybrid.
- [x] FTR-FILES: pass. On `RUNTIME_ASSEMBLED` only.
- [x] FTR-DIFF: pass. On `RUNTIME_ASSEMBLED` only.
- [x] FTR-TEXT-STATS: pass. On `RUNTIME_ASSEMBLED` only.
- [x] FTR-ISSUES: partial, finding F-37. Home runtime at `apps/workbench/src/builtin-plugins.ts:99` (`runtime.scope` `"home"`). `plugins/native/issues/src/review-client.ts:2` exports `ISSUE_REVIEW_CLIENT_SCRIPT`.
- [x] FTR-ALCHEMIST: open findings F-01 and F-10. Build-time. `action-operations.ts` has 14 hand-chosen HTTP statuses.
- [x] FTR-ARTIFACTS: open finding F-01. Build-time.
- [x] FTR-COGNIA: open finding F-01. Build-time.
- [x] FTR-DATASET: open finding F-01. Build-time.
- [x] FTR-FEED: open finding F-01. Build-time.
- [x] FTR-GOALS: open finding F-01. Build-time. Old names `_boardId` are F-06. `planning-presentation.ts:12` is a compatibility marker (F-05).
- [x] FTR-IMAGES: open finding F-01. Build-time.
- [x] FTR-INBOX: open finding F-01. Build-time.
- [x] FTR-JELLY: open finding F-01. Build-time. `isJellyPublicAddress` is one of five public-address checks (F-34).
- [x] FTR-LINGGUANG: open finding F-01. Build-time.
- [x] FTR-PAGES: open finding F-01. Build-time. `editor-browser.ts` 3854 and `commands.ts` 2241 are F-03.
- [x] FTR-PLUGIN-BUILDER: open finding F-01. Build-time. `publicAddress` is F-34. `installed.ts` holds 3 compatibility markers (F-05).
- [x] FTR-PPT: open finding F-01. Build-time. `client.ts` is 806 lines (F-03).
- [x] FTR-SCHEDULE: open finding F-01. Build-time. The host periodic registration is S-SCHEDULE and passes on its own.
- [x] FTR-SESSIONS: open finding F-01. Build-time.
- [x] FTR-WORKFLOWS: open finding F-01. Build-time. `client.ts` is 1358 lines (F-03).
- [x] FTR-GMAIL: pass for the cursor scenario S-GMAIL. Official integration, not a catalog plugin. Test names `W2-18-GMAIL-01` and `W2-18-GMAIL-02` are in `tests/integration-pagination.test.ts`. Not executed.
- [x] FTR-ASSISTANT: partial, finding F-03. `assistant-service.ts` file 2081, class 1663/99. `assistant-island.ts` file 2277. Send intent order is S-ASSISTANT-SEND and passes.
- [x] FTR-SEARCH: open finding F-29. Derived `search/search.db` rebuilds.

## Path

- [x] P-ASSEMBLY `tests/builtin-plugin-assembly-gate.test.ts` lines 27–36, 42–47, and 126: pass for Form on the runtime map. Open findings F-01 and F-13 for the build-time set and `HYBRID_RUNTIME_PLUGINS`.
- [x] P-PROJECT-PLUGINS `apps/local-host/src/project-plugins.ts:16`, `:187`, `:204`: pass. Starts `createFormPlugin`.
- [x] P-FORM-PLUGIN `plugins/native/form/src/plugin.ts`: pass. The file exists. Host `form-actions.ts` and `form-native-plugin-http.ts` are absent.
- [x] P-SETTLEMENT `packages/kernel/src/action-settlement.ts:22` and `:40`: pass for S-AUTH.
- [x] P-SEND `apps/workbench/src/scripts/client/assistant-send.ts:24` and `:36`: pass for S-ASSISTANT-SEND.
- [x] P-GOALS `modules/goals/src/lifecycle-archive.ts:264`: pass for S-GOALS.
- [x] P-SCHED `apps/local-host/src/web-project-schedulers.ts:49`: pass for S-SCHEDULE.
- [x] P-GMAIL `plugins/official-integrations/gmail/src/history-cursor.ts:71`: pass for S-GMAIL. Names `W2-18-GMAIL-01` and `W2-18-GMAIL-02` are in `tests/integration-pagination.test.ts:20`, `:64`, `:94`, and `:124`. Not executed.
- [x] P-SEARCH `packages/storage/src/adapters/text-search-index.ts:23`, `:146`, `:160`: open finding F-29.
- [x] P-HOME-STORES `apps/local-host/src/home-stores.ts` `homeStores`: pass for the registry existing. Purge reads `homeStores().paths` at `apps/local-host/src/installer/uninstall.ts:47`. Backup command remains F-30.
- [x] P-HOME-DATA `docs/system/HOME-DATA.md` line 6 (real Home listing did not open databases), line 7 (registry `homeStores()` exists; backup command and backup class are still absent), and line 30 (derived `search/search.db` rebuilds): open findings F-29 and F-30. Line 8 is blank.
- [x] P-EXT `docs/system/EXTENSION-POINTS.md` lines 37–51, 238–243, 291–299: open finding F-39.
- [x] P-MIGRATION-DOC `docs/system/RUNTIME-MIGRATION.md` line 3: open finding F-40. The status sentence still says Form and Todo migration has not started. Line 39 still lists `RUNTIME_ASSEMBLED` as 7 and line 40 lists `form` inside `BUILD_TIME_ASSEMBLED`.
- [x] P-SPEC-RAC `specs/repository-anti-corruption/spec.md` §12.4 lines 1992 and 2004: open finding F-41. Line 1992 still says the Form sample is unmerged and the split is 8/18. Line 2004 still says W4-11 is undelivered. At this commit Form is Runtime-started and `homeStores()` exists.
- [x] P-SECURITY-DOC `docs/system/SECURITY-INVARIANTS.md` section 4 lines 67–74: open findings F-34, F-35, F-36, F-32. Line 71 matches the vendored package `e4afd1a7`.
- [x] P-CI-SECURITY `.github/workflows/ci.yml:374` and `:412-417`: open finding F-32. `Verify` needs do not include `security-invariants`. That job sets `continue-on-error: true`.
- [x] P-CI-HEALTH `.github/workflows/ci.yml` health job: pass for wiring. Blocking health gates use the same script this review ran.
- [x] P-VENDOR `vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1-found-tools.tgz.provenance.json` commit `e4afd1a718bd8a8629d52526b953bbe75149baa6`: pass for package identity. Count 1, limit 2. Section 4 still limits Seatbelt, Computer Use, and the refusal job (F-32).
- [x] P-REPLAY `scripts/replay-plugins.mjs`: open finding F-02. The path is absent. `plugins/native/probe` is absent.
- [x] P-LIMITS `tooling/gates/limits.json`: pass. file 800, classLines 300, classMethods 25, functionLines 150, vendoredPrologueSdk 2. The health report printed these limits.
- [x] P-GIANT-EX `tooling/gates/giant-exceptions.json`: pass for the four registered exceptions. They may not grow. The other 139 giants are F-03.
- [x] P-CODING-UNAVAILABLE `apps/local-host/src/assistant/assistant-coding.ts:32` `CodingUnavailable`: partial, finding F-09. One of the 28 subclasses. `ActionError` in `packages/contracts/src/platform/action-errors.ts:17` is the model class in `scripts/gates/error-scan.mjs` and is not one of the 28.
- [x] P-OLD-SALT `packages/storage/src/adapters/file-secret-store.ts:65`: partial, finding F-06.
- [x] P-OLD-BOARD `plugins/native/goals/src/document-collection.ts:11` and `goal-tree-materialization-order.ts:5`: partial, finding F-06.
- [x] P-PUBLIC `packages/plugin-sandbox/src/https-proxy.ts:17`, `apps/local-host/src/plugin-builder/network.ts:32`, `apps/local-host/src/jelly-source-reader.ts:10`, `apps/local-host/src/anysearch-transport.ts:14`, `plugins/official-integrations/rss/src/custom-rss.ts:102`: open finding F-34.
- [x] P-CSP `apps/desktop/src-tauri/tauri.conf.json` `"csp": null`: open finding F-35.
- [x] P-CHAR-HOST `apps/local-host/src/characters-host.ts`: open finding F-38. The file exists.
- [x] P-ISSUES-SCRIPT `plugins/native/issues/src/review-client.ts:2`: open finding F-37.
- [x] P-CONTRACT `docs/system/CONTRACT-CHANGES.md:56`: open finding F-02. The sentence names `scripts/replay-plugins.mjs` and says the tool does not exist yet.
