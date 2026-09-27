/**
 * Plugin reminders. A generated plugin asks the platform to remind the person at a time; the studio owns the timing
 * (a scheduler job of its own) and, when it is due, puts the reminder in the person's Inbox. No plugin code runs at
 * that moment, and a plugin can only list and cancel its own reminders.
 */
import { randomUUID } from 'node:crypto';
import type { PluginPrivateStorage } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxIdentity } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { SqlitePluginPrivateStorage } from '@molis-ai/molis-work-plugin-runtime';
import { BUILDER_PLUGIN_ID, builderManifest } from '@molis-ai/molis-work-plugin-builder';
import type { ScheduleService, ScheduleSqliteDatabase } from '@molis-ai/molis-work-service-scheduler';
import { createLocalFeedApplication } from '../feed-application.js';
import { registerHostWakeup } from '../schedule-runtime.js';

export const REMINDER_CAPABILITY = 'plugin-builder.reminder.v1';
const RECORD = 'plugin-builder:reminder:', INDEX = 'plugin-builder:reminders:';
const DAY = 86_400_000;
/** Reminders one plugin may keep at a time. */
export const REMINDERS_PER_PLUGIN = 200;
export type ReminderRepeat = 'none' | 'daily' | 'weekly';
interface Reminder { id: string; boardId: string; pluginId: string; pluginTitle: string; text: string; link: string; jobId: string; repeat: ReminderRepeat; at: string }

/** The studio's own private store for a project: the same one the studio opens. */
export function studioStorage(db: unknown, boardId: string): PluginPrivateStorage {
  const context = { install_id: 'agent-studio:' + boardId, plugin_id: BUILDER_PLUGIN_ID, version: builderManifest.version, deployment: 'local' as const,
    grants: ['storage:private'], board_id: boardId, requireGrant() {} };
  return new SqlitePluginPrivateStorage(db as ConstructorParameters<typeof SqlitePluginPrivateStorage>[0]).forPlugin(context, builderManifest);
}

const read = <T>(storage: PluginPrivateStorage, key: string, fallback: T): T => { const raw = storage.get(key); return raw ? JSON.parse(raw) as T : fallback; };

export interface ReminderPorts {
  boardId: string;
  schedule: Pick<ScheduleService, 'register' | 'cancel'>;
  storage: PluginPrivateStorage;
  /** The installed plugin's published name, for the Inbox item. */
  title(pluginId: string): string | undefined;
  /** Where the Inbox item leads: the installed plugin's page. */
  link(pluginId: string): string;
  now?(): number;
}

export function createReminders(ports: ReminderPorts) {
  const now = () => ports.now?.() ?? Date.now();
  const ids = (pluginId: string) => read<string[]>(ports.storage, INDEX + pluginId, []);
  const cancelOne = (pluginId: string, id: string): boolean => {
    const reminder = read<Reminder | null>(ports.storage, RECORD + id, null);
    if (!reminder || reminder.pluginId !== pluginId) return false;
    try { ports.schedule.cancel(reminder.jobId, BUILDER_PLUGIN_ID); } catch { /* already fired once, or gone */ }
    ports.storage.delete(RECORD + id);
    ports.storage.set(INDEX + pluginId, JSON.stringify(ids(pluginId).filter(item => item !== id)));
    return true;
  };
  return {
    add(identity: Readonly<SandboxIdentity>, input: { at: string; text: string; repeat?: ReminderRepeat }): { reminderId: string } {
      const at = Date.parse(input.at);
      if (!Number.isFinite(at) || !/(?:Z|[+-]\d{2}:?\d{2})$/.test(input.at.trim())) throw new Error('提醒时间要写成带时区的时间，例如 2026-09-27T08:00:00+08:00');
      if (at < now() - 60_000) throw new Error('提醒时间已经过去了');
      if (at > now() + 366 * DAY) throw new Error('提醒时间最多设在一年以内');
      const existing = ids(identity.pluginId);
      if (existing.length >= REMINDERS_PER_PLUGIN) throw new Error('这个插件的提醒已经太多了，先取消一些');
      const id = randomUUID(), repeat = input.repeat ?? 'none';
      const job = ports.schedule.register({ plugin_id: BUILDER_PLUGIN_ID, capability_id: REMINDER_CAPABILITY, object_ref: ports.boardId + '|' + id,
        title: input.text.slice(0, 120), due_at: new Date(at).toISOString(),
        recurrence: repeat === 'none' ? { kind: 'once' } : { kind: 'interval', interval_ms: repeat === 'daily' ? DAY : 7 * DAY } });
      const reminder: Reminder = { id, boardId: ports.boardId, pluginId: identity.pluginId, pluginTitle: ports.title(identity.pluginId) ?? '插件',
        text: input.text, link: ports.link(identity.pluginId), jobId: job.job_id, repeat, at: new Date(at).toISOString() };
      ports.storage.set(RECORD + id, JSON.stringify(reminder));
      ports.storage.set(INDEX + identity.pluginId, JSON.stringify([...existing, id]));
      return { reminderId: id };
    },
    cancel(identity: Readonly<SandboxIdentity>, input: { reminderId: string }): { cancelled: boolean } {
      return { cancelled: cancelOne(identity.pluginId, input.reminderId) };
    },
    /** An uninstalled plugin leaves no reminders behind. */
    cancelAll(pluginId: string): number {
      return ids(pluginId).filter(id => cancelOne(pluginId, id)).length;
    },
  };
}

let bound = false;
/** Once per process: a due reminder becomes an Inbox item from the "插件提醒" source. */
export function bindReminderDelivery(): void {
  if (bound) return;
  bound = true;
  registerHostWakeup(BUILDER_PLUGIN_ID, REMINDER_CAPABILITY, async (db, input) => deliverReminder(db, input.object_ref, input.due_at));
}

export async function deliverReminder(db: ScheduleSqliteDatabase, objectRef: string, dueAt: string): Promise<{ detail: string }> {
  const [boardId, id] = objectRef.split('|');
  if (!boardId || !id) return { detail: '提醒标识无效' };
  const storage = studioStorage(db, boardId), reminder = read<Reminder | null>(storage, RECORD + id, null);
  if (!reminder) return { detail: '提醒已取消' };
  const feed = createLocalFeedApplication(db as Parameters<typeof createLocalFeedApplication>[0]), stamp = new Date().toISOString();
  const source = feed.snapshot(boardId).sources.find(item => item.source_id === 'plugin-reminders') ?? feed.upsertSource({
    board_id: boardId, source_id: 'plugin-reminders', kind: 'plugin', definition_id: null, sync_kind: 'manual',
    name: '插件提醒', description: '你安装的插件到点提醒你的事', status: 'active', enabled: true, origin: 'molis_work',
    config: {}, schedule: { mode: 'manual' }, credential_ref: null, account_label: null, last_sync_at: null,
    last_outcome: null, last_error_code: null, imported_at: stamp, updated_at: stamp, item_count: 0, cursor: null,
  });
  feed.ingestItem({ source, externalId: id + ':' + dueAt, title: reminder.pluginTitle + '：' + reminder.text, summary: reminder.text,
    body: reminder.text, url: reminder.link, occurredAt: stamp, attention: { reason: 'source_rule', detail: { plugin: reminder.pluginId } } });
  if (reminder.repeat === 'none') {
    storage.delete(RECORD + id);
    storage.set(INDEX + reminder.pluginId, JSON.stringify(read<string[]>(storage, INDEX + reminder.pluginId, []).filter(item => item !== id)));
  }
  return { detail: '已放进收件箱' };
}
