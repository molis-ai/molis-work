import type { AsyncApplicationMethods } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { GoalTreeApplicationApi } from "@molis-ai/molis-work-plugin-goals";
import type { GoalTreeProposalDecisionAuthority } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { RuntimeGoalTreeConfirmation } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { McpPresentationErrorFactory } from "./query-presentation.js";

/** Validate wire confirmation before requesting provenance from the trusted host. */
export function runtimeGoalTreeDecisionInput(
  args: Record<string, unknown>,
  authority: (confirmation: RuntimeGoalTreeConfirmation) => GoalTreeProposalDecisionAuthority,
  createError: McpPresentationErrorFactory,
): Parameters<GoalTreeApplicationApi["decideGoalTreeProposal"]>[0] {
  if (args.user_confirmed !== true) {
    throw createError("mcp.user_confirmation_required", "只有用户刚刚在当前对话中明确确认后，Runtime 才能提交 Goal Tree 决定");
  }
  const runtimeActorId = typeof args.runtime_actor_id === "string" ? args.runtime_actor_id.trim() : "";
  if (!runtimeActorId) {
    throw createError("mcp.runtime_actor_required", "当前 Runtime 决定需要稳定的 runtime_actor_id，用于审计和恢复");
  }
  const confirmationSummary = typeof args.confirmation_summary === "string" ? args.confirmation_summary.trim() : "";
  if (!confirmationSummary) {
    throw createError("mcp.confirmation_summary_required", "请简要记录用户在当前对话中确认了什么");
  }
  return {
    board_id: String(args.board_id),
    proposal_id: String(args.proposal_id),
    runtime_actor_id: runtimeActorId,
    authority: authority({
      runtimeActorId, confirmationSummary, proposalId: String(args.proposal_id),
      wholeConfirmationPrompted: args.whole_confirmation_prompted === true,
      idempotencyKey: String(args.idempotency_key),
    }),
    decisions: args.decisions as Parameters<GoalTreeApplicationApi["decideGoalTreeProposal"]>[0]["decisions"],
    reason: args.reason == null ? confirmationSummary : String(args.reason),
    confirm_all_pending: args.confirm_all_pending === true,
    idempotency_key: String(args.idempotency_key),
  };
}

/** Wire conversion only; authority is supplied by the host before dispatch. */
export function createMcpGoalTreeHandlers(application: GoalTreeApplicationApi | AsyncApplicationMethods<GoalTreeApplicationApi>) {
  return {
    molis_work_v1_goal_tree_propose: async (args: Record<string, unknown>) =>
      application.submitGoalTreeProposal(args as unknown as Parameters<GoalTreeApplicationApi["submitGoalTreeProposal"]>[0]),
    molis_work_v1_goal_tree_read: async (args: Record<string, unknown>) =>
      application.listGoalTreeProposals(args as unknown as Parameters<GoalTreeApplicationApi["listGoalTreeProposals"]>[0]),
    molis_work_v1_goal_tree_check: async (args: Record<string, unknown>) =>
      application.checkGoalTreeProposal(args as unknown as Parameters<GoalTreeApplicationApi["checkGoalTreeProposal"]>[0]),
    molis_work_v1_goal_tree_decide: async (args: Record<string, unknown> | Parameters<GoalTreeApplicationApi["decideGoalTreeProposal"]>[0]) =>
      application.decideGoalTreeProposal(args as unknown as Parameters<GoalTreeApplicationApi["decideGoalTreeProposal"]>[0]),
  };
}
