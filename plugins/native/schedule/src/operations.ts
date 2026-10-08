import { randomUUID } from "node:crypto";
import { ScheduleError, type ScheduleJobRecord, type ScheduleRegisterInput, type ScheduleWakeupControl, type ScheduleWakeupInput, type ScheduleWakeupReply } from "@molis-ai/molis-work-contracts/services/scheduler";
import type { SandboxJson } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import type { ScheduleTaskDatabase } from "./tasks.js";
import { SCHEDULE_PLUGIN_ID } from "./manifest.js";

export const SCHEDULE_OPERATION_WAKEUP = "schedule.operation.wakeup";
export const OPERATIONS_PER_INSTALLATION = 20;
const DAY = 86_400_000;
export interface ScheduledOperationIdentity { projectId: string; pluginId: string; installationId: string }
export interface ScheduledOperationInput {
  operation: string; at: string; repeat?: "none" | "daily" | "weekly"; input?: SandboxJson; inbox?: boolean;
}
export interface ScheduledOperationInstallation {
  installationId: string; generation: string; title: string; version: string;
  operations: readonly { id: string; description?: string }[];
}
export interface ScheduledOperation {
  id: string; projectId: string; pluginId: string; installationId: string | null; installationGeneration: string | null;
  pluginTitle: string; operationId: string; operationTitle: string; input: SandboxJson; inbox: boolean; link: string;
  jobId: string; jobOwner: string; repeat: "none" | "daily" | "weekly"; at: string;
  state: "enabled" | "paused" | "needs_confirmation" | "needs_review" | "completed"; detail: string | null;
}
export interface ScheduledOperationOccurrence {
  projectId: string; operationId: string; dueAt: string;
  state: "pending" | "running" | "succeeded" | "failed" | "unknown" | "skipped";
  detail: string | null; startedAt: string | null; finishedAt: string | null;
  decisions?: Array<{ decision: "retry" | "skip"; at: string; previousDetail: string | null }>;
}
export interface ScheduledOperationScheduler {
  register(input: ScheduleRegisterInput): ScheduleJobRecord;
  cancel(jobId: string, owner?: string): { cancelled: boolean };
  get(jobId: string): ScheduleJobRecord | null;
  isExecuting(jobId: string): boolean;
  setEnabled(jobId: string, enabled: boolean, owner?: string): ScheduleJobRecord;
}
export interface ScheduledOperationOutcome { state: "succeeded" | "failed" | "unknown"; value: unknown }
export interface ScheduledOperationExecutor {
  signal: AbortSignal;
  beforeEffect(): void;
  invoke(control: ScheduleWakeupControl): Promise<ScheduledOperationOutcome>;
}

/** The scheduled operation tables, as one current schema; the host composes them into the project database baseline. */
export const SCHEDULED_OPERATIONS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS schedule_operations (
    project_id TEXT NOT NULL, id TEXT NOT NULL, job_id TEXT NOT NULL UNIQUE, record_json TEXT NOT NULL,
    PRIMARY KEY (project_id, id)
  );
  CREATE TABLE IF NOT EXISTS schedule_operation_occurrences (
    project_id TEXT NOT NULL, operation_id TEXT NOT NULL, due_at TEXT NOT NULL, record_json TEXT NOT NULL,
    PRIMARY KEY (project_id, operation_id, due_at)
  );
