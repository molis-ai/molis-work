# Molis Work 产品族与模块架构草案（历史输入）

状态：已被新的架构 SSOT 取代，仅保留为讨论和来源记录
日期：2026-09-01
替代文档：[`docs/SSOT-MATRIX.md`](SSOT-MATRIX.md) 与 [`specs/molis-work-architecture-reorganization/spec.md`](../specs/molis-work-architecture-reorganization/spec.md)

本文记录了 Molis Work、Relay、Loreport 重组讨论的早期输入，其中 `Space`、Server 业务边界、模块吸收关系等内容已经被后续决定修改。不要据此创建 package、实现功能或判断事实 owner；需要追溯早期思路时再阅读。

## 1. 为什么需要重新整理

当前讨论同时涉及四类问题：

1. 个人如何管理注意力、轻量事务和持续工作线；
2. 团队如何协作、拆解 Goal、交接和接续；
3. 邮件、IM、社媒、RSS 等外部信息如何进入工作系统；
4. Desktop 与 Server 各自保存什么、在哪里执行、如何同步。

如果直接按 Molis Work、Relay、Loreport 三个现有产品分配功能，很容易把产品名、部署位置、领域对象和 UI 页面混在一起。因此后续采用以下顺序：

1. 划分领域模块；
2. 定义每个模块唯一拥有的实体、状态和内部工作流；
3. 定义模块之间的命令、事件和对象关联；
4. 再决定模块在 Desktop、Server 或两端的部署方式；
5. 最后设计同步、权限、存储和 UI。

## 2. 当前已经确认的产品方向

### 2.1 Goal 是个人与团队之间的连续主线

Molis Work 既不只解决个人注意力，也不只解决团队任务管理。共同核心是 Goal continuity：一个结果从被提出、澄清、拆解、执行、阻塞、交接、复核到完成，始终可以被理解和继续。

- 个人侧关注：我现在应该注意什么、哪些事情值得承诺、如何从上次状态继续。
- 团队侧关注：共同推进什么、如何拆解和认领、如何交接、哪些决定和证据已经成为共享事实。

### 2.2 轻量事务不必全部成为 Goal

个人可以保留不需要完整 Goal Contract 的轻量事务。它们可以被完成、忽略、延期、关联到已有 Goal，或在需要持续投入和验收时升格为 Goal。

### 2.3 外部信息首先是 Signal，不是 Goal

邮件、IM、社媒、RSS、网页查询等外部内容首先进入事件流或 Feed。用户或团队随后决定：

- 忽略或归档；
- 收藏为参考；
- 创建轻量 Action；
- 关联已有 Goal；
- 创建个人 Goal；
- 通过 Promotion 提交为 Team Goal。

用户界面可以使用“一键升格”，但领域层不直接改变原对象类型。系统创建新 Goal，并保留它与原始 Signal、FeedEntry 或 Action 的来源关系。

### 2.4 Server 可以保存 Feed，不只是保存 Goal

Molis Work Server 可以运行云端 Connector、保存个人或团队 Feed，并同步给 Desktop。来源可以选择不同的执行、凭据和存储策略：

- 公共 RSS、公开网页和公开社媒适合默认在 Server 持续同步；
- Gmail 等私人账号可以由用户在 Desktop 登录，也可以在云端完成 OAuth；
- 云端 Connector 获取的内容由 Server 可靠同步到用户自己的 Desktop；
- 本地 Connector 获取的内容可以仅保存在本地，也可以按用户选择同步元数据、摘要或完整内容。

### 2.5 当前 Molis Work 是个人端的起点

当前 Molis Work 保留本地优先、Goal 管理、Runtime 接入和真实执行状态能力，并逐步转化为 Molis Work Personal / Molis Work Desktop，即个人工作台。

### 2.6 Loreport 是 Molis Work Server 的候选基础

Loreport 已经设计了 Team Space、IAM、Proposal/Review、共享 Context、Decision、Artifact 等概念，但目前主要是产品和架构文档。因此不再优先发展为一个独立产品，而是作为 Molis Work Server 的设计和实现基础候选。

