# MCP 工具适配

向 AI Runtime 提供 Molis Work 工具、输入 schema 和响应视图。维护工具名、参数、上下文呈现或协议错误时使用本包。

包名：`@molis-ai/molis-work-app-mcp`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

根 apps/desktop/launchers/mcp/server.ts 处理进程入口；Host 管理项目连接和调用身份。本包提供 MCP 协议（handleMcpMessage）、平台工具目录（连接工具与受信管理入口的工具）、连接工具与管理工具的分发，以及把动作目录里每个动作变成 MCP 工具的适配（`createActionMcpPorts`，名称 `molis_work_v1_action_<动作>__v<版本>`）。Goals 与各插件的能力都经动作工具对外。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/protocol.ts](src/protocol.ts) | handleMcpMessage：协议处理 |
| [src/tool-catalog.ts](src/tool-catalog.ts) | 平台工具目录：7 个连接工具与受信管理入口的 initialize、event_decide、goal_tree_decide。插件与 Goals 能力都是动作工具，不在这里写死 |
| [src/tool-dispatch.ts](src/tool-dispatch.ts) | 项目工具分发 |
| [src/launcher-validation.ts](src/launcher-validation.ts) | 启动器验证 |

可对照现有调用方 [apps/local-host/src/mcp-server.ts](../local-host/src/mcp-server.ts) 阅读装配方式。

## 接入与边界

Session 身份来自 Host 上下文，不能把模型提交的参数直接当作身份。工具 schema 与响应适配属于这里；Goal 事件事实和完成效果属于 Goals，可信用户决定属于 Governance，UI 不另算完成。插件的对外能力就是它声明的动作，由 Local Host 按授权列入目录，不进本包静态目录。作者与 Host 改法见 [Plugin 开发 · 对外 MCP](../../docs/platform/PLUGIN-DEVELOPMENT.md#对外-mcp)。

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

## 开发要求

- 负责：MCP 工具 schema、受众划分与能力适配。
- 不负责：业务规则、直接访问 Store、Runtime Skill 政策。
- 公开入口：`@molis-ai/molis-work-app-mcp`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/app-host`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-goals`。方向：apps → 组合根 → 公开合同（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - Runtime 与 Session 身份由 Host 写入，工具参数不能自填用户、批准或身份。
  - 平台工具只有连接工具与受信管理入口的工具；其余能力都是动作工具，不进本包的静态目录，也不按名称写 `if`。
  - 生产启动器走常驻服务通道，不回退到本地 typed Host。
  - 说明或恢复目录不可读时返回真实连接并把对应内容置 null、附错误字段；不伪报空项目、不自动重新绑定。
- 改动后必跑：`node scripts/run-tests.mjs tests/mcp-protocol.test.ts tests/mcp-action-grants.test.ts tests/mcp-action-settings.test.ts tests/action-mcp.test.ts tests/mcp-goal-events.test.ts`
- 相关手册：[docs/mcp.md](../../docs/mcp.md)、[specs/action-architecture/spec.md](../../specs/action-architecture/spec.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/cli-and-development.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/app-host`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-dv1`, `goal-reorg-dv2`, `goal-reorg-gw4`, `goal-reorg-ex4`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

连接工具的附带内容与公开动作共享精确授权：`context_resolve/bind/create_and_bind` 接受 Catalog 连接后，以同一客户端调用 `goals.guidance.read`、`goals.list`，必要时调用 `goals.directory.read` 恢复目录窗口外的焦点。生产 launcher 使用常驻服务通道，不能回退到本地 typed Host 读取。说明或恢复目录不可读时仍返回真实连接，对应内容为 null 并附 `project_guidance_error`/`resume_error`；不伪报空项目、不自动重新绑定。客户端或项目在等待期间改变则拒绝旧摘要。
