# Schedule 定时任务入口

列出人手创建的对话态定时任务、其他插件登记的闹钟，以及下次叫醒时间和上次收据。对话任务到点后在自己的对话里跑一轮只读 Agent。插件通用提醒由 Schedule 保存，通过公共通知服务投递到 Inbox；后台在正式 Plugin Runtime 中运行，无须打开任何页面。

包名：`@molis-ai/molis-work-plugin-schedule`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

Host 把任务和 job 记录交给隔离页中的 UI contribution；Plugin Runtime 按 Manifest 在 `/api/plugins/io.molis.work.schedule` 挂载路由，调用同一份任务动作。其他插件用公共 `services.scheduler` 登记自己的动作闹钟，或消费 `reminders.add/cancel` 与 `schedules.add/cancel`。旧 typed `schedule.register` 入口已删除。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/ui.ts](src/ui.ts) | 列表、对话详情、创建对话框 |
| [src/tasks.ts](src/tasks.ts) | 对话任务 sqlite |
| [src/wakeup.ts](src/wakeup.ts) | 到点执行与次日重排 |
| [src/reminders.ts](src/reminders.ts)、[src/reminder-actions.ts](src/reminder-actions.ts) | 按安装隔离的提醒、事务投递与公共动作 |
| [src/reminder-management.ts](src/reminder-management.ts) | 提醒管理投影、重装后提醒的归属确认与原子恢复 |
| [src/operations.ts](src/operations.ts)、[src/operation-actions.ts](src/operation-actions.ts) | 安装插件的定时操作、持久单次执行记录及公共动作 |
| [src/operation-management.ts](src/operation-management.ts)、[src/operation-ui.ts](src/operation-ui.ts) | 原输入与执行历史、当前安装复查、未知结果的明确重试或跳过 |
| [src/routes.ts](src/routes.ts) | HTTP 路由表 |
| [src/route-handlers.ts](src/route-handlers.ts) | 创建、打开、暂停用例 |
| [src/browser/](src/browser) | 页面的客户端（TypeScript，`tsconfig.browser.json` 检查，esbuild 从 `factory.ts` 打成 `dist/schedule-client.js`）：任务表单、操作审阅与恢复、请求只经 `molisWorkRequest` |
| [src/client.ts](src/client.ts) | 读这个包，交给工作台的工厂 `SCHEDULE_CLIENT_FACTORY_SCRIPT` |
| [src/messages.ts](src/messages.ts) | 页面文字的稳定键（中英文），`tests/schedule-client-bundle.test.ts`（RAC-162、RAC-163）钉住 |

可对照现有调用方 [apps/workbench/src/schedule-projection-ui.ts](../../../apps/workbench/src/schedule-projection-ui.ts) 与 [src/plugin.ts](src/plugin.ts)。

## 接入与边界

不导入 Feed / Goals 实现，也不接收数据库连接、安装仓库或专用宿主端口。工厂只使用 `services.project_database`、`scheduler`、`installations`、`notifications`、`agents`、`background` 与公开动作目录。业务记录与闹钟、通知（平台的通知队列行）通过同一个项目库事务提交；安装身份取网关和公共安装目录。宿主进程停止期间不执行闹钟。

任务、提醒与定时操作均由 Schedule 的 Manifest 注册，采用同一启停规则。新项目通过普通插件 membership 默认启用；关闭 Schedule 会一起暂停页面和后台，重开同一安装沿原身份恢复，重装不能接管旧任务。现有项目不会在读取时自动补启用。

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