### 2.7 Relay 是可部署在两端的能力层

Relay 不应被整体归入 Desktop 或 Server。它的 Connector、Source、同步、去重、凭据、Conversation Link、回写和执行适配能力，应整理成能够运行在不同 Host 的共享模块：

- Relay Desktop Host：本地账号、本地应用、本地文件和本地 Runtime；
- Relay Cloud Host：公共 Feed、云端 OAuth、团队 IM 和持续在线同步。

Relay 自己已有的 Team Workspace、Goal 相似状态和权限系统不应继续与 Molis Work Server 平行扩张。

### 2.8 团队共享上下文与个人任务上下文必须分开

团队共同拥有已经接受的 Project Context：Goal、Decision、Evidence、Canonical Artifact、共享关系和可追溯历史。个人拥有自己正在完成某项 Task 的私人上下文：Prompt、草稿、失败尝试、临时笔记、详细 Run 记录和未完成判断。

Task 的目标、负责人和公共状态可以对团队可见，但私人过程默认只对负责人及其明确授权的 Runtime 可见。结果和过程不会因 Run 完成、管理员身份或对象之间存在关系而自动共享。负责人必须主动选择仅结果、结果与证据、或选定的完整工作记录，再通过 Proposal 交给有权限的人复核。

### 2.9 团队接受与实际落地是两个阶段

Reviewer 接受 Proposal 表示团队做出了一个 Decision，并同意一组精确变更；它不证明 Artifact、Goal 和 Relation 已经全部更新。跨领域变更必须由可恢复的 Materialization Operation 逐项落地，保留 Revision、幂等身份、Receipt、冲突和未知结果。界面必须分别显示“决定已接受”“正在应用”“已成为共享真相”“失败”和“结果不确定”。

## 3. 产品族的当前假设

```text
Molis Work
├── Molis Work Desktop / Personal
│   ├── Personal Feed
│   ├── Personal Action
│   ├── Attention & Workline
│   ├── Personal / synced Goal
│   ├── Private Task Context
│   ├── Disclosure Builder
│   ├── Local Relay Host
│   └── Local Runtime / Run / Evidence
│
└── Molis Work Server
    ├── Personal Cloud Space
    ├── Team Space
    ├── Cloud Relay Host
    ├── Feed Storage & Delivery
    ├── Goal Graph
    ├── Promotion & Review
    ├── Sealed Disclosure Bundle
    ├── Handoff & Collaboration
    ├── Shared Decision / Artifact / Evidence
    └── Context Ledger & Materialization
```

这张图只表达产品边界，不等于代码仓库、进程或微服务边界。

## 4. 领域模块地图

### 4.1 Identity & Space

职责：定义人、团队、设备、空间、成员关系和权限边界。

主要实体：

- User
- Actor
- Device / Node
- Space（personal / team）
- Membership
- Role
- Grant

本模块不拥有 Feed、Goal 或 Artifact 内容，只决定谁能读、写、决定和分享。

### 4.2 Source & Connector

职责：连接外部系统，管理凭据引用、同步游标和真实读取状态。

主要实体：

- SourceDefinition
- ConnectorInstallation
- CredentialRef
- SourceSubscription
- SyncRun
- SyncCursor
- ConnectorReceipt

内部工作流：

```text
register → authorize → active → sync → degraded / paused → reauthorize / revoke
```

本模块只负责可靠观察外部世界，不决定一条内容是否值得处理。

### 4.3 Signal & Feed

职责：规范化、去重、关联来源，并把 Signal 分发到用户或团队的 Feed。

主要实体：

- SourceEvent：Provider 事件或读取结果
- Signal：规范化、可追溯的外部内容
- Feed：用户或空间中的信息流
- FeedEntry：Signal 在某个 Feed 中的投影
- FeedDisposition：unread / seen / saved / dismissed / acted / linked
- Provenance
- DeliveryReceipt

一个 Signal 可以进入多个 Feed；每个用户拥有独立的 FeedEntry 阅读和处理状态。

内部工作流：

```text
observed → normalized → deduplicated → routed → delivered
                                              ↓
                           unread → seen → saved / dismissed / acted / linked
```

