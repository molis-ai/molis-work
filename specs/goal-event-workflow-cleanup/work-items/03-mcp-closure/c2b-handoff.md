# WI03 C2b 交回：Execution / Evidence / Governance 写路径删除

本批完成模块清理与局部构建，尚不构成整仓可运行。未宣称 C2 / 03 / F1–F9 完成。未改 Native/Host、测试、Skill、全仓构建。未 commit/push。四份 v35 SQL 未动。

主复核纠正后：无当前职责的 repository 写方法已删除，不只是藏 commands。

## 本批代码变化

三个模块不再提供旧 Claim/Run/Evidence/Review/Clarification/Contract/Candidate/Rewire **写协议**，也不再保留无当前调用者的 repository insert/update/complete/waive。公开组装是 query + 当前树/事件决定。没有 null/no-op commands。

## 删除的文件

- `modules/execution/src/lifecycle.ts`
- `modules/execution/src/contract-revision.ts`
- `modules/execution/src/impact-policy.ts`
- `modules/evidence-verification/src/lifecycle.ts`
- `modules/evidence-verification/src/coverage.ts`
- `modules/governance-collaboration/src/review-lifecycle.ts`

## 删除的公开 API / hooks / repository 写方法

| 位置 | 去掉 |
| --- | --- |
| Execution 合同 / `ExecutionModule` | `ExecutionCommandApi`、全部 claim/run/lease/revision 写输入与回执、`ExecutionImpactPolicyApi`、`commands`、`lifecycle`、`appendEvent`/`assertRunStartAllowed` 构造 hook |
| ExecutionRepository | `insertClaim`、`updateClaimLease`、`updateClaimState`、`updateClaimContractRevision`、`insertRun`、`updateRun`、`completeRun`、`abandonActiveRuns`；无调用者的 `expiredActiveClaims`/`getClaimById`/`immediate`/`eventCursor`；exclusive `ExecutionEventInput` |
| Evidence 合同 / 模块 | `EvidenceCommandApi`、submit/correct/attach 写类型、`hasPassingEvidence`/`uncoveredCriterionIds`/`latestCriterionReworkSeq` 旧完成门禁、`coverage` 投影 helper、`commands`/`lifecycle` |
| EvidenceRepository | `insertEvidence`、`insertCorrection`、`attachReview`、`StoredEvidenceInput`、`PassingEvidenceSubmission`、`latestCriterionReworkSeq`、`passingEvidenceSubmissions`、无调用者的 `getCorrection`/`immediate`/`eventCursor`；exclusive `EvidenceEventInput` |
| Governance 合同 / 模块 | `GovernanceReviewApi`、Clarification **写**、Contract/Candidate/Rewire 写 store 与 state 转移、provenance 的 contract/clarification 规范化写助手 |
| GovernanceRepository | `insertReview`、`insertReviewObligation`、`updateReviewObligation`、`waivePendingObligationsForRevision`、`StoredReview*`、无当前读者的 `passingReviewActorCountAfterEventSeq`/`latestCompletedWorkRunEventSeq` |
| C2a 留给 Execution 的 Goals 类型 | `GoalLifecycleReason`、`GoalRevisionDependentTransition`，以及只承载它们的 `GoalRevalidationInput`/`GoalRevalidationDecision`/`GoalCompletionResult` |

`packageDescriptor.capabilities`：Execution `query.v1`+`repository.v1`；Evidence `records.v1`+`locator-preflight.v1`；Governance `proposals.v1`+`decisions.v1`+`event-decisions.v1`。无版本/依赖/lockfile 改动。

## 保留的当前 / 历史职责

