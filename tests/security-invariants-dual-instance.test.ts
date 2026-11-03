import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { PluginRuntime, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { definePlugin } from "@molis-ai/molis-work-plugin-sdk";

// Security invariants S-08 and S-18 (docs/system/SECURITY-INVARIANTS.md), DUAL-06 (specs/dual-instance-plugins/spec.md): one plugin can
// run twice, as the Home's instance and as a project's. `install_id` is a hash of the plugin id and its publisher, so both databases hold
// a record under the same `install_id`, each with its own generation and its own grants. The local person's call context reads each
// instance's authority from the record of the database that instance lives in; it never lets one record stand in for the other.

const PLUGIN_ID = "io.molis.work.example.dual-instance", PERMISSION = "dual:use";
const action = (capability_id: string, scope: "home" | "project"): ActionDefinition<Record<string, never>, string> => ({ capability_id, version: 1, operation: "query",
  action: { title: capability_id, description: "同一个插件两个实例各自的动作", kind: "query", scope, audiences: ["user"], permissions: [PERMISSION], subject_kinds: [],
    input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "string" } } });
const homeAction = action("dual.home-read", "home"), projectAction = action("dual.project-read", "project");
// Same plugin id, version and publisher signature, so the same installation identity; the actions are disjoint, so each half is a whole plugin today.
const half = (definition: ActionDefinition<Record<string, never>, string>, answer: string) => definePlugin({ manifest: { schema_version: 2, host_api_version: 2,
  plugin_id: PLUGIN_ID, version: "1.0.0", name: "双实例探针", kind: "app", publisher: { publisher_id: "example", signature: "dual-instance" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }], permissions: [{ permission: PERMISSION, required: false, reason: "两个实例用同一个权限名" }],
  capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [definition] },
  async start() { return { kind: "app", actions: [{ ...definition, handle: () => answer }] }; } });

async function openDual(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "dual-instance-authority-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "双实例", actor_id: "owner" }));
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { home: [half(homeAction, "home")] } });
  // The Home instance, started by the Home's supervisor.
  const platform = await host.homePlugins!.ready();
  const homeInstall = () => host.homePlugins!.installation(PLUGIN_ID)!;
  // The project instance, installed into the project's own database the way a project's Plugin Runtime does.
  const repository = await host.withProject(reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db));
  const runtime = new PluginRuntime(repository, undefined, { hostIds: ISOLATED_HOST_IDS, actions: { registry: host.actionRegistry(reference), project_id: reference.project_id } });
  const installId = runtime.install({ trust: { level: "unsigned" }, definition: half(projectAction, "project"), deployment: "local", grants: [PERMISSION] }).install.install_id;
  t.after(async () => { await runtime.stop(installId).catch(() => undefined); await host.close(); await rm(home, { recursive: true, force: true }); });
  const setHomeGrants = async (grants: string[]) => {
    await platform.runtime.stop(homeInstall().install_id); platform.runtime.grant(homeInstall().install_id, grants);
    assert.equal((await platform.supervisor.restart(PLUGIN_ID)).status, "running");
  };
  const setProjectGrants = async (grants: string[]) => { await runtime.stop(installId); runtime.grant(installId, grants); await runtime.start(installId); };
  await setHomeGrants([PERMISSION]); await runtime.start(installId);
  const client = host.actionClient(reference);
  const offered = (context: ActionCallContext) => Object.fromEntries((context.allowed_actions ?? []).map(entry => [entry.capability_id, entry.provider_id]));
  const call = (context: ActionCallContext, definition: ActionDefinition<Record<string, never>, string>) => client.invoke(context, definition, {});
  const validate = (context: ActionCallContext, definition: ActionDefinition<Record<string, never>, string>) =>
    context.validate_authority!({ ...definition, provider_id: offered(context)[definition.capability_id] });
  return { host, reference, runtime, installId, homeInstall, projectInstall: () => runtime.get(installId), setHomeGrants, setProjectGrants, offered, call, validate,
    context: () => host.localPersonContext(reference) };
}

