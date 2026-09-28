# Schedule 定时任务入口

列出人手创建的对话态定时任务、其他插件登记的闹钟，以及下次叫醒时间和上次收据。对话任务到点后在自己的对话里跑一轮只读 Agent。插件通用提醒由 Schedule 保存，到点由 Host 投递到 Inbox，无须打开 Builder 或运行插件代码。

包名：`@molis-ai/molis-work-plugin-schedule`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

Host 把任务和 job 记录交给 UI contribution；HTTP 路由表拥有 `/api/schedule` 匹配，Host 注入 list / create / setEnabled。其他插件登记仍走 Host Capability `schedule.register`。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/ui.ts](src/ui.ts) | 列表、对话详情、创建对话框 |
| [src/tasks.ts](src/tasks.ts) | 对话任务 sqlite |
| [src/wakeup.ts](src/wakeup.ts) | 到点执行与次日重排 |
| [src/reminders.ts](src/reminders.ts)、[src/reminder-actions.ts](src/reminder-actions.ts) | 按安装隔离的提醒、事务投递与公共动作 |
| [src/reminder-management.ts](src/reminder-management.ts) | 提醒管理投影、旧提醒的归属确认与原子恢复 |
| [src/routes.ts](src/routes.ts) | HTTP 路由表 |
| [src/route-handlers.ts](src/route-handlers.ts) | 创建、打开、暂停用例 |
| [src/client.ts](src/client.ts) | 工作台选择、创建与暂停 |

可对照现有调用方 [apps/workbench/src/schedule-projection-ui.ts](../../../apps/workbench/src/schedule-projection-ui.ts) 与 [apps/local-host/src/schedule-native-plugin-http.ts](../../../apps/local-host/src/schedule-native-plugin-http.ts)。

## 接入与边界

不导入 Feed / Goals 实现。提醒通过 Host 注入的同库投递端口写入 Inbox；人手任务走本插件 HTTP，其他插件自有业务闹钟仍由 Scheduler 叫醒它们自己的 Capability。本地 Web 没开时闹钟不响。

通用提醒由 Host 以 `schedule.reminders` 系统提供方注册，保持已有安装不依赖启用可选对话页面的行为；公开声明见 `REMINDER_ACTIONS`。对话任务仍由本插件 Manifest 注册，并遵循项目启停规则。

工作区依赖：`@molis-ai/molis-work-contracts`。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-plugin-schedule typecheck
pnpm --filter @molis-ai/molis-work-plugin-schedule build
```

已有行为示例与回归：[schedule-plugin.test.ts](../../../tests/schedule-plugin.test.ts)、[schedule-conversation-tasks.test.ts](../../../tests/schedule-conversation-tasks.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test tests/schedule-plugin.test.ts tests/schedule-conversation-tasks.test.ts
```

## 开发要求

- 负责：对话式定时任务、安装级通用提醒、其他插件登记的闹钟列表、收据与暂停。
- 不负责：Feed 与 Goal 事实、cron 表达式、闹钟主人的执行实现。
- 公开入口：`@molis-ai/molis-work-plugin-schedule`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 其他插件自有业务闹钟由 Scheduler 叫醒它们自己的能力；通用提醒由本插件拥有，使用 `reminders.add/cancel`，同一插件重装不能接管旧安装的提醒。
  - 提醒同时绑定安装 ID 与 Runtime 安装世代；重装复用存储 ID 也不能取消或投递旧世代提醒。旧 Runtime 重装还会复用 installed_at，时间不能证明旧任务归属；缺少世代的旧提醒保留并暂停，重复迁移不补权。
  - 旧提醒在详情核对内容、当前安装版本与发布方后，经公开 `schedule.reminders.recover` 明确恢复。预期安装 ID/世代只防止过期确认，实际目标由 Host 重新读取；普通启用不补权。恢复沿用原 job、时间、收据和固定间隔，过期补提醒一次，不运行插件代码；重复确认不能重新开启后来暂停的任务。
  - 提醒的 daily/weekly 是固定 24 小时/7 天间隔；创建、取消与 Scheduler job 同库事务，Inbox 投递与一次性消费也在同一事务内复查 lease。
  - Host 启动时迁移旧 Builder 提醒并保留 job、时间、收据和链接；无法证明原安装归属则保留并暂停，不绑定重装实例。
  - 对话任务到点在自己的对话里跑一轮只读 Agent；提示词正文随目录条目声明。
  - 本地 Web 宿主没运行时闹钟不响。
- 改动后必跑：`node scripts/run-tests.mjs tests/schedule-plugin.test.ts tests/schedule-actions.test.ts tests/schedule-conversation-tasks.test.ts tests/schedule-task-runner.test.ts tests/agent-built-plugins-reminders.test.ts tests/schedule-reminder-recovery.test.ts`
- 相关手册：[docs/horizontal/scheduler.md](../../../docs/horizontal/scheduler.md)、[skills/molis-prologue-ai/SKILL.md](../../../skills/molis-prologue-ai/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [架构与当前实现索引](../../../docs/SSOT-MATRIX.md)
- [对话态定时任务需求](../../../specs/archive/schedule-conversation-tasks/spec.md)
- [闹钟层需求](../../../specs/archive/schedule-plugin/spec.md)

- Status: `partial`
- SSOT: `docs/SSOT-MATRIX.md`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration Goals: `goal-reorg-f2`

对话任务的 runner 消费 Scheduler 执行控制，授权从本次唤醒的当前 lease 来，不能沿用创建动作的临时回调。等待前后复查任务版本和启停，暂停、归档或变更后的迟到结果不追加助手回复或失败说明；Host 把同一检查传入 Prologue 派出前门禁并取消原运行。
