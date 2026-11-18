import { bindActionHandler, defineItemCreateAction, defineItemNextAction, type ActionHandlerBinding, type WorkItemNextStep } from "@molis-ai/molis-work-contracts/platform/actions";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { bindPresentationValuesHandler, definePresentationOverviewAction, definePresentationValuesAction, PRESENTATION_LIMITS,
  type PresentationDeclaration, type PresentationValueItem } from "@molis-ai/molis-work-contracts/platform/presentation";
import { goalEntryActions } from "./contract/goal-actions.js";
import type { CreateGoalIntentResult } from "./contract/goals.js";
import type { GoalRecord, GoalsQueryApi } from "./contract/goals.js";
import type { GoalEventApplication } from "./goal-event-application.js";
import type { GoalEventStateView } from "./contract/goal-events.js";
import { goalEventWorkStatuses } from "./contract/goal-event-state.js";

const values = definePresentationValuesAction("goals.presentation.values", /* @version action.goals.presentation.values */ 1, ["goal"], "目标显示字段", ["goals:read"]);
const overview = definePresentationOverviewAction("goals.presentation.overview", /* @version action.goals.presentation.overview */ 1, "目标首页概况", ["goals:read"]);
const { capability_id, version } = goalEntryActions.create;
const start = { capability_id, version };
/**
 * A Goal can become a work item on the mainline (specs/work-mainline/contract-design.md §4): 「建成目标」 makes one through Goals' own
 * create, keyed by the mainline's request id so a retry makes one; the next step is the Goal's own answer, read in one call for many.
 */
const itemCreate = defineItemCreateAction("goals.items.create", /* @version action.goals.items.create */ 1, { kind: "goal", title: "建成目标",
  description: "按给出的名字新建一个目标，供主线把它设为事项；同一请求 id 只建一个。", permissions: ["goals:write"] });
const itemNext = defineItemNextAction("goals.items.next", /* @version action.goals.items.next */ 1, { kind: "goal", title: "目标的下一步",
  description: "一次读出多个目标各自的下一步：等你定的事、进展里写的下一步，或还没满足的要求；已完成或已取消的没有下一步。只读。", permissions: ["goals:read"] });
export const goalsPresentationActions = [values, overview, itemCreate, itemNext];

export const goalsPresentation = {
  objects: [{
    kind: "goal",
    fields: [{ key: "title", role: "title" }, { key: "status", role: "status" }, { key: "updated_at", role: "updated_at" }, { key: "summary", role: "summary" }],
    status: { field: "status", map: { open: { ring: "running" }, completed: { ring: "done" }, cancelled: { ring: "cancelled" },
      pending_decision: { ring: "answer", attention: "needs_decision" }, pending_acceptance: { ring: "answer", attention: "needs_acceptance" } } },
    forms: { chip: { fields: ["title"] }, row: { fields: ["title", "status", "updated_at"] },
      card: { fields: ["title", "status", "updated_at", "summary"] }, peek: { fields: ["title", "status", "updated_at", "summary"] } },
    text: { lines: ["title", "status", "updated_at", "summary"] },
    item: { create: `${itemCreate.capability_id}@${itemCreate.version}`, next: `${itemNext.capability_id}@${itemNext.version}` },
  }],
  overview: { capability_id: overview.capability_id, version: overview.version, start: [start] },
} as const satisfies PresentationDeclaration;

const currentGoal = (goal: GoalRecord | null | undefined): goal is GoalRecord => !!goal && !goal.trashed_at && !goal.archived_at;
export const goalPresentationStates = [...goalEventWorkStatuses, "pending_decision", "pending_acceptance"] as const;
export type GoalPresentationStatus = typeof goalPresentationStates[number];
export type CaptureGoalPresentationStatus = (goalId: string, status: GoalPresentationStatus) => void;
export const goalPresentationStatus = (state: Pick<GoalEventStateView, "work_status" | "pending_decisions">): GoalPresentationStatus =>
  state.pending_decisions.some(decision => decision.purpose === "requirement_acceptance") ? "pending_acceptance"
    : state.pending_decisions.length ? "pending_decision" : state.work_status;

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
        return { subject, revision: `${goal.updated_at}:${state.goal_event_cursor}`, state: "ok",
          values: { title: goal.title, status: goalPresentationStatus(state), updated_at: goal.updated_at, summary: state.progress_summary?.summary || goal.outcome } };
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

/** The next step of a Goal: what it waits on the person to decide, else what its progress says comes next, else the first unmet requirement. */
export function goalNextStep(state: Pick<GoalEventStateView, "work_status" | "pending_decisions" | "progress_summary" | "gaps">): WorkItemNextStep | null {
  if (state.work_status === "completed" || state.work_status === "cancelled") return null;
  const clip = (value: string) => value.trim().slice(0, 200);
  const asked = state.pending_decisions[0];
  if (asked) return { text: clip(asked.question), waiting_on: uiText.text(asked.purpose === "requirement_acceptance" ? "goals.items.waiting-acceptance" : "goals.items.waiting-decision") };
  const next = state.progress_summary?.next_step?.trim();
  if (next) return { text: clip(next), ...(state.progress_summary?.next_actor?.trim() ? { waiting_on: clip(state.progress_summary.next_actor) } : {}) };
  const gap = state.gaps[0];
  return gap ? { text: clip(uiText.text("goals.items.meet-requirement", { statement: gap.statement })) } : null;
}

/** The two item parts: 「建成目标」 through the create handler Goals already has, and the next step of many Goals in one read. */
export function createGoalItemHandlers(projectId: string, create: ActionHandlerBinding, query: Pick<GoalsQueryApi, "getGoal">,
  events: Pick<GoalEventApplication, "readState">, read: <T>(body: () => T) => T, ready: Promise<void>): ActionHandlerBinding[] {
  return [
    bindActionHandler(itemCreate, async (input, caller) => {
      const result = await create.handle(caller, { title: input.name, idempotency_key: input.request_id }) as CreateGoalIntentResult;
      return { subject: { kind: "goal", id: result.goal.goal_id } };
    }),
    bindActionHandler(itemNext, async (input, caller) => {
      await ready;
      caller.signal?.throwIfAborted();
      return read(() => ({ items: input.subjects.filter(subject => subject.kind === "goal").map(subject => {
        const goal = query.getGoal(projectId, subject.id);
        return { subject, next: currentGoal(goal) ? goalNextStep(events.readState(projectId, goal.goal_id)) : null };
      }) }));
    }),
  ];
}