### 4.4 Personal Action

职责：承载不需要完整 Goal Contract 的轻量个人事务。

主要实体：

- Action
- Reminder
- ActionLink

初始工作流：

```text
open → doing → done
  ├── deferred
  ├── dismissed
  └── promoted_to_goal
```

Action 不是 Goal 的叶子副本。Goal 内部仍遵循“可执行叶子 Goal 是 Task 投影”的现有原则；Action 只服务 Goal Spine 之外的轻量个人事务。

### 4.5 Goal Core

职责：定义结果、业务逻辑、范围、验收、拆解、依赖、风险和完成语义。

当前 Molis Work 已有的主要实体：

- Board
- Goal
- AcceptanceCriterion
- GoalRelation
- Risk
- GoalPolicy
- ContractProposal
- GoalTreeProposal
- CandidateGoal
- Rewire

内部工作流保持多轴状态，不退化成一个通用 status：

- definition：draft → accepted
- decomposition：abstract → frontier_open → closed_leaf / closed_compound
- validity：valid / needs_revalidation / invalidated
- fulfillment：unmet / satisfied

Plan 和 TaskBoard 继续作为 Goal Spine 的派生视图，不建立第二套可写的 Plan 或 Goal Task 真相。

### 4.6 Private Work Context

职责：在 accepted executable Goal、Action 或 Handoff 锚定的团队工作目标之下，保存负责人私有的工作过程，并生成执行输入与选择性发布候选。

主要实体：

- WorkContextProjection：锚点、负责人和公共状态的团队投影
- PrivateTaskContext：负责人私有工作区
- TaskInputSnapshot：供一次 Run 使用的不可变输入
- WorkEntry：Prompt、草稿、笔记、失败尝试、选择的来源和 Run 观察
- ExecutionScope：Runtime 可读输入、可写输出、禁用数据与时效边界
- DisclosureCandidate：负责人准备发布的选择和排除摘要

边界：

- Work Context 不是第二套 Task backlog，不拥有 Goal Contract、Goal 完成、Claim 或 Run 状态；
- Project admin 不因角色自动获得 PrivateTaskContext 内容读取权；
- Runtime 只读 ExecutionScope 明确列出的输入，不能浏览完整私人上下文；
- Run 完成和 Task 完成都不会自动发布内容；
- 本模块只产生 DisclosureCandidate，Collaboration 负责封装、评审和团队决定。

### 4.7 Work & Execution

职责：记录谁以什么角色领取工作、一次执行如何进行、是否阻塞以及执行引擎的真实回执。

主要实体：

- Claim
- Run
- EngineBinding
- ExecutionApproval
- ExecutionReceipt

内部工作流：

```text
Goal ready → claim requested → claim active → run started
                                         ├── blocked → resumed
                                         ├── failed / abandoned
                                         └── completed → output references
```

Relay 的 Assignment 应适配为 Claim 或执行投递请求；Relay Job 应适配为 Run，不再形成另一套工作真相。

### 4.8 Evidence & Artifact

职责：保存产出、证明、版本和验证结论。

主要实体：

- Artifact
- ArtifactVersion
- ContentReference
- ArtifactProvenance
- Evidence
- EvidenceCorrection
- ReviewObligation
- VerificationReview
- ExternalArtifactAction

边界：

- Artifact 是可持续引用和版本化的产出；
- ArtifactVersion 内容不可原地修改，首版一个 Artifact 至多有一个 Canonical head；
- ArtifactProvenance 连接 Signal、Goal、Task、Run、Proposal、Reviewer、Decision 与 Receipt；
- Evidence 说明某个来源或 Artifact 如何证明某条 Criterion；
- VerificationReview 判断 Goal 的完成条件是否成立；
- 团队接受、Goal 验收和外部 Publish / Apply 是三种不同判断；
- 原始 Evidence 不静默改写，通过 supersede / retract 纠正。

### 4.9 Collaboration

职责：处理跨个人与团队边界的发布、评审、交接和共同决定。

主要实体：

