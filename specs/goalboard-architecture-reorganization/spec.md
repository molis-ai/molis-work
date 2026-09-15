# Molis Work 架构与包重组需求书

2026-09-06 范围澄清（用户明确确认）：**Outbox 的实现与重放验收留到后续，本期只重组现有功能。** 下文 Storage/Exchange/Materialization 中的 Outbox 设计仍保留为目标架构，不再表述为本期已有能力；本期完整保留并验证已实现的事务、幂等、失败重试与恢复。此澄清不减免旧代码清零、Huge Class治理、包边界、全产品前后端E2E及清理后复验。Molis Work对应验收条目的正式修订当前遇到澄清入口冲突，见 [验证与范围记录](assurance-validation.md)，未冒充canonical已更新。

GW6 实施补齐（2026-09-06）：按已接受 `gw6-work-plan.md`，Goals 基础 schema、15/25/26/30 Goals 升级、V3 旧覆盖账 Query/导入写入已经归入 Goals；Host 保留同连接跨 owner 事务，Web/导入器使用公开 API。已完成定向前后端兼容与失败恢复检查，见 [GW6 验收](gw6-validation.md)。不新增产品功能，不缩减父项/根目标的完整 E2E、清理、再次 E2E 和架构总审要求。

状态：已确认（Architecture Baseline / F1）

完成等级：Level 1 — 可执行架构方案（不代表功能已经迁移或实现）
日期：2026-09-01

## 1. 目标

本轮只定义 Molis Work、Relay 与 Loreport 收拢后的代码包边界、模块事实所有权、依赖方向、Local / Server 部署边界、Plugin Contract、Huge Class 拆分路径和文档 SSOT。它不实现 Team、权限、同步、插件市场或新的产品交互。

本文是本轮架构重组的唯一权威需求书。现有 `docs/molis-work-product-family-and-module-architecture.md` 作为历史输入保留，并已明确标记为 superseded；实现与 package 判断以本文和 `docs/SSOT-MATRIX.md` 为准。

## 2. 当前证据

- 仓库当前仍是单一 `@molis-ai/molis-work` package；`src/` 同时承载 CLI、MCP、Web、Desktop glue、Goal Core、Feed、Project 与 Session。
- `src/v1/` 同时包含 Goal、Execution、Evidence、Review、Lifecycle、Store 与 Coordinator，领域边界没有落实到代码包。
- `src/web/` 同时拥有 App Host、路由、页面渲染、终端、模块展示和业务 mutation，UI Host 与各模块 UI 未分离。
- 当前最大的两个文件 `src/v1/coordinator.ts` 与 `src/web/render.ts` 均超过 14,000 行；`src/web/server.ts`、`src/mcp/server.ts`、`src/projects/catalog.ts` 和 `src/v1/store.ts` 也同时承担多种职责。只把这些文件原样移动到新目录，不会形成真正的模块边界。
- 现有架构草案把产品策略、领域模块、部署位置、未来功能和仓库迁移混在一份文档中，且仍使用 `Space`、完整 Server 业务权威和旧模块划分。
- Relay 已实现的 Connector、执行适配、外部写回、消息面和 Team Host 是能力迁移来源；Loreport 的价值主要是文档矩阵、模块正交方法、私人到共享边界和 Materialization 设计。

## 3. 当前范围

### 3.1 包含

- 统一产品与 Monorepo 顶层结构。
- 16 个语义模块的唯一事实所有权。
- Module 与 Horizontal Service 的分层，以及可复用运行能力的 package 边界。
- Platform、Contract、Native Plugin、App 与 Adapter 的依赖方向。
- Goals 与 Artifacts 两个官方一等 Plugin 的特殊地位。
- Local Plugin、Server Plugin、Remote Plugin 的部署边界。
- Goal / Artifact 作为跨模块、跨设备与跨 Team 的业务交换主干。
- Context Ledger、Sync、Storage 与 UI Extension 的平台边界。
- 当前源码到目标 package 的迁移映射。
- 现有 Huge Class / Huge File 的职责拆分、兼容迁移与验证规范。
- 分层文档 SSOT 矩阵。

### 3.2 非目标

- 不移动现有源码，不创建 workspace，不修改构建与发布流程。
- 不实现 Team、Server、Plugin Runtime、权限、加密或同步。
- 不设计完整的 Team 角色、Restricted Project、计费、Retention 或管理后台。
- 不实现 Plugin Marketplace、自动更新 UI 或自定义 Server Plugin 部署器。
- 不承诺当前讨论中的未来功能已经可用。
- 不删除或归档 Relay、Loreport 仓库。
- 不为了降低行数把内聚逻辑机械切成大量无语义的小文件；拆分依据是事实所有权、调用边界和可独立验证性。

## 4. 已确认的产品与所有权概念

### 4.1 产品关系

- Molis Work 是统一产品与总品牌。
- Desktop / Personal 与 Team / Server 是不同产品面，共用同一套模块契约。
- Relay 不再拥有平行的 Goal、Team 或 Review 真相；其能力按 Adapter、Plugin 或 Host 迁入。
- Loreport 不再发展平行产品权威；其模块方法和已确认机制迁入 Molis Work SSOT。

### 4.2 User、Team 与 Project

产品只保留三个直接概念：`User`、`Team`、`Project`。

```text
User
└── Personal Project

Team
└── Team Project
```

- `Space` 不再作为产品或领域实体；原 `Identity & Space` 调整为 `Identity, Team & Access`。
- Project 使用同一个模型，通过 `owner_type: user | team` 与 `owner_id` 表达归属。
- 一个 Project 只有一个 Owner。
- `Board` 不再是未来产品实体；`board_id` 只作为现有 Goal 数据迁移期兼容字段，最终由 `project_id` 统一。
- User-level 数据允许存在于 Project 之外；正式 Team Goal、Team Artifact 与共享业务内容必须归入具体 Team Project。

## 5. 已确认的 16 个语义模块

模块是事实所有权与 API 边界，不等于仓库、进程、页面或微服务。

### 基础

1. `Identity, Team & Access`
2. `Project`
3. `Context Ledger & Materialization`
4. `Sync & Replication`

### 信息与个人工作

5. `Sources`
6. `Signals`
7. `Feed`
8. `Actions`
9. `Attention & Resumption`

### 持续工作主链

10. `Goals`
11. `Private Work Context`
12. `Execution`
13. `Artifacts`
14. `Evidence & Verification`

### 协作与自动化

15. `Governance & Collaboration`
16. `Automation`

这些模块保持正交，不因 Goal / Artifact 成为交换主干而互相吸收。每个模块后续拥有一份独立 SSOT，定义自己的对象、命令、事件、状态、失败恢复和边界。

## 6. Goals 与 Artifacts

### 6.1 官方一等 Plugin

- Goals 与 Artifacts 是官方维护的一等 Native Plugin。
- 第三方 Plugin 可以通过 Module API 创建、消费、关联和扩展其 UI，但不能替换、冒用或直接访问其 Store。
- 此决定替代了早期“所有 Native Module 均可由第三方 Provider 替换”的假设。
- Provider 迁移协议仍可用于其他明确开放替换的 Capability，不适用于 Goals 与 Artifacts。

### 6.2 Goal 引用

```text
GoalContractRef
├── goal_id
└── contract_version
```

- Goals Plugin 分配和维护 `contract_version`。
- 目标定义、验收标准、约束或依赖变化时递增 Contract Version。
- Claim、Run、阻塞和执行进度不是 Contract Version。
- Artifact、Evidence、Verification 和 Decision 引用具体 Goal Contract。

### 6.3 Artifact 引用

```text
ArtifactRef
├── artifact_id
└── version
```

- 生产 Artifact 的 Plugin 自己维护内容版本及其递增规则。
- Artifacts Plugin 不规定可变、不可变、草稿、Head 或合并语义。
- 跨模块关系始终引用明确的 `artifact_id + version`。
- Artifacts Plugin 保存被明确提交用于交换的标准 Envelope、加密 Payload、Blob 引用与 Hash；Plugin 私有 Store 仍拥有内部数据和内容语义。
- Artifact 内容版本与 Plugin Schema Version 是不同概念。

### 6.4 交换规则

- 工作意图、目标和 Contract 通过 Goal 表达。
- 需要跨模块、跨设备或跨 Team 传递的业务内容通过 Artifact 表达。
- 其他模块继续拥有自己的业务对象；需要共享时发布类型化 Artifact，接收端的对应 Plugin 再消费并恢复自己的语义。
- Plugin 本地缓存、草稿、日志、设置、Secret 与未发布内部状态不自动成为 Artifact。
- 平台控制信息（身份、成员、Plugin 安装、ACK、Cursor、健康状态、配额）不伪装成 Goal 或 Artifact。

## 7. Context Ledger 与关系所有权

- 模块内部关系由对应模块维护，例如 Goal 之间的依赖、Artifact 版本之间的内部来源关系。
- 跨模块关系只在 Context Ledger 保存一次。
- 发起业务模块负责验证关系是否合法；Context Ledger 只保存对象引用、关系类型、来源、因果、操作者、时间与可重建投影。
- Context Ledger 不复制 Goal Contract、Artifact Payload 或其他模块完整内容。
- Ledger 逻辑上分为 User Ledger 与各 Team Project Ledger；物理实现可以暂时共享数据库。
- Personal 内容发布到 Team 时创建新的 Team Goal / Artifact 或分支，不改变原对象 Owner；User Ledger 保存完整来源，Team Project Ledger 只保存不会泄露私人引用的 Publication Receipt。

## 8. Module、Horizontal Service 与 Plugin

### 8.1 Microkernel

Molis Work 保留不可由普通 Plugin 热替换的最小 Microkernel，只负责：

- Plugin 身份、签名、加载与恢复；
- Module Contract 与 Capability 路由；
- 权限与 Storage Broker；
- Provider Binding；
- UI Extension 注册；
- Local / Server Exchange 接入。

Microkernel 不拥有 Goal、Artifact、Feed、Execution 等业务语义。

这里的 Microkernel 是架构层，不等于单个 `packages/kernel`。它由最小 Kernel、Plugin Runtime、Storage Broker、UI Host 和必要的 Platform Contract 共同组成；这些能力保持独立 package，避免重新形成平台单体。

### 8.2 四层职责

- Module 是事实账本和规则，拥有长期对象、合法状态变化、Command、Query、Event 与恢复来源。
- Horizontal Service 是可重建的运行机制，负责监听、调度、投递、重试、执行、转换、索引或通知，不拥有业务真相。
- Plugin 是可安装或可组合的应用级能力，组合 Module API、Horizontal Service Capability、UI Contribution 与 Provider-specific code。
- Adapter 只实现 SQLite、Keychain、HTTP、WebSocket、Tauri、PTY、Codex app-server 等具体技术协议，不拥有产品行为或业务 Store。

