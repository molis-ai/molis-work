# T116 PR1b local candidate

状态：作者本地实现与约定验证已完成，包含根在同一合同追加的 non-array ui.views 单行修复。最终 H 已冻结；独立验证、评审、远端 CI、Full 与采用仍由根推进，本报告不宣称任务整体完成。

- M `db29f18d4f602fa8d9efb689a6a766aa9b07625f`
- Original PR1680 H `d37ec34c8498ab755bf9e34ba430e5648dacb0a8`
- Final H `3421e0e69645a7ac247672c590951bce3a9c5765`; tree `2bb1668425959a01907048e78837ba414af7845a`
- Initial merge candidate `d5a1ee558a622aa264d19da42921b3ab8aaa2d32`; tree `05bc0fb17f116690fd96630f6e563dab4806367e`. Final H is its normal one-line child; no history rewrite.
- Worktree `/private/tmp/t116-pr1b-dev`, branch `feature/t116-pr1b-complete`
- Initial merge d5 has exactly M/original H as its two parents. True merge-base is 31315, not slice base 7f. All 19 conflicts were resolved only after root accepted MERGE-PLAN/MERGE-REVIEW.

## Scope and repairs

Pure merge tree `a6700e2521ddeed592f6267ee06d0efc7f196375`: exactly original 44 paths, 827 added / 148 removed lines individually equal to B→H; all non-slice blobs/modes remain M. Final candidate adds only permitted frame-stage/factories leaves (46 paths total). Final binding and complete M→H diff: final-binding.json and final-scoped.diff. Historical pure-merge-binding.json, pure-merge.diff, three-fixes.diff, candidate-binding.json, candidate.diff and preserved-parent-blobs.json remain.

The three accepted findings of review 6543868013 are implemented:

1. Public Manifest parsing refuses actor_id/idempotency_key/control_token explicitly declared in path/query/stage_data.input. stageRequestParams independently refuses those input declarations, including when a value is absent, using the existing plugin.declaration_invalid / invalid error. Public Host declaredStageRequests and normal stage-model paths are tested. This proves page data refusal, not a historical overwrite of trusted actor identity or an exploit.
2. Frame L/icon are function properties. AST checks inspect the actual function parameter type.
3. Factories import constants/renderers/primitives from their existing owner leaves. No new barrel or public export was added by these fixes.

PR1b public additions remain page_routes, stage_data.input, StagePageModel.request and SDK matcher/projection exports. Shapes of actions are unchanged. Matching generated API snapshots retain current settings_address, T143 and terminal declarations; no hand-edited snapshot, resource budget, APPROVED_CEILINGS or gate rule change. Original boundary/privileges hunks alone are retained; downstream PR1c/T402/T403/T117/T118 are not closed here.

4. Root accepted the existing malformed ui.views regression in POST-T369.md (06:56Z). Only the pageRouteProblems loop now uses Array.isArray; inspectViewDeclarations retains the original plugin.declaration_invalid / invalid error. No assertion, matcher, projection, export or frozen shared file changed. views-final-delta.diff binds the exact one-line increment.

## Final-head fresh verification

- Matching whole build passed at final H. Actual and build-manifest source digest: `1b94d365d17b700e5de2bf8abf72fa3343a7e5722d0194eab535b97277d73432`; build created_at `2026-11-01T06:53:54.559Z`. views-final-build-build.json and views-final-tests-build.json bind H/status/digest.
- Complete stage-data-input 41/41 and plugin-declaration-rules 276/276: 317/317, zero skips/failures/cancellations, retries 0. Existing views-not-list assertion unchanged and passing. views-final-tests.log.
- Exact-M health, boundary, non-update API/actions, assets budget, imports and diff whitespace checks passed. views-final-health.log, views-final-gates-results.json, views-final-diff-check.log. No api:update after shared SDK freeze.
- Fresh actual serveWorkbenchAsset capture: all 48 body hashes and sizes equal the initial d5 candidate. Relative to M, all sizes remain equal and the same one frame script hash differs. views-final-asset-comparison.json and views-final-assets.log; the prior served-body AST proof is reusable by exact SHA equality, subject to root independent verification.

## Inherited evidence and input relevance

The following evidence executed on the d5 candidate source (or its named mutations), not on final H. Final H changes only iteration over non-array ui.views: arrays and undefined retain the same iteration, trusted-field checks and projection are unchanged; renderers, fixtures, golden bodies and served resource inputs are unchanged. The malformed case and complete declaration/projection suites were rerun fresh above. Root explicitly allowed reuse of the remaining successful mandatory files, four effective negatives and 66 HTML comparisons; their original raw results and bindings remain. This is scoped evidence reuse, not a fresh 139-file or golden run on final H.

## Passed initial-candidate author evidence

