# Molis Work 连续状态与丝滑交互收口

## 完成等级

本次目标为 **Level 4：内部完整**。实现、迁移、自动化测试和本地真实流程验证需闭环；不安装、不发布、不迁移正式数据库。

## 背景与问题证据

当前系统把执行阶段、完成门禁、交接和异常混在一套 21 项 `GoalWorkState` 中。它同时被 MCP、Web、Capsule、Momentum 和 Skill 解释，造成以下重复问题：

- Runtime 完成后仍要手动 release / complete，页面会短暂显示“待执行、完成待确认、等待交接”。
- `needs_changes` 会像第一次执行，丢失“上次已经做过、这次是返工”的连续语义。
- 所有 open/triggered Risk 都可能进入用户待决定，扩大了人类 Gate。
- Human Review 既能在对话里确认，又要求用户到 Decision Center 重复提交。
- 已接受 Goal 只能 successor/replacement，普通需求修订不能保留同一 Goal 身份。
- 多个前端入口各自翻译底层状态，写入后依赖轮询或 reload 才看到新状态。
- Session 恢复与项目连接会重复确认，用户需要理解 Claim 等内部机制。

## 用户结果

用户在连接、执行、返工、复核、人工验收、风险处理、需求修订和 Session 恢复中始终只看到六个短状态：`可继续、进行中、等你、等待中、受阻、已完成`，并能看到一个稳定主动作。机械收尾自动完成，历史 Run、Evidence、Review 和旧 Contract revision 保留。

## 范围

### 包含

- 增加纯派生 `GoalActionProjection`、稳定动作排序和基于 canonical facts 的 `action_token`。
- Claim、Evidence、Review Obligation 和 Goal Contract revision 数据迁移。
- action-aware select、过期 token 冲突恢复、生命周期写入回执。
- Executor / Reviewer / Revalidator / Clarifier 自动释放 Claim。
- 统一 completion reconciliation、叶子和复合父 Goal 自动完成/重新打开。
- Human Review attention token、可信对话原子决定和反证重开。
- Risk 只把不可替代的 accept 决策交给用户；mitigate/avoid 由 Runtime 处理。
- 同一 Accepted Goal 的 contract-update revision 与影响传播。
- Web/Capsule/Momentum 共用短状态和主动作映射，mutation 后局部更新。
- 唯一 workspace 自动连接和数据库驱动的 Session 恢复。
- MCP 边界旧字段兼容；Skill 删除正常链路中的手动 release / complete 和重复确认。
- 幂等、事务性迁移与旧 fixture 回归。

### 不包含

- 不新增持久化工作状态或通用工作流引擎。
- 不自动领取或执行下一个无关 Goal。
- 不增加 WebSocket / SSE。
- 不删除历史 Candidate、Rewire、replacement relation、事件或审计数据。
- 不安装、不发布、不修改正式数据库。

## 模块与调用链

### 1. 动作投影与迁移

- `src/v1/types.ts`：动作、投影、回执、revision 和兼容类型。
- `src/v1/action-projection.ts`：从一次 Board snapshot 派生动作、主动作、进度、短状态和 token；不得逐 Goal 查询数据库。
- `src/v1/store.ts`：单事务 schema migration；revision 1 回填；新增必要索引。
- `src/v1/coordinator.ts`：提供 projection API；legacy `GoalWorkState` 只在边界适配器生成。

### 2. 生命周期收口

- `src/v1/lifecycle-reconciliation.ts`：角色完成条件、自动 release、Goal completion/reopen、父级传播。
- 所有 Evidence、Review、Human Review、Risk、Revalidation、revision、Run 写入在同一事务内调用 reconciliation，并返回 `ActionTransitionReceipt`。
- blocked Run 不自动释放；failed Run 记录后释放；Evidence 不齐时 Claim 保留且动作变为 `submit_evidence`。

### 3. Contract revision 与树连续性

- `goal_contract_revisions` 保存完整 Contract snapshot 和 change effect（metadata/revalidate/rework）。
- Goal Tree Proposal 增加 `contract_update` 条目；pending revision 阻止旧版新 Claim。
- material revision 撤销旧 Claim、abandon 未终结 Run，并使父级、coverage 和直接 depends_on 消费者重新验证。
- coverage 记录子 Goal revision；旧 coverage 不再证明新 revision。

### 4. 展示与恢复

- `src/web/action-presentation.ts` 是 Web、Capsule、Momentum 唯一的六状态/CTA 映射。
- Web mutation 消费回执并局部更新；四秒 cursor poll 只合并外部变化；表单有 dirty guard 和 token 冲突。
- 项目解析顺序：显式 binding、有效 connection、唯一 realpath workspace membership、询问。
- 默认 focus 顺序：active、等你、最近 work recorded 未完成、Available。

### 5. 边界与清理

- MCP 返回 projection 和 transition receipt，同时在单一 adapter 中保留旧 `work_state` 字段。
- 删除内部 `GoalWorkState` 分支、`riskNeedsDecision`、重复状态映射、正常 `completion_pending/handoff_pending` 生产和 accepted Goal successor 生产。
- Skill 正常路径不再要求手动 release、complete 或唯一项目重复确认。

## 关键行为契约

### 动作投影

- 一个 Goal 可返回多个独立动作；主动作排序固定：安全恢复 > 用户确认 > active work > rework/revalidate > clarify/child > Runtime review > evidence/risk > wait。
- `action_id` 由 kind、actor 和 target type/id 稳定派生；Contract revision 由 `action_token` 约束，避免相同动作在修订后无意义换 ID。
- `action_token` 只哈希会改变当前动作的 Goal revision、Claim/Run、Evidence verdict、Review obligation/verdict、blocking Risk 和依赖/coverage facts。
- 写操作携带 `action_id + action_token`；过期时不写入，并返回最新 projection 和恢复说明。

