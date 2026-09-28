import { randomUUID } from "node:crypto";
import { ScheduleError, type ScheduleJobRecord, type ScheduleRegisterInput, type ScheduleWakeupControl, type ScheduleWakeupInput } from "@molis-ai/molis-work-contracts/services/scheduler";
import type { ScheduleTaskDatabase } from "./tasks.js";
import { SCHEDULE_PLUGIN_ID } from "./manifest.js";

export const SCHEDULE_REMINDER_WAKEUP = "schedule.reminder.wakeup";
const DAY = 86_400_000;
export const REMINDERS_PER_INSTALLATION = 200;
export type ReminderRepeat = "none" | "daily" | "weekly";
export interface ReminderIdentity { projectId: string; pluginId: string; installationId: string }
export interface ReminderInput { at: string; text: string; repeat?: ReminderRepeat }
export interface ScheduleReminder {
  id: string; boardId: string; pluginId: string; installationId: string | null; installationGeneration?: string | null; pluginTitle: string;
  text: string; link: string; jobId: string; jobOwner: string; repeat: ReminderRepeat; at: string;
}
export interface ReminderScheduler {
  register(input: ScheduleRegisterInput): ScheduleJobRecord;
  cancel(jobId: string, pluginId?: string): { cancelled: boolean };
}

