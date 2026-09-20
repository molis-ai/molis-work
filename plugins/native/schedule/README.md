# Schedule 闹钟入口

列出已登记的定时任务、下次叫醒时间和上次收据，并提供暂停 / 恢复。插件自己不执行业务。

包名：`@molis-ai/molis-work-plugin-schedule`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

Host 把 job 记录交给 UI contribution；HTTP 路由表拥有 `/api/schedule` 匹配，Host 注入 list / setEnabled。登记走 Host Capability `schedule.register`，不走这个插件的 HTTP。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/ui.ts](src/ui.ts) | 列表与详情 HTML |
| [src/routes.ts](src/routes.ts) | HTTP 路由表 |
| [src/route-handlers.ts](src/route-handlers.ts) | 列表与暂停用例 |
| [src/client.ts](src/client.ts) | 工作台选择与暂停 |

可对照现有调用方 [apps/workbench/src/schedule-projection-ui.ts](../../../apps/workbench/src/schedule-projection-ui.ts) 与 [apps/local-host/src/schedule-native-plugin-http.ts](../../../apps/local-host/src/schedule-native-plugin-http.ts)。

## 接入与边界

不消费 Feed / Goals 事实。不接受用户手写任务。叫醒由横向 Scheduler 完成。

工作区依赖：`@molis-ai/molis-work-contracts`。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-plugin-schedule typecheck
pnpm --filter @molis-ai/molis-work-plugin-schedule build
```

已有行为示例与回归：[schedule-plugin.test.ts](../../../tests/schedule-plugin.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test tests/schedule-plugin.test.ts
```

## 进一步阅读

- [架构与当前实现索引](../../../docs/SSOT-MATRIX.md)
- [定时任务插件需求](../../../specs/schedule-plugin/spec.md)

- Status: `partial`
- SSOT: `docs/SSOT-MATRIX.md`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration Goals: `goal-reorg-f2`
