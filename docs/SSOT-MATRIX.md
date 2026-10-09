# Molis Work 架构 SSOT 索引

2026-09-08 Cutover 后，现有产品实现已退出旧混合目录；正式调用链位于实际 workspace 包，当前清单以 [`scripts/workspace-packages.mjs`](../scripts/workspace-packages.mjs) 为准，数量由 `pnpm boundary:check` 的 `packageCount` 输出。产品启动器已归 apps/desktop/launchers；0.1.x 的根 SDK 已于 2026-10-04 删除（用户决定），根包不导出代码。历史验收证据见 [Cutover 验证](../specs/molis-work-architecture-reorganization/cutover-validation.md)，不能替代后续变更的验收。本文描述当前 owner；各阶段历史数字保留在对应验证报告，不再作为当前实现位置。

权威需求书：[架构需求书](../specs/molis-work-architecture-reorganization/spec.md)。每项事实只有一个 owner，详细规则在下列链接维护。

Molis Work 是本地优先的插件基座加多插件。平台是一个 Home 的常驻宿主、统一动作目录与授权、Plugin Runtime、工作台外壳和同一个 Prologue AI 运行时；内容与事实归 Module 或插件，每项事实只有一个 owner，下列各表逐包写明。Goals 是每个项目都带的内置插件，拥有 Goal 的事实。

Goal 是 Goals 插件拥有的一项事实（§5 `modules/goals`、§7 `plugins/native/goals`），按[事件工作流需求书](../specs/archive/goal-event-workflow-cleanup/spec.md)收敛：事件是唯一工作协议；事件之前的 Claim/Run/Evidence/Review 历史连同表与展示已于 2026-10-05 删除（#268）。真实 Session／终端归 Work 与 Runtime Host。本索引的相关 owner 行已同步；早期迁移报告保留当时的实现和验收记录。

## 1. 文档各管什么

| 问题 | 唯一权威来源 |
| --- | --- |
| 产品是什么（插件基座加多插件）、对用户承诺什么 | [`PRODUCT.md`](../PRODUCT.md) |
| 本次重组的完整决策、范围和逐包 Contract | [`specs/molis-work-architecture-reorganization/spec.md`](../specs/molis-work-architecture-reorganization/spec.md) |
| 分层、部署与端到端调用 | [`docs/system/ARCHITECTURE.md`](system/ARCHITECTURE.md) |
| 允许和禁止的代码依赖 | [`docs/system/PACKAGE-BOUNDARIES.md`](system/PACKAGE-BOUNDARIES.md) |
| 概念与命名：一个概念一个名字、一个定义，旧称、界面用词与代码改名清单 | [`docs/system/GLOSSARY.md`](system/GLOSSARY.md) |
| 兼容逻辑清单与删除进度 | [`specs/repository-anti-corruption`](../specs/repository-anti-corruption/spec.md) §4（迁移期记录已归档到 [`docs/archive/system-migration-2026-09.md`](archive/system-migration-2026-09.md)） |
| 每个包的规模、运行状态（在用 / Runtime / 构建期 / 非产品，不是下面第 2 节的状态词）和计划审查深度 | [`specs/repository-anti-corruption`](../specs/repository-anti-corruption/spec.md) §5.1 的包清单表；`scripts/gates/package-inventory.mjs` 按登记表和代码检查，随 `pnpm health:check` 跑 |
| 巨大单元只许变小 | `pnpm health:check`（基线 `tooling/gates/baseline.json`，必须长的登记在 `tooling/gates/giant-exceptions.json`）；全部单元的 owner、判定与计划见 [`docs/system/HUGE-CLASS-MIGRATION.md`](system/HUGE-CLASS-MIGRATION.md)，2026-09 的迁移历史在 [`docs/archive/huge-class-migration-2026-09.md`](archive/huge-class-migration-2026-09.md) |
| 评审截图、根目录杂项、vendored 补丁的去留 | [`docs/system/REPOSITORY-HYGIENE.md`](system/REPOSITORY-HYGIENE.md)；`pnpm health:check` 按评审组限制入库的 `.impeccable/` 文件，只许减少 |
| 13 个业务事实 Module（另有 4 个尚未建包的未来 owner；插件自有的库见 §7） | [`docs/modules/`](modules/README.md) |
| 8 个 `horizontal/` 包：5 个横向运行服务，3 个平台产品服务（记忆、放置、搜索） | [`docs/horizontal/`](horizontal/README.md)（Memory、Placement 的边界见各自包 README） |
| Plugin、存储、交换、UI 等平台机制 | [`docs/platform/`](platform/README.md) |
| 新插件先写什么、怎么接到产品 | [`skills/molis-plugin-dev/SKILL.md`](../skills/molis-plugin-dev/SKILL.md)（Host/CLI/接入分文件）；命令与录取四问仍是 [`docs/platform/PLUGIN-DEVELOPMENT.md`](platform/PLUGIN-DEVELOPMENT.md) |
| 新增一个插件、服务集成、设置分区、界面语言、操作系统平台等要改哪里、目标几处；内置插件迁到 Plugin Runtime 的计划；第三方插件的安装方案 | [`docs/system/EXTENSION-POINTS.md`](system/EXTENSION-POINTS.md)、[`docs/system/RUNTIME-MIGRATION.md`](system/RUNTIME-MIGRATION.md)、[`docs/system/THIRD-PARTY-PLUGINS.md`](system/THIRD-PARTY-PLUGINS.md) |
| 某次实现具体改什么、如何验收 | 对应 `specs/<task>/spec.md` 或已接受 Goal Contract |
| 可执行类型、Schema 和兼容测试 | `packages/contracts` 的 public subpath；F3 自动门禁与 `packages/test-kit` 边界测试 |
| 多会话并行开发的规矩 | [`docs/system/PARALLEL-DEVELOPMENT.md`](system/PARALLEL-DEVELOPMENT.md) |
| 合同怎样变更（现在不留兼容期；读取兼容的流程与起点） | [`docs/system/CONTRACT-CHANGES.md`](system/CONTRACT-CHANGES.md) |
| 每个包归谁、请谁评审 | 第 3 至 7 节各表的「归属」列与 `.github/CODEOWNERS`；两处都由 [`scripts/package-owners.mjs`](../scripts/package-owners.mjs) 的规则生成 |

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

