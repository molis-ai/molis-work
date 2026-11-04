# 架构重组基线：模块合同

状态：架构重组时的设计与合同记录（2026-09，含正文注明的后续补充），2026-11-03 从需求书分出，保留原章节编号。这里的“已确认”“未实现”、目录与接口示例属于当时基线，不是当前包/API 清单；实际层次、成熟度和依赖以[SSOT](../../docs/SSOT-MATRIX.md)与[现行架构](../../docs/system/ARCHITECTURE.md)为准。原 §20.12/§20.14 两个模块及其他已删除机制的说明见[总需求书开头](spec.md)。

[总需求书与验收](spec.md) · [§19 基础包](contracts-foundation.md) · [§20 模块](contracts-modules.md) · [§21 服务](contracts-services.md) · [§22 插件](contracts-plugins.md) · [§23 应用与工具](contracts-apps.md)

## 本册目录

- [20.1 `modules/identity-team-access`（已确认）](#201-modulesidentity-team-access已确认)
- [20.2 `modules/projects`（已确认）](#202-modulesprojects已确认)
- [20.3 `modules/context-ledger`（已确认）](#203-modulescontext-ledger已确认)
- [20.4 `modules/sync-replication`（已确认）](#204-modulessync-replication已确认)
- [20.5 `modules/sources`（已确认）](#205-modulessources已确认)
- [20.6 `modules/signals`（已确认）](#206-modulessignals已确认)
- [20.7 `modules/feed`（已确认）](#207-modulesfeed已确认)
- [20.8 `modules/actions`（目标边界已确认，当前未实现）](#208-modulesactions目标边界已确认当前未实现)
- [20.9 `modules/attention-resumption`（已有最小实现来源）](#209-modulesattention-resumption已有最小实现来源)
- [20.10 `modules/goals`（已确认）](#2010-modulesgoals已确认)
- [20.11 `modules/private-work-context`（已确认）](#2011-modulesprivate-work-context已确认)
- [20.12 `modules/execution`（已确认）](#2012-modulesexecution已确认)
- [20.13 `modules/artifacts`（已确认）](#2013-modulesartifacts已确认)
- [20.14 `modules/evidence-verification`（已确认）](#2014-modulesevidence-verification已确认)
- [20.15 `modules/governance-collaboration`（已确认）](#2015-modulesgovernance-collaboration已确认)
- [20.16 `modules/automation`（目标边界已确认，当前未实现）](#2016-modulesautomation目标边界已确认当前未实现)

## 20. Module Contract

### 20.1 `modules/identity-team-access`（已确认）

**定位：** User、Team、Team membership、principal 与授权判断的唯一事实 owner；不拥有 Project、Plugin install 或业务对象生命周期。

**拥有的事实：**

- User identity、外部登录身份绑定、device / session principal reference 和主体停用状态。
- Team identity、Team membership、Team role 和成员加入、退出、停用历史。
- 未来 Restricted Project 使用的 access grant；grant 只引用 `project_id`，不复制 Project metadata。
- 可重放的 Access Policy version 与 Access Decision 所需的最小授权事实。

**提供的 API：**

- Query：读取当前 principal、安全的 User / Team reference、Team membership 与可管理 Team 列表。
- Command：创建或更新 Team、邀请/加入/移除/停用成员、变更 Team role、管理 future Restricted Project grant。
- Capability：根据 principal、action、resource reference 与 Project access descriptor 返回明确的 allow / deny / reason / policy version。
- Event：IdentityLinked、TeamCreated、MembershipChanged、PrincipalDisabled、AccessGrantChanged 等事实事件。

**边界：**

- 认证协议、OAuth / Passkey / token 校验由 Auth Adapter 完成；Module 接收已经验证的 external identity assertion 并维护产品主体映射。
- Project Module 拥有 `owner_type`、`owner_id` 与 `access_mode`；Access Decision 消费其受信 descriptor，不反向修改 Project。
- Plugin Runtime 保存 install record 与实际 Capability grant；本 Module 只判断操作者是否有权安装 Team Plugin 或改变 grant。
- Kernel 执行 Access Decision，但不拥有 membership、role 或 policy；其他 Module 不各自复制 Team membership 表。
- Team Project 默认只检查有效 Team membership；Restricted Project 的具体角色和 UI deferred，但未来记录位置已确定。

**部署与同步：**

- Personal principal 的本地运行引用可缓存于 Local Host；Team、Membership 和 Team grant 的共享权威位于 Server control plane。
- Server 向 Local Host 提供最小授权投影与版本，Local 离线行为只能在已有有效授权和本地策略允许的范围内进行，并在重连后重新确认。
- 身份控制数据使用 Platform Control Envelope，不包装成 Goal 或 Artifact。

**当前抽取来源与验收：**

- 现有 Project identity、Desktop / Runtime user context 与 Relay Team Host 是迁移输入；不沿用 `Space` 模型。
- 测试覆盖 Personal / Team Project、成员退出、principal 停用、授权版本变化、Team Plugin 安装授权和 Restricted grant 的未来兼容入口。
- 验收要证明 Goals、Artifacts、Feed、Plugin Runtime 与 Server route 不再各自维护 Team membership 判断。

### 20.2 `modules/projects`（已确认）

**定位：** Personal / Team Project identity、归属、生命周期和访问模式的唯一事实 owner；Project 是工作内容的归属上下文，不是 Runtime workspace 或 UI panel。

**拥有的事实：**

- `project_id`、`owner_type: user | team`、`owner_id`、name、status、created / archived metadata。
- `access_mode: team_default | restricted`；具体 membership、role 与 grant 由 Identity, Team & Access 拥有。
- 旧 `board_id` 到 `project_id` 的迁移映射和迁移完成状态。
- Project lifecycle 与不会依赖具体业务 Module 的基础 metadata。
- 本地目录与 Project 的 durable workspace membership；它不等于 Runtime Session identity。

**提供的 API：**

- Query：读取、列出、解析 Project reference，返回授权所需的安全 Project access descriptor。
- Command：创建、重命名、归档、恢复和执行受控 legacy Board migration。
- Event：ProjectCreated、ProjectRenamed、ProjectAccessModeChanged、ProjectArchived、LegacyBoardMapped。

**边界：**

- 不拥有 Team membership、Project grant、Goal / Artifact、Plugin install、Runtime session 或 Desktop panel。它可以保存 Project↔本地目录 membership，但不拥有 Session content、Runtime binding 或桌面面板状态。
- Module 对 Project 的业务引用只保存 `project_id`；需要显示 name 或 owner 时通过 Query / projection 获取，不复制成另一份权威字段。
- Runtime workspace 与 Session 的 Project 关联属于 Private Work Context 或 Context Ledger；Desktop panel 属于 App control state。
- Project archive 不直接级联删除其他 Module 数据；各 owner 消费 ProjectArchived Event 并执行自己的冻结、隐藏或 retention 规则。

**部署与同步：**

- Personal Project 以 Local Host 为权威；Team Project 的 identity、owner、access mode 与 lifecycle 以 Server control plane 为共享权威，并在 Local 缓存投影。
- Project control metadata 使用 Platform Control Envelope，不伪装成 Goal 或 Artifact；Project 内业务内容仍只通过 Goal / Artifact 交换。

**当前抽取来源与验收：**

- `src/projects/catalog.ts` 中 Project CRUD、legacy Board mapping 与 workspace membership 是 AP1 的主要来源；AP4 已迁出 Desktop Panel 规则与 SQL，Runtime context binding 和文件 provisioning/composition 仍分别由 WK1、AP2 迁移。
- AP1 已把 `projects`、`project_events`、`workspaces`、`workspace_project_memberships`、`project_deletions` 的 schema、Repository、规则与迁移 helper 移入 `modules/projects`；旧 Catalog 不再直接读写这些表。
- 当前完成的是已有行为无损迁移：Project 创建/选择/重命名、目录关联、Demo、旧库迁移、删除收据与回滚均保持。Team owner、archive/access mode 等当前基线不存在的能力仍需未来独立功能 Spec。
- 当前测试覆盖正式 Project 身份、workspace membership、旧 Board mapping、schema migration 回滚/幂等，以及原 Catalog 创建、选择、重命名、目录关联、Demo、删除与恢复兼容行为；不以尚未实现的 Team owner、archive/access mode 冒充验收结果。
- AP1 验收记录见 [`ap1-validation.md`](ap1-validation.md)；验收后 `MolisWorkProjectCatalog` 不再拥有 Project 正式事实，但 Runtime、Panel 与文件 staging 仍按 WK1、AP4、AP2 的边界暂留。

### 20.3 `modules/context-ledger`（已确认）

**产品内解释：** “上下文关系与装配”。它是关系账本和上下文装配记录，不是用户一级入口，也不是第二个内容数据库。

**定位：** 跨 Module 对象关系、Personal → Team publication lineage、Materialization Definition 与结果状态的唯一事实 owner；各对象内容仍归原 Module 所有。

**拥有的事实：**

- 类型化 `ObjectRef` 之间的跨 Module `ContextEdge`，包括 relation type、source、cause、actor、scope、time、version 与 provenance。
- User Ledger 与各 Team Project Ledger 的逻辑分区，以及不会泄露 Personal object reference 的 Publication Receipt。
- Materialization Definition、requested input / output reference、materializer capability + version、状态与最终 Receipt。
- relation / materialization 的 tombstone、supersession 与可重建投影 checkpoint；不复制目标对象 payload。

**不进入 Ledger 的关系：**

- Goal 内部依赖、Artifact 内部版本 lineage 等单一 Module 能完整拥有和解释的关系，继续放在对应 Module。
- UI layout、Plugin install、ACK / Cursor、健康状态等 Platform control relation 不伪装成 Context Edge。
- 临时日志、搜索倒排索引和内部 Materialization Handler 的 lease / retry 不成为 Ledger 事实。

**提供的 API：**

- Query：读取对象的 incoming / outgoing relation、按 scope 遍历 lineage、查询 Publication Receipt 和 Materialization 状态。
- Command：在语义 owner 验证后创建/撤销关系、记录 publication、请求/取消 materialization、接收 handler Receipt。
- Event：ContextEdgeAdded / Removed、PublicationRecorded、MaterializationRequested / Completed / Failed。
- Relation type 可以由官方 Module / Plugin Contract 注册，但 Ledger 只校验 descriptor、scope 和引用完整性，不替生产者判断业务关系是否成立。

**Materialization 分工：**

- Context Ledger 记住“要装配什么、由哪个 materializer 处理、当前状态和结果引用”。
- 第一阶段由 Context Ledger package 内部 Materialization Handler 消费 Durable Outbox、调度 materializer，并维护隔离的技术 queue / checkpoint / retry；需要定时或外部 Runtime 时复用 Scheduler / Runtime Host。
- Materializer 通过各 Module Query API 读取获准内容，不能跨 Store Join；完成后通过目标 Module Command 写回。
- 临时 Goal Context Pack、恢复视图或 UI projection 可以作为可重建缓存；需要长期保存、版本化或共享的结果必须发布成 Artifact。

**隐私与共享边界：**

- Personal relation 默认只进入 User Ledger；发布到 Team 时创建 Team Goal / Artifact 或分支，再在 Team Project Ledger 记录 Team-side relation。
- Team Ledger 只保存 Publication Receipt 和 Team object reference，不保存原 Personal object id、路径或私有 lineage。
- 查询与装配必须经过 Access Decision 和各对象 owner 的 Query scope，拥有 edge 不代表自动获得目标内容权限。

**依赖与当前抽取：**

- 依赖 Object Reference / Context Contract、Kernel Capability、自己的 Storage Scope 和 Observability；不依赖其他 Module implementation。
- `src/v1/coordinator.ts` 的 relation / impact / provenance、Feed → Goal link、Session association、Project reference 与规划来源关系是主要抽取点。
- 现有散落在多张表中的同一跨模块关系迁移时必须选定唯一 Ledger record，并保留兼容读层，不能双写为两份权威。

**验收：**

- 测试覆盖重复边、撤销、stale reference、跨 scope 拒绝、Personal → Team 脱敏、materializer 重试/恢复和可重建视图。
- 验收要证明删除 Materialization cache 后可以从 Ledger 与各事实 owner 重建，同时删除 Ledger 不会删除 Goal、Artifact、Feed 或 Work 的原始事实。

### 20.4 `modules/sync-replication`（已确认）

**定位：** Local 事实的发布意图、Personal / Team replica 关系、materialization 状态、冲突处置和用户可见同步状态的唯一 owner；可靠传输由 Exchange 提供。

**拥有的事实：**

- Goal / Artifact publication intent、目标 Team Project、source / published object reference 和 replica relationship。
- 本地版本、已提交 Envelope、已确认远端版本、materialized local version 与同步状态。
- 可恢复的冲突、等待 Plugin consumer、等待用户决定和永久失败记录。
- 用户发起的 retry、branch、discard local projection 等同步处置决定。

**提供的 API：**

- Query：对象发布/同步状态、待处理接收项、冲突、最近 Receipt 与诊断摘要。
- Command：发布 Goal / Artifact、接收 Envelope、重试、确认 materialization、解决冲突或撤销尚未提交的 intent。
- Event：PublicationRequested、EnvelopeAccepted、ReplicaMaterialized、SyncConflictDetected / Resolved、SyncFailed。

**边界：**

- 只调用 Exchange Capability 发送/接收 Envelope，不实现 HTTP、ACK、Cursor、Replay、CAS 或 Blob transfer。
- 只通过 Goals / Artifacts API 创建或更新正式对象，不直接写其 Store；接收自定义 Artifact 时可以等待对应 Plugin consumer。
- Server Exchange Receipt 是传输事实，不自动代表本地业务 materialization 成功。
- Plugin 私有草稿、缓存、日志和未发布数据不进入 Sync Module。

**验收：**

- 详细 Exchange / Sync 分工见 19.3；测试覆盖离线发布、重复 Envelope、缺少 consumer、CAS 冲突、分支、materialization 失败恢复和 Personal source 不泄露。

### 20.5 `modules/sources`（已确认）

**大白话：** “我在听哪里”。

**拥有的事实：**

- `source_id`、owner user、Project context reference、source kind、provider Plugin reference、display metadata 和 lifecycle。
- 用户期望的 enabled / paused / disconnected 状态、监听范围、schedule intent、history import policy 与授权后的 connection reference。
- Source 配置版本、最近一次用户变更和 Provider Binding reference。

**提供的 API：**

- Query：列出/读取 Source、连接状态摘要、期望 schedule 与可用 provider。
- Command：create、configure、enable、pause、resume、disconnect、request sync 和调整 history import intent。
- Event：SourceCreated / Configured / Enabled / Paused / Disconnected、SyncRequested。

**边界：**

- Secret / token 只保存 Keychain reference，不进入 Source Store、日志或 Artifact。
- Listener cursor、poll lease、retry 和 connector process health 属于 Listener / Connector Host 技术状态；Source 只拥有用户期望和最终状态摘要。
- 不保存外部发生的事件、Feed disposition 或 Goal；它们分别属于 Signals、Feed、Goals。
- Local Source 默认个人且本地；选择 Team Project 只表示未来发布目标，不能让原始监听数据自动同步。
- Team Server Plugin 可以在自己的私有 Store 维护 provider-specific source state并发布 Goal / Artifact，不要求 Server 部署完整 Sources Module。

**当前抽取与验收：**

- `src/feed/sources/`、Connector configuration 和 `FeedStore` source methods 是主要来源。
- 测试覆盖 Secret 不落库、pause/resume 与正在执行 listener 的竞态、provider 缺失、配置版本冲突和 Local personal 默认边界。

### 20.6 `modules/signals`（已确认）

**大白话：** “外部那里发生了什么”。

**拥有的事实：**

- `signal_id`、source reference、provider event identity / dedupe key、kind、occurred / observed time 和 provenance。
- 可跨 provider 理解的规范化 metadata，以及指向本地受控 content / blob 的引用。
- Provider revision、supersession、withdrawn 状态和 Signal validation result。

**提供的 API：**

- Query：按 Source、kind、time、object reference 读取 Signal 与 lineage。
- Command：接受 Listener / Import Adapter 产生的 Signal Draft、执行正式 Schema / scope / dedupe 校验、记录 provider update / withdrawal、标记不可消费原因。
- Event：SignalObserved、SignalUpdated、SignalWithdrawn、SignalRejected。

**边界：**

- Listener Host 负责可靠接收和重放，Integration Plugin 的 Listener / Signal Adapter 负责 Provider 格式解析与标准化；Signals Module 决定 Draft 是否成为正式 Signal并拥有最终去重判断。
- 手工导入与历史迁移通过一次性 Signal Import Adapter 调用同一 Command，不需要伪装成长期 Listener。
- Signal 不拥有 read / saved / archived 等用户处置，也不保证进入 Feed。
- Provider-specific 扩展数据默认本地保存；需要长期跨模块共享或跨 Team 交换时，由消费方发布为 Artifact。
- Signal 只记录外部观察事实，不执行 Automation、创建 Goal 或直接写 Feed Store。

**当前抽取与验收：**

- `src/feed/` 的 ingest、item provenance、external id 与 content hydration 是主要来源，需要把抓取机制与 Signal fact 分开。
- 测试覆盖重复事件、provider update、乱序、撤回、无效 payload、同一 Signal 被多个消费者使用和不自动进入 Feed。

### 20.7 `modules/feed`（已确认）

**大白话：** “哪些信息值得展示给当前用户，以及用户怎么处理了它”。

**拥有的事实：**

- Personal Feed Item、来源 Signal / Object reference、进入 Feed 的原因、排序所需稳定 metadata 和当前 disposition。
- unread / read、saved、archived、dismissed 等 Feed 用户状态及变更历史。
- Signal routing decision、进入 Feed 的 reason 和用户明确反馈；可选评估器的临时分数不成为业务真相。

**提供的 API：**

- Query：Feed、Saved、Archive、item detail reference 与 unread summary；Inbox 由 Attention Query 提供，再由 Feed Native Plugin 解析关联 Feed Item。
- Command：consider / accept Signal、mark read、save、archive、restore、dismiss、请求 attention / promote / start。
- Event：FeedItemAdded、DispositionChanged、AttentionRequested、PromotionRequested、FeedFeedbackRecorded。

**边界：**

- Feed Module 消费正式 Signal 与用户 Feed policy，自己决定是否形成 Feed Item并保存 reason 与用户状态。
- 未来复杂或 AI 相关性判断可以通过可选 Relevance Evaluator Capability 返回 score + reason，但 Evaluator 只给建议，不创建 Feed Item、不请求 Attention，也不形成独立事实 owner。
- 进入 Inbox 时通过 Attention Command 创建引用；Feed 只保存 resulting attention reference / Receipt 的兼容投影，不拥有 open / in_progress / done 状态。现有 `disposition=inbox|processing` 在迁移期由两边事实组合投影。
- Promote to Goal 通过 Goals Command 创建正式 Goal，并让 Context Ledger 记录来源关系；Feed 只保存 resulting reference / Receipt，不拥有 Goal。
- Start work 通过 Actions 或 Work Command，不直接创建 Session 或修改 Execution Store。
- Feed 是个人、本地体验，默认不同步给 Team；需要分享的内容发布为 Goal 或 Artifact。
- Feed Native Plugin 负责一级 UI，Module 不拥有页面、排序动画或 Connector 设置。

**当前抽取与验收：**

- `src/feed/store.ts` 的 inbox / feed item / disposition、`src/web/server.ts` 的 Feed mutation 和 `render.ts` 的 Feed 页面是主要拆分点。
- 测试覆盖一个 Signal 多消费者、重复 route、read/save/archive 状态、Attention 请求幂等、promote 幂等、个人默认边界和删除重建 Feed projection。

### 20.8 `modules/actions`（目标边界已确认，当前未实现）

**大白话：** “需要用户可见生命周期、审批或执行结果的一件具体行动”。Personal 与 External Action 放在同一个 Module，但使用不同强类型状态机。

**共同事实：**

- `action_id`、`action_kind: personal | external`、owner / Project scope、requested_by、source reference、intent、created time 和 revision。
- 用户可见 lifecycle、approval reference、result / Receipt reference、cancel / complete history 和 provenance。
- Action 与 Goal、Artifact、Feed Item、Attention、Work Context 的关系通过 Context Ledger 保存；Action 不复制这些对象内容。

**Personal Action：**

- 保存 title / description、priority、due / schedule hint、用户处理状态和完成/取消记录。
- 状态机以 `open → in_progress → done | cancelled` 为基础；未来 snooze 等行为通过独立功能 Spec 增加。
- 默认属于 User、本地且个人；若需要共享，明确发布为 Goal 或 Artifact，不直接同步个人 Action 状态。

**External Action：**

- 保存已注册 external capability、typed operation reference、destination summary、parameter hash / protected payload reference、idempotency key、grant 和 approval requirement。
- 状态机以 `proposed → awaiting_approval → dispatching → succeeded | failed | cancelled` 为基础。
- 第一阶段由 Actions package 内部 dispatch worker 调用 Connector Host 的类型化 Integration Driver 并返回 Receipt；Actions Module 不直接实现 Slack、GitHub、Jira 或其他 Provider API。
- 手工操作、Agent 请求和 Automation 都可以创建 External Action；没有有效 grant / approval 时不得 dispatch。

**提供的 API：**

- Query：Personal / External Action、待处理、待批准、执行结果、来源和关联对象。
- Command：create personal / external、start / complete / cancel personal、approve / reject / dispatch / record receipt external。
- Event：ActionCreated、ActionStateChanged、ExternalActionApprovalRequired / Decided、ExternalActionDispatchRequested / Completed。

**硬边界：**

- Goal Claim / Run 继续属于 Execution，不包装成 Action。
- 普通 Module 内部状态变化不会自动创建 Action；只有需要用户可见生命周期、审批或外部执行 Receipt 的离散行为进入 Actions。
- Actions 不是通用 Command Bus，External Action 只能调用 Manifest 声明、Contract 类型化且实际获准的 external capability。
- Attention 是“为什么需要回来处理”的引用，不是 Action；用户可以从 Attention 明确创建 Action，但系统不自动复制一份。

**当前处理：**

- 仓库没有独立 Personal / External Action 类型、表、Store、API、UI 或测试；`GoalWorkState.next_action` 是派生建议，Feed 操作也不是 Action。
- Relay 的 external write-back 是未来 External Action / Dispatcher 的迁移参考，当前 Molis Work Source Scheduler 不属于 Actions。
- F2 创建 `modules/actions` 的 `contract-only` package、公开 Contract 与边界测试；首个真实用例仍需在对应垂直切片中迁入，不能注册假 Provider、假 Store 或伪成功 API。

### 20.9 `modules/attention-resumption`（已有最小实现来源）

**大白话：** “为什么现在需要用户回来处理，以及应该回到哪里”。它保存个人注意力引用，不保存被引用对象内容，也不执行真正的 Runtime resume。

**第一阶段拥有的事实：**

- 从现有 `InboxEntry` 迁移的 `attention_id`、subject Object Reference、reason、detail、revision、created / updated / completed time。
- 兼容状态 `open / in_progress / done / dismissed`；更完整的 queue、snooze、interruption 和 Resume Snapshot 属于未来功能，不是本次重组前置条件。
- 可选 resume target、Context Pack reference 与产生 Attention 的 Module / Plugin provenance；没有真实数据时不制造占位记录。

**提供的最小 API：**

- Query：列出/读取当前用户 Attention、按状态和 subject 查询、返回可用 resume target。
- Command：request / ensure attention、mark in progress、complete、dismiss、reopen；全部支持 revision conflict 与幂等 key。
- Event：AttentionRequested、AttentionStateChanged、AttentionResolved。

**边界：**

- Feed Item、Goal Decision、Source Fault、Run Result 等 owner 通过 Attention Command 请求用户介入，不能直接写 Attention Store。
- Attention 只保存 subject reference、reason 和恢复引用；详情通过 subject owner Query 获取，权限撤销后必须安全降级。
- Session resume、Draft Dialogue resume 与 Runtime handoff 仍由 Private Work Context / Execution 执行；Attention 只调用相应 Capability 并记录 Receipt。
- Work Capsule 与 Actions Native Plugin 可以组合 Attention Query；UI 排序属于 UI，系统通知和窗口唤起通过受控 Notification / Desktop Adapter 完成。
- Attention 是 User-local 事实，默认不同步给 Team；Team 正式待办或决定需要由 Goal / Artifact / Governance 表达。

**当前抽取来源与迁移：**

- `src/feed/types.ts` 的 `InboxEntryRecord`、`src/feed/store.ts` 的 `inbox_entries` 与状态方法、Web Inbox API / UI、Feed Source fault 和 Goal decision reference 是真实迁移来源。
- 当前 Work Capsule 的 actionable Goal 投影、Session resume 和 Draft Dialogue resume 是未来集成来源，不在 Feed 样板中迁入 Attention Store。
- Feed 样板切片创建最小 `modules/attention-resumption` package；Feed / Source 改为通过 Contract 请求 Attention，旧 Inbox API 暂时作为 Compatibility Facade。

**验收：**

- 保留现有 InboxEntry 创建、去重、revision conflict、完成、dismiss、reopen 和 UI 行为测试。
- 新增边界测试证明 Attention 不复制 Feed / Goal 内容、不直接访问其 Store，删除 Attention 不会删除 subject，subject 权限丢失时不会泄露内容。

### 20.10 `modules/goals`（已确认）

**大白话：** “目标是什么、为什么做、怎样才算完成”。Goals 是官方保护的一等核心，但不吸收所有与 Goal 有关的过程数据。

**拥有的事实：**

- `goal_id`、`project_id`、owner reference、Goal Contract 与 `contract_version`。
- Outcome、completion criteria、constraints、assumptions、scope、Goal type 和生命周期状态。
- Goal 内部 graph / dependency / part-of 关系、Goal policy、risk 和 archive / trash / restore 状态。
- 每次 Contract revision、状态变更和 completion transition 的正式记录。

**提供的 API：**

- Query：读取精确 Contract version、当前 Goal、Goal graph、policy / risk、lifecycle 与基础可执行条件。
- Command：create / clarify / revise contract、修改 Goal 内部关系、更新 policy / risk、activate / archive / restore / trash、请求 complete。
- Event：GoalCreated、ContractRevised、GoalRelationChanged、GoalActivated、GoalCompletionRequested / Completed、GoalArchived。

**完成与组合视图：**

- Evidence & Verification 针对明确 `goal_id + contract_version` 产生 Verification Receipt；Goals 验证 Receipt reference 和适用版本后决定是否进入 completed。
- Goals 不读取 Evidence Store，也不自行执行 Review；Receipt 失效时通过 Event 触发重新验证，不静默回退。
- `GoalWorkState`、`next_action`、当前阻塞原因和 Workbench momentum 是 Goals Native Plugin / application read model 对 Goals、Execution、Evidence、Governance、Attention Query 的组合，不是 Goals Store 中的新权威字段。

**边界：**

- Claim、Run、attempt、runtime error 属于 Execution；Session、Workspace、conversation 属于 Private Work Context。
- Evidence、Review、Verification Receipt 属于 Evidence & Verification；Proposal / Decision 属于 Governance。
- Artifact 和跨 Module lineage 分别属于 Artifacts 与 Context Ledger。
- Goals Native Plugin 是 UI / 应用组合层，`modules/goals` 是事实层；两者不因同名而合并成一个 package。

**共享与版本：**

- Goal 通过官方 Goal Envelope 跨设备 / Team 交换；引用关系只认 `goal_id + contract_version`。
- Contract version 由 Goals Module 递增和解释，Runtime claim/run 状态不进入 Contract version。

**当前抽取与验收：**

- `src/v1/coordinator.ts` 的 Goal CRUD、Contract、graph、policy、risk、lifecycle 与 completion transition，以及 `src/v1/store.ts` 对应表是主要来源。
- 测试必须保留 Contract revision、graph cycle / dangling 校验、policy / risk、archive / trash、completion gate 与旧 `board_id` 兼容行为。
- 验收时 Goals package 不包含 Claim / Run、Session、Evidence row、Review row 或 Proposal implementation。

### 20.11 `modules/private-work-context`（已确认）

**大白话：** “用户在本机具体从哪里工作、对话做到哪里、下次怎样接着做”。它是个人工作上下文，不是 Team 的正式执行账本。

**拥有的事实：**

- Local Workspace reference、Runtime Session registry、Session 与 Project / Goal 的工作关联。
- conversation / terminal content reference、resume target、last known cursor、Session capability snapshot 和用户工作偏好。
- Session handoff lineage、handoff package reference、恢复/转交 Receipt 和本地上下文快照。
- 私人工作笔记与尚未发布的 Context Pack reference；原始 Secret 和外部 Runtime 内部状态仍由 Adapter / Provider 保存。

**提供的 API：**

- Query：列出 Workspace / Session、读取安全内容摘要、关联 Goal、resume capability 和 handoff lineage。
- Command：register / associate / detach workspace、discover / create / resume / archive Session、prepare / send / cancel handoff、保存恢复位置。
- Event：SessionRegistered / Associated / Resumed / Archived、WorkspaceLinked、HandoffPrepared / Delivered / Failed。

**边界：**

- Runtime Host、Terminal / PTY、Codex app-server Adapter 执行具体操作；Module 保存用户可恢复的工作事实与 Receipt。
- 不拥有 Goal lifecycle、Execution Claim / Run、Artifact、Evidence 或 Attention queue；Attention 只引用 resume target 并调用 Work Capability。
- 原始 conversation、workspace path 和私人上下文默认不进入 Team Exchange；需要共享的结论、文件或上下文必须发布为 Artifact。
- Session handoff 是工作上下文转移，不自动代表 Goal ownership、Execution success 或 Team publication。

**当前抽取与验收：**

- `src/sessions/registry.ts`、content / directory / handoff、Project workspace / Runtime binding 和 Desktop session UI 是主要来源。
- 测试覆盖 Runtime unavailable、resume unsupported、Session 外部删除、handoff 重试、workspace path 失效、Project reassociation 和私人内容不进入 Exchange。
- 验收时兼容 Project Catalog 不再拥有 Session / Runtime binding；Project↔本地目录 membership 留在 Projects Module，Execution Store 也不能复制 conversation 或 terminal content。

**WK1 本次执行合同：**

- 保留现有 `~/.molis-work/sessions/sessions.db`、schema version 3、内容目录和 AES-256-GCM 文件格式，不迁移或重写用户内容；旧 Registry owner marker 作为兼容数据格式标识继续接受。
- `modules/private-work-context` 接管 Session identity、Runtime native identity/correlation、surface、Project/Goal/Workspace association、Goal history、私有 Session event、handoff record、legacy migration receipt 和 Runtime context binding facts。
- 原 `src/sessions/registry.ts` 不能原样搬迁。新实现按 Session、Event、Handoff、Legacy Migration、Content Store 和 Runtime Context Binding Repository 拆分，单个 owner 文件不得超过 500 行；旧路径只保留打开 SQLite/目录的技术 adapter 与兼容 re-export。
- Project Catalog 的项目选择、workspace membership 与创建 Project 事务仍属于 Projects application composition；但 `runtime_context_bindings`、binding events、setup request 和 suggestion rejection 的 schema、mapping 与 SQL 由 Private Work Context Repository 拥有，Catalog 只调用公开 Repository/API。
- 原生 Runtime 内容读取、resume 调用、Codex transport、PTY capture transport 和 Handoff 实际发送由 WK2/WK3 继续迁移；WK1 只保存可恢复的本地事实、加密内容和发送状态，不吸收 Runtime process/Adapter。
- 私有内容继续只落本机加密 Content Store；metadata 会过滤 token、secret、body、content、env 等敏感字段。WK1 不增加 Exchange/Team 同步，不把 Session 内容自动发布为 Artifact。
- 现有 `src/sessions/types.ts` 仅保留 Runtime Adapter / UI composition 类型并 re-export Private Work Context Contract；业务 caller 和新测试使用 public package entrypoint，旧 import 作为有明确删除条件的兼容面。
- 验收必须覆盖创建/发现/关联、late native correlation、跨 Project 隔离、加密内容、事件幂等、handoff 重试与中断恢复、legacy migration、Catalog binding/rebind/unbind/idempotency、重启恢复和旧 caller 兼容。

### 20.12 `modules/execution`（已确认）

**大白话：** “谁或什么正在尝试完成 Goal，这一次执行发生了什么”。

**拥有的事实：**

- Execution request、Claim、Claim lease / ownership、Run、attempt、role、state、start / finish / cancel 和 idempotency record。
- Runtime invocation reference、input Contract reference、technical / business outcome classification 和执行 Receipt。
- Rework request、retry lineage 与影响后重新执行的要求；Evidence revalidation 仍归 Evidence & Verification。

**提供的 API：**

- Query：可领取执行项、Claim / Run / attempt、当前执行状态、失败原因和 retry lineage。
- Command：request execution、claim / renew / release、start / finish / fail / cancel Run、request rework。
- Event：ExecutionRequested、ClaimAcquired / Released / Expired、RunStarted / Finished / Failed / Cancelled、ReworkRequested。

**边界：**

- Goals 提供精确 Goal Contract reference；Execution 不修改 Goal Contract、Goal status 或 completion。
- Runtime Host 实际启动 Agent / process 并返回 Receipt；Execution 不实现 Codex、Terminal、container 或 remote provider 协议。
- Private Work Context 保存 Session 与 conversation；Execution 只保存可追溯 session / invocation reference。
- 执行输出需要长期保存或共享时发布为 Artifact；“Run 成功”不自动等于 Goal 完成或 Evidence 充分。
- Team 共享仍通过 Goal / Artifact；本地 Claim / Run 技术细节默认不直接同步为 Server 业务表。

**当前抽取与验收：**

- `src/v1/coordinator.ts` 的 available / select / claim / renew / release、Run、rework 与对应 Store 是主要来源。
- 测试覆盖 Claim + Run 原子性、lease expiry、并发 claim、重复 finish、runtime failure、cancel、rework 和 Goal Contract version pinning。
- 验收时 Execution package 不依赖 Goals Store、Evidence Store、Session Registry implementation 或具体 Runtime Adapter。

**EX1 当前实现事实：** `modules/execution` 已接管 Claim/Run public types、SQLite schema、migration 2/6/7 与 migration 30 的 Execution backfill、Repository、lease 状态机、Run 状态机和过期恢复。旧 `src/v1/coordinator.ts` 已清除 Claim/Run SQL，仅保留 Goal action eligibility、Contract revision、幂等和跨 owner reconciliation；旧 Store snapshot 与 Project 删除保护改走公开 Execution Repository。Web/CLI/MCP 仍通过 Coordinator compatibility application entry，最终入口和 action projection 切换归 EX4。验证与剩余边界见 [`ex1-validation.md`](ex1-validation.md)。

**EX2 当前实现事实：** `modules/evidence-verification` 已接管 Evidence/Correction public types、SQLite schema、migrations 17–20 与 migration 30 Evidence columns、Repository、项目文件/Markdown locator 预检、不可变 Correction 状态机、返工 freshness 和 criterion coverage。旧 `src/v1/coordinator.ts` 已清除 Evidence SQL，只保留 Goal/Run 授权、Contract revision、action token、幂等和跨 owner reconciliation；Store snapshot、Action Projection 的纯 coverage 规则和 Web 项目引用均改走公开入口，旧 `src/evidence/locator.ts` 已删除。Review/Proposal/Decision 仍归 EX3，最终 Web/CLI/MCP application facade 切换归 EX4。验证与剩余边界见 [`ex2-validation.md`](ex2-validation.md)。

**EX3 当前实现事实：** `modules/governance-collaboration` 已接管 Review obligation、Review、Contract Proposal、Candidate、Rewire、Goal Tree Proposal/Item/Decision 的 public types、SQLite schema、migrations 3/9/10/14/27/28、Repository、Review lifecycle、正式状态机和原子物化边界。`src/v1/store.ts` 不再保存 Governance schema/migration/mapping/snapshot SQL，`src/v1/coordinator.ts` 不再保存 Governance 表 SQL 或直接访问其 Repository，所有正式写入均经过 `GovernanceApplicationApi`；Planning 继续只做分析，确认后的 Goal/Relation 仍由 Goals owner 写入。Web/CLI/MCP/Action Projection 的执行验收入口归 EX4；Draft Dialogue/Goal Tree 决定的入口收口保持独立。验证与剩余边界见 [`ex3-validation.md`](ex3-validation.md)。

**EX4 当前实现事实：** `plugins/native/goals` 已接管 `ExecutionValidationApplicationApi`、Goal work/action projection、Contract revision 与 Human Review attention token 规则；旧 `src/v1/action-projection.ts`、`contract-revisions.ts`、`human-review.ts`、`parent-completion.ts` 已删除。Web、CLI、MCP 各自通过 App adapter 使用同一执行验收端口，Coordinator 不再暴露 Claim、Run、Evidence、Correction、Review 或 action/work projection 的公开方法。Workbench 的 Claim/Run/Evidence/Review renderer 也已从 `src/web/render.ts` 移入独立 UI contribution。EX4 的 accepted Contract 是 Claim → Run → Evidence → Review/Decision 执行验收链；Draft Dialogue 与 Goal Tree Proposal/Decision 的入口收口不冒充本切片成果，仍需后续 Goal 处理。验证与剩余边界见 [`ex4-validation.md`](ex4-validation.md)。

### 20.13 `modules/artifacts`（已确认）

**大白话：** “工作产生并需要保存、版本化、引用或共享的结果”。Artifacts 是官方保护的一等 Plugin / Module 能力，但不吸收生产这些结果的原模块。

**拥有的事实：**

- `artifact_id + version`、Project / owner、producer Plugin ID + version + signature identity、`artifact_type_id + schema_version`。
- 标准 Artifact Envelope、metadata、content / blob reference、hash、size、created time 和 publication state。
- Producer 声明的版本 lineage、supersession reference 与可消费性状态；平台不额外规定 Canonical Head。

**提供的 API：**

- Query：按精确 `artifact_id + version` 读取 Envelope / metadata、解析 content handle、列出 Project Artifact 与 producer lineage。
- Command：publish / register version、attach blob、record consumer Receipt、mark unavailable / superseded、接收 Exchange materialization。
- Event：ArtifactPublished、ArtifactVersionRegistered、ArtifactUnavailable、ArtifactConsumed。

**边界：**

- 生产 Plugin 自己决定什么时候版本递增和版本含义；Artifacts Module 验证 identity、schema reference、hash、权限和引用完整性。
- Artifact Type 是独立 Contract，不绑定某个生产 Plugin；任何声明并满足该 Contract 的 Plugin 都可以生产，消费方按 Type Contract 而不是 producer identity 判断能否解析。
- 自定义 Payload 可以保持 opaque；只有拥有对应 Plugin / schema consumer 的接收端解释业务内容。
- Artifact 内容不自动成为 Evidence、Goal outcome 或 Context relation；消费方通过各自 Command 和 Ledger relation 明确表达。
- 大文件 bytes 由 Storage / Blob Adapter 保存，Team 传输由 Exchange 完成；Artifacts 保存正式 handle 和业务 envelope。
- Plugin 草稿、缓存、日志、设置和 Secret 不因存入 Plugin Store 就成为 Artifact。

**当前抽取与验收：**

- 当前 Goal output / Evidence attachment / file reference、Session handoff package 与 Relay / Loreport result data 是迁移输入；只有符合 Artifact 定义的持久结果迁入。
- 测试覆盖相同 ID 多版本、producer signature 变化、hash mismatch、缺少 consumer、opaque payload round-trip、Blob unavailable 和 Personal → Team publication。
- 验收时 Server 无需加载 Artifact Payload Schema 仍能交换，Artifacts package 也不导入 producer Plugin implementation。

**AR1 本次执行合同：**

- 当前基线没有正式 Artifact 表或 Repository；Run `output_refs`、Evidence locator、Feed/Session `content_ref` 都只是各 owner 的现有引用，AR1 不依据字符串格式猜测并回填 Artifact。已有结果入口和明确转换归 AR3。
- `modules/artifacts` 建立 `artifacts` identity 与 `artifact_versions` 两层正式事实。生产 Plugin 显式提供严格递增的整数 version；平台只以精确 `artifact_id + version` 维护引用，不额外发明 mutable/immutable 或 canonical head 状态。
- 同一 Artifact lineage 固定 `owner_actor_id + producer_plugin_id + binding_signature`；Plugin package version 可以随 Artifact version 更新。binding signature 变化视为另一个 Plugin，必须使用新的 Artifact ID。
- 内容只接受可往返的 opaque JSON 或经过 Storage 校验的 content reference。Module 保存 type/schema、digest、size、metadata、scope 和 provenance，但不解释 Plugin payload。
- 本地创建默认 `personal`；注册 `team_project` 版本必须携带明确的用户共享授权。Module 只记录授权后的事实，不实现 Team membership 或 Server 同步。
- 同一 `artifact_id + version` 的完全相同重放返回原记录；内容或 envelope 不同则拒绝覆盖。Blob 可用性和 archive 是精确版本的运行状态，不改变内容身份。
- AR1 只提供 public Contract、Repository、Module application API、root composition 与独立测试；Artifacts Native Plugin 的浏览、嵌入、下载和现有输出 caller 切换归 AR3。

### 20.14 `modules/evidence-verification`（已确认）

**大白话：** “用什么证明 Goal 达标，以及谁/什么检查过”。

**拥有的事实：**

- Evidence item、来源 Object / Artifact / Run reference、适用 `goal_id + contract_version` 与 criterion mapping。
- Verification check、result、method / verifier reference、Review obligation、Review decision 和失效原因。
- Goal completion 使用的 Verification Receipt、receipt version、覆盖 criteria 与有效状态。

**提供的 API：**

- Query：Goal Contract version 对应 Evidence、未满足 criterion、pending Review、Verification Receipt 与 revalidation state。
- Command：submit / withdraw evidence、request verification / review、record check / review result、invalidate / revalidate receipt。
- Event：EvidenceSubmitted / Withdrawn、VerificationRequested / Completed / Invalidated、ReviewRequired / Decided。

**边界：**

- 从 Goals Query 获取明确 Contract version 和 criteria，不修改 Goal Contract 或直接 complete Goal。
- Verification Runner / Reviewer Plugin 执行检查；Module 保存正式结果与 Receipt。
- Evidence 可以引用 Artifact / Run，但不复制 Payload、执行日志或 Artifact bytes。
- Human evidence review 属于本 Module；改变 Goal Contract、批准治理提案属于 Governance。
- Contract revision、Artifact supersession 或来源失效通过 Event 触发 revalidation，不由 Coordinator 跨表修补。

**当前抽取与验收：**

- `src/v1/coordinator.ts` 的 evidence / review / completion check / revalidation 与对应 Store 是主要来源。
- 测试覆盖 criterion coverage、错误 Contract version、withdraw / supersede、pending human review、receipt invalidation、revalidation 和 Goals completion handoff。
- 验收时 Evidence package 不写 Goal status，也不运行具体测试命令或 Agent；这些通过 verifier / Runtime Capability 完成。

### 20.15 `modules/governance-collaboration`（已确认）

**大白话：** “谁提出了什么改变、谁确认了什么、最终决定是什么”。它管理正式提案和决定，不取代 Team membership 或 Module 自己的状态机。

**拥有的事实：**

- Proposal、proposal version、change set / target reference、proposer、required decision、expiration 和 provenance。
- Approve / reject / request changes 等 Decision、actor、confirmation source、decision time 和 execution Receipt reference。
- 协作中的 comment / rationale reference、冲突和尚未 materialize 的决定状态。

**提供的 API：**

- Query：读取 proposal / version、pending decision、历史决定、目标 materialization 状态和冲突原因。
- Command：propose / revise / withdraw、approve / reject / request changes、record materialization Receipt。
- Event：ProposalCreated / Revised / Withdrawn、DecisionRecorded、MaterializationRequested / Applied / Conflicted。

**边界：**

- Identity, Team & Access 判断 actor 是否有权提出或决定；Governance 保存已经验证的正式决定。
- Proposal 不在确认前修改 Goals、Artifacts 或其他 Module；确认后通过目标 Module Command materialize，并记录 Receipt。
- Goal Tree / Contract proposal 属于 Governance，但 materialized Goal 与 relation 仍归 Goals / Context Ledger。
- Evidence Review 判断证据是否充分；Governance Decision 判断是否接受一次产品/协作变更，两者不能混成同一个 review 表。

**当前抽取与验收：**

- EX3 已把 `src/v1/coordinator.ts` 与 Store 中的 goal-tree / contract / candidate / rewire proposal、Review、Decision、confirmation provenance、状态机和 conflict 持久化迁入 `modules/governance-collaboration`。
- 调用方只持有公开 `GovernanceApplicationApi`；授权与跨 owner 编排留在兼容应用层，Decision 与目标 owner Command 通过 Governance 原子边界共同提交或整体回滚。
- 测试覆盖 proposal version pinning、过期、部分决定、重复确认、未授权 actor、materialization 失败回滚、retry、Review obligation 与审计来源。
+ Governance package 不直接写 Goals / Context Ledger Store，未确认建议不会进入 canonical Goal graph；EX4 已切换 Web/CLI/MCP 的执行验收与 Action Projection 入口。

### 20.16 `modules/automation`（目标边界已确认，当前未实现）

**大白话：** “什么事情发生时，按什么规则产生哪一种 Action”。Automation 是 Action 的通用 Trigger / Rule owner，不执行外部副作用。

**未来拥有的事实：**

- `automation_id`、owner / Project scope、enabled state、trigger descriptor、condition、Action template reference 和 revision。
- Trigger subscription reference、最近触发、Automation Run、condition evaluation result、产生的 `action_id` / Receipt 和失败状态。
- 用户 enable / disable、修改规则、手工触发与冲突历史。

**Trigger 来源：**

- time / schedule、Signal、Goal Event、Artifact Event、Attention Event 或用户手工触发。
- `horizontal/scheduler` 只负责到点唤醒，Module Event subscription 只负责投递候选；Automation 决定规则是否匹配和是否创建 Action。

**未来 API：**

- Query：rule、enabled state、trigger history、Automation Run 和产生的 Action reference。
- Command：create / revise / enable / disable rule、evaluate trigger、manual trigger、record Action creation Receipt。
- Event：AutomationCreated / Revised / Enabled / Disabled、TriggerMatched、ActionRequested、AutomationRunFailed。

**边界：**

- Automation 只通过 `modules/actions` 的类型化 Command 创建 Personal / External Action，不直接调用外部 Provider。
- Action approval、lifecycle、dispatch 和 Receipt 归 Actions；Scheduler lease / retry / clock wakeup 归 Horizontal Scheduler。
- Source 定时拉取是 Sources 的 schedule intent + Scheduler 的技术执行，不创建 Automation 或 Action 记录。
- Automation 不是通用 Event Bus 或任意脚本执行器；第一阶段只输出已注册的 Action template。未来若需要直接调用其他 Module Command，必须新增明确 Contract，不静默把 Actions 变成万能 Command Bus。
- Automation rule 默认属于 User / Local；Team Server Plugin 的规则由该 Plugin 私有状态维护，正式 Team 输出仍通过 Goal / Artifact。是否提供官方 Team Automation Module 是后续产品决策。

**当前处理：**

- 当前仓库没有通用 Automation rule、run、API 或 UI；`FeedSourceScheduler` 只是 Horizontal Scheduler 的已有迁移来源。
- F2 创建 `modules/automation` 的 `contract-only` package、公开 Contract 与边界测试；首个真实自动化用例仍需单独功能 Spec，不能注册假 Provider、假 Store 或伪成功 API。
