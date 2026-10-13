import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { createScheduledOperationManagement, runScheduledOperation,
  type ScheduledOperation, type ScheduledOperationInstallation, type ScheduledOperationOutcome } from "@molis-ai/molis-work-plugin-schedule";
import type { ScheduleSqliteDatabase, ScheduleService, ScheduleWakeupInput, ScheduleWakeupControl } from "@molis-ai/molis-work-service-scheduler";
import type { FeedApplication } from "@molis-ai/molis-work-plugin-feed";
import { createLocalFeedApplication } from "./feed-application.js";

export interface InstalledOperationCaller {
  describe(pluginId: string): ScheduledOperationInstallation | null;
  call(run: ScheduledOperation, control: ScheduleWakeupControl): Promise<ScheduledOperationOutcome>;
}
const callers = new WeakMap<ScheduleSqliteDatabase, Map<string, { caller: InstalledOperationCaller; controller: AbortController }>>();

export function hostScheduledOperationManagement(options: { db: ScheduleSqliteDatabase; projectId: string; schedule: ScheduleService; now?(): Date }) {
  const repository = new SqlitePluginRuntimeRepository(options.db);
  return createScheduledOperationManagement({ ...options, currentInstallation(pluginId) {
    const entry = callers.get(options.db)?.get(options.projectId), target = entry?.caller.describe(pluginId);
    if (!target || entry?.controller.signal.aborted) return null;
    const records = repository.list().filter(record => record.plugin_id === pluginId && record.state === 'running');
    const record = records.length === 1 ? records[0] : null;
    return record && record.install_id === target.installationId && record.installation_generation === target.generation && record.version === target.version
      ? { ...target, publisher: record.publisher_id } : null;
  } });
}

/** Binding an executor performs no work. Only a fresh Scheduler claim can dispatch a persisted occurrence. */
export function bindInstalledOperationCaller(db: ScheduleSqliteDatabase, projectId: string, caller: InstalledOperationCaller): () => void {
  const boards = callers.get(db) ?? new Map(); callers.set(db, boards);
  boards.get(projectId)?.controller.abort(new Error("Installed caller replaced"));
  const entry = { caller, controller: new AbortController() }; boards.set(projectId, entry);
  return () => { entry.controller.abort(new Error("Installed caller stopped")); if (boards.get(projectId) === entry) boards.delete(projectId); };
}

/** Runtime supplies identity, the installed owner supplies execution, and Inbox remains a same-db Host port. */
export function runHostScheduledOperation(
  db: ScheduleSqliteDatabase, input: ScheduleWakeupInput, control: ScheduleWakeupControl,
  feed: FeedApplication = createLocalFeedApplication(db as Parameters<typeof createLocalFeedApplication>[0]),
) {
  const repository = new SqlitePluginRuntimeRepository(db);
  return runScheduledOperation(db, input, control, {
    currentInstallation(run) {
      const record = run.installationId ? repository.get(run.installationId) : null;
      return !!record && record.plugin_id === run.pluginId && record.state !== "uninstalled" && record.installation_generation === run.installationGeneration;
    },
    executor(run) {
      const entry = callers.get(db)?.get(run.projectId), target = entry?.caller.describe(run.pluginId);
      if (!entry || !target) return null;
      const beforeEffect = () => {
        entry.controller.signal.throwIfAborted();
        const current = entry.caller.describe(run.pluginId);
        if (callers.get(db)?.get(run.projectId) !== entry || !current || current.installationId !== run.installationId || current.generation !== run.installationGeneration
          || current.version !== target.version) throw new Error("定时操作的安装执行入口已改变");
      };
      return { signal: entry.controller.signal, beforeEffect, invoke: async execution => {
        beforeEffect();
        if (!target.operations.some(operation => operation.id === run.operationId)) return { state: "failed" as const, value: "当前安装版本没有提供这项功能：" + run.operationId };
        return entry.caller.call(run, execution);
      } };
    },
    deliver(run, dueAt, outcome, text) {
      const stamp = new Date().toISOString();
      const source = feed.snapshot(run.projectId).sources.find(item => item.source_id === "plugin-runs") ?? feed.upsertSource({
        project_id: run.projectId, source_id: "plugin-runs", kind: "plugin", definition_id: null, sync_kind: "manual",
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