当前 71 个 package（6 app、10 foundation、14 module（`modules/*` 的 13 个加聊天与接续的 `server`）、8 horizontal、26 native plugin、6 integration plugin、1 tooling，按 `scripts/workspace-packages.mjs`，2026-10-07 核对）的描述符为 70 个 `partial`、1 个 `contract-only`（真实提供公共类型/Schema 的 Contracts）。另外 10 个仅含描述符的占位包已删除；下表保留未来目标路径并标为 `absent`，它们不参与构建或发布。`partial` 不表示依赖旧代码，也不声称未来契约全部实现。

## 3. Apps

| 目标 package | 负责什么 | 当前来源 | 包成熟度 | 迁移 / 实现 Goal | 归属 |
| --- | --- | --- | --- | --- | --- |
| `apps/desktop` | macOS 外壳、生命周期、Native Bridge | Native Bridge、Panel、Capsule 与发布工具；Tauri 配置在 apps/desktop/src-tauri | `partial` | AP4/DV4/Cutover；实际平台安装证据见验证报告 | 应用：@yijunw0212 |
| `apps/workbench` | 本地产品 UI 与页面组合 | Shell、导航、页面组合与注册 UI contribution；通用呈现边界，不拥有 Goal 完成算法；无数据库实现 | `partial` | AP3/FD4/GW5/EX4/AR3/WK3/Cutover | 共享核心：@yijunw0212 |
| `apps/local-host` | 本地唯一业务 composition root 和 single writer | 唯一项目数据库和业务装配；统一动作服务的宿主侧（能力目录合成、系统动作、逐客户端 MCP 授权、调用记录、跨进程动作网关）；可信身份与 Web/CLI/MCP 装配；各 Native 插件的组合适配（注入存储位置、模型、Artifact 发布等端口）；凭据与本机 IO | `partial` | AP2/Cutover；动作服务见 `specs/action-architecture/` | 共享核心：@yijunw0212 |
| `apps/server` | 轻量交换、Team 控制面、Team Plugin Host | 独立启动器：`apps/server` 是 `server/`（身份、设备、项目访问、接续回执、事件传输、IM 领域）的本地可部署启动器，所有业务读写调用现有 Action Host；它没有产品入口、不随 Desktop/npm 发布，只有跨设备测试在用，也不是正式的交换/Team 控制面，去留随功能迭代另定（spec §1，2026-10-08「右栏『讨论』页签与 IM 代码」）。右栏「讨论」页签不经过它：本地宿主直接挂载 `server/`，见 `server` 行 | `partial`（独立启动器，无产品入口） | `specs/archive/molis-work-im/spec.md`；正式 Server/Exchange 仍待独立功能 Spec | 应用：@yijunw0212 |
| `apps/cli` | 参数、协议和终端展示适配 | 协议参数、命令分发与公开应用 adapter；root bin 仅注入启动环境 | `partial` | DV1/Cutover；CLI 协议和真实进程验证 | 应用：@yijunw0212 |
| `apps/mcp` | MCP schema、audience 和 Capability 适配 | 平台工具只有项目连接工具（含 Goals 接续摘要）和受保护的管理入口（`initialize`、`event_decide`、`goal_tree_decide`）；Goals 与各插件的能力都是 Host 按动作目录合成、逐客户端授权的动作工具；Host 注入普通调用的项目与身份；用户决定仅受保护入口可执行 | `partial` | DV1/DV2/Cutover；#269 | 应用：@yijunw0212 |

## 4. Foundation 与 Tooling packages

