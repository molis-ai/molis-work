# 当前结构中的 Goal 历史场景

四份业务场景覆盖导入要求、批准、完成与混合历史，全部使用现行项目库第3版结构（第2版删去 `project_browsing_settings`、新增 `material_recent_uses`，并带采用后的过程项日志 `process_items_adopted_replica_*`、过程项触发器记到它；第3版新增 `surface_corrections`；2026-11-12 Files 退役按现行结构刷新，原 `process_items_replica_*` 表照旧保留，见 `apps/local-host/src/project-database-schema.ts` 的升级段）；内置插件声明账本为1（Goals 自 2026-11-11 起为 2、2026-11-13 起为 3，Schedule 与 Feed 自 2026-11-12 起为 2、Schedule 2026-11-13 起为 3，见文末）。它们由 `tests/goal-event-history-fixture.ts` 载入，不包含升级链或启动转换。

本次集成更新完整现行结构与插件声明账本；业务INSERT、Goal状态、授权完成决定、幂等回执和版本引用不改。授权决定固定整份约定的内容，继续按现行规则比较，不读取或补全旧形状。

这些完整业务夹具也作为表结构测试的独立期望：平台与插件各自只建声明的表，外键归属、列、检查与索引必须一致。结构有意变化时随同业务验证更新当前夹具，历史导出及先前的维护方法从Git历史查，不再提供旧结构或迁移脚本。

个人分支集成保留当前同步技术表与 Coding 输入/高水位/归档表；主线已删除的 Sessions 表不恢复。当前夹具随合并后的 schema 更新，不访问或维护真实 Home。

项目库为第 3 版，插件声明版本在统一起点为 1，同步技术表名称由同步集合版本派生；业务 INSERT、列、约束与触发器是真实场景的内容。

2026-11-11（第 24 批，逐项依据合同）：Goals 的表升到第 2 版，判断表加 `basis_json`、`tier`、`gap`、`reporter_session`，结论表加 `checked_artifact_id`、`checked_version`；四份夹具的建表语句和 Goals 的声明账本随之更新为 2，业务 INSERT 不改（旧行的层级按列默认值是「自述」）。

2026-11-12（第 25 批，错过的运行）：Schedule 与 Feed 的表各升到第 2 版，各加一张错过表（`schedule_missed_runs`、`feed_missed_pulls`）；四份夹具补上这两句建表语句（取自现行代码新建的库），两者的声明账本改为 2、对象列表加上新表，业务 INSERT 不改。

2026-11-12（第 15 批）：项目库升到第 3 版，新增首页纠正记录表 `surface_corrections`（`horizontal/surfaces/src/schema.ts`）；四份夹具补上这张空表的建表语句并把 `user_version` 改为 3，业务 INSERT 不改。

2026-11-13（第 17 批，风险插件）：Goals 的表升到第 3 版，顾虑表末尾加 `cited_subjects_json`（默认 `'[]'`）；Schedule 的表升到第 3 版，任务表末尾加 `repeat`（默认 `'daily'`）、`run_at`、`subject_kind`、`subject_id`。四份夹具的建表语句（取自现行代码新建的库）与两者的声明账本随之改为 3，业务 INSERT 不改。同一批删去 Goals 里恒为空的 `blocking_risks` 死路径，未达成原因的合同不再有 `risk_id`：`approved.sql` 里那条合成的「未解决的完成风险」原因去掉 `risk_id` 键（收尾、事件、回执里各处一致），其余业务内容不改。
