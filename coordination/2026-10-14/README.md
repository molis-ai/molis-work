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

- **full-suite 改成按标签触发（用户 10-15 定，#538）**：PR 只在加上 `full-suite` 标签那一刻跑一次，之后推送不再自动跑（要再跑就去掉标签重加，或用 `gh workflow run full-suite.yml --ref <分支>`）。
  - 线会话不自己加标签。主会话审完、确认是最后一个 head 之后再加。
  - 同一时间最多两个线 PR 跑全量。
  - 一个 head 上没有它自己那一轮全量，就不入队。
- **用户 10-15：CI 失败如果只是时间问题，不是逻辑问题，可以跳过、照常合并。**
  - 先判断：单独跑或在 main 基线上跑能过；失败是时限到了，不是断言值不对；同一用例在无关 PR 上也挂过。等的事件永远不会来（比如 #529 修的 side-panel），是逻辑问题，不算时间问题。
  - 非必需检查（full-suite、Security invariants）里的时间类失败：直接入队，在 PR 评论里写一句判断依据。
  - 必需检查 Verify 因时间问题变红：用 `gh run rerun <run> --failed` 重跑失败的 job，不绕过分支保护。
  - 逻辑类失败照旧退回线会话修。

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

**10-15 合入与审查**：
- 回执 1a #531 已合 main（`9a883966`）。审查时退回过一次：Coding 动作的版本表去掉了默认值，修复进了同一个 PR。
- 交互 S1 #532 退回：要删掉被取代的 `form.questions.ai`；宿主里按 Form 写的问卷卡包装要改成通用的（结果形状进合同，宿主不认 Form 的码）；正文补上「防腐复查」。
- 采用 P3a 防腐两问都选 A：留一个 typed 长等待 `agent.collaboration.await.v1`，顶替旧的四个，净减 3；Coding 两个新状态词记为原有翻译缺口，随 W5-03 一起做。

**10-15 与防腐线 W4 的顺序**：
- W4-07（Coding `routes.ts`）在 P3a #534 合入后开工，和交互 H3 并行。
- 回执 1c、1d（同样改 Coding 的 `routes.ts`、`run-inputs.ts`）排在 W4-07 之后变基。
- W4-04（Form）在 #532 合入后开工。
- W4-05（AssistantService 协作者）和回执 1c/1d、情境 W3-A2 会撞：防腐线先发范围，由主会话排顺序。
- 防腐线其余 W4 项也是每项先发范围。

**10-15 晚的合并进度**：
- 交互 S1 #532 已合（`eebfa9f3`）。
- 采用 P3a #534、情境 W3-A1 #536 都过了 full-suite（只挂既有的 agent-action-selection），入队后因为 main 又合了 #535、#538–#544，被以 `merge_conflict` 踢出队列。冲突在 `tooling/gates/page-assets.json`，#536 还多一个 `apps/local-host/src/index.ts`。
- 解法：#534 先并 main、构建后用 `--update --base` 重新生成门禁数字，推送后重新入队；#534 合入后 #536 再做同样的事，免得来回撞。
- 只并 main、重新生成门禁数字的 head，不重跑 full-suite：沿用上一轮的结论，合并队列在合并结果上跑 Verify。
- 结果：采用 P3a #534 已合（`7fe8ee65`），情境 W3-A1 #536 已合（`ac47ed78`）。下一步部件与派生的形状从此冻结。
- 交互 H3 #546（head `82a90764`）防腐复查通过，统筹加了 full-suite，全绿后入队；它与 `ac47ed78` 能干净合并。合入后通知情境线开 W3-B：落点取候选用 `search.references@1` 和 `horizontal/search/src/references.ts` 的 `confirmReferences`，不另写一套。
- 回执 1c 的决定（回执线发来的 1c 对 P3a 清单，统筹答复）：
  - 新动作 `agent.inputs.send@1`，返回 `AgentSteerReceipt`；`controlRun` 去掉 steer 分支，不留兼容。
  - 次序：`beforeEffect` → `assertAuthorityCurrent` → `queueInput` 前再查一次；被取消或撤权就不写记录。
  - 助理传入排队的那一条（carry）。
  - 提示条挪到 1e；但 1c 的措辞要说真话，不能写「已补充到正在进行的这一轮」。
  - 开工条件：H3 与防腐 W4-07 都已合入。
