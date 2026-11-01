# T389 stage3 author delivery

Status: local engineering candidate complete; frozen for root independent verification/review, CI and adoption. Writer returned. No push, PR, Full, release or real-Home operation. Historical Linux cause remains UNKNOWN.

## Frozen inputs and scope

- Base: `db29f18d4f602fa8d9efb689a6a766aa9b07625f`.
- Final H: `13767116bd339558596e13ad6b36a3a3ed19f3cc`; tree `a418a6759f61743ad855c1969b5b9f1895e4cdef`.
- Worktree `/private/tmp/t389-fix-dev`; branch `feature/t389-feed-menu-restore`; final status clean.
- Accepted WO `/Users/yijunwang/code/mw-coord/coordination/2026-10-28/tasks/T-389.md` stage3 and its 06:18Z resource ruling. Only its seven authorized paths changed. `final.diff`, `scope-review.json`, `final-binding.json` hold exact delta/binding.
- Final build digest `d2a85118f5e012b58282053db67d4c7b526abd0004b6a70c09fa5e655b3475fb`; independently recomputed equal to manifest after commit, actual local package/dist resolutions in `secrets-result.json` and `admitted-checks-result.json`.
- Fresh fetch main `08642dcb92dbdad029d990813da56682d6864a23` differs from base only in `docs/system/EXTENSION-POINTS.md`; no consumed production/test/build input drift. `fetch-before-secrets.json` retains exact ref. Root owns integration.

## Result and behavior

applyUiState explicitly restores; preset and surface forward that existing intent through every setter in this chain. setFeedTask defaults to open and preserves only the menu-closing three properties for same-task restore. Selected source, normalization, filtering, changed-stage/chooser reset, save/broadcast remain. Other callers keep default open. No shared helper, tab/frame, public contract, DOM event, persisted menu, global flag or compensation reopening.

| Acceptance | Evidence/result |
| --- | --- |
| RAC-2840 | Original production with new complete test file fails once at the exact same-menu preserve assertion. Repaired complete file passes; same menu stays open and native no-reveal add → custom_rss → cancel succeeds. Initially closed menu stays closed. |
| RAC-2841 | Public Feed-created S, normal load, native all reselect → S select → S reselect all close menu and preserve correct selection/chooser hidden state; passes before and after fix. |
| RAC-2842 | Matching overall builds, mandatory complete-file results, exact resource ruling, final gates, commit scan and task cleanup below. Full/CI/adoption remain root decisions. |

`is-syncing` is false before and after; it is an applicable poststate, not proof of rAF execution or a true→false transition. Normal commit evidence combines the verified synchronous tail, task-after cursor/new Goal, same identity/body/tab/current collection and applicable surface/mobile/workspace/graph states with absence of observed browser refresh/navigation/member/second-response failure. It is not based only on marker or continue receipt. Host workspace-settings `opened_announce_failed/actions.missing` warnings remain in raw browser-run logs; no claim of all-layer warning-free execution.

## Effective red, candidate tests and build

- `baseline.log`, `baseline-result.json`, `baseline.exit`: exact unmodified base production, new full file once, jobs1/retries0, 1 pass/1 fail, no skip/cancel/todo; failure is RAC-2840 menu preservation `false !== true`. `baseline-menu-failed.png` retained. No other business-red attempt.
- `new-test-before-red.ts` preserves the baseline test. Afterwards only 90s initialized total-budget enforcement was tightened; target assertion, interaction, response gate and per-stage budgets unchanged (`post-red-test-delta.txt`). Final committed test matches `new-test-final.ts`.
- `build-final.log`/result: overall build for repaired business inputs, digest `5f4f30ed302a7ae29449be747998e8221fc57d936d898266b4f61293f0a65d01` and local dist resolution verified.
- `new.log`/result: new full file once, 2/2 pass. `rest.log`/result: remaining 37 complete files once, all pass. Together 38 unique files / 271 tests, fail/skip/cancel/todo 0, jobs1/retries0. Original journey 1440 and 390 both pass. `TEST-RESULTS.md` and `test-results.json` map every mandatory/conditional item; no old evidence substituted for changed-client consumers.
- After these tests, only the explicitly approved gate tuple and budget changed. `budget-update.log`/result and `build-admitted-workspace.log`/result: existing updater and overall build exit0, final digest above. No business input changed and no duplicate business run.
- Final strict new-file typecheck exit0 (`typecheck-final.log`/result). `git diff --check` passed.

