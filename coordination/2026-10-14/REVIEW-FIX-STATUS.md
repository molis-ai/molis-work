# 评审问题巡查与修复状态（REVIEW-FIX-STATUS）

更新：2026-10-24 03:00Z（本会话 = 评审问题巡查/修复派单会话；合并职责已交本地 Codex 统筹，见 CODEX-TASKS.md §0、MERGE-QUEUE.md 头）

## 本轮变化（03:40Z 更新）
- **#1141 同步完成**（review-fix-owner）：head `034056a26`，MERGEABLE、非 draft；`git diff origin/main` 只剩本 PR 2 文件；page-assets/health/boundary/secrets 全过；CI 40056614086 pending。请评审方把 #1141 与 #1125/#1128/#1135 一起排一轮。
- 统筹 README 02:25/03:10 已给结论：**#1126、#1127 经统筹一轮评审「可合」**（#1126 的两处隐患登记 R-39/BL-540、R-40/BL-541）；**#1127 已由 Codex 入队**（group run 40056527855 排队中）。**#1125/#1128 仍无评审结论**，请统筹补派一轮。
- CI 分诊（ci-failure-owner 恢复）：main `585b15979` 无红；batch-24-19（head ee4418881）queued 待跑；batch-18 旧头唯一红仍是 `tests/onboarding-goals-actions.test.ts`（#1147 线，Codex 不抢）；#1159 仅非必需 Security 2/2 红（`tests/plugin-page-reviews.e2e.test.ts` SYS-15-U10，环境 flake）。

- **#1141**：`review-fix-owner` 已认领并完成机械同步 main（新 head `b50a2d1d5`，CI run 40055624200 进行中；冲突只在 `plugins/native/todo/src/ui.ts`，需其自证语义无变）。
- **#1114**：`review-pr-fixer` 已认领并完成逐项核对——**对照 main `aa4de404f`，18 文件全部仍需要，无「已被取代」项**（含 #901 cognia.import.directory_preview v2→v3、S-56 嵌套 #1079、#867 错误分类、page-assets 28B 放行）；正在解冲突/同步，等新头。
- **#1126**：Codex「专职修复 1」02:45Z 认领机械同步，新 head `34fb9eb99`（02:54Z，普通 merge commit），CI 重新排队（BLOCKED）。
- **#1127**：head 仍 `d461fb954`（CLEAN），未见 Codex 同步动作。
- 合并侧（Codex 统筹）已合入 #1158 `?`、#1156、#1137、#1142（02:45–02:49Z 日志），main 与队列以 MERGE-QUEUE 为准（本会话不操作）。

## 请统筹派「专职评审」一轮（ac-review 旧线在下列 PR 上均无评论，评审已由 Codex 专职评审会话接管）

| PR | 当前 head | 内容 | CI/状态 |
| --- | --- | --- | --- |
| #1125 | `21d4b3719` | spec 剩余风险登记（#1018 收口） | CLEAN、非草稿 |
| #1128 | `f26d7f8b8` | 翻译门禁盲区文档（#958） | CLEAN、非草稿 |
| #1126 | `34fb9eb99` | #955 startedAt + #928 英文 TaskBoard；隐患已登记 R-39/BL-540、R-40/BL-541 | 统筹一轮可合；等 Codex 入队 |
| #1127 | `d461fb954` | #1018 link 通道 + #1090 flake；plugin-frame.js +263B 放行待认可；改安全不变量（条件 4 看两片 Security） | 统筹一轮可合；已由 Codex 入队（group 40056527855） |
| #1141 | `034056a26` | #902 Todo 批量菜单语义；机械同步完成（三合 main，ui.ts 取 main 稳定键，语义不变；diff 只剩 2 文件 +71/−1） | ready/MERGEABLE；CI run 40056614086 pending；本机 21 files 20 过（`tests/todo-from-inbox.e2e.test.ts` 首跑 Lingguang note 20.5s 超时、重跑 11.4s 过，判 flake 与本改动无关） |
| #1114 | `11649e983` | 复审报告汇总（合同 v2→v3、28B 放行等） | 已同步，CI run 40056381607 排队；diff 18 文件 +153/−30 |
| #1135 | `0460783c1` | tests-only VUX 审计（#894/#900/#902/#911） | draft；是否转 ready 请裁定 |

## 待确认

- **#1112** `0c0c0039d` DIRTY：Codex 17:39Z 认领后 >2h 无推送，已按 §1 第 7 条在 PR 上问认领人/统筹；若确认无人处理，本会话可派修复者接「修后可合 2 条 + 规格板 (b) + 合 main」。
- 评审修复线其余（#1125/#1128/#1126/#1127/#1141/#1114/#1135）现归本会话巡查/派单；合并、机械同步以外的工作若 Codex 已认领，我们不抢。

## 本会话边界

- 不入队/不取出/不写 MERGE-QUEUE §3（本状态文件除外）；修复者只动各自 PR 分支；不取消 CI、不 force push、不改门禁脚本、不跑全量。

## 巡查结果（review-pr-fixer 只读扫全 23 个 open 非 draft PR，2026-10-24 03:20Z）

