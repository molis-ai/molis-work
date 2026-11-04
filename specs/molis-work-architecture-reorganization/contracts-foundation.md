# 架构重组基线：基础包合同

状态：架构重组时的设计与合同记录（2026-09，含正文注明的后续补充），2026-11-03 从需求书分出，保留原章节编号。这里的“已确认”“未实现”、目录与接口示例属于当时基线，不是当前包/API 清单；实际层次、成熟度和依赖以[SSOT](../../docs/SSOT-MATRIX.md)与[现行架构](../../docs/system/ARCHITECTURE.md)为准。原 §20.12/§20.14 两个模块及其他已删除机制的说明见[总需求书开头](spec.md)。

[总需求书与验收](spec.md) · [§19 基础包](contracts-foundation.md) · [§20 模块](contracts-modules.md) · [§21 服务](contracts-services.md) · [§22 插件](contracts-plugins.md) · [§23 应用与工具](contracts-apps.md)

## 本册目录

- [19.1 `packages/kernel`（已确认）](#191-packageskernel已确认)
- [19.2 `packages/storage`（已确认）](#192-packagesstorage已确认)
- [19.3 `packages/exchange` 与 Sync Module（已确认）](#193-packagesexchange-与-sync-module已确认)
- [19.4 `packages/plugin-runtime`（已确认）](#194-packagesplugin-runtime已确认)
- [19.5 `packages/plugin-sdk`（已确认）](#195-packagesplugin-sdk已确认)
- [19.6 `packages/ui-host`（已确认）](#196-packagesui-host已确认)
- [19.7 `packages/design-system`（已确认）](#197-packagesdesign-system已确认)
- [19.8 `packages/observability`（已确认）](#198-packagesobservability已确认)
- [19.9 `packages/test-kit`（已确认）](#199-packagestest-kit已确认)

## 19. Foundation Package Contract

### 19.1 `packages/kernel`（已确认）

**定位：** Runtime 内的 Capability 总机和统一执行门，不是业务协调器或平台大杂烩。

**提供：**

- Capability 注册、发现、解析与调用。
- Provider Binding 与同一 Contract 的 provider 选择。
- 调用上下文、调用者身份引用、Project scope、deadline、取消和 trace 传播。
- Runtime component 的启动、停止、健康状态与依赖顺序协调。
- 统一执行权限检查、错误归一和 observability hook；权限政策由外部 Access Contract 提供。

概念 API 收敛为 `registerCapability`、`resolveCapability`、`invoke`、`bindProvider`、`start`、`stop` 等少量入口；精确类型在执行 Spec 中定义。

**拥有的状态：**

- 当前 Runtime 的 Capability registration、活跃 provider binding、component lifecycle 与 health reference。
- Provider binding 属于平台控制状态；需要持久化时通过 Storage Broker 的专用 control scope 保存，不直接操作数据库。
- 除 binding 外的运行注册表默认可从已安装组件重新构建。

**消费：**

- `contracts/platform/*` 的 Capability、Invocation、Lifecycle 与 Access Decision 类型。
- Identity, Team & Access 提供的 Access Decision Capability。
- Observability hook、Clock、ID、Storage control port 等窄接口。

**明确不负责：**

- Plugin discovery、安装、签名、版本、隔离、进程和恢复；这些属于 `plugin-runtime`。
- SQLite、事务、Module migration 或 Repository；这些属于 `storage` 与各 Module。
- Exchange、Sync、UI Slot、业务 Command 编排或任何 Goal / Artifact Payload 解析。
- 直接导入 Module、Horizontal Service、Plugin、App 或具体 Adapter implementation。

**部署与依赖：**

- Local Host、Server、CLI / MCP embedded host 都可以创建 Kernel instance，但通过同一 Contract 组合不同 provider。
- Kernel 只能依赖 Platform Contract 和无业务语义的基础工具；其他所有实现向 Kernel 注册，Kernel 不反向依赖它们。

**当前抽取来源与验收：**

- 从现有 Web、MCP、Session adapter router 和启动代码中提取通用路由模式，但不把 `MolisWorkCoordinator` 搬入 Kernel。
- 测试必须覆盖 provider 注册与冲突、binding、权限拒绝、provider 缺失、超时、取消、生命周期顺序、错误归一和 trace 传播。
- Kernel 测试不启动真实数据库、网络、Tauri 或业务 Module；这些只在组合测试中使用。

### 19.2 `packages/storage`（已确认）

**定位：** 为 Module、Plugin 和 Platform control state 提供隔离的存储机制与可靠写入原语，不成为中央业务 Store。

**提供：**

- 为 `module:<name>`、`plugin:<plugin_id>` 与 `platform:<component>` 分配独立 Storage Scope。
- Scope 内 Transaction、Migration runner、Durable Outbox、幂等记录、lease 与恢复原语。
- Blob handle、配额、备份、恢复、加密策略和测试用内存实现接口。
- SQLite、Filesystem、Keychain、Blob Store 等 Adapter port；具体实现就近放在使用该 Port 的 Storage、Host 或 App 中。

概念 API 包括 `openScope`、`runTransaction`、`runMigrations`、`enqueueOutbox`、`leaseOutbox`、`putBlob`、`backupScope` 与 `restoreScope`；精确能力按调用方 Contract 收敛。

**事实与 Schema 所有权：**

- 各 Module 自己定义业务 Schema、Repository、Migration 内容和成功条件；Storage 只执行并记录 migration 状态。
- 各 Plugin 自己拥有私有数据的 Schema 与版本，但只能通过获准的 Plugin Storage Capability 访问自己的 scope。
- Platform component 自己拥有 control state 语义，例如 Kernel provider binding 或 Plugin Runtime install record；Storage 不解释这些记录。
- Artifact Blob、Feed content 或日志的业务引用归对应 owner；Storage 只保存 opaque bytes、metadata 和 handle。

**物理与逻辑边界：**

- 第一阶段允许多个 scope 共用一个 SQLite 文件和本地 Blob 目录，以降低迁移成本。
- 共用物理介质不代表共用数据模型：禁止跨 scope SQL、foreign key、Repository import、Join 或直接写入。
- 单个事务只覆盖一个 owner scope；跨 Module 行为通过 Command、Durable Event、Outbox、ACK 与补偿语义完成。
- App、Plugin 和 Horizontal Service 不获得 raw SQLite connection；只有具体 Repository 或受控 Storage Capability 可以操作自己的 scope。

**消费与依赖：**

- 只依赖 Storage / Transaction / Blob / Migration Contract、Clock、ID、Crypto / Key reference 等基础 port。
- Key material 由 Keychain / Crypto Adapter 管理；Storage 只申请和使用 key reference，不读取用户 Secret 语义。
- 可以接入 Observability，但不能依赖任何 Module、Plugin implementation、App 或具体数据库实现。

**当前抽取来源与验收：**

- `src/v1/store.ts`、`src/feed/store.ts`、`src/projects/catalog.ts` 中的通用连接、事务、migration 和持久化机制是提取来源；业务 SQL 与 Repository 分别迁入事实 owner package。
- 测试必须覆盖 scope 隔离、migration 顺序与失败恢复、事务回滚、outbox lease / retry / idempotency、配额、备份恢复和 Adapter contract。
- 验收时必须证明某个 Module 或 Plugin 无法通过 import 或运行时 handle 访问另一个 scope，而不只是依赖开发约定。

### 19.3 `packages/exchange` 与 Sync Module（已确认）

**定位：** Exchange 是 Goal、Artifact 与 Platform Control Envelope 的可靠传输引擎；`modules/sync-replication` 是同步意图、复制关系、冲突处置和用户可见状态的事实 owner。

**Exchange 提供：**

- Envelope codec、外壳 Schema 校验、协议协商与兼容检查。
- Upload、Download、ACK、Cursor、Replay、CAS、去重、顺序和 Blob transfer。
- Local Exchange Client 与 Server Exchange Engine 共用的状态机、错误和 Receipt。
- 断线重连、退避、限流、传输队列与诊断接口。
- 对 Identity / Access、Storage、Blob、Crypto 和 Transport Adapter 的窄 port。

**Exchange 拥有的技术状态：**

- 待传输 Envelope、delivery attempt、ACK、Cursor、Replay window、routing index、CAS token 与 Blob transfer 状态。
- Server 可以持久化 opaque encrypted payload、Envelope header 和路由/审计 metadata，但不拥有 Payload 业务语义。
- Local Exchange Client 的技术状态放在自己的 Platform Storage Scope，不与 Module Repository 混用。

**Sync & Replication Module 拥有：**

- 哪个 Personal Goal / Artifact 被发布、目标 Team Project、publication / replica 关系和已确认版本。
- 本地事实与已接收远端事实之间的 materialization 状态、用户可见同步状态和可恢复错误。
- CAS 冲突或缺少 Plugin consumer 时选择重试、分支、保留待处理状态或请求用户决定的规则。
- 收到 Envelope 后调用 Goals / Artifacts Module API 的 Command；不能直接写其 Store。

**明确边界：**

- Exchange 不决定什么应该同步，也不解析 Goal Contract、Artifact Payload 或 Plugin 自定义 Schema。
- Sync Module 不实现 HTTP、WebSocket、Blob upload、ACK / Cursor / Replay 或重试算法，只消费 Exchange Capability 与 Receipt。
- 只有 Goal、Artifact 与 Platform Control 使用正式 Exchange Envelope；Plugin 自定义共享内容必须装入 Artifact，不创建自己的同步协议。
- E2EE payload 对 Exchange 保持 opaque；Host Crypto Capability 根据 Team Project key policy 产生或消费密文，Plugin 不直接处理团队密钥。
- CAS 只根据 Envelope header 执行协议级条件写入；发生冲突后的业务选择归 Sync 与事实 owner。

**物理结构与依赖：**

- 第一阶段使用一个 `packages/exchange`，内部按 core、client、server 分入口；公共协议类型位于 `packages/contracts` 的 Exchange subpath。
- Exchange 可以依赖 Platform Contract、Storage / Blob / Crypto / Transport port 和 Observability，不能依赖任何业务 Module 或 Plugin implementation。
- `apps/local-host` 组合 Exchange Client，`apps/server` 组合 Exchange Server Engine；二者不复制协议状态机。

**当前抽取来源与验收：**

- Relay 的传输、ACK、Cursor、重试和外部交换机制是迁移参考；Molis Work 当前 outbox / replay 行为作为兼容输入，不直接复制 Relay 业务模型。
- 测试必须覆盖离线重连、重复投递、乱序、CAS 冲突、Cursor replay、Blob 中断续传、权限拒绝、协议版本不兼容和密文不可解析。
- Server 测试要证明自定义 Artifact Payload 无相应 Plugin Schema 时仍能可靠存储与转发。

### 19.4 `packages/plugin-runtime`（已确认）

**定位：** 所有 Local、Server 与 Remote Plugin 共用的安装、身份、授权、版本和生命周期 Control Plane；具体代码运行方式由 Executor port 决定。

**提供：**

- Manifest 解析、Schema / Host 兼容检查与 entrypoint 选择。
- Plugin ID、发布者签名、版本链和升级来源校验；发布者签名变化时按新 Plugin 处理。
- Install、enable、disable、upgrade、rollback、uninstall、recover 的状态机与 Receipt。
- Capability provide / consume 与 Artifact produce / consume 声明、Capability binding、授权上限和实际 grant 记录。
- Plugin instance lifecycle、crash recovery、health、quarantine 和向 Kernel 注册/撤销 Capability。
- Native、Local Isolated、Server 与 Remote RPC Executor 的统一 port。

**拥有的 Platform control state：**

- Plugin install record、active version、publisher identity、manifest digest、enabled state、entrypoint selection 和 recovery state。
- Plugin capability declaration、Artifact Contract declaration、Capability binding、实际 grant、executor binding 与数据 scope reference。
- 卸载后数据是否保留的 platform record；Plugin 业务数据仍保存在其私有 Storage Scope，不进入 Runtime Store。

**权限与身份边界：**

- Manifest 只声明权限上限；Runtime 根据用户或 Team 安装动作记录实际 grant，并在每次 Capability 注册和调用时交给 Kernel 执行。
- Identity, Team & Access 判断操作者是否有权安装 Server Plugin、授予 Team capability 或改变 grant；Runtime 不自己实现 Team 角色政策。
- Team 推荐的 Local Plugin 只形成 recommendation metadata，不创建本地 install record 或 grant。

**Executor 模型：**

```text
Plugin Runtime Control Plane
├── Native Executor
├── Local Isolated Executor
├── Server Executor
└── Remote RPC Executor
```

- Executor 负责进程、worker、container 或 RPC session 的启动、停止、资源限制和 transport，不改变 Plugin 生命周期语义。
- 同一个 Manifest 可以声明独立 Local 与 Server entrypoint；Runtime 根据部署环境只选择允许的 entrypoint。
- UI Contribution 由 `ui-host` 装载和隔离；Plugin Runtime 只提供已验证的 UI entrypoint descriptor、instance identity 和 grant，不运行页面。
- 具体沙箱技术与资源额度在实现 Work Item 中决定，不阻塞 package 边界。

**明确不负责：**

- 不拥有 Goal、Artifact 或任何 Plugin Payload 业务语义。
- 不直接读写其他 Module / Plugin Store，不实现 Exchange、Module API、UI renderer 或 Provider-specific business logic。
- 不把所有 Plugin 调用代理成自定义 JSON；Plugin Capability 仍使用 `contracts` 中的强类型 Contract。
- 不替代 Kernel 的 Capability 路由，也不替代 Adapter 的进程、网络或容器实现。
- 不提供任意 `depends_on_plugin_id` 安装依赖；Plugin 依赖 Artifact Contract 或 Capability Contract，而不是另一个 Plugin implementation。

**依赖与部署：**

- 依赖 Plugin / Lifecycle / Grant Contract、Kernel API、Storage control / plugin scope port、Executor port、Crypto / Signature port 和 Observability。
- Local Host 与 Server 分别组合相同 Runtime Control Plane 和不同 Executor / Capability policy；Remote Plugin 通过 Remote RPC Executor 接入。
- Goals 与 Artifacts Native Plugin 使用官方受保护 install record，普通 Plugin 不能覆盖其 ID 或 Provider Binding。

**当前抽取来源与验收：**

- `src/install/`、Desktop / Web 启动逻辑和 Relay 的 integration lifecycle 是迁移输入；业务集成代码进入具体 Plugin，不进入 Runtime。
- 测试必须覆盖签名一致与变化、Capability 缺失、Artifact Contract 不兼容、权限收窄、升级失败回滚、崩溃恢复、quarantine、Local / Server entrypoint 选择和卸载数据保留。
- Contract test 要证明同一 Plugin 在不同 Executor 下具有一致生命周期和错误语义，同时无法获得部署环境未授权的 Capability。

### 19.5 `packages/plugin-sdk`（已确认）

**定位：** 面向官方安装包和用户自行编译 Plugin 的薄 Host Client；让 Plugin 安全、类型化地使用已授权能力，不分发 Molis Work 内部实现。

**物理与导出结构：**

```text
plugin-sdk/
├── core
├── capability
├── storage
├── goals
├── artifacts
├── ui
└── testing
```

- 第一阶段使用一个可发布 package 和多个 subpath export；Plugin 只导入自己实际使用的部分。
- SDK 依赖 `packages/contracts` 的对应 subpath，不在根入口重新复制或聚合全部 Contract。
- `plugin-sdk/testing` 只提供 Plugin 作者可使用的 Host fixture、grant fixture 和 Contract assertion；完整系统组合、Module implementation fixture 与迁移测试属于内部 `packages/test-kit`。

**提供：**

- `definePlugin`、Manifest 类型、Local / Server entrypoint helper 和 lifecycle hook。
- Artifact producer / consumer helper，用于声明 `artifact_type_id + schema_version`、校验 Payload 并处理消费 Receipt。
- 类型化 Capability client，用于 Query、Command、Event subscription、Service invocation、取消、deadline 和 Receipt。
- 安全的 Plugin Context，包括 Plugin instance、当前 User / Project / Team 的不可伪造引用和已授权 Capability view。
- 只指向当前 Plugin 私有 scope 的 Storage client；不暴露 raw SQLite、其他 scope name 或 Host filesystem path。
- Goals / Artifacts 的类型化 client，用于读取获准上下文、创建或更新 Goal、发布 Artifact 和处理标准版本冲突。
- UI Contribution helper，用于声明一级入口、Command、Inspector 与 Native Plugin 已开放的 Slot；实际装载和隔离由 UI Host 完成。
- 统一的权限拒绝、provider unavailable、timeout、cancelled、version conflict 与 validation error 表达。

**明确不负责：**

- 不包含 Module implementation、Repository、同步引擎、Exchange client、Plugin Runtime 或 App composition。
- 不替 Plugin 自动扩大 grant、选择 Team Project、发布本地数据或绕过用户确认。
- 不提供可访问任意 Host 路径、Secret、DOM 或网络的通用逃生接口；此类能力必须通过独立授权 Contract 与 Adapter grant。
- 不隐藏 Contract version 和 scope；封装必须保留明确的输入、输出、Receipt 与错误语义。

**依赖与运行：**

- SDK 只依赖公开 Contract 和运行环境无关的小型序列化/校验工具；不得依赖 Kernel、Storage、UI Host 或 Module implementation。
- Host 在 Plugin 启动时注入 SDK transport 和不可伪造 Context；Local、Server、Remote Executor 可以使用不同 transport，但暴露相同 SDK 语义。
- UI SDK 与业务 SDK 共用 Plugin instance identity 和 grant，不能在页面侧创建第二套权限状态。

**当前抽取来源与验收：**

- 现有 MCP / Web API client pattern、Feed connector 接口和 Session adapter contract 是易用性参考，不直接复制 Host 内部对象。
- 测试必须使用 public SDK 完成示例 Plugin 的安装后调用、私有存储、Goal / Artifact 交换、UI 注册、权限拒绝和版本不兼容流程。
- 验收时示例 Plugin 不得 import Molis Work 源码内部路径，也不能因切换 Local / Remote transport 修改业务代码。

### 19.6 `packages/ui-host`（已确认）

**定位：** Workbench 中所有 Native / Installed Plugin UI Contribution 的注册、布局、隔离与安全通信宿主；不拥有页面业务内容。

**提供：**

- 一级入口、页面 route、Command、Inspector、详情区和命名 Slot 的注册与冲突处理。
- Plugin UI instance 的 mount、activate、deactivate、unmount、恢复和错误边界。
- UI Contribution Contract、Slot version negotiation、Host Context 和安全 Capability Bridge。
- 导航可见性、焦点、页面生命周期、加载/错误/不可用状态和基本可访问性约束。
- Native Renderer、Isolated Frame Renderer 与 Declarative Embed Renderer 的统一 port。

**两种信任级别、三种 Renderer：**

```text
Trusted Native Plugin
└── Native Renderer

Installed Plugin
├── Isolated Frame Renderer      完整页面
└── Declarative Embed Renderer   小型 Slot 内容
```

- Goals、Artifacts 等官方 Native Plugin 可以注册 Workbench 内受信任组件并直接使用 Design System，但仍经过 Manifest、UI Contribution Contract、Host lifecycle 和错误边界。
- Installed Plugin 的完整页面在隔离 Frame 中运行，只通过 Capability Bridge 获得已授权 SDK 能力，不能访问 Workbench DOM、全局状态或未授权 Host API。
- 小型嵌入默认提交版本化声明式 UI Schema，由 Host 使用 Design System 渲染；不接受任意脚本或 DOM 片段。
- 具体 Frame 技术、CSP 与进程隔离在实现 Work Item 中确定；package contract 不绑定 Web iframe、WebView 或其他单一实现。

**Slot 所有权：**

- 拥有页面的 Native / Installed Plugin 自己声明 Slot name、accepted schema / renderer、位置语义、版本和 fallback。
- UI Host 验证注册、权限、版本与布局，不替页面 Plugin 发明业务 Slot，也不理解嵌入数据含义。
- Plugin 未声明 Slot 时，其他 Plugin 不能向该页面插入内容；Slot contract 变化必须保留兼容期或明确拒绝旧 contribution。
- 第三方 Plugin 可以申请一级入口或嵌入 Slot，但实际激活取决于安装状态、grant、Host policy 和用户布局。

**状态与依赖：**

- UI Host 只拥有 contribution registry、active UI instance、route binding、layout reference 和错误/健康状态等 UI 技术状态。
- 用户布局偏好通过获准的 Platform preference capability 持久化；UI Host 不写 Module Store 或 Plugin 私有 Store。
- 依赖 UI / Plugin Contract、Kernel capability client、Plugin Runtime 提供的已验证 descriptor、Design System 和 Observability。
- 不依赖 Module implementation、业务 Repository、Server implementation 或具体 Plugin UI implementation。

**当前抽取来源与验收：**

- `src/web/render.ts`、Workbench route / navigation、当前页面错误处理和 Desktop bridge 是迁移来源；业务页面分别进入对应 Native Plugin UI，通用视觉 primitive 进入 Design System。
- 测试必须覆盖 route / Slot 冲突、Plugin 禁用、Renderer 崩溃、版本不兼容、权限撤销、Frame 通信伪造、页面恢复和 Host 仍可用。
- 验收时 Installed Plugin 无法直接获取 Host DOM 或其他 Plugin Context，Native Plugin 也不能绕过 UI Contribution registry 直接修改 Shell 导航。

### 19.7 `packages/design-system`（已确认）

**定位：** Molis Work Workbench、Native Plugin、Host-rendered Plugin Embed 和 Server 轻量管理面共用的视觉基础与无业务语义交互模式。

**提供：**

- Color、Typography、Spacing、Radius、Elevation、Motion、Breakpoint 等版本化 Design Token。
- Button、Input、Select、Menu、Dialog、Tabs、Tooltip、Popover 等基础组件。
- Layout、Navigation chrome、Form、List、Tree、Timeline、Empty、Error、Loading、Skeleton 等通用模式。
- Plugin Frame、Slot container、Permission prompt、Unavailable / Crashed Plugin state 的通用视觉 primitive。
- Theme、响应式、键盘交互、焦点、国际化布局和无障碍约束。
- Declarative Embed Renderer 可以安全映射的基础 Schema component catalog。

**明确不负责：**

- 不包含 Goal Tree、Artifact Preview、Feed Item、Execution Panel、Evidence Review 或其他领域组件；这些属于对应 Native Plugin UI。
- 不调用 Module API，不读取 Host / Plugin Store，不拥有 route、页面生命周期、权限判断或业务状态。
- 不依赖 `contracts/modules/*`、Module、Plugin Runtime、App 或具体 Native Plugin implementation。
- 不以“多个页面都使用”为理由吸收业务组件；复用的领域组件可以留在所属 Plugin 的内部 UI library。

**依赖与使用：**

- Design System 只能依赖 UI runtime、样式工具和无业务语义的基础库；其 Token 与公共组件需要保持可 tree-shake 的明确入口。
- Workbench Shell、Native Plugin UI、UI Host renderer 与轻量 Server Admin Surface 可以消费；Installed Plugin 的隔离页面可以使用公开 Token / component distribution，但不能因此获得 Host 能力。
- Host-rendered 声明式嵌入只允许使用经过 UI Host 白名单和版本协商的 component catalog。

**当前抽取来源与验收：**

- `src/web/render.ts`、现有 CSS / asset 与各页面重复的通用 UI pattern 是抽取来源；抽取前先确认组件没有隐含业务查询、mutation 或页面专用状态。
- 测试必须覆盖 Token / theme、关键组件状态、键盘与焦点、无障碍语义、响应式和声明式 Schema 渲染。
- UI 重组验收需要真实 Workbench 切片的视觉与交互检查；类型或快照通过不能替代页面级验证。

**AP3 当前实现事实：** `apps/workbench` 已接管稳定文档 Shell、三个命名 Slot 和分层 browser assets；`packages/ui-host` 已接管 contribution/surface/Slot mount 校验；`packages/design-system` 已接管主题偏好、browser bootstrap 和分层视觉样式。旧 `src/web/visual-foundation.ts` 与 `src/web/i18n.ts` 分别缩成 15 行和 140 行兼容边界，`src/web/render.ts` 从 14,028 行降至 6,239 行。AP3 验收时剩余 renderer 是 GW5/AR3/EX4/WK3/AP4 的产品页面兼容实现，不属于 AP3 可吸收的 Shell/UI 平台职责；后续 Goal 仍须按各自 Contract 迁移，不能以改名或横向搬运伪装完成。完整对账与回归证据见 [`ap3-validation.md`](ap3-validation.md)。

**AP4 当前实现事实：** `apps/desktop` 已接管原生 Shell 检测、Runtime launch、Goal advance prompt、Desktop Panel lifecycle 和 Capsule presentation；Panel 只依赖 Repository/Project-context ports，不导入 SQLite 或 Projects implementation。生产 caller 已使用公开 Desktop entrypoint，旧 `src/desktop/`、`src/web/desktop-shell.ts` 和 Catalog Panel 方法只转发。`src/projects/catalog.ts` 从 2,392 行降至 2,104 行，`src/web/capsule.ts` 从 1,044 行降至 496 行；原 1,473 行 Tauri `main.rs` 已删除并按窗口/Capsule、PTY、本地 Web service、Runtime environment 拆分到 `apps/desktop/adapters/tauri/src/`。当前基线真实存在的是内置 Runtime 升级/修复、Tauri permission、菜单栏/Capsule、Onboarding/i18n 兼容和恢复；系统通知按钮原本禁用，Desktop Keychain/系统通知/App 自动更新器不在基线中，AP4 不注册假能力。完整边界与回归证据见 [`ap4-validation.md`](ap4-validation.md)。

### 19.8 `packages/observability`（已确认）

**定位：** 为 Kernel、Module、Horizontal Service、Plugin Runtime、App 和 Adapter 提供统一的技术运行信号、关联上下文、隐私规则与可替换 Sink；不成为业务事件库。

**提供：**

- 结构化 Log、Metric、Trace、Health、Diagnostic Event 与 error classification。
- `trace_id`、`invocation_id`、`component_id`、`plugin_instance_id`、安全的 Project reference 等关联字段及跨 Capability 调用传播。
- duration、retry count、queue depth、provider unavailable、timeout、crash、recovery 等标准技术属性。
- Redaction、sampling、retention hint、diagnostic bundle 和 Sink port。
- Local Log、Diagnostic Export、Server Operations 与未来 OpenTelemetry Adapter 的统一接入。

**数据边界：**

- 默认只记录对象引用、类型、大小、Hash、版本和经过分类的错误，不记录 Goal Contract、Artifact Payload、聊天内容、Secret、token 或 Plugin 自定义数据原文。
- Plugin 通过 SDK 只能提交受限的结构化 diagnostic fields；Host 再执行字段白名单、长度限制和脱敏。
- 用户主动生成 Diagnostic Export 时仍使用同一 redaction policy，并在 UI 中明确导出范围。
- Local 产品的技术日志默认保留在本地；Server operations signal 只包含 Server 自己的交换、路由、配额和 Team Plugin 运行信息。

**与正式审计的区别：**

- Goal 变更、Artifact 发布、Team 成员操作、Governance Decision、External Action Receipt 等正式记录仍由对应 Module 或 Platform control owner 保存。
- Observability 可以携带正式记录的引用和 trace correlation，但不复制其 payload，也不能作为恢复业务事实的来源。
- 技术 Trace 可按 retention 清理；业务 Audit 的 retention 与访问规则由事实 owner 决定。

**依赖与使用：**

- Runtime package 依赖无业务语义的 Observability Contract、Clock 和 Sink port；具体文件、Console、OTLP 或 Server storage 位于 Adapter / App composition。
- Observability 不依赖 Module、Plugin implementation、Storage Schema、App 或具体 Sink。
- Module 与 Service 通过注入的窄 recorder 使用它，不能导入全局 logger singleton 或写任意文件。

**当前抽取来源与验收：**

- 当前 Web、MCP、CLI、Session、Feed 和 Store 中分散的日志、错误包装与 health response 是迁移来源。
- 测试必须覆盖 trace 跨 Kernel / Plugin / Exchange 传播、Sink failure 隔离、redaction、sampling、diagnostic export 和高基数字段限制。
- 验收 fixture 要主动放入 Secret、Goal / Artifact 原文和 Plugin 自定义字段，证明它们不会进入默认日志或导出包。

### 19.9 `packages/test-kit`（已确认）

**定位：** 为独立 Package Contract 和跨组件组合提供确定性、可故障注入的公共测试机制；不集中拥有业务 Fixture 或测试版业务实现。

**物理与能力结构：**

```text
test-kit/
├── contract-suites
├── fake-kernel
├── fake-storage
├── fake-exchange
├── plugin-harness
├── ui-host-harness
├── deterministic-clock-id
└── app-composition-harness
```

- Contract suite 验证 Module API、Service Capability、Adapter port、Plugin lifecycle 与 Exchange protocol 的统一错误和兼容行为。
- Fake Kernel / Storage / Exchange 只实现公开 Contract，支持权限拒绝、超时、重复、乱序、断线、回滚和恢复等故障注入。
- Plugin Harness 覆盖安装、grant、entrypoint、升级、回滚、崩溃和 Executor 差异。
- UI Host Harness 覆盖 Contribution、Slot、Renderer、Bridge 和错误隔离，不复制 Workbench 页面实现。
- App Composition Harness 可以用显式 provider 组装最小 Local Host 或 Server 场景，不维护隐藏的全局 singleton。

**Fixture 所有权：**

- Goal、Artifact、Feed、Execution、Team 等业务 fixture builder、seed 和 invariant assertion 跟随对应 Module test support 存放。
- `test-kit` 可以组合调用 Module 提供的 public test fixture，但不复制其 Schema、直接 seed 内部表或通过 shared Store 构造状态。
- 跨 Module 场景通过公开 Command、Event 与 Receipt 建立，不能以测试便利为由绕过正式边界。
- 示例 Plugin 的公开合规 fixture 可以通过 `plugin-sdk/testing` 提供；Molis Work 内部实现和 App 集成 fixture 留在 `test-kit`。

**硬边界：**

- 生产 package 的 runtime dependency、build output 和发布物禁止依赖或包含 `test-kit`。
- Test Kit 只能依赖公开 Contract、无业务语义的测试库和 Adapter port；不能依赖 Module / Plugin 内部路径。
- 不建立包含全部业务对象、用户场景和数据库 seed 的中央 Mega Fixture。

**当前抽取来源与验收：**

- 现有 tests 中重复的临时目录、SQLite setup、fake runtime、HTTP fixture 和时间控制是提取来源；业务断言迁回对应 Module。
- 测试 Test Kit 自身时必须用至少两个假 Module、两个 provider 和一个示例 Plugin 证明组合能力，不导入真实 Molis Work 业务实现。
- Boundary check 必须证明生产依赖图中没有指向 `test-kit` 的边。
