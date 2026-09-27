/**
 * Scheduled runs. A generated plugin asks the platform to run one of its own operations at a time (once, daily or
 * weekly); the studio owns the timing (a scheduler job of its own). When it is due, the installed plugin's operation
 * runs in its sandbox exactly as a person's click would, and with `inbox` its result becomes an Inbox item.
 *
 * Installed plugins run inside the project's studio. A run that comes due before the studio for that project has
 * started (the host just started and nobody opened the project yet) waits and runs when the studio starts.
 */
import { randomUUID } from 'node:crypto';
import type { PluginPrivateStorage } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxIdentity, SandboxJson } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { BUILDER_PLUGIN_ID } from '@molis-ai/molis-work-plugin-builder';
import type { ScheduleService, ScheduleSqliteDatabase } from '@molis-ai/molis-work-service-scheduler';
import { createLocalFeedApplication } from '../feed-application.js';
import { registerHostWakeup } from '../schedule-runtime.js';
import { studioStorage } from './reminders.js';

export const RUN_CAPABILITY = 'plugin-builder.run.v1';
const RECORD = 'plugin-builder:run:', INDEX = 'plugin-builder:runs:', PENDING = 'plugin-builder:runs-pending';
const DAY = 86_400_000;
/** Scheduled runs one plugin may keep at a time. */
export const RUNS_PER_PLUGIN = 20;
export type RunRepeat = 'none' | 'daily' | 'weekly';
interface ScheduledRun {
  id: string; boardId: string; pluginId: string; pluginTitle: string; operationId: string; operationTitle: string;
  input: SandboxJson; inbox: boolean; link: string; jobId: string; repeat: RunRepeat; at: string;
}
/** Runs an installed plugin's operation as the person would; the studio registers one per project it serves. */
export type InstalledCaller = (pluginId: string, operationId: string, input: SandboxJson) => Promise<{ status: number; body?: unknown }>;

const read = <T>(storage: PluginPrivateStorage, key: string, fallback: T): T => { const raw = storage.get(key); return raw ? JSON.parse(raw) as T : fallback; };

export interface ScheduledRunPorts {
  boardId: string;
  schedule: Pick<ScheduleService, 'register' | 'cancel'>;
  storage: PluginPrivateStorage;
  /** The installed plugin's published name and its operations, from the installed release. */
  installed(pluginId: string): { title: string; operations: ReadonlyArray<{ id: string; description?: string }> } | undefined;
  /** Where the Inbox item leads: the installed plugin's page. */
  link(pluginId: string): string;
  now?(): number;
}

export function createScheduledRuns(ports: ScheduledRunPorts) {
  const now = () => ports.now?.() ?? Date.now();
  const ids = (pluginId: string) => read<string[]>(ports.storage, INDEX + pluginId, []);
  const cancelOne = (pluginId: string, id: string): boolean => {
    const run = read<ScheduledRun | null>(ports.storage, RECORD + id, null);
    if (!run || run.pluginId !== pluginId) return false;
    try { ports.schedule.cancel(run.jobId, BUILDER_PLUGIN_ID); } catch { /* already ran once, or gone */ }
    forget(ports.storage, run);
    return true;
  };
  return {
    add(identity: Readonly<SandboxIdentity>, input: { operation: string; at: string; repeat?: RunRepeat; input?: SandboxJson; inbox?: boolean }): { scheduleId: string } {
      const plugin = ports.installed(identity.pluginId), operation = plugin?.operations.find(item => item.id === input.operation);
      if (!plugin) throw new Error('只有安装好的插件才能设定时执行');
      if (!operation) throw new Error('只能定时运行这个插件自己的功能：没有 ' + input.operation);
      const at = Date.parse(input.at);
      if (!Number.isFinite(at) || !/(?:Z|[+-]\d{2}:?\d{2})$/.test(input.at.trim())) throw new Error('时间要写成带时区的时间，例如 2026-09-27T08:00:00+08:00');
      if (at < now() - 60_000) throw new Error('时间已经过去了');
      if (at > now() + 366 * DAY) throw new Error('时间最多设在一年以内');
      const existing = ids(identity.pluginId);
      if (existing.length >= RUNS_PER_PLUGIN) throw new Error('这个插件的定时执行已经太多了，先取消一些');
      const id = randomUUID(), repeat = input.repeat ?? 'none', title = operation.description || operation.id;
      const job = ports.schedule.register({ plugin_id: BUILDER_PLUGIN_ID, capability_id: RUN_CAPABILITY, object_ref: ports.boardId + '|' + id,
        title: (plugin.title + '：' + title).slice(0, 120), due_at: new Date(at).toISOString(),
        recurrence: repeat === 'none' ? { kind: 'once' } : { kind: 'interval', interval_ms: repeat === 'daily' ? DAY : 7 * DAY } });
      const run: ScheduledRun = { id, boardId: ports.boardId, pluginId: identity.pluginId, pluginTitle: plugin.title, operationId: operation.id, operationTitle: title,
        input: input.input ?? {}, inbox: input.inbox === true, link: ports.link(identity.pluginId), jobId: job.job_id, repeat, at: new Date(at).toISOString() };
      ports.storage.set(RECORD + id, JSON.stringify(run));
      ports.storage.set(INDEX + identity.pluginId, JSON.stringify([...existing, id]));
      return { scheduleId: id };
    },
    cancel(identity: Readonly<SandboxIdentity>, input: { scheduleId: string }): { cancelled: boolean } {
      return { cancelled: cancelOne(identity.pluginId, input.scheduleId) };
    },
    /** An uninstalled plugin leaves no scheduled runs behind. */
    cancelAll(pluginId: string): number {
      return ids(pluginId).filter(id => cancelOne(pluginId, id)).length;
    },
  };
}

