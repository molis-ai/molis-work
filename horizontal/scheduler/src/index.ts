import { randomUUID } from "node:crypto";
import { createActionWakeups, SCHEDULE_ACTION_BINDINGS_SCHEMA, type ScheduleActionBinding } from "./action-wakeups.js";
export type { ScheduleActionBinding, ScheduleActionOwner } from "./action-wakeups.js";
import { createExecutionLifetime } from "@molis-ai/molis-work-plugin-sdk";

import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  MIN_SCHEDULE_INTERVAL_MS,
  SCHEDULE_LEASE_MS,
  schedulerErrors,
  type ScheduleJobRecord,
  type ScheduleRecurrence,
  type ScheduleRegisterInput,
  type ScheduleTickResult,
  type ScheduleWakeupInput,
  type ScheduleWakeupControl,
  type ScheduleWakeupRecord,
  type ScheduleWakeupReply,
  type ScheduleWakeupStatus,
} from "@molis-ai/molis-work-contracts/services/scheduler";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-service-scheduler",
  packagePath: "horizontal/scheduler",
  kind: "horizontal",
  maturity: "production",
  contract: "@molis-ai/molis-work-contracts/services/scheduler",
  migrationGoals: ["goal-reorg-f2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["scheduler.wakeup.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export {
  MIN_SCHEDULE_INTERVAL_MS,
  SCHEDULE_LEASE_MS,
};
export type {
  ScheduleJobRecord,
  ScheduleRecurrence,
  ScheduleRegisterInput,
  ScheduleTickResult,
  ScheduleWakeupInput,
  ScheduleWakeupControl,
  ScheduleWakeupRecord,
  ScheduleWakeupReply,
};

type Statement = {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint };
};

export interface ScheduleSqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  transaction<T>(operation: () => T): (() => T) & { immediate(): T };
}

interface ScheduleServiceOptions {
  now?: () => Date;
  leaseMs?: number;
}

interface JobRow {
  job_id: string;
  plugin_id: string;
  capability_id: string;
  object_ref: string;
  title: string;
  recurrence_kind: "once" | "interval";
  interval_ms: number | null;
  next_due_at: string;
  enabled: number;
  lease_until: string | null;
  /** Identifies the execution that holds the lease. Null when nobody owns it. */
  lease_token: string | null;
  last_wakeup_id: string | null;
  created_at: string;
  updated_at: string;
}

interface WakeupRow {
  wakeup_id: string;
  job_id: string;
  due_at: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  detail: string | null;
}

/** The scheduler tables, as one current schema; the host composes them into the project database baseline. */
export const SCHEDULER_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS schedule_jobs (
      job_id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      capability_id TEXT NOT NULL,
      object_ref TEXT NOT NULL,
      title TEXT NOT NULL,
      recurrence_kind TEXT NOT NULL CHECK (recurrence_kind IN ('once', 'interval')),
      interval_ms INTEGER,
      next_due_at TEXT NOT NULL,
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      lease_until TEXT,
      lease_token TEXT,
      last_wakeup_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (plugin_id, capability_id, object_ref)
    );
    CREATE INDEX IF NOT EXISTS schedule_jobs_due_idx
      ON schedule_jobs(enabled, next_due_at);

    CREATE TABLE IF NOT EXISTS schedule_wakeups (
      wakeup_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      due_at TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL CHECK (status IN ('ok', 'failed', 'plugin_unavailable')),
      detail TEXT,
      FOREIGN KEY (job_id) REFERENCES schedule_jobs(job_id)
    );
