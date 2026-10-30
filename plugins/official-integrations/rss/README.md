# RSS 来源与正文接入

为目录来源和自定义 RSS 提供 Provider 接线、条件请求状态与正文处理，使公开订阅进入统一信息流。

包名：`@molis-ai/molis-work-integration-rss`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

createRssIntegrationPlugin 接收 Provider port 并注册轮询贡献；catalog/custom-rss 提供来源定义，http-state 维护 HTTP 读取状态，feed-body 处理正文。Local Host 组合实际的读取适配。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | Integration 工厂 |
| [src/catalog.ts](src/catalog.ts) | 来源目录 |
| [src/custom-rss.ts](src/custom-rss.ts) | 自定义订阅 |
| [src/http-state.ts](src/http-state.ts) | HTTP 状态 |
| [src/feed-body.ts](src/feed-body.ts) | 正文读取 |

可对照现有调用方 [apps/local-host/src/source-pull-runtime.ts](../../../apps/local-host/src/source-pull-runtime.ts) 阅读装配方式。

## 接入与边界

当前 Host 实际使用本包的来源/传输辅助函数；上文 Integration 工厂已导出，但尚无生产调用方。不能把工厂存在视为已通过 Plugin Runtime 接入。

这里只处理 RSS 接入，不建立第二套 Feed/Source 状态。网络可达性和站点内容由实际运行决定；测试中的响应 fixture 不代表所有订阅源在线。

自定义 RSS 每次请求及同域跳转先检查全部 DNS 答案，再将选定地址固定为实际 HTTPS lookup 的唯一结果；原域名仍用于 Host、SNI 和证书校验。读取与取消在本次连接范围内完成，成功、失败和跳转先释放 request/socket，再返回结果。条件头、304、两次同域跳转和 2 MB 正文上限保留；gzip/br/deflate 的解压后正文也受上限约束。地址政策仍是本包 [src/custom-rss.ts](src/custom-rss.ts)，`198.18.0.0/15` 的既有透明代理例外保持原样。

这条固定连接目前只支持直连及透明代理/TUN。若 Node 已通过 `NODE_USE_ENV_PROXY=1`、`--use-env-proxy` 或 `NODE_OPTIONS` 的有效启动设置启用环境代理，并配置了 HTTPS 代理（或 fetch 的 HTTP 代理回退），自定义 RSS 在 DNS/连接前返回配置错误及固定说明，不静默直连或回退普通 fetch。小写变量优先；仅设置变量而未启用时不触发拒绝。此限制包括配置了 `NO_PROXY` 的环境，本包不猜测或重写其路由语义。目录来源和 YouTube 仍用原 Host fetch，不受该自定义 RSS 限制；普通注入 fetch 也不能绕过自定义 RSS 的固定连接。

生产连接由 [src/pinned-request.ts](src/pinned-request.ts) 实现，使用 Node 内置 HTTPS，不引入 Sandbox 依赖、另一份地址规则、CONNECT/NO_PROXY 解析或网络守护进程。有效代理设置读取 Node HTTPS globalAgent 的公开 options.proxyEnv；Node 24 的具体启动方式由隔离子进程回归验证。

工作区依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-integration-rss typecheck
pnpm --filter @molis-ai/molis-work-integration-rss build
```

已有行为示例与回归：[feed-sources.test.ts](../../../tests/feed-sources.test.ts)。完成上述构建后运行：

```bash
node scripts/run-tests.mjs tests/feed-sources.test.ts
```

这些测试使用隔离数据或注入端口；Provider/桌面相关测试的通过不等于真实账户连接、安装或发布验收。

## 开发要求

- 负责：目录来源与自定义 RSS 的 Provider 适配、条件请求状态与正文处理。
- 不负责：Source/Signal/Feed 事实、通用 HTTP 平台。
- 公开入口：`@molis-ai/molis-work-integration-rss`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`；第三方依赖见 `package.json`。方向：只依赖合同与 plugin SDK；Provider 协议留在本包（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 状态变化归 Signals 与 Feed；外部正文是不可信输入。
  - 工厂存在不等于已经通过 Plugin Runtime 接入。
- 改动后必跑：`node scripts/run-tests.mjs tests/feed-sources.test.ts tests/feed-source-actions.test.ts tests/security-invariants-urls.test.ts tests/rss-socket.test.ts`。socket 用例需要 Node 24.5+ 与 OpenSSL，只在隔离进程和临时 CA/TLS/TCP 端点上运行；不是外网或真实订阅验收。
- 相关手册：[skills/molis-plugin-dev/integrations.md](../../../skills/molis-plugin-dev/integrations.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../../docs/modules/sources.md)
- [架构与当前实现索引](../../../docs/SSOT-MATRIX.md)


上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
