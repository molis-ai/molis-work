# 四线交接（2026-10-14）

Molis Work 四条并行开发线的交接：Prologue 完整采用、AI 输入回执、跨插件 AI 交互、情境动作。上一份交接是 [`coordination/2026-10-13/README.md`](../2026-10-13/README.md)（同一分支，规则原话、X1–X6 跨线约定、合并条件都在那里，仍然有效）；这一份只写 10-13 之后变了什么、现在停在哪、下一步谁做什么。

本目录只在远端分支 `coordination/handoff-2026-10-14` 上，不开 PR、不合进 main。本机路径（`/Users/yijunwang/...`、`~/code/prologue-*`、`.claude/worktrees/...`）只在原机器上有效。

## 0. 接手方式：一个主会话，几条线各一个会话

用户的安排（2026-10-14）：之后交给不同的会话做，但有一个**主会话**。

**主会话（统筹）**：

- 不写功能，只做跨线的事：
  - 排合并顺序、合 PR（Molis 与 Prologue）；
  - 管整机的构建与浏览器时段；
  - 把共享核心的改动凑成集成分支跑全量；
  - 判断跨线依赖，替用户按 §4 的两条规则拍板。
- 维护本文 §2「现在的状态」，有变化就改这份文档、推送这个分支。

**线会话**：

- 每条线一个会话，按 §3 自己那一节往下做。
- 本线内的决定自己定，写进本线需求书的决策记录，汇报给主会话。
- 跨线的、改目标或范围的，交主会话。
- 每条线开工先读：
  1. 本文 §2、§4、§5；
  2. 本线需求书最新的进度节；
  3. 两个仓库的 `AGENTS.md`。

采用线工作量最大、在关键路径上（P3 是好几条线的前置），建议给它一个专门会话；W4-06 可以单独再给一个会话。

## 1. 四条线

| 线 | 需求书（main 上） | 现在的进度节 |
| --- | --- | --- |
| Prologue 完整采用（采用线） | `specs/prologue-adoption/spec.md`；SDK 合同在 Prologue `docs/slices/taskboard-collaboration.md` | Molis spec 开头状态句；Prologue 合同「P2 进度」节 |
| AI 输入回执（回执线） | `specs/ai-input-receipts/spec.md` | §16「进度」、§19「接续入口」 |
| 跨插件 AI 交互（交互线） | `specs/ai-interaction-experience/spec.md` | §17 分片表、§20.13（A1+H2）、§20.14（A2） |
| 情境动作（情境线） | `specs/context-program/spec.md`（总纲） | §16.4、§20（当前接续入口）、§20.11（W2 用例） |

## 2. 现在的状态（2026-10-14 18:40 UTC，新主会话接手后更新）

**Molis 合并方式变了（10-15，PR #515，用户弹窗定）**：main 开了合并队列（规则集 "main merge queue"，squash，ALLGREEN，最多 5 个并行验证），分支保护去掉「必须与 main 同步」，必需检查仍只有 Verify，仓库开了 auto-merge。`gh pr merge <号> --squash` 只是入队，队列在 main+前序 PR 上跑 Verify 后自动合；判定合入看 PR 状态 `MERGED`，不再手动同步分支。全量可上 CI：PR 加 `full-suite` 标签、推 `integration/**`、或手动跑 Full suite（10 个 ubuntu 分片，不挡合并；macOS 专有的 24 个文件仍本机跑），见 `PARALLEL-DEVELOPMENT.md` §3、§7。§4「合并（merge commit）」一条以此为准。

**采用线（10-15 恢复，只做 P2k）**：Prologue #25（P2k）已合进 Prologue main（`6c17647e`）：最终代码 `0107d9b0` 上 SDK 全量 3918 过 0 失败、干净包 13 个消费者全过，覆盖防腐 F-24。P3 的包从 `6c17647e` 或之后的 main 打。P3a 等防腐 I8 的第二个 PR（F109 其余：acceptance 包换包、agent-host、contracts/services/agent-host）合入后再变基、再换成 P2k 之后的 Prologue main——Molis 换两次包，主会话同意。之前不碰 `vendor/prologue-sdk`。#498 已合（`5d62d77f`）。

