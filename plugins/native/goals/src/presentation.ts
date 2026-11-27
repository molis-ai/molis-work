import { bindActionHandler, defineItemCreateAction, defineItemNextAction, type ActionHandlerBinding, type WorkItemNextStep } from "@molis-ai/molis-work-contracts/platform/actions";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { bindPresentationValuesHandler, definePresentationOverviewAction, definePresentationValuesAction, PRESENTATION_LIMITS,
  type PresentationDeclaration, type PresentationOutline, type PresentationOutlineNode, type PresentationValueItem } from "@molis-ai/molis-work-contracts/platform/presentation";
import { goalEntryActions } from "./contract/goal-actions.js";
import type { CreateGoalIntentResult } from "./contract/goals.js";
import type { GoalRecord, GoalsQueryApi } from "./contract/goals.js";
import type { GoalEventApplication } from "./goal-event-application.js";
import type { GoalEventStateView } from "./contract/goal-events.js";
import { goalEventWorkStatuses } from "./contract/goal-event-state.js";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AcceptanceView } from "@molis-ai/molis-work-contracts/modules/acceptance";

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
  description: "一次读出多个目标各自的下一步：等你定的事或进展里写的下一步（要求在平台的要求栏里）；已完成或已取消的没有下一步。只读。", permissions: ["goals:read"] });
export const goalsPresentationActions = [values, overview, itemCreate, itemNext];

export const goalsPresentation = {
  objects: [{
    kind: "goal",
    fields: [{ key: "title", role: "title" }, { key: "status", role: "status" }, { key: "updated_at", role: "updated_at" }, { key: "summary", role: "summary" }],
    status: { field: "status", map: { open: { ring: "running" }, completed: { ring: "done" }, cancelled: { ring: "cancelled" },
      pending_decision: { ring: "answer", attention: "needs_decision" }, pending_acceptance: { ring: "answer", attention: "needs_acceptance" },
      changed_after_completion: { ring: "done", attention: "needs_acceptance" } } },
    forms: { chip: { fields: ["title"] }, row: { fields: ["title", "status", "updated_at"] },
      card: { fields: ["title", "status", "updated_at", "summary"] }, peek: { fields: ["title", "status", "updated_at", "summary"] } },
    text: { lines: ["title", "status", "updated_at", "summary"] },
    item: { create: `${itemCreate.capability_id}@${itemCreate.version}`, next: `${itemNext.capability_id}@${itemNext.version}` },
  }],
  overview: { capability_id: overview.capability_id, version: overview.version, start: [start] },
} as const satisfies PresentationDeclaration;

const currentGoal = (goal: GoalRecord | null | undefined): goal is GoalRecord => !!goal && !goal.trashed_at && !goal.archived_at;
export const goalPresentationStates = [...goalEventWorkStatuses, "pending_decision", "pending_acceptance", "changed_after_completion"] as const;
export type GoalPresentationStatus = typeof goalPresentationStates[number];
export type CaptureGoalPresentationStatus = (goalId: string, status: GoalPresentationStatus) => void;
export const goalPresentationStatus = (state: Pick<GoalEventStateView, "work_status" | "pending_decisions">): GoalPresentationStatus =>
  state.pending_decisions.length ? "pending_decision" : state.work_status;
/**
 * The status with the platform's acceptance of the Goal (contract-design §10.9 question 6): an open Goal with a requirement waiting
 * for the person waits on their acceptance; a completed one whose requirements are no longer all met says so, and stays completed.
 * Without a reading the status is Goals' own.
 */
export function goalAcceptanceStatus(status: GoalPresentationStatus, view: AcceptanceView | undefined): GoalPresentationStatus {
  if (!view) return status;
  if (status === "completed") return view.requirements.length && !view.complete ? "changed_after_completion" : status;
  return status === "open" && view.counts.needs_person > 0 ? "pending_acceptance" : status;
}
export type ReadGoalAcceptance = (caller: ActionExecutionContext, goalIds: string[]) => Promise<ReadonlyMap<string, AcceptanceView> | undefined>;

/**
 * The project's Goals as the short tree the first page reads: Goals that are no part of another, those still open first, each followed
 * by its parts. A parent's count is its parts that are completed, of its parts that still count (a cancelled one does not).
 */