- 负责：对话式定时任务、安装级通用提醒和定时操作、单次执行状态、其他插件登记的闹钟列表、收据与暂停。
- 不负责：Feed 与 Goal 事实、cron 表达式、闹钟主人的执行实现。
- 公开入口：`@molis-ai/molis-work-plugin-schedule`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`（页面客户端用它的类型认出 `molisWorkRequest`）。方向：本包通过合同使用 Runtime 服务，不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 失败都是 `ActionError`：码是 `schedule.<原因>`（`scheduleErrors`）；状态只由 kind 推出，本插件没有错误类和状态表。Scheduler 服务的 `schedulerErrors` 在本插件的动作边界（`scheduleFailure`）换成 `schedule.job_not_found` 或 `schedule.job_invalid`，不带着 Scheduler 的码出去；`actions.ts` 的 `bind`、`reminder-actions.ts`、`operation-actions.ts` 的五处包装各由 `tests/feed-inbox-schedule-error-model.test.ts` 用服务公开的错误声明和真实的 Scheduler 驱动，去掉任何一处都会失败。`runtime-installations.ts` 经公共安装目录检查提醒所属的安装和世代；安装不存在、停用或属于其他插件时拒绝，真实 Runtime 用例见 `tests/schedule-reminder-recovery.test.ts`。
  - 其他插件自有业务闹钟由 Scheduler 叫醒它们自己的能力；通用提醒由本插件拥有，使用 `reminders.add/cancel`，同一插件重装不能接管旧安装的提醒。
  - 提醒同时绑定安装 ID 与 Runtime 安装世代；重装复用存储 ID 也不能取消或投递旧世代提醒，投递失败并记下原因，提醒保留。
  - 重装前设下的提醒在详情核对内容、当前安装版本与发布方后，经公开 `schedule.reminders.recover` 明确恢复。预期安装 ID/世代只防止过期确认，实际目标由公共安装目录重新读取；普通启用不补权。恢复沿用原 job、时间、收据和固定间隔，过期补提醒一次，不运行插件代码；重复确认不能重新开启后来暂停的任务。
  - 提醒的 daily/weekly 是固定 24 小时/7 天间隔；创建、取消与 Scheduler job 同库事务，Inbox 投递与一次性消费也在同一事务内复查 lease。
  - 提醒送达时通知标题是「插件名：文字」；超过通知服务的 200 个单元时按整字截到 199 个单元以内、以「…」结尾，不劈开代理对，摘要和正文仍是整段文字（`tests/agent-built-plugins-reminders.test.ts` 的 RAC-1670、RAC-1671）。
  - 对话任务到点在自己的对话里跑一轮只读 Agent；提示词正文随目录条目声明。
  - `schedules.add/cancel` 由 Schedule 的 Runtime 实例拥有，实际 operation 仍由当前安装执行。首次派出前持久化 pending/running；只有尚未派出的 pending 能自动等待新唤醒，已派出结果未知时暂停，不能自动重放。
  - 执行入口注册不补跑任务。每次派出使用本次 Scheduler lease 和当前安装世代；结果、Inbox 与单次执行终态同事务提交。失败/未知不能报告成功；撤销后的迟到结果不能写业务状态或 Inbox。
  - `schedule.operations.recover` 只供具有管理权限的调用方使用，显式 `plugin: false`。确认校验原输入/历史 revision 和当前安装 ID、世代、版本；未知结果不能用普通恢复隐式重跑。retry/skip 保留核对历史，确认本身不运行插件；一次性任务跳过后结束。
  - 本地 Web 宿主没运行时闹钟不响。
  - 新建对话任务时不检查就绪（W2-18 决定 3，2026-10-09）：没有文字模型或项目没绑定已核对的工作区，「新建定时任务」对话框给一句提示、仍允许创建，到点才会叫醒失败。`schedule.tasks.readiness`（查询，`schedule:read`，返回 `{ model, workspace }`）通过公开工作区查询与 `services.model.availability()` 读取元数据，不解密凭据、不启动模型；实际唤醒由公共 Agent 服务再次检查工作区和运行环境，所以提示不是执行保证。对话框每次点「新建」时读一次，读不到就不提示；编辑已有任务不提示。答案只算给发出它的那一次打开：关掉后再开编辑、或再开新建，迟到的旧答案不会显示在后一次里（`tests/schedule-readiness.test.ts`）。两条提示各带一个普通链接：模型指向 `/settings/models`，工作区指向本项目的 `/settings/workspaces`（工作目录设置）；设置盖在页面上、模态对话框会压住它，所以点链接时先关掉对话框。提示是 `.mw-alert`（网格，用 `div`，和设计系统的 alert 一致，`<p>` 的默认外边距会把两条提示撑开），句子和链接装在同一个 `<span>` 里，链接才跟在句末、点击区只是它自己的字；直接放在提示下它会单独占一行并撑满整行。链接不换行（`white-space:nowrap`），窄对话框里整条挪到下一行，不在词中间断开。新建对话框开着时收到 `molis-work:model-ready`（模型设置报告第一个能用的模型，见 `skills/molis-prologue-ai/SKILL.md`），按同一个打开编号重读一次，模型提示随之消失；对话框关着或在编辑时不读（`tests/schedule-readiness.test.ts`；浏览器里的动线 `tests/model-ready-surfaces.e2e.test.ts`）。
- 改动后必跑：`node scripts/run-tests.mjs tests/schedule-plugin.test.ts tests/schedule-actions.test.ts tests/schedule-conversation-tasks.test.ts tests/schedule-task-runner.test.ts tests/agent-built-plugins-reminders.test.ts tests/schedule-reminder-recovery.test.ts tests/schedule-operations.test.ts tests/schedule-operation-recovery.test.ts tests/schedule-readiness.test.ts tests/plugin-client-served.test.ts tests/feed-inbox-schedule-error-model.test.ts`
- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/plugin-small-ux.e2e.test.ts tests/cross-plugin-recovery.e2e.test.ts tests/model-ready-surfaces.e2e.test.ts`
- 相关手册：[docs/horizontal/scheduler.md](../../../docs/horizontal/scheduler.md)、[skills/molis-prologue-ai/SKILL.md](../../../skills/molis-prologue-ai/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [架构与当前实现索引](../../../docs/SSOT-MATRIX.md)
- [对话态定时任务需求](../../../specs/archive/schedule-conversation-tasks/spec.md)
- [闹钟层需求](../../../specs/archive/schedule-plugin/spec.md)

- SSOT: `docs/SSOT-MATRIX.md`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`

对话任务的 runner 消费 Scheduler 执行控制，授权从本次唤醒的当前 lease 来，不能沿用创建动作的临时回调。等待前后复查任务版本和启停，暂停、归档或变更后的迟到结果不追加助手回复或失败说明；Host 把同一检查传入 Prologue 派出前门禁并取消原运行。

页面以公共 `host.view.readDocument()` 刷新自己的服务端投影；宿主在读取前后复核页面授权，只返回该贡献内容。实际新建、编辑、暂停、重开、恢复、归档见 [schedule-isolated-page.e2e.test.ts](../../../tests/schedule-isolated-page.e2e.test.ts)。

后台接入与关闭验证：`tests/schedule-runtime-lifecycle.test.ts`、`tests/schedule-runtime-delivery.test.ts`、`tests/schedule-resident-runtime.test.ts`。前两者检查真实 Runtime 启停、身份、通知和重启恢复；驻留测试用真实时钟入口证明不打开页面也会执行，以及服务关闭、项目关闭和删除均取消在途依赖，不留迟到结果。公共服务的跨安装、跨项目、事务回滚、query 转写、撤权与强制退出恢复分别见 `tests/security-invariants-plugin-scheduler.test.ts`、`tests/security-invariants-plugin-dependencies.test.ts`、`tests/security-invariants-plugin-notifications.test.ts`。
