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

## Review 队列：批准是一次性的

- `request` 只是把待审操作摆出来，本身不授权任何事。
- `decide` 记录用户的决定；**拒绝、过期、已被执行主人关闭**的待审都不能换个入口变成许可。
- `consumeApproval` 是一次性授权，消费过就不能再用；重放的决定授权不了第二次写入。
- `settle` 记录真实回执。**批准不等于已经发生**：`effect_settled` 只有拿到真实结果才为真。
- 停止一个 Run 会撤回它名下仍在等待的条目。

## 当前 adapter 与它们的诚实边界

| Adapter | 已接通 | 申报为不支持，以及为什么 |
| --- | --- | --- |
| Prologue | 会话、Run 的启动/观察/控制、事件流投影、待批副作用桥**可挂载** | 挂桥之前 `text-edit` 不支持；挂上之后支持，且每笔副作用先进审查队列。`command` 始终不支持——没有回执来源，读不回来 |
| CLI（Claude Code / Codex） | 只读任务真实执行、`stream-json` 投影、停止、用量 | `text-edit` / `command`：CLI 的审批发生在它自己的权限模型里，**不经过宿主 Review 队列**。报成支持等于放行一次没有记录批准的写入 |

两个 adapter 的不支持都不是"暂时没写"的借口，而是**当前状态下报成支持就会破坏审批不可绕过这条规则**。
要打开 CLI 的写入，需要一个 permission-prompt 工具把询问转回宿主队列。

## 从哪里读代码

`horizontal/agent-host/src/index.ts`（注册与启动授权）、`src/reviews.ts`（Review 队列）、
`src/adapters/`（两个 adapter 与投影）、`tests/agent-host.test.ts`、
`tests/prologue-approval-bridge.test.ts`、`tests/prologue-stream.test.ts`、`tests/cli-agent-adapter.test.ts`。
