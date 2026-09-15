# 私人会话与工作上下文

保存 Session 身份、私人内容引用、恢复/handoff 状态及 Runtime 项目绑定语义，使会话能在正确项目中继续。

包名：`@molis-ai/molis-work-module-private-work-context`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

应用通常通过 Local Host 的 openWorkSessionRegistry 打开 Registry。直接装配 MolisWorkSessionRegistry.open 时必须提供 createLedger，并复用事务连接；跨模块关联交给 Ledger，私人内容仍由本模块维护。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/session-registry.ts](src/session-registry.ts) | Registry 与资源生命周期 |
| [src/content-store.ts](src/content-store.ts) | 加密内容引用 |
| [src/session-migration.ts](src/session-migration.ts) | 历史会话迁移 |
| [src/project-binding-commands.ts](src/project-binding-commands.ts) | 项目绑定命令 |

可对照现有调用方 [apps/local-host/src/session-registry.ts](../../apps/local-host/src/session-registry.ts) 阅读装配方式。

## 接入与边界

Session 不是 Execution Run；私人的恢复包不会自动发布为 Artifact 或 Team 内容。历史未知 Project/Goal revision 保持未知。环境变量解析和 Runtime 进程启动由 Host 完成。

由 Local Host 装配数据库与协作端口；跨 Module 协作使用公开 Contract，不从另一 Module 深层导入实现。完整依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-module-private-work-context typecheck
pnpm --filter @molis-ai/molis-work-module-private-work-context build
```

已有行为示例与回归：[private-work-context-module.test.ts](../../tests/private-work-context-module.test.ts)、[session-ledger-migration.test.ts](../../tests/session-ledger-migration.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/private-work-context-module.test.ts tests/session-ledger-migration.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../docs/modules/private-work-context.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/modules/private-work-context`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-wk1`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
