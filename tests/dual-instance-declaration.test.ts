import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, homeAgentDefinitions, localWebActionContext, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { PluginRuntime, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { dualPlugin } from "./fixtures/dual-plugin.js";

type Fixtures = NonNullable<NonNullable<ConstructorParameters<typeof MolisWorkLocalHost>[0]>["pluginFixtures"]>;

// DUAL-05 and DUAL-12 (specs/dual-instance-plugins/spec.md), security invariants S-15 and the dual-instance declaration row
// (docs/system/SECURITY-INVARIANTS.md): a plugin runs as the Home's instance and as each project's only when the Host's own start list
// says so, on its Home side. Each half then offers only its share of the one Manifest; without the mark nothing is relaxed.

async function temporaryHome(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "dual-instance-declaration-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  return home;
}

async function openHost(t: TestContext, fixtures: Fixtures) {
  const home = await mkdtemp(join(tmpdir(), "dual-instance-declaration-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "双实例", actor_id: "owner" }));
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: fixtures });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  return { home, host, reference };
}

test("DUAL-12 DUAL-05 a Home half marked on the Host's list and its project half both start, each offering only its own share", { timeout: 60_000 }, async t => {
  const dual = dualPlugin();
  const { host, reference } = await openHost(t, { home: [{ definition: dual.home, dual_instance: true }], project: [dual.project] });
  const platform = await host.homePlugins!.ready();
  const homeRecord = host.homePlugins!.installation(dual.id)!;
  assert.equal(homeRecord.state, "running", platform.supervisor.state(dual.id)?.message ?? "");
  assert.deepEqual(platform.runtime.contribution(homeRecord.install_id)?.actions?.map(action => action.capability_id),
    [dual.actions.home.capability_id, dual.actions.homeReach.capability_id]);
  // The Manifest publishes an event, and the Home half still starts; it is given none of a project's services for it.
  assert.ok(dual.services.home, "the Home half started");
  for (const service of ["events", "inputs", "outputs", "artifacts", "processItems"] as const) {
    assert.equal(dual.services.home[service], undefined, `the Home half has no ${service} service`);
  }

  // Looking at the project's actions starts its Plugin Runtime, and with it the project half.
  const context = await localWebActionContext(host, reference, []);
  const projectRecord = await host.withProject(reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db).list()
    .find(record => record.plugin_id === dual.id));
  assert.ok(projectRecord);
  assert.equal(projectRecord.state, "running");
  assert.equal(projectRecord.install_id, homeRecord.install_id, "both halves are one installation identity");
  assert.notEqual(projectRecord.installation_generation, homeRecord.installation_generation, "each database keeps its own generation");
  assert.ok(dual.services.project?.events, "the project half is given the events service its Manifest declares");

  const offered = Object.fromEntries((context.allowed_actions ?? []).map(entry => [entry.capability_id, entry.provider_id]));
  assert.equal(offered[dual.actions.home.capability_id], offered[dual.actions.project.capability_id], "both halves register under one provider id");
  const client = host.actionClient(reference);
  assert.equal((await client.invoke(context, dual.actions.home, {})).half, "home");
  assert.equal((await client.invoke(context, dual.actions.project, {})).half, "project");
});

test("RAC-198 PG-051 a dual-instance plugin's Home and project halves are one installation: its Agent definitions carry no “多个安装” notice", { timeout: 60_000 }, async t => {
  // Shelf runs this way. Two installations of one plugin (two signatures) still carry the notice: RAC-198 in tests/plugin-methods-runtime.test.ts.
  const dual = dualPlugin("dualagent");
  const manifest = { ...dual.manifest, agent: { roles: [{ role_id: "sorter", version: 1, name: "整理员", workspace: "none" as const, prompts: ["dual-role"] }], prompts: [{ prompt_id: "dual-role", version: 1 }] } };
  const withAgent = (half: typeof dual.home) => ({ ...half, manifest, agent_prompts: [{ prompt_id: "dual-role", version: 1, body: "两半共用的做法" }] });
  const { home, host, reference } = await openHost(t, { home: [{ definition: withAgent(dual.home), dual_instance: true }], project: [withAgent(dual.project)] });
  await host.homePlugins!.ready();
  assert.equal(host.homePlugins!.installation(dual.id)?.state, "running");
  await localWebActionContext(host, reference, []);
  const projectRecord = await host.withProject(reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db).list().find(record => record.plugin_id === dual.id));
  assert.equal(projectRecord?.state, "running", "both halves run");
  const rows = homeAgentDefinitions(home).registrations().filter(row => row.owner_id === dual.id);
  assert.deepEqual(rows.map(row => [row.source.kind === "plugin" && row.source.state, row.roles.map(role => role.role_id)]), [["enabled", ["sorter"]]]);
  assert.ok(!(rows[0]!.notes ?? []).some(note => note.includes("多个安装")), JSON.stringify(rows[0]!.notes));
});

test("DUAL-12 the same plugin on both start lists without the mark is refused before anything starts", async t => {
  const dual = dualPlugin(), home = await temporaryHome(t);
  assert.throws(() => new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { home: [dual.home], project: [dual.project] } }),
    /插件 io\.molis\.work\.example\.dualprobe 不能同时在 Home 与项目启动名单里/u);
});

test("DUAL-12 only the Home side carries the mark, and a marked Home half must have its project half", async t => {
  const dual = dualPlugin(), home = await temporaryHome(t);
  const host = (fixtures: Fixtures) =>
    () => new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: fixtures });
  assert.throws(host({ home: [{ definition: dual.home, dual_instance: true }], project: [{ definition: dual.project, dual_instance: true }] }),
    /项目夹具 io\.molis\.work\.example\.dualprobe 不能自称双实例/u);
  assert.throws(host({ home: [dual.home], project: [{ definition: dual.project, dual_instance: true }] }), /不能自称双实例/u,
    "a project entry's own mark is refused, whatever the Home side says");
  assert.throws(host({ home: [{ definition: dual.home, dual_instance: true }] }), /双实例插件 io\.molis\.work\.example\.dualprobe 在项目启动名单里没有另一半/u);
});

test("DUAL-12 a sandboxed definition is no half: a fixture refuses it, and the Runtime refuses to treat one as shipping with the Host", async t => {
  const dual = dualPlugin(), sandboxed = { ...dual.home, execution: "sandbox" as const };
  const { host } = await openHost(t, { home: [{ definition: sandboxed, dual_instance: true }], project: [dual.project] });
  await assert.rejects(host.homePlugins!.ready(), /是沙箱执行的/u);
  assert.equal(dual.services.home, undefined);
  assert.throws(() => new PluginRuntime().install({ definition: { ...dual.project, execution: "sandbox" }, deployment: "local", bundled: true, grants: [dual.read] }),
    { code: "plugin.grant_denied" });
});

test("DUAL-05 a Home plugin not marked as a half is still refused for declaring what only a project instance serves", { timeout: 60_000 }, async t => {
  const dual = dualPlugin();
  const { host } = await openHost(t, { home: [dual.home] });
  const platform = await host.homePlugins!.ready();
  // The Runtime records the refusal as a failed start and keeps its reason to itself; the plugin's own start never ran.
  assert.notEqual(platform.supervisor.state(dual.id)?.status, "running");
  assert.equal(host.homePlugins!.installation(dual.id)?.state, "crashed");
  assert.equal(dual.services.home, undefined, "refused before the plugin's start, which the marked Home half above reaches");
});
