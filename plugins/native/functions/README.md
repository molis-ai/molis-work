# Functions 判断函数入口

用 TypeSafe 的 Jev 写本机判断函数：Noul / Choice / Score，试跑后发布，工作台 Agent 可调用。TypeSafe Key 留在这台机器。

包名：`@molis-ai/molis-work-plugin-functions`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

Host 把空舞台交给 UI contribution；HTTP 路由表拥有 `/api/functions` 匹配，Host 注入 SecretStore 与 TypeSafe provider。设置页只返回是否已配置，不回显 Key。插件不写项目 Goal，也不发布 Artifact。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。

| 文件 | 用途 |
| --- | --- |
| [src/ui.ts](src/ui.ts) | 目录（空）与舞台 HTML |
| [src/settings-ui.ts](src/settings-ui.ts) | TypeSafe Key 设置页 |
| [src/store.ts](src/store.ts) | 本机 `{home}/functions/functions.db` |
| [src/provider.ts](src/provider.ts) | TypeSafe SystemOne |
| [src/routes.ts](src/routes.ts) | HTTP 路由表 |

可对照 [apps/workbench/src/goals-page-renderer.ts](../../../apps/workbench/src/goals-page-renderer.ts) 与 [apps/local-host/src/functions-native-plugin-http.ts](../../../apps/local-host/src/functions-native-plugin-http.ts)。

## 接入与边界

不依赖 Goals / Artifacts 写入。Key 不进聊天供应商页。一函数一题。已发布函数经 MCP `functions_list` / `describe` / `invoke` 调用。

工作区依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`。

## 本地开发

```bash
pnpm --filter @molis-ai/molis-work-plugin-functions typecheck
pnpm --filter @molis-ai/molis-work-plugin-functions build
node --import tsx --test --test-concurrency=1 tests/functions-plugin.test.ts
```

## 进一步阅读

- [架构与当前实现索引](../../../docs/SSOT-MATRIX.md)
- [Functions 垂直切片](../../../specs/functions-plugin/spec.md)
- [可写可调](../../../specs/functions-write-and-invoke/spec.md)

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`
