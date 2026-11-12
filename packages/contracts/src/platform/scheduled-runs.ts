import { inputSchemaFor } from "./action-input.js";
import { ActionError, type ActionDefinition } from "./actions.js";

/**
 * Work a Plugin or the Host runs on its own at a set time (a scheduled task, a feed pull, an assistant follow-up), as its owner
 * reports it to the menu-bar panel: what comes next, and what was missed while Molis Work was not running or the computer was
 * asleep (specs/proactive-assistant/resident-runtime-design.md §2). Each owner keeps its own record of what it missed and decides
 * the person's 「现在做」 or 「跳过」 itself; the Host finds the owners by these types and only puts their answers side by side.
 * A project Plugin declares both in project scope, the list as a `home_aggregate` query the Host asks in every open project (PG-043);
 * a Home-level owner declares them in Home scope. Either way each run says its project.
 */
export const RUNS_OVERVIEW_INPUT_TYPE = /* @version type.molis.runs.window "molis.runs.window.v{version}" */ "molis.runs.window.v1";
export const RUNS_OVERVIEW_OUTPUT_TYPE = /* @version type.molis.runs.overview "molis.runs.overview.v{version}" */ "molis.runs.overview.v1";
export const RUN_DECISION_INPUT_TYPE = /* @version type.molis.runs.decision "molis.runs.decision.v{version}" */ "molis.runs.decision.v1";
export const RUN_DECISION_OUTPUT_TYPE = /* @version type.molis.runs.decided "molis.runs.decided.v{version}" */ "molis.runs.decided.v1";

/** A run that comes due more than this late is missed: it is recorded and not run on its own. The same number for every owner. */
export const RUN_MISSED_GRACE_MS = 10 * 60 * 1000;

export interface RunsWindow { now: string; upcoming_until: string }
/** What one run needs besides Molis Work running; the platform marks a run as waiting when one of them is not there. */
export type RunNeed = "network" | "model";
export interface ScheduledRun {
  /** Stable for this occurrence: the next time the same task comes due is another id. */
  run_id: string;
  /** What runs, in the person's words. */
  title: string;
  due_at: string;
  /** The project it belongs to, or null for the personal space. */
  project_id: string | null;
  /** Where the person opens it: the owner's surface and item. */
  open: { surface: string; id: string } | null;
  needs: RunNeed[];
}
export interface MissedRun extends ScheduledRun { missed_at: string }
export interface RunsOverview { source: { surface: string; title: string }; upcoming: ScheduledRun[]; missed: MissedRun[] }
export type RunDecisionChoice = "run_now" | "skip";
export interface RunDecision { run_id: string; decision: RunDecisionChoice }
/** `started`: the owner took it and runs it the way it runs at its time (it does not wait for the end); `gone`: no longer there. */
export interface RunDecided { state: "started" | "skipped" | "gone" }

export const RUNS_UPCOMING_LIMIT = 20;
export const RUNS_MISSED_LIMIT = 50;

const id = { type: "string", minLength: 1 } as const;
const token = { ...id, pattern: "^[a-zA-Z0-9_-]+$" };
const instant = { ...id, format: "date-time" } as const;
const runId = { ...id, maxLength: 300 } as const;
export const RUNS_WINDOW_SCHEMA = { type: "object", properties: { now: instant, upcoming_until: instant }, required: ["now", "upcoming_until"], additionalProperties: false } as const;
const RUN_PROPERTIES = { run_id: runId, title: { ...id, maxLength: 300 }, due_at: instant, project_id: { type: ["string", "null"], maxLength: 120 },
  open: { anyOf: [{ type: "null" }, { type: "object", properties: { surface: token, id }, required: ["surface", "id"], additionalProperties: false }] },
  needs: { type: "array", maxItems: 2, uniqueItems: true, items: { enum: ["network", "model"] } } } as const;
