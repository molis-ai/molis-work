# Molis Work 系统架构

状态：已确认（F1）  
详细 Contract：[`specs/molis-work-architecture-reorganization/spec.md`](../../specs/molis-work-architecture-reorganization/spec.md)

## 1. 一句话结构

用户在本地产品里工作；Module 与插件各自保存自己拥有的事实（每项事实一个主人），Horizontal Service 执行可复用的技术工作，平台产品服务承载记忆、放置、搜索等跨插件的产品策略，统一动作服务让页面、助理、工作流和 MCP 从同一目录调用能力，App 负责把它们装起来。Server 保持轻量，主要做 Team 身份、交换、同步和少量 Team Plugin 执行，不复制本地产品。

```text
Desktop / Workbench / CLI / MCP（stdio MCP 经动作网关转发）
              ↓
   Local Host（一个 Home 一个常驻宿主）
   统一动作服务 · Plugin Runtime · Agent Host/Prologue
      ┌───────┼────────┐
   Modules  Horizontal  Native / Integration Plugins（含各自私有库）
      ↓         ↓            ↓
   Storage   Adapters     Storage
（Exchange 尚未实现；Lightweight Server 只有实验实现，没有产品入口）
```

## 2. 产品概念

- `User` 是个人身份和 Personal 数据 owner。
- `Team` 是成员、权限和 Team Plugin 决策的边界。
- `Project` 是工作边界：项目插件的数据在项目库里，部分个人插件（如待办、Pages、灵光）的 Home 级库按 `project_id` 区分本项目与个人；未来交换也以它为边界。
- 没有独立的 Space 模型；「个人空间」是保留身份的项目分区，不列为项目、不能改名或删除。
- `project_id` 是唯一的 Project identity：目录条目、项目数据库与库里 Goals 的根记录都用它（2026-10 起不再有 `board_id`）。不创造平行的 Board 产品概念。

本地 Plugin 默认个人安装、个人数据且不同步。只有用户在 Plugin 内选择“共享到某个 Team Project”后，Plugin 才把固定成果发布为可交换内容（Team 交换尚未实现）。Server 上运行的 Team Plugin 由 Team 决定安装和授权。

## 3. 五类代码边界

### Module

回答“这条正式事实归谁管”。每个 Module 拥有自己的状态、规则、Repository、Query、Command 和 Event。它可以通过公开 Contract 调用另一个 Module，但不能导入对方实现或查询对方 Store。

### Horizontal Service

回答“这类技术工作怎样可靠执行”。例如连接 Provider、持续监听、定时唤醒和运行 Runtime。它可以保存 cursor、lease、retry 等技术状态，但不拥有、也不决定插件或 Module 的业务结果；跨插件的产品策略归下一类。

### 平台产品服务

回答“跨插件的产品行为由谁统一管”。目前有四项：记忆（`horizontal/memory`）、放置（`horizontal/placement`）、系统搜索（`horizontal/search`）和情境排序（`packages/kernel` 的 `contextual.ts`）。它们可以持有跨插件的策略——哪些内容可以记住、对象放在哪里、搜索结果怎样按调用者权限聚合、情境里先给用户看什么——也可以保存本服务自己的机制记录，例如记忆的开关与候选、放置的关联与来源、可删除重建的搜索索引；但不拥有任何业务事实：对象事实总向所有者读取，策略不改写插件或 Module 的事实，也不替它们决定业务结果。它们的能力以系统动作登记在同一个动作目录里。代码位置暂不变动：前三项仍在 `horizontal/` 下，按职责属于本类。

### Plugin

回答“用户安装或打开的完整能力是什么”。Native Plugin 是随产品内置的插件，提供产品能力；Integration Plugin 把一个 Provider 的授权、Adapter、设置和 UI 绑成一个签名身份。Plugin 只消费公开 Contract，不依赖另一个 Plugin 的实现。

### App

回答“这些能力在哪个进程和界面里装起来”。App 是 composition root，不拥有 Module 业务规则。

## 4. 关键调用规则

- Query：调用目标 Module 的公开 Query API，返回强类型 read model。
- Command：调用目标 Module 的公开 Command API；只有 owner 能改变自己的正式事实。
- Event：owner 在成功提交事务后通过 Durable Outbox 发布；消费方必须幂等。
- 跨模块关系：由 Context Ledger 保存 ObjectRef 和 ContextEdge，不做跨 Store Join。
- 插件之间的交换：人要留存的固定版本进成果库（`artifacts.produces`），交给别的插件的数据是过程项（`process_items.produces`），即时查询与操作走统一动作目录。
- 技术执行：Module 或 Plugin 调用 Horizontal Capability，收到 Receipt 后再决定业务状态。
- UI：Workbench 通过 Host Client 和 UI Host 调用 Capability，不直接访问 SQLite、Node-only 实现或 Tauri command。

正常调用不需要绕统一消息总线。同步事件、重试、离线恢复和跨进程通信才使用 Durable Outbox / transport；进程内 Query/Command 走类型化 API。

## 5. Goal 与成果

Goals 与成果（Artifacts）是两个内置插件，各自拥有自己的事实；它们不是其他插件内容的主干。

