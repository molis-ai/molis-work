# Coding App 需求书

状态：现行规范（2026-10-01 合入后梳理确认）。Coding 的单一需求来源；七块能力已合入 main，下一阶段需求见 [next-requirements.md](next-requirements.md)。未做事项见[统一待办清单](../BACKLOG.md)。

2026-10-15 的可靠性、性能与 Harness 优化提案见[完整优化需求书](../coding-harness-optimization/spec.md)（待审阅）；产品基础合同仍以本文为准，用户纠正与输入生命周期沿用 [AI 输入回执需求](../ai-input-receipts/spec.md) §20。

把编码这件事作为一个 **Plugin Platform v2 的 app 插件**做进 Molis Work：
用户在项目里开一条编码会话，交给 Agent Runtime 去读、去想、去给建议，
成果以 Artifact 的形式回到项目里，副作用一律经宿主审批。

这份是 Coding 的单一需求来源。**平台侧**的需求在
[`../plugin-platform-v2/spec.md`](../plugin-platform-v2/spec.md)，本文不重复。

## 0. 本轮产品闭环（2026-09-21，已恢复推进）

本节是当前核对结果与剩余工作；下文保留此前切片的实现依据，历史工程完成不能解释为产品可用。

### 当前目标（2026-09-25，能力与体验全面对标）

用户在 2026-09-25 扩大了目标：不只做 UI，还要让能力达到顶级编码 Agent 产品的水准。参照 Claude Code、Codex（桌面与 CLI）和 Cursor；FlyLeaf 只读，只看有没有可以直接借用的能力。

七块能力都要达到"优秀"：子代理、计划与 TaskBoard、中断与恢复、会话之间互相调用与查看、长任务与上下文、工具与工程流程、体验。"优秀"要用正式入口和真实模型完成真实任务来证明，不能靠外部代写，失败时用户看得懂、能恢复。

- 动手前先写对照清单并给用户看过，见 [`benchmark.md`](benchmark.md)。清单包括每块的参照做法、FlyLeaf 可借用的能力、现状、差距、验收方式、价值排序和待拍板事项。
- 每完成一块，单独提交并推送到 `codex/molis-work-goal-continue`，并在本节如实记录。
- 成本、权限、设计取舍和跨会话规则由用户拍板。
- 完成标准：
  · 每块都有真实证据；
  · 用户用它完成一个中等复杂的真实开发任务，过程中用到子代理、计划、中断恢复和跨会话引用，全程不需要外部干预；
  · 由用户验收，不自行宣布完成。

下一节"向参考产品水准推进"是本目标之前的体验轮，证据仍然有效。


