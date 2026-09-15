# RSS 来源与正文接入

为目录来源和自定义 RSS 提供 Provider 接线、条件请求状态与正文处理，使公开订阅进入统一信息流。

包名：`@molis-ai/molis-work-integration-rss`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

createRssIntegrationPlugin 接收 Provider port 并注册轮询贡献；catalog/custom-rss 提供来源定义，http-state 维护 HTTP 读取状态，feed-body 处理正文。Local Host 组合实际的读取适配。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | Integration 工厂 |
| [src/catalog.ts](src/catalog.ts) | 来源目录 |
| [src/custom-rss.ts](src/custom-rss.ts) | 自定义订阅 |
| [src/http-state.ts](src/http-state.ts) | HTTP 状态 |
| [src/feed-body.ts](src/feed-body.ts) | 正文读取 |

可对照现有调用方 [apps/local-host/src/feed-source-runtime.ts](../../../apps/local-host/src/feed-source-runtime.ts) 阅读装配方式。

## 接入与边界

当前 Host 实际使用本包的来源/传输辅助函数；上文 Integration 工厂已导出，但尚无生产调用方。不能把工厂存在视为已通过 Plugin Runtime 接入。

这里只处理 RSS 接入，不建立第二套 Feed/Source 状态。网络可达性和站点内容由实际运行决定；测试中的响应 fixture 不代表所有订阅源在线。

工作区依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-integration-rss typecheck
pnpm --filter @molis-ai/molis-work-integration-rss build
```

已有行为示例与回归：[feed-sources.test.ts](../../../tests/feed-sources.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/feed-sources.test.ts
```

这些测试使用隔离数据或注入端口；Provider/桌面相关测试的通过不等于真实账户连接、安装或发布验收。

## 进一步阅读

- [职责与接入说明](../../../docs/modules/sources.md)
- [架构与当前实现索引](../../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-fd3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
