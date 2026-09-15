# MCP 与 Runtime 对话契约

## 目标

让 Molis Work MCP 在 Codex、Claude Code 和其他标准 MCP Runtime 的真实能力边界内工作：不依赖
stdio 启动环境中的 Session 变量，不依赖不存在的可信用户消息 provider，并补齐客户端会枚举的
标准方法。

## 范围

- 解析 `tools/call.params._meta.threadId`、通用 `sessionId` 和 Molis Work namespaced session ID 等
  adapter 明确支持的宿主元数据，并把它作为当前调用的 Session 审计上下文；Claude Code 等
  已提供稳定 Session 环境信号的 Runtime 继续使用 adapter 信号；两类信号都没有时仍可初始化、
  解析工作目录线索并进入显式关联流程。
- 不得接受模型在普通 arguments 内伪造 thread/session ID；同一个 MCP 进程处理不同 Session
  元数据时不得复用前一个 Session 的项目连接。
- Runtime Goal Tree 决定改为明确的 `user_confirmed` + 逐项决定 + 审计上下文；删除正式 stdio
  永远无法满足的 `trustedUserDecisionProvider` 前置条件。
- 保留并验证最新 main 已实现的 `resources/templates/list -> { resourceTemplates: [] }`，并让
  initialize capabilities 与实际 resources 行为一致，不重复造第二套实现。
- 删除 `MOLIS_WORK_DATABASE/MOLIS_WORK_BOARD_ID` 静态 Runtime connection 生产分支、文档和测试；
  新接入计划可识别并替换旧 config，但不保留旧运行模式。
- 更新 Skill：用人话说明确认内容，并在用户明确同意后提交决定；不把 Runtime 声明描述成
  “宿主密码学证明”。

## 验收

- 没有启动时 `CODEX_THREAD_ID` 的 MCP 仍能 initialize/list tools/resolve context。
- tool-call `_meta.threadId` 不进入工具 arguments，却能进入决定审计。
- Claude Code 的 adapter Session 信号、通用 Runtime `_meta.sessionId`、完全没有 Session ID 的
  Runtime 都有覆盖测试，并且不会被 Codex 专用分支绑死。
- `user_confirmed=false` 或缺失时拒绝；明确确认后提案可物化。
- `resources/templates/list` 的上游修复在其余 MCP 重构后仍返回合法结果。
- 代码中不再有静态 DB Runtime connection fallback。

## 修改边界与验证

- `src/mcp/server.ts`、`src/v1/*` 的决定审计、`skills/goal-advance/*`、README/PRODUCT 对应段落。
- `tests/mcp.test.ts`、`tests/v1.test.ts`、`tests/runtime-integration.test.ts`。

```bash
node --import tsx --test tests/mcp.test.ts tests/v1.test.ts tests/runtime-integration.test.ts
pnpm typecheck
```
