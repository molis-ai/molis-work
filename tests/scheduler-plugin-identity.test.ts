import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalHost, LocalProjectDatabase, PluginHostExecutor } from "@molis-ai/molis-work-app-local-host";
import { PluginWakeupIndex, createScheduleService, registerScheduleCapabilities } from "@molis-ai/molis-work-service-scheduler";
import { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { scheduleCapabilities as schedule, type ScheduleJobRecord } from "@molis-ai/molis-work-contracts/services/scheduler";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";

const A = "io.molis.work.example.schedule-a", B = "io.molis.work.example.schedule-b";
const job = { capability_id: "example.wakeup", object_ref: "one", title: "Water the plants", due_at: "2030-01-01T00:00:00.000Z" };

// The owner of a typed schedule.* call is the calling plugin, read by the Scheduler from the trusted invocation. The
// Host's plugin port forwards the call without looking at the capability's name, so nothing about the input's shape
// (a forged plugin_id, an array, a string) can move a call onto another plugin's jobs.
test("real Plugin executor: schedule.* belongs to the calling plugin whatever the input says, and a Host call with no plugin is refused", { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "plugin-schedule-identity-"));
  const project = { project_id: "board", storage_key: join(home, "project.sqlite") };
  const store = new LocalProjectDatabase(project.storage_key);
  const artifacts = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) });
  const processItems = new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) });
  const local = new LocalHost({ runtimeFactory: { open: () => ({ project_id: project.project_id, store, coordinator: { artifacts } }), close: () => {} } });
  // The Scheduler's own handlers on the Host's registry, as the Host composes them (apps/local-host/src/schedule-runtime.ts).
  const wakeupIndex = new PluginWakeupIndex(), service = createScheduleService(store.db, { wakeupIndex });
  registerScheduleCapabilities({ register: local.register.bind(local) }, () => service);
  for (const plugin of [A, B]) wakeupIndex.register(plugin, job.capability_id, async () => undefined);
  const contexts: PluginStartContext[] = [];
  const make = (plugin_id: string): PluginDefinition => ({ manifest: { schema_version: 2, host_api_version: 2, plugin_id, version: "1.0.0", name: "Reminder", kind: "app",
    publisher: { publisher_id: "example", signature: "fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [], capabilities: { provides: [], consumes: Object.values(schedule).map(item => item.capability_id) }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] } },
    async start(context) { contexts.push(context); return { kind: "app" }; }, async stop() {} });
  const actions = { registry: local.actionRegistry(project), client: { ...local.actionClient(project), ...local.syncActionClient(project) }, project_id: project.project_id };
  const executor = new PluginHostExecutor({ actions, project_id: project.project_id, actor_id: "web-user", artifacts, processItems, ui: new UiHost(), capabilities: local.client(project),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) });
  const runtime = new PluginRuntime(undefined, executor);
  const first = runtime.install({ definition: make(A), deployment: "local", grants: [] }).install;
  const second = runtime.install({ definition: make(B), deployment: "local", grants: [] }).install;
  try {
    await runtime.start(first.install_id); await runtime.start(second.install_id);
    const ownA = contexts[0]!.services!.capabilities!, ownB = contexts[1]!.services!.capabilities!;
    const owners = () => service.list().map(item => `${item.plugin_id}:${item.object_ref}`).sort();
    const idsOf = (jobs: ScheduleJobRecord[]) => jobs.map(item => item.object_ref).sort();

    // A forged plugin_id on register is not read: the job is the caller's.
    const forged = await ownA.invoke(schedule.register, { ...job, plugin_id: B } as never);
    assert.equal(forged.plugin_id, A);
    const mineB = await ownB.invoke(schedule.register, { ...job, object_ref: "two", plugin_id: A } as never);
    assert.equal(mineB.plugin_id, B);
    assert.deepEqual(owners(), [`${A}:one`, `${B}:two`]);

    // list returns the caller's jobs only, for an input naming another plugin and for every shape the old Host rule skipped.
    assert.deepEqual(idsOf((await ownB.invoke(schedule.list, { plugin_id: A } as never)).jobs), ["two"]);
    for (const input of [[], "x", 7, null, undefined, () => undefined]) {
      assert.deepEqual(idsOf((await ownB.invoke(schedule.list, input as never)).jobs), ["two"], `list ${String(input)}`);
    }

    // cancel and setEnabled cannot reach another plugin's job: not by naming its owner, not by an input shape the owner check once skipped.
    const notMine = { code: "scheduler.job_not_found" }, malformed = { code: "scheduler.job_invalid" };
    await assert.rejects(ownB.invoke(schedule.cancel, { job_id: forged.job_id, plugin_id: A } as never), notMine);
    await assert.rejects(ownB.invoke(schedule.setEnabled, { job_id: forged.job_id, plugin_id: A, enabled: false } as never), notMine);
    const asArray = Object.assign([], { job_id: forged.job_id, enabled: false }), asFunction = Object.assign(() => undefined, { job_id: forged.job_id, enabled: false });
    for (const input of [asArray, asFunction, [], "x", 7, null, undefined]) {
      await assert.rejects(ownB.invoke(schedule.cancel, input as never), malformed, `cancel ${String(input)}`);
      await assert.rejects(ownB.invoke(schedule.setEnabled, input as never), malformed, `setEnabled ${String(input)}`);
      await assert.rejects(ownB.invoke(schedule.register, input as never), malformed, `register ${String(input)}`);
    }
    assert.deepEqual(owners(), [`${A}:one`, `${B}:two`]);
    assert.equal(service.get(forged.job_id)?.enabled, true);

    // A plugin does manage its own job.
    assert.equal((await ownA.invoke(schedule.setEnabled, { job_id: forged.job_id, enabled: false })).enabled, false);
    assert.deepEqual(await ownA.invoke(schedule.cancel, { job_id: forged.job_id }), { cancelled: true });
    assert.deepEqual(owners(), [`${B}:two`]);

    // The Host's own client names no plugin, so the typed channel has no owner to act for and refuses.
    const hostClient = local.client(project);
    for (const [definition, input] of [[schedule.register, { ...job, plugin_id: B }], [schedule.list, { plugin_id: B }],
      [schedule.cancel, { job_id: mineB.job_id, plugin_id: B }], [schedule.setEnabled, { job_id: mineB.job_id, plugin_id: B, enabled: false }]] as const) {
      await assert.rejects(hostClient.invoke(definition as never, input as never), malformed, definition.capability_id);
    }
    assert.deepEqual(owners(), [`${B}:two`]);

    // A stopped installation reaches nothing.
    await runtime.stop(second.install_id);
    await assert.rejects(ownB.invoke(schedule.list, {}), /已停止/);
    await assert.rejects(ownB.invoke(schedule.cancel, { job_id: mineB.job_id }), /已停止/);
    assert.deepEqual(owners(), [`${B}:two`]);
  } finally {
    await runtime.stop(first.install_id).catch(() => {}); await runtime.stop(second.install_id).catch(() => {});
    await local.close(); store.close(); await rm(home, { recursive: true, force: true });
  }
});
