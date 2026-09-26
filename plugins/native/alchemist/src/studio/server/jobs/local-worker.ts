import type { PersistedJob, SqliteJobRunner } from "./sqlite-job-runner.js";

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
  /** Includes remote cancellation and a lost/expired execution lease. */
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
    let leaseLost = false;
    const loseLease = () => {
      leaseLost = true;
      clearInterval(heartbeat);
      controller.abort(new Error("JOB_LEASE_NOT_OWNED"));
    };
    const heartbeat = setInterval(() => {
      try {
        if (!this.jobs.renewLease(job.id)) loseLease();
      } catch { loseLease(); }
    }, this.jobs.renewalIntervalMs);
    heartbeat.unref();
    try {
      await handler(job, {
        commit: write => {
          if (leaseLost) throw new Error("JOB_LEASE_NOT_OWNED");
          return this.jobs.withLease(job.id, write);
        },
        saveCheckpoint: (checkpoint, event) => {
          if (leaseLost) throw new Error("JOB_LEASE_NOT_OWNED");
          this.jobs.saveCheckpoint(job.id, checkpoint, event);
        },
        isCancelled: () => leaseLost || !this.jobs.ownsLease(job.id),
        signal: controller.signal,
      });
      if (leaseLost || !this.jobs.ownsLease(job.id)) return true;
      this.jobs.complete(job.id);
    } catch (error) {
      if (leaseLost || !this.jobs.ownsLease(job.id)) return true;
      this.jobs.fail(job.id, error instanceof JobExecutionError ? error.code : "JOB_EXECUTION_FAILED");
    } finally {
      clearInterval(heartbeat);
      this.active = undefined;
      settle();
    }
    return true;
  }
}
