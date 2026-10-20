import type { PluginExecutionControl } from "./plugin.js";

/** Ephemeral execution only. The owner persists its job, handles failure, and decides how restart recovery works. */
export interface PluginBackgroundClient {
  /** Called inside this installation's concurrent command with declared background_job metadata. */
  start<T>(work: (control: PluginExecutionControl) => Promise<T>, options?: { signal?: AbortSignal }): Promise<PluginBackgroundExecution<T>>;
}

export interface PluginBackgroundExecution<T> {
  /** Stops waiting when cancelled or authority is lost, even if the underlying operation ignores cancellation. */
  readonly result: Promise<T>;
  /** Cancels this execution; it does not write a job status or retry. */
  cancel(): void;
}
