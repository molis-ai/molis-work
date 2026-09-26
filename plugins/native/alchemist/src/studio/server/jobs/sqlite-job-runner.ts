import type { Clock, IdFactory } from "../../domain/kernel/identity.js";
import type { RunStatus } from "../../domain/kernel/run.js";
import type { SqliteDatabase } from "../db/open-database.js";

export interface PersistedJob {
  id: string;
  kind: string;
  status: RunStatus;
  input: unknown;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  attempt: number;
  checkpoint?: unknown;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedJobEvent {
  jobId: string;
  sequence: number;
  type: string;
  payload: unknown;
  createdAt: string;
}

interface JobRow {
  id: string;
  kind: string;
  status: RunStatus;
  input_json: string;
  lease_owner: string | null;
  lease_expires_at: string | null;
  attempt: number;
  checkpoint_json: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}

interface JobEventRow {
  job_id: string;
  sequence: number;
  type: string;
  payload_json: string;
  created_at: string;
}

export interface SqliteJobRunnerOptions {
  workerId: string;
  clock: Clock;
  idFactory: IdFactory;
  leaseMs?: number;
  actorId?(): string;
}

export class SqliteJobRunner {
  private readonly leaseMs: number;

  constructor(
    private readonly database: SqliteDatabase,
    private readonly options: SqliteJobRunnerOptions,
  ) {
    this.leaseMs = options.leaseMs ?? 30_000;
  }

  get renewalIntervalMs(): number { return Math.max(1, Math.min(1000, Math.floor(this.leaseMs / 3))); }

  ownsLease(jobId: string): boolean {
    const job = this.get(jobId);
    return job?.status === "running" && job.leaseOwner === this.options.workerId
      && Boolean(job.leaseExpiresAt && job.leaseExpiresAt > this.options.clock.now());
  }

  renewLease(jobId: string): boolean {
    const now = this.options.clock.now();
    const expires = new Date(Date.parse(now) + this.leaseMs).toISOString();
    return this.database.prepare(`UPDATE jobs SET lease_expires_at = ?
      WHERE id = ? AND status = 'running' AND lease_owner = ? AND lease_expires_at > ?`)
      .run(expires, jobId, this.options.workerId, now).changes === 1;
  }

  /** Synchronous plugin persistence is fenced by the original job in the same DB transaction. */
  withLease<T>(jobId: string, write: () => T): T {
    return this.database.transaction(() => {
      if (!this.ownsLease(jobId)) throw new Error("JOB_LEASE_NOT_OWNED");
      return write();
    }).immediate();
  }

