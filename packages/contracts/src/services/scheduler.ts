import type { ContractDescriptor } from "../platform/package.js";
import type { HostCapabilityDefinition } from "../platform/app-host.js";

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

/**
 * What a Plugin sends to `schedule.register`. The owner is the calling Plugin: the Scheduler reads it from the trusted
 * invocation, so the input has no `plugin_id` and one sent anyway is never read.
 */
export type SchedulePluginRegisterInput = Omit<ScheduleRegisterInput, "plugin_id">;

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

export class ScheduleError extends Error {
  constructor(
    readonly code:
      | "schedule_job_invalid"
      | "schedule_handler_missing"
      | "schedule_job_not_found"
      | "schedule_interval_too_short"
      | "schedule_path_refused",
    message: string,
  ) {
    super(message);
    this.name = "ScheduleError";
  }
}

/**
 * The typed `schedule.*` channel serves Runtime plugins only. Whose jobs a call touches is read from the trusted
 * invocation (`HostCapabilityInvocation.plugin`), never from the input; a call with no plugin identity is refused.
 */
export const scheduleCapabilities = {
  register: {
    capability_id: "schedule.register",
    version: 1,
    operation: "command",
  } as HostCapabilityDefinition<SchedulePluginRegisterInput, ScheduleJobRecord>,
  cancel: {
    capability_id: "schedule.cancel",
    version: 1,
    operation: "command",
  } as HostCapabilityDefinition<{ job_id: string }, { cancelled: boolean }>,
  setEnabled: {
    capability_id: "schedule.setEnabled",
    version: 1,
    operation: "command",
  } as HostCapabilityDefinition<{ job_id: string; enabled: boolean }, ScheduleJobRecord>,
  list: {
    capability_id: "schedule.list",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<Record<string, never>, { jobs: ScheduleJobRecord[] }>,
} as const;
