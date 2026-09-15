# Lifecycle State Reconciliation

## 背景与目标

Molis Work 的 canonical Goal 已经能从 `draft` 进入 `accepted`，Claim 释放、撤销和租约过期也已经会结束关联的非终态 Run；但历史数据库仍存在一条 Claim 已过期而 Run 仍为 `started` 的记录，并有三条 Goal 已 `accepted` 而澄清会话仍为 `proposal_ready` 的记录。

目标是让这些生命周期事实重新一致：一次性迁移历史遗留数据，并保证以后 Draft 经用户确认成为正式 Goal 时，同一事务自动关闭它的澄清会话。

## 当前行为和问题证据

- 真实 Board 中存在 1 条 `claim.state = expired`、`run.state = started` 的组合。
- 真实 Board 中存在 3 条 `goal.definition_state = accepted`、`clarification_session.state = proposal_ready` 的组合。
- `releaseClaim()`、`revokeClaim()` 和 `expirePastClaims()` 已统一调用 `abandonActiveRunsForClaim()`，所以新发生的 Claim 终止不会再留下非终态 Run。
- `decideContractProposal()` 和 Goal Tree 的 Goal 物化路径会把 Draft 更新为 `accepted`，但目前都没有关闭对应的澄清会话。

## 范围与非目标

范围：

- 增加 schema migration 12，修复历史上 Claim 已非 active、Run 却仍为 `started` / `blocked` 的记录。
- migration 12 关闭历史上 Goal 已非 Draft、会话却仍未关闭的澄清会话。
- Contract Proposal 批准或 Goal Tree Decision 把现有 Draft 更新为 `accepted` 时，关闭对应的所有未关闭澄清会话。
- 每次自动关闭或迁移修复都写入可审计事件。
- 覆盖迁移、Contract 决定、Goal Tree 决定、拒绝路径和幂等回归。

非目标：

- 不增加第二个“流程状态”维度，不改变 Goal 的单一工作状态推导。
- 不在提案提交或拒绝时关闭澄清会话；Goal 仍为 Draft 时允许继续澄清和修订。
- 不自动完成仍持有 active Claim 的 Run，不猜测 Runtime 是否已经做完工作。
- 不改变 MCP、CLI、Web 接口或用户项目配置。
- 不用数据库 trigger 隐式改业务状态；生命周期变化保持在清楚可追踪的协调调用链中。

## 用户与调用场景

1. Runtime 与用户澄清 Draft，用户批准完整 Contract；返回前 Goal 变为 `accepted`，澄清会话变为 `closed`。
2. Runtime 提交 Goal Tree，用户只确认其中能把根 Draft 变为 `accepted` 的 Contract；根 Goal 的澄清会话关闭，而新建的 Draft 子 Goal 仍可继续澄清。
3. 用户拒绝 Contract 或只确认不改变根 Draft 定义状态的项目时，会话保持打开。
4. 升级旧数据库时，失去 active Claim 的 Run 变为 `abandoned`，已结束澄清的会话变为 `closed`，且第二次打开数据库不会重复写事件。

## 方案与关键决策

1. 在 Store 增加 migration 12。迁移按当前 canonical 事实修复数据：非 active Claim 不得拥有非终态 Run；非 Draft Goal 不得拥有未关闭澄清会话。
2. 历史 Run 的 `ended_at` 优先使用 Claim 已记录的 `released_at`，否则使用迁移时间；修复原因为生命周期恢复，并写 `run.abandoned` 事件。
3. 历史澄清会话的 `closed_at` 优先使用 Goal 的 `accepted_at`，否则使用迁移时间，并写 `clarification.closed` 事件。
4. 在 Coordinator 增加一个私有的 `closeOpenClarificationSessions()`，作为运行时关闭会话和写事件的唯一入口。
5. 只在现有 Draft 实际更新为 `accepted` 后调用该入口；调用处与 canonical Goal 更新处在同一事务内。
6. migration 12 只执行一次；已修复记录不再满足选择条件，因此即使迁移记录被人工移除后重跑，也不会产生重复修复事件。

## 输入、输出与依赖

- 输入：Goal 的 `definition_state`、Clarification Session 的状态、Claim 与 Run 的状态和时间事实。
- 输出：一致的终态 Run / Clarification Session，以及对应的恢复或关闭事件。
- 依赖：现有 Store migration 机制、Coordinator 事务、`appendEvent()`。

## 文件与模块边界

- `src/v1/store.ts`：migration 12 和历史数据修复。
- `src/v1/coordinator.ts`：运行时澄清会话关闭入口，以及两个 Draft→accepted 调用点。
- `tests/v1.test.ts`：迁移与两条接受路径的生命周期回归。
- 不改公开类型、MCP、CLI、Web 和 Runtime Skill。

## 验收标准

1. migration 12 后不存在 Claim 非 active 而 Run 仍为 `started` / `blocked` 的记录。
2. migration 12 后不存在 Goal 非 Draft而澄清会话仍未关闭的记录。
3. Contract Proposal 被批准后，对应澄清会话在同一事务内关闭，并产生一次 `clarification.closed` 事件。
4. Goal Tree Decision 把根 Draft 接受后，对应澄清会话关闭；重复决定不重复关闭或写事件。
5. 被拒绝的 Contract Proposal 不关闭会话，Goal 仍可继续澄清。
6. 新库直接包含 migration 12；旧库迁移和再次打开均幂等。
7. 定向测试、类型检查、完整测试和 `git diff --check` 通过。
8. 真实 Board 升级后，历史脏 Run 和未关闭的已接受 Goal 澄清会话数量都为 0。

## 验证命令

```bash
node --import tsx --test tests/v1.test.ts
pnpm typecheck
pnpm test
git diff --check
```

真实数据库升级前先创建可恢复备份，升级后用只读 SQL 核对迁移版本、Run/Claim 组合和 Goal/Clarification Session 组合。

## 假设与开放问题

- `accepted` 是澄清完成的 canonical 事实；`clarifying` / `proposal_ready` 只是会话内部阶段，不再与 accepted Goal 并存。
- active Claim 仍可能拥有 `started` / `blocked` Run，这是正常进行中的工作，本任务不自动结束。
- 当前没有开放问题阻塞实现。
