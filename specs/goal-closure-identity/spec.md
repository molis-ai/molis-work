# 完成确认与管理入口身份

状态：待验收（2026-10-08）。2026-10-07 在旧 main（d81b12cb）上做成，2026-10-08 重做到 main 1d891c8b 之上并重新验证；与旧版的差异见文末「合入主线时的调整」。

## 背景

三处行为跟界面或工具说明不一致。

1. 项目规则「完成前必须你点头」能保存、也能在界面上看到，但收尾时写死了不需要人工验收。单条要求上的「需要用户验收」是另一件事，它已经会拦住完成。
2. CLI 和有类型的 Host 客户端走管理入口。这个入口没有调用者身份，却把参数里的 `actor_id` / `actor_kind` 当成操作者。冒充用户就能跳过「Runtime 改约定必须引用用户决定」。
3. 管理 MCP 工具 `molis_work_v1_event_decide` 的 schema 把 `actor_id` 列为必填，处理函数却把这个字段当成不允许的参数。按 schema 调用一定失败。

## 目标

- 项目规则解析出的 `human_approval` 进入现有完成检查。打开时，完成前要有仍然有效的可信用户结论：某条要求上已接受且仍然成立的用户结论，或当前决定授权了 `complete`。点「完成」的人是用户，本身不算这条结论。
- 管理入口的写入固定记本机这个人（`web-user`），参数里带 `actor_id` 或 `actor_kind` 就拒绝。范围：创建意图、配置、报告、约定、收尾、继续、便笺、设当前目标、结构提案检查，以及同一扇门上的进展、问题、请求决定、引用决定。
- 决策工具的公开 schema 不再包含 `actor_id`。处理函数继续不接受这个字段，并仍以本机这个人记录决定。

## 不做

- 不改动作目录那条路的身份。Web 和 Runtime 仍从调用上下文取操作者；Runtime 改约定仍要引用用户决定。
- 不把「点完成的人」当成验收。
- 不恢复风险阻塞完成。风险存储已在 2026-10-05 去掉。
- 不改回执查询、项目引导、规划保存、结构提案提交。这些不在这扇门里。
- 领域方法和动作处理函数仍从调用上下文拿 `actor_id`。管理入口不再替它们转发参数里的身份。

## 行为

- 没开项目规则时，完成检查与现在相同。单条要求的「需要用户验收」继续单独生效。
- 开了规则、要求本身不需要逐条验收、工作事实已经支持结果时，收尾回执 `completion_applied` 为 false，原因是 `event_closure.human_approval_required`。随后一条授权 `complete` 的可信用户决定可以让完成成立。
- 管理入口不带身份字段时，写入的 `actor_id` 是本机这个人，`actor_kind` 是 `user`。同一条幂等键只在这个人身上重放。
- 管理入口带了 `actor_id` 或 `actor_kind` 时，返回 `actions.input_invalid`，不写入。先核对是不是当前项目，项目不对仍是 `actions.scope_mismatch`。
- CLI 的 `active-goal` 不再转发 JSON 里的 `actor_id`。旧脚本多写这个字段也不会被当成别人。直接调用能力时如果字段还在，宿主拒绝。
- 结构提案检查的参数里如果带了身份，宿主拒绝。检查记录记在本机这个人身上，不重放 Runtime 那次检查。
- Coding 记录进展时不再自报身份：插件调用取自己调用上下文里的人（主线 c1fae739 已做），不带调用上下文的直接调用走管理入口、记本机这个人，两者的参数里带 `actor_id` 或 `actor_kind` 都拒绝。回执查询不变：插件取调用上下文，直接调用仍点名要查的人。
- `molis_work_v1_event_decide` 的 properties 和 required 都没有 `actor_id`。

## 验收

