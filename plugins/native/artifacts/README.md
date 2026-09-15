# 交付物浏览与 Plugin 客户端

把 Artifact 事实展示为项目可引用、可浏览、可导出的交付物，并给 Plugin 提供受授权约束的读写客户端。

包名：`@molis-ai/molis-work-plugin-artifacts`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

readArtifactBrowser 读取浏览模型，UI contribution 渲染目录/版本；openArtifactProjectReference 解析项目引用。createPluginArtifactClient 在 Host context 下调用 Artifact 公开服务，publish/read 使用同一权限边界。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/browser.ts](src/browser.ts) | 浏览、版本与导出 |
| [src/project-reference.ts](src/project-reference.ts) | 项目引用打开 |
| [src/plugin-client.ts](src/plugin-client.ts) | Plugin Artifact 客户端 |
| [src/goal-context.ts](src/goal-context.ts) | 目标中的 Artifact 引用 |

可对照现有调用方 [apps/local-host/src/plugin-executor.ts](../../../apps/local-host/src/plugin-executor.ts) 阅读装配方式。

## 接入与边界

不复制 Artifact Store，不依赖生产者/消费者 Plugin 实现。引用精确版本；自定义 payload 没有兼容 renderer 时保留可读取的数据表达。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-plugin-artifacts typecheck
pnpm --filter @molis-ai/molis-work-plugin-artifacts build
```

已有行为示例与回归：[artifact-browser.test.ts](../../../tests/artifact-browser.test.ts)、[plugin-artifact-client.test.ts](../../../tests/plugin-artifact-client.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/artifact-browser.test.ts tests/plugin-artifact-client.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../../docs/modules/artifacts.md)
- [架构与当前实现索引](../../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-ar3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