- Whole build passed; restored-final-build passed. Initial source digest `006e4a9ed83a0e1068b064067c57a9466c92d6d6ed91fe3c89fcc89568c4b056` matches build manifest. candidate-build.json and restored-final-build-build.json bind it.
- Seven complete target files: 135 pass, 0 fail/cancel, 2 explicit golden generation-hook skips. Includes both Goals route files. targeted.log / targeted-result.json.
- Strict standalone stage-data-input TypeScript check passed (typecheck.log).
- Normal golden with RECORD and GOLDEN_VIEW absent, DUMP=1: all 66 named full HTML files byte equal to the validated parent reference, including scripts/styles/JSON/real IDs; no missing/extra files. full-html-comparison.json, golden-html/candidate. Parent reference keeps its original execution provenance; parent-reuse.json traces T384 runtime bridge through the final T384 production digest to exact M (only two unrelated tests changed). No candidate recording or extra normalization.
- Four effective negatives: method restore 5 pass/1 target fail; root import restore 5 pass/1 target fail; removing declaration checks 32 pass/9 declaration target failures; removing projection check with its unused import 38 pass/3 projection target failures. All complete files; no retries/skips. Final restored stage-data-input + registration boundaries: 47/47 pass. See patches, logs, mutation-results.json, projection-fixed-results.json, per-stage build bindings.
- health against exact M passed; final boundary/API generation+nonupdate API/actions/assets budget/imports all passed. gates-results.json and raw logs. affected.json remains full=true for shared-core/assembly/six packages; local Full was not run or resumed.
- Actual serveWorkbenchAsset bodies: all 48 present/200, total 7,469,519 bytes at both parent matching artifacts and candidate, no size changes. 47 hashes equal. plugin-frame.js remains 190,838 bytes but differs in content: its minified client has 14 identifier spelling changes; TS AST leaves are otherwise identical and each renamed reference resolves to the corresponding same-position declaration. resource-difference/frame-served-identifiers.json and frame-served-body.json bind the actual 190,838-byte served bodies to the original measured hashes and retain all 14 byte offsets. Separate client-bundle diagnostics and raw pre-tightening render diagnostics remain; those raw render hashes are not the served hashes (Host tightenServedJs compacts them). This is not a claim of 48 identical hashes; no budget allowance requested or edited.

## Preserved failures and remaining work

- First projection mutant build failed TS6133 because removing the throw left pluginErrors unused. That is not behavioral evidence. Original mutation-projection-build.log/patch remain; corrected mutant only additionally removes that unused import, builds successfully and produces the three target failures. Other effective negatives were not repeated.
- First local resource comparison helper combined valid JSON stdout with SQLite warning stderr and failed JSON decoding; initial-gates preserves the failure. Parsing the retained successful measurements exposed the real frame hash difference above; resource-difference preserves that diagnostic. Repository resource gate passes unchanged.
- Mandatory batch first hit npm double-loading /dev/null as both user/global config in plugin-sample. Own runner 47268 was stopped with SIGINT after two complete files: request-failure-call-id.e2e passed, sample failed setup. mandatory.log and mandatory-interruption.json retain it. Two distinct private empty npm config files replace /dev/null for the resumed 140-file batch; successful full file is reused, only failed/not-run files resume. No production assertion relaxed.
- README-CHECKS.md / mandatory-by-package.json enumerate 139 unconditional unique README files; one covered by targeted, remaining 138 plus three actually modified export/boundary test files form 141. One passed in the interrupted batch; resumed 140 complete files finished with 139 pass / 1 fail. The original batch accounted for all 139 README files: 138 passed, plugin-declaration-rules failed (275/276 cases); three additional actually changed tests passed. Final H reran and passed the complete 276-case declaration file, so all 139 unique README files now have passing evidence with the explicit input-based reuse above. No mandatory skips/cancellations or hidden retries; test-summary.json retains per-file provenance. The earlier sample setup failure remains, and its resumed complete file passed. Conditional Home lifecycle/authorization-tail sets are not triggered by this change.
- Fresh fetch/secrets, final remote PR/base/CI state, independent verification/review, new exact-head Full and adoption belong to root. Original 28/9/101/HTTP5/view and historical golden reds retain old heads/authors; none promoted to this candidate's evidence.

All builds/tests use public machine slots; private TMPDIR is set inside acquired slot, private system Home/XDG, ad-hoc helper signing, file secret backend, dedicated test browser. No real Home/model/credentials. cleanup.json preserves the initial cleanup; final-cleanup.json records the final no-open-handle check and removal. Both roots were removed; source/index are clean. Author tree/dist and full HTML copies are retained for independent reuse.

## Goals README conditional supplement

Second review identified ten omitted page-rendering conditional files. GOALS-CONDITIONAL-CHECKS.md now gives each old PR1a execution H, actual CI checkout, original complete result, test/fixture/owner-leaf equality and the changed factory loading path. Since every file consumes that changed runtime factory path, all ten were freshly run at final H against the already matching whole build: 43/43, zero skip/fail/cancel/retry. goals-conditional.log/result/build.json retain the raw and binding; no other successful batch was replayed. This supplements the 139 unconditional files rather than redefining that count.

## Shared SDK window and handoff

SDK-WINDOW.md and final-binding.json confirm all four frozen SDK/API blobs are unchanged at final H and in the clean working tree. Their write window remains released for root to assign T144 in its independent tree; Developer 3 ownership remains. No T144 work was started and no further PR1b source edits are planned.

The initial malformed-views failure, npm configuration interruption, first ineffective projection-mutant build and resource helper failures are all retained. VIEWS-ARRAY-FINDING.md records both diagnosis and final resolution. README-CHECKS.md and test-summary.json preserve per-stage provenance.

Root next owns independent verification/review (including the 14-byte served frame claim), fresh fetch/secrets, remote PR/CI, exact-head Full and adoption. No push, GitHub write, Full run, real Home mutation or automatic adoption was performed here. Author worktree, dist, dependencies and copied full HTML remain available; only this task's private temporary execution roots are removed.
