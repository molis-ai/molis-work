# Gmail 信息接入

提供 Gmail OAuth、账户安装配置、历史游标与邮件 Provider，使授权邮件更新进入 Signal/Feed。

包名：`@molis-ai/molis-work-integration-gmail`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

createGmailIntegrationPlugin 注册 Provider/Adapter；OAuth 处理配置、pending state、回调和 token 生命周期，provider 读取邮件更新，history-cursor 处理历史位置。Host 注入网络和 Secret ports。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | Integration 公共入口 |
| [src/oauth.ts](src/oauth.ts) | 授权流程 |
| [src/oauth-types.ts](src/oauth-types.ts) | scope/回调与端口 |
| [src/provider.ts](src/provider.ts) | 邮件更新读取 |
| [src/history-cursor.ts](src/history-cursor.ts) | 历史游标 |

可对照现有调用方 [apps/local-host/src/official-integrations.ts](../../../apps/local-host/src/official-integrations.ts) 阅读装配方式。

## 接入与边界

默认 scope、授权回调和 refresh token 规则见 oauth-types/scope 的实际定义。凭据不能写进 Source 或 Signal 正文；游标失效与授权过期是不同恢复路径。

工作区依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-integration-gmail typecheck
pnpm --filter @molis-ai/molis-work-integration-gmail build
```

已有行为示例与回归：[gmail-oauth.test.ts](../../../tests/gmail-oauth.test.ts)、[feed-connectors.test.ts](../../../tests/feed-connectors.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/gmail-oauth.test.ts tests/feed-connectors.test.ts
```

这些测试使用隔离数据或注入端口；Provider/桌面相关测试的通过不等于真实账户连接、安装或发布验收。

## 进一步阅读

- [职责与接入说明](../../../docs/platform/PLUGIN-DEVELOPMENT.md)
- [架构与当前实现索引](../../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-fd3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
