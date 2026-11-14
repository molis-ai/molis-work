import { createActionDefinition, nullableSchema, objectSchema as object } from "@molis-ai/molis-work-plugin-sdk";
import { ActionError, bindActionHandler, type ActionExecutionContext, type ActionHandlerBinding, type ActionReference, type ActionSchema,
  type InferActionInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { riskErrors } from "./error.js";
import { RISK_KIND } from "./identity.js";
import { RISK_LIMITS } from "./model.js";
import type { RiskStore } from "./store.js";

/**
 * A risk's review is a one-off Schedule task about the risk (specs/risk-plugin/implementation.md §4.5): Schedule keeps it, wakes it
 * and keeps its result; the risk only asks Schedule, as its own caller (`actions:delegate`), and shows what Schedule says. Nothing about
 * a review is written in the risk's own tables. The task's title and words are the person's (the risk's title, the focus they gave), so
 * nothing translated is stored in Schedule.
 */
export const SCHEDULE_TASKS = {
  list: { capability_id: "schedule.tasks.list", version: /* @version action.schedule.tasks.list */ 1 },
  create: { capability_id: "schedule.tasks.create", version: /* @version action.schedule.tasks.create */ 1 },
  update: { capability_id: "schedule.tasks.update", version: /* @version action.schedule.tasks.update */ 1 },
  enabled: { capability_id: "schedule.tasks.enabled", version: /* @version action.schedule.tasks.enabled */ 1 },
  archive: { capability_id: "schedule.tasks.archive", version: /* @version action.schedule.tasks.archive */ 1 },
} as const satisfies Record<string, ActionReference>;

/** The part of a Schedule task the review reads; Schedule's own type stays Schedule's. */
interface ScheduleTask {
  task_id: string; title: string; instructions: string; enabled: boolean; run_at: string | null; last_run_at: string | null; last_error: string | null;
  turns: { kind: string; text: string; important: boolean; created_at: string }[];
}
interface ScheduleReads { task_id: string; categories: number; granted: number; needs_confirmation: number; unavailable: number; removed: number }

export interface RiskReview {
  task_id: string;
  at: string | null;
  /** `scheduled` is on and not yet run; `paused` was switched off before its time; `done` has had its round (or its time passed). */
  state: "scheduled" | "paused" | "done";
  focus: string;
  last_run_at: string | null;
  result: { text: string; important: boolean; at: string } | null;
  /** The round did not finish (Schedule's sentence), shown apart from a result that says nothing changed. */
  failure: string | null;
  /** What the person let the task read (counts); null when the platform could not say. No categories means it reads no risk. */
  reads: { categories: number; granted: number; needs_confirmation: number; unavailable: number; removed: number } | null;
}

const id = { type: "string", minLength: 1, maxLength: 200, pattern: "\\S" } as const;
const count = { type: "integer", minimum: 0 } as const;
const review = object({ task_id: id, at: nullableSchema({ type: "string" }), state: { enum: ["scheduled", "paused", "done"] }, focus: { type: "string" },
  last_run_at: nullableSchema({ type: "string" }), result: nullableSchema(object({ text: { type: "string" }, important: { type: "boolean" }, at: { type: "string" } })),
  failure: nullableSchema({ type: "string" }),
  reads: nullableSchema(object({ categories: count, granted: count, needs_confirmation: count, unavailable: count, removed: count })) });

const define = <O>() => <const S extends ActionSchema>(name: string, version: number, title: string, description: string, operation: "query" | "command", input: S, output: ActionSchema) =>
  createActionDefinition<InferActionInput<S>, O>(`risk.review.${name}`, operation, {
    title, description, audiences: ["user", "agent", "workflow", "mcp", "plugin"], subject_kinds: [RISK_KIND], input_schema: input, output_schema: output,
    // Every one waits on Schedule, so none holds the action queue while it does.
    permissions: operation === "query" ? ["risk:read"] : ["risk:read", "risk:write"], scheduling: "concurrent",
  }, version);

export const riskReviewActions = {
  get: define<{ state: "ok" | "unavailable"; review: RiskReview | null }>()("get", /* @version action.risk.review.get */ 1, "读风险的复查",
    "读这条风险在 Schedule 里的复查：什么时候、开着还是暂停、上一轮的结果或没跑成的原因，以及这个任务能读什么（没开读取授权的任务读不到风险）。没安排过时 review 为 null；项目没启用 Schedule 或调用者够不到它时 state 为 unavailable。",
    "query", object({ risk_id: id }), object({ state: { enum: ["ok", "unavailable"] }, review: nullableSchema(review) })),
  schedule: define<{ review: RiskReview }>()("schedule", /* @version action.risk.review.schedule */ 1, "安排或改期风险复查",
    "在 Schedule 里给这条风险安排一次复查（at：带时区的具体时刻，一年以内）；已有复查时改到新时间并重新打开。focus 写这次要看什么，缺省用风险的描述。到点那一轮要读风险，需要人在任务授权页给这个任务开读取授权。",
    "command", object({ risk_id: id, at: { type: "string", maxLength: 64 }, focus: { type: "string", maxLength: RISK_LIMITS.note } }, ["risk_id", "at"]), object({ review })),
  enabled: define<{ review: RiskReview }>()("enabled", /* @version action.risk.review.enabled */ 1, "暂停或恢复风险复查",
    "暂停后到点不跑；恢复只对还没到时间的复查有效，过了时间的请重新安排。", "command", object({ risk_id: id, enabled: { type: "boolean" } }), object({ review })),
  cancel: define<{ cancelled: boolean }>()("cancel", /* @version action.risk.review.cancel */ 1, "取消风险复查",
    "取消这条风险的复查：Schedule 归档任务、不再唤醒，已有的结果留在 Schedule 的记录里。没有复查时 cancelled 为 false。", "command", object({ risk_id: id }),
    object({ cancelled: { type: "boolean" } })),
};

export interface RiskReviewPorts {
  read<T>(run: (store: RiskStore) => T): T;
  /** Schedule's actions, as the risk action's own caller. */
  schedule<Output>(reference: ActionReference, input: unknown): Promise<Output>;
}

/** Schedule not installed, not answering, or out of the caller's reach (the directory does not tell these apart) is the risk's `review_unavailable`; Schedule's own refusals (a time already past) pass as they are. */
async function ask<T>(ports: RiskReviewPorts, reference: ActionReference, input: unknown): Promise<T> {
  try { return await ports.schedule<T>(reference, input); }
  catch (error) {
    if (error instanceof ActionError && (error.code === "actions.missing" || error.code === "actions.dependency_missing" || error.code === "actions.unredeemed"))
      throw riskErrors.review_unavailable("复查由 Schedule 来排：这个项目没有启用 Schedule，或调用者没有使用它的权限", { cause: error.code });
    throw error;
  }
}

async function reviewTask(ports: RiskReviewPorts, riskId: string): Promise<{ task: ScheduleTask | null; reads: ScheduleReads[] | null }> {
  const listed = await ask<{ tasks: ScheduleTask[]; reads?: ScheduleReads[] }>(ports, SCHEDULE_TASKS.list, { subject: { kind: RISK_KIND, id: riskId } });
  return { task: listed.tasks[0] ?? null, reads: listed.reads ?? null };
}

export function toRiskReview(task: ScheduleTask, reads: readonly ScheduleReads[] | null, now = Date.now()): RiskReview {
  const answer = [...task.turns].reverse().find(turn => turn.kind === "assistant");
  const failed = task.turns.at(-1)?.kind === "system" && task.last_error ? task.turns.at(-1)!.text : null;
  const due = task.run_at ? Date.parse(task.run_at) : Number.NaN;
  // Off before its time is paused, whatever ran earlier (a review run, rescheduled, then paused, can still resume); off once its time has passed is done.
  const waiting = Number.isNaN(due) ? !task.last_run_at && !failed : due > now;
  const state = task.enabled ? "scheduled" : waiting ? "paused" : "done";
  const counted = reads ? reads.find(item => item.task_id === task.task_id) : undefined;
  return { task_id: task.task_id, at: task.run_at, state, focus: task.instructions, last_run_at: task.last_run_at,
    result: answer ? { text: answer.text, important: answer.important, at: answer.created_at } : null, failure: failed,
    reads: reads === null ? null : { categories: counted?.categories ?? 0, granted: counted?.granted ?? 0, needs_confirmation: counted?.needs_confirmation ?? 0,
      unavailable: counted?.unavailable ?? 0, removed: counted?.removed ?? 0 } };
}

/**
 * After a risk is closed: its reviews are archived, so nothing wakes about a closed risk. Runs after the close has committed; what did
 * not go through is returned for the caller to say (`review_left`), never undoing the close. A project without Schedule has none.
 */
export async function archiveRiskReviews(ports: RiskReviewPorts, riskId: string): Promise<{ task_id: string | null } | undefined> {
  let tasks: ScheduleTask[];
  try { tasks = (await ask<{ tasks: ScheduleTask[] }>(ports, SCHEDULE_TASKS.list, { subject: { kind: RISK_KIND, id: riskId } })).tasks; }
  catch (error) {
    // No Schedule in the project: there is no review to leave behind.
    if (error instanceof ActionError && error.code === "risk.review_unavailable") return undefined;
    return { task_id: null };
  }
  for (const task of tasks) {
    // One that did not go through is reported to the caller as review_left; the close stays.
    try { await ports.schedule(SCHEDULE_TASKS.archive, { task_id: task.task_id }); }
    catch { return { task_id: task.task_id }; }
  }
  return undefined;
}

export function createRiskReviewHandlers(ports: RiskReviewPorts): ActionHandlerBinding[] {
  const current = async (riskId: string) => {
    const { task, reads } = await reviewTask(ports, riskId);
    return task ? toRiskReview(task, reads) : null;
  };
  const existing = async (riskId: string) => {
    ports.read(store => store.get(riskId));
    const found = await current(riskId);
    if (!found) throw riskErrors.not_found("这条风险还没有安排复查");
    return found;
  };
  const beforeEffect = async (caller: ActionExecutionContext) => { await caller.beforeEffect(); };
  return [
    // The detail shows its review section either way: without Schedule it says where reviews come from instead of failing the page.
    bindActionHandler(riskReviewActions.get, async ({ risk_id }) => {
      ports.read(store => store.get(risk_id));
      try { return { state: "ok" as const, review: await current(risk_id) }; }
      catch (error) {
        if (error instanceof ActionError && error.code === "risk.review_unavailable") return { state: "unavailable" as const, review: null };
        throw error;
      }
    }),
    bindActionHandler(riskReviewActions.schedule, async ({ risk_id, at, focus }, caller) => {
      const risk = ports.read(store => store.get(risk_id));
      if (risk.status === "closed") throw riskErrors.closed("这条风险已关闭，重新打开后才能安排复查");
      const words = focus?.trim() || risk.statement.trim() || risk.title;
      const fields = { title: [...risk.title].slice(0, 80).join(""), instructions: words, repeat: "none", at, subject: { kind: RISK_KIND, id: risk_id } };
      const { task } = await reviewTask(ports, risk_id);
      await beforeEffect(caller);
      if (task) await ask(ports, SCHEDULE_TASKS.update, { task_id: task.task_id, ...fields });
      else await ask(ports, SCHEDULE_TASKS.create, fields);
      const review = await current(risk_id);
      if (!review) throw riskErrors.review_unavailable("Schedule 没有留下这次复查");
      return { review };
    }),
    bindActionHandler(riskReviewActions.enabled, async ({ risk_id, enabled }, caller) => {
      const found = await existing(risk_id);
      await beforeEffect(caller);
      await ask(ports, SCHEDULE_TASKS.enabled, { task_id: found.task_id, enabled });
      return { review: (await current(risk_id)) ?? found };
    }),
    bindActionHandler(riskReviewActions.cancel, async ({ risk_id }, caller) => {
      ports.read(store => store.get(risk_id));
      const found = await current(risk_id);
      if (!found) return { cancelled: false };
      await beforeEffect(caller);
      await ask(ports, SCHEDULE_TASKS.archive, { task_id: found.task_id });
      return { cancelled: true };
    }),
  ];
}
