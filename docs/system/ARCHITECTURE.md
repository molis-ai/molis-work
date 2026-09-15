# Molis Work 系统架构

状态：已确认（F1）  
详细 Contract：[`specs/molis-work-architecture-reorganization/spec.md`](../../specs/molis-work-architecture-reorganization/spec.md)

## 1. 一句话结构

用户在本地产品里工作；Module 保存业务事实，Horizontal Service 执行可复用的技术工作，Plugin 把这些能力组合成用户可见功能，App 负责把它们装起来。Server 保持轻量，主要做 Team 身份、交换、同步和少量 Team Plugin 执行，不复制本地产品。

```text
Desktop / Workbench / CLI / MCP
              ↓ Host Client Contract
          Local Host
      ┌───────┼────────┐
   Modules  Horizontal  Plugin Runtime
      ↓         ↓            ↓
   Storage   Adapters     Native / Integration Plugins
      └─────────┬────────────┘
             Exchange
                ↓
        Lightweight Server
```

## 2. 产品概念

- `User` 是个人身份和 Personal 数据 owner。
- `Team` 是成员、权限和 Team Plugin 决策的边界。
- `Project` 是 Goal、Artifact、共享关系和交换的工作边界。
- `Space` 不进入当前正式模型。
- `board_id` 是旧 V1 数据库身份；AP1 已把 `project_id` 固定为正式 Project identity。新普通 Project 两者同值，旧库迁移只保留原 `board_id` 做兼容，不创造平行的 Board 产品概念。

本地 Plugin 默认个人安装、个人数据且不同步。只有用户在 Plugin 内选择“共享到某个 Team Project”后，Plugin 才通过 Goal 或 Artifact Contract 发布可交换内容。Server 上运行的 Team Plugin 由 Team 决定安装和授权。

## 3. 四类代码边界

### Module

回答“这条正式事实归谁管”。每个 Module 拥有自己的状态、规则、Repository、Query、Command 和 Event。它可以通过公开 Contract 调用另一个 Module，但不能导入对方实现或查询对方 Store。

### Horizontal Service

回答“这类技术工作怎样可靠执行”。例如连接 Provider、持续监听、定时唤醒和运行 Runtime。它可以保存 cursor、lease、retry 等技术状态，但不决定业务结果。

### Plugin

回答“用户安装或打开的完整能力是什么”。Native Plugin 提供一级产品能力；Integration Plugin 把一个 Provider 的授权、Adapter、设置和 UI 绑成一个签名身份。Plugin 只消费公开 Contract，不依赖另一个 Plugin 的实现。

### App

回答“这些能力在哪个进程和界面里装起来”。App 是 composition root，不拥有 Module 业务规则。

## 4. 关键调用规则

- Query：调用目标 Module 的公开 Query API，返回强类型 read model。
- Command：调用目标 Module 的公开 Command API；只有 owner 能改变自己的正式事实。
- Event：owner 在成功提交事务后通过 Durable Outbox 发布；消费方必须幂等。
- 跨模块关系：由 Context Ledger 保存 ObjectRef 和 ContextEdge，不做跨 Store Join。
- 可交换结果：由 Goals 或 Artifacts 承载；Plugin 私有 payload 作为 Artifact 的 opaque 内容交换。
- 技术执行：Module 或 Plugin 调用 Horizontal Capability，收到 Receipt 后再决定业务状态。
- UI：Workbench 通过 Host Client 和 UI Host 调用 Capability，不直接访问 SQLite、Node-only 实现或 Tauri command。

正常调用不需要绕统一消息总线。同步事件、重试、离线恢复和跨进程通信才使用 Durable Outbox / transport；进程内 Query/Command 走类型化 API。

## 5. Goal 与 Artifact

Goal 和 Artifact 是官方维护、签名保护的一等 Plugin 能力，也是系统的内容交换主干。

- Goal 表达要持续推进和验收的结果。
- Artifact 表达可保存、版本化、共享和重放的结果。
- 引用只使用 `id + version`；版本由 owner/Plugin 递增维护。
- Artifact 类型由 `artifact_type_id + schema_version` 判断能否消费，生产者身份只做来源审计。
- 接收端没有对应 Plugin 时，Server 仍可保存和转发 opaque payload；安装兼容 consumer 后再解释。

当前本地 Goal 工作使用一套事件协议。Goals 保存意图、笔记、类型版本、报告、当前约定与要求，并决定显式收尾的完成效果；Governance 保存可信用户决定与有限树提案。Native Goals 组合用例和界面，Host 提供已绑定项目、Session 身份与同库事务，MCP/Web 不另算工作状态。普通记录不要求先建立规划或领取 Run。

旧 Claim/Run/Evidence/Review 的写入链和操作投影已经退役，历史 schema、迁移、原记录阅读与项目删除的现有历史活动检查保留。真实 Session、Runtime 进程和终端仍由 Work/Runtime Host 负责。当前调用合同见 [Goals](../modules/goals.md)、[Governance](../modules/governance-collaboration.md) 和 [Runtime](../runtime.md)。

## 6. Local 与 Server

### Local

Local Host 是用户真正工作的地方，组合完整 Module、Horizontal Service、Plugin Runtime、Storage 和 Adapter。Desktop、Workbench、CLI、MCP 共享同一个 Host 能力，不各自维护一套业务状态。

AP2 已落地 embedded Local Host：typed Capability/Client Contract、Kernel registry、按 Project 复用的单 Runtime，以及 Web/CLI/MCP 的统一兼容装配。当前不宣称独立 daemon 或跨进程自动发现已经实现；详细边界和迁移端口见 [`LOCAL-HOST.md`](../platform/LOCAL-HOST.md)。

AP4 已把 Desktop 的启动配方、Panel lifecycle、Capsule presentation 和 Tauri native adapter 迁入 `apps/desktop`。Desktop 通过 port 使用 Project/context 能力，不直接拥有 Projects Store；`apps/desktop/src-tauri/` 只保留发布配置。当前能力和未来系统通知、Keychain、App updater 的边界见 [`DESKTOP.md`](../platform/DESKTOP.md)。

### Server

Server 负责认证授权、Team/Project 路由、Envelope 顺序、CAS、ACK、Cursor、Replay、Blob、Quota、Retention 和审计。它只理解 Goal/Artifact 的官方 Envelope 与平台控制字段，不解释 Plugin 自定义 payload，也不判断 Goal 是否完成或 Evidence 是否充分。

Server Plugin 是 Team 决定安装的能力，可以有自己的私有 Store 和 Server entrypoint；它产生的可交换结果仍通过 Goal/Artifact Contract 发送给本地用户。

## 7. UI 嵌入

一级目录对应 Native Plugin。Plugin 可以向 UI Host 声明页面、命令、Inspector、Slot 和 Embed；被嵌入的 Plugin 必须显式开放 Slot 和接受的 Contribution Contract。宿主控制位置、生命周期、权限和错误隔离，被嵌入内容不能直接读宿主 Store 或内部组件。

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
→ 用户选择后，Goals/Artifacts/Actions 对应 owner 接收 Command
```

每一步只改变自己拥有的事实。未来用户把某个 Plugin 结果共享给 Team 时，Artifacts/Goals 生成 Envelope，Exchange 负责可靠传输，接收方本地 Plugin 再消费内容。
