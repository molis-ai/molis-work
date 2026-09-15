import type { GoalTreeProposalRecord } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import { findGoalView } from "./proposal-ui-model.js";
import type { GoalsSafetyItem } from "./safety-ui-model.js";
import type { GoalsDecisionView, GoalsDecisionGroup } from "./decision-view.js";

export function goalTreeProposalNeedsDecision(proposal: GoalTreeProposalRecord): boolean {
  return (proposal.state === "pending" || proposal.state === "partially_applied") &&
    proposal.items.some((item) => item.state === "pending" || item.state === "conflict");
}

export function goalTreeProposalAttentionGoalId(
  proposal: GoalTreeProposalRecord,
  goalExists: (goalId: string) => boolean,
  runGoalId?: (runId: string) => string | null,
): string | null {
  if (proposal.root_goal_id && goalExists(proposal.root_goal_id)) return proposal.root_goal_id;
  if (proposal.discovered_in_run_id && runGoalId) {
    const goalId = runGoalId(proposal.discovered_in_run_id);
    if (goalId && goalExists(goalId)) return goalId;
  }
  for (const proposalItem of proposal.items) {
    const owner = [
      proposalItem.payload.goal_id,
      proposalItem.payload.from_goal_id,
      proposalItem.payload.to_goal_id,
    ].find((goalId) => goalExists(String(goalId ?? "")));
    if (owner) return String(owner);
  }
  return null;
}

export function goalTreeProposalOwnerGoalId<T extends GoalsSafetyItem>(proposal: GoalTreeProposalRecord, view: GoalsDecisionView<T>): string | null {
  return goalTreeProposalAttentionGoalId(
    proposal,
    (goalId) => Boolean(findGoalView(view, goalId)),
    (runId) => view.snapshot.runs.find((item) => item.run_id === runId)?.goal_id ?? null,
  );
}

export function buildDecisionGroups<T extends GoalsSafetyItem>(view: GoalsDecisionView<T>): GoalsDecisionGroup<T>[] {
  const groups = new Map<string, GoalsDecisionGroup<T>>();
  const ensure = (goalId: string | null): GoalsDecisionGroup<T> => {
    const key = goalId ?? "$board";
    const existing = groups.get(key);
    if (existing) return existing;
    const created: GoalsDecisionGroup<T> = {
      ownerGoalId: goalId,
      item: findGoalView(view, goalId),
      goalTreeProposals: [],
    };
    groups.set(key, created);
    return created;
  };
  view.snapshot.goal_tree_proposals
    .filter((proposal) => proposal.origin === "native" && goalTreeProposalNeedsDecision(proposal))
    .forEach((proposal) => ensure(goalTreeProposalOwnerGoalId(proposal, view)).goalTreeProposals.push(proposal));
  return [...groups.values()]
    .filter((group) => group.goalTreeProposals.length > 0)
    .sort((left, right) => right.goalTreeProposals.length - left.goalTreeProposals.length);
}

export function pendingDecisionCount<T extends GoalsSafetyItem>(view: GoalsDecisionView<T>): number {
  return view.snapshot.goal_tree_proposals.filter((item) => item.origin === "native" && goalTreeProposalNeedsDecision(item)).length;
}

export function decisionGroupCount<T extends GoalsSafetyItem>(group: GoalsDecisionGroup<T>): number {
  return group.goalTreeProposals.length;
}

export function decisionTypeCounts<T extends GoalsSafetyItem>(view: GoalsDecisionView<T>) {
  return { proposals: pendingDecisionCount(view) };
}

export function countGoalDecisions<T extends GoalsSafetyItem>(view: GoalsDecisionView<T>, goalId: string): number {
  const group = buildDecisionGroups(view).find((item) => item.item?.goal.goal_id === goalId);
  return group?.goalTreeProposals.length ?? 0;
}
