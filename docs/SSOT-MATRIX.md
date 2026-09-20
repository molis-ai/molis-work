# Molis Work 架构 SSOT 索引

2026-09-08 Cutover：现有产品实现已退出旧混合目录，正式调用链位于 39 个实际 workspace 包；产品启动器已归 apps/desktop/launchers，0.1.x SDK 兼容出口已归 apps/local-host/sdk。完整用户验收与当前证据见 [Cutover 验证](../specs/molis-work-architecture-reorganization/cutover-validation.md)。本文描述当前 owner；各阶段历史数字保留在对应验证报告，不再作为当前实现位置。

权威需求书：[架构需求书](../specs/molis-work-architecture-reorganization/spec.md)。每项事实只有一个 owner，详细规则在下列链接维护。

当前 Goal 行为按[事件工作流需求书](../specs/goal-event-workflow-cleanup/spec.md)收敛：事件是唯一工作协议，旧执行写入退役，历史数据与真实 Session／终端保留。本索引的相关 owner 行已同步；早期迁移报告保留当时的实现和验收记录。

## 1. 文档各管什么

| 问题 | 唯一权威来源 |
| --- | --- |
| 产品为什么存在、对用户承诺什么 | [`PRODUCT.md`](../PRODUCT.md) |
| 本次重组的完整决策、范围和逐包 Contract | [`specs/molis-work-architecture-reorganization/spec.md`](../specs/molis-work-architecture-reorganization/spec.md) |
| 分层、部署与端到端调用 | [`docs/system/ARCHITECTURE.md`](system/ARCHITECTURE.md) |
| 允许和禁止的代码依赖 | [`docs/system/PACKAGE-BOUNDARIES.md`](system/PACKAGE-BOUNDARIES.md) |
| 旧路径、迁移状态、兼容出口 | [`docs/system/MIGRATION.md`](system/MIGRATION.md) |
| Huge Class 每块职责的唯一迁移 Goal | [`docs/system/HUGE-CLASS-MIGRATION.md`](system/HUGE-CLASS-MIGRATION.md) |
| 16 个业务事实 owner | [`docs/modules/`](modules/README.md) |
| 5 个横向运行服务 | [`docs/horizontal/`](horizontal/README.md) |
| Plugin、存储、交换、UI 等平台机制 | [`docs/platform/`](platform/README.md) |
| 某次实现具体改什么、如何验收 | 对应 `specs/<task>/spec.md` 或已接受 Goal Contract |
| 可执行类型、Schema 和兼容测试 | `packages/contracts` 的 public subpath；F3 自动门禁与 `packages/test-kit` 边界测试 |

文档冲突时，先以 `PRODUCT.md` 判断产品承诺，再以本索引找到该问题的 owner 文档；实现任务不得在自己的 Spec 中重定义模块所有权。

## 2. 状态词

| 状态 | 含义 |
| --- | --- |
| `legacy-mixed` | 功能真实存在，但仍混在旧单包或 Huge Class 中 |
| `absent` | 目标物理 package 尚未创建 |
| `contract-only` | package 和公开边界存在，但没有注册假 Provider、假 Store 或伪成功功能 |
| `partial` | 已有真实实现，目标完整契约仍可能含未来能力；旧 caller 是否退出另见迁移表 |
| `implemented` | 主路径、错误、持久化、恢复、测试和文档均已通过 |
| `retired` | 旧路径 caller 清零并删除或只留下有时限的兼容入口 |
| `workspace-root + legacy-release` | Monorepo 根已能管理全部 package，但当前产品构建与发布仍由旧根 package 承担 |

当前 39 个 package 的描述符为 38 个 `partial`、1 个 `contract-only`（真实提供公共类型/Schema 的 Contracts）。另外 10 个仅含描述符的占位包已删除；下表保留未来目标路径并标为 `absent`，它们不参与构建或发布。`partial` 不表示依赖旧代码，也不声称未来契约全部实现。

## 3. Apps

