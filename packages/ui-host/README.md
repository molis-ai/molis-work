# UI 扩展注册与装载

让 Workbench 按 contribution 和 slot 组合 Plugin 界面，并在注册与挂载时检查身份和格式。

包名：`@molis-ai/molis-work-ui-host`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

UiHost.register 保存 contribution，render 调用对应渲染器；mount 检查 surface 与目标 slot 的兼容性。createPluginUiClient 为 Plugin 提供受权限约束的注册接口。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | UiHost 注册、渲染与挂载 |
| [src/plugin-client.ts](src/plugin-client.ts) | Plugin UI 访问边界 |

可对照现有调用方 [apps/local-host/src/plugin-executor.ts](../../apps/local-host/src/plugin-executor.ts) 阅读装配方式。

## 接入与边界

UI Host 不解释 Goal、Feed 或 Artifact 状态。Plugin 客户端的注册释放由 Host 生命周期负责；注册/渲染协议不等于任意 HTML 或脚本都获得隔离执行。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-ui-host typecheck
pnpm --filter @molis-ai/molis-work-ui-host build
```

已有行为示例与回归：[workbench-ui-platform.test.ts](../../tests/workbench-ui-platform.test.ts)、[plugin-host-executor.test.ts](../../tests/plugin-host-executor.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/workbench-ui-platform.test.ts tests/plugin-host-executor.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../docs/platform/UI-PLATFORM.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/ui`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-fd4`, `goal-reorg-ap3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
