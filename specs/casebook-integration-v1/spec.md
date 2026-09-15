# Molis Work Casebook Integration V1

状态：`V1 Contract / implementation input`

本文件只定义 Molis Work 对内部 Casebook 的两个集成面：授权化规划导出，以及官方静态 Showcase 的接收与发布。Casebook 的内部成员、记录、复盘和素材包不属于本仓库，也不得以隐藏页面、私有分支或普通用户不可见目录的方式存放在 Molis Work 中。

本规范是实现输入，不表示导出服务、公开页面、真实项目试点或用户验收已经完成。

## 1. 结果与责任边界

Molis Work 负责：

- 判定一个项目是否首次完成正式 Goal Tree 拆解；
- 向符合资格的内部成员最多展示一次 Casebook 邀请；
- 保存项目级 Casebook export authorization；
- 只读导出 allowlist 内的正式规划事件；
- 定义官方 Showcase 接受的静态 Artifact 契约；
- 保存官方页面实际的发布、更新与撤回状态和收据。

Molis Work 不负责：

- GitHub Organization 成员登录和 Casebook maintainer 名单；
- `Case`、`SourceEvent`、`FrictionReport`、`CaseReview`、`ShowcasePackage`；
- Casebook 附件、内部判断、改进候选或脱敏工作流；
- 自动把 Casebook 建议写回 Goal、关系、Risk、Evidence 或 Review；
- 在运行时连接私有 Casebook 以渲染公开页面。

Goal、Relation、Risk、Goal Tree Proposal、Evidence、Review 与规划事件继续以 Molis Work 为唯一事实源。Casebook 只能保存授权后的派生副本和内部判断。

## 2. 复杂度边界

### 当前必须

- 复用现有 Goal Tree Proposal 与项目身份，不新增第二套 Plan/Goal 状态；
- 一个项目级授权状态和一次性邀请记录；
- 一个严格 allowlist 的版本化导出契约；
- 一个只接受已批准静态 Artifact 的官方 Showcase 入口；
- 明确的失败、暂停、移除、撤回和人工恢复路径。

### 可以延后

- CMS、自动分发、多渠道运营；
- 通用第三方导出平台；
- 多级审批引擎和细粒度项目成员权限；
- 历史暂停区间的自动回填。

### 应当删除

- Casebook 直读 Molis Work SQLite、仓库或完整 snapshot；
- 静默加入、静默上传和自动创建外部 Issue；
- 公开页面运行时请求私有 Casebook；
- Molis Work 与 Casebook 共同写授权状态或官方发布状态；
- 两个仓库各维护一份同等权威的 Schema。

## 3. 首次邀请与项目授权

“首次完成正式拆解”唯一判定是：项目第一次成功应用一份同时包含至少一个子 Goal 和至少一条 `part_of` 关系的 Goal Tree Proposal。

- 项目创建、项目绑定、空 Draft、单独保存 Contract 和提交摩擦均不触发。
- 对符合条件且已验证为 `adeptify` Organization 成员的当前主体最多展示一次邀请。
- 只有主体预览导出范围、作 authority attestation 并明确确认后，授权才进入 `active`。
- 拒绝或关闭邀请不加入；FrictionReport 不隐式加入。
- `join | pause | resume | remove` 都必须来自当前交互中的明确用户动作，并使用幂等键。

Molis Work 保存的授权事实至少包含：项目引用、状态、authorization epoch、邀请是否展示、最后动作与审计主体。Casebook 的 `Case.state` 只是其内部生命周期，不能覆盖 Molis Work 授权事实。

## 4. 规划导出契约

机器可读规范见 [`contracts/planning-export.schema.json`](contracts/planning-export.schema.json)。Molis Work 是该契约的唯一所有者和生产者；Casebook 按明确版本消费。

### 4.1 逻辑操作

1. `read_casebook_eligibility(project_ref)`：读取首次正式拆解、邀请是否展示和当前授权；不得创建授权。
2. `set_casebook_authorization(project_ref, action, authority_attestation, idempotency_key)`：动作限 `join | pause | resume | remove`。
3. `read_planning_events(project_ref, after_cursor, limit, schema_version)`：仅在授权为 `active` 时返回 allowlist 事件。

具体传输可使用 HTTP、MCP 或进程内接口，但不得改变授权、版本、游标、字段白名单和失败语义。

### 4.2 默认允许的事实

- accepted Goal Contract 及 decomposition state/review；
- active/inactive Goal Relation 的端点、类型、理由；
- Risk 的描述、概率、影响、处理策略、门禁、状态与责任；
- 已决定 Goal Tree Proposal 的 summary、narrative、逐项理由与决定结果；
- decomposition review 使用的 planning method ID、名称、类型、摘要、来源引用与内容 digest；
- Board 事件 ID、sequence、occurred_at、对象引用与 source digest。

