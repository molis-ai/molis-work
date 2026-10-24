import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { directoryForHome } from "@molis-ai/molis-work-app-local-host";
import type { ActionDefinition, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseTransaction, PluginDefinition, PluginHostServices, PluginManifest, PluginOwnerFilesDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { openTestHome } from "./fixtures/test-home.js";

/**
 * BL-368, DUAL-16, S-48 (specs/dual-instance-plugins U3): the services #1018 added check the running action's instance, not only its
 * installation, like the ones `tests/dual-instance-handles.test.ts` proves. The two halves share `install_id` and differ in
 * `installation_generation`; each test holds one half's handle inside the other half's action, where that action meets every other
 * condition of the service, so the instance is the only reason left to refuse it. The half's own action then passes the same check
 * and stops at the next one (or answers), so the refusal is the instance check's and nothing else's.
 *
 * Which half has what: the Host gives the project half the action dependencies, Agent, installations, notifications and scheduler,
 * the Home half the terminal (it needs the Home's owner files), and both halves an authorized directory.
 */

const NAME = "dualservices", PLUGIN = `io.molis.work.example.${NAME}`;
const FILES_READ = `${NAME}:files-read`, FILES_WRITE = `${NAME}:files-write`, DATA_READ = `${NAME}:data-read`, DATA_WRITE = `${NAME}:data-write`;
/** What the probe actions declare: every permission a service below asks its calling action for. */
const USED = ["actions:invoke", "agent:run", "terminal:run", "plugins:read", "notifications:write", "schedule:read", "directory:read"];
type Half = "home" | "project";
type Use = (services: Record<Half, PluginHostServices>, caller: ActionExecutionContext) => unknown;
type Outcome = { outcome: string; message?: string; value?: unknown };

/**
 * One Manifest, two halves. Each half offers one concurrent command for people, declaring every permission in `USED`; the test
 * says what its next call does (`next`), and it answers with what came back or the code and message it was refused with.
 */
function servicesProbe() {
  const action = (half: Half): ActionDefinition => ({ capability_id: `${NAME}.${half}`, version: 1, operation: "command",
    action: { title: half, description: `双实例服务探针的 ${half} 一半`, kind: "operation", scope: half, audiences: ["user"], permissions: USED,
      scheduling: "concurrent", subject_kinds: [], input_schema: { type: "object", additionalProperties: false } } });
  const actions = { home: action("home"), project: action("project") };
  const owner_files: PluginOwnerFilesDeclaration = { store_name: NAME, entries: [{ name: "notes", kind: "directory" }], read_permission: FILES_READ, write_permission: FILES_WRITE };
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: PLUGIN, version: "1.0.0", name: NAME, kind: "app",
    publisher: { publisher_id: "example", signature: `dual-${NAME}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: ["storage:private", FILES_READ, FILES_WRITE, DATA_READ, DATA_WRITE, ...USED].map(permission => ({ permission, required: true, reason: "双实例服务探针" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: Object.values(actions),
    databases: { project: { store_name: NAME, version: 1, read_permission: DATA_READ, write_permission: DATA_WRITE, schema: `CREATE TABLE ${NAME}_notes (text TEXT NOT NULL);` } },
    owner_files };
  const services: Partial<Record<Half, PluginHostServices>> = {};
  let next: Use | undefined;
  const half = (which: Half): PluginDefinition => ({ manifest, start(context) {
    services[which] = context.services;
    return { kind: "app", actions: [{ ...actions[which], handle: async (caller: ActionExecutionContext): Promise<Outcome> => {
      const use = next; next = undefined;
      try { return { outcome: "ok", value: await use!(services as Record<Half, PluginHostServices>, caller) ?? null }; }
      catch (error) {
        return error instanceof Error && "code" in error ? { outcome: String(error.code), message: error.message } : { outcome: "error", message: String(error) };
      }
    } }] };
  } });
  return { actions, owner_files, home: half("home"), project: half("project"), use(run: Use) { next = run; } };
}

/** A Test Home whose Host starts the probe's Home half (marked, with its owner files) and, in the one project, its project half. */
async function open(t: TestContext) {
  const probe = servicesProbe();
  const home = await openTestHome(t, { catalogPolicy: false, host: { pluginFixtures: {
    home: [{ definition: probe.home, dual_instance: true }], project: [probe.project] } } });
  await home.host.homePlugins!.ready();
  const project = await home.createProject("双实例服务");
  const context = await home.host.localPersonContext(project.reference), client = home.host.actionClient(project.reference);
  /** Runs `use` inside the action of the half `inside`, as the local person in the project. */
  const run = async (inside: Half, use: Use) => { probe.use(use); return await client.invoke(context, probe.actions[inside], {}) as Outcome; };
  return { home, project, context, run };
}

/** Refused as the other instance's call (`assertCapturedPluginActionCurrent`), not for any other reason. */
const otherInstance = (answer: Outcome) => answer.outcome === "actions.forbidden" && answer.message!.includes("另一个插件实例");

test("BL-368, DUAL-16, S-48: each half's action dependencies are refused inside the other half's action", { timeout: 60_000 }, async t => {
  const s = await open(t), refused = { outcome: "actions.forbidden", message: "动态动作只能由当前安装的动作或后台作业调用" };
  assert.deepEqual(await s.run("project", services => services.home.actions!.dependencies!.discover()), refused, "the Home half's, in the project half's action");
  assert.deepEqual(await s.run("home", services => services.project.actions!.dependencies!.discover()), refused, "the project half's, in the Home half's action");
  for (const half of ["home", "project"] as const) {
    const own = await s.run(half, services => services[half].actions!.dependencies!.discover());
    assert.equal(own.outcome, "ok", `${half} 一半自己的：${own.message}`);
    assert.ok(Array.isArray(own.value));
  }
});

test("BL-368, DUAL-16, S-48: the project half's Agent is refused inside the Home half's action", { timeout: 60_000 }, async t => {
  const s = await open(t), task = { role_id: "reader", title: "探针", task: "回答。" };
  assert.deepEqual(await s.run("home", services => services.project.agents!.run(task)),
    { outcome: "actions.forbidden", message: "Agent 必须由本插件声明权限的并行动作或后台作业启动" });
  // Its own action passes that check and stops at the next: the Manifest declares no Agent role, so no Agent runs.
  assert.deepEqual(await s.run("project", services => services.project.agents!.run(task)),
    { outcome: "actions.forbidden", message: "插件没有声明这个 Agent 角色" });
});

test("BL-368, DUAL-16, S-48: the Home half's terminal is refused inside the project half's action", { timeout: 60_000 }, async t => {
  const s = await open(t);
  assert.deepEqual(await s.run("project", services => services.home.terminal!.open({ key: "probe", command: "/usr/bin/true", title: "探针" })),
    { outcome: "actions.forbidden", message: "交互终端只能由当前页面的授权动作启动" }, "refused before any terminal host or panel is reached");
  // Its own action passes that check and stops at the next, an input the terminal refuses, so nothing is spawned.
  assert.deepEqual(await s.run("home", services => services.home.terminal!.open({ key: "Not A Key", command: "/usr/bin/true", title: "探针" })),
    { outcome: "actions.input_invalid", message: "终端启动参数无效" });
});

test("BL-368, DUAL-16, S-48: the project half's installations are refused inside the Home half's action", { timeout: 60_000 }, async t => {
  const s = await open(t);
  assert.ok(otherInstance(await s.run("home", services => services.project.installations!.list())));
  const own = await s.run("project", services => services.project.installations!.list());
  assert.equal(own.outcome, "ok", own.message);
  assert.ok((own.value as Array<{ plugin_id: string }>).some(item => item.plugin_id === PLUGIN));
});

test("BL-368, DUAL-16, S-48: the project half's notifications are refused inside the Home half's action", { timeout: 60_000 }, async t => {
  const s = await open(t), notice = { key: "one", title: "提醒", summary: "", body: "结果好了。" };
  // The Home half has no project library, so it has no transaction to pass: the service refuses before it looks at one.
  const none = Object.freeze({}) as PluginDatabaseTransaction;
  assert.ok(otherInstance(await s.run("home", services => services.project.notifications!.deliver(none, notice))));
  // Its own action passes that check and stops at the next, a notice without a title, inside its own transaction: nothing is delivered.
  assert.deepEqual(await s.run("project", (services, caller) => services.project.project_database!.transaction(caller.beforeEffect,
    tx => services.project.notifications!.deliver(tx, { ...notice, title: " " }))), { outcome: "actions.input_invalid", message: "通知字段无效：title" });
});

test("BL-368, DUAL-16, S-48: the project half's scheduler is refused inside the Home half's action", { timeout: 60_000 }, async t => {
  const s = await open(t);
  assert.ok(otherInstance(await s.run("home", services => services.project.scheduler!.list())));
  assert.deepEqual(await s.run("project", services => services.project.scheduler!.list()), { outcome: "ok", value: [] });
});

test("BL-368, DUAL-16, S-48: a directory granted to the project half is not read through its handle inside the Home half's action", { timeout: 60_000 }, async t => {
  const s = await open(t), folder = await mkdtemp(join(tmpdir(), "dual-instance-directory-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  await writeFile(join(folder, "inside.md"), "内容");
  // The person grants the folder in the project, so the grant belongs to the project half (`directoryForHome().select`).
  const grant = await directoryForHome(s.home.home).select({ plugin_id: PLUGIN, actor_id: s.context.actor_id, project_id: s.project.project_id },
    async () => ({ status: "picked" as const, path: folder }));
  assert.ok(grant);
  // Same plugin, person and project as the grant: only the instance differs.
  assert.deepEqual(await s.run("home", services => services.project.directory!.read({ grant_id: grant.grant_id })),
    { outcome: "ok", value: { outcome: "denied" } });
  const own = await s.run("project", services => services.project.directory!.read({ grant_id: grant.grant_id }));
  assert.equal((own.value as { outcome: string }).outcome, "directory", JSON.stringify(own));
});
