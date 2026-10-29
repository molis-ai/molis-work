# Molis Work 架构 SSOT 索引

2026-09-08 Cutover 后，现有产品实现已退出旧混合目录；正式调用链位于实际 workspace 包，当前清单以 [`scripts/workspace-packages.mjs`](../scripts/workspace-packages.mjs) 为准，数量由 `pnpm boundary:check` 的 `packageCount` 输出。产品启动器已归 apps/desktop/launchers；0.1.x 的根 SDK 已于 2026-10-04 删除（用户决定），根包不导出代码。历史验收证据见 [Cutover 验证](../specs/molis-work-architecture-reorganization/cutover-validation.md)，不能替代后续变更的验收。本文描述当前 owner；各阶段历史数字保留在对应验证报告，不再作为当前实现位置。

权威需求书：[架构需求书](../specs/molis-work-architecture-reorganization/spec.md)。每项事实只有一个 owner，详细规则在下列链接维护。

Molis Work 是本地优先的插件基座加多插件。平台是一个 Home 的常驻宿主、统一动作目录与授权、Plugin Runtime、工作台外壳和同一个 Prologue AI 运行时；内容与事实归 Module 或插件，每项事实只有一个 owner，下列各表逐包写明。Goals 是每个项目都带的内置插件，拥有 Goal 的事实。

Goal 是 Goals 插件拥有的一项事实（§7 `plugins/native/goals`；原 `modules/goals`、`modules/governance-collaboration` 的代码已并入该包，S9-3），按[事件工作流需求书](../specs/archive/goal-event-workflow-cleanup/spec.md)收敛：事件是唯一工作协议；事件之前的 Claim/Run/Evidence/Review 历史连同表与展示已于 2026-10-05 删除（#268）。真实 Session／终端归 Work 与 Runtime Host。本索引的相关 owner 行已同步；早期迁移报告保留当时的实现和验收记录。

## 1. 文档各管什么

| 问题 | 唯一权威来源 |
| --- | --- |
| 产品是什么（插件基座加多插件）、对用户承诺什么 | [`PRODUCT.md`](../PRODUCT.md) |
| 本次重组的完整决策、范围和逐包 Contract | [`specs/molis-work-architecture-reorganization/spec.md`](../specs/molis-work-architecture-reorganization/spec.md) |
| 分层、部署与端到端调用 | [`docs/system/ARCHITECTURE.md`](system/ARCHITECTURE.md) |
| 允许和禁止的代码依赖 | [`docs/system/PACKAGE-BOUNDARIES.md`](system/PACKAGE-BOUNDARIES.md) |
| 概念与命名：一个概念一个名字、一个定义，旧称、界面用词与代码改名清单 | [`docs/system/GLOSSARY.md`](system/GLOSSARY.md) |
| 兼容逻辑清单与删除进度 | [`specs/repository-anti-corruption`](../specs/repository-anti-corruption/spec.md) §4（迁移期记录已归档到 [`docs/archive/system-migration-2026-09.md`](archive/system-migration-2026-09.md)） |
| 每个包的规模、运行状态（在用 / Runtime / 构建期 / 非产品，不是下面第 2 节的状态词）和计划审查深度 | [`specs/repository-anti-corruption`](../specs/repository-anti-corruption/spec.md) §5.1 的包清单表；`scripts/gates/package-inventory.mjs` 按登记表和代码检查，随 `pnpm health:check` 跑。每个包的成熟度（第 2 节四词）唯一写在 `scripts/workspace-packages.mjs`，各表的「包成熟度」列由 `scripts/package-owners.mjs` 逐行校验，随 `pnpm boundary:check` 跑 |
| 巨大单元只许变小 | `pnpm health:check`（基线 `tooling/gates/baseline.json`，必须长的登记在 `tooling/gates/giant-exceptions.json`）；全部单元的 owner、判定与计划见 [`docs/system/HUGE-CLASS-MIGRATION.md`](system/HUGE-CLASS-MIGRATION.md)，2026-09 的迁移历史在 [`docs/archive/huge-class-migration-2026-09.md`](archive/huge-class-migration-2026-09.md) |
| 评审截图、根目录杂项、vendored 补丁的去留 | [`docs/system/REPOSITORY-HYGIENE.md`](system/REPOSITORY-HYGIENE.md)；`pnpm health:check` 按评审组限制入库的 `.impeccable/` 文件，只许减少 |
| 13 个业务事实 Module（另有 4 个尚未建包的未来 owner；插件自有的库见 §7） | [`docs/modules/`](modules/README.md) |
| 9 个 `horizontal/` 包：5 个横向运行服务，4 个平台产品服务（记忆、放置、搜索、项目资料） | [`docs/horizontal/`](horizontal/README.md)（Memory、Placement 的边界见各自包 README） |
| Plugin、存储、交换、UI 等平台机制 | [`docs/platform/`](platform/README.md) |
| Molis Work 自己联网去哪里（出站网络逐类登记：主机、触发、发出去什么、限制） | [`docs/platform/NETWORK.md`](platform/NETWORK.md)（[English](platform/NETWORK.en.md)）；设置页「服务连接」链到它；到 AnySearch 的出站只有 `apps/local-host/src/anysearch-transport.ts` 一条 |
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
| `production` | 已交付并在产品里正式使用：主路径、错误、持久化、恢复、测试和文档都已通过；本行不写未来能力。 |
| `experimental` | 功能存在但未承诺：怎么用、去留另定；行内必须写出移除或默认关闭的条件。 |
| `slice` | 目标 package 已建、已有真实实现，但只覆盖目标职责的一片；行内必须写出缺的那一片和后续 Goal/BL。 |
| `absent` | 目标物理 package 尚未创建，不参与构建或发布。 |

四个词只用于第 3 至 7 节各表的「包成熟度」格（含未来目标路径行），与「运行状态」（在用 / Runtime / 构建期 / 非产品）不是一件事。判定由人依据该行行文与迁移切片验收作出；`scripts/workspace-packages.mjs` 是判定结果的唯一写入处，`scripts/package-owners.mjs` 在 `pnpm boundary:check` 里逐行校验：真实包的成熟度格必须等于登记表的值，没有对应 workspace 包的目标路径行必须是 `absent`。

迁移期的 `legacy-mixed`、`contract-only`、`partial`、`implemented`、`retired`、`workspace-root + legacy-release` 已退役；历史见 [`docs/archive/system-migration-2026-09.md`](archive/system-migration-2026-09.md) 与 [`specs/repository-anti-corruption/roadmap-2026-10-07.md`](../specs/repository-anti-corruption/roadmap-2026-10-07.md)。

