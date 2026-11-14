# S-authorization-settings

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-authorization-settings | 原授权只由本机管理入口和其 owner 改写。Agent、MCP、插件与普通动作调用不能代本人改权限；旧页面不得覆盖更新的授权、场景绑定或更严格选择。已撤销项不能由并发保存复活。任务授予仍只读。 | `apps/local-host/src/authorization-management-http.ts`、`apps/local-host/src/authorization-action-owners.ts`、`apps/local-host/src/web-mcp-action-settings.ts`、`apps/local-host/src/mcp-settings-store.ts`、`packages/kernel/src/action-service.ts` | `tests/security-invariants-authorization-settings.test.ts`「H1」；`tests/mcp-action-settings.test.ts`「H1」；`tests/security-invariants-task-grants-page.test.ts`「TGA-28」 | — |
