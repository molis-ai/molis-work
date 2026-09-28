# Scheduler

**白话：** 到指定时间，可靠地叫醒一个已注册 Capability；它不理解为什么要触发。

**提供：** durable one-shot wakeup、cancel/reschedule、lease、并发 claim、missed wakeup catch-up、Clock port 和 delivery Receipt。

**技术状态：** owner plugin + capability、opaque object ref、due time、lease 和 terminal technical status。Scheduler 合同拥有 once / interval；interval 按固定毫秒间隔计算，漏过多个周期只补一轮。Native Schedule 拥有对话任务的本地日历时间规则，通过再次登记 once job 排到下一天，不能把通用 interval 解释成日历日。

运行中的唤醒独立续租，不需要另一个 tick 才保持所有权。处理器接收单独的 `ScheduleWakeupControl`，用其 signal 取消外部等待，并在副作用前调用同步 `beforeEffect()`。暂停、取消、重排或被接管后旧控制对象失效。与任务同库的领域写入应在事务中复查并提交，回执不会替业务代码提供提交保护。`isExecuting(jobId)` 读取共享租约，防止对话产品层把还在执行的 once job 提前重新登记。

**不拥有：** cron 表达式、Automation rule、Source schedule intent、Action parameters 或 Attention 内容。

**当前来源与 Goal：** `horizontal/scheduler` + `plugins/native/schedule`；Web timer 与 Feed timer 并行。Feed 自有调度仍独立，迁入是 later。日历日对话任务由 Schedule 产品层在叫醒后重新登记 once job。见 `specs/archive/schedule-plugin/spec.md` 与 `specs/archive/schedule-conversation-tasks/spec.md`。
