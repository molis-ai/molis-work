import type { BoardSnapshot } from "./goal-entry-contract.js";
import type { GoalsInputBinding } from "./document-view.js";
import type { GoalsPolicyBinding } from "./policy-ui-model.js";
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
  snapshot: BoardSnapshot, inputBindings: GoalsInputBinding[],
  policyBindings: GoalsPolicyBinding[], events: GoalsDecisionEvent[],
  workEventLinks: ReturnType<GoalsDocumentReadPorts["goals"]["listWorkEventGoalLinks"]>,
) {
  const inputBindingsByGoal = groupByKey(inputBindings, (item) => item.goal_id);
  const policyBindingsByGoal = groupByKey(policyBindings, (item) => item.goal_id);
  const projectPolicyBindings = policyBindings.filter((item) => item.goal_id == null);
  const eventsByObject = groupByKey(events, (item) => item.object_id);
  // Work events are journaled under their own id; Goals' work-event facts name the Goal each belongs to.
  const workEventGoalIds = new Map(workEventLinks.map((link) => [link.event_id, link.goal_id]));
  const workEventsByGoal = groupByKey(events, (item) =>
    item.object_type === "goal_work_event" ? workEventGoalIds.get(item.object_id) : null);
  const relationsByGoal = new Map<string, typeof snapshot.relations>();
  for (const relation of snapshot.relations) {
    addGroupedValue(relationsByGoal, relation.from_goal_id, relation);
    if (relation.to_goal_id !== relation.from_goal_id) {
      addGroupedValue(relationsByGoal, relation.to_goal_id, relation);
    }
  }
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
  return { inputBindingsByGoal, policyBindingsByGoal, projectPolicyBindings, eventsByObject, workEventsByGoal, relationsByGoal, goalTreeProposalsByGoal };
}
