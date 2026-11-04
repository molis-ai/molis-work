# Molis Work 架构与包重组需求书

状态：现行规范（2026-10-01 合入后梳理确认；2026-10-07 补注）。包分层与依赖规则仍是 ARCHITECTURE 与 SSOT 的基线；[§20.12 `modules/execution`](contracts-modules.md#2012-modulesexecution已确认)、[§20.14 `modules/evidence-verification`](contracts-modules.md#2014-modulesevidence-verification已确认)、迁移链、V3 导入与 Coordinator 兼容这些条目所描述的代码已于 2026-10-04/05 删除（V3 导入 #244、Goals 覆盖账本 #252、项目库迁移链改为单一基线 #260、根包 SDK 与 Coordinator 兼容 #262、execution 与 evidence-verification 两个模块 #268），正文条目留作历史记录，以 SSOT 为准。Outbox 留后续（[BL-070](../BACKLOG.md)）。

阅读说明（2026-11-03 整理）：本文件保留重组的目标、边界、验收与整体复验顺序；§19–23 的逐包合同已分册，保留原编号。正文“当前证据”、目标包地图和接口示例按各节原日期理解；当前包是否存在、属于哪层、达到什么成熟度，查[SSOT](../../docs/SSOT-MATRIX.md)与[现行架构](../../docs/system/ARCHITECTURE.md)，不从历史设计表推断。

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

详细合同按原编号保存在[基础包合同](contracts-foundation.md)。这些是重组时的设计基线；当前包与 API 以 SSOT、公开合同和实现为准。

## 20. Module Contract

详细合同按原编号保存在[模块合同](contracts-modules.md)。这些是重组时的设计基线；当前包与 API 以 SSOT、公开合同和实现为准。

## 21. Horizontal Service Contract

详细合同按原编号保存在[横向服务合同](contracts-services.md)。这些是重组时的设计基线；当前包与 API 以 SSOT、公开合同和实现为准。

## 22. Plugin 与 Adapter Contract

详细合同按原编号保存在[插件与适配器合同](contracts-plugins.md)。这些是重组时的设计基线；当前包与 API 以 SSOT、公开合同和实现为准。

## 23. Apps、Adapters 与 Tooling Contract

详细合同按原编号保存在[应用、入口与工具合同](contracts-apps.md)。这些是重组时的设计基线；当前包与 API 以 SSOT、公开合同和实现为准。

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
