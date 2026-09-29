import { BUILDER_PLUGIN_ID } from "@molis-ai/molis-work-plugin-builder";
import { pluginInstallationGeneration, SqlitePluginPrivateStorage, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { createScheduledOperationManagement, getScheduledOperation, listScheduledOperationOccurrences, migrateScheduledOperations, runScheduledOperation, saveScheduledOperation, saveScheduledOperationOccurrence,
  type ScheduledOperation, type ScheduledOperationInstallation, type ScheduledOperationOutcome } from "@molis-ai/molis-work-plugin-schedule";
import type { ScheduleSqliteDatabase, ScheduleService, ScheduleWakeupInput, ScheduleWakeupControl } from "@molis-ai/molis-work-service-scheduler";
import { createLocalFeedApplication } from "./feed-application.js";
import { studioStorage } from "./plugin-builder/storage.js";

export const LEGACY_OPERATION_OWNER = BUILDER_PLUGIN_ID;
export const LEGACY_OPERATION_WAKEUP = "plugin-builder.run.v1";
const RECORD = "plugin-builder:run:", INDEX = "plugin-builder:runs:", PENDING = "plugin-builder:runs-pending", NAMESPACE = "agent-studio:";
type LegacyOperation = Omit<ScheduledOperation, "installationId" | "installationGeneration" | "jobOwner" | "state" | "detail">;

/** One-way reader only. Import the complete queue and records before removing any historical key. */
export function migrateLegacyScheduledOperations(db: ScheduleSqliteDatabase, schedule: ScheduleService): void {
  migrateScheduledOperations(db);
  new SqlitePluginPrivateStorage(db);
  const namespaces = db.prepare("SELECT DISTINCT install_id FROM plugin_private_values WHERE install_id LIKE ? AND (item_key LIKE ? OR item_key = ?)")
    .all(NAMESPACE + "%", RECORD + "%", PENDING) as Array<{ install_id: string }>;
  for (const { install_id: namespace } of namespaces) db.transaction(() => {
    const boardId = namespace.slice(NAMESPACE.length), storage = studioStorage(db, boardId);
    const rows = db.prepare("SELECT item_key, item_value FROM plugin_private_values WHERE install_id = ? AND item_key LIKE ?")
      .all(namespace, RECORD + "%") as Array<{ item_key: string; item_value: string }>;
    const old = rows.map(row => {
      const run = JSON.parse(row.item_value) as LegacyOperation;
      if (run.boardId !== boardId || row.item_key !== RECORD + run.id) throw new Error("旧定时操作与存储身份不一致");
      const job = schedule.get(run.jobId);
      if (job && (job.plugin_id !== LEGACY_OPERATION_OWNER || job.capability_id !== LEGACY_OPERATION_WAKEUP || job.object_ref !== boardId + "|" + run.id)) throw new Error("旧定时操作与闹钟身份不一致");
      return { run, job };
    });
    // An older process may still own a job. Never migrate its mutable queue out from under it.
    if (schedule.list(LEGACY_OPERATION_OWNER).some(job => job.capability_id === LEGACY_OPERATION_WAKEUP && job.object_ref.startsWith(boardId + "|") && schedule.isExecuting(job.job_id))) return;
    const pending = JSON.parse(storage.get(PENDING) ?? "[]") as Array<{ ref: string; dueAt: string }>;
    for (const { run, job } of old) {
      const existing = getScheduledOperation(db, boardId, run.id);
      if (existing && existing.jobId !== run.jobId) throw new Error("旧定时操作与已迁移记录冲突");
      if (!existing) saveScheduledOperation(db, { ...run, installationId: null, installationGeneration: null,
        jobOwner: job?.plugin_id ?? LEGACY_OPERATION_OWNER, state: "needs_confirmation", detail: "旧定时操作缺少原安装世代，需要重新确认归属" });
      if (job) schedule.setEnabled(job.job_id, false, job.plugin_id);
    }
    const seen = new Set(listScheduledOperationOccurrences(db, boardId).map(item => item.operationId + "\0" + item.dueAt));
    for (const item of pending) {
      if (!item.ref.startsWith(boardId + "|") || !item.ref.slice(boardId.length + 1) || !Number.isFinite(Date.parse(item.dueAt))) throw new Error("旧待执行记录的项目或时间无效，原数据已保留");
      const id = item.ref.slice(boardId.length + 1), key = id + "\0" + item.dueAt;
      if (seen.has(key)) continue;
      const exists = getScheduledOperation(db, boardId, id);
      saveScheduledOperationOccurrence(db, { boardId, operationId: id, dueAt: item.dueAt, state: exists ? "pending" : "unknown",
        detail: exists ? null : "旧定时操作定义已不存在；原待执行引用已保留，不能安全运行", startedAt: null, finishedAt: null });
      seen.add(key);
    }
    for (const { run, job } of old) {
      // A surviving one-shot record whose job was consumed without a durable pending entry is ambiguous.
      if (job && !job.enabled && run.repeat === "none" && !listScheduledOperationOccurrences(db, boardId, run.id).length) {
        saveScheduledOperationOccurrence(db, { boardId, operationId: run.id, dueAt: job.next_due_at, state: "unknown",
          detail: "旧调用已被调度，但没有可核对的派出或结果记录", startedAt: null, finishedAt: null });
      }
      storage.delete(RECORD + run.id);
      const ids = JSON.parse(storage.get(INDEX + run.pluginId) ?? "[]") as string[];
      const remaining = ids.filter(id => id !== run.id);
      if (remaining.length) storage.set(INDEX + run.pluginId, JSON.stringify(remaining)); else storage.delete(INDEX + run.pluginId);
    }
    storage.delete(PENDING);
  }).immediate();
}

export interface InstalledOperationCaller {
  describe(pluginId: string): ScheduledOperationInstallation | null;
  call(run: ScheduledOperation, control: ScheduleWakeupControl): Promise<ScheduledOperationOutcome>;
}
const callers = new WeakMap<ScheduleSqliteDatabase, Map<string, { caller: InstalledOperationCaller; controller: AbortController }>>();

export function hostScheduledOperationManagement(options: { db: ScheduleSqliteDatabase; boardId: string; schedule: ScheduleService; now?(): Date }) {
  const repository = new SqlitePluginRuntimeRepository(options.db);
  return createScheduledOperationManagement({ ...options, currentInstallation(pluginId) {
    const entry = callers.get(options.db)?.get(options.boardId), target = entry?.caller.describe(pluginId);
    if (!target || entry?.controller.signal.aborted) return null;
    const records = repository.list().filter(record => record.plugin_id === pluginId && record.state === 'running');
    const record = records.length === 1 ? records[0] : null;
    return record && record.install_id === target.installationId && pluginInstallationGeneration(record) === target.generation && record.version === target.version
      ? { ...target, publisher: record.publisher_id } : null;
  } });
}

/** Binding an executor performs no work. Only a fresh Scheduler claim can dispatch a persisted occurrence. */
export function bindInstalledOperationCaller(db: ScheduleSqliteDatabase, boardId: string, caller: InstalledOperationCaller): () => void {
  const boards = callers.get(db) ?? new Map(); callers.set(db, boards);
  boards.get(boardId)?.controller.abort(new Error("Installed caller replaced"));
  const entry = { caller, controller: new AbortController() }; boards.set(boardId, entry);
  return () => { entry.controller.abort(new Error("Installed caller stopped")); if (boards.get(boardId) === entry) boards.delete(boardId); };
}

/** Runtime supplies identity, the installed owner supplies execution, and Inbox remains a same-db Host port. */
export function runHostScheduledOperation(db: ScheduleSqliteDatabase, input: ScheduleWakeupInput, control: ScheduleWakeupControl) {
  const repository = new SqlitePluginRuntimeRepository(db);
  return runScheduledOperation(db, input, control, {
    currentInstallation(run) {
      const record = run.installationId ? repository.get(run.installationId) : null;
      return !!record && record.plugin_id === run.pluginId && record.state !== "uninstalled" && pluginInstallationGeneration(record) === run.installationGeneration;
    },
    executor(run) {
      const entry = callers.get(db)?.get(run.boardId), target = entry?.caller.describe(run.pluginId);
      if (!entry || !target) return null;
      const beforeEffect = () => {
        entry.controller.signal.throwIfAborted();
        const current = entry.caller.describe(run.pluginId);
        if (callers.get(db)?.get(run.boardId) !== entry || !current || current.installationId !== run.installationId || current.generation !== run.installationGeneration
          || current.version !== target.version) throw new Error("定时操作的安装执行入口已改变");
      };
      return { signal: entry.controller.signal, beforeEffect, invoke: async execution => {
        beforeEffect();
        if (!target.operations.some(operation => operation.id === run.operationId)) return { state: "failed" as const, value: "当前安装版本没有提供这项功能：" + run.operationId };
        return entry.caller.call(run, execution);
      } };
    },
    deliver(run, dueAt, outcome, text) {
      const feed = createLocalFeedApplication(db as Parameters<typeof createLocalFeedApplication>[0]), stamp = new Date().toISOString();
      const source = feed.snapshot(run.boardId).sources.find(item => item.source_id === "plugin-runs") ?? feed.upsertSource({
        board_id: run.boardId, source_id: "plugin-runs", kind: "plugin", definition_id: null, sync_kind: "manual",
        name: "插件定时执行", description: "你安装的插件按时自动运行的结果", status: "active", enabled: true, origin: "molis_work",
        config: {}, schedule: { mode: "manual" }, credential_ref: null, account_label: null, last_sync_at: null,
        last_outcome: null, last_error_code: null, imported_at: stamp, updated_at: stamp, item_count: 0, cursor: null,
      });
      const title = run.pluginTitle + "：" + (outcome.state === "succeeded" ? (text.replace(/\s+/g, " ").trim().slice(0, 80) || run.operationTitle) : run.operationTitle.slice(0, 40) + "没有完成");
      feed.ingestItem({ source, externalId: run.id + ":" + dueAt, title, summary: text.slice(0, 280), body: text, url: run.link, occurredAt: stamp,
        attention: { reason: "source_rule", detail: { plugin: run.pluginId, operation: run.operationId } } });
    },
  });
}
