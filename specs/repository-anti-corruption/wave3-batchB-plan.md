状态：第 3 波 B 批与 C 批（W2-10、W2-11 c/d）的工作计划，2026-10-11 由只读计划代理按各片方案（会话临时目录 `designs/`）对照 main `b2460cb62` 重新核对后写成；之后 #383–#385 已合入，维护七已核对完（本文 §0 里「Maintenance seven looks pending」一条已过时，见 spec §4.1 维护七）；10-11 弹窗定的四问见 spec §1。按片推进时以 spec §10 为准，本文是计划，不是记录。

# Work plan: wave 3 batch B, plus batch C (W2-10, W2-11 c/d)

Read-only plan made against origin/main `b2460cb62` (merge of #382), 2026-10-11. #383, #384 and #385 (W2-11 a0, a, b) are assumed to land first. Each slice was re-checked against main by its own agent, and their findings are merged here. Line numbers are from origin/main.

Abbreviations:
- **FB**: the 18 local compliance-fix branches. All 18 are merged into `integration/wave2b-compliance`, which is 0 commits behind main and touches 167 files.
- **api** = `pnpm api:update`; **actions** = `pnpm actions:update`; **assets** = `tooling/gates/page-assets.json`; **baseline** = `node scripts/check-health-gates.mjs --update --base origin/main`.

## 0. Facts that changed under the designs (cross-cutting)

- **Casebook (#369) and Experiments (#370) are gone.** These parts of the designs are now void:
  - W3-07 PR-1 §3.1 (observation by caller) and PR-5's observer labels;
  - W3-01 C's Casebook carve-out;
  - W3-02's Casebook exemption and the experiments edge in G1;
  - W3-09 Q3 and its Casebook CALL-CHAINS row;
  - W3-09 T5's experiments caller. Use Shelf at `web-request.ts:430-433` or Alchemist `:428` instead.
- **#372 (W3-01 A)** is merged.
  - The kernel already has `recorded`, `markCallRecorded()` and `recordedCallId()`, but nothing calls `markCallRecorded`.
  - Review fix `4ccb7e8ad` makes `ActionCallLog.record` skip refused calls (`action-call-log.ts:45-48`; pinned by `tests/action-call-log.test.ts:66,83`). W3-01 B flips this.
  - `shortCallId` lives in the kernel (`call-scope.ts:21`), and the workbench cannot import the kernel.
- **#374 and #375 (W3-03 A, B1)** are merged.
  - plugin-sdk is shared core with the `public-sdk-private-dependency` rule, and every SDK change recommends a full run.
  - The root, local-host, kernel, plugin-runtime and shelf packages already depend on the SDK, so the SDK-dependency edits planned in W3-02 A and C and in W2-10 PR-B are partly no-ops.
  - `PluginManifestError` now lives in `plugin-sdk/src/manifest.ts`.
  - plugin-sandbox no longer depends on the kernel, so W3-01 E cannot use `withCallId` there.
- **#380/#381/#382 (W3-06 A/B/C)** are merged.
  - `withPluginCaller` and `dependencyCaller` moved to `plugin-host-services.ts:97-108,184-202`.
  - `MolisWorkLocalHost` is 313 lines / 23 methods (frozen).
  - A did not add the `scope` parameter; that is now W3-06 F's job.
- **Recounts:**
  - `testInternalImports` is 962 refs in 341 files; with #385 it is about 944. The N-10 row `spec.md:334` (975/345) is stale.
  - `typedCapabilitiesTotal` is 244.
  - `giantUnits` is 159.
  - `contractsPurity` has 18 entries.
- **Frozen or near-limit units several PRs touch:**

  | Unit | Size now | Rule |
  | --- | --- | --- |
  | `LocalMcpServer` | 297/300 lines (`mcp-server.ts:35-331`) | Touched by W3-01 D, W3-02 H, W3-07 PR-4 and PR-7. Needs a prep extraction (P-MCP below). |
  | `class ActionService` | 413 lines / 15 methods, frozen | In-place edits only (W3-03 B2, W3-05-1, W3-09-3) |
  | `registerProvider` | 147/150 lines | In-place edits only |
  | `handleCodingPluginHttp` | 148/150 lines | W3-06 F must extract first; W3-02 G4 serializes behind it |
  | `assistant-island.ts` | 2,803 lines (baseline 2,804) | — |
  | `AssistantService` | 2,069 lines / 119 methods | No remaining PR needs to grow it; W3-02 G3 shrinks it |
  | `/assets/molis-work-workbench.js` | 1,396,931 bytes | May not grow |

- **Code-prefix rule.** The 10-10 row 「一律用主人名开头」 makes the per-owner renames mandatory, which turns W3-02 from L into L-core plus an XL rename track. It also means new codes in other slices must be owner-prefixed:
  - W3-10 uses `ui_host.*`, not `ui_request.*`;
  - W3-06 E uses `plugin.model_*`, not `model.*`;
  - the uncoded fallback is `actions.execution_failed`, not `actions.unexpected`.
- **Maintenance seven is still pending.**
  - CHECKLIST 4.3 has no boxes ticked, and spec §4.1 has no record.
  - There is a backup `~/molis-work-backups/2026-10-10-before-maint7`. Nobody read the real Home, so whether it ran is **unknown — confirm**.
  - No remaining PR blocks on it in code. But the real Home must not run main at `b2460cb62` or later until it is done, and its "done" chore PR touches CHECKLIST and the spec (hubs).

## 1. Fix branches to land first (hub conflicts in the first hours)

| Fix branch | Must land before (or the PR rebases by hand) |
| --- | --- |
| `fix/resident-host-transport` (`action-gateway.ts`, `resident-host-request.ts`, `project-deletion-gateway.ts`, `tests/action-gateway.test.ts`, S-07, CALL-CHAINS) | W2-11 c1, W3-01 D, W3-02 G1, W3-07 PR-7 |
| `fix/goals-event-decide-authority` (`project-capabilities.ts`, Goals `proposal-`/`goal-event-entry-capabilities.ts`, new `management-evidence.ts`, `apps/mcp/src/goal-event-commands.ts`, `docs/mcp*.md`, SECURITY-INVARIANTS, `goals-decision-actions`, `management-door-identity`) | W2-11 d, W3-07 PR-3/4/5, W3-02 H/R3, W3-09-2 |
| `fix/goals-input-accept` (Goals `actions.ts`, `input-actions.ts`, `http/*`, contracts `goal-inputs.ts`, `placement.ts`, actions.tsv, `api/contracts/modules/goals.txt`, assets) | W3-07 PR-8, W3-02 R2/H, W3-10-4 |
| `fix/typesafe-consumer-narrow` (`web-catalog.ts`, `functions-http.ts`, `contextual-http.ts`, `system-functions-actions` test) | W2-11 c3, W3-01 F, W3-02 G1/G2 |
| `fix/model-templates-host` (`web-catalog.ts`, local-host `index.ts`, `host-complete-text.ts`, PROLOGUE-AI) | W3-01 F, W3-06 E, W3-07 PR-5 |
| `docs/batch-b-drift` (CALL-CHAINS `:283,:292`, coding-plugin specs, SKILL) | W3-07 PR-5/8/9 |
| `fix/sessions-purge-after-commit` (HOME-DATA `:44`) | W3-06 F, W3-01 B docs, W3-02 R4a |
| `fix/feed-promotion-checks`, `fix/schedule-readiness-hint` | W3-02 E |
| `fix/blank-discard-guards` | W3-02 D, W3-05-1 survey |
| `fix/alchemist-model-and-pulse-scope` | W3-05-1 survey, W3-02 G1/J5 |
| `fix/studio-english` | W2-10 C (`agent-studio.e2e` import block), W3-10-1 (`gap-en.ts`) |
| `fix/touch-targets-360`, `fix/workbench-forget-discarded`, `docs/model-ready-single-owner` | W3-10 (asset budget and `settings-directory.ts`), W3-06 E docs |
| `docs/lark-mcp-npm-archive`, `fix/product-version-carriers`, `docs/maintenance-six-record` | Doc-level only: CHECKLIST, HOME-DATA, local-host README |

**Safe to start before the fix branches land** (no file overlap, or doc lines only):
- W2-10 PR-0
- W3-02 A and B
- W3-03 B2 and C
- W3-05-1/2 code
- W3-06 D0
- W3-07 PR-1+2
- W3-10-1a
- the P-MCP prep
- W3-01 B code and tests (rebase its doc hunks after the FB land)

## 2. Per-PR plan

Each PR is listed as: what it changes; decisions it applies; dependencies; hub files and FB overlap; gates; size, risk and fail-first tests; open questions.

### W2-11 (a0/a/b = #383/#384/#385, queued; remaining c1, c2, c3, d)

**W2-11-c1: test-kit `./local-web`, the `tests/fixtures/test-home.ts` harness, and the MCP-caller group.**
- **Changes:**
  - new `packages/test-kit/src/local-web/{client,management,index}.ts` and its export;
  - new `tests/fixtures/test-home.ts` (`serveTestHost`, `openTestHome`), which exists on no branch yet;
  - `goal-browser.ts` (232 lines) gains `controlToken` and `web`;
  - tests: `workspace-read-actions`, `production-action-mcp` (both to 0), `external-mcp-actions`, `workflows-action-steps`, `action-gateway`, and grants only in `external-mcp-dispatch` and `feed-sync-authority`;
  - docs: SSOT, CONTRACTS-AND-OPERATIONS, spec §5.1 row.
- **Decisions:** 10-08 #7 (grants only over HTTP); #12 (no testing subpath); #15; 10-10 「不定数字、只降不升」.
- **Dependencies:** after #384/#385 and FB `resident-host-transport` (gateway internals). Base for c2, c3, d and W3-09-1. Conflicts with W3-01 D on `action-gateway.test.ts`.
- **Hubs:** baseline, SSOT, spec, possibly `workspace-packages.mjs`.
- **Gates:** testImports about −19; nothing else.
- **Size/risk/tests:** M (~18 files), medium risk.
  - Fail-first: `packages/test-kit/tests/local-web.test.mjs` (headers, idempotency key, `orderGrantViews` ordering).
  - Fail-first: a new negative in `workspace-read-actions` (an unavailable provider is refused by the route).
- **Open:** subpath name `./local-web` collides with `local-web-actions.ts` (coordinator: e.g. `./local-host-http`). Keeping two in-process `authorizeMcpActions` for cancellation is a routine call; list it in the ledger.

**W2-11-c2: plugin grants through the real route.**
- **Changes:** tests `artifacts-actions`, `schedule-actions` and `images-concurrency` (to 0), `action-usages`, `work-session-mcp`, `cognia-http`, `home-mcp-actions` (dependency order), `personal-planning-actions` (user-only → 404 `actions.missing`), `system-search-lifecycle`.
- **Decisions:** as c1; #14 subset budget (`schedule-actions` is in the subset).
- **Dependencies:** c1. Parallel with c3 and d.
- **Hubs:** baseline only. No FB overlap.
- **Gates:** testImports −24. explicitAny and unknownCasts must not grow.
- **Size/risk/tests:** S–M (~10 files). No new test; use mutation checks (drop the audience filter at `action-service.ts:208`).
- **Open:** none.

**W2-11-c3: agent and function grants through the real route.**
- **Changes:** `system-functions-actions`, `functions-authoring-actions`, `function-agent-authoring.e2e`, `function-scene-authoring.e2e`, `agent-action-selection.e2e`, `personal-plugins-review-fixes`.
- **Dependencies:** c1. FB `typesafe-consumer-narrow` (`system-functions-actions:195,204`; trivial rebase).
- **Gates:** testImports −13.
- **Size/risk/tests:** S–M (6 files); needs a browser slot.
- **Open:** none.

**W2-11-d: Goals grants fixture, its callers, and the close.**
- **Changes:**
  - `fixtures/goals-mcp-grants.ts` and its **14** callers (22 call lines);
  - converted tests: the `goals-*-actions` family, `goals-mcp-actions`, `mcp-context-actions`, `mcp-resume-view`, `mcp-action-catalog`, `mcp-action-settings`;
  - owner assertions in `mcp-action-grants.test.ts`;
  - the per-reference ledger (required by the 10-10 row 「收尾时剩下的每一处列出原因与归属」);
  - spec N-10 row `:334` and §10.
- **Dependencies:** c1. FB `goals-event-decide-authority` (adjacent hunk in `goals-decision-actions`). Must precede W3-07 PR-5, W2-10 PR-D and W5-08.
- **Hubs:** baseline, spec, possibly local-host README.
- **Gates:** testImports −17.
- **Size/risk/tests:** M (~27 files), medium-high risk: S-08 and S-17 tests change what they assert. Mutation checks at `action-service.ts:208` and `mcp-action-grants.ts:15`.
- **Split if review wants it:** d1 = fixture plus callers; d2 = conversions plus ledger.
- **Open:** none.

### W2-10 (none merged; 9 PRs)

Figures on main: ≈283 touched files (≈277 after #385); 196 split processes.

**Splits are creeping in.** About 8 new split processes appeared in one day: W3-04 #378/#379, #374, and batch B's `larkMcpLaunch` and goals-mcp-grants users.

**W2-10-PR-0: commit the codemod and split checker** (`scripts/test-imports*.mjs`, test, one line in PARALLEL-DEVELOPMENT §6).
- Name the test `tests/health-gates-test-imports-tool.test.ts` so the blocking CI glob runs it.
- Dependencies: none, so it can go now. No hubs, no FB overlap.
- Gates: none.
- Size S–M (~6 files), low risk.
- **Open (gate change, needs @yijunw0212 review and a user OK):** an interim per-file "splits only fall" ratchet with PR-0, to stop the creep before PR-E.

**W2-10-PR-B: root devDependencies `@molis-ai/molis-work-server` and `-app-server`, plus 6 tests** (`cross-device-*` ×4, `im-local-project`, `server-database-baseline`).
- plugin-sdk is already a root dependency (#374). Old B's 11 SDK-only files move to A; its 5 browser files move to C.
- Dependencies: PR-0.
- Hubs: `package.json`, `pnpm-lock.yaml`, baseline. Run `pnpm build` before the install tests.
- Size S (~9 files).

**W2-10-PR-A1…A4: group A, specifiers only, generated** (~210–215 files in 4 cuts of ~53).
- A1 carries `DEVELOPMENT-REQUIREMENTS.md` and 9 README build lines.
- Dependencies: PR-0 and #383–#385; rerun the tool on the then-current main.
- Hubs: baseline in every PR.
- FB overlap: test files `lingguang-actions`, `host-inference-completion`, `tab-strip-share` (plain rebase), and READMEs of pages, plugin-builder, design-system, jelly, alchemist.
- Gates: testImports falls.
- Size L in total; each cut is over 50 files, accepted as mechanical. Medium risk: the module instance changes for ~100 processes. No fail-first test; review 18 dynamic-import sites against the baseline worktree.

**W2-10-PR-C: browser files** (~21 files: the design's 16 plus 5 from old B).
- Dependencies: after #384, and FB `studio-english` (adjacent import block in `agent-studio.e2e`).
- Needs a browser slot. Size M.

**W2-10-PR-D: the files W2-11 touches, plus the ledger and spec close** (37 files that import `mcp-action-grants`, `mcp-settings-store` or `project-action-availability` after #385, plus the 14 goals-mcp-grants callers).
- The tool emits the per-occurrence ledger: file:line, name, reason and owner slice.
- Dependencies: **all of W2-11 (c1, c2, c3, d)**.
- Hubs: spec, baseline.
- Gates: the split count reaches 0. Size M (40–50 files).

**W2-10-PR-E: the absolute split gate** (`scripts/gates/test-import-splits.mjs`, a call in `absolute()` at `check-health-gates.mjs:485`, the gate test, both AGENTS.md copies `:52` and `:64`, `tooling/gates/README.md`).
- Dependencies: PR-D. Gate PR, reviewed by @yijunw0212. Size S.

**W2-10 open questions:**
1. **H3 vs H1 routing for composition-root names (W5-08) has no §1 row.** It is treated as coordinator acceptance under 「W2-10、W2-11 照计划做」. The H3 name list must be recomputed: #385 added `projectActionAvailability`, batch B added `larkMcpLaunch`, and W3-04 added `AssistantService`, `AssistantStore`, `assistantAuthority` and `LocalHost` imports.
2. **Order.** Spec §10 says W2-10 goes 「排在…W2-11 之后」. The design needs only PR-D after W2-11. The coordinator states which reading applies; the recommendation is that A, B and C may go earlier.

### W3-01 (A = #372 merged; remaining B, C, D, E, F; G folded into B)

**W3-01-B: call-log rows carry the id; refused calls leave a 「未执行」 row; the hard rule is rewritten.**
- **Changes:**
  - `action-call-log.ts` (108 → ~180 lines; class methods 7 → 9):
    - rows get `call_id`, `operation`, `refused?`, `path?`, and folded `call_ids` / `capability_ids` (last 20);
    - every command is recorded, and queries only when they fail;
    - delete the skip at `:45-48`;
    - call `markCallRecorded()` after writing a row;
    - add `find(prefix ≥ 6)` and `recent()`;
    - only rows with an id are read.
  - Hard-rule text 「…不再写任何业务记录；…「未执行」诊断行只记谁、什么动作、结果与错误码」 goes in:
    - AGENTS.md `:30`, local-host README `:84-85`, PROLOGUE-AI `:185`, SECURITY-INVARIANTS S-12/S-18;
    - recommended also: `.github/pull_request_template.md:39`, `DEVELOPMENT-REQUIREMENTS.md:37`, `skills/molis-prologue-ai/SKILL.md:52`.
  - Also HOME-DATA `:229`, GLOSSARY `:81`, CALL-CHAINS §1.
  - Folded G: a comment at contracts `actions.ts:126-127` and closing action-architecture G9.
  - Optional: a 「未执行」 label in `capabilities.ts:83`.
- **Decisions:** 10-10 「诊断行可以记、硬规则写清只管业务数据」; 「只认新行」; 「保持现状、写清含义」 (G).
- **Dependencies:** A (merged). **Base for C, D, E, F, W3-09, W3-10, and W3-07's row-count tests.** Go first.
- **Hubs:** AGENTS.md, SECURITY-INVARIANTS, GLOSSARY, CALL-CHAINS, spec, contracts `actions.ts` (comment only), `skills/`.
- **FB overlap (doc lines only):** resident-host-transport, goals-event-decide, model-templates-host, docs/model-ready, sessions-purge, lark-mcp, product-version, batch-b-drift.
- **Gates:** none move (no api, actions, assets or giants). Test imports in `action-call-log.test.ts` stay at 3.
- **Size/risk/tests:** S–M (~14 files), medium risk: the real Home's `logs/action-calls.jsonl` changes shape, and 4207/4208 share it.
  - Fail-first in `tests/action-call-log.test.ts`: ids and operations; failed queries recorded; refused rows; folding; compaction classes; `find`; old rows hidden. Flip `:66` and `:83`.
  - Fail-first: a secret-leak case in `security-invariants-secrets`.
- **Open:** none for the user.

**W3-01-C: one id per page request, job and timer; header and body only when a row was written.**
- **Changes:**
  - `web-server.ts:135`, plus timers `:229/245/253/257`, edited in place inside frozen functions;
  - `web-request.ts:274` (the Feed tick; this also covers `:288` and the 30-second timer);
  - `web-http.ts:23` `sendLocalWebJson` and `native-plugin-http.ts:38` add the header and `call_id` only when `recordedCallId()` returns an id;
  - CALL-CHAINS chains 1 and 5.
- **Decisions:** #5; 10-10 「只在查得到时显示」. With this, W3-10's conditional PR 0 is not needed.
- **Dependencies:** B. Before W3-02 G1/G2/H and W3-10-1b.
- **Hubs:** `web-request.ts`, CALL-CHAINS.
- **Gates:** frozen functions are edited in place only.
- **Size/risk/tests:** M (~8 files). Shared core, full run.
  - Fail-first in `web-home-isolation.test.ts`: the body `call_id` equals the header and a row; no id after a successful read followed by a 404; none on a 403 auth refusal.
  - Fail-first in `feed-sync-authority`: the tick row id differs from the page's.
  - Packed-release "one kernel copy" check: unknown which test file fits.

**P-MCP (new prep PR, recommended): move `callV1Tool`'s database and project resolution (`mcp-server.ts:283-304`) into a free function in a new file.**
- The design had this inside W3-07 PR-4. Moving it first leaves `LocalMcpServer` (297/300) room for W3-01 D, W3-02 H, W3-07 PR-4 and PR-7.
- Dependencies: #385. Size S (2–3 files). No behaviour change.

**W3-01-D: MCP and the gateway carry the id.**
- **Changes:**
  - `handleMessage` `:320-329` runs inside `withCallId`; the wrapper sits outside the class;
  - `formatMcpToolError(error, recordedCallId())` at `:343`;
  - `apps/mcp/src/protocol.ts:8` gains `_meta?`;
  - `action-gateway-http.ts:19` whitelists `call_id` (a UUID on invoke; refused on discover);
  - `action-gateway.ts:36` sends it. Because FB resident-host-transport answers `{status, ok, body}` with no headers, the reply body carries `call_id` when a row was written;
  - docs: `docs/mcp*.md`, CALL-CHAINS chain 2, S-07, plus a `test:security` refusal test.
- **Decisions:** 10-07 MCP identity from the trusted session; 10-10 W3-09 row.
- **Dependencies:** B, C, #385, FB `resident-host-transport`, P-MCP. Before W3-02 H and W3-07 PR-4/7.
- **Hubs:** CALL-CHAINS, SECURITY-INVARIANTS. FB: resident-host-transport, goals-event-decide (`docs/mcp`).
- **Gates:** `LocalMcpServer` must not reach 300 lines.
- **Size/risk/tests:** S–M (~10 files).
  - Release note: a stdio MCP process from an older build fails after the upgrade, by "no compat".
  - Fail-first in `action-gateway.test.ts`: `call_id` missing, not a UUID, or sent on discover is refused; the row id equals the MCP id.
  - Fail-first in `goals-mcp-actions` / `mcp-action-settings`: the refused-write JSON `call_id`; `_meta` only on commands.

**W3-01-E: Assistant, Agent and scheduled rounds; the frozen record; sandbox; CLI.**
- **Changes:**
  - `assistant-authority.ts` `base()` `:51`. **`assistant-service.ts` is not touched.**
  - `agent-host-composition.ts:344,367`; `schedule-task-runner.ts:63`;
  - agent-host `index.ts:204,632` (in place);
  - `prologue.ts:577` (in place);
  - contracts `services/agent-host.ts` `:1/:478/:1329` (in place; frozen 1,732-line file);
  - sandbox `runner.ts`: an `AsyncResource` in `call()` instead of a kernel import (the design's kernel route is closed by #374);
  - `cli-project.ts:34` `withCallId`, or W3-07 PR-3 owns this line (coordinator choice);
  - docs: PROLOGUE-AI, CALL-CHAINS chains 3 and 8.
- **Decisions:** 10-10 「记在 Molis Work 自己的冻结记录」.
- **Dependencies:** B (C preferred, for the "round shares the page id" test). Before W3-07 PR-3 and W3-09-1b.
- **Hubs:** contracts `services/agent-host.ts`, `prologue.ts` (giant), CALL-CHAINS, api. FB: model-templates-host and docs/model-ready (PROLOGUE-AI).
- **Gates:** api `contracts/services/agent-host.txt`. Every frozen unit is edited in place.
- **Size/risk/tests:** M (~15 files).
  - Fail-first in `agent-host-composition`, `assistant-business-gateway`, `schedule-task-runner`, and `plugin-sandbox` (macOS).
- **Open:** naming. Keep `frozen.call_id` with a comment, because `AgentToolActivity.call_id` (`agent-host.ts:716`) is Prologue's tool-call id. Implementer's choice.

**W3-01-F: the diagnostics page looks calls up by 诊断编号; call-log rows show the id.**
- **Changes:**
  - `capabilities.ts:81-91`: rows show the id, a copy button, 「未执行」 and 「Molis Work」;
  - move `renderDiagnosticsSettings` (`settings-renderer.ts:156`) out to `settings-call-diagnostics.ts`, which shrinks the giant `createWorkbenchSettingsRenderer`;
  - `settings-view.ts`; `web-catalog.ts:254` (in place); new `web-call-diagnostics.ts`;
  - the copy script only inline in `SETTINGS_CLIENT_SCRIPT` (no `/assets` change);
  - English in `i18n/flow-en.ts`.
  - **Recommended:** create `packages/ui-host/src/call-id.ts` (`shortCallId`) and drop the kernel export, which only tests use. Use W3-10's `data-molis-call-id` attribute from the start, so W3-10 does not rewrite F's cells.
- **Decisions:** #5; 10-10 「诊断编号」.
- **Dependencies:** B. FB `typesafe-consumer-narrow` and `model-templates-host` (`web-catalog.ts`). Before W3-10-1b.
- **Hubs:** `web-catalog.ts`, GLOSSARY.
- **Gates:** about 12 new sentences need English or the translation gate fails. The giant shrinks, so run baseline.
- **Size/risk/tests:** M (~13 files). Fail-first: the settings render with `?call=`. Browser: `e2e.test.ts`.
- **Open:** where `shortCallId` lives, and the copy attribute and wording. These are coordinator calls (W3-01 vs W3-10 disagree; recommendation above).

### W3-02 (nothing merged)

**This slice is now XL.** User rule: every code is `<owner>.<reason>`. About 743 distinct dotted codes, 89 prefixes; the Goals family is 185 codes in 25 prefixes over about 334 sites. Spec §10 must record that "W3-02b is now required".

**W3-02-A: the model plus the Todo sample.**
- **Changes:**
  - new contracts `platform/action-errors.ts`, which moves `ActionError` out of `actions.ts:487`;
  - new SDK `errors.ts`;
  - `native-plugin-http.ts`: `mapError` optional;
  - Todo `error/store/organize/organize-actions/search/index/route-handlers` (anchors hold);
  - only Todo gains the SDK (`package.json`, `workspace-packages.mjs`, README);
  - `defineErrorCodes` checks the owner prefix;
  - CALL-CHAINS `:46`/`:58` stop citing mapper files; PLUGIN-DEVELOPMENT errors section.
- **Decisions:** 10-10 prefix rule; #15, #16, #17.
- **Dependencies:** none, so it can go now. Conflicts on hubs with W3-03 B2 and C (contracts `actions.ts`, SDK index): serialize and re-run api.
- **Hubs:** contracts `actions.ts`, api, `workspace-packages.mjs`, lockfile, PLUGIN-DEVELOPMENT, CALL-CHAINS, baseline. FB: batch-b-drift (CALL-CHAINS).
- **Gates:** api `contracts/platform/{actions,plugin}.txt` and `plugin-sdk/index.txt`. `TodoStore` (a giant) edited in place.
- **Size/risk/tests:** M (~22 files), full run. Fail-first: new `tests/action-error-model.test.ts`; `todo-plugin` expects 403/404 where it gets 400/400 today.

**W3-02-B: error gates** (`errorSubclasses`, `errorCodeShape`, `errorStatusDecisions`, and **`errorCodeOwner`**, which replaces the void `errorPrefixSpread`).
- Owner table in `tooling/gates/error-owners.json` (or in contracts).
- Dependencies: A. Before all R and J PRs.
- **W3-05-2 interaction:** W3-05-2 must either merge first, or reuse existing throws so it adds no new `PluginManifestError` literal (recommended: reuse).
- Gate PR, reviewed by @yijunw0212. Size M (~8 files). Fail-first: mutation tests in `tests/health-gates-errors.test.ts`.
- **Open:** the contents of the owner table (Q-b, below).

**W3-02-C: binders to the SDK; Runtime router codes; web layer; Coding client.**
- **Changes:** `actions.ts:421-480` → SDK `routes.ts`; plugin-runtime `routes.ts:114-129` → `actions.*`; `web-request.ts:265`; Coding `mcp-settings-client.ts:73,85`; 7 plugins gain the SDK.
- **Dependencies:** A. Serialize with W3-03 C (same Coding/Diff dependency lines; the second one's diff there is empty).
- **Hubs:** `actions.ts`, api, `web-request.ts`, `workspace-packages`, lockfile, assets, baseline.
- **Gates:**
  - contractsPurity: `http-status` and `bindOwnerPluginAction` → 0;
  - the 5 plugin packs shrink about 18 B each.
- **Size/risk/tests:** M (~35 files). Fail-first in `plugin-action-route`.
- **Cross-slice:** W3-09 T6 must assert `actions.plugin_disabled`/403, not `plugin.not_enabled`.

**W3-02-D: document plugins** (Pages, PPT, Dataset, Form, Lingguang, Workflows: mappers and classes go; Pages import handles 413).
- Dependencies: A; FB `blank-discard-guards`.
- Gates: assets (pages.js shrinks); `createWorkflowsActionHandlers` (a giant) only shrinks.
- Size M (~30 files).
- **Status change the design did not list (found in review, recorded here):** the publishable plugins (Pages, PPT, Dataset, Form) say "no publisher in this environment" with an availability object whose code is the owner's (`pages|ppt|dataset|form.unavailable`). `ActionAvailability` has no kind, and the kernel's `assertAvailable` (`kernel/src/action-service.ts`) raises it as an `ActionError` with the code and no kind, so the route answers 400 where the deleted mappers gave 409. The code and the message are the same and nothing is written; no client reads that status. D leaves it at 400 and pins all four plugins in `tests/document-plugins-error-model.test.ts` (and Pages in `personal-plugins-review-fixes`). The coordinator accepts this 400 until G1 (or A) carries it, or says otherwise.
- **Follow-up, for G1 (recommended) or A:** `ActionAvailability` gains an optional `kind`; `assertAvailable` and `unavailable()` pass it to the `ActionError`; the four `publishable` objects say `kind: "conflict"`; `pnpm api:update`; the four pins in `document-plugins-error-model` and the Pages case change from 400 to 409 in the same PR. Until then a plugin that needs a status for an unavailable capability uses a platform code (`actions.connection_required` is 503).

**W3-02-E: Feed, Inbox, Schedule.**
- Error classes become declarations. Non-persisted snake codes are renamed; persisted run codes wait for J3.
- Add `tests/schedule-readiness.test.ts` to the list (missed by the design).
- Dependencies: A; FB `feed-promotion-checks` and `schedule-readiness-hint`.
- Gates: api `contracts/modules/feed.txt`. Size M (~30 files).

**W3-02-F: Shelf, Jelly, Cognia, Images, host material errors.**
- Dependencies: A, #384.
- Size M (~25 files). No hubs.

**W3-02-G1: platform action surfaces, synonyms and fallbacks.**
- **Changes:** gateway server and client; `project-deletion-gateway.ts:87`; `resident-host-request.ts`; home-dock, search, placement and contextual HTTP; synonym sites (`web-panel.ts:78,103`, `web-request.ts:301,311`, `web-view.ts:33`, Alchemist two lines, artifacts and Inbox one line each, `memory-host.ts:340`).
- Dependencies: A, W3-01 C (and D for the gateway); FB `resident-host-transport`, `typesafe-consumer-narrow`, `alchemist`.
- **Also (from W3-02-D, see its section):** `ActionAvailability` gains an optional `kind` and `assertAvailable` passes it on, so `pages|ppt|dataset|form.unavailable` answer 409 again.
- Gates: the `ACTION_ERROR_KINDS` snapshot shrinks. Size M (~25 files).

**W3-02-G2: host pages and catalog.**
- **Changes:** delete `functions-http/route-error.ts`; fold `MolisWorkProjectCatalogError` (**24 sites in 8 files**); the artifact edge; edge refusal `host.request_refused` at `web-http.ts:54,84-107`.
- Dependencies: A, W3-01 C; FB `typesafe-consumer-narrow`.
- Hubs: local-host `index.ts`, SECURITY-INVARIANTS. Size M (~25 files).

**W3-02-G3: Assistant, memory, agent definitions; remove `mapError`.**
- Changes: `assistant-service.ts:2361-2393,2622` (shrinks); `assistant-island.ts` wrapper `~:207` and reader `:1883`; `memory-host.ts`; `agent-definitions-http.ts`.
- Dependencies: D, E, F, G2.
- **Island wrapper overlaps W3-10-4. Decision: G3 first**, and W3-10-4 then maps `details`.
- Hubs: both giants (both shrink), assets (shrink). Size S–M.

**W3-02-G4: host product surfaces** (browser, agent reviews, `web-mcp-action-settings.ts`, `coding-surface.ts`, Work `http/*`, Coding `routes.ts`).
- Dependencies: A. **Serialize after W3-06 F1/F**, which extracts from `handleCodingPluginHttp`.
- Gates: giants only shrink. Size S–M.

**W3-02-H: `MolisWorkV1Error` folds into `ActionError`; Goals HTTP on the SDK; one MCP renderer.**
- **Changes:**
  - delete contracts `platform/errors.ts` and `errors.txt`;
  - `goal-project-application.ts`, Goals `goal-event-application.ts`, `mcp-authority.ts`, `mcp-event-identity.ts`;
  - `mcp-server.ts`: same lines only, so `LocalMcpServer` stays below 300;
  - `apps/mcp/src/action-tools.ts`; Goals `http/events.ts`; 12 tests;
  - `apps/mcp` gains the SDK. **No code renames here.**
- Dependencies: A, G2, #385, W3-01 D, P-MCP; W3-07 PR-4 if it is ready first. FB `goals-event-decide-authority` and `goals-input-accept`.
- Hubs: api, contracts `package.json` exports, `workspace-packages`, lockfile, `docs/mcp`, CALL-CHAINS, CHANGELOG.
- Size M–L (~40 files).

**W3-02-R1 → R2 → R3: Goals codes → `goals.<old_prefix>.<reason>`.**
- **AST-scoped rename only.** `goal.trashed` and `goal.archived` are also stored event types, and the `goal-event-history/*.sql` fixtures must not change.

| PR | Scope | Notes | Size |
| --- | --- | --- | --- |
| R1 | `event_*` (~84 codes, mainly `modules/goals/src/event-*.ts`), plus `server/src/continuity/service.ts:155` | — | ~26 files |
| R2 | goal, board, planning, guidance, relation, policy (~42 codes); contracts `planning.*` union; `goal.not_found` merged into `goals.not_found` | Gates: api `contracts/modules/goals.txt`; GLOSSARY. FB `goals-input-accept`. | ~45 files |
| R3 | tree proposals, decisions, governance `request.*` (~57 codes); `apps/mcp` `tool-dispatch.ts:38`; `docs/mcp*.md`; CALL-CHAINS; one line in `skills/goal-advance` on the error body and prefix (it cites no Goals code today); CHANGELOG contract entry | FB `goals-event-decide-authority` | ~40 files |

- Dependencies: B and H. H and R1–R3 go through one integration run as a single MCP contract change, before 0.3.0.
- **Coordination with W3-07 PR-3/PR-4:** exactly one PR renames each pinned management code. Recommendation: W3-07 PR-3/4 first, then R3 updates their assertions.
- **Open:** Q-a (naming depth).

**W3-02-R4a/b/c: owner renames outside Goals.**
- R4a Work: `session`, `sessions`, `handoff` → `work.*`, plus the contracts private-work-context union and its api snapshot. FB `sessions-purge-after-commit`.
- R4b Artifacts: `artifact`, `document` → `artifacts.*`.
- R4c: `character` → `characters`; `inference` → `agent` (Q-b); `unified` → `diff`; Coding `kernel`/`diagram` → `coding`; `b23` → `jelly`.
- After B. S–M each.

**W3-02-R5: host single-use prefixes.**
- **`page.*` → owner grows `molis-work-workbench.js`**: choose same-length names or offset the bytes in the same PR.
- Gates: api `services/browser.txt` and `platform/app-host.txt`. M (~30 files).

**W3-02-R6: IM `server/`.** Its persisted `error_code` needs Q-c first.

**W3-02-J1…J7: non-dotted codes, by owner.**
- J1 plugin-runtime/SDK (persisted event delivery codes); J2 connectors; J3 Feed/Sources/Listener (persisted; the workbench reads `connector_rate_limited`); J4 Scheduler; J5 Alchemist (86 UPPER codes, 5 DB tables; FB alchemist); J6 Sandbox; J7 host misc.
- Plus **I** (error factories → `defineErrorCodes`, after R3) and **K** (`escapeHtml`, independent).
- The persisted J PRs wait for Q-c and a maintenance window. They can run beside wave 4.

**W3-02 open questions (not in §1):**

| Q | Question | Recommendation | Needs |
| --- | --- | --- | --- |
| Q-a | Goals naming depth: flat `goals.<reason>` merges 19 distinct codes (e.g. two `stale_version`) | `goals.<old_prefix>.<reason>` as a routine call; ask only if flat names are wanted | Routine call |
| Q-b | Owner table for non-plugin owners (host prefixes, `inference`, governance, kernel's `mcp.runtime_identity_missing`) | Routine call | Routine call |
| Q-c | Stored codes: Feed/Inbox runs, Sources, plugin events, Functions, Sessions, Alchemist, IM, `logs/action-calls.jsonl`. Options: maintenance rewrites them / clear them / leave history | Rewrite in a maintenance window, on a copy first | **User popup** |
| Q-d | Does the owner rule bind generated and third-party plugins (Studio chapter, `studio:replay`)? | Repo gate only for now | Routine call |

All MCP-visible renames must land before 0.3.0 (the first version installed outside the dev machine).

### W3-03 (PR-0/A/B1 merged = #373/#374/#375; remaining B2, C)

**W3-03-B2: action, Agent and method declaration checks move into the SDK, splitting both giant functions on the way.**
- **Changes:**
  - new SDK `action-declarations.ts`, `source-declarations.ts`, `agent-declarations.ts`;
  - delete contracts `actions.ts:494-658` (`inspectActionDeclarations` is now `:495-652`, 158 lines);
  - delete the four `*DeclarationProblems` (`search-sources:128`, `action-fragments:165`, `file-sources:139`, `placement:93`);
  - delete `plugin-agent.ts:32-47,193-368`;
  - kernel `action-service.ts:2/:13` import lines only;
  - tests: 10 move their import to the SDK; 6 go through `manifestProblems`;
  - docs: HUGE-CLASS-MIGRATION, PLUGIN-PLATFORM, action-architecture `:364`, CALL-CHAINS `:125`, READMEs, SSOT `:70`, `package-owners.mjs:42` comment.
- **Decisions:** 10-10 「放进插件开发包」; SDK is shared core; 「清单校验归 plugin-sdk」; #15.
- **Dependencies:** B1 (merged). Before W3-05-1. Hub conflicts with W3-02 A/C (serialize, re-run api).
- **Hubs:** contracts `actions.ts`, api, baseline, SSOT, CALL-CHAINS, spec. FB: doc lines only.
- **Gates:**
  - api: `contracts/platform/{actions,plugin-agent,plugin}.txt` and `plugin-sdk/index.txt`;
  - giants 159 → 157;
  - contractsPurity 18 → 13;
  - the `ActionService` class is untouched.
- **Size/risk/tests:** M (~44 files). The message order in `tests/plugin-declaration-rules.test.ts` is part of the contract: `MANY_IN_ONE_EXPECTED`, the 18-message Agent order and the 14-message Manifest order must stay green.
  - Fail-first: the SDK-import tests (the SDK does not export `inspectActionDeclarations` today).
  - Optional split: B2a (the 6 tests rewritten on main) and B2b (the move).

**W3-03-C: text compare into the SDK; delete `suggestedAuthoringBehaviors`.**
- **Changes:** new SDK `text-diff.ts` from contracts `workspace-text-diff.ts`; `workspace-artifacts.ts:722`; `functions.ts:326-354`; workbench `agent-review-surface.ts`; Coding `changeset.ts` and `materials.ts`; Diff (delete `text-diff.ts`; `index.ts:22-34`); workbench, coding and diff gain the SDK; tests (`diff-plugin`, two functions tests, and a new page-rule case in `functions-plugin`).
- **Dependencies:** A (merged); #384 (`workspace-packages`, SSOT). Serialize with W3-02 C.
- **Hubs:** `workspace-packages.mjs`, lockfile, api, baseline, SSOT, spec.
- **Gates:** api `contracts/modules/{workspace-artifacts,functions}.txt` and `plugin-sdk/index.txt`; contractsPurity −5 (to 8); assets should not change (measure).
- **Size/risk/tests:** S–M (~36 files), low risk. Fail-first: `diff-plugin` importing the algorithms from the SDK.

### W3-05 (none merged)

**W3-05-1: cross-reference checks at registration** (undo, background-job, fragment and subject-option targets exist in the same registration with the right operation, scope and paths; a declared `result_subject` position exists in the output schema; guessing is written down as a rule).
- **Changes:**
  - new SDK `action-cross-references.ts` (exported) and `schema-paths.ts`;
  - kernel `action-service.ts:44` and `:13` in place, so the class adds 0 lines;
  - SDK `manifest.ts:197` in place;
  - fixtures: `assistant-undo:33-35`, `assistant-business-gateway:416-420,467-470`, `home-offer-actions ~:93-98`;
  - docs: PLUGIN-PLATFORM, PLUGIN-DEVELOPMENT (the written inference rule), action-architecture rows, BACKLOG (3 rows), contracts `actions.ts` comment.
  - First commit = a survey of all built-in declarations.
- **Decisions:** 10-10 「保留猜、写成明文规则」 (this replaces the design's PR 3); 「放进插件开发包」; #15.
- **Dependencies:** stack on W3-03 B2. Run the survey after FB `alchemist`, `blank-discard-guards` and `feed-promotion-checks`. Before W4-01.
- **Hubs:** contracts `actions.ts` (comment), api `plugin-sdk/index.txt`, maybe actions, BACKLOG, spec.
- **Gates:** `ActionService` adds 0 lines.
- **Size/risk/tests:** M (~20 files). Risk: a bad built-in reference makes a project fail to open.
  - Fail-first: kernel `registerProvider` → `actions.definition_invalid`; `parsePluginManifest` → `plugin_declaration_invalid`; Runtime install → `plugin_manifest_invalid`.
  - **Keep it a separate function that skips incomplete shapes**, so PR-0's literals stay green.

**W3-05-2: artifact declaration checks** (title plus a preview action for each `artifacts.produces` type; v1 Manifests cannot produce artifacts).
- **Changes:**
  - new SDK `artifact-declarations.ts`; `manifest.ts` after `:109-113`;
  - plugin-cli `create.ts:23` and `sample-source.ts`; `examples/plugin-sample/*`;
  - about 9 fixtures, **plus `tests/plugin-declaration-rules.test.ts:232-242` `CONSUMES_INPUT`, which the design missed**. Give `OUTPUT_TYPE` a title and a preview action; rows `:256-271`, `:409` and `:572-575` would otherwise go red;
  - new `tests/action-artifact-references.test.ts` and `tests/fixtures/artifact-preview.ts`.
- **Decisions:** the AGENTS artifact rule; artifact-positioning A1/A4b/A7 (already decided).
- **Dependencies:** B1 (merged); independent of 1. **Add no new `PluginManifestError` literal** (reuse the problems array) so it can merge after W3-02 B. Needs a read-only listing of installed Runtime Manifests from a real-Home copy before merging.
- **Hubs:** BACKLOG, baseline.
- **Gates:** no api change, but a stricter Manifest contract (write it up per CONTRACT-CHANGES §3).
- **Size/risk/tests:** M (~25 files). `plugin-sample.e2e` needs an e2e slot.

### W3-06 (A/B/C merged = #380/#381/#382; remaining D0, D, E, F1, F, G)

**W3-06-M7 (chore, not code):** after maintenance seven runs, tick CHECKLIST 4.3, record it in spec §4.1, and delete `tests/fixtures/provider-identity-maintenance.mjs` and its test.
- Must land before F and G (both edit CHECKLIST and the spec).

**W3-06-D0 (new split): plugin platform Home plumbing.**
- `PluginPlatformOptions.home` becomes required; `home-side.ts`; `pluginFixtures`; two lines in `startPlatform` (139 → 141); `installed-plugin-host.ts:95`; `home: null` in **9** test files (10 call sites).
- Dependencies: #385. Hubs: `project-plugins.ts`, local-host README.
- Size ~16 files. No API change.

**W3-06-D: `services.homeStore`.**
- **Changes:**
  - new contracts `platform/plugin-services.ts`, re-exported from `platform/plugin.ts` (`:72`, `:359` `Omit`, `:366`);
  - plugin-runtime `platform-services.ts` (`index.ts` 760 → ~765);
  - local-host `plugin-home-stores.ts` and `plugin-host-services.ts`.
- **Decisions:** 10-07 platform scope; 10-08 #11; 10-10 「目录条目留到 W5-02」.
- **Dependencies:** D0. Serialize api with W3-03 B2 and W3-02 A/C.
- **Hubs:** contracts `plugin.ts`, api, `project-plugins.ts`.
- **Gates:** api `contracts/platform/plugin.txt` and `plugin-sdk/index.txt` (additions only). No giants grow.
- **Size/risk/tests:** M (~12 files after D0). Fail-first: `tests/plugin-home-store.test.ts`, including the production path.
- **Open (routine):** the temporary deny list of Host store names. Hardening: should `bundledGrants` also require `execution !== "sandbox"`? Recommend folding the guard in.

**W3-06-E: `services.model`** (only for declared `model:invoke` actions that are `concurrent`; through `hostTextGeneration` → agent-host only).
- **Changes:**
  - contracts types and `PLUGIN_MODEL_LIMITS`;
  - plugin-runtime `action-scope.ts` (AsyncLocalStorage) and `action-provider.ts` wrapper;
  - local-host `plugin-model-service.ts`;
  - SDK exports `instructed`, `defineInstructionPrompt`;
  - docs: PROLOGUE-AI §4/§8 (PMR-33), `skills/molis-prologue-ai/SKILL.md`, CALL-CHAINS chain 4 and §10;
  - codes `plugin.model_*`;
  - **no `call_id` to Prologue** (10-10 decision supersedes design §3.5 rule 8).
- **Dependencies:** D0. W3-01 E (docs). W3-02 A if it is merged (kinds rows). FB `model-templates-host` and `docs/model-ready`.
- **Hubs:** contracts `plugin.ts`, api, CALL-CHAINS.
- **Size/risk/tests:** M–L (~20 files). Fail-first: `tests/plugin-model-service.test.ts`, including a call after the action returns → `actions.expired`.
- **Coordinator trim option:** move `PluginDefinition.instructions` to W4-01/W4-02.

**W3-06-F1 (new split): move `plugin-route-operations.ts` out of `handleCodingPluginHttp`** (`coding-surface.ts:181-222`; no behaviour change; plugin-specific branches stay as hooks so `pluginOutsideMentions` does not grow).
- Before W3-02 G4. Size S.

**W3-06-F: complete the existing Home Runtime instance (implementation scope refreshed 2026-10-12).**
- **Current entry:** Issue already runs through `HomePluginHost` / `HomePluginExecutor` and the catalog's Home entry. Reuse that one instance and its explicit protected retry; the old empty-production-list design is superseded. The remaining business plugins stay at their current entries until W5-01/W5-02.
- **Changes:**
  - Wire D's `services.database` and E's instruction/model service into the Home executor, with the existing lifecycle, grants and post-model effect checks. Business SQLite facts remain with their owners.
  - Add trusted Home fixture declarations and shared bundled-definition identity checks. Only bundled definitions use `plugin_id` as provider and receive all declared permissions; other installations use `install_id`. Reject overlapping Home/project entries, impersonated built-ins and untrusted database declarations.
  - Complete the existing `services.storage` private KV contract in the Home Runtime database. Current schema becomes v2 with the private-value tables; v1 and damaged v2 databases are refused unchanged, before a storage constructor can add a missing table. No runtime migration, fallback or rebuild. Update HOME-DATA, CHECKLIST and independent schema fixtures together. The coordinator's read-only check found no such database in the real Home; any actual maintenance remains a separate decision after clone/count/rehearsal.
  - Prepare Home providers for action and scene discovery, authorize their actual scopes and installation generations, and isolate Home startup failure so unrelated Goals/project actions remain usable. Preserve failure state and explicit retry semantics.
  - Reuse F1's generic route operations with the structural fields Home actually has; keep Files/wiring/Coding hooks with their project owner. Dispatch the same Home instance after parsing project prefixes, retaining cancellation, mutation protection, upload limits, `page_context` and view revision.
  - The current HTTP route/action-client contract stays Home-scoped even behind a project prefix; do not manufacture trusted project identity from body, query or path. Project-scoped actions of a Home provider use the existing scoped action client and refuse a missing project.
- **Decisions:** spec §1, 10-10 Home/project division and bundled identity; 10-12 routine choices explicitly preserve the existing Issue instance, full private KV contract and current HTTP scope.
- **Dependencies:** D, E, F1, M7, #384. Serialize with W3-02 G4 after F. No new catalog owner, method lifecycle, business-plugin migration or public compatibility API in this slice.
- **Hubs:** project/Home assembly, SSOT, CHECKLIST, CALL-CHAINS and baseline. Keep all current Home-data/purge obligations; do not duplicate the existing Runtime backup registration.
- **Size/risk/tests:** L, high risk. Use public Host/HTTP/action entries with isolated Homes and a local model substitute. Prove one shared Home instance, trusted provider/grant refusal, cancellation/revocation/disable/reinstall recovery, KV persistence/isolation/CAS/failed-upgrade restore, strict nonempty v1 and damaged v2 rejection without changes, unrelated Goals access during Home failure, scene discovery, protected operations and existing Issue upload/retry paths. Existing giant classes may not grow; extract only the helpers required by these paths. Whole build, schema/version checks, API/action/resource checks, relevant README tests, security and coordinator-owned integration regression.

**W3-06-G: close-out docs.**
- Update RUNTIME-MIGRATION, EXTENSION-POINTS, ai-entry-inventory, Home-data/version/owner documents and the relevant plugin/Prologue Skill chapters to the implementation above. The coordinator owns spec §1/§10 progress.
- Fold into F if reviewable. Project-deleted delivery remains a documented migration obligation of the existing catalog owner. The snapshot script already states bundled provider identity, so do not add a gate-comment PR unless the final implementation actually changes that statement. Validate changed Studio-mounted Skill chapters through offline replay and isolated smoke as required.

### W3-07 (none merged; Q1/Q2/Q3 decided = convert / forward / keep)

**W3-07-PR-1+2 (fold 1 into 2): `actionClient(ref, preparePlugins)`; onboarding create and the two guidance reads call Goals actions.**
- **Changes:**
  - `project-host.ts:315-321`, with `syncActionClient` folded so the class nets −1 line;
  - `web-onboarding.ts:79-97`; `goals-actions.ts` read-only Host caller;
  - `assistant-authority.ts:145-152`; `agent-host-composition.ts:396-414`;
  - CALL-CHAINS `:272`.
- **Decisions:** N-12.
- **Dependencies:** none for the onboarding part. The guidance "failed-read row" test needs W3-01 B; until then assert "no typed row".
- **Hubs:** `project-host.ts`. No FB overlap.
- **Gates:** `pluginOutsideMentions` −2.
- **Size/risk/tests:** S (~10 files). Fail-first: `actionClient(ref, false)` starts no Runtime plugin; onboarding leaves one action row and no typed row.

**W3-07-PR-3: management caller factory; CLI on Goals actions.**
- **Changes:**
  - `bindGoalsManagementActions`, using the FB's `managementEventDecisionAuthority`;
  - `cli-project.ts`, `command-dispatch.ts`; delete `goal-tree-commands.ts` (4 `as unknown as`);
  - boundary rule `checkGoalTransportCallers` (CLI part) at `check-package-boundaries.mjs:570/591`;
  - PACKAGE-BOUNDARIES `:179`.
- **Dependencies:** PR-2; FB `goals-event-decide-authority`; W3-01 E (or own the `withCallId` line); W3-01 B for refusal rows.
- **Hubs:** `check-package-boundaries.mjs`, baseline.
- **Gates:** unknownCasts −4.
- **Size/risk/tests:** M (~12 files). The CLI wire must stay byte-identical. Fail-first: one action row per command, none typed (two rows today); boundary mutations.

**W3-07-PR-4: management MCP on Goals actions.**
- **Changes:** `tool-dispatch.ts` takes `McpManagementActions | null`; delete `goal-event-commands.ts`; `callV1Tool` port built outside the class (the resolution extraction moves to P-MCP).
- **Dependencies:** PR-3, #385, P-MCP, W3-01 D; FB `goals-event-decide-authority`. Before W3-02 R3 (see the W3-02 note).
- **Hubs:** `check-package-boundaries.mjs`. FB: `apps/mcp/README.md`, `docs/mcp*.md`.
- **Gates:** `LocalMcpServer` limit; unknownCasts −1.
- **Size/risk/tests:** M (~10 files). Fail-first: one row per tool call, none typed.

**W3-07-PR-5: delete the remaining Goals bridges.**
- **Changes:**
  - delete `board-entry-`, `goal-event-entry-` and `proposal-capabilities.ts`; keep and move `managementTreeAuthority`, `managementEventDecisionAuthority` and `management-evidence.ts`;
  - `goal-entry-contract.ts`; `project-capabilities.ts` (−10 registrations);
  - local-host `index.ts:153`;
  - `checkNoGoalTypedAdapters`;
  - CALL-CHAINS `:292`;
  - about 25 tests rewritten.
- **Decisions:** N-12; #15.
- **Dependencies:** PR-2, PR-4, W2-11 c1 and d, #385; FB `goals-event-decide-authority` and `batch-b-drift`.
- **Hubs:** local-host `index.ts`, `check-package-boundaries.mjs`, baseline, CALL-CHAINS.
- **Gates:** typedCapabilities −30; `registerProjectCapabilities` (155 → ~107) leaves the giant list.
- **Size/risk/tests:** L (~40 files). Fail-first: each deleted typed id answers `actions.dependency_missing`; `checkNoGoalTypedAdapters` mutations.
- **Optional split per consumer:** each of PR-2/3/4 deletes the bridges whose last caller it removed.

**W3-07-PR-6: plugin development becomes a Host function; `host_only` deleted.**
- **Changes:** `developInPrivateHost`; delete `pluginDevelopmentCapability` (`contracts/platform/tooling.ts:22-31`) and `host_only` (`app-host.ts:79-80`); kernel `index.ts:57`; `local-host.ts:154-158` (−4 lines from `LocalHost`).
- **Dependencies:** PR-5.
- **Hubs:** `local-host.ts`, api.
- **Gates:** api `contracts/platform/{app-host,tooling}.txt`; typedCapabilities −3.
- **Size/risk/tests:** S–M (~15 files). Fail-first: the plugin-development id answers `actions.dependency_missing`.

**W3-07-PR-7: CLI and management MCP forward to the resident host.**
- **Changes:** new client; new route `/api/internal/management-action` (control token, Origin, one-time key, `database_path` check) chained at `web-server.ts:175`; one line each in `runV1Cli` and `callV1Tool`; CALL-CHAINS §10.1 `:284`; S-03 and S-07 plus refusal tests; `docs/cli-and-development*.md`, `docs/mcp*.md`.
- **Decisions:** 10-10 「交给运行中的 Molis Work」.
- **Dependencies:** PR-3, PR-4; FB `resident-host-transport`; W3-01 C and D; P-MCP.
- **Hubs:** CALL-CHAINS, SECURITY-INVARIANTS, local-host README.
- **Size/risk/tests:** M (~14 files), **higher risk (a new local security boundary)**. Fail-first: the forwarded write's row with the id; in-process when the host is down; a refusal stops the command; five route refusals.
- **Coordinator choices:** a new route vs extending `/api/internal/action-service`; "belongs to this Home" by catalog lookup.

**W3-07-PR-8: Coding's four entries become Goals actions.**
- **Changes:**
  - Goals `actions.ts:75-84` and `event-command-actions.ts:37` gain the `plugin` audience, admitted only with `caller.host_plugin`;
  - `plugin-host-services.ts:97-108` `dependencyCaller` resolves the provider (new file);
  - contracts `modules/goals.ts` deletes three descriptors and types;
  - Coding `manifest.ts`, `routes.ts`, `goal-context.ts`;
  - `skills/molis-plugin-dev/examples.md:76`.
- **Decisions:** 10-10 「这一片就改」; W2-09 `host_plugin`; 10-10 W3-06 rows.
- **Dependencies:** PR-5; W3-06 D/E; FB `goals-input-accept` and `batch-b-drift`; then re-run actions after FB `alchemist` and `blank-discard`; W3-02 G4 rebases.
- **Hubs:** actions, api, maybe assets.
- **Gates:** actions (4 Goals rows); api `contracts/modules/goals.txt`; typedCapabilities −12.
- **Size/risk/tests:** L (~28 files). Split: 8a (provider resolution plus `actor_kind`) and 8b (audiences, Coding switch, deletions). Fail-first: Coding goes through actions; generated plugins are refused.

**W3-07-PR-9: typed-registry docs and `tests/typed-registry-inventory.test.ts`.**
- Dependencies: PR-6, 7, 8; W3-05 docs; FB `batch-b-drift`.
- Hubs: CALL-CHAINS, GLOSSARY, spec, `skills/`. Size S.

### W3-09 (none merged)

**W3-09-1 (stage 1a/1b/1c): cross-entry consistency tests, test only.**
- **Changes:** `tests/fixtures/cross-entry-subjects.ts`; `tests/action-cross-entry.test.ts` (picked up by the `test:contracts` glob); `tests/assistant-cross-entry.test.ts` (added to `ci-product-subset.txt`); CALL-CHAINS guard lines and §10.1 rows (drop Casebook); three READMEs; action-architecture `:347`. T5 uses a Shelf or Alchemist literal caller.
- **Decisions:** #5, #12, #14, #15; 10-10 W3-01 rows; Casebook deletion.
- **Dependencies:**
  - 1a (page, MCP, typed legs; T1, T2, T4, T5, T7): W2-11 c1 and W3-01 B, C, D.
  - 1b (assistant): W3-01 E.
  - 1c (status equals `actionHttpStatus`, T2b, T6, diagnostics page): W3-02 A, C, E, G1, H and W3-01 F.
  - Not blocked by W3-07 (T4 stays on `schedule.*`).
- **Hubs:** `ci-product-subset.txt`, CALL-CHAINS.
- **Gates:** none. The new files must start clean (no casts, no any).
- **Size/risk/tests:** M (~9 files). All T-cases fail on main. Run file 1 twenty times (it is in the blocking contracts step). **T6 asserts `actions.plugin_disabled`/403**, following W3-02 C.

**W3-09-2: a granted but unavailable action called by name — the host decides and records it; the assistant gives the same reason and code.**
- **Changes:** `mcp-catalog.ts`, `mcp-authority.ts`, `apps/mcp/src/action-tools.ts`; an in-place edit at `prologue-action-gateway.ts:357` (adds the code); `skills/goal-advance/SKILL.md:22`; `docs/mcp*.md`; CALL-CHAINS chain 2.
- **Decisions:** 10-10 「原因与错误码与页面一致、外部工具记一行」.
- **Dependencies:** 1; W3-01 B and D; W3-02 H (same files); #385.
- **Hubs:** CALL-CHAINS, `skills/`. FB `goals-event-decide-authority` (`docs/mcp`).
- **Size/risk/tests:** S–M (~9 files). Fail-first: T3 M (`mcp.tool_disabled`, no row, today); the assistant code assertion.
- **Open (routine):** forward every availability code, not only `plugin_disabled`.

**W3-09-3: every AI source must send the version it read (`actions.version_required`).**
- **Changes:** new kernel `version-precondition.ts`; in place at `action-service.ts:93`; an AsyncLocalStorage `runHandler()` in `action-settlement.ts` so a plugin's own nested commands are exempt; `assistant-authority.ts` deletes its local check and `assistant.version_required`; docs (goal-advance, `docs/mcp`, PLUGIN-DEVELOPMENT or `molis-plugin-dev`, PROLOGUE-AI, kernel README, CALL-CHAINS).
- **Decisions:** 10-10 「所有 AI 来源同一条规则」.
- **Dependencies:** 1; soft on W3-02 A; rebase with W3-03 B2 and W3-07 PR-2. Full run.
- **Hubs:** `ActionService` (in place only; `registerProvider` is 147/150), PLUGIN-DEVELOPMENT, CALL-CHAINS, spec.
- **Size/risk/tests:** M (~14 files), **high risk**: external MCP and Agent calls without a version now fail. T8 fails first.
- **Open (user):** does the `workflow` audience count as an AI source? Recommendation: no, unless workflow Agent steps already call as `agent` (unknown — check). Routine calls: which fields count (`expected_revisions`, `expected_updated_at`?); nested calls exempt.

### W3-10 (none merged)

**W3-10-0 (conditional):** not needed if W3-01 C applies the `recordedCallId()` rule. Check this at C's review.

**W3-10-1a: contract types, the `request-client.ts` helper, unit and security tests, and the embed swap in inline, unbudgeted pages** (settings, project settings, onboarding, chooser, side view, studio `agent-surface.ts:340-345`).
- **Changes:** contracts `platform/ui.ts` (types only); ui-host `request-client.ts` (< 260 lines); ui-host index and README; `CONTROL_CLIENT_SCRIPT` stays in `page-assets.ts` for now.
- **Decisions:** 10-10 toast, 「只在查得到时显示」 and disconnect rows; 「诊断编号」; `ui_host.*` codes.
- **Dependencies:** none hard. It can merge before W3-01 C.
- **Hubs:** `apps/workbench/src/index.ts`, root `package.json` (`test:contracts`), api, SECURITY-INVARIANTS, CALL-CHAINS. FB `studio-english` (`gap-en.ts`; prefer `flow-en.ts`), `resident-host-transport` and `goals-event-decide` (SECURITY-INVARIANTS).
- **Gates:** api `contracts/platform/ui.txt`. No asset change.
- **Size/risk/tests:** M (~15 files). Fail-first: `tests/ui-request-client.test.ts`, `tests/security-invariants-browser-request.test.ts`, a `client-script-undeclared` assertion.

**W3-10-1b: the helper goes into `molis-work-workbench.js`; migrate the Settings group (9 files); swap W3-01 F's cells; add the e2e `request-failure-call-id.e2e`.**
- Dependencies: W3-01 B, C, F; #384.
- **Assets:** `molis-work-workbench.js` (1,396,931) may not grow. The helper adds ~6–9 KB; the offsets save ~3.5–4.5 KB. **Probably short — measure.** If short, pull `side-panel-browser.ts`, `side-panel-files.ts`, `settings-directory.ts`, `background-tasks.ts` and `plugin-notifications.ts` into this PR.
- Size M (~25 files), medium-high risk.

**W3-10-2: onboarding and arrival pages, the capabilities asset, `connectors-settings.ts`.**
- `functions/client.ts` (a giant) shrinks; `molis-work-capabilities.js` shrinks.
- Dependencies: 1b, #384. S–M (~10 files).

**W3-10-3a: navigation and Feed.**
- `bootstrap.ts` `feedApi` → `api`. Readers include **`feed-rule-authoring.ts` (10 references, missed by the design)**, `events-primary` 12, `navigation-inbox` 4, `project-home` 5, `events-secondary` 1, `initialization.ts:95-96`.
- `navigation-feed.ts` (giant 1,019) shrinks; `editing-graph.ts:38-44` toast.
- Dependencies: 1b; FB `docs/model-ready`. M (~16 files).

**W3-10-3b: plugin mounting and Coding wiring.**
- `scripts/client/plugin-workbench.ts` (hub), `plugin-workbench.ts:35`, `initialization.ts:113-117`, Coding setup, companions, agent-review.
- The 5 plugin packs shrink.
- Dependencies: 1b; serialize with 3a (`initialization.ts`). M (~12 files).

**W3-10-4: assistant bar, placement, context actions, search, side panel.**
- `assistant-island.ts` wrapper `:194-211` (giant hub, may not grow); `placement.ts`; ports in `initialization.ts:75,121,125,127`.
- Dependencies: 1b; W3-02 G3 first; FB `goals-input-accept` and `touch-targets-360`.
- M (~12 files), high risk.

**W3-10-5: gate `rawFetchInScripts`.** Gate PR. Needs the user's OK (no §1 row). After 4. S.

**W3-10 open questions:**

| Question | Recommendation | Needs |
| --- | --- | --- |
| Does the 10-09 44px coarse-pointer rule cover the 诊断编号 button in toasts and error boxes? It needs a `touch-targets.ts` rule and a CSS offset | Yes | Coordinator, or user |
| Plugin pages (including Goals dialogs) keep showing browser English such as "Failed to fetch" until W5-04, against the 10-10 「不显示浏览器英文原话」 | Accept and record it as a transition | **User or coordinator** |
| The `rawFetchInScripts` gate (PR 5) | Yes | **User OK** (gate change) |

## 3. Who goes first (others depend on these)

1. **FB merges**: resident-host-transport, goals-event-decide-authority, goals-input-accept, typesafe-consumer-narrow, model-templates-host, batch-b-drift, sessions-purge. Plus #383 → #384 → #385.
2. **W3-01-B**: the base for C, D, E, F, W3-09, W3-10-1b, and W3-07's row tests.
3. **W3-02-A → W3-02-B**: the base for every W3-02 PR. W3-05-2 must avoid new error literals.
4. **W3-03-B2**: the base for W3-05-1.
5. **W2-11-c1**: the base for c2, c3, d, W3-09-1, and through d, W3-07 PR-5 and W2-10 PR-D.
6. **P-MCP**: makes room in `LocalMcpServer` for W3-01 D, W3-02 H, W3-07 PR-4 and PR-7.
7. **W3-06-D0** (then D and E in parallel), and **M7** after maintenance seven.
8. **W3-01-C** (before W3-02 G1/G2, W3-10-1b, W3-07 PR-7) and **W3-01-D** (before W3-02 H, W3-07 PR-4, W3-09-2).

## 4. Lanes (8 worktrees)

The order within each lane is the merge order. "Wait" marks a dependency outside the lane. Only one build and one browser batch run at a time on the machine. Full regressions run only on the coordinator's integration branches.

| Lane | Theme | Order |
| --- | --- | --- |
| **L1** | SDK declarations (kernel/SDK/contracts `actions.ts` hub, serialized with L4 on api snapshots) | W3-03-B2 → W3-05-1 → W3-05-2 (survey after FB alchemist/blank-discard/feed-promotion; real-Home Manifest listing) |
| **L2** | Call log and transports | W3-01-B (+G) → W3-01-C → P-MCP → W3-01-D (wait #385, FB resident-transport) |
| **L3** | Rounds, diagnostics and browser requests | W3-10-1a (now) → W3-01-E (wait L2 B) → W3-01-F (wait FB typesafe, model-templates) → W3-10-1b (wait L2 C) → W3-10-2 → W3-10-3a → W3-10-3b → W3-10-4 (wait L5 G3) → W3-10-5 |
| **L4** | Error model core (shares `actions.ts` / SDK-index hubs with L1: alternate merges, re-run api after each) | W3-02-A → W3-02-B (gate review) → W3-03-C → W3-02-C → W3-02-G1 (wait L2 C, FB resident) → W3-02-G2 → W3-02-H (wait L2 D, P-MCP) → R1 → R2 → R3 (after L7 PR-4) |
| **L5** | Error plugins and owner renames (all wait for L4 A; R and J wait for L4 B) | W3-02-D → W3-02-E (wait FB feed-promotion, schedule-readiness) → W3-02-F (wait #384) → W3-02-G3 → W3-02-G4 (wait L6 F1) → R4a/b/c → R5 → (R6, J1–J7, I, K: after Q-c, beside wave 4) |
| **L6** | Runtime services | M7 chore (after maintenance seven) ‖ W3-06-D0 → D → E (wait L2 E docs, FB model-templates) → F1 → F (+G) |
| **L7** | Management to actions | W3-07-PR-1+2 (now) → PR-3 (wait FB goals-event-decide, L3 E or own the CLI line) → PR-4 (wait P-MCP, L2 D) → PR-5 (wait L8 d) → PR-6 → PR-7 (wait FB resident, L2 C/D) → PR-8 (wait L6 E, FB goals-input-accept; split 8a/8b) → PR-9 |
| **L8** | Tests through entries, and cross-entry tests | W2-10-PR-0 (now) → W2-10-PR-B → W2-11-c1 (wait #385, FB resident) → c2 / c3 / d → W3-09-1a (wait L2 D) → 1b → 1c (wait L4 H, L3 F) → W3-09-2 → W3-09-3 → W2-10-A1…A4, C (quiet window; tool rerun) → W2-10-PR-D → W2-10-PR-E |

**Suggested integration branches for full runs:**

| Branch | Contents |
| --- | --- |
| I1 | W3-03-B2, W3-05-1/2, W3-03-C, W3-02-A/B, W3-01-B (kernel, SDK, contracts) |
| I2 | W3-01-C/D/E/F, P-MCP, W3-02-C/D/E/F, W3-06-D0/D/E, W3-07-PR-1+2, W2-11-c1…d |
| I3 | W3-02-G1–G4/H/R1–R3, W3-07-PR-3…6, W3-09-1/2/3, W3-10-1a/1b/2 |
| I4 | W3-06-F, W3-07-PR-7/8/9, W3-10-3a/3b/4, W3-02-R4/R5, W2-10 rest |

**Hub hotspots to watch across lanes:**
- contracts `platform/actions.ts` and `plugin.ts`, SDK `index.ts`, `tooling/gates/api/**`: L1, L4, L6.
- CALL-CHAINS: L2, L3, L4, L6, L7, L8.
- `apps/local-host/README.md`: L2, L6, L7, L8.
- `tooling/gates/page-assets.json`: L3, L4, L5.
- `tooling/gates/baseline.json` everywhere: never hand-merge it; regenerate it with baseline.
- `specs/repository-anti-corruption/spec.md`: add your own lines only.

## 5. PRs larger than one reviewable PR, and proposed splits

| PR | Split |
| --- | --- |
| W3-02 as a whole (now XL) | A, B, C, D, E, F, G1–G4, H, R1–R6 (R4 as a/b/c), J1–J7, I, K. The Goals rename as one PR would be about 110 files, so it is R1/R2/R3. |
| W3-10-1 | 1a / 1b |
| W3-10-3 | 3a / 3b |
| W3-06-D | D0 / D |
| W3-06-F | F1 / F |
| W3-07-PR-8 | 8a / 8b |
| W3-07-PR-5 (optional) | Per consumer, folded into PR-2/3/4 |
| W2-10-A | A1–A4, each over 50 files; accepted as mechanical and generated |
| W2-11-d (optional) | d1 / d2 |
| W3-03-B2 (optional) | B2a / B2b |

## 6. Decisions needed that §1 does not already answer

**Popups for the user:**
1. **W3-02 Q-c: stored error codes.** Feed/Inbox runs, Sources, plugin-event delivery, Functions, Sessions, Alchemist, IM and `logs/action-calls.jsonl` hold codes. Rename them in a maintenance window, clear them, or leave history? Recommendation: rewrite in a maintenance window, on a copy first.
2. **W3-09-3: does the `workflow` audience count as an AI source for `actions.version_required`?** Recommendation: no, unless workflow Agent steps already call as `agent`.
3. **W3-10: may plugin pages show browser English ("Failed to fetch") until W5-04?** Recommendation: accept it as a recorded transition.
4. **Gate additions** (tightening only, but they are gate changes): W3-10-5 `rawFetchInScripts`, and W2-10's interim split ratchet. W2-10 PR-E is already planned.
5. **W3-10: 44px for the 诊断编号 button in toasts.** Recommendation: yes, under the 10-09 row. The coordinator may settle this as a reading of 10-09.

**Coordinator or routine calls (record in §1):**
- W3-02 Q-a: `goals.<old_prefix>.<reason>`.
- W3-02 Q-b: the owner table.
- W3-02 Q-d: repo gate only.
- MCP-visible renames before 0.3.0.
- `shortCallId` in ui-host, and the `data-molis-call-id` attribute used by F.
- W3-01 B: also rewrite the Skill, PR-template and DEVELOPMENT-REQUIREMENTS lines.
- Who owns the CLI `withCallId` line (W3-01 E or W3-07 PR-3).
- W3-07 PR-7: new route vs extending `/api/internal/action-service`.
- W3-09-2: forward every availability code.
- W3-09-3: which version fields count; nested calls exempt.
- W3-06-D: the temporary deny list; the `bundledGrants` sandbox guard.
- W3-06-E: whether `PluginDefinition.instructions` moves to W4.
- W2-11 c1: the `./local-web` name.
- W2-10: H3 acceptance, and whether A/B/C may precede W2-11 c/d.

**Status to confirm:** whether maintenance seven ran on the real Home. Until it does, the main checkout and the installed build stay before `b2460cb62`.
