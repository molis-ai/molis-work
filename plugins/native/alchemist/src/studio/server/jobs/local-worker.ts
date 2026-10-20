import type { RetainedActionAuthority } from "@molis-ai/molis-work-contracts/platform/actions";
import type { TasteRule } from "../../domain/memory/rules.js";
import type { PersistedJob, SqliteJobRunner } from "./sqlite-job-runner.js";
import { createExecutionLifetime } from "@molis-ai/molis-work-plugin-sdk";

export class JobExecutionError extends Error {
  readonly name = "JobExecutionError";
  constructor(readonly code: string) { super(code); }
}

export interface JobAcceptance {
  authority: RetainedActionAuthority;
  actorId: string;
  validate?(): void;
  exploration?: { modelId: string; taste: readonly TasteRule[]; errorCode?: string };
}

export interface JobHandlerControl {
  commit<T>(write: () => T): Promise<T>;
  saveCheckpoint(checkpoint: unknown, event?: { type: string; payload: unknown }): Promise<void>;
  beforeEffect(): Promise<void>;
  assertCurrent(): void;
  isCancelled(): boolean;
  signal: AbortSignal;
  acceptance: JobAcceptance;
  events(): ReturnType<SqliteJobRunner["listEvents"]>;
}
export type JobHandler = (job: PersistedJob, control: JobHandlerControl) => Promise<void>;
export type JobHandlers = Readonly<Record<string, JobHandler>>;

export class LocalWorker {
  private active: { id: string; controller: AbortController } | undefined;
  private readonly pending = new Map<string, { acceptance: JobAcceptance; ready: boolean }>();
  private settlement: Promise<void> = Promise.resolve();
  private stopped = false;
  constructor(private readonly jobs: SqliteJobRunner, private readonly handlers: JobHandlers) {}

  /** Reserve synchronously: a second click cannot register another execution. */
  accept(jobId: string, acceptance: JobAcceptance, ready = true): boolean {
    if (this.stopped) throw new Error("alchemist.runtime_shutdown");
    acceptance.authority.assertCurrent();
    if (this.active?.id === jobId || this.pending.has(jobId)) return false;
    this.pending.set(jobId, { acceptance, ready });
    return true;
  }
  activate(jobId: string): void { const entry = this.pending.get(jobId); if (entry) entry.ready = true; }
  isAccepted(jobId: string): boolean { return this.active?.id === jobId || this.pending.has(jobId); }
  hasAccepted(): boolean { return Boolean(this.active || this.pending.size); }
  cancel(jobId: string): void {
    this.pending.delete(jobId);
    if (this.active?.id === jobId) this.active.controller.abort(new Error("alchemist.job_cancelled"));
  }
  stop(): void {
    this.stopped = true; this.pending.clear();
    this.active?.controller.abort(new Error("alchemist.runtime_shutdown"));
  }
  whenIdle(): Promise<void> { return this.settlement; }

  async runNext(): Promise<boolean> {
    if (this.active || this.stopped) return false;
    const entry = [...this.pending].find(([, value]) => value.ready);
    if (!entry) return false;
    const [id, { acceptance }] = entry;
    const controller = new AbortController();
    let settle = () => {};
    this.settlement = new Promise(resolve => { settle = resolve; });
    this.active = { id, controller };
    this.pending.delete(id);
    const assertAccepted = () => { controller.signal.throwIfAborted(); acceptance.authority.assertCurrent(); };
    const checkAccepted = async () => { assertAccepted(); await acceptance.authority(); assertAccepted(); };
    let dispose = () => {};
    let renewal: Promise<void> = Promise.resolve();
    try {
      await checkAccepted();
      acceptance.validate?.();
      const job = this.jobs.claim(id);
      if (!job) return true;
      const lifetime = createExecutionLifetime({ signal: controller.signal });
      let renewing = false;
      const timer = setInterval(() => {
        if (renewing) return;
        renewing = true;
        renewal = checkAccepted().then(() => {
          lifetime.assertActive();
          if (!this.jobs.renewLease(id)) throw new Error("alchemist.job_lease_not_owned");
        }).catch(error => { controller.abort(error); }).finally(() => { renewing = false; });
      }, this.jobs.renewalIntervalMs);
      timer.unref();
      dispose = () => { clearInterval(timer); lifetime.dispose(); controller.abort(new Error("alchemist.job_settled")); };
      const assertCurrent = () => {
        lifetime.assertActive(); assertAccepted();
        if (!this.jobs.ownsLease(id)) throw new Error("alchemist.job_lease_not_owned");
      };
      const beforeEffect = async () => { assertCurrent(); await checkAccepted(); assertCurrent(); };
      const isCancelled = () => {
        try { assertCurrent(); return false; }
        catch (error) { controller.abort(error); return true; }
      };
      const commit = async <T>(write: () => T): Promise<T> => {
        await beforeEffect(); return this.jobs.withLease(id, () => { assertCurrent(); return write(); });
      };
      try {
        const handler = this.handlers[job.kind];
        if (!handler) throw new JobExecutionError("alchemist.job_kind_unsupported");
        await handler(job, { commit, beforeEffect, assertCurrent, isCancelled,
          saveCheckpoint: async (checkpoint, event) => { await commit(() => this.jobs.saveCheckpoint(id, checkpoint, event)); },
          signal: lifetime.signal, acceptance, events: () => this.jobs.listEvents(id),
        });
        await commit(() => this.jobs.complete(id));
      } catch (error) {
        if (!isCancelled()) await commit(() => this.jobs.fail(id,
          error instanceof JobExecutionError ? error.code : "alchemist.job_execution_failed"));
      }
    } catch (error) {
      // Lost authority or a refused claim leaves the original persisted job untouched.
      controller.abort(error);
    } finally {
      dispose(); await renewal; this.active = undefined; settle();
    }
    return true;
  }
}
