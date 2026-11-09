import { bindActionHandler } from "@molis-ai/molis-work-contracts/platform/actions";
import { bindPresentationValuesHandler, definePresentationOverviewAction, definePresentationValuesAction, PRESENTATION_LIMITS,
  type PresentationDeclaration, type PresentationValueItem } from "@molis-ai/molis-work-contracts/platform/presentation";
import { goalEntryActions } from "./contract/goal-actions.js";
import type { GoalRecord, GoalsQueryApi } from "./contract/goals.js";
import type { GoalEventApplication } from "./goal-event-application.js";

const values = definePresentationValuesAction("goals.presentation.values", /* @version action.goals.presentation.values */ 1, ["goal"], "目标显示字段", ["goals:read"]);
const overview = definePresentationOverviewAction("goals.presentation.overview", /* @version action.goals.presentation.overview */ 1, "目标首页概况", ["goals:read"]);
const { capability_id, version } = goalEntryActions.create;
const start = { capability_id, version };
export const goalsPresentationActions = [values, overview];

export const goalsPresentation = {
  objects: [{
    kind: "goal",
    fields: [{ key: "title", role: "title" }, { key: "status", role: "status" }, { key: "updated_at", role: "updated_at" }, { key: "summary", role: "summary" }],
    status: { field: "status", map: { open: { ring: "running" }, completed: { ring: "done" }, cancelled: { ring: "cancelled" },
      pending_decision: { ring: "answer", attention: "needs_decision" }, pending_acceptance: { ring: "answer", attention: "needs_acceptance" } } },
    forms: { chip: { fields: ["title"] }, row: { fields: ["title", "status", "updated_at"] },
      card: { fields: ["title", "status", "updated_at", "summary"] }, peek: { fields: ["title", "status", "updated_at", "summary"] } },
    text: { lines: ["title", "status", "updated_at", "summary"] },
  }],
  overview: { capability_id: overview.capability_id, version: overview.version, start: [{ ...start, open: { view_id: "stage", panel: "create-dialog" } }] },
} as const satisfies PresentationDeclaration;

export const GOALS_PRESENTATION_MESSAGES = {
  "goals.presentation.empty": { zh: "还没有目标", en: "No goals yet" },
  "goals.presentation.summary": { zh: "本项目最近更新的目标", en: "Recently updated project goals" },
  "goals.presentation.start": { zh: "创建目标", en: "Create a goal" },
} as const;

const currentGoal = (goal: GoalRecord | null | undefined): goal is GoalRecord => !!goal && !goal.trashed_at && !goal.archived_at;

export function createGoalsPresentationHandlers(projectId: string, query: Pick<GoalsQueryApi, "getGoal" | "listGoals">,
  events: Pick<GoalEventApplication, "readState">, read: <T>(body: () => T) => T, ready: Promise<void>) {
  return [
    bindPresentationValuesHandler(values, async (input, caller) => {
      await ready;
      caller.signal?.throwIfAborted();
      return read(() => ({ items: input.subjects.filter(subject => subject.kind === "goal").map((subject): PresentationValueItem => {
        const goal = query.getGoal(projectId, subject.id);
        if (!currentGoal(goal)) return { subject, revision: "0", state: "deleted" };
        const state = events.readState(projectId, goal.goal_id);
        const status = state.pending_decisions.some(decision => decision.purpose === "requirement_acceptance") ? "pending_acceptance"
          : state.pending_decisions.length ? "pending_decision" : state.work_status;
        return { subject, revision: `${goal.updated_at}:${state.goal_event_cursor}`, state: "ok",
          values: { title: goal.title, status, updated_at: goal.updated_at, summary: state.progress_summary?.summary || goal.outcome } };
      }) }));
    }),
    bindActionHandler(overview, async (_input, caller) => {
      await ready;
      caller.signal?.throwIfAborted();
      return read(() => {
        const recent = query.listGoals(projectId).filter(currentGoal)
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.goal_id.localeCompare(b.goal_id)).slice(0, PRESENTATION_LIMITS.overview_subjects);
        return { summary: { key: recent.length ? "goals.presentation.summary" : "goals.presentation.empty" },
          subjects: recent.map(goal => ({ kind: "goal", id: goal.goal_id })), start: [start] };
      });
    }),
  ];
}
