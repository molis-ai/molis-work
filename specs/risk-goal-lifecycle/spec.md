# Risk 处理 Goal 生命周期闭环

## 背景与目标

当前 Runtime 可以从一个 Draft Goal 的 clarifier Run 提交只修改 Risk 的 Goal Tree Proposal。服务端只检查 Run 是否属于当前 actor，却没有把 Proposal 的 `root_goal_id` 与 Run 的 `goal_id` 绑定，也没有要求 Draft 在修改 Risk 生命周期前先形成正式 Contract。

真实结果是：Risk 已经按用户决定更新并物化，clarifier Run 也已结束，但发起工作的 Goal 仍是空白 `draft / abstract`，因此长期显示“待澄清”。同一个 Draft Run 甚至可以把 Proposal 挂到另一条 Goal 上。

本次目标不是删除这类 Goal，也不是把 Risk 当成附属记录。Risk 的处理是一项有限、可验收、可以到 Done 的正式 Goal。Molis Work 必须保证它从澄清、确认、执行、Evidence、Review 到完成走完整生命周期。

关联现象：`draft-78a84b05-54c9-423d-b2f1-3c171ed6ebdc` 已物化 Risk 状态更新，但自身仍为无 Contract 的 Draft。

## 完成等级

目标为 **Level 4：内部完整**。

要求核心服务端约束、Runtime MCP 说明、`goal-advance` Skill 流程和回归测试一致；当前历史 Goal 的 canonical 修复仍必须经过用户确认，不通过迁移或直接数据库写入静默完成。

## 根因与证据

### 核心服务端

- `startDraftDialogue()` 创建最小 Draft、clarifier Claim 与 Run，这是正确的澄清入口。
- `submitGoalTreeProposal()` 调用 `requireActiveClarificationProposalRun()`，但该检查只验证 actor、role、Run/Claim 状态，不返回或约束 Run 的 `goal_id`。
- `root_goal_id` 由调用方提供；缺省时可保持 `null`，提供其他 Goal 时也不会与 clarifier Run 对账。
- Draft clarifier 可以提交单独的 `kind=risk / operation=update` 条目；Risk 物化顺序正确，但没有要求同一 Proposal 先接受发起 Goal 的 Contract。
- `decideGoalTreeProposal()` 支持逐项确认，因此即使 Proposal 同时包含 Contract 与 Risk，也缺少“Draft Risk 生命周期决定必须同时确认 Contract”的防拆保护。

### Skill

- 当前 `planning.md` 解释了 Risk 的 treatment 与 lifecycle state，也要求统一 Proposal 包含相关 Contract。
- 但它没有明确说明：处理 Risk 本身是一条正式 Goal；Draft 发起 Risk 生命周期变更时，必须把同一条 Goal 的完整 Contract 放进同一 Proposal。
- `execution.md` 要求确认 Risk 后重新读取事实，但没有明确要求继续完成发起该处理的 Goal，容易让 Runtime 在 Proposal/clarifier Run 结束后停止。
- 如果 Risk 缓解尚未执行，先接受 Contract 再由 executor 工作是正确顺序；但旧服务只接受 clarifier Run 提交 Goal Tree Proposal，而 accepted / closed_leaf Goal 不能再次进入澄清，因此 executor 完成缓解和 Evidence 后没有受支持入口提交最终 Risk lifecycle 结果。

## 关键产品判断

### Risk 处理什么时候是一条 Goal

当工作要让 Risk 的生命周期发生变化，例如 `open → triggered`、`open/triggered → resolved`、`open → accepted/expired`，它是有限、可验收的改变，应由一条正式 Goal 拥有。

单纯记录新 Risk 或编辑描述、负责人、触发条件等事实，仍可以发生在规划中，不应被机械要求立即关闭 Draft。

### 一次确认可以包含什么

当 Risk 的处理结果已经有充分事实，用户可以通过一份统一 Proposal 同时确认：

1. 这条 Risk 处理 Goal 的完整 `accepted / closed_leaf` Contract；
2. 指定 Risk 的目标 lifecycle state 更新。

服务端按既有 materialization order 先接受 Contract，再物化 Risk。确认后 Runtime 仍需重新读取 canonical Risk，按 Contract 提交 Evidence、完成所需 Review，并调用 `complete`；Proposal 应用或 clarifier Run 完成都不等于 Goal 完成。

如果 Risk 仍需实际缓解工作，Proposal 只确认 Goal Contract 和必要规划事实；执行完成、有 Evidence 后，再提出 Risk lifecycle 更新，不能提前标记 `resolved`。

为让这条后半段路径真实可执行，active executor Run 可以为自己正在执行的同一 accepted / closed_leaf Goal 提交只含 Risk lifecycle 结果的 Proposal。它不能借此修改 Goal、Contract、Relation、普通 Risk 事实或其他 Goal；用户仍需确认 Risk 结果。

## 服务端方案

### 1. Proposal 与 clarifier Run 绑定同一 Goal

`requireActiveClarificationProposalRun()` 返回 Run 的 `goal_id`。

- 新 Proposal 没有 `root_goal_id` 时，服务端使用 Run 的 `goal_id` 作为 root。
- 当 Proposal 包含 Risk lifecycle 变更时，显式 `root_goal_id` 与 Run 的 `goal_id` 不同就拒绝提交。
- Proposal revision 可以来自恢复后的新 clarifier Run；涉及 Risk lifecycle 时，新 Run 仍必须属于原 Proposal 的同一 root Goal。

普通复合 Goal 收口或树内编排允许 clarifier Run 处理同一棵树中的其他 root；现有合法父 Goal 收口测试依赖这一能力，因此不能把同 root 限制错误扩展到所有 Goal Tree Proposal。

