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
| [src/client-lifecycle.ts](src/client-lifecycle.ts) | 浏览器挂载、取消及资源释放，由 Host 注入 |

可对照现有调用方 [apps/local-host/src/plugin-executor.ts](../../apps/local-host/src/plugin-executor.ts) 阅读装配方式。

## 接入与边界

UI Host 不解释 Goal、Feed 或 Artifact 状态。Plugin 客户端的注册释放由 Host 生命周期负责；注册/渲染协议不等于任意 HTML 或脚本都获得隔离执行。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 浏览器生命周期

浏览器 Host 每页实例化一次 `UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT`，向原生插件 factory 注入 `mountPluginClient(root)`。同一根节点重复挂载返回 null；插件必须停止第二次初始化。scope 在 DOM 移除或页面离开时取消请求并释放资源，BFCache 隐藏时暂停可见性资源，恢复时重新读取。

`listen`、`timeout/clearTimeout`、`frame/cancelFrame/nextFrame`、`observe`、`own` 和可取消的 `delay` 归挂载生命周期；`whenVisible(signal => cleanup)` 和 `poll(read, delay, onError)` 归可见性生命周期。隐藏由文档 visibility 与根节点祖先的 `hidden` 合同确定；Host 不把业务内容是否为空当作可见性。

请求通过 `scope.fetch` 传递卸载信号；读完 response body 后必须 `scope.assertCurrent(signal)`，再修改状态。可见性查询使用 `whenVisible` 的 signal，写命令保持挂载 signal，离开页面不代表取消服务端任务，更不允许自动重试。SSE 在 `whenVisible` 的 cleanup 里关闭，恢复时先读取服务端状态。产品错误提示和幂等键仍由插件拥有。

已接入 Images、Coding 及子面板、Files/Git 伴随面板和独立 Diff/Text Stats、Host 审查视图、Builder 创作台/Studio 及其记录组件、Shelf 及结果面板。同源 iframe 同时观察外层页面的隐藏和移除，避免父视图已离开、内部订阅仍保留。

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

## 开发要求

- 负责：UI 贡献、Slot、嵌入、隔离与宿主桥。
- 不负责：插件产品行为、Module 业务事实。
- 公开入口：`@molis-ai/molis-work-ui-host`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/ui`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：平台包只依赖 contracts/platform 与更低层平台包（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 挂载前检查 surface 与目标 slot 兼容、身份与格式。
  - 注册与渲染协议不等于任意 HTML 或脚本获得隔离执行。
  - 插件客户端的注册释放由 Host 生命周期负责；不解释 Goal、Feed、Artifact 状态。
- 改动后必跑：`node scripts/run-tests.mjs tests/workbench-ui-platform.test.ts tests/plugin-host-executor.test.ts tests/plugin-declarative-mounting.test.ts tests/ui-client-lifecycle.e2e.test.ts`
- 相关手册：[docs/platform/UI-PLATFORM.md](../../docs/platform/UI-PLATFORM.md)、[skills/molis-plugin-dev/ui.md](../../skills/molis-plugin-dev/ui.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/platform/UI-PLATFORM.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/ui`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-fd4`, `goal-reorg-ap3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