${SCHEDULE_ACTION_BINDINGS_SCHEMA}
`;

export function scheduleFingerprint(db: ScheduleSqliteDatabase): string {
  db.exec(SCHEDULER_SCHEMA_SQL);
  const jobs = db.prepare(
    "SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), '') AS updated FROM schedule_jobs",
  ).get() as { n: number; updated: string };
  const wakeups = db.prepare(
    "SELECT COUNT(*) AS n, COALESCE(MAX(finished_at), '') AS updated FROM schedule_wakeups",
  ).get() as { n: number; updated: string };
  return JSON.stringify({ jobs, wakeups });
}

function abortExecutionAfterCommit(execution: { controller: AbortController } | undefined, reason: string, afterCommit: (effect: () => void) => void): void {
  afterCommit(() => execution?.controller.abort(new Error(reason)));
}

export function createScheduleService(db: ScheduleSqliteDatabase, options: ScheduleServiceOptions = {}) {
  db.exec(SCHEDULER_SCHEMA_SQL);
  const now = options.now ?? (() => new Date());
  const leaseMs = options.leaseMs ?? SCHEDULE_LEASE_MS;
  // Tokens this process is still executing. A replacement service does not see
  // them, so a crash (no more renewal) leaves only the sqlite lease, which can
  // be taken over once it expires. This map is not the lock.
  const executions = new Map<string, { token: string; controller: AbortController; job: JobRow }>();
  const actionWakeups = createActionWakeups(db, executions);
  const ticks = new Set<Promise<ScheduleTickResult>>();
  let closed = false;
  const requireOpen = () => { if (closed) throw new DOMException("Schedule stopped", "AbortError"); };

  function storeSchedule(input: ScheduleRegisterInput, afterCommit: (effect: () => void) => void, binding: ScheduleActionBinding): ScheduleJobRecord {
    requireOpen();
    const pluginId = normalizeIdentity(input.plugin_id, "插件身份");
    const capabilityId = normalizeIdentity(input.capability_id, "执行接口");
    const objectRef = normalizeObjectRef(input.object_ref);
    const title = normalizeTitle(input.title);
    const dueAt = normalizeDueAt(input.due_at);
    const recurrence = normalizeRecurrence(input.recurrence);
    if (!actionWakeups.accepts(binding, pluginId, capabilityId)) {
      throw schedulerErrors.handler_missing("叫醒对象还没有提供执行接口");
    }
    const clock = iso(now());
    const existing = db.prepare(
      "SELECT * FROM schedule_jobs WHERE plugin_id = ? AND capability_id = ? AND object_ref = ?",
    ).get(pluginId, capabilityId, objectRef) as JobRow | undefined;
    const jobId = existing?.job_id ?? `job_${randomUUID()}`;
    const createdAt = existing?.created_at ?? clock;
    db.prepare(`
      INSERT INTO schedule_jobs (
        job_id, plugin_id, capability_id, object_ref, title, recurrence_kind, interval_ms,
        next_due_at, enabled, lease_until, last_wakeup_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?, ?)
      ON CONFLICT(plugin_id, capability_id, object_ref) DO UPDATE SET
        title = excluded.title,
        recurrence_kind = excluded.recurrence_kind,
        interval_ms = excluded.interval_ms,
        next_due_at = excluded.next_due_at,
        enabled = 1,
        lease_until = NULL,
        lease_token = NULL,
        updated_at = excluded.updated_at
    `).run(
      jobId, pluginId, capabilityId, objectRef, title,
      recurrence.kind, recurrence.kind === "interval" ? recurrence.interval_ms : null,
      dueAt, existing?.last_wakeup_id ?? null, createdAt, clock,
    );
    actionWakeups.save(jobId, binding);
    abortExecutionAfterCommit(executions.get(jobId), "Schedule replaced", afterCommit);
    return mustRead(jobId);
  }

  function cancel(jobId: string, pluginId?: string, afterCommit: (effect: () => void) => void = effect => effect()): { cancelled: boolean } {
    requireOpen();
    const job = readOwned(jobId, pluginId);
    db.prepare("DELETE FROM schedule_wakeups WHERE job_id = ?").run(job.job_id);
    db.prepare("DELETE FROM schedule_jobs WHERE job_id = ?").run(job.job_id);
    abortExecutionAfterCommit(executions.get(jobId), "Schedule cancelled", afterCommit);
    return { cancelled: true };
  }

  function setEnabled(jobId: string, enabled: boolean, pluginId?: string, afterCommit: (effect: () => void) => void = effect => effect()): ScheduleJobRecord {
    requireOpen();
    const job = readOwned(jobId, pluginId);
    const clock = iso(now());
    if (enabled) {
      // Keep any live lease. Clearing it here would let a second tick claim
      // the job while the handler that was paused is still running.
      db.prepare("UPDATE schedule_jobs SET enabled = 1, updated_at = ? WHERE job_id = ?")
        .run(clock, job.job_id);
    } else {
      // Drop the execution identity so a late finish cannot write this job
      // back to enabled, and cannot clear a lease a later execution holds.
      db.prepare(`
        UPDATE schedule_jobs
        SET enabled = 0, lease_until = NULL, lease_token = NULL, updated_at = ?
        WHERE job_id = ?
      `).run(clock, job.job_id);
      abortExecutionAfterCommit(executions.get(jobId), "Schedule paused", afterCommit);
    }
    return mustRead(job.job_id);
  }

  function list(pluginId?: string): ScheduleJobRecord[] {
    requireOpen();
    const rows = (pluginId
      ? db.prepare("SELECT * FROM schedule_jobs WHERE plugin_id = ? ORDER BY enabled DESC, next_due_at ASC").all(pluginId)
      : db.prepare("SELECT * FROM schedule_jobs ORDER BY enabled DESC, next_due_at ASC").all()
    ) as JobRow[];
    return rows.map(row => scheduleRecord(db, row));
  }

  function get(jobId: string): ScheduleJobRecord | null {
    requireOpen();
    const row = db.prepare("SELECT * FROM schedule_jobs WHERE job_id = ?").get(jobId) as JobRow | undefined;
    return row ? scheduleRecord(db, row) : null;
  }

  /** Read the shared lease so task owners do not rearm a one-shot wakeup that is still running. */
  function isExecuting(jobId: string): boolean {
    requireOpen();
    const row = db.prepare("SELECT lease_token, lease_until FROM schedule_jobs WHERE job_id = ?").get(jobId) as Pick<JobRow, "lease_token" | "lease_until"> | undefined;
    return Boolean(row?.lease_token && row.lease_until && row.lease_until > iso(now()));
  }

  async function runTick(at: Date): Promise<ScheduleTickResult> {
    renewExecutions(at);
    const result: ScheduleTickResult = { invoked: 0, failed: 0, skipped: 0 };
    const clock = iso(at);
    const due = db.prepare(
      "SELECT job_id FROM schedule_jobs WHERE enabled = 1 AND next_due_at <= ? ORDER BY next_due_at ASC",
    ).all(clock) as Array<{ job_id: string }>;
    for (const item of due) {
      if (closed) break;
      const claimed = claim(item.job_id, at);
      if (!claimed) {
        result.skipped += 1;
        continue;
      }
      const outcome = await fireScheduleWakeup(db, claimed, at, { now, leaseMs, executions, renewExecutions, actionCurrent: () => actionWakeups.current(claimed), invoke: actionWakeups.invoke });
      result.invoked += 1;
      if (outcome.status !== "ok") result.failed += 1;
    }
    return result;
  }

  function renewExecutions(at: Date): void {
    for (const [jobId, { token, controller, job }] of executions) {
      if (!actionWakeups.current(job)) controller.abort(new DOMException("Scheduled action authorization ended", "AbortError"));
      if (controller.signal.aborted) continue;
      const renewed = db.transaction(() => {
        // Read the clock after acquiring the write lock; waiting for SQLite must not revive an expired lease.
        const timestamp = Math.max(at.getTime(), now().getTime());
        const clock = iso(new Date(timestamp)), leaseUntil = iso(new Date(timestamp + leaseMs));
        return db.prepare(`
          UPDATE schedule_jobs
          SET lease_until = ?, updated_at = ?
          WHERE job_id = ? AND lease_token = ? AND lease_until > ?
        `).run(leaseUntil, clock, jobId, token, clock);
      }).immediate();
      if (Number(renewed.changes) !== 1) controller.abort(new Error("Schedule execution no longer owned"));
    }
  }

  function claim(jobId: string, at: Date): JobRow | null {
    if (executions.has(jobId)) return null;
    const clock = iso(at);
    const leaseUntil = iso(new Date(at.getTime() + leaseMs));
    const token = `lease_${randomUUID()}`;
    return db.transaction(() => {
      const row = db.prepare("SELECT * FROM schedule_jobs WHERE job_id = ?").get(jobId) as JobRow | undefined;
      if (!row || row.enabled !== 1 || row.next_due_at > clock || !actionWakeups.current(row)) return null;
      if (row.lease_until && row.lease_until > clock) return null;
      const updated = db.prepare(`
        UPDATE schedule_jobs
        SET lease_until = ?, lease_token = ?, updated_at = ?
        WHERE job_id = ?
          AND enabled = 1
          AND next_due_at <= ?
          AND (lease_until IS NULL OR lease_until <= ?)
      `).run(leaseUntil, token, clock, jobId, clock, clock);
      if (Number(updated.changes) !== 1) return null;
      return { ...row, lease_until: leaseUntil, lease_token: token, updated_at: clock };
    }).immediate();
  }


  function readOwned(jobId: string, pluginId?: string): JobRow {
    const row = db.prepare("SELECT * FROM schedule_jobs WHERE job_id = ?").get(jobId) as JobRow | undefined;
    if (!row || (pluginId && row.plugin_id !== pluginId)) {
      throw schedulerErrors.job_not_found("定时任务不存在");
    }
    return row;
  }

  function mustRead(jobId: string): ScheduleJobRecord {
    const record = get(jobId);
    if (!record) throw schedulerErrors.job_not_found("定时任务不存在");
    return record;
  }


  function tick(at = now()): Promise<ScheduleTickResult> {
    if (closed) return Promise.resolve({ invoked: 0, failed: 0, skipped: 0 });
    const work = runTick(at);
    ticks.add(work);
    void work.then(() => ticks.delete(work), () => ticks.delete(work));
    return work;
  }

  async function close(): Promise<void> {
    if (!closed) {
      closed = true;
      for (const { token, controller, job } of executions.values()) {
        controller.abort(new DOMException("Schedule stopped", "AbortError"));
        // A dispatched effect may already have happened. Release only our lease;
        // cadence and unknown-outcome recovery still belong to the task owner.
        db.prepare("UPDATE schedule_jobs SET lease_until = NULL, lease_token = NULL WHERE job_id = ? AND lease_token = ?")
          .run(job.job_id, token);
      }
    }
    await Promise.allSettled([...ticks]);
  }

  function start(): void {
    if (ticks.size) throw new Error("Schedule shutdown has not settled");
    closed = false;
  }

  return {
    registerAction: (input: ScheduleRegisterInput, binding: ScheduleActionBinding, afterCommit: (effect: () => void) => void) => storeSchedule(input, afterCommit, binding),
    cancel, setEnabled, list, get, isExecuting, tick, close, start, connectActionOwner: actionWakeups.connect, actionBinding: actionWakeups.bindingFor, get active() { return !closed; } };
}


function scheduleRecord(db: ScheduleSqliteDatabase, row: JobRow): ScheduleJobRecord {
    const last = row.last_wakeup_id
      ? db.prepare("SELECT * FROM schedule_wakeups WHERE wakeup_id = ?").get(row.last_wakeup_id) as WakeupRow | undefined
      : undefined;
    return {
      job_id: row.job_id,
      plugin_id: row.plugin_id,
      capability_id: row.capability_id,
      object_ref: row.object_ref,
      title: row.title,
      recurrence: row.recurrence_kind === "interval"
        ? { kind: "interval", interval_ms: Number(row.interval_ms) }
        : { kind: "once" },
      next_due_at: row.next_due_at,
      enabled: row.enabled === 1,
      last_wakeup: last ? toWakeup(last) : null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }


async function fireScheduleWakeup(db: ScheduleSqliteDatabase, job: JobRow, at: Date, options: {
  now(): Date; leaseMs: number;
  actionCurrent(): boolean;
  invoke(input: ScheduleWakeupInput, control: ScheduleWakeupControl): Promise<ScheduleWakeupReply | void>;
  executions: Map<string, { token: string; controller: AbortController; job: JobRow }>;
  renewExecutions(at: Date): void;
}): Promise<ScheduleWakeupRecord> {
  const { now, leaseMs, executions, renewExecutions } = options;
  const started = iso(at);
  const wakeupId = `wakeup_${randomUUID()}`;
  const dueAt = job.next_due_at;
  const token = job.lease_token;
  const controller = new AbortController();
  if (token) executions.set(job.job_id, { token, controller, job });
  const lifetime = createExecutionLifetime({ signal: controller.signal,
    monitor: { intervalMs: Math.max(1, Math.min(1000, Math.floor(leaseMs / 3))), check: () => {
      if (!options.actionCurrent()) controller.abort(new DOMException("Scheduled action authorization ended", "AbortError"));
      if (!controller.signal.aborted) renewExecutions(now());
    } } });
  const control: ScheduleWakeupControl = { signal: lifetime.signal, beforeEffect: () => {
    if (!options.actionCurrent()) controller.abort(new DOMException("Scheduled action authorization ended", "AbortError"));
    lifetime.assertActive();
    const owned = db.prepare("SELECT lease_token, lease_until FROM schedule_jobs WHERE job_id = ?").get(job.job_id) as Pick<JobRow, "lease_token" | "lease_until"> | undefined;
    if (!token || owned?.lease_token !== token || !owned.lease_until || owned.lease_until <= iso(now())) {
      controller.abort(new Error("Schedule execution no longer owned"));
      lifetime.assertActive();
    }
  } };
  try {
    control.beforeEffect();
    const input: ScheduleWakeupInput = {
      job_id: job.job_id,
      plugin_id: job.plugin_id,
      capability_id: job.capability_id,
      object_ref: job.object_ref,
      due_at: dueAt,
    };
    let status: ScheduleWakeupStatus = "ok";
    let detail: string | null = null;
    try {
      const reply = await lifetime.wait(options.invoke(input, control));
      control.beforeEffect();
      detail = reply?.detail?.slice(0, 500) ?? null;
      status = reply?.status ?? "ok";
    } catch (error) {
      const code = error instanceof ActionError && error.code.startsWith("scheduler.") && Object.hasOwn(schedulerErrors, error.code.slice("scheduler.".length)) ? error.code : "";
      status = code === "scheduler.handler_missing" ? "plugin_unavailable" : "failed";
      detail = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    }
    const finishedAt = iso(now());
    if (token && !lifetime.signal.aborted) {
      db.transaction(() => {
        const owned = db.prepare(
          "SELECT lease_token, lease_until FROM schedule_jobs WHERE job_id = ?",
        ).get(job.job_id) as Pick<JobRow, "lease_token" | "lease_until"> | undefined;
        // An expired lease is no longer owned, even before a replacement takes it.
        if (lifetime.signal.aborted || !options.actionCurrent() || !owned || owned.lease_token !== token || !owned.lease_until || owned.lease_until <= iso(now())) return;
        db.prepare(`
          INSERT INTO schedule_wakeups (wakeup_id, job_id, due_at, started_at, finished_at, status, detail)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(wakeupId, job.job_id, dueAt, started, finishedAt, status, detail);
        // An action prepares its own durable occurrence after claim. Keep the due point until it answers,
        // so a process death between claim and that preparation cannot silently consume one-shot work.
        // A long action stays exclusive because its lease is renewed, not because this timestamp was pushed out.
        db.prepare("UPDATE schedule_jobs SET next_due_at = ?, enabled = ? WHERE job_id = ? AND lease_token = ?")
          .run(nextDueAfter(job, at), job.recurrence_kind === "interval" ? 1 : 0, job.job_id, token);
        db.prepare(`
          UPDATE schedule_jobs
          SET lease_until = NULL, lease_token = NULL, last_wakeup_id = ?, updated_at = ?
          WHERE job_id = ? AND lease_token = ?
        `).run(wakeupId, finishedAt, job.job_id, token);
      }).immediate();
    }
    return {
      wakeup_id: wakeupId,
      job_id: job.job_id,
      due_at: job.next_due_at,
      started_at: started,
      finished_at: finishedAt,
      status,
      detail,
    };
  } finally {
    lifetime.dispose();
    if (token && executions.get(job.job_id)?.token === token) executions.delete(job.job_id);
  }
}