## Resources and final engineering checks

48 actual built-host asset handler responses were measured by the existing page-assets gate. `assets-final-measurement.json` holds bytes/gzip; `hashes-M.json` and `hashes-H.json` hold status/bytes/SHA-256 for those same 48 routes. Hash collection calls the production built `createLocalWebAssets.serveWorkbenchAsset` with the same response-body adapter as the gate; it is not a browser network fetch. Matching old M retained `/private/tmp/t389-menu-dev` was read only and verified with digest `1daeedd848e8d1a5f41a444f4df57771d828db9a4fd9fd329a2ae20f581b65a5` and local resolutions in `hashes-M-admitted-result.json`, no old rebuild.

`response-hash-delta.json`: 47 assets byte/hash identical; only `/assets/molis-work-workbench.js` differs, 1150615→1150714 (+99 B), SHA-256 `8995f2396a7a2ac13a7e29bb9488d9211eeca2404f4ff2f8e33c24487b346167` → `cd1f2b0c362ca45071b6c27ffe17407dbabd99bb4be6c6e55451cddc5aa63f4f`. Same-scope adjacent comment shortening saved no compiled bytes; intent propagation is necessary because later setter calls otherwise re-close the menu. Root admitted exact `[1150615,1150714]` only. Consumed T362 tuple/reason replaced; existing --update changed only one budget entry. No algorithm/threshold/other permit changes and no T386 growth included.

All final checks exit0, per-step raw logs/result objects named below:

| Check | Raw |
| --- | --- |
| Actual affected | `affected-admitted.log`/`.json`/`-result.json`; full=[], documents-state.ts remains statically uncovered; mandatory tests not waived |
| Health against exact base | `health-admitted.log`/result |
| Boundary (includes test-kit build) | `boundary-admitted.log`/result |
| Source/build import consistency | `imports-admitted.log`/result: 0 of 1711 test processes mix source/build |
| Actual resource enforcement | `assets-admitted.log`/result: 48 assets / 7469618 bytes passed against merge-base |
| Full page-assets-budget file | `gate-tests.log`/result: 171/171 pass, no skip/cancel/todo, jobs1/retries0 |
| Commit secret scan | `secrets.log`/result: final H, 213 added lines scanned, no secrets |

Total candidate verification: 39 unique complete files / 442 passing tests (38 product/README files plus one useful gate-regression file). Full was not run or reopened. This local scoped evidence does not settle historical Linux causality or establish CI/platform/release/user acceptance.

## Preserved setup/wrapper failures and cleanup

`setup-attempt-1/` retains failed prepare referencing root-cleaned `/private/tmp/t369-dev`, then startup build guard failure before test runner execution. Corrected retained source and exact binding in `setup-source-correction.txt`/`prepare-result.json`; these are not business reds.

`pre-admission-queue-cancellation.json` retains six precisely identified own queued public-slot wrappers cancelled before any inner COMMAND, after the resource window arrived. All logs/exit -15 retained; no test cancelled. `build-admitted.log`/exit then retains an evidence filename collision with a cancelled hashes-M.log after successful budget update/build and before hash command launch. `admitted-resume.txt` records continuation only of unstarted remaining checks with distinct filenames and fresh build verification. No probability/business rerun or extra rebuild for this wrapper issue.

`cleanup.json`: own runtime/worktree/slot marker process scan and lsof cwd scan find no remaining task processes; nine task runtime subdirectories removed (Home/profile/temp/system/cache/module dirs), ignored task failure-image folder moved to evidence and removed. No name-wide process kill or other worktree cleanup. Dedicated test browser, isolated file-secret/ad-hoc system environment/public machine slots used throughout. No real Home4207, daily Chrome, Keychain or real model used. Frozen worktree/dist and raw evidence retained for root review; writer returned.
