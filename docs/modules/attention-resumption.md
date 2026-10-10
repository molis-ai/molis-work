# Attention & Resumption

Attention 保存需要用户关注的对象引用、原因和处置状态。当前实现是 Feed/Inbox 使用的 `AttentionModule`：校验 subject、创建条目、读取条目，并约束 `open`、`in_progress`、`done`、`dismissed` 之间的状态转换。

模块不拥有 Feed 内容、Goal 约定或 Session。Goal 引用由公开 Goals 查询校验；Feed/Inbox 开始处理并生成 Goal 时，Native Feed 经 Goals 的动作（`goals.create`、`goals.inputs.confirm`）建 Goal 并记下输入，保留原关联与升格来源。Attention 的处置状态不能替代 Goal 的工作状态或完成结论。

完整 snooze、系统通知和定时唤醒仍未实现。真实 Session 恢复属于 Private Work Context／Runtime Host；completed/cancelled Goal 的明确继续属于 Goals `resumeWork`，必须有原因。切换关注对象不会自动改绑终端或发送消息。

参见 [Goals](goals.md)、[Private Work Context](private-work-context.md) 与 [Feed](feed.md)。
