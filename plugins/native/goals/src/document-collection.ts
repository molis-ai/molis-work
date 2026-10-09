import { GOALS_PRESENTATION_STATES, type GoalsInputBinding } from "./document-view.js";
import type { GoalsPolicyBinding } from "./policy-ui-model.js";
import type { GoalPresentationState } from "./tree-order.js";
import type { GoalsDocumentReadPorts } from "./document-read-ports.js";
import { createGoalDocumentIndex } from "./document-index.js";
import { projectGoalDocument } from "./document-projection.js";

export function buildGoalsDocumentCollection(ports: GoalsDocumentReadPorts, projectId: string) {
  const snapshot = ports.snapshot(projectId);
  const inputBindings = ports.inputs.list(projectId)
    .map(({ project_id: _boardId, ...binding }): GoalsInputBinding => binding);
  const policyBindings: GoalsPolicyBinding[] = ports.goals.listPolicyHistory(projectId);
  const events = ports.events(projectId);
  const index = createGoalDocumentIndex(snapshot, inputBindings, policyBindings, events, ports.goals.listWorkEventGoalLinks(projectId));
  const allGoals = snapshot.goals.map(goal => projectGoalDocument(goal, {
    projectId, snapshot, ports, index,
  }));
  // Trash is intentionally absent from both the ordinary Tree and the
  // completed-only archive. The dedicated trash view selects it through the
  // shared coordinator read service instead of leaking it into normal work.
  const trashedGoalIds = new Set(
    ports.goals.listTrashedGoals(projectId).map((goal) => goal.goal_id),
  );
  const goals = allGoals.filter((item) => !item.goal.archived_at && !item.goal.trashed_at);
  const archivedGoals = allGoals.filter((item) => Boolean(item.goal.archived_at) && !item.goal.trashed_at);
  const trashedGoals = allGoals.filter((item) => trashedGoalIds.has(item.goal.goal_id));
  const counts = Object.fromEntries(GOALS_PRESENTATION_STATES.map((status) => [status, 0])) as Record<GoalPresentationState, number>;
  for (const goal of goals) counts[goal.status]++;
  const activeGoalId = goals.some((item) => item.goal.goal_id === snapshot.board.active_goal_id)
    ? snapshot.board.active_goal_id
    : null;
  return {
    snapshot, active_goal_id: activeGoalId,
    goals, archived_goals: archivedGoals, trashed_goals: trashedGoals,
    counts, input_bindings: inputBindings, policy_bindings: policyBindings, events,
  };
}

export type GoalsDocumentCollectionView = ReturnType<typeof buildGoalsDocumentCollection>;