**10-15 恢复更多（用户让主会话判断哪些能同步开始）**：#489 已合 main，情境 **W3-A1** 恢复（并 main → 构建 → FLOW 用例 → 实走 → 接执行 → PR）；回执只恢复 **1a**（含修助理找 `coding.runs.control@1` 的现存缺陷），1c/1d 等 P3a（同改 agent-host `control()`、contracts `agent-host.ts`、Coding runs.control）；交互只恢复 **S1**（plugin-sdk 题型规则、Form 生成题目，全量走 CI），H3 等 P3a（同改 `prologue-node-port.ts`）。合并顺序预期：1a 先于情境 W3-A2（情境条也改发送，以 `assistant-inputs.ts` 为准）。已把各项范围告知防腐会话，撞文件由主会话调顺序。

**采用线 P3a 恢复（10-15 13:40 UTC）**：防腐 I8 第二个 PR #523 已合入 Molis main（`f74e29d8`，换上 acceptance 包）。P3a 从最新 main 变基，按 B 实现，从 Prologue main `e5123369`（含 #25 P2k、#27 撤销资源修复）打包换掉 acceptance 包；P3a 动共享核心，全量用 CI `full-suite` 标签，macOS 专有部分本机补；PR 交主会话进合并队列。其余三线仍暂停。

**10-15 跨线冲突安排（用户问交互与情境在界面上会不会冲突）**：按分支 merge-base..HEAD 加未提交改动比对，在做的四片（P3a、1a、S1、W3-A1）之间只撞枢纽文件（`page-assets.json`、`baseline.json`、`ci-product-subset.txt`），可以并行；冲突集中在下一波，按下面排。

1. 界面一个面一个主人：
   - 助理面板的布局与动线、下一步那一行、`packages/design-system/src/interaction.ts` 的下一步部件、`agent-next-steps.ts` 的派生，归情境线。
   - 卡与题的合同和卡内渲染（`agent-question-card.ts`、`assistant-card-view.ts`、`assistant-offers.ts`、`agent-question-surfaces.ts`），以及 Coding 里的呈现，归交互线。
   - 每条输入的回执内容归回执线，画在情境线留出的位置：对话里你那条消息下面。
   - 采用线不新开界面：P3 的等待、交接、接续状态，用户看得到的部分走交互线的卡或题与情境线的下一步（`waiting`），不另画。
   - 要改别人的面先发主会话。
2. W3-A1 合入后，下一步部件与派生的形状冻结。H4 只往派生里加输入（Coding 的卡与专业后续），改形状先经主会话。交互线放开新题型（日期、数字、对象引用）时，下一步那一行按 FLOW-02 只给「去回答（N 题）」，不在行里画新题型。
3. 助理面板这一块串行：W3-A1 → 1d（同改 `assistant-island.ts`、`assistant-en.ts`）→ W3-A2 → 1e；H4 在 W3-A1 之后；W3-B 在 H3 之后（共用 `search.references@1`）。
4. agent-host 这一层串行：P3a → H3 → 1c → 1d → P3b/P3c（都改 `prologue-node*.ts`、`prologue.ts`、`capability-registration.ts`、合同 `services/agent-host.ts`；后两个是巨大单元，只许缩）。
5. 枢纽文件：
   - 后合的 PR 在合并结果上重建，再跑 `page-assets --update --base origin/main` 与 health `--update`。
   - 每个 PR 自己抵消自己加的资源字节，不借别的 PR 省下的。
6. 主会话做的界面把关：W3-A1、H4、1e 各自合入后，在隔离 Home 合起来走一遍助理面板与 Coding，截图对照 FLOW-01…05 与 DESIGN.md；用户验收放在这一遍之后。

**⏸ 四条需求线已暂停（用户 10-14 原话：「当前任务完成后，可以先暂停一下需求的线，让防腐线先继续。」）**。各线把手上的推到远端分支、撤掉自己排在构建锁后面的等待、在本线需求书写好「暂停点」后停下；整机让给防腐线（Codex，由用户恢复）。暂停时全部**没有构建、没有跑用例**：

