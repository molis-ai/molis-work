# WI03 C2a 交回：Goals 模块与公开合同清理

本批完成模块清理与局部构建，尚不构成等级4或整仓可运行。未宣称 C2 / 03 / F1–F9 完成。未 commit/push。未动 Native/Host、Execution/Evidence/Governance、测试、Skill、全仓构建。

## 本批代码变化

Goals 公开写入口只剩当前职责：创建 Goal、加/停关系、指导、归档/回收站、规划方法与图检查、事件 note/report/agree/close/`resumeWork(reason)`、导入用 `adoptOwner`。旧 Draft 编辑、Policy 写、祖先重开、compound/completion/revalidation/revision 写、continue/reopen 别名不再存在于本模块。

## 删除的文件

- `modules/goals/src/lifecycle-compound.ts`（被拒的祖先写类，未再抽取）
- `modules/goals/src/lifecycle-completion.ts`
- `modules/goals/src/lifecycle-revalidation.ts`
- `modules/goals/src/lifecycle-revisions.ts`
- `modules/goals/src/lifecycle-reasons.ts`
- `modules/goals/src/planning/contract-structure.ts`
- `modules/goals/src/planning/proposal-coordination.ts`
- `modules/goals/src/planning/decomposition-validation.ts`
- `modules/goals/src/planning/decomposition-coverage.ts`

## 删除的公开 API / hooks

| 位置 | 去掉 |
| --- | --- |
| `GoalsLifecycleApi` / `GoalLifecycleCommands` | 只留 `setArchived` / `setTrashed` / `listTrashed`。去掉 compound reopen、TTransition、revalidation view |
| `GoalsModule` / `GoalsModuleHooks` | `supersedePendingContractProposals`、祖先 reopen 构造、lifecycle 上的 compound 方法 |
| `GoalCommands` | `updateDraftGoal`、`setPolicy`、accepted/closed_leaf 完整合同门禁、`coverage_contract_revisions` 现写、祖先 hook |
| `GoalArchiveCommands` | `reopenCompoundAncestorsForUntrustedChild` / `reconcileCompoundAncestors`。游标改为本笔 `appendEvent` |
| `ConfirmedRelationCommands` | 不再接收 lifecycle，不再 reopen 父 Goal |
| `GoalsPlanningApi` / `GoalsPlanningEngine` | `.metrics` 包装、`.contracts`、`.proposals`、`compoundCoverageBlocksClosure` |
| `validatePlanningProposalGraph` | candidate / contract / dependency 任意 payload。只处理 `kind=goal\|relation` |
| `GoalEventFactsApi` / 实现 / 读服务 | `continueWithEventWork`、`reopenCompletedEventWork` |
| Goals 合同 exclusive 写类型 | `AcceptDraftGoalInput`、`ApplyAcceptedContractRevisionInput`、`AppliedGoalContractRevision`、`GoalContractPlanningApi`、`GoalsProposalCoordinationApi`、`GoalDependencyReference`、`GoalContractStructureConflict`、`ContinueGoalEventWork*`、`ReopenCompletedEventWorkInput`、`UpdateRiskInput`、`SetRiskStateInput` |

## 保留的当前 / 历史职责

- `createGoal` / `addRelation` / `deactivateRelation` / `applyConfirmedRelations`（intent、当前树、import）
- 图校验：`validateRelationAddition`、`proposalGraphIssues`、`wouldCreatePartOfCycle`、`validateBoardGraph`、`analyzeChange`（当前 `goal_event_work_status`）
- 根 helper：`planningMetrics`、`analyzeGoalChangeImpact`、循环/拓扑/祖先/依赖
- 规划方法库、当前事件 adoption、`saveProjectMethod`
- 指导、archive/trash（回收站记录、关系暂停/恢复、active goal、`blockingWork` 历史活动只读、同键回执/事务、journal 游标）
- 事件：`resumeWork(reason)`、`adoptOwner`（含历史 `source=continue` 类型与 migration/intent）、配置/约定/报告既有语义
- `event_owner_continued` **只读解码**与 schema/migrations/历史行不动
- query / repository / 历史 revision、coverage、policy、risk **记录**读取
- **暂时留在 Goals 合同供 C2b：** `GoalLifecycleReason`、`GoalRevisionDependentTransition`（Execution 合同仍引用）

## 验证（仅 Contracts + Goals）

| 命令 | 结果 | 日志 |
| --- | --- | --- |
| `pnpm --filter @molis-ai/molis-work-contracts build` | EXIT 0 | `/private/tmp/molis-work-flow-cleanup/03-c2a-contracts-build.log` |
| `pnpm --filter @molis-ai/molis-work-module-goals typecheck` | EXIT 0 | `/private/tmp/molis-work-flow-cleanup/03-c2a-goals-typecheck.log` |
| `pnpm --filter @molis-ai/molis-work-module-goals build` | EXIT 0 | `/private/tmp/molis-work-flow-cleanup/03-c2a-goals-build.log` |

未跑全仓 build、boundary、测试、根探针。`pnpm_config_verify_deps_before_run=warn`，无 install/repair。

## 留给后续批次的下游引用（预期暂时编不过）

**C2b Execution / Evidence / Governance**

- Execution 合同仍用 `GoalLifecycleReason`、`GoalRevisionDependentTransition` 与 claim/run **写** API；本批未改 Execution 模块
- Evidence 仍有 submit/correct 写 lifecycle；本批未改
- Governance 仍有 Review/Clarification 写与 Candidate/Contract/Rewire 写 store；本批未改
- 历史 Claim/Run/Review **query/schema/migrations** 仍应由 C2b 保留

**C2c Native / Host**

- `GoalEventApplication` / entry capabilities 仍转发已删的 `continueWithEventWork` / `reopenCompletedEventWork`
- 树物化仍调 `planning.contracts`、`closeAcceptedCompound`、`updateConfirmedDraft`、`applyConfirmedPolicy`/`applyConfirmedRisk`、`planning.proposals.validateCandidateCoordination`
- `goals-entry-capabilities` 仍登记 `setPolicy` / `addRisk` / `revalidate` / `evaluateCompletion`（Host B 已不注册，实现侧待卸）
- Host `goal-project-application` 仍传 `supersedePendingContractProposals`、`eligibility.assertRunStartAllowed`、Execution/Evidence **commands**
- Native 仍导出 `ExecutionValidationApplication`、`DraftDialogueApplication`、`GoalAvailability`、action projection
- 文档展示已在 C1 改读事件状态；剩余旧展示类型由 C2c 按真实消费者收

**C2d 测试**

- 旧 Draft/Claim/Run/continue 别名测试需映射或改为 `resumeWork` / v35 历史 fixture
- 必须存活：`goal-event-document-history`、migration30、导入 e2e、Host withScope、clipboard e2e、project-catalog、migration12、当前事件/规划/树/导入

未改四份 `tests/fixtures/goal-event-v35/*.sql`。未宣称根验收。

主复核：删除、保留调用和局部构建证据满足C2a范围，`03-c2a-root-metrics.log`独立通过当前open/completed/cancelled计数与拓扑回归，`git diff --check HEAD`通过。C2b/C2c/C2d未完成，不能把本批描述为完整用户流程。另有已查明仅旧Native调用的Impact写服务，已在03spec记录并安排C2c随最后调用者删除；当前历史impacts.list保留。
