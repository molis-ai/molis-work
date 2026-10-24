import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext } from "node:test";
import { ActionError, type ActionCallContext, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseTransaction, PluginDefinition, PluginHostServices, PluginScheduleWriter } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginPlatform, DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { createScheduleService } from "@molis-ai/molis-work-service-scheduler";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./plugin-actions.js";


export async function pluginSchedulerFixture(t: TestContext, options: { directory?: string; now?: () => Date } = {}) {
  const directory = options.directory ?? mkdtempSync(join(tmpdir(), "plugin-scheduler-")), file = join(directory, "project.db");
  if (!existsSync(file)) seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const scheduler = createScheduleService(store.db, { now: options.now });
  const ports = { db: store.db, appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event), eventCursor: (id: string) => store.eventCursor(id) };
  const actions = pluginActions(store, DEMO_PROJECT_ID);
  const platform = createPluginPlatform({ db: store.db, project_id: DEMO_PROJECT_ID, actor_id: "tester", actions, scheduler,
    artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), ui: new UiHost(), home: null,
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) });
  t.after(async () => {
    await scheduler.close(); await platform.closeCoordination();
    for (const instance of platform.runtime.list()) if (instance.state === "running") await platform.runtime.stop(instance.install_id);
    store.close(); rmSync(directory, { recursive: true, force: true });
  });
  const start = async (name: string) => {
    const id = "io.molis.work.example." + name.replaceAll("_", "-"), wakeupId = name.replaceAll("_", "-") + ".wakeup";
    let services: PluginHostServices | undefined, work: (caller: ActionExecutionContext) => Promise<void> = async () => {};
    const command: ActionDefinition = { capability_id: name.replaceAll("_", "-") + ".write", version: 1, operation: "command", action: { kind: "operation", title: "保存", description: "保存任务与闹钟",
      scope: "project", audiences: ["user"], permissions: ["schedule:write"], subject_kinds: [],
      input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "object" } } };
    let onWake: (caller: ActionExecutionContext, input: unknown) => Promise<unknown> = async () => ({ detail: "done" });
    const wake: ActionDefinition = { capability_id: wakeupId, version: 1, operation: "command", action: { ...command.action, audiences: ["plugin"], scheduling: "concurrent",
      input_schema: { type: "object" }, output_schema: { type: "object" } } };
    const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, name, version: "1.0.0", kind: "app",
      publisher: { publisher_id: "probe", signature: "probe-" + name }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: ["storage:private", "schedule:read", "schedule:write"].map(permission => ({ permission, required: true, reason: "保存任务与闹钟" })),
      capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [command, wake], background: { jobs: [], wakeups: [{ action: { capability_id: wakeupId, version: 1 }, reason: "Execute a scheduled task" }] },
      databases: { project: { store_name: name.replaceAll("_", "-"), version: 1, read_permission: "schedule:read", write_permission: "schedule:write",
        schema: `CREATE TABLE ${name}_notes (text TEXT NOT NULL);` } } },
      async start(context) { services = context.services; return { kind: "app", views: [], actions: [{ ...command, handle: async caller => { await work(caller); return {}; } }, { ...wake, handle: (caller, input) => onWake(caller, input) }] }; } };
    const started = await platform.start([{ definition, bundled: true }]);
    assert.deepEqual(started.failed, [], JSON.stringify(started));
    assert.ok(started.running.includes(id), JSON.stringify(started));
    assert.ok(services?.project_database && services.scheduler);
    const install = () => platform.runtime.list().find(record => record.plugin_id === id)!;
    return { id, get database() { return services!.project_database!; }, get schedule() { return services!.scheduler!; },
      install, restart: () => platform.runtime.start(install().install_id),
      reinstall: async () => { await platform.runtime.uninstall(install().install_id, { retain_private_data: true });
        platform.runtime.install({ definition, deployment: "local", bundled: true }); await platform.runtime.start(install().install_id); },
      onWake: (handler: typeof onWake) => { onWake = handler; },
      invoke: (execute: typeof work, caller: Partial<ActionCallContext> = {}) => { work = execute; return actions.client.invoke({ actor_id: "tester", project_id: DEMO_PROJECT_ID,
        audience: "user", permissions: ["schedule:write"], ...caller }, command, {}); },
      count: () => Number((store.db.prepare(`SELECT COUNT(*) AS n FROM ${name}_notes`).get() as { n: number }).n),
      stop: () => platform.runtime.stop(install().install_id) };
  };
  return { start, scheduler, directory, file };
}