这四者不是一一对应关系：一个 Module 可以由多个 package 实现；一个 Plugin 可以组合多个 Module 与 Horizontal Service；一个 Horizontal Service 可以同时服务多个 Plugin。

### 8.3 跨边界调用

- 同一 Module 内部可以直接调用自己的 Repository、Policy 与 Handler。
- 跨 Module 必须通过强类型 Module API 与 Capability Router，不能导入对方 implementation 或 Store。
- Module 调用 Horizontal Service 时使用强类型 Service Capability；Service 把执行 Receipt 通过 Module API 返回给事实 owner。
- Query 用于读取事实，Command 用于请求状态变化，Durable Event 用于异步通知与扇出；不把所有调用强行变成事件，也不使用一个接收任意 JSON 的万能 API。
- Capability Router 可把同一 Contract 路由为同进程调用、IPC、Local RPC、Server RPC 或 Remote RPC，调用者不感知 Provider 位置。

### 8.4 Plugin 身份与组合

- 一个 Plugin 可以提供或消费多个 Capability，但每项 Capability 独立声明、授权、版本化与绑定。
- Plugin 只能访问自己的私有 Store；对正式 Module 事实的读写必须经过 Module API。
- Plugin ID 绑定发布者签名；签名不同即为新 Plugin，不继承原 Plugin 的数据、权限、Provider Binding 或更新链。

### 8.5 Local、Server 与 Remote

- Local Plugin 由用户安装，默认数据为个人、本地数据；只有用户在 Plugin 自己的业务界面明确发布的 Goal / Artifact 才进入 Team 同步。
- Server Plugin 由 Team 决定安装，其 Team 输出仍通过 Goal / Artifact 交换。
- 同一个 Plugin Manifest 可以声明共享 Contract，以及独立部署的 Local 与 Server entrypoint。
- Molis Work Hosted Server 只运行官方审核的 Server Plugin。
- 自定义或开源 Server Plugin 由 Team 自行托管，通过 Remote Plugin API 接入。
- Team 可以表达推荐或某项能力所需的 Local Plugin，但不能替成员自动安装或授予本地权限。

### 8.6 UI Extension

- 所有一级产品能力由 Native / Installed Plugin 的 UI Contribution 组成。
- 完整页面使用隔离 UI Frame；小型嵌入优先由 Host 根据声明式 UI Schema 渲染。
- 页面所属 Plugin 必须通过 UI Contribution Contract 主动开放命名 Slot；其他 Plugin 不能任意注入 Host DOM。
- 页面 Plugin 定义自己支持的 Slot 与版本，Platform 只定义通用 Slot descriptor、Renderer 和安全边界；业务 Module 不拥有页面结构。

### 8.7 一级 Native Plugin（已确认）

Native Plugin 按一级产品入口与完整应用能力划分，不与 16 个 Module 一一对应。第一阶段的目标集合是：

| Native Plugin | 组合的主要 Module / Service | 特殊约束 |
| --- | --- | --- |
| Goals | Goals、Context Ledger、Evidence & Verification、Governance & Collaboration | 官方保护的一等 Plugin，不可替换 |
| Artifacts | Artifacts、Context Ledger、Evidence & Verification | 官方保护的一等 Plugin，不可替换 |
| Feed | Sources、Signals、Feed；Connector Host、Listener Host | Provider 差异由 Integration Plugin / Adapter 提供 |
| Actions | Actions、Attention & Resumption；Connector Host | Personal / External Action 共用入口，但保持强类型状态机 |
| Work | Private Work Context、Execution；Runtime Host | 不拥有 Goal 或 Artifact 正式事实 |
| Automation | Automation；Scheduler | Automation 产生 Action Request，调度机制由 Horizontal Service 执行 |

- `Project`、`Team`、`Settings` 和 `Plugin Manager` 属于产品 Shell 与 Platform 管理面，不做 Native Plugin。
- Sources、Signals、Evidence、Governance 等细粒度 Module 不单独占一级入口，而是在上述 Native Plugin 中提供页面或嵌入视图。
- Native Plugin 只组合 Module API、Horizontal Service Capability 和 UI；不能因为拥有一级入口而成为新的事实 owner。
- 第三方或官方 Integration Plugin 可以声明一级入口或申请 Native Plugin 暴露的嵌入 Slot，具体是否展示由 Host、权限和用户安装状态决定。
- 除 Goals、Artifacts 外，其他官方 Native Plugin 是否允许禁用或替换属于后续产品策略，不阻塞本次包重组。

## 9. Exchange Server 边界

- Server 是语义轻量的可靠交换与轻量存储层，不是 16 个业务模块的云端复制品。
- Server 识别 Goal / Artifact 官方 Envelope 外壳与平台控制 Envelope。
- Server 可以检查 ID、Version、Project、发送者、接收范围、Base Version、Hash、Blob 引用、权限引用与时间。
- Goal Contract、Artifact 内容和 Plugin 自定义 Payload 默认端到端加密，Server 不判断 Goal 完成、Evidence 充分性或自定义字段含义。
- Server 负责认证、授权、路由、顺序、CAS、持久化、Blob、ACK、Cursor、Replay、Quota、Retention 与审计。
- 默认按 Team Project 使用独立数据密钥；Plugin 不实现密码学，只把共享目标交给 Host。
- 其他模块需要共享的业务状态发布为类型化 Artifact，不各自设计 Server 同步协议。

## 10. 可靠写入与存储边界

- Module Store 与 Plugin 私有 Store 均逻辑隔离；第一阶段可以继续使用 SQLite 和同一进程，但禁止跨 Store 直接查询或写入。
- 每个事实 owner 自己维护内部 Schema 与 Migration。
- 跨 Plugin 操作使用本地事务、Durable Outbox、幂等 Module Event 与 ACK / Replay，不设计跨设备全局事务。
- 同步、失败恢复、重试与诊断由 Platform 提供一次，业务模块只定义自己的成功条件和补偿语义。

## 11. 目标 Monorepo 包地图（已确认）

下面是本次重组的目标包地图。F1 只把它定为权威基线；F2 负责完整创建 workspace 与物理 package，后续垂直切片再迁移真实业务实现。

```text
molis-work/
├── apps/
│   ├── desktop/
│   ├── workbench/
│   ├── local-host/
│   ├── server/
│   ├── cli/
│   └── mcp/
│
├── packages/
│   ├── contracts/
│   │   ├── modules/
│   │   ├── services/
│   │   └── platform/
│   ├── kernel/
│   ├── plugin-runtime/
│   ├── plugin-sdk/
│   ├── storage/
│   ├── exchange/
│   ├── ui-host/
│   ├── design-system/
│   ├── observability/
│   └── test-kit/
│
├── modules/
│   ├── identity-team-access/
│   ├── projects/
│   ├── context-ledger/
│   ├── sync-replication/
│   ├── sources/
│   ├── signals/
│   ├── feed/
│   ├── actions/
│   ├── attention-resumption/
│   ├── goals/
│   ├── private-work-context/
│   ├── execution/
│   ├── artifacts/
│   ├── evidence-verification/
│   ├── governance-collaboration/
│   └── automation/
│
├── horizontal/
│   ├── connector-host/
│   ├── listener-host/
│   ├── scheduler/
│   └── runtime-host/
│
├── plugins/
│   ├── native/
│   │   ├── goals/
│   │   ├── artifacts/
│   │   ├── feed/
│   │   ├── actions/
│   │   ├── work/
│   │   └── automation/
│   └── official-integrations/
│       ├── github/
│       ├── gmail/
│       ├── rss/
│       ├── web-query/
│       └── youtube/
│
├── tooling/
│   ├── plugin-cli/
│   └── migrations/
│
└── docs/
    ├── system/
    ├── modules/
    ├── horizontal/
    ├── platform/
    └── decisions/
```

### 11.1 初始依赖方向

```text
apps
  → platform composition roots
  → selected modules / horizontal services / plugins / adapters

modules
  → module contracts
  → service capability contracts
  ✕ another module implementation / Store

horizontal services
  → module contracts
  → plugin driver contracts
  → adapter ports
  ✕ business decisions / business Store

plugins
  → module contracts
  → service capability contracts
  → plugin SDK
  → permitted adapter ports through grants

platform packages
  → core contracts
  ✕ business module / plugin implementation

adapters
  → declared ports / contracts
  ✕ business Store
```

- Plugin 不导入另一个 Plugin 的 implementation 或 Store。
- Module 不导入另一个 Module 的 implementation 或 Store。
- Horizontal Service 不决定 Module 的正式状态，只返回执行 Receipt。
- App Shell 不直接写业务数据库。
- Server Core 不导入 Plugin Payload Schema 或业务状态机。
- Contract package 不依赖 App、Platform implementation 或 Plugin implementation。

### 11.2 物理 package 落地策略（已确认）

目标包地图中的 package 必须在本次重组中全部物理建立并接入 Monorepo workspace；是否已有完整业务实现与 package 边界是否存在是两件事。

- 每个目标 package 都提供 package manifest、public entrypoint、对应 Contract 接线、允许/禁止依赖声明、就近 README、独立 build / typecheck 和 import boundary / Contract conformance test。
- F2 新建的全部目标 package 统一标记为 `contract-only`，只提供稳定边界和类型化入口，不注册 Runtime provider，不创建假 Store、空状态机或返回伪成功的占位 API；旧目录里已有同类功能，不等于已经迁入新 package。
- 有现有代码的 package 在对应垂直切片中迁入真实实现；一条完整的 Contract → implementation → caller → compatibility test 链路迁入后才可以标记为 `partial`，且 README 与迁移矩阵必须列出剩余旧 owner 和 caller。
- 只有真实主路径、错误路径、持久化、恢复和验收通过后，package 才能标记为 `implemented`；目录存在或类型检查通过不等于功能可用。
- 新建 package 默认标记为 Monorepo 内部私有包；独立 package 表达的是代码和依赖边界，不等于必须发布到 npm。
- 面向外部 Plugin 作者的 Contract、Plugin SDK 和必要的 UI Extension 类型，才进入可发布面；是否实际发布由对应迁移 Work Item 决定。
- App 始终是私有 composition root；不会因为独立部署就自动成为公共 library。
- package 的 `contract-only / partial / implemented` 状态只描述实现成熟度，不改变包名、事实 owner 或 Contract identity。
- 不得为了“看起来完成”复制旧实现、制造双重事实来源，或把 `contract-only` 宣称为已经提供产品功能。

该策略同时适用于现有 Huge Class 的拆分：包边界可以先完整建立，但实现仍然每次只迁移一条完整用例；不先复制整类，也不建立新的大而空 Facade。

### 11.3 Contract 物理结构（已确认）

