# 输入回执交接时的 PR、分支与进度

这是交接时的工程记录。当前接续入口、已定取舍及未开工事项保留在[总需求书](spec.md)。

[返回需求书](spec.md)

- [交接记录](#交接记录)
- [阶段进度](#阶段进度)

## 交接记录

**已合入。**

- **Molis（PR 与合入提交）：**
  - 阶段 1：#531 `9a8839669`（1a）、#552 `2c91cd36c`（1c）、#564 `bd2472ae7`（1d）、#589 `ca36cb959`（1e）；
  - R1 与 A：#601 `54cf1dd80`（R1）、#605 `f9989ea51`、#610 `4ffa88cc3`（A）；
  - 3a、3c、B、C1、D1：#614 `ea396a276`（3a）、#622 `bf33f5ef3`（3c）、#628 `446c05218`（B）、#639 `d7a572133`（C1）、#643 `7a55444fd`（D1）；
  - 测试修复：#645 `f63f9945f`、#646 `b3c549aa8`；
  - 3b：#649 `a77407868`（3b-1）、#667 `e49f6a558`（3b-2a）、#671 `4b063bf98`（3b-2b）、#687 `1483a9f2c`（3b-2c）；
  - 3d：#682 `62e52c373`（3d-1）、#688 `877dc7626`（3d-2）、#700 `e128c1203`（3d-3）、#706 `149faac7d`（3d-4）、#711 `eb3bf7131`（3d-5）；
  - 3e：#713 `0ffa9842d`（3e-0）、#714 `e5adc24c2`（3e-1）、#726 `f28088b2b`（3e-0b）、#803 `bca2e3bf1`（3e-2a）；
  - 评审修复：#778 `380d365e1`；
  - D3 与 D32-b：#795 `fbc826b68`（D3）、#807 `7d1cc4bfa`（D32-b）；
  - 阶段 4 的前三片：#793 `2a9ff71d7`（BL-144，RCPT-368）、#813 `914a64982`（S2-1）、#818 `fba58a068`（S3-1，RCPT-390）。
- **Prologue（`molis-ai/prologue`）：**
  - #4 `55b0c85ae`、#5 `f5ef12e60`（S1～S3）；
  - #10 `c9a6e7749`（S4）；
  - #54 `27daa94ea`、#55 `26a86ff3b`（BL-162 的调用归因）。

**交接时在途、现已合入 main（2026-10-20 核对）。**

| PR | 片 | 合入提交 |
| --- | --- | --- |
| #829 | S3-3：Agent 一轮的工具调用及本人点击建议带宿主核过的会话（S-17，RCPT-391～395） | `ad5a60abb` |
| #837 | S2-2：`goals.events.acknowledge`，外部 AI 会话对笔记、要求、决定说明处理方式（RCPT-376～383）；同一 PR 带 P7 的显示名表，事件读取动作升到 @2 | `ed090054e` |

两片已包含在 [Full suite #39444644367](https://github.com/molis-ai/molis-work/actions/runs/39444644367) 的完整回归中；1176 个测试文件通过（2 个按现有规则重试通过），最终 main `2571a328` 的完整文件树与被测树相同。补修、定向验证和未覆盖项见 [#829](https://github.com/molis-ai/molis-work/pull/829) 与 [#837](https://github.com/molis-ai/molis-work/pull/837) 评论。

**分支与工作树。**

- 仓库启用了合入后自动删除远端分支；上表两条已随合并删除。
- 本机还有两个工作树，都留到它们的 PR 合入后，由 ⑤ 或 ① 问过用户再删：
  - `receipts-line-f48952`：S3-3 与本交接 PR；
  - `receipts-3e-fixes`：S2-1、S2-2。
- `ai-input-receipts` 工作树（`feature/handoff-ai-input-receipts`）是 10-13 交接用的，内容已过时。删不删由 ① 问用户。

## 阶段进度

- 2026-10-09：方案写定（§0–§15），用户按推荐定下 §14 九项。阶段 0：本文改为执行中；Prologue 侧开工作树 `~/code/prologue-input-receipts`（分支 `feat/input-receipts`，基于主线 `4f7110fe`，未推送、未提交），基线核对：`tsc` 通过；14 个相关用例文件（控制、待办、任务板、提醒、会话续接、Run 恢复）在构建后全部通过。按 Prologue `AGENTS.md` §4 先写切片合同再实现：S1 输入身份与读到回执、S2 会话级持久排队、S3 处理说明与提醒、S4 任务板与待办引用输入；pending 的 about 与已回答事件推后（另一分支正在改 effect-policy）。阶段 1 的 Molis 代码等 `feat/prologue-adoption` 合入（它已把 Coding 的运行控制解析抽到 `plugins/native/coding/src/run-inputs.ts`，阶段 1 的 Coding 改动落在那里）。

- 2026-10-12：接续开工（receipts 会话）。Prologue：S2 分支 `feature/input-receipts-s2` 先合 main `69ccfa94`、跑 S1 回归，按统筹要求换基点到采用线的干净 S1（`edb8ec86` = `c4b9fde3` + S1 `4acfb445` + main `69ccfa94`），之后整合是快进。S2 切片合同 `docs/slices/input-queue.md` 先写后做：会话级持久排队、获准才带（默认 `ask`，`auto` 只作用于 App 开的跑）、历史可见不等于获准消费（没读到的原话不进后续入模历史）、子任务唤醒续跑不带、键整条会话去重、重启收口时入队。工程证据（三级分开）见 SDK 合同的验收记录；真实 Provider、Molis 生产入口、用户实操都未跑。Molis 分支合入 main `02ceba8c`；§6.1 第 4 项按 S2 实际入口改写，§6.2a 记下按现行 contracts 核对的落点。

- 2026-10-12（续）：S3（处理说明与有界提醒）在 Prologue `feature/input-receipts-s3` 上实现并工程通过（基点：采用线整合末端 `a13bf067` 合入 S2 得 `c0194228`）。切片合同 `docs/slices/input-handling.md`，决策记录 H1–H15。要点：模型只能说明这一跑里已读到的输入；说明没有权威、不改 `state`；提醒有界、只写编号、不挡死收工；`later-step / new-task / needs-clarification` 暂用 `note` 补足，S4 有了步骤与问题目标再收紧。Molis 侧准备：D10–D12 写入 §14；§6.2 `AgentInputView.handling` 的字段取自投影的 `handling` / `handlingRevisions`（`impacts` 为模型自称，观察到的影响仍由 S4 / Molis 投影）。
- 2026-10-12（再续）：R0 独立回执体验预览实现并工程通过（见 §18.8）。脚本 `scripts/preview-input-receipts.mts`（端口 4292）读 `scripts/input-receipts-slice/recorded/` 里用 Prologue S3 末端（`37427d09`）的真实 SDK 录下的事实，只做展示，不计算状态。非浏览器用例 12 条、浏览器用例 10 条（三宽度 × 浅深色 × 两种布局 × 四个场景、键盘、输入法、托盘、纠正、结束卡与重启分支）通过；健康门禁 `--base origin/main` 通过，新文件 Biome 0 诊断、类型检查干净、secrets 干净。**真实产品实操不适用（预览不连 Home）；用户本人验收未进行。**
- 2026-10-12（统筹交来）：Prologue S2/S3 已随 Prologue #5 合入 Prologue main（合并提交 `f5ef12e6`），采用线正在把这个包换进 Molis。新增待办 D16（§14）：`acknowledge-inputs` 在助理面板里的显示与措辞归本线，D7 之后接 S3 时定。
- 2026-10-13：S4（任务图、待办与问题引用输入）在 Prologue `feature/input-receipts-s4` 上实现并工程通过，PR [molis-ai/prologue#10](https://github.com/molis-ai/prologue/pull/10)（基于已合入 main 的 P2a / P2b / P2c）。合同 `docs/slices/input-board-refs.md`，决策 I1–I15。板工具 `forInputs` / `inputs` 经引擎盖章（只认这一跑读到的输入）写进图的 `origins` / `report.inputs`；`acknowledge-inputs` 多 `board-node` / `todo` / `pending` 目标，绑定了节点的跑只能指绑定的那块板；`update-todo` 保住模型给的 id；`ask-user` 带 `about`、问题落定记 `pending-settled/expired/cancelled`，投影多 `questions`（账说不清的 `unresolved`）。证据：内存 Host 19 条、真实 Node Host 2 条（含 SIGKILL）、六份干净包消费者、12 个变异、SDK 全量 340 个文件 3 764 条通过。**未跑：真实 Provider、Molis 生产入口、用户实操。** Molis 一侧（`services/agent-inputs` 投影、界面）等 D7。同日按用户决定，R0 并入本交接 PR，#438 关闭。

- 2026-10-13（防腐复查）：合 main `fc18d5f62`（merge-base `fc18d5f62`，合并提交 `e7c2d6b38`，无冲突）后复查本线自己的 diff（27 个文件、`scripts/` 与 `tests/` 与 spec，不碰 `apps/`、`horizontal/`、`plugins/`、`packages/`）。**通过，无待修项。** M2 `check-health-gates.mjs --base origin/main` 通过（新文件最长 219 行，没有新的巨大单元；录制的两份 JSON 不在源码计数里）；M7 对本线 23 个文件 `biome lint` 0 诊断（`pnpm lint` 全仓的既有诊断里没有本线文件）；M10 `test-imports.mjs --check --chains` 分裂进程数 164，与 main 基线同（两个新测试文件都不在任何链里）；`pnpm boundary:check` 无错误；doc-citation、根目录白名单、翻译门禁在 health 里通过。人工项：测试走公开入口（只经 `scripts/input-receipts-slice/` 自己的模块与设计系统根入口 `packages/design-system/src/index.ts`，不进别的包内部）；没有新增包内部引用；`scripts/` 里的预览与录制件放法与 I0、W0 同；没有 `console`、`as unknown as`、空 `catch`；预览里的中文文案在 `scripts/` 内、不属于产品界面字典（翻译门禁 0 缺失）。唯一要留意：页面服务用相对路径从设计系统源码取部件（根入口，非内部文件），换包 PR 里与「现场投影」一起复核。
- 2026-10-13 晚（统筹，阶段 1 第一片）：D7 三项满足（#408 已合 main，过渡包带 S1–S3，默认路径在换包时验证过），阶段 1 开工。本片：
  - 1a 的第一处抽取：补充回执的投影从 `prologue-stream.ts` 的巨大函数 `applyPrologueEvent` 里搬到 `horizontal/agent-host/src/adapters/prologue-inputs.ts`，走 `HANDLERS` 表。
  - 1c 的「读到」直接用 SDK 事件（D17）：新增 `steer-read`、`steer-withdrawn`，一轮结束没读到记 `unread`。
  - 1b 的第一块合同：新子路径 `services/agent-inputs`，`AgentSteerControl` 带 `source`、`key`；`AgentRunControl` 的 steer 分支改为引用它，`agent-host.ts` 不加行。
  - 1c 的来源标记（D18）：宿主代写的补充交 SDK `app`，运行视图显示成 `notice`。
  - 1d 的第一处措辞：Coding 回执条与报告按 §3.3（「已送达」「已放进上下文，等 AI 回应」「AI 已读到」「这一轮结束时 AI 没读到」「已撤回」）。
  - 用例：新增 `tests/prologue-input-receipts.test.ts`（编号 AC-R1–R3，经包入口）；`prologue-recovery`、`coding-report-persistence` 的期望从 `unconfirmed` 改成 `unread`（D17 的预期变化）。
  - 还没做：阶段 1 的其余抽取（`assistant-inputs.ts`、`input-receipts-client.ts`）、键与同键重发、`RUN_NOT_RUNNING` 改排队、`runViewVersion`、恢复报告、助理侧（1e）、R0 现场投影（D19）。
- 2026-10-14（统筹，第一片的全量与合 main）：全量（`node scripts/run-tests.mjs`，`32c9364f`，约 113 分钟）6,240 条：6,226 通过、5 失败、9 跳过。5 条的归类：
  - `prologue-review-feedback` 两条（packed SDK 的审查反馈）：**预期变化**。宿主转告的拒绝意见按 D18 以 `host`（SDK `app`）交给 SDK，运行视图显示成 `notice`；它的回执在模型读到后从 `applied` 走到 `read`（D17）。断言改成找 `notice` 且回执到 `applied` 或 `read`（`c100dd8b`），不是放宽：顺序上 `read` 在 `applied` 之后。单独重跑通过。
  - `agent-action-selection.e2e` 一条：全量负载下的时序。本分支与干净基线（`fc18d5f6`）上单独重跑都通过。
  - `touch-targets.e2e` 两条：main 上已有的失败，与本线无关。
  - 合 main `2768dd71`（#491）后重新构建：相关用例 56/56（`prologue-stream`、`prologue-model-controls`、`prologue-input-receipts`、`prologue-review-feedback`、`prologue-recovery`、`coding-report-persistence`）；健康门禁对照 merge-base 通过；边界检查与页面资源通过。

- 2026-10-14（回执线会话，现状核对）：按 origin/main `393e8958` 的代码与用例逐项核对原始需求（§0 四问）与阶段 1–3 的验收。只读代码与跑过的用例；隔离 Home 实走见下一条。等级：「已实现」= 有代码且有用例；「部分」= 有一半或只有某个入口；「未做」= 没有代码。

  | 项（§11） | 状态 | 证据 / 缺什么 |
  | --- | --- | --- |
  | 1a 补充回执投影抽出 | 已实现 | `horizontal/agent-host/src/adapters/prologue-inputs.ts`（#409）；`tests/prologue-input-receipts.test.ts` AC-R1–R3 |
  | 1a `assistant-inputs.ts` | 未做 | 发送路由（回答 / 补充 / 开新轮）仍在 `AssistantService.dispatch` 与 `codingDispatch` 两处各写一份（`assistant-service.ts` 的 `freeTextQuestion`、`steerText`） |
  | 1a `input-receipts-client.ts` | 未做 | 回执条与补充发送仍在 Coding `client.ts` 主模板里 |
  | 1b 合同 `services/agent-inputs` | 部分 | `AgentSteerControl` 有 `source`、`key`；没有 `interrupt`、`about`；`control()` 返回 `void`，调用方拿不到输入编号与 `replayed` |
  | 1c 键与同键去重 | 部分 | `prologue.ts` 的 `control()` 把 `key` 交给 SDK（SDK S1 已去重）；但 Coding `run-inputs.ts` 的 `runControl` 与助理两处 steer 都不带键，所以页面断线重发仍会落两笔 |
  | 1c 宿主代写标来源（D18） | 已实现 | `prologue-node.ts` 的活动跑句柄以 `source: "app"` 转告（审查拒绝、会话来信、等待唤醒、任务图更新）；助理审查转告、Coding 改计划说明带 `source: "host"`；`prologue-stream.ts` 把 `app` 显示成 `notice`；`prologue-review-feedback` 用例 |
  | 1c 读到（D17） | 已实现 | SDK `steer-read`、`steer-withdrawn` 直接投影；一轮结束未读到记 `unread` |
  | 1c `RUN_NOT_RUNNING` 竞态 | 未做 | Coding 路由先读一次相位再发（`routes.ts` `coding.control-run`），读后到发之间的竞态仍抛错；助理把错误原样给页面。现用包已有 `session.queueInput`（S2） |
  | 1c `runViewVersion` 纳入输入状态 | 未做 | `capability-registration.ts` 的版本串不含任何 `steer.state`：早先一条补充从 `applied` 变 `read` 不改版本，页面要等别的变化才刷新 |
  | 1c 恢复报告「输入」一类 | 未做 | `AgentRecoveryReport` 只有跑、阻塞与操作 |
  | 1c 会话条目记录收下的输入 | 未做 | 等 W4-06（#498）拆完 `prologue-node.ts` 再接 |
  | 1d 措辞（§3.3） | 已实现 | Coding `client.ts` 回执条、`report.ts` 的 `STEER_WORDS`（#409） |
  | 1d 发送方式菜单（补充 / 打断 / 下一轮） | 未做 | 运行中只有一种发送（steer），合同没有 `interrupt` |
  | 1d 「发送中」气泡与同键重发 | 未做 | 发出后只在状态行写「补充要求已交给执行引擎」；失败只显示错误 |
  | 1d 宿主说明不显示成你的话 | 部分 | 转告是 `notice` 轮、不套用户气泡样式；但 `notice` 轮也挂了补充回执条（`steerOf` 只看 role），读着像你发的补充；没有「Molis 转告」的样式 |
  | 1d 「核对并继续」带上没读到的输入 | 未做 | `continuation.ts` 只从首条任务与宿主事实重建 |
  | 1d 计划轮次不写「已体现」 | 未做 | `plans.ts` 的 `planTask` 仍写「已体现在确认的计划里」 |
  | 1e 助理工作视图回执 | 未做 | `assistant-island.ts` 不读 `turn.steer`，只弹「已补充到正在进行的这一轮」 |
  | 1e 回答 / 补充由用户点选（D14） | 未做 | 仍按「恰好一条自由文本题、没带材料」自动当回答 |
  | 1e 重试键跨刷新保存 | 未做 | 页面的 `unsettled` 只在内存里；宿主的 `request_id` 去重只覆盖开新轮，补充不带键 |
  | 1e 补充原话按 person 记录（G13） | 未做 | 助理只为开新轮存 round |
  | 阶段 2（SDK S1–S4） | S1–S3 已在现用过渡包；S4 未进包 | 现用包 `interim-p1-cu-image` 里有 `queueInput`、`inputQueue`、`steer({interrupt,key,source,about})` 回 `SteerReceipt`；S4 等 P3 换包 |
  | 阶段 3（处理说明、关联、影响、纠正） | 未做 | 依赖 P3；D16 仍由采用线暂时隐藏 |

  对四问的回答程度：「被怎么处理」只答到送达、放进上下文、读到、没读到（Coding 有，助理没有）；「在哪里处理」「改变了什么」都没有；「还有什么没处理」只有 Coding 回执条上的「这一轮结束时 AI 没读到」，没有托盘、没有带到下一轮。

- 2026-10-14（回执线会话，**暂停点**；统筹按用户 10-14「当前任务完成后，先暂停需求的线，让防腐线先继续」叫停，整机让给防腐线）：
  - **已完成（都已推送，没有只在本地的东西）**：
    - 现状核对（上一条）。
    - 分支 `receipts/1a-extract`（基于 main `393e8958`）：1a 抽取，行为不变——助理两处发送路由合成 `apps/local-host/src/assistant/assistant-inputs.ts`；Coding 的回执条与补充发送搬到 `plugins/native/coding/src/input-receipts-client.ts`；Coding 页面脚本的四段注释移出模板，按源码算约 −470 字节。另一个提交修了一个现存缺陷：`coding.runs.control` 自 `ed5acdfe` 升到第 2 版后，助理的 Coding 执行者仍只找第 1 版，从助理给正在跑的 Coding 轮次补充或回答会报「这个项目还没有可用的 Coding 插件」；改为按动作写明版本，`tests/assistant-coding-executor.test.ts` 的替身改读 Coding 自己发布的版本，并加一条补充走到 `runs.control` 的用例。本地 `check-health-gates --base origin/main` 通过（巨大单元下降，已 `--update` 本地快查）；`tsc --noEmit` 只有旧 dist 带来的既有类型错，新文件无错。
    - 草稿分支 `receipts/1c-agent-host`（叠在 1a 上，WIP 提交）：合同 `AgentSteerControl` 加 `mode`（`next-boundary` / `interrupt` / `after-run`）与键的写法 `AGENT_INPUT_KEY_PATTERN`（与 SDK 的 SEGMENT 一致），`control()` 返回 `AgentSteerReceipt`（`input_id`、`replayed`、`delivered: run | queued`）；`prologue-inputs.ts` 的 `deliverSteer`：已结束或 `after-run` 进会话排队、`RUN_NOT_RUNNING` 用同一个键 `queueInput`；`prologue.ts` 接上（文件行数不变、类缩 2 行）；`runViewVersion` 纳入每条补充的状态；Coding `coding.runs.control` 升第 3 版（`key`、`mode`），路由对已结束的轮次放行补充并回传回执；助理用 `send.<request_id>` 作键、竞态时结果为 `queued`（合同 `AssistantSendResult.outcome` 加 `queued`，底栏提示「这一轮刚结束 · 已排到下一轮」，英文已加）。用例 `tests/agent-input-delivery.test.ts`（RC-02–RC-04）、`coding-run-control-contract`（RC-01）。
    - 草稿分支 `receipts/1d-coding`（叠在 1c 上，WIP 提交）：Coding 发送方式下拉（补充要求 / 打断并改向 / 这一轮结束后再做）；「发送中」气泡与同键重发（只有断网或回包读不出才算「没送到」，被拒的不留气泡）；宿主转告的 `notice` 轮不再挂补充回执条，改标「Molis 的说明，不是你发的话」并换样式；输入框 Esc 不再直接停止（D3），停止按钮去掉 Esc 提示；`plans.ts` 的规划补充不再写「已体现在确认的计划里」（RC-07，G14）。
  - **没验证的**：三条分支都**没有构建、没有跑任何用例**（构建锁一直被别的会话占着）；没有在隔离 Home 实走（准备了慢速替身模型脚本，未启动）；没开 PR。1c 还缺：`prologue-node*.ts` 一侧的接线（活动跑句柄 `steer` 要把 SDK 的回执交回、`createNodePort` 加 `queueInput`）——等 W4-06（#498）合入后在拆开的 `prologue-run.ts`、`prologue-node-port.ts` 里做；恢复报告的「输入」一类；`pnpm api:update`、`pnpm actions:update`；页面资源字节与巨大单元按 merge-base 复核。1d 还缺：「核对并继续」带上没读到的输入（要 1c 给 `agent.run.start` 加 `queued` 带入），以及三宽度与深色截图。1d 的界面字节没有量过。
  - **恢复时第一步**：在 `receipts/1a-extract` 上并入最新 main → 拿构建锁 `pnpm build` → 跑 `node scripts/affected-tests.mjs` 选出的 1a 定向用例（含 `assistant-coding-executor`、`coding-client-scripts`、`assistant-*`、Coding 浏览器用例，浏览器用例拿浏览器锁）→ `node scripts/gates/page-assets.mjs --update --base origin/main` 把 Coding 资源字节降到实测 → 在隔离 Home（`MOLIS_WORK_HOME=<临时目录>`、不用 4173/4207/4208 端口、慢速替身模型）把 Coding 与助理的补充回执各实走一遍，结果补进现状核对 → 开 1a PR。之后 1c 等 #498 合入、并入 main 再续写，1d 叠在 1c 之后。
- 2026-10-15（回执线会话，恢复，只做 1a；1c、1d 继续等 P3a）：
  - `receipts/1a-extract` 并入 main `e8218714`（#523 I8 整树、#489）；冲突按 main 的现行形状解：助理的错误改用 `assistantErrors`，两处发送仍只经 `assistant-inputs.ts`。
  - **Coding 的 `input-receipts-client.ts` 退出 1a，挪进 1d。** 宿主发页面脚本前用 esbuild 压空白与语法（`apps/local-host/src/served-page-text.ts` 的 `tightenServedJs`），模板里的注释本来就不下发；所以「注释移出模板约 −470 字节」是按源码量的，不对。按下发的字节量，抽成工厂反而多出包装：原样抽取 +229 字节，最省的写法（只抽回执条、补充发送留在原处）也 +46，`page-assets` 门禁对照 merge-base 不放行。1d 要给这个模块加发送方式、发送中气泡与重发，本来就得在 Coding 页面脚本里省出字节，抽取和省字节放在同一片里做。量法：取 `CODING_CLIENT_FACTORY_SCRIPT`，按 `tightenServedJs` 的选项压缩后比字节。
  - 验证：`pnpm build` 后跑 `node scripts/affected-tests.mjs` 选出的 82 个非浏览器文件，加 `coding-run-control-contract`、`assistant-image-restart-http`、`assistant-memory-error-model`、`assistant-undo`、`assistant-delegation`、`prologue-input-receipts`，全部通过（`install.test.ts` 第一次因只重建了 Coding 包、构建指纹落后而失败，整体重建后 22/22）。Coding 页面脚本与 main 相同，不选浏览器用例。`check-health-gates --base origin/main` 通过（`AssistantService` 1814 → 1796 行、112 → 110 个方法），`page-assets --base origin/main` 通过。
  - 隔离 Home 实走（临时 `MOLIS_WORK_HOME`、端口 4391、慢速替身模型 4392，每次回复流 20 秒）：① 助理自己的一轮进行中再发一句 → `outcome: steered`，替身模型下一次调用的最后一条 user 正是这句；助理页面仍没有回执条（1e）。② 把同一项工作「交给 Coding 继续」，Coding 一轮进行中从助理再发一句 → `outcome: steered`（main 上这条路报「这个项目还没有可用的 Coding 插件」），替身模型下一次调用收到这句；Coding 页面的这句下面先显示「已放进上下文，等 AI 回应」，这一轮结束后变「AI 已读到」。③ 一轮已经结束后再发的话开了新的一轮（`outcome: started`），与现行规则一致。
  - 防腐复查（统筹 10-15 起每个 PR 都要过，清单 `coordination/2026-10-13/ANTI-CORRUPTION-REVIEW.md`）：2026-10-15 · main `e8218714` · merge-base `e8218714` · **通过**。机器项 M1、M2、M4–M10、M15 全过，M14 不适用。人看 27 条里适用的都符合，逐条结论与依据写在 PR #531 的「防腐复查」一节。已修一项（第 1 条）：助理找 Coding 动作的版本改成逐个写明现行版本（`runs.control` 为 2，其余为 1），去掉「没写就当第 1 版」的默认值。暂缓一项：`codingDispatch` 回答 Coding 问题时的 `pending_revision ?? 1` 是 main 上已有的行为，1a 原样保留，归 1c（1c 本来就要改这条控制的合同）。

- 2026-10-15（回执线会话，1c 按 P3a 之后的 main 重做，本地未推送）：统筹看过对照清单（P3a 后要改的点）后定下：通道选 A；P3a 后的 1–8 条照做；助理下一轮带上排着的补充（Coding 的放 1d）；新底栏提示挪 1e，但 1c 不许把排队的说成「已补充」。新分支 `receipts/1c-send`（基于 main `7fe8ee65`，旧草稿 `receipts/1c-agent-host` 只作参考）：
  - 合同 `services/agent-inputs`：`AgentInputSend`、`AgentSteerReceipt`、`AgentInputsPort`、`AgentQueuedInputs`、`AGENT_STEER_MODES`、`AGENT_INPUT_KEY_PATTERN`、动作 `agentInputActions.send`；`agent-host.ts` 去掉 `AgentRunControl` 的 steer 分支，加 `AgentRuntimeAdapter.inputs` 与开始参数 `queued`，行数不变。
  - agent-host：`prologue-inputs.ts` 的 `deliverSteer` / `inputsPort`（已结束、`after-run`、`RUN_NOT_RUNNING` 进会话排队，排队前调 `beforeQueue` 复查授权）；`prologue.ts` 的 `case "steer"` 换成 `inputs` 字段，文件行数不变（968）；新文件 `session-actions.ts` 收等待与接续的两个动作和 `agent.inputs.send`，巨大函数 `registerAgentHostCapabilities` 变小；`prologue-node-port.ts` 的 `queueInput`、`prologue-run.ts` 交回 SDK 回执并把 `queued` 交给 SDK（这两处在交互线 H3 改的文件里，H3 合入后按它的形状再落）。
  - Coding：`runs.control` 第 3 版；补充经 `agent.inputs.send`，已结束的轮次也放行补充；改计划的说明同样经它（`routes.ts` 行数不变，W4-07 拆完后按新位置落）。
  - 助理：`RunningRoundPort` 拆成 `answer` 与 `send`；键 `send.<request_id>`；`queued` 结果；下一轮 `queued: "carry"`；`exactRevision` 去掉 `pending_revision ?? 1`（两处）。页面：三句提示合成一张表，`queued` 复用已有的「已保存，下一轮开始生效」；删掉没人用的 `cardHint`，工作台脚本比 main 小 28 字节（`page-assets.json` 已降）。
  - 验证：`pnpm build` 后定向 11 个文件全过（含新的 `agent-input-delivery` RC-02–RC-05、`coding-run-control-contract` RC-01、`assistant-coding-executor` 与 `assistant-delegation` RC-06）；健康门禁对照 merge-base 通过（巨大单元与 typed 能力位置变少，`baseline.json` 已更新）；`api:update`、`actions:update` 已刷新（`coding.runs.control` 2→3，新增 `agent.inputs.send.v1@1`，受众 plugin）；页面资源、边界、页面事件、测试引用检查通过。
  - 变基到 ac47ed78（#536，W3-A1）：只有 `baseline.json`、`page-assets.json` 两个生成文件冲突，取 main 的再整体构建、`--update`。#536 已删掉 `cardHint`，第三句提示的字节改由 `assistant-send.ts` 里三处 `a && a.b` 写成 `a?.b`（结果相同）抵掉，工作台脚本比 main 小 10 字节。`affected-tests` 选出的 218 个非浏览器文件：216 过，2 个是本片的预期变化——`coding-actions` 断言 `runs.control` 第 2 版（改为第 3 版，并断言第 1、2 版都已不在），`coding-plan-amend-http` 的替身拦的是旧的 `controlRun` 补充（改为登记 `agent.inputs.send`，并断言说明以 `host` 来源发出）；改后两个都过。
  - 还没做：恢复报告列出输入（读 SDK `inputQueue()`）；会话条目记录收下的输入——SDK 的输入记录已带键、来源，按一个事实一个主人不在 Molis 另存，待统筹确认后从 1c 清单删去；隔离 Home 实走。
  - 变基到 424256ef（H3 #546、W4-07 #549 合入后）：Coding `routes.ts` 已按资源拆开，原来的改动只搬到新位置——`coding.control-run` 在 `routes-sessions.ts`，`coding.plan-amendments` 在 `routes-timeline.ts`，别的不动。H3 改的是 `prologue-node-port.ts` 的 `answerPending`（缺版本的答案直接拒），本片加的 `queueInput` 在 `createNodePort`，文本不冲突，语义与助理这边删掉 `?? 1` 一致。门禁数字先取 main 的再整体构建、`--update --base origin/main` 重新生成，结果与变基前相同（工作台脚本比 main 小 10 字节；`PrologueAgentAdapter` 606 → 604 行，`registerAgentHostCapabilities` 385 → 372 行，typed 能力 192 → 190）。
  - 防腐复查：2026-10-15 · main `424256ef` · merge-base `424256ef` · **通过**（变基后 `affected-tests` 的 218 个非浏览器文件加 `security-invariants-object-references`，219 个全过）。机器项 M1–M10、M13–M15 已跑，M11、M12、M16 不适用；人看 27 条逐条结论与依据写在 PR 的「防腐复查」一节。各项决定照统筹 10-15 定的做：`agent.inputs.send@1`、不留兼容、`beforeEffect` → `assertAuthorityCurrent` → 排队前再查一次、措辞说真话。

- 2026-10-15（回执线会话，1d，变基到 #553 合入后的 main `2897ae04`）：1c #552 合入（main `2c91cd36`）后从最新 main 开 `receipts/1d`，照统筹 10-15 的几点做：
  - 恢复报告列出排着的输入（从 1c 挪来）：合同 `services/agent-inputs` 加 `AgentQueuedInput`（键、来源、哪一轮结束时没读到），`AgentRecoveryReport` 只加一行 `inputs?`；`prologue-recovery.ts` 读 SDK 会话的 `inputQueue()`，Molis 不另存（事实归 SDK 的输入记录）。Coding 恢复面板列出「下一轮开始时带上 N 条排着的补充」。
  - Coding 开新一轮带上排着的补充：`start-round.ts` 给 `agent.run.start` 传 `queued: "carry"`（D4：不自己开轮，人开的那一轮带上）。计划里补充的意见改说「没有逐条核对是否已写进计划」，不说已体现（G14）。
  - 发送方式与发送中气泡：Coding 的补充逻辑抽到 `input-receipts-client.ts`（发送方式、键、回执条、发送中气泡、同键重发），`client.ts` 变短（1643 → 1641 行）。一轮进行中输入框旁出现发送方式菜单（补充：这步做完后读 / 打断：丢弃当前回复 / 下一轮再做），用共同的 `mw-select`；每次发送后回到「补充」。没确认送到时字和方式留在输入框，气泡说「再按发送，同一条不会重复」，同字同方式沿用同一个键；宿主拒绝的清掉气泡。宿主发的说明显示为「Molis 的说明，不是你发的话」，不带回执。D3：输入框里按 Esc 不再停止这一轮，停止只用按钮。
  - 页面资源：`coding.js`（diff、files、git、text-stats 四个包与它逐字节相同）比 main 多 1751 字节、两份样式表各多 33 字节（删了确证没人用的 `cooperation-client` 两个字段、`subagent-cards-client` 的 `svg`、死规则 `.coding-composer-sep`，合并 h2–h4 规则之后的数字；多出的主要是中文文案）。统筹按用户 10-15 的口径（小而必需的增长按先例一次性放行）定 A，用户 10-15 在回执线会话里批准改门禁：`page-assets.mjs` 的 `APPROVED_CEILINGS` 在 #553 的三条后面加七条（键是 merge-base `2897ae04` 的确切字节，值是实测新大小，只用一次），`page-assets-budget` 补用例；合入后由防腐线删掉。
  - 验证：整体 `pnpm build` 后，`affected-tests` 选出的非浏览器文件加 `coding-input-receipts-client`、`prologue-recovery`、`page-assets-budget`，变基后 155 个全过；浏览器用例 `coding-input-receipts.e2e`（RC-10、RC-11、RC-13）过，截图三张在 `.impeccable/qa/review/ai-input-receipts/`（不入库）。`api:update` 刷新 `agent-host`、`agent-inputs` 两份快照；`actions:update` 无变化（`coding.runs.control` 仍是第 3 版，形状没变）。没做：隔离 Home 实走；被打断的那段回复仍留在页面上，没有标成已丢弃（另记）。
  - 防腐复查：2026-10-15 · main `2897ae04`（含 H4-1 #554、W3-B1 #553）· merge-base `2897ae04` · **通过**。机器项 M1、M2、M4、M5、M8–M10、M13 过；M6（第 19 条）按统筹定的 A 与用户批准的一次性放行过；M11、M12、M14、M16 不适用。人看 27 条：第 20 条按 Coding 页面脚本的现行写法（没有词典，`client.ts` 的回执文字原本就是中文字面量），没新建词典；第 21 条沿用页面已有的 `api`；第 25 条 `agent-host.ts` 只加一行；其余适用的都符合，逐条写在 PR 的「防腐复查」一节。

- 2026-10-16（回执线会话，1e，基于 main `cca71e02`，W3-A2 #573 已合）：统筹 10-15 批准方案（笔记夹 `receipts-1e-plan.md`），照做：
  - 宿主：`AssistantSendInput` 加 `target?: "answer" | "steer"`；`assistant-inputs.ts` 的 `deliver` 按它走，不带的一律是补充，去掉「一道自由文本题、没带材料就当回答」的自动判断；`target: "answer"` 而问题已不在等的以 `assistant.stale`（类别 `conflict`）拒绝，带材料的以 `assistant.invalid` 拒绝；HTTP 先拒 `answer`、`steer` 之外的值。G13：`typedWords` 从运行视图读本人的补充原话，记忆的「原话」与一轮结束交给学习的话都用它，`assistant-store.ts` 的 `typedTexts` 删掉；记忆工具读运行视图时取存储里最新的工作（第一轮开始前工具拿到的工作还没有会话编号，读不到）。`assistant-service.ts` 只就地改，行数不变（2080）。
  - 助理页面：回执工厂放在 `assistant-send.ts`（不新开文件，岛脚本少一行 import），`assistant-island.ts` 只就地接线（2276 行不变）。补充下面一行回执；问题还在等时写「已补充到这一轮；问题仍在等你回答」；目标芯片在底栏输入框里（复用 `assistant-executor` 的样式）；删掉「已补充到正在进行的这一轮」提示；重发键存 `molis.assistant.unsent`，读写都经页面已有的 `store`（try/catch）。
  - Coding：回执状态前进时在状态行说「你的补充：…」（第一次画不说）；打断生效时把正在写的那段回复变淡并写「这段回复已丢掉（你打断了它）」，只是页面状态；`client.ts` 只改一行（1641 行不变）。完整的标记作为 Prologue 需求记在 §6.1 第 9 项。没动 agent-host 的运行视图投影（SDK 没有这项事实，与 2a、P3c 不重叠）。
  - 验证：整体 `pnpm build`；`affected-tests` 的 204 个非浏览器文件加 `assistant-island-script`、`page-assets-budget`：204 过，`page-assets-budget` 因下面的字节增长失败；浏览器用例 `assistant-input-receipts.e2e`（RC-14–RC-16，新）、`coding-input-receipts.e2e`（加 RC-16）、`assistant-send-intent`、`assistant-stale-refresh`、`assistant-error-recovery`、`assistant-dock-ime`、`assistant-page-written`、`issue-clarification-page`、`coding-timeline`、`touch-targets` 全过。`check-health-gates --base origin/main` 通过；`api:update` 刷新 `services/assistant`；`actions:update` 无变化。截图三张在 `.impeccable/qa/review/ai-input-receipts/`（不入库）。
  - 页面资源（先抵后报）：抵掉的是删去的提示与它的英文、没人用的 `.assistant-materials` 选择器（回执条复用那条规则）。#584（Coding 的伴随插件借 Coding 的包，diff、files、git、text-stats 不再单发）合入后对 merge-base `cf954a0a` 实测还多：`workbench.js` +2145、`workbench.css` 与 `settings.css` 各 +136、`arrival.css` +112、`coding.js` +411，主要是新中文文案和它们的英文。用户 2026-10-16 批准「#584 合入后一次性放行」（统筹转达，在回执线会话里确认）：`page-assets.mjs` 按 1d 的写法恢复 `APPROVED_CEILINGS`，只有本片五条（键是 merge-base 的确切字节，值是实测新大小，只用一次），`page-assets-budget` 加本片的用例；下一次改这个门禁时删掉。
  - 没做：隔离 Home 实走（统筹在 W3-A2/1e 合入后一起走）；刷新后输入框里还是同一句时，状态行不另提示「上次没确认送到」（键照样沿用）；交给 Coding 执行的工作里的补充不算进「你说过」（D14c、RC-16 G13 说明）。回执条在 Coding 里画在气泡里面（1d），在助理里画在气泡下面，两处不一致；统筹 10-16 定：不挡合并，以后统一回执组件时再定一种。

- 2026-10-19（回执线会话，§10.28 评审跟进，基于 main `520db6d52`）：三条小修合成一片 3e-r，记录写在阶段 3e 下：本人标记的步骤（RCPT-366）；约定块的英文与整句（RCPT-367），并改名（D41）；角色越权的错误码（RCPT-365 加强）。按用户 10-19 定的轻测试：只构建改过的包和工作区，跑相关的非浏览器用例；浏览器验证记进 §12.6 待补。
