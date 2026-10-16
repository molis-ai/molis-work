# Agent Host

Agent Runtime 的注册、能力矩阵、启动授权，以及宿主拥有的副作用 Review 队列。

显式 `storageRoot` 的 Node 适配器持有 SQLite 独占锁，直到 SDK 正常关闭或进程退出，防止另一执行器把活动审阅误判为重启遗留。获取失败报告 `agent.storage_busy`，不读取恢复记录。该锁保护当前单执行方假设；跨进程调用转发仍由 LocalHost 接通，不能用多个 runtime 直接共享这个目录。

包名：`@molis-ai/molis-work-service-agent-host`。工作区内部包，由 Host 装配使用。

## 它拥有什么

- **哪些 Runtime 可用，以及它们真实支持什么**。能力矩阵由 adapter 如实申报；不支持的能力显示为真实不可用，不伪造成功。
- **一次 Run 允许在什么权限下开始**。角色必须是插件 Manifest 声明过的；角色需要的能力 Runtime 必须真的支持；目录必须是宿主授权且已核过 realpath 的。三条都过了才会把请求交给 Runtime。
- **Runtime 不能自己扩权**。启动后返回的冻结角色权限若与 Manifest 不一致，该 Run 会被立刻取消。
- **副作用的批准与回执**。批准是一次性的：消费过就不能再授权第二次写入；拒绝和过期都不能换个入口变成许可；停止一个 Run 会撤回它名下仍在等待的条目。

## 它不拥有什么

编码任务的业务含义、模型选择、凭据，以及批准决定本身——那是用户在宿主审查面里做的。
adapter 只报告事实并执行已批准的工作。

## 插件怎么够到它

有界模型结果由 SDK `collectRun` 从同一 Run 收集；Host 的 `completeTextResult` 返回原引用、终态、实际模型和 typed usage，并可显式请求结构校验或观察文字/用量进度。失败保留可用的运行回执，不自动重试格式。公共模型绑定、Coding 草稿、Cognia 的具体例子见 [AI 手册](../../docs/platform/PROLOGUE-AI.md)。

插件不持有 Agent Host，只能通过注册的 Capability 调用：运行时列表、角色可用性、会话创建与读取、
Run 的启动/读取/控制、审查队列读取。调用前宿主会检查插件是否在 Manifest 里声明消费了该 Capability。

注册入口是 `registerAgentHostCapabilities`，已由 Local Host 的生产装配调用，Coding 通过声明的 Capability 使用。
`agent.run.reviews.v1` 按当前项目、原 Session、Run 和生产者读取文本审查与原回执；读取先刷新 SDK 原恢复事实，失败明确报不可用。
它不会批准、派出或结算副作用。固定成果的保存与阅读由消费插件通过原 Artifact 服务完成，批准仍属于宿主审查面。

**批准动作刻意不是 Capability**：那是用户在宿主审查面里的动作；开成插件可调的能力，
就等于让插件批准自己的副作用。

## 从哪里读代码

- `src/index.ts`：`AgentHost` 的注册、能力矩阵与启动授权。
- `src/reviews.ts`：`AgentReviewQueue` 的请求、决定、一次性消费与回执。
- `src/capability-registration.ts`：对外暴露的 Capability 与它们的授权边界。
- `src/session-actions.ts`：关于会话轮次的统一动作——等待与接续（`agent.collaboration.*`），以及插件向一轮补充要求（`agent.inputs.send`，回执说这一轮收下了还是留到下一轮）。
- `tests/agent-host.test.ts`：授权与批准各条边界的断言。

## 开发要求