function goalsOutline(projectId: string, query: Pick<GoalsQueryApi, "listRelations">, goals: readonly GoalRecord[], status: ReadonlyMap<string, string>): PresentationOutline {
  const byId = new Map(goals.map(goal => [goal.goal_id, goal]));
  const parts = new Map<string, GoalRecord[]>(), child = new Set<string>();
  for (const relation of query.listRelations(projectId)) {
    const part = byId.get(relation.from_goal_id);
    if (relation.type !== "part_of" || relation.state !== "active" || !part || !byId.has(relation.to_goal_id) || child.has(part.goal_id)) continue;
    child.add(part.goal_id);
    parts.set(relation.to_goal_id, [...parts.get(relation.to_goal_id) ?? [], part]);
  }
  const open = (goal: GoalRecord) => status.get(goal.goal_id) === "open";
  const recent = (a: GoalRecord, b: GoalRecord) => b.updated_at.localeCompare(a.updated_at) || a.goal_id.localeCompare(b.goal_id);
  const tops = goals.filter(goal => !child.has(goal.goal_id)).sort((a, b) => Number(open(b)) - Number(open(a)) || recent(a, b));
  const nodes: PresentationOutlineNode[] = [];
  for (const top of tops) {
    if (nodes.length >= PRESENTATION_LIMITS.outline_nodes) break;
    const own = (parts.get(top.goal_id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.goal_id.localeCompare(b.goal_id));
    const counted = own.filter(goal => status.get(goal.goal_id) !== "cancelled");
    nodes.push({ subject: { kind: "goal", id: top.goal_id }, depth: 0,
      ...(counted.length ? { progress: { done: counted.filter(goal => status.get(goal.goal_id) === "completed").length, total: counted.length } } : {}) });
    for (const part of own.slice(0, PRESENTATION_LIMITS.outline_nodes - nodes.length)) nodes.push({ subject: { kind: "goal", id: part.goal_id }, depth: 1 });
  }
  return { title: { key: "goals.presentation.outline-title" }, nodes };
}

export function createGoalsPresentationHandlers(projectId: string, query: Pick<GoalsQueryApi, "getGoal" | "listGoals" | "listRelations">,
  events: Pick<GoalEventApplication, "readState" | "readWorkStatus">, read: <T>(body: () => T) => T, ready: Promise<void>, acceptance: ReadGoalAcceptance) {
  return [
    bindPresentationValuesHandler(values, async (input, caller) => {
      await ready;
      caller.signal?.throwIfAborted();
      const views = await acceptance(caller, input.subjects.filter(subject => subject.kind === "goal").map(subject => subject.id));
      return read(() => ({ items: input.subjects.filter(subject => subject.kind === "goal").map((subject): PresentationValueItem => {
        const goal = query.getGoal(projectId, subject.id);
        if (!currentGoal(goal)) return { subject, revision: "0", state: "deleted" };
        const state = events.readState(projectId, goal.goal_id);
        return { subject, revision: `${goal.updated_at}:${state.goal_event_cursor}`, state: "ok",
          values: { title: goal.title, status: goalAcceptanceStatus(goalPresentationStatus(state), views?.get(goal.goal_id)), updated_at: goal.updated_at, summary: state.progress_summary?.summary || goal.outcome } };
      }) }));
    }),
    bindActionHandler(overview, async (_input, caller) => {
      await ready;
      caller.signal?.throwIfAborted();
      return read(() => {
        // The Goals and each one's state are read once; the count, the recent few and the tree are all made of that one reading.
        const all = query.listGoals(projectId).filter(currentGoal);
        const status = new Map(all.map(goal => [goal.goal_id, events.readWorkStatus(projectId, goal.goal_id)]));
        const recent = [...all].sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.goal_id.localeCompare(b.goal_id)).slice(0, PRESENTATION_LIMITS.overview_subjects);
        const outline = goalsOutline(projectId, query, all, status);
        const number = (name: string, value: number) => ({ name, kind: "number" as const, number: value });
        const open = all.filter(goal => status.get(goal.goal_id) === "open").length;
        return { summary: recent.length ? { key: "goals.presentation.summary", args: [number("count", all.length), number("open", open)] } : { key: "goals.presentation.empty" },
          subjects: recent.map(goal => ({ kind: "goal", id: goal.goal_id })), start: [start], ...(outline.nodes.length ? { outline } : {}) };
      });
    }),
  ];
}

/** The next step of a Goal: what it waits on the person to decide, else what its progress says comes next. Its requirements are the platform's. */
export function goalNextStep(state: Pick<GoalEventStateView, "work_status" | "pending_decisions" | "progress_summary">): WorkItemNextStep | null {
  if (state.work_status === "completed" || state.work_status === "cancelled") return null;
  const clip = (value: string) => value.trim().slice(0, 200);
  const asked = state.pending_decisions[0];
  if (asked) return { text: clip(asked.question), waiting_on: uiText.text("goals.items.waiting-decision") };
  const next = state.progress_summary?.next_step?.trim();
  return next ? { text: clip(next), ...(state.progress_summary?.next_actor?.trim() ? { waiting_on: clip(state.progress_summary.next_actor) } : {}) } : null;
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