第一阶段只维护一个可发布的 `packages/contracts` package，通过 subpath export 暴露不同边界：

```text
contracts/modules/<module>
contracts/services/<horizontal-service>
contracts/platform/<capability>
```

使用方按具体边界导入，例如 `contracts/goals`、`contracts/artifacts`、`contracts/services/listener` 或 `contracts/platform/plugin`；最终 npm scope 和精确 export 名称在执行 Spec 中确定。

- 一个分发包不代表一个通用协议；每个 Module / Service 仍拥有独立的类型、Schema、错误语义和兼容规则。
- 禁止把所有类型通过根入口重新聚合成一个大 barrel；调用方必须显式声明自己依赖的 Contract subpath。
- `contracts` package 不包含业务实现、数据库访问、网络客户端、Plugin 实现或 App composition。
- Module 是其 Contract 语义的 owner；`contracts` package 只是可执行类型和 Schema 的中立承载位置。
- npm package version 表示整个分发物版本；需要独立演进的 API、Event、Goal Contract 或 Artifact Payload 继续保留自己的 schema / protocol version。
- 每个 subpath 都需要 compatibility test；破坏性变化必须保留旧版本解析或提供明确迁移期，不能依赖整体 package 升级掩盖协议不兼容。
- 只有出现独立发布节奏、依赖体积或兼容矩阵的真实压力时，才把某个 Contract 拆成单独 package；拆分后需要保留原 subpath 的兼容迁移层。

### 11.4 App 与部署组合（已确认）

Workbench 是共享 UI 应用层，Desktop 是本地产品外壳，Local Host 是本地业务运行主体；Server 不运行完整 Workbench。

```text
Desktop App
├── Workbench UI
├── Local Host
└── Native Bridges
    ├── Filesystem / Keychain
    ├── Terminal / PTY
    ├── Plugin Installer
    └── Notification / Updater

Server App
├── Goal / Artifact Exchange
├── Team Plugin Host
└── Lightweight Admin Surface
```

- `apps/workbench` 承载产品 Shell、UI Host、Design System 和 Native / Installed Plugin UI Contribution。
- Workbench 只通过类型化 Host Client / Capability API 读取事实和发起 Command，不直接依赖 SQLite、Node-only implementation 或 Tauri API。
- `apps/local-host` 组合本地 Module、Horizontal Service、Plugin Runtime、Storage 与 Adapter，是用户实际工作的业务运行位置，也允许被 CLI / MCP 以无 UI 方式连接。
- `apps/desktop` 组合 Workbench、Local Host 和 Native Bridge，负责窗口、进程生命周期、原生权限、安装、更新与系统集成，不拥有业务规则。
- `apps/server` 只组合 Identity / Team / Project 控制面、Goal / Artifact Exchange、Team Plugin Host 和轻量管理界面，不复制完整 Local Module 状态机。
- Server 管理界面与 Workbench 可以复用 Design System 和通用 UI primitive，但不能为了代码复用把完整本地工作台部署到 Server。
- CLI、MCP、Desktop 和 Workbench 是不同入口，共用 Module Contract 与 Local Host 能力；任何入口不得复制一套业务判断。
- Installed Plugin 的 UI 在 Workbench UI Host 中运行，其 Local entrypoint 在 Local Host Plugin Runtime 中运行；二者通过 Plugin Contract 和 Host 提供的安全通道通信。

## 12. 当前源码到目标边界的初始映射

| 当前路径 | 当前混合职责 | 目标边界 |
| --- | --- | --- |
| `src/index.ts` | 根 library export 聚合 Store、Coordinator、migration 与全部 V1 types | `packages/contracts` public subpath + 各 Module public entrypoint；根入口只做有期限兼容 |
| `package.json`、`pnpm-workspace.yaml` | 单 package manifest、bin、构建测试与发布清单 | F2 workspace 根配置 + 各 package manifest；DV4 / Cutover 维护最终发布面 |
| `src/v1/` | Goal、Execution、Evidence、Review、Lifecycle、Store | Goals、Execution、Artifacts、Evidence & Verification、Context Ledger Modules |
| `src/feed/` | Connector、Source、Signal、Feed、Inbox Attention、Secret、Scheduler | Sources、Signals、Feed、Attention & Resumption Modules；Connector Host、Listener Host；Provider Plugin / Adapter |
| `src/sessions/` | Runtime Adapter、Session、内容、Handoff | Private Work Context、Execution Modules；Runtime Host；Codex Runtime Plugin / Adapter |
| `src/projects/` | Project catalog、DB、Session workspace | Project、Storage Host、App composition |
| `src/planning/` | Goal Graph 与方法包 | Goals Plugin 或独立方法 Plugin |
| `src/web/` | Web App、UI Host、页面、业务写入、终端 | Workbench App、UI Host、各 Native Plugin UI、Runtime Host / Adapter |
| `src/mcp/` | Host 与全部业务工具 | MCP App + Module API adapters |
| `src/cli/` | Host 与业务命令 | CLI App + Module API adapters |
| `src/desktop/` | Desktop launch 与 Runtime bridge | Desktop App + Platform bridge |
| `src/install/` | 安装、服务、Runtime integration | App installer + Plugin lifecycle / Runtime integration |
| `src/evidence/` | Evidence 文件、引用与导出辅助 | Evidence & Verification Module + Artifacts Module；按事实与文件内容分别归位 |
| `skills/goal-advance/` | Codex Runtime 的 Molis Work 使用协议、规划方法与操作说明 | 开发者 / Runtime 集成发布面；继续消费正式 Module Contract，不复制业务规则 |
| `examples/` | CLI、MCP、Skill 与集成示例 | 与对应公共入口共同迁移；Plugin 样例统一为非 production workspace 的 `examples/plugin-sample` |
| `scripts/` | macOS 构建、安装、卸载、升级与发布脚本 | Desktop / App installer / release owner；通用迁移脚本进入非 package 的 `tooling/migrations` |
| `.github/workflows/` | 单包 CI 与 macOS Release | F2/F3 接入 package 门禁；DV4 / Cutover 更新构建、签名、公证、SBOM 与发布验收 |
| `desktop/src-tauri/` | macOS bundle、原生命令、权限和更新 | `apps/desktop` Native Bridge 与发布配置 |
| `vendor/` | vendored dependency、provenance 与 SBOM | 分发与供应链发布面；随依赖 owner 和最终安装包一起验证，不成为业务 package |

这张表只说明迁移方向；没有得到逐包 Contract 和依赖验收前，不移动文件。

## 13. Huge Class / Huge File 分解与迁移规范

### 13.1 当前审查基线

| 当前文件 | 当前行数 | 首要拆分方向 |
| --- | ---: | --- |
| `src/v1/coordinator.ts` | 15,168 | Goals、Execution、Evidence & Verification、Governance application services；原 Coordinator 仅作为迁移期兼容 Facade |
| `src/web/render.ts` | 15,031 | Workbench shell、Design System、UI Host 与各 Native Plugin UI renderer |
| `src/web/visual-foundation.ts` | 7,979 | Design System tokens、基础组件与视觉资产；不得继续与页面业务判断混合 |
| `src/web/server.ts` | 4,925 | Workbench transport、route composition、Module endpoint adapter 与 Runtime bridge |
| `src/web/i18n.ts` | 3,709 | Workbench / Native Plugin 文案目录与 Desktop 兼容文案；按 UI owner 分域维护 |
| `src/mcp/server.ts` | 3,420 | MCP App composition 与按 Module 划分的 tool adapter；不得复制业务规则 |
| `src/projects/catalog.ts` | AP1 前 2,955；AP1 后 2,392；AP4 后 2,104 | Project facts/SQL 已迁入 Projects，Desktop Panel 规则/SQL 已迁入 Desktop App 与其 SQLite adapter；剩余文件 staging、Runtime context binding 与兼容转发 |
| `src/v1/store.ts` | 2,714 | 按事实 owner 划分的 Module repository、schema 与 migration |
| `src/web/project-session-workspaces.ts` | 1,450 | Work Context、Project membership 与 Workbench workspace read model |
| `src/install/runtime-integration.ts` | 1,448 | Runtime 接入、安装变更预览、回滚与诊断 |
| `src/sessions/registry.ts` | 原 1,324；WK1 后兼容入口 8 行 | 已拆到 Private Work Context 的 Session、Event、Handoff、Migration、Content、Schema 与 Context Binding Repository；WK2 / WK3 删除剩余 caller 兼容面 |
| `src/feed/store.ts` | 1,306 | Sources、Signals、Feed 各自的 repository；共享事务通过明确 Contract 协调 |
| `src/v1/types.ts` | 1,238 | 按 Module Contract 分组的 public types 与各实现内部 types |
| `src/web/pty-client.ts` | 1,177 | Work UI 的终端客户端与 Runtime Host stream adapter |
| `src/feed/connectors/gmail.ts` | 1,131 | Gmail Integration Plugin 的 provider-specific connector / listener / signal adapter |
| `src/v1/goal-decomposition-validation.ts` | 1,126 | Goals Planning 的拆分覆盖、图约束与提案校验 |
| `src/v1/action-projection.ts` | 1,110 | Execution / Evidence / Governance 状态到用户下一步动作的投影 |
| `src/web/capsule.ts` | AP4 前 1,044；AP4 后 496 | 只保留跨事实只读状态组合与兼容环境注入；Capsule CSS/client/HTML presentation 已迁入 Desktop App |

行数只作为强制审查触发器，不是拆分目标：重组涉及的文件超过 1,000 行时，必须在对应 Work Item 中给出职责拆分图；即使没有超过 1,000 行，只要一个 Class 同时拥有多个 Module 事实、跨越 Module / Service / App 层，仍必须拆分。

### 13.2 拆分原则

- Huge Class 不能原样搬进新 package，也不能换名后继续充当全系统业务入口。
- 按“事实 owner + 一组内聚用例 + 独立测试面”拆分，不按固定行数平均切割。
- 每个 Module 只通过自己的 public API 暴露 Query、Command 与 Event；实现、Repository 和内部类型默认不导出。
- App composition 可以编排多个 Module，但不拥有业务规则；Horizontal Service 可以保存队列、lease、cursor 等技术状态，但不拥有正式业务事实。
- 原入口可以暂时保留为 Compatibility Facade，但只能转发到新 API，并必须记录仍依赖它的 caller 和移除条件。
- 禁止为解决 Huge Class 引入新的全局 `Manager`、`Service`、`Coordinator` 或共享 Store，把原有耦合换一个位置继续保留。

### 13.3 逐切片迁移顺序

每一个大类或大文件按同一顺序迁移：