| 目标 package | 负责什么 | 当前来源 | 包成熟度 | 迁移 / 实现 Goal |
| --- | --- | --- | --- | --- |
| `apps/desktop` | macOS 外壳、生命周期、Native Bridge | Native Bridge、Panel、Capsule 与发布工具；Tauri 配置在 apps/desktop/src-tauri | `partial` | AP4/DV4/Cutover；实际平台安装证据见验证报告 |
| `apps/workbench` | 本地产品 UI 与页面组合 | Shell、导航、页面组合与注册 UI contribution；通用呈现边界，不拥有 Goal 完成算法；无数据库实现 | `partial` | AP3/FD4/GW5/EX4/AR3/WK3/Cutover |
| `apps/local-host` | 本地唯一业务 composition root 和 single writer | 唯一项目数据库和业务装配；可信身份、HTTP 与 MCP 装配；Web/CLI/MCP、凭据与本机 IO 适配 | `partial` | AP2/Cutover；同库事务与跨入口恢复已验证 |
| `apps/server` | 轻量交换、Team 控制面、Team Plugin Host | 当前无正式 Server 实现 | `absent` | F2；未来独立功能 Spec |
| `apps/cli` | 参数、协议和终端展示适配 | 协议参数、命令分发与公开应用 adapter；root bin 仅注入启动环境 | `partial` | DV1/Cutover；CLI 协议和真实进程验证 |
| `apps/mcp` | MCP schema、audience 和 Capability 适配 | 当前连接、Goal、事件、约定、决定请求、结构、历史与已发布 Functions 工具；Host 注入普通调用的项目与身份；用户决定仅受保护入口可执行 | `partial` | DV1/DV2/Cutover；事件工作流收敛 |

## 4. Foundation packages

| 目标 package | 唯一职责 | 当前来源 | 包成熟度 | 迁移 / 实现 Goal |
| --- | --- | --- | --- | --- |
| `packages/contracts` | Module、Service、Platform 的可发布类型与 Schema | Module/Service/Platform 公开类型和 Schema；无业务或 IO 实现 | `contract-only` | F2/F3；30 个 public subpath 与兼容门禁 |
| `packages/kernel` | Capability 注册、选择、权限与生命周期骨架 | AP2 已实现 versioned Capability registry；grant/provider policy 待各平台 Goal | `partial` | F2、F3、AP2 |
| `packages/plugin-runtime` | Plugin 安装、签名身份、grant、隔离和生命周期 | 本地 Runtime、持久开发状态、可撤销授权和签名校验；不是 OS sandbox | `partial` | F2、FD3、DV3；分发收口见 DV4 |
| `packages/plugin-sdk` | 外部 Plugin 作者使用的稳定 API 与测试入口 | Manifest/definition/polling、公开 Artifact/UI/private client 类型；fixture 由 Local Host 实现 | `partial` | F2、FD3、DV3 |
| `packages/storage` | SQLite、Filesystem、Blob、事务和 migration 技术能力 | SQLite/事务/文件/密文/搜索缓存 Adapter；业务 schema 归 Module | `partial` | 各事实迁移/Cutover；Web Home 作用域隔离 |
| `packages/exchange` | Envelope、ACK、Cursor、Replay、CAS 与 Blob 交换 | 当前不存在正式 Server/Exchange | `absent` | F2；未来独立功能 Spec |
| `packages/ui-host` | UI Contribution、Slot、嵌入、隔离和桥接 | FD4 registry/render 与 AP3 surface/Slot mount 校验已落地；Installed Plugin 隔离与完整安全 bridge 仍待独立实现 | `partial` | F2、FD4、AP3 |
| `packages/design-system` | Token、基础组件、图标和可访问性基线 | 主题、密度、token、icon 与视觉样式；旧 visual-foundation 已删除 | `partial` | AP3/Cutover；真实浏览器与 Native 布局 |
| `packages/observability` | 结构化日志、trace、diagnostic 与安全脱敏 | 各入口零散日志 | `absent` | F2、F3、保证 Goal |
| `packages/test-kit` | 无业务判断的公共测试工具和 fake capability | F3 boundary policy；测试中的重复 harness 待迁移 | `partial` | F2、F3；后续测试基础设施 Goal |

`packages/contracts/modules`、`services`、`platform` 是同一个发布包的 subpath 分区，不是三个独立 npm package。

## 5. Modules

