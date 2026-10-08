import { AgentBuilderStore } from "@molis-ai/molis-work-plugin-builder";
import { SqlitePluginRuntimeRepository, SqlitePluginRuntimeReleaseArtifactRepository } from "@molis-ai/molis-work-plugin-runtime";
import { createScheduleReminders, createScheduleReminderManagement, deliverScheduleReminder } from "@molis-ai/molis-work-plugin-schedule";
import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ScheduleService, ScheduleSqliteDatabase, ScheduleWakeupControl, ScheduleWakeupInput } from "@molis-ai/molis-work-service-scheduler";
import { createLocalFeedApplication } from "./feed-application.js";
import { studioStorage } from "./plugin-builder/storage.js";

/** Same-db adapters only: Schedule owns the reminder's product rules and storage. */
export function hostScheduleReminders(options: { db: ScheduleSqliteDatabase; projectId: string; schedule: ScheduleService; routePrefix?: string; now?(): number }) {
  const { installations, describe } = reminderInstallations(options.db, options.projectId);
  return createScheduleReminders({ ...options, describe(identity) {
    const record = installations.get(identity.installationId);
    if (!record || record.plugin_id !== identity.pluginId || record.state !== "running") throw new Error("提醒的插件安装当前没有运行");
    return { ...describe(record),
      link: (options.routePrefix ?? `/projects/${encodeURIComponent(options.projectId)}`) + "/plugins/" + encodeURIComponent(identity.pluginId) };
  } });
}

export function hostScheduleReminderManagement(options: { db: ScheduleSqliteDatabase; projectId: string; schedule: ScheduleService }) {
  const { installations, describe } = reminderInstallations(options.db, options.projectId);
  return createScheduleReminderManagement({ ...options, currentInstallation(pluginId) {
    const records = installations.list().filter(record => record.plugin_id === pluginId && record.state === "running");
    // Do not choose between distinct installations on the person's behalf.
    return records.length === 1 ? describe(records[0]!) : null;
  } });
}

function reminderInstallations(db: ScheduleSqliteDatabase, projectId: string) {
  const installations = new SqlitePluginRuntimeRepository(db), releases = new SqlitePluginRuntimeReleaseArtifactRepository(db);
  return { installations, describe(record: PluginInstanceRecord) {
    const artifact = releases.get(record.plugin_id, record.publisher_signature, record.version, record.manifest_digest);
    // Older generated releases live in the authoring repository, not Runtime's native release artifacts.
    const generated = !artifact && record.publisher_signature.startsWith("agent-built:")
      ? new AgentBuilderStore(studioStorage(db, projectId)).versions(record.publisher_signature.slice("agent-built:".length))
        .find(item => `${item.version}.0.0` === record.version) : undefined;
    return { installation_id: record.install_id, generation: record.installation_generation, version: record.version, publisher: record.publisher_id,
      title: artifact?.manifest.name ?? generated?.design.title ?? record.plugin_id };
  } };
}

export function deliverHostReminder(db: ScheduleSqliteDatabase, input: ScheduleWakeupInput, control: ScheduleWakeupControl): { detail: string } {
  const installations = new SqlitePluginRuntimeRepository(db);
  return deliverScheduleReminder(db, input, control, {
    currentInstallation(reminder) {
      const record = reminder.installationId ? installations.get(reminder.installationId) : null;
      // Persisted reminders do not execute plugin code; a normal Host shutdown does not cancel them.
      return !!record && record.plugin_id === reminder.pluginId && record.state !== "uninstalled" && record.installation_generation === reminder.installationGeneration;
    },
    deliver(reminder, dueAt) {
      const feed = createLocalFeedApplication(db as Parameters<typeof createLocalFeedApplication>[0]), stamp = new Date().toISOString();
      const source = feed.snapshot(reminder.projectId).sources.find(item => item.source_id === "plugin-reminders") ?? feed.upsertSource({
        project_id: reminder.projectId, source_id: "plugin-reminders", kind: "plugin", definition_id: null, sync_kind: "manual",
        name: "插件提醒", description: "你安装的插件到点提醒你的事", status: "active", enabled: true, origin: "molis_work",
        config: {}, schedule: { mode: "manual" }, credential_ref: null, account_label: null, last_sync_at: null,
        last_outcome: null, last_error_code: null, imported_at: stamp, updated_at: stamp, item_count: 0, cursor: null,
      });
      feed.ingestItem({ source, externalId: reminder.id + ":" + dueAt, title: reminder.pluginTitle + "：" + reminder.text, summary: reminder.text,
        body: reminder.text, url: reminder.link, occurredAt: stamp, attention: { reason: "source_rule", detail: { plugin: reminder.pluginId } } });
    },
  });
}
