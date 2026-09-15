# Provider 调用宿主

统一注册 Connector Driver、连接和健康状态，让同步调用得到技术 receipt，而不在 Host 中复制各 Provider 协议。

包名：`@molis-ai/molis-work-service-connector-host`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

ConnectorHost 注册 driver 后，test 检查健康，invoke 传入连接、游标和意图，返回原始事件及技术结果。具体网络请求由官方或自定义 Integration Provider 实现。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | ConnectorHost、连接/driver 注册与调用 |

可对照现有调用方 [apps/local-host/src/feed-connector-sync.ts](../../apps/local-host/src/feed-connector-sync.ts) 阅读装配方式。

## 接入与边界

本服务不拥有 Source 配置、正式 Signal、Feed 处置或用户凭据正文。timeout/driver missing 等调用错误不能转换成“业务同步成功”。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-service-connector-host typecheck
pnpm --filter @molis-ai/molis-work-service-connector-host build
```

已有行为示例与回归：[feed-receive-chain.test.ts](../../tests/feed-receive-chain.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/feed-receive-chain.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../docs/horizontal/connector-host.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/services/connector-host`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-fd1`, `goal-reorg-fd3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