| 目标 package | 唯一职责 | 当前来源 | 包成熟度 | 迁移 / 实现 Goal | 归属 |
| --- | --- | --- | --- | --- | --- |
| `packages/contracts` | Module、Service、Platform 的可发布类型与 Schema | Module/Service/Platform 公开类型和 Schema；无业务或 IO 实现 | `contract-only` | F2/F3；57 个 public subpath（外加根入口；2026-10-08 按 package.json exports 核对，含无依赖的 platform/execution-lifetime；W2-01 删了 6 个只有描述符、没人用的占位）与兼容门禁 | 共享核心：@yijunw0212 |
| `packages/kernel` | Capability 注册、选择、权限与生命周期骨架 | versioned Capability registry 与统一动作服务核心 `ActionService`（定义/兑现校验、输入输出 schema、可用性、`beforeEffect` 副作用前复查、场景绑定与判断消费）；授权事实由 Local Host 持久保存 | `partial` | F2、F3、AP2；`specs/action-architecture/spec.md` | 共享核心：@yijunw0212 |
| `packages/plugin-runtime` | Plugin 安装、签名身份、grant、隔离和生命周期 | 本地 Runtime、持久开发状态、可撤销授权和签名校验；不是 OS sandbox | `partial` | F2、FD3、DV3；分发收口见 DV4 | 平台包：@yijunw0212 |
| `packages/plugin-sdk` | 外部 Plugin 作者使用的稳定 API 与测试入口 | Manifest/definition/polling、公开 Artifact/UI/private client 类型与动作合同再导出；fixture 由 Local Host 实现 | `partial` | F2、FD3、DV3 | 平台包：@yijunw0212 |
| `packages/storage` | SQLite、Filesystem、Blob、事务和 migration 技术能力 | SQLite/事务/文件/密文/联网搜索缓存 Adapter；系统搜索的本地全文索引适配（`openTextSearchIndex`，可删除重建）；业务 schema 归 Module | `partial` | 各事实迁移/Cutover；Web Home 作用域隔离 | 平台包：@yijunw0212 |
| `packages/exchange` | Envelope、ACK、Cursor、Replay、CAS 与 Blob 交换 | 当前不存在正式 Server/Exchange | `absent` | F2；未来独立功能 Spec | — |
| `packages/ui-host` | UI Contribution、Slot、嵌入、隔离和桥接 | FD4 registry/render 与 AP3 surface/Slot mount 校验已落地；Installed Plugin 隔离与完整安全 bridge 仍待独立实现 | `partial` | F2、FD4、AP3 | 平台包：@yijunw0212 |
| `packages/design-system` | Token、基础组件、图标和可访问性基线 | Soft Workbench token（`palette.ts` 唯一来源）、主题、密度、字体、icon、`mw-*` 原语、终层与组件板 `/__ui/catalog`；规范见 `DESIGN.md`；旧 visual-foundation 已删除 | `partial` | AP3/Cutover；Soft Workbench 迁移（`specs/archive/soft-workbench-rollout`）；Native 包布局待验 | 平台包：@yijunw0212 |
| `packages/observability` | 结构化日志、trace、diagnostic 与安全脱敏 | 各入口零散日志 | `absent` | F2、F3、保证 Goal | — |
| `packages/test-kit` | 无业务判断的公共测试工具和 fake capability | F3 boundary policy；测试中的重复 harness 待迁移 | `partial` | F2、F3；后续测试基础设施 Goal | 平台包：@yijunw0212 |
| `packages/im-ui` | 群聊（IM）页面、样式与浏览器控制器 | 由 Workbench 右栏「讨论」页签（`apps/workbench/src/side-panel.ts` 嵌入 `/im`）和 `apps/server` 的 IM 页面消费；不拥有消息事实。这是在用、还会迭代的功能，不是待删的实验（spec §1，2026-10-08「右栏『讨论』页签与 IM 代码」） | `partial` | `specs/archive/molis-work-im/spec.md` | 平台包：@yijunw0212 |
| `packages/plugin-sandbox` | 生成插件的 macOS 沙箱进程与宿主通道 | 插件创作台生成的后端在独立沙箱进程里运行，只经宿主通道使用平台能力 | `partial` | `specs/archive/plugin-builder/work-items/agent-built-plugins/spec.md`（S0 执行底座）；整体路线见 `specs/archive/plugin-builder/work-items/studio-v3/spec.md` | 平台包：@yijunw0212 |
| `tooling/plugin-cli` | Plugin 作者的 validate、create、pack、identity、sign、verify 命令，以及经 Host 的本地开发验证 | `create` 默认生成 v2 Integration 插件；`pack` 生成显式文件列表的 JSON bundle；签名与验证用 Plugin Runtime 的公开包验证接口；`dev` 经注入的 `PluginCliHost` 使用真实 Local Host；由 `apps/desktop/launchers/cli/main.ts` 装配 | `partial` | DV3；入口表见 §8 | 工具：@yijunw0212 |

`packages/contracts/modules`、`services`、`platform` 是同一个发布包的 subpath 分区，不是三个独立 npm package。

## 5. Modules

