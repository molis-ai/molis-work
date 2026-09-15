# 公共类型与协议

让 Module、Host、Plugin 和 App 通过一致的输入输出协作。这里提供真实的公共类型、schema 和解析规则，而不是功能实现。

包名：`@molis-ai/molis-work-contracts`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

调用方按领域子路径导入，例如 @molis-ai/molis-work-contracts/modules/goals 或 /platform/plugin。Plugin Manifest 的 parsePluginManifest 在此定义，SDK 和工具共享解析规则；具体命令执行交给对应 owner。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/modules/goals.ts](src/modules/goals.ts) | 目标 Command/Query 契约 |
| [src/platform/plugin.ts](src/platform/plugin.ts) | Plugin Manifest 与运行协议 |
| [src/platform/app-host.ts](src/platform/app-host.ts) | Host Client 与 capability 契约 |
| [package.json](package.json) | 完整公共 exports |

可对照现有调用方 [apps/local-host/src/local-host.ts](../../apps/local-host/src/local-host.ts) 阅读装配方式。

## 接入与边界

当前保留 30 个公共子路径，其中部分表达未来能力；存在类型不代表已有服务。无数据库或网络依赖，根导出也不是所有业务类型的大集合。

工作区依赖：无。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-contracts typecheck
pnpm --filter @molis-ai/molis-work-contracts build
```

已有行为示例与回归：[plugin-authoring.test.ts](../../tests/plugin-authoring.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/plugin-authoring.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../docs/system/PACKAGE-BOUNDARIES.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `contract-only`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/package`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-f3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
