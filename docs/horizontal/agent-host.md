# Agent Host

**提供：** Agent Runtime 注册与能力矩阵；一次 Run 的启动授权；宿主拥有的副作用 Review 队列（请求、决定、一次性消费、回执）。

**技术状态：** 已注册 adapter、每个 Runtime 申报的能力矩阵、待审操作及其一次性授权与执行回执。

**不拥有：** 编码任务的业务含义、角色与 Prompt 正文（归插件）、模型选择与凭据（归宿主设置）、以及批准决定本身（归用户）。

**Adapter：** 就近放在 `horizontal/agent-host/adapters/`，不建立顶层 adapters package。

## 启动授权：三道闸加一道复核

把请求交给任何 Runtime **之前**，Host 先过三道：

1. 角色必须是插件 Manifest 声明过的（`agent.role_not_declared`）。
2. 该角色需要的能力，Runtime 必须真的支持。矩阵里 `unsupported` 就是不能用，不降级不伪装（`agent.capability_unavailable`）。
3. 目录必须是宿主授权、且 realpath 已核过的（`agent.directory_unauthorized`）。

通过之后，Host **从插件自己的声明里冻结角色**（版本、执行档位、Prompt 正文、可用宿主工具）再交给 adapter：
adapter 不自己解析角色，也不发明 Prompt。

启动之后还有一道复核：Runtime 返回的冻结权限若与 Manifest 不一致，该 Run **立刻取消**
（`agent.role_execution_exceeded`）。一个声称自己拿到写权限的只读角色不能继续跑。

## 显式选择的方法

内置方法由插件 `agent.skills` 声明，正文来自 `agent_skills`。安装方法来自适配器的 `skillLibrary`，所有者由 Host 的 `method_owner` 固定为项目/插件。目录与正文按同一所有者读取；起跑时只接受精确 id/version 引用，拒绝重复、失效、未装配或请求比角色更宽工具的方法。请求自带的角色/方法正文不能替换发布定义。

Prologue Node 用 SDK 的 SkillRegistry、prepareSkillIntent、fillSkillBody 准备有界文本方法，将正文固定到本轮指令，保留原任务和副作用审查。当前能力为 partial：内置和已安装方法可显式选择，安装管理已接通，模型自动调用和派生方法尚未接通。运行中选择变化只供下一轮，冻结结果必须与 Host 选择一致；已展开正文不代表任务已经执行或验收。

安装使用 `agent.skills.discover.v1` 与 `agent.skills.install.v1`：发现只接受当前项目已授权根内的相对目录，通过 SDK reader 读取后返回完整候选快照；重新发现/重启后旧候选失效。安装复用 SDK 包扫描和 secureBody 存储，版本 1 不覆盖同名，原子 expectedVersion=0 阻止重复写入。安装只保存文本（工具声明为空），不执行包内脚本，也不自动选择或扩大本轮权限。

## Review 队列：批准是一次性的

- `request` 只是把待审操作摆出来，本身不授权任何事。
- `decide` 记录用户的决定；**拒绝、过期、已被执行主人关闭**的待审都不能换个入口变成许可。
- `consumeApproval` 是一次性授权，消费过就不能再用；重放的决定授权不了第二次写入。
- `settle` 记录真实回执。**批准不等于已经发生**：`effect_settled` 只有拿到真实结果才为真。
- 停止一个 Run 会撤回它名下仍在等待的条目。

## 当前 adapter 与它们的诚实边界

| Adapter | 已接通 | 申报为不支持，以及为什么 |
| --- | --- | --- |
| Prologue | 会话、Run 的启动/观察/控制、事件流投影；Node 已挂宿主审查桥、固定命令提案与 SDK 持久回执读取 | 没有桥时不支持写入；命令还必须有回执读取端口。Node 装配已满足，两者缺一的装配仍拒绝命令。检查点、子代理等另按真实接通情况声明 |
| CLI（Claude Code / Codex） | 只读任务真实执行、`stream-json` 投影、停止、用量 | `text-edit` / `command`：CLI 的审批发生在它自己的权限模型里，**不经过宿主 Review 队列**。报成支持等于放行一次没有记录批准的写入 |

能力矩阵来自实际装配；未接通不能报成支持，已接通也不能继续沿用旧的不支持说明。
要打开 CLI 的写入，需要一个 permission-prompt 工具把询问转回宿主队列。

## 项目 MCP 配置与执行

Coding 的 MCP 配置通过 `agent.mcp.list/save/control.v1` 到 Node 适配层，所有者由 Host 的项目和插件作用域给出。stdio 的工作目录须在该项目授权列表，连接时复核；HTTP 认证通过 SDK Credential 引用，公开配置不含密钥。

选择固定 `server + configuration_version + tool + version`；后两项分别固定服务配置与参数形状。适配层为每份配置版本建立不同 SDK 连接身份，因此编辑配置不会把旧的待批请求送往新地址。重启保留配置和历史，但连接需要重新建立；失效选择不能静默替换。

MCP 提案使用 SDK 持久的工具名和实际参数进入现有 Review 队列，绑定本轮固定引用。批准后仍须等待 SDK dispatch 回执；拒绝/停止/失败/未知不等于成功，不自动重试外部副作用。当前仅 Prologue 的 workspace-write 路径开放外部工具；MCP 短/长资料已通过独立资料选择装配到只读路径；大目录、恢复等剩余项使整体能力保持 partial。

## 从哪里读代码

