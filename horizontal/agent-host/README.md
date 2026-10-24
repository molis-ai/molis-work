# Agent Host

## 同一 Run 按需展开（实施中，未验证）

依 [Memory spec §9.4](../../specs/prologue-memory-strategy/spec.md#94-c0-首期产品配置与采用决定)，Adapter 将 SDK 现有 `started.memory.expand` 交现 `RunRecord` 持有。启动前的一次性可取消等待解决首工具早于 start 返回的时序，绑定成功才释放，启动失败拒绝；不新增 registry、不按 Session 最新 Run 找 control，历史恢复不补造控制。每次展开复用原 attempt authority 与当前派发检查，无正文回执保留 ref/version、预算和 queued/omitted 事实，正文只走下一实际模型请求的 Context。工具与现 Action client 传递同一可信窄口。

可配与可换：沿现 Runtime Adapter 装配和原 Run 预算；身份、授权、同 Run 预算/去重、取消/终态不能关闭。不新增 SDK API 或配置。源码按此合同接入，尚未运行验证。

专项验证：`node scripts/run-tests.mjs tests/memory-run-expansion.test.ts`。新增场景使用正式 SDK 的公开 Node Adapter、隔离存储和本机 HTTP：两个活跃 Run 交错读取时各自保留 scope、attempt authority、去重与预算，正文只进所属 Run 的后续请求；在真实 Host `storage.commit` 的本 Session `afterStart` 索引写入处设置异步屏障，验证首工具早于 App start 返回、正常释放、持久失败取消原工具信号及读取信号取消。屏障只延迟/拒绝该次提交，其余提交原样执行，不替换 SDK start/drive；原 fake Runtime 用例只证明 Adapter 窄口。SDK #96 既有 `memory-run-expand.live.test.ts` 已有预算、去重、撤权、版本、compaction 与 queued 取消场景，本片不复制其全矩阵。这些新增 App 场景目前只准备源码，正式依赖安装及运行结果待集成验证。

## Memory 有界管理查询

`AgentMemoryCapability.page` 只将当前 caller/ExecutionControl 下的 scope、owner、分类/状态/来源/期限过滤与 cursor 交 SDK `memory.page`，不先 hydrate/list。返回 canonical 条目、停止原因、exact/unknown 计数及真实/隐藏成本；snake_case 只作字段转换。查询范围许可与条目最终复核由 SDK 和现 App authority 承担，缺管理许可不查库，普通 task/explicit 许可不能冒充管理查询权。该页不写记忆、不增加索引。对应公开 Node 回归：`tests/memory-management-pages.test.ts`、`tests/memory-management-page-authority.test.ts`。


## Memory 维护命令边界

依 spec §9.4，Memory Capability 的 `previewMutation` 只将带原版本与原操作号的 update/pause/disable/resume/remove 真实命令交同一 SDK management.preview，不写条目，不替代执行时的当前授权。`tombstone` 委托 SDK 逻辑 remove，返回实际条目版本与原操作重放结果；现 `remove` 仍委托物理 purge。两口沿原 caller/ExecutionControl，不增加第二写主人、查询授权或恢复账。App 的维护补账只接受实际 SDK 提交确认；缺失、同文或版本加一不能作为成功证明。验证使用公开 Adapter 与真实隔离 Node 存储，覆盖取消/撤权、原操作重放和后继版本冲突。

Agent Runtime 的注册、能力矩阵、启动授权，以及宿主拥有的副作用 Review 队列。

显式 `storageRoot` 的 Node 适配器持有 SQLite 独占锁，直到 SDK 正常关闭或进程退出，防止另一执行器把活动审阅误判为重启遗留。获取失败报告 `agent.storage_busy`，不读取恢复记录。该锁保护当前单执行方假设；跨进程调用转发仍由 LocalHost 接通，不能用多个 runtime 直接共享这个目录。

离线记忆采用的 `openPrologueMemoryAdoption` 使用同一存储 owner 锁，只向显式范围开放 SDK 的 `adoptLegacy` 与整 App `verifyAdoption`，不装 Agent、模型或普通记忆写入口。维护 Runtime 保留 App taxonomy、版本与限额，但只装只读维护配方；不要求安装普通 Runtime 的提炼、召回或晋升实例，也不把维护配方写回正常配置。调用方必须先停所有 owner 并备份，在关闭维护 Runtime 后重新打开正常 Runtime；关闭等待在途页结束，SDK 关闭失败不释放写锁。旧 metadata 无法证明自然场景时保持未分类，不从 kind/namespace 猜测；原引用、版本、期限、来源与已完成候选关联由 SDK 保持。页中的 issues、未决决定、未知归属、取消与未知提交均不是完成；LocalHost 累计整次结果后才提交 ledger4。维护入口不改变正常 Runtime 的授权。真实隔离 Node 回归：`tests/prologue-memory-adoption.test.ts`；SQLite 编排故障回归：`tests/memory-adoption-maintenance.test.ts`。

包名：`@molis-ai/molis-work-service-agent-host`。工作区内部包，由 Host 装配使用。

## 它拥有什么

- **哪些 Runtime 可用，以及它们真实支持什么**。能力矩阵由 adapter 如实申报；不支持的能力显示为真实不可用，不伪造成功。
- **一次 Run 允许在什么权限下开始**。角色必须是插件 Manifest 声明过的；角色需要的能力 Runtime 必须真的支持；目录必须是宿主授权且已核过 realpath 的。三条都过了才会把请求交给 Runtime。
- **Runtime 不能自己扩权**。启动后返回的冻结角色权限若与 Manifest 不一致，该 Run 会被立刻取消。
- **副作用的批准与回执**。批准是一次性的：消费过就不能再授权第二次写入；拒绝和过期都不能换个入口变成许可；停止一个 Run 会撤回它名下仍在等待的条目。

## 它不拥有什么

编码任务的业务含义、模型选择、凭据，以及批准决定本身——那是用户在宿主审查面里做的。
adapter 只报告事实并执行已批准的工作。

记忆使用投影由可选 `memoryUsage` Host 回调接收真实 SDK Context 回执，保留原 Session/Run、条目版本、retrieval receipt 与模型 call。`prepared` 不算派发；`dispatched-or-unknown` 与 `response-observed` 分开，后者也不证明模型采用。回调失败只报告 `memory.receipt_unrecorded`，不重发模型；读取原 Run 可再交同一事实，关闭 Runtime 时等待在途投影。历史事件到只读视图由 `prologue-restored-session.ts` 持有，SDK 存储读取与原不可恢复控制不变。验证：`tests/prologue-memory-run-context.test.ts` 使用真实 Node/SQLite/本机 HTTP 覆盖 ledger 故障、原 Run 重读和零网络补账；`tests/memory-use-receipts.test.ts` 覆盖单调摘要与遗忘屏障。

## 记忆晋升与可信原件桥

`AgentMemoryTools` 的保存、建议、查询与停用回调必须接收本次可信执行控制。gateway 保留实际工具/Run 的取消信号，并为一次执行生成固定操作号；模型参数或 tool-call id 不授予操作身份。LocalHost 将此控制贯穿实际 Host 提交与 ledger，未提供控制的旧直接调用拒绝；不新增跨重启工具重放保证。

Adapter 的实际 disable 调用在原 ALS 帧携带 operation=disable，作为 `PrologueMemoryOptions.authorize/assertCurrent` 可选第三参数交 App。它只说明这次调用的动作，不授予权限；caller/模型自报字段不能设置，普通写入及并发调用不继承。App 可将停用与形成分别授权，同操作重试仍核当前权限、固定输入和版本。公开 Node 回归 `tests/memory-runtime-policy.test.ts` 覆盖关闭形成后的停用/重启重试、普通编辑拒绝及并发隔离；助理真实调用另由 `tests/assistant-memory.test.ts` 覆盖。

形成沿 `memory.candidates.form` 委托同一 SDK 候选主人；Host extractor 只在既有 `memory-extractor` 槽执行一次提炼。固定 slots、replacement 原版本与 canonical 来源由 SDK 校验，Adapter 仅投影 snake case，不产生候选或批准。已有记忆（最多 30）及待审候选（最多 20）的授权展示快照随这次 ALS 调用传给 extractor，正文只传一次，不成为来源证明，不存第二份账；快照不能替代后续来源、权限、期限与目标 CAS。进程内 `validate_context` 与 caller/context 分开保存在本次 ALS 中，在真实模型 before_dispatch 前复核原 ref/version 与当前读取许可，不序列化、不落盘、不发模型；`none` 零调用。逐项 created/replayed/rejected/unknown、部分成功、取消和未知用量完整返回。正常返回的 reported usage 先交 SDK，再由来源与实际存储门拒绝迟到写入；Host 自身拒绝结果或取消竞速尚未交回结果时，usage 保持 unknown，不推算为零。`trigger:none` 委托 SDK 零来源/模型读取；缺 extractor 明确 unavailable。验证使用公开 Adapter、真实 Node 存储与本机 HTTP，不宣称真实模型质量已验收。

补充原件证明由 Host 绑定实际 install、Action 和 `send.<input_id>`；无证明的 Action 输入按 host 来源处理，不因自报 person 升权。混合输入的 raw 原件只原位保存，外层正文仍是唯一模型材料；初始输入与补充输入的证明用途隔离，不能互换。Adapter 只投影已核验原件，不从组合正文或分隔符反推本人原话。

已经接受的 Run 停止时，当前控制调用先通过原权限检查并持久化停止意图；随后取消和 SDK 终态收尾经现有 effects.detach 脱离该短调用。终态仍由 SDK 保存并发布，界面不提前伪报停止；普通迟到业务写仍受原调用检查。

Host 可注入版本化 `memory.promotion`，Adapter 将候选、来源、正式变更与 App 历史回执转换为纯 AgentHost DTO，只有这里依赖 SDK 类型。`decide` 只读返回 promote/hold；`undo.prepare` 保存当前操作的准备，`undo.record` 以 SDK 已提交的 canonical entry 补历史及撤销身份。回调首参只能来自当前 `withCaller` 的独立调用上下文，或 SDK 请求对应的可信 Session owner；prepare/record 没有来源上下文时要求原调用绑定仍在，缺失即拒绝，不从模型参数恢复身份，不新建操作账。 App 的 prepare/record 写账也复用原调用的 `PrologueEffects`：异步身份解析和 `beforeEffect` 后紧邻写入核 `assertCurrent` 及本次 `signal`，任一等待中取消不再调用 App 写账；撤权后不能留下准备历史，正式已提交而补账被拒时沿原操作恢复。

SDK 仍拥有来源、权限、期限、取消与正式 CAS 门。App 的回执必须保持原 operation、候选原版本、policy/version 和实际 memory/version；Adapter 不伪造成功，也不证明 App 的历史事务已实际可撤销。已提交而 record 未完成时，SDK 的 `MEMORY_PROMOTION_RECORD_PENDING` 映为 `agent.memory_promotion_record_pending`（conflict），保留`operation_id` 与无正文 `committed: { memory_id, version }`，可用完整原请求重试，不能报成零写入。未装完整晋升实例仍不可用。

分类限制依赖 SDK 最终授权 fence：App 在 `memory.assertCurrent` 同步核本次 target/before 的当前规则，可信 caller 使用各自调用/原 attempt 的 ALS 帧，不借另一个 Run 的最新快照。它只能收紧已完成的异步授权。Memory 专用 effect 帧将异步 `beforeEffect` 放在 authority 检查之前，最终 Host storage 包装只同步核执行令牌，避免分类检查后再等待；普通 Session/Run 写入和晋升 prepare/record 保留原完整门。真实 Node 在每次实际网络派发前执行该 fence；没有安装同步 App 检查时不承诺等待期间即时撤权。专项包含目标分类撤权后重启无候选及发送前关闭后零 HTTP；本片尚待新 SDK 包集成验证。

`AgentTurnSteer` 和 `AgentQueuedInput` 仅复制 SDK 可证明的 `acceptedAtMs` 为可选 `accepted_at_ms`，不把新 Run 或读取时刻当作原件时间；旧记录未知就省略。steer 的 `source` 同样从 SDK 原件投影，app 映为 host，peer 保持 peer，不凭 user-role 判断本人。carry、取消与重启不另造输入身份。

SourcePort 也只接 AgentHost 的 snake_case 引用、身份与短期正文快照，调用方来自同一可信绑定；来源内容不由模型自报。当前产品通过 SDK form/extractor 复用唯一 HostTextGeneration 提炼；来源与候选持久化仍由 SDK 核验。此桥不接第二模型循环或第二来源/历史表。回归使用公开 Node Adapter 与隔离真实存储，覆盖创建、替换、hold、故障补账、撤权及取消。

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
- `src/session-actions.ts`：关于会话轮次的统一动作——等待与接续（`agent.collaboration.*`），以及插件向一轮补充要求（`agent.inputs.send`，回执说这一轮收下了还是留到下一轮；纠正用 `about` 指向原来那条）、撤回还没交给模型的补充（`agent.inputs.withdraw`）。
- `tests/agent-host.test.ts`：授权与批准各条边界的断言。

## 开发要求

- 负责：Agent Runtime 注册、能力矩阵、冻结的启动授权、宿主审查队列与 Prologue 推理接线。
- 不负责：编码业务含义、角色与提示词正文、模型选择与凭据、批准决定本身。
- 公开入口：`@molis-ai/molis-work-service-agent-host`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/services/agent-host`。
- 依赖：`@molis-ai/molis-work-contracts`；第三方依赖见 `package.json`。方向：只依赖合同与同目录适配端口；不决定业务状态（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 目录 Action 的工具时限取提供方 `execution.timeout_ms` 与 Agent 入口上限中的较小者；完整声明参与冻结合同，不按能力名称猜测成本。
  - 仓库里唯一依赖 `@prologue/sdk` 的包。
  - Memory Adapter 将 SDK 的 `STORAGE_CONFLICT` 翻译为公开的 `agent.memory_conflict`（conflict 类别），适用于正式记忆与候选的同一访问出口；HTTP 状态继续由统一 Action 错误模型决定。不会把未知错误或回执丢失解释成可重放。
  - 前台 SDK 写入保留原调用控制到实际 Node storage commit；最终 checker 必须同步。只有初始 Run 持久记录提交后，drive 才脱离前台信号，派出仍核独立安装授权。Session 以 SDK 记录和 owner 索引都已提交为接受点；索引前拒绝时由 SDK 清理本次未接受 Session，清理失败明确报出。尚未接受的排队效果不会因包装函数返回而丢失原 checker。
  - thinking 与显式输出预算合成同一个 params；文档文本提取 finally 回收本次原件和派生资源，保留其他消费者持有的附件。
  - 每一轮的冻结记录带宿主给的调用编号（`frozen.call_id`）：来自启动权限 `AgentStartAuthority.call_id`，经 `AgentHost.start` 交给适配器；适配器不读请求体里的同名字段，所以插件塞的值不会成为一轮的编号。编号只写在这份冻结记录里，不交给 Prologue（用户 2026-10-10 决定）；它不是工具调用的 `call_id`。回归：`tests/agent-start-authority.test.ts`。
  - 原图输入经可信 Host 选定路径、Node Host intake 与 Session attachments；只读根不交给模型工具。支持 PNG/JPEG/GIF/WebP，单图 32 MiB、每次 50 张/128 MiB，共享资源总量仍限 128 MiB。完成/失败/取消撤销资源，关闭时等待实际清理。回归：`tests/prologue-inference-images.test.ts`。
  - 一个 Home 一个执行 owner；另一个进程得到 `agent.inference.home_in_use` 或 `agent.storage_busy`，经 `inferenceServiceUnavailableReason` 转成给人看的原因。
  - 派出前复核（`beforeDispatch`、凭据核对）拒绝时，调用方拿到复核自己抛的错误（`isDispatchRefusal` 为真），不得改写成模型或网络失败；SDK 侧对应 `EFFECT_NOT_AUTHORIZED`。
  - 角色必须是 Manifest 声明过的，能力必须 Runtime 真支持，目录必须宿主授权且 realpath 已核；`unsupported` 就是不能用，不降级不伪装。
  - 项目 MCP 配置由 SDK 保管；来源插件是来历，Host 共同动作允许助理在自己的授权下复用。启用的断线连接只在获准调用时重连，目录查询不启动进程；准备和实际派出都复核原工作区授权、配置版本及工具形状。`catalog()` 仅供 Host 管理列出项目归属，不赋予调用权限。`call` 的 Host 观察回调区分业务派出和结果，连接准备不算业务调用；SDK 的明确工具失败与结果未确认分别通知，原错误合同保留。回归：`tests/external-mcp-actions.test.ts`、`tests/external-mcp-dispatch.test.ts`、`tests/coding-mcp.test.ts`。
  - Runtime 不能自己扩权：批准一次性，拒绝与过期不能换个入口变成许可。
  - 插件 caller 的项目身份只取 Host；`HostPluginCaller.project_id` 为 `null` 的 Home caller 在原归属检查处以 `agent.session_unknown` 拒绝，不补造项目。通过检查后才窄化成项目 caller；回归见 `tests/home-plugin-platform.test.ts` 的 Home 消费身份与 Agent 拒绝用例。
  - 逐项能力回合（冻结的 `action_tools`）的角色 `host_tools` 带 `suggest-action` 时，这一轮多一个建议工具（`molis-suggest-<范围>`，与动作工具同一个包）：只能点名这一轮的动作工具，按动作此刻的状态与它自己的输入检查核过才记下，什么都不执行、不排审查；记下的建议原样进运行视图的 `offers`（`AgentRunView.offers`，从保存的事件回放，不重新生成），落成什么由调用方决定（D25）。只读角色带 `suggest-action` 开跑前就拒（`agent.role_execution_exceeded`）。`suggest-action` 不是 Prologue 的系统工具，不经 `prologueToolName`。建议工具按名字前缀免审查放行，所以别的工具来源都不能产生这个前缀（MCP 是 `mcp:…`、动作是 `molis-action-…`、其余是固定名字或 SDK 系统工具）；新增工具来源时要守住这一点。安全不变量 S-28，回归：`tests/security-invariants-agent-suggestions.test.ts`、`tests/agent-host-offers.test.ts`。
  - 逐项能力回合的包 id（`molis-actions-<范围>`）算进包里声明的一切：时限、有没有建议工具、每个动作的引用、操作、声明与提供方的显示名。SDK 在一个进程里按 id 只认第一次登记的声明，漏掉一项，两轮动作相同、声明不同时第二轮就被拒（`SCENARIO_PACK_INVALID`）；Coding 同一个会话先「执行」（可以建议）再「修改」（不能）就是这样撞的。范围按每轮记在会话索引的 `action_tool_scope` 里，读回时用记下的、不重新算，所以改算法只影响新的轮。回归：`tests/agent-action-tools-prologue.test.ts`、`tests/coding-mode-switch-pack.test.ts`。
  - 插件执行一轮的建议只经 `agent.offers.run.v1`（只给插件受众）：只执行这条建议记下的那个确切引用，且只在调用插件自己会话的这一轮里；用这一轮的授权此刻重新发现，合同与建议时的 `action_digest` 不同就拒；输入过动作自己的检查，`beforeEffect()` 之后才调。动作的上下文带点的那一轮所在、刚核过归属的会话（`runtime_session_id`、`audit_actor_id` 为 `agent:<runtime_id>:<会话>`，点击里自带的不算），与这一轮自己的工具调用一样。宿主不另记状态，重复执行由插件的卡自己认领挡住。安全不变量 S-29、S-17，回归：`tests/security-invariants-agent-offer-runs.test.ts`、`tests/security-invariants-agent-run-session.test.ts`。
  - 写后检查（`src/adapters/prologue-after-write.ts`，specs/prologue-adoption §6.0p，S-42）：Coding 一类有工作区的轮，包里带一样标了 `afterWriteCheck: true` 的 `safe-read` 工具（名字随包，不给模型）；工作区此刻已授权、存了检查器，这一轮才给它执行器，否则 SDK 零调用。执行器只照人存的配置答一条命令（第一个适用的、只查它 `cwd` 里的文件，`{file}` 是相对这个 `cwd` 的路径，以 `-` 开头的写成 `./…`），每次回答前再核这一轮的授权与工作区，一轮至多 10 次；自己不起进程，命令由 SDK 走同一道审查、Effect 和回执。答了哪个检查器、哪个版本，按 SDK 给的 `operationKey` 记在这一轮的索引里（`write_checks`），审查卡按同一个键读；读不到就不能批准。
- 改动后必跑：`node scripts/run-tests.mjs tests/agent-sdk-effects.test.ts tests/agent-budget-prologue.test.ts tests/prologue-documents.test.ts tests/agent-host.test.ts tests/agent-host-composition.test.ts tests/agent-host-wiring.test.ts tests/agent-start-authority.test.ts tests/agent-action-tools-prologue.test.ts tests/coding-mode-switch-pack.test.ts tests/agent-host-offers.test.ts tests/security-invariants-agent-suggestions.test.ts tests/security-invariants-agent-offer-runs.test.ts tests/host-inference-completion.test.ts tests/prologue-inference-native.test.ts tests/prologue-external-checks.test.ts tests/security-invariants-external-checks.test.ts tests/coding-checkers-settings.test.ts tests/coding-diagnose-after-write.test.ts tests/security-invariants-checkers.test.ts`
- 动作网关的调用与建议均以当前 input schema 校验；参数错误使用 SDK `TOOL_ARGUMENTS_INVALID` 返回有界合同与嵌套要求，不带用户值或任意异常正文，避免未知 Host 异常被截成 240 字后模型重复同一错误。输入合同已通过、却被能力的主人（或它调用的主人）以 `actions.input_invalid` 拒绝的，回执改为主人自己的原因（截到 600 字），说明输入符合合同，不再给合同让模型改形状。能力找不到时：这一轮确实见过、现在没了的确切身份（能力、版本、提供方）才说已关闭或移除；从没见过的身份按写错处理，提供方写错时说出这个能力实际由哪个提供方提供，并指回 find-capabilities。直接执行的可撤销修改（`change-reversible`）在运行前被网关钩子拒绝，回执同样写出完整的 input 合同并说明没有执行；它不算交互工具，模型一直不改时由运行时的重复调用保护停下。通用 input 明确声明 JSON 类型，继续由当前能力 schema 校验具体字段，不从按钮文案猜输入。其他失败不转成参数重试，写入结果未知仍先核对。真实 SDK 回归见 `tests/issue-assistant.test.ts`（ISSUE-25）、`tests/assistant-business-gateway.test.ts`。
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

ReviewQueue.observeSettlement 是 Host 投影通知口：只通知执行 owner 新记录的成功、失败或未知回执，重复 settle 与 Prologue 恢复历史不重复通知。监听错误不改写已提交 Effect，也不触发执行重试；消费者必须按项目过滤并自行释放。插件发起的 Host 操作，监听者另收到发起时记下的 `ReviewAuthority`（只在本进程里，不写进审查记录）；它的 `holds()` 说那次激活是否还在。宿主据此把 `host.review.settled@1` 只发给发起的那个安装（X-6，S-54，`apps/local-host/src/review-settlement-events.ts`）；没有发起安装的（Agent 自己的改动、恢复出来的审查）不发。

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

等外面的结果（P3c）：`board-wait` 的 `external` 条件由 `prologue-checkers.ts` 里的两个检查器去看，不经模型。`molis.action-query@1` 只查这一轮此刻能调用的只读查询（`operation` 与 `kind` 都是 `query`、effect 是 `read`）；模型给的是动作工具名，`remember()` 时用 `prologue-action-tools.ts` 的 `actionToolRefs` 按这一轮的冻结动作建好名字到引用的表，检查器不自己算名字；`molis.file-present@1` 只看这一轮授权目录里的相对路径。登记时一个 `tool-before` 钩子先拒掉写类、判断、声明了 `model:invoke` 的查询、导航和这一轮没给的动作；之后每次看都重新复核：轮次还被记得、这一轮自己的 `beforeDispatch` 通过、动作经统一动作服务用这一轮的授权重新发现，目录经宿主的 `checks.directoryAuthorized` 端口确认仍授权。不过就回 `refused`，等待停下（`docs/system/SECURITY-INVARIANTS.md` S-27，`tests/prologue-external-checks.test.ts`、`tests/security-invariants-external-checks.test.ts`）。

宿主还可通过 `checks.owned` 登记领域 owner 的只读检查；模型与插件没有登记入口。每次读取前后都用当前会话身份向 owner 重新证明权限，允许仅该窄读取在重启后恢复；通用动作和文件检查仍按 S-27 拒绝重启后的旧授权。读取暂时失败保留 unknown；撤权或归属不符是 refused，不展示原始错误正文。个人助理的 `molis.connector-setup@1` 只查看同一会话准备的接入请求，不能借它安装、调用业务工具或判断任务成功。回归见 `tests/security-invariants-owned-checks.test.ts`。

信的规则：agents 受众的信只在同一张板相邻的步骤之间走，宿主负责把信交给收件人正在跑的那一轮。同一项目的会话可以互相请求、答复、通知、交接计划步骤；跨项目的会话不在同一张板上，照旧拒绝。几个会话同写一张板靠 SDK 按节点判冲突（P2k）：只有要改的那一步在模型读过之后被人改过，才报冲突。

可信初始输入由受保护 Host 入口交给现 Session attempt 保存原件，后续同 Session 接续只带引用；业务 DTO 不能自证本人身份。`tests/coding-original-inputs.test.ts` 走真实 HTTP/Node 验证原文、首个时间、重启、失败重试同身份、并发拒绝及跨 Session/派生输入拒绝；这只证明原件桥，不代表学习形成已接通。

`readOriginalInput(ref)` 从该 Session attempt 读取首原件的精确正文、作者、身份和首次时间；`accepted_run` 则指向同原件最近一次已接受且未 refused 的直接尝试（排除 `frozen.continued_from`）。拒绝且未建立 Run 的尝试不阻挡后续真实重试，派生继续不能让失败原件取得学习资格。来源消费方仍检查定位 Run 的当前状态、Session owner、工作和权限；缺失或未接受不从拼接任务恢复。原时间和身份不因读取、继续或重试变化，不扫描 SDK 历史，不增加正文存储；Source Port 的 App 规则见记忆策略 §9.4。

`inputs.read(ref)` 先由 SDK 同 Session 的有界 InputBook 定位，再读该 Run 的原输入回执。当前 queued/withdrawn 优先于旧回执；未落定的直接补充仅可检查该 Session 唯一当前活跃 Run，记录缺失或已裁剪保持未知，不扫描历史。该定位不赋予读取或形成许可，产品 SourcePort 仍逐次核当前来源主人和用途。

通用 Agent Memory Action 和 SDK 内置工具共用同轮 recipe。AgentHost 在创建 action tools / gateway 前捕获快照，经现 actions Port 交 Host 绑定原插件与 Session；缺快照时 Memory 拒绝，不从 Session 最新 attempt 补权。真实生产组合回归见 `tests/agent-memory-action-class-policy.test.ts`。


### 明确续期（2026-10-24，实现中）

Memory renew 经现可信 caller、ExecutionControl 和 formal ref 解析直接调用公开 SDK memory.renew；Adapter 只映射 expires_at_ms，不修改状态、分类或来源，不补 Session 绑定。依赖 SDK #96 交付包；干净包与真实测试未运行前不称已采用。
