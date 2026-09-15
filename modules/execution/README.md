# 历史领取与运行记录

读取既有 Claim、Run、尝试和租约记录，保留其原始身份、状态与时间，供历史正文、快照、数据升级和项目删除保护使用。

包名：`@molis-ai/molis-work-module-execution`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

Host 装配 `ExecutionModule.query`，历史读者按原始 ID 查找 Claim/Run，项目删除入口查询历史活动记录。纯读取场景可使用 `createExecutionQueryApi`。当前 Goal 工作通过事件入口记录，不再创建 Claim 或 Run。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | ExecutionModule 与只读 API |
| [src/repository.ts](src/repository.ts) | 原始 Claim/Run 查询、表结构与映射 |
| [src/migrations.ts](src/migrations.ts) | 历史执行数据升级 |

可对照现有调用方 [apps/local-host/src/goal-project-application.ts](../../apps/local-host/src/goal-project-application.ts) 阅读装配方式。

## 接入与边界

本模块不提供旧领取、运行报告或完成写入口，也不推导当前 Goal 的可执行动作。旧 Run 的终止状态仍按历史保存；当前 Goal 状态由 Goals 事件事实决定。真实 Runtime Session、终端与进程服务属于 Host。

由 Local Host 装配数据库与协作端口；跨 Module 协作使用公开 Contract，不从另一 Module 深层导入实现。完整依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-module-execution typecheck
pnpm --filter @molis-ai/molis-work-module-execution build
```

历史升级与原始记录保留可参考 [goal-event-migration.test.ts](../../tests/goal-event-migration.test.ts)，真实 Host 资源生命周期可参考 [host-entry-consistency.test.ts](../../tests/host-entry-consistency.test.ts)。完成仓库构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/goal-event-migration.test.ts tests/host-entry-consistency.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../docs/modules/execution.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/modules/execution`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-ex1`, `goal-reorg-ex4`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