`horizontal/agent-host/src/index.ts`（注册与启动授权）、`src/reviews.ts`（Review 队列）、
`src/adapters/`（两个 adapter 与投影）、`tests/agent-host.test.ts`、
`tests/prologue-approval-bridge.test.ts`、`tests/prologue-stream.test.ts`、`tests/cli-agent-adapter.test.ts`。

## 执行记录显示时间的恢复

Prologue 原事件账拥有正文、顺序、状态、结果和用量；只有 prompt 有 Host 事件时间。Molis 显示的 assistant/tool 时间是宿主首次观察或更新该显示项的时间，不能当作远端实际发生时刻。恢复不能拿重启时刻替代过去。

本次沿现有加密 SessionIndex 的同轮 attempt 保存显示时间元数据：turn_id / call_id 对应的 at，以及宿主观察到终态的 ended_at，不保存正文、状态或另一份事件账。SDK 已提交终态后，宿主提交这些元数据再发布本轮结束；失败时保留 SDK 真实结果并明确提示显示时间未保存，不重跑任务。旧记录、缺失项继续为未知，ID 不存在不能制造显示项；原账仍决定能否恢复和控制。已中断且 SDK 未提交的轮次仍需核对，不能用时间元数据判定完成。

包含 Node 宿主索引、适配器显示投影、已有恢复测试和 MiniMax 正式入口重启；不改 SDK 时间合同、不新增存储或设置。验证正常/失败/取消终态、延迟与失败的元数据保存、旧记录兼容，以及 MiniMax 的正文/工具/用量/时间跨进程逐字段一致。


### 上下文整理（C9）

插件已有的 `agent.compaction` 指定独立 Prompt 和阈值。Host 按声明版本取正文，排除执行角色的默认 Prompt 合成，覆盖调用方伪造内容；仅在实际支持该能力的适配器上冻结配置。Prologue Node 为每轮装配一次无工具的 SDK 模型选择器，使用同轮模型、端点和凭据，停止联动取消。只接受原文片段编号范围（含 JSON 包装内的转义换行；长单段最多 1024 个 Unicode 码点），复制原始字节交回 SDK；SDK 负责来源、当前指令、完整工具批次、缩短校验和原子替换。失败不提交部分结果、不重试副作用，原事件账不变。

整理活动来自 SDK 事件，可回放；Host 不另存压缩正文。冻结信息展示 Prompt 版本及估计触发阈值，并非模型窗口上限。主 Run 用量目前不含独立整理请求，产品明确标注；不能拿该小计当总消耗。CLI 适配器未接本插件的原文选择机制，不宣称相同能力。

### 未开放工具的纠正活动（C9）

Prologue 的 `MODEL_TOOL_NOT_DECLARED` 证明整批请求没有工具执行。SDK 在同一 Run、原预算和权限内最多要求模型纠正一次；Host 将 `model-response-repair` 投影为「工具调用纠正」执行活动，分开已拦下与恢复成功。活动沿既有 Session 事件、时间和恢复机制保存；不显示原始非法名称或参数、不增加业务重试循环。用量沿 `usage-recorded` 含被拒绝及纠正的实际模型请求。第二次错误仍失败，已完成活动继续保留。


### 手动检查点回退

Node 在有 Host Review Queue 时装配检查点能力。列表和准备回退是声明式能力；当前项目、授权目录和可写角色都由宿主核对。`AgentReviewRequest` 必须有真实 Run 或手动回退 operation 身份之一；手动回退没有模型 Run，只有 Session 和唯一操作 ID。

SDK 拥有文件检查点、完整审查正文、预览指纹和执行回执。Host 只持久保存归属与用户决定，不复制文件快照。批准后还需实际回执，预览过期不写；未知结果不能重复执行。重启时撤回没有派出的旧等待，读取历史决定与回执而不重新调用 rewind。调用者需要注意：文件回退不会撤销命令或外部操作；模型的旧工具结果仍是历史，需要重读当前文件。成功回退不否认原编辑曾执行。

### 手动 Git 的未知结果核对

Host 审查队列可登记原操作的核对处理器；HTTP 入口沿用项目归属与宿主控制令牌，插件没有该决定能力。当前 index 观察由宿主从仍获授权的工作区读取，浏览器仅提交原 review ID、观察版本、核对依据与明确确认，不能提交或替换审查/观察正文。原 SDK Effect、dispatch 回执和 reconcile 仍是唯一执行事实来源。

核对不重放：有 SDK 执行回执时按回执更新；没有回执时保持未知。仅在执行方已结束、当前内容与操作前一致且与目标不同、操作者有可靠的“未发生”依据并明确确认、两次快照与授权核验一致时，才将原 Effect 按 known-not-happened 收口。内容一致本身不是执行证明。核对者/时间/依据存入已有加密审查决定，只描述来源；如果其保存后快照变化或 SDK 收口失败，仍为未知，重启不能用这些字段制造成功。收口后需要重新预览并创建新操作，原 operation ID 只返回历史审查。

宿主 `projects.workspace.git.results.v1` 只投影当前获授权工作区的已确定 Git 审查结果，供 Git 插件发布固定 `result` Artifact。批准本身、结果未知和决定送达未知均不提供确定结果；能力调用不派出、不批准、不核对收口。产物保留决定来源与独立核对来源，Artifact 保存时间不等于原执行时间。Git 只索引固定引用，SDK 继续拥有执行事实；Coding/Goal 消费与验收另由各自声明和流程负责。
