# Modules

Module 是正式业务事实的唯一 owner。每个 Module 自己保存状态、执行业务规则，并通过 Query、Command、Event 的公开 Contract 与外界协作；它不能直接导入另一个 Module 的实现或 Store。

## 模块地图

| 类别 | Modules |
| --- | --- |
| 基础 | [Identity, Team & Access](identity-team-access.md)、[Projects](projects.md)、[Context Ledger](context-ledger.md)、[Sync & Replication](sync-replication.md) |
| 信息与个人工作 | [Sources](sources.md)、[Signals](signals.md)、[Feed](feed.md)、[Actions](actions.md)、[Attention & Resumption](attention-resumption.md)、[Shelf](shelf.md) |
| 持续工作主链 | [Goals](goals.md)、[Private Work Context](private-work-context.md)、[Artifacts](artifacts.md) |
| 旧执行事实与历史升级 | [Execution](execution.md)、[Evidence & Verification](evidence-verification.md) |
| 协作与自动化 | [Governance & Collaboration](governance-collaboration.md)、[Automation](automation.md) |

共同边界、部署与调用规则见 [`docs/system/ARCHITECTURE.md`](../system/ARCHITECTURE.md)。逐包完整 Contract 见 [`specs/molis-work-architecture-reorganization/spec.md`](../../specs/molis-work-architecture-reorganization/spec.md) 第 20 节。

当前 Goal 工作统一使用事件、约定、要求、决定、收尾和继续。旧 Claim/Run/Evidence/Review 写协议已经退役；历史读取、数据库升级和真实 Session／终端能力保留。当前行为以[事件工作流需求书](../../specs/goal-event-workflow-cleanup/spec.md)和各模块文档为准，早期架构 Contract 中的旧命令不再是可调用接口。

## 通用开发要求

- public entrypoint 只暴露 Query、Command、Event、稳定错误和必要 Schema。
- Repository、数据库行、内部状态机和实现类型默认不导出。
- 跨 Module 关系由 Context Ledger 保存；跨模块内容通过 Goal/Artifact 或公开 API 传递。
- 每个写 Command 有 version/idempotency 语义，每个 Event 可幂等消费。
- package README 说明怎样开发；本目录说明为什么这样分，不能出现两套 owner 定义。
