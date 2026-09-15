# 持久同步进度与事件投递

保存监听游标、租约、投递尝试和运行收据，使进程中断后能恢复尚未处理的事件。

包名：`@molis-ai/molis-work-service-listener-host`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

ListenerHost.run 经 Connector 取得 Raw Event，再调用 Integration Adapter 生成 SignalDraft；Signals 接受后才推进游标。未完成投递保留在库中，同一来源的有效租约阻止重复消费，多次转换失败进入隔离状态。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | ListenerHost、迁移、checkpoint 和 Run 恢复 |

可对照现有调用方 [apps/local-host/src/feed-application.ts](../../apps/local-host/src/feed-application.ts) 阅读装配方式。

## 接入与边界

装配时须在 Sources 初始化后调用 migrateListenerHost；旧 Feed migration 编号不能证明 Listener 表已存在。Native Feed 负责来源调度用例，Host 管 timer 生命周期；通用 Scheduler 仍是未来设计。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-service-listener-host typecheck
pnpm --filter @molis-ai/molis-work-service-listener-host build
```

已有行为示例与回归：[feed-receive-chain.test.ts](../../tests/feed-receive-chain.test.ts)、[feed-upgrade.test.ts](../../tests/feed-upgrade.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/feed-receive-chain.test.ts tests/feed-upgrade.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../docs/horizontal/listener-host.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/services/listener-host`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-fd1`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