| 目标 package | 事实 owner | 当前来源 | 包成熟度 | 迁移 / 实现 Goal | 归属 |
| --- | --- | --- | --- | --- | --- |
| `modules/identity-team-access` | User、Team、membership、Access Decision | 占位包已删除；未来功能 | `absent` | F2；未来独立功能 Spec | — |
| `modules/projects` | Project 身份、Catalog、workspace membership | 正式 Project/Catalog 事实；Host 编排文件生命周期，Desktop 提供平台 | `partial` | AP1/AP2/Cutover；旧 Catalog 已删除 | Module：@yijunw0212 |
| `modules/context-ledger` | ObjectRef、跨模块关系、publication、materialization | Feed / Session / Handoff / Runtime 关联、输入来源、临时重建与 Coordinator 归属审计已通过；未来 publication / 异步 materialization 未实现 | `partial` | AR2 已验收；[验收记录](../specs/molis-work-architecture-reorganization/ar2-validation.md) | Module：@yijunw0212 |
| `modules/sync-replication` | 发布意图、replica、冲突和用户可见同步状态 | 占位包已删除；未来功能 | `absent` | F2；未来独立功能 Spec | — |
| `modules/sources` | “监听哪里”与用户期望的 Source 配置 | Source 配置、schedule 与同步策略事实；应用由 Native Feed 编排 | `partial` | FD1–FD4/Cutover；旧 service caller 清零 | Module：@yijunw0212 |
| `modules/signals` | 已观察到的外部事件与去重 provenance | Signal/Revision、去重与来源事实；Host 装配 Provider 投递 | `partial` | FD1–FD3/Cutover | Module：@yijunw0212 |
| `modules/feed` | Feed Item、Signal reference、material、read/archive/disposition 与 promotion provenance | Feed Item/Material/Disposition 与保留正文；旧 FeedStore 已删除 | `partial` | FD2/FD4/Cutover；Sources/Inbox/Feed 真实用户链路 | Module：@yijunw0212 |
| `modules/actions` | 个人/外部 Action 请求、状态和结果引用 | 占位包已删除；未来功能 | `absent` | F2；未来独立功能 Spec | — |
| `modules/attention-resumption` | Attention reference、reason 与最小处置状态 | Attention reference/reason 与最小处置；旧 Inbox 转发已退出 | `partial` | FD2/Cutover；完整 snooze/resume 仍是未来能力 | Module：@yijunw0212 |
| `modules/goals` | Goal、当前约定与要求、Graph、事件事实与工作状态、Planning、指导及历史 | `events` 唯一决定完成效果；当前意图／树使用同一事件归属；图分析读当前状态；项目规则（`policy_bindings`）及其历史可读；风险、Contract 修订与已退役的提案项已从存储删除（#272）；V3 一次性导入已删除（BL-083） | `partial` | GW1–GW6/DD1/DD2/Cutover；事件工作流收敛 | Module：@yijunw0212 |
| `modules/private-work-context` | 私人 Session、内容引用、关联语义、Runtime context binding 与 Handoff 事实 | Session / Handoff / Runtime 当前 Project 关联经 Ledger API 保存；私人内容与控制历史留在 Work | `partial` | WK1–WK3 已迁移；AR2 切换 Session schema v5、Catalog v10 与应用层组合 | Module：@yijunw0212 |
| `modules/artifacts` | Artifact、版本、类型、内容引用与 provenance | AR1 已建立唯一正式事实；旧代码仅有各 owner 的字符串引用，没有第二套 Artifact Store | `partial` | AR1 已迁 Core；AR3 切换现有结果入口 | Module：@yijunw0212 |
| `modules/shelf` | 个人置物架材料、副本任务、Hash 与本机抽字结果 | Home 下 `shelf/` 副本与 Jobs 沙箱；不写项目 Goal / Artifact | `partial` | Shelf 工作台切片；轮盘/热键仍待 Desktop | Module：@yijunw0212、@jingxusandra-gif |
| `modules/characters` | 个人 Character 草稿、修订与启用状态 | 按本人隔离编辑，确认修订后交给 Artifact 发布；不拥有执行和权限 | `partial` | `specs/coding-plugin/spec.md` §0 C12（产品接入中） | Module：@yijunw0212 |
| `modules/functions` | 已发布判断函数与一次判断记录 | 函数库、来源/去向/映射、场景绑定、判断落库；TypeSafe 由 Host 注入 | `partial` | `specs/archive/functions-system-capability/spec.md`；`specs/archive/functions-product-authoring/spec.md`；`specs/archive/functions-independent-authoring/spec.md`；事件去向动作范围 `specs/archive/function-scene-action-scope/spec.md` | Module：@yijunw0212 |
| `modules/governance-collaboration` | 当前用户决定、有限树提案／决定、provenance 与协作历史 | 当前可信用户来源、具体变更授权和决定事务；结构提案只含新建 Goal 与关系项；退役提案已删除（#263） | `partial` | EX3/EX4/AR2/DD1/DD2/Cutover；事件工作流收敛 | Module：@yijunw0212 |
| `server` | 共享身份、设备、项目访问、HTTP、SSE 与接续回执；聊天领域在 `src/im` | 右栏「讨论」页签的后端：本地宿主在 `/im` 挂载它的群聊（`apps/local-host/src/im-server.ts`），库是 Home 里的 `server/server.sqlite`；这是在用、还会迭代的功能（spec §1，2026-10-08「右栏『讨论』页签与 IM 代码」）。`apps/server` 是同一份实现的本地可部署启动器；所有业务读写调用现有 Action Host，不启动模型运行时。该决定要修的三处账目：库 `server/server.sqlite` 已登记进 Home 数据表（`docs/system/HOME-DATA.md` 3.4：必备份，`uninstall --purge-user-data` 清除 `server/`，普通卸载保留）；包的归类已改成业务包（`scripts/workspace-packages.mjs` 里记作 `module`，按 Module 规则检查，包括 `moduleRepositoryExports` 不许它的入口导出 Repository 或 Store）；还没做完的只剩宿主不再直接读它的表（`im-server.ts` 现在读 `mw_projects`、`mw_members`，W2-06） | `partial` | `specs/archive/molis-work-im/spec.md` | Module：@yijunw0212 |
| `modules/automation` | Trigger、Rule、Automation Run 与产生的 Action Request | 占位包已删除；未来功能 | `absent` | F2；未来独立功能 Spec | — |

每个 Module 的 API、事件和非职责见 [`docs/modules/`](modules/README.md)。Module 之间只通过公开 Capability Contract 调用，不导入彼此 implementation 或 Store。`modules/execution`（历史 Claim、Run）与 `modules/evidence-verification`（历史 Evidence）已于 2026-10-05 连同表、合同与展示删除（#268），事件工作流是唯一的工作协议；项目文件引用由 `apps/local-host/src/project-file-reference.ts` 读取当前工作区。

## 6. Horizontal services 与平台产品服务