1. 先用现有测试和 characterization test 固定当前对外行为、错误语义与持久化副作用。
2. 定义目标 Module / Service Contract、唯一事实 owner、允许依赖与禁止依赖。
3. 一次抽取一条完整用例链路，包括 API、实现、Repository、Event 和测试，而不是先批量搬类型或文件。
4. 让旧入口委托给新入口，验证新旧行为一致，再逐个迁移 CLI、MCP、Web、Desktop 和 Plugin caller。
5. 只有在 caller 清零、回归测试通过、数据迁移与回滚路径明确后，才删除 Compatibility Facade。

迁移必须始终保持主分支可构建、可测试和可回滚，不采用一次性重写。若抽取过程中发现 Module Contract 必须变化，先更新本需求书或对应 Work Item Spec，再继续移动代码。

### 13.4 代码边界验收门

- 每个目标 package 只有明确的 public entrypoint；其他 package 禁止 deep import 内部文件。
- 自动化检查阻止 Module implementation / Store 跨包导入、Plugin implementation 互相导入和 App 直接写业务数据库。
- Compatibility test 覆盖迁移前后的主要 Query、Command、Event、错误路径与持久化结果。
- 新 package 必须能独立运行定向测试；共享 test-kit 只提供测试工具，不成为共享业务实现。
- 任何新出现的超大 Facade 或跨 Module Store 都视为迁移失败，即使目录结构已经符合目标包图。

### 13.5 垂直切片迁移顺序（已确认）

不按“先搬全部 types、再搬全部 Store、最后重写 UI”的技术层次横向迁移，也不先完整拆完 `MolisWorkCoordinator` 或 `render.ts`。每个切片必须同时覆盖：

```text
Contract
→ Module / Repository
→ Horizontal Service（如需要）
→ Local Host Capability
→ Workbench / Native Plugin UI
→ CLI / MCP adapter（如已有入口）
→ Compatibility test 与开发文档
```

完整迁移按 11 个结果型 Work Item 追踪；它们是可独立验收的产品或工程结果，不是按目录平均分块：

1. **架构 SSOT 与完整 Package 底座**：定稿包地图、状态矩阵和依赖规则；把所有目标 package 物理建立并接入 workspace，补齐 public entrypoint、Contract、README、独立 build / typecheck 与 boundary test。F2 新包统一标记 `contract-only`，不得注册 Runtime provider 或伪造 Store / 状态机；后续垂直切片真实迁入调用链后再升级状态。
2. **Feed 与 Plugin Platform 参考切片**：拆出 Sources、Signals、Feed Module，以及当前 `InboxEntry` 对应的最小 Attention & Resumption Module；同时拆出 Connector Host、Listener Host、Feed Native Plugin UI 与现有 Provider Adapter。Listener 使用 Integration Plugin 提供的 Adapter 把 Raw Event 转为 Signal Draft，不单独创建 Ingestion Pipeline；Feed Module 自己决定是否形成 Feed Item，不创建 Feed Router package。Actions package 在此阶段只保持已建立的 `contract-only` 边界。
3. **Goals Query**：迁移目标列表、详情、关系与只读投影；建立 Goals Query API，让 Web / CLI / MCP caller 通过新边界读取并保持结果一致。
4. **Goals Mutation 与 Planning**：按 Contract、Graph / Policy、Risk、Lifecycle、Project Guidance 与规划提案等内聚用例迁移 Command、Repository 与并发 / 恢复语义。
5. **Artifacts 与 Context Ledger**：把现有输出、文件、内容引用、跨模块关系与 provenance 迁入独立事实 owner；建立 Artifact 版本、Contract、权限和可重建上下文链路，并完成 Artifacts Native Plugin 的现有能力归位。
6. **Execution、Evidence & Verification、Governance & Collaboration**：从原 Coordinator 中拆出 Claim / Run、Evidence / Review、Proposal / Decision 等事实 owner 和事件链，保持完整执行与验收闭环。
7. **Work、Session 与 Runtime**：迁移 Private Work Context、Session、Runtime Host、Codex / PTY Adapter 与 Work Native Plugin UI。IM / chat 接收继续使用 Connector / Listener Adapter，外部回复由 Actions 内部 dispatch worker 调用 Connector Host，不创建独立 Conversation Bridge 或 Action Dispatcher package。
8. **Projects、Local Host 与 App Shell**：拆分 Project Catalog、Runtime binding、Local Host composition、Workbench / Desktop 边界、workspace membership、migration，以及 Settings / Plugin Manager 管理面；保持 Onboarding、Capsule、TUI、i18n 和关键 UI 路径。
9. **开发者集成与分发**：迁移 CLI、MCP、`goal-advance` Skill、Plugin SDK / CLI、示例、安装 / 升级 / 卸载、Tauri bundle、vendored dependency provenance / SBOM 和开发文档，使干净环境可以完成首次真实调用与调试。
10. **迁移、安全与恢复保证**：对所有已迁移切片执行迁移前后对账、备份恢复、回滚演练、Plugin / Module 隔离、Secret 与私人 Session 内容验证、依赖故障和诊断检查；本 Work Item 产出最终切换实际消费的保证证据。
11. **最终 Cutover、清理与发布验收**：所有 caller 切换后移除 `MolisWorkCoordinator`、Web route / render Compatibility Facade、重复 Store / 类型和旧路径；运行完整回归、构建、视觉 / e2e、干净环境安装与文档链接检查，形成可发布候选。

每完成一个切片，`coordinator.ts`、`store.ts`、`server.ts` 和 `render.ts` 中属于该切片的职责必须真实删除或只保留薄转发；不能同时在新旧两处继续演进。

### 13.6 二级执行 Goal 与 Huge Class 退出责任（已确认）

上面的 11 项是一级结果工作流，不全部直接作为执行叶子。Goals Query、迁移 / 安全 / 恢复保证、最终 Cutover 暂时保持叶子；其余 8 项已经拆成 29 个已确认二级执行 Goal。GW4 实施对账后补充 GW5，已于 2026-09-02 正式接受，用于补齐未被 GW4 Contract 覆盖的 Goals Native Plugin UI 与文案迁移；2026-09-06 整项工程验收见 gw5-validation.md。二级 Goal 仍按垂直结果拆分，不把某个 Huge File 自身当作业务 Goal。

| 一级工作流 | 二级执行 Goal | 唯一主要交付 | 必须迁出的 Huge Class / 旧路径职责 |
| --- | --- | --- | --- |
| 架构与 Package 底座 | F1 架构与模块 SSOT | 可执行的架构、模块和状态矩阵 SSOT | 固定 `src/v1/types.ts`、各 Store、入口和发布面的事实 owner 与迁移基线，不移动业务实现 |
| 架构与 Package 底座 | F2 完整 Workspace Package 树 | 全部目标 package 的可构建 workspace | 建立 package、manifest、entrypoint、README 与 Contract 接线；不把原 Huge Class 整体搬入新包 |
| 架构与 Package 底座 | F3 Package 边界与 Contract 门禁 | 自动化 import / Contract conformance gate | 阻止 deep import、跨 Module Store、Plugin implementation 互相导入和 App 直写数据库 |
| Feed / Plugin 样板 | FD1 Source / Signal 接收链 | Raw Event 到 Signal 的可恢复链路 | 从 `src/feed/` 和 `src/feed/store.ts` 抽出 Sources、Signals、Connector Host、Listener Host 事实与技术状态 |
| Feed / Plugin 样板 | FD2 Feed / Attention 事实迁移 | Feed Item 与最小 Attention 的唯一事实实现 | 从 `src/feed/store.ts` 抽出 Feed / InboxEntry repository、状态变化和恢复语义 |
| Feed / Plugin 样板 | FD3 官方 Integration Plugin 样板 | Provider Adapter 通过 Plugin Runtime 产生 Signal Draft | 从 Feed Host 中移除 GitHub / IM 等 provider-specific 判断和安装注册逻辑 |
| Feed / Plugin 样板 | FD4 Feed Native Plugin 与入口切换 | 新 Feed UI 和所有现有 Feed caller 的可运行切换 | 从 `src/web/render.ts`、`src/web/server.ts` 和旧入口移出 Feed UI、route 与业务写入；旧路径只留薄转发后清零 |
| Goals Mutation / Planning | GW1 Goal Command 事实与 Repository | Goal Contract / Graph / Policy / Risk / Guidance 的唯一写入边界 | 从 `src/v1/coordinator.ts`、`src/v1/store.ts`、`src/v1/types.ts` 抽出 Goal 写入规则和正式事实 |
| Goals Mutation / Planning | GW2 Goal Lifecycle 与数据迁移 | Goal 生命周期、版本递增和旧数据迁移 | 从 Coordinator / Store 抽出 accept、revalidate、complete、trash / restore 与兼容迁移 |
| Goals Mutation / Planning | GW3 Planning Engine | 方法目录、图分析与 change impact 的独立实现 | 将 `src/planning/` 与 Coordinator 内的规划分析迁入 Goals 边界，不拥有 Proposal / Decision 事实 |
| Goals Mutation / Planning | GW4 Goals 写入口切换 | Web / CLI / MCP 写路径全部使用公开 Command API | 从 `src/web/server.ts`、`src/mcp/server.ts`、`src/cli/` 和 Coordinator Facade 删除 Goals 写入职责 |
| Goals Mutation / Planning | GW5 Goals Native Plugin UI 与文案迁移（正式接受；来源 Candidate `candidate-1dbbef41-f270-42d9-bb40-8c643c06687d`） | Goals 一级入口、详情、编辑、Planning、Risk/Policy UI 通过 Native Plugin contribution 运行 | 从 root renderer、全局 i18n 和 Web route composition 移出对应 Goals 产品职责；Workbench 只装配公开 contribution。整项工程验收见 gw5-validation.md |
| Artifacts / Context Ledger | AR1 Artifact Core | Artifact Contract、版本、内容引用与 Repository | 从 Coordinator、Store、Evidence 文件辅助和重复类型中抽出 Artifact 正式事实 |
| Artifacts / Context Ledger | AR2 Context Ledger | ObjectRef、ContextEdge 与可重建 Materialization | 从 Coordinator 的 relation / impact / provenance、Feed link、Session association 等路径抽出唯一 Ledger owner |
| Artifacts / Context Ledger | AR3 Artifacts Native Plugin 与旧结果迁移 | 可浏览、嵌入和交换的 Artifact 用户入口 | 从 `src/web/render.ts` / `server.ts` 移出结果展示与业务判断，并迁移现有输出 / 文件 / 内容引用 |
| Execution / Evidence / Governance | EX1 Execution Lifecycle | Claim / Run 的唯一事实和应用服务 | 从 `src/v1/coordinator.ts`、`store.ts`、`types.ts` 抽出 Claim、Run、lease、release 与恢复 |
| Execution / Evidence / Governance | EX2 Evidence & Verification | Evidence、Correction 与自动验证门禁 | 从 Coordinator、Store 和 `src/evidence/` 抽出证据事实、引用、验证与失败恢复 |
| Execution / Evidence / Governance | EX3 Governance & Collaboration | Review、Policy、Proposal、Decision 的唯一事实 | 从 Coordinator / Store 抽出 Review obligation、Goal Tree Proposal、Decision 与确认 provenance |
| Execution / Evidence / Governance | EX4 执行验收入口切换 | Web / CLI / MCP / Action Projection 使用新执行链 | 从 `src/web/server.ts`、`src/mcp/server.ts`、`src/web/render.ts` 和 Coordinator Facade 删除对应编排职责 |
| Work / Session / Runtime | WK1 Private Work Context | Session、私人内容、关联与恢复的唯一事实 | 从 `src/sessions/`、Project Catalog 的 Session 混合职责和相关 Store 抽出 Work Context |
| Work / Session / Runtime | WK2 Runtime Host 与 Adapter | Codex / PTY Runtime 的启动、恢复、中断和流式传输 | 从 `src/sessions/`、`src/web/server.ts` 和入口初始化抽出 Runtime Host；Adapter 不拥有 Run / Session / Goal 事实 |
| Work / Session / Runtime | WK3 Work Native Plugin 与 Handoff | Work UI、resume、handoff 和 caller 切换 | 从 `src/web/render.ts` / `server.ts` 移出 Session UI、终端和 handoff 业务判断 |
| Projects / Host / App Shell | AP1 Projects Module | Project 身份、Catalog、membership 与 board_id 迁移 | 从 `src/projects/catalog.ts`、Store 和入口抽出 Project 正式事实与 migration |
| Projects / Host / App Shell | AP2 Local Host Composition | 一个 Local Host、single writer 与类型化 Client Contract | 从 Web / CLI / MCP / Desktop 重复初始化中收回业务组合，不新建全局业务 Coordinator |
| Projects / Host / App Shell | AP3 Workbench / UI Host / Design System | 可组合的 Workbench Shell 与 Plugin UI Host | 将 `src/web/render.ts` 拆成 Shell、Design System、UI Host 和各 Native Plugin UI，不保留巨型 renderer |
| Projects / Host / App Shell | AP4 Desktop / Tauri Shell | Desktop Native Bridge、Onboarding、Capsule 与 i18n 兼容 | 从 `src/projects/catalog.ts`、`src/desktop/`、`desktop/src-tauri/` 和 Web Server 抽出平台桥接与生命周期 |
| 开发者集成与分发 | DV1 CLI / MCP Thin Adapter | CLI 与 MCP 只做协议、参数和展示适配 | 拆分 `src/mcp/server.ts` 与 `src/cli/`，删除复制的业务判断和 Store 访问 |
| 开发者集成与分发 | DV2 goal-advance Runtime 集成 | Skill 通过正式 Contract 完成 Molis Work 工作流 | 更新 `skills/goal-advance/`，移除对旧 Coordinator / 路由 / 内部结构的假设 |
| 开发者集成与分发 | DV3 Plugin SDK / CLI / Sample | 干净环境中的首个真实 Plugin 结果 | 建立 public SDK、Plugin CLI 与非 production workspace 的 `examples/plugin-sample`，不暴露内部实现 |
| 开发者集成与分发 | DV4 安装、供应链与发布文档 | 可复现的安装 / 升级 / 卸载和供应链发布物 | 迁移 `src/install/`、`scripts/`、Tauri bundle、`vendor/` provenance / SBOM 与开发文档 |