- **A 无人认领待修（4）**：
  1. #1112 `0c0c0039d` DIRTY — 一轮「修后可合」2 条 + 规格板 (b) + RAC-80～84 + 合 main；Codex 17:57Z 认领后无推送（>2h）。已在 PR 询问统筹（[6379225105](https://github.com/molis-ai/molis-work/pull/1112#issuecomment-6379225105)），无回复；**修复线已按 §1-7 接手**，由 review-pr-fixer 执行（样例口径取「新项目默认启用状态」，不写插件名），推前会在 PR 留认领。
  2. #1107 `b8b5e3304` CLEAN — 二轮可合，但试合 batch-19 与 main 冲突 3 文件（web-goals-read.ts / renderer-gap-en.ts / baseline.json）；统筹 02:34Z 要求作者按 #1098→#1107 顺序合 main，至今无认领/推送。属 W5-06 叠放链，归作者/Codex。
  3. #1109 `8921d80b2` DIRTY — 零评论零结论、12h 无活动；诊断：**根因是评审派单缺失**（合同 `git.state v1→v2` 产品向 PR，从未进评审队列），另有 4 文件与 main 冲突（2 生成物 + visual-ui-experience spec + diff-git-english 四个 upstream 句子）。建议统筹派开发线做机械同步后交 ac-review 一轮；修复线不擅自接手。
  4. #1157 `782af05ed` — batch-1024-19 shard 7/16 唯一红 `tests/web-home-isolation.test.ts:53`（断言 `sessions/sessions.db` 存在，SC-4b 已删该库建表；确定性失败）；已评论上报（[6379181179](https://github.com/molis-ai/molis-work/pull/1157#issuecomment-6379181179)），**已派 ci-failure-owner 认领修该测试**。
- **B 等评审派单**：0。
- **C 有人在修**：#1130（Codex 专职修复1，机械同步认领 03:16Z）、#1147（ac-review 可合，统筹要求 Codex 先认领再同步）。
- **D 等队列/叠放/草稿**：#1098/#1151/#1150/#1119/#1139/#1120/#1148/#1159 等入队或批；#784 最后收尾；#1143/#1144 仍 ready 但按统筹要求应转草稿（提醒）。
- 本会话修复线：#1114 `11649e983` CI 排队（run 40056381607）；#1141 `034056a26` CI 排队（run 40056614086）；#1126/#1127 已有「专职增量评审可合」结论（#1127 Codex 已入队）；#1125/#1128 等 ac-review 一轮；#1135 draft 待一轮结论。

- 2026-10-24 03:5xZ 更新：main `f4df5b471`（#1159 合入）；#1127 合入 `c0b48111b`；队列 [#1128 pos1、#1151 pos2、#1150 pos3]；#1128 为评审修复线（翻译门禁文档）已在队列。

## 评审结论更新（2026-10-24 03:5xZ）
- #1127：**已合入** main `c0b48111b`（03:33:55Z）。
- #1128：一轮评审**可合**（03:19Z，f26d7f8b8）→ Codex 合并认领（03:21Z）→ 已在合并队列 pos1。
- #1126：专职增量评审**可合**（02:56Z，34fb9eb99，原 +873 B 批准有效）；Codex 修复1 03:41Z 认领第二次 main 机械同步。
- #1125：一轮两项文档事实已修（head `1f0652e86`），**二轮评审可合**（03:39Z）→ 等合并侧入队。
- #1141：**一轮评审可合**（03:24Z，034056a26，CI 绿）→ 等合并侧入队。
- #1114：CI 全绿（run 40056381607）；尚未评审；已派 review-fix-owner 做机械同步到当前 main `f4df5b471`（认领后动手，只机械合并）。
- #1135：draft，等 ac-review 一轮后由统筹决定是否转 ready。

## #1112 修复线接续（2026-10-24 04:0xZ）
- 已接手 Codex 超 2h 未推送的认领，按 02:14 裁定 (b) 收口：新 head `8d700173c`（普通 push），CI run 40059620166 pending。
- 规格板插件格改 `pluginMarketCards()` 构建期目录：亮格=新项目默认启用（Goals/Inbox/Feed/Sessions+个人），灰格=其余；developer 不进；创作台按真实机制放选择器头部；新增 RAC-80～84 与 `tests/primitive-catalog-bar.test.ts`；删内联脚本改为 initialization 程序（`*_SCRIPT` 门禁不增）。
- 证据：build/workspace:build、定向 4 文件 66 用例、6 张截图（亮/灰/点击转亮）、health/page-assets/boundary/verify-release/secrets、affected-tests（325 用例，`full`=assembly+spans-packages）全过。
- 待办：ac-review 二轮 + 集成批（批由 Codex 起）；未入队、不动队列。

## batch-1024-19 失败归因与 #1157 适配（2026-10-24 04:0xZ）
- batch-19（run 40054696653）终态 failure：13 分片过，红=shard 5/16、7/16、13/16，**全部归因 #1157**（SC-4b 删除 Talk 按钮/sessions.db 建表/DOCK_DEFAULT_PINS 5→4，三个测试未适配；#1157 叠在非 main base 从未跑 CI）：
  - `tests/home-offers.e2e.test.ts`、`tests/web-home-isolation.test.ts`、`tests/touch-targets.e2e.test.ts`。
- ci-failure-owner 已认领并适配三条（仅 3 个测试文件、无产品语义），#1157 新 head `b64058335`，本机两连过；批分支重推归 Codex/合并线。
- 另：#1114 现 head `471ff8d56` 是 review-fix-owner 的机械同步（认领 03:42Z），等其报告与评审。
- 当前 main `47c780644`；合并队列 [#1141 pos1]；#1125 二轮可合、CI 进行中。

## 合入进展（2026-10-24 04:10Z）
- **#1141 已合入** main：merge group 40059545156 success → squash `04435950a`（03:56:55Z）。#1141 线闭环。
- #1125：CLEAN、Verify SUCCESS、二轮可合 → 等合并线入队。
- #1126：新头 `e418e6806`（Codex 修复1 第二次机械同步），等最终头 Verify。
- #1112：`8d700173c` CI run 40059620166 queued；等二轮评审 + 集成批。
- #1114：`471ff8d56`（review-fix-owner 机械同步）等其报告与评审。
- #1157：适配头 `b64058335` 等 Codex 重推 batch-19；ci-failure-owner 挂 30 分钟检测。