| 目标 package | 提供的技术能力 | 当前来源 | 包成熟度 | 迁移 / 实现 Goal | 归属 |
| --- | --- | --- | --- | --- | --- |
| `horizontal/connector-host` | Provider 连接、凭据引用和调用 Receipt | Provider-neutral 连接/Receipt；Integration contribution 提供 Driver | `partial` | FD1/FD3/AP2/Cutover | 横向服务：@yijunw0212 |
| `horizontal/listener-host` | cursor、lease、重试、Raw Event 到 Signal Draft 投递 | Listener 技术 lease/cursor/去重/接收回执；Host 管 timer 生命周期 | `partial` | FD1/FD3/Cutover | 横向服务：@yijunw0212 |
| `horizontal/scheduler` | Durable one-shot wakeup | sqlite job/lease/收据；Web timer 与 Feed timer 并行；once/interval 由 Schedule 插件拥有 | `partial` | `specs/archive/schedule-plugin/spec.md` | 横向服务：@yijunw0212 |
| `horizontal/runtime-host` | Runtime 启动、恢复、中断、stream 与技术 Receipt | Runtime router、Codex app-server 与 PTY server host 已迁；浏览器 transport/reconnect 由 Work 消费 | `partial` | WK2 已迁 Host/Adapter；WK3 已迁产品编排 | 横向服务：@yijunw0212 |
| `horizontal/agent-host` | Agent Runtime 注册、能力矩阵、启动授权与副作用 Review 队列 | Prologue 为主执行引擎（文字/结构化/图片/判断推理、Agent 轮次、外部 MCP、任务板、子代理、检查点、后台命令与等待），CLI Runtime 为辅；同一 Home 只有一个执行归属（`.molis-runtime-owner.db` 锁）；审查队列；唯一直接依赖 `@prologue/sdk` 的包 | `partial` | Plugin Platform v2；`docs/platform/PROLOGUE-AI.md` | 共享核心：@yijunw0212、@jingxusandra-gif |
| `horizontal/search` | 系统搜索：经动作目录发现插件的搜索来源、维护可重建索引、按调用者权限聚合结果 | `SearchService`；系统动作 `search.query/open/status/rebuild` 由 Host 装配；索引持久化在 storage 适配；不读插件私有库 | `partial` | `specs/archive/system-search/spec.md` | 横向服务：@yijunw0212 |
| `horizontal/memory` | 平台记忆：个人与项目记忆的开关与策略、确定性写入门、召回编排、候选、最近变动与撤销、界面信号计数 | `MemoryService`；系统动作 `memory.*` 由 Host 装配；正文、版本、删除与隔离在 Prologue Memory（经 Agent Host）；旁表在 storage 适配；不调用模型 | `partial` | `specs/archive/memory-system/spec.md` | 横向服务：@yijunw0212 |
| `horizontal/placement` | 放在哪里：对象的位置、访问范围、关联（用于项目、Goal 资料、来自/复制自）与移动后的位置索引 | `PlacementService`；系统动作 `placement.describe/spaces/related/locate/link/unlink/move/copy/convert/goals/goal.bind/create` 由 Host 装配；关系写 Home 级 Context Ledger（`placement.db`）；对象事实总向所有者读；移动/复制经插件放置协议 | `partial` | `specs/archive/work-placement/spec.md` | 横向服务：@yijunw0212 |

本节 8 个包分两类（见[系统架构 §3](system/ARCHITECTURE.md)）：`connector-host`、`listener-host`、`scheduler`、`runtime-host`、`agent-host` 是横向运行服务，只保存 cursor、lease、retry 等可恢复的技术状态；`memory`、`placement`、`search` 按职责属于「平台产品服务」（目录暂留在 `horizontal/` 下），可以持有跨插件的策略和本服务自己的机制记录（放置的关联与来源、记忆的开关、候选与撤销、可重建的搜索索引）。情境排序（`packages/kernel` 的 `contextual.ts`）同属平台产品服务，代码位置不变。两类都不拥有 Goal、Signal、Action、Session 等插件或 Module 的业务事实。

## 7. Plugins