每个二级 Goal 的完成条件必须同时包含：新 owner 的 Contract / 实现 / 测试可独立验证；所有对应 caller 已切换；旧 Huge Class 中属于该结果的职责已删除或只剩有明确移除条件的薄 Facade。跨多个一级工作流的最终清零和发布判断仍由 Cutover Goal 统一验收。

## 14. 开发文档与 SSOT 矩阵

```text
PRODUCT.md                    产品宪法
docs/SSOT-MATRIX.md           权威归属索引
docs/system/                  横向架构、部署与端到端流程
docs/modules/                 每个语义模块一份 SSOT
docs/horizontal/              可复用运行服务及其 Capability Contract
docs/platform/                Microkernel、Plugin、Exchange、UI Host
docs/decisions/               已接受 ADR
specs/<task>/spec.md          一次实现工作的唯一需求书
contracts/                    可执行 Schema、类型与兼容测试
```

- Native Plugin README 只说明实现、运行与调试，不能复制 Module SSOT。
- 实现 Spec 不得重新定义产品或模块所有权。
- 历史文档在迁移矩阵确认前保留；迁移完成后显式标记 superseded，不静默删除。

### 14.1 重组期间必须同步维护的开发文档

- 根目录 `README.md`、`README.zh-CN.md` 和仍对外维护的英文 README：更新仓库入口、运行方式和新 package 导航，不承载详细架构规则。
- `docs/system/ARCHITECTURE.md`：说明完整分层、进程部署、Capability Router 和关键调用链。
- `docs/system/PACKAGE-BOUNDARIES.md`：列出每个顶层 package 的职责、允许依赖和禁止依赖。
- `docs/system/MIGRATION.md`：维护旧路径到新 package 的迁移状态、Compatibility Facade 与剩余 caller。
- `docs/modules/<module>.md`：记录该 Module 拥有的事实、公开 API、输入输出、事件、持久化和非目标。
- `docs/horizontal/<service>.md`：记录 Service Capability、技术状态、重试/恢复语义和明确不拥有的业务事实。
- `docs/platform/`：记录 Plugin Runtime、SDK、Exchange、UI Host、Storage 与安全边界。
- `docs/cli-and-development.md` 及仍维护的英文版本：同步 workspace 命令、测试方式、包生成方式和本地调试流程。

### 14.2 每个新 package 的就近说明

每个 `apps/`、`modules/`、`horizontal/`、`packages/` 和 `plugins/` 子 package 都需要简短 README，至少回答：

1. 它解决什么问题，以及明确不负责什么。
2. public entrypoint 和对外提供的 Capability / Contract。
3. 它消费哪些 Capability，允许和禁止依赖什么。
4. 它拥有哪类持久化；如果不拥有业务事实，要明确写出。
5. 如何运行、测试和调试。
6. 当前迁移状态、旧代码来源和 Compatibility Facade（若存在）。

Package README 解释“如何开发这个包”；Module / Horizontal / Platform SSOT 解释“系统为什么这样分”。同一事实只保留一个权威来源，其他文档使用链接，不复制粘贴。

### 14.3 文档一致性要求

- 每个代码迁移 Work Item 必须在同一个变更中更新对应 package README、迁移矩阵和受影响的 Module / Service 文档。
- API、依赖边界、开发命令或目录结构变化而文档未同步，视为该 Work Item 未完成。
- Contract checker、dependency boundary test 和文档链接检查应进入重组验证命令；具体工具在执行 Spec 中确定。
- 中英文文档若继续并行维护，先指定一个权威版本与同步规则，避免两套架构事实漂移。

## 15. 已确认但不阻塞本次分包的未来策略

以下决定可以作为后续设计约束记录，但本轮不展开字段、界面或实现：

- Team Project 默认向 Team 成员开放，并为未来 Restricted Project 保留能力。
- 用户共享时选择 Team Project；Personal 对象发布为新的 Team 对象或分支，不改变原 Owner。
- Plugin Manifest 声明权限上限，敏感权限按实际使用范围授权。
- 官方 Plugin 使用签名、兼容检查、受控更新与回滚；源码安装由用户自行维护。
- Team 可以推荐 Local Plugin，但不能远程安装或获得个人权限。
- Action dispatch、Materialization、Notification 与 Search 在没有多个真实消费者和独立技术状态前不创建 Horizontal Service package：分别先作为 Actions 内部 worker、Context Ledger 内部 handler、Notification Adapter 和各 Module Query / projection 实现。
- 只有它们同时出现跨 Module 复用、独立 queue / lease / retry / recovery 和可独立失败生命周期时，才通过 ADR 抽取新的 Horizontal Service。

Team / Project 角色、Restricted Project 细节、Retention、成员退出后的历史数据策略、管理后台和计费全部 deferred，不是包重组前置条件。

## 16. 被替代或撤回的早期假设

- `Space` 作为独立产品实体：由 `User / Team → Project` 取代。
- `Board` 作为未来产品实体：仅保留迁移兼容，最终并入 Project identity。
- Server 重新实现所有业务模块：由轻量 Goal / Artifact Exchange Server 取代。
- 任意 Plugin 自定义对象直接同步：由类型化 Artifact 交换取代。
- 所有 Native Plugin 均可替换：Goals 与 Artifacts 改为官方保护的一等 Plugin。
- 16 个领域模块都必须实现为 Plugin：改为 Module、Horizontal Service、Plugin 和 Adapter 四层；只有应用级组合与 Provider 差异需要 Plugin 化。
- 新增独立 Context Index：继续使用已确认的 Context Ledger & Materialization 模块。
- Artifact 平台统一规定不可变版本和 Canonical Head：改为生产 Plugin 自己维护版本，跨模块只认 `artifact_id + version`。

## 17. 本轮验收标准

在开始移动代码前，必须先满足：

1. 目标 package 列表、每个 package 的职责和禁止依赖被确认。
2. 16 个模块分别有唯一事实所有者，不因部署位置或 UI 再产生第二套状态。
3. 当前 `src/` 每个主要目录和 Huge Class / Huge File 都有职责级拆分目标，而不只是目标目录。
4. Local / Server / Remote Plugin 的 Contract 与部署边界可以从包图中表达。
5. Goals、Artifacts、Context Ledger 与 Sync 的调用方向无循环。
6. 文档矩阵能区分产品事实、模块事实、平台机制、ADR 与实现 Spec。
7. 功能策略与包重组前置决策明确分离。
8. Huge Class 迁移规范包含行为基线、Compatibility Facade、caller 迁移、回归验证和移除条件。
9. 新 package 的开发文档模板、全局文档归属和同步门槛已经明确。
10. 包边界可以由 import boundary test 或等价自动化检查验证，避免重组后重新长成跨模块大类。
11. 迁移顺序以完整垂直切片为单位，并为每个切片包含 Contract、实现、入口、UI、兼容测试和开发文档。

## 18. 逐包 Contract 定义方法（已完成）

顶层包地图、物理 package 创建策略、Contract 分发方式、Native Plugin 集合、App 组合和 Huge Class 迁移方式已经形成基线。下文已经按依赖顺序为每个 package 定义：

1. 负责与不负责的内容。
2. 对外提供和消费的 Query、Command、Event 或 Service Capability。
3. 唯一事实 owner、技术状态与持久化边界。
4. 允许依赖、禁止依赖和部署位置。
5. 当前代码来源、Huge Class 抽取点和验收测试。