| 目标 package | 事实 owner | 当前来源 | 包成熟度 | 迁移 / 实现 Goal |
| --- | --- | --- | --- | --- |
| `modules/identity-team-access` | User、Team、membership、Access Decision | 占位包已删除；未来功能 | `absent` | F2；未来独立功能 Spec |
| `modules/projects` | Project 身份、Catalog、workspace membership、`board_id` 兼容与迁移 | 正式 Project/Catalog 事实；Host 编排文件生命周期，Desktop 提供平台 | `partial` | AP1/AP2/Cutover；旧 Catalog 已删除 |
| `modules/context-ledger` | ObjectRef、跨模块关系、publication、materialization | Feed / Session / Handoff / Runtime 关联、输入来源、临时重建与 Coordinator 归属审计已通过；未来 publication / 异步 materialization 未实现 | `partial` | AR2 已验收；[验收记录](../specs/molis-work-architecture-reorganization/ar2-validation.md) |
| `modules/sync-replication` | 发布意图、replica、冲突和用户可见同步状态 | 占位包已删除；未来功能 | `absent` | F2；未来独立功能 Spec |
| `modules/sources` | “监听哪里”与用户期望的 Source 配置 | Source 配置、schedule 与同步策略事实；应用由 Native Feed 编排 | `partial` | FD1–FD4/Cutover；旧 service caller 清零 |
| `modules/signals` | 已观察到的外部事件与去重 provenance | Signal/Revision、去重与来源事实；Host 装配 Provider 投递 | `partial` | FD1–FD3/Cutover |
| `modules/feed` | Feed Item、Signal reference、material、read/archive/disposition 与 promotion provenance | Feed Item/Material/Disposition 与保留正文；旧 FeedStore 已删除 | `partial` | FD2/FD4/Cutover；Sources/Inbox/Feed 真实用户链路 |
| `modules/actions` | 个人/外部 Action 请求、状态和结果引用 | 占位包已删除；未来功能 | `absent` | F2；未来独立功能 Spec |
| `modules/attention-resumption` | Attention reference、reason 与最小处置状态 | Attention reference/reason 与最小处置；旧 Inbox 转发已退出 | `partial` | FD2/Cutover；完整 snooze/resume 仍是未来能力 |
| `modules/goals` | Goal、当前约定与要求、Graph、事件事实与工作状态、Planning、指导及历史 | `events` 唯一决定完成效果；当前意图／树／导入使用同一事件归属；图分析读当前状态；原规则／风险／验收继续作为历史读取 | `partial` | GW1–GW6/DD1/DD2/Cutover；事件工作流收敛 |
| `modules/private-work-context` | 私人 Session、内容引用、关联语义、Runtime context binding 与 Handoff 事实 | Session / Handoff / Runtime 当前 Project 关联经 Ledger API 保存；私人内容与控制历史留在 Work | `partial` | WK1–WK3 已迁移；AR2 切换 Session schema v5、Catalog v10 与应用层组合 |
| `modules/execution` | 历史 Claim、Run、lease、attempt | 保留查询、schema 和升级；供历史阅读与项目删除的现有活动保护使用；旧执行写入退役 | `partial` | EX1/EX4 历史迁移；事件工作流收敛 |
| `modules/artifacts` | Artifact、版本、类型、内容引用与 provenance | AR1 已建立唯一正式事实；旧代码仅有各 owner 的字符串引用，没有第二套 Artifact Store | `partial` | AR1 已迁 Core；AR3 切换现有结果入口 |
| `modules/shelf` | 个人置物架材料、副本任务、Hash 与本机抽字结果 | Home 下 `shelf/` 副本与 Jobs 沙箱；不写项目 Goal / Artifact | `partial` | Shelf 工作台切片；轮盘/热键仍待 Desktop |
| `modules/evidence-verification` | 历史 Evidence、Correction、验收引用与文件来源 | 保留历史查询、文件读取、schema 和升级；当前报告与完成判断归 Goals 事件；旧写入退役 | `partial` | EX2/EX4 历史迁移；事件工作流收敛 |
| `modules/governance-collaboration` | 当前用户决定、有限树提案／决定、provenance 与协作历史 | 当前可信用户来源、具体变更授权和决定事务；旧 Review/Clarification/Contract/Candidate/Rewire 仅保留历史职责 | `partial` | EX3/EX4/AR2/DD1/DD2/Cutover；事件工作流收敛 |
| `modules/automation` | Trigger、Rule、Automation Run 与产生的 Action Request | 占位包已删除；未来功能 | `absent` | F2；未来独立功能 Spec |

每个 Module 的 API、事件和非职责见 [`docs/modules/`](modules/README.md)。Module 之间只通过公开 Capability Contract 调用，不导入彼此 implementation 或 Store。

## 6. Horizontal services

