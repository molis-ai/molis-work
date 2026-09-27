import type { ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { createScheduleActionHandlers, createScheduleActionPorts, scheduleManifest } from "@molis-ai/molis-work-plugin-schedule";
import type { MolisWorkProjectRuntime } from "./project-host.js";
import { scheduleServiceFor } from "./schedule-runtime.js";

/** Tasks live in the project database; the same scheduler wrapper the tick loop uses registers their wakeups. */
export function scheduleActionProvider(runtime: MolisWorkProjectRuntime): ActionProviderRegistration {
  return {
    provider: { provider_id: scheduleManifest.plugin_id, plugin_id: scheduleManifest.plugin_id, title: scheduleManifest.name, kind: "plugin", project_id: runtime.project_id },
    definitions: scheduleManifest.actions!,
    handlers: createScheduleActionHandlers(runtime.project_id, createScheduleActionPorts({ db: runtime.store.db, schedule: scheduleServiceFor(runtime.store.db) })),
  };
}
