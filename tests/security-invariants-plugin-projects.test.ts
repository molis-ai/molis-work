import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPluginPlatform, DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { PLUGIN_PROJECTS_EXIST_LIMITS, PLUGIN_PROJECTS_EXIST_PERMISSION, type PluginDefinition, type PluginManifest, type PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginProjectsClient } from "@molis-ai/molis-work-plugin-runtime";
import { assertSandboxDeclarations } from "@molis-ai/molis-work-plugin-sandbox";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { grantProjects, projectsProbe } from "./fixtures/plugin-projects.js";

// S-92 (BL-680, 用户 2026-10-26 弹窗决定): `services.projects` tells a plugin, for project ids it passes in, whether each is still a project of
// this Home, to a plugin that declared `projects:exist` and holds the person's grant, and says nothing else.

async function started(t: Parameters<typeof serveHomeRuntime>[0], probe = projectsProbe()) {
  const served = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
  await served.host.homePlugins!.ready();
  const granted = await grantProjects(served.host, probe), action = served.host.homeActionClient();
  const remove = async (projectId: string) => {
    const response = await served.request(`/api/settings/projects/${projectId}/delete`, { method: "POST", body: { delete_confirmed: true, idempotency_key: `delete-${projectId}` } });
    assert.equal(response.status, 200, await response.clone().text());
  };
  return { ...served, ...granted, probe, remove, exist: (ids: string[]) => action.invoke(probe.caller(), probe.exist, { ids }) as Promise<Record<string, boolean>> };
}

const manifestWithout = (declared: boolean): PluginManifest => ({ schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.projectsunit", version: "1.0.0", name: "projectsunit", kind: "app",
  publisher: { publisher_id: "example", signature: "projects-unit" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
  permissions: declared ? [{ permission: PLUGIN_PROJECTS_EXIST_PERMISSION, required: false, reason: "Ask" }] : [],
  capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [] });
const gate = { assertActive() {}, requireGrant() {} };

test("S-92 RAC-1060 a plugin that does not declare projects:exist is given no service, and a client the Host built for one refuses it", async t => {
  const none = projectsProbe("projectsnone", false), served = await serveHomeRuntime(t, { pluginFixtures: { home: [none.entry()] } });
  await served.host.homePlugins!.ready();
  assert.equal(none.contexts.at(-1)?.services?.projects, undefined);
  const asked = (await started(t)).probe;
  assert.deepEqual(Object.keys(asked.contexts.at(-1)!.services!.projects!), ["exist"], "the service has one method");
  const port = { existing: async () => new Set(["kept"]) };
  await assert.rejects(createPluginProjectsClient(manifestWithout(false), port, gate).exist(["kept"]), { code: "plugin.projects_permission_undeclared" });
  assert.deepEqual(await createPluginProjectsClient(manifestWithout(true), port, gate).exist(["kept"]), { kept: true });
});

test("S-92 RAC-1061 a plugin the person did not grant projects:exist is refused, and is answered again once it is granted", async t => {
  const f = await started(t), project = await f.project("S-92 grant");
  await grantProjects(f.host, f.probe, ["storage:private"]);
  await assert.rejects(f.probe.client().exist([project.project_id]), { code: "actions.forbidden" });
  await assert.rejects(f.exist([project.project_id]), { code: "actions.plugin_permission" }, "and the action that asks it is refused by the kernel before it runs");
  await grantProjects(f.host, f.probe);
  assert.deepEqual(await f.exist([project.project_id]), { [project.project_id]: true });
});

test("S-92 RAC-1062 the answer is one yes or no for each id asked, with nothing else and no id that was not asked", async t => {
  const f = await started(t), kept = (await f.project("S-92 kept")).project_id, gone = (await f.project("S-92 gone")).project_id;
  await f.remove(gone);
  const answer = await f.exist([kept, gone, "no-such-project", kept]);
  assert.deepEqual(answer, { [kept]: true, [gone]: false, "no-such-project": false }, "a deleted project reads as gone, a repeated id is answered once");
  assert.ok(Object.values(answer).every(value => typeof value === "boolean"));
  assert.deepEqual(await f.exist([]), {}, "asking about nothing lists nothing");
  const direct = await f.probe.client().exist(["__proto__", kept]);
  assert.deepEqual(Object.keys(direct).sort(), ["__proto__", kept].sort(), "an id named like a property is an answer, not a prototype");
  assert.equal(Object.isFrozen(direct), true);
  assert.equal(Object.getPrototypeOf(direct), Object.prototype);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  const leaky = createPluginProjectsClient(manifestWithout(true), { existing: async () => new Set(["asked", "other-project", "third-project"]) }, gate);
  assert.deepEqual(await leaky.exist(["asked", "absent"]), { asked: true, absent: false }, "what the Host knows beyond the ids asked never reaches the plugin");
});

test("S-92 RAC-1063 what is not a short list of ids is refused before the Host is asked, and a Host that cannot look says so instead of saying gone", async () => {
  let asked = 0;
  const client = createPluginProjectsClient(manifestWithout(true), { existing: async () => { asked += 1; return new Set(); } }, gate);
  const { ids: most, id_length: longest } = PLUGIN_PROJECTS_EXIST_LIMITS;
  const invalid = { code: "plugin.projects_input_invalid" };
  await assert.rejects(client.exist(Array.from({ length: most + 1 }, (_, index) => `p${index}`)), invalid);
  for (const id of ["", "a\u0000b", "x".repeat(longest + 1)]) await assert.rejects(client.exist([id]), invalid, JSON.stringify(id.slice(0, 12)));
  await assert.rejects(Reflect.apply(client.exist, client, ["not-a-list"]), invalid);
  await assert.rejects(Reflect.apply(client.exist, client, [[7]]), invalid);
  assert.equal(asked, 0, "the Host was not asked");
  assert.equal(Object.keys(await client.exist(Array.from({ length: most }, (_, index) => `p${index}`))).length, most, "the limit itself is allowed");
  const unreadable = createPluginProjectsClient(manifestWithout(true), { existing: async () => { throw new Error("catalog not readable"); } }, gate);
  await assert.rejects(unreadable.exist(["kept"]), /catalog not readable/u);
});

test("S-92 RAC-1064 a grant revoked while the Host is looking, and a plugin that is stopped, get no answer", async t => {
  let held = true;
  const revoking = createPluginProjectsClient(manifestWithout(true), { existing: async () => { held = false; return new Set(["kept"]); } },
    { assertActive() {}, requireGrant() { if (!held) throw new Error("grant revoked"); } });
  await assert.rejects(revoking.exist(["kept"]), /grant revoked/u, "the grant is checked again before the answer leaves");
  const f = await started(t), client = f.probe.client(), project = await f.project("S-92 stopped");
  assert.deepEqual(await client.exist([project.project_id]), { [project.project_id]: true });
  await f.platform.runtime.stop(f.install.install_id);
  const settled = (promise: Promise<unknown>) => Promise.race([promise.then(() => true, () => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 200))]);
  assert.equal(await settled(client.exist([project.project_id])), false, "a stopped plugin's call never answers");
});

