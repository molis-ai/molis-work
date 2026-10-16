# 最新进展：近 14 天端到端收尾

日期：2026-10-17。同一套收尾跟着 `main` 往前跑了多次。当前结果只认最后一次完整记录。那次之后主线又合并了一批 PR，这套用例没有在新尖端上重跑。

## 现在读哪一份

- 分支：`docs/e2e-closeout-2026-10-16`
- 提交：`453d1a117`（`docs(tests): record the 2026-10-16 end-to-end close-out`）
- 文件：`docs/closeout/e2e-2026-10-16.md`、`docs/closeout/e2e-2026-10-16-open-prs.txt`
- 计为当前的运行：`28948c9fd`（#595，`chore(release): prepare Molis Work 0.3.0 desktop draft`）
- 没有改产品代码，没有开 PR

更早两次跑在当时的 `main` 上：`c1531e6dd` 是 27 个文件通过；`6ee6fe21d`（#585）上重建后再跑。#595 带进了产品版本、插件清单、发布脚本和测试，所以在 `28948c9fd` 上重建后又跑了一遍。现在只把这一遍当作结果。

## `28948c9fd` 上的结果

`node scripts/run-tests.mjs --browser-jobs 1 --jobs 4`：27 个文件通过，退出码 0，约 2.2 分钟。每个文件用自己的临时 `MOLIS_WORK_HOME`，没有使用 `~/.molis-work`，没有占用 4176。4173 上仍是已安装的应用。

通过的包括：agent-action-selection 1/1，content-editing-regressions 9/9（含 `W2-18-PAGES-TRANSIENT-01`），goal-closure-refusal 1/1，goals-refresh 4/4，todo-draft-recovery 1/1，schedule-reminder-recovery 10/10，goals-lifecycle-actions 5/5，local-host 7/7，side-panel-browser 4/4，context-onboarding 23/23，forms 五份文件 3/3、14/14、3/3、5/5、1/1，prologue-external-checks 4/4，security-invariants-external-checks 7/7，host-log 5/5，以及 creative-tools-plugins 8/8，document-plugins-error-model 16/16，health-gates-browser-fetch 44/44，health-gates-source-counts 27/27，list-silent-refresh 4/4，personal-plugins-review-fixes 16/16，prompt-registration 8/8，security-invariants-injection 5/5。

同一棵树上另跑、不计入这 27 个文件：`builtin-manifests-contract` 3/3，`verify-release-versions` 22/22。

`tests/coding-external-wait-live.test.ts` 0/4 跳过，因为环境里没有 `MINIMAX_API_KEY`。没有导出密钥。

此前全量变红的 #536 `d4d0303e1`、#534 `96186a1eb`、#530 `69e2e686a` 都在 Characters 修复 `404ba289f` 之前。那几处失败在 `28948c9fd` 上已通过。#530、#534、#536、#542、#569、#571、#573、#585、#595 都已合并。#571 合并前有过一次 Security invariants 失败，收尾没有改那条分支。

## 那次之后主线又往前了

收尾写下来时，下面这些 PR 还开着。2026-10-17 再查，它们都已合并：#580、#588、#589、#591、#592、#594、#596、#597、#598、#599。其中 #591 就是现在的 `origin/main` `76758783a`（`refactor(contracts): W5-09 — split services/agent-host.ts by domain, a pure move`）。#156（`docs: 新建 docs/experience/`）仍开着。27 个文件的这套绿没有在 `76758783a` 上重跑。

## 还没收口

- 六份当时未实现、这次也没有实现的规格：主动式助理、工作简报、Coding 与平台性能、视觉与 UI 性能、字体皮肤与语言、助理统一服务接入。
- 统一输入与本地语音当时列在未开工里。实现现在在 `feat/unified-input-voice` 的 `84d49a656`，没有合入 `main`，也不在这 27 个文件里。见 `docs/progress/unified-input-voice.md`。
- 本人视觉验收、真实中文输入法、VoiceOver、钥匙串凭据重连（R-4）、真机 Computer Use 的 20 步，都还没有做。
- MiniMax 真实模型评估仍是跳过的 0/4。