- Goal 表达要持续推进和验收的结果。
- Artifact 表达人要留存、引用的固定版本，可保存、版本化、共享和重放；类型在插件 manifest 的 `artifacts.produces` 里声明。
- 引用只使用 `id + version`；版本由 owner/Plugin 递增维护。
- Artifact 类型由 `artifact_type_id + schema_version` 判断能否消费，生产者身份只做来源审计。
- 接收端没有对应 Plugin 时，Server 仍可保存和转发 opaque payload；安装兼容 consumer 后再解释（Team 交换尚未实现）。

当前本地 Goal 工作使用一套事件协议。Goals 保存意图、笔记、类型版本、报告、当前约定与要求，并决定显式收尾的完成效果；Governance 保存可信用户决定与有限树提案。Native Goals 组合用例和界面，Host 提供已绑定项目、Session 身份与同库事务，MCP/Web 不另算工作状态。普通记录不要求先建立规划。

旧 Claim/Run/Evidence/Review 连同历史表、迁移与展示已于 2026-10-05 删除；Goal 历史就是事件记录加 Goals 日志。真实 Session、Runtime 进程和终端仍由 Work/Runtime Host 负责。当前调用合同见 [Goals](../modules/goals.md)、[Governance](../modules/governance-collaboration.md) 和 [Runtime](../runtime.md)。

## 6. Local 与 Server

### Local

Local Host 是用户真正工作的地方，组合完整 Module、Horizontal Service、平台产品服务、Plugin Runtime、Storage 和 Adapter。Desktop、Workbench、CLI、MCP 共享同一个 Host 能力，不各自维护一套业务状态。

AP2 已落地 embedded Local Host：typed Capability/Client Contract、Kernel registry、按 Project 复用的单 Runtime，以及 Web/CLI/MCP 的统一兼容装配。一个 Home 只有一个常驻宿主（Web 服务）持有执行；stdio MCP 等其他进程经本机动作网关（`/api/internal/action-service`）转发给它。详细边界见 [`LOCAL-HOST.md`](../platform/LOCAL-HOST.md)。

AP4 已把 Desktop 的启动配方、Panel lifecycle、Capsule presentation 和 Tauri native adapter 迁入 `apps/desktop`。Desktop 通过 port 使用 Project/context 能力，不直接拥有 Projects Store；`apps/desktop/src-tauri/` 只保留发布配置。当前能力和未来系统通知、Keychain、App updater 的边界见 [`DESKTOP.md`](../platform/DESKTOP.md)。

### Server

Server 负责认证授权、Team/Project 路由、Envelope 顺序、CAS、ACK、Cursor、Replay、Blob、Quota、Retention 和审计。它只理解 Goal/Artifact 的官方 Envelope 与平台控制字段，不解释 Plugin 自定义 payload，也不判断 Goal 是否完成。

Server Plugin 是 Team 决定安装的能力，可以有自己的私有 Store 和 Server entrypoint；它产生的可交换结果仍通过 Goal/Artifact Contract 发送给本地用户。

## 7. UI 嵌入

插件把视图声明到工作台的固定位置（slot：`navigator`、`stage`、`settings`、`island`、`side`，即目录、主区、设置、浮层、侧栏），不出自己的整页。Plugin 可以向 UI Host 声明视图、命令、Inspector、Slot 和 Embed；被嵌入的 Plugin 必须显式开放 Slot 和接受的 Contribution Contract。宿主控制位置、生命周期、权限和错误隔离，被嵌入内容不能直接读宿主 Store 或内部组件。

AP3 已把稳定文档 Shell、命名 Slot、mount 校验、浏览器资产和视觉基础迁入 Workbench / UI Host / Design System。Cutover 已将各产品页面迁入对应 Native Plugin，并将跨产品 UI 组合归 Workbench；当前实现与边界见 [`UI-PLATFORM.md`](../platform/UI-PLATFORM.md)。

## 8. 可靠性原则

- 每个业务事实只有一个 owner 和一个写入路径。
- 跨边界写入使用本地事务、Durable Outbox、幂等 Event、ACK/Replay 和明确补偿，不设计跨设备全局事务。
- Secret 只保存安全引用，不进入 Module Store、Artifact 或日志。
- 兼容 Facade 只能转发，必须记录 caller 和删除条件。
- 任一迁移阶段都保持可构建、可测试、可回滚。

## 9. 端到端例子

以 Gmail 新邮件进入 Feed 为例：

```text
Gmail Integration Plugin
→ Connector Host 建立授权连接
→ Listener Host 拉取并保存 cursor/lease
→ Gmail Adapter 生成 Signal Draft
→ Signals Module 去重并保存 Signal
→ Feed Module 判断并生成 Feed Item
→ Feed Native Plugin 在 Workbench 显示
→ 用户选择后，Feed 自己记下保存或忽略；加入 Inbox、升格为 Goal 等由 Inbox、Goals 等对应 owner 经动作接收 Command
```

每一步只改变自己拥有的事实。未来用户把某个 Plugin 结果共享给 Team 时，Artifacts/Goals 生成 Envelope，Exchange 负责可靠传输，接收方本地 Plugin 再消费内容。
