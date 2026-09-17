import type { BoardSnapshot } from "./goal-entry-contract.js";
import type { GoalsCoverageItem, GoalsInputBinding } from "./document-view.js";
import type { GoalsPolicyBinding } from "./policy-ui-model.js";
import type { GoalsSafetyRisk } from "./safety-ui-model.js";
import type { GoalsDecisionEvent } from "./decision-view.js";
import type { GoalsDocumentReadPorts } from "./document-read-ports.js";

function groupByKey<T>(items: readonly T[], keyFor: (item: T) => string | null | undefined): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    if (!key) continue;
    const existing = grouped.get(key);
    if (existing) existing.push(item);
    else grouped.set(key, [item]);
  }
  return grouped;
}

function addGroupedValue<T>(grouped: Map<string, T[]>, key: unknown, value: T): void {
  const normalized = String(key ?? "").trim();
  if (!normalized) return;
  const existing = grouped.get(normalized);
  if (existing) existing.push(value);
  else grouped.set(normalized, [value]);
}

export function createGoalDocumentIndex(
  snapshot: BoardSnapshot, coverage: GoalsCoverageItem[], inputBindings: GoalsInputBinding[],
  policyBindings: GoalsPolicyBinding[], events: GoalsDecisionEvent[],
  riskLinks: ReturnType<GoalsDocumentReadPorts["goals"]["listGoalRiskLinks"]>,
) {
  const riskGoalIds = new Map<string, string[]>();
  const goalRiskIds = new Map<string, string[]>();
  for (const row of riskLinks) {
    const riskId = row.risk_id;
    const goalId = row.goal_id;
    addGroupedValue(riskGoalIds, riskId, goalId);
    addGroupedValue(goalRiskIds, goalId, riskId);
  }
  const webRisks: GoalsSafetyRisk[] = snapshot.risks.map((risk) => ({
    ...risk,
    goal_ids: riskGoalIds.get(risk.risk_id) ?? [],
  }));
  const evidenceByGoal = groupByKey(snapshot.evidence, (item) => item.goal_id);
  const evidenceCorrectionsByGoal = groupByKey(snapshot.evidence_corrections, (item) => item.goal_id);
  const reviewObligationsByGoal = groupByKey(snapshot.review_obligations, (item) => item.goal_id);
  const reviewsByGoal = groupByKey(snapshot.reviews, (item) => item.goal_id);
  const impactsByGoal = groupByKey(snapshot.impacts, (item) => item.goal_id);
  const contractProposalsByGoal = groupByKey(snapshot.contract_proposals, (item) => item.goal_id);
  const clarificationSessionsByGoal = groupByKey(snapshot.clarification_sessions, (item) => item.goal_id);
  const clarificationTurnsByGoal = groupByKey(snapshot.clarification_turns, (item) => item.goal_id);
  const coverageByGoal = groupByKey(coverage, (item) => item.owner_goal_id);
  const inputBindingsByGoal = groupByKey(inputBindings, (item) => item.goal_id);
  const policyBindingsByGoal = groupByKey(policyBindings, (item) => item.goal_id);
  const projectPolicyBindings = policyBindings.filter((item) => item.goal_id == null);
  const eventsByObject = groupByKey(events, (item) => item.object_id);
  const relationsByGoal = new Map<string, typeof snapshot.relations>();
  for (const relation of snapshot.relations) {
    addGroupedValue(relationsByGoal, relation.from_goal_id, relation);
    if (relation.to_goal_id !== relation.from_goal_id) {
      addGroupedValue(relationsByGoal, relation.to_goal_id, relation);
    }
  }
  const candidatesByRun = groupByKey(snapshot.candidates, (item) => item.discovered_in_run_id);
  const goalTreeProposalsByGoal = new Map<string, typeof snapshot.goal_tree_proposals>();
  for (const proposal of snapshot.goal_tree_proposals) {
    const touchedGoalIds = new Set<string>();
    if (proposal.root_goal_id) touchedGoalIds.add(proposal.root_goal_id);
    for (const item of proposal.items) {
      for (const object of [...item.affected_objects, ...item.materialized_objects]) {
        if (object.object_type === "goal" && object.object_id) touchedGoalIds.add(object.object_id);
      }
      for (const value of [
        item.payload.goal_id,
        item.payload.from_goal_id,
        item.payload.to_goal_id,
        ...(Array.isArray(item.payload.goal_ids) ? item.payload.goal_ids : []),
      ]) {
        const goalId = String(value ?? "").trim();
        if (goalId) touchedGoalIds.add(goalId);
      }
    }
    for (const goalId of touchedGoalIds) addGroupedValue(goalTreeProposalsByGoal, goalId, proposal);
  }
  const rewiresByGoal = new Map<string, typeof snapshot.rewires>();
  const rewiresByCandidate = groupByKey(snapshot.rewires, (item) => item.candidate_id);
  for (const rewire of snapshot.rewires) {
    const touchedGoalIds = new Set<string>();
    if (rewire.proposal.formal_goal_id) touchedGoalIds.add(rewire.proposal.formal_goal_id);
    for (const relation of rewire.proposal.relations ?? []) {
      for (const goalId of [relation.from_goal_id, relation.to_goal_id]) {
        const normalized = String(goalId ?? "").trim();
        if (normalized) touchedGoalIds.add(normalized);
      }
    }
    for (const impact of rewire.proposal.impacts ?? []) {
      const goalId = String(impact.goal_id ?? "").trim();
      if (goalId) touchedGoalIds.add(goalId);
    }
    for (const risk of rewire.proposal.risks ?? []) {
      if (!Array.isArray(risk.goal_ids)) continue;
      for (const value of risk.goal_ids) {
        const goalId = String(value ?? "").trim();
        if (goalId) touchedGoalIds.add(goalId);
      }
    }
    for (const goalId of touchedGoalIds) addGroupedValue(rewiresByGoal, goalId, rewire);
  }
  const createdByGoal = new Map<string, { revision: number; actor: string }>();
  for (const revision of snapshot.goal_contract_revisions ?? []) {
    const actor = revision.changed_by.trim();
    if (!actor) continue;
    const current = createdByGoal.get(revision.goal_id);
    if (!current || revision.revision < current.revision) {
      createdByGoal.set(revision.goal_id, { revision: revision.revision, actor });
    }
  }
  const createdByActor = new Map([...createdByGoal].map(([goalId, value]) => [goalId, value.actor]));
  return { riskGoalIds, goalRiskIds, webRisks, evidenceByGoal, evidenceCorrectionsByGoal, reviewObligationsByGoal, reviewsByGoal, impactsByGoal, contractProposalsByGoal, clarificationSessionsByGoal, clarificationTurnsByGoal, coverageByGoal, inputBindingsByGoal, policyBindingsByGoal, projectPolicyBindings, eventsByObject, relationsByGoal, candidatesByRun, goalTreeProposalsByGoal, rewiresByGoal, rewiresByCandidate, createdByGoal: createdByActor };
}
