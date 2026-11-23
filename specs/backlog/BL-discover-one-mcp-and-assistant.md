# BL-discover-one-mcp-and-assistant

分组：4. 搜索、放置与工作流 / 调用次数

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-discover-one-mcp-and-assistant | 贯通 MCP 与助理热路径的 `discoverOne` 点查，消除剩余全表扫描：① 为 `AgentActionClient`（`packages/contracts/src/services/agent-host-start.ts`）和常驻动作网关（`apps/local-host/src/action-gateway.ts` 及 `/api/internal/action-service`）原生补齐 `discoverOne`，让 `assistant-connection-authority.ts`、`assistant-authority.ts`（含 `check`/`validate_authority`）与外部 MCP 常驻转发不再退回全量 `discover`/`inspectActions`；② 去掉 `apps/local-host/src/mcp-server.ts` `callToolResult` 每次调用前必跑的 `ensureCatalog()`（同时守住 `apps/mcp/src/action-tools.ts` 重名冲突检测）；③ 清理 `horizontal/agent-host`（`prologue-action-gateway.ts`、`prologue-action-tools.ts`、`prologue-run-memory.ts`）、`packages/plugin-sdk/src/action-cards.ts` 与 `packages/kernel/src/action-service.ts` 剩余按精确引用 `discover().find(...)` 热路径，并与 `BL-mr21-review-followups` 第 ② 项一起收口 `exactActionView` 等四份重复兜底实现 | [第 103 批](../post-anticorruption-roadmap/reference/batches/103.md)合后独立复核（用户 2026-11-22 拍板要做） | 明确后续做 | 涉及 `AgentActionClient` 公开合同与常驻 HTTP 动作网关协议扩展，需走合同变更流程并同步更新 API 快照 | 无 | 高 | 平台（动作服务／Host）、A／助理、MCP |
