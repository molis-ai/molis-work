# Modules

Molis Work 是本地优先的插件基座加多个插件，每项事实只有一个 owner（见 [SSOT](../SSOT-MATRIX.md)）。Module 是正式业务事实（Goal、治理、成果库等）的 owner；插件在 Module 之上组合界面与动作，Pages、Cognia 等插件自有的私人库由插件自己保管（SSOT 第 7 节）。每个 Module 自己保存状态、执行业务规则，并通过 Query、Command、Event 的公开 Contract 与外界协作；它不能直接导入另一个 Module 的实现或 Store。

## 模块地图

| 类别 | Modules |
| --- | --- |
| 基础 | [Identity, Team & Access](identity-team-access.md)、[Projects](projects.md)、[Context Ledger](context-ledger.md)、[Sync & Replication](sync-replication.md) |
| 信息与个人工作 | [Sources](sources.md)、[Signals](signals.md)、[Feed](feed.md)、[Actions](actions.md)、[Attention & Resumption](attention-resumption.md)、[Shelf](shelf.md)、[Functions](../../modules/functions/README.md)、[Characters](../../modules/characters/README.md) |
| 目标与工作上下文 | [Goals](goals.md)、[Private Work Context](private-work-context.md) |
| 成果与过程项 | [Artifacts](artifacts.md) |
| 协作与自动化 | [Governance & Collaboration](governance-collaboration.md)、[Automation](automation.md) |

Identity, Team & Access、Sync & Replication、Automation 目前没有包（`absent`，见 [SSOT](../SSOT-MATRIX.md)），对应文档只记录目标边界；Actions 页描述的是已在用的系统级动作服务（`packages/kernel` 与 Local Host），个人/外部 Action 请求的 `modules/actions` 同样没有包。

共同边界、部署与调用规则见 [`docs/system/ARCHITECTURE.md`](../system/ARCHITECTURE.md)。逐包完整 Contract 见 [`specs/molis-work-architecture-reorganization/spec.md`](../../specs/molis-work-architecture-reorganization/spec.md) 第 20 节。

当前 Goal 工作统一使用事件、约定、要求、决定、收尾和继续。旧 Claim/Run/Evidence/Review 协议及其历史已删除（#268），Execution 与 Evidence & Verification 两个模块随之删除；真实 Session／终端能力仍由 Work 与 Runtime Host 负责。当前行为以[事件工作流需求书](../../specs/archive/goal-event-workflow-cleanup/spec.md)和各模块文档为准，早期架构 Contract 中的旧命令不再是可调用接口。

## 通用开发要求

- public entrypoint 只暴露 Query、Command、Event、稳定错误和必要 Schema。
- Repository、数据库行、内部状态机和实现类型默认不导出。
- 跨 Module 关系由 Context Ledger 保存；跨模块内容通过公开 Contract 传递：动作目录、成果库的固定版本、生产方的过程项。
- 每个写 Command 有 version/idempotency 语义，每个 Event 可幂等消费。
- package README 说明怎样开发；本目录说明为什么这样分，不能出现两套 owner 定义。
