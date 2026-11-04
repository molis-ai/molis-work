# Connector Catalog

其余官方账号连接的只读协议：令牌解析、identity / list API、whoami。Host 按 connector id 装配，不按服务建空包。


包名：`@molis-ai/molis-work-integration-catalog`。

## 一次典型调用

`createCatalogProvider({ connectorId, resolveToken })` 做 health 与 sync；`catalogWhoami` 只在设置页或显式动作时打 identity。OAuth 连接的授权、检查与读账号不调这里的代码：Host 只读 Manifest 里的 `oauth` 声明（`catalogOAuthMethod(id)` 给测试和对照用）。Feed 与行为总表由 Host 接入。

Jira/Confluence token 站点只接受 HTTPS 的 `*.atlassian.net` 根地址（也接受不带协议的主机名），Salesforce 只接受当前 Host 使用的 HTTPS `*.salesforce.com` 实例根地址；拒绝凭据、端口、路径、query、fragment 和近似域名，再构造 identity/list 请求。Atlassian OAuth 保留 Host 当前产生的 `api.atlassian.com/ex/<服务>/<cloud_id>`，但 base 必须与服务和 cloud id 精确相符。共用 [src/targets.ts](src/targets.ts)，health/sync/whoami 都经过它。

HTTP 200 的业务失败只映射封闭错误类型与固定恢复说明；远端 `error`、`errmsg`、`msg`、GraphQL errors 原话不会进入 Connector/Listener 的回执与 Feed 日志。已知认证码仍要求重新连接，HTTP 429 保留重试时间；不靠 secret 字符串正则识别和删减远端原话。

`readExternalDocument({ source, url }, { token, fetch? })` 显式读取 Notion、飞书、Lark 或 Google Docs 的正文快照，返回标题、正文、来源与格式限制提示。只请求所选供应商的固定官方 API；凭据由 Host 注入，不在这里保存。本包不创建 Artifact，版本与去重由 [Artifacts Plugin](../../../docs/modules/artifacts.md#从文档工具导入) 编排。飞书与 Lark 使用独立连接器凭据和各自 API 域名。

文档读取接受可信 `signal` / `beforeDispatch`，每次 API 请求前复查，包括元信息、正文和获取应用令牌。30 秒总时限覆盖异步派出检查，取消原因原样抛出，不伪装成网络错误或触发凭据刷新；超限、失败和取消释放响应流。账号身份及提交校验由 Host 负责。

## 从哪里读代码

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | 公共入口与动态 Integration Manifest |
| [src/catalog.ts](src/catalog.ts) | 各家官方 API 目录 |
| [src/provider.ts](src/provider.ts) | health / poll |
| [src/http.ts](src/http.ts) | 请求与失败分类 |
| [src/document-import.ts](src/document-import.ts) | 单文档 URL 校验、官方正文 API、大小与完整性检查 |

## 本地开发

```bash
pnpm --filter @molis-ai/molis-work-integration-catalog typecheck
pnpm --filter @molis-ai/molis-work-integration-catalog build
```

## 开发要求

- 负责：其余官方账号连接的只读协议：令牌解析、身份与列表 API、whoami；37 个服务的 OAuth 方法声明（[src/oauth-methods.ts](src/oauth-methods.ts) 的 `CATALOG_OAUTH_METHODS`，写进 Manifest 的 `auth.methods`，由 Host 的解释器读，W5-11 第 4 片）；远程 MCP 配置在 [src/mcp-methods.ts](src/mcp-methods.ts)，写入所属服务的同一方法声明，目录、接入与调用由 Host 共用解释。
- 不负责：Source/Signal/Feed 事实、密钥持久化、宿主业务决定。
- 公开入口：`@molis-ai/molis-work-integration-catalog`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`。方向：只依赖合同与 plugin SDK；Provider 协议留在本包（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 只读；`catalogWhoami` 只在设置页或显式动作时调用。
  - Host 按 connector id 装配，不按服务建空包。
- 改动后必跑：`node scripts/run-tests.mjs tests/catalog-connectors.test.ts tests/catalog-trust-boundaries.test.ts tests/connector-method-directory.test.ts tests/connector-oauth-choice.test.ts tests/connector-oauth-declarations.test.ts tests/connector-provider-contracts.test.ts`
- 文档读取额外验证：`node scripts/run-tests.mjs tests/document-import-providers.test.ts tests/connector-document-import.test.ts`
- 相关手册：[skills/molis-plugin-dev/integrations.md](../../../skills/molis-plugin-dev/integrations.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
