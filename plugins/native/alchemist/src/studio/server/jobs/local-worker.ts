import type { PersistedJob, SqliteJobRunner } from "./sqlite-job-runner.js";

export class JobExecutionError extends Error {
  readonly name = "JobExecutionError";

  constructor(readonly code: string) {
    super(code);
  }
}

export interface JobHandlerControl {
  saveCheckpoint(checkpoint: unknown, event?: { type: string; payload: unknown }): void;
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
    try {
      await handler(job, {
        saveCheckpoint: (checkpoint, event) => {
          this.jobs.saveCheckpoint(job.id, checkpoint, event);
        },
        isCancelled: () => this.jobs.get(job.id)?.status === "cancelled",
        signal: controller.signal,
      });
      if (this.jobs.get(job.id)?.status === "cancelled") return true;
      this.jobs.complete(job.id);
    } catch (error) {
      if (this.jobs.get(job.id)?.status === "cancelled") return true;
      this.jobs.fail(job.id, error instanceof JobExecutionError ? error.code : "JOB_EXECUTION_FAILED");
    } finally {
      this.active = undefined;
      settle();
    }
    return true;
  }
}