定义顺序为：Foundation Packages → Modules → Horizontal Services → Native / Integration Plugins → Apps / Adapter 放置 / Tooling。逐包 Contract 已确认；F1 将其整理为权威文档和迁移矩阵，F2 创建完整 package 底座，后续二级 Goal 逐条迁移真实用例。

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

**AP3 当前实现事实：** `apps/workbench` 已接管稳定文档 Shell、三个命名 Slot 和分层 browser assets；`packages/ui-host` 已接管 contribution/surface/Slot mount 校验；`packages/design-system` 已接管主题偏好、browser bootstrap 和分层视觉样式。旧 `src/web/visual-foundation.ts` 与 `src/web/i18n.ts` 分别缩成 15 行和 140 行兼容边界，`src/web/render.ts` 从 14,028 行降至 6,239 行。AP3 验收时剩余 renderer 是 GW5/AR3/EX4/WK3/AP4 的产品页面兼容实现，不属于 AP3 可吸收的 Shell/UI 平台职责；后续 Goal 仍须按各自 Contract 迁移，不能以改名或横向搬运伪装完成。完整对账与回归证据见 [`ap3-validation.md`](./ap3-validation.md)。

**AP4 当前实现事实：** `apps/desktop` 已接管原生 Shell 检测、Runtime launch、Goal advance prompt、Desktop Panel lifecycle 和 Capsule presentation；Panel 只依赖 Repository/Project-context ports，不导入 SQLite 或 Projects implementation。生产 caller 已使用公开 Desktop entrypoint，旧 `src/desktop/`、`src/web/desktop-shell.ts` 和 Catalog Panel 方法只转发。`src/projects/catalog.ts` 从 2,392 行降至 2,104 行，`src/web/capsule.ts` 从 1,044 行降至 496 行；原 1,473 行 Tauri `main.rs` 已删除并按窗口/Capsule、PTY、本地 Web service、Runtime environment 拆分到 `apps/desktop/adapters/tauri/src/`。当前基线真实存在的是内置 Runtime 升级/修复、Tauri permission、菜单栏/Capsule、Onboarding/i18n 兼容和恢复；系统通知按钮原本禁用，Desktop Keychain/系统通知/App 自动更新器不在基线中，AP4 不注册假能力。完整边界与回归证据见 [`ap4-validation.md`](./ap4-validation.md)。

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
- AP1 验收记录见 [`ap1-validation.md`](./ap1-validation.md)；验收后 `MolisWorkProjectCatalog` 不再拥有 Project 正式事实，但 Runtime、Panel 与文件 staging 仍按 WK1、AP4、AP2 的边界暂留。

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

**EX1 当前实现事实：** `modules/execution` 已接管 Claim/Run public types、SQLite schema、migration 2/6/7 与 migration 30 的 Execution backfill、Repository、lease 状态机、Run 状态机和过期恢复。旧 `src/v1/coordinator.ts` 已清除 Claim/Run SQL，仅保留 Goal action eligibility、Contract revision、幂等和跨 owner reconciliation；旧 Store snapshot 与 Project 删除保护改走公开 Execution Repository。Web/CLI/MCP 仍通过 Coordinator compatibility application entry，最终入口和 action projection 切换归 EX4。验证与剩余边界见 [`ex1-validation.md`](./ex1-validation.md)。

**EX2 当前实现事实：** `modules/evidence-verification` 已接管 Evidence/Correction public types、SQLite schema、migrations 17–20 与 migration 30 Evidence columns、Repository、项目文件/Markdown locator 预检、不可变 Correction 状态机、返工 freshness 和 criterion coverage。旧 `src/v1/coordinator.ts` 已清除 Evidence SQL，只保留 Goal/Run 授权、Contract revision、action token、幂等和跨 owner reconciliation；Store snapshot、Action Projection 的纯 coverage 规则和 Web 项目引用均改走公开入口，旧 `src/evidence/locator.ts` 已删除。Review/Proposal/Decision 仍归 EX3，最终 Web/CLI/MCP application facade 切换归 EX4。验证与剩余边界见 [`ex2-validation.md`](./ex2-validation.md)。

**EX3 当前实现事实：** `modules/governance-collaboration` 已接管 Review obligation、Review、Contract Proposal、Candidate、Rewire、Goal Tree Proposal/Item/Decision 的 public types、SQLite schema、migrations 3/9/10/14/27/28、Repository、Review lifecycle、正式状态机和原子物化边界。`src/v1/store.ts` 不再保存 Governance schema/migration/mapping/snapshot SQL，`src/v1/coordinator.ts` 不再保存 Governance 表 SQL 或直接访问其 Repository，所有正式写入均经过 `GovernanceApplicationApi`；Planning 继续只做分析，确认后的 Goal/Relation 仍由 Goals owner 写入。Web/CLI/MCP/Action Projection 的执行验收入口归 EX4；Draft Dialogue/Goal Tree 决定的入口收口保持独立。验证与剩余边界见 [`ex3-validation.md`](./ex3-validation.md)。

**EX4 当前实现事实：** `plugins/native/goals` 已接管 `ExecutionValidationApplicationApi`、Goal work/action projection、Contract revision 与 Human Review attention token 规则；旧 `src/v1/action-projection.ts`、`contract-revisions.ts`、`human-review.ts`、`parent-completion.ts` 已删除。Web、CLI、MCP 各自通过 App adapter 使用同一执行验收端口，Coordinator 不再暴露 Claim、Run、Evidence、Correction、Review 或 action/work projection 的公开方法。Workbench 的 Claim/Run/Evidence/Review renderer 也已从 `src/web/render.ts` 移入独立 UI contribution。EX4 的 accepted Contract 是 Claim → Run → Evidence → Review/Decision 执行验收链；Draft Dialogue 与 Goal Tree Proposal/Decision 的入口收口不冒充本切片成果，仍需后续 Goal 处理。验证与剩余边界见 [`ex4-validation.md`](./ex4-validation.md)。

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

## 21. Horizontal Service Contract

Horizontal Service 是可重建运行机制。它可以保存 queue、cursor、lease、retry、connection health 等技术状态，但不能拥有 Module 正式事实或替 Module 做业务决定。

### 21.1 `horizontal/connector-host`（已确认）

**大白话：** “统一管理怎样连接和调用一个外部系统”。

**提供：**

- Provider Driver 注册、版本/能力发现、connection instance 创建、健康检查和关闭。
- 授权 handshake / refresh 的安全编排、rate-limit / provider error 归一与 Connection Receipt。
- read、send、write-back 等由 Driver Contract 明确定义的类型化 operation invocation。
- Connection Context、deadline、cancel、trace 和已获 grant 的 Secret / Network Adapter handle。

**技术状态：**

- 活跃 connection session、provider health、rate-limit window、refresh attempt、operation attempt 和短期 connection cache。
- Secret bytes 由 Keychain / Secret Adapter 持有；Connector Host 只使用不可导出的 credential reference。

**边界：**

- Sources Module 保存用户配置的 Source、期望启停和 connection reference；Connector Host 不创建或修改 Source。
- Listener Host 使用 Connector Driver 维持长期接收；Actions 内部 dispatch worker 使用 Connector Driver 执行 External Action。
- Integration Plugin 实现 GitHub、Gmail、Slack、IM 等 Driver；Host 不硬编码 Provider 业务字段。
- 不保存 Signal、Feed Item、Action、Goal、Artifact 或 Provider 自定义业务 Payload。
- 不提供一个可绕过 typed Driver Contract 的通用 HTTP escape hatch。

**当前抽取与验收：**

- `src/feed/connectors/` 的通用连接、授权、错误、rate limit 与调用生命周期是主要来源；GitHub / Gmail 细节进入 Integration Plugin / Adapter。
- 测试覆盖 credential 不泄露、refresh 并发、rate limit、provider unavailable、grant 撤销、cancel、Driver crash 和连接恢复。

### 21.2 `horizontal/listener-host`（已确认）

**大白话：** “让一次外部连接长期运行，并且重启、断线后不漏也不重”。

**提供：**

- Poll、stream、webhook subscription 等 Listener Driver 的统一 lifecycle。
- Cursor / checkpoint、lease、heartbeat、retry / backoff、断线重连、catch-up 和重复投递抑制。
- 根据 Source desired state 启动、暂停、恢复和停止 listener，并返回运行 Receipt / health。
- 持久暂存带 provider identity、cursor 和 provenance 的 Raw Event，调用 Integration Plugin 注册的 Listener / Signal Adapter 转换为 Signal Draft。
- 通过 Signals Command 可靠提交 Draft；只有收到接受或明确隔离 Receipt 后才按 Contract 推进 cursor。

**技术状态：**

- Listener instance、cursor、checkpoint、lease、retry schedule、durable raw delivery / quarantine、last delivery、health 和 crash recovery state。
- 这些状态可从 Source 配置和 Provider checkpoint 重建，不成为 Source 或 Signal 业务事实。

**边界：**

- Sources Module 决定“监听哪里、是否启用和期望频率”；Listener Host 只执行该意图。
- Connector Host 建立 Provider connection；Listener 不处理 credential、Provider OAuth 或 External Action。
- Integration Plugin 的 Adapter 只做 Provider protocol / field 到 Signal Draft 的技术翻译，不能决定 Feed、Attention、Goal 或 Automation 行为。
- Signals Module 执行正式 Schema、scope 和 dedupe 校验并创建 Signal；Listener 不直接写 Signal Store。
- Schedule wakeup 可以由 Horizontal Scheduler 触发，但 missed slot / retry 机制仍由 Listener 的运行 Contract 管理。

**当前抽取与验收：**

- `src/feed/sources/scheduler.ts`、Source cursor / run、Connector polling 和 Web server timer 是主要来源；用户配置的 schedule intent 留在 Sources Module。
- 测试覆盖重启恢复、相同 cursor 重投、乱序、lease 竞争、错过多个 schedule slot、backoff、暂停竞态、Adapter 解析失败隔离、升级后重放和 Signals Receipt 前不推进 cursor。

### 21.3 `horizontal/scheduler`（已确认）

**大白话：** “到指定时间，可靠地叫醒一个已注册 Capability”。Scheduler 不理解为什么要触发，也不拥有重复规则。

**提供：**

- `scheduleWakeup`、`cancelWakeup`、`rescheduleWakeup` 和 due wakeup delivery。
- Durable one-shot wakeup、lease、并发 claim、进程重启恢复、missed wakeup catch-up 和 delivery Receipt。
- Deterministic Clock port、批量扫描、backpressure、技术 retry / backoff 和诊断。
- 根据 `owner_capability + object_ref + wakeup_key` 做幂等注册和投递。

