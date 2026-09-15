# 将来的功能规划

状态：工作草案
更新日期：2026-09-01
用途：作为 Molis Work 后续功能规划、研发分工和阶段验收的共同输入。

配套会议分工盘：[future-feature-planning.html](future-feature-planning.html)

## 1. 方向

后续不再按 Molis Work、Relay、Loreport 三个产品划边界。所有有效能力统一进入 Molis Work，可以直接复制、迁移和改造现有代码。

2026-09-01 对 Loreport 的逐项审计结论是：**产品方向已经并入 Molis Work，但关键能力尚未被完整规划，因此 Loreport 仓库当前不能删除。** Goal、Feed、Relay、账号权限、Artifact 和 Web Team Space 已有明确归属；个人私有工作上下文、选择性披露、共享上下文账本，以及“决定已接受”和“变更已落地”的分离仍需补齐。本文将这些缺口纳入 Molis Work P0；详细吸收范围和仓库删除门槛见第 12 节。

本规划只回答四件事：

1. Molis Work 最终还需要哪些功能；
2. 哪些功能可以由不同研发独立负责；
3. 先打通哪些真实闭环，再逐步补齐完整体验；
4. Loreport 的哪些能力被吸收、哪些被明确舍弃，以及何时才允许处理原仓库。

## 2. 分工原则

- 每个一级功能域有一个主负责人，负责结果、范围、接口和验收。
- 协作人可以跨域贡献，但不能出现无人对最终结果负责的公共区域。
- 前后端可以由不同人实现，但必须共同交付一条可使用的功能闭环。
- 能复制的现有代码直接复制，再按 Molis Work 的模型和体验统一，不为保持历史仓库纯净增加迁移成本。
- 云端、Web、Desktop、消息和 Agent 看到的是同一套业务状态，不重复建立相似状态。
- 第一阶段采用模块化单体和少量 Worker，不因未来扩展提前拆成大量微服务。

## 3. 优先级定义

| 优先级 | 含义 |
| --- | --- |
| P0 | 没有它就无法完成首个真实个人或团队闭环 |
| P1 | 内部完整和 Team Beta 需要，允许在首个闭环后补齐 |
| P2 | 规模化、商业化或开放生态需要，可以后置 |

## 4. 一级功能域

| 功能域 | 要解决的问题 | 主要交付 | 建议优先级 |
| --- | --- | --- | --- |
| 云平台与部署 | Molis Work 如何稳定运行在云端 | 环境、数据库、后台任务、部署、监控、备份恢复 | P0 |
| 账号、团队与权限 | 谁能进入、看到和操作哪些内容 | 登录、空间、成员、角色、权限、设备与审计 | P0 |
| Goal 核心与协作 | 团队究竟在推进什么，如何执行和确认完成 | Goal、依赖、Claim、Run、Evidence、Review、Decision、Handoff | P0 |
| 私有工作上下文与选择性发布 | 个人和 Agent 如何保留完整工作过程，只把有用部分带入团队 | 工作上下文公共投影、私有 Task Context、执行快照、三档披露、Disclosure Bundle | P0 |
| Feed、Inbox 与 Action | 外部信息进入系统后如何被处理 | Feed、阅读状态、轻量 Action、关联与升格 Goal | P0 |
| Relay 与 Agent 执行 | Goal 如何交给 Agent 或本地 Runtime 执行并可靠回传 | Connector、Engine、执行观察、审批、恢复和回执 | P0 |
| 消息面接入 | 如何从 Slack、飞书等消息场景发起和继续工作 | 入站、身份绑定、线程关联、交互卡片和结果回写 | P1 |
| Desktop 与云同步 | 本地工作、云端状态和多设备如何保持一致 | 设备、增量同步、离线、冲突、迁移和本地 Runtime | P0 |
| 共享上下文账本与落地恢复 | 一次团队决定如何跨多个领域可靠成为共享真相 | 对象索引、关系、事件账本、Revision、幂等、Materialization Operation、恢复与核对 | P0 |
| Web 产品体验 | 用户如何理解和操作整套 Molis Work | Personal、Team、Goal、Feed、Review、Settings 和管理面 | P0 |
| AI 规划与智能整理 | AI 如何真正参与规划和判断，而不是只提供 Chat | Draft、拆解建议、Context Pack、Review Suggestion、Resume Snapshot | P1 |
| Attention 与工作接续 | 用户现在应关注什么，如何从中断处继续 | Focus、队列、阻塞、等待决定、Resume 和快速记录 | P1 |
| Artifact、知识与搜索 | 产出和决定如何成为可追溯、可复用的项目记忆 | Canonical Artifact、版本、完整 lineage、权限、全文搜索、导出和过期提示 | P0 |
| 自动化、通知与 Digest | 系统如何持续运行并把重要变化送到用户 | 规则、计划任务、通知、Digest、失败 Inbox 和重试 | P1 |
| 首次使用、迁移与导入 | 新用户和现有本地用户如何顺利进入产品 | Onboarding、SQLite 迁移、Runtime/Connector 接入和回滚 | P0 |
| 管理、商业化与支持 | 云端产品如何被运营、计费和支持 | 管理后台、用量、额度、账单、诊断、反馈和灰度 | P2 |