test("DUAL-06 the Home instance and the project instance share one install_id, hold their own generations, and each instance's actions are accepted on its own record", async t => {
  const s = await openDual(t);
  assert.equal(s.homeInstall().install_id, s.projectInstall().install_id, "the installation identity is deterministic: both databases hold a record under it");
  assert.notEqual(s.homeInstall().installation_generation, s.projectInstall().installation_generation, "each database gives its record its own generation");
  assert.deepEqual([s.homeInstall().state, s.projectInstall().state], ["running", "running"]);

  const context = await s.context();
  assert.ok(s.offered(context)[homeAction.capability_id], "the Home instance's action is the person's");
  assert.ok(s.offered(context)[projectAction.capability_id], "the project instance's action is the person's");
  assert.equal(await s.call(context, homeAction), "home");
  assert.equal(await s.call(context, projectAction), "project");
  await s.validate(context, homeAction);
  await s.validate(context, projectAction);
});

test("DUAL-06 revoking the project record's grant makes the project instance's action unavailable while the Home instance's works, though the Home record holds the same permission", async t => {
  const s = await openDual(t);
  const before = await s.context();

  await s.setProjectGrants([]);
  assert.ok(s.homeInstall().grants.includes(PERMISSION), "the Home record still holds the permission the project record lost");
  assert.ok(!s.projectInstall().grants.includes(PERMISSION));
  const context = await s.context();
  assert.ok(!s.offered(context)[projectAction.capability_id], "the project instance's action is not offered on the Home record's grant");
  assert.ok(s.offered(context)[homeAction.capability_id], "the Home instance's action is unaffected");
  await assert.rejects(s.call(context, projectAction), { code: "actions.forbidden" });
  assert.equal(await s.call(context, homeAction), "home");
  await s.validate(context, homeAction);
  await assert.rejects(async () => s.validate(context, projectAction), { code: "actions.forbidden" });
  await assert.rejects(async () => s.validate(before, projectAction), { code: "actions.forbidden" });
  await s.validate(before, homeAction);

  await s.setProjectGrants([PERMISSION]);
  const restored = await s.context();
  assert.equal(await s.call(restored, projectAction), "project", "granting it back makes the action the person's again");
  await s.validate(restored, projectAction);
});

test("DUAL-06 revoking the Home record's grant makes the Home instance's action unavailable while the project instance's works, though the project record holds the same permission", async t => {
  const s = await openDual(t);
  const before = await s.context();

  await s.setHomeGrants([]);
  assert.ok(s.projectInstall().grants.includes(PERMISSION), "the project record still holds the permission the Home record lost");
  assert.ok(!s.homeInstall().grants.includes(PERMISSION));
  const context = await s.context();
  assert.ok(!s.offered(context)[homeAction.capability_id], "the Home instance's action is not offered on the project record's grant");
  assert.ok(s.offered(context)[projectAction.capability_id], "the project instance's action is unaffected");
  await assert.rejects(s.call(context, homeAction), { code: "actions.forbidden" });
  assert.equal(await s.call(context, projectAction), "project");
  await s.validate(context, projectAction);
  await assert.rejects(async () => s.validate(context, homeAction), { code: "actions.forbidden" });
  await assert.rejects(async () => s.validate(before, homeAction), { code: "actions.forbidden" });
  await s.validate(before, projectAction);
});

test("DUAL-06 a nested call is checked against its own database's generation: reinstalling the project instance refuses what was built before it, and not the Home instance's", async t => {
  const s = await openDual(t);
  const before = await s.context();
  const generation = s.projectInstall().installation_generation;
  await s.runtime.stop(s.installId); await s.runtime.uninstall(s.installId);
  s.runtime.install({ trust: { level: "unsigned" }, definition: half(projectAction, "project"), deployment: "local", grants: [PERMISSION] });
  await s.runtime.start(s.installId);
  assert.equal(s.projectInstall().install_id, s.homeInstall().install_id);
  assert.notEqual(s.projectInstall().installation_generation, generation, "the reinstalled project instance is a new installation");

  await assert.rejects(async () => s.validate(before, projectAction), { code: "actions.forbidden" });
  await s.validate(before, homeAction);
  const after = await s.context();
  await s.validate(after, projectAction);
  assert.equal(await s.call(after, projectAction), "project");
});
