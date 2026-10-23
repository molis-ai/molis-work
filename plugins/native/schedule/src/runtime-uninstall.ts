import type { PluginInstallationClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ScheduleRuntime } from "./runtime-actions.js";
import { cancelInstallationReminders } from "./reminders.js";
import { cancelInstallationOperations, listScheduledOperations } from "./operations.js";

/** Only explicit uninstall records authorize deletion; absent or replaced identities keep their recovery path. */
export function pruneUninstalledSchedules(runtime: ScheduleRuntime, projectId: string, installations: PluginInstallationClient): void {
  const reminders = runtime.db.prepare("SELECT DISTINCT plugin_id, installation_id FROM schedule_plugin_reminders WHERE project_id = ?").all(projectId) as Array<{ plugin_id: string; installation_id: string | null }>;
  const owners = [...reminders.map(row => [row.plugin_id, row.installation_id] as const),
    ...listScheduledOperations(runtime.db, projectId).map(run => [run.pluginId, run.installationId] as const)];
  const handled = new Set<string>();
  for (const [pluginId, installId] of owners) {
    if (!installId || handled.has(installId)) continue;
    handled.add(installId);
    const record = installations.get(installId);
    if (record?.state !== "uninstalled" || record.plugin_id !== pluginId) continue;
    cancelInstallationReminders(runtime.db, runtime.schedule, projectId, pluginId, installId);
    cancelInstallationOperations(runtime.db, runtime.schedule, projectId, pluginId, installId);
  }
}
