# 外部事件规范化事实

接收 Provider Adapter 生成的 SignalDraft，保存去重身份、内容修订和来源信息，供 Feed 等下游消费。

包名：`@molis-ai/molis-work-module-signals`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

Listener 将原始事件转换为 draft 后调用 commands.submitDraft；Signals 校验并持久化，返回 receipt。query.get/list 提供规范化事实，Listener 依据接收结果处理游标。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | SignalsModule、draft 接收、去重及查询 |

可对照现有调用方 [apps/local-host/src/feed-connector-sync.ts](../../apps/local-host/src/feed-connector-sync.ts) 阅读装配方式。

## 接入与边界

Signals 不请求 Provider、不持有凭据，也不决定消息是否已读或应成为 Goal。不同 Source 的事件身份不能混为同一事件。

由 Local Host 装配数据库与协作端口；跨 Module 协作使用公开 Contract，不从另一 Module 深层导入实现。完整依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-module-signals typecheck
pnpm --filter @molis-ai/molis-work-module-signals build
```

已有行为示例与回归：[feed-module-repositories.test.ts](../../tests/feed-module-repositories.test.ts)、[feed-receive-chain.test.ts](../../tests/feed-receive-chain.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/feed-module-repositories.test.ts tests/feed-receive-chain.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../docs/modules/signals.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/modules/signals`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-fd1`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
