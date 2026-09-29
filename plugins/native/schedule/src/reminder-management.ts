import { ScheduleError, type ScheduleJobRecord } from "@molis-ai/molis-work-contracts/services/scheduler";
import { getScheduleReminder, migrateScheduleReminders, REMINDERS_PER_INSTALLATION, type ScheduleReminder } from "./reminders.js";
import type { ScheduleTaskDatabase } from "./tasks.js";

/** Resolved by the Host from Runtime, never from a request's claimed installation. */
export interface ReminderRecoveryInstallation {
  installation_id: string; generation: string; title: string; version: string; publisher: string;
}
export interface ScheduleReminderView {
  text: string; plugin_id: string; plugin_title: string; needs_confirmation: boolean;
  installation: ReminderRecoveryInstallation | null;
}
export interface ScheduleJobView extends ScheduleJobRecord { reminder?: ScheduleReminderView }
export interface RecoverScheduleReminderInput {
  job_id: string; expected_installation_id: string; expected_generation: string;
}

/** Schedule owns recovery decisions; Runtime identity and the same-db wakeup port are supplied by the Host. */
export function createScheduleReminderManagement(options: {
  db: ScheduleTaskDatabase; boardId: string;
  schedule: { get(jobId: string): ScheduleJobRecord | null; setEnabled(jobId: string, enabled: boolean, owner?: string): ScheduleJobRecord };
  currentInstallation(pluginId: string): ReminderRecoveryInstallation | null;
}) {
  const { db, schedule } = options;
  migrateScheduleReminders(db);
  const recordFor = (job: ScheduleJobRecord): ScheduleReminder | null => {
    const row = db.prepare("SELECT id FROM schedule_plugin_reminders WHERE board_id = ? AND json_extract(record_json, '$.jobId') = ?")
      .get(options.boardId, job.job_id) as { id: string } | undefined;
    const record = row ? getScheduleReminder(db, row.id) : null;
    return record?.jobOwner === job.plugin_id ? record : null;
  };
  const matches = (record: ScheduleReminder, installation: ReminderRecoveryInstallation | null) =>
    !!installation && record.installationId === installation.installation_id && record.installationGeneration === installation.generation;
  const view = (job: ScheduleJobRecord): ScheduleJobView => {
    const record = recordFor(job);
    if (!record) return job;
    const installation = options.currentInstallation(record.pluginId);
    return { ...job, reminder: { text: record.text, plugin_id: record.pluginId, plugin_title: record.pluginTitle,
      needs_confirmation: !matches(record, installation), installation } };
  };
  return {
    view,
    assertCanEnable(job: ScheduleJobRecord): void {
      const record = recordFor(job);
      if (record && !matches(record, options.currentInstallation(record.pluginId))) {
        throw new ScheduleError("schedule_job_invalid", "请先在提醒详情确认当前插件，再恢复这条提醒");
      }
    },
    recover(input: RecoverScheduleReminderInput): ScheduleJobView {
      return db.transaction(() => {
        const job = schedule.get(input.job_id), record = job && recordFor(job);
        if (!job || !record) throw new ScheduleError("schedule_job_not_found", "这条提醒已不存在，请刷新列表");
        const installation = options.currentInstallation(record.pluginId);
        if (!installation) throw new ScheduleError("schedule_job_invalid", "请先安装并启用对应插件，再刷新查看当前安装");
        if (installation.installation_id !== input.expected_installation_id || installation.generation !== input.expected_generation) {
          throw new ScheduleError("schedule_job_invalid", "插件安装已变更，请刷新查看并重新确认");
        }
        // A repeated confirmation must not undo a later pause or rearm a consumed one-shot job.
        if (matches(record, installation)) return view(job);
        const count = db.prepare("SELECT COUNT(*) AS n FROM schedule_plugin_reminders WHERE board_id = ? AND plugin_id = ? AND installation_id = ? AND json_extract(record_json, '$.installationGeneration') = ?")
          .get(options.boardId, record.pluginId, installation.installation_id, installation.generation) as { n: number };
        if (count.n >= REMINDERS_PER_INSTALLATION) throw new ScheduleError("schedule_job_invalid", "这个插件的提醒已经太多了，先取消一些");
        db.prepare("UPDATE schedule_plugin_reminders SET installation_id = ?, record_json = ? WHERE id = ?")
          .run(installation.installation_id, JSON.stringify({ ...record, installationId: installation.installation_id, installationGeneration: installation.generation }), record.id);
        const enabled = schedule.setEnabled(job.job_id, true, job.plugin_id);
        return view(enabled);
      }).immediate();
    },
  };
}
export type ScheduleReminderManagement = ReturnType<typeof createScheduleReminderManagement>;