- Proposal
- PromotionProposal
- DisclosureBundle
- ProposalDecision
- ProjectDecision（在 Team Space 中显示为 Team Decision）
- MaterializationIntent
- Handoff

Proposal 需要类型化：

- Feed / Action / Personal Goal → Team Goal 的 Promotion；
- Goal Contract 或 Goal Tree 变更；
- Artifact 发布；
- Handoff。

ProposalDecision 与 VerificationReview 是两种不同判断，不能继续共用模糊的 Review 语义。

私人工作发布还必须满足：

- DisclosureBundle 固化一个精确私人来源版本，只包含负责人选中的内容；
- 第一版支持仅结果、结果与证据、选定完整工作记录三种披露深度；
- Reviewer 只能读取 Bundle、来源许可范围和目标模块生成的变更预览，不能沿引用进入 PrivateTaskContext；
- Reject 和 Request revision 不产生 Canonical 变更；
- Accept 创建不可变的 ProposalDecision、ProjectDecision 与 MaterializationIntent，随后由 Context Ledger & Materialization 负责落地；
- ProjectDecision 的 effect_status 必须与评审 verdict 分开，直到所有必需变更被证明完成。

### 4.10 Attention & Resumption

职责：帮助个人决定此刻关注什么，减少切换成本，并能够从中断处继续。

主要实体：

- Workline
- AttentionQueueEntry
- FocusState
- Interruption
- ResumeSnapshot

本模块消费 FeedEntry、Action、Goal 和 Run 的状态，但不复制或改写它们的领域真相。

可能的工作流：

```text
queued → focused → suspended / interrupted → resumed → closed
```

### 4.11 Context Ledger & Materialization

职责：保存跨领域对象的中立索引、关系、共享事件、幂等记录和一次团队决定的跨领域落地进度。

主要实体：

- ContextRegistryEntry
- Relation
- ProjectEventRecord
- IdempotencyRecord
- MaterializationOperation
- MaterializationStep
- OperationReceipt

该模块不拥有 Goal、Task、Run、Proposal 或 Artifact payload，也不是通用工作流引擎。它只接受已经授权的 MaterializationIntent，把每一步路由到唯一领域 owner，并如实记录 applied、no_change、retryable、failed、pending 或 uncertain。

内部工作流：

```text
planned → running → completed
             ├── blocked → running
             ├── uncertain → running / completed / failed
             └── failed
```

completed 只在所有必需步骤和最终 Project Event Journal 检查点完成后成立。重启和重复调用必须从同一 Operation 与幂等身份恢复，不能产生第二份 Canonical Artifact、Goal 变更或 Relation。

### 4.12 Sync & Replication

职责：在 Server、Desktop 和其他 Node 之间可靠复制允许共享的状态。

主要实体：

- ObjectEnvelope
- Revision
- ChangeEvent
- SyncCursor
- ReplicaState
- Conflict
- SyncReceipt

该模块不拥有业务对象，也不决定一个 Proposal 是否已经落地。它只传播业务模块已经接受的变化，并保留设备复制所需的顺序、恢复和冲突信息；跨领域业务落地由 Context Ledger & Materialization 负责。

## 5. 核心对象流动原则

### 5.1 对象不通过改类型完成“升格”

```text
SourceEvent → Signal → FeedEntry
                         ├── creates → Action
                         ├── links_to → existing Goal
                         ├── creates → Personal Goal
                         └── proposes → PromotionProposal → Team Goal
```

这样可以分别保留：

- 外部内容及来源；
- 用户自己的阅读和处理状态；
- 轻量事务生命周期；
- Goal 的结果、验收和协作生命周期。

### 5.2 同一个事实只能有一个权威模块

- Source & Connector 拥有外部连接和同步游标；
- Signal & Feed 拥有收到的内容和 Feed 处理状态；
- Goal Core 拥有 Goal Contract 和 Goal Graph；
- Private Work Context 拥有工作上下文公共投影、负责人私人过程、执行快照和披露候选；
- Work & Execution 拥有 Claim / Run；
- Evidence & Artifact 拥有产出和验证记录；
- Collaboration 拥有 DisclosureBundle、跨空间发布、评审、Decision 和 MaterializationIntent；
- Attention 只拥有个人关注顺序和恢复状态。
- Context Ledger & Materialization 拥有跨对象关系、共享事件和落地进度；
- Sync & Replication 只拥有设备副本、游标和复制冲突。

