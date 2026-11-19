/**
 * PEQ-03 迁移例外：供项目库 3→4／6→7 存量搬迁（可信决定与要求认可交接）读取 Goals 冻结的 v5 定义与校验函数。
 * 删除条件：项目库从 v3/v5/v6 升级到 v7 的存量搬迁段按 docs/system/CONTRACT-CHANGES.md「当前保留机制」退役后，连同本文件一并删除。
 */
export {
  GOALS_APPROVAL_OUTCOMES_SQL,
  GOALS_APPROVAL_TRANSFER_SOURCE,
  GOALS_V5_LIBRARY,
  GOALS_APPROVAL_TRANSFER_TABLES,
  goalsApprovalTransferManifest,
  isGoalsApprovalSource,
  readGoalsApprovalTransfer,
  verifyTreeItemDecisionHistory,
  assertGoalApprovalHistory,
  goalApprovalOutcomes,
  readGoalApprovalOutcome,
} from "@molis-ai/molis-work-plugin-goals";
