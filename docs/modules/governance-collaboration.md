# Governance & Collaboration

Governance 保存当前可信用户决定、有限 Goal Tree 提案／条目／决定，以及完整历史协作记录。它记录“谁在什么来源下批准了哪一项变化”，不替 Goals 计算完成，也不直接修改其他 owner 的数据库。

## 当前公开职责

| 入口 | 用途 |
| --- | --- |
| `eventDecisions` | 保存事件工作协议中的可信用户决定、作用范围与来源 |
| Goal Tree records | 保存显式 Goal／关系变更、条目状态、预检和实际决定 |
| 决定事务 | 在同一事务中保存决定并调用对应 owner 物化已批准变化；任一失败整体回滚 |
| `provenance` | 校验真实来源和条目说明，并提供历史提案的统一阅读 |
| `query` | 读取当前决定及原 Review、Proposal、Candidate、Rewire、澄清与历史记录 |

事件决定只接受 Host Web／受保护管理入口验证的用户来源。Runtime 可以请求具体决定并引用已保存的有效决定，不能自填 `actor_kind=user`、`user_confirmed` 或对话摘要作为授权。要求验收、完成决定和具体约定变更分别按自己的范围生效，不能复用一个含糊授权改变另一项承诺。

树提案使用当前 Runtime／Session 来源、显式有限条目与实际版本。提交与预检不修改正式关系；用户批准后由 Native Goals 调用 Goals 公开接口物化。部分选择、原子事务、幂等重试、过期基线、跨项目引用和图循环保护继续有效，不要求 Claim/Run 或固定拆分门槛。

## 历史与边界

旧 Review／Clarification、Contract／Candidate／Rewire 的写服务和执行编排已经退役。对应记录、schema、必要迁移、历史状态和原正文仍保留；历史 self-verifier 不能被展示为用户验收，旧决定也不能变成当前任意变更的授权。

Governance 通过公开 Contract 协作。Host 验证项目与身份；Native Goals 组合具体用例；Goals 修改约定、要求、关系及当前状态；Artifacts 保存结果内容。跨 owner 写入使用实际决定事务，不让 UI 或 MCP 另写一套批准／完成规则。

当前调用路径见 [MCP](../mcp.md) 与 [Goals](goals.md)。[事件工作流需求书](../../specs/archive/goal-event-workflow-cleanup/spec.md)说明本轮受保护决定与退役范围；早期 EX/DD 报告只描述当时的迁移事实。