const RUN_REQUIRED = ["run_id", "title", "due_at", "project_id", "open", "needs"];
export const SCHEDULED_RUN_SCHEMA = { type: "object", properties: RUN_PROPERTIES, required: RUN_REQUIRED, additionalProperties: false } as const;
export const MISSED_RUN_SCHEMA = { type: "object", properties: { ...RUN_PROPERTIES, missed_at: instant }, required: [...RUN_REQUIRED, "missed_at"], additionalProperties: false } as const;
export const RUNS_OVERVIEW_SCHEMA = { type: "object", properties: {
  source: { type: "object", properties: { surface: token, title: id }, required: ["surface", "title"], additionalProperties: false },
  upcoming: { type: "array", maxItems: RUNS_UPCOMING_LIMIT, items: SCHEDULED_RUN_SCHEMA },
  missed: { type: "array", maxItems: RUNS_MISSED_LIMIT, items: MISSED_RUN_SCHEMA } }, required: ["source", "upcoming", "missed"], additionalProperties: false } as const;
export const RUN_DECISION_SCHEMA = { type: "object", properties: { run_id: runId, decision: { enum: ["run_now", "skip"] } }, required: ["run_id", "decision"], additionalProperties: false } as const;
export const RUN_DECIDED_SCHEMA = { type: "object", properties: { state: { enum: ["started", "skipped", "gone"] } }, required: ["state"], additionalProperties: false } as const;

/** Where an owner lives: a project Plugin's own instance (`project`), or the Home (`home`: a Home-level Plugin or the Host). */
export type RunsOwnerScope = "project" | "home";

export function defineRunsOverviewAction(capabilityId: string, version: number, title: string, permissions: string[], scope: RunsOwnerScope): ActionDefinition<RunsWindow, RunsOverview> {
  return { capability_id: capabilityId, version, operation: "query", action: { title, description: "列出接下来要自动运行的事和还没处理的错过的事；只读。", kind: "query", scope, scheduling: "concurrent",
    audiences: ["user"], permissions, subject_kinds: [], ...(scope === "project" ? { home_aggregate: true as const } : {}),
    input_type: RUNS_OVERVIEW_INPUT_TYPE, output_type: RUNS_OVERVIEW_OUTPUT_TYPE, input_schema: inputSchemaFor<RunsWindow>()(RUNS_WINDOW_SCHEMA), output_schema: RUNS_OVERVIEW_SCHEMA } };
}

export function defineRunDecisionAction(capabilityId: string, version: number, title: string, permissions: string[], scope: RunsOwnerScope): ActionDefinition<RunDecision, RunDecided> {
  return { capability_id: capabilityId, version, operation: "command", action: { title, description: "对一件错过的事：现在做一次，或跳过。", kind: "operation", scope, effect: "write",
    audiences: ["user"], permissions, subject_kinds: [],
    input_type: RUN_DECISION_INPUT_TYPE, output_type: RUN_DECISION_OUTPUT_TYPE, input_schema: inputSchemaFor<RunDecision>()(RUN_DECISION_SCHEMA), output_schema: RUN_DECIDED_SCHEMA } };
}

/** Owners list runs with `now <= due_at < upcoming_until`; the window itself is checked here. */
export function assertRunsWindow(window: RunsWindow): void {
  const [now, until] = [window.now, window.upcoming_until].map(Date.parse);
  if (!Number.isFinite(now) || !Number.isFinite(until) || now! > until!) throw new ActionError("actions.input_invalid", "运行时间窗口无效");
}
export function withinRunsWindow(value: string, window: RunsWindow): boolean {
  const instant = Date.parse(value); return instant >= Date.parse(window.now) && instant < Date.parse(window.upcoming_until);
}
/** Whether a run that was due at `dueAt` and comes up at `now` is missed (more than the grace late). */
export function runIsMissed(dueAt: string | number, now: number): boolean {
  const due = typeof dueAt === "number" ? dueAt : Date.parse(dueAt);
  return Number.isFinite(due) && now - due > RUN_MISSED_GRACE_MS;
}
