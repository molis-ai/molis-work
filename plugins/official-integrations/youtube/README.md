# YouTube 频道来源接入

为 YouTube Channel 来源提供频道标识、公开 Feed 地址与地址校验。

包名：`@molis-ai/molis-work-integration-youtube`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

Feed 经平台 sourcePull 的 vocabulary 规范化频道并登记来源；同步时 Host 调用本包生成 Feed 地址，再由受控来源拉取服务读取。Feed 拥有来源配置、游标、同步记录与接收结果。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | 频道工具的包根出口 |
| [src/channel.ts](src/channel.ts) | 频道来源处理 |

可对照现有调用方 [apps/local-host/src/source-pull-runtime.ts](../../../apps/local-host/src/source-pull-runtime.ts) 阅读装配方式。

## 接入与边界

Host 的 source-vocabulary、source-pull-intent 与 source-pull-runtime 使用本包。未接入的 Integration 工厂及其安装 Manifest 已移除；频道来源沿现有 SourcePull 合同工作，不安装第二套 Provider。

这是频道信息接入，不是视频下载、播放或媒体处理服务。网络授权和实际 Provider 生命周期由 Host 管理。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-integration-youtube typecheck
pnpm --filter @molis-ai/molis-work-integration-youtube build
```

来源同步公共链路与实际频道注册/拉取回归（网络使用注入响应，不证明公网可达）：[feed-runtime-plugin.test.ts](../../../tests/feed-runtime-plugin.test.ts)。完成上述构建后运行：

```bash
node scripts/run-tests.mjs tests/feed-sources.test.ts tests/feed-runtime-plugin.test.ts tests/security-invariants-plugin-source-pull.test.ts tests/npm-package.test.ts
```

这些测试使用隔离数据或注入端口；Provider/桌面相关测试的通过不等于真实账户连接、安装或发布验收。

## 开发要求

- 负责：YouTube 频道来源的地址与频道解析。
- 不负责：Source/Signal/Feed 事实、通用媒体客户端。
- 公开入口：`@molis-ai/molis-work-integration-youtube`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖合同；频道标识规则留在本包（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 频道更新交给统一信息流，本包不拥有其状态。
  - 网络读取与权限由平台 SourcePull 执行，本包不拥有同步状态或安装生命周期。
- 改动后必跑：上方来源、Runtime、权限与实际 npm 产物回归。
- 相关手册：[skills/molis-plugin-dev/integrations.md](../../../skills/molis-plugin-dev/integrations.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../../docs/modules/sources.md)
- [架构与当前实现索引](../../../docs/SSOT-MATRIX.md)


上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