| 线 | 远端分支 @ head | 暂停点 | 恢复第一步 |
| --- | --- | --- | --- |
| 采用 | Molis `adoption/p3-collaboration` @ `bbb8ee5e`（P3a WIP，底是 #498 `02e6720a` 并 main `59d02a37`）；Prologue `feature/p2k-node-conflicts` @ `46bc586d`，草稿 PR molis-ai/prologue#25（定向用例与 5 个变异过，全量与干净包消费者未跑） | 采用 spec §6.0c | 补跑 Prologue main `b01067b4` → P2k 验证、#25 转 ready 合 → P3a 按 B |
| 回执 | `receipts/1a-extract` @ `04ad649a`（含修 main 上现存缺陷：助理找 `coding.runs.control@1`，自 `ed5acdfe` 升 v2 后助理给运行中的 Coding 补充或回答会报「没有可用的 Coding 插件」）；`receipts/1c-agent-host` @ `34777083`、`receipts/1d-coding` @ `fe80cfe9`（WIP，逐层叠） | 回执 spec §16 | 1a 并 main → 构建 → 定向用例 → `page-assets --update` → 实走 → 开 1a PR |
| 交互 | `feature/ai-interaction-h3-on-w406` @ `d1b89835`（叠在 #498 `21d3853f`）；`feature/ai-interaction-s1` @ `6f375dbb` | 交互 spec §20.16 | #498 合入 → 变基 → 构建 → 快照 → H3 用例与 `pnpm test:security` → PR；S1 要全量 |
| 情境 | `context/assistant-flow` @ `01f0a31c`（总纲 §16.5 核对、§21 助理动作整合方案与 FLOW-01…05、部件 `max/more/waiting` 参数、`agent-next-steps.ts` 派生、用例） | 总纲 §21.7 | 并 main、构建 → FLOW 与 design-system 必跑 → 隔离 Home 实走 → #489 合入后接执行 → W3-A1 PR |

暂停前定下的跨线约定：H3 动作 `search.references@1`（挂 `system.search`）、原因 `reference-unavailable`，情境线落点读取共用；交互 D24 同意把「下一步」挪到输入框同一行，语义五条 = 情境总纲 FLOW-01…05（failed、unknown 的卡只带到卡上，unknown 绝不重跑）；下一步按钮只有一个部件（`renderInteractionNextSteps` 加 `options`），派生函数 `interactionNextSteps` 通用、H4 直接用，改形状先经主会话。#500（采用现状核对）已合（`59d02a37`）；#180 已关（不合并）。

**会话（10-14 11:20 PDT 起）**：

| 角色 | 会话 | 工作树 |
| --- | --- | --- |
| 主会话（统筹） | 「统筹 \| Molis Work四线统筹主会话」`local_7207c245-d21c-46be-b897-b5267cf14585` | 本分支 `.claude/worktrees/coord-handoff-1014` |
| 采用线 | 「采用线 \| Prologue 完整采用」`local_45fecdfc-1a50-48c9-be97-e2de2dddb97b` | `.claude/worktrees/line-adoption`；Prologue `~/code/prologue-p2j` |
| 回执线 | 「回执线 \| AI 输入回执」`local_718de54b-ab9e-4e4e-9a8f-9d453bf38be8` | `.claude/worktrees/line-receipts` |
| 交互线 | 「交互线 \| 跨插件 AI 交互」`local_0947140d-645a-4a48-80e1-567fd046acf2` | `.claude/worktrees/line-interaction` |
| 情境线 | 「情境线 \| 情境动作与助理动作整合」`local_5d1ec72a-374a-4f4b-ace1-71d06e379da9` | `.claude/worktrees/line-contextual` |

每条线的第一件事是**对照原始需求核对真实实现**（逐项标已实现并给证据、部分、未做），写进本线需求书、摘要发主会话。原始需求的出处：

- 采用：主检出里未入库的 `docs/reviews/prologue-molis-work-assessment-2026-10-02.md`（23 项），以及旧会话 `local_323bc7cc…` 的第一条消息。
- 回执：旧会话 `local_65cdec5e…` 的第一条消息。
- 交互：旧会话 `local_92f3d1d6…` 的第一条消息。
- 情境：总纲 §13 对照表，设计会话 `local_d2f8f2cf…`。

10-06 的四个旧会话 `[CC][1]`–`[CC][4]` 只有开头的需求，第一轮就撞了周限额，没有往下做；之后的进展全在 10-13、10-14 的统筹里。

**新需求（用户 10-14 原话，交情境线）**：「个人助理动作推荐，动作指引与个人助理对话界面的整合和交互优化，这个新的优化需求，请与情景动作这个线一起做掉，现在的这几部分自成一派，动线和使用体验很不好。」主会话定的分工：

- 助理面板里推荐动作、操作卡、问卷卡与对话的**布局与动线**归情境线。它先走查、出整合方案和高保真切片，再和 W3（助理与落点、助理面板作为位置）合在一起做。
- 这些东西的**合同**与 Coding 侧呈现仍归交互线（H3、H4 照做）。改合同经主会话。
- 回执线的 1e（助理工作视图里的输入回执）排在情境线的助理整合之后。1a 抽出的边界要能被新布局直接复用。
- Codex 的草稿 PR #489（Pages 评论侧栏、助理展开成主区标签）先于情境线的助理整合合入，情境线在它之上做。