### 5.3 UI 可以组合，写入必须回到拥有模块

个人工作台可以在同一屏显示 Feed、Action、Goal、Run 和 Decision，但操作必须调用各自模块的命令，不能让 UI 创建一份新的综合状态。

## 6. 五条主工作流

### 6.1 外部信息进入 Feed

```text
Source sync
  → SourceEvent observed
  → Signal normalized and deduplicated
  → routing policy selects Feed
  → FeedEntry delivered
  → Desktop receives durable revision
```

### 6.2 Feed 进入个人工作

```text
FeedEntry
  → dismiss / save
  → create Action
  → link existing Goal
  → create Personal Goal
```

### 6.3 个人内容进入团队 Goal

```text
FeedEntry / Action / Personal Goal
  → choose disclosure scope
  → PromotionProposal
  → accept / revise / reject
  → materialize Team Goal
  → link original private object without broadening access
```

### 6.4 私人工作结果进入共享 Project Context

```text
Team Goal / accepted objective
  → create team-visible Work Context projection + owner-private Task Context
  → freeze TaskInputSnapshot and ExecutionScope
  → Run
  → private Draft Artifact
  → choose disclosure depth
  → seal DisclosureBundle
  → Proposal / Review
  → ProjectDecision with pending effect
  → MaterializationOperation
  → Canonical Artifact + Goal effect + Relations + Project Event Journal
```

这条流的关键不是“发一个结果”，而是未披露过程仍然私有、Reviewer 看到精确变更、Reject / Revise 不改变共享真相、重复 Accept 或重启后只落地一次，以及后来的成员不读原聊天也能恢复结果的来源和影响。

### 6.5 Goal 执行与完成

```text
accepted executable Goal
  → readiness derived
  → Claim
  → Run
  → Artifact / Evidence
  → VerificationReview
  → fulfillment derived
  → satisfied or returned for more work
```

## 7. Desktop 与 Server 的设计方法

模块先保持部署中立。模块 Contract 稳定后，每个实体或 Source 再声明以下属性：

```text
authority_home      server | desktop
visibility          private | team | public
storage_policy      server_full | server_metadata | desktop_only
execution_location  server | desktop | either
replication_policy  none | selected | full
```

### 7.1 当前倾向的 Desktop 职责

- 个人工作台和注意力入口；
- Private Task Context、TaskInputSnapshot 和 Disclosure Builder；
- 本地 Connector 与系统 Keychain；
- 本地文件、应用和 Runtime 接入；
- 本地 Run、终端和详细执行状态；
- Server Feed 和 Goal 的离线副本；
- 用户明确选择的 Promotion 和同步操作。

### 7.2 当前倾向的 Server 职责

- Personal Cloud Space 与 Team Space；
- 云端 Source、持续同步和 Feed 存储；
- Team Goal 和需要云同步的 Personal Goal；
- Promotion、权限、交接和团队决定；
- Sealed DisclosureBundle、Proposal Review 和 ProjectDecision；
- 共享 Artifact / Evidence；
- Context Registry、Relation、Project Event Journal 和 MaterializationOperation；
- Device 增量同步、重放和恢复。

### 7.3 典型来源模式

| 来源 | Connector 执行 | 凭据 | 默认权威位置 | 说明 |
| --- | --- | --- | --- | --- |
| 公共 RSS | Server | 无 | Server | 持续同步并分发到设备 |
| 公共网页查询 | Server | 无或服务凭据 | Server | 保存 provenance 和查询配置 |
| Gmail 云端模式 | Server | 云端 Secret Vault | Server | Desktop 离线时仍持续获取 |
| Gmail 本地模式 | Desktop | OS Keychain | Desktop | 用户决定同步摘要或全文 |
| Slack / 飞书团队空间 | Server 或 Team Relay Host | 安装级凭据 | Team Space | 按授权 Channel / Thread 读取 |
| 本地文件和应用 | Desktop | 本地权限 | Desktop | 只同步明确选择的结果或引用 |
| 本地 Agent Runtime | Desktop | 本地 Runtime | Desktop | 向 Server 上报 Run、Evidence 和摘要 |

