# Molis Work 架构 SSOT 索引

2026-09-08 Cutover 后，现有产品实现已退出旧混合目录；正式调用链位于实际 workspace 包，当前清单以 [`scripts/workspace-packages.mjs`](../scripts/workspace-packages.mjs) 为准，数量由 `pnpm boundary:check` 的 `packageCount` 输出。产品启动器已归 apps/desktop/launchers；0.1.x 的根 SDK 已于 2026-10-04 删除（用户决定），根包不导出代码。历史验收证据见 [Cutover 验证](../specs/molis-work-architecture-reorganization/cutover-validation.md)，不能替代后续变更的验收。本文描述当前 owner；各阶段历史数字保留在对应验证报告，不再作为当前实现位置。

空间归属由 `packages/storage` 维护不可变元数据与 Store 绑定，`apps/local-host` 按验证后的账号选择独立 Home/Host；项目模块接收 `spaceId`，项目与插件内容继承所在 Store/Home。2026-09-30 的[空间归属切片](../specs/archive/personal-space-ownership/spec.md)验证了本地与个人空间，当时团队仅预留、尚未实现云同步。此后的个人同步已有本机联调和可配置 HTTPS 端点，生产部署与真实双设备的证据在[个人同步总纲](../specs/personal-cloud-sync/spec.md)更新；团队项目交换的边界见[架构说明](system/ARCHITECTURE.md)与[存储和交换](platform/STORAGE-AND-EXCHANGE.md)。

权威需求书：[架构需求书](../specs/molis-work-architecture-reorganization/spec.md)。每项事实只有一个 owner，详细规则在下列链接维护。

Molis Work 是本地优先的 Agent OS、人机与团队协作工作台及多插件能力基座。平台是一个 Home 的常驻宿主、统一动作目录与授权、Plugin Runtime、工作台外壳、同一个 Prologue AI 运行时及跨插件协作与治理服务（主线、项目指导、可信决定、逐项认可、对象工作终端、记忆、工作记录、外部会话等）；业务内容与事实归 Module 或插件，每项事实只有一个 owner，下列各表逐包写明。Goals 与其他项目插件同等地位（新项目不默认安装、可移除，移除后数据保留），拥有 Goal 的事实。

Goal 是 Goals 插件拥有的一项事实（§7 `plugins/native/goals`；原 `modules/goals`、`modules/governance-collaboration` 的代码已并入该包，S9-3），按[事件工作流需求书](../specs/archive/goal-event-workflow-cleanup/spec.md)收敛：事件是唯一工作协议；事件之前的 Claim/Run/Evidence/Review 历史连同表与展示已于 2026-10-05 删除（#268）。真实 Session／终端归 Work 与 Runtime Host。本索引的相关 owner 行已同步；早期迁移报告保留当时的实现和验收记录。

## 1. 文档各管什么

按使用、开发、发布或接续任务选阅读路径，先看[文档入口](README.md)；具体问题的权威来源按下表查。本索引维护分工与事实归属，不代替各份文档的规则或验收记录。