- `tests/goal-events-state.test.ts` 覆盖项目规则拦住完成、以及授权完成的用户决定放行。
- 管理入口测试改为：不带身份时记本机这个人并自我重放；带身份时拒绝；动作客户端仍记录 Runtime 并自我重放。跨入口用同一个幂等键互相重放的旧断言删掉，不放宽成「谁调用都算同一个人」。
- 决策工具测试继续证明：带 `actor_id` 被拒绝，不带时决定者是本机这个人。
- `tests/goal-management-identity.test.ts` 逐个覆盖管理入口：带 `actor_id` 或 `actor_kind` 都是 `actions.input_invalid` 且不写入，项目不对仍是 `actions.scope_mismatch`，不带身份时记本机这个人。
- `tests/mcp-action-catalog.test.ts` 证明决策工具的 properties 和 required 都没有 `actor_id`；`tests/goal-read-entry.test.ts` 证明 CLI 的 `active-goal` 不转发 JSON 里的 `actor_id`。

验证：

```text
node scripts/run-tests.mjs tests/goal-events-state.test.ts tests/goals-actions.test.ts tests/goals-command-actions.test.ts tests/goals-mcp-actions.test.ts tests/goals-lifecycle-actions.test.ts tests/goals-tree-actions.test.ts tests/local-host.test.ts tests/host-entry-consistency.test.ts tests/goal-read-entry.test.ts tests/home-backup-recovery.test.ts tests/mcp-goal-events-state.test.ts tests/mcp-action-catalog.test.ts tests/coding-goal-context-http.test.ts tests/proposal-entry-chain.test.ts tests/casebook-interaction.test.ts tests/casebook-current-host.test.ts tests/casebook-operation-receipts.test.ts tests/project-policy-save.test.ts tests/goal-progress-plugin-identity.test.ts tests/goal-management-identity.test.ts
```

## 合入主线时的调整（2026-10-08）

旧版在 d81b12cb 上做成；main 之后有 c1fae739（`goals.progress.*` 的插件身份），按本规格的意图取舍如下。

- 主线已经做了的，丢掉旧版的对应改动：Coding 的进展路由（`plugins/native/coding/src/routes.ts`）不再带 `actor_id`、`actor_kind`，回执查询也不再带 `actor_id`。
- 合并处理：`goals.progress.record.v1` 对插件调用仍取调用上下文的身份（主线）；对其余调用方（CLI、typed Host 客户端、测试）是管理入口，记本机这个人，参数里带身份拒绝。输入类型去掉 `& GoalProgressActor`，这是 contracts 公开 API 快照里唯一的变化（`tooling/gates/api/contracts/modules/goals.txt`）；Goals 插件导出的 typed 入口（`@molis-ai/molis-work-plugin-goals`，不在快照里）的输入类型也都去掉了 `actor_id`、`actor_kind`。`goals.progress.receipt.v1` 不变。
- 旧版删掉的跨入口重放断言（本规格明确允许）：`tests/goals-actions.test.ts`（typed 创建重放动作客户端那一次）、`tests/goals-command-actions.test.ts`（动作客户端重放 typed 的报告与进展）、`tests/local-host.test.ts`（工作台客户端重放 MCP 创建的 Goal）、`tests/goals-tree-actions.test.ts`（typed 检查返回 Runtime 那次检查的结果）、`tests/proposal-entry-chain.test.ts`（Runtime 的结构检查重放 CLI 的检查）。每处都换成两件事：管理入口自己重放自己，动作客户端自己重放自己。`tests/goals-actions.test.ts` 的便笺与旧身份用例、`tests/goals-mcp-actions.test.ts` 的迁移前历史，改由动作客户端写入（管理入口不能再以 Runtime 或旧身份写）；它们的断言本身不变。
- 已知缺口：`GoalTreeProposalCheckInput` 是领域输入，仍声明必填 `actor_id`，所以 `createGoalProposalClients().goalTree.checkGoalTreeProposal` 的 TypeScript 类型与宿主的拒绝不一致；CLI 传的是原始 JSON，不受影响。要收紧得把管理入口的输入类型从领域输入里分出来，另开一件事。
