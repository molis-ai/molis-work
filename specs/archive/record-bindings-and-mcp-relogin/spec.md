# 记录槽账号保护与 MCP 重新登录

> 归档（2026-11-23）：Codex 在独立工作树实现并完成隔离环境定向回归。基点 `0dc996734a`。

需求来自 BL-921、BL-1050、BL-1051 及服务接入 §13.2。

- **BL-921** 普通绑定先核对目标账号、服务和作用域，再由连接库在同一事务中占用空槽。两个不同账号竞争同一记录时，后到的请求收到冲突。同账号重试不会触发绑定变化。用户可以解除绑定，或用“换一个”明确换用账号。换用时数据库再次匹配原账号。
- **BL-1050** Coding 将选定账号保存在项目 MCP 配置中。连接页在 Home 查询，因此用途由能读取全部项目的 MCP 目录适配层申报。每项引用计一次，包括停用的配置。页面同时列出项目名和配置名。项目内的查询只读本项目。用户仍到 Coding 设置中改选账号。
- **BL-1051** 自定义远程 MCP 重新登录时，从旧连接的协议配置读取认证方式，预填 OAuth、Bearer 或无需认证。页面清空之前手填的令牌和客户端密钥。重新登录继续创建新连接。

## 验证记录

Node 24.15.0、pnpm 11.9.0。整仓构建通过。以下为 `node scripts/run-tests.mjs --jobs 1` 的隔离 Home 回归。

| 事项 | 测试文件（tests/） | 通过 |
| --- | --- | --- |
| BL-921 | feed-sources、security-invariants-connection-records、security-invariants-plugin-record-slots、security-invariants-connection-card、security-invariants-connection-switch、security-invariants-plugin-source-connector | 87 |
| BL-1050 | connector-consumer-usages、connector-replacement | 10 |
| BL-1051 | connector-mcp、connector-mcp-replacement.e2e | 103 |

BL-1050 用真实保存的两项目配置检查 Home 汇总及项目隔离。BL-1051 使用本地 MCP 服务验证协议与连接视图，独立测试浏览器使用生产页面和受控 HTTP 响应验证表单。
