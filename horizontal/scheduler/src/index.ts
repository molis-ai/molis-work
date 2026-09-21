import { randomUUID } from "node:crypto";

import type { HostCapabilityDefinition } from "@molis-ai/molis-work-contracts/platform/app-host";
import {
  MIN_SCHEDULE_INTERVAL_MS,
  SCHEDULE_LEASE_MS,
  ScheduleError,
  scheduleCapabilities,
  type ScheduleJobRecord,
  type ScheduleRecurrence,
  type ScheduleRegisterInput,
  type ScheduleTickResult,
  type ScheduleWakeupInput,
  type ScheduleWakeupRecord,
  type ScheduleWakeupStatus,
} from "@molis-ai/molis-work-contracts/services/scheduler";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-service-scheduler",
  packagePath: "horizontal/scheduler",
  kind: "horizontal",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/services/scheduler",
  migrationGoals: ["goal-reorg-f2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["scheduler.wakeup.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export {
  MIN_SCHEDULE_INTERVAL_MS,
  SCHEDULE_LEASE_MS,
  ScheduleError,
  scheduleCapabilities,
};
export type {
  ScheduleJobRecord,
  ScheduleRecurrence,
  ScheduleRegisterInput,
  ScheduleTickResult,
  ScheduleWakeupInput,
  ScheduleWakeupRecord,
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

export type ScheduleWakeupHandler = (input: ScheduleWakeupInput) => Promise<{ detail?: string } | void>;

export class PluginWakeupIndex {
  private readonly handlers = new Map<string, ScheduleWakeupHandler>();

  register(pluginId: string, capabilityId: string, handler: ScheduleWakeupHandler): () => void {
    const key = wakeupKey(pluginId, capabilityId);
    this.handlers.set(key, handler);
    return () => {
      if (this.handlers.get(key) === handler) this.handlers.delete(key);
    };
  }

  has(pluginId: string, capabilityId: string): boolean {
    return this.handlers.has(wakeupKey(pluginId, capabilityId));
  }

  async invoke(input: ScheduleWakeupInput): Promise<{ detail?: string } | void> {
    const handler = this.handlers.get(wakeupKey(input.plugin_id, input.capability_id));
    if (!handler) {
      throw new ScheduleError("schedule_handler_missing", "叫醒对象还没有提供执行接口");
    }
    return handler(input);
  }
}

interface ScheduleServiceOptions {
  wakeupIndex: PluginWakeupIndex;
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

export function migrateScheduleService(db: ScheduleSqliteDatabase): void {
  db.exec(`
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
  `);
}

export function scheduleFingerprint(db: ScheduleSqliteDatabase): string {
  migrateScheduleService(db);
  const jobs = db.prepare(
    "SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), '') AS updated FROM schedule_jobs",
  ).get() as { n: number; updated: string };
  const wakeups = db.prepare(
    "SELECT COUNT(*) AS n, COALESCE(MAX(finished_at), '') AS updated FROM schedule_wakeups",
  ).get() as { n: number; updated: string };
  return JSON.stringify({ jobs, wakeups });
}

export function bindScheduleCaller<T extends { plugin_id?: string }>(pluginId: string, input: T): T {
  return { ...input, plugin_id: pluginId };
}

export function createScheduleService(db: ScheduleSqliteDatabase, options: ScheduleServiceOptions) {
  migrateScheduleService(db);
  const wakeupIndex = options.wakeupIndex;
  const now = options.now ?? (() => new Date());
  const leaseMs = options.leaseMs ?? SCHEDULE_LEASE_MS;

  function register(input: ScheduleRegisterInput): ScheduleJobRecord {
    const pluginId = normalizeIdentity(input.plugin_id, "插件身份");
    const capabilityId = normalizeIdentity(input.capability_id, "执行接口");
    const objectRef = normalizeObjectRef(input.object_ref);
    const title = normalizeTitle(input.title);
    const dueAt = normalizeDueAt(input.due_at);
    const recurrence = normalizeRecurrence(input.recurrence);
    if (!wakeupIndex.has(pluginId, capabilityId)) {
      throw new ScheduleError("schedule_handler_missing", "叫醒对象还没有提供执行接口");
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
        updated_at = excluded.updated_at
    `).run(
      jobId, pluginId, capabilityId, objectRef, title,
      recurrence.kind, recurrence.kind === "interval" ? recurrence.interval_ms : null,
      dueAt, existing?.last_wakeup_id ?? null, createdAt, clock,
    );
    return mustRead(jobId);
  }

  function cancel(jobId: string, pluginId?: string): { cancelled: boolean } {
    const job = readOwned(jobId, pluginId);
    db.prepare("DELETE FROM schedule_wakeups WHERE job_id = ?").run(job.job_id);
    db.prepare("DELETE FROM schedule_jobs WHERE job_id = ?").run(job.job_id);
    return { cancelled: true };
  }

  function setEnabled(jobId: string, enabled: boolean, pluginId?: string): ScheduleJobRecord {
    const job = readOwned(jobId, pluginId);
    db.prepare("UPDATE schedule_jobs SET enabled = ?, lease_until = NULL, updated_at = ? WHERE job_id = ?")
      .run(enabled ? 1 : 0, iso(now()), job.job_id);
    return mustRead(job.job_id);
  }

  function list(pluginId?: string): ScheduleJobRecord[] {
    const rows = (pluginId
      ? db.prepare("SELECT * FROM schedule_jobs WHERE plugin_id = ? ORDER BY enabled DESC, next_due_at ASC").all(pluginId)
      : db.prepare("SELECT * FROM schedule_jobs ORDER BY enabled DESC, next_due_at ASC").all()
    ) as JobRow[];
    return rows.map(toRecord);
  }

  function get(jobId: string): ScheduleJobRecord | null {
    const row = db.prepare("SELECT * FROM schedule_jobs WHERE job_id = ?").get(jobId) as JobRow | undefined;
    return row ? toRecord(row) : null;
  }

  async function tick(at = now()): Promise<ScheduleTickResult> {
    const result: ScheduleTickResult = { invoked: 0, failed: 0, skipped: 0 };
    const clock = iso(at);
    const due = db.prepare(
      "SELECT job_id FROM schedule_jobs WHERE enabled = 1 AND next_due_at <= ? ORDER BY next_due_at ASC",
    ).all(clock) as Array<{ job_id: string }>;
    for (const item of due) {
      const claimed = claim(item.job_id, at);
      if (!claimed) {
        result.skipped += 1;
        continue;
      }
      const outcome = await fire(claimed, at);
      result.invoked += 1;
      if (outcome.status !== "ok") result.failed += 1;
    }
    return result;
  }

  function claim(jobId: string, at: Date): JobRow | null {
    const clock = iso(at);
    const leaseUntil = iso(new Date(at.getTime() + leaseMs));
    return db.transaction(() => {
      const row = db.prepare("SELECT * FROM schedule_jobs WHERE job_id = ?").get(jobId) as JobRow | undefined;
      if (!row || row.enabled !== 1 || row.next_due_at > clock) return null;
      if (row.lease_until && row.lease_until > clock) return null;
      db.prepare("UPDATE schedule_jobs SET lease_until = ?, updated_at = ? WHERE job_id = ?")
        .run(leaseUntil, clock, jobId);
      return { ...row, lease_until: leaseUntil, updated_at: clock };
    }).immediate();
  }

  async function fire(job: JobRow, at: Date): Promise<ScheduleWakeupRecord> {
    const started = iso(at);
    const wakeupId = `wakeup_${randomUUID()}`;
    const dueAt = job.next_due_at;
    const nextDue = nextDueAfter(job, at);
    const stillEnabled = job.recurrence_kind === "interval" ? 1 : 0;
    // Advance before invoke so a long handler cannot be claimed again after the 30s lease.
    db.prepare(`
      UPDATE schedule_jobs
      SET next_due_at = ?, enabled = ?, updated_at = ?
      WHERE job_id = ?
    `).run(nextDue, stillEnabled, started, job.job_id);
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
      if (!wakeupIndex.has(job.plugin_id, job.capability_id)) {
        throw new ScheduleError("schedule_handler_missing", "叫醒对象还没有提供执行接口");
      }
      const reply = await wakeupIndex.invoke(input);
      detail = reply?.detail?.slice(0, 500) ?? null;
    } catch (error) {
      const code = error instanceof ScheduleError ? error.code : "";
      status = code === "schedule_handler_missing" ? "plugin_unavailable" : "failed";
      detail = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    }
    const finishedAt = iso(now());
    db.prepare(`
      INSERT INTO schedule_wakeups (wakeup_id, job_id, due_at, started_at, finished_at, status, detail)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(wakeupId, job.job_id, dueAt, started, finishedAt, status, detail);
    db.prepare(`
      UPDATE schedule_jobs
      SET lease_until = NULL, last_wakeup_id = ?, updated_at = ?
      WHERE job_id = ?
    `).run(wakeupId, finishedAt, job.job_id);
    return {
      wakeup_id: wakeupId,
      job_id: job.job_id,
      due_at: job.next_due_at,
      started_at: started,
      finished_at: finishedAt,
      status,
      detail,
    };
  }

  function readOwned(jobId: string, pluginId?: string): JobRow {
    const row = db.prepare("SELECT * FROM schedule_jobs WHERE job_id = ?").get(jobId) as JobRow | undefined;
    if (!row || (pluginId && row.plugin_id !== pluginId)) {
      throw new ScheduleError("schedule_job_not_found", "定时任务不存在");
    }
    return row;
  }

  function mustRead(jobId: string): ScheduleJobRecord {
    const record = get(jobId);
    if (!record) throw new ScheduleError("schedule_job_not_found", "定时任务不存在");
    return record;
  }

  function toRecord(row: JobRow): ScheduleJobRecord {
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

  return { register, cancel, setEnabled, list, get, tick };
}

export type ScheduleService = ReturnType<typeof createScheduleService>;

export interface ScheduleCapabilityRegistrar<Context> {
  register<Input, Output>(
    definition: HostCapabilityDefinition<Input, Output>,
    handler: (context: Context, input: Input) => Output | Promise<Output>,
  ): () => void;
}

export function registerScheduleCapabilities<Context>(
  registrar: ScheduleCapabilityRegistrar<Context>,
  serviceFor: (context: Context) => ScheduleService,
): void {
  registrar.register(scheduleCapabilities.register, (_context, input) => serviceFor(_context).register(input));
  registrar.register(scheduleCapabilities.cancel, (_context, input) =>
    serviceFor(_context).cancel(input.job_id, input.plugin_id));
  registrar.register(scheduleCapabilities.setEnabled, (_context, input) =>
    serviceFor(_context).setEnabled(input.job_id, input.enabled, input.plugin_id));
  registrar.register(scheduleCapabilities.list, (_context, input) =>
    ({ jobs: serviceFor(_context).list(input.plugin_id) }));
}

function wakeupKey(pluginId: string, capabilityId: string): string {
  return `${pluginId}\0${capabilityId}`;
}

function iso(value: Date): string {
  return value.toISOString();
}

function normalizeIdentity(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200 || !/^[a-z0-9][a-z0-9._-]*$/i.test(trimmed)) {
    throw new ScheduleError("schedule_job_invalid", `${label}无效`);
  }
  return trimmed;
}

function normalizeTitle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) {
    throw new ScheduleError("schedule_job_invalid", "标题无效");
  }
  return trimmed;
}

function normalizeDueAt(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    throw new ScheduleError("schedule_job_invalid", "时间无效");
  }
  return new Date(time).toISOString();
}

function normalizeRecurrence(value: ScheduleRecurrence | undefined): ScheduleRecurrence {
  if (!value || value.kind === "once") return { kind: "once" };
  if (value.kind !== "interval" || !Number.isInteger(value.interval_ms)) {
    throw new ScheduleError("schedule_job_invalid", "重复方式无效");
  }
  if (value.interval_ms < MIN_SCHEDULE_INTERVAL_MS) {
    throw new ScheduleError("schedule_interval_too_short", "间隔不能短于 5 秒");
  }
  return { kind: "interval", interval_ms: value.interval_ms };
}

function normalizeObjectRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 512 || /[\0\n\r]/.test(trimmed)) {
    throw new ScheduleError("schedule_job_invalid", "对象钥匙无效");
  }
  if (
    trimmed.startsWith("/")
    || trimmed.startsWith("~")
    || trimmed.includes("..")
    || /^[a-zA-Z]:[\\/]/.test(trimmed)
  ) {
    throw new ScheduleError("schedule_path_refused", "对象钥匙不能是文件路径");
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
