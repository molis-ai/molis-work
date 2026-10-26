# 私人工作上下文

保存 Runtime 项目绑定语义：一个 Runtime 工作入口或工作目录属于哪个项目，使外部 Runtime 能在正确项目中继续。

包名：`@molis-ai/molis-work-module-private-work-context`。工作区内部包，通过仓库构建和 Host 装配使用。

Sessions 插件已下线（SC-4）：Session 身份、消息、内容引用、交接与会话目录的实现都已删除，本包只剩 Runtime 项目绑定。Sessions 重做见 `specs/BACKLOG.md` 的 BL-177。

## 一次典型调用

Host 在项目编目处调用 `createRuntimeContextModule`，在同一数据库连接里装配绑定、创建并绑定、拒绝建议与清理服务；跨模块关联交给 Context Ledger，本包不另建关系表。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/runtime-context-module.ts](src/runtime-context-module.ts) | 项目绑定、创建与清理服务的装配 |
| [src/project-binding-commands.ts](src/project-binding-commands.ts) | 项目绑定命令 |
| [src/runtime-binding-records.ts](src/runtime-binding-records.ts) | 绑定命令周围的读写：绑定与事件列表、目录成员关系、创建请求重放 |
| [src/project-resolution.ts](src/project-resolution.ts) | 把 Runtime 工作入口解析到已绑定的项目 |
| [src/context-binding-references.ts](src/context-binding-references.ts) | 绑定与项目之间的 Ledger 关系 |
| [src/context-bindings.ts](src/context-bindings.ts) | 绑定、建议与拒绝记录的表 |

## 接入与边界

由 Local Host 装配数据库与协作端口；跨 Module 协作使用公开 Contract，不从另一 Module 深层导入实现。完整依赖见 [package.json](package.json)。环境变量解析和 Runtime 进程启动由 Host 完成。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-module-private-work-context typecheck
pnpm --filter @molis-ai/molis-work-module-private-work-context build
```

已有行为示例与回归：[runtime-binding-ledger.test.ts](../../tests/runtime-binding-ledger.test.ts)、[runtime-context-entry.test.ts](../../tests/runtime-context-entry.test.ts)。完成上述构建后运行：

```bash
node scripts/run-tests.mjs tests/runtime-binding-ledger.test.ts tests/runtime-context-entry.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

- 负责：Runtime 工作入口与项目的绑定关系、建议与拒绝记录、绑定语义的错误码。
- 不负责：Session 与消息（已下线）、执行 Run、Goal、Artifact、Runtime 进程句柄。
- 公开入口：`@molis-ai/molis-work-module-private-work-context`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/modules/private-work-context`。
- 依赖：`@molis-ai/molis-work-contracts`；第三方依赖见 `package.json`。方向：只依赖 contracts/modules、contracts/services 与 kernel；不导入另一个 Module 的实现或 Store（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)）。
- 不变量：
  - Runtime 项目绑定由 `createRuntimeContextModule` 在同一连接内装配；Repository 不对包外导出，Host 只提供项目创建与补偿端口，并调用绑定、创建并绑定及清理服务。
  - 关系事实只存在 Context Ledger，不另建关系表；打开时必须提供 `createLedger` 并复用事务连接。
  - 项目关系缺失时拒绝（`work.context.project_relation_missing`），不猜测绑定。
  - 本包不打开 `<home>/sessions/`：那是已下线 Sessions 的旧存储，只由 Host 的存储登记（备份与卸载清理仍认得它）持有，删除要在备份副本上另做（SC-5）。
- 改动后必跑：`node scripts/run-tests.mjs tests/runtime-binding-ledger.test.ts tests/runtime-context-entry.test.ts tests/session-project-binding-router.test.ts tests/project-deletion-owners.test.ts`（构建后）。
- 相关手册：[docs/modules/private-work-context.md](../../docs/modules/private-work-context.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/modules/private-work-context.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/modules/private-work-context`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-wk1`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

绑定的错误使用 `work.context.*`；业务关系、动作 ID 和数据库文件名沿用各自合同。