**技术状态：**

- `wakeup_id`、owner capability、opaque object reference、`due_at`、wakeup key、attempt、lease、last delivery 与 terminal technical status。
- payload 只能是受限引用和 Contract version，不保存 Source config、Automation condition、Action parameters 或 Attention 内容。

**Owner 分工：**

- Sources Module 保存 interval / desired schedule 并计算下一次 `due_at`；Scheduler 到点调用 Listener Host，Sources 根据 Receipt 决定并注册下一次。
- Automation Module 保存 time trigger / rule，Scheduler 只唤醒 Automation evaluation。
- Actions / Attention 未来可以注册业务已决定的 retry / snooze 时间；Scheduler 不替它们判断是否仍应执行。
- 技术 delivery failure 可以按统一策略重试；业务失败是否再次执行由 owner 收到 Receipt 后决定。

**边界：**

- 不保存 cron / interval 业务定义，不解析 Module 对象，不直接创建 Signal、Action、Attention 或 Automation Run。
- 不替代 Listener 的 cursor / poll recovery、Actions 的 external idempotency 或 Runtime Host 的 process timeout。
- 所有 delivery 通过 Kernel Capability Router，不能持有 owner implementation callback 或 Store handle。

**当前抽取与验收：**

- `src/feed/sources/scheduler.ts` 的 durable planned slot / overlap / catch-up、Web server timer 和相关测试是主要来源；Source interval 计算迁回 Sources Module。
- 测试覆盖同 key 重复注册、取消竞态、多个 Scheduler instance lease、休眠后 catch-up、Clock jump、owner unavailable、技术 retry 和 owner 业务失败不自动循环。

### 21.4 `horizontal/runtime-host`（已确认）

**大白话：** “统一启动、恢复、停止和观察真正执行工作的 Runtime”。它执行技术调用，但不拥有 Execution Run 或 Work Session 的正式状态。

**提供：**

- Runtime Provider 注册、capability discovery、版本/兼容检查和 provider selection descriptor。
- start、resume、send input、stream output、interrupt、cancel、stop 与 health probe。
- invocation handle、deadline、timeout、resource lease、stream cursor、backpressure、crash detection / recovery 和技术 Receipt。
- Local Process、Terminal / PTY、Codex app-server、Remote Agent 等 Runtime Adapter port。

**技术状态：**

- 活跃 runtime connection / process handle、invocation handle、stream cursor、resource lease、provider health 和 crash recovery state。
- 可重建的 output buffer / transport state；长期 conversation / terminal content reference 由 Private Work Context 保存。

**调用方分工：**

- Execution 创建正式 Run 后调用 Runtime Host，收到 invocation / outcome Receipt 后再更新 Run。
- Private Work Context 创建或恢复 Session 时调用 Runtime Host，收到 resume / content Receipt 后更新 Session。
- App 可以请求显示 stream，但不能绕过 owner Module 直接把 Runtime outcome 写成 Goal completion 或 Artifact。

**边界：**

- 不拥有 Claim、Run、attempt、Goal status、Session registry、Workspace、conversation lineage 或 Artifact。
- 不实现具体 Codex、Terminal、container 或 remote protocol；这些属于 Adapter / Runtime Provider Plugin。
- 不替代 Kernel 的通用 Capability 路由；Runtime Host 只定义 Runtime execution contract 和技术 lifecycle。
- Provider Binding 由 Kernel / Host composition 决定，Runtime Host 只验证所选 Provider 能力并执行。

**当前抽取与验收：**

- `src/sessions/adapters.ts`、Codex transport、PTY client / server、Web runtime resources 和 Desktop native bridge 是主要来源。
- 测试覆盖 provider unavailable、resume unsupported、stream 断开恢复、timeout、interrupt vs cancel、process crash、重复 Receipt、resource cleanup 和切换 Adapter 后 Contract 一致。
- 验收时 Runtime Host 可以用 fake provider 独立测试，不导入 Execution Store、Session Registry implementation、Web Server 或 Tauri implementation。

**WK2 执行合同（2026-09-02）：**

2026-09-05 恢复验证发现两项可复现的 Runtime 生命周期缺陷：并发首次请求可抢在 initialize 完成前发送；initialize 超时后进程未清理且重试复用未初始化连接。WK2 的启动、恢复与资源清理验收包含修复这两项；保留已完成请求和业务状态，不自动重放写请求。

- 完成等级：功能可用的无损迁移；本 Goal 完成自动化 Contract、边界、定向与全量回归，统一人工端到端验证按第 24 节在全部架构开发完成后执行。
- `@molis-ai/molis-work-contracts/services/runtime-host` 是 Runtime capability、Provider Adapter、transport result/error 的唯一类型入口；`horizontal/runtime-host` 只通过公开入口对调用者开放。
- `horizontal/runtime-host` 接收现有 Runtime router、Codex app-server transport/Adapter 与 Terminal/PT​Y process host；不导入 Execution Store、Private Work Context Registry、Web Server 或业务写入实现。
- 未知 Runtime 的 Session registry fallback 仍属于 Private Work Context 兼容编排，不能被 Runtime Host 吸收；WebSocket 鉴权和 Session 内容记录仍属于 Web/Work Plugin 调用层。
- 旧 `src/sessions/adapters.ts`、`src/sessions/codex-transport.ts` 与 `src/web/pty-host.ts` 只保留薄兼容出口；生产 Web composition、PTY socket 和 Session 内容服务改用新包公开 API。
- 验收：fake Provider 的注册、能力矩阵、调用与 unsupported；Codex 请求/事件/失败恢复；PTY spawn/attach/write/resize/kill/crash/resource cleanup；无 owner 深层导入、无跨 owner Store、旧实现入口不再保留 provider/process 细节。

## 22. Plugin 与 Adapter Contract

### 22.1 Integration Plugin 内聚 Provider Adapter（已确认）

Provider-specific protocol、字段转换、授权流程、配置 UI 与 Capability 组合跟随同一个 Integration Plugin，由统一的 Plugin ID、Version 和发布者签名管理。

```text
plugins/official-integrations/<provider>/
├── manifest
├── local-entry
├── server-entry              optional
├── settings-ui
├── connector-adapter
├── listener-adapter
└── signal-adapter
```

**Integration Plugin 负责：**

- 声明 Provider capability、所需 grant、Local / Server entrypoint、UI Contribution 和 Contract version。
- 实现 Connector Driver、Listener / Signal Adapter，以及 External Action 需要的 typed operation driver。
- 将 Provider payload 翻译成公开 Contract，或将获准的 External Action 翻译成 Provider 调用。
- Provider-specific configuration、错误提示、兼容迁移和必要的 Artifact producer / consumer。

**平台级 Adapter 负责：**

- SQLite、Filesystem、Keychain、Blob Store、Tauri、Terminal / PTY、HTTP / WebSocket、Codex app-server 等平台技术 port。
- 它们不携带 GitHub、Gmail、Slack、IM 等产品身份，不提供一级 UI，也不单独形成可安装生态条目。
- Adapter 是实现角色，不默认形成顶层目录或独立 package；实现跟随它服务的 Storage、Horizontal Host 或 App 放置。

**边界：**

- Host 通过 Connector / Listener / Runtime / Plugin Contract 调用 Adapter，不导入 Provider implementation。
- Provider Adapter 不能直接写 Sources、Signals、Feed、Actions、Goals 或 Artifacts Store；正式写入经过对应 Module API。
- Listener / Signal Adapter 只做协议与字段翻译，不能决定是否进入 Feed、Attention、Goal 或 Automation。
- Plugin signature 变化即为新 Plugin；它携带的 Adapter 不继承旧 Plugin 的 grant、Store 或 Provider Binding。
- 多个 Plugin 真实复用同一 Driver 且出现独立版本压力时，可以抽成内部 Driver Library；没有证据前不创建额外 package。

**当前迁移与验收：**

- `src/feed/connectors/github.ts`、`gmail.ts`、Source intelligence adapter 与 Relay Provider integration 是迁移来源。
- 第一批官方 Integration Plugin 迁移时必须证明 Host 不再包含 Provider 条件分支，Plugin 卸载后相关 Driver / UI / binding 一起停止，但历史 Signal / Artifact reference 仍可安全显示。
- Contract test 使用同一 Host Harness 验证 GitHub / Gmail 等不同 Adapter 的连接、监听、Signal Draft、权限拒绝、错误归一和 External Action Receipt。

### 22.2 Native Plugin 与 Module 分离（已确认）

Native Plugin 是用户看到和操作的一级产品能力，Module 是该能力依赖的事实账本与业务规则。两者可以同名，但必须保持独立 package：Native Plugin 组合 Module API，不吸收 Module implementation。

```text
plugins/native/<capability>/
├── manifest
├── application-entry
├── ui/
├── composition/
├── embeds/
├── tests/
└── README.md
```

**Native Plugin 负责：**

- 一级导航、页面、Command、Inspector、开放 Slot 和嵌入视图等 UI Contribution。
- 把用户操作转换为强类型 Module Command，并通过 Capability Router 调用 Module API。
- 组合多个 Module Query 形成页面级 read model，例如 Goals 页面组合 Goal、Execution、Evidence、Governance 与 Attention 信息。
- 页面临时状态、交互流程、错误展示与加载恢复；这些状态不自动成为正式业务事实。

**Native Plugin 不负责：**

- 不拥有 Goal、Artifact、Feed Item、Action、Session、Run 等正式对象，也不复制对应 Store 或状态机。
- 不直接访问 Module Store、跨 Module SQL、其他 Plugin 私有 Store 或 Provider implementation。
- 不把页面需要的组合字段反写成新的中央事实；只有确有独立业务语义时，才由对应 Module Contract 接收写入。
- 不实现 Workbench Shell、Plugin 生命周期、权限、隔离或 Provider Binding；这些属于 Platform。

**运行与依赖：**

- Native Plugin Manifest 声明所需 Module / Horizontal Service Capability；Local Host 组合并提供正式 implementation，Workbench 通过 UI Host 装载 Native Plugin UI。
- Server 不为 Native Plugin 复制完整页面或本地业务实现；只有明确声明的 Server entrypoint 才在 Team Plugin Host 运行。
- `Goals` 与 `Artifacts` 使用官方保护的 Plugin ID 与签名，但其 UI / 应用组合层仍不能绕过各自 Module API。
- 一级产品能力是 Native Plugin，不等于每个细粒度 Module 都需要一个一级入口；Sources、Signals、Evidence、Governance 等继续作为被组合的 Module。

**创建与迁移：**

