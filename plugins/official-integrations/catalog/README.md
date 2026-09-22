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