- 情境 W3-B 设计草案（spec §21.8，本地分支 `context/w3b-landing` @ `96958c45`），三件按推荐定：
  - B-1：三个 Pages 写入动作共用一个处理器，各挂一份 attach，不改合同。
  - B-2：W3-B 只用 `confirmReferences`；「attach 的 find 取候选」改到 W4 的 F2「追加到已有」。
  - B-3：拆成 W3-B1（第 1–6 步，H3 合入后开工）和 W3-B2（第 7 步，情境条显示落点，排在 W3-A2 之后）。
  - 提醒过的约束：Pages 与工作台的资源字节在同一个 PR 里自己抵消；`client.ts` 只许缩；新事件 `molis:surface-landing` 要登记，并跑 `api:update`；预览挂在主人页面的面板槽，不出整页；先并 #542（W4-11，改 Pages 的 store）；开工前把文件清单发统筹。
- 交互 H3 #546 已合（`3fd4d0bd`）。第一次全量里 plugin-market-upgrade 失败：用例重新加载页面后没等加载完就开始查，是测试缺陷；修好后重跑，全绿合入。之后交互线开 H4。
- **用户 10-15：「有些要求和规定要合理，不一定要严格遵循，适时适当调整」**。起因是 W3-B1 的页面资源多了约 5.7 KB，我推荐打开 esbuild 压缩局部变量名来抵消；用户的意思是不压缩，直接放行。
  - 做法照 #522：W3-B1 在 `scripts/gates/page-assets.mjs` 加一次性的 `APPROVED_CEILINGS`，以 merge-base 的确切字节为键，注释写批准人和日期；合入后由防腐线像 #541 那样删掉。
  - 以后的口径：功能必需、增长小、说得清的，按先例一次性放行，不为凑数字改基础设施或把代码压到难读。安全边界、断言语义、真实 Home、发布仍照原规则。
  - W3-B1 的合同改动：`ContextActionChosen` 加 `landing?` 与 `run?()`。`run` 不带参数，由总线绑定落点。
- 防腐 W4-07 #549（拆 Coding routes.ts）与 W4-12 #550（视觉比对工具）已审、加了 full-suite，在跑。回执 1c 在 #549 合入后变基开 PR。
- 防腐 W4-05（从 AssistantService 抽出提醒与跟进协作者）可以开工：
  - 回执 1c 改了 `assistant-service.ts`，所以 1c 先合，W4-05 在它之后变基。
  - W4-05 不碰 `assistant-inputs.ts` 与发送、回执的路径。
- main 上 PAGES-TRANSIENT-01 失败是逻辑问题，已由 #548 修好。
- 10-16 凌晨（UTC）：
  - #549（W4-07）已合（`424256ef`），#550（W4-12）已合（`2af9dfc6`）。
  - 回执 1c #552 在跑全量。交互 H4 第一部分 #554、情境 W3-B1 #553 已审，等全量空位。
  - #553 的一次性资源例外由用户在情境线会话里直接批准（情境线会话自己的权限检查拦下了门禁改动，同级转达不算数）。压缩的提交已撤回，PR 正文已改正。
  - #551 第 7 片有 26 个文件在 Node 24.21 退出时于 better-sqlite3 `Statement::~Statement` 原生断言崩溃，只出现在这一片；已重跑这一片，并请防腐线查 Form 的 store 在 Runtime 停止时有没有先关库。
- H4 第二部分（Coding 的操作卡）定为 D25–D28：
  - 建议进运行视图，由 Coding 落成自己的卡；
  - 判断逻辑放进插件 SDK；
  - 点卡算确认，口径同助理 H2；
  - 顺序：2b（SDK 抽出）在 #554 之后先做；2a 在 1d 之后；2c 最后，碰 roles.ts 就排在 P3c 之后。
