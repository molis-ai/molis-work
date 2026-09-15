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
  archiveView: boolean, trashView: boolean, decisionView: boolean, L: Translate,
) {
  const visibleGoals = trashView ? view.trashed_goals : archiveView ? view.archived_goals : view.goals;
  const collectionView = archiveView || trashView;
  const collectionTitle = trashView ? L("回收站") : archiveView ? L("已归档") : L("Goal Tree");
  const collectionSuffix = trashView ? L("回收站") : archiveView ? L("归档") : "";
  const selected = decisionView ? undefined :
    visibleGoals.find(item => item.goal.goal_id === requestedGoalId) ??
    (collectionView ? undefined : visibleGoals.find(item => item.goal.goal_id === view.active_goal_id)) ??
    visibleGoals[0];
  const selectedId = selected?.goal.goal_id ?? "";
  const title = decisionView ? L("Inbox · Molis Work") :
    selected ? selected.goal.title + " · Molis Work" :
    trashView ? L("回收站 · Molis Work") : archiveView ? L("已归档 Goal · Molis Work") : "Molis Work";
  const phaseSummary = [
    { label: L("需要你决定"), count: view.counts.waiting_for_human },
    { label: L("正在推进"), count: view.counts.executing },
    { label: L("可记录"), count: view.counts.execution_pending },
  ].filter(item => item.count > 0).map(item => `${item.label} ${item.count}`).join(" · ");
  const blockedCount = view.counts.execution_blocked + view.counts.invalidated;
  const footerStatus = [phaseSummary, blockedCount > 0 ? L("受阻 {count}", { count: blockedCount }) : ""]
    .filter(Boolean).join(" · ") || L("当前没有进行中的 Goal");
  const collectionNote = trashView ? L("可恢复；历史与关联处理记录会保留") : archiveView ? L("可随时恢复") : footerStatus;
  const searchPlaceholder = trashView ? L("在回收站内搜索") : archiveView ? L("在已归档 Goal 中搜索") : L("在当前 Goal Tree 内搜索");
  const searchLabel = trashView ? L("搜索回收站") : archiveView ? L("搜索已归档 Goal") : L("搜索 Goal");
  return { visibleGoals, selected, selectedId, title, collectionView, collectionTitle, collectionSuffix,
    collectionNote, searchPlaceholder, searchLabel, archiveView, trashView };
}

export type GoalCollectionModel<T extends GoalCollectionItem = GoalCollectionItem> = ReturnType<typeof buildGoalCollectionModel<T>>;
