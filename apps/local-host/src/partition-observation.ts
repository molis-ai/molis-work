import type { DueEntryRecord } from "@molis-ai/molis-work-service-scheduler";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { liveObservation } from "./observation-live.js";
import type { PartitionPluginLifecycleEvent } from "./partition-plugin-assembly.js";

/**
 * The work records of per-partition plugins (docs/horizontal/observation.md「平台服务的 sink」, batch 108): each start and stop of a
 * (plugin, partition) instance, and each fallen-due entry handed to one. Only who, where, when, how it ended and the error's code: never the
 * plugin's data or an error's message. Without a running observation layer (a command-line tool) nothing is recorded.
 */
export function partitionLifecycleRecords(home: string): (event: PartitionPluginLifecycleEvent) => void {
  return event => {
    const { scope } = event;
    liveObservation(home)?.sink("home").bind({ kind: "background", entry: "host", actor_id: `plugin:${scope.plugin_id}`, project_id: scope.partition_id,
      install_id: scope.install_id }).record({ fact: "home.partition_plugin_lifecycle", outcome: event.outcome, stage: event.stage, occurred_at: event.started_at,
      subjects: [{ kind: "plugin", id: scope.plugin_id }],
      detail: { reason: event.reason, duration_ms: event.duration_ms, ...(event.code ? { code: event.code } : {}) } });
  };
}

/** What became of one fallen-due entry: handed over and a reminder told (`succeeded`), handed over with nothing to tell (`no_action`), or not. */
export type DueWakeupOutcome = { readonly outcome: "succeeded" | "no_action" } | { readonly outcome: "failed"; readonly error: unknown };

/** One fallen-due entry's wakeup of its (plugin, partition) instance; a failure stays in the registry and is tried again (`DueTimer`). */
export function dueWakeupRecord(home: string, entry: DueEntryRecord, startedAt: Date, ended: DueWakeupOutcome): void {
  const code = ended.outcome === "failed" && ended.error instanceof ActionError ? ended.error.code : undefined;
  liveObservation(home)?.sink("scheduler").bind({ kind: "background", entry: "schedule", actor_id: `plugin:${entry.plugin_id}`, project_id: entry.partition_id,
    install_id: entry.install_id }).record({ fact: "scheduler.due_wakeup", outcome: ended.outcome, stage: entry.source, occurred_at: startedAt.toISOString(),
    subjects: [{ kind: "due_entry", id: entry.entry_key }],
    detail: { due_at: entry.due_at, late_ms: Math.max(0, startedAt.getTime() - Date.parse(entry.due_at)), ...(code ? { code } : {}) } });
}