### 4.3 默认禁止的事实

- Claim、Lease、Run 与 Runtime 能力；
- Evidence 正文、文件内容、仓库内容和终端输出；
- ClarificationTurn 用户原话、原始对话、提示词和隐藏推理；
- GitHub token、Molis Work control token、环境变量、连接串和私钥；
- 未正式应用的 Draft、Candidate 或 Proposal；
- Casebook 内部记录、成员组织资料及任何 schema allowlist 外字段。

扩大默认范围必须取得新的、可审计的用户授权并升级契约版本，不能通过整体 snapshot、SQLite 或仓库扫描绕过。

## 5. Cursor、幂等、版本与错误

- `events.seq` 是单项目单调递增游标；返回事件必须连续且严格递增。
- 请求 `after_cursor` 必须等于消费者最后确认的 cursor；gap、乱序和越界整批失败。
- 暂停立即停止新导出；恢复默认从恢复时的当前点继续，不自动回填暂停区间。
- 新授权产生新的 authorization epoch，移除前的数据不得跨 epoch 重放。
- 同一 idempotency key 的相同授权请求返回原结果；不同请求返回 `idempotency_conflict`。
- V1 只支持 `schema_version = 1.0.0`，未知版本和未知字段 fail closed。

规范错误：

| code | 含义 | 恢复 |
| --- | --- | --- |
| `not_authorized` | 未加入、暂停、移除或权限失效 | 由用户显式操作，不自动扩权 |
| `unsupported_schema_version` | 生产者与消费者无共同版本 | 升级一方或使用共同支持版本 |
| `unknown_field` | 响应含 allowlist 外字段 | 整批拒绝并修正生产者 |
| `cursor_gap` | 游标不连续、乱序或过期 | 不推进确认游标，人工决定恢复方式 |
| `idempotency_conflict` | 同 ID/key 对应不同内容 | 停止并调查来源 |
| `membership_revoked` | 当前主体不再是内部成员 | 终止高权限动作并暂停授权 |
| `private_data_detected` | 公开 Artifact 出现私有字段 | 阻止发布并进入删除/撤回流程 |

## 6. 官方静态 Showcase 契约

机器可读输入见 [`contracts/showcase-artifact.schema.json`](contracts/showcase-artifact.schema.json)。Molis Work 是该公开入口及官方发布状态的唯一所有者；Casebook 生成符合该契约的静态内容，但不能宣称官方页面已经发布或撤回。

Molis Work 只接受满足以下条件的 Artifact：

- Casebook 内部 Package 已完成脱敏、权利检查和非主要作者独立批准；
- 不含 `case_id`、`project_ref`、SourceEvent ID、内部 actor reference、原始 evidence locator、私库 URL 或凭据；
- 每项公开 claim 都标明 evidence summary、证据层级与 `verified | unverified`；
- 工程验证、产品实操、用户验收和市场结果不互相提升；
- 构建及运行时不依赖私有 Casebook。

Casebook 提交的 Artifact 状态只能表达“已批准、可供发布”。Molis Work 完成实际发布后生成自己的发布收据；更新和撤回使用相同 `showcase_id`、递增版本及人工动作。Casebook 可以保存收据引用作为派生记录，但不得成为官方发布状态的第二写入者。

## 7. 删除、撤回与失败恢复

- `pause` 停止新导出，不删除既有 Casebook 数据。
- `remove` 立即拒绝后续导出，并向 Casebook 发出可审计的删除意图；私有记录的实际删除由 Casebook 负责。
- 项目移除后禁止新发布。既有公开页面必须由 maintainer 明确选择 `retain` 或 `withdraw`；Molis Work 执行并记录官方结果。
- 发布或撤回失败时保留待办和最后已知官方状态，不伪装完成。
- 第三方已经复制的公开内容无法保证删除，授权说明必须如实披露。

## 8. 已知 Molis Work 契约缺口

当前真实数据曾出现 `decision_method = product_walkthrough`，但 Molis Work TypeScript 与 MCP Contract 只允许 `automated_check | measurement | inspection | human_decision`。这是 Molis Work 输入验证缺口，不是 Casebook 新枚举。

在 Molis Work 提供受支持的修复路径前：

- 导出必须拒绝非法 canonical 值，不能静默映射；
- 受影响 Goal 不能只凭 Runtime Evidence 宣称完成；
- 不得直改 SQLite；
- 不得扩张 planning-export Schema 来迁就非法值。

## 9. 验证边界

Fixture 和契约测试见 [`fixtures/contract-cases.json`](fixtures/contract-cases.json) 与 [`contracts.test.mjs`](contracts.test.mjs)。它们验证 Schema 严格性、版本拒绝、字段白名单、游标和公开隐私边界，只能证明契约包，不证明导出实现、官方页面、产品实操或用户验收。