**用户 10-14 拍板（弹窗）**：P3 换包后，同一项目两个独立 Coding 会话之间模型的互相交接与问答——选「所有会话共用项目板」（不选「接受拒绝、先去掉」）。**改 X5**：Coding 会话不再各一块常驻板，而是共用项目工作板、各占一块；会话间互发信保留（coding-collab-handoff、coding-message-wait 继续过），跨项目或不在同一板上的仍拒绝。代价是同板并发写的版本冲突，由采用线在 P3a 里正面解决（内部记账不带版本、模型汇报撞冲突按块重放、并发用例）。助理仍按 X5 每个 Work 一块，P4 再看。新 SDK 按整板版本判冲突，做不到「按块不冲突」（Runtime 自己记账也让整板版本 +1），主会话批准 Prologue 加一刀 **P2k「按节点判冲突」**（节点记 changedAt，带 version 的改图只看碰到的节点；工具形状不变），X5 的合同改动并进 P2k 的 PR；顺序 P2k 合 → P3a 从合入后的 main 打包按 B 做。P3 切成三刀：P3a 换包与协作主路径（不可再拆，叠在 #498 上）、P3b 换模型 beforeAccept 接线、P3c 外部检查器。

**Molis main = `393e8958`。** 10-14 以来四线合进 main 的：

- #408：采用线对账，过渡 SDK 包进 main。
- #409：回执阶段 1 第一片。
- #410：交互 C1+H1。
- #411：情境 W1/W2。
- #487：settings-assistant 的 fetch 修复。
- #491：采用 A1 核对。
- #492：交互 A1+H2（`34d0d1fc`）。
- #494：情境 W2 用例与浮条章节（`5ba2fa92`）。
- #496：交互 A2（`774acaf5`）。

别人同期合进来的：

- #488：状态环（A2 把它放到了共享问卷卡上）。
- #490：防腐进度对账。
- #497：测试并行运行器（每个文件一个 Home），阻塞 CI 拆成并行作业。
- #499：截图直接拖入 Issue。
- 窗口图过渡包：现在 vendored 的是 `prologue-sdk-0.0.0-rc.1-interim-p1-cu-image.tgz`。

**Prologue main = `b01067b4`**：P2a–P2j、S1–S4、Computer Use、H16、窗口图都在，**P2 全部完成**。最近合的：

- #19 P2h；
- #21 P2i（`71a06a94`）；
- #22 P2j（`70ea93d6`）；
- #24 模型切换接受时核对调用方权限（`b01067b4`）。

#21、#22 合并时没在最终 head 上跑 SDK 全量和干净包消费者检查。**合入后的补跑还没跑**（上一个会话没排上构建锁），已交给采用线，对 `b01067b4` 跑。

**在途**：

| 线 | 仓库 / 分支 | head | 状态 |
| --- | --- | --- | --- |
| 采用 W4-06 | Molis `refactor/w4-06-prologue-node`，PR #498（已转 ready） | `21d3853f`（并了 main `393e8958`） | **由一个 Codex 线程收尾**：它 10-14 11:15 从 `~/.codex/worktrees/pr498-prologue-split` 推了同步，11:22 把 `pr498-build-20261014` 排进构建锁。采用线不碰这个分支；Codex 停下，主会话再交给采用线。CI 在跑；上一轮必需检查全绿，Product subset（不挡合并）红过一次，原因待看。合入后主会话通知采用线（P3 变基）和回执线（接会话条目端口） |
| 别人：Pages 与助理主区 | Molis `feature/pages-assistant-integration`，PR #489（草稿，DIRTY，约 100 个文件） | `78c37fe9` | Codex 的。11:17 把 `pages-489-final-build` 排进构建锁。和情境线、回执线 1e 都有重叠，见上 |
| 别人：情境总纲设计稿 | `feature/context-toolbar`，PR #180（10-09 以来没动，DIRTY） | `7748613e` | 情境线核对内容是否已由 #411、#494 带进 main，是的话由主会话关掉 |

- `~/code/prologue-p2i` 可以删；远端分支 `feature/p2i-continuation`、`feature/p2j-checkers` 留着。
- 以 GitHub 为准：`gh pr list`，`gh pr list --repo molis-ai/prologue`。

**构建锁（18:30 UTC）**：