## 8. 同步设计原则

“Server 转发到 Desktop”必须实现为可靠同步，而不是一次性实时通知：

```text
authority 接受 Command
  → 持久化对象 revision 和 ChangeEvent
  → Replica 按 SyncCursor 增量拉取
  → 本地事务应用
  → 返回 SyncReceipt / ACK
  → 断网后从最后确认位置恢复
```

原则：

1. 每个对象只有一个 authority_home，避免双主；
2. WebSocket 只负责降低延迟，不负责保证交付；
3. 所有写入都带 revision 和 idempotency key；
4. 冲突按领域实体解决，不采用全局 last-write-wins；
5. 凭据不随 FeedItem 同步，Desktop 不需要获得云端 OAuth Token；
6. 私人对象的同步不会自动扩大 visibility；
7. 删除、撤回、断连和不确定写回都必须有可恢复状态。

同步与 Materialization 是两套不同责任：Materialization 证明一次团队决定是否已经在各领域成为 Canonical；Sync 只把这些已接受变化可靠复制到其他 Node。设备已经收到更新不能反过来证明 Proposal 已经应用成功。

## 9. 三个现有项目的保留、替换与忽略

### 9.1 Molis Work

保留：

- Goal Contract、Criterion、Relation、Risk、Policy；
- Claim、Run、Evidence、Review；
- Goal Tree、Proposal、Candidate、Rewire；
- Runtime/MCP/CLI、本地 SQLite 和 Desktop；
- 已验证的 Goal Focus、Goal Navigator 和 Goal-bound Runtime 行为。

替换或扩展：

- 从“Goal 管理工作站”扩展为“个人工作台”；
- 增加 Feed、Action、Attention 和云同步入口；
- Board / Project / Space 的层级和权限语义需要重新对齐。

忽略：

- 把当前单设备 SQLite 约束直接复制到 Team Server；
- 为了兼容旧 UI，把所有新对象都塞进 Goal Tree。

### 9.2 Relay

保留：

- Connector、Source、SyncRun、Cursor 和去重；
- Gmail、RSS、Web Query、YouTube、Slack、飞书等适配经验；
- ConversationLink、DeliveryReceipt、Action Approval；
- Engine 接入和真实状态回执。

替换：

- 将通用 Item 拆成 Signal、FeedEntry、Action 或 Goal；
- Assignment / Job 适配 Molis Work Claim / Run；
- Connector Contract 支持 Cloud Host 和 Desktop Host。

忽略：

- 独立发展另一套 Team Workspace、Goal、IAM 和共享工作真相；
- 第一阶段承诺接通所有社媒平台。

### 9.3 Loreport

保留：

- Space、IAM、Authority、Proposal/Review；
- 私人到共享的显式发布边界；
- 工作上下文公共投影、负责人私有 Task Context、执行快照和三档披露；
- Reviewer 只读 sealed DisclosureBundle，不获得源工作区访问；
- Artifact、Decision、Relation、Event 和恢复设计；
- Decision 与 effect 分离、MaterializationOperation、Revision、幂等和 uncertain 语义；
- Web 多人 Team Space 的架构经验。

替换：

- 产品定位调整为 Molis Work Server；
- Signals 不再限定为 Server 内的第一入口，而是与统一 Signal & Feed 模块对齐；
- Task Room 的产品语义并入 Private Work Context；内容可按策略留在 Molis Work Desktop 或负责人私有 Server 空间，但不会退化成普通 Session 日志；
- Execution/Relay 改成对 Relay Host 和 Desktop Node 的适配。

忽略：

- 继续维护独立 Loreport 品牌和与 Molis Work 重复的产品外壳；
- 让所有 Signal 自动进入团队共享上下文。

## 10. 仓库策略草案

