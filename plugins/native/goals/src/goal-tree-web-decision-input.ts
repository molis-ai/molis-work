import type { GoalTreeProposalDecideInput } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";

/** Prepare existing Web choices without authorizing or persisting a decision. */
export class GoalTreeWebDecisionInput {
  prepareDecision(_boardId: string, _proposalId: string, body: Record<string, unknown>) {
    const decisions = body.decisions as GoalTreeProposalDecideInput["decisions"];
    const decisionReason = typeof body.reason === "string" ? body.reason.trim() : "";
    return { decisions, decisionReason };
  }
}