- 防腐 Codex 的 108 全量 08:39 PDT 起占着构建锁和浏览器锁。它在串行跑 976 个文件，到了第 940 个左右。
- `work-placement-restart.test.ts` 曾静止约 40 分钟，后来自己超时往下走了，不是卡死。
- 排队：Codex `pages-489-final-build` → Codex `pr498-build`。Codex 的锁脚本每秒轮询，`build-lock.sh` 每 15 秒，所以 Codex 的会先拿到。
- 各线排在后面；不需要构建的部分先做。

**提交身份**：仓库级的 `jing xu` 配置已经不在了，现在用全局的 `yijunw0212`（10-14 的提交都是它）。主会话没改配置。

**已知的既有失败（不是四线引入）**：

- Molis main：`touch-targets.e2e` 两条（亮、暗各一）。
- Prologue：`desktop-computer-use.live.test.ts` 会真的操作这台电脑的桌面，**不要跑**。
- Prologue 的 `workspace-watch.live` 在 10-13 那台机器上是环境性失败，这台机器上是过的。

## 3. 各线下一步

### 3.1 采用线（关键路径）

1. **P2i、P2j 已合（#21、#22），P2 全部完成。剩合入后的补跑**：
   - 对 Prologue main（10-14 起是 `b01067b4`，含 #24）跑 `prologue-verify.sh`（SDK 全量 + 干净包消费者，含新的 `taskboard-continuations-consumer.mjs`、`taskboard-checks-consumer.mjs`），放在构建锁下。若本会话没跑完，接手的人重跑：`$L prologue-main-verify zsh coordination/2026-10-14/tools/prologue-verify.sh ~/code/prologue-p2j main-b01067b4 <P2h 的包>`。
   - 过了：在合同 `docs/slices/taskboard-collaboration.md` 的 P2i、P2j 进度条「验证」行补上结果（直接进 Prologue main）。
   - 不过：先分清是不是 dist 没构建、是不是 `desktop-computer-use.live`（排除）；产品失败就在 Prologue 开修复 PR。全量里若只有公开面快照不同，对照 P2i/P2j 新加的公开类型核一遍再 `-u`。
2. P3 用的包从 `b01067b4`（或补跑修复之后的 main）打。
3. **W4-06**（Molis，P3 的硬前置，也是回执线「会话条目端口」的前置）：
   - **做了什么**：把 1,551 行的 `prologue-node.ts`（`initializePrologueNodeAdapter` 1,281 行，内嵌 `startAgentRun` 406 行）拆成：
     - `prologue-node-kit.ts`：选项、各轮内存状态、共用工具；
     - `prologue-session-index.ts`；
     - `prologue-schedule.ts`；
     - `prologue-review-documents.ts`：审查卡按种类拆成小函数，批准桥、审查历史；
     - `prologue-recovery.ts`；
     - `prologue-run.ts`：`startAgentRun` 拆成十来个阶段函数；
     - `prologue-node-port.ts`：Runtime 构造与端口；
     - `prologue-node-parts.ts`：项目工作、会话消息、等待、步骤图、推理与构建 Agent。
     - `prologue-node.ts` 只剩组合。
   - **行为应当不变**：代码基本是原样搬移，只把闭包里的共享状态改成显式参数。
   - **已做**（PR #498）：类型检查（修了 7 处）；健康门禁对 merge-base 过；本地快查、`HUGE-CLASS-MIGRATION.md`、防腐 spec §4.5 行、`CALL-CHAINS`/`PROLOGUE-AI`/`HOME-DATA`/`PARALLEL-DEVELOPMENT` 的位置都改了。
   - **还要做的**：
     1. 等 CI（Verify、Package boundaries 必须过；Product subset 不挡合并，但里面有 agent-host 必跑那组的 6 个）。
     2. 本地：构建锁下 `pnpm build` → `pnpm boundary:check` → `affected-tests.mjs` 选出的 21 个 + Coding/助理的 9 个非浏览器用例（`coding-background-wait`、`coding-collab-handoff`、`assistant-delegation-handback` 等）。脚本形态：本会话 scratchpad 的 `w406-verify.sh`。
     3. 只动 agent-host 一个包，按 `PARALLEL-DEVELOPMENT.md` 第 6 节不算共享核心，不要求全量；合入后相关用例意外失败才补全量。
     4. 把结果补进 PR 正文「验证」，转为 ready，CI 绿且与 main 同步就合。
   - 若类型错太多、搬移出了偏差：以 `origin/main` 的 `prologue-node.ts` 为准逐段对照。拆分方案本身不用重想。
