# Web Query 接入定义

提供可注入 Provider 的 Web Query Integration 工厂，用于适配统一 Connector/Listener/Signal 协议。

包名：`@molis-ai/molis-work-integration-web-query`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

createWebQueryIntegrationPlugin({ provider, now }) 调用 SDK 的轮询 helper；启动时要求 network:web-query grant，然后使用传入的 IntegrationProviderPort。Manifest 声明 connector、signal adapter 和设置 contribution。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | Manifest、权限声明与 Provider 接线 |

## 接入与边界

本包有实际工厂，但当前生产 Host 尚未调用它。现有网页查询走 [feed-source-runtime.ts](../../../apps/local-host/src/feed-source-runtime.ts) 的 AnySearch/Search Runtime 路径。这里没有自带搜索引擎或抓取实现；使用工厂时须自行提供 Provider 和 Host 授权上下文。

工作区依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-integration-web-query typecheck
pnpm --filter @molis-ai/molis-work-integration-web-query build
```

可参考 SDK/Runtime 公共链路的回归（该文件主要覆盖 GitHub Integration，并非本工厂的专项测试）：[plugin-runtime-integration.test.ts](../../../tests/plugin-runtime-integration.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/plugin-runtime-integration.test.ts
```

这些测试使用隔离数据或注入端口；Provider/桌面相关测试的通过不等于真实账户连接、安装或发布验收。

## 进一步阅读

- [职责与接入说明](../../../docs/platform/PLUGIN-DEVELOPMENT.md)
- [架构与当前实现索引](../../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-fd3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
