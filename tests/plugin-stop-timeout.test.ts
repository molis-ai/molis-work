import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { captureHostLog, DEMO_PROJECT_ID, LocalProjectDatabase, PluginHostExecutor, PLUGIN_STOP_HOOK_MS, seedDemoBoard, type HostLogEntry } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { grantHomeProbe, homeProbe, serveHomeRuntime } from "./fixtures/home-runtime.js";

/*
 * BL-367 (specs/visual-ui-experience/work-items/batch27-runtime-contracts/spec.md): the Host waits PLUGIN_STOP_HOOK_MS (2 s, user
 * 2026-11-09) for an in-process plugin's asynchronous stop hook. A hook still pending then is no longer waited for: the stop goes on
 * (disabled, or installed for a preserve-enabled stop), one local warning with ids only is written, and it is not a failure (no
 * `last_error_code`, no recovery spent). A hook that finishes or throws in time keeps its own result. Before BL-367 a hook that never
 * settled hung the stop for good, so each hanging case below runs under a watchdog that fails it instead of waiting forever.
 */

const WATCHDOG_MS = 10_000;

/** `work`, or a failure once the watchdog runs out: the old Host never returned from a hanging hook. */
async function watched<T>(what: string, work: Promise<T>): Promise<{ value: T; ms: number }> {
  const began = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const value = await Promise.race([work, new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} 在 ${WATCHDOG_MS} 毫秒内没有返回：宿主还在等卡住的停止钩子`)), WATCHDOG_MS);
  })]).finally(() => clearTimeout(timer));
  return { value, ms: performance.now() - began };
}

function timeoutLines(t: TestContext) {
  const entries: HostLogEntry[] = [];
  t.after(captureHostLog(entries));
  return () => entries.filter(entry => entry.event === "plugin_stop_timeout");
}

function unhandled(t: TestContext) {
  const seen: unknown[] = [], note = (error: unknown) => { seen.push(error); };
  process.on("unhandledRejection", note);
  t.after(() => { process.off("unhandledRejection", note); });
  return seen;
}

/** A hook that never settles until the test lets it: `settle` resolves or rejects it later, the way a slow cleanup finally ends. */
function hanging() {
  let settle!: { resolve: () => void; reject: (error: Error) => void };
  const entered: number[] = [];
  return { entered, settle: () => settle, hook: () => new Promise<void>((resolve, reject) => { entered.push(performance.now()); settle = { resolve, reject }; }) };
}

test("B27-STOP-01 B27-STOP-04 a Home plugin whose stop hook never returns is disabled over HTTP after the time limit, logged once, not a failure", { timeout: 60_000 }, async t => {
  const probe = homeProbe("stophang"), lines = timeoutLines(t), crashes = unhandled(t), hang = hanging();
  const { host, request } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  const { install } = await grantHomeProbe(host, probe);
  const route = (operation: string) => `/api/plugins/${probe.id}/${operation}`;
  assert.equal((await request(route("save"), { method: "POST", body: { text: "kept" } })).status, 200);
  const old = probe.contexts.at(-1)!;
  probe.behavior.stop = hang.hook;
  const { value: disabled, ms } = await watched("Home 停用", request(route("disable"), { method: "POST", body: {} }));
  assert.equal(disabled.status, 200, "停用照常完成");
  assert.ok(ms >= PLUGIN_STOP_HOOK_MS - 50, `宿主等了期限（${Math.round(ms)} 毫秒）`);
  assert.equal(hang.entered.length, 1, "钩子进去过一次");
  const record = host.homePlugins!.installation(probe.id)!;
  assert.deepEqual([record.state, record.last_error_code, record.recovery_count], ["disabled", null, 0], "超时不是故障：不记错误码、不占恢复额度");
  assert.notEqual((await request(route("state"))).status, 200, "旧实例的路由不再答");
  assert.equal(old.services!.storage!.get("note"), undefined, "旧服务在停之后什么都不做（BL-411）");
  assert.deepEqual(lines().map(entry => [entry.level, entry.area, entry.fields]), [["warn", "plugins", { code: "plugin.stop_timeout", plugin_id: probe.id,
    install_id: install.install_id, installation_generation: old.installation_generation, scope: "home", timeout_ms: PLUGIN_STOP_HOOK_MS }]],
    "一行，只有 id 和数字");

  // The late hook settling (a rejection here) reaches nothing: no unhandled rejection, no second line, no change to the record.
  hang.settle().reject(new Error("迟到的清理失败"));
  await new Promise(resolve => { setTimeout(resolve, 50); });
  assert.deepEqual(crashes, []);
  assert.equal(lines().length, 1);
  probe.behavior.stop = async () => {};
  assert.equal((await request(route("enable"), { method: "POST", body: {} })).status, 200, "再启用开出新的激活");
  assert.equal(host.homePlugins!.installation(probe.id)!.state, "running");
  assert.deepEqual(await (await request(route("state"))).json(), { value: "kept", project_id: null }, "数据按原规则保留，新激活能读");
});

test("B27-STOP-04 controls: a hook that returns in time logs nothing; one that throws in time keeps the existing failure path", { timeout: 60_000 }, async t => {
  const probe = homeProbe("stopcontrol"), lines = timeoutLines(t);
  const { host, request } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await grantHomeProbe(host, probe);
  const route = (operation: string) => `/api/plugins/${probe.id}/${operation}`;
  probe.behavior.stop = () => new Promise<void>(resolve => { setTimeout(resolve, 100); });
  assert.equal((await watched("按时返回的停用", request(route("disable"), { method: "POST", body: {} }))).value.status, 200);
  assert.deepEqual([host.homePlugins!.installation(probe.id)!.state, host.homePlugins!.installation(probe.id)!.last_error_code], ["disabled", null]);
  assert.equal(lines().length, 0, "按时返回不写超时");
  probe.behavior.stop = async () => {};
  assert.equal((await request(route("enable"), { method: "POST", body: {} })).status, 200);
  probe.behavior.stop = async () => { throw new Error("清理失败"); };
  await watched("按时抛错的停用", request(route("disable"), { method: "POST", body: {} }));
  const failed = host.homePlugins!.installation(probe.id)!;
  assert.equal(failed.last_error_code, "plugin.executor_failed", "按时抛错照原路径记故障");
  assert.equal(lines().length, 0, "也不是超时");
});

/** A project plugin on the Host's project executor, under a real Runtime and a real project database. */
function projectRig(t: TestContext, stop: (context: PluginStartContext) => Promise<void> | void) {
  const directory = mkdtempSync(join(tmpdir(), "molis-stop-timeout-")), file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const executor = new PluginHostExecutor({ actions: pluginActions(store, DEMO_PROJECT_ID), project_id: DEMO_PROJECT_ID, actor_id: "user",
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }), ui: new UiHost(), invalidateView: () => {},
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) });
  const runtime = new PluginRuntime(undefined, executor, { hostIds: ISOLATED_HOST_IDS, actions: pluginActions(store, DEMO_PROJECT_ID) });
  const id = "io.molis.work.example.projectstop", starts: PluginStartContext[] = [];
  const definition: PluginDefinition = { manifest: { schema_version: 1, host_api_version: 1, plugin_id: id, version: "1.0.0", name: "projectstop", kind: "app",
    publisher: { publisher_id: "example", signature: "project-stop" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] } },
  async start(context) { starts.push(context); return { kind: "app" }; }, stop };
  const installId = runtime.install({ trust: { level: "unsigned" }, definition, deployment: "local", grants: [] }).install.install_id;
  t.after(async () => {
    if (runtime.get(installId).state === "running") await runtime.stop(installId);
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { runtime, installId, starts, id };
}

test("B27-STOP-01 B27-STOP-02 a project plugin's hanging hook: the stop ends after the limit, a restart runs a new activation, the old hook settling late changes nothing", { timeout: 60_000 }, async t => {
  const lines = timeoutLines(t), crashes = unhandled(t), hang = hanging();
  let hook: (context: PluginStartContext) => Promise<void> | void = hang.hook;
  const { runtime, installId, starts, id } = projectRig(t, context => hook(context));
  await runtime.start(installId);
  const { ms } = await watched("项目停止", runtime.stop(installId));
  assert.ok(ms >= PLUGIN_STOP_HOOK_MS - 50, `等了期限（${Math.round(ms)} 毫秒）`);
  assert.equal(runtime.get(installId).state, "disabled", "显式停止照常进 disabled");
  assert.deepEqual([runtime.get(installId).last_error_code, runtime.get(installId).recovery_count], [null, 0]);
  assert.deepEqual(lines().map(entry => entry.fields), [{ code: "plugin.stop_timeout", plugin_id: id, install_id: installId,
    installation_generation: starts[0]!.installation_generation, scope: "project", timeout_ms: PLUGIN_STOP_HOOK_MS }]);

  hook = async () => {};
  await runtime.start(installId);
  assert.equal(runtime.get(installId).state, "running", "新激活照常起来");
  assert.equal(starts.length, 2);
  hang.settle().resolve();
  await new Promise(resolve => { setTimeout(resolve, 50); });
  assert.equal(runtime.get(installId).state, "running", "旧钩子迟到返回不动新激活");
  assert.deepEqual(crashes, []);
  assert.equal(lines().length, 1, "没有第二行");
});
