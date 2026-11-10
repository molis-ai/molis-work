import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { WORK_STATE_COPY } from "./goal-state-copy.js";
/** UI-only collection selection and labels; counts are supplied by the authoritative query. */
export interface GoalCollectionItem {
  goal: { goal_id: string; title: string };
}
export interface GoalCollectionView<T extends GoalCollectionItem> {
  goals: T[];
  archived_goals: T[];
  trashed_goals: T[];
  active_goal_id: string | null;
  counts: {
    executing: number; waiting_for_human: number; execution_pending: number;
    execution_blocked: number; invalidated: number;
  };
}
type Translate = (text: string, values?: Record<string, string | number>) => string;

export function buildGoalCollectionModel<T extends GoalCollectionItem>(
  view: GoalCollectionView<T>, requestedGoalId: string | undefined,
  archiveView: boolean, trashView: boolean, _readText: Translate,
) {
  const visibleGoals = trashView ? view.trashed_goals : archiveView ? view.archived_goals : view.goals;
  const collectionView = archiveView || trashView;
  const collectionTitle = trashView ? uiText.text("goals.collection-model.trash") : archiveView ? uiText.text("goals.collection-model.archived") : "Goal Tree";
  const collectionSuffix = trashView ? uiText.text("goals.collection-model.trash") : archiveView ? uiText.text("goals.collection-model.archive") : "";
  // Current Goals stay unselected until the user opens one or the Board has a real active Goal.
  // Archive and trash still land on the first item in that collection when none was requested.
  const selected =
    visibleGoals.find(item => item.goal.goal_id === requestedGoalId) ??
    (collectionView
      ? visibleGoals[0]
      : visibleGoals.find(item => item.goal.goal_id === view.active_goal_id));
  const selectedId = selected?.goal.goal_id ?? "";
  const title =
    selected ? selected.goal.title + " · Molis Work" :
    trashView ? uiText.text("goals.collection-model.trash-molis-work") : archiveView ? uiText.text("goals.collection-model.archived-goals-molis-work") : "Molis Work";
  const phaseSummary = [
    { label: uiText.text(WORK_STATE_COPY.waiting_for_human.label), count: view.counts.waiting_for_human },
    { label: uiText.text(WORK_STATE_COPY.executing.label), count: view.counts.executing },
    { label: uiText.text(WORK_STATE_COPY.execution_pending.label), count: view.counts.execution_pending },
    { label: uiText.text(WORK_STATE_COPY.execution_blocked.label), count: view.counts.execution_blocked },
    { label: uiText.text(WORK_STATE_COPY.invalidated.label), count: view.counts.invalidated },
  ].filter(item => item.count > 0).map(item => `${item.label} ${item.count}`).join(" · ");
  const footerStatus = phaseSummary || uiText.text("goals.collection-model.no-goal-progress");
  const collectionNote = trashView ? uiText.text("goals.collection-model.recoverable-history-relation-handling-stay") : archiveView ? uiText.text("goals.collection-model.can-be-restored-any-time") : footerStatus;
  return { visibleGoals, selected, selectedId, title, collectionView, collectionTitle, collectionSuffix,
    collectionNote, archiveView, trashView };
}

export type GoalCollectionModel<T extends GoalCollectionItem = GoalCollectionItem> = ReturnType<typeof buildGoalCollectionModel<T>>;