当前 70 个 package（6 app、10 foundation、14 module（`modules/*` 的 13 个加聊天与接续的 `server`）、9 horizontal、24 native plugin、6 integration plugin、1 tooling，按 `scripts/workspace-packages.mjs`，2026-10-25 核对）：`production` 54、`slice` 14、`experimental` 2。另外 10 个仅含描述符的占位包已删除；下表保留 8 个未来目标路径并标为 `absent`，不参与构建或发布；`apps/workbench/src/functions` 是包内目标路径行，跟随 `apps/workbench` 的成熟度。

## 3. Apps

| 目标 package | 负责什么 | 当前来源 | 包成熟度 | 迁移 / 实现 Goal | 归属 |
| --- | --- | --- | --- | --- | --- |
| `apps/desktop` | macOS 外壳、生命周期、Native Bridge | Native Bridge、Panel、Capsule 与发布工具；Tauri 配置在 apps/desktop/src-tauri | `production` | AP4/DV4/Cutover；实际平台安装证据见验证报告 | 应用：@yijunw0212 |
| `apps/workbench` | 本地产品 UI 与页面组合 | Shell、导航、页面组合与注册 UI contribution、跟随焦点对象的侧栏及系统工作标签；通用呈现边界，不拥有 Goal 完成算法；无数据库实现 | `production` | AP3/FD4/GW5/EX4/AR3/WK3/Cutover | 共享核心：@yijunw0212 |
| `apps/local-host` | 本地唯一业务 composition root 和 single writer | 唯一项目数据库和业务装配；统一动作服务的宿主侧（能力目录合成、系统动作、逐客户端 MCP 授权、调用记录、跨进程动作网关）；可信身份与 Web/CLI/MCP 装配；各 Native 插件的组合适配（注入存储位置、模型、Artifact 发布等端口）；凭据与本机 IO | `production` | AP2/Cutover；动作服务见 `specs/action-architecture/` | 共享核心：@yijunw0212 |
| `apps/server` | 轻量交换、Team 控制面、Team Plugin Host | 独立启动器：`apps/server` 是 `server/`（身份、设备、项目访问、接续回执、事件传输、IM 领域）的本地可部署启动器，所有业务读写调用现有 Action Host；它没有产品入口、不随 Desktop/npm 发布，只有跨设备测试在用，也不是正式的交换/Team 控制面，去留随功能迭代另定（spec §1，2026-10-08「右栏『讨论』页签与 IM 代码」）。右栏「讨论」页签不经过它：本地宿主直接挂载 `server/`，见 `server` 行；实验条件：正式的 Server/Exchange 功能 spec 立项时再定去留，在那之前不新增依赖它的产品路径（2026-10-25 统筹裁定） | `experimental`（独立启动器，无产品入口） | `specs/archive/molis-work-im/spec.md`；正式 Server/Exchange 仍待独立功能 Spec | 应用：@yijunw0212 |
| `apps/cli` | 参数、协议和终端展示适配 | 协议参数、命令分发与公开应用 adapter；root bin 仅注入启动环境 | `production` | DV1/Cutover；CLI 协议和真实进程验证 | 应用：@yijunw0212 |
| `apps/mcp` | MCP schema、audience 和 Capability 适配 | 平台工具只有项目连接工具（含 Goals 接续摘要）和受保护的管理入口（`initialize`、`event_decide`、`goal_tree_decide`）；Goals 与各插件的能力都是 Host 按动作目录合成、逐客户端授权的动作工具；Host 注入普通调用的项目与身份；用户决定仅受保护入口可执行 | `production` | DV1/DV2/Cutover；#269 | 应用：@yijunw0212 |

## 4. Foundation 与 Tooling packages

