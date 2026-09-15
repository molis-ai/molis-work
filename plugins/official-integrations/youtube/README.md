# YouTube 频道来源接入

为 YouTube Channel 来源提供地址/频道处理与轮询 Integration 接线，把频道更新交给统一信息流。

包名：`@molis-ai/molis-work-integration-youtube`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

createYoutubeIntegrationPlugin 注册注入的 Provider；channel 中的辅助函数处理频道来源，返回内容由 SDK Adapter 转成 SignalDraft，经 Listener/Signals 接收。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | Manifest 与 Integration 工厂 |
| [src/channel.ts](src/channel.ts) | 频道来源处理 |

可对照现有调用方 [apps/local-host/src/feed-source-runtime.ts](../../../apps/local-host/src/feed-source-runtime.ts) 阅读装配方式。

## 接入与边界

当前 Host 实际使用本包的来源/传输辅助函数；上文 Integration 工厂已导出，但尚无生产调用方。不能把工厂存在视为已通过 Plugin Runtime 接入。

这是频道信息接入，不是视频下载、播放或媒体处理服务。网络授权和实际 Provider 生命周期由 Host 管理。

工作区依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-integration-youtube typecheck
pnpm --filter @molis-ai/molis-work-integration-youtube build
```

来源同步公共链路回归（不覆盖本包工厂或真实频道端到端接入）：[feed-sources.test.ts](../../../tests/feed-sources.test.ts)。完成上述构建后运行：

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
