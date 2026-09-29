import type { PersistedJob, SqliteJobRunner } from "./sqlite-job-runner.js";
import { createExecutionLifetime } from "@molis-ai/molis-work-plugin-sdk";

export class JobExecutionError extends Error {
  readonly name = "JobExecutionError";

  constructor(readonly code: string) {
    super(code);
  }
}

export interface JobHandlerControl {
  /** Write to the business repositories only while this worker still owns the job. */
  commit<T>(write: () => T): T;
  saveCheckpoint(checkpoint: unknown, event?: { type: string; payload: unknown }): void;
  /** Includes local shutdown, remote cancellation and a lost/expired execution lease. */
  isCancelled(): boolean;
  signal: AbortSignal;
}

export type JobHandler = (job: PersistedJob, control: JobHandlerControl) => Promise<void>;
export type JobHandlers = Readonly<Record<string, JobHandler>>;

export class LocalWorker {
  private active: { id: string; controller: AbortController } | undefined;
  private settlement: Promise<void> = Promise.resolve();
  constructor(
    private readonly jobs: SqliteJobRunner,
    private readonly handlers: JobHandlers,
  ) {}

  cancel(jobId: string): void {
    if (this.active?.id === jobId) this.active.controller.abort(new Error("JOB_CANCELLED"));
  }

  stop(): void { this.active?.controller.abort(new Error("RUNTIME_SHUTDOWN")); }
  whenIdle(): Promise<void> { return this.settlement; }

  async runNext(): Promise<boolean> {
    if (this.active) return false;
    const job = this.jobs.claimNext();
    if (!job) return false;
    const handler = this.handlers[job.kind];
    if (!handler) {
      this.jobs.fail(job.id, "JOB_KIND_UNSUPPORTED");
      return true;
    }
    const controller = new AbortController();
    let settle = () => {};
    this.settlement = new Promise(resolve => { settle = resolve; });
    this.active = { id: job.id, controller };
    const lifetime = createExecutionLifetime({
      signal: controller.signal,
      monitor: { intervalMs: this.jobs.renewalIntervalMs, check: () => {
        if (!this.jobs.renewLease(job.id)) throw new Error("JOB_LEASE_NOT_OWNED");
      } },
    });
    const isCancelled = () => lifetime.signal.aborted || !this.jobs.ownsLease(job.id);
    try {
      await handler(job, {
        commit: write => {
          lifetime.assertActive();
          return this.jobs.withLease(job.id, write);
        },
        saveCheckpoint: (checkpoint, event) => {
          lifetime.assertActive();
          this.jobs.saveCheckpoint(job.id, checkpoint, event);
        },
        isCancelled,
        signal: lifetime.signal,
      });
      if (isCancelled()) return true;
      this.jobs.complete(job.id);
    } catch (error) {
      if (isCancelled()) return true;
      this.jobs.fail(job.id, error instanceof JobExecutionError ? error.code : "JOB_EXECUTION_FAILED");
    } finally {
      lifetime.dispose();
      this.active = undefined;
      settle();
    }
    return true;
  }
}