- 负责：Agent Runtime 注册、能力矩阵、冻结的启动授权、宿主审查队列与 Prologue 推理接线。
- 不负责：编码业务含义、角色与提示词正文、模型选择与凭据、批准决定本身。
- 公开入口：`@molis-ai/molis-work-service-agent-host`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/services/agent-host`。
- 依赖：`@molis-ai/molis-work-contracts`；第三方依赖见 `package.json`。方向：只依赖合同与同目录适配端口；不决定业务状态（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 目录 Action 的工具时限取提供方 `execution.timeout_ms` 与 Agent 入口上限中的较小者；完整声明参与冻结合同，不按能力名称猜测成本。
  - 仓库里唯一依赖 `@prologue/sdk` 的包。
  - 前台 SDK 写入保留原调用控制到实际 Node storage commit；最终 checker 必须同步。只有初始 Run 持久记录提交后，drive 才脱离前台信号，派出仍核独立安装授权。Session 以 SDK 记录和 owner 索引都已提交为接受点；索引前拒绝时由 SDK 清理本次未接受 Session，清理失败明确报出。尚未接受的排队效果不会因包装函数返回而丢失原 checker。
  - thinking 与显式输出预算合成同一个 params；文档文本提取 finally 回收本次原件和派生资源，保留其他消费者持有的附件。
  - 每一轮的冻结记录带宿主给的调用编号（`frozen.call_id`）：来自启动权限 `AgentStartAuthority.call_id`，经 `AgentHost.start` 交给适配器；适配器不读请求体里的同名字段，所以插件塞的值不会成为一轮的编号。编号只写在这份冻结记录里，不交给 Prologue（用户 2026-10-10 决定）；它不是工具调用的 `call_id`。回归：`tests/agent-start-authority.test.ts`。
  - 原图输入经可信 Host 选定路径、Node Host intake 与 Session attachments；只读根不交给模型工具。支持 PNG/JPEG/GIF/WebP，单图 32 MiB、每次 30 张/128 MiB，共享资源总量仍限 128 MiB。完成/失败/取消撤销资源，关闭时等待实际清理。回归：`tests/prologue-inference-images.test.ts`。
  - 一个 Home 一个执行 owner；另一个进程得到 `agent.inference.home_in_use` 或 `agent.storage_busy`，经 `inferenceServiceUnavailableReason` 转成给人看的原因。
  - 派出前复核（`beforeDispatch`、凭据核对）拒绝时，调用方拿到复核自己抛的错误（`isDispatchRefusal` 为真），不得改写成模型或网络失败；SDK 侧对应 `EFFECT_NOT_AUTHORIZED`。
  - 角色必须是 Manifest 声明过的，能力必须 Runtime 真支持，目录必须宿主授权且 realpath 已核；`unsupported` 就是不能用，不降级不伪装。
  - Runtime 不能自己扩权：批准一次性，拒绝与过期不能换个入口变成许可。
  - 插件 caller 的项目身份只取 Host；`HostPluginCaller.project_id` 为 `null` 的 Home caller 在原归属检查处以 `agent.session_unknown` 拒绝，不补造项目。通过检查后才窄化成项目 caller；回归见 `tests/home-plugin-platform.test.ts` 的 Home 消费身份与 Agent 拒绝用例。
  - 逐项能力回合（冻结的 `action_tools`）的角色 `host_tools` 带 `suggest-action` 时，这一轮多一个建议工具（`molis-suggest-<范围>`，与动作工具同一个包）：只能点名这一轮的动作工具，按动作此刻的状态与它自己的输入检查核过才记下，什么都不执行、不排审查；记下的建议原样进运行视图的 `offers`（`AgentRunView.offers`，从保存的事件回放，不重新生成），落成什么由调用方决定（D25）。只读角色带 `suggest-action` 开跑前就拒（`agent.role_execution_exceeded`）。`suggest-action` 不是 Prologue 的系统工具，不经 `prologueToolName`。安全不变量 S-27，回归：`tests/security-invariants-agent-suggestions.test.ts`、`tests/agent-host-offers.test.ts`。
- 改动后必跑：`node scripts/run-tests.mjs tests/agent-sdk-effects.test.ts tests/agent-budget-prologue.test.ts tests/prologue-documents.test.ts tests/agent-host.test.ts tests/agent-host-composition.test.ts tests/agent-host-wiring.test.ts tests/agent-start-authority.test.ts tests/agent-action-tools-prologue.test.ts tests/agent-host-offers.test.ts tests/security-invariants-agent-suggestions.test.ts tests/host-inference-completion.test.ts tests/prologue-inference-native.test.ts`
- 动作网关的调用与建议均以当前 input schema 校验；参数错误使用 SDK `TOOL_ARGUMENTS_INVALID` 返回有界合同与嵌套要求，不带用户值或任意异常正文，避免未知 Host 异常被截成 240 字后模型重复同一错误。直接执行的可撤销修改（`change-reversible`）在运行前被网关钩子拒绝，回执同样写出完整的 input 合同并说明没有执行；它不算交互工具，模型一直不改时由运行时的重复调用保护停下。通用 input 明确声明 JSON 类型，继续由当前能力 schema 校验具体字段，不从按钮文案猜输入。其他失败不转成参数重试，写入结果未知仍先核对。真实 SDK 回归见 `tests/issue-assistant-repair-page.e2e.test.ts`、`tests/assistant-business-gateway.test.ts`。
- 补充提问沿用 SDK `ask-user`：自由文本只传 `why`，问卷选项为字符串数组。同一 Run 内同一种交互工具（`ask-user` 或 `suggest-action`）最多容许两次参数失败（首次及一次纠正），第二次 `TOOL_ARGUMENTS_INVALID` 回执触发原控制面停止，避免模型继续重复无效调用；成功的结构化待补充不算失败，原始参数与回执仍由 SDK 记录。
- 相关手册：[docs/horizontal/agent-host.md](../../docs/horizontal/agent-host.md)、[docs/platform/PROLOGUE-AI.md](../../docs/platform/PROLOGUE-AI.md)、[skills/molis-prologue-ai/SKILL.md](../../skills/molis-prologue-ai/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [Plugin Platform v2 需求书](../../specs/plugin-platform-v2/spec.md) 的 D5（命令行适配器已删除，现只有 Prologue；D5 开头有 2026-10 的更新说明）
- [Coding 插件 UI 与交互设计](../../specs/coding-plugin/design.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/services/agent-host`
- Migration Goals: `goal-reorg-f2`, `goal-plugin-platform-v2`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
只有一个 adapter：Prologue。曾经的 `claude` 命令行适配器默认注册却没有内置调用方，已删除（2026-10），公开入口不再导出它；外部 Agent 运行时按口径暂缓。

