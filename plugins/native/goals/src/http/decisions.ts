import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { goalsFailure, goalsRoute } from "./failure.js";
import { goalsActions } from "../actions.js";
import type { GoalTreeProposalDecideInput } from "../contract/governance-collaboration.js";
import type { GoalsRoutePorts } from "./types.js";

/** `goals.tree-decide`: the person's decision on a proposed change to the Goal tree, item by item or the whole proposal. */
export function goalDecisionRoutes(ports: GoalsRoutePorts): PluginRouteBinding[] {
  return [goalsRoute("goals.tree-decide", ports, async (context) => {
    const body = context.body;
    if (body.decisions != null && !Array.isArray(body.decisions)) {
      return goalsFailure(new ActionError("actions.input_invalid", "decisions 必须是条目决定列表"));
    }
    const confirmsWholeProposal = body.confirm_all_pending === true;
    const idempotencyKey = String(body.idempotency_key ?? "");
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const result = await context.actions.invoke(goalsActions.treeDecide, {
      proposal_id: context.params.proposalId!,
      ...(body.decisions == null ? {} : { decisions: body.decisions as GoalTreeProposalDecideInput["decisions"] }),
      ...(reason ? { reason } : {}),
      confirm_all_pending: confirmsWholeProposal,
      idempotency_key: idempotencyKey,
    });
    return { status: 200, body: result };
  })];
}