| 目标 package | 提供的技术能力 | 当前来源 | 包成熟度 | 迁移 / 实现 Goal |
| --- | --- | --- | --- | --- |
| `horizontal/connector-host` | Provider 连接、凭据引用和调用 Receipt | Provider-neutral 连接/Receipt；Integration contribution 提供 Driver | `partial` | FD1/FD3/AP2/Cutover |
| `horizontal/listener-host` | cursor、lease、重试、Raw Event 到 Signal Draft 投递 | Listener 技术 lease/cursor/去重/接收回执；Host 管 timer 生命周期 | `partial` | FD1/FD3/Cutover |
| `horizontal/scheduler` | Durable one-shot wakeup | sqlite job/lease/收据；Web timer 与 Feed timer 并行；once/interval 由 Schedule 插件拥有 | `partial` | `specs/schedule-plugin/spec.md` |
| `horizontal/runtime-host` | Runtime 启动、恢复、中断、stream 与技术 Receipt | Runtime router、Codex app-server 与 PTY server host 已迁；浏览器 transport/reconnect 由 Work 消费 | `partial` | WK2 已迁 Host/Adapter；WK3 已迁产品编排 |
| `horizontal/agent-host` | Agent Runtime 注册、能力矩阵、启动授权与副作用 Review 队列 | 宿主侧与两个 adapter 的会话/只读执行已实现；Prologue 执行接线待补 | `partial` | Plugin Platform v2；见 `specs/plugin-platform-v2/spec.md` |

Horizontal Service 只保存可恢复的技术状态，不拥有 Goal、Signal、Action、Session 或 Run 等业务事实。

## 7. Plugins

| 目标 package | 产品能力 | 当前来源 | 包成熟度 | 迁移 / 实现 Goal |
| --- | --- | --- | --- | --- |
| `plugins/native/goals` | Goals 一级入口与产品 UI | 当前事件意图、约定、报告、树决定和历史正文组合；目录直接读当前状态；旧执行／草稿／提案写应用退役；Workbench 注册并组合 UI，不另算完成 | `partial` | GW/DD/EX/Cutover；事件工作流收敛 |
| `plugins/native/artifacts` | Artifacts 一级入口、浏览和嵌入 | 已迁结果链接/项目文件打开；正式版本列表、详情与本地导出已接入 Web；Goal 上下文按明确输入/产出关系嵌入精确版本 | `partial` | AR3 已完成迁移验收；不包含未来安装/Team 同步 |
| `plugins/native/inbox` | Inbox 一级入口与 Attention 处置 UI | 目录/详情只读 Attention；完成/忽略走 setStatus；Host 注入展示信息与 HTTP | `partial` | Inbox/Feed 拆插件切片 2–3 |
| `plugins/native/schedule` | Schedule 一级入口：对话任务与闹钟列表 | 人手创建日历日对话任务；其他插件 job 仍只展示与暂停 | `partial` | `specs/schedule-conversation-tasks/spec.md` |
| `plugins/native/shelf` | Shelf 一级入口：材料/结果/剪贴板与本机抽字 | DropAgent 表面挂进目录与工作面；Host 注入 `/api/shelf` 与 Store | `partial` | 工作台进货→抽字切片；轮盘/抓页/CLI Recipe 待 Desktop |
| `plugins/native/functions` | Functions 一级入口：本机判断函数 | Noul/Choice/Score 草稿、试跑、发布 v1；已发布函数经 MCP 调用 | `partial` | `specs/functions-write-and-invoke/spec.md` |
| `plugins/native/feed` | Feed 一级入口和处置 UI | Sources/Feed 流水、同步与 promotion 用例；不再投影 Inbox 面；加入 Inbox 仍走 Feed HTTP，只写 Attention | `partial` | FD/Cutover；Inbox/Feed 拆插件切片 3 |
| `plugins/native/actions` | Actions 一级入口 | 占位包已删除；未来功能 | `absent` | F2；未来独立功能 Spec |
| `plugins/native/work` | Session、Runtime、resume、handoff 应用和 UI | WK3 已迁应用编排、Session/Terminal contribution、浏览器控制器、HTTP 用例和工作目录恢复。`GET/POST /api/goals/:id/panels`（无子路径，JSON）仍是 Runtime 终端面板，与已删除的 Goal 五 tab fragment 不同 | `partial` | WK3；边界与证据见 `specs/molis-work-architecture-reorganization/wk3-validation.md` |
| `plugins/native/automation` | Automation 一级入口 | 占位包已删除；未来功能 | `absent` | F2；未来独立功能 Spec |
| `plugins/official-integrations/github` | GitHub connector/listener/signal adapter | GitHub Provider、Device OAuth 与账号呈现；Host 注入 Secret/env | `partial` | FD3/Cutover；无旧 connector caller |
| `plugins/official-integrations/gmail` | Gmail OAuth/connector/listener/signal adapter | Gmail OAuth/安装账号/scope/cursor/Provider；Host 注入安全存储 | `partial` | FD3/Cutover；无旧 connector caller |
| `plugins/official-integrations/rss` | 官方目录与自定义 RSS provider adapter | 目录/custom RSS/正文分类/HTTP adapter；Host 提供运行上下文 | `partial` | FD3/Cutover；真实公开 RSS 拉取 |
| `plugins/official-integrations/web-query` | Web Query provider adapter | Web Query Provider adapter；Host 注入 Intelligence client 与存储端口 | `partial` | FD3/Cutover |
| `plugins/official-integrations/youtube` | YouTube Channel provider adapter | YouTube Channel 标识与 Provider adapter；Host 注入运行端口 | `partial` | FD3/Cutover |

