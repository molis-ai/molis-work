# Agent Host

Agent Runtime 的注册、能力矩阵、启动授权，以及宿主拥有的副作用 Review 队列。

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
- `tests/agent-host.test.ts`：授权与批准各条边界的断言。

## 进一步阅读

- [Plugin Platform v2 需求书](../../specs/plugin-platform-v2/spec.md) 的 D5
- [Coding 插件 UI 与交互设计](../../specs/coding-plugin/design.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/services/agent-host`
- Migration Goals: `goal-reorg-f2`, `goal-plugin-platform-v2`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
两个 adapter 已落地。CLI（`src/adapters/cli-runtime.ts`）真实拉起子进程执行，只读档位，
写入与命令如实报成 `unsupported`——它的审批在自己的权限模型里，不经宿主队列。

Prologue（`src/adapters/prologue.ts`）接通了会话、Run、事件流投影，并且**可以挂上审批桥**：
不挂时写入报 `unsupported`，挂上之后才申报支持，且 Run 停下等的每一笔副作用都先进宿主审查队列。
命令只有同时接通宿主审批桥和持久回执读取端口才申报支持。Node 装配读取 SDK 固定命令审查资源，
并按 Session、Run、call 精确读取 SDK 回执；非零退出、取消和超时不伪装成功。
正式 Coding 入口已用 MiniMax 跑过仓库测试，范围与剩余验证见 Coding spec。

Prologue Node 将基础/内置角色、固定 Character、项目说明、选定方法与恢复上下文一起装入 SDK 指令资源。
组合正文上限为 64,000 字符（UTF-16 长度），SDK 使用相同上限；角色库合法的 20,000 字符正文不会因叠加基础指令而被默认上限截断。
超过组合上限时，在记录启动意图和请求模型之前明确拒绝，提示缩短指令或减少方法，不把部分指令冒充完整冻结输入。
该上限不改变工具权限、审查规则或模型窗口预算，不能证明模型必然遵循已送达的指令。