test("S-92 RAC-1065 a sandboxed plugin that declares projects:exist does not start: the sandbox is not given the service", () => {
  const manifest = manifestWithout(true);
  assert.throws(() => assertSandboxDeclarations({ manifest: { ...manifest, permissions: [{ permission: PLUGIN_PROJECTS_EXIST_PERMISSION, required: true, reason: "Ask" }] } }, []),
    error => (error as { code?: string }).code === "sandbox.service_not_given");
  assert.doesNotThrow(() => assertSandboxDeclarations({ manifest: manifestWithout(false) }, []));
});

test("S-92 RAC-1067 a project instance is given the service by the same rule, answered from the port the platform was given", async t => {
  const directory = mkdtempSync(join(tmpdir(), "plugin-projects-")), file = join(directory, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), platforms: ReturnType<typeof createPluginPlatform>[] = [];
  t.after(async () => {
    for (const platform of platforms) { await platform.closeCoordination(); for (const record of platform.runtime.list()) if (record.state === "running") await platform.runtime.stop(record.install_id); }
    store.close(); rmSync(directory, { recursive: true, force: true });
  });
  const start = async (name: string, declare: boolean) => {
    const ports = { db: store.db, appendEvent: (event: Parameters<typeof store.appendEvent>[0]) => store.appendEvent(event), eventCursor: (id: string) => store.eventCursor(id) };
    const platform = createPluginPlatform({ db: store.db, project_id: DEMO_PROJECT_ID, actor_id: "tester", actions: pluginActions(store, DEMO_PROJECT_ID), home: null,
      projects: { existing: async ids => new Set(ids.filter(id => id === "kept")) },
      artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), ui: new UiHost(), privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) });
    platforms.push(platform);
    let context: PluginStartContext | undefined;
    const definition: PluginDefinition = { manifest: { ...manifestWithout(declare), plugin_id: `io.molis.work.example.${name}`, name, publisher: { publisher_id: "example", signature: `fixture-${name}` } },
      async start(value) { context = value; return { kind: "app", actions: [] }; } };
    const report = await platform.start([{ definition, trust: { level: "host" } }]);
    assert.deepEqual(report.failed, []);
    return { platform, services: () => context!.services!, install: () => platform.runtime.list().find(record => record.plugin_id === definition.manifest.plugin_id)! };
  };
  assert.equal((await start("projectshalfnone", false)).services().projects, undefined);
  const declared = await start("projectshalf", true);
  assert.deepEqual(await declared.services().projects!.exist(["kept", "gone"]), { kept: true, gone: false });
  await declared.platform.runtime.stop(declared.install().install_id);
  declared.platform.runtime.grant(declared.install().install_id, []);
  await declared.platform.runtime.start(declared.install().install_id);
  await assert.rejects(declared.services().projects!.exist(["kept"]), { code: "plugin.grant_denied" }, "the person turned it off");
});
