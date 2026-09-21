# MCP 工具适配

向 AI Runtime 提供 Molis Work 工具、输入 schema 和响应视图。维护工具名、参数、上下文呈现或协议错误时使用本包。

包名：`@molis-ai/molis-work-app-mcp`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

根 apps/desktop/launchers/mcp/server.ts 处理进程入口；Host 管理项目连接和调用身份。本包通过 handleMcpMessage、工具目录及 dispatchMcpProjectTool 把请求交给 Host Client，再组合返回值。Runtime 事件工具是 `molis_work_v1_goal_intent_create`、`molis_work_v1_goal_state`、`molis_work_v1_event_configure`、`molis_work_v1_event_report`、`molis_work_v1_event_list`、`molis_work_v1_event_read`、`molis_work_v1_event_progress`、`molis_work_v1_event_concern`、`molis_work_v1_event_decision_request`、`molis_work_v1_event_cite_decision`、`molis_work_v1_event_agree`、`molis_work_v1_event_close`、`molis_work_v1_event_resume`。`molis_work_v1_event_decide` 只接受 Host Web/管理入口，不属于 Runtime audience。Runtime 身份由 Host 写入，工具参数不能自填用户或批准。上报返回记录成功，不表示正式完成；显式收尾才可能让 `completion_applied` 为 true。未转交 `legacy_claim_run` Goal 仍暴露 `select_goal` / `claim_renew` / `run_*` / `evidence_*` / `review_submit`。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/protocol.ts](src/protocol.ts) | handleMcpMessage：协议处理 |
| [src/tool-catalog.ts](src/tool-catalog.ts) | 平台工具目录（连接 / Goals / 事件）。插件工具不在这里写死 |
| [src/tool-dispatch.ts](src/tool-dispatch.ts) | 项目工具分发 |
| [src/launcher-validation.ts](src/launcher-validation.ts) | 启动器验证 |

可对照现有调用方 [apps/local-host/src/mcp-server.ts](../local-host/src/mcp-server.ts) 阅读装配方式。

## 接入与边界

Session 身份来自 Host 上下文，不能把模型提交的参数直接当作身份。工具 schema 与响应适配属于这里；Goal 事件事实和完成效果属于 Goals，可信用户决定属于 Governance，UI 不另算完成。插件对外方法由 Manifest `mcp_exports` 登记、由 Local Host 合成，不进本包静态目录。作者与 Host 改法见 [Plugin 开发 · 对外 MCP](../../docs/platform/PLUGIN-DEVELOPMENT.md#对外-mcp)。

工作区依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-goals`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-app-mcp typecheck
pnpm --filter @molis-ai/molis-work-app-mcp build
```

已有行为示例与回归：[host-entry-consistency.test.ts](../../tests/host-entry-consistency.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/host-entry-consistency.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../docs/cli-and-development.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/app-host`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-dv1`, `goal-reorg-dv2`, `goal-reorg-gw4`, `goal-reorg-ex4`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