## 5. 各功能域的粗略范围

### 云平台与部署

- 开发、测试、生产环境；
- 域名、HTTPS、配置和 Secret；
- PostgreSQL、对象存储、缓存和后台任务；
- CI/CD、数据库迁移、灰度和回滚；
- 日志、指标、Trace、告警和服务状态；
- 备份、恢复和灾难演练；
- 云资源成本、额度和限流。

### 账号、团队与权限

- 注册、登录、Session 和设备；
- Personal Space、Team Space；
- 邀请、成员、角色和权限；
- 个人与团队内容边界；
- OAuth/OIDC 和第三方身份绑定；
- 权限审计、账号导出和删除。

### Goal 核心与协作

- Goal Contract、Goal Tree、依赖、风险和验收标准；
- Personal Goal、Team Goal 和升格流程；
- Claim、分工、Run、阻塞和完成；
- Goal 变更与完成所需的 Evidence、Review、Decision 和 Activity；
- Goal Contract、Goal Tree 和完成判断的 Proposal、修订和拒绝；
- Handoff、接续和团队通知。

### 私有工作上下文与选择性发布

- 一个私人 Task Context 必须锚定 accepted executable Goal、Action 或 Handoff；团队只看到该工作上下文的锚点、负责人和公共状态；
- Task Context 不是第二套 Task backlog 或结果真相，不拥有 Goal Contract、Goal 完成或 Claim / Run 状态；
- Prompt、草稿、临时笔记、失败尝试、详细 Run 观察、隐藏来源和未完成判断默认只属于负责人；项目管理员身份不自动获得读取权；
- Runtime 只消费负责人明确生成的不可变 Task Input Snapshot 和有时效的执行范围，不能浏览整间私人工作区；
- Run 输出先形成私有 Draft Artifact，不因执行完成自动进入 Team Space、改变 Goal 或成为 Canonical；
- 负责人发布前必须选择三档披露深度：仅结果、结果与证据、选定的完整工作记录；
- 发布预览同时显示包含内容、排除类别、来源权限、脱敏结果和目标变更，不允许通过引用回到未披露内容；
- 提交后生成不可变的 Disclosure Bundle，并针对一个精确版本进入 Proposal / Review；Reviewer 只获得该 Bundle 的临时范围权限；
- Reject 和 Request revision 只增加评审历史，不改变 Canonical Artifact、Goal 或共享关系；Accept 只产生团队决定和落地意图，不伪装成目标变更已经完成。

### Feed、Inbox 与 Action

- 邮件、RSS、网页、社媒和消息的统一内容表示；
- 内容去重、来源追踪和路由；
- 未读、已读、收藏、忽略和归档；
- 轻量 Action、提醒和延期；
- Feed 转 Action、关联已有 Goal 或创建新 Goal；
- 摘要、筛选和 Digest 输入。

### Relay 与 Agent 执行

