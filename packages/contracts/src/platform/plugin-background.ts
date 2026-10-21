import type { PluginExecutionControl } from "./plugin.js";

/** Ephemeral execution, and jobs kept while the activation runs. The owner persists its job, handles failure, and decides how restart recovery works. */
export interface PluginBackgroundClient {
  /** Called inside this installation's concurrent command with declared background_job metadata. */
  start<T>(work: (control: PluginExecutionControl) => Promise<T>, options?: { signal?: AbortSignal }): Promise<PluginBackgroundExecution<T>>;
  /**
   * A job declared in the Manifest's `background.jobs`, kept for as long as this activation runs (PG-038). It is kept only from three
   * places: this installation's command once its last authority check passed (`beforeEffect()` returned), the activation's `start()`
   * before it returns, and another job of this activation. It holds the installation's own authority, never the call's: cancelling or
   * revoking that call does not stop it, and it reaches actions only as this installation. It stops when the plugin stops, the
   * installation is revoked or replaced, its project is closed or deleted, or the Home closes; from then on every write through the
   * platform is refused.
   */
  keep(job: string, work: (control: PluginJobControl) => Promise<void>): PluginKeptJob;
}

export interface PluginBackgroundExecution<T> {
  /** Stops waiting when cancelled or authority is lost, even if the underlying operation ignores cancellation. */
  readonly result: Promise<T>;
  /** Cancels this execution; it does not write a job status or retry. */
  cancel(): void;
}

/** A job's control names no caller, audience or page: only the job, its lifetime and the installation's authority. */
export interface PluginJobControl {
  readonly job: string;
  readonly signal: AbortSignal;
  /** Await right before each write: the job still runs, the activation is live, and the installation's record still grants the job's permissions. */
  beforeEffect(): Promise<void>;
  assert_authority_current(): void;
  /** The call's project for a job kept in a command, its parent's for one kept in a job; none for a Home activation's `start()`. */
  readonly project_id?: string;
}

export interface PluginKeptJob {
  /** Settles when the work ends, and as soon as the job is stopped, even if the work ignores its signal. */
  readonly done: Promise<void>;
  /** Stops this job; it writes no job status. */
  cancel(): void;
}

/** One job a Manifest declares: why it exists and the permissions its writes need, each declared in the Manifest's `permissions`. */
export interface PluginJobDeclaration {
  readonly job_id: string;
  readonly reason: string;
  readonly permissions: readonly string[];
}