- 采用线：
  - P3b 只加用例，现在开工，可与 1d、2a 并行。
  - P3c 用户 10-16 弹窗定了两件：这一片就教 Coding 的执行角色用外部等待（提示词升版本、WORDING_HISTORY）；`molis.action-query` 按权限管、不另写名单（只读查询，且本会话此刻有权调用）。
  - P3c 与 1d 撞不撞，等回执线给 1d 的清单再定。
- 10-16 早（UTC）：
  - #551（W4-04b，Form 走 Plugin Runtime）已合（`19823a62`），#552（回执 1c）已合（`2c91cd36`）。防腐线回复：Runtime 停插件时 `dispose` 先关库（`plugin-host-services.ts`、`home-plugin-executor.ts`），#551 第 7 片的原生崩溃仍判为跑机环境。
  - 这两个合入让在途三个 PR 只在生成的门禁数字上冲突：#554 被踢出队列（`page-assets.json`），#553（`baseline.json`、`page-assets.json`），#555（`baseline.json`）。**有冲突的 PR 加标签不触发 full-suite**（GitHub 对有冲突的 PR 不发 pull_request 事件），#555 因此两次加标签都没跑。合入顺序 #554 → #553 → #555，各自并 main 后重算数字；#554、#553 的新 head 算只合并，不重跑全量；#555 还没跑过全量，并 main 后重新加标签。#553 并 main 时 `APPROVED_CEILINGS` 的键要改成新的 merge-base 字节数。
  - 回执 1d 的资源增长（coding.js 与四份同样的包、样式表 +33 字节）按用户 10-15 的「规则要合理」走一次性例外（选项 A），写法同 #553；回执线会话的权限检查若拦下门禁改动，由用户在那个会话里批准。
  - 情境 W3-A2 只等 #553：1d 不再碰 assistant-island，所以不用等 1d。W4-10（#555）排在 W3-A2 与 1d 之前。W3-A2 的链接语义定为：用 + 加入的，同时进模型上下文和链接；没加的两样都不进；从对象发起的条目必须把对象放进手里。
  - 防腐 W4-04c #558（Form 页面改为打包的 TypeScript，form.js 37,472 → 30,300 字节，新计数 scriptConstants 130 → 129）已审、加了 full-suite。#557（子代理直接对话与 AI 开发手册需求）不是四线的，统筹不经手。
  - #556（P3b）已合（`5948c56d`），#554（H4 第一部分）以只合并的新 head 入队后已合（`bdcf6920`）。交互开 2b；#553 并 main 重算后只合并入队。W4-05 #559 已审，等全量空位。#555 并 main 后重新加标签，全量在跑。
  - 回执 1d 的一次性资源例外被回执线会话自己的权限检查拦下，用户在那个会话里批准。
  - P3c（采用，`adoption/p3c-external-checks`）与 1d：起初按 1d 的计划清单以为撞四个 agent-host 文件，回执线核对已提交的 diff 后更正为源码不重叠（恢复输入在 `adapters/prologue-recovery.ts`），最多撞 contracts `services/agent-host.ts` 的一行和生成的数字文件。所以 **1d 只在 #553 之后变基一次，不等 P3c**；两者谁后合谁重算生成文件，算只合并。
  - P3c 统筹定（技术口径）：检查器可查的动作在「query + read + 本会话此刻有权」之外，**声明了 `model:invoke` 的也拒绝**。仍是按权限判，不是名单，不违背用户「按权限管」；理由是检查器反复轮询，每次都调模型就花费无界、结果不确定，且 §4.6.9 已写明检查器不调模型。要有断言拒绝本身的用例，spec §4.6.9 与 §6.0e 写成一致。
  - P3c 的 Coding 提示词没有离线回放；弹窗问用户要不要先跑小评测，用户「无偏好」，随后明确「按推荐做」：合入前在隔离 Home 用 MiniMax 跑 3–5 个需要等外部结果的 Coding 任务，看模型是否用外部等待而不是自己轮询或提前收尾；密钥只给引用，结果写进 PR 与 WORDING_HISTORY。评测结果出来后统筹才加 full-suite。
  - 用户 10-16 新增第五条线「AI 能力开发手册」（会话 local_31cd133b，名 line-ai-handbook，工作树分支前缀 ai-handbook）：需求书 specs/ai-development-handbook/spec.md（#557 在合并队列）。分三步：① 只改文档的手册 PR（PROLOGUE-AI.md 与 skills/molis-prologue-ai/SKILL.md 唯一入口）；② 按手册盘点存量 AI 逻辑（提示词、Skill、上下文组装、工具描述、调模型路径），清单先发统筹、不改代码；③ 统筹按价值与风险排进各线串行顺序后逐片清理，提示词改动升版本记 WORDING_HISTORY，有回放跑回放、没有的问用户后做真实模型小评测。动 P3c、2c、W3-A2、1d、W4-03 在改的文件前先问统筹。
  - 防腐线报：files、git、diff、text-stats 四个伴随面各发一份 432 KB 的 Coding 安装脚本。拆两片：W4-03 第 2 片只去重（指向 Coding 的包，界面不变，排在 1d 之后，同 PR 删 1d 那四份的一次性例外）；伴随面各自出 Manifest 视图是界面改动，单开一片，排在交互 2c 之后、与交互线一起定。
  - W3-A2 文件清单已认可：与 #555 同碰 touch-targets 用例和 assistant-island.ts（不同段），#555 合入后 W3-A2 变基一次再开 PR；去掉「说出要做什么」、Todo 委派不再预填「帮我推进…」写进 context-program 决策记录。
  - MiniMax 密钥由用户存进钥匙串（服务名 minimax-api-key），评测只在命令上内联读，不落文件；各会话读它的权限由用户在那个会话批准。
  - 合入：#559（W4-05，`0ed2de23`）、#563（W4-08 文档与独立复查，`cd52111a`）。#561 的全量只挂在「子集清单不该列挡合并作业已跑的文件」一条，删一行后只合并入队。#565（W4-03 第 1 片）要求默认接线只在内置插件之间生效、补拒绝用例；已安装插件能否声明默认来源之后弹窗问用户。#564（1d）的 +1751 比用户批准时多 222 字节，是 1d 自己的恢复面板「排着的补充」一行，按「小而必需」放行；1d 新增模板字符串浏览器程序，必须先于 #558（scriptConstants 新文件从 0 起算）合入。
  - 手册线：#567（只文档）已审、只合并入队。存量清单 16 项（笔记 ai-handbook-inventory.md）排序：B1→B2→B3→B5→B4 现在逐片做（B 系列评测请用户一次性同意）；D1 第①步只读可并行（只用隔离 Home 的冻结记录）；D2 里卡片按措辞判 stale 那处已随 #561 进 SDK、归交互 2c；A2 按推荐（列出暂不可用及原因、有上限、不可调用）记进决策记录，动 assistant-service.ts 前报清单；用途组合同在 #562 之后单独一个 PR；A1 与 Coding 用途组在 P3c、2c 之后，Coding 设置里的「我的默认」界面归交互线或与之协作，排期时定；A3、D1②、C1–C3 按清单，D1② 改用户 09-28 的决定要弹窗。
  - 用户 10-16 在手册线会话弹窗拍板：Coding 用途组——执行默认带「实现需求」、评审默认带「审查改动」、其余为空，各用途有自己的可选方法；没选上的可选方法交 AI 按需读取（第二步，先评测）；Coding 设置里按项目、按用途存「我的默认」；各片真实模型前后对比整体同意，只在隔离 Home 跑。仍需先问的只剩 D1 第②步。#561（2b）已合（`d2b3b374`）。
  - 防腐线下一步：W5-13（吞掉的错误 + 宿主结构化日志，第 1 片 console 88→28，只记键不记文字），W5-12 可并行；W5-09 等 1d 与 P3c；W5-01/02/04/05/08/10 由统筹在本批合完后排。
  - 用户 10-16 新规则（手册线转来，笔记 ai-handbook-agent-design.md 第 11 节）：MiniMax 能力弱，模型自身能力造成的坏效果不逐个打补丁——不为某次说法在提示词加禁令，不在代码加正则、特例分支、场景开关；会误导用户、重复写入或越权的，用与模型无关的事实核对在工程层兜住，只是答得不够好的记为模型限制。评测记录逐条标「设计问题 / 模型能力 / 拿不准」。统筹评审 AI 相关 PR 照此看，已转告采用、交互、情境三线。
  - 交互：`settled()` 改认 SDK 的 `actionErrorKind`，现在单独一小片（只 SDK 文件，审后上 CI 全量）；先查哪些主人的「已变化」报错没带冲突类码，有就在主人那里补码，不按文字判；fixture 只从文字换成码、断言语义不变。2a 等 #564 合入。
  - 10-16 晚合入：#567（手册第二部分，`e502470c5`）、#562（W4-02，`8daeaed35`）、#564（1d，`bd2472ae7`）。1d 合入后：#558 并 main 重算再加标签；交互 2a 开工；W4-03 第 2 片（只去重，同 PR 删 1d 四份一次性例外）先报清单；回执 1e 先发界面方案。
  - #565（W4-03 第 1 片）修好：默认接线只在随宿主发的插件之间（`platform.shipsWithHost`，宿主启动清单的 bundled 标记），W4-03-04 拒绝用例先红；已加 full-suite。#560（P3c，head 36b82325）通过、已加 full-suite：工具名参数、拒 model:invoke、失败标记经链接拒、lstat；评测 3/4，T3 失败是延后工具 find-tools 后下一次请求不声明它——设计问题，采用线先查影响面与改法（vendored/上游要弹窗）。
  - settled() 片：七个「数据已变」的码改声明为 conflict（400→409），统筹按防腐定 A（Characters 的「保留 400」是 F109 的保行为选择，不是用户决定）；要钉 409/stale 的表格用例。
  - 手册 B1 = #568：项目上手用自己的端口（`configured-text-port.ts`）、不再借 Cognia 角色；评测改前改后各 10 次。要补 S-13 用例与表行（不带系统角色后抗注入靠围栏 JSON）和使用记录归属断言，再加标签。用途组合同在 #562 后开工、先报清单。
  - W5-12（本机全量前后计时）：统筹发「安静时段」才跑，条件是防腐本机批次完、1d 合（已满足）、其他线当前批次完；时段内其他线不起构建与浏览器批次，约 75 分钟。
  - 待攒批弹窗：已安装插件能否声明默认来源；延后工具声明的改法若碰 vendored/上游。
  - 10-16 深夜合入：#565（`dfc81998a`）、#560 P3c（`9c75ff8e7`）、#558（`0367ad33a`）、#568 B1（`cbf2341c5`）。#569（settled()）全量只挂 goal-event-http 把 stale_commitment 钉在 400，是预期变化，交互改 409 后重标；#570（W5-13 第 1 片）全量在跑。
  - 采用线探针：main 上任何被延后的工具（超过 `deferToolSchemasBeyond: 20`）对任何模型都调不到——find-tools 之后下一次请求仍不声明它（SDK `agent-run-recipe.js` 的 `toolSpecs`）。受影响：Coding builder（≥3 个目录工具）、coordinator（≥6）、writer（≥10）、planner/reader/reviewer（≥13）；助理 operate 正好 20，再加一个就全失。
  - **用户 10-16 弹窗（四项全按推荐）**：① 延后工具上游 Prologue 修（find-tools 返回的工具在该运行后续请求里声明、记进运行以便恢复与回放），同时现在由采用线在 agent-host 去掉 `deferToolSchemasBeyond` 止血，新包换入后撤止血；② `board-wait` 的 params 按检查器带 schema，并进同一上游改动，换包后重跑 P3c 小评测；③ 已安装插件暂不许声明默认来源，只在随宿主发的插件之间，装插件时的同意流程有了再议（W4-03 第 2 片改文档措辞）；④ 暂不换更强模型对照，分不开的记「拿不准」。
  - W5-12 安静时段 23:56 开始（防腐线跑本机全量、全量构建、增量构建），期间各线不起构建、浏览器批次与评测。
  - 10-16 凌晨（PDT）：#572（防腐 §10.15 复查，只文档）、#574（手册记用户 10-16 两项决定，只文档）只合并入队。#569 重标（a746e529，goal-event-http 改 409）；Coding 自己的 HTTP 边缘把未点名的码回 400 归交互 2c 按 kind 改。#570 全量在跑。
  - #573（W3-A2）逻辑与决策记录通过；要补情境条溢出（已选横向滚动+边缘渐隐，STRIP-03）与 touch-targets 覆盖 ＋/×；390px 浮条盖住面板归情境线自己的待办。#571（2a）结构通过；要并 main、改 S-28、证明 `molis-suggest-` 前缀不可伪造、用常量。
  - 手册 B2（Cognia）获准，用 contracts `model-prompts.ts` 的纯函数 `fencedMaterials(data, boundary)` 统一三处「材料不可信」围栏（项目上手、Cognia、Todo 整理器），删项目上手本地副本。
  - 采用线上游计划获准（用户 10-16 弹窗已覆盖）：molis-ai/prologue 分支 `fix/found-tools-declared`，(a) 延后名册上的名字按真 schema 放行，(b) find-tools 找到的工具在后续请求声明、记 `tools-found` 事件以便恢复与回放，另一提交给 board-wait params 按检查器带 schema；**上游 PR 合并前统筹先问用户**；之后 molis-work 换包 PR 恢复 `deferToolSchemasBeyond`、删止血、重跑 P3c 评测。止血 PR（`adoption/no-tool-deferral`）安静时段后构建测量再开。
  - 会话消息上限：用户不发言时统筹最多给其他会话发 10 条，到了就停；安静时段结束的通知要等用户发一句话。
  - 10-16 上午（PDT）：#570（W5-13 第 1 片，`b4044c33e`，GitHub TLS 超时出队一次后重入队）、#569（settled()，`19dc13d41`）已合。W5-12 完成：16 分片全量 58.2 分钟（串行 76–78）、无争用；main 上真失败 4 个文件，issue-capture 是新近回归（基线过），防腐在 #565/#560/#558/#568 间二分；onboarding-journey、project-arrival、issue-clarification 基线也红，记入 W5-12 文档 PR。安静时段结束，已通知各线。
  - **用户 10-16 同意合并上游 molis-ai/prologue#28**（头 af7be966：tools-found 声明、listedTools 放行、检查器 params schema）。采用线合并后开换包 PR（干净 git archive 重打包、删旧 tgz 与记录、patch-history 加条目、恢复 `deferToolSchemasBeyond: 20`、删止血、止血测试改成「超 20 先找后调与按名直调都能用」并先在旧包上红），合入后隔离 Home 重跑 P3c 小评测（每任务 3 次）重新归类。
  - 止血 #575（`0e256445`）与手册用途组 PR A #576（`e1508f07`）审过、加 full-suite；#575 先合，保证换包前工具都能调。PR B（Host 启动拒绝）等 2a。
  - 采用线合并上游 prologue#28 被它自己的权限检查拦下（用户同意经统筹转达，不算该会话的授权），连 vendor/prologue-sdk 的读取也被拦；**要用户在采用线会话里亲自同意**，统筹不代办。#575 由统筹的合并队列合，不需采用线动手。
  - 手册 B2 #577（`3057ba36e`，Cognia 用 contracts `fencedMaterials`、两段提示词升 v2、S-13 加 Cognia 一条、评测 30 次）审过，等空档加 full-suite。
  - #571（2a）并 main 后新头 `819a4e4ca` 审过（S-28 写明免审前缀只属这一轮的建议工具、伪造前缀用例、单一名字），排在 #577 后加 full-suite（after-577 脚本）；2c 文件单加 Coding HTTP 边缘按 kind 给状态。#573（W3-A2）新头 `acbd2becc` 审过（横向滚动+有更多的一侧淡出、键盘滚进视野、竖滚轮横滚，STRIP-03；touch-targets 量 ＋ 与 ×；截图看过），排在 #571 后加 full-suite（after-571 脚本）。标签顺序：#575、#576 在跑 → #577 → #571 → #573。消息上限将到：已让交互线在 #571 合入后、回执线在 #573 合入后自行开工 2c、1e，不等统筹通知。

  - 2c 合同统筹定 B：宿主注册动作 `agent.offers.run@1`（owner agent-host、受众 plugin、项目范围、concurrent），只执行该建议自己点名的确切引用，输入过动作自己的检查，用回合的授权来源重新发现后 `beforeEffect()` 再调；S-28 下加一条并逐条断言拒绝；动作快照加一行；重复执行由 Coding 自己的认领与修订号兜住。A（typed 能力加返回值）、C（插件自己的授权）不取。详见共享笔记 h4-2a-2c-file-lists.md 末节。卡存 Coding 私有存储 `cards:<session_id>`（compareAndSet，不新建表、不升库结构版本），宿主动作的拒绝记为新行 S-29；同一会话两张卡并发点要都记对。回执 1e 预查：SDK 没有被打断丢弃回复的公开事件，打断标记只在页面上按回执做，完整标记记为 Prologue 需求（与已批方案一致）。
  - 防腐：issue-capture 基线也偶发红（ISSUE-34/37/38 侧栏 iframe 20 秒），不是新回归，8 轮对比后再定要不要二分；onboarding-journey/project-arrival 的收尾竞态由 #578（`840698e6`，HOST-CLOSE-01，含 W5-12 数字与 BL-142）修掉，审过、排在 #573 后加 full-suite（after-573 脚本）。#579（§10.16 复查，只文档）要把 #571 处的 S-27 改成 S-28，改完只合并入队；它的两条跟进：#571 的 check 透传已归 2c，#576 文档「默认已选上」交手册线在 PR B 改。

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