function forget(storage: PluginPrivateStorage, run: ScheduledRun) {
  storage.delete(RECORD + run.id);
  storage.set(INDEX + run.pluginId, JSON.stringify(read<string[]>(storage, INDEX + run.pluginId, []).filter(item => item !== run.id)));
}

/** The studios serving each project in this process, and what each database has waiting for them. */
const callers = new Map<string, { db: ScheduleSqliteDatabase; call: InstalledCaller }>();
let bound = false;
/** Once per process: a due run executes the installed operation (or waits for its project's studio). */
export function bindScheduledRuns(): void {
  if (bound) return;
  bound = true;
  registerHostWakeup(BUILDER_PLUGIN_ID, RUN_CAPABILITY, async (db, input) => runScheduled(db, input.object_ref, input.due_at));
}

/**
 * The studio for a project starts serving its installed plugins: runs that came due while nothing could run them
 * run now. Returns the function that withdraws it when the studio closes.
 */
export async function registerInstalledCaller(db: ScheduleSqliteDatabase, boardId: string, call: InstalledCaller): Promise<() => void> {
  const entry = { db, call };
  callers.set(boardId, entry);
  const storage = studioStorage(db, boardId), waiting = read<Array<{ ref: string; dueAt: string }>>(storage, PENDING, []);
  storage.delete(PENDING);
  for (const item of waiting) await runScheduled(db, item.ref, item.dueAt).catch(() => undefined);
  return () => { if (callers.get(boardId) === entry) callers.delete(boardId); };
}

export async function runScheduled(db: ScheduleSqliteDatabase, objectRef: string, dueAt: string): Promise<{ detail: string }> {
  const [boardId, id] = objectRef.split('|');
  if (!boardId || !id) return { detail: '定时标识无效' };
  const storage = studioStorage(db, boardId), run = read<ScheduledRun | null>(storage, RECORD + id, null);
  if (!run) return { detail: '定时执行已取消' };
  const caller = callers.get(boardId);
  if (!caller) {
    storage.set(PENDING, JSON.stringify([...read<Array<{ ref: string; dueAt: string }>>(storage, PENDING, []), { ref: objectRef, dueAt }].slice(-50)));
    return { detail: '项目还没打开，打开后补跑' };
  }
  let outcome: { ok: boolean; text: string };
  try {
    const result = await caller.call(run.pluginId, run.operationId, run.input), body = result.body as { value?: unknown; error?: unknown } | undefined;
    outcome = result.status === 200 ? { ok: true, text: resultText(body?.value) } : { ok: false, text: String(body?.error ?? '运行失败（' + result.status + '）') };
  } catch (error) { outcome = { ok: false, text: error instanceof Error ? error.message : String(error) }; }
  // A failure always reaches the person; a success only when the plugin asked for it.
  if (!outcome.ok || run.inbox) {
    const feed = createLocalFeedApplication(db as Parameters<typeof createLocalFeedApplication>[0]), stamp = new Date().toISOString();
    const source = feed.snapshot(boardId).sources.find(item => item.source_id === 'plugin-runs') ?? feed.upsertSource({
      board_id: boardId, source_id: 'plugin-runs', kind: 'plugin', definition_id: null, sync_kind: 'manual',
      name: '插件定时执行', description: '你安装的插件按时自动运行的结果', status: 'active', enabled: true, origin: 'molis_work',
      config: {}, schedule: { mode: 'manual' }, credential_ref: null, account_label: null, last_sync_at: null,
      last_outcome: null, last_error_code: null, imported_at: stamp, updated_at: stamp, item_count: 0, cursor: null,
    });
    // The result is what the person came for; a failure says which function did not finish.
    const title = run.pluginTitle + '：' + (outcome.ok ? (outcome.text.replace(/\s+/g, ' ').trim().slice(0, 80) || run.operationTitle) : run.operationTitle.slice(0, 40) + '没有完成');
    feed.ingestItem({ source, externalId: id + ':' + dueAt, title, summary: outcome.text.slice(0, 280), body: outcome.text, url: run.link, occurredAt: stamp,
      attention: { reason: 'source_rule', detail: { plugin: run.pluginId, operation: run.operationId } } });
  }
  if (run.repeat === 'none') forget(storage, run);
  return { detail: outcome.ok ? (run.inbox ? '已运行，结果放进收件箱' : '已运行') : '运行失败：' + outcome.text.slice(0, 200) };
}

/** What a result says, for a person: its text or summary, else its first words, else the value itself. */
function resultText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of ['text', 'summary', 'message']) if (typeof record[key] === 'string' && record[key]) return record[key] as string;
    const first = Object.values(record).find(item => typeof item === 'string' && item);
    if (typeof first === 'string') return first;
  }
  return JSON.stringify(value).slice(0, 2000);
}
