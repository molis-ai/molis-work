# Schedule 唤醒、定时钟、提醒与后台 Agent（PG-039～PG-042）核对

状态：执行中（2026-10-23）。逐行核过 main `3f715261f` 的代码：PG-039、PG-041、PG-042 的生产路径在 Schedule 迁到 Runtime 时已经做完，PG-040 的 Schedule 一半也是；状态列过时。本片只补宿主一侧最后一处（宿主不再自带进程内唤醒处理器），其余缺口写明留给谁。

验收编号：RAC-206（本文件第 3 节）；RAC-207～209 空着。

## 1. 逐行核对

### PG-039 唤醒只投给进程内登记的处理器 —— 生产路径已做，补了宿主一侧

| 要求 | 现状（证据） |
| --- | --- |
| 唤醒是动作，经网关投递 | Manifest `background.wakeups` 声明三个唤醒动作（`plugins/native/schedule/src/manifest.ts:41`、`background-actions.ts`）；调度器登记时只收 `registerAction`（带安装、代次、动作版本的绑定，`horizontal/scheduler/src/action-wakeups.ts`），到点经 `owner.invoke` 调那个安装的动作网关 |
| 带安装身份和授权 | 绑定存在库里，活的“拥有者”由激活经 `connectActionOwner` 接上（`apps/local-host/src/plugin-scheduler-service.ts:16`）；认领（`claim`）与每次续租（`renewExecutions`）都重查 `actionWakeups.current`，安装停了、重装了（代次变了）、撤权了，到点的任务原样留着不跑（`tests/security-invariants-plugin-scheduler.test.ts`「SYS-15-S4/S5」） |
| 宿主不再登记处理器 | 生产里没有任何 `PluginWakeupIndex.register` 调用（grep 全仓）；但 `project-clock.ts` 还建一个空的 `PluginWakeupIndex` 交给调度器，所以宿主里的任何代码都还能往里登记。**本片补：** `wakeupIndex` 改成可选，`project-clock.ts` 不再建它；没有安装的 `register()` 一律 `scheduler.handler_missing`，库里遗留的没绑定的任务只记“不可用”（RAC-206） |
| 余项 | `PluginWakeupIndex` 类和无安装的 `register()` 现在只有测试在用（`tests/scheduler.test.ts` 等 7 个文件约 50 处，其中有认领事务里的 `prepare` 钩子的断言，那一路生产里已不走）。整个删掉要把这些测试搬到绑定了安装的拥有者上，记为 BL-481 |

### PG-040 每 30 秒的 `projects.schedules` 轮询由宿主手写，用宿主名字 —— Schedule 一半已做，Feed 一半留给 Feed 迁移

`web-project-schedulers.ts:70` 的一个宿主定时器（`projects.schedules`，owner `local-host`，30 秒，与页面是否打开无关）每轮做两件事：

| 一半 | 现状 | 判定 |
| --- | --- | --- |
| Schedule：`runtime.schedule.tick()`（`:66`） | 这是平台的定时钟，只推进“到点的任务”；每个到点的唤醒是被唤醒的插件自己的安装身份调自己的动作（PG-039），宿主没有为 Schedule 手写任何调用，也没有宿主名字 | 已做；定时器本身是平台时钟，留在宿主 |
| Feed：`runtime.scheduler.tick()`（`:65`）→ `createProjectFeedScheduler`（`workflow-feed-options.ts:46`） | 以本人的 `LOCAL_OWNER_PERMISSIONS` 调 `feedSourceActions.tick`（`:53-55`）；另外 `workflowEventsFeedOptions`（`:18-19`，`project-host.ts:169-171` 装配）用宿主身份 `workflow-events`（audience `workflow`）跑 Feed/Inbox/Home 的判断触发，插件通知落进 Feed 后的判断也走它（`plugin-notification-service.ts` 的 `bindPluginNotificationFeed`） | **没做，也做不了：** Feed 还不是 Runtime 插件（`BUILD_TIME_ASSEMBLED`），没有安装身份和动作网关，唤醒绑定要 `install_id`。留给 Feed 迁移（PG-093，③）：迁后 Feed 声明 `background.wakeups`、来源 tick 变成它自己的唤醒动作，`workflow-events` 的判断身份随 Feed/Inbox 的判断触发一起处理（PG-010） |

### PG-041 “提醒”“定时操作”是给所有插件用的服务 —— 已做

