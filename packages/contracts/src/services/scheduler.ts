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

export const scheduleCapabilities = {
  register: {
    capability_id: "schedule.register",
    version: 1,
    operation: "command",
  } as HostCapabilityDefinition<ScheduleRegisterInput, ScheduleJobRecord>,
  cancel: {
    capability_id: "schedule.cancel",
    version: 1,
    operation: "command",
  } as HostCapabilityDefinition<{ job_id: string; plugin_id: string }, { cancelled: boolean }>,
  setEnabled: {
    capability_id: "schedule.setEnabled",
    version: 1,
    operation: "command",
  } as HostCapabilityDefinition<{ job_id: string; plugin_id: string; enabled: boolean }, ScheduleJobRecord>,
  list: {
    capability_id: "schedule.list",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<{ plugin_id?: string }, { jobs: ScheduleJobRecord[] }>,
} as const;
