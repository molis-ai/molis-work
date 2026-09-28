# Scheduler

**白话：** 到指定时间，可靠地叫醒一个已注册 Capability；它不理解为什么要触发。

**提供：** durable one-shot wakeup、cancel/reschedule、lease、并发 claim、missed wakeup catch-up、Clock port 和 delivery Receipt。

**技术状态：** owner plugin + capability、opaque object ref、due time、lease 和 terminal technical status。Scheduler 合同拥有 once / interval；interval 按固定毫秒间隔计算，漏过多个周期只补一轮。Native Schedule 拥有对话任务的本地日历时间规则，通过再次登记 once job 排到下一天，不能把通用 interval 解释成日历日。

运行中的唤醒独立续租，不需要另一个 tick 才保持所有权。处理器接收单独的 `ScheduleWakeupControl`，用其 signal 取消外部等待，并在副作用前调用同步 `beforeEffect()`。暂停、取消、重排或被接管后旧控制对象失效。与任务同库的领域写入应在事务中复查并提交，回执不会替业务代码提供提交保护。`isExecuting(jobId)` 读取共享租约，防止对话产品层把还在执行的 once job 提前重新登记。

通用插件提醒由官方 Schedule 拥有，通过公共 `reminders.add/cancel` 调用；Host 从可信调用上下文取得项目、插件和安装身份，插件输入不能指定这些身份。提醒与 job 同事务保存，到点由 Host 将 Inbox 投递和一次性消费同事务提交，无须打开 Studio。旧 Builder job 保留原 id、时间与收据，通过兼容唤醒读取迁入的 Schedule 记录；无法证明原安装归属则保留并暂停。定时运行插件 operation 的安装 Runtime 解耦仍在迁移，不能把提醒迁移当作全部定时执行已完成。

**不拥有：** cron 表达式、Automation rule、Source schedule intent、Action parameters 或 Attention 内容。

旧提醒的归属确认由 Schedule 的 `schedule.reminders.recover` Action 完成，HTTP/页面复用同一实现，MCP 仍需该具体动作的授权。先读取 `schedule.tasks.list` 中提醒内容及当前安装，再携带预期安装 ID/世代提交；这些值只是并发检查，Host 会重新解析目标，不接受输入冒充身份。界面展示内容、版本、发布方和过期补提醒语义，失败保留确认内容，刷新安装后须重新确认。恢复同事务更新提醒身份和启用原 job，保留间隔、收据和链接；普通闹钟启用不替代归属确认。

恢复动作显式声明 `plugin: false`：生成插件不能借默认的 Agent 能力暴露自行接管旧安装提醒，须由具有管理权限的调用方发起。

公共提醒以 `schedule.reminders` 系统提供方装配，产品实现归 Schedule；它不增加“先启用对话页面”的条件。Schedule 对话任务仍按项目插件启停，提醒自己的启停由对应 job 管理。

**当前来源与 Goal：** `horizontal/scheduler` + `plugins/native/schedule`；Web timer 与 Feed timer 并行。Feed 自有调度仍独立，迁入是 later。日历日对话任务由 Schedule 产品层在叫醒后重新登记 once job。见 `specs/archive/schedule-plugin/spec.md` 与 `specs/archive/schedule-conversation-tasks/spec.md`。
