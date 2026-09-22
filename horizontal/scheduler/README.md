# 到点叫醒已登记的 Capability

保存闹钟、租约和叫醒收据。到点只打一枪；once / interval 由 Schedule 插件的 job 模型解释。它不执行业务。

包名：`@molis-ai/molis-work-service-scheduler`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

Owner 经 Host Capability `schedule.register` 挂一条 job，并事先把唤醒 handler 放进 `PluginWakeupIndex`。Host timer 调用 `ScheduleService.tick`；到期后 index 按 `plugin_id + capability_id` 叫醒，写入收据，再计算下一次 `next_due_at`。漏打的 interval 合并成一次叫醒。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | 表迁移、WakeupIndex、ScheduleService、Capability 注册 |

可对照现有调用方 [apps/local-host/src/schedule-runtime.ts](../../apps/local-host/src/schedule-runtime.ts)。

## 接入与边界

不拥有 cron 表达式、Automation rule、Feed 来源意图或 Action 参数。插件不能替别人登记：Host 在 invoke 时覆盖 `plugin_id`。未注册 handler 的 capability 不能挂闹钟。

工作区依赖：`@molis-ai/molis-work-contracts`。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-service-scheduler typecheck
pnpm --filter @molis-ai/molis-work-service-scheduler build
```

已有行为示例与回归：[scheduler.test.ts](../../tests/scheduler.test.ts)、[schedule-plugin.test.ts](../../tests/schedule-plugin.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/scheduler.test.ts tests/schedule-plugin.test.ts
```

## 进一步阅读

- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)
- [Scheduler 服务说明](../../docs/horizontal/scheduler.md)
- [定时任务插件需求](../../specs/archive/schedule-plugin/spec.md)

- Status: `partial`
- SSOT: `docs/SSOT-MATRIX.md`
- Contract: `@molis-ai/molis-work-contracts/services/scheduler`
- Migration Goals: `goal-reorg-f2`