| 目标 package | 产品能力 | 当前来源 | 包成熟度 | 迁移 / 实现 Goal | 归属 |
| --- | --- | --- | --- | --- | --- |
| `plugins/native/goals` | Goals 内置插件的产品 UI：每个项目都带，拥有 Goal 的事实 | 当前事件意图、约定、报告、树决定，以及事件与 Journal 组成的历史；目录直接读当前状态；Workbench 注册并组合 UI，不另算完成 | `partial` | GW/DD/EX/Cutover；事件工作流收敛 | 内置插件：@yijunw0212 |
| `plugins/native/artifacts` | Artifacts 一级入口、浏览、嵌入和文档导入 | 正式版本列表、正文快照、详情与本地导出；Notion、飞书/Lark、Google Docs 和 Markdown/TXT/HTML 显式导入；Goal 上下文嵌入精确版本 | `partial` | AR3 已完成迁移验收；文档导入不含全空间迁移、自动同步或附件复制；真实账号联调待验 | 内置插件：@yijunw0212 |
| `plugins/native/inbox` | Inbox 一级入口与 Attention 处置 UI | 目录/详情只读 Attention；完成/忽略走 setStatus；`inbox.next` 沿用 Functions 绑定与显式重判，建议成稿/核查不自动执行；Host 将选中 Feed 材料交给 Pages，收据归 Pages，文稿可返回材料 | `partial` | Inbox/Feed 拆插件切片 2–3；`specs/archive/functions-system-capability/spec.md`；`specs/archive/feed-inbox-pages-loop/validation.md` | 内置插件：@yijunw0212 |
| `plugins/native/schedule` | Schedule 一级入口：对话任务与闹钟列表 | 人手创建日历日对话任务；其他插件 job 仍只展示与暂停 | `partial` | `specs/archive/schedule-conversation-tasks/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/shelf` | Shelf 一级入口：材料/结果/剪贴板与本机抽字 | DropAgent 表面挂进目录与工作面；Host 注入 `/api/shelf` 与 Store | `partial` | 工作台进货→抽字切片；轮盘/抓页/CLI Recipe 待 Desktop | 内置插件：@yijunw0212、@jingxusandra-gif |
| `apps/workbench/src/functions` | 系统能力服务的判断编辑器：写、试跑、发布 | 通过 Host 系统动作调用 modules/functions；连接与凭据复用服务连接（TypeSafe）；用途按场景合同派生，Feed 捕捉与首页判断已真实消费；入口在「能力」 | `partial` | `specs/action-architecture/spec.md`；`specs/archive/functions-independent-authoring/spec.md` | 共享核心：@yijunw0212 |
| `plugins/native/characters` | 角色管理界面与发布操作 | 经 Host 使用本人草稿和当前项目 Artifact；不拥有执行与权限 | `partial` | `specs/coding-plugin/spec.md` §0 C12（产品接入中） | 内置插件：@yijunw0212 |
| `plugins/native/pages` | Pages 一级入口：本机文档 | 库、ProseMirror 内核、块、评论、卡、挂 Goal 与 Promote；外部文件预览/批量导入与幂等收据；Host 注入真实写作模型（经 Prologue），材料快照与幂等生成收据归 Pages；对外只经动作目录与逐客户端授权 | `partial` | `specs/archive/pages-plugin/spec.md`；`specs/archive/plugin-outbound-mcp/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/form` | Forms 一级入口：本机问卷 | 建题、预览填写、提交与结果；另有显式「AI 拟题」（经 Prologue 文字模型）；对外只经动作目录与逐客户端授权 | `partial` | `specs/archive/creative-tools-plugins/spec.md`；`specs/archive/plugin-outbound-mcp/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/dataset` | Dataset 一级入口：本机数据表 | 行列编辑、CSV 导入导出、版本回滚；另有显式「AI 拟列」（经 Prologue 文字模型）；对外只经动作目录与逐客户端授权 | `partial` | `specs/archive/creative-tools-plugins/spec.md`；`specs/archive/plugin-outbound-mcp/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/ppt` | PPT 一级入口：本机演示稿 | 多页大纲（可按文字、AI 整理或 Pages 文档生成）、主题色、预览、JSON 与 .pptx 导出（不含图片与图表）；对外只经动作目录与逐客户端授权 | `partial` | `specs/archive/creative-tools-plugins/spec.md`；`specs/archive/plugin-outbound-mcp/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/lingguang` | 灵光一级入口：收想法的唯一处 | 快记、导入文件与读取链接成灵感、转成 Jelly 笔记、流式列表、丢掉确认、「复制内容」；头脑风暴对话经 Prologue 文字模型，未配置模型时如实显示不可用；不写 Goal/Artifact；动作经逐客户端授权对外 | `partial` | `specs/archive/lingguang-plugin/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/todo` | 待办一级入口：用户需要推进的事项的正式管理位置 | 个人与项目待办（先记录后归属）、五种状态与归档、截止/计划/提醒三种日期、来源与形成原因、关联、修改记录与撤销、视图/搜索/批量；私人库 `{home}/todo/todo.db`；动作 Home 级登记，项目内只见本项目与个人待办，“所有项目”只给本人界面；AI 整理与推进归系统 Assistant | `partial` | `specs/archive/todo-plugin/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/alchemist` | 炼金术士：项目隔离的 Founder Lab | Direction / Idea / 双 Lens / 证据决策 / Pulse / Copilot / Memory；AI 经 Prologue，公开证据经 SEL；验收见 spec | `partial` | `specs/archive/alchemist-plugin/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/feed` | Feed 一级入口和处置 UI | Sources/Feed 流水、同步与 promotion；支持研究库发布包接收；用户显式配置规则可自动加入 Inbox，需复核保留原因；仍只写 Attention | `partial` | FD/Cutover；Inbox/Feed 拆插件切片 3；`specs/archive/function-scene-action-scope/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/coding` | Coding App（`app`）：会话、轮次、计划、报告、变更集、协同与委派 | Plugin Runtime 托管；执行经 Agent Host/Prologue；执行报告进成果库（`coding.report.v1`），计划、变更集、图与目标上下文是 Coding 自己的过程项；19 项 `coding.*` 动作（16 项业务动作，另有对象读取、搜索与成果预览） | `partial` | `specs/coding-plugin/spec.md` 第 0 节；后续 `next-requirements.md` | 内置插件：@yijunw0212、@jingxusandra-gif |
| `plugins/native/files` | 工作区文件树与阅读：取有界文本快照与选区（`app`，Coding 家族） | Runtime 托管；目录与文件由 Host 经项目工作区设置能力读取，插件把结果变成树、预览和过程项（集合描述、`before`/`after` 文本快照、用户选中的文字） | `partial` | `specs/archive/coding-workbench-repair/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/git` | Git 工作区变更、提交草稿与被接受的变更集（`app`，Coding 家族） | Runtime 托管；`git` 由 Host 运行，插件解析 porcelain v1、把每处改动发布为可对比的变更集，并保管“是否接受一次 Coding Run 的改动”这个决定（决定由人做） | `partial` | `specs/archive/coding-workbench-repair/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/diff` | 对比界面：同一处理三种输入（`app`，Coding 家族） | Runtime 托管；输入是 Files 的两个快照、Coding Run 准备的变更集、Git 工作区里的改动；变更集过程项类型 `diff.changeset.v1` 按这个消费者定义 | `partial` | `specs/archive/coding-workbench-repair/spec.md` | 内置插件：@yijunw0212、@jingxusandra-gif |
| `plugins/native/text-stats` | 对已取得的文件快照数字符、UTF-8 字节和行（`app`，Coding 家族） | Runtime 托管；消费一个文件快照输入；两个查询动作（`text-stats.state` 读取已固定快照的统计，`text-stats.count` 统计给定文本），没有输出端口、事件和存储 | `partial` | `specs/archive/coding-workbench-repair/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/images` | 个人生图与项目生成记录 | 见下文「图片生成插件」；生成经 Prologue | `partial` | `specs/archive/images-plugin/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/jelly` | 个人日历与笔记（收想法在灵光） | 见下文「Jelly 私人工作区」 | `partial` | `specs/archive/jelly-plugin/` | 内置插件：@yijunw0212、@jingxusandra-gif |
| `plugins/native/cognia` | 个人知识库（现行 native 版） | 见下文「Cognia 个人知识库」；Cognia 2（生成插件方向）需求书未实施 | `partial` | `specs/archive/cognia-plugin/spec.md`；`specs/archive/cognia-plugin/v2/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/experiments` | 个人离线实验：多模型对比与复核 | Home 级；判断函数经系统 `functions.authoring.list` 以调用者授权读取 | `partial` | `specs/action-architecture/migration.md` Experiments 行 | 内置插件：@yijunw0212 |
| `plugins/native/workflows` | 工作流程：内容站交接、模板转换、AI 整理、判断规则、动作步骤 | 站点与步骤从动作目录发现；交接幂等、中断复用原结果 | `partial` | `specs/action-architecture/spec.md` 工作流程节 | 内置插件：@yijunw0212 |
| `plugins/native/plugin-builder` | 插件创作台：从一句需求生成插件 | 见下文「插件创作工作台」 | `partial` | `specs/archive/plugin-builder/work-items/studio-v3/spec.md` | 内置插件：@yijunw0212 |
| `plugins/official-integrations/catalog` | 连接器目录与文档导入 Provider | 目录条目、Notion 等 OAuth 与文档导入；账号检查经 `connectors.account.read` | `partial` | `specs/archive/connector-method-directory/spec.md` | 官方集成：@yijunw0212 |
| `plugins/native/actions` | Actions 一级入口 | 占位包已删除；未来功能 | `absent` | F2；未来独立功能 Spec | — |
| `plugins/native/work` | Session、Runtime、resume、handoff 应用和 UI | WK3 已迁应用编排、Session/Terminal contribution、浏览器控制器、HTTP 用例和工作目录恢复。`GET/POST /api/goals/:id/panels`（无子路径，JSON）仍是 Runtime 终端面板，与已删除的 Goal 五 tab fragment 不同 | `partial` | WK3；边界与证据见 `specs/molis-work-architecture-reorganization/wk3-validation.md` | 内置插件：@yijunw0212 |
| `plugins/native/automation` | Automation 一级入口 | 占位包已删除；未来功能 | `absent` | F2；未来独立功能 Spec | — |
| `plugins/official-integrations/github` | GitHub connector/listener/signal adapter | GitHub Provider、Device OAuth 与账号呈现；研究库固定提交解析和发布哈希校验，Host 提供 Git 快照；Host 注入 Secret/env | `partial` | FD3/Cutover；无旧 connector caller | 官方集成：@yijunw0212 |
| `plugins/official-integrations/gmail` | Gmail OAuth/connector/listener/signal adapter | Gmail OAuth/安装账号/scope/cursor/Provider；Host 注入安全存储 | `partial` | FD3/Cutover；无旧 connector caller | 官方集成：@yijunw0212 |
| `plugins/official-integrations/rss` | 官方目录与自定义 RSS provider adapter | 目录/custom RSS/正文分类/HTTP adapter；Host 提供运行上下文 | `partial` | FD3/Cutover；真实公开 RSS 拉取 | 官方集成：@yijunw0212 |
| `plugins/official-integrations/web-query` | Web Query provider adapter | Web Query Provider adapter；Host 注入 Intelligence client 与存储端口 | `partial` | FD3/Cutover | 官方集成：@yijunw0212 |
| `plugins/official-integrations/youtube` | YouTube Channel provider adapter | YouTube Channel 标识与 Provider adapter；Host 注入运行端口 | `partial` | FD3/Cutover | 官方集成：@yijunw0212 |

