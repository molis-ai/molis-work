import type { GoalRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { BoardSnapshot } from "./goal-entry-contract.js";
import type { GoalsDocumentView } from "./document-view.js";
import type { GoalDisplayStatus, GoalPresentationState } from "./tree-order.js";
import type { GoalsDocumentReadPorts } from "./document-read-ports.js";
import type { createGoalDocumentIndex } from "./document-index.js";
import { eventDirectoryPresentation } from "./event-document-model.js";

function archiveOrTrashPresentation(goal: Pick<GoalRecord, "trashed_at" | "archived_at">): {
  status: GoalPresentationState;
  display_status: GoalDisplayStatus;
  status_label: string;
  main_action_label: string;
  action_summary: string;
} | null {
  if (goal.trashed_at) {
    return {
      status: "trashed",
      display_status: "blocked",
      status_label: "回收站",
      main_action_label: "恢复",
      action_summary: "Goal 已移入回收站，历史仍被保留。",
    };
  }
  if (goal.archived_at) {
    return {
      status: "archived",
      display_status: "completed",
      status_label: "已归档",
      main_action_label: "查看历史",
      action_summary: "已归档，不再出现在普通工作列表。",
    };
  }
  return null;
}

export function projectGoalDocument(goal: GoalRecord, input: {
  projectId: string; snapshot: BoardSnapshot; ports: GoalsDocumentReadPorts;
  index: ReturnType<typeof createGoalDocumentIndex>;
}): GoalsDocumentView {
  const { projectId, ports } = input;
  const {
    inputBindingsByGoal, policyBindingsByGoal,
    projectPolicyBindings, eventsByObject, workEventsByGoal, relationsByGoal,
    goalTreeProposalsByGoal,
  } = input.index;
  const event = ports.eventWork.readState(projectId, goal.goal_id);
  const eventOwned = Boolean(event.owner);
  const current = archiveOrTrashPresentation(goal)
    ?? eventDirectoryPresentation(event, goal)
    ?? {
      status: "execution_pending" as const,
      display_status: "continue" as const,
      status_label: "历史记录",
      main_action_label: "阅读历史",
      action_summary: "这条 Goal 还没有当前事件归属，可阅读保留的历史记录。",
    };
  const resolvedPolicy = ports.goals.getResolvedGoalPolicy({
    project_id: projectId,
    goal_id: goal.goal_id,
  });
  const relations = relationsByGoal.get(goal.goal_id) ?? [];
  const visiblePolicyBindings = [
    ...projectPolicyBindings,
    ...(policyBindingsByGoal.get(goal.goal_id) ?? []),
  ].sort((left, right) =>
    left.created_at.localeCompare(right.created_at) ||
    left.policy_binding_id.localeCompare(right.policy_binding_id)
  );
  const goalTreeProposals = goalTreeProposalsByGoal.get(goal.goal_id) ?? [];
  const goalTreeProposalIds = goalTreeProposals.map((item) => item.proposal_id);
  const goalTreeProposalItemIds = goalTreeProposals.flatMap((item) => item.items.map((child) => child.item_id));
  const visiblePolicyBindingIds = visiblePolicyBindings.map((item) => item.policy_binding_id);
  const relatedObjectIds = new Set<string>([
    goal.goal_id,
    ...relations.map((item) => item.relation_id),
    ...goalTreeProposalIds,
    ...goalTreeProposalItemIds,
    ...visiblePolicyBindingIds,
  ]);
  const goalEvents = [
    ...[...relatedObjectIds].flatMap((objectId) => eventsByObject.get(objectId) ?? []),
    ...(workEventsByGoal.get(goal.goal_id) ?? []),
  ].sort((left, right) => right.seq - left.seq);
  return {
    goal,
    status: current.status,
    display_status: current.display_status,
    status_label: current.status_label,
    main_action_label: current.main_action_label,
    action_summary: current.action_summary,
    event_work: eventOwned,
    relations,
    input_bindings: inputBindingsByGoal.get(goal.goal_id) ?? [],
    policy_bindings: visiblePolicyBindings,
    events: goalEvents,
    resolved_policy: resolvedPolicy,
    created_by: event.owner?.adopted_by ?? goal.accepted_by,
  };
}
