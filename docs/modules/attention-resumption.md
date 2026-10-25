# Attention & Resumption

Attention 保存需要用户关注的对象引用、原因和处置状态。当前实现是 Feed/Inbox 使用的 `AttentionModule`：校验 subject、创建条目、读取条目，并约束 `open`、`in_progress`、`done`、`dismissed` 之间的状态转换。

模块不拥有 Feed 内容、Goal 约定或 Session。Goal 引用由公开 Goals 查询校验；Feed/Inbox 开始处理并生成 Goal 时，Native Feed 经 Goals 的动作（`goals.create`、`goals.inputs.confirm`）建 Goal 并记下输入，保留原关联与升格来源。Attention 的处置状态不能替代 Goal 的工作状态或完成结论。

Entry 和事件都保存明确的 `owner_plugin_id`；null 是未指定归属的事实。对象由 owner、kind 和裸 ID 一起标识，去重再加原因；同 kind、同 ID 的不同插件对象互不覆盖，事件在条目删除后仍保原 owner。`entry_id` 是全局条目身份，跨 owner 的处置规则保留。旧自定义 Goal ID 可以包含看似插件号的字符串，因此不从 ID 前缀推断主人。

`services.attention` 的创建、按对象删除要求目标 owner 等于安装 Manifest 的插件号，实际写入使用可信 Manifest；现有读授权可跨插件读取明确 owner 的条目及事件。未归属条目继续经原直接 owner 路径访问，维护明确归属后才经新服务读取。尚未按 owner 解析材料的旧 Feed/Inbox snapshot/list/get 只接 null，Goals 的旧自动结算也只处理 null，避免解析或结算其他插件的同 ID 对象。项目 schema 本分支从 9 升为 10，沿用严格版本拒绝；真实库维护、生产调用方迁移及完整 S9-2 未在这里完成。

完整 snooze、系统通知和定时唤醒仍未实现。真实 Session 恢复属于 Private Work Context／Runtime Host；completed/cancelled Goal 的明确继续属于 Goals `resumeWork`，必须有原因。切换关注对象不会自动改绑终端或发送消息。

参见 [Goals](goals.md)、[Private Work Context](private-work-context.md) 与 [Feed](feed.md)。