- 10-15 晚：统筹的 `gate-and-queue.sh`（scratchpad，zsh 写法）被用 `bash` 调起，zsh 的去重与差集写法语法出错后一路走到入队，把全量有未知失败的 #546 放进了合并队列；发现后立即用 `dequeuePullRequest` 撤出，没有合入。脚本已改成：不是 zsh 就拒绝运行；从日志找不到重试失败的文件、或有任何不在已知名单里的文件，都不入队。教训：门禁脚本出任何错都要停在「不入队」，不能默认往下走。

- **钟停着时不能原地打转**：Prologue 的内存 Host 时钟不走，只有 `clock.advance()` 才动。凡是「按下一次时刻排队」的逻辑，要从「现在」与「这一回到期时刻」中较晚的那个往后排；P2j 曾因此在测试里一秒几千次地打转。
- **改图先落盘再换进内存（P2h）的连带影响**：
  - 先读版本、再排队写的调用会撞 `TASKBOARD_CONFLICT`。Runtime 自己记账的写入不要带「刚读到的版本」。
  - 没 await 的改图，在下一行还看不见。
- **开跑键的字符集**：只能是 `[A-Za-z0-9._~-]`。步骤编号是自由文本，不能拼进键。
- **用例必须走过真的跑**：P2h 的 `canPark` 在执行器建好时就算定了，所以绑定的跑永远让不出；只靠单元测试抓不到，跑级用例才抓到。
- **Molis 门禁是对照 merge-base 量的**：
  - 新文件里的长函数算新增的巨大单元，搬家也算。所以 W4-06 必须拆到阈值以下，不能整段搬。
  - 页面资源字节只许减少，预算等于实测。
