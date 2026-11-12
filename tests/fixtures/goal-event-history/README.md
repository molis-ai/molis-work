# 当前结构中的 Goal 历史场景

四份业务场景覆盖导入要求、批准、完成与混合历史，全部使用现行项目库第2版结构（第2版删去 `project_browsing_settings`、新增 `material_recent_uses`，见 `apps/local-host/src/project-database-schema.ts` 的升级段）；内置插件声明账本为1（Goals 自 2026-11-11 起为 2，见文末）。它们由 `tests/goal-event-history-fixture.ts` 载入，不包含升级链或启动转换。

本次集成更新完整现行结构与插件声明账本；业务INSERT、Goal状态、授权完成决定、幂等回执和版本引用不改。授权决定固定整份约定的内容，继续按现行规则比较，不读取或补全旧形状。

这些完整业务夹具也作为表结构测试的独立期望：平台与插件各自只建声明的表，外键归属、列、检查与索引必须一致。结构有意变化时随同业务验证更新当前夹具，历史导出及先前的维护方法从Git历史查，不再提供旧结构或迁移脚本。

个人分支集成保留当前同步技术表与 Coding 输入/高水位/归档表；主线已删除的 Sessions 表不恢复。当前夹具随合并后的 schema 更新，不访问或维护真实 Home。

项目库为第 2 版，插件声明版本在统一起点为 1，同步技术表名称由同步集合版本派生；业务 INSERT、列、约束与触发器是真实场景的内容。

2026-11-11（第 24 批，逐项依据合同）：Goals 的表升到第 2 版，判断表加 `basis_json`、`tier`、`gap`、`reporter_session`，结论表加 `checked_artifact_id`、`checked_version`；四份夹具的建表语句和 Goals 的声明账本随之更新为 2，业务 INSERT 不改（旧行的层级按列默认值是「自述」）。