| 问题 | 唯一权威来源 |
| --- | --- |
| 产品是什么（Agent OS、协作工作台与多插件基座）、对用户承诺什么 | [`PRODUCT.md`](../PRODUCT.md) |
| 安装、启动、维护与卸载 | [`docs/installation.md`](installation.md)（[English](installation.en.md)） |
| CLI 命令、源码构建与日常开发 | [`docs/cli-and-development.md`](cli-and-development.md)（[English](cli-and-development.en.md)）；仓库执行约束见 [`AGENTS.md`](../AGENTS.md) |
| 生产界面的视觉与交互规范 | [`DESIGN.md`](../DESIGN.md)及其引用的现行规范；执行手册见 [`skills/molis-design-ui/SKILL.md`](../skills/molis-design-ui/SKILL.md)；[`docs/design/`](design/README.md)是设计参考与原型 |
| 模型调用、Agent、提示词与上下文 | [`docs/platform/PROLOGUE-AI.md`](platform/PROLOGUE-AI.md)；执行步骤见 [`skills/molis-prologue-ai/SKILL.md`](../skills/molis-prologue-ai/SKILL.md) |
| 发布规则、操作步骤与某次发布的范围 | [`docs/releases/POLICY.md`](releases/POLICY.md)管规则，[`CHECKLIST.md`](releases/CHECKLIST.md)管步骤；[`CHANGELOG.md`](releases/CHANGELOG.md)及各版本发布记录管变化、验证与缺口 |
| Home 里的库、文件归谁，如何备份与卸载 | [`docs/system/HOME-DATA.md`](system/HOME-DATA.md) |
| 本次重组的完整决策、范围和逐包 Contract | [`specs/molis-work-architecture-reorganization/spec.md`](../specs/molis-work-architecture-reorganization/spec.md) |
| 分层、部署与端到端调用 | [`docs/system/ARCHITECTURE.md`](system/ARCHITECTURE.md) |
| 允许和禁止的代码依赖 | [`docs/system/PACKAGE-BOUNDARIES.md`](system/PACKAGE-BOUNDARIES.md) |
| 概念与命名：一个概念一个名字、一个定义，旧称、界面用词与代码改名清单 | [`docs/system/GLOSSARY.md`](system/GLOSSARY.md) |
| 兼容逻辑清单与删除进度 | [`docs/system/CONTRACT-CHANGES.md`](system/CONTRACT-CHANGES.md) 的「3. 阶段一：现在，不留兼容期」「4. 阶段二：起点之后，读取兼容」与「6. 登记表」；迁移期历史见 [`docs/archive/system-migration-2026-09.md`](archive/system-migration-2026-09.md) |
| 每个包的规模、运行状态（在用 / Runtime / 构建期 / 非产品，不是下面第 2 节的状态词）和计划审查深度 | [`docs/system/PACKAGE-BOUNDARIES.md`](system/PACKAGE-BOUNDARIES.md#7-现行包清单) §7 的「现行包清单」；登记唯一来源是 `scripts/workspace-packages.mjs`，`scripts/gates/package-inventory.mjs` 按登记表和代码检查，随 `pnpm health:check` 跑。每个包的成熟度（第 2 节四词）唯一写在 `scripts/workspace-packages.mjs`，各表的「包成熟度」列由 `scripts/package-owners.mjs` 逐行校验，随 `pnpm boundary:check` 跑 |
| 巨大单元只许变小 | `pnpm health:check`（CI 实测对照 merge-base，必须长的登记在 `tooling/gates/giant-exceptions/`）；全部单元的 owner、判定与计划见 [`docs/system/HUGE-CLASS-MIGRATION.md`](system/HUGE-CLASS-MIGRATION.md)，2026-09 的迁移历史在 [`docs/archive/huge-class-migration-2026-09.md`](archive/huge-class-migration-2026-09.md) |
| 评审截图、根目录杂项、vendored 补丁的去留 | [`docs/system/REPOSITORY-HYGIENE.md`](system/REPOSITORY-HYGIENE.md)；`pnpm health:check` 按评审组限制入库的 `.impeccable/` 文件，只许减少 |
| 业务事实 Module（当前包与尚未建包的未来 owner 见 §5；插件自有的库见 §7） | [`docs/modules/`](modules/README.md) |
| `horizontal/` 下的横向运行服务与平台产品服务，当前包见 §6 | [`docs/horizontal/`](horizontal/README.md)（Memory、Placement、Appearance 的包边界见各自 README） |
| Plugin、存储、交换、UI 等平台机制 | [`docs/platform/`](platform/README.md) |
| Molis Work 自己联网去哪里（出站网络逐类登记：主机、触发、发出去什么、限制） | [`docs/platform/NETWORK.md`](platform/NETWORK.md)（[English](platform/NETWORK.en.md)）；设置页「服务连接」链到它；到 AnySearch 的出站只有 `apps/local-host/src/anysearch-transport.ts` 一条 |
| 新插件先写什么、怎么接到产品 | [`skills/molis-plugin-dev/SKILL.md`](../skills/molis-plugin-dev/SKILL.md)（Host/CLI/接入分文件）；命令与录取四问仍是 [`docs/platform/PLUGIN-DEVELOPMENT.md`](platform/PLUGIN-DEVELOPMENT.md) |
| 平台公开状态与家族 | [contracts 的公开词表](platform/STATE-VOCABULARY.md)；状态环家族来自 contracts 的 UI 合同 |
| 插件状态机声明、转换及流水账 | 声明归插件 Manifest，转换和数据归对象主人，SDK 提供共用检查；安装登记投影与只读查询（`system.state-machines`）的主人是 Plugin Runtime，从内置定义和已存发行物现读、不建表；插件生命周期这台平台状态机也归它 |
| 新增一个插件、服务集成、设置分区、界面语言、操作系统平台等要改哪里、目标几处；内置插件迁到 Plugin Runtime 的计划；第三方插件的安装方案 | [`docs/system/EXTENSION-POINTS.md`](system/EXTENSION-POINTS.md)、[`docs/system/RUNTIME-MIGRATION.md`](system/RUNTIME-MIGRATION.md)、[`docs/system/THIRD-PARTY-PLUGINS.md`](system/THIRD-PARTY-PLUGINS.md) |
| 某次实现具体改什么、如何验收 | 对应 `specs/<task>/spec.md` 或已接受 Goal Contract |
| 查找执行中需求、现行规范与归档；接续剩余工作 | [`specs/README.md`](../specs/README.md)管分类与索引，[`specs/BACKLOG.md`](../specs/BACKLOG.md)管统一待办；排期见[路线书](../specs/post-anticorruption-roadmap/spec.md)，步骤见[需求开发流程](../specs/post-anticorruption-roadmap/reference/development-workflow.md) |
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

迁移期的 `legacy-mixed`、`contract-only`、`partial`、`implemented`、`retired`、`workspace-root + legacy-release` 已退役；历史见 [`docs/archive/system-migration-2026-09.md`](archive/system-migration-2026-09.md) 与 [`specs/archive/repository-anti-corruption/roadmap-2026-10-07.md`](../specs/archive/repository-anti-corruption/roadmap-2026-10-07.md)。

当前 workspace 包清单、分层与成熟度以 `scripts/workspace-packages.mjs` 为准，`pnpm workspace:check` 输出当前 `packageCount`；下表逐包列出职责、成熟度与归属，不另维护汇总数量。`server` 按 Module 计，`modules/`、`horizontal/` 的概念文档不等于现存包清单。仅含描述符的占位包已删除；下表的未来目标路径标为 `absent`，不参与构建或发布；`apps/workbench/src/judgment-rules` 是包内目标路径行，跟随 `apps/workbench` 的成熟度。

## 3. Apps

独立 Rust 服务端代码不计入下表的 pnpm 包数：`server/src/sync` 拥有个人同步远端事件、回执、容量、附件与保留记录，`apps/sync-worker` 只负责 Cloudflare 入口装配和部署。两者由 Cargo 与 native-checks 检查；详见 [同步模块](../server/src/sync/README.md)。原 `server` Node 包的登记、身份/IM 事实归属及公开入口不变。

| 目标 package | 负责什么 | 当前来源 | 包成熟度 | 迁移 / 实现 Goal | 归属 |
| --- | --- | --- | --- | --- | --- |
| `apps/desktop` | macOS 外壳、生命周期、Native Bridge | Native Bridge、Panel、菜单栏与发布工具；Tauri 配置在 apps/desktop/src-tauri | `production` | AP4/DV4/Cutover；实际平台安装证据见验证报告 | 应用：@yijunw0212 |
| `apps/workbench` | 本地产品 UI 与页面组合 | Shell、导航、页面组合与注册 UI contribution、跟随焦点对象的侧栏及系统工作标签；平台文字主人 `workbench` 的语言目录（`resources/locales/`）与各主人的词表（`src/plugin-text.ts`）；Goals 的页面由 Goals 包绘制，这里只交它外壳端口（T-116）；通用呈现边界，不拥有 Goal 完成算法；无数据库实现 | `production` | AP3/FD4/GW5/EX4/AR3/WK3/Cutover | 共享核心：@yijunw0212 |
| `apps/local-host` | 本地唯一业务 composition root 和 single writer | 唯一项目数据库和业务装配；统一动作服务的宿主侧（能力目录合成、系统动作、逐客户端 MCP 授权、调用记录、跨进程动作网关）；可信身份与 Web/CLI/MCP 装配；各 Native 插件的组合适配（注入存储位置、模型、Artifact 发布等端口）；凭据与本机 IO | `production` | AP2/Cutover；动作服务见 `specs/action-architecture/` | 共享核心：@yijunw0212 |
| `apps/server` | 无桌面窗口的接续服务命令与生命周期 | 2026-11-09 用户批准改由现有产品 CLI 的 `molis-work server …` 组合公开 `runServer(args, ports)`，替代原独立 Node 路径；授权、动作网关证明与本机资产恢复适配留在 Host owner。移除对 desktop/Host 的反向 import。接续能力仍属实验范围，此次接线不代表完整 Server/Exchange 或 Team 控制面已经交付 | `experimental`（已接入产品 CLI；能力仍实验） | `docs/reviews/daily-quality/2026-11-08-medium-supplement.md`；`specs/archive/daily-quality-medium-20261108/spec.md` | 应用：@yijunw0212 |
| `apps/cli` | 参数、协议和终端展示适配 | 协议参数、命令分发与公开应用 adapter；root bin 仅注入启动环境 | `production` | DV1/Cutover；CLI 协议和真实进程验证 | 应用：@yijunw0212 |
| `apps/mcp` | MCP schema、audience 和 Capability 适配 | 平台工具包含项目连接与受保护的管理入口（`initialize`、`review_request`、`review_decide`）；业务能力由 Host 按动作目录合成、逐客户端授权；本人决定沿平台受保护入口固定原提供方与目标版本 | `production` | DV1/DV2/Cutover；#269 | 应用：@yijunw0212 |

## 4. Foundation 与 Tooling packages

| 目标 package | 唯一职责 | 当前来源 | 包成熟度 | 迁移 / 实现 Goal | 归属 |
| --- | --- | --- | --- | --- | --- |
| `packages/contracts` | Module、Service、Platform 的可发布类型与 Schema | Module/Service/Platform 公开类型和 Schema；无业务或 IO 实现 | `production` | F2/F3；88 个 public subpath（外加根入口，共 89 个 exports key；2026-11-22 按 `packages/contracts/package.json` `exports` 核对，含页面事件登记 `platform/dom-events`、本机地址判断 `platform/loopback`、外部工具登记 `platform/external-tools`、端到端评测 `services/evaluation` 与通用接收/挂接 `platform/item-intake`）与兼容门禁 | 共享核心：@yijunw0212 |
| `packages/kernel` | Capability 注册、选择、权限与生命周期骨架 | versioned Capability registry 与统一动作服务核心 `ActionService`（定义/兑现校验、输入输出 schema、可用性、`beforeEffect` 副作用前复查、场景绑定与判断消费）；授权事实由 Local Host 持久保存。另承载平台产品服务「情境排序」（`contextual.ts`，纯函数，位置按 N-03 不变；宿主那一半在 `apps/local-host/src/contextual/`），边界由 `pnpm health:check` 的 K1–K5 守着 | `production` | F2、F3、AP2；`specs/action-architecture/spec.md` | 共享核心：@yijunw0212 |
| `packages/plugin-runtime` | Plugin 安装、签名身份、grant、隔离和生命周期；安装隔离的私有 KV | 本地 Runtime、持久开发状态、可撤销授权和签名校验；Home 安装/发行物/KV 在 `plugin-runtime/plugin-runtime.db`，由 Local Host 组合当前 schema；插件业务 SQLite 仍归各插件；不是 OS sandbox | `production` | F2、FD3、DV3；分发收口见 DV4 | 平台包：@yijunw0212 |
| `packages/plugin-sdk` | 外部 Plugin 作者使用的稳定 API 与测试入口，也是平台共用的公共运行时底座 | Manifest/definition/polling、公开 Artifact/UI/private client 类型与动作合同再导出；执行生命周期 `createExecutionLifetime`（自有实现，内核、宿主、调度、Shelf、沙箱都从这里取）；Manifest 解析、端口与事件检查、版本比较（`parsePluginManifest`、`comparePluginVersions`，Plugin Runtime 与命令行共用这一份；动作声明检查 `inspectActionDeclarations` 与同一次注册里的交叉引用检查 `inspectActionCrossReferences` 内核注册时也用，Agent 与方法、四种来源协议的检查只供这两处调用，不对外导出）；有界逐行文本比较（`compareTexts`、`splitLines`、`textDiffRow`、`alignSplitRows` 等，工作台审查界面、Coding 与 Diff 从这里取；结果与行的类型留在合同包）；动作的两个绑定函数（`bindPluginActionRoute`：HTTP 路由兑现动作，失败按错误的 kind 答；`bindOwnerPluginAction`：动作只对本机所有者开放；Plugin Runtime 路由器的拒绝同样用 SDK 的 `actionErrorResponse`）；只依赖 contracts（`public-sdk-private-dependency`）；fixture 由 Local Host 实现；界面部件三个子路径（PG-055）：`/ui`（字符串部件与图标名 `PluginIconName`；界面文字 `t`、`say`、`format`，语言文件与外观文件的解析，宿主的文字上下文、Plugin Runtime、CLI 的 `validate` 和 design-system 的基线用同一份）、`/browser`（DOM 工具）、`/page-globals`（页面全局与端口的类型），插件和宿主都从这里取，design-system 不转出 | `production` | F2、FD3、DV3 | 共享核心：@yijunw0212 |
| `packages/storage` | SQLite、Filesystem、Blob、事务和 migration 技术能力 | SQLite/事务/文件/密文/联网搜索缓存 Adapter；系统搜索的本地全文索引适配（`openTextSearchIndex`，可删除重建）；业务 schema 归 Module | `production` | 各事实迁移/Cutover；Web Home 作用域隔离 | 平台包：@yijunw0212 |
| `packages/exchange` | Envelope、ACK、Cursor、Replay、CAS 与 Blob 交换 | 当前不存在正式 Server/Exchange | `absent` | F2；未来独立功能 Spec | — |
| `packages/ui-host` | UI Contribution、Slot、嵌入、隔离和桥接 | FD4 registry/render 与 AP3 surface/Slot mount 校验已落地；Installed Plugin 隔离与完整安全 bridge 仍待独立实现；缺片：Installed Plugin 隔离与完整安全 bridge；后续：另立独立安全 spec | `slice` | F2、FD4、AP3 | 平台包：@yijunw0212 |
| `packages/design-system` | Token、基础组件、图标和可访问性基线 | Soft Workbench token（唯一来源是基线文件 `resources/skins/soft-workbench.json`、`resources/fonts/system-sans.json` 和规格 `resources/ui-spec.json`，经 `src/baseline.ts` 与 SDK 的解析器读取，`palette.ts` 只写回同样的文字）、主题、密度、字体、icon、`mw-*` 的样式、图标表（按 SDK 的 `PluginIconName` 逐个画）、AI 交互部件、终层与组件板 `/__ui/catalog`；规范见 `DESIGN.md`；旧 visual-foundation 已删除；字符串部件的实现在 Plugin SDK 的 `/ui`（PG-055），本包依赖 SDK | `production` | AP3/Cutover；Soft Workbench 迁移（`specs/archive/soft-workbench-rollout`）；Native 包布局待验 | 平台包：@yijunw0212 |
| `packages/observability` | 结构化日志、trace、diagnostic 与安全脱敏 | 各入口零散日志 | `absent` | F2、F3、保证 Goal | — |
| `packages/test-kit` | 无业务判断的公共测试工具：包边界规则、无头 Chrome 启动与 DevTools 驱动（`/browser`）、访问本机 Host HTTP 管理接口的客户端（`/local-host-http`） | F3 boundary policy；`/browser`、`/local-host-http`（W2-11）；时钟、fake capability 与其余重复 harness 待迁移；缺片：时钟、fake capability 与其余重复 harness；后续：随 test-kit 收口迁移 | `slice` | F2、F3；后续测试基础设施 Goal | 平台包：@yijunw0212 |
| `packages/im-ui` | 群聊（IM）页面、样式与浏览器控制器 | 由 Workbench 右栏「讨论」页签（`apps/workbench/src/side-panel.ts` 嵌入 `/im`）和 `apps/server` 的 IM 页面消费；不拥有消息事实。这是在用、还会迭代的功能，不是待删的实验（spec §1，2026-10-08「右栏『讨论』页签与 IM 代码」） | `production` | `specs/archive/molis-work-im/spec.md` | 平台包：@yijunw0212 |
| `packages/plugin-sandbox` | 生成插件的 macOS 沙箱进程与宿主通道 | 插件创作台生成的后端在独立沙箱进程里运行，只经宿主通道使用平台能力 | `production` | `specs/archive/plugin-builder/work-items/agent-built-plugins/spec.md`（S0 执行底座）；整体路线见 `specs/archive/plugin-builder/work-items/studio-v3/spec.md` | 平台包：@yijunw0212 |
| `tooling/plugin-cli` | Plugin 作者的 validate、create、pack、identity、sign、verify 命令，以及经 Host 的本地开发验证 | `create` 默认生成 Integration 插件；`pack` 生成显式文件列表的 JSON bundle；签名与验证用 Plugin Runtime 的公开包验证接口；`dev` 经注入的 `PluginCliHost` 使用真实 Local Host；由 `apps/desktop/launchers/cli/main.ts` 装配 | `production` | DV3；入口表见 §8 | 工具：@yijunw0212 |

`packages/contracts/modules`、`services`、`platform` 是同一个发布包的 subpath 分区，不是三个独立 npm package。

随系统发行的技能内容在 [packages/system-skills](../packages/system-skills/README.md)，由宿主构建打包。这个目录没有独立的 workspace 包。

## 5. Modules

| 目标 package | 事实 owner | 当前来源 | 包成熟度 | 迁移 / 实现 Goal | 归属 |
| --- | --- | --- | --- | --- | --- |
| `modules/identity-team-access` | User、Team、membership、Access Decision | 占位包已删除；未来功能 | `absent` | F2；未来独立功能 Spec | — |
| `modules/projects` | Project 身份、Catalog、workspace membership（输入、输出两种角色）、默认输出目录、「最近用过」、说明文件读取开关（`project_instruction_settings`）与项目指导（`guidance_entries`、`guidance_revisions`，第 44 批自 Goals 迁入平台） | 正式 Project/Catalog 与项目指导事实；Host 编排文件生命周期，Desktop 提供平台 | `production` | AP1/AP2/Cutover；旧 Catalog 已删除；第 44 批 44-2 | Module：@yijunw0212 |
| `modules/context-ledger` | ObjectRef、跨模块关系、publication、materialization | Feed / Runtime 关联、输入来源、临时重建与 Coordinator 归属审计已通过；未来 publication / 异步 materialization 未实现；缺片：未来 publication / 异步 materialization；后续：补未来能力时另立 Goal（AR2 已验收主路径） | `slice` | AR2 已验收；[验收记录](../specs/molis-work-architecture-reorganization/ar2-validation.md) | Module：@yijunw0212 |
| `modules/sync-replication` | 空间同步策略、增量协调、冲突与同步状态 | 个人空间本机联调；复用 owner 适配器与持久队列，六项平台个人配置独立同意，默认关闭 | `slice` | F2；`specs/personal-cloud-sync/plugin-replication.md` | Module：@yijunw0212 |
| `modules/actions` | 个人/外部 Action 请求、状态和结果引用 | 占位包已删除；未来功能 | `absent` | F2；未来独立功能 Spec | — |
| `modules/acceptance` | 挂在任何插件对象上的要求、交付版本、核对报告与层级（含复查档）、用户本人的认可与退回、各轮记录（平台能力，不经 Goals） | `openAcceptance` 给出的服务（`set`、`deliver`、`report`、`read`、`decide`）、`acceptanceView`；系统动作 `acceptance.requirements.set`、`acceptance.deliveries.record`、`acceptance.reports.submit`、`acceptance.read`、`acceptance.decide` 由 Host 装配为 `system.acceptance`；五张表存在项目库中，与可信决定同库同事务，Goals 与助理后台任务均为消费方（第 44 批 44-3 迁入并接管存量）。缺片：个人范围 | `slice` | `specs/proactive-assistant/spec.md` §7.3.1、`specs/agent-approval/spec.md` §3.5；第 44 批 44-3 | Module：@yijunw0212 |
| `modules/attention-resumption` | Attention reference、reason 与最小处置状态 | Attention reference/reason 与最小处置；平台同步复用原 Inbox 集合身份与回执；旧 Inbox 转发已退出；缺片：完整 snooze/resume；后续：另立 Goal 补未来能力 | `slice` | FD2/Cutover；完整 snooze/resume 仍是未来能力 | Module：@yijunw0212 |
| `modules/private-work-context` | Runtime context binding（Runtime 工作入口与 Project 的绑定、事件、setup 幂等、拒绝建议） | Runtime 当前 Project 关联经 Ledger API 保存；控制历史留在本模块。旧 Session、内容引用与 Handoff 随 Sessions 插件下线（SC-4）删除；现行发现与读取归 `horizontal/sessions`，交接进展见 [BL-177](../specs/backlog/BL-177.md) | `slice` | WK1–WK3 已迁移；SC-4 删除 Session 部分 | Module：@yijunw0212 |
| `modules/artifacts` | Artifact、版本、类型、内容引用、原件与 provenance | 唯一正式事实；平台提供方和生产者声明由 Host 装配，工作台成果界面走动作消费；原件 Home 存储由本模块声明 | `production` | AR1 已迁 Core；AR3 切换现有结果入口 | Module：@yijunw0212 |
| `modules/shelf` | 平台部件 Shelf（`system.shelf`）：个人置物架材料、副本任务、Hash、本机抽字结果与右栏 Shelf 界面 | Home 下 `shelf/` 副本与 Jobs 沙箱；由运行时作为平台部件托管（`HostSurfaceRegistration`，无安装记录、不进插件目录），路由 `/api/platform/shelf/…`；项目结果只经 `services.artifacts` 读；不写项目 Goal / Artifact；[macOS 桌面壳](../apps/desktop/adapters/tauri/src/main.rs)已接入轮盘和热键 | `slice` | Shelf 工作台切片；真人划选、Finder 拖放与系统文件选择器见 [BL-014](../specs/backlog/BL-014.md) | Module：@yijunw0212、@jingxusandra-gif |
| `modules/characters` | 个人角色原件、版本与状态，项目成员、节覆盖、默认与模板采用回执；角色动作处理器与本人绑定、本机导入逻辑（CHR-0、CHR-1：角色不再是插件，Host 用它登记动作提供方，「设置 › 角色」是 Host 的设置节，界面在 `apps/workbench/src/characters/`） | 按本人及项目分区。Artifact 持有另行发布的成果；Agent Host 固定本轮版本并核对执行权限。任务与设置使用同一个角色抽屉 | `slice` | `specs/onboarding-coverage/role-service-design.md` | Module：@yijunw0212 |
| `modules/judgment-rules` | 已发布判断函数与一次判断记录 | 函数库、来源/去向/映射、场景绑定、判断落库；个人规则定义可选同步；TypeSafe 由 Host 注入 | `production` | `specs/archive/functions-system-capability/spec.md`；`specs/archive/functions-product-authoring/spec.md`；`specs/archive/functions-independent-authoring/spec.md`；事件去向动作范围 `specs/archive/function-scene-action-scope/spec.md` | Module：@yijunw0212 |
| `server` | 共享身份、设备、项目访问、HTTP、SSE 与接续回执；聊天领域在 `src/im` | 右栏「讨论」页签的后端：本地宿主在 `/im` 挂载它的群聊（`apps/local-host/src/im-server.ts`），库是 Home 里的 `server/server.sqlite`；这是在用、还会迭代的功能（spec §1，2026-10-08「右栏『讨论』页签与 IM 代码」）。`apps/server` 是同一份实现的本地可部署启动器；所有业务读写调用现有 Action Host，不启动模型运行时。该决定要修的三处账目均已落地：库 `server/server.sqlite` 已登记进 Home 数据表（`docs/system/HOME-DATA.md` 3.4：必备份，`uninstall --purge-user-data` 清除 `server/`，普通卸载保留）；包的归类已改成业务包（`scripts/workspace-packages.mjs` 里记作 `module`，按 Module 规则检查，包括 `moduleRepositoryExports` 不许它的入口导出 Repository 或 Store）；宿主不再直接读它的表（`im-server.ts` 已于 W2-06 改走 `ContinuityService.projectOwner`） | `production` | `specs/archive/molis-work-im/spec.md` | Module：@yijunw0212 |
| `modules/automation` | Trigger、Rule、Automation Run 与产生的 Action Request | 占位包已删除；未来功能 | `absent` | F2；未来独立功能 Spec | — |

每个 Module 的 API、事件和非职责见 [`docs/modules/`](modules/README.md)。Module 之间只通过公开 Capability Contract 调用，不导入彼此 implementation 或 Store。`modules/execution`（历史 Claim、Run）与 `modules/evidence-verification`（历史 Evidence）已于 2026-10-05 连同表、合同与展示删除（#268），事件工作流是唯一的工作协议；项目文件引用由 `apps/local-host/src/project-file-reference.ts` 读取当前工作区。

## 6. Horizontal services 与平台产品服务

| 目标 package | 提供的技术能力 | 当前来源 | 包成熟度 | 迁移 / 实现 Goal | 归属 |
| --- | --- | --- | --- | --- | --- |
| `horizontal/connector-host` | Provider 连接、凭据引用和调用 Receipt | Provider-neutral 连接/Receipt；Integration contribution 提供 Driver | `production` | FD1/FD3/AP2/Cutover | 横向服务：@yijunw0212 |
| `horizontal/scheduler` | Durable one-shot wakeup | sqlite job/lease/收据；Web timer 与 Feed timer 并行；once/interval 由 Schedule 插件拥有 | `production` | `specs/archive/schedule-plugin/spec.md` | 横向服务：@yijunw0212 |
| `horizontal/runtime-host` | 本机终端（PTY）进程的启动、接入、写入、缩放、结束与有限回放（按插件 `work_terminals` 声明的对象工作终端服务与提示组装在 `apps/local-host/src/work-terminal-service.ts`，底层 PTY 仍由本包宿主；第 44 批 44-4） | PTY server host；旧 Codex 会话适配器与路由随 Sessions 插件下线删除。现行来源适配器归 `horizontal/sessions`，后续会话控制见 [BL-177](../specs/backlog/BL-177.md) | `slice` | WK2 已迁 Host/Adapter；WK3 已迁产品编排；第 44 批 44-4 | 横向服务：@yijunw0212 |
| `horizontal/agent-host` | Agent Runtime 注册、能力矩阵、启动授权与副作用 Review 队列 | Prologue 为主执行引擎（文字/结构化/图片/判断推理、Agent 轮次、外部 MCP、任务板、子代理、检查点、后台命令与等待），没有第二个执行引擎（`claude` 命令行适配器已于 2026-10 删除，外部 Agent 运行时按口径暂缓）；同一 Home 只有一个执行归属（`.molis-runtime-owner.db` 锁）；审查队列；唯一直接依赖 `@prologue/sdk` 的包 | `production` | Plugin Platform v2；`docs/platform/PROLOGUE-AI.md` | 共享核心：@yijunw0212、@jingxusandra-gif |
| `horizontal/appearance` | 一个 Home 的外观选择与最近使用语言 | `interface/state.json` 的精确选择、修订、恢复组合及本人操作回执；正式外观可选同步；`config/ui-locale.json` 给没有页面的工作。定义由 Design System 发布，动作合同在 `platform/ui` | `slice` | [第 16 批 B1](../specs/font-and-skin-system/bc-runtime-contract.md) | 横向服务：@yijunw0212 |
| `horizontal/account` | 中央账号协议与 Host 会话适配；身份和商业事实由 Auth 持有，本地身份与 Home 不变 | 固定中央客户端、可信环境、持久会话、邮箱/手机认证及 Google/GitHub 回跳；资料与商业管理页面待后续任务 | `slice` | `specs/unified-account/spec.md` | 横向服务：@yijunw0212 |
| `horizontal/home` | 首页服务：拥有项目当前首页选择、生成页面版本、按 SHA-256 校验的文件正文与本人批准回执 | `HomePagesStore`、`homePageActionHandlers`、`inspectHomePageDesign`；系统动作 `home.read`、`home.pages.drafts.save`、`home.pages.preview`、`home.pages.adopt`、`home.pages.restore`、`home.select`、`home.pages.diff`、`home.pages.files.read` 由 Host 装配进 `system.home`；`home-pages/home-pages.db` 按 `project_id` 隔离，删项目时原子清理；不拥有插件业务事实 | `slice` | `specs/scene-and-page-contract/spec.md` §6 | 横向服务：@yijunw0212 |
| `horizontal/kit` | 能力包：现算这个范围里的能力包（插件包、自带、你的角色），给每条盖来源与所属的包、读出包状态 | `gatherKit`；系统动作 `kit.catalog.list` 由 Host 装配；条目由各主人的上报动作给，自己不存任何东西 | `production` | `specs/capability-pack/contract-design.md` | 横向服务：@yijunw0212 |
| `horizontal/automation-recommender` | 项目自动化建议、每人每项目的忽略偏好 | 扫描经 Projects 的只读目录能力，候选来自原能力目录；`config/automation-recommendations.json` 保存偏好，Pages 拥有报告文稿 | `slice` | [自动化建议](../specs/automation-recommender/spec.md) | 横向服务：@yijunw0212 |
| `horizontal/knowledge` | 项目资料：项目里所有 Agent 共用的资料查找与读取（卡片、分节、按节读原文、逐行查找），经系统搜索找、向对象主人读，用调用者的授权 | `KnowledgeService`；系统动作 `knowledge.list/search/outline/read/grep/glob` 由 Host 与系统搜索同处装配；不保存正文；内置 Agent 在项目里默认持有（可在对外接入撤销） | `production` | `specs/archive/project-knowledge/spec.md` | 横向服务：@yijunw0212 |
| `horizontal/mainline` | 主线服务：拥有本人在每个项目里的事项、排列与装进关系；按各来源的声明现读事项线与后台任务 | `readWorkLine`、`gatherWorkEvents`、`readWaiting`、`placeTask`、`readBackgroundTasks`、`runBackgroundTaskCommand`；系统动作 `mainline.line.read`、`attention.waiting.read`、`mainline.place`、`background.tasks.read`、`background.tasks.command` 由 Host 装配为 `system.mainline`；事件、任务与对象的内容仍由各主人读取；`mainline/mainline.db` 只存轻量事项的名称、引用、分组与排列（含装进关系） | `slice` | `specs/work-mainline/contract-design.md`、`specs/work-line/contract-design.md` | 横向服务：@yijunw0212 |
| `horizontal/search` | 系统搜索：经动作目录发现插件的搜索来源、维护可重建索引、按调用者权限聚合结果 | `SearchService`；系统动作 `search.query/open/status/rebuild` 由 Host 装配；索引持久化在 storage 适配；不读插件私有库 | `production` | `specs/archive/system-search/spec.md` | 横向服务：@yijunw0212 |
| `horizontal/memory` | 平台记忆：个人与项目记忆的开关与策略、确定性写入门、召回编排、候选、最近变动与撤销、界面信号计数 | `MemoryService`；系统动作 `memory.*` 由 Host 装配；正文、版本、删除与隔离在 Prologue Memory（经 Agent Host）；旁表在 storage 适配；不调用模型 | `production` | `specs/archive/memory-system/spec.md` | 横向服务：@yijunw0212 |
| `horizontal/observation` | 采集层：把手动操作、动作调用、AI、工作流、定时与后台执行逐条记成工作记录，带证据快照、覆盖登记、历史查询、用途开关、保留／清理与评测样本留存；分清真实、模拟、历史导入与新变化 | 三条写入路（kernel 结算出口、服务 `ObservationSink`、系统动作 `observation.report@1`）与十一个读取／管理／留存动作（`records.query@1`、`evidence.get@1`、`coverage.get@1`、`settings.get/set@1`、`space.get@1`、`cleanup.preview/apply@1`、`holds.put/release/list@1`）；自己的库 `<Home>/observation/observation.db`（v1），证据加密存放；全局设置「工作记录」按需包消费公开动作 | `slice` | `specs/observation-collection/contract-design.md`；`specs/observation-collection/evaluation-path-design.md` | 横向服务：@yijunw0212 |
| `horizontal/blueprints` | 场景草稿、采用预览、逐项记录与撤销 | `system.blueprints`；`blueprints/blueprints.db` 保存原请求和主人回执，个人草稿可选同步，设置值归声明它的主人 | `slice` | `specs/scene-and-page-contract/spec.md` §7 | 横向服务：@yijunw0212 |
| `horizontal/evaluation` | 端到端工作评测：消费采集层公开动作读取真实工作记录、证据快照、覆盖与样本留存，运行冻结样本判定、六阶段对比、隔离回放、人工复查追加与按调优／独立验证分桶的指标汇总 | `EvaluationService`；系统动作 `evaluation.samples.put/list/remove@1`、`evaluation.runs.execute/get/list/compare@1`、`evaluation.reviews.record@1`、`evaluation.metrics.summarize@1` 由 Host 装配；自己的库 `<Home>/evaluation/evaluation.db`（v1），只经公开 `observation.*@1`（`use: "evaluation"`）读取采集层、不回写历史记录与业务表 | `slice` | `specs/observation-collection/evaluation-path-design.md` | 横向服务：@yijunw0212 |
| `horizontal/project-approvals` | 平台可信决定、项目审批规则 | 项目库内的原决定与规则历史；由 Host 在受保护入口提供权限和同库事务；原动作 owner 负责实际提交及结果 | `slice` | [授权需求 §3.6](../specs/agent-approval/spec.md#36-可信决定) | 横向服务：@yijunw0212 |
| `horizontal/placement` | 放在哪里：对象的位置、访问范围、按插件 `placement_relation` 声明的通用挂接关联与移动后的位置索引 | `PlacementService`；系统动作 `placement.describe/spaces/related/locate/link/unlink/move/copy/convert/attach.*` 由 Host 装配；关系写 Home 级 Context Ledger（`placement.db`）；对象事实总向所有者读；移动/复制经插件放置协议 | `production` | `specs/archive/work-placement/spec.md`；第 44 批 44-1 | 横向服务：@yijunw0212 |
| `horizontal/surfaces` | 确定呈现组合与本人的位置纠正 | 第 15 批已交：组合只引用主人字段和动作，纠正表在项目库，本人持久纠正可选同步，Host 装配与拒绝路径，项目首页、插件挂载位、讨论与「等你」接入；还缺「接着做」（第 21／28 批）、助理组合（第 64 批）与 `task` 规则，见对应批次与 [BL-surface-composition-review-followups](../specs/backlog/BL-surface-composition-review-followups.md)；本人验收见 [BL-surface-home-acceptance](../specs/backlog/BL-surface-home-acceptance.md)，IUI-20 复测见 [BL-surface-home-performance](../specs/backlog/BL-surface-home-performance.md) | `slice` | `specs/surface-composition/spec.md` §2、§3、§14 | 横向服务：@yijunw0212 |
| `horizontal/sessions` | 外部会话：在用户打开的读取范围内发现本机与已连接远端 AI 开发工具的会话，只读历史正文、归属到项目、供个人搜索与个人助理单轮受控读取，不导入正文、不发消息、不托管运行 | `SessionsService`；系统动作 `sessions.*`（`system.sessions`）由 Host 装配；自己的库 `<Home>/external-sessions/external-sessions.db` 只存索引、目录缓存、读取范围、项目 AI 读取开关、归属决定与归属建议；不存对话全文，标题/建议短引文除外；十个来源适配器（Codex、Claude Code、Gemini CLI、Pi、GitHub Copilot Coding Agent、Droid、Qwen Code、Qoder、Kimi Code、MiniMax Code），其余登记表条目如实报未实现或工具未提供；本人验收见 [BL-b34-sessions-acceptance](../specs/backlog/BL-b34-sessions-acceptance.md) | `slice` | `specs/sessions-rebuild/spec.md`；`specs/sessions-rebuild/contract-design.md` | 横向服务：@yijunw0212 |
| `horizontal/plugin-studio` | 插件创作台：从一句需求生成插件；平台能力，不是插件（第 47 批 47-1 C，用户 2026-11-22），后续作为平台场景组装能力的创作入口（2026-10-27） | 见下文「插件创作工作台」；不进插件目录与项目插件成员，外壳按平台宿主界面名单画它，草稿与发布版本原地不迁；缺片：整体体验与端到端交付（用户 2026-10-27 反馈至今未完整跑通），包含新能力创作与手动／个人助理组合已有插件，Alchemist 为落地场景；后续：BL-377 | `slice` | `specs/plugin-builder-upgrade/spec.md`（旧实现证据：`specs/archive/plugin-builder/work-items/studio-v3/spec.md`） | 横向服务：@yijunw0212 |

本节 21 个包包括横向运行服务、平台产品服务与插件创作台（见[系统架构 §3](system/ARCHITECTURE.md)）：`connector-host`、`scheduler`、`runtime-host`、`agent-host`、`account` 是 5 个横向运行服务，保存 cursor、lease、retry 等可恢复的技术状态；`agent-host` 另外保存下面列出的 Agent 配置、工作授权和审查决定。`memory`、`placement`、`search`、`knowledge`、`surfaces`、`kit`、`mainline`、`appearance`、`observation`、`blueprints`、`evaluation`、`sessions`、`automation-recommender`、`project-approvals`、`home` 按职责属于 15 个「平台产品服务」（目录暂留在 `horizontal/` 下），可以持有跨插件的策略和本服务自己的机制记录（放置的关联与来源、记忆的开关、候选与撤销、可重建的搜索索引、采集层的记录与覆盖登记、场景包草稿与采用回执、端到端评测的冻结样本与判定记录、外部会话的读取范围与归属决定、项目自动化建议偏好、平台可信决定与项目审批规则）。第 21 个包 `plugin-studio` 拥有创作台自己的草稿、构建与发布记录。情境排序（`packages/kernel` 的 `contextual.ts`）同属平台产品服务，代码位置不变。两类都不拥有 Goal、Signal、Action 等插件或 Module 的业务事实；外部会话的正文与运行状态始终归原外部工具。

**观测采集层与评测服务已登记在上表**（`horizontal/observation` 与 `horizontal/evaluation`，成熟度均为 `slice`）：`observation` 只拥有观察记录本身、证据快照、覆盖登记与缺口、用途与保留设置及样本留存，原始业务内容、正式状态及对象身份仍归对应插件或服务；历史证据不产生第二份可编辑事实，清理只删记录与无引用快照、不连带删业务内容。第 28 批已随 #2059 合入写入面，第 29 批接入历史查询与证据读取、用途与跨项目边界（S-74）、暂停／恢复、自动与手动清理、空间占用与容量提醒以及全局设置「个人 → 工作记录」界面；第 30 批接入评测样本留存（`observation.holds.*@1`）与独立评测服务（`horizontal/evaluation`）。评测与主动助理经公开能力消费同一事实，分别负责效果判断和工作建议，不各建采集链；实施沿后续演进计划 C 轨。

成果库的浏览、嵌入与文档导入界面属于 `apps/workbench/src/artifacts/`，不登记 Plugin；动作提供方仍为 `system.artifacts`。PG-077 已随 #1633 合入 main：提供方为平台的 `kind: "system"`，`plugins/native/artifacts` 旧包已删；真实 Home 已于 2026-11-07 干净重建，本人验收与重建后的实操未完成（见 `specs/archive/repository-anti-corruption/privileges.md` PG-077）。

## 7. Plugins

| 目标 package | 产品能力 | 当前来源 | 包成熟度 | 迁移 / 实现 Goal | 归属 |
| --- | --- | --- | --- | --- | --- |
| `plugins/native/goals` | Goals 内置插件（普通项目插件，新项目不默认安装、可按需添加与移除，移除后数据保留）：拥有 Goal、关系与工作事件历史；原 Goals 与 Governance 模块并入本包的 `src/module/` 与 `src/governance/`（S9-3） | 当前事件意图、约定、报告及事件与 Journal 组成的历史；项目指导、可信决定与审批规则、要求与认可、对象工作终端均已归平台能力，Goals 仅作消费方；目录直接读当前状态；页面与按需样式（`goals.css`）由包内绘制，Workbench 只交通用外壳端口，不按插件名开私路 | `production` | GW/DD/EX/Cutover；事件工作流收敛；第 44 批收口插件同等地位 | 内置插件：@yijunw0212 |
| `plugins/native/inbox` | Inbox 一级入口与 Attention 处置 UI | 目录/详情只读 Attention；完成/忽略走 setStatus；`inbox.next` 沿用 Functions 绑定与显式重判，建议成稿/核查不自动执行；Host 将选中 Feed 材料交给 Pages，收据归 Pages，文稿可返回材料；缺片：Inbox/Feed 拆插件切片 2–3；后续：切片 2–3 计划 | `slice` | Inbox/Feed 拆插件切片 2–3；`specs/archive/functions-system-capability/spec.md`；`specs/archive/feed-inbox-pages-loop/validation.md` | 内置插件：@yijunw0212 |
| `plugins/native/risk` | 项目风险：记录、关联、进展与总览 | 风险记录、关联对象、进展时间线，列表、读取器、搜索、呈现与首页概况；复查由 Schedule 的一次性对象任务承载，风险不调 AI；Goal 的顾虑可引用风险。缺片：RISK-06 的历次结果与采纳（[BL-risk-review-history-adopt](../specs/backlog/BL-risk-review-history-adopt.md)）；RISK-05/06/09 的本人验收 | `experimental` | `specs/risk-plugin/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/work-brief` | 项目简报与个人简报：现在怎么样、要你处理什么、下一步 | 简报及其版本、每句的依据、人工修改、待处理的提案、下一步的处置、固定版本（发成成果）、个人事项汇总；别的插件的内容只经它们公开的概况、读取器和动作读，不存副本；首页上的开头几句话经概况的 `lede` 交给平台首页；缺片：决定卡（39-2 的受保护入口已就位，卡本身待做）、定时刷新走 Schedule、周期报告／living page／使用回顾／交互式报告页等后续片 | `experimental` | `specs/work-brief/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/schedule` | Schedule 一级入口：对话任务与闹钟列表 | 人手创建日历日对话任务；其他插件 job 仍只展示与暂停；缺片：其他插件 job 的创建/编辑；后续：补齐 job 编辑 | `slice` | `specs/archive/schedule-conversation-tasks/spec.md` | 内置插件：@yijunw0212 |
| `apps/workbench/src/judgment-rules` | 系统能力服务的判断编辑器：写、试跑、发布 | 通过 Host 系统动作调用 modules/judgment-rules；连接与凭据复用服务连接（TypeSafe）；用途按场景合同派生，Feed 捕捉与首页判断已真实消费；入口在「能力」 | `production` | `specs/action-architecture/spec.md`；`specs/archive/functions-independent-authoring/spec.md` | 共享核心：@yijunw0212 |
| `plugins/native/pages` | Pages 一级入口：本机文档 | 库、ProseMirror 内核、块备注、正文批注与持久评论线程（含助理回复与引用锚点）、卡、通用放置挂接与 Promote；外部文件预览/批量导入与幂等收据；由 Plugin Runtime 每个项目托管一个实例，库留在 Home 的 `pages/pages.db`，写作模型（经 Prologue）、成果与上传文件读取来自 Runtime 服务，材料快照与幂等生成收据归 Pages；对外只经动作目录与逐客户端授权 | `production` | `specs/archive/pages-plugin/spec.md`；`specs/archive/plugin-outbound-mcp/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/form` | Forms 一级入口：本机问卷 | 建题、预览填写、提交与结果；另有显式「AI 拟题」（经 Prologue 文字模型）；对外只经动作目录与逐客户端授权 | `production` | `specs/archive/creative-tools-plugins/spec.md`；`specs/archive/plugin-outbound-mcp/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/dataset` | Dataset 一级入口：本机数据表 | 行列编辑、CSV 导入导出、版本回滚；另有显式「AI 拟列」（经 Prologue 文字模型）；对外只经动作目录与逐客户端授权 | `production` | `specs/archive/creative-tools-plugins/spec.md`；`specs/archive/plugin-outbound-mcp/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/ppt` | PPT 一级入口：本机演示稿 | 多页大纲（可按文字、AI 整理或 Pages 文档生成）、主题色、预览、JSON 与 .pptx 导出（不含图片与图表）；对外只经动作目录与逐客户端授权 | `production` | `specs/archive/creative-tools-plugins/spec.md`；`specs/archive/plugin-outbound-mcp/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/lingguang` | 灵光一级入口：收想法的唯一处 | 快记、导入文件与读取链接成灵感、转成 Jelly 笔记、流式列表、丢掉确认、「复制内容」；头脑风暴对话经 Prologue 文字模型，未配置模型时如实显示不可用；不写 Goal/Artifact；动作经逐客户端授权对外 | `production` | `specs/archive/lingguang-plugin/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/todo` | 待办一级入口：用户需要推进的事项的正式管理位置 | 个人与项目待办（先记录后归属）、五种状态与归档、截止/计划/提醒三种日期、来源与形成原因、关联、修改记录与撤销、视图/搜索/批量；私人库 `{home}/todo/todo.db`；动作 Home 级登记，项目内只见本项目与个人待办，“所有项目”只给本人界面；Todo 负责整理提示、提取校验、候选批次及采用写入，宿主提供模型调用，Assistant 可发起整理并跟进 | `production` | `specs/archive/todo-plugin/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/feed` | Feed 一级入口和处置 UI | Sources/Feed 流水、同步与 promotion；支持研究库发布包接收；用户显式配置规则可自动加入 Inbox，需复核保留原因；Feed 管理 Source、Signal 与 Feed，命中出站规则时提交捕捉，Attention 服务写注意事项，成果库通过固定版本写入接口保存捕捉成果；缺片：Inbox/Feed 拆插件切片 3；后续：切片 3 计划 | `slice` | FD/Cutover；Inbox/Feed 拆插件切片 3；`specs/archive/function-scene-action-scope/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/coding` | Coding App（`app`）：会话、轮次、计划、报告、变更集、协同与委派 | Plugin Runtime 托管；执行经 Agent Host/Prologue；执行报告进成果库（`coding.report.v1`），计划、变更集、图与目标上下文是 Coding 自己的过程项；19 项 `coding.*` 动作（16 项业务动作，另有对象读取、搜索与成果预览） | `production` | `specs/coding-plugin/spec.md` 第 0 节；后续 `next-requirements.md` | 内置插件：@yijunw0212、@jingxusandra-gif |
| `plugins/native/git` | Git 工作区变更与提交草稿（`app`，Coding 家族） | Runtime 托管；`git` 由平台的工作区 Git 服务运行（宿主的 `workspace-git*.ts`，只给插件调的动作 `projects.workspace.git.*`、`projects.workspace.writers.*`），插件经 SDK 解析 porcelain v1、把每处改动发布为可对比的变更集。不指定文件夹时 Git 看输出目录，写（暂存、提交）只在输出目录里，只作输入的目录写不进（`projects.directory_input_only`）。接受一次 Coding Run 的改动不经 Git：主工作区里的每次写入先由人审查，并行子任务的成果经 Coding 的整合审查（`review:git-integration`）回到主工作区 | `production` | `specs/archive/coding-workbench-repair/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/diff` | 对比界面：同一处理三种输入（`app`，Coding 家族） | Runtime 托管；输入是平台资料服务（`system.materials`，宿主 `system-materials-actions.ts`）固定的两个快照、Coding Run 准备的变更集、Git 工作区里的改动；变更集过程项类型 `diff.changeset.v1` 按这个消费者定义 | `production` | `specs/archive/coding-workbench-repair/spec.md` | 内置插件：@yijunw0212、@jingxusandra-gif |
| `plugins/native/issues` | 个人问题的原始描述、类型、上下文与版本 | Home Runtime 托管；业务表 `{home}/issues/issues.db`；页面、助理、MCP 共用 `issues.*`，项目切换不分库；连接和授权由 Host 提供 | `production` | `specs/archive/issue-home-v0/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/images` | 个人生图与项目生成记录 | Home Runtime 独占原库/文件；生图经有限服务和 Prologue | `production` | `specs/archive/images-plugin/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/jelly` | 个人日历与笔记（收想法在灵光） | Home Runtime 独占原库；模型及配置经有限服务 | `production` | `specs/archive/jelly-plugin/` | 内置插件：@yijunw0212、@jingxusandra-gif |
| `plugins/native/cognia` | 个人知识库（现行 native 版） | 见下文「Cognia 个人知识库」；Cognia 2（生成插件方向）需求书未实施 | `production` | `specs/archive/cognia-plugin/spec.md`；`specs/archive/cognia-plugin/v2/spec.md` | 内置插件：@yijunw0212 |
| `plugins/native/workflows` | 工作流程：内容站交接、模板转换、AI 整理、判断规则、动作步骤 | 站点与步骤从动作目录发现；交接幂等、中断复用原结果；由 Plugin Runtime 装配（每个项目一份），经 `actions:delegate` 以调用者本人的身份调站点与步骤，不放宽调用者的授权 | `production` | `specs/action-architecture/spec.md` 工作流程节；`specs/archive/repository-anti-corruption/spec.md` W5-01-WORKFLOWS | 内置插件：@yijunw0212 |
| `plugins/official-integrations/catalog` | 连接器目录与文档导入 Provider | 目录条目、Notion 等 OAuth 与文档导入；账号检查经 `connectors.account.read` | `production` | `specs/archive/connector-method-directory/spec.md` | 官方集成：@yijunw0212 |
| `plugins/native/actions` | Actions 一级入口 | 占位包已删除；未来功能 | `absent` | F2；未来独立功能 Spec | — |
| `plugins/native/automation` | Automation 一级入口 | 占位包已删除；未来功能 | `absent` | F2；未来独立功能 Spec | — |
| `plugins/official-integrations/github` | GitHub connector/listener/signal adapter | GitHub Provider、Device OAuth 与账号呈现；研究库固定提交解析和发布哈希校验，Host 提供 Git 快照；Host 注入 Secret/env | `production` | FD3/Cutover；无旧 connector caller | 官方集成：@yijunw0212 |
| `plugins/official-integrations/gmail` | Gmail OAuth/connector/listener/signal adapter | Gmail OAuth/安装账号/scope/cursor/Provider；Host 注入安全存储 | `production` | FD3/Cutover；无旧 connector caller | 官方集成：@yijunw0212 |
| `plugins/official-integrations/rss` | 官方目录、自定义 RSS 与 YouTube 频道 provider adapter | 目录/custom RSS/YouTube 频道标识与公开 Feed 地址（第 44B 批并入）/正文分类/HTTP adapter；Host 提供运行上下文 | `production` | FD3/Cutover；真实公开 RSS 拉取 | 官方集成：@yijunw0212 |

所有内置插件都由 molis 发布、带官方签名；没有常开插件（Shelf 是平台部件），Goals 与其余项目插件同等地位（新项目不默认安装，可按需添加或移除，移除后数据保留）。Plugin 之间不依赖 implementation：能力经共同动作目录调用；人要留存、引用的固定版本进成果库（`artifacts.produces`），交给别的插件的数据是生产方自己的过程项（`process_items.produces`），经端口与动作交换；其余事实留在各自插件的库里。

### 已删除的接入

- Casebook 已于 2026-10-10 按用户决定删除（宿主里的子系统、`/casebook/v1/` 通道、5 个 typed 能力、项目库的 5 张表），以后重做；当时的说明在 [`specs/archive/casebook-plugin/spec.md`](../specs/archive/casebook-plugin/spec.md)。

## 8. Tooling、入口和发布面

| 入口 | 当前 owner / 状态 | 交付边界 |
| --- | --- | --- |
| plugin CLI 与示例 | tooling/plugin-cli；examples/plugin-sample | 公开 SDK scaffold → validate/pack/sign → 本地安装 → Artifact/UI；样例不进生产 workspace |
| workspace / npm | 根 scripts 调用 App-owned 构建与打包工具 | `pnpm workspace:build` 按依赖顺序构建输入或产物已变化的包，跳过构建记录仍有效的包；`pnpm build:clean` 强制整体重建。发布包包含必要内部 JS 和资产，消费者安装原生依赖；不独立发布私有包 |
| CLI / MCP / Web bins | apps/desktop/launchers/cli/main.ts、apps/desktop/launchers/mcp/server.ts、apps/desktop/launchers/web/server.ts | 只保留启动环境/stdio/资源路径与公开 App 入口；无业务 SQL 或状态机 |
| Desktop / Tauri | apps/desktop + apps/desktop/src-tauri | App/DMG/zip、bundle、ad-hoc codesign、本地安装/恢复；Developer ID、公证和公开发布不在本期验收承诺内 |
| Plugin 开发 Skill | skills/molis-plugin-dev | 随 npm / Home 发布；不自动挂 Runtime 接入；本仓库 `.cursor/skills` 只是符号链接 |
| CI / vendor | .github/workflows、vendor；App-owned 发布工具 | `ci.yml` 的 `Verify` 汇总包边界与 workspace 校验、健康门禁、原生与 shell 检查、动作与插件合同、安全不变量、产品子集和密钥扫描；PR 选择、合并队列与 main 复用规则见 [并行开发 §3](system/PARALLEL-DEVELOPMENT.md#3-合并)。产品全量（含浏览器用例）由 `full-suite.yml` 分片运行，macOS 专有用例在本机补，触发与本机执行约束见 [§5.1](system/PARALLEL-DEVELOPMENT.md#51-子代理与并发的-agent)和 [§7](system/PARALLEL-DEVELOPMENT.md#7-集成分支上跑全量)。vendor 的来源、版本、许可证、SBOM 保留；发布包排除 `vendor/prologue-sdk/*.tgz` |
| 文档 | 本索引与对应 owner 文档 | 当前位置以此表为准；迁移期记录见 [`docs/archive/system-migration-2026-09.md`](archive/system-migration-2026-09.md)，阶段性验收保留历史，不代表未来能力落地 |

## 9. 变更规则

1. 新增、删除或改名 package，必须先更新本矩阵与架构 Spec。
2. Module owner、公开 Contract 或依赖方向变化，必须有明确决策，不能在代码搬迁中顺手改变。
3. 每个包的成熟度或目标能力变化，同时更新对应 Module/Service 文档与本矩阵的状态；成熟度只写第 2 节四个词之一。
4. 标为 `slice` 或 `experimental` 的包不得被 UI、CLI、MCP 或 Plugin Runtime 宣称为已交付的正式功能。
5. 旧 owner 从登记表与本矩阵退场（删行或并入别的包）前，先确认 caller 清零、行为兼容、数据迁移和回滚证据齐全；本矩阵不保留过渡词。
6. 第 3 至 7 节各表的「归属」列（角色与评审账号）和 `.github/CODEOWNERS` 由 `scripts/package-owners.mjs` 的规则生成，不手改。新增、删除、改名 package 或换负责人后，改规则并运行 `node scripts/package-owners.mjs --write`；`pnpm boundary:check` 检查每个工作区包恰有一行、「归属」列与规则一致、CODEOWNERS 与规则一致。未建包的行（`absent`）归属写 `—`。「包成熟度」列由 `scripts/workspace-packages.mjs` 写、同一个检查逐行核对：真实包必须等于登记表的值，没有 workspace 包的目标路径行必须是 `absent`（`absent` 行不参与构建）。CODEOWNERS 只请求评审，不改分支保护（`specs/archive/repository-anti-corruption/spec.md` §1，2026-10-02、10-07；成熟度词表 2026-10-25，W5-15）。

## Skill 包、目录和范围设置

| 责任 | Owner | 唯一事实源 |
| --- | --- | --- |
| 技能包身份、版本、签名与安装状态 | Plugin Runtime / Host 包存储 | 当前安装记录、验签的包；没有第二份 Skill 注册表 |
| 技能声明和正文 | 提供技能的插件 | Manifest 的 methods 和已验签正文/资源；内置声明由原注册提供 |
| 当前范围的目录与读取 | apps/local-host 的 Agent definitions | `system.skills` 的目录、导入与草稿/回放动作，每次投影安装、声明与授权；manual 只认宿主冻结点名 |
| 技能自动/仅手动状态、接受后的使用记录 | apps/local-host 的 Agent definitions | `agent-definitions` 库第 2 版（#2209 升级段 `1 → 2` 将 `system:information/information.plan` 迁至 `io.molis.work.feed/feed.information-plan`）的 `skill_settings`、`skill_uses`，以及第 42 批的 `skill_drafts`、`skill_cases`、`skill_trials`、`skill_lineage`；项目与 home 分开，off 不留行；卸载删除状态、保留历史 |
| 随系统自带的技能包 | 宿主构建产物 | `packages/system-skills/<包>/pack-content.json` 的 `system`；构建产物 `apps/local-host/dist/system-skills/`；不安装、不验签、不固定发布者，和安装包共用同一目录 |
| 自己写的技能 | 每范围一个内容包 + 已装记录的发布者签名 | `my-skills.project`／`.home`；正文与声明在签名内容包，`skill_settings` 只存状态；认主只看已装记录的发布者签名 |

助理和 Coding 都只读这一份目录（第 09 批）：Coding 旧的方法发现、安装和 Prologue 存储里的 `molis-coding-method` 已删，不迁移。

技能目录是 Agent 定义登记的扩展，不是新建的 `horizontal/` 服务包：技能和提示词、角色同属插件声明给 Agent 的东西，同一份登记已经按安装、发布者签名和范围算出谁在用、谁停用，开关与用量也落在它的库里；另起一个服务包就要再读一遍安装与签名、再存一份状态，成了第二份事实。

## 能力包

| 责任 | Owner | 唯一事实源 |
| --- | --- | --- |
| 本人在项目里的事项、分组、顺序、当前事项、装进的引用 | `horizontal/mainline` | `mainline/mainline.db`；引用对象仍由其主人读取 |
| 事项线怎样读：按类型发现项目里的事件登记方、逐个现问，事件在哪一翼、排第几、线上显示什么状态 | `horizontal/mainline` | `mainline.line.read@1` 现读事件和状态；事项本身的容器与排列存在主线库 |
| 一件工作的各项要求、每次交付的版本、逐项核对的结果与层级（含复查档）、用户本人的认可与退回（平台能力，Goals 与助理后台任务均消费） | `modules/acceptance` | 项目库内的五张认可表，与可信决定同库同事务，除对象表外只追加；每项此刻的状态由 `acceptance.read@1` 从记录现算，不另存；对象归它的插件，证据正文归成果库与 Agent Host，这里只存引用 |
| 任务为哪个事件办 | 任务的主人（用 `defineTaskServesAction` 写的部分，`placement_relation` 关联 `serves`） | 主人自己的记录。带 `to` 时 `mainline.place@1` 只按声明找到主人并让它记下，自己不记；带 `item` 时主线库写自己的装进关系 |
| 后台任务总表怎样读：按类型发现项目里的任务提供方、逐个现问、核对每一行；命令执行前重读提供方、只认它仍给出的那一条 | `horizontal/mainline` | 不存任何东西，每次由 `background.tasks.read@1` 现读；任务的事实在各提供方 |
| 能力包怎样拼：三种包（插件安装、Molis Work 自带、你的角色）、给条目盖来源与所属的包、算包的状态 | `horizontal/kit` | 不存任何东西，每次由 `kit.catalog.list@1` 现算；不建注册表 |
| 技能、提示词、插件角色条目 | apps/local-host 的 Agent definitions | 上报动作读同一份 Agent 定义登记 |
| Character 条目 | `modules/characters` | 它自己的上报动作 |
| 工具条目（全部 Agent 工具） | `horizontal/agent-host` | Agent Host 的工具全集，几个包声明同一个工具时各自列出；谁真能用由角色的工具名单决定 |
| MCP 条目 | 项目 MCP：`horizontal/agent-host` 的 MCP 库；连接带的：连接器；对外的：对外接入 | 各自的上报动作 |
| 包头（已安装、停用、已卸载、上次升级） | Plugin Runtime / Host 包存储 | 当前安装记录 |
| 提示词改写的导出与导回 | apps/local-host 的 Agent definitions | 本人的改写；导出成 `molis.prompt-overrides` 文件，只给本人，逐条确认后写回同一份改写；本人可选同步该格式的改写 |

用户自己组的包、已卸载包的历史条目还没有做（[BL-kit-user-packs](../specs/backlog/BL-kit-user-packs.md)、[BL-kit-uninstalled-history](../specs/backlog/BL-kit-uninstalled-history.md)）。

## Agent Host 保存的人的配置

| 责任 | Owner | 唯一事实源 |
| --- | --- | --- |
| 外部 MCP 服务器的配置（地址或命令、超时、启用；凭据只给引用） | `horizontal/agent-host` | Prologue Runtime 的存储，kind `molis-mcp`；宿主能力 `agent.mcp.*` |
| 写后检查器：每个项目、每个已授权工作区一份，带版本 | `horizontal/agent-host` | Prologue Runtime 的存储，kind `molis-write-checkers`；动作 `agent.write_checkers.list`、`agent.write_checkers.save`，受众只有人（`specs/prologue-adoption/spec.md` §6.0p.2） |
| 本次工作和持续授权，原审查决定及来源 | `horizontal/agent-host` | Prologue 的加密记录；统一管理从同一 owner 读取，运行时仍逐次核对原授权、安装和操作版本 |

Agent Host 经 Prologue 的存储读写。工作区授权由 Home 的项目目录提供（`projects.directories.get`）。现有 MCP 客户端和任务授权继续归原 MCP 设置 owner。

## 图片生成插件

| 责任 | Owner | 唯一事实源 |
| --- | --- | --- |
| 本机生图连接、项目任务、生成图片 | `plugins/native/images` | `{home}/images/images.db` 与 `assets/`；合同 `plugins/native/images/src/contract.ts` |
| 连接凭据、授权与实际模型请求 | Connector owner / Home Host / agent-host | Connector 连接与绑定；可信声明选择命名空间，imageGeneration 服务只交回字节与当次 revision |

协议、范围与验证边界：`specs/archive/images-plugin/spec.md`；不改变文字模型设置，不自动重试或声明 Artifact 发布。

## Jelly 私人工作区

`plugins/native/jelly` 拥有个人日历、每周重复实例、分类、笔记块、关联和撤销历史；唯一写入库 `{home}/jelly/jelly.db`。收想法、读文件与网页在灵光（[合入后审查 PMR-22](../specs/archive/post-merge-review/spec.md)）。Home Runtime 注册全部 53 动作并提供 database、model 和 model.configuration；Host 的通用配置服务拥有模型选择解释与原 preferences.json v1，Jelly 拥有设置动作/UI与业务库。Workbench 只装配插件界面。原 Jelly App 的数据文件不参与写入。合同：`plugins/native/jelly/src/contract.ts`；完整复刻范围与未验收项：`specs/archive/jelly-plugin/`。

### 插件创作工作台

`horizontal/plugin-studio` 现有实现拥有设计草稿、构建记录与发布版本。它是平台能力而非插件（第 47 批 47-1 C，用户 2026-11-22）：宿主与外壳各从自己的「宿主界面」名单（`apps/local-host/src/host-surfaces.ts`、`apps/workbench/src/host-surfaces.ts`）读它的申报，页面请求、界面文字与同步集合照旧；已装签名包的页面、调用与样式归平台（`apps/local-host/src/installed-plugin-http.ts`、`apps/workbench/src/installed-plugin/`），不再借创作台。用户 2026-10-27 反馈至今未完整跑通；后续首先整体升级创作体验和端到端交付能力，同时由平台提供通用场景组装能力，工作台保有创作体验和草稿，个人助理使用同一公开动作；Alchemist 是落地场景，现行升级需求与验收见 `specs/plugin-builder-upgrade/spec.md`（BL-377，尚未实现）。下面保留旧实现边界。生成插件的后端由为此场景新建的 Prologue 代码 Agent 编写，运行在独立的 macOS 沙箱进程（`packages/plugin-sandbox`），只经宿主通道使用平台能力与安装时授权的其他插件动作；界面由平台用 UI 目录渲染。AgentHost 拥有 Prologue 执行，Host 拥有模型凭据与联网代理，PluginRuntime 拥有安装与私有存储权限。旧实现的范围与证据见 `specs/archive/plugin-builder/work-items/studio-v3/spec.md`（旧解释器路线已被整体替换），不作为本次升级已实现的证据。

## Cognia 个人知识库

`plugins/native/cognia` 拥有领域、来源、资料、不可变版本、导入预览/回执及待审阅知识草稿，唯一事实源 `{home}/cognia/cognia.db`。Local Host 只接安全目录读取、HTTP、默认关闭的只读 MCP 与 Prologue 模型端口；模型配置和凭据归现有 catalog/SecretStore，运行记录位于 `{home}/cognia/runtime/`。Workbench 沿既有 stage shell 装配界面，不修改原 vault，不引入云同步或第二运行时。范围与证据见 `specs/archive/cognia-plugin/spec.md`，格式边界见 `specs/archive/cognia-plugin/compatibility.md`。
