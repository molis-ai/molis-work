# Context Ledger

**白话：** 它是“关系账本”。它记住 Goal、Artifact、Feed、Session 等对象之间是什么关系，以及需要重新拼装一份上下文时应从哪里取；它不复制这些对象本身。

**拥有：** ObjectRef、ContextEdge、publication record、materialization request/status/result reference 与 provenance。

**公开面：** 查询对象关系和 lineage；创建/撤销关系；请求/取消 materialization；发布关系和 materialization 状态事件。

**Materialization：** Ledger 记录“要拼什么、谁来拼、拼到哪”；materializer 通过各 Module Query 读取获准内容，长期结果写成 Artifact。可重建缓存删除后应能恢复。

**不负责：** 不拥有 Goal/Artifact/Feed/Session 内容，不跨 Store Join，不因存在 edge 自动授予内容权限。

**当前来源与 Goal：** Coordinator relation/impact/provenance、Feed link、Session association；由 AR2 迁移。

## 当前实现（AR2 迁移已验收）

`ContextLedgerApi` 已提供关系查询、逐次 revision 历史、写入和撤销。`modules/context-ledger` 独占 `context_edges`；Feed 通过注入的 API 读写自己的 Goal 关联，仍负责 disposition、Attention 与业务事件。Root 只组合同一个本地数据库事务资源，不让 Feed 读取 Ledger 的表。

旧 `feed_items.linked_goal_id` 在 Feed 初始化时同事务迁移并清空，只作为旧 schema 的暂留列，不再参与读取或写入关联。对外 Feed 返回的同名字段从 Ledger 派生。旧引用指向缺失 Goal 时保留引用，不制造 Goal、不猜测历史版本。新 Artifact 引用必须携带精确版本。

Scope 是授权端口验证的逻辑分区；目前 Feed 只在本地 personal Project 分区使用，不隐式发布到 Team。关系可见不意味着有权读取目标内容；materializer 通过目标 owner Query 获取内容，owner 可以独立拒绝。

Session/Project/workspace 关联也已通过同库 Ledger API 迁移，旧 link ID、actor、时间与未知历史 namespace 均保留；本地应用层组装两个 Module，不引入 Module 实现之间的依赖。ObjectRef 的 Project namespace 与对象类型区分不同 Project 的同名对象及 workspace；它们不同于隐私 scope。

Goal 输入确认中的可解析 Feed 来源已迁为 `goal.input` 边，Goals 只保存 edge key、确认状态和摘要，公开读取再还原 locator；原始来源不随 Feed 当前关联变更而改变。URL 与不可解析 locator 保留，不凭空转换成 Artifact。迁移和新写入与 Goals 共用原子事务。

`ContextMaterializationApi.rebuild` 已用于 Runtime advance-prompt 的 Feed 上下文：从 Goal incoming `feed.goal` 边取引用，经 owner Query 获取内容，Native Feed 选择原来排序下的 Item 并格式化、脱敏。Ledger 不拥有其正文。遍历支持缺失/拒绝/暂不可用/版本过期状态，循环去重、范围拒绝和对象数预算；失败不会留一份可被误用的部分缓存，下次调用从 owner 重新读取。返回值只是临时 projection，长期结果仍必须进 Artifact。

Handoff 的来源 Goal 与目标 Project / workspace 已迁入 Ledger；新 prepare 记录实际 Goal revision，历史版本不猜测。加密正文、来源/目标 Session、发送与重试状态仍是 Work 内部事实；持久化私人恢复包不等于自动发布 Artifact（总 spec §20.11 / §20.13）。

Runtime 工作入口到 Project 的当前绑定已迁为 `work.binding_project`，Catalog v10 删除旧 endpoint 列；Work 保留绑定身份、确认/解除事件、setup 幂等与拒绝建议。Project 删除通过 Work API 撤销该 Project 的当前边，不触及其他 Project，也不抹去历史边和原决定记录。

资源 Impact 的声明与历史归 Goals，占用冲突归 Execution；它们不是可解析对象关系。事实/假设、Contract/native 提案的来源规则与旧提案展示归 Governance。Coordinator 已退出这些规则，通过公开接口组合；来源 locator 和待确认历史不伪造为已确认 ContextEdge。

AR2 的现有职责迁移、caller 与基线审计已通过，Molis Work 已完成该叶子的证据与自验。未来 Publication Receipt、异步 Materialization 请求/取消与后台 handler 尚未实现，包成熟度仍为 partial；不能把本次迁移完成说成全部未来能力可用。范围与直接证据见[验收记录](../../specs/molis-work-architecture-reorganization/ar2-validation.md)。
