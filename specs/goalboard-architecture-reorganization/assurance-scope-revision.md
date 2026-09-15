# 恢复验收范围修订

2026-09-06。此文件是范围与检查依据；Molis Work 是提案、决定及生命周期的唯一事实源。

## 本次结果

新任务已经用户确认关联「Molis Work 架构与包重组」。正式 MCP Explain 和 select 对根 coverage 澄清均成功；Claim `claim-34a3fa81-96ed-45cc-ae91-3c4dc06480c6`、Run `run-d694634d-67fd-4731-b6dd-ff189634d423` 属于 actor `codex-runtime-01a07630-be49-7791-bb05-de4db2d1377b`。旧澄清入口冲突已解除。

提案 `goal-tree-proposal-0500bb62-7509-4934-abf0-0bb3d36e8249` 只有 `item-assurance-existing-recovery-20260906`，状态 pending。10:14:27 UTC 的 read/check 已通过，cursor1256；conflict_item_ids=[]、planning_issues=[]。未批准 DD 提案或声称总重组完成。

## 精确变化

保留 assurance Goal 的 ID、目标、范围、约束、输入、输出、三项 criterion ID、判定方式和所需证据，仅修订 assurance-recovery 的通过条件。

原条件：数据库/Blob 备份恢复、Plugin crash、outbox replay、Runtime disconnect 和 install rollback 演练通过。

新条件：数据库/Blob 备份恢复、Plugin crash、已实现事务的原子性与回滚、幂等、失败重试与恢复、Runtime disconnect 和 install rollback 演练通过。Outbox 实现与重放留后续，不纳入本期只重组现有功能的验收。

提案附带当前工具要求的 leaf_readiness，解释原四项记录共同构成同一迁移保证；没有新增子 Goal 或改变输出。历史用户决定来源为 `assurance-validation.md`；本次关联答复不代表提案已批准。

## 方法与影响核对

已读取同一目录的迁移重构、软件开发、可靠性发布、安全隐私、开发者工具、敏感数据隐私六套完整方法。重点保留已有数据和行为的兼容、失败恢复、权限与私人正文边界、真实安装/升级证据；不为未来能力扩大实现或添加依赖。

planning_analyze_change 返回 root、Cutover 和八个直接上游，已逐项读取 Contract：

| 提供者 | assurance 仍消费的结果 |
| --- | --- |
| 架构底座 | package/Contract、事实所有权、contract-only 真实性 |
| Work/Runtime | 私人 Session、断线、恢复和 handoff |
| Artifacts/Ledger | 精确版本内容、关系、权限与恢复 |
| Projects/Apps | Project 数据迁移、唯一 Host、Shell 行为 |
| Goals Query | 公开查询和迁移前后结果对账 |
| Goals Mutation | 写入、Schema、并发、生命周期和回滚 |
| Execution/Evidence/Governance | Claim/Run/Review/Decision 与证据历史的可靠状态 |
| Developer distribution | 安装、升级、卸载、Plugin grant、兼容与诊断 |

八个上游目前 valid/satisfied；父项 coverage freshness 提示保留，不能因此改写原完成事实。上述可运行产物提供验证输入，assurance 向 Cutover 提供迁移、安全与恢复证明，方向均不变。Cutover 仍要求旧路径/重复职责清零、完整构建/测试/安装、文档一致；root 仍要求完整分包、兼容、恢复和无假功能。Outbox 延后不会削减这些条件。

所有方法中的硬依赖判断均落到现有“实现 → 保证 → 切换”消费链；本次无新实现、采集/共享、并行写入或不可逆投入，因此没有额外关系变更。图分析无问题。确认成功后仍需按返回的 semantic_review 核对受影响 Contract。

## 完成边界与下一步

已有93项工程验证记录不重复运行，也不冒充正式 Goal 完成。提案待用户明确决定；通过后对新 revision 重新核验并提交所需 Evidence/Review。全产品前后端 E2E、旧代码清零、清理后复验及初始架构总审仍待完成。DD 父项收口是另一份独立提案。
