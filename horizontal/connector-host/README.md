# Provider 调用宿主

统一注册 Connector Driver、连接和健康状态，让同步调用得到技术 receipt，而不在 Host 中复制各 Provider 协议。

包名：`@molis-ai/molis-work-service-connector-host`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

ConnectorHost 注册 driver 后，test 检查健康，invoke 传入连接、游标和意图，返回原始事件及技术结果。具体网络请求由官方或自定义 Integration Provider 实现。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | ConnectorHost、连接/driver 注册与调用 |

可对照现有调用方 [apps/local-host/src/connector-source-pull.ts](../../apps/local-host/src/connector-source-pull.ts) 阅读装配方式。

## 接入与边界

本服务不拥有 Source 配置、正式 Signal、Feed 处置或用户凭据正文。timeout/driver missing 等调用错误不能转换成“业务同步成功”。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-service-connector-host typecheck
pnpm --filter @molis-ai/molis-work-service-connector-host build
```

已有行为示例与回归：[feed-receive-chain.test.ts](../../tests/feed-receive-chain.test.ts)。完成上述构建后运行：

```bash
node scripts/run-tests.mjs tests/feed-receive-chain.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

- 负责：Provider 连接、凭据引用、调用、健康状态与技术回执。
- 不负责：Source 期望状态、Signal/Feed/Action 事实、Provider 的业务规则。
- 公开入口：`@molis-ai/molis-work-service-connector-host`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/services/connector-host`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖合同与同目录适配端口；不决定业务状态（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 密钥正文只在安全适配器里出现。token 的规范化与格式校验由连接 owner 提供，授权暂存与正式保存复用它，错误输入不能成为待激活的凭据。
  - 超时、驱动缺失等调用错误不能转成“同步成功”。
  - 最近连通检查与业务调用分别由 `ConnectorObservationStore` 保存技术事实，绑定当时的连接修订；不存参数、返回正文或秘密，不将历史检查当作新的配置已连通。
  - 不把各 Provider 的协议复制进 Host。
- 改动后必跑：`node scripts/run-tests.mjs tests/feed-receive-chain.test.ts tests/plugin-runtime-integration.test.ts tests/connector-connections.test.ts`
- 相关手册：[docs/horizontal/connector-host.md](../../docs/horizontal/connector-host.md)、[skills/molis-plugin-dev/integrations.md](../../skills/molis-plugin-dev/integrations.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/horizontal/connector-host.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)


上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

FI-C-02：`test/invoke` 与 driver 的 `health/poll` 都显式接收本次 `ConnectorCallControl`（signal、异步 beforeEffect、同步 current）。控制经 SDK 实参传给 Provider，不存为 provider 的可变当前调用，也不序列化进 intent。Host 超时同时中止该控制；每次实际 HTTP 或刷新写回前认权，最后一次 await 后同步核对才发送或持久化。绑定通知只使确切槽的在途请求失效，保留账号修订检查和 close 等待。