| 目标 package | 唯一职责 | 当前来源 | 包成熟度 | 迁移 / 实现 Goal | 归属 |
| --- | --- | --- | --- | --- | --- |
| `packages/contracts` | Module、Service、Platform 的可发布类型与 Schema | Module/Service/Platform 公开类型和 Schema；无业务或 IO 实现 | `production` | F2/F3；63 个 public subpath（外加根入口；2026-10-19 按 package.json exports 核对，含页面事件登记 platform/dom-events 与本机地址判断 platform/loopback；W2-01 删了 6 个只有描述符、没人用的占位）与兼容门禁 | 共享核心：@yijunw0212 |
| `packages/kernel` | Capability 注册、选择、权限与生命周期骨架 | versioned Capability registry 与统一动作服务核心 `ActionService`（定义/兑现校验、输入输出 schema、可用性、`beforeEffect` 副作用前复查、场景绑定与判断消费）；授权事实由 Local Host 持久保存。另承载平台产品服务「情境排序」（`contextual.ts`，纯函数，位置按 N-03 不变；宿主那一半在 `apps/local-host/src/contextual/`），边界由 `pnpm health:check` 的 K1–K5 守着 | `production` | F2、F3、AP2；`specs/action-architecture/spec.md` | 共享核心：@yijunw0212 |
| `packages/plugin-runtime` | Plugin 安装、签名身份、grant、隔离和生命周期；安装隔离的私有 KV | 本地 Runtime、持久开发状态、可撤销授权和签名校验；Home 安装/发行物/KV 在 `plugin-runtime/plugin-runtime.db` v2，由 Local Host 组合当前 schema；插件业务 SQLite 仍归各插件；不是 OS sandbox | `production` | F2、FD3、DV3；分发收口见 DV4 | 平台包：@yijunw0212 |
| `packages/plugin-sdk` | 外部 Plugin 作者使用的稳定 API 与测试入口，也是平台共用的公共运行时底座 | Manifest/definition/polling、公开 Artifact/UI/private client 类型与动作合同再导出；执行生命周期 `createExecutionLifetime`（自有实现，内核、宿主、调度、Shelf、沙箱都从这里取）；Manifest 解析、端口与事件检查、版本比较（`parsePluginManifest`、`comparePluginVersions`，Plugin Runtime 与命令行共用这一份；动作声明检查 `inspectActionDeclarations` 与同一次注册里的交叉引用检查 `inspectActionCrossReferences` 内核注册时也用，Agent 与方法、四种来源协议的检查只供这两处调用，不对外导出）；有界逐行文本比较（`compareTexts`、`splitLines`、`textDiffRow`、`alignSplitRows` 等，工作台审查界面、Coding 与 Diff 从这里取；结果与行的类型留在合同包）；动作的两个绑定函数（`bindPluginActionRoute`：HTTP 路由兑现动作，失败按错误的 kind 答；`bindOwnerPluginAction`：动作只对本机所有者开放；Plugin Runtime 路由器的拒绝同样用 SDK 的 `actionErrorResponse`）；只依赖 contracts（`public-sdk-private-dependency`）；fixture 由 Local Host 实现；界面部件三个子路径（PG-055）：`/ui`（字符串部件与图标名 `PluginIconName`）、`/browser`（DOM 工具）、`/page-globals`（页面全局与端口的类型），插件和宿主都从这里取，design-system 不转出 | `production` | F2、FD3、DV3 | 共享核心：@yijunw0212 |
| `packages/storage` | SQLite、Filesystem、Blob、事务和 migration 技术能力 | SQLite/事务/文件/密文/联网搜索缓存 Adapter；系统搜索的本地全文索引适配（`openTextSearchIndex`，可删除重建）；业务 schema 归 Module | `production` | 各事实迁移/Cutover；Web Home 作用域隔离 | 平台包：@yijunw0212 |
| `packages/exchange` | Envelope、ACK、Cursor、Replay、CAS 与 Blob 交换 | 当前不存在正式 Server/Exchange | `absent` | F2；未来独立功能 Spec | — |
| `packages/ui-host` | UI Contribution、Slot、嵌入、隔离和桥接 | FD4 registry/render 与 AP3 surface/Slot mount 校验已落地；Installed Plugin 隔离与完整安全 bridge 仍待独立实现；缺片：Installed Plugin 隔离与完整安全 bridge；后续：另立独立安全 spec | `slice` | F2、FD4、AP3 | 平台包：@yijunw0212 |
| `packages/design-system` | Token、基础组件、图标和可访问性基线 | Soft Workbench token（`palette.ts` 唯一来源）、主题、密度、字体、icon、`mw-*` 的样式、图标表（按 SDK 的 `PluginIconName` 逐个画）、AI 交互部件、终层与组件板 `/__ui/catalog`；规范见 `DESIGN.md`；旧 visual-foundation 已删除；字符串部件的实现在 Plugin SDK 的 `/ui`（PG-055），本包依赖 SDK | `production` | AP3/Cutover；Soft Workbench 迁移（`specs/archive/soft-workbench-rollout`）；Native 包布局待验 | 平台包：@yijunw0212 |
| `packages/observability` | 结构化日志、trace、diagnostic 与安全脱敏 | 各入口零散日志 | `absent` | F2、F3、保证 Goal | — |
| `packages/test-kit` | 无业务判断的公共测试工具：包边界规则、无头 Chrome 启动与 DevTools 驱动（`/browser`）、访问本机 Host HTTP 管理接口的客户端（`/local-host-http`） | F3 boundary policy；`/browser`、`/local-host-http`（W2-11）；时钟、fake capability 与其余重复 harness 待迁移；缺片：时钟、fake capability 与其余重复 harness；后续：随 test-kit 收口迁移 | `slice` | F2、F3；后续测试基础设施 Goal | 平台包：@yijunw0212 |
| `packages/im-ui` | 群聊（IM）页面、样式与浏览器控制器 | 由 Workbench 右栏「讨论」页签（`apps/workbench/src/side-panel.ts` 嵌入 `/im`）和 `apps/server` 的 IM 页面消费；不拥有消息事实。这是在用、还会迭代的功能，不是待删的实验（spec §1，2026-10-08「右栏『讨论』页签与 IM 代码」） | `production` | `specs/archive/molis-work-im/spec.md` | 平台包：@yijunw0212 |
| `packages/plugin-sandbox` | 生成插件的 macOS 沙箱进程与宿主通道 | 插件创作台生成的后端在独立沙箱进程里运行，只经宿主通道使用平台能力 | `production` | `specs/archive/plugin-builder/work-items/agent-built-plugins/spec.md`（S0 执行底座）；整体路线见 `specs/archive/plugin-builder/work-items/studio-v3/spec.md` | 平台包：@yijunw0212 |
| `tooling/plugin-cli` | Plugin 作者的 validate、create、pack、identity、sign、verify 命令，以及经 Host 的本地开发验证 | `create` 默认生成 v2 Integration 插件；`pack` 生成显式文件列表的 JSON bundle；签名与验证用 Plugin Runtime 的公开包验证接口；`dev` 经注入的 `PluginCliHost` 使用真实 Local Host；由 `apps/desktop/launchers/cli/main.ts` 装配 | `production` | DV3；入口表见 §8 | 工具：@yijunw0212 |

`packages/contracts/modules`、`services`、`platform` 是同一个发布包的 subpath 分区，不是三个独立 npm package。

## 5. Modules