### 自动释放与完成

- Executor：completed 且当前 revision 必需 Evidence 齐全。
- Reviewer：Review 提交即结束 Run 并释放 Claim。
- Revalidator：revalidate 写入即结束 Run 并释放 Claim。
- Clarifier：完整 Proposal 提交即结束 Run 并释放 Claim。
- 最后一道 Gate 消失时自动满足 Goal 并传播父级，不生产正常 `completion_pending`。

### Human Review

- attention token 绑定 Goal、revision、obligation、criterion scope 和 Evidence 摘要。
- 唯一且有效的可信对话批准原子写 Evidence + Review；多目标、含糊或过期仍留 Decision Center。
- 当前 revision 的较新 human verdict 可推翻较早批准并重新打开 Goal/父级，旧历史不删除。

### Risk

- Decision Center 仅消费 actor=user 的 `accept_risk` action。
- mitigate/avoid 生成 Runtime action；none/defer 只记录；Runtime 不能 accept。
- resolved 必须有当前 revision Evidence、摘要和 residual gaps。

## 验收标准

1. 精确用户状态序列符合已确认 Test Plan，且没有瞬时“待执行、完成待确认、等待交接”。
2. 六个短状态由一个共享函数产生，列表、详情、Runtime 头、Capsule、Momentum 一致。
3. lifecycle mutation 回执立即包含最新 projection、受影响 Goal、summary 和 cursor。
4. 自动 release/complete、返工、Human Review、Risk、revision、父级传播和 token 并发都有定向测试。
5. 早期、v0.1.13 和新库 migration 幂等；对象数量和旧业务状态不被批量改写。
6. TypeScript、build、完整测试通过；无 N+1 projection 查询；旧状态只作为只读兼容视图和历史测试存在，不再决定新写入、Runtime 可领取动作或六状态展示。
7. 全新本地 Session 手动完成连接、执行、返工、Human Review、Risk、revision、完成和恢复闭环。
8. 原有 `runtime-header-status-alignment` 未提交改动被保留并接入统一短状态。

## 验证命令

- `pnpm typecheck`
- `pnpm build`
- `node --import tsx --test tests/v1.test.ts tests/mcp.test.ts tests/web.test.ts tests/desktop-tui.test.ts tests/goal-momentum.test.ts`
- `pnpm test`
- 静态搜索旧状态生产、Risk 全量决策扫描、Skill 手动收尾文本。
- 使用临时数据库跑 migration 两次并对比核心表数量/状态。

## 假设与边界

- 正常产物齐全后自动 release，门禁齐全后自动 complete。
- 前端六状态纯派生，不持久化，不参与业务判断。
- Contract material revision 只需一次用户确认；semantic review 不另造人工 Gate。
- MCP/Web 旧字段通过只读兼容投影继续提供；动作投影是唯一的新流程决策源，内部不持久化第二套状态机。
- 新版本产生写入后，应用回退依赖升级前备份；本轮只在临时副本验证。

## 实施与验证结果（2026-09-01）

### 已完成

- 增加统一动作投影、稳定主动作、canonical `action_token` 和生命周期写入回执。
- `Available` 直接返回 `action_id + action_token + action kind/target`，可领取动作以动作投影为准；旧 `work_state/next_action` 仅供老客户端阅读。
- Executor、Reviewer、Revalidator、Clarifier 的正常完成路径自动释放 Claim；统一 reconciliation 自动完成或重新打开叶子与父 Goal。
- Human Review、反证、Risk、Contract revision、coverage 与下游 revalidation 已接入同一 revision 和动作模型。
- Web、Capsule、Momentum 共用六状态展示；写入消费回执局部更新、保留页面上下文并通过 live region 播报。
- Decision Center 的真实浏览器验收发现并修复一项遗漏：决定写入成功后，集成 Inbox 的旧卡片曾不会立即移除；现在会原位移除、选择下一项并显示回执，不 reload。
- migration 30 在单事务中回填 revision 1、Claim action context 和 coverage revision；迁移测试验证失败回滚与重复打开幂等。
- `Available` 和动作投影都只读取一次 Board snapshot。300 Goal 基准中，`Available` 中位耗时由本轮记录的旧路径约 `586.22 ms` 降至 `45.91 ms`，动作投影中位 `5.35 ms`、p95 `8.11 ms`。

### 验证证据

- `pnpm typecheck`：通过。
- `pnpm build`：通过。
- `pnpm test`：`418/418` 通过，覆盖安装、迁移、MCP、Session、Available、Risk、Review、Web、Desktop 与 E2E。
- 定向测试：action token、自动 release/complete、needs_changes、Human Review、Risk、Contract revision、父子连续性和 Decision Center 均通过。
- 真实浏览器：桌面/390px 移动宽度六状态无横向溢出；Decision Center 提交后卡片立即消失、回执出现、URL 与滚动上下文保留。
- `git diff --check`：通过。

### 兼容与未执行项

- 旧 `GoalWorkState` 类型和派生器仍保留为只读兼容视图，因为当前 MCP/Web 旧字段和历史测试仍消费它；它不持久化，也不再决定新动作、生命周期写入或用户六状态。彻底删除属于破坏性 API 清理，不在本轮兼容范围内。
- 未安装、未发布、未触碰正式数据库，符合本轮边界。
- 未使用正式数据库 online backup 副本做发布前迁移演练；本轮使用早期 fixture、v0.1.13 fixture 和临时数据库验证。
- 未在一个全新外部 Codex Session 中人工逐项走完全部七条旅程；这些链路已由自动化测试覆盖，真实浏览器人工覆盖了短状态、移动布局和 Decision Center 即时刷新。