所有内置插件都由 molis 发布、带官方签名；其中只有 Goals 是每个项目都带、工作台里不能移除的插件。Plugin 之间不依赖 implementation：能力经共同动作目录调用；人要留存、引用的固定版本进成果库（`artifacts.produces`），交给别的插件的数据是生产方自己的过程项（`process_items.produces`），经端口与动作交换；其余事实留在各自插件的库里。

### 正在接入的独立插件

- [Casebook：产品流程与宿主前置能力](../specs/casebook-plugin/spec.md)：系统疑点与成员主动反馈进入改进 Backlog，经模块主 R 评审、系统准备方案和人确认后，交接正式 Goal 并回验。插件业务与详细实施清单由独立的 `molis-ai/goalboard-casebook` 仓库维护；本文档入口便于宿主各模块查阅依赖，不新增 workspace package，也不表示插件已注册、团队协作已接通或功能已验收。

## 8. Tooling、入口和发布面

| 入口 | 当前 owner / 状态 | 交付边界 |
| --- | --- | --- |
| plugin CLI 与示例 | tooling/plugin-cli；examples/plugin-sample | 公开 SDK scaffold → validate/pack/sign → 本地安装 → Artifact/UI；样例不进生产 workspace |
| workspace / npm | 根 scripts 调用 App-owned 构建与打包工具 | 全部 71 个 workspace 包由 `pnpm workspace:build` 拓扑构建；发布包包含必要内部 JS 和资产，消费者安装原生依赖；不独立发布私有包 |
| CLI / MCP / Web bins | apps/desktop/launchers/cli/main.ts、apps/desktop/launchers/mcp/server.ts、apps/desktop/launchers/web/server.ts | 只保留启动环境/stdio/资源路径与公开 App 入口；无业务 SQL 或状态机 |
| Desktop / Tauri | apps/desktop + apps/desktop/src-tauri | App/DMG/zip、bundle、ad-hoc codesign、本地安装/恢复；Developer ID、公证和公开发布不在本期验收承诺内 |
| Runtime Skill | skills/goal-advance | 仅消费正式公开 Contract 与入口，不读取内部 Store |
| Plugin 开发 Skill | skills/molis-plugin-dev | 随 npm / Home 发布；不自动挂 Runtime 接入；本仓库 `.cursor/skills` 只是符号链接 |
| CI / vendor | .github/workflows、vendor；App-owned 发布工具 | PR 与 main push 触发：包边界与 workspace 校验、健康门禁、Goal 边界与存储基线、发布资产、启动器类型检查、动作与插件合同、单一外壳与成果声明门禁、炼金术士测试；全量产品测试仍在本地跑（`specs/archive/repository-systematic-review/spec.md` F-08）。vendor 的来源、版本、许可证、SBOM 保留；发布包排除 `vendor/prologue-sdk/*.tgz` |
| 文档 | 本索引与对应 owner 文档 | 当前位置以此表为准；迁移期记录见 [`docs/archive/system-migration-2026-09.md`](archive/system-migration-2026-09.md)，阶段性验收保留历史，不代表未来能力落地 |