| 目标 package | 事实 owner | 当前来源 | 包成熟度 | 迁移 / 实现 Goal | 归属 |
| --- | --- | --- | --- | --- | --- |
| `modules/identity-team-access` | User、Team、membership、Access Decision | 占位包已删除；未来功能 | `absent` | F2；未来独立功能 Spec | — |
| `modules/projects` | Project 身份、Catalog、workspace membership | 正式 Project/Catalog 事实；Host 编排文件生命周期，Desktop 提供平台 | `production` | AP1/AP2/Cutover；旧 Catalog 已删除 | Module：@yijunw0212 |
| `modules/context-ledger` | ObjectRef、跨模块关系、publication、materialization | Feed / Runtime 关联、输入来源、临时重建与 Coordinator 归属审计已通过；未来 publication / 异步 materialization 未实现；缺片：未来 publication / 异步 materialization；后续：补未来能力时另立 Goal（AR2 已验收主路径） | `slice` | AR2 已验收；[验收记录](../specs/molis-work-architecture-reorganization/ar2-validation.md) | Module：@yijunw0212 |
| `modules/sync-replication` | 发布意图、replica、冲突和用户可见同步状态 | 占位包已删除；未来功能 | `absent` | F2；未来独立功能 Spec | — |
| `modules/actions` | 个人/外部 Action 请求、状态和结果引用 | 占位包已删除；未来功能 | `absent` | F2；未来独立功能 Spec | — |
| `modules/attention-resumption` | Attention reference、reason 与最小处置状态 | Attention reference/reason 与最小处置；旧 Inbox 转发已退出；缺片：完整 snooze/resume；后续：另立 Goal 补未来能力 | `slice` | FD2/Cutover；完整 snooze/resume 仍是未来能力 | Module：@yijunw0212 |
| `modules/private-work-context` | Runtime context binding（Runtime 工作入口与 Project 的绑定、事件、setup 幂等、拒绝建议） | Runtime 当前 Project 关联经 Ledger API 保存；控制历史留在本模块。Session、内容引用与 Handoff 随 Sessions 插件下线（SC-4）删除，重做见 BL-177；缺片：Sessions 下线后的重做；后续：BL-177 | `slice` | WK1–WK3 已迁移；SC-4 删除 Session 部分 | Module：@yijunw0212 |
| `modules/artifacts` | Artifact、版本、类型、内容引用与 provenance | AR1 已建立唯一正式事实；旧代码仅有各 owner 的字符串引用，没有第二套 Artifact Store | `production` | AR1 已迁 Core；AR3 切换现有结果入口 | Module：@yijunw0212 |
| `modules/shelf` | 个人置物架材料、副本任务、Hash 与本机抽字结果 | Home 下 `shelf/` 副本与 Jobs 沙箱；不写项目 Goal / Artifact；缺片：轮盘/热键的 Desktop 适配；后续：随 Desktop 轮盘接入 | `slice` | Shelf 工作台切片；轮盘/热键仍待 Desktop | Module：@yijunw0212、@jingxusandra-gif |
| `modules/characters` | 个人 Character 草稿、修订与启用状态，角色动作的声明、处理器与本人绑定，本机导入逻辑（CHR-0、CHR-1：角色不再是插件，Host 用它登记动作提供方，「设置 › 角色」是 Host 的设置节，界面在 `apps/workbench/src/characters/`） | 按本人隔离编辑，确认修订后交给 Artifact 发布；不拥有执行、权限和界面；缺片：产品接入；后续：coding-c12 | `slice` | `specs/coding-plugin/spec.md` §0 C12（产品接入中） | Module：@yijunw0212 |
| `modules/functions` | 已发布判断函数与一次判断记录 | 函数库、来源/去向/映射、场景绑定、判断落库；TypeSafe 由 Host 注入 | `production` | `specs/archive/functions-system-capability/spec.md`；`specs/archive/functions-product-authoring/spec.md`；`specs/archive/functions-independent-authoring/spec.md`；事件去向动作范围 `specs/archive/function-scene-action-scope/spec.md` | Module：@yijunw0212 |
| `server` | 共享身份、设备、项目访问、HTTP、SSE 与接续回执；聊天领域在 `src/im` | 右栏「讨论」页签的后端：本地宿主在 `/im` 挂载它的群聊（`apps/local-host/src/im-server.ts`），库是 Home 里的 `server/server.sqlite`；这是在用、还会迭代的功能（spec §1，2026-10-08「右栏『讨论』页签与 IM 代码」）。`apps/server` 是同一份实现的本地可部署启动器；所有业务读写调用现有 Action Host，不启动模型运行时。该决定要修的三处账目：库 `server/server.sqlite` 已登记进 Home 数据表（`docs/system/HOME-DATA.md` 3.4：必备份，`uninstall --purge-user-data` 清除 `server/`，普通卸载保留）；包的归类已改成业务包（`scripts/workspace-packages.mjs` 里记作 `module`，按 Module 规则检查，包括 `moduleRepositoryExports` 不许它的入口导出 Repository 或 Store）；还没做完的只剩宿主不再直接读它的表（`im-server.ts` 现在读 `mw_projects`、`mw_members`，W2-06） | `production` | `specs/archive/molis-work-im/spec.md` | Module：@yijunw0212 |
| `modules/automation` | Trigger、Rule、Automation Run 与产生的 Action Request | 占位包已删除；未来功能 | `absent` | F2；未来独立功能 Spec | — |

每个 Module 的 API、事件和非职责见 [`docs/modules/`](modules/README.md)。Module 之间只通过公开 Capability Contract 调用，不导入彼此 implementation 或 Store。`modules/execution`（历史 Claim、Run）与 `modules/evidence-verification`（历史 Evidence）已于 2026-10-05 连同表、合同与展示删除（#268），事件工作流是唯一的工作协议；项目文件引用由 `apps/local-host/src/project-file-reference.ts` 读取当前工作区。

## 6. Horizontal services 与平台产品服务

| 目标 package | 提供的技术能力 | 当前来源 | 包成熟度 | 迁移 / 实现 Goal | 归属 |
| --- | --- | --- | --- | --- | --- |
| `horizontal/connector-host` | Provider 连接、凭据引用和调用 Receipt | Provider-neutral 连接/Receipt；Integration contribution 提供 Driver | `production` | FD1/FD3/AP2/Cutover | 横向服务：@yijunw0212 |
| `horizontal/scheduler` | Durable one-shot wakeup | sqlite job/lease/收据；Web timer 与 Feed timer 并行；once/interval 由 Schedule 插件拥有 | `production` | `specs/archive/schedule-plugin/spec.md` | 横向服务：@yijunw0212 |
| `horizontal/runtime-host` | 本机终端（PTY）进程的启动、接入、写入、缩放、结束与有限回放 | PTY server host；Codex 会话适配器与路由已随 Sessions 下线删除，Sessions 重做见 BL-177；缺片：Sessions 重做（Codex 会话适配器已随 Sessions 下线删除）；后续：BL-177 | `slice` | WK2 已迁 Host/Adapter；WK3 已迁产品编排 | 横向服务：@yijunw0212 |
| `horizontal/agent-host` | Agent Runtime 注册、能力矩阵、启动授权与副作用 Review 队列 | Prologue 为主执行引擎（文字/结构化/图片/判断推理、Agent 轮次、外部 MCP、任务板、子代理、检查点、后台命令与等待），没有第二个执行引擎（`claude` 命令行适配器已于 2026-10 删除，外部 Agent 运行时按口径暂缓）；同一 Home 只有一个执行归属（`.molis-runtime-owner.db` 锁）；审查队列；唯一直接依赖 `@prologue/sdk` 的包 | `production` | Plugin Platform v2；`docs/platform/PROLOGUE-AI.md` | 共享核心：@yijunw0212、@jingxusandra-gif |
| `horizontal/knowledge` | 项目资料：项目里所有 Agent 共用的资料查找与读取（卡片、分节、按节读原文、逐行查找），经系统搜索找、向对象主人读，用调用者的授权 | `KnowledgeService`；系统动作 `knowledge.list/search/outline/read/grep/glob` 由 Host 与系统搜索同处装配；不保存正文；内置 Agent 在项目里默认持有（可在对外接入撤销） | `production` | `specs/archive/project-knowledge/spec.md` | 横向服务：@yijunw0212 |
| `horizontal/search` | 系统搜索：经动作目录发现插件的搜索来源、维护可重建索引、按调用者权限聚合结果 | `SearchService`；系统动作 `search.query/open/status/rebuild` 由 Host 装配；索引持久化在 storage 适配；不读插件私有库 | `production` | `specs/archive/system-search/spec.md` | 横向服务：@yijunw0212 |
| `horizontal/memory` | 平台记忆：个人与项目记忆的开关与策略、确定性写入门、召回编排、候选、最近变动与撤销、界面信号计数 | `MemoryService`；系统动作 `memory.*` 由 Host 装配；正文、版本、删除与隔离在 Prologue Memory（经 Agent Host）；旁表在 storage 适配；不调用模型 | `production` | `specs/archive/memory-system/spec.md` | 横向服务：@yijunw0212 |
| `horizontal/placement` | 放在哪里：对象的位置、访问范围、关联（用于项目、Goal 资料、来自/复制自）与移动后的位置索引 | `PlacementService`；系统动作 `placement.describe/spaces/related/locate/link/unlink/move/copy/convert/goals/goal.bind/create` 由 Host 装配；关系写 Home 级 Context Ledger（`placement.db`）；对象事实总向所有者读；移动/复制经插件放置协议 | `production` | `specs/archive/work-placement/spec.md` | 横向服务：@yijunw0212 |