Goals 与 Artifacts 是官方签名保护的一等 Plugin。Plugin 之间不依赖 implementation；可保存、同步和重放的内容用 Goal / Artifact Contract 交换。

### 正在接入的独立插件

- [Casebook：产品流程与宿主前置能力](../specs/casebook-plugin/spec.md)：系统疑点与成员主动反馈进入改进 Backlog，经模块主 R 评审、系统准备方案和人确认后，交接正式 Goal 并回验。插件业务与详细实施清单由独立的 `molis-ai/goalboard-casebook` 仓库维护；本文档入口便于宿主各模块查阅依赖，不新增 workspace package，也不表示插件已注册、团队协作已接通或功能已验收。

## 8. Tooling、入口和发布面

| 入口 | 当前 owner / 状态 | 交付边界 |
| --- | --- | --- |
| plugin CLI 与示例 | tooling/plugin-cli；examples/plugin-sample | 公开 SDK scaffold → validate/pack/sign → 本地安装 → Artifact/UI；样例不进生产 workspace |
| workspace / npm | 根 scripts 调用 App-owned 构建与打包工具 | 39 包拓扑构建；发布包包含必要内部 JS 和资产，消费者安装原生依赖；不独立发布私有包 |
| root SDK | apps/local-host/sdk/{index,sdk-store,sdk-types}.ts | 0.1.x 已发布名称兼容期，仅转发公开 owner；内部 caller 不得通过 root SDK 绕过边界；移除须另行破坏性版本决策 |
| CLI / MCP / Web bins | apps/desktop/launchers/cli/main.ts、apps/desktop/launchers/mcp/server.ts、apps/desktop/launchers/web/server.ts | 只保留启动环境/stdio/资源路径与公开 App 入口；无业务 SQL 或状态机 |
| Desktop / Tauri | apps/desktop + apps/desktop/src-tauri | App/DMG/zip、bundle、ad-hoc codesign、本地安装/恢复；Developer ID、公证和公开发布不在本期验收承诺内 |
| Runtime Skill | skills/goal-advance | 仅消费正式公开 Contract 与入口，不读取内部 Store |
| CI / vendor | .github/workflows、vendor；App-owned 发布工具 | 仅手动 CI；来源、版本、许可证、SBOM 与原发布供应链完整性保留 |
| 文档 | 本索引与对应 owner 文档 | 当前位置以此表和 MIGRATION 为准；阶段性验收保留历史，不代表未来能力落地 |

## 9. 变更规则

1. 新增、删除或改名 package，必须先更新本矩阵与架构 Spec。
2. Module owner、公开 Contract 或依赖方向变化，必须有明确决策，不能在代码搬迁中顺手改变。
3. 每个迁移 Goal 同时更新：目标 package README、对应 Module/Service 文档、本矩阵的状态和 [`MIGRATION.md`](system/MIGRATION.md)。
4. `contract-only` 不得被 UI、CLI、MCP 或 Plugin Runtime 宣称为可用功能。
5. 旧 owner 只有在 caller 清零、行为兼容、数据迁移和回滚证据齐全后才能标为 `retired`。