4. **P3：Molis 第二次换包**。范围见采用 spec §4.6：
   - **换包**：从 Prologue main 的具名提交重新打包，替换 `vendor/prologue-sdk/` 里的过渡包；`.sha256`、`.provenance.json`、`patch-history.json` 一起改，`pnpm health:check` 会核。
   - **新合同子路径**：`services/agent-collaboration`，与第一个使用者同批建。
   - **Host 侧两个新文件**：
     - `prologue-collaboration.ts`：协作口、视图投影；
     - `prologue-checkers.ts`：检查器登记表。
   - **SDK 公共行为变了，Molis 要跟着改的地方**：
     - **等待**：`runtime.waits` 没有了 `park`、`resume`、`flush`，没有 `fired` 状态，条件 `board-node` 改名 `node`；登记改用 `arm`，必须挂在一个步骤上。改的是 `horizontal/agent-host/src/adapters/prologue-waits.ts`（「等某一步做完」与 `parkOnWork`）。
     - **让出**：`dispatch-subagent` 的 `yield` 现在是「派出 + 这一步等孩子那一步结束 + 收工」。SDK 不再自己叫醒父亲：删了 `onWake`、`onYieldSettled`、`SubagentHandle.wake`。要接着做，Molis 有两条路：
       - 在 `createRuntime` 的 `collaborationHost` 里实现 `startContinuation`；
       - 或者看图事件（接续 `eligible`），自己用接续的请求键 `startAgentRun`。
       否则让出之后停在 `eligible`。Coding 与助理的「交回与续做」（#472 带来的）要改到这条路上，`subagentYieldGuard` 一起删。
     - **调用顺序**：没绑步骤的跑不能协作（P2d）；`session-send` 要求绑定和相邻（P2g）；派出前多一步 `admitDispatch`（P2e）。
     - **板的写法**：一次改图在落盘之后才在内存里看得见（P2h）。Runtime 内部记账的改图可以不带版本（P2i）。
     - **请求键**：接续的请求键是 `板.等待`，能直接当开跑幂等键。
     - **外部条件**（P2j）：`createRuntime({ conditionCheckers })`，配置在 `config.waits.external`。
     - **S4**：`board-plan`/`board-revise`/`board-report` 的 `forInputs`/`inputs`、`acknowledge-inputs` 的新目标、`ask-user` 的 `about`。回执线阶段 3 用得到。
   - P3 的「默认路径验证」在换包那次改动里做，不验证不合。
5. **P4**（助理那一半按 W5-10 形状由功能线做，用户 10-13 定）、**P5–P6**、**A2–A5**：按采用 spec §5.2，在 P3 之后。

### 3.2 回执线

阶段 1 第一片已合（#409）。阶段 1 还剩下面这些（spec §11 阶段 1、§6.2a 落点表、§7 失败与恢复表）：

- **1a 抽取**：`assistant-inputs.ts`（助理的发送路由与回执，W4-05 形状），`input-receipts-client.ts`（Coding 的回执渲染）。先抽取，后加功能。
- **1c agent-host**：
  - 补充带键；同键重发去重；
  - `RUN_NOT_RUNNING` 竞态改为用同一个键 `session.queueInput`，回执写「这一轮刚结束 · 已排到下一轮」；
  - `runViewVersion` 纳入输入状态；
  - 恢复报告加「输入」一类。
  - 落点：`apps/local-host/src/assistant/assistant-service.ts` 里 `adapter.control(..., { kind: "steer" })` 的几处、Coding `run-inputs.ts` 的 `runControl`、`horizontal/agent-host/src/adapters/prologue.ts` 的 `control()`。
  - 会话条目端口要等 W4-06 拆完再接。
- **1d Coding**：
  - 发送方式菜单：补充 / 打断 / 下一轮；
  - 「发送中」气泡与同键重发；
  - 宿主说明不显示成你的话；
  - 「核对并继续」带上没读到的输入；
  - 计划轮次不再未经核实就写「已体现」。
- **1e 助理**：工作视图显示每条输入的回执，用删掉的重复渲染抵消资源字节；回答与补充由用户点选；重试键跨刷新保存。
- **R0 现场投影（D19）**：换包那次把预览改成现场调用 `projectInputReceipts`，同一个改动里删掉录好的投影文件。

注意：