本节 8 个包分两类（见[系统架构 §3](system/ARCHITECTURE.md)）：`connector-host`、`scheduler`、`runtime-host`、`agent-host` 是横向运行服务，只保存 cursor、lease、retry 等可恢复的技术状态。例外只有一处：`agent-host` 另外保存人保存的 Agent 配置，只有外部 MCP 服务器、装进项目的 Skill（界面叫「方法」）、写后检查器三类，各在下面「Agent Host 保存的人的配置」里有一行；除此之外它也只存技术状态。`memory`、`placement`、`search`、`knowledge` 按职责属于「平台产品服务」（目录暂留在 `horizontal/` 下），可以持有跨插件的策略和本服务自己的机制记录（放置的关联与来源、记忆的开关、候选与撤销、可重建的搜索索引）。情境排序（`packages/kernel` 的 `contextual.ts`）同属平台产品服务，代码位置不变。两类都不拥有 Goal、Signal、Action、Session 等插件或 Module 的业务事实。

**规划中的平台产品服务：观测和采集层。** [独立需求](../specs/observation-collection/spec.md)于 2026-10-27 从主动助理中迁出，尚未实现，包位置待设计；不计入上表当前包与成熟度。它负责获准的观察记录、工作关联、历史证据可用性与覆盖缺口，原始业务内容、正式状态及对象身份仍归对应插件或服务；历史证据不产生第二份可编辑事实。评测与主动助理经公开能力消费同一事实，分别负责效果判断和工作建议，不各建采集链；实施沿后续演进计划 C 轨。

**规划中的平台产品服务：观测和采集层。** [独立需求](../specs/observation-collection/spec.md)于 2026-10-27 从主动助理中迁出，尚未实现，包位置待设计；不计入上表当前包与成熟度。它负责获准的观察记录、工作关联、历史证据可用性与覆盖缺口，原始业务内容、正式状态及对象身份仍归对应插件或服务；历史证据不产生第二份可编辑事实。评测与主动助理经公开能力消费同一事实，分别负责效果判断和工作建议，不各建采集链；实施沿后续演进计划 C 轨。

## 7. Plugins

