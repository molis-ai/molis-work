# Plugin 作者接口

帮助 Plugin 作者声明 Manifest、生命周期和 UI/Artifact 接口，用公共协议对接 Molis Work。

包名：`@molis-ai/molis-work-plugin-sdk`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

definePlugin 校验定义；definePollingIntegrationPlugin 把 Provider port 组合成 Connector Driver 与 Raw Event → Signal Adapter。Host 通过 context.services 提供私人存储、Artifact 和 UI 客户端，作者不需要访问数据库。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | definePlugin、轮询 Integration helper 与公开类型 |

可对照现有调用方 [examples/plugin-sample/index.mjs](../../examples/plugin-sample/index.mjs) 阅读装配方式。

## 接入与边界

SDK 不包含 Runtime 或业务 Store。Manifest 解析委托 Contracts；授权的实际执行由 Host/Runtime 控制。当前工作区包是 private，不能把包名当作已经发布到 npm 的承诺。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

可从[本地 Plugin 示例](../../examples/plugin-sample/README.md)开始：示例使用 context.services 存取私人状态、发布 Artifact 并注册 UI，完整授权和开发步骤见开发指南。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-plugin-sdk typecheck
pnpm --filter @molis-ai/molis-work-plugin-sdk build
```

已有行为示例与回归：[plugin-authoring.test.ts](../../tests/plugin-authoring.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/plugin-authoring.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../docs/platform/PLUGIN-DEVELOPMENT.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-fd3`, `goal-reorg-dv3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