Prologue（`src/adapters/prologue.ts`）接通了会话、Run、事件流投影，并且**可以挂上审批桥**：
不挂时写入报 `unsupported`，挂上之后才申报支持，且 Run 停下等的每一笔副作用都先进宿主审查队列。
命令只有同时接通宿主审批桥和持久回执读取端口才申报支持。Node 装配读取 SDK 固定命令审查资源，
并按 Session、Run、call 精确读取 SDK 回执；非零退出、取消和超时不伪装成功。
正式 Coding 入口已用 MiniMax 跑过仓库测试，范围与剩余验证见 Coding spec。

Prologue Node 将基础/内置角色、固定 Character、项目说明、选定方法与恢复上下文一起装入 SDK 指令资源。
组合正文上限为 64,000 字符（UTF-16 长度），SDK 使用相同上限；角色库合法的 20,000 字符正文不会因叠加基础指令而被默认上限截断。
超过组合上限时，在记录启动意图和请求模型之前明确拒绝，提示缩短指令或减少方法，不把部分指令冒充完整冻结输入。
该上限不改变工具权限、审查规则或模型窗口预算，不能证明模型必然遵循已送达的指令。


## 子任务观察与控制

Prologue Node 接上宿主审查队列时声明子任务能力 `partial`。同目录只读角色保留原路径；声明必须分配子目录的只读协调者可以冻结宿主已授权、互不包含的独立目录，以及各子角色的正文、版本和工具。未授权、重复、主目录或嵌套目录不能启动。SDK 在第一次子模型请求前再次核对本轮角色和目录归属；父 Character 只接收读取/分派工具，SDK 的运行工具上限额外包含子角色工具，不能让父任务直接调用写工具。

子任务沿用原 SDK Session、Run、Pending 和 Effect；Host 只在已有加密归属索引保存父子引用、固定角色和目录，将原待审操作送入同一个 Review 队列。文本与命令审查明确显示所属工作区；命令的相对 cwd 保持原值，命令输出按原子任务回执读取。审查桥失败停止子任务并保留宿主失败原因；重启只读取原记录，不能批准旧待审操作来重派执行。独立目录是工具根目录与命令 cwd 的边界，不代表获得操作系统级进程隔离；批准命令仍须审查其完整参数和执行范围。

此接口尚未接入 Coding 的工作树准备、选择、成果整合与 TaskBoard。现有正式角色不会因新增 Runtime 接口自动开放并行写入；需完成调用方的目录授权和产品流程后再启用。

