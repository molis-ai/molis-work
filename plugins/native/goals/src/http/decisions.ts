import { goalsActions } from "../actions.js";
import type { GoalTreeProposalDecideInput } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { GoalsHttpContext } from "./types.js";

export async function handleGoalDecisionsHttp(context: GoalsHttpContext): Promise<boolean> {
  const goalTreeProposalMatch = context.pathname.match(
    /^\/api\/goal-tree-proposals\/([^/]+)\/decision$/,
  );
  if (context.method === "POST" && goalTreeProposalMatch) {
    const body = await context.readBody();
    if (Array.isArray(body.risk_repairs)) {
      context.respond(400, {
        error: "结构提案不再接受风险修订。历史风险条目仍可阅读；新结构只提交 goal/create 与 relation/create|deactivate。",
        code: "goal_tree_proposal.kind_retired",
      });
      return true;
    }
    if (body.decisions != null && !Array.isArray(body.decisions)) {
      context.respond( 400, { error: "decisions 必须是条目决定列表" });
      return true;
    }
    try {
      const proposalId = decodeURIComponent(goalTreeProposalMatch[1]);
      const confirmsWholeProposal = body.confirm_all_pending === true;
      const idempotencyKey = String(body.idempotency_key ?? context.idempotencyHeader ?? "");
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      const result = await context.actions.invoke(goalsActions.treeDecide, {
        proposal_id: proposalId,
        ...(body.decisions == null ? {} : { decisions: body.decisions as GoalTreeProposalDecideInput["decisions"] }),
        ...(reason ? { reason } : {}),
        confirm_all_pending: confirmsWholeProposal,
        idempotency_key: idempotencyKey,
      });
      context.respond( 200, result);
    } catch (error) {
      context.respond( 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }
  return false;
}
