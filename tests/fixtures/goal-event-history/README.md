# 当前结构中的 Goal 历史场景

四份业务场景覆盖导入要求、批准、完成与混合历史，全部使用现行项目库第 1 版完整基线结构（第 106 批 V7 复位，风险编辑版本表并入风险的第 1 版）（含平台审批规则与决定表 `project_approval_rules`、`project_review_decisions`，平台指导表 `guidance_entries`、`guidance_revisions`，平台要求与认可表 `acceptance_subjects`、`acceptance_decisions`、`acceptance_events`，过程项同步表 `process_items_replica_*` 与 `surface_corrections` 及其同步日志）；内置插件声明账本均为第 1 版（风险带它的同步日志表，Inbox 只剩 `inbox_scene_bindings`，「等你」的同步日志第 44B 批起归平台；含 `goal_requirement_links`、`goal_tree_item_effects`、`schedule_missed_runs`、`feed_missed_pulls` 等现行表）。它们由 `tests/goal-event-history-fixture.ts` 直接载入，不包含升级链或启动转换。

这些完整业务夹具也作为表结构测试的独立期望：平台与插件各自只建声明的表，外键归属、列、检查与索引必须一致。结构有意变化时随同业务验证更新当前夹具，历史导出及先前的维护方法从 Git 历史查，不再提供旧结构或迁移脚本。
