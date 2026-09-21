# Scheduler

**白话：** 到指定时间，可靠地叫醒一个已注册 Capability；它不理解为什么要触发。

**提供：** durable one-shot wakeup、cancel/reschedule、lease、并发 claim、missed wakeup catch-up、Clock port 和 delivery Receipt。

**技术状态：** owner plugin + capability、opaque object ref、due time、lease 和 terminal technical status。once / interval 由 Native Schedule 插件的 job 模型拥有；底层每次只打一枪，漏打合并。

**不拥有：** cron 表达式、Automation rule、Source schedule intent、Action parameters 或 Attention 内容。

**当前来源与 Goal：** `horizontal/scheduler` + `plugins/native/schedule`；Web timer 与 Feed timer 并行。Feed 自有调度仍独立，迁入是 later。日历日对话任务由 Schedule 产品层在叫醒后重新登记 once job。见 `specs/schedule-plugin/spec.md` 与 `specs/schedule-conversation-tasks/spec.md`。
