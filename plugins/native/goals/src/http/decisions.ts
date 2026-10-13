import { goalsActions } from "../actions.js";
import type { GoalTreeProposalDecideInput } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { GoalsHttpContext } from "./types.js";

export async function handleGoalDecisionsHttp(context: GoalsHttpContext): Promise<boolean> {
  const goalTreeProposalMatch = context.pathname.match(
    /^\/api\/goal-tree-proposals\/([^/]+)\/decision$/,
  );
  if (context.method === "POST" && goalTreeProposalMatch) {
    const body = await context.readBody();
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