- `molis-work`：继续承载现有 Goal Core 和 Desktop，近期先把 UI 转化为个人工作台；
- `loreport`：保留为 Molis Work Server / Team Context 的设计来源和候选实现仓库；正式执行前需要用新方向替换当前“独立产品 Host”的 accepted 决策；
- `relay`：暂时保留为能力来源和真实实现，优先通过 adapter 验证边界，再决定提取 package 或迁移代码；
- 不立即进行大规模物理合仓或仓库改名。

Loreport 只有在 Molis Work 的 accepted 模块 Contract 和可执行 spec 已接管其全部唯一语义、Loreport 文档全部被可追踪地 supersede，并分别确认本地目录与 GitHub 仓库处理方式后，才可归档或删除。未来规划中出现同名能力不等于迁移已经完成；是否已经实现则是另一项完成等级判断，不能与文档迁移混为一谈。

## 11. 近期执行顺序

### 第一阶段：个人工作台 UI 垂直切片

先在当前 Molis Work 中建立个人工作台的信息架构和可见体验，保留真实 Goal、Decision 和 Runtime 行为。尚未实现的 Feed、Action 和 Server Sync 不能伪装成可用功能，应以真实空状态、禁用入口或独立原型处理。

### 第二阶段：主链领域 Contract

详细设计以下主链的字段、状态机、命令和事件：

```text
SourceEvent → Signal → FeedEntry → Action / Goal → Promotion

Goal / Action / Handoff → WorkContextProjection + PrivateTaskContext
                      → TaskInputSnapshot → Run → Draft Artifact
                      → DisclosureCandidate → DisclosureBundle → Proposal / Review
```

### 第三阶段：部署与同步 Contract

在实体所有权确定后，分别设计：

- Context Registry、Relation、Project Event Journal 和 MaterializationOperation；
- Server/Desktop authority、存储策略、同步协议和隐私边界。

两者不能共用“同步成功”这一状态代替业务落地结果。

### 第四阶段：第一个端到端真实闭环

建议优先验证：

```text
Server RSS → Personal Feed → Desktop → Personal Goal → 本地 Run → Evidence
```

随后增加：

```text
Personal Feed / Goal → Promotion → Team Goal → Handoff → Desktop 继续执行
```

团队上下文闭环必须继续走完：

```text
Goal-anchored Work Context → Private Task Context → Run → Draft Artifact
→ Disclosure Bundle → Review → Decision → Materialization
→ Canonical Artifact / Goal effect / Relations
```

## 12. 仍待决定的问题

1. Molis Work Personal 的首个 UI 切片是“只重组现有真实能力”，还是允许出现 Feed / Action 的可交互原型数据；
2. Board、Project、Space 三者的最终层级和命名；
3. Personal Goal 开启同步后，是否统一迁移为 Server authority；
4. Gmail 第一版默认使用云端持续同步还是仅本机同步；
5. Team Promotion 的接受权限：有创建 Goal 权限即可接受，还是需要指定 reviewer；
6. Relay 以 package、独立 daemon 还是 adapter 集合的形式被两端消费；
7. 第一版 Private Task Context 与现有 Session / Work Record 的关系，以及默认本地还是负责人私有 Server；
8. 第一条 MaterializationOperation 具体落地哪些 Artifact、Goal 和 Relation 变化；
9. Sealed DisclosureBundle 的内容存储、保留期和撤回边界；
10. Loreport 仓库何时替换现有 SSOT，以及达到哪些迁移证据后归档或删除。

## 13. 当前事实来源

- Molis Work 产品与现有约束：`PRODUCT.md`
- Molis Work 领域模型：`specs/molis-work-mvp/domain-contract.md`、`src/v1/types.ts`
- 当前 Desktop 视觉与交互：`DESIGN.md`、`.impeccable/surfaces/src-web-render-ts.md`
- Relay 产品和领域模型：`../relay/docs/PROJECT.md`、`../relay/src/domain/`
- Loreport 产品与模块架构：`../loreport/docs/PROJECT.md`、`../loreport/docs/system/ARCHITECTURE.md`、`../loreport/docs/modules/`
- Attention Harness 想法：`../lab/ideas/attention-harness.md`