  enqueue(input: { kind: string; payload: unknown }): PersistedJob {
    const now = this.options.clock.now();
    const job: PersistedJob = {
      id: this.options.idFactory.next("job"),
      kind: input.kind,
      status: "queued",
      input: this.options.actorId && input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)
        ? { ...input.payload, actorId: this.options.actorId() } : input.payload,
      attempt: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO jobs (
            id, kind, status, input_json, lease_owner, lease_expires_at, attempt,
            checkpoint_json, error_code, created_at, updated_at
          ) VALUES (?, ?, 'queued', ?, NULL, NULL, 0, NULL, NULL, ?, ?)`,
        )
        .run(job.id, job.kind, JSON.stringify(job.input), now, now);
      this.appendEvent(job.id, "queued", {});
    }).immediate();
    return job;
  }

  get(id: string): PersistedJob | undefined {
    const row = this.database.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
    return row ? mapJob(row) : undefined;
  }

  listRecent(limit = 100): PersistedJob[] {
    return (
      this.database
        .prepare("SELECT * FROM jobs ORDER BY updated_at DESC, rowid DESC LIMIT ?")
        .all(limit) as JobRow[]
    ).map(mapJob);
  }

  claimNext(): PersistedJob | undefined {
    return this.database.transaction(() => {
      const row = this.database
        .prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at, id LIMIT 1")
        .get() as JobRow | undefined;
      if (!row) return undefined;
      const now = this.options.clock.now();
      const leaseExpiresAt = new Date(Date.parse(now) + this.leaseMs).toISOString();
      const update = this.database
        .prepare(
          `UPDATE jobs
           SET status = 'running', lease_owner = ?, lease_expires_at = ?, attempt = attempt + 1,
               error_code = NULL, updated_at = ?
           WHERE id = ? AND status = 'queued'`,
        )
        .run(this.options.workerId, leaseExpiresAt, now, row.id);
      if (update.changes !== 1) return undefined;
      this.appendEvent(row.id, "running", { attempt: row.attempt + 1 });
      return this.get(row.id);
    }).immediate();
  }

  saveCheckpoint(
    jobId: string,
    checkpoint: unknown,
    event?: { type: string; payload: unknown },
  ): PersistedJob {
    return this.withLease(jobId, () => {
      const now = this.options.clock.now();
      const update = this.database
        .prepare(
          `UPDATE jobs SET checkpoint_json = ?, updated_at = ?
           WHERE id = ? AND status = 'running' AND lease_owner = ?`,
        )
        .run(JSON.stringify(checkpoint), now, jobId, this.options.workerId);
      if (update.changes !== 1) throw new Error("JOB_LEASE_NOT_OWNED");
      this.appendEvent(jobId, event?.type ?? "checkpoint_saved", event?.payload ?? {});
      return this.require(jobId);
    });
  }

  complete(jobId: string): PersistedJob {
    return this.finish(jobId, "completed");
  }

  fail(jobId: string, errorCode: string): PersistedJob {
    return this.finish(jobId, "failed", errorCode);
  }

  cancel(jobId: string): PersistedJob {
    return this.database.transaction(() => {
      const now = this.options.clock.now();
      const update = this.database
        .prepare(
          `UPDATE jobs
           SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
           WHERE id = ? AND status IN ('queued', 'running')`,
        )
        .run(now, jobId);
      if (update.changes !== 1) throw new Error("JOB_NOT_CANCELLABLE");
      this.appendEvent(jobId, "cancelled", {});
      return this.require(jobId);
    }).immediate();
  }

  recoverExpired(): number {
    const now = this.options.clock.now();
    return this.database.transaction(() => {
      const expired = this.database
        .prepare(
          `SELECT * FROM jobs
           WHERE status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
           ORDER BY created_at, id`,
        )
        .all(now) as JobRow[];
      for (const row of expired) {
        this.database
          .prepare("UPDATE jobs SET status = 'interrupted', updated_at = ? WHERE id = ?")
          .run(now, row.id);
        this.appendEvent(row.id, "interrupted", { previousWorker: row.lease_owner });
        this.database
          .prepare(
            `UPDATE jobs
             SET status = 'queued', lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
             WHERE id = ?`,
          )
          .run(now, row.id);
        this.appendEvent(row.id, "queued", { reason: "recovered_after_interruption" });
      }
      return expired.length;
    }).immediate();
  }

  listEvents(jobId: string, afterSequence = 0): PersistedJobEvent[] {
    return (
      this.database
        .prepare(
          `SELECT * FROM job_events
           WHERE job_id = ? AND sequence > ? ORDER BY sequence`,
        )
        .all(jobId, afterSequence) as JobEventRow[]
    ).map(mapJobEvent);
  }

  readEvents(jobId: string, afterSequence = 0): { jobId: string; status: RunStatus; cursor: number; events: PersistedJobEvent[] } {
    return this.database.transaction(() => {
      const job = this.require(jobId);
      const events = this.listEvents(jobId, afterSequence);
      return { jobId, status: job.status, cursor: events.at(-1)?.sequence ?? afterSequence, events };
    })();
  }

  private finish(jobId: string, status: "completed" | "failed", errorCode?: string): PersistedJob {
    return this.withLease(jobId, () => {
      const now = this.options.clock.now();
      const update = this.database
        .prepare(
          `UPDATE jobs
           SET status = ?, error_code = ?, lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
           WHERE id = ? AND status = 'running' AND lease_owner = ?`,
        )
        .run(status, errorCode ?? null, now, jobId, this.options.workerId);
      if (update.changes !== 1) throw new Error("JOB_LEASE_NOT_OWNED");
      this.appendEvent(jobId, status, errorCode ? { errorCode } : {});
      return this.require(jobId);
    });
  }

  private appendEvent(jobId: string, type: string, payload: unknown): void {
    const sequenceRow = this.database
      .prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM job_events WHERE job_id = ?")
      .get(jobId) as { sequence: number };
    this.database
      .prepare(
        "INSERT INTO job_events (job_id, sequence, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(jobId, sequenceRow.sequence, type, JSON.stringify(payload), this.options.clock.now());
  }

  private require(id: string): PersistedJob {
    const job = this.get(id);
    if (!job) throw new Error("JOB_NOT_FOUND");
    return job;
  }
}

function mapJob(row: JobRow): PersistedJob {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    input: JSON.parse(row.input_json) as unknown,
    ...(row.lease_owner ? { leaseOwner: row.lease_owner } : {}),
    ...(row.lease_expires_at ? { leaseExpiresAt: row.lease_expires_at } : {}),
    attempt: row.attempt,
    ...(row.checkpoint_json ? { checkpoint: JSON.parse(row.checkpoint_json) as unknown } : {}),
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapJobEvent(row: JobEventRow): PersistedJobEvent {
  return {
    jobId: row.job_id,
    sequence: row.sequence,
    type: row.type,
    payload: JSON.parse(row.payload_json) as unknown,
    createdAt: row.created_at,
  };
}
