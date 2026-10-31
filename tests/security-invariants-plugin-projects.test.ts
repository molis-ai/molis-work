import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { createPluginPlatform, DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { PLUGIN_PROJECTS_EXIST_LIMITS, PLUGIN_PROJECTS_EXIST_PERMISSION, SANDBOX_PACKAGE_FILES, type PluginDefinition, type PluginManifest, type PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxOperationContract, SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { createPluginProjectsClient } from "@molis-ai/molis-work-plugin-runtime";
import { assertSandboxDeclarations, DEFAULT_SANDBOX_LIMITS, effectsFromContract, SandboxBroker, SandboxError } from "@molis-ai/molis-work-plugin-sandbox";
import { MolisWorkLocalHost, pluginControlActions, pluginInstallActions, readSandboxPackage, sandboxPluginManifest } from "@molis-ai/molis-work-app-local-host";
import { newPublisher, PACKAGE_PLUGIN_ID, payloadOf, signedPackage } from "./fixtures/sandbox-package.js";
import { mac, operate, operationsOf, person, ref } from "./fixtures/home-sandbox.js";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { grantProjects, projectsProbe } from "./fixtures/plugin-projects.js";
import { openTestHome, serveTestHost } from "./fixtures/test-home.js";

// S-96 (BL-680, 用户 2026-10-26 弹窗决定): `services.projects` tells a plugin, for project ids it passes in, whether each is still a project of
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

function projectsPackage(ids: readonly string[], scope: "home" | "project") {
  return signedPackage(newPublisher(), (files, manifest) => {
    const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
    const query = contract.operations.find(operation => operation.id === "notes.list")!;
    query.effects = { projects: ["exist"] };
    query.input = { type: "object", properties: { ids: { type: "array", items: { type: "string" }, maxItems: 201 } }, required: [], additionalProperties: false };
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
    files[SANDBOX_PACKAGE_FILES.entrypoint] = `export const operations = {
      'notes.list': async (input, sdk) => { try { return [{id:'answer',text:JSON.stringify(await sdk.projects.exist(input.ids ?? ${JSON.stringify(ids)}))}]; }
        catch (error) { return [{id:'denied',text:error.code ?? String(error)}]; } },
      'notes.add': async () => true
    };`;
    Object.assign(manifest, sandboxPluginManifest({ pluginId: manifest.plugin_id, version: manifest.version, name: manifest.name, publisher: manifest.publisher,
      presentation: false, ...scope === "home" ? { runtime: { scope } } : {}, effects: effectsFromContract(contract) }));
  });
}

test("S-96 RAC-1060 a plugin that does not declare projects:exist is given no service, and a client the Host built for one refuses it", async t => {
  const none = projectsProbe("projectsnone", false), served = await serveHomeRuntime(t, { pluginFixtures: { home: [none.entry()] } });
  await served.host.homePlugins!.ready();
  assert.equal(none.contexts.at(-1)?.services?.projects, undefined);
  const asked = (await started(t)).probe;
  assert.deepEqual(Object.keys(asked.contexts.at(-1)!.services!.projects!), ["exist"], "the service has one method");
  const port = { existing: async () => new Set(["kept"]) };
  await assert.rejects(createPluginProjectsClient(manifestWithout(false), port, gate).exist(["kept"]), { code: "plugin.projects_permission_undeclared" });
  assert.deepEqual(await createPluginProjectsClient(manifestWithout(true), port, gate).exist(["kept"]), { kept: true });
});

test("S-96 RAC-1061 a plugin the person did not grant projects:exist is refused, and is answered again once it is granted", async t => {
  const f = await started(t), project = await f.project("S-96 grant");
  await grantProjects(f.host, f.probe, ["storage:private"]);
  await assert.rejects(f.probe.client().exist([project.project_id]), { code: "actions.forbidden" });
  await assert.rejects(f.exist([project.project_id]), { code: "actions.plugin_permission" }, "and the action that asks it is refused by the kernel before it runs");
  await grantProjects(f.host, f.probe);
  assert.deepEqual(await f.exist([project.project_id]), { [project.project_id]: true });
});

test("S-96 RAC-1062 the answer is one yes or no for each id asked, with nothing else and no id that was not asked", async t => {
  const f = await started(t), kept = (await f.project("S-96 kept")).project_id, gone = (await f.project("S-96 gone")).project_id;
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

test("S-96 RAC-1063 what is not a short list of ids is refused before the Host is asked, and a Host that cannot look says so instead of saying gone", async () => {
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

/**
 * Break the Home's project catalog for the Host's own open catalog connection: hide the table `listProjects` reads. Returns the function
 * that puts it back. (Overwriting the database file does not do it: the Web owner keeps one open connection whose page cache survives it.)
 */
function breakProjectCatalog(home: string): () => void {
  const db = new DatabaseSync(join(home, "projects", "catalog.db"));
  db.exec("ALTER TABLE projects RENAME TO projects_hidden");
  db.close();
  return () => { const back = new DatabaseSync(join(home, "projects", "catalog.db")); back.exec("ALTER TABLE projects_hidden RENAME TO projects"); back.close(); };
}

// RAC-2735 (T-358): a project catalog that cannot be read is a Host failure the plugin must not see raw — the SQLite/filesystem error
// can carry the library's local path. The plugin sees the one plugin-facing availability error, with the unchanged Chinese wording.
test("S-96 RAC-2735 a project catalog that cannot be read is answered as actions.unavailable, without a local path", async t => {
  const f = await started(t), project = await f.project("S-96 目录读失败");
  assert.deepEqual(await f.exist([project.project_id]), { [project.project_id]: true }, "the service answers while the catalog is readable");
  const restore = breakProjectCatalog(f.home);
  try {
    await assert.rejects(f.exist([project.project_id]), (error: unknown) => {
      assert.ok(error instanceof ActionError, "the plugin sees an ActionError, not the raw SQLite error");
      assert.equal(error.code, "actions.unavailable");
      assert.equal(error.message, "项目目录暂时读不到");
      assert.doesNotMatch(error.message, /catalog\.db|home-runtime-|\/(?:Users|private|var)\//u, "no local path reaches the plugin");
      return true;
    });
  } finally { restore(); }
});

// RAC-2736 (T-358): "a catalog that cannot be read says nothing" — the call rejects instead of answering any id as gone: the plugin never
// receives a boolean map (which would report ids as no longer existing), only the availability error.
test("S-96 RAC-2736 a failed catalog read reports no id as gone", async t => {
  const f = await started(t), kept = await f.project("S-96 kept");
  const restore = breakProjectCatalog(f.home);
  try {
    const outcome = await f.exist([kept.project_id, "no-such-project"]).then(answer => ({ answer }), error => ({ error }));
    assert.deepEqual(Object.keys(outcome), ["error"], "the failed read is not answered as booleans, so no id is reported gone");
    assert.ok(outcome.error instanceof ActionError && outcome.error.code === "actions.unavailable", "the one answer is the plugin-facing availability error");
  } finally { restore(); }
});

test("S-96 RAC-1064 a grant revoked while the Host is looking, and a plugin that is stopped, get no answer", async t => {
  let held = true;
  const revoking = createPluginProjectsClient(manifestWithout(true), { existing: async () => { held = false; return new Set(["kept"]); } },
    { assertActive() {}, requireGrant() { if (!held) throw new Error("grant revoked"); } });
  await assert.rejects(revoking.exist(["kept"]), /grant revoked/u, "the grant is checked again before the answer leaves");
  const f = await started(t), client = f.probe.client(), project = await f.project("S-96 stopped");
  assert.deepEqual(await client.exist([project.project_id]), { [project.project_id]: true });
  await f.platform.runtime.stop(f.install.install_id);
  const settled = (promise: Promise<unknown>) => Promise.race([promise.then(() => true, () => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 200))]);
  assert.equal(await settled(client.exist([project.project_id])), false, "a stopped plugin's call never answers");
});

test("S-96 RAC-1065 a sandboxed declaration can request the same project-existence service", () => {
  const manifest = manifestWithout(true);
  assert.doesNotThrow(() => assertSandboxDeclarations({ manifest }, [PLUGIN_PROJECTS_EXIST_PERMISSION]));
  assert.doesNotThrow(() => assertSandboxDeclarations({ manifest: manifestWithout(false) }, []));
});

test("S-96 RAC-1065-MANIFEST only the validated projects effect derives an optional permission and the exact package shape is retained", () => {
  const payload = projectsPackage([], "home").payload;
  assert.deepEqual(readSandboxPackage(payload).manifest.permissions.map(item => [item.permission, item.required]), [["storage:private", true], ["projects:exist", false]]);
  const mutations: Array<(manifest: PluginManifest, files: Record<string, string>) => void> = [
    manifest => { manifest.permissions = manifest.permissions.filter(item => item.permission !== PLUGIN_PROJECTS_EXIST_PERMISSION); },
    manifest => { manifest.permissions.find(item => item.permission === PLUGIN_PROJECTS_EXIST_PERMISSION)!.required = true; },
    manifest => { manifest.permissions.push({ permission: "network:any", required: false, reason: "arbitrary extra" }); },
    (_manifest, files) => { const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!); contract.operations.find((item: { id: string }) => item.id === "notes.list").effects = {}; files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract); },
    (_manifest, files) => { const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!); contract.operations.find((item: { id: string }) => item.id === "notes.list").effects.projects = ["list"]; files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract); },
  ];
  for (const mutate of mutations) {
    const manifest = structuredClone(payload.manifest), files = Object.fromEntries(payload.files.map(file => [file.path, Buffer.from(file.content_base64, "base64").toString("utf8")]));
    mutate(manifest, files);
    assert.throws(() => readSandboxPackage(payloadOf(manifest, files)), { code: "plugin.declaration_invalid" });
  }
});

test("S-96 RAC-1065-BROKER operation approval and the unchanged 200-id bound guard the shared client", async () => {
  let reads = 0;
  const projects = createPluginProjectsClient(manifestWithout(true), { existing: async () => { reads++; return new Set(["kept", "unasked"]); } }, gate);
  const identity = { projectId: "project", installationId: "sandbox-projects", pluginId: "io.molis.work.example.projectsunit", namespace: "installed" } as const;
  const operation = (approved: boolean): SandboxOperationContract => ({ id: "projects", kind: "query", input: { type: "null" }, output: { type: "null" },
    errors: [], effects: approved ? { projects: ["exist"] } : {}, examples: [] });
  const broker = new SandboxBroker(identity, { projects: ["exist"] }, { projects }, DEFAULT_SANDBOX_LIMITS);
  const unapproved = new SandboxBroker(identity, {}, { projects }, DEFAULT_SANDBOX_LIMITS);
  const signal = new AbortController().signal;
  try {
    await assert.rejects(broker.invoke(operation(false), signal, "projects.exist", [["kept"]]), { code: "sandbox.not_authorized" });
    await assert.rejects(unapproved.invoke(operation(true), signal, "projects.exist", [["kept"]]), { code: "sandbox.not_authorized" });
    await assert.rejects(broker.invoke(operation(true), signal, "projects.exist", [Array.from({ length: 201 }, (_, index) => `id-${index}`)]), { code: "sandbox.invalid_request" });
    assert.equal(reads, 0, "refused calls never reach the catalog port");
    assert.deepEqual(await broker.invoke(operation(true), signal, "projects.exist", [["kept", "unknown", "kept"]]), { kept: true, unknown: false });
    assert.equal(reads, 1);
  } finally {
    broker.stop(new SandboxError("sandbox.stopped", "done")); unapproved.stop(new SandboxError("sandbox.stopped", "done"));
  }
});

test("S-96 RAC-1065-SIGNED a real Home package queries projects only while its optional permission is approved", mac, async t => {
  const served = await serveHomeRuntime(t), kept = await served.project("sandbox projects kept"), gone = await served.project("sandbox projects gone");
  const removal = await served.request(`/api/settings/projects/${gone.project_id}/delete`, { method: "POST", body: { delete_confirmed: true, idempotency_key: "sandbox-projects-delete" } });
  assert.equal(removal.status, 200, await removal.clone().text());
  const ids = [kept.project_id, gone.project_id, "no-such-project"];
  const bundle = projectsPackage(ids, "home");
  const client = served.host.actionClient(kept.reference);
  const preview = await client.invoke(person(kept.project_id), ref(pluginInstallActions.preview), { bundle }) as { preview_id: string; runtime_scope: string };
  assert.equal(preview.runtime_scope, "home");
  await client.invoke(person(kept.project_id), ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Projects test publisher" });
  const install = served.host.homePlugins!.installation(PACKAGE_PLUGIN_ID); assert.ok(install);
  const caller = { ...person(null), permissions: [] }, home = served.host.homeActionClient();
  const views = await operationsOf(home, caller);
  const query = (input = {}) => operate(home, caller, views, "notes.list", input);
  assert.deepEqual(await query(), [{ id: "denied", text: "sandbox.host_service_error" }], "the real child receives the protocol's sanitized Host-service refusal for an unapproved Runtime grant");
  const permission = async (granted: boolean) => {
    const response = await served.request("/api/settings/plugin-permissions/set", { method: "POST", body: { install_id: install.install_id, permission: PLUGIN_PROJECTS_EXIST_PERMISSION, granted } });
    assert.equal(response.status, 200, await response.clone().text());
  };
  await permission(true);
  const answer = await query() as Array<{ id: string; text: string }>;
  assert.deepEqual(answer.map(row => row.id), ["answer"]);
  assert.deepEqual(JSON.parse(answer[0]!.text), { [kept.project_id]: true, [gone.project_id]: false, "no-such-project": false });
  assert.deepEqual(await query({ ids: Array.from({ length: 201 }, (_, index) => `id-${index}`) }), [{ id: "denied", text: "sandbox.invalid_request" }]);
  await permission(false);
  assert.deepEqual(await query(), [{ id: "denied", text: "sandbox.host_service_error" }], "revocation reaches the same real child service path without exposing a Host error");
});

for (const scope of ["home", "project"] as const) test(`S-96 RAC-1065-RESTORE-${scope} a disabled signed package's optional grant persists without starting it after a Host restart`, mac, async t => {
  const home = await openTestHome(t), project = await home.createProject("projects grant restart");
  const caller = person(project.project_id), client = home.host.actionClient(project.reference);
  const preview = await client.invoke(caller, ref(pluginInstallActions.preview), { bundle: projectsPackage([project.project_id, "unknown"], scope) }) as { preview_id: string };
  await client.invoke(caller, ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Projects restart test publisher" });
  const control = (host: MolisWorkLocalHost, action: "disable" | "enable") => scope === "home" ? host.homePlugins!.packageAction(PACKAGE_PLUGIN_ID, action)
    : host.actionClient(project.reference).invoke(caller, ref(pluginControlActions[action]), { plugin_id: PACKAGE_PLUGIN_ID });
  const list = async (host: MolisWorkLocalHost) => {
    const target = scope === "home" ? host.homeActionClient() : host.actionClient(project.reference);
    const result = await target.invoke(scope === "home" ? person(null) : caller, ref(scope === "home" ? pluginInstallActions.homeInstalled : pluginInstallActions.installed), {}) as
      { plugins: Array<{ install_id: string; plugin_id: string; state: string; permissions: Array<{ permission: string; granted: boolean }> }> };
    return result.plugins.find(item => item.plugin_id === PACKAGE_PLUGIN_ID)!;
  };
  await control(home.host, "disable");
  const before = await list(home.host); assert.equal(before.state, "disabled");
  await home.close(); await home.host.close();
  const restarted = new MolisWorkLocalHost({ homeDirectory: home.home, completeText: null });
  const served = await serveTestHost(null, { home: home.home, host: restarted });
  try {
    assert.equal((await list(restarted)).state, "disabled");
    const path = scope === "home" ? "/api/settings/plugin-permissions/set" : `/projects/${project.project_id}/api/plugin-trust/permissions/set`;
    await served.web.post(path, { install_id: before.install_id, permission: PLUGIN_PROJECTS_EXIST_PERMISSION, granted: true });
    const after = await list(restarted);
    assert.equal(after.install_id, before.install_id); assert.equal(after.state, "disabled", "changing a stopped installation's grants does not start it");
    assert.equal(after.permissions.find(item => item.permission === PLUGIN_PROJECTS_EXIST_PERMISSION)?.granted, true);
    await control(restarted, "enable");
    const target = scope === "home" ? restarted.homeActionClient() : restarted.actionClient(project.reference), who = scope === "home" ? person(null) : caller;
    const answer = await operate(target, who, await operationsOf(target, who), "notes.list", {}) as Array<{ id: string; text: string }>;
    assert.deepEqual(answer.map(row => row.id), ["answer"]);
    assert.deepEqual(JSON.parse(answer[0]!.text), { [project.project_id]: true, unknown: false }, "the current grant reaches the real sandbox child through its actual owner");
    await served.web.post(path, { install_id: before.install_id, permission: PLUGIN_PROJECTS_EXIST_PERMISSION, granted: false });
    assert.deepEqual(await operate(target, who, await operationsOf(target, who), "notes.list", {}),
      [{ id: "denied", text: "sandbox.host_service_error" }], "the child receives the existing sanitized refusal after Runtime revocation");
  } finally { await served.close(); await restarted.close(); }
});

test("S-96 RAC-1067 a project instance is given the service by the same rule, answered from the port the platform was given", async t => {
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