### 2. Draft 的 Risk lifecycle guard

当 Proposal 包含对既有 Risk 的真实 lifecycle state 变更，且 root Goal 当前仍是 Draft 时，同一 Proposal 必须包含一条针对 root Goal 的 `kind=contract` 或 `kind=goal` 更新，内容必须形成完整的 `accepted / closed_leaf` Contract 与非空验收条件。

缺少该条目时拒绝 Proposal，canonical Goal 与 Risk 都不改变。

### 3. 决定阶段再次校验

用户逐项决定时，如果要确认 Draft root 下的 Risk lifecycle 条目：

- root 已经由其他合法决定变成 accepted，可以继续；
- 否则本次 decisions 必须同时确认同一 Proposal 中 root Goal 的有效 Contract 条目；
- 只确认 Risk、不确认 Contract，整次调用在物化前失败，不能产生部分写入。

这层检查覆盖旧 Proposal、逐项确认和并发状态变化。

### 4. executor 的窄 Risk 结果入口

`submitGoalTreeProposal()` 接受两种 active Run：

- clarifier 可以提交完整 Goal Tree Proposal；
- executor 只可以从同一条 `accepted / closed_leaf` Goal 提交一个或多个真实 Risk lifecycle 条目。

executor 提交其他 kind、普通 Risk 事实编辑、跨 root Proposal 或未接受 Goal 的结果时，服务端在写 Proposal 前拒绝。这个入口只记录待用户决定的结果，不允许 executor 自批 Risk。

### 5. 不自动伪造完成

服务端不因为 Risk 物化成功就自动创建 Runtime Evidence、Review 或把 Goal 标记为 satisfied。完成仍走现有 `run_report → evidence_submit → review_submit → complete → release`，确保验收事实可追溯。

## Skill 方案

在 `goal-advance` 的规划与执行 references 中加入一条聚焦的 Risk Goal 流程，不扩写成通用 Risk 教程：

1. 先判断是 Risk 事实维护，还是生命周期处理。
2. 生命周期处理必须复用已有未完成 owner Goal，或创建一条有限的正式 Goal；不得称为“临时 Goal”“载体 Draft”或计划事后删除。
3. Draft 发起 lifecycle Proposal 时，把同一 Goal 的完整 Contract 与 Risk 条目放在一份可读 Proposal 中。
4. 说明目标状态、唯一 Risk 范围、明确不做、验收条件和需要的 Evidence。
5. 如果处理措施尚未完成，只确认 Contract，不提前提交 `state=resolved`；executor 完成措施并提交 Evidence 后，从同一 active Run 提交只含 Risk lifecycle 结果的 Proposal。
6. 用户确认后重新读取 Goal 与 Risk，继续 Run report、Review、complete 与 release，不能把 Risk 物化当作 Goal 已完成。

`SKILL.md` 只保留一条不可遗漏的路由/原则；详细流程放在 `references/planning.md` 与 `references/execution.md`，避免入口膨胀。

## 修改范围

- `src/v1/coordinator.ts`
- `src/mcp/server.ts`
- `skills/goal-advance/SKILL.md`
- `skills/goal-advance/references/planning.md`
- `skills/goal-advance/references/execution.md`
- `tests/v1.test.ts`
- `tests/mcp.test.ts`
- 本 spec

只有在可观察 Web 行为需要新增异常恢复状态时才修改 `src/web/*` 和 `tests/web.test.ts`；当前状态展示本身正确，不默认修改。

## 非目标

- 不新增数据库 schema 或直接修改 SQLite。
- 不自动迁移、删除、接受或完成历史 Draft。
- 不把所有 Risk 事实编辑都强制建成新 Goal。
- 不因为 Proposal 物化成功而伪造 Evidence 或自动完成 Goal。
- 不改变用户确认、idempotency、Claim lease 或 Review 权限边界。

## 验收标准

1. Proposal root 缺省时自动绑定 clarifier Run 的 Goal；Risk lifecycle Proposal 显式跨 Goal root 被拒绝，同时普通复合 Goal 编排保持兼容。
2. Draft root 的 Risk lifecycle-only Proposal 被拒绝，Risk 与 Goal 均不改变。
3. 同一 Proposal 包含有效 root Contract 与 Risk lifecycle 条目时可以提交。
4. 逐项决定只确认 Risk 而不确认 Draft Contract 时，决定失败且没有部分物化。
5. 同时确认 Contract 与 Risk 时，Goal 先成为 `accepted / closed_leaf`，Risk 再更新；Goal 保持 unmet，等待真实 Evidence 与完成流程。
6. accepted / closed_leaf Goal 的 active executor Run 在提交 Evidence 后，可以提交 same-root Risk lifecycle-only Proposal；executor 的其他 Proposal 和跨 root Risk Proposal 被拒绝。
7. Skill 明确区分 Risk 事实维护与生命周期处理，并把后者推进到 Goal 完成，而不是停在 Proposal、Risk 物化或 clarifier Run 完成。
8. 受影响的类型检查、V1、MCP、Skill 校验与完整测试通过；无无关行为变化。

## 验证命令

```bash
pnpm typecheck
node --import tsx --test tests/v1.test.ts
node --import tsx --test tests/mcp.test.ts
python3 /Users/yijunwang/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/goal-advance
pnpm test
git diff --check
```

## 历史 Goal 恢复

代码修复不会静默改写 `draft-78a84b05-54c9-423d-b2f1-3c171ed6ebdc`。

安全恢复方式是：基于已经应用的 Risk decision 和用户本轮纠正，提出一份只补全该 Goal Contract 的 Proposal；用户确认后，将既有 Risk 状态作为执行输入重新验证，提交 Evidence/Review 并正常完成 Goal。不得把它移入回收站，也不得直接改数据库。