- Execution：Claim/Run **记录类型**、`ExecutionQueryApi`（含 `activeClaimIdsForGoal`/`activeRunIdsForGoal`/`listNonterminalRuns`/`latestCompletedWorkRunEventSeq`）、schema/migrations、`mapExecutionClaim`/`mapExecutionRun`。项目删除历史活动守卫仍可读这些查询。
- Evidence：Evidence/Correction **记录**、list/get、`getReviewReference`、`getProjectReferenceSource`、`getCorrectionForTarget`（读映射用）、locator/文件阅读、schema/migrations、`mapEvidence*`。当前完成只走 Goals 事件。
- Governance：`eventDecisions`；有限 Goal Tree submit/check/decide/item/records；`appendEvent`/`immediate`/`eventCursor`（当前树幂等/事务消费）；`materializeAtomically`/`preview*`；`normalizeProposalSource`；历史 Review/Candidate/Contract/Rewire/Clarification **query 与 mapper**（含 `latestNeedsChangesReviewEventSeq`）；schema/migrations；`legacyProposalView`。
- 历史 `GoalContractRevisionRecord.effect` 仍用 `GoalContractRevisionEffect`。

**Goals 合同收口（不是新协议）：** C2a 只因 Execution 写合同引用才留下 `GoalLifecycleReason` / `GoalRevisionDependentTransition`。本批删掉那些写出口后从 Goals 合同拿掉。未改 `modules/goals/src`。

## 验证

初次 C2b 构建见 `03-c2b-*-build.log` / `03-c2b-*-typecheck.log`。本纠正后只重跑三模块：

| 命令 | 结果 | 日志 |
| --- | --- | --- |
| `pnpm --filter @molis-ai/molis-work-module-execution typecheck` + `build` | EXIT 0 | `/private/tmp/molis-work-flow-cleanup/03-c2b-correction-execution-typecheck.log`、`...-build.log` |
| `pnpm --filter @molis-ai/molis-work-module-evidence-verification typecheck` + `build` | EXIT 0 | `/private/tmp/molis-work-flow-cleanup/03-c2b-correction-evidence-typecheck.log`、`...-build.log` |
| `pnpm --filter @molis-ai/molis-work-module-governance-collaboration typecheck` + `build` | EXIT 0 | `/private/tmp/molis-work-flow-cleanup/03-c2b-correction-governance-typecheck.log`、`...-build.log` |

未改 contracts，未重跑 contracts/Goals。未跑全仓、boundary、测试、根探针。`pnpm_config_verify_deps_before_run=warn`，无 install/repair。

## 留给 C2c 的 Native / Host 构造与导出

Host `goal-project-application.ts` 仍会：

- `new ExecutionModule({ ..., appendEvent, assertRunStartAllowed: this.eligibility... })` 并暴露 `execution.commands`
- `new EvidenceVerificationModule({ ..., appendEvent })` 并暴露 `evidenceVerification.commands`
- 组装 `governance.reviews` / Clarification 写 / `supersedePendingContractProposals`
- 把 `blockingWork` 接到 `execution.query.activeClaimIdsForGoal` / `activeRunIdsForGoal`（**保留** query；模块构造现在只要 `{ db }`）

Native 仍导出/构造：

- `ExecutionValidationApplication`、claim/run/evidence 写命令、`GoalAvailability`、`DraftDialogueApplication`
- 树物化 `planning.contracts`、`closeAcceptedCompound`、`updateConfirmedDraft`、`applyConfirmedPolicy`/`Risk`、`planning.proposals.validateCandidateCoordination`、`recordTreeCandidateApproval`/`recordTreeRewireDecision`
- `GoalEventApplication` 的 `continueWithEventWork` / `reopenCompletedEventWork`
- `goals-entry-capabilities` 的 `setPolicy`/`addRisk`/`revalidate`/`evaluateCompletion`
- 已退役的 `waivePendingObligationsForRevision`（`contract-revision-transition`）

这些引用本批故意不补兼容层。C2c 按真实当前消费者改构造/导出：Execution/Evidence 只接 `query`；Governance 接 `records`（树）+ `decisions.materializeAtomically` + `eventDecisions` + clarification **读** + provenance。

**C2d** 仍负责测试映射（migration12 改 SQL fixture、document-history 用 v35 + `resumeWork` 等），不为夹具保留写 API。

未宣称根验收。

主复核通过本批模块范围：原repo写方法遗漏已补正，真实历史schema/mapper/query与当前树事务保留；三模块补正typecheck/build六项EXIT0已核实，Contracts/Goals初次构建核实，diff空白检查通过。接下来C2c完成真实组合与整仓验证，尚未达到整体等级4。