`agent.subagents.list.v1` / `agent.subagents.cancel.v1` 先核对项目、安装、原 Session 与 Run，再读取或停止该父运行名下的子任务。SDK 登记与原事件拥有状态、正文、活动和用量；Host 只额外保存角色来源，关闭重启不重派。成功结束与用户接受分别记录，后者由消费插件拥有。完整报告通过原 SDK `await-subagents` 的 `reportOffset` 分页读取最后一段结果，默认回传明确为摘要。分派引用、搜索语义和输出质量仍需产品实操核对，能力 `partial` 不代表并行写入或整体协作已完成。

ReviewQueue.observeSettlement 是 Host 投影通知口：只通知执行 owner 新记录的成功、失败或未知回执，重复 settle 与 Prologue 恢复历史不重复通知。监听错误不改写已提交 Effect，也不触发执行重试；消费者必须按项目过滤并自行释放。

目录状态读取在冷会话上使用原加密启动索引、SDK 运行/未结束工作与 checkpoint 恢复检查，只回放最后一轮的过程，并从索引定位最近计划轮的步骤。它不保留历史正文或创建历史控制句柄；打开详情和开始新轮仍走完整恢复路径。不支持内部轻量读取口的 Runtime 保留原恢复行为。回归见 `tests/prologue-status-projection.test.ts` 与 `tests/prologue-recovery.test.ts`。

中途换模型的原调用控制经现有 `withAgentEffect` 进入实际 Node Runtime；配置和凭据等待后复查异步授权，SDK 完成校验后的同步接受点再核原调用。待切换显示也在同一接受点更新，拒绝的候选不覆盖此前接受的目标。W2-18-MODEL-SWITCH-01/02 在 `tests/agent-sdk-effects.test.ts` 使用正式 typed Host、实际 SDK/Node Host、真实文件读取与受控供应商回复，核取消/撤权、B 后拒绝 C，以及后续模型请求确实仍为 B；真实供应商推理质量另列未验。

## 基础 SDK 采用

显式输出预算优先于思考默认值；只读工具必须同时声明 query 操作和 read 副作用。修改提议、委派、记忆的工具按写入处理，仍由原 Host 规则授权。SDK 状态投影保留 sleep 和每轮真实写入回执；sleep 不等于工作完成。命令额外路径/联网请求进入同一 Review，批准只适用于当前请求，不生成会话常驻规则。

输入回执 SDK 的 steer 返回值暂在装配边界等待后丢弃，Molis 输入产品合同与 UI 留给输入线。采用包的工程、安装与实操证据见 [采用 spec](../../specs/prologue-adoption/spec.md) §6，不能把基础采用当作 TaskBoard 统一协作已完成。

## 统一协作（P3a）

要协作的一轮（工具里有派子任务、发信、报告步骤、登记等待，或带确认计划）开跑前，宿主把它绑到这个会话在项目工作板上的那一块（`prologue-collaboration.ts` 的 `sessionBlock`）。项目根是 `project`，每个会话的块挂在它下面，所以同一项目的会话互为兄弟。这个会话有一条可以接着做的接续时，用接续的请求键开跑。确认计划的步骤挂在这一块下面，编号带前缀（`prologue-plan-steps.ts`），给 Coding 的视图仍是计划自己的编号。

没绑的跑拿不到这些工具。

每次派子任务之前，宿主协作口（`admitDispatch`）都会再跑一遍这一轮自己的派出前复核。让出（`yield`）、`board-wait`、带 `wait` / `park` 的简写，都只登记等待并结束这一轮，Runtime 不会自己起父跑。等待满足后，接续停在可以接着做；下一轮由宿主照常开跑时，才把接续接过去（`tests/prologue-adoption-guard.test.ts`）。

等待与接续的视图在 `services/agent-collaboration`，读与控制是两个动作，等到能接着做是一个宿主等待（`agent.collaboration.await.v1`）。

信的规则：agents 受众的信只在同一张板相邻的步骤之间走，宿主负责把信交给收件人正在跑的那一轮。同一项目的会话可以互相请求、答复、通知、交接计划步骤；跨项目的会话不在同一张板上，照旧拒绝。几个会话同写一张板靠 SDK 按节点判冲突（P2k）：只有要改的那一步在模型读过之后被人改过，才报冲突。
