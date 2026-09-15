import type { GoalTreeProposalRecord } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { RiskRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import { goalTreeRiskDescription } from "./proposal-item-validation.js";
import { GOALS_RELATION_LABELS as RELATION_LABELS } from "./relation-presentation.js";
import { RISK_TREATMENT_LABELS } from "./risk-presentation.js";
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
    .filter((item) => item.kind === "goal" || item.kind === "contract" || item.kind === "candidate")
    .map((item) => goalTreeGoalPayload(item.payload))
    .find((goal) => String(goal.goal_id ?? "") === goalId);
  if (proposed?.title) return String(proposed.title);
  return findGoalView(view, goalId)?.goal.title ?? goalId;
}

function goalTreeGoalPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const nested = payload.goal ?? payload.proposed_goal;
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : payload;
}

function goalTreeRelationPayloads(payload: Record<string, unknown>): Record<string, unknown>[] {
  const nested = payload.relations ?? payload.relation ?? payload.proposed_relations;
  const values = Array.isArray(nested) ? nested : nested == null ? [payload] : [nested];
  const proposedGoal = goalTreeGoalPayload(payload);
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
  const operation = item.operation === "create" ? L("新增") : item.operation === "deactivate" ? L("停止使用") : L("更新");
  if (item.kind === "contract" || item.kind === "goal") {
    const goal = goalTreeGoalPayload(payload);
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
  if (item.kind === "relation" || item.kind === "dependency") {
    const relations = goalTreeRelationPayloads(payload);
    const facts = relations.map((relation) => {
      const from = proposedGoalName(relation.from_goal_id, view, proposal);
      const to = proposedGoalName(relation.to_goal_id, view, proposal);
      const relationLabel = RELATION_LABELS[String(relation.type ?? (item.kind === "dependency" ? "depends_on" : ""))]?.out ?? L("建立关系");
      return L("{from} → {relation} → {to}", { from, relation: L(relationLabel), to });
    });
    return {
      title: L("{operation} {count} 条 Goal 关系", { operation, count: facts.length || 1 }),
      detail: item.reason,
      facts,
    };
  }
  if (item.kind === "risk") {
    const description = goalTreeRiskDescription(item);
    const treatmentKey = String(payload.treatment ?? "") as RiskRecord["treatment"];
    const treatment = RISK_TREATMENT_LABELS[treatmentKey] ?? L("处理方式需要修正");
    const submittedPlan = String(payload.treatment_plan ?? "").trim()
      || (RISK_TREATMENT_LABELS[treatmentKey] ? "" : String(payload.treatment ?? "").trim());
    return {
      title: L("{operation}风险「{description}」", { operation, description }),
      detail: L("发生概率：{probability} · 影响：{impact} · 计划：{treatment}", {
        probability: String(payload.probability ?? L("未说明")),
        impact: String(payload.impact ?? L("未说明")),
        treatment: L(treatment),
      }),
      facts: submittedPlan ? [L("具体措施：{plan}", { plan: submittedPlan })] : [],
    };
  }
  if (item.kind === "candidate") {
    const goal = goalTreeGoalPayload(payload);
    const title = String(goal.title ?? goal.goal_id ?? L("未命名 Goal"));
    const candidateId = String(payload.candidate_id ?? "").trim();
    const relations = goalTreeRelationPayloads(payload);
    const relationFacts = relations.map((relation) => {
      const from = proposedGoalName(relation.from_goal_id, view, proposal);
      const to = proposedGoalName(relation.to_goal_id, view, proposal);
      const relationLabel = RELATION_LABELS[String(relation.type ?? "")]?.out ?? L("建立关系");
      return L("{from} → {relation} → {to}", { from, relation: L(relationLabel), to });
    });
    const bootstrapProposalId = String(payload.materialized_by_proposal_id ?? "").trim();
    return {
      title: item.operation === "update"
        ? L("晋升已有 Candidate 为 Goal「{title}」", { title })
        : L("新增 Candidate Goal「{title}」", { title }),
      detail: String(goal.outcome ?? item.reason),
      facts: [
        ...(candidateId ? [L("原 Candidate：{candidateId}", { candidateId })] : []),
        ...(bootstrapProposalId
          ? [L("对账已有 Goal，来源提案：{proposalId}", { proposalId: bootstrapProposalId })]
          : []),
        ...relationFacts,
      ],
    };
  }
  const kindLabels: Record<string, string> = {
    policy: L("执行和检查规则"),
    candidate: L("新发现的工作"),
    rewire: L("Goal 关系"),
  };
  return {
    title: L("{operation}{kind}", { operation, kind: kindLabels[item.kind] ?? item.kind }),
    detail: String(payload.description ?? payload.reason ?? item.reason),
    facts: [],
  };
}
return { proposedGoalName, goalTreeGoalPayload, goalTreeRelationPayloads, goalTreeProposalItemCopy };
}
