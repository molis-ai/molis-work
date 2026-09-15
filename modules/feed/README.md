# 信息条目与处置状态

维护 Feed 条目的可见性、已读/归档和处置事实，让外部信息进入工作区后有稳定的后续状态。

包名：`@molis-ai/molis-work-module-feed`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

FeedModule.commands.ingest 接收条目，query 提供读取，setDisposition 等命令更新处置。Attention 经注入的公开 API 协作；Feed → Goal 关联通过 Context Ledger 端口维护。正文引用与导入收据也有独立存储入口。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | FeedModule 与迁移 |
| [src/goal-links.ts](src/goal-links.ts) | Feed/Goal 关联端口 |
| [src/content-store.ts](src/content-store.ts) | 正文引用存储 |
| [src/import-receipts.ts](src/import-receipts.ts) | 导入收据 |

可对照现有调用方 [apps/local-host/src/feed-application.ts](../../apps/local-host/src/feed-application.ts) 阅读装配方式。

## 接入与边界

Provider 同步和 HTTP/UI 组合归 Native Feed/Host。该 Module 不直接创建 Goal；linked_goal_id 等兼容输出由 Ledger 关联推导，不能恢复旧字段双写。

由 Local Host 装配数据库与协作端口；跨 Module 协作使用公开 Contract，不从另一 Module 深层导入实现。完整依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-module-feed typecheck
pnpm --filter @molis-ai/molis-work-module-feed build
```

已有行为示例与回归：[feed-module-repositories.test.ts](../../tests/feed-module-repositories.test.ts)、[feed-goal-query.test.ts](../../tests/feed-goal-query.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/feed-module-repositories.test.ts tests/feed-goal-query.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../docs/modules/feed.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/modules/feed`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-fd2`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