- 六个 Native Plugin package 全部按统一 package 标准建立；尚无真实 UI / application implementation 的 package 标记为 `contract-only`，不向 UI Host 注册不可用入口。
- 第一份样板是 `plugins/native/feed`：迁入 Feed 页面与应用组合，同时保留 Sources、Signals、Feed、Attention 的独立 Module 边界。
- 后续按 Goals Query、Goals Write、Execution / Evidence / Governance、Work、Projects / Shell 的切片顺序迁移；每次同时更新 package README、架构文档与 Contract test。
- 验收时 Native Plugin 可以在 fake Module Capability 下独立渲染和驱动用户意图；Module 也可以在没有 Workbench UI 的情况下独立验证业务规则。

### 22.3 Plugin 依赖 Contract，不依赖 Plugin（已确认）

Plugin 之间不建立直接 implementation 或安装依赖。可保存、同步和重放的内容通过 Goal / Artifact Contract 交换；即时查询或操作通过官方 Module / Horizontal Capability 完成。

```text
ArtifactRef
├── artifact_id
└── artifact_version

ArtifactTypeRef
├── artifact_type_id
└── schema_version

ProducerProvenance
├── producer_plugin_id
└── producer_plugin_version
```

- `artifact_id + artifact_version` 指向一份具体结果及其版本。
- `artifact_type_id + schema_version` 决定消费方是否理解该 Payload；Type ID 使用全局唯一命名空间，例如 `io.molis.work.report.document`。
- `producer_plugin_id + producer_plugin_version` 只记录来源和审计信息，不自动形成安装依赖或消费限制。
- Artifact Type Contract 与生产者身份分离；任何 Plugin 都可以声明生产该类型，只要本地 Host 能按对应 Schema 验证其输出。
- Plugin Manifest 声明 `produces`、`consumes` 的 Artifact Type Contract，以及需要的 Module / Horizontal Capability；不提供任意 `depends_on_plugin_id`。
- 接收端没有兼容 consumer 时，Artifact 仍可被 Exchange 存储、同步和保留；安装兼容 Plugin 后再解释和消费。
- Server 只识别 Envelope 路由字段和 opaque Payload，不需要安装 consumer 或执行自定义业务 Schema。
- 某个 consumer 可以基于来源实现自己的业务接受规则，但这属于消费逻辑，不改变平台的 Contract 路由模型。

**不使用 Artifact 的场景：**

- 查询或更新当前 Goal 使用 Goals Module API，不用临时 Artifact 模拟 RPC。
- 发起外部操作使用 Actions / Connector Capability，操作结果需要长期交换时再发布 Artifact。
- UI 嵌入使用 UI Contribution Contract，不把页面描述伪装成业务 Artifact。
- Provider listener 先产生 Signal Draft；只有形成需要长期保存或共享的业务结果后才发布 Artifact。

## 23. Apps、Adapters 与 Tooling Contract

### 23.1 Tooling 保持精简（已确认）

`tooling/` 不是把所有开发辅助能力再次包装一遍的容器。第一阶段只保留一个可复用开发工具和一个迁移脚本目录：

```text
tooling/
├── plugin-cli/
└── migrations/
```

- `plugin-cli` 是正式工具 package，负责 Plugin 创建、Manifest / Contract 校验、开发调试、打包和签名流程；具体签名密钥仍由安全 Adapter / 发布环境管理。
- `migrations` 保存本次架构重组与数据迁移的一次性脚本，默认不是 workspace package，也不承诺稳定公共 API。
- Contract 校验规则归 `packages/contracts` 所有，由其测试或 CLI 入口执行，不建立重复的 `contract-checker` package。
- 通用测试 Harness 归 `packages/test-kit`，领域 fixture 和业务断言继续留在对应 Module / Plugin。
- Release 属于仓库脚本与 CI workflow，不为了目录对称建立 `release` package。
- 只有某项工具形成独立使用者、版本、发布物和生命周期后，才从现有 owner 中拆为新 package。

### 23.2 一个 Local Host，多个本地入口（已确认）

`apps/local-host` 是本地业务能力的唯一 composition root；Desktop、Workbench、CLI 与 MCP 是不同交互入口，不各自启动和维护一套 Module、Service、Plugin Runtime 或 Storage 组合。

```text
apps/local-host
├── Modules
├── Horizontal Services
├── Plugin Runtime
├── Storage / Exchange
└── Platform Adapters

apps/desktop   ─┐
apps/workbench ─┼─→ Local Host Capability API
apps/cli       ─┤
apps/mcp       ─┘
```

**边界：**

- Local Host 负责依赖装配、Module / Service lifecycle、Provider Binding、本地 Plugin entrypoint、Storage 与 Exchange 接入。
- Workbench 负责产品 UI 和 UI Contribution 装载，不初始化业务 Store，也不直接导入 Module implementation。
- Desktop 负责窗口、进程生命周期、安装更新、系统权限和 Native Bridge，不复制业务规则。
- CLI 与 MCP 把各自输入翻译成相同的强类型 Capability 调用；命令名或 Tool schema 可以不同，业务判断不能不同。
- Server 是另一套独立 composition root，只装配 Exchange、Team 控制面与 Team Plugin Host，不复用 Local Host 来运行完整本地业务系统。

**部署自由度：**

- package 边界不要求第一阶段立即采用独立 daemon；Local Host 可以先与 Desktop 同进程、由 Desktop 启动为子进程，或在测试中以内存方式启动。
- 入口与 Host 之间只依赖稳定 Client Contract；未来改变进程边界时，调用者不需要重写业务逻辑。
- 只有一个入口负责启动目标 Local Host 实例，其他入口通过发现和连接机制复用它，避免同一 User / Project 出现多个无协调 writer。

**迁移与验收：**

- 先把 `src/cli/`、`src/mcp/`、`src/web/` 中重复的业务初始化识别并迁回 Local Host composition；入口保留解析、展示和协议适配。
- 使用同一 Host test fixture 分别驱动 CLI、MCP 与 Workbench Client，验证相同 Command 产生相同事实变化和错误结果。
- 进程通信、Host discovery 与 single-writer 细节延后到对应迁移 Work Item 决定，不阻塞当前包重组。

**AP2 当前实现事实：** `packages/contracts/platform/app-host`、`packages/kernel` 与 `apps/local-host` 已提供 typed Client、Capability registry 和按 Project storage key 复用的 embedded Runtime。旧 `Store + Coordinator` 构造只保留在 `src/local-host/composition.ts` 的迁移 adapter；Web、CLI、MCP 不再自行构造，Web Feed scheduler 也复用同一 Store。多入口、幂等、身份冲突、单次打开、统一关闭和重启恢复由 `tests/local-host.test.ts` 固定。独立 daemon、IPC 与跨进程自动发现仍是部署演进，不在 AP2 冒充完成。完整 caller 清单、边界审计和 500/500 全量回归见 [`ap2-validation.md`](./ap2-validation.md)。

### 23.3 Adapter 就近放置，不设顶层包（已确认）

Adapter 是把稳定 Port 翻译成具体技术调用的代码角色，不是业务能力、可安装 Plugin 或必须独立发布的 package。目标 Monorepo 取消顶层 `adapters/`；实现默认跟随它服务的 owner 放置。

```text
packages/storage/adapters/
└── sqlite-filesystem

horizontal/runtime-host/adapters/
├── terminal-pty
└── codex-app-server

apps/desktop/adapters/
└── tauri

plugins/official-integrations/<provider>/
└── provider adapters
```

- Module / Host 依赖抽象 Port，不直接散落 `better-sqlite3`、`node-pty`、Tauri command 或 Codex protocol 调用。
- Storage Adapter 负责 SQLite、Filesystem 和本地 Blob 等技术实现，不拥有 Module Schema 的业务含义。
- Runtime Adapter 负责启动、恢复、中断、流式传输和资源清理，不拥有 Run、Session 或 Goal 状态。
- Desktop Adapter 负责 Keychain、Notification、Updater 和系统桥接，不拥有权限策略或业务行为。
- HTTP / WebSocket 等传输先留在实际消费者内部；多个真实 owner 形成共同版本和替换压力后才抽取。
- Provider-specific Adapter 仍跟随 Integration Plugin，不移入平台实现。
- Adapter 只有形成独立发布物、依赖生命周期或多个真实消费者时才升格为 package。

### 23.4 示例 Plugin 不进入生产包树（已确认）

- `plugins/` 只包含官方 Native Plugin 与官方 Integration Plugin，不保留没有真实实现来源的 `plugins/examples` package。
- `plugin-sdk/testing` 可以携带最小合规测试 fixture，但它不是安装生态条目。
- 面向开发者的完整样例在 SDK 真正实现时再创建为 `examples/plugin-sample`，默认不加入生产 workspace 和发布链。
- 第三方开源 Plugin 保持在各自源码仓库，由用户自行构建和安装；Molis Work 主仓库不为了展示生态而复制维护。

## 24. 整体开发完成后的统一验证与清理顺序（2026-09-02 已确认）

本次工作的目标是完成整套架构与包重组，不在每个子 Goal 后重复一轮完整的人工端到端测试。执行顺序固定为：

1. 先按 Goal Tree 的依赖顺序完成全部代码迁移。每个子 Goal 仍需通过自己的 Contract、边界门禁、定向测试、兼容测试和全量自动回归，失败时不得带病进入下一项。
2. 全部开发完成后，以真实用户行为统一执行前端与后端端到端验证。不能只检查源码、类型或单元测试。
3. 根据端到端发现的问题做代码清理、职责归位和缺陷修正，再完整复验受影响链路。
4. 最后对照本 Spec 的初始要求做总审计：代码 owner 与依赖边界、调用链、分包、Huge Class 退出、开发规范、数据与权限逻辑、Plugin/Module/Horizontal/App 分工、Local/Team/Server 边界和文档是否一致。

统一端到端验证至少覆盖：

- 从 Workbench / Desktop 的真实页面完成 Project、Goal、Feed、Run、Evidence、Decision、Session、Settings 与 Plugin 相关的现有主路径和恢复路径。
- 用 CLI 与 MCP 驱动与 UI 相同的业务动作，并核对它们落到同一个 Local Host 和同一份正式事实，而不是不同入口各有一套行为。
- 对关键操作同时核对前端可见结果、后端 Query/数据库事实、事件或 Receipt、重启后的恢复结果和错误/权限反馈。
- 覆盖空态、失败、取消/重试、重复提交、跨 Project 隔离、历史数据迁移、安装/升级/卸载与本地服务恢复。
- 对已经迁入 Native Plugin 的 UI 检查 Contribution、嵌入、导航、响应式和未安装/缺失 consumer 等状态；不把假页面或静态 HTML 当作功能完成。

最终验收报告必须把每条初始架构要求标记为“通过 / 未通过 / 不适用”，附真实命令、用户操作、后端事实和问题修复记录。自动化回归是进入统一端到端阶段的门槛，不替代端到端验收。
