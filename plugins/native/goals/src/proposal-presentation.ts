import type { GoalTreeProposalRecord } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import { GOALS_RELATION_LABELS as RELATION_LABELS } from "./relation-presentation.js";
import { findGoalView, type GoalsProposalView, type GoalsProposalUiPrimitives } from "./proposal-ui-model.js";

export function createGoalsProposalPresentation(L: GoalsProposalUiPrimitives["translate"]) {
function proposedGoalName(
  value: unknown,
  view: GoalsProposalView,
  proposal?: GoalTreeProposalRecord,
): string {
  const goalId = String(value ?? "");
  if (!goalId) return L("未指明 Goal");
  const proposed = proposal?.items
    .filter((item) => item.kind === "goal")
    .map((item) => item.payload)
    .find((goal) => String(goal.goal_id ?? "") === goalId);
  if (proposed?.title) return String(proposed.title);
  return findGoalView(view, goalId)?.goal.title ?? goalId;
}

function goalTreeRelationPayloads(payload: Record<string, unknown>): Record<string, unknown>[] {
  // A stored relation item may carry several relations; new items carry one.
  const nested = payload.relations ?? payload.relation;
  const values = Array.isArray(nested) ? nested : nested == null ? [payload] : [nested];
  const proposedGoal = payload;
  const goalId = String(proposedGoal.goal_id ?? "").trim();
  return values
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value))
    .map((relation) => ({
      ...relation,
      from_goal_id: relation.from_goal_id === "$new_goal" ? goalId : relation.from_goal_id,
      to_goal_id: relation.to_goal_id === "$new_goal" ? goalId : relation.to_goal_id,
    }));
}

function goalTreeProposalItemCopy(
  item: GoalTreeProposalRecord["items"][number],
  view: GoalsProposalView,
  proposal: GoalTreeProposalRecord,
): { title: string; detail: string; facts: string[] } {
  const payload = item.payload;
  const operation = item.operation === "create" ? L("新增") : L("停止使用");
  if (item.kind === "goal") {
    const goal = payload;
    const title = String(goal.title ?? proposedGoalName(goal.goal_id, view));
    const outcome = String(goal.outcome ?? "").trim();
    const why = String(goal.why ?? "").trim();
    return {
      title: L("{operation} Goal「{title}」", { operation, title }),
      detail: outcome || item.reason,
      facts: [
        ...(why ? [L("为什么：{why}", { why })] : []),
        ...(outcome ? [L("要达成：{outcome}", { outcome })] : []),
      ],
    };
  }
  const relations = goalTreeRelationPayloads(payload);
  const facts = relations.map((relation) => {
    const from = proposedGoalName(relation.from_goal_id, view, proposal);
    const to = proposedGoalName(relation.to_goal_id, view, proposal);
    const relationLabel = RELATION_LABELS[String(relation.type ?? "")]?.out ?? L("建立关系");
    return L("{from} → {relation} → {to}", { from, relation: L(relationLabel), to });
  });
  return {
    title: L("{operation} {count} 条 Goal 关系", { operation, count: facts.length || 1 }),
    detail: item.reason,
    facts,
  };
}
return { proposedGoalName, goalTreeRelationPayloads, goalTreeProposalItemCopy };
}