已定的具体取舍可以直接查[子代理轮次、命令审查、提交说明与思考设置](coding-trials.md#你拍板的四项2026-09-25试金石之后)、[协作任务与 SDK 的五项答复](coding-trials.md#你答复五项之后2026-09-26)和[左栏与任务图的位置](coordination-decisions.md#左栏各面回到左栏任务图成为主区域的视图2026-09-30你指出)。


- [Coding 七块能力的决定与验证](capability-decisions.md) — 覆盖恢复、TaskBoard、子代理、长任务、跨会话、体验与 Git。每块同时保留当时的选择和验证边界。
- [Coding 自开发、预演与产品决定](coding-trials.md) — 两轮自开发、用户拍板、失败注入、协作与外壳取舍的原始记录。
- [Coding 协作分期与工作台布局](coordination-decisions.md) — 五期协作从认领任务到等待与唤醒，以及左栏和主区域的最终布局决定。
- [Coding 自开发与宿主审查记录](self-development-records.md) — 9 月 22–24 日的目标调整、真实任务、钥匙串、报告、Git 与 Goal 回流记录。
- [Coding 会话与执行接入记录](runtime-records.md) — 9 月 20–22 日的基线、断点、模型设置、宿主审查、MCP、恢复与 Harness 对照。

## 1. 三份文件怎么分工

| 文件 | 回答什么 | 什么时候改 |
| --- | --- | --- |
| 本文 `spec.md` | 要做什么、做到什么算完成 | 范围或验收条件变了 |
| [`design.md`](design.md) | 长什么样、怎么交互 | 界面或交互决策变了 |
| [`implementation.md`](implementation.md) | 怎么落地、按什么顺序、代码放哪 | 实施路径变了 |
| [`ui/`](ui/README.md) | 定稿的四张主屏（可直接打开） | 设计稿重画了 |

三者冲突时：**范围以本文为准，界面以 `design.md` 为准，顺序以 `implementation.md` 为准。**
发现某一份和另一份打架，先改文档再动代码——2026-09-19 就出过一次
（UI 稿把终端和预览画进来了，而 `design.md` §12 还写着它们不在首版）。

## 2. 设计稿

定稿快照：[`ui/`](ui/README.md)，四张 1440×900 的静态 HTML。
可编辑的原始画布在 Artifact：`https://claude.ai/artifact/W1wXuuLuGc9CuWfVCYYKpW`
（私有，未分享的人打不开；仓库里的快照才是定稿依据）。

## 3. 边界

**做**：编码会话的组织、执行的观察与控制、成果的预览与处置、跨插件的协议交换。

**不做**：
- 不重造终端。右栏终端页只读**本轮执行自己跑过的命令回执**（Agent Host 的 `AgentCommandOutput`），不是 PTY，
  也不是 Sessions 那个交互终端——那是用户自己的终端，两件事。
- 不自己决定副作用。批准是用户在宿主审查面里的动作，Coding 碰不到。
- 不发明角色。角色与 Prompt 由插件 Manifest 声明，宿主冻结后交给 adapter。
- 不做 PR/CI 跟踪、云端执行、定时任务。

## 4. 验收条件

按动作路径写，不按页面写。每条都要有测试。

### A. 开一条会话
- A1 不选 Goal 也能开；选了 Goal，会话出现在该 Goal 分组下。
- A2 工作区目录由宿主授权并核过 realpath；插件不能指定任意目录。
- A3 选中的角色必须是 Manifest 声明过的；角色需要的能力 Runtime 必须真的支持，否则**拒绝起跑**并说明原因。
- A4 没有配置模型时，开始按钮不可用，并指向全局设置。

### B. 看一轮执行
- B1 事件流投影出轮次、工具活动、用量；用量没报就显示未知，**不填 0**。
- B2 停止、暂停、恢复、转向四个控制真实作用于 Runtime；Runtime 不支持的控制显示为真实不可用。
- B3 Runtime 返回的冻结权限若比 Manifest 宽，该 Run **立刻取消**并留下回执。
- B4 会话可关闭、可重开，重开后轮次与成果完整——事件流和端口绑定都落库。

### C. 处置成果
- C1 变更集能按文件看差异，行上能留意见，若干条一起发回，**发回不等于批准**。
- C2 只读档下「应用」是真不可用，不是点了没反应。
- C3 成果作为 Artifact 发布，带 producer 身份与版本；消费方拿到的是固定版本。
- C4 Canvas 画出来的图可以存为 Artifact，同样带来源和版本。

### D. 跨插件
- D1 Shelf 材料经输入端口进入会话，用的是 Artifact 的固定版本。
- D2 命令回执来自 Agent Host（本轮执行跑过的命令），只读；Coding 不另开一条命令执行路径。
  Prologue 的 Node 装配已接通宿主命令审查与持久回执；CLI 仍不支持宿主审批下的新命令，但能读取已有回执。
- D3 轮到用户处理时进 Inbox。
- D4 关联 Goal 的会话，结论能写回 Goal 事件。

### E. 诚实
- E1 能力矩阵里 `unsupported` 就是真不可用，界面上不画空壳。
- E2 浏览器页与终端页在对应 Capability 注册之前，显示为真实不可用。
- E3 批准不等于已发生：`effect_settled` 要等真实回执。

### F. 固定成果交给别的插件（2026-10-21，PG-090 的 Coding 半边，C3）
宿主不再替 Coding 和 Shelf 拼这条边界：Coding 的固定成果怎样变成文字归 Coding，Shelf 经平台的成果服务和它声明消费的动作来取。测试在 `tests/coding-results-document.test.ts`、`tests/shelf-coding-results.test.ts`、`tests/shelf-coding-results-platform.test.ts`。

能不能读到正文，看的是插件消费了这个动作，不看它消费了哪种成果。Coding 的处理器看不到调用方的 Manifest：Runtime 交给插件的调用上下文不带调用方的签发对象（PG110-17）。所以一个项目插件只要声明 `capabilities.consumes: ["coding.results.document"]` 并持有 `artifact:read`，就能读到本项目任何一份 Coding 固定报告和固定变更的正文，不必在 `artifacts.consumes`、`process_items.consumes` 里声明这两种类型。消费动作本身也是 Manifest 声明，创作台做的插件还要人逐项批准（PG110-14）。要不要让平台把调用方的类型声明交给提供方去核，是信任边界的设计，待用户定（⑤ 评审 #905）。

1. **W5-01-CODING-01** Coding 声明只给 plugin 受众的查询 `coding.results.document@1`（权限 `artifact:read`，输入 `{ reference }`，输出 `{ reference, title, saved_at, markdown }`）；人、Agent、工作流、MCP 都选不到它。`coding.artifacts.preview@1` 的动作 id 与版本不变。
2. **W5-01-CODING-02** 一份固定报告答它自己的 Markdown，逐字节一致。
3. **W5-01-CODING-03** 一份固定变更按文件答审查文本的修改前后和写入结果；没有可读的文本审查时，答固定的一句话。
4. **W5-01-CODING-04** 已归档、其他项目、不可用、其他种类、签名不符、成果里的身份与引用不一致、项目里没有的版本，一律用 Coding 自己的 `coding.shelf_material_invalid` 拒绝，并用中文告诉使用者。
5. **W5-01-CODING-05** 别的生产者钉死的版本，平台在 Coding 读到之前就以 `artifacts.plugin_denied` 拒绝。
6. **W5-01-CODING-06** Coding 自己的报告、变更、计划列表经平台 `listConsumable()` 按类型和生产者取，没有宿主端口；已归档和别的生产者的版本不算当前成果。一次请求只列一次、每个版本只读一次：页面开着会话时会反复刷新这些列表。
7. **W5-01-CODING-07** Shelf 对一份固定报告的预览（标题、正文、来源、内容哈希、指纹）与宿主原来拼出的一字不差。
8. **W5-01-CODING-08** 同上，固定变更，连同代码围栏的长度。
9. **W5-01-CODING-09** 这个动作的定义只在合同包 `@molis-ai/molis-work-contracts/modules/coding` 一处（含输入输出类型），Coding 与 Shelf 都从那里取，任何一边都没有第二份；Coding 的 Manifest 声明的就是这个对象，Shelf 的 Manifest `capabilities.consumes` 写它的 `capability_id` 并持有 `artifact:read`；Shelf 自己动作的受众不变。
10. **W5-01-CODING-10** Shelf 的列表来自平台，按 Shelf 自己 Manifest 里的类型和端口筛选；Coding 不肯转成文字的版本不列出。
11. **W5-01-CODING-11** 平台或 Coding 的拒绝带着自己的错误码到达使用者；找不到的版本是 Shelf 自己的 `shelf.unavailable`。
12. **W5-01-CODING-12** 宿主不再拼这条边界：没有 `coding-shelf-material.ts`，`project-plugins.ts` 里没有 Coding 的三个列表端口，`ShelfResultPorts` 只剩 `projectPath` 和 `receive`。
13. **W5-01-CODING-13** 在真实宿主上，声明了 Shelf 所声明的、持有授权的插件拿到 Coding 的 Markdown；项目里没有的版本得到 Coding 自己的拒绝。
14. **W5-01-CODING-14** 在真实宿主上：没声明消费得 `actions.forbidden`，没有授权得 `plugin.grant_denied`，项目没装 Coding 得 `actions.plugin_disabled`；人、Agent、工作流、MCP 的调用得 `actions.forbidden`，MCP 的动作目录里看不到这一项。

### G. 会话库走平台服务（2026-10-21，V-14，C1）

会话表（`coding_sessions`、`coding_plan_drafts`，Manifest `databases.project`）归 Coding，只经宿主借给它的 `services.project_database` 读写：读是同步的 `get/all`，写只在 `transaction(beforeEffect, 同步体)` 里，平台在提交前再核一次原调用。宿主不再递原始库句柄（`CodingExecutionPorts.sessions` 已删），`apps/local-host/src/coding-surface.ts` 不再读 Coding 的表。关闭 `privileges.md` 的 V-14 和 PG-091 的原始库部分。

1. **W5-01-CODING-15** 会话库的每一种写（建会话、改状态、开一轮、改名、归档、绑目标、记 runtime 会话、写步骤、写后台命令、存计划、确认计划）先等调用方的 `beforeEffect()`；被拒（撤权、取消、停用）就什么都不写，同一调用方式换成未被拒的调用则写入。用宿主真实的 `services.project_database` 证明。测试：`tests/coding-session-effect-control.test.ts`。
2. **W5-01-CODING-16** 一次逻辑写动了几行，就是一个事务：一轮开始时的改名和置为运行中是一次提交，存计划和对会话的核对是一次提交；被拒或体内失败不留半截。测试：`tests/coding-session-effect-control.test.ts`。
3. **W5-01-CODING-17** Coding 在 `start` 里用 `services.project_database` 自己建会话库；宿主没有借出这项服务时 `start` 失败，错误信息指明缺的是 `services.project_database`；有服务时它启动，路由写下的会话在项目库里，另一个客户端读得到。测试：`tests/coding-session-effect-control.test.ts`。
4. **W5-01-CODING-18** 建会话、改名、归档、存计划的调用在提交前被取消或撤权，就不留会话、不改名、不归档、不改计划；一轮真实 SDK 读取途中被取消、撤权、被换掉提供方，计划行也不留。测试：`tests/coding-session-effect-control.test.ts`、`tests/coding-effect-control.test.ts`。
5. **W5-01-CODING-19** 读一轮时顺手记下会话状态的调用，在提交前被取消或撤权，状态不被改写；后台跟随者带着被拒的调用，不存「运行中」。测试：`tests/coding-session-effect-control.test.ts`、`tests/coding-session-follow.test.ts`。
6. **W5-01-CODING-20** 目录面板由运行中的 Coding 渲染，会话来自它自己的库；宿主只给页面的外观、伙伴页和图元，不再给目标标题（C2 起标题经 Goals 的公开读动作读，见 H 的 25）。测试：`tests/coding-surface.test.ts`。
7. **W5-01-CODING-21** 激活停止之后，后台跟随者不再写会话状态。测试：`tests/coding-session-follow.test.ts`。
8. **W5-01-CODING-22** 归档、存计划、确认计划、选目标的「正在提交任务／正在开始执行」检查，在写入的事务体里再做一次（`BEGIN` 之后、与 `COMMIT` 同一段同步代码）：写入等 `beforeEffect` 的时候同一条会话开始了一轮，仍然拒绝，库里一行不改。测试：`tests/coding-store.test.ts`。

说明：没有单独的「消息」表。一轮里的消息走 Agent 宿主，Coding 自己写的是会话状态（`setState`、`roundStarted`），由 15、16、19、21 覆盖。

### H. 输入端口走平台服务与公开动作（2026-10-21，PG-047、V-13、PG-086、PG-091，C2）

Coding 原来由宿主递进四样东西（`CodingExecutionPorts` 的 `ready`、`models`、`goalTitle`、`characters`）。现在一样不递，`CodingExecutionPorts` 与宿主的 `execution` 端口整个删掉，Coding 自己从平台取：

- **模型**：`services.model`。Manifest 把 `model:read` 列为必需；列表用 `choices()`，每次选模型用 `availability(selection)`；`complete()` 对 Coding 不可用（它没有声明 `model:invoke` 的动作）。`model:invoke` 写成可选，只给两处显式起草（提交说明、历史摘要）用：它们经平台的动作 `agent.draft-text.v1` 起草，这一轮的模型调用仍归 Agent 运行时；人关掉它以后只有这两处不可用（PG-035，① 2026-10-22）。列表只有平台这一份（宿主里为 Coding 另算的那份与创作台里的第二份已删），所以过滤口径一致：停用的提供方与模型都不在其中。
- **`ready`**：删掉。Agent 的能力处理器在被调用时自己初始化，Coding 不必再等。重启后找到挂着 Agent 运行的会话，Coding 直接起等待循环；它的第一次 `awaitContinuations` 失败（运行时没接上、起不来）就和 `agent.capability_unavailable` 一样结束循环，不再每 5 到 30 秒重试；下一次 `coding.state` 读或开一轮会再起一个。
- **Goal 标题**：经 Goals 的公开读动作 `goals.list@1`（目录，一次带回大多数标题）和 `goals.contract.read@2`（目录不列的归档或丢弃的目标，按 id 读一次），二者都在 `capabilities.consumes` 里，由平台核授权。目录面板当场渲染、等不了一次动作，所以 Coding 记下最近一次读到的标题（进程内加写入插件私有存储，重启后还在）；页面一打开就读的 `coding.state`、会话读取、搜索条目和所选 Goal 都会刷新它。从没读到过的 Goal，目录首屏显示 Goal 的 id，页面里显示「关联 Goal 暂不可用」，和 Goal 读不到时一向的样子一样；读到过、现在读不到的，保持最近一次读到的标题。
- **Character**：经 Characters 的两个公开动作 `characters.list@1`（已发布的固定版本；新增 `plugin` 受众，形状、版本和 MCP 工具名不变）与新加的 `characters.runnable@1`（给 `plugin` 受众，C2b 起也给本人，助理的选择器用：这个版本现在能不能跑，不能跑时答 `available: false`，带 Characters 自己给的原因），Coding 在 `capabilities.consumes` 里列出这两个。`characters.execution@1` 仍然只给本人：它答的是本机 Agent 的程序路径与工作目录，Coding 只要知道「能不能跑」，不该拿到这些。合同影响：多一个动作、`characters.list` 多一个受众，其余不变；内置 Coding 的必需权限仍是 `artifact:read`，`consumes` 不是授权项，不需要到设置页重新授权。
  - 决定（2026-10-21，评审与合并按防腐后果定）：PR 原稿给 `characters.execution` 加 `plugin` 受众，等于让任何声明了它、持 `artifact:read` 的插件读到本机程序路径和工作目录，信任边界比 Coding 实际要的宽；所以另开只答「能不能跑」的窄动作，`execution` 留在本人。

1. **W5-01-CODING-23** Manifest：`model:read` 必需、`model:invoke` 可选（只给两处起草，PG-035），Coding 的动作没有任何一个声明 `model:invoke`；`capabilities.consumes` 里有 `agent.draft-text.v1`；`capabilities.consumes` 里有 Goals 的 `goals.list`、`goals.contract.read` 与 Characters 的 `characters.list`、`characters.runnable`，没有 `characters.execution`。测试：`tests/coding-input-ports.test.ts`。
2. **W5-01-CODING-24** Coding 从 `services.model` 读模型列表和每个模型的可用性，安装只持有 `model:read` 时也是这样；页面的列表就是它；`complete()` 在发出之前被拒（`plugin.model_action_required`）。测试：`tests/coding-input-ports.test.ts`。
3. **W5-01-CODING-25** V-13 只有一份模型列表：Coding 列出的与同一个 Home 里另一个持 `model:read` 的插件拿到的相同、同序，停用的模型两边都没有。测试：`tests/coding-input-ports.test.ts`。
4. **W5-01-CODING-26** 会话关联的 Goal 标题，经 Goals 的公开列表动作、以插件受众（`host_plugin` 是 Coding）读到；读之前目录首屏给 id，读之后目录显示标题；Goals 读不到了标题保持，插件重启后目录里仍是这个标题。测试：`tests/coding-input-ports.test.ts`、`tests/coding-surface.test.ts`（20）。
5. **W5-01-CODING-27** 目录不列的 Goal（归档、丢弃）按 id 经 `goals.contract.read` 读一次；读不到的 Goal 没有标题，这不是错误；已知的标题不重复读。测试：`tests/coding-input-ports.test.ts`。
6. **W5-01-CODING-28** 角色列表与「能不能跑」经 `characters.list`、`characters.runnable`，以插件受众、Coding 的身份调用；不能跑的版本带 Characters 给的原因（`runnable` 答 `available: false` 与原因，不是失败的调用）。测试：`tests/coding-input-ports.test.ts`、`tests/coding-characters-http.test.ts`（真实 Characters 的整条链）。
7. **W5-01-CODING-29** S-15：清单没有把 `characters.runnable` 列进 `consumes` 的插件，调它得 `actions.forbidden`，Characters 不被问到；列了的才够得到。只给本人的 `characters.execution`，插件就是列进 `consumes`、持有 `artifact:read` 也够不到（`actions.dependency_missing`：这个动作不对插件开放，在插件看来它不存在）。测试：`tests/coding-input-ports.test.ts`。
8. **W5-01-CODING-30** S-15：人撤回授权（停用后收回再启动）之后，列了的动作得 `plugin.grant_denied`，Characters 不被问到；从没被授权的插件同样被拒。测试：`tests/coding-input-ports.test.ts`。
9. **W5-01-CODING-31** 重启后第一次 Agent 读就失败的恢复循环只试一次就结束，不每 5 秒重试；之后的 `coding.state` 读会再起一个。测试：`tests/coding-input-ports.test.ts`；启动时 Agent 服务未接上、没有 `ready` 可等：`tests/project-plugin-startup.test.ts`（第一次能力调用得「能力未注册」，之后同一实例读到 Home 里新配的模型）。

说明：助理（`assistant-http.ts`）读角色的那半是 C2b（2026-10-24，[slices/pg086-c2b-assistant-characters.md](../archive/repository-anti-corruption/slices/pg086-c2b-assistant-characters.md)）：助理以本人的身份经 `characters.list@1`、`characters.runnable@1` 读，`codingCharacterPorts` 与 `CodingCharacterPorts` 已删，`characters-host.ts` 不再从 Coding 包取类型；因此 `characters.runnable@1` 的受众是 `user` 与 `plugin`（上面写「只给 `plugin` 受众」是 C2 当时的口径）。一轮开始时冻结某个版本仍是宿主的 `freezeProjectCharacter`（`agent-host-composition.ts` 与助理都用它，是 Agent 宿主的授权来源，不是读动作）。

### I. 需要人审查的宿主操作按 Manifest 声明的种类放行（2026-10-21，PG-009，C5）

宿主原来按插件 id 字面量（`io.molis.work.git`、`io.molis.work.coding`）决定谁能发起 Git 暂存、Git 操作、独立工作树和子任务成果整合的审查。现在插件在 Manifest 里声明 `review:<kind>`，种类只有平台列出的四种（`git-index`、`git-operation`、`git-worktree`、`git-integration`，合同 `PLUGIN_REVIEW_KINDS`）。宿主从这次调用里它发出的插件调用者取插件与安装，看这个调用者此刻是否持有该权限（Manifest 声明且安装授权）来决定放不放行。Git 声明 `git-index`、`git-operation`，Coding 声明 `git-worktree`、`git-integration`，都写成必需权限：存量安装由 `bundledGrants` 在启动时补齐，不另写迁移。安全不变量 S-50。

- 发起时、发布审查之前、人批准时、真正执行之前各问一次。不持有就以 `agent.review_not_permitted` 拒绝：发起被拒时不出审查；已在等的审查只能拒绝、不能批准；执行前不持有的不执行，原因记在宿主审查记录里。已在等的审查不主动撤回，人还能拒绝。
- 权限按激活冻结：停止、停用、升级、撤权或应用重启之后，新的激活不是发起的那个，原来的审查同样只能拒绝，要做就重新发起。批准的是「这个安装此刻要做的事」，不跨激活延续。
- 决定（2026-10-21，按防腐后果定）：审查记录记下发起它的 `plugin_id` 与 `install_id`，不推断。早先没有这两项的 Git 审查记录读不出（「Git 审查归属不可读，不能猜测执行结果」），不写兼容分支。计划原稿说把它们「当作过期」，那要一条读取兼容路径；现在没有装到开发机之外的版本，也没有真实 Home 要迁（`docs/system/CONTRACT-CHANGES.md`）。
- 宿主整合入口（`apps/local-host/src/agent-host-composition.ts` 的 `integrationSource`，读与准备两个处理器都走它，批准时与执行前的复查也走它）不再认 Coding 的 id：先看会话属于本项目（不属于就拒绝）；再看有没有插件调用者（没有就以 `host.plugin_caller_invalid` 拒绝，整合只能由插件发起）；最后要会话主人记下的 `plugin_id` 与 `install_id` 同时等于这次调用者的，只比插件 id 会放过同一插件的另一份安装。身份只来自宿主发出的调用者，不读输入。会话还需核对时照旧拒绝。
- 审查卡片的「修改意见」框不再只给 Coding：任何插件发起的轮次内提案（文件修改、命令、派出、MCP 调用）都有。拒绝时的意见走的是同一条与插件无关的路：页面 `agent-review.ts` 把 `note` 随拒绝 POST 到 `/api/agent/reviews/decide`，路由交给 `reviews.respond`，Prologue 审批桥的 `recordDecision` 在拒绝后用 `steer` 把意见交回这一轮；这条路上没有任何地方看插件 id，只看这一轮仍在运行。没有轮次的宿主操作（Git 暂存、Git 操作、独立工作树）本来没有可交回的对象，仍不给这个框。

验收：

1. **W5-01-CODING-40** Manifest 里写平台没有的审查种类（如 `review:git-reset`、`review:`），读 Manifest 得 `plugin.permission_invalid`，安装得 `plugin.manifest_invalid`；四种平台种类都能声明。
2. **W5-01-CODING-41** 没有声明 `review:git-worktree` 的插件调工作树准备，得 `agent.review_not_permitted`：不出审查、不建目录。
3. **W5-01-CODING-42** 声明了、安装没授权，同上。
4. **W5-01-CODING-43** 发起时持有、宿主准备审查途中被停止，同上：不发布审查。
5. **W5-01-CODING-44** 审查已在等，发起的安装停止（再启动也一样）或被撤权后，人批准得 `agent.review_not_permitted`；审查仍在等，人能拒绝；不建目录、不授权目录。
6. **W5-01-CODING-45** 人没批准之前不执行：等待中的审查没有可用的批准（`agent.review_not_approved`），拒绝后也不执行；持有的安装经人批准，同一条路径真的建出工作树并授权目录。
7. **W5-01-CODING-46** 整合入口按调用者认会话：会话主人是同一插件的另一份安装，读和准备都以「不属于发起整合的这份插件安装」拒绝；另一个持有 `review:git-integration` 并声明消费整合动作的插件，在 Coding 的会话上读和准备都被拒绝，且不出审查；没有插件发起的调用（`client.invoke`）得 `host.plugin_caller_invalid`；别的项目仍以「不属于」拒绝。Coding 自己的安装读、准备、拒绝、改动后失效的提案和批准整合照旧。测试两处，断言相同的三种拒绝：`tests/security-invariants-review-kinds.test.ts`（S-50，CI 里跑：用宿主里一个记在别人名下的会话，不需要仓库和子任务，因为三种拒绝都发生在读取任何一轮执行之前，并以主人自己的安装得到下一道检查（此轮执行不属于原会话）作对照）；`tests/writer-integration-host.test.ts`（端到端，只在本机跑：真实的 Coding 会话、子任务与 Git 工作树）。
8. **W5-01-CODING-47** Git 的 Manifest 里 `review:` 权限恰好是 `review:git-index`、`review:git-operation`，Coding 的恰好是 `review:git-worktree`、`review:git-integration`，都是必需并带理由；合起来正好是平台列出的四种，且都能通过 Manifest 解析。测试：`tests/security-invariants-review-kinds.test.ts`。
9. **W5-01-CODING-48** 审查卡片对任何插件的轮次内提案（文件修改、命令、派出、MCP 调用）给出「修改意见」框，已决定的不给；没有轮次的宿主操作不给。测试：`tests/agent-review-surface.test.ts`（不开浏览器，直接渲染工作台的审查面）。

测试：`tests/security-invariants-review-kinds.test.ts`（真实的 Plugin Runtime、宿主与 Agent 服务）；队列一层见 `tests/git-operation-review.test.ts`；Git 暂存审查整条产品链见 `tests/coding-git-diff-product.test.ts`（Git 声明 `review:git-index` 之后转绿）。

### J. 首页的后台任务列表走首页聚合（2026-10-21，PG-043，C4）

首页标题栏的后台任务列表原来由宿主打开每个项目库、读 Coding 的 `coding_sessions`（`apps/local-host/src/coding-background-tasks.ts`，Coding 导出的 `listCodingBackgroundSessions`、`holdsCodingSessions`），页面脚本里还写着 `coding` 的名字、会话地址和状态词。现在 Coding 把它声明成自己的查询，宿主与页面都不认识 Coding：

- **Coding 的查询**：`coding.home.background-tasks@1`（`plugins/native/coding/src/home-background.ts`，定义函数 `defineHomeBackgroundTasksAction` 在合同包 `platform/home-background-tasks`）。项目范围、只读、`audiences: ["user"]`、权限只有 `artifact:read`、`home_aggregate: true`，输入输出类型 `molis.home-background-tasks.query.v1` 与 `.collection.v1`。答案是 `{ source: { surface: "coding" }, tasks: [...] }`；每个任务带 id（会话 id，页面据此在 `surface` 上打开它）、标题、状态、更新时间、是否在等人、几句话（`standing`，句子加可选的数字，`{n}` 由数字替换）和它留着的后台命令（命令 id、说明、相对 Coding 的停止路径）。读的是 Coding 自己的库（`CodingSessionStore.backgroundSessions`）：进行中或等人的会话，以及一轮已结束、但人还有一步没做完或还有后台命令在跑的会话；归档的不列；解析不了的列当作没有，不猜。
- **Home 进程之前就记着在跑的**：一轮只在 Home 进程重启时被切断——停/起 Coding（改授权、升级、关掉项目再打开）只停激活的后台作业（跟随者与唤醒循环，见 L 节），轮本身在 Home 级 Agent 宿主里继续；只有进程重启才打断它（产品实操「服务强杀重启 → 核对并继续」）。所以更新时间早于 Home 进程启动时间、状态是进行中的会话，答案里写成「需要核对」，说「服务重启前没有结束，打开后核对」，不算等人；停/起 Coding 不是重启，在跑的会话照旧显示「进行中」。排队中的会话还没开始，不受影响。
- **宿主**：`apps/local-host/src/home-background-tasks.ts` 用首页聚合（`home-aggregate.ts`，S-49）对每个已打开的项目问这一类型的查询，把各项目的答案摊平、保留项目；校验答案（`surface` 是普通名字，停止路径只是插件下的普通段，不含 `..`、反斜杠、控制字符），拼出停止地址 `/projects/<项目>/api/plugins/<提供方插件>/<路径>`；没打开的项目不读也不打开，停用或没授权的项目安静跳过，读不了或答案读不懂的按项目记一条（`home` 区域 `background_tasks_unreadable`，开始失败时一条）。停止仍走会话原来的路由 `coding.background-stop`，没改。
- **页面**：`apps/workbench/src/scripts/client/attention.ts` 只按行里的 `surface`、`id`、`state`、`waiting`、`standing`、`commands` 画，不含 `coding`。
- 后台跟随者与唤醒循环原来写在这里「不迁」，2026-10-22 已迁到 `services.background.keep`，见 L 节。

1. **W5-01-CODING-32** Manifest 声明 `coding.home.background-tasks@1`：项目范围的只读查询，`home_aggregate`、输出类型是首页后台任务的集合，权限只有 `artifact:read`（没有 `model:invoke`），过首页每次调用前重查的规则（`isHomeAggregateQuery`）。Coding 包不再导出 `listCodingBackgroundSessions`、`holdsCodingSessions`、`CodingSqliteDatabase`，`web-catalog.ts` 不再读 Coding 的表。测试：`tests/coding-background-tasks.test.ts`。
2. **W5-01-CODING-33** 经真实宿主，首页列出每个已打开项目里进行中、等人处理、等核对或留着后台命令的 Coding 会话，按更新时间新的在前，带项目名；一轮已结束又没有东西留给人的不列；人还有一步要做的会话列为「等你回答」；Home 进程重启前就记着在跑的会话列为「需要核对」、不计入等人；没有装 Coding 的项目、没有打开的项目不出现。测试：同上。
3. **W5-01-CODING-34** Coding 的读取器列出进行中或有人要做的步骤或有后台命令的会话；归档的、只有子任务的步骤的、空闲的不列；解析不了的列当作没有，只读，读完一行没变，只回答被问的项目。测试：同上。
4. **W5-01-CODING-35** 会话留着的后台命令，停止地址是 `/projects/<项目>/api/plugins/io.molis.work.coding/sessions/<会话>/background/<命令>/stop`，即 Manifest 里 `coding.background-stop` 路由的路径；提供方和项目是宿主自己的，不是插件说的。测试：同上。
5. **W5-01-CODING-36** 首页不认识 Coding：换一个不是 Coding 的插件声明同一类型的查询，它的任务显示在它自己的 `surface` 上，只在它开着、已打开的项目里被问，每次调用都标了只读；停用的项目和没打开的项目不被问。测试：同上。
6. **W5-01-CODING-37** 答案先检查再画：不是普通名字的 `surface`、不是列表的 `tasks`、形状不对的任务整个不要，只留好的；离开插件的、不是普通段的、太深的停止路径不提供。测试：同上。
7. **W5-01-CODING-38** 收集、摊平和画列表的源码（`home-background-tasks.ts`、`home-aggregate.ts`、`attention.ts`）里没有 Coding 的名字。测试：同上。
8. **W5-01-CODING-39** 问这个列表不写项目库里的任何东西；问之前就已取消的调用，一个项目也不问。测试：同上。
9. **W5-01-CODING-49** 一个项目的答案读不了，按项目记一条，下一次轮询不再记，读通之后再坏才再记；插件在某个项目停用时安静跳过（W5-13-06）。测试：`tests/host-log-catches.test.ts`。
10. **W5-01-CODING-50** Coding 说的每一句话（状态词、「你负责 {n} 步」之类）在页面的英文词典里都有英文。测试：`tests/coding-background-tasks.test.ts`。
11. **W5-01-CODING-51** 停/起 Coding 不是 Home 重启：项目关掉再打开（Coding 换了一次激活）之后，之前在跑的会话照旧是「进行中」，不写成「服务重启前没有结束」；这一界限取 Home 进程启动时间。测试：`tests/coding-background-tasks.test.ts`。

### K. 代码着色、富文本与脱敏进插件 SDK（2026-10-22，PG-062 的平台一半，C7）

原来代码着色住在 Coding 的 `highlight.ts`，富文本（GFM Markdown 加白名单 HTML，一律消毒）和密钥脱敏住在 Feed 的 `rich-content.ts`、`context.ts`。工作台、宿主和桌面壳借内置插件的包用它们，第三方插件用不到。现在三样都只在插件 SDK 里有一份：

- `@molis-ai/molis-work-plugin-sdk/highlight`：`codeTokens`、`growCodeTokens`、`diffRowTokens`、`codeLanguage`，类型 `CodeTokenKind`、`CodeColouring`，原样搬来。它零 import，每个函数自包含，页面可以把源码带进脚本（Coding 的 `client.ts` 就是这样用的）。根入口 import 了 `node:crypto`，所以它单独成子路径。
- `@molis-ai/molis-work-plugin-sdk/rich-text`：`renderRichText`、`richPlainText`，原名 `renderFeedRichText`、`feedPlainText`。标签白名单、链接只留 http(s)、消毒规则原样。
- 根入口的 `redactSecrets`，原名 `redactFeedContextSecrets`，规则原样。
- **依赖（决定，2026-10-22，按防腐后果定）**：`marked`、`sanitize-html` 是 SDK 的可选 peer 依赖，另作开发依赖供 SDK 自己构建，不是运行依赖。
  - 原因：插件作者的项目只装 contracts 与 SDK 两个包，`tests/plugin-sample.e2e.test.ts` 用空缓存离线安装来证明这一点。写成运行依赖，npm 离线安装就要去取 `marked`，本机实测以 `ENOTCACHED` 失败。
  - 用 `/rich-text` 的包自己声明这两个依赖，现在是工作台和宿主。只用根入口或 `/highlight` 的什么都不用加。Feed 不再直接依赖它们。
  - 计划原稿（T3）写的是「SDK 新增运行依赖」，依据是「pnpm store 里已有」；但作者的项目走 npm 空缓存，这个依据不成立，所以改了。
- 只有一份：Coding、Feed 不再导出这些函数；工作台、宿主、桌面壳与测试都从 SDK 取。桌面壳因此不再依赖 Feed 包。

验收：

1. **W5-01-CODING-60** `/highlight` 的构建产物没有任何 import。每个导出函数的源码（`fn.toString()`）单独求值，对同一输入给出与原函数相同的结果。测试：`tests/plugin-sdk-subpaths.test.ts`。
2. **W5-01-CODING-61** SDK 的构建产物里只有 `/rich-text` 加载 `marked`、`sanitize-html`，根入口与 `/highlight` 不加载。SDK 把两者声明为可选 peer 依赖，运行依赖只有 contracts。测试：同上。
3. **W5-01-CODING-62** `redactSecrets` 从根入口导出，遮住私钥、授权与 Cookie 头、token/secret/password 的值、已知前缀的令牌和 JWT，其余文字不变。测试：同上。
4. **W5-01-CODING-63** 仓库里只有一份：没有 Coding 的 `highlight.ts`、Feed 的 `rich-content.ts` 与 `context.ts`，Coding 与 Feed 的入口不导出这些函数。测试：同上。

原有断言不动，只改成从 SDK 导入：富文本的在 `tests/feed-rich-content.test.ts`，着色的在 `tests/code-incremental-colour.test.ts`、`tests/code-diff-scale.e2e.test.ts`。插件一半（Diff、Text Stats、Coding 的路由结果自己带 html，删 `decorateRuntimeResult`、`decorateCodingResult`）归 ③；它不只动 Coding，验收号改用 `PG062-01` 起的编号，进度记在 `specs/archive/repository-anti-corruption/privileges.md` 的 PG-062 行。

### L. 后台跟随者与唤醒循环是激活的后台作业（2026-10-22，PG-038 的 Coding 一半）

Coding 跟住已经开始的一轮、接起等待结束的下一轮，原来靠模块级的 `activations` 表（按安装与项目记一个 `AbortController`）、`setTimeout` 写的暂停和 `AsyncResource` 绑定的分离执行；插件停止时由 `stop()` 调 `stopCodingSurface` 打断。现在两件事都是这次激活的后台作业（`services.background.keep`，PG038-P，S-52），由平台在激活、项目、Home 关闭或撤权时停，`stop()` 只做插件自己的收尾：

- **Manifest**：`background.jobs` 声明两项。`follow`（跟住已经开始的这一轮，不要权限：它只读 Agent 的 Run、写自己的库）和 `wake`（等待结束后接着开始下一轮，要 `artifact:read`、`storage:private`，与开始一轮的动作相同）。
- **跟随者**（`start-round.ts` 的 `follow`）：开始一轮之前，在开始这一轮的命令里登记 `follow`，作业等到 Run 被受理才开始跟。每次写会话状态之前过作业自己的 `beforeEffect`，`waitRun` 带作业的 `signal`。发起调用在 Run 受理之后被拒、被取消、被撤权（R-CODING-RECEIPT-01/02），跟随者照旧把这一轮的结果与回执收敛到底（§12.10 的窄例外），但这一轮停在等待上时只把会话记成「排队」，不再替被拒的调用叫醒下一轮。
- **唤醒循环**（`wake-loop.ts`）：激活的 `start()` 里登记 `wake`，它空闲着，直到某次读 `coding.state`、一轮停在等待上、或恢复时要看某个运行时；一个运行时同一时间只有一个循环。暂停是 `node:timers/promises` 的 `setTimeout`，带作业的 `signal`、不挂住进程，作业一停计时器就清掉（BL-411）；`awaitContinuations` 也带这个 `signal`。接起的下一轮以激活的 `context.actor_id` 开始（原来按排队便条或上一轮 `last-start` 里记下的 actor 取人的 `actorOf` 删掉，这两处也不再记 actor；宿主的 `assertInputOwner` 本来就以会话记下的主人为准），每次写入之前过作业的检查；被拒、撤权、取消就把这个继续记成「不再接」，不写便条。
- **人从页面接起排队的一轮**（`/sessions/:sessionId/queued`）：现在是 Coding 的动作 `coding.runs.queued@1`（只给本人、`command`、`concurrent`、计费，权限与开始一轮相同，输入 `{ session_id, action: "start" | "cancel" }`），因为开始的这一轮要登记跟随者，而 `keep` 只在通过了最后一次授权检查的命令里登记。页面仍走原来的路径。
- 删掉的：`activations` 表、`stopCodingSurface`、`pause`、`detach`、`coding.server.instance-stopped`。

1. **W5-01-CODING-82** 发起调用在 Run 受理之后被拒：这一轮的结果照旧记下，会话停在「排队」；等待结束时唤醒作业不以被拒的调用开始任何一轮，也不去问 Agent 有没有可接的继续（Run 与会话各只有一个）。没被拒的同一条路径，唤醒作业接起下一轮。测试：`tests/coding-session-follow.test.ts`。
2. **W5-01-CODING-83** 唤醒作业在退避中（读不了 Agent 的运行时，等 5 秒再问），插件撤权并停止之后，计时器随作业清掉：之后再也不问 Agent，进程里没有抛出的错误（BL-411）。测试：同上。
3. **W5-01-CODING-84** 唤醒作业把就绪的继续接过来的那一刻安装被撤权：不开新的 Run、不建新的会话、不写便条，私有存储一字不改，会话仍是「排队」。测试：同上。


## 5–6. 阶段与早期缺口

[§5–6 阶段计划、验收与当时的缺口](early-stages.md)。

## 7. 下一批：四处缺口与一个已确认的缺陷

**对照的基线在哪。** 不是凭印象说「市面上都有」。`/Users/yijunwang/reference` 下有几家的真源码
（`codex`、`cline`、`opencode`、`claude-code-sourcemap-main`、`claude-code-system-prompts`、
`grok-build`、`openclaw` 等），Prologue 的 `docs/slices/model-facing-gaps.md` 已经照着
Codex 的 `codex-rs/core/src/tools/handlers/`、Claude Code、OpenCode 的 `core/src/tool/`、Cline
查过一遍工具面。下面每条要补的东西，**先去那几份源码里看别人怎么做的、为什么那么做**，
再决定我们抄哪一半、拒哪一半——`model-facing-gaps.md` 里「明确不做」那一节就是这种拒绝的样子，
它比照搬有价值。


下面五条来自一次逐项对照（Coding 的 ReAct 提示分层、Prologue 的 Character 模块、
TaskBoard/SubAgent/Plan/协同、Prompt Cache）。每条先写**今天是什么**，再写**要做什么**——
「今天是什么」是查过代码的，不是印象。

### C11 提示分层：把 ReAct 里属于我们的那一层划清楚

**今天是什么。** ReAct 循环**不在这个仓库里**：think → act → observe 跑在 Runtime 里
（Prologue 的 agent loop、Claude Code CLI）。这边只做一件事——在 Run 起跑前**冻结身份**：

- `plugins/native/coding/src/roles.ts` 里 7 段 prompt body（`coding-base` + 6 个角色专属）、6 个角色；
- 每个角色用 `prompts: ["coding-base", "coding-<role>"]` **点名**要哪几段；
- `composeRolePrompts()`（`horizontal/agent-host/src/index.ts`）按点名顺序取 body，
  角色不点名才回退到「全部已声明的」——早先是**无条件**回退，只读角色因此拿到过写入者的
  「你可以改文件」，那是真 bug，已修；
- adapter 收到的是冻结后的 `{role_id, version, execution, prompts[], host_tools[]}`，
  它不读 `roles.ts`、不自己拼；起跑后再复核一次，Runtime 回报的角色与冻结的不一致就取消 Run。

所以**只有系统指令这一层是我们的**。工具调用的格式提示、观察回填的措辞、重试提示，
全在 Runtime 里，我们既没设也改不了。

**做完了什么。** 没有「把 ReAct 搬过来」——那会变成第二个 agent 循环，和 Runtime 抢同一件事。
补的是**我们这一层**：

1. **四层有了名字和顺序**：`base`（产品约束）/ `role`（这一轮的身份）/ `project`（这个项目的约定）/
   `task`（用户这一次写的）。组合严格按这个顺序，**层内顺序不动**——角色点名 prompt 的次序是它有意排的。
2. **`task` 不能被声明。** 包里出现一个 task 层的 prompt 会被 `inspectAgentDeclaration` 拒绝：
   任务是用户这一次写的，包里带一个就是替他说话，而「你的任务」那一栏会显示成别人的话。
3. **project 层由宿主补，而且强制标成 project**——不管送进来的人管它叫什么。
   来源是**真实存在的**：Goals 的项目指引已经渲染好 `runtime_prompt_prefix`，
   所以这不是一个没人能发布的端口。项目没确认过指引时这一层是**空的**：
   指引视图在那种情况下仍会渲染一句「还没有确认过」，把它当指令传下去，
   等于把「这个项目什么都没说」变成一条它说过的话。
4. **冻结的那一份看得见。** 冻结记录里每条 prompt 带着自己的层，
   「这一轮的身份」按层展示，空的层也出现并说清为什么空——
   缺一节读起来像「这里没东西可看」，写一句「这个项目还没确认过指引」才是能动手的信息。
   **面上没有任何控件**（有硬断言守着）：能改就等于绕过冻结；要改是改角色，在下一轮之前。

### C12 初始审计：接线与管理缺口（历史，当前实现见 §0）

**今天是什么。** 要分两半，不能一句「没实现」带过：

- **接线是真的。** `prologue-node.ts` 每次起 Run 都 `sdk.characters.create(...)` + `publish`，
  把 `characterRef` 挂到 Run 上。Prologue 的 Character 机制**在用**。
- **管理一点没有。** 那个 character 是**从冻结角色现造的一次性投影**
  （`id = role_id`、`version = role.version`、`tools = host_tools`），一 Run 一个，用完就扔。
  Prologue `character` 模块支持的东西——人设 CRUD、`active / disabled / tombstoned` 状态、
  skill / tool / mcp-server 绑定、按版本 CAS 写入、从目录安装、`BUILT_IN_CHARACTERS`——**一个都没接**。
- 用户这边：6 个角色**编译进包**，加不了、改不了、也不能绑自己的工具集。
  全仓 grep 不到任何 character / persona 的产品概念。

**要做什么。**

1. **角色变成数据，不再是常量。** 目录库里存用户自己的角色：名字、指令、工具子集、启用停用。
   内置 6 个作为**样例**随包发，不是「产品默认」——Prologue 自己的
   `config.character.includeBuiltIns` 默认关，理由一样。
2. **只能收紧，不能扩权。** 一个角色要的工具比 Manifest 声明的天花板宽，是**扩权尝试**，
   起跑前失败；不是「尽力给一部分」——给一半会让这一轮以为自己能做它做不到的事。
3. **改角色是按版本写入。** 两个人同时改同一个角色要冲突，不能互相覆盖；
   **运行中的 Run 握着冻住的那一份**，改角色不影响它。
4. 设置页跟 C6 模型供应商同一处，同一种样式。

### C13 TaskBoard / SubAgent / Plan / Agent 协同

#### 本轮 Plan 对象与责任（2026-09-22，指定链路已实操，C13 整体未完成）

- Coding 拥有用户可编辑的计划草稿：来源规划 Run、原任务、授权工作区、有序步骤、每步完成条件、阻塞和变更说明。草稿按修订做 CAS，更新不覆盖另一页面的修改。
- 用户查看并确认具体修订后，通过现有 Artifact 发布不可变 `coding.plan.v1`。确认计划只确认做什么，不批准命令、文件修改或 Goal 验收；有未解决阻塞的草稿不能确认。
- 规划角色只读，先读实际代码再形成结构化提案；格式不合法时保留原回答并显示无法形成计划，不静默补造步骤。普通任务仍能直接执行。
- “按此计划执行”只能读取属于当前会话的当前确认版本，绑定原工作区，以现有固定材料入口送入模型。历史执行保留精确 Artifact 引用，后续编辑产生新修订，不能修改正在执行的计划。重复点击/丢失响应重试返回已有执行，不重跑已发生的工作。
- 草稿不保存执行状态。进度、等待审查、失败和中断继续由 Agent Host 的 Run 事实提供；模型结束不推断步骤通过。SDK TaskBoard 已提供依赖图、CAS 和节点回报，但不是用户确认草稿，后续 SubAgent/TaskBoard 接入这些原执行事实，不再建立第二套状态账。
- 当前先完成可实际操作的 Plan 闭环；子代理分派、步骤回报、并行工作区及 TaskBoard 仍属 C13 必做，不因这次切片延期而移出目标。

**指定产品实操**：会话 `1fc6c88b-9d32-46f9-a853-855c9d744149`，MiniMax-M3，SDK Session `1-8lurt`。规划 Run `3-5su0` 读取 README、两个实现文件与测试，共 4 次只读工具调用；未执行修改或命令。首次回答包含说明加单一 JSON 围栏，已兼容这种无歧义提案，同时拒绝多个竞争 JSON 块和不完整结构，不靠重新请求模型掩盖格式问题。

原提案错误要求折后 0 分免运费；通过正式计划编辑入口改为运费/合计 500 分。实操阻塞字段使确认按钮禁用，消除阻塞并确认修订 4 后才点击执行。Run `3-dbqe` 固定消费 `coding-plan:1fc6c88b-9d32-46f9-a853-855c9d744149:4` v1，实际采用纠正的条件，三个文件修改和一次测试命令分别经过宿主审查。真实 `node --test checkout.test.mjs` 回执为退出码 0、8 通过/0 失败；README 未变化。独立未发送任务草稿在执行前后保留。

完整会话、两轮执行与固定计划在最终构建重启前后投影相同。随后将当前草稿改为修订 5 并留待处理阻塞，旧修订 4 仍可从「查看第 2 轮使用的计划」只读打开，原 Run 不变、未再起执行。编辑关闭重开保留未保存输入；实际 955×597 CSS 视口中编辑正文可滚动、关闭与保存操作仍在视口内，默认视口已恢复。证据 `plan-product.json`、`plan-{before,after}-restart.json` 与 `plan-after-edit.json`。

**工程验证**：最终构建 `2026-09-22T02:34:16.847Z`，源码摘要 `3e1e2a0dcd754319cc1d05c18cdb95b0ef855b682b650012cc4ce51ca7d3db36`，已用于上述重启实操。`pnpm build`、`pnpm boundary:check`、`pnpm workspace:typecheck` 通过；隔离入口 `pnpm test:run` 共 1523 项，1461 通过、57 失败、5 跳过，与上轮基线逐项比较失败名称零新增、零消失，不宣称全绿。670 张受保护 PNG 中被测试改写的 77 张已按运行前备份逐字节恢复。正式 HTTP 回归覆盖修订冲突、归属、阻塞、固定历史、重复执行与重启，以及保留独立草稿和普通直接任务。证据 `plan-regression.json`；本轮未修改 SDK。

**证据边界**：这是隔离的小型跨文件任务；模型原计划条件错误，结束答复又将测试通过称为验收、误报行号，均保留为质量反例。产品没有据此验收步骤或 Goal。中文 IME、浅色本切片、主观手感和用户验收仍为 UNVERIFIED；不代表复杂仓库、长任务、C12 行为收益或整个 C13 完成。下一步仍为 SubAgent、真实步骤回报/阻塞/返工及 TaskBoard 投影。

#### 子代理接通合同（2026-09-22，只读协作指定路径已实操）

先接只读协作，沿用原协调者入口和 SDK `dispatch-subagent` / `await-subagents` / `steer-subagent`，不另起模型循环。Host 从插件 Manifest 冻结子角色正文与工具上限；SDK 在父开始前发布内部角色投影，在子首个模型请求前核对角色属于本轮。子任务不隐式继承父聊天、材料或权限，父任务必须明确交付任务、必要上下文、完成条件；只读子角色不开放修改、命令、MCP、再分派或用户提问工具。分派仍通过原 Host Review 审查，批准分派不批准任何文件操作。

SDK 原父子关系、Session 和 Run 事件拥有任务、状态、结果及用量。Host 只投影并按精确父 Session/Run 校验列表和停止，不新建子任务状态表；未知/中断明确显示待核对，不能映射成成功或自动重跑。Coding 拥有用户对结果的「接受 / 需返工」评价与理由，评价不改变运行状态；返工通过父任务的新要求和新子执行完成，保留旧结果。

当前必须先证明真实只读子任务及独立停止、拒绝、失败、跨项目拒绝、关闭重启无重放，并展示父与子用量各自的小计。并行写入的独立授权目录、修改审查、结果选择/整合及 TaskBoard 继续必做；只读协作不代替它们。原未装配的协调者/并行写入声明存在父只读与子写入不兼容，不能靠放宽 SDK 父子权限求交解决。此切片允许修改既有 Host/Contracts、Coding、对应测试和说明；不动正式安装、生产凭据或 SDK 安全边界。build、boundary、typecheck、隔离全量回归及真实 MiniMax 产品入口分别验收。

**只读协作实操与限制**：在隔离运费/结算工作区、MiniMax-M3、协调者 v8 的正式 Coding 入口分派代码调查和独立评审。每次分派通过原工具审查；子角色固定为只读、仅 read/search/context-remaining，父与子用量分别展示。首个无效引用样本保留（App `bb18669e-a758-483d-960f-1e8ce18dc834`），错误 Character 引用没有成为真实子任务；随后修正内部引用的精确 ID 装配，不放宽 SDK 权限。

- **原结果与返工**：App `b70d36d5-a673-4362-8aa4-5c8f4918deef` / SDK `1-2zr4n`，原 Run `5-3ko22` 的两个子任务都完成；调查者误把内容搜索无匹配当文件不存在，评审报告完整可读。评价「需返工」及理由保存在原插件存储，修订冲突被拒；按钮准备包含原任务/父子引用/理由的新任务草稿，刷新保留，明确发送才执行。新 Run `4-7uav8` / 子 `sub-g-svb7` 直接读文件，旧结果与评价未改。模型曾误用旧父子和旧角色引用，被原归属检查拒绝后才纠正；不能据此宣称低人工负担和复杂任务质量达标。
- **完整报告**：原评审长报告超过摘要上限，父任务曾误判为子任务未完成。SDK 现沿用 `await-subagents` 增加 `reportOffset`，读取原终态报告，明确 nextReportOffset/reportComplete；默认输出标为摘要，不将分页完成解释为验收。只读原父 Run、仅一个子引用、非负安全整数偏移，每页沿用 2000 字符上限；不重跑模型。真实返工报告 2500 字符，父任务实际按 0/2000 两页读完；另一轮 5808 字符报告也读取全部页。父任务仍有行号和独立复核质量缺口，保留为反例。
- **接受与停止**：App `6fb88aaa-9384-405a-9f4a-b7757008fee1` / SDK `h-3jv50` 的 Run `l-63yrk` 完成两个独立子任务。直接核对 shipping.mjs 后，为 `sub-r-1s8rg` 记录仅限阈值/运费结论的接受评价；这是验证操作，不是用户验收整个产品。第二个子任务在点击停止前已结束，不能计入停止验证。随后 Run `11-8b9yv` 新派 `sub-17-8xjwz`，UI 一次点击单独停止，SDK 状态 cancelled；已读四文件与中途输出保留，父任务收到停止结果并结束，没有重派、替代分析或命令/写入。原轮结果与评价继续保留。
- **真实拒绝分派**：同一控制会话第 3 轮 `4-96dlu` 因任务只说「提议」而未调用工具，未计入拒绝证据。第 4 轮 `8-2xom7` 明确要求实际调用后进入原 Host 审查；UI 拒绝一次，唯一工具结果为 `EFFECT_NOT_AUTHORIZED`，零子任务、零文件读取或写入，父模型如实结束而未重试。再重启后的四轮完整投影与三份子结果、原评价完全一致，见 `subagents-rejection-{before,after}-restart.json`。
- **SDK 实际消费**：源码 `07ad08a11e3b4a01b9fe877dedff1efba6f4833c` 已推送 `codex/molis-coding-receipts`；Molis 安装 `subagent-report-pages.tgz`，SHA256 `fb62c2951b4d72c53e45d25390c27cdd786eb04610bca9caedd5362ef4ccd2d0`，500 个 dist 文件与源码构建及安装目录逐字节相同。SDK build/typecheck 与 57 项定向通过；全量 3257 项，3235 通过、20 跳过、原有 2 个网络 DNS 失败，零新增。Molis 的真实 SDK 测试另覆盖报告分页、拒绝、取消、失败、未知角色与 Host 来源；正式 HTTP 覆盖父子归属、评价修订及重开持久性。

**界面与恢复**：最终构建 `2026-09-22T03:36:12.859Z`，源码摘要 `122cb976b2f6e130cba9b15f75ba0619ee444edfdccaefead481c24b868a0fb5`，运行于隔离 4198。重启前后两会话完整 API 投影逐项相同（`subagents-final-{controls,rework}-{before,after}-restart.json`），四份工作区文件摘要未改。真实深色/浅色正文、展开任务/权限、评价状态已观察；实际 CSS 597 × 746 窗口中评价可输入、按钮可触达，刷新恢复未提交草稿。接受或返工后的折叠标题独立显示评价，避免仍称待核对。测试草稿已清除，恢复原深色与默认视口。中文 IME、主观手感、持续多任务滚动和用户验收仍为 UNVERIFIED。

**最终工程验证**：`pnpm build`、`pnpm boundary:check`、`pnpm workspace:typecheck` 通过；18 项定向检查通过。隔离串行全量 1529 项：1467 通过、57 个既有失败、5 跳过，含父 suite 的失败名称与 Plan 基线逐项一致，零新增、零消除，不宣称全绿。测试改写的 77 张 PNG 已恢复，670 张受保护 PNG 全部逐字节复核一致。证据 `subagents-serial-final-regression.json`。此前一次与构建并发的回归因清理 dist 产生模块缺失，该次结果无效，保留记录但不计作回归通过。

本切片仍不包含并行写入、工作树整合、TaskBoard 或完整 C13 验收；不能关闭 C10/C12/复杂任务与整体体验的剩余项。正式安装版钥匙串问题也未随隔离预览交付。

#### 并行写入工作树前置合同（2026-09-22，前置工程验证通过，产品接线未完成）

现有 `apps/local-host/src/git-worktrees.ts` 仅在测试被调用，尚未进入产品写入路径。核对发现：新建未跟踪文件不在清单，重开列表以当前 HEAD 冒充原基线，来源只看分支前缀，清理会强制移除工作树并删除分支。接入前先沿用该端口修正，不另建管理服务或任务库。

- 从明确授权的仓库根与固定 HEAD 创建独立工作树，目录在主工作区外；父目录有未提交或未跟踪内容时拒绝直接从旧 HEAD 分叉，不悄悄遗漏当前工作；子目录工作区不自动获得整个仓库。原基线与创建工作区以 Git 分支元数据持久化，重开不得换成新 HEAD。
- 操作前核对 Git 注册目录、分支、原基线与创建来源；调用方不能以路径/分支前缀冒认其他工作树。缺来源、缺目录或冲突明确失败，不猜测接管。
- 按原基线列出已跟踪净变化和所有未忽略新文件；用 NUL 分隔保留中文、空格、制表符和换行路径。主工作区变化不混入子任务清单。
- 移除仅针对已确认来源的干净工作目录，不用 force、不删除分支，保留已提交成果与来源；未跟踪、忽略或未提交内容会阻止移除。它不代表结果已整合或用户接受。
- 本次只改既有 Git 端口、相关真实 Git 测试与说明，回滚代码即可；测试仓库在临时目录，生产仓库和已存在用户工作树不执行创建/清理。先证明创建、重开、清单与拒绝边界，再接 SDK 子目录授权、写入审查、整合与 TaskBoard，完整并行写入目标不缩减。

**前置验证结果**：19 项定向检查通过，其中真实临时 Git 仓库覆盖外置目录、原基线重开、子提交及未跟踪新文件、中文/制表符/换行路径、主目录变更不混入、伪造来源拒绝、缺来源拒绝、子目录不扩权、符号链接容器拒绝，以及清理后未整合提交仍可读取。主目录有未提交或未跟踪内容时明确拒绝仅复制旧 HEAD。`pnpm build`、`pnpm boundary:check`、`pnpm workspace:typecheck` 通过；全量 1534 项：1472 通过、57 个既有失败、5 跳过，失败名称与只读子代理基线一致，零新增、零消除。测试改写的 77 张 PNG 已恢复，670 张受保护 PNG 字节全部一致；证据 `writers-foundation-regression.json`。

隔离预览使用构建 `2026-09-22T03:54:37.351Z`，源码摘要 `b8a3be87918e3607507fb39320072124a7c1dbffc36728634a480e2c31304440` 复算相同。原只读协作会话重启前后完整投影一致（`writers-foundation-{before,after}-restart.json`），未改生产工作区。**本次属于底层工程验证；没有把工作树端口装配到产品按钮，没有运行真实模型并行写入，也没有通过用户验收。** SDK 角色/目录授权、写入审查、固定差异整合及 TaskBoard 仍按完整目标继续实现。

四件事进度差得很远，必须分开说。

| | 今天是什么 |
| --- | --- |
| **TaskBoard** | **原计划/执行/子任务导航已接通并实操**，见 §0；读取原固定版本、运行状态和用户评价，不推断步骤成功。SDK 步骤级回报/验收与认领关联仍未接 |
| **SubAgent** | **同目录只读协作已接通**。Manifest 冻结子角色与工具上限，Node adapter 调用 SDK 原分派、等待、停止和事件投影；Coding 展示完整报告、独立用量及结果评价。CLI 不冒充支持；独立目录分工、写入审查与选定文本成果整合也已在指定路径实操，见 §0 |
| **Plan** | **指定链路已接通**。输入方式「规划」使用只读 planner；右栏查看/调整/确认固定计划，按原工作区执行；当前草稿与历史确认版本分开显示。步骤级回报和验收仍待接通 |
| **协同** | 只读调查/独立评审与独立目录并行写入均有真实 SDK 路径；已验证逐项审查、部分拒绝、原结果返回及选定文本整合。模型仍有错引编号、等待耗尽轮次、未遵循要求等问题，完整类型与协调质量未完成 |

**要做什么，按依赖顺序。**

1. **Plan 先做。** 它不依赖子代理，而且是这类产品的标配交互：
   一轮先出**计划对象**（有序步骤，每步说清做完怎么判断它做对了），用户改/批，
   批过之后才转成执行。**计划不是提示词里的一段话**——它得是能引用、能比对、
   能说「实际做的和计划的不一样」的东西，否则「按计划执行」无从验证。
2. **SubAgent 接通。** 先给 adapter 实现 `subagents` 端口并如实申报能力，
   投影层已经在等它。**跑完 ≠ 验收通过**这条已经在投影里立住了，接通时不能退。
3. **TaskBoard 最后。** 它是前两者的**视图**：计划的步骤 + 子代理的认领与验收，
   摆成一张板。先做板子会做出一个没有内容的板子。

### C14 Prompt Cache：已接配置与 SDK，请求不等于命中

当前供应商配置已透传 `off / best-effort / required`，SDK 负责协议字段与缓存指纹。
`required` 只保证声明支持且本地前缀未失效时发送缓存请求，不保证厂商实际命中；
页面已改称“要求缓存支持”，实际命中只读供应商用量，未知不能报成零。
CLI 的缓存由对应 CLI 自己处理，Host 只投影其返回的用量。

**做完了什么。**

1. 模型供应商记录加了 `prompt_cache: "off" | "best-effort" | "required"`，落目录库（schema 18，
   旧库按需补列，可重复跑），透传到 `startAgentRun`。
   **关着就一个字段都不发**——`off` 的请求和「没有缓存这回事」时逐字节一样。
   没选过的供应商是关着的：升级不替用户要一个他没要过的东西。
2. **两种格式不一视同仁。** Anthropic 兼容线有 `cache_control` 断点，我们打得开；
   OpenAI 兼容线由对方自动做前缀缓存，没有可以由我们打开的字段。
   所以设置页在 OpenAI 格式上**根本不摆「要求缓存支持」这个选项**——
   摆一个永远选不了的选项，用户学不到任何东西；不摆它、加一句话，才说得清。
   保存时也再判一次（改格式会让一个已存着的档位重新过审），
   这是配置错误，要在用户还看着那个字段的时候说，不是等某次 Run 失败。
   「能不能打开断点」这件事**以 Prologue 自己的申报为准**，不是我们抄一份清单。
3. **还没做**：用量面板目前只显示命中的 token 数，说不清「这次没开缓存」和
   「开了但没命中」是两回事。

### C15 已确认的缺陷：protocol 名字对不上

`prologueModelConfiguration()` 把 `protocol: selection.provider.api_format` 直接传给
Prologue，值是 `"anthropic-messages"` / `"openai-chat-completions"`。
Prologue 按**精确字符串**查协议表，表里的键是 `"anthropic-compatible"` / `"openai-compatible"`
（`packages/sdk/src/model/plugin/registry.ts`），查不到就抛 `MODEL_PROTOCOL_UNSUPPORTED`。

**历史影响：修复前经此映射起的 Run 会在协议查表时失败；当前映射已修复并经过真 SDK 验证。**

**测试为什么没拦住它。** `tests/model-provider-store.test.ts` 里写着
`assert.equal(configuration?.protocol, "anthropic-messages")`——它断言的是**我们自己的名字**，
而代码传的也是我们自己的名字，于是两边一致、测试通过。
问题从来不在我们这一侧是否自洽，而在**对面认不认**。
所以修的时候断言要钉在 Prologue 的 `BUILT_IN_ADAPTERS` 上（SDK 导出了它，每项带 `protocol`），
让下一次改名直接把测试打红。

这正是「对着真实模型端到端跑一次」没做所以没被发现的东西——编译器对得上（两边都是 `string`），
单测对得上（测试用的是我们自己的端口，不是 Prologue 的表）。**已修。** `prologueProtocolFor()` 做一次显式翻译，`ModelApiFormat` 保持面向用户的拼法
（设置页里写着 `/v1/messages`），不跟着别人的内部键走。

断言钉在 **Prologue 自己导出的 `BUILT_IN_ADAPTERS`** 上而不是我们抄的一份清单：
`tests/model-protocol-mapping.test.ts` 逐项确认每个译出来的名字 Prologue 真的认、
我们自己的名字它真的不认、两套名字一一对应没有漏也没有多。
SDK 那边改名会直接把测试打红。

这件事是**跑出来的，不是读出来的**：拿真 SDK 起一个适配器注册表，
`anthropic-messages` 和 `openai-chat-completions` 都抛 `MODEL_PROTOCOL_UNSUPPORTED`，
`anthropic-compatible` / `openai-compatible` 才通。

## 7.1 C12 的早期设计依据（发布与消费归属由本轮 §0 覆盖）

在写实现之前先把它是什么想清楚，否则会做成「角色表加个增删改」。

### 它是对角色的**收紧**，不是角色的替代

Manifest 里的角色是**插件声明的可能性**，宿主已经拿它和 Runtime 的能力矩阵对过账；
Character 是**用户在那个范围里的选择**。所以：

**character ⊆ role**，永远。一份要的工具比它派生的角色宽，是**扩权尝试**，起跑前失败——
不是「尽力给一部分」。给一半会让这一轮以为自己能做它做不到的事，
而这正是 Prologue 的 character 模块用整段注释强调过的那条。

能放宽就意味着用户可以给自己一个 `run-command`，而底下那台 Runtime 根本不支持在审批下跑命令。
收紧永远安全，放宽永远不安全——这不对称，所以不做成一个对称的「编辑」。

### 档案上那句自我介绍**必须进提示**

Prologue 那边写得很直白：不进提示的话，「探索者」和「工人」的区别就只剩工具名单，
而档案上那句话是个死字段。

C11 刚把提示分了层，所以这件事有地方放：**Character 的自述进 `role` 层**，
排在插件角色自己那几段之后——它是在角色搭好的场景里说话。

反过来也成立：**没有 Character 也要能跑**。默认执行者**不带自述**——
它不是一份隐形档案，就是「这一次本来有什么」；凭空多一句自我介绍，
等于替用户决定了人格。

### 引用必须精确到版本

**没有「按名字取最新」。** 否则同一句话在档案改版之后会悄悄换一份人格，
而用户当初点头点的是那一版。冻结记录里存 `character_id` + `character_version`，
运行中的 Run 握着冻住的那一份，登记表之后怎么改都不影响它。

### 停用和删除是两件事

- **停用**是用户的选择，可以再打开；
- **删除**之后那个 id **不能被重用**——历史里的 Run 引用着它，
  重用会让一条旧记录指向一份它从没用过的档案。

所以删除是留墓碑，不是抹掉。

### 内置的是样例，不是产品默认

随包发几份示例角色，但**默认不启用**。Prologue 的 `config.character.includeBuiltIns`
默认关，理由一样：内置人格一旦默认开着，就成了产品替用户做的决定。

### 落在哪

和模型供应商同一处——目录库（安装级），不是项目库。
Character 是「我习惯怎么干活」，跟着人走而不是跟着某一个项目走。
将来真出现按项目定制的需要，那是加一列作用域，不是现在先猜一个。


C9 从 MCP 资料到执行报告的后续实操见[运行时验证记录](runtime-evidence.md)。