| 目标 package | 产品能力 | 当前来源 | 包成熟度 | 迁移 / 实现 Goal | 归属 |
| --- | --- | --- | --- | --- | --- |
| `plugins/native/goals` | Goals 内置插件的产品 UI：每个项目都带，拥有 Goal 的事实；原 Goals 与 Governance 模块并入本包的 `src/module/` 与 `src/governance/`（S9-3） | 当前事件意图、约定、报告、树决定，以及事件与 Journal 组成的历史；目录直接读当前状态；Workbench 注册并组合 UI，不另算完成 | `production` | GW/DD/EX/Cutover；事件工作流收敛 | 内置插件：@yijunw0212 |
| `plugins/native/artifacts` | Artifacts 一级入口、浏览、嵌入和文档导入（2026-10-18 改：成果库是平台事实，不是插件；代码迁走前仍按插件装配，见 `specs/repository-anti-corruption/spec.md` §1 的 2026-10-18 各行；2026-10-26：动作的提供方已是平台的（`kind` 为 `system`，id 不变），外壳（项目键、界面）仍按插件装配，随 PG-077 第二步，见 `specs/repository-anti-corruption/slices/pg077-artifacts-provider.md`） | 正式版本列表、正文快照、详情与本地导出；Notion、飞书/Lark、Google Docs 和 Markdown/TXT/HTML 显式导入；Goal 上下文嵌入精确版本 | `production` | AR3 已完成迁移验收；文档导入不含全空间迁移、自动同步或附件复制；真实账号联调待验 | 内置插件：@yijunw0212 |
| `plugins/native/inbox` | Inbox 一级入口与 Attention 处置 UI | 目录/详情只读 Attention；完成/忽略走 setStatus；`inbox.next` 沿用 Functions 绑定与显式重判，建议成稿/核查不自动执行；Host 将选中 Feed 材料交给 Pages，收据归 Pages，文稿可返回材料；缺片：Inbox/Feed 拆插件切片 2–3；后续：切片 2–3 计划 | `slice` | Inbox/Feed 拆插件切片 2–3；`specs/archive/functions-system-capability/spec.md`；`specs/archive/feed-inbox-pages-loop/validation.md` | 内置插件：@yijunw0212 |
| `plugins/native/schedule` | Schedule 一级入口：对话任务与闹钟列表 | 人手创建日历日对话任务；其他插件 job 仍只展示与暂停；缺片：其他插件 job 的创建/编辑；后续：补齐 job 编辑 | `slice` | `specs/archive/schedule-conversation-tasks/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/shelf` | Shelf 一级入口：材料/结果/剪贴板与本机抽字 | DropAgent 表面挂进目录与工作面；路由在插件自己的 `/api/plugins/io.molis.work.shelf/…`，Host 注入 Store；缺片：轮盘/抓页/CLI Recipe；后续：Desktop 接入 | `slice` | 工作台进货→抽字切片；轮盘/抓页/CLI Recipe 待 Desktop | 内置插件：@yijunw0212、@jingxusandra-gif |
| `apps/workbench/src/functions` | 系统能力服务的判断编辑器：写、试跑、发布 | 通过 Host 系统动作调用 modules/functions；连接与凭据复用服务连接（TypeSafe）；用途按场景合同派生，Feed 捕捉与首页判断已真实消费；入口在「能力」 | `production` | `specs/action-architecture/spec.md`；`specs/archive/functions-independent-authoring/spec.md` | 共享核心：@yijunw0212 |
| `plugins/native/pages` | Pages 一级入口：本机文档 | 库、ProseMirror 内核、块备注、正文批注与持久评论线程（含助理回复与引用锚点）、卡、挂 Goal 与 Promote；外部文件预览/批量导入与幂等收据；由 Plugin Runtime 每个项目托管一个实例，库留在 Home 的 `pages/pages.db`，写作模型（经 Prologue）、成果与上传文件读取来自 Runtime 服务，材料快照与幂等生成收据归 Pages；对外只经动作目录与逐客户端授权 | `production` | `specs/archive/pages-plugin/spec.md`；`specs/archive/plugin-outbound-mcp/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/form` | Forms 一级入口：本机问卷 | 建题、预览填写、提交与结果；另有显式「AI 拟题」（经 Prologue 文字模型）；对外只经动作目录与逐客户端授权 | `production` | `specs/archive/creative-tools-plugins/spec.md`；`specs/archive/plugin-outbound-mcp/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/dataset` | Dataset 一级入口：本机数据表 | 行列编辑、CSV 导入导出、版本回滚；另有显式「AI 拟列」（经 Prologue 文字模型）；对外只经动作目录与逐客户端授权 | `production` | `specs/archive/creative-tools-plugins/spec.md`；`specs/archive/plugin-outbound-mcp/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/ppt` | PPT 一级入口：本机演示稿 | 多页大纲（可按文字、AI 整理或 Pages 文档生成）、主题色、预览、JSON 与 .pptx 导出（不含图片与图表）；对外只经动作目录与逐客户端授权 | `production` | `specs/archive/creative-tools-plugins/spec.md`；`specs/archive/plugin-outbound-mcp/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/lingguang` | 灵光一级入口：收想法的唯一处 | 快记、导入文件与读取链接成灵感、转成 Jelly 笔记、流式列表、丢掉确认、「复制内容」；头脑风暴对话经 Prologue 文字模型，未配置模型时如实显示不可用；不写 Goal/Artifact；动作经逐客户端授权对外 | `production` | `specs/archive/lingguang-plugin/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/todo` | 待办一级入口：用户需要推进的事项的正式管理位置 | 个人与项目待办（先记录后归属）、五种状态与归档、截止/计划/提醒三种日期、来源与形成原因、关联、修改记录与撤销、视图/搜索/批量；私人库 `{home}/todo/todo.db`；动作 Home 级登记，项目内只见本项目与个人待办，“所有项目”只给本人界面；AI 整理与推进归系统 Assistant | `production` | `specs/archive/todo-plugin/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/alchemist` | 炼金术士：项目隔离的 Founder Lab | Direction / Idea / 双 Lens / 证据决策 / Pulse / Copilot / Memory；AI 经 Prologue，公开证据经 SEL；验收见 spec；缺片：工作台升级中的 Alchemist 场景（用户 2026-10-27 归并；现有代码仍不删、先绕过）；后续：BL-377 | `slice` | `specs/plugin-builder-upgrade/spec.md`（旧迁入证据：`specs/archive/alchemist-plugin/spec.md`） | 内置插件：@yijunw0212 |
| `plugins/native/feed` | Feed 一级入口和处置 UI | Sources/Feed 流水、同步与 promotion；支持研究库发布包接收；用户显式配置规则可自动加入 Inbox，需复核保留原因；仍只写 Attention；缺片：Inbox/Feed 拆插件切片 3；后续：切片 3 计划 | `slice` | FD/Cutover；Inbox/Feed 拆插件切片 3；`specs/archive/function-scene-action-scope/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/coding` | Coding App（`app`）：会话、轮次、计划、报告、变更集、协同与委派 | Plugin Runtime 托管；执行经 Agent Host/Prologue；执行报告进成果库（`coding.report.v1`），计划、变更集、图与目标上下文是 Coding 自己的过程项；19 项 `coding.*` 动作（16 项业务动作，另有对象读取、搜索与成果预览） | `production` | `specs/coding-plugin/spec.md` 第 0 节；后续 `next-requirements.md` | 内置插件：@yijunw0212、@jingxusandra-gif |
| `plugins/native/files` | 工作区文件树与阅读：取有界文本快照与选区（`app`，Coding 家族） | Runtime 托管；目录与文件由 Host 经项目工作区设置能力读取，插件把结果变成树、预览和过程项（集合描述、`before`/`after` 文本快照、用户选中的文字） | `production` | `specs/archive/coding-workbench-repair/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/git` | Git 工作区变更与提交草稿（`app`，Coding 家族） | Runtime 托管；`git` 由平台的工作区 Git 服务运行（宿主的 `workspace-git*.ts`，只给插件调的动作 `projects.workspace.git.*`、`projects.workspace.writers.*`），插件经 SDK 解析 porcelain v1、把每处改动发布为可对比的变更集。接受一次 Coding Run 的改动不经 Git：主工作区里的每次写入先由人审查，并行子任务的成果经 Coding 的整合审查（`review:git-integration`）回到主工作区 | `production` | `specs/archive/coding-workbench-repair/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/diff` | 对比界面：同一处理三种输入（`app`，Coding 家族） | Runtime 托管；输入是 Files 的两个快照、Coding Run 准备的变更集、Git 工作区里的改动；变更集过程项类型 `diff.changeset.v1` 按这个消费者定义 | `production` | `specs/archive/coding-workbench-repair/spec.md` | 内置插件：@yijunw0212、@jingxusandra-gif |
| `plugins/native/text-stats` | 对已取得的文件快照数字符、UTF-8 字节和行（`app`，Coding 家族） | Runtime 托管；消费一个文件快照输入；两个查询动作（`text-stats.state` 读取已固定快照的统计，`text-stats.count` 统计给定文本），没有输出端口、事件和存储 | `production` | `specs/archive/coding-workbench-repair/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/issues` | 个人问题的原始描述、类型、上下文与版本 | Home Runtime 托管；业务表 `{home}/issues/issues.db`；页面、助理、MCP 共用 `issues.*`，项目切换不分库；连接和授权由 Host 提供 | `production` | `specs/issue-home-v0/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/images` | 个人生图与项目生成记录 | Home Runtime 独占原库/文件；生图经有限服务和 Prologue | `production` | `specs/archive/images-plugin/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/jelly` | 个人日历与笔记（收想法在灵光） | Home Runtime 独占原库；模型及配置经有限服务 | `production` | `specs/archive/jelly-plugin/` | 内置插件：@yijunw0212、@jingxusandra-gif |
| `plugins/native/cognia` | 个人知识库（现行 native 版） | 见下文「Cognia 个人知识库」；Cognia 2（生成插件方向）需求书未实施 | `production` | `specs/archive/cognia-plugin/spec.md`；`specs/archive/cognia-plugin/v2/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/workflows` | 工作流程：内容站交接、模板转换、AI 整理、判断规则、动作步骤 | 站点与步骤从动作目录发现；交接幂等、中断复用原结果；由 Plugin Runtime 装配（每个项目一份），经 `actions:delegate` 以调用者本人的身份调站点与步骤，不放宽调用者的授权 | `production` | `specs/action-architecture/spec.md` 工作流程节；`specs/repository-anti-corruption/spec.md` W5-01-WORKFLOWS | 内置插件：@yijunw0212 |
| `plugins/native/plugin-builder` | 插件创作台：从一句需求生成插件；现有实现先绕过，后续作为平台场景组装能力的创作入口（2026-10-27） | 见下文「插件创作工作台」；缺片：整体体验与端到端交付（用户 2026-10-27 反馈至今未完整跑通），包含新能力创作与手动／个人助理组合已有插件，Alchemist 为落地场景；后续：BL-377 | `slice` | `specs/plugin-builder-upgrade/spec.md`（旧实现证据：`specs/archive/plugin-builder/work-items/studio-v3/spec.md`） | 内置插件：@yijunw0212 |
| `plugins/official-integrations/catalog` | 连接器目录与文档导入 Provider | 目录条目、Notion 等 OAuth 与文档导入；账号检查经 `connectors.account.read` | `production` | `specs/archive/connector-method-directory/spec.md` | 官方集成：@yijunw0212 |
| `plugins/native/actions` | Actions 一级入口 | 占位包已删除；未来功能 | `absent` | F2；未来独立功能 Spec | — |
| `plugins/native/automation` | Automation 一级入口 | 占位包已删除；未来功能 | `absent` | F2；未来独立功能 Spec | — |
| `plugins/official-integrations/github` | GitHub connector/listener/signal adapter | GitHub Provider、Device OAuth 与账号呈现；研究库固定提交解析和发布哈希校验，Host 提供 Git 快照；Host 注入 Secret/env | `production` | FD3/Cutover；无旧 connector caller | 官方集成：@yijunw0212 |
| `plugins/official-integrations/gmail` | Gmail OAuth/connector/listener/signal adapter | Gmail OAuth/安装账号/scope/cursor/Provider；Host 注入安全存储 | `production` | FD3/Cutover；无旧 connector caller | 官方集成：@yijunw0212 |
| `plugins/official-integrations/rss` | 官方目录与自定义 RSS provider adapter | 目录/custom RSS/正文分类/HTTP adapter；Host 提供运行上下文 | `production` | FD3/Cutover；真实公开 RSS 拉取 | 官方集成：@yijunw0212 |
| `plugins/official-integrations/web-query` | Web Query provider adapter | Web Query Provider adapter；Host 注入 Intelligence client 与存储端口；实验条件：连续两个版本没有产品调用方就默认关闭，并提交统筹决定是否删除（2026-10-25 统筹裁定） | `experimental` | FD3/Cutover | 官方集成：@yijunw0212 |
| `plugins/official-integrations/youtube` | YouTube Channel provider adapter | YouTube Channel 标识与 Provider adapter；Host 注入运行端口 | `production` | FD3/Cutover | 官方集成：@yijunw0212 |