- 复制并整理现有 Connector 和 Execution Engine；
- Gmail、GitHub、RSS、Web Query 等来源；
- Codex、Claude Code、ForkLight 等执行入口；
- Goal 到 Agent 的 Context Pack；
- 执行观察、暂停、恢复、取消和补充输入；
- 外部写入审批；
- Artifact、Evidence 和执行回执；
- 超时后的核对与防重复执行。

### 消息面接入

- Slack、飞书应用安装；
- Webhook、Socket 或长连接；
- 验签、防重放、限流和事件去重；
- 用户身份、Channel、Thread 和 Goal 关联；
- Mention、命令、消息菜单和交互卡片；
- 创建 Action/Goal、审批和补充信息；
- 状态与结果回到原线程；
- 消息编辑、删除、权限撤销和失败恢复。

### Desktop 与云同步

- 设备注册、配对和撤销；
- Server Goal、Feed、Artifact 的本地副本；
- 增量同步、游标、ACK 和断网恢复；
- 多设备同步和版本冲突；
- 本地文件、终端、凭据和 Runtime；
- 本地执行结果上传；
- 旧 SQLite 数据升级和云端迁移；
- Desktop 更新、回滚和诊断。

Desktop 与云同步只负责复制已经允许同步的对象变化。它不拥有业务对象，也不把“同步成功”当成“团队已经接受”。私人 Task Context 默认本地或负责人私有；只有用户选中的 Disclosure Bundle、公开 Task 投影和已接受结果按策略进入 Server。

### 共享上下文账本与落地恢复

- 为 Signal、Goal、Task、Run、Proposal、Decision 和 Artifact 保存稳定引用、归属模块、Revision 与可见性索引，不复制领域 payload；
- 保存跨对象 Relation 和权限过滤后的 Project Event Journal，让后来的成员或 Agent 能沿 Signal → Goal → Task → Run → Proposal → Decision → Artifact 恢复因果链；
- 所有共享写入带 Actor、Authority、Expected Revision、Idempotency Key、Correlation ID 和安全原因；
- Proposal 被接受时先固化不可变 Decision 和 Materialization Intent，再建立一条可恢复的 Materialization Operation；
- Operation 按目标领域记录每一步的 applied、no change、retryable、failed、pending 或 uncertain 状态与 Receipt；每个领域仍独立验证并拥有自己的写入；
- “决定已接受”“正在应用”“已成为共享真相”“失败”“结果不确定”是不同状态，Web、Desktop 和消息面不得合并展示；
- 进程重启、重复点击、超时或外部响应丢失后，先凭 Revision、幂等记录和 Receipt 核对，再续跑；不得盲目重试或产生第二份 Canonical 结果；
- 只有所有必需步骤和最终账本检查点被证明完成，Proposal 才能标记 applied；私人 Task Context payload、凭据和隐藏 Prompt 永不进入共享事件账本。

### Web 产品体验

- 首次使用和空间创建；
- Personal Workspace 和 Team Workspace；
- Goal Graph、Goal 详情、规划和执行视图；
- Feed、Inbox、Action；
- Review Center、Decision Center；
- Artifact、Evidence、Activity 和搜索；
- 团队、权限、Connector 和 Runtime 设置；
- 管理面、异常恢复、响应式、国际化和无障碍。

### AI 规划与智能整理

- 把模糊想法整理成 Goal Draft；
- 补全范围、验收、风险和依赖；
- 建议拆解和执行顺序；
- 分析新需求对已有 Goal 的影响；
- Feed 分类和升格建议；
- 生成执行 Context Pack；
- 对照验收标准生成 Review Suggestion；
- 失败解释、恢复建议和 Resume Snapshot。

AI 只产生 Draft、Proposal、Context Pack 和建议，不静默修改正式 Goal 或替人作最终决定。

### Attention 与工作接续

- Today、Focus 和多项目注意力队列；
- Ready、Blocked、等待决定和等待他人；
- 临时打断、稍后继续和 Resume Snapshot；
- 上次做到哪里、下一步是什么、需要哪些上下文；
- 长期无进展、即将解除阻塞和超期提醒；
- 快速记录、全局快捷入口和移动端确认。

### Artifact、知识与搜索

