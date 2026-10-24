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

## 只读再巡查（04:18Z，基准 03:20Z）
- 已合：**#1125** → main `de103e5fa`（04:1xZ）；此前 #1128 `d7bf2b669`、#1151 `ee2958d2a`、#1150 `034af76c5`、#1120 `47c780644`、#1141 `04435950a` 均已合。
- **#1157 变更**：作者线 ac-sc3 成为唯一 writer，新头 **`e387dc981`**（包含 b64058335 的三处 SC-4b 测试适配；touch-targets 改为「保留原断言、钉 pin 让行变长」），CLEAN 但叠 base 无 CI；等 batch 重推。
- **#1135 已入队（04:02，pos1）但 PR 上 0 评论、无评审结论** → 已评论请统筹补一轮结论或写明例外（[6379677423](https://github.com/molis-ai/molis-work/pull/1135#issuecomment-6379677423)）；本会话不操作队列。
- #1114：`f7836be2d`，Verify 已过、其余作业排队，**无评审**。
- #1126：新头 `e418e6806` Verify 绿，增量评审可合，等合并线入队。
- #1112：`8d700173c` required CI 绿；已请二轮+集成批。
- #1109 判断：属 VUX 线（coordination README:3289 明确不归防腐线），缺机械同步 + 评审派单两者；建议统筹派 VUX 作者同步并排一轮，修复线不接。
- batch-1024-20（main `04435950a` + #1148 + #1139）run 40061024962 queued；尚未出现含 #1157 新头的批。