所有内置插件都由 molis 发布、带官方签名；其中只有 Goals 是每个项目都带、工作台里不能移除的插件。Plugin 之间不依赖 implementation：能力经共同动作目录调用；人要留存、引用的固定版本进成果库（`artifacts.produces`），交给别的插件的数据是生产方自己的过程项（`process_items.produces`），经端口与动作交换；其余事实留在各自插件的库里。

### 已删除的接入

- Casebook 已于 2026-10-10 按用户决定删除（宿主里的子系统、`/casebook/v1/` 通道、5 个 typed 能力、项目库的 5 张表），以后重做；当时的说明在 [`specs/archive/casebook-plugin/spec.md`](../specs/archive/casebook-plugin/spec.md)。

## 8. Tooling、入口和发布面

| 入口 | 当前 owner / 状态 | 交付边界 |
| --- | --- | --- |
| plugin CLI 与示例 | tooling/plugin-cli；examples/plugin-sample | 公开 SDK scaffold → validate/pack/sign → 本地安装 → Artifact/UI；样例不进生产 workspace |
| workspace / npm | 根 scripts 调用 App-owned 构建与打包工具 | 全部 70 个 workspace 包由 `pnpm workspace:build` 拓扑构建；发布包包含必要内部 JS 和资产，消费者安装原生依赖；不独立发布私有包 |
| CLI / MCP / Web bins | apps/desktop/launchers/cli/main.ts、apps/desktop/launchers/mcp/server.ts、apps/desktop/launchers/web/server.ts | 只保留启动环境/stdio/资源路径与公开 App 入口；无业务 SQL 或状态机 |
| Desktop / Tauri | apps/desktop + apps/desktop/src-tauri | App/DMG/zip、bundle、ad-hoc codesign、本地安装/恢复；Developer ID、公证和公开发布不在本期验收承诺内 |
| Runtime Skill | skills/goal-advance | 仅消费正式公开 Contract 与入口，不读取内部 Store |
| Plugin 开发 Skill | skills/molis-plugin-dev | 随 npm / Home 发布；不自动挂 Runtime 接入；本仓库 `.cursor/skills` 只是符号链接 |
| CI / vendor | .github/workflows、vendor；App-owned 发布工具 | PR 与 main push 触发：包边界与 workspace 校验、健康门禁、Goal 边界与存储基线、发布资产、启动器类型检查、动作与插件合同、单一外壳与成果声明门禁、炼金术士测试；全量产品测试仍在本地跑（`specs/archive/repository-systematic-review/spec.md` F-08）。vendor 的来源、版本、许可证、SBOM 保留；发布包排除 `vendor/prologue-sdk/*.tgz` |
| 文档 | 本索引与对应 owner 文档 | 当前位置以此表为准；迁移期记录见 [`docs/archive/system-migration-2026-09.md`](archive/system-migration-2026-09.md)，阶段性验收保留历史，不代表未来能力落地 |

