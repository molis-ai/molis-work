import { AgentBuilderStore, BUILDER_PLUGIN_ID } from "@molis-ai/molis-work-plugin-builder";
import { pluginInstallationGeneration, SqlitePluginRuntimeRepository, SqlitePluginRuntimeReleaseArtifactRepository } from "@molis-ai/molis-work-plugin-runtime";
import { createScheduleReminders, deliverScheduleReminder, importScheduleReminder, pauseLegacyScheduleReminders, migrateScheduleReminders, type ScheduleReminder } from "@molis-ai/molis-work-plugin-schedule";
import type { ScheduleService, ScheduleSqliteDatabase, ScheduleWakeupControl, ScheduleWakeupInput } from "@molis-ai/molis-work-service-scheduler";
import { createLocalFeedApplication } from "./feed-application.js";
import { studioStorage } from "./plugin-builder/storage.js";

export const LEGACY_REMINDER_OWNER = BUILDER_PLUGIN_ID;
export const LEGACY_REMINDER_WAKEUP = "plugin-builder.reminder.v1";
const RECORD = "plugin-builder:reminder:", INDEX = "plugin-builder:reminders:";

/** Read the historical namespace once, preserving the Scheduler's job identity, receipt and due time. */
export function migrateLegacyReminders(db: ScheduleSqliteDatabase, schedule: ScheduleService): void {
  migrateScheduleReminders(db);
  const jobs = schedule.list(LEGACY_REMINDER_OWNER).filter(job => job.capability_id === LEGACY_REMINDER_WAKEUP);
  for (const job of jobs) db.transaction(() => {
    const split = job.object_ref.indexOf("|"), boardId = job.object_ref.slice(0, split), id = job.object_ref.slice(split + 1);
    if (split < 1 || !id) return;
    const storage = studioStorage(db, boardId), raw = storage.get(RECORD + id);
    if (!raw) return;
    const old = JSON.parse(raw) as Omit<ScheduleReminder, "installationId" | "installationGeneration" | "jobOwner">;
    if (old.id !== id || old.boardId !== boardId || old.jobId !== job.job_id) throw new Error("旧提醒与原闹钟身份不一致");
    // Legacy Runtime reused both install_id and installed_at on reinstall, so neither proves this job's original owner.
    importScheduleReminder(db, { ...old, installationId: null, installationGeneration: null, jobOwner: job.plugin_id });
    schedule.setEnabled(job.job_id, false, job.plugin_id);
    storage.delete(RECORD + id);
    const ids = JSON.parse(storage.get(INDEX + old.pluginId) ?? "[]") as string[];
    const remaining = ids.filter(item => item !== id);
    if (remaining.length) storage.set(INDEX + old.pluginId, JSON.stringify(remaining)); else storage.delete(INDEX + old.pluginId);
  }).immediate();
  pauseLegacyScheduleReminders(db, reminder => {
    const job = schedule.get(reminder.jobId);
    if (job && job.plugin_id === reminder.jobOwner) schedule.setEnabled(job.job_id, false, job.plugin_id);
  });
}

/** Same-db adapters only: Schedule owns the reminder's product rules and storage. */
export function hostScheduleReminders(options: { db: ScheduleSqliteDatabase; boardId: string; projectId: string; schedule: ScheduleService; routePrefix?: string; now?(): number }) {
  const installations = new SqlitePluginRuntimeRepository(options.db), releases = new SqlitePluginRuntimeReleaseArtifactRepository(options.db);
  return createScheduleReminders({ ...options, describe(identity) {
    const record = installations.get(identity.installationId);
    if (!record || record.plugin_id !== identity.pluginId || record.state !== "running") throw new Error("提醒的插件安装当前没有运行");
    const artifact = releases.get(record.plugin_id, record.publisher_signature, record.version, record.manifest_digest);
    // Older generated releases live in the authoring repository, not Runtime's native release artifacts.
    const generated = !artifact && record.publisher_signature.startsWith("agent-built:")
      ? new AgentBuilderStore(studioStorage(options.db, options.boardId)).versions(record.publisher_signature.slice("agent-built:".length))
        .find(item => `${item.version}.0.0` === record.version) : undefined;
    return { title: artifact?.manifest.name ?? generated?.design.title ?? identity.pluginId, generation: pluginInstallationGeneration(record),
      link: (options.routePrefix ?? `/projects/${encodeURIComponent(options.projectId)}`) + "/plugins/" + encodeURIComponent(identity.pluginId) };
  } });
}

export function deliverHostReminder(db: ScheduleSqliteDatabase, input: ScheduleWakeupInput, control: ScheduleWakeupControl): { detail: string } {
  const installations = new SqlitePluginRuntimeRepository(db);
  return deliverScheduleReminder(db, input, control, {
    currentInstallation(reminder) {
      const record = reminder.installationId ? installations.get(reminder.installationId) : null;
      // Persisted reminders do not execute plugin code; a normal Host shutdown does not cancel them.
      return !!record && record.plugin_id === reminder.pluginId && record.state !== "uninstalled" && pluginInstallationGeneration(record) === reminder.installationGeneration;
    },
    deliver(reminder, dueAt) {
      const feed = createLocalFeedApplication(db as Parameters<typeof createLocalFeedApplication>[0]), stamp = new Date().toISOString();
      const source = feed.snapshot(reminder.boardId).sources.find(item => item.source_id === "plugin-reminders") ?? feed.upsertSource({
        board_id: reminder.boardId, source_id: "plugin-reminders", kind: "plugin", definition_id: null, sync_kind: "manual",
        name: "插件提醒", description: "你安装的插件到点提醒你的事", status: "active", enabled: true, origin: "molis_work",
        config: {}, schedule: { mode: "manual" }, credential_ref: null, account_label: null, last_sync_at: null,
        last_outcome: null, last_error_code: null, imported_at: stamp, updated_at: stamp, item_count: 0, cursor: null,
      });
      feed.ingestItem({ source, externalId: reminder.id + ":" + dueAt, title: reminder.pluginTitle + "：" + reminder.text, summary: reminder.text,
        body: reminder.text, url: reminder.link, occurredAt: stamp, attention: { reason: "source_rule", detail: { plugin: reminder.pluginId } } });
    },
  });
}