export type ScheduleService = ReturnType<typeof createScheduleService>;

/** The one place a refused input becomes a `scheduler.job_invalid` error; the throw sites read as `throw invalid("...")`. */
function invalid(message: string): ActionError {
  return schedulerErrors.job_invalid(message);
}

function iso(value: Date): string {
  return value.toISOString();
}

function normalizeIdentity(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200 || !/^[a-z0-9][a-z0-9._-]*$/i.test(trimmed)) {
    throw invalid(`${label}无效`);
  }
  return trimmed;
}

function normalizeTitle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) {
    throw invalid("标题无效");
  }
  return trimmed;
}

function normalizeDueAt(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    throw invalid("时间无效");
  }
  return new Date(time).toISOString();
}

function normalizeRecurrence(value: ScheduleRecurrence | undefined): ScheduleRecurrence {
  if (!value || value.kind === "once") return { kind: "once" };
  if (value.kind !== "interval" || !Number.isInteger(value.interval_ms)) {
    throw invalid("重复方式无效");
  }
  if (value.interval_ms < MIN_SCHEDULE_INTERVAL_MS) {
    throw schedulerErrors.interval_too_short("间隔不能短于 5 秒");
  }
  return { kind: "interval", interval_ms: value.interval_ms };
}

function normalizeObjectRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 512 || /[\0\n\r]/.test(trimmed)) {
    throw invalid("对象钥匙无效");
  }
  if (
    trimmed.startsWith("/")
    || trimmed.startsWith("~")
    || trimmed.includes("..")
    || /^[a-zA-Z]:[\\/]/.test(trimmed)
  ) {
    throw schedulerErrors.path_refused("对象钥匙不能是文件路径");
  }
  return trimmed;
}

function nextDueAfter(job: JobRow, at: Date): string {
  if (job.recurrence_kind !== "interval" || !job.interval_ms) return job.next_due_at;
  const interval = Number(job.interval_ms);
  let next = Date.parse(job.next_due_at) + interval;
  const nowMs = at.getTime();
  while (next <= nowMs) next += interval;
  return new Date(next).toISOString();
}

function toWakeup(row: WakeupRow): ScheduleWakeupRecord {
  return {
    wakeup_id: row.wakeup_id,
    job_id: row.job_id,
    due_at: row.due_at,
    started_at: row.started_at,
    finished_at: row.finished_at ?? row.started_at,
    status: row.status as ScheduleWakeupStatus,
    detail: row.detail,
  };
}
