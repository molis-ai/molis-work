# Functions 判断函数入口

写、试跑、发布判断函数，并配置 TypeSafe Key。函数库和一次判断记录在 `@molis-ai/molis-work-module-functions`。别人调 Module 合同，不 import 这个插件。

包名：`@molis-ai/molis-work-plugin-functions`。

## 一次典型调用

Host 把空舞台交给 UI contribution；HTTP 路由表拥有 `/api/functions` 匹配，Host 注入 SecretStore、TypeSafe provider 和行为名单。设置页只返回是否已配置，不回显 Key。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。

| 文件 | 用途 |
| --- | --- |
| [src/ui.ts](src/ui.ts) | 目录（空）与舞台 HTML |
| [src/mcp.ts](src/mcp.ts) | 对外 MCP：`mcp_exports` 与按 `tool_id` 的 handler |
| [src/settings-ui.ts](src/settings-ui.ts) | TypeSafe Key 设置页 |
| [src/store.ts](src/store.ts) | 转调 Module |
| [src/provider.ts](src/provider.ts) | TypeSafe SystemOne，由 Host 注入 |
| [src/routes.ts](src/routes.ts) | HTTP 路由表 |

## 接入与边界

不依赖 Goals / Artifacts 写入。Key 不进聊天供应商页。一函数一题。已发布函数经 Host 合成的 MCP 调用；插件只认 `tool_id`。函数页可列出「用在哪」；Inbox / 首页在已发布函数上打开当前项目，Feed 开关仍在捕捉规则。

工作区依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`、`@molis-ai/molis-work-module-functions`。

## 本地开发

```bash
pnpm --filter @molis-ai/molis-work-plugin-functions typecheck
pnpm --filter @molis-ai/molis-work-plugin-functions build
node --import tsx --test --test-concurrency=1 tests/functions-plugin.test.ts tests/functions-system-capability.test.ts
```

## 进一步阅读

- [架构与当前实现索引](../../../docs/SSOT-MATRIX.md)
- [判断成为系统能力](../../../specs/functions-system-capability/spec.md)
- [来源、去向与动作总表](../../../specs/functions-product-authoring/spec.md)
- [三栏解耦](../../../specs/functions-independent-authoring/spec.md)
- [Functions 垂直切片](../../../specs/functions-plugin/spec.md)

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`
