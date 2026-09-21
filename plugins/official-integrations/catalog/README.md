# Connector Catalog

其余官方账号连接的只读协议：令牌解析、identity / list API、whoami。Host 按 connector id 装配，不按服务建空包。

包名：`@molis-ai/molis-work-integration-catalog`。

## 一次典型调用

`createCatalogProvider({ connectorId, resolveToken })` 做 health 与 sync；`catalogWhoami` 只在设置页或显式动作时打 identity。Feed 与行为总表由 Host 接入。

## 从哪里读代码

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | 公共入口与动态 Integration Manifest |
| [src/catalog.ts](src/catalog.ts) | 各家官方 API 目录 |
| [src/provider.ts](src/provider.ts) | health / poll |
| [src/http.ts](src/http.ts) | 请求与失败分类 |

## 本地开发

```bash
pnpm --filter @molis-ai/molis-work-integration-catalog typecheck
pnpm --filter @molis-ai/molis-work-integration-catalog build
```