`;
const decode = <T>(row: unknown): T | null => row ? JSON.parse((row as { record_json: string }).record_json) as T : null;
export function getScheduledOperation(db: ScheduleTaskDatabase, projectId: string, id: string): ScheduledOperation | null {
  return decode(db.prepare("SELECT record_json FROM schedule_operations WHERE project_id = ? AND id = ?").get(projectId, id));
}
export function scheduledOperationForJob(db: ScheduleTaskDatabase, jobId: string): ScheduledOperation | null {
  return decode(db.prepare("SELECT record_json FROM schedule_operations WHERE job_id = ?").get(jobId));
}
export function listScheduledOperations(db: ScheduleTaskDatabase, projectId?: string): ScheduledOperation[] {
  return (projectId ? db.prepare("SELECT record_json FROM schedule_operations WHERE project_id = ?").all(projectId)
    : db.prepare("SELECT record_json FROM schedule_operations").all()).map(row => decode<ScheduledOperation>(row)!);
}
export function saveScheduledOperation(db: ScheduleTaskDatabase, operation: ScheduledOperation): void {
  db.prepare("INSERT INTO schedule_operations (project_id, id, job_id, record_json) VALUES (?, ?, ?, ?) ON CONFLICT(project_id, id) DO UPDATE SET record_json = excluded.record_json")
    .run(operation.projectId, operation.id, operation.jobId, JSON.stringify(operation));
}
export function listScheduledOperationOccurrences(db: ScheduleTaskDatabase, projectId: string, operationId?: string): ScheduledOperationOccurrence[] {
  return (operationId ? db.prepare("SELECT record_json FROM schedule_operation_occurrences WHERE project_id = ? AND operation_id = ? ORDER BY due_at").all(projectId, operationId)
    : db.prepare("SELECT record_json FROM schedule_operation_occurrences WHERE project_id = ? ORDER BY due_at").all(projectId)).map(row => decode<ScheduledOperationOccurrence>(row)!);
}
export function saveScheduledOperationOccurrence(db: ScheduleTaskDatabase, occurrence: ScheduledOperationOccurrence): void {
  db.prepare("INSERT INTO schedule_operation_occurrences (project_id, operation_id, due_at, record_json) VALUES (?, ?, ?, ?) ON CONFLICT(project_id, operation_id, due_at) DO UPDATE SET record_json = excluded.record_json")
    .run(occurrence.projectId, occurrence.operationId, occurrence.dueAt, JSON.stringify(occurrence));
}
const occurrenceAt = (db: ScheduleTaskDatabase, run: Pick<ScheduledOperation, "projectId" | "id">, dueAt: string): ScheduledOperationOccurrence | null =>
  decode(db.prepare("SELECT record_json FROM schedule_operation_occurrences WHERE project_id = ? AND operation_id = ? AND due_at = ?").get(run.projectId, run.id, dueAt));

/** Called by Scheduler's synchronous prepare, inside the lease claim transaction. */
export function prepareScheduledOperation(db: ScheduleTaskDatabase, input: ScheduleWakeupInput): void {
  const run = scheduledOperationForJob(db, input.job_id);
  if (!run || run.jobOwner !== input.plugin_id || run.state !== "enabled" || occurrenceAt(db, run, input.due_at)) return;
  saveScheduledOperationOccurrence(db, { projectId: run.projectId, operationId: run.id, dueAt: input.due_at,
    state: "pending", detail: null, startedAt: null, finishedAt: null });
}

/** Creation/cancellation belongs to Schedule; only installation metadata comes from the Host. */
export function createScheduledOperations(options: {
  db: ScheduleTaskDatabase; projectId: string; schedule: ScheduledOperationScheduler;
  describe(identity: ScheduledOperationIdentity): ScheduledOperationInstallation | null;
  link(pluginId: string): string; now?(): number;
}) {
  const { db, schedule, projectId } = options;
  db.exec(SCHEDULED_OPERATIONS_SCHEMA_SQL);
  const describe = (identity: ScheduledOperationIdentity) => {
    if (identity.projectId !== options.projectId || !identity.installationId || !identity.pluginId) throw new Error("定时操作缺少当前项目的插件安装身份");
    const current = options.describe(identity);
    if (!current || current.installationId !== identity.installationId || !current.generation) throw new Error("只有安装好的插件才能设定时执行");
    return current;
  };
  const remove = (run: ScheduledOperation) => {
    try { schedule.cancel(run.jobId, run.jobOwner); }
    catch (error) { if (!(error instanceof ScheduleError) || error.code !== "schedule_job_not_found") throw error; }
    db.prepare("DELETE FROM schedule_operation_occurrences WHERE project_id = ? AND operation_id = ?").run(projectId, run.id);
    db.prepare("DELETE FROM schedule_operations WHERE project_id = ? AND id = ?").run(projectId, run.id);
  };
  return {
    add(identity: ScheduledOperationIdentity, input: ScheduledOperationInput): { scheduleId: string } {
      const now = options.now?.() ?? Date.now(), at = Date.parse(input.at), repeat = input.repeat ?? "none";
      if (!Number.isFinite(at) || !/(?:Z|[+-]\d{2}:?\d{2})$/.test(input.at.trim())) throw new Error("时间要写成带时区的时间");
      if (at < now - 60_000) throw new Error("时间已经过去了");
      if (at > now + 366 * DAY) throw new Error("时间最多设在一年以内");
      if (!["none", "daily", "weekly"].includes(repeat)) throw new Error("未知的定时重复方式");
      return db.transaction(() => {
        const current = describe(identity), operation = current.operations.find(item => item.id === input.operation);
        if (!operation) throw new Error("只能定时运行这个插件自己的功能：没有 " + input.operation);
        const count = listScheduledOperations(db, projectId).filter(run => run.pluginId === identity.pluginId && run.installationId === identity.installationId
          && run.installationGeneration === current.generation && run.state !== "completed").length;
        if (count >= OPERATIONS_PER_INSTALLATION) throw new Error("这个插件的定时执行已经太多了，先取消一些");
        const id = randomUUID(), title = operation.description || operation.id, due = new Date(at).toISOString();
        const job = schedule.register({ plugin_id: SCHEDULE_PLUGIN_ID, capability_id: SCHEDULE_OPERATION_WAKEUP, object_ref: projectId + "|" + id,
          title: (current.title + "：" + title).slice(0, 120), due_at: due,
          recurrence: repeat === "none" ? { kind: "once" } : { kind: "interval", interval_ms: repeat === "daily" ? DAY : 7 * DAY } });
        saveScheduledOperation(db, { id, projectId, pluginId: identity.pluginId, installationId: identity.installationId, installationGeneration: current.generation,
          pluginTitle: current.title, operationId: operation.id, operationTitle: title, input: input.input === undefined ? {} : input.input, inbox: input.inbox === true,
          link: options.link(identity.pluginId), jobId: job.job_id, jobOwner: job.plugin_id, repeat, at: due, state: "enabled", detail: null });
        return { scheduleId: id };
      }).immediate();
    },
    cancel(identity: ScheduledOperationIdentity, input: { scheduleId: string }): { cancelled: boolean } {
      return db.transaction(() => {
        const current = describe(identity), run = getScheduledOperation(db, projectId, input.scheduleId);
        if (!run || run.state === "completed" || run.pluginId !== identity.pluginId || run.installationId !== identity.installationId || run.installationGeneration !== current.generation) return { cancelled: false };
        remove(run); return { cancelled: true };
      }).immediate();
    },
    cancelInstallation(pluginId: string, installationId: string): number {
      return db.transaction(() => {
        const runs = listScheduledOperations(db, projectId).filter(run => run.pluginId === pluginId && run.installationId === installationId);
        runs.forEach(remove); return runs.length;
      }).immediate();
    },
  };
}

/** Reconciliation reads the shared lease, never an old process's in-memory promise. Unknown work is never replayed. */
export function reconcileScheduledOperations(db: ScheduleTaskDatabase, schedule: ScheduledOperationScheduler): void {
  for (const item of listScheduledOperations(db)) db.transaction(() => {
    const run = getScheduledOperation(db, item.projectId, item.id), job = run && schedule.get(run.jobId);
    if (!run || !job || schedule.isExecuting(job.job_id)) return;
    const occurrences = listScheduledOperationOccurrences(db, run.projectId, run.id), interrupted = occurrences.filter(entry => entry.state === "running");
    if (interrupted.length) {
      const detail = "上次调用已派出但结果未知，请先检查结果，再决定重试或跳过本次";
      interrupted.forEach(entry => saveScheduledOperationOccurrence(db, { ...entry, state: "unknown", detail }));
      saveScheduledOperation(db, { ...run, state: "needs_review", detail });
      schedule.setEnabled(job.job_id, false, job.plugin_id); return;
    }
    if (run.state !== "enabled") { if (job.enabled) schedule.setEnabled(job.job_id, false, job.plugin_id); return; }
    const pending = occurrences.find(entry => entry.state === "pending");
    if (pending && (!job.enabled || job.next_due_at !== pending.dueAt)) {
      schedule.register({ plugin_id: job.plugin_id, capability_id: job.capability_id, object_ref: job.object_ref,
        title: job.title, due_at: pending.dueAt, recurrence: job.recurrence });
    }
  }).immediate();
}

/** The public Schedule toggle changes product intent and the technical job together. */
export function setScheduledOperationEnabled(db: ScheduleTaskDatabase, schedule: Pick<ScheduledOperationScheduler, "get" | "setEnabled">,
  jobId: string, enabled: boolean): ScheduleJobRecord | null {
  return db.transaction(() => {
    const run = scheduledOperationForJob(db, jobId);
    if (!run) return null;
    if (enabled && (run.state === "needs_confirmation" || run.state === "needs_review" || run.state === "completed")) {
      throw new ScheduleError("schedule_job_invalid", run.state === "completed" ? "这条一次性定时操作已经完成，请新建定时" : run.detail ?? "请先在定时操作详情确认恢复方式");
    }
    if (enabled && run.state === "paused" && listScheduledOperationOccurrences(db, run.projectId, run.id).some(item => item.state === "running" || item.state === "unknown")) {
      throw new ScheduleError("schedule_job_invalid", "上次定时操作的结果尚未确认，不能直接重跑");
    }
    saveScheduledOperation(db, { ...run, state: enabled ? "enabled" : run.state === "needs_confirmation" || run.state === "needs_review" || run.state === "completed" ? run.state : "paused" });
    return schedule.setEnabled(jobId, enabled, run.jobOwner);
  }).immediate();
}

/** One prepared occurrence, using the current wakeup's lease and a fresh installed executor. */
export async function runScheduledOperation(db: ScheduleTaskDatabase, input: ScheduleWakeupInput, wakeup: ScheduleWakeupControl, ports: {
  currentInstallation(run: ScheduledOperation): boolean;
  executor(run: ScheduledOperation): ScheduledOperationExecutor | null;
  deliver(run: ScheduledOperation, dueAt: string, outcome: ScheduledOperationOutcome, text: string): void;
  now?(): Date;
}): Promise<ScheduleWakeupReply> {
  const run = scheduledOperationForJob(db, input.job_id);
  if (!run || run.jobOwner !== input.plugin_id) return { detail: "定时执行已取消" };
  if (run.state !== "enabled") return { status: "plugin_unavailable", detail: run.detail ?? "定时执行已暂停或完成" };
  const occurrence = occurrenceAt(db, run, input.due_at);
  if (!occurrence) throw new Error("定时执行尚未登记本次持久记录");
  if (occurrence.state === "succeeded" || occurrence.state === "failed") return { status: occurrence.state === "succeeded" ? "ok" : "failed", detail: occurrence.detail ?? "本次已处理" };
  if (occurrence.state === "skipped") return { detail: "本次已明确跳过" };
  if (occurrence.state !== "pending") throw new Error("本次执行结果未知，不能自动重跑");
  const original = JSON.stringify(run), now = ports.now ?? (() => new Date());
  const assertCurrent = () => {
    wakeup.beforeEffect();
    if (JSON.stringify(getScheduledOperation(db, run.projectId, run.id)) !== original) throw new Error("定时操作已暂停、取消或改变");
  };
  if (!run.installationId || !run.installationGeneration || !ports.currentInstallation(run)) {
    const detail = "定时操作的原安装身份不可用，需要重新确认归属";
    db.transaction(() => { assertCurrent(); saveScheduledOperation(db, { ...run, state: "needs_confirmation", detail }); }).immediate();
    return { status: "plugin_unavailable", detail };
  }
  const executor = ports.executor(run);
  if (!executor) return { status: "plugin_unavailable", detail: "安装执行入口尚未就绪，本次仍在等待" };
  const signal = AbortSignal.any([wakeup.signal, executor.signal]);
  const control: ScheduleWakeupControl = { signal, beforeEffect() {
    signal.throwIfAborted(); assertCurrent(); executor.beforeEffect();
    if (!ports.currentInstallation(run)) throw new Error("定时操作的安装身份已改变");
  } };
  db.transaction(() => {
    control.beforeEffect();
    const current = occurrenceAt(db, run, input.due_at);
    if (current?.state !== "pending") throw new Error("本次定时执行已被处理");
    saveScheduledOperationOccurrence(db, { ...occurrence, state: "running", startedAt: now().toISOString() });
  }).immediate();
  let outcome: ScheduledOperationOutcome;
  try { outcome = await executor.invoke(control); }
  catch (error) { control.beforeEffect(); outcome = { state: "unknown", value: error instanceof Error ? error.message : String(error) }; }
  const text = operationResultText(outcome.value);
  db.transaction(() => {
    control.beforeEffect();
    if (outcome.state !== "unknown" && (outcome.state === "failed" || run.inbox)) ports.deliver(run, input.due_at, outcome, text);
    control.beforeEffect();
    saveScheduledOperationOccurrence(db, { ...occurrence, startedAt: occurrenceAt(db, run, input.due_at)!.startedAt,
      state: outcome.state, detail: text, finishedAt: outcome.state === "unknown" ? null : now().toISOString() });
    if (outcome.state === "unknown") saveScheduledOperation(db, { ...run, state: "needs_review", detail: "本次调用的结果未知，请先检查结果再决定是否重试：" + text });
    else if (run.repeat === "none" && !listScheduledOperationOccurrences(db, run.projectId, run.id).some(item => item.state === "pending")) {
      saveScheduledOperation(db, { ...run, state: "completed", detail: text });
    }
  }).immediate();
  return { status: outcome.state === "succeeded" ? "ok" : "failed", detail: outcome.state === "unknown" ? "本次结果未知，已停止后续排期" : outcome.state === "failed" ? "运行失败：" + text : run.inbox ? "已运行，结果放进收件箱" : "已运行" };
}

function operationResultText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "summary", "message"]) if (typeof record[key] === "string" && record[key]) return record[key] as string;
    const first = Object.values(record).find(item => typeof item === "string" && item);
    if (typeof first === "string") return first;
  }
  return (JSON.stringify(value) ?? "").slice(0, 2000);
}