## 9. 变更规则

1. 新增、删除或改名 package，必须先更新本矩阵与架构 Spec。
2. Module owner、公开 Contract 或依赖方向变化，必须有明确决策，不能在代码搬迁中顺手改变。
3. 每个包的成熟度或目标能力变化，同时更新对应 Module/Service 文档与本矩阵的状态；成熟度只写第 2 节四个词之一。
4. 标为 `slice` 或 `experimental` 的包不得被 UI、CLI、MCP 或 Plugin Runtime 宣称为已交付的正式功能。
5. 旧 owner 从登记表与本矩阵退场（删行或并入别的包）前，先确认 caller 清零、行为兼容、数据迁移和回滚证据齐全；本矩阵不保留过渡词。
6. 第 3 至 7 节各表的「归属」列（角色与评审账号）和 `.github/CODEOWNERS` 由 `scripts/package-owners.mjs` 的规则生成，不手改。新增、删除、改名 package 或换负责人后，改规则并运行 `node scripts/package-owners.mjs --write`；`pnpm boundary:check` 检查每个工作区包恰有一行、「归属」列与规则一致、CODEOWNERS 与规则一致。未建包的行（`absent`）归属写 `—`。「包成熟度」列由 `scripts/workspace-packages.mjs` 写、同一个检查逐行核对：真实包必须等于登记表的值，没有 workspace 包的目标路径行必须是 `absent`（`absent` 行不参与构建）。CODEOWNERS 只请求评审，不改分支保护（`specs/repository-anti-corruption/spec.md` §1，2026-10-02、10-07；成熟度词表 2026-10-25，W5-15）。

## Agent Host 保存的人的配置

| 责任 | Owner | 唯一事实源 |
| --- | --- | --- |
| 外部 MCP 服务器的配置（地址或命令、超时、启用；凭据只给引用） | `horizontal/agent-host` | Prologue Runtime 的存储，kind `molis-mcp`；宿主能力 `agent.mcp.*` |
| 装进项目的 Skill（界面叫「方法」） | `horizontal/agent-host` | Prologue Runtime 的存储，kind `molis-coding-method`；宿主能力 `agent.skills.*` |
| 写后检查器：每个项目、每个已授权工作区一份，带版本 | `horizontal/agent-host` | Prologue Runtime 的存储，kind `molis-write-checkers`；动作 `agent.write_checkers.list.v1`、`agent.write_checkers.save.v1`，受众只有人（`specs/prologue-adoption/spec.md` §6.0p.2） |

三类都由人保存，`agent-host` 只经 Prologue 的存储读写，不建自己的表。工作区授权本身归 Home 的项目目录（读法是 `projects.settings.workspaces.read.v1`），这里只引用它。

## 图片生成插件

| 责任 | Owner | 唯一事实源 |
| --- | --- | --- |
| 本机生图连接、项目任务、生成图片 | `plugins/native/images` | `{home}/images/images.db` 与 `assets/`；合同 `plugins/native/images/src/contract.ts` |
| 连接凭据、授权与实际模型请求 | Connector owner / Home Host / agent-host | Connector 连接与绑定；可信声明选择命名空间，imageGeneration 服务只交回字节与当次 revision |

协议、范围与验证边界：`specs/archive/images-plugin/spec.md`；不改变文字模型设置，不自动重试或声明 Artifact 发布。

## Jelly 私人工作区

`plugins/native/jelly` 拥有个人日历、每周重复实例、分类、笔记块、关联和撤销历史；唯一写入库 `{home}/jelly/jelly.db`。收想法、读文件与网页在灵光（[合入后审查 PMR-22](../specs/archive/post-merge-review/spec.md)）。Home Runtime 注册全部 53 动作并提供 database、model 和 model.configuration；Host 的通用配置服务拥有模型选择解释与原 preferences.json v1，Jelly 拥有设置动作/UI与业务库。Workbench 只装配插件界面。原 Jelly App 的数据文件不参与写入。合同：`plugins/native/jelly/src/contract.ts`；完整复刻范围与未验收项：`specs/archive/jelly-plugin/`。

### 插件创作工作台

`plugins/native/plugin-builder` 现有实现拥有设计草稿、构建记录与发布版本。用户 2026-10-27 反馈至今未完整跑通；后续首先整体升级创作体验和端到端交付能力，同时由平台提供通用场景组装能力，工作台保有创作体验和草稿，个人助理使用同一公开动作；Alchemist 是落地场景，现行升级需求与验收见 `specs/plugin-builder-upgrade/spec.md`（BL-377，尚未实现）。下面保留旧实现边界。生成插件的后端由为此场景新建的 Prologue 代码 Agent 编写，运行在独立的 macOS 沙箱进程（`packages/plugin-sandbox`），只经宿主通道使用平台能力与安装时授权的其他插件动作；界面由平台用 UI 目录渲染。AgentHost 拥有 Prologue 执行，Host 拥有模型凭据与联网代理，PluginRuntime 拥有安装与私有存储权限。旧实现的范围与证据见 `specs/archive/plugin-builder/work-items/studio-v3/spec.md`（旧解释器路线已被整体替换），不作为本次升级已实现的证据。

## Cognia 个人知识库

`plugins/native/cognia` 拥有领域、来源、资料、不可变版本、导入预览/回执及待审阅知识草稿，唯一事实源 `{home}/cognia/cognia.db`。Local Host 只接安全目录读取、HTTP、默认关闭的只读 MCP 与 Prologue 模型端口；模型配置和凭据归现有 catalog/SecretStore，运行记录位于 `{home}/cognia/runtime/`。Workbench 沿既有 stage shell 装配界面，不修改原 vault，不引入云同步或第二运行时。范围与证据见 `specs/archive/cognia-plugin/spec.md`，格式边界见 `specs/archive/cognia-plugin/compatibility.md`。