- 这些单元（`assistant-service.ts`、`assistant-island.ts`、`prologue-stream.ts`、合同 `agent-host.ts`）都是基线里的巨大单元，只许缩。
- 资源字节只许减少。
- 阶段 3 依赖 P3 换包（S4 进 Molis）。
- 工作树 `.claude/worktrees/line-receipts` 在 main `774acaf5`，干净，可以直接用。

### 3.3 交互线

已合：C1+H1（#410）、A1+H2（#492）、A2（#496）。决定记在 spec D13–D20。

剩下的（spec §17 分片表与 §20 末尾）：

- **H3 对象引用**：
  - 只读动作 `interaction.references.search`，按种类与范围，从对象主人读当前有权限的候选；
  - 提交前 Host 逐个再读；
  - `pnpm actions:update`；
  - `docs/system/SECURITY-INVARIANTS.md` 的「对象引用由宿主复核」加拒绝用例，过 `pnpm test:security`。
  - 情境线的落点读取要和它共用对象主人的读法。
- **H4 Coding 的操作卡**：
  - Coding 的 Run 也能 `suggest-action`，记录走 H2 的协作者 `apps/local-host/src/assistant/assistant-offers.ts`；
  - Coding 的专业后续（查看变更、核对并继续）进同排下一步；
  - 以 #408 合入后的 `suggest-action` 形状为准（`mutate-external`、`HOST_GOVERNED_TOOLS`）。
- **S1 单次接续**：
  - 题型校验纯函数放 `packages/plugin-sdk`（A2 已在那里放了 `questionAnswer`）；
  - 与 Prologue `validateQuestionnaireAnswer` 做一致性用例，并进 `tests/ci-product-subset.txt`；
  - Form「AI 生成表单」缺信息返回 `needs_input` → 同一问卷卡 → 接续生成。这是 Form 的**新功能**。
- **题型**：现在宿主题型交集 `hostQuestionTypes()` 是 `["choice"]`。日期、数字、对象引用要等每个显示问题的界面都画得出来才放开（`agent-question-surfaces.ts`）。
- **另外**：
  - `assistant-base` 提示词里关于对象引用题的那一句，等 H3 时补；
  - 用户验收（助理与 Coding 的问卷卡、操作卡）未做。

### 3.4 情境线

已合 #411（W0、W1、W2：浮条取代底栏、Pages 迁到浮条）与 #494（W2-02/05/08 用例、`skills/molis-plugin-dev/contextual.md` 浮条章节）。W1-9 原以为要一个门禁 PR，核下来不需要：快照工具已覆盖 SDK 导出，已告诉用户。

剩下的：

- **新需求（用户 10-14）：个人助理的动作推荐、动作指引与对话界面整合**，分工见 §2。先走查，再出整合方案和高保真切片，然后与 W3 合做。
- **W3 起**：按总纲第 9 节分期——中枢接右栏、助理与落点、Pages 的落点、右栏改版。每步先对照 §18.2、§19.5 的门禁。
- **要先问用户的**：
  - 两组真实 Jev 评估、桌面原生拖出（要真实凭据或真实环境）。
- **别人的**：
  - 右栏「电脑」那一格归 Computer Use 原负责人，本线只留位置。
- **用户验收**：未做（一骏本人）。

## 4. 规则（10-13 交接 §3 全部仍有效，下面是之后新增或改动的）

- **拍板**：
  - 技术决定按防腐后果，功能决定按用户的使用体验、按推荐走。
  - 仍先问用户（弹窗，带推荐）：发布与改版本号；动真实 Home（4207/4208/4173）或安装版；放宽门禁、`limits.json`、`biome.jsonc`、门禁脚本、例外文件；读真实凭据；计划外的 PR。
- **合并**：
  - Molis：CI 的 `Verify` 等必需检查绿、分支与 main 同步，就可以合（merge commit）。`Linux probe` 不是必需检查。
  - Prologue PR：按合并条件验证过即合。
- **推送、开 PR**：不用再问。推送前 `pnpm secrets:check`，先 `git fetch origin main`。
- **提交身份**：照 10-13 交接 §3 第 9 条。
- **只在自己的路径提交**：
  - 不裸用 `git stash`，不强推；
  - 不碰别的会话的工作树与未提交改动；
  - **不要对有未提交工作的文件用 `git checkout <文件>` 去撤销调试改动**——这次就这样丢过一个文件的全部改动，靠重做补回。
  - 调试改动先备份到别处，再改回。
- **Prologue 仓库**：
  - 不用 `git add -A`，逐个路径加；
  - `Archive/` 只读；
  - 每一刀一个 PR。
