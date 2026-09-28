# Connector Catalog

其余官方账号连接的只读协议：令牌解析、identity / list API、whoami。Host 按 connector id 装配，不按服务建空包。

Status: `partial`。Contract：`@molis-ai/molis-work-contracts/platform/plugin`。迁移目标：`goal-reorg-f2`、`goal-reorg-fd3`。

包名：`@molis-ai/molis-work-integration-catalog`。

## 一次典型调用

`createCatalogProvider({ connectorId, resolveToken })` 做 health 与 sync；`catalogWhoami` 只在设置页或显式动作时打 identity。Feed 与行为总表由 Host 接入。

`readExternalDocument({ source, url }, { token, fetch? })` 显式读取 Notion、飞书、Lark 或 Google Docs 的正文快照，返回标题、正文、来源与格式限制提示。只请求所选供应商的固定官方 API；凭据由 Host 注入，不在这里保存。本包不创建 Artifact，版本与去重由 [Artifacts Plugin](../../native/artifacts/README.md#从文档工具导入) 编排。飞书与 Lark 使用独立连接器凭据和各自 API 域名。

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

- 负责：其余官方账号连接的只读协议：令牌解析、身份与列表 API、whoami。
- 不负责：Source/Signal/Feed 事实、密钥持久化、宿主业务决定。
- 公开入口：`@molis-ai/molis-work-integration-catalog`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`。方向：只依赖合同与 plugin SDK；Provider 协议留在本包（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 只读；`catalogWhoami` 只在设置页或显式动作时调用。
  - Host 按 connector id 装配，不按服务建空包。
- 改动后必跑：`node scripts/run-tests.mjs tests/catalog-connectors.test.ts tests/connector-method-directory.test.ts tests/connector-oauth-choice.test.ts`
- 相关手册：[skills/molis-plugin-dev/integrations.md](../../../skills/molis-plugin-dev/integrations.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
