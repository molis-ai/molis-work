import type { ActionReference } from "./actions.js";
import type { ScheduleJobRecord, ScheduleRecurrence } from "../services/scheduler.js";
import type { PluginDatabaseTransaction } from "./plugin-database.js";

/** One declared command the platform may wake, under this installation's authority. */
export interface PluginWakeupDeclaration {
  readonly action: Pick<ActionReference, "capability_id" | "version">;
  readonly reason: string;
}

export interface PluginScheduleRegisterInput {
  action: Pick<ActionReference, "capability_id" | "version">;
  object_ref: string;
  title: string;
  due_at: string;
  recurrence?: ScheduleRecurrence;
}

export interface PluginScheduleJob extends ScheduleJobRecord {
  /** A new installation may inspect old jobs, but only an explicit registration authorizes their execution. */
  authorization: "current" | "needs_confirmation";
}

/** Changes join the plugin's current project transaction; the platform supplies the job owner. */
export interface PluginScheduleWriter {
  register(input: PluginScheduleRegisterInput): PluginScheduleJob;
  cancel(jobId: string): { cancelled: boolean };
  setEnabled(jobId: string, enabled: boolean): PluginScheduleJob;
}

/** The current plugin's wakeups. A transaction from another library, activation or owner is refused. */
export interface PluginScheduleClient {
  list(): PluginScheduleJob[];
  get(jobId: string): PluginScheduleJob | null;
  isExecuting(jobId: string): boolean;
  /** Synchronous body. Rollback undoes both owners' records and does not interrupt an existing execution. */
  join<T>(transaction: PluginDatabaseTransaction, write: (schedule: PluginScheduleWriter) => T): T;
}
