# GitHub 信息接入

提供 GitHub Provider、设备授权流程和账户呈现，将外部更新交给统一监听与 Signal 链路。

包名：`@molis-ai/molis-work-integration-github`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

createGithubIntegrationPlugin 通过 SDK 注册 Driver/Adapter，createGithubProvider 处理 Provider 请求。OAuth 使用注入的端口维护授权过程；Local Host 提供凭据存储和 HTTP 装配。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | Integration Manifest 与工厂 |
| [src/provider.ts](src/provider.ts) | GitHub Provider |
| [src/oauth.ts](src/oauth.ts) | 设备授权 |
| [src/account-presentation.ts](src/account-presentation.ts) | 账户展示 |

可对照现有调用方 [apps/local-host/src/official-integrations.ts](../../../apps/local-host/src/official-integrations.ts) 阅读装配方式。

## 接入与边界

Manifest 声明权限并不等于已经获得授权；实际 grant 与凭据由 Host 管理。本包不拥有 Feed 状态，也不以导入测试的通过声称真实 GitHub 账号已连通。

工作区依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-integration-github typecheck
pnpm --filter @molis-ai/molis-work-integration-github build
```

已有行为示例与回归：[github-device-flow.test.ts](../../../tests/github-device-flow.test.ts)、[feed-connectors.test.ts](../../../tests/feed-connectors.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/github-device-flow.test.ts tests/feed-connectors.test.ts
```

这些测试使用隔离数据或注入端口；Provider/桌面相关测试的通过不等于真实账户连接、安装或发布验收。

## 进一步阅读

- [职责与接入说明](../../../docs/platform/PLUGIN-DEVELOPMENT.md)
- [架构与当前实现索引](../../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-fd3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
