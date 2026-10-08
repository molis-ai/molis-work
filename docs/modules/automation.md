# Automation

**定位：** Trigger、Rule、Automation Run 和所产生 Action Request 的唯一 owner。Automation 是 Action 的通用触发来源，不是另一套执行系统。

**拥有：** automation identity/version、trigger/rule、enabled state、evaluation checkpoint、automation run、dedupe 和产生的 Action reference。

**公开面：** 查询规则/运行；create/configure/enable/disable/evaluate/retry；发布 Automation evaluation 和 ActionRequested 事件。

**不负责：** Scheduler 只负责到点唤醒；Listener/Signals 只提供外部事件；Actions 决定和执行实际操作；Automation 不直接调用 Provider 或写 Action Store。

**当前状态：** 无正式实现，也没有包（占位包已删除）；未来首个真实自动化用例另立 Spec。