## 04:30Z 状态
- **#1135 已于 04:18Z 合入**（squash `a12347ae0`，main tip），合并时 PR 上仅 1 条本会话提醒、**0 条评审结论**，reviews 数 = 0 → 合并条件 §1-2 未经评审路径满足（tests-only、风险低，但流程上属绕过；已提醒统筹并在本文件记录）。
- **评审就绪包已补**：#1114 `f7836be2d`（[6379774342](https://github.com/molis-ai/molis-work/pull/1114#issuecomment-6379774342)）、#1112 `8d700173c` 二轮要点（[6379774554](https://github.com/molis-ai/molis-work/pull/1112#issuecomment-6379774554)）。
- 合并队列 [#1147 pos1、#1126 pos2]；main `a12347ae0`。
- 集成批：`batch-1024-20`（run 40061024962，main `04435950a`+#1148+#1139）与 **`batch-1024-21`**（run 40061758914，main `de103e5fa`+#1157 `2d15c6d41`+#1130）均 queued；batch-19 三红归因 #1157 已随其新头修复。
- #1114 仍无评审；#1112 等二轮+批；#1098 缺 ac-review 一轮结论（W5-06 链卡点）。

## 需要 Codex 统筹线动作（04:30Z，按优先级）
1. **#1114 一轮评审**：head `f7836be2d`，14 项检查全过（1 skipping），MERGEABLE，评审包已发 [6379779293](https://github.com/molis-ai/molis-work/pull/1114#issuecomment-6379779293)、[6379774342](https://github.com/molis-ai/molis-work/pull/1114#issuecomment-6379774342)；待确认仅 28B 放行与动作 v2→v3 影响。
2. **#1112 二轮评审**：head `8d700173c`，required CI 绿，二轮要点包已发 [6379774554](https://github.com/molis-ai/molis-work/pull/1112#issuecomment-6379774554)。
3. **W5-06 三片集成批**：#1098（一轮可合已记）、#1107（一轮可合）、#1112（待二轮）一起进批；`full` 命中 assembly+spans-packages。当前 batch-20/21 均不含 #1098。
4. **runner 排队**：此刻仓内 7 个 run queued、0 in_progress（repo public，非分钟数/并发配置问题），属 GitHub 侧分配停滞；merge group 与 full suite 只能等。
完成后请回写本文件或 PR 评论；本会话接着盯合并与结果。

## 遗留项闭环审计（task-8，review-fix-owner，2026-10-24 04:33Z）

审计对象：`docs/reviews/pr-review-2026-10-20-to-23.md`（未入库，只读）§2–§8 的 P2/P3，以及 #1114 分支新增 BL-440～448、main BL-540～542。基准：main `89c9a71947f4`（= #1126 squash，04:31:56Z）、coordination `88e93fb81`。方法：逐条对照报告原文、修复 PR/commit、GitHub mergedAt、BL 行状态与协调账目。只读审计：未改代码、未提 PR、未评审批次、未动合并队列。

### 报告条目 → 修复 PR → 状态

| 报告条目 | 修复 PR / commit | 状态 |
| --- | --- | --- |
| §2.1 P2 #901 同目录导入来源身份 | #1114 `f7836be2d`（`client.ts` 传 `locator:'local:'+root`、`actions.ts` preview v2→v3、`tests/cognia-actions.test.ts` 同 source id 断言） | 待合入；#1114 无评审、CI 绿 |
| §2.2 P2 共享核心 final-head full-suite 证据 | 无 PR；BL-440（#1114 分支登记） | 需用户（改门禁/CI） |
| §2.3 P2 #988 全量红仍合入 | 回归 #1003 `171371c`；证据规则并入 BL-440 | 已修（回归）；流程项需用户 |
| §2.4 P2 #1041 PR CI 绿但带 main 红 | #1082 `1ded3c2`、#1092 `15fc5d9` | 已修（merged） |
| §2.5 P2 #853 空 diff 合并链 | 无代码项；流程 | 流程（统筹记纪律） |
| §2.6 P2 #958 删 ISSUE_ASK 英文过翻译门禁 | #990 `d5a3b179`（恢复英文）+ #1128 `d7bf2b669`（文档边界）；门禁补扫 BL-443 | 已修+文档已补；门禁补扫需用户 |
| §2.7 P2 #1070/#1078 缺全量证据 | BL-440 | 需用户 |
| §2.8 P3 #1018 F15 过时文档（SECURITY-INVARIANTS） | #1114 | 待合入 |
| §2.8 P3 #1018 Todo 宿主私路 | #1125 `de103e5fa`（spec §1.1 剩余风险登记）；清理 BL-447 | 已登记；清理需平台能力（context program W1-5） |
| §2.8 P3 #1018 隔离页 link 通道 | #1127 `c0b48111b`（SYS-15 拒绝测试 + is-arriving 等待） | 已修（merged） |
| §2.8 P3 #1079 S-56 嵌套坏形状 | #1114 | 待合入 |
| §2.8 P3 #867 DB catch-all 分类 | #1114 | 待合入 |
| §2.8 P3 #955 startedAt 误报 | #1126 `89c9a7194`（spec W5-01-CODING-51 + 后台任务测试） | 已修（merged 04:31:56Z） |
| §2.8 P3 #928 英文页中文 holder.label | #1126（按 owner.kind 读法 + 英 e2e 全 kind） | 已修（merged） |
| §2.8 P3 #1090 is-arriving 竞态 | #1127 | 已修（merged） |
| §2.8 P3 #906 truncation-tip main 红缺复跑 | ci-failure-owner 复跑 PASS（lead 确认；`/tmp/verify-906-{build,test}.log`；HEAD `a12347ae0`；2/2 pass，154s） | 可关闭（BL-445，证据齐） |
| §2.8 P3 文档债（#996/#988 spec、#1018 F15、#869 design-system README） | #1114 | 待合入 |
| §2.8 P3 Home/侧栏用例缺（#894/#900/#902/#911） | #1135 `a12347ae0`（tests-only VUX 审计）；#902 菜单语义 #1141 `04435950a` | 已修（merged） |
| §2.8 P3 #1000 settings 目录有意占位 TODO | 无 | 无动作（评论已确认） |
| §2.8 P3 #905 成果正文读权限边界 | BL-441 | 需用户裁定 |
| §2.8 信息项 #870 `plugin_original_files` 未登记 table-owners | 无 | 信息性，无动作 |
| §3.1 #868/#869「MERGED≠在 main」审计链 | #1114（补 design-system README 一行） | 待合入 |
| §3.2 page-assets main push 红（#876/#884/#890） | #919 `17fdd21` | 已修（merged） |
| §3.3 七个最终 head 全量红仍合入 | BL-440 / 流程 | 需用户/统筹 |
| §3.4 main 红→修复链 | 上述红链均有修复（#906 见上） | 已修 |
| §4 partial 9 条（#901/#955/#928/#894/#900/#902/#911/#906…） | 映射同上 | 8/9 已修或待合入；#905 待用户 |
| §5 #1085 门禁脚本改动批准证据缺口 | 无仓库内可修 | 需用户/统筹补 ① 直接回执 |
| §6 静态数/错误模型/测试强度 | 新增空 catch/any/console 0、`as unknown as` 仅一处且同文件净减；文档滞后三处由 #1114/#1128 处理 | 已修+待合入 |
| §8.1 先修 #901 | #1114 | 待合入 |
| §8.2/§8.3 full-suite 证据、浏览器冒烟进 required CI | BL-440 | 需用户 |
| §8.4 大 PR 评审留痕 | 流程；#1135 合并时 0 评审结论（已记 04:30Z） | 统筹流程 |
| §8.5 清文档债 | #1114 + #1128 | 待合+已修 |
| §8.6 裁定/收口 P3 | 见上各条 | 部分完成 |
| §8.7 stacked 纪律 | 流程 | 统筹 |
| §8.8 page-assets 批准回执 | #1114（cognia.js `24090→24118`，+28B 待评审确认）、#1126（coding.js +873B 待 ac-review 认可）、#988（11,233B，用户 10-21 批准但无回执链接） | 需评审/用户记录 |
| BL-540/541/542（main，#1159 新增） | 已派 ac-platform/ac-kernel/ac-shell | 已派，不归修复线 |

### 可关闭清单（已合入 main 且行为已改/证据齐；不含 #1114 待合部分）

- **BL-442（#928）/ BL-444（#955）→ #1126 `89c9a7194`**（2026-10-24 04:31:56Z，行为已改：holder 按 kind 读法、startedAt 改 Home 进程启动时间；含 spec 验收与测试）。
- **BL-446（#1090）/ BL-448（#1018 link 通道）→ #1127 `c0b48111b`**（03:33:55Z，已核为 main 祖先）。
- **BL-445（#906）→ 复跑 PASS**（ci-failure-owner，lead 2026-10-24 确认；本机 macOS，install/build/test exit 0，2/2 pass，154s，日志 `/tmp/verify-906-{build,test}.log`，HEAD `a12347ae0`）。注：报告要求的是 Linux CI 复跑记录，若要严格销项，建议集成批或 ci-failure-owner 再补一次 Linux 记录。
- **审计覆盖 #894/#900/#902/#911 → #1135 `a12347ae0`**（tests-only VUX 审计，已合）；**#902 菜单语义 → #1141 `04435950a`**（已合）。
- **#958 → #990 `d5a3b179` + #1128 `d7bf2b669`**；**#1041 → #1082/#1092**；**#876/#884/#890 → #919 `17fdd21`**；**#868/#869 的 design-system README 一行 → #1114 待合入**。
- 注：BL 行只存在于 #1114 分支（main 无 BL-44x）；关闭/重编要在 #1114 合入前处理，本次未动 BACKLOG。

### 仍开放且可修（按工作量）

- 小（≤半天）：① #1114 合入前 BL 号段重编（等统筹给号段后机械改 9 行 + 同步 #1125 spec §1.1 对 BL-447 的引用）；② #1114 合入后删除可关闭 BL 行（442/444/445/446/448）。
- 中（1–2 天）：BL-443 翻译门禁补扫服务端固定 prompt（需用户先批准改门禁；实现+测试）；§8.8 页资放行回执补记（文档/记录）。
- 大（>2 天，需平台能力）：BL-447 清理 #1018 Todo 私路（context program W1-5 的 intake/attach 通用键 + 合同）；BL-440 full-suite/浏览器冒烟进 required CI（改门禁/CI）。
- 非代码（流程/统筹）：§2.5 #853 链、§8.4 大 PR 评审留痕、§8.7 stacked 纪律、#1135 零评审结论合并的追认/例外记录。

### 需用户/统筹裁定（逐条）

1. **BL-440**：full-suite 证据/浏览器冒烟是否进 required CI（改门禁与 CI，按交接 §5 先问用户）。
2. **BL-441 #905**：成果正文读取边界口径（「声明消费动作」还是「消费成果类型」；改合同或动作声明）。
3. **BL-443**：翻译门禁是否补扫服务端固定 prompt（改门禁；或把 PRR-08 固定句纳入门禁用例）。
4. **#1085**：① 对 `scripts/check-package-boundaries.mjs` 改动的直接回执（现在只有 ⑤ 的转述）。
5. **§8.8**：page-assets 放行回执的记录方式（#1114 +28B、#1126 +873B、#988 11,233B 缺 ① 链接）。
6. **BL 号段冲突**：coordination README:3402 派 `ac-snapshot` 用 BL-440～444、`ac-errors` 用 BL-445～449；#1114 分支已占 BL-440～448；README:3243「核过 main 和在途 PR，都没有 430～449」与现状不符 → #1114 合入前需重编号（或调整 ac-* 号段），并同步 #1125 spec §1.1 对 BL-447 的引用。
7. **#1135 零评审结论合入**：是否补一轮评审或写明例外（流程）。
8. **BL-447 清理排期**：是否进 context program W1-5 下一轮范围。

### 本次核对要点/风险

- **#1114 是本轮唯一仍开着的修复 PR**：head `f7836be2d`、CI run 40060482661 success、无评审、不在合并队列；其 18 文件包含 §2.1 #901、#867、#1079、文档债与 BL 行，全部待它合入才落地。合入前评审还需确认两件：`cognia.js` +28B 的 `APPROVED_CEILINGS` 一次性放行、`cognia.import.directory_preview` v2→v3 的调用方影响。GitHub 当前 mergeable 显示 UNKNOWN（main 刚前进，需复核）。
- **#1126 已于 04:31:56Z 合入**（`89c9a7194`），BL-442/444 的行为修复落地；但 BL 行删除/重编仍要等 #1114。
- **#906 复跑**只是本机 macOS 证据（2/2 pass）；报告要求 Linux CI 记录，若严格按报告销项，建议在集成批或 CI 补一次 Linux 复跑。
- 另：`#1147` 已合（`8a7277f8e9`，lead 2026-10-24 通知），队列随之前移；本审计不改队列。
- 审计未改代码、未提 PR、未评审批次、未动合并队列、未动 BACKLOG。

## #1114 合并侧备注已发（审计结论官方出口，2026-10-24 04:34:56Z）

- 合并线已把审计结论的三件事——BL 号段冲突需合入前重编、`cognia.js` +28B 放行与 `cognia.import.directory_preview@2→@3` 调用方影响待确认、本闭环表链接——作为官方出口发到 #1114：[issuecomment-6379916609](https://github.com/molis-ai/molis-work/pull/1114#issuecomment-6379916609)（2026-10-24T04:34:56Z）。
- 后续：BL-44x 重编号等统筹裁定（BL-442/444/445/446/448 已可删行，剩 BL-440/441/443/447 待重编）；#1126 合入 main `89c9a7194` 后 #1114 再次 CONFLICTING，机械同步由 review-fix-owner 按 lead task-12 在 04:4xZ 认领（[issuecomment-6379925378](https://github.com/molis-ai/molis-work/pull/1114#issuecomment-6379925378)），本轮不动 BL。

## 2026-10-24 05:10 UTC — 修复线/合并线状态同步（lead）

- **防腐存量审计（ac-code-auditor，只读常驻）第 1–3 轮完成，无 blocker**；审计文件 `coordination/2026-10-14/ANTICORRUPTION-AUDIT.md`（第 1 轮 `e70185b4e`、第 2 轮 `33aabc1d2`、第 3 轮 §7 `67adc46f`）。
- **第 3 轮产出 21 处 privileges/SSOT 精确 edit（E1–E21，§7.2 可直接贴）**：状态补写（PG-051←#1147、PG-010←#1120、PG-056/070/071←#1137）、14 处行号/文件失效、PG-058 九份→5 份、PG-065 26→25、第 1 轮 4 条漂移合并。**请统筹批量写 privileges.md；修复线不改账。** E14 预留：task-13 合入后 PG-058 由 5 份改 4 份。
- **AC-AUDIT-05（HANDOFF-TO-CODEX）**：`apps/local-host/src/context-onboarding-service.ts:6/15/19` 直接 import pages/artifacts/todo 运行时插件包；PG-088 只覆盖 Pages，todo 无 PG 行、artifacts 不在 PG-031 位置表 → 交 ac-platform（改走公开动作或随 W5-02 后续片）。
- **BL-445 本机复验 PASS**：`/tmp/verify-906` HEAD `a12347ae0`，install/build exit 0，`tests/truncation-tip.e2e.test.ts` 2/2 pass 154.28s（日志 `/tmp/verify-906-{build,test}.log`）；严格销项仍需集成批 Linux CI 记录。
- **#1157 batch-19 三红本机复验 PASS**：HEAD `2d15c6d41`，home-offers 1/1、web-home-isolation 7/7、touch-targets 4/4（日志 `/tmp/verify-1157-*.log`）。
- **#1114**：机械同步 main `89c9a7194` 进行中（review-fix-owner，task-12，认领 6379925378）；**BL-440～448 号段与 ac-snapshot/ac-errors 分配冲突待统筹裁定**（README:3243/3402），已留评论 6379916609。
- **task-13（AC-AUDIT-06）**：plugin-frame-fixes 进行中（删 `personal-native-plugin-http.ts` + `NATIVE_PLUGIN_HTTP_FILES` 5→4，draft PR 待出）。
- 合并线：main `89c9a7194`，队列空；batch-1024-20 run 40061024962 in_progress、batch-1024-21 run 40061758914 queued（只读跟踪，不操作）。

## 2026-10-24 05:55 UTC — #1114 机械同步完成 + 防腐审计 a–e 收官

- **#1114 已机械同步**（review-fix-owner，task-12）：新 head `ed204f625a200e8d72a81660cc19cfec834882a6`（merge commit，parents `f7836be2d`+`89c9a7194`，普通 push 未 force；PR MERGEABLE/BLOCKED 等 CI）。唯一冲突 `tooling/gates/page-assets.json`（生成物）取 main 后重跑；相对 main 只差 `cognia.js 24090→24118`（本 PR 自有 +28B）；#1126/#1127 行为冲突无；diff 18 文件 +153/−30；本机 build/workspace:build/page-assets/health/boundary/contracts 47/47/secrets/verify-release 全过；affected-tests full 空；CI run 40063786843 在跑。
- 评论 [6380128242](https://github.com/molis-ai/molis-work/pull/1114#issuecomment-6380128242) 请统筹：① **BL-440～448 号段裁定**（阻塞合入，README:3402 与分支占号冲突）；② 请 ac-review 对最终头出「可合/修后可合」结论 + 确认 `cognia.js` +28B 一次性放行、`cognia.import.directory_preview` v2→v3 调用方影响。裁定后由 review-fix-owner 机械重编 9 行 + 同步 `#1125` spec §1.1 的 BL-447 引用，再重跑门禁+CI。
- **防腐审计（ac-code-auditor）主题 a–e 全部完成**（ANTICORRUPTION-AUDIT.md §6–§10）：@prologue/sdk 边界 PASS、表 owner PASS、页面资源/冻结名单 PASS，无 blocker。AC-AUDIT-05（context-onboarding-service 直接 import pages/artifacts/todo）仍 **HANDOFF-TO-CODEX**；AC-AUDIT-06 清单已修正为 v2（保留 alchemist 直连路由、删 personal 壳与 `/api/plugins/<id>` 别名，task-13 实施中）；AC-AUDIT-07（page-assets 门禁死键/过期放行/note 过时）交 ac-shell/统筹下次动门禁时清理。下一轮 f) 安全不变量表↔代码/测试漂移。

## 2026-10-24 06:20 UTC — #1114 待统筹三件事（合并侧已就绪，只差决策/评审）

- #1114 当前：head `ed204f625a`（机械同步完成）；required checks 全绿（Verify/Gates/Health/Boundaries/Contracts/Secret/Rust/Swift/Shell/Product subset），仅 3 个非必需 Security/Product subset 在跑；`mergeable_state=unstable`；**不在 MERGE-QUEUE §2**。
- 需要统筹三件事：
  1. 给 #1114 加 MERGE-QUEUE §2 行（`full=[]`，无需集成批；合入后 privileges.md 状态列由统筹改账）。
  2. ac-review 对终头 `ed204f625a` 给一轮结论（#1114 上 comment `6379915181` 是复核包：三组 18 文件；待确认 cognia `directory_preview@2→@3` 与 page-assets cognia.js +28B 放行）。
  3. BL 号段裁定：`specs/BACKLOG.md` 的 BL-440～448 目前只存在于 #1114 分支；main 最大 BL-542，且 main 上无任何 BL-44x 引用（grep 0）。README 派单表把 BL-440～444 给 ac-snapshot、445～449 给 ac-errors（两条线均未开始）。
     - 推荐 **B（零代码改动）**：#1114 保留 BL-440～448；统筹把 ac-snapshot/ac-errors 的未来号段改到 543+（README 派单表/LINES.md 各一行）。
     - 备选 **A**：#1114 把 440～448 重编为 543～551（依次顺延），合并 Agent 可在 30 分钟内完成并重推；无其它引用需要同步。
- 本会话不合并、不入队；Codex 侧合并认领后即可合。

## 2026-10-24 06:40 UTC — 防腐存量审计收尾（ac-code-auditor）

- 审计文件 `coordination/2026-10-14/ANTICORRUPTION-AUDIT.md` §13 已交付（commit `9a38240`，88KB：覆盖矩阵、AC-AUDIT-01..16 状态表、E1–E22 清单、未核边界）。7 主题完成 + 基线 50 条（48 PASS/已知，2 FAIL=文档漂移并入 E，1 UNVERIFIED=MCP 作用域），**无 blocker**。
- 要派修 5 条：AC-AUDIT-05（P2，HANDOFF-TO-CODEX → ac-platform：`apps/local-host/src/context-onboarding-service.ts` 直接 import pages/artifacts/todo 运行时包）；AC-AUDIT-07（ac-shell 下次动 page-assets 门禁时清死键/过期放行，需评审）；AC-AUDIT-08/10（安全线：门禁正则漏 `.e2e` 安全测试、CI 覆盖叙述过时）；AC-AUDIT-16（#1168 同 PR 文档补丁，已派 plugin-frame-fixes）。
- 其余 10 条为纯文档，建议统筹批量写：E1–E22（privileges.md，基准 `89c9a7194`，§7 有原文→新文）+ AC-AUDIT-12..15（SSOT 行）。
- AC-AUDIT-06 = #1168（审计复核 PASS）：等 CI 全绿 → 转 ready + ac-review 一轮 → 合入；合入后 PG-058 九份→4 份、`NATIVE_PLUGIN_HTTP_FILES` 5→4。
- 常驻审计继续待命：main 前进（#1168 合入、批量写落地）后刷新基准、复跑 5 条只读命令并更新 E/AC 状态。

- 10-24 统筹裁（[#1114 6380382311](https://github.com/molis-ai/molis-work/pull/1114#issuecomment-6380382311)）：BL-440～449 是 Codex C1/C2 的号段，#1114 不用。已解决的 BL-442/444/445/446/448 删行并写证据；BL-440→**BL-565**、BL-441→**BL-566**、BL-443→**BL-567**、BL-447→**BL-568**；BL-569～574 留给复审修复线。上表里的 BL-440～448 按此对照读。