- 文档、代码 Diff、报告、图片和链接等 Artifact；
- 不可变 Artifact Version、内容摘要和唯一 canonical head；
- Artifact 与 Signal、Goal、Task、Run、Proposal、Reviewer、Decision 和 Receipt 的完整 lineage；
- Draft、Proposal-locked、Canonical、Superseded 和 Unavailable 状态；
- 元数据可见性与内容读取权限分开，Reviewer 只能读取 Disclosure Bundle 指定的精确版本；
- 团队接受与对外 Publish / Apply 分开记录，外部超时不得伪装为成功；
- 文档预览、下载和权限；
- 全局全文搜索和权限过滤；
- 历史 Decision、相似 Goal、关联材料和过期提示；
- Markdown、PDF、JSON 和项目包导出。

其中稳定 Artifact 身份、不可变版本、Canonical head、完整 lineage、权限与恢复属于首个团队闭环 P0；全文搜索、相似内容、批量导出和过期提示仍为 P1。

### 自动化、通知与 Digest

- Connector 定时同步；
- Goal 和执行事件触发规则；
- Web、Desktop、邮件、Slack 和飞书通知；
- quiet hours、个人订阅和通知偏好；
- 每日、每周 Digest；
- 自动化历史、失败 Inbox、暂停、重试和补跑；
- 外部写入前人工审批；
- 自动化预算、频率和权限限制。

### 首次使用、迁移与导入

- 创建个人空间或加入团队；
- 本地 Molis Work 数据迁移到云端；
- 选择本地保留或云端同步范围；
- Desktop、Runtime 和 Connector 接入；
- 邀请团队成员；
- 完成第一个真实 Goal；
- Demo 与真实数据隔离；
- 导入预览、失败回滚和重试；
- 离开团队、转移 Goal 和卸载数据处理。

### 管理、商业化与支持

- 团队管理员后台；
- 成员、权限和 Connector 使用情况；
- 存储、同步、Agent、消息和 AI 用量；
- 套餐、试用、账单、支付和超额降级；
- 服务状态、故障通知和操作审计；
- 脱敏诊断包和用户授权支持；
- 功能开关、灰度发布、产品埋点和反馈。

## 6. 横向保障

以下工作不独立拥有业务功能，但必须有明确负责人：

### 安全与数据可靠性

- 多租户隔离；
- Secret、Token 和本地凭据；
- 私有 Task Context 默认拒绝非负责人读取，管理员也不因角色自动获得内容访问；
- Proposal Review 权限只覆盖一个精确 Disclosure Bundle，不能沿引用探索私人源内容；
- AI、Runtime 和 Connector 只能产生 Draft、候选结果或 Proposal，不能静默扩大可见性或写入共享真相；
- Prompt injection 和外部内容污染；
- 外部写入审批；
- 日志脱敏；
- 数据保留、导出和删除；
- 幂等、重试、不确定状态和故障恢复。

### QA、发布与开发效率

- 单元、Contract、Integration 和 E2E；
- Provider Sandbox 和公开 Fixture；
- 重启、断网、限流、重复事件和超时测试；
- 私有内容通过 Web、API、消息、搜索、日志、事件和 ID 猜测路径的泄露测试；
- 三档披露的负责人预览与 Reviewer 实际可见内容一致性测试；
- Materialization 每个步骤前后强制重启、重复 Accept、Revision 冲突与外部未知结果测试；
- API、事件和 Schema 兼容；
- 发布清单、升级验证和性能基线；
- 用户行为埋点和内部试用反馈。

## 7. 建议推进顺序

### 可部署基础

- 云端环境和持续部署；
- 账号、空间和最小权限；
- PostgreSQL、迁移和备份；
- 最小 Goal Server API；
- Desktop 设备连接和增量同步骨架。

### 个人真实闭环

```text
Server RSS
→ Personal Feed
→ Desktop
→ Personal Goal
→ 本地 Runtime 执行
→ Evidence 回传
→ 用户 Review
```

### 团队协作闭环