| 要求 | 现状（证据） |
| --- | --- |
| 宿主不实现提醒 | `schedule-reminders.ts`、`schedule-runtime.ts` 已不存在；宿主里认识提醒的只有助理的到期提醒扫描（下一行），没有哪个文件替 Schedule 实现提醒或定时操作 |
| 平台服务 | 两条平台路：① 任何声明 `schedule:*` 的插件都有 `services.scheduler`（到点唤醒自己的动作）和 `services.notifications`（落进收件箱，`plugin-notification-service.ts`）；Schedule 的 `reminders.add/cancel`、定时操作是它声明的公共动作（`reminder-actions.ts`、`operation-actions.ts`，受众 `plugin`），调用者的安装身份取自调用上下文（`context.plugin_install_id`），不读输入。② 声明了输入类型 `molis.reminders.window.v1`、输出类型 `molis.reminders.due.v1` 的查询动作（合同 `platform/due-reminders.ts`；Todo 的 `reminders.due`，`plugins/native/todo/src/actions.ts:130`），由助理每 60 秒扫一遍（`web-assistant.ts:25`，`assistant-followups.ts` 的 `sweepReminders`），谁声明谁被扫，宿主不点名插件 |
| 结果经动作交给订阅方 | ② 就是：订阅方（助理）发现声明了该类型的动作、用动作调用取结果（`actions.discover()` 再 `invoke`），告知一次，错过的标“错过的提醒” |
| 页面关着能送达（V-12） | 能，只要宿主在跑：Schedule 的提醒由 30 秒的定时钟经安装网关唤醒，Todo 的 `remind_at` 由助理的 60 秒扫描取；都与页面无关（`tests/assistant-reminders.test.ts`「W2-18-S8-TODO-01」是真 Todo → 声明的动作 → 服务自己的提醒定时器 → 一条助理通知）。宿主关着的时候错过的，下次打开补上（回看最多 12 小时，超过 10 分钟标“错过”） |

### PG-042 定时对话任务由宿主起 Prologue Agent 会话 —— 已做

| 要求 | 现状（证据） |
| --- | --- |
| 平台提供后台 Agent 运行 | `services.agents.run`（`apps/local-host/src/plugin-agent-service.ts`），Manifest 权限 `agent:run`，只能由本插件声明权限的并发动作或后台作业起 |
| 插件的安装身份和声明的角色 | 角色取自 Manifest `agent.roles`（没声明的 `actions.forbidden`）；会话以 `install_id`、`plugin_id`、`actor_id` 为主人；每一步复查安装代次与授权 |
| 能取消 | 调用的信号、安装停止（`dispose`）、超时、需要人工处理都会取消那次运行（`SYS-15-A3`） |
| 同一把 Agent 锁 | 走同一个 `agentHost` 与 Home 的 Agent 运行时（`pluginAgentRuntime(home)`），不另开 |
| 不再 import 工作台的 `BUILTIN_PLUGIN_AGENTS` | Schedule 的唤醒（`runtime-wakeups.ts:28`）直接调 `services.agents.run`；`schedule-task-runner.ts` 已不存在。`agent-host-composition.ts:209` 的 `BUILTIN_PLUGIN_AGENTS` 只在没有插件调用者的宿主直接调用时用，不是 Schedule 的路径 |

## 2. 要做什么（本片）

1. `horizontal/scheduler/src/index.ts`：`ScheduleServiceOptions.wakeupIndex` 可选；没有它时，没有安装绑定的任务不可登记（`scheduler.handler_missing`），遗留的没绑定的任务到点记 `plugin_unavailable`、不调用任何东西。
2. `apps/local-host/src/project-clock.ts`：不再建 `PluginWakeupIndex`。

没动：合同、动作、Manifest、`manifest.ts`、Feed、Todo。

## 3. 验收

| 编号 | 断言 |
| --- | --- |
| RAC-206 | 宿主的项目时钟（`scheduleServiceFor`）拒绝没有安装的任务登记（`scheduler.handler_missing`），库里没绑定安装的遗留任务到点被认领但只记 `plugin_unavailable`、没有任何东西被调用（`tests/security-invariants-plugin-scheduler.test.ts`「PG-039 RAC-206」）；绑定了安装的唤醒经网关送达、停了就不跑的断言本来就在同一个文件的「SYS-15-S4/S5」 |

## 4. 留着的

- BL-481：删 `PluginWakeupIndex`，把调度器测试搬到绑定了安装的拥有者上。
- PG-040 的 Feed 一半、`workflow-events` 判断身份：随 Feed 迁移（PG-093）和 PG-010。