- **少用子代理**：用户 10-13 说「尽量不要用 subagent，就在主 Session 来」。现在换成多会话，各会话内部仍然照这条。
- **门禁与断言**：不为变绿放宽或删除。先分清产品回归、预期变化、测试缺陷、环境时序。
  - 预期变化改断言时，在 PR 里逐条写理由。例：P2h 的两条，见 Prologue #19。

## 5. 机器、锁与验证

**10-15 起旧锁停用**：main 上的机器槽位（`scripts/machine-slot.mjs`，`docs/system/PARALLEL-DEVELOPMENT.md`）替代 `build-lock.sh`。`pnpm build` 自己拿 build 槽，`run-tests` 遇到浏览器文件拿 browser 槽，都按到达顺序排队。查看用 `node scripts/machine-slot.mjs status`，别的重活用 `node scripts/machine-slot.mjs run <build|browser> --label … -- …`。四线分支都已带上。起因：防腐的 bl140 在旧锁里循环跑浏览器用例，旧锁不排队，四个会话饿着。下面这段旧做法只留作参考。

**整机一次一个构建、浏览器用例最多三批。** 锁是这台机器上的目录，用 `coordination/2026-10-14/tools/build-lock.sh`（原件在主检出 `.claude/handoff/tools/`，不入库）。和防腐那边的 codex 会话共用，它跑全量时会长时间占着构建锁。

```bash
L=/Users/yijunwang/code/goalboard/.claude/handoff/tools/build-lock.sh
B=/private/tmp/claude-501/-Users-yijunwang-code-goalboard/f09f1cf5-06fd-4140-bead-c6dba6a4d675/scratchpad/browser.lock
$L <标签> pnpm build                                              # 构建
LOCK_DIR=$B $L <标签> node scripts/run-tests.mjs <浏览器用例…>      # 浏览器用例
$L <标签> env LOCK_DIR=$B $L <标签>-browser node scripts/run-tests.mjs > 日志   # 全量（两把锁都拿）
```

谁占着锁：`cat <锁目录>/info`。

**Molis**：

- 全量约 110 分钟。
- 跑之前先整体 `pnpm build`；全量期间不改源码、脚本、`package.json`、`skills/`。
- 失败用干净基线工作树（`git worktree add --detach <基线>`）跑同一批文件对比。

**Prologue**：`coordination/2026-10-14/tools/prologue-verify.sh <工作树> <标签> [上一刀的 tgz]`，在构建锁下跑。它依次做：

1. build dist；
2. `tsc`；
3. SDK 全量（两个 worker，排除 `desktop-computer-use.live`）；
4. 干净 `git archive` → pack；
5. 在空目录里跑全部 `*-consumer.mjs`；
6. 对上一刀的包再跑一遍（新加的消费者脚本应当失败）。

结果在 `$PROLOGUE_VERIFY_OUT/<标签>/summary.txt`，默认 `/tmp/prologue-verify`。

- **先 build dist**：`*.live.test.ts` 的子进程夹具读 `packages/sdk/dist`。新工作树没 dist 时会出现十几条「Producer exited before boundary」，不是产品问题。
- **变异检查的做法**：一次改坏一处关键实现，跑对应用例确认变红，再还原、确认没残留。脚本形态见 P2h/P2i/P2j 的 PR 与合同进度条。

## 6. 这次踩过、下一位要记住的

- **钟停着时不能原地打转**：Prologue 的内存 Host 时钟不走，只有 `clock.advance()` 才动。凡是「按下一次时刻排队」的逻辑，要从「现在」与「这一回到期时刻」中较晚的那个往后排；P2j 曾因此在测试里一秒几千次地打转。
- **改图先落盘再换进内存（P2h）的连带影响**：
  - 先读版本、再排队写的调用会撞 `TASKBOARD_CONFLICT`。Runtime 自己记账的写入不要带「刚读到的版本」。
  - 没 await 的改图，在下一行还看不见。
- **开跑键的字符集**：只能是 `[A-Za-z0-9._~-]`。步骤编号是自由文本，不能拼进键。
- **用例必须走过真的跑**：P2h 的 `canPark` 在执行器建好时就算定了，所以绑定的跑永远让不出；只靠单元测试抓不到，跑级用例才抓到。
- **Molis 门禁是对照 merge-base 量的**：
  - 新文件里的长函数算新增的巨大单元，搬家也算。所以 W4-06 必须拆到阈值以下，不能整段搬。
  - 页面资源字节只许减少，预算等于实测。