```text
Signal / Personal Goal
→ Promotion / Team Goal
→ 团队可见工作目标
→ 负责人私有 Task Context
→ 有界 Desktop / Agent Run
→ 私有 Draft Artifact
→ 选择披露深度
→ Disclosure Bundle
→ Proposal / Review
→ Decision
→ Materialization Operation
→ Canonical Artifact / Goal effect / Relations
```

首个团队闭环至少证明：两名不同成员参与；非负责人无法通过 Web 或应用接口读取私人过程；负责人预览与 Reviewer 所见完全一致；Reject / Revise 不改变共享真相；重复 Accept 和进程重启只产生一份 Canonical 结果；后来的成员不读原聊天也能理解结果为何被接受、来自哪里、改变了什么。

这条闭环同时承担 Loreport 原本的 PMF 验证，不以创建了多少对象或跑了多少次 Agent 作为成功。优先观察：完成的私人 Task 有多少主动形成 Proposal；从私有结果到 Canonical Artifact 的时间；另一名成员或新 Session 是否复用该 Artifact；不读原聊天恢复项目需要多久；团队是否每周重复完整闭环；是否主动邀请第二名成员；以及仍需通过口头或聊天重新解释的频率。

### 消息协作闭环

```text
Slack / 飞书消息
→ Signal / Action / Goal
→ 审批
→ Agent Run
→ Review
→ 结果回到原线程
```

### 内部完整

- Onboarding 和迁移顺畅；
- Attention、Resume、搜索、通知和失败恢复可用；
- 管理诊断、审计、备份恢复和权限检查可用；
- 一个个人场景和一个团队消息场景可连续真实使用。

### Team Beta

- 自动化和 Digest；
- 更强的 AI 规划与 Review；
- 移动端与 Push；
- 用量计量、套餐和账单；
- Public API、Webhook 和更多 Connector。

## 8. 建议初始分工

如果先安排 5-6 名研发：

| 负责人 | 初始范围 |
| --- | --- |
| 研发 A | 云平台、部署、账号和权限基础 |
| 研发 B | Goal 核心、协作、Review 和 Decision |
| 研发 C | Feed、Action 和 Connector |
| 研发 D | Relay 执行和消息接入 |
| 研发 E | Desktop、云同步、共享上下文账本和本地 Runtime |
| 研发 F | Web 产品体验和管理面 |

私人工作上下文与选择性发布是 B、D、E、F 汇合的 P0 纵向结果，不作为无人负责的公共区域：B 拥有发布与决定语义，D 提供有界 Run 与 Receipt，E 拥有本地私有上下文和可恢复落地基础，F 交付负责人披露与 Reviewer 评审的完整体验。正式研发前仍需在模块 Contract 中指定一个总体验 owner。

后续优先拆分：

1. Connector 与 Feed；
2. Relay 执行与消息接入；
3. Goal Core 与 Collaboration；
4. 云平台与账号权限；
5. 增加专职 QA/SRE。

## 9. 会议必须形成的结果

每次功能分工会至少确认：

1. 每个本期功能域的唯一主负责人；
2. 本期可独立验收的交付结果；
3. 真实依赖和可并行条件；
4. 明确不做的范围；
5. 汇合到哪条端到端闭环；
6. 如何验证功能真实可用；
7. 当前仍需一骏决定的问题。

## 10. 当前需要决定的问题

- 第一批研发人数和能力分布；
- 首个云端部署目标和环境；
- Personal Goal 第一版的云端权威策略；
- 第一条 Connector 闭环选择 RSS、Gmail 还是 GitHub；
- 第一条消息闭环选择 Slack 还是飞书；
- 第一条 Agent 执行闭环选择哪种 Runtime；
- 本地 SQLite 用户迁移到云端的首版边界；
- 第一版私人 Task Context 与现有 Session / Work Record 的关系，以及哪些内容默认只留本地；
- 第一条 Materialization Operation 具体落地哪些目标：Canonical Artifact、Goal Evidence / Criterion 变化和哪些 Relation；
- Sealed Disclosure Bundle 的内容存储、保留期和撤回边界；
- Team Beta 前是否引入付费和额度限制。

## 11. 规划事实与会议记录

