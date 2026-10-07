import type { ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { createReminderActionHandlers, createScheduleActionHandlers, createScheduleActionPorts, REMINDER_ACTIONS, SCHEDULE_REMINDER_PROVIDER_ID, scheduleManifest } from "@molis-ai/molis-work-plugin-schedule";
import type { MolisWorkProjectRuntime } from "./project-host.js";
import { scheduleServiceFor } from "./schedule-runtime.js";
import { hostScheduleReminders, hostScheduleReminderManagement } from "./schedule-reminders.js";
import { hostScheduledOperationManagement } from "./schedule-operations.js";

/** Tasks live in the project database; the same scheduler wrapper the tick loop uses registers their wakeups. */
export function scheduleActionProvider(runtime: MolisWorkProjectRuntime): ActionProviderRegistration {
  const schedule = scheduleServiceFor(runtime.store.db);
  return {
    provider: { provider_id: scheduleManifest.plugin_id, plugin_id: scheduleManifest.plugin_id, title: scheduleManifest.name, kind: "plugin", project_id: runtime.project_id },
    definitions: scheduleManifest.actions!,
    handlers: createScheduleActionHandlers(runtime.project_id, createScheduleActionPorts({ db: runtime.store.db, schedule,
      operations: hostScheduledOperationManagement({ db: runtime.store.db, projectId: runtime.project_id, schedule }),
      reminders: hostScheduleReminderManagement({ db: runtime.store.db, projectId: runtime.project_id, schedule }) })),
  };
}

/** Common reminders existed without the optional conversation UI; moving the owner must not add a hidden enablement grant. */
export function scheduleReminderActionProvider(runtime: MolisWorkProjectRuntime, routePrefix?: string): ActionProviderRegistration {
  return { provider: { provider_id: SCHEDULE_REMINDER_PROVIDER_ID, title: "Schedule 提醒", kind: "system", project_id: runtime.project_id },
    definitions: REMINDER_ACTIONS,
    handlers: createReminderActionHandlers(runtime.project_id, hostScheduleReminders({ db: runtime.store.db, projectId: runtime.project_id,
      schedule: scheduleServiceFor(runtime.store.db), routePrefix })) };
}