## 9. 变更规则

1. 新增、删除或改名 package，必须先更新本矩阵与架构 Spec。
2. Module owner、公开 Contract 或依赖方向变化，必须有明确决策，不能在代码搬迁中顺手改变。
3. 每个迁移 Goal 同时更新：目标 package README、对应 Module/Service 文档与本矩阵的状态。
4. `contract-only` 不得被 UI、CLI、MCP 或 Plugin Runtime 宣称为可用功能。
5. 旧 owner 只有在 caller 清零、行为兼容、数据迁移和回滚证据齐全后才能标为 `retired`。
6. 第 3 至 7 节各表的「归属」列（角色与评审账号）和 `.github/CODEOWNERS` 由 `scripts/package-owners.mjs` 的规则生成，不手改。新增、删除、改名 package 或换负责人后，改规则并运行 `node scripts/package-owners.mjs --write`；`pnpm boundary:check` 检查每个工作区包恰有一行、「归属」列与规则一致、CODEOWNERS 与规则一致。未建包的行（`absent`）归属写 `—`。CODEOWNERS 只请求评审，不改分支保护（`specs/repository-anti-corruption/spec.md` §1，2026-10-02、10-07）。

## 图片生成插件

| 责任 | Owner | 唯一事实源 |
| --- | --- | --- |
| 本机生图连接、项目任务、生成图片 | `plugins/native/images` | `{home}/images/images.db` 与 `assets/`；合同 `packages/contracts/src/modules/images.ts` |
| API Key 加密、项目路由、HTTP 生命周期 | Local Host / Storage | 宿主 SecretStore 与解析后的项目上下文 |

协议、范围与验证边界：`specs/archive/images-plugin/spec.md`；不改变文字模型设置，不自动重试或声明 Artifact 发布。

## Jelly 私人工作区

`plugins/native/jelly` 拥有个人日历、每周重复实例、分类、笔记块、关联和撤销历史；唯一写入库 `{home}/jelly/jelly.db`。收想法、读文件与网页在灵光（[合入后审查 PMR-22](../specs/archive/post-merge-review/spec.md)）。Host 只接 HTTP、MCP 和模型端口，Workbench 只装配插件界面。原 Jelly App 的数据文件不参与写入。合同：`packages/contracts/src/modules/jelly.ts`；完整复刻范围与未验收项：`specs/archive/jelly-plugin/`。

### 插件创作工作台

`plugins/native/plugin-builder` 拥有设计草稿、构建记录与发布版本。生成插件的后端由为此场景新建的 Prologue 代码 Agent 编写，运行在独立的 macOS 沙箱进程（`packages/plugin-sandbox`），只经宿主通道使用平台能力与安装时授权的其他插件动作；界面由平台用 UI 目录渲染。AgentHost 拥有 Prologue 执行，Host 拥有模型凭据与联网代理，PluginRuntime 拥有安装与私有存储权限。需求与验收见 `specs/archive/plugin-builder/work-items/studio-v3/spec.md`（旧解释器路线已被整体替换）。

## Cognia 个人知识库

`plugins/native/cognia` 拥有领域、来源、资料、不可变版本、导入预览/回执及待审阅知识草稿，唯一事实源 `{home}/cognia/cognia.db`。Local Host 只接安全目录读取、HTTP、默认关闭的只读 MCP 与 Prologue 模型端口；模型配置和凭据归现有 catalog/SecretStore，运行记录位于 `{home}/cognia/runtime/`。Workbench 沿既有 stage shell 装配界面，不修改原 vault，不引入云同步或第二运行时。范围与证据见 `specs/archive/cognia-plugin/spec.md`，格式边界见 `specs/archive/cognia-plugin/compatibility.md`。