本文件是未来功能范围的主要规划文档。HTML 是会议时使用的可编辑投影，浏览器内填写内容默认保存在当前设备的 Local Storage。会议结束后，应把已确认的长期决定和范围变化回写到本文件；临时负责人、会议笔记和当次行动项可以保留在导出的会议纪要中。

## 12. Loreport 能力吸收与仓库删除门槛

### 12.1 覆盖矩阵

| Loreport 规划内容 | Molis Work 归属 | 审计前状态 | 本次处理 |
| --- | --- | --- | --- |
| 产品楔子与 PMF 验证 | 团队协作闭环与产品埋点 | 未完整覆盖 | 保留“私人工作通过显式发布成为团队真相”的验证机制和重复行为指标，不以对象数或 Run 数证明 PMF |
| Project Host | 云平台与部署、Identity & Space、Server composition | 部分覆盖 | 保留 Project/Space 与统一路由需求；动态 ModuleManifest、公共插件 Host 不进入首个闭环 |
| Identity & Access | 账号、团队与权限 | 已覆盖 | 继续按 Actor、Membership、Role、Grant、Session 和服务端强制授权展开 |
| Context Kernel | 共享上下文账本与落地恢复 | 未完整覆盖 | 新增中立对象索引、Relation、Project Event Journal、幂等与 Materialization Operation |
| Proposals & Reviews | Goal 核心、私有工作上下文与选择性发布、共享上下文账本 | 部分覆盖 | 补足精确 Disclosure Bundle、三档披露、Decision / effect 分离和失败恢复 |
| Signals / Herald | Source & Connector、Feed / Signal | 已覆盖且 Molis Work 更宽 | 沿用 Signal 与 Feed 分离，不自动变成 Goal 或 Evidence |
| Goals | Goal 核心与协作 | 已覆盖且 Molis Work 更成熟 | Molis Work 继续保持 Goal Contract、生命周期、Evidence 和 Review 的权威语义 |
| Task Rooms | 私有工作上下文与选择性发布 | 未覆盖 | 转译为 Goal/Action/Handoff 锚定的工作上下文公共投影、负责人私有 Task Context、执行快照与披露候选，不建立第二套 Task 真相 |
| Execution / Relay | Relay 与 Agent 执行 | 已覆盖 | 保留 Run、审批、观察、Receipt、未知结果核对；执行完成不等于业务接受 |
| Artifacts | Artifact、知识与搜索 | 部分覆盖 | 将最小 Canonical Artifact、不可变版本和完整 lineage 提升为 P0 |
| Project Space | Web 产品体验 | 基本覆盖 | 补足共享 / 私有 / 提议中 / 落地中 / Canonical 的明确区分和两人真实评审闭环 |

### 12.2 不吸收的内容

- Loreport 独立品牌和独立产品外壳；
- 为首个闭环建立通用插件市场、任意第三方模块执行或分布式微服务系统；
- 把 Molis Work、Relay 和 Loreport 三套相似状态继续并行维护；
- 把 Goal 重新变成所有对象的通用父节点；
- 为迁移文档而原样复制 Loreport 的十模块命名和文件结构。

### 12.3 删除门槛

Loreport 当前仍保存 Molis Work 尚未拥有的详细 accepted foundation，不能因为本文件出现了功能名就删除。只有同时满足以下条件，才可以提出归档或删除：

1. Molis Work 的 accepted 产品与模块 Contract 已为上表每项能力指定唯一 owner，并明确保留、替换或拒绝的语义；
2. 私有 Task Context → Disclosure Bundle → Proposal / Review → Decision → Materialization → Canonical Project Context 的可执行 spec 已被接受；
3. Loreport 中仍然独有的权限、Revision、幂等、失败、重启、未知结果和 lineage 验收条件已经迁移或被显式 supersede，并有可追踪链接；
4. Loreport 文档全部标记 superseded 或迁入后的历史来源，不再被任何当前计划作为唯一事实源；
5. 本地目录、GitHub 仓库及是否保留只读归档分别确认，不能由一次模糊的“删除项目”同时推断。

在这些门槛完成前，Loreport 保留为 Molis Work Server / Team Context 的设计来源和候选实现仓库，不再作为独立产品并行扩张。
