import type { ContractDescriptor } from "../platform/package.js";
import { defineErrorCodes } from "../platform/action-errors.js";

export const servicesSchedulerContract = {
  contractId: "io.molis.work.service.scheduler.v1",
  kind: "service",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/horizontal/scheduler.md",
} as const satisfies ContractDescriptor;

/** Shortest interval the product clock accepts. Tests and owners share this floor. */
export const MIN_SCHEDULE_INTERVAL_MS = 5_000;

export const SCHEDULE_LEASE_MS = 30_000;

export type ScheduleRecurrence =
  | { kind: "once" }
  | { kind: "interval"; interval_ms: number };

export type ScheduleWakeupStatus = "ok" | "failed" | "plugin_unavailable";

export interface ScheduleWakeupRecord {
  wakeup_id: string;
  job_id: string;
  due_at: string;
  started_at: string;
  finished_at: string;
  status: ScheduleWakeupStatus;
  detail: string | null;
}

export interface ScheduleJobRecord {
  job_id: string;
  plugin_id: string;
  capability_id: string;
  object_ref: string;
  title: string;
  recurrence: ScheduleRecurrence;
  next_due_at: string;
  enabled: boolean;
  last_wakeup: ScheduleWakeupRecord | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleRegisterInput {
  plugin_id: string;
  capability_id: string;
  object_ref: string;
  title: string;
  due_at: string;
  recurrence?: ScheduleRecurrence;
}

export interface ScheduleTickResult {
  invoked: number;
  failed: number;
  skipped: number;
}

export interface ScheduleWakeupInput {
  job_id: string;
  plugin_id: string;
  capability_id: string;
  object_ref: string;
  due_at: string;
}

/** The owner can report a known failure without throwing away its committed domain receipt. */
export interface ScheduleWakeupReply {
  detail?: string;
  status?: ScheduleWakeupStatus;
}

/** Trusted execution controls supplied by Scheduler; never persisted as task input. */
export interface ScheduleWakeupControl {
  readonly signal: AbortSignal;
  beforeEffect(): void;
}

/** Scheduler's existing input refusals; Schedule translates them at its own action boundary. */
export const schedulerErrors = defineErrorCodes("scheduler", {
  job_invalid: "invalid",
  handler_missing: "invalid",
  job_not_found: "invalid",
  interval_too_short: "invalid",
  path_refused: "invalid",
});
