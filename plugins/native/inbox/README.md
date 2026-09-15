# Inbox 注意力入口

把需要介入的 Attention 引用展示为独立 Inbox 目录与详情，并提供完成 / 忽略。

包名：`@molis-ai/molis-work-plugin-inbox`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

Host 把 Attention 条目和关联对象的展示信息交给 UI contribution；HTTP 路由表拥有 `/api/inbox` 匹配，Host 注入 list / get / setStatus。插件不读 Feed 或 Goals 表，也不复制原文。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/ui.ts](src/ui.ts) | 目录与详情 HTML |
| [src/projection.ts](src/projection.ts) | Attention 记录到展示模型 |
| [src/routes.ts](src/routes.ts) | HTTP 路由表 |
| [src/route-handlers.ts](src/route-handlers.ts) | 列表与状态用例 |

可对照现有调用方 [apps/workbench/src/inbox-projection-ui.ts](../../../apps/workbench/src/inbox-projection-ui.ts) 与 [apps/local-host/src/inbox-native-plugin-http.ts](../../../apps/local-host/src/inbox-native-plugin-http.ts)。

## 接入与边界

不依赖 Feed / Goals 插件实现。关联对象标题由 Host 解析后传入。完成 / 忽略只改 Attention 状态，不删除原 Feed Item、Goal 或来源。

工作区依赖：`@molis-ai/molis-work-contracts`。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-plugin-inbox typecheck
pnpm --filter @molis-ai/molis-work-plugin-inbox build
```

已有行为示例与回归：[inbox-native-plugin.test.ts](../../../tests/inbox-native-plugin.test.ts)、[inbox-plugin.test.ts](../../../tests/inbox-plugin.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test tests/inbox-native-plugin.test.ts tests/inbox-plugin.test.ts
```

## 进一步阅读

- [架构与当前实现索引](../../../docs/SSOT-MATRIX.md)
- [Inbox / Feed 拆插件需求](../../../specs/inbox-feed-plugin-split/spec.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration Goals: `goal-reorg-f2`