export function migrateScheduleReminders(db: ScheduleTaskDatabase): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schedule_plugin_reminders (
    id TEXT PRIMARY KEY, board_id TEXT NOT NULL, plugin_id TEXT NOT NULL, installation_id TEXT,
    record_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS schedule_plugin_reminders_owner ON schedule_plugin_reminders(board_id, plugin_id, installation_id);`);
}
export function getScheduleReminder(db: ScheduleTaskDatabase, id: string): ScheduleReminder | null {
  const row = db.prepare("SELECT record_json FROM schedule_plugin_reminders WHERE id = ?").get(id) as { record_json: string } | undefined;
  return row ? JSON.parse(row.record_json) as ScheduleReminder : null;
}
/** Used by the Host's legacy reader inside the same transaction that removes the old record. */
export function importScheduleReminder(db: ScheduleTaskDatabase, reminder: ScheduleReminder): void {
  db.prepare("INSERT INTO schedule_plugin_reminders (id, board_id, plugin_id, installation_id, record_json) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING")
    .run(reminder.id, reminder.boardId, reminder.pluginId, reminder.installationId, JSON.stringify(reminder));
}

/** Legacy timestamps cannot prove ownership after reinstall. Preserve records and pause their jobs atomically. */
export function pauseLegacyScheduleReminders(db: ScheduleTaskDatabase, pause: (reminder: ScheduleReminder) => void): void {
  const rows = db.prepare("SELECT id FROM schedule_plugin_reminders WHERE json_type(record_json, '$.installationGeneration') IS NULL").all() as Array<{ id: string }>;
  for (const row of rows) {
    db.transaction(() => {
      const reminder = getScheduleReminder(db, row.id);
      if (!reminder || Object.hasOwn(reminder, 'installationGeneration')) return;
      pause(reminder);
      db.prepare("UPDATE schedule_plugin_reminders SET record_json = ? WHERE id = ?")
        .run(JSON.stringify({ ...reminder, installationGeneration: null }), reminder.id);
    }).immediate();
  }
}

/** Product rules and persistence; the Host supplies installation metadata and same-database Scheduler. */
export function createScheduleReminders(options: {
  db: ScheduleTaskDatabase; boardId: string; projectId: string; schedule: ReminderScheduler;
  describe(identity: ReminderIdentity): { title: string; link: string; generation: string };
  now?(): number;
}) {
  const { db, schedule } = options;
  migrateScheduleReminders(db);
  const authorize = (identity: ReminderIdentity) => {
    if (identity.projectId !== options.projectId || !identity.pluginId || !identity.installationId) throw new Error("提醒缺少当前项目的插件安装身份");
    const descriptor = options.describe(identity);
    if (!descriptor.generation) throw new Error("提醒缺少当前安装世代");
    return descriptor;
  };
  const cancelRecord = (record: ScheduleReminder) => {
    try { schedule.cancel(record.jobId, record.jobOwner); }
    catch (error) { if (!(error instanceof ScheduleError) || error.code !== "schedule_job_not_found") throw error; }
    db.prepare("DELETE FROM schedule_plugin_reminders WHERE id = ?").run(record.id);
  };
  return {
    add(identity: ReminderIdentity, input: ReminderInput): { reminderId: string } {
      const at = Date.parse(input.at), now = options.now?.() ?? Date.now(), repeat = input.repeat ?? "none";
      if (!Number.isFinite(at) || !/(?:Z|[+-]\d{2}:?\d{2})$/.test(input.at.trim())) throw new Error("提醒时间要写成带时区的时间，例如 2026-09-27T08:00:00+08:00");
      if (at < now - 60_000) throw new Error("提醒时间已经过去了");
      if (at > now + 366 * DAY) throw new Error("提醒时间最多设在一年以内");
      if (!["none", "daily", "weekly"].includes(repeat)) throw new Error("未知的提醒重复方式");
      if (typeof input.text !== "string" || !input.text.trim() || input.text.length > 200) throw new Error("提醒文字需要 1 到 200 字");
      return db.transaction(() => {
        const descriptor = authorize(identity);
        const count = db.prepare("SELECT COUNT(*) AS n FROM schedule_plugin_reminders WHERE board_id = ? AND plugin_id = ? AND installation_id = ? AND json_extract(record_json, '$.installationGeneration') = ?")
          .get(options.boardId, identity.pluginId, identity.installationId, descriptor.generation) as { n: number };
        if (count.n >= REMINDERS_PER_INSTALLATION) throw new Error("这个插件的提醒已经太多了，先取消一些");
        const id = randomUUID(), due = new Date(at).toISOString();
        const job = schedule.register({ plugin_id: SCHEDULE_PLUGIN_ID, capability_id: SCHEDULE_REMINDER_WAKEUP, object_ref: id,
          title: input.text.slice(0, 120), due_at: due, recurrence: repeat === "none" ? { kind: "once" } : { kind: "interval", interval_ms: repeat === "daily" ? DAY : 7 * DAY } });
        importScheduleReminder(db, { id, boardId: options.boardId, pluginId: identity.pluginId, installationId: identity.installationId,
          installationGeneration: descriptor.generation,
          pluginTitle: descriptor.title, link: descriptor.link, text: input.text, jobId: job.job_id, jobOwner: SCHEDULE_PLUGIN_ID, repeat, at: due });
        return { reminderId: id };
      }).immediate();
    },
    cancel(identity: ReminderIdentity, input: { reminderId: string }): { cancelled: boolean } {
      return db.transaction(() => {
        const descriptor = authorize(identity);
        const record = getScheduleReminder(db, input.reminderId);
        if (!record || record.boardId !== options.boardId || record.pluginId !== identity.pluginId || record.installationId !== identity.installationId
          || record.installationGeneration !== descriptor.generation) return { cancelled: false };
        cancelRecord(record); return { cancelled: true };
      }).immediate();
    },
    /** A trusted uninstall path removes only this installation's reminders. */
    cancelInstallation(pluginId: string, installationId: string): number {
      return db.transaction(() => {
        const rows = db.prepare("SELECT record_json FROM schedule_plugin_reminders WHERE board_id = ? AND plugin_id = ? AND installation_id = ?")
          .all(options.boardId, pluginId, installationId) as Array<{ record_json: string }>;
        for (const row of rows) cancelRecord(JSON.parse(row.record_json) as ScheduleReminder);
        return rows.length;
      }).immediate();
    },
  };
}

/** Delivery is synchronous local persistence: Inbox and one-shot consumption commit together, under the current lease. */
export function deliverScheduleReminder(db: ScheduleTaskDatabase, input: ScheduleWakeupInput, control: ScheduleWakeupControl, ports: {
  currentInstallation(reminder: ScheduleReminder): boolean;
  deliver(reminder: ScheduleReminder, dueAt: string): void;
}): { detail: string } {
  return db.transaction(() => {
    control.beforeEffect();
    const id = input.capability_id === SCHEDULE_REMINDER_WAKEUP ? input.object_ref : input.object_ref.slice(input.object_ref.indexOf("|") + 1);
    const record = getScheduleReminder(db, id);
    if (!record || record.jobId !== input.job_id || record.jobOwner !== input.plugin_id) return { detail: "提醒已取消" };
    if (!record.installationId || !record.installationGeneration || !ports.currentInstallation(record)) throw new Error("提醒的原安装身份已不可用，记录已保留；需要重新确认归属后才能恢复");
    ports.deliver(record, input.due_at);
    control.beforeEffect();
    if (record.repeat === "none") db.prepare("DELETE FROM schedule_plugin_reminders WHERE id = ?").run(record.id);
    return { detail: "已放进收件箱" };
  }).immediate();
}
