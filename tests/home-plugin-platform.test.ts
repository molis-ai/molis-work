import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { issuesActions, ISSUES_PLUGIN_ID } from "@molis-ai/molis-work-plugin-issues";
import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { deferred, grantHomeProbe, homeProbe, person, serveHomeRuntime } from "./fixtures/home-runtime.js";

test("W3-06-F-01 W3-06-F-02 concurrent discovery, scenes and HTTP share the Home registration and genuine project scopes", { timeout: 60_000 }, async t => {
  const probe = homeProbe(), { host, origin, request, project } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  const caller = person(probe.permissions);
  await Promise.all([host.homeActionClient().discover(caller), host.sceneClient().discoverScenes(caller), request(`/api/plugins/${probe.id}/state`)]);
  assert.equal(probe.contexts.length, 1, "all entrypoints share one start");
  const initially = host.homePlugins!.installation(probe.id)!;
  assert.deepEqual(initially.grants, ["storage:private"], "a non-bundled fixture holds only required grants");
  assert.notEqual(initially.install_id, probe.id);
  assert.equal((await request(`/api/plugins/${probe.id}/state`)).status, 403);
  const { install } = await grantHomeProbe(host, probe);
  const starts = probe.contexts.length;
  const [one, two] = await Promise.all([project("First"), project("Second")]);
  const directory = await host.homeActionClient().discover(caller);
  const offered = directory.find(action => action.capability_id === probe.state.capability_id)!;
  assert.equal(offered.provider.provider_id, install.install_id);
  assert.equal(offered.provider.plugin_install_id, install.install_id);
  assert.equal(offered.provider.project_id, undefined);
  assert.equal(directory.find(action => action.capability_id === issuesActions.read.capability_id)!.provider.provider_id, ISSUES_PLUGIN_ID);
  await assert.rejects(host.homeActionClient().invoke(person([]), probe.state, {}), { code: "actions.forbidden" });
  await assert.rejects(host.homeActionClient().invoke(caller, probe.project, {}), { code: "actions.project_required" });
  assert.equal(await host.actionClient(one.reference).invoke(person(probe.permissions, one.project_id), probe.project, {}), one.project_id);
  assert.equal(await host.actionClient(two.reference).invoke(person(probe.permissions, two.project_id), probe.project, {}), two.project_id);
  assert.equal(probe.contexts.length, starts, "opening projects does not start another Home instance");
  assert.equal(probe.contexts.at(-1)!.project_id, undefined);
  const scenes = await host.sceneClient().discoverScenes(caller);
  assert.equal(scenes.find(view => view.definition.scope === "home" && view.provider.plugin_id === probe.id)!.availability.available, true);
  const inProject = await host.sceneClient(one.reference).discoverScenes(person(probe.permissions, one.project_id));
  assert.equal(inProject.find(view => view.definition.scope === "project" && view.provider.plugin_id === probe.id)!.availability.available, true);
  const saved = await request(`/api/plugins/${probe.id}/save`, { method: "POST", body: { text: "one Home" } });
  assert.equal(saved.status, 200, await saved.clone().text());
  for (const prefix of ["", `/projects/${one.project_id}`, `/projects/${two.project_id}`]) {
    const read = await request(`${prefix}/api/plugins/${probe.id}/state?project_id=forged`, { headers: { referer: `${origin}${prefix || "/"}` } });
    assert.equal(read.status, 200, await read.clone().text());
    assert.deepEqual(await read.json(), { value: "one Home", project_id: null }, "the HTTP prefix does not manufacture project authority");
    assert.deepEqual(probe.seen.at(-1)?.page_context, { url: prefix || "/", title: null, provenance: "client_reported" });
    const scoped = await request(`${prefix}/api/plugins/${probe.id}/project?project_id=${one.project_id}`);
    assert.equal(scoped.status, 400); assert.equal((await scoped.json()).code, "actions.project_required");
  }
});

test("W3-06-F-01 Home/project overlap, sandbox and impersonated bundled identities are rejected before a Home library starts", async () => {
  const home = mkdtempSync(join(tmpdir(), "home-scope-rejection-")), probe = homeProbe();
  try {
    assert.throws(() => new MolisWorkLocalHost({ homeDirectory: home, pluginFixtures: { home: [probe.definition], project: [probe.definition] } }), /不能同时在 Home 与项目/u);
    const builtin = BUILTIN_PLUGIN_CATALOG.find(entry => entry.runtime?.scope === "home")!;
    const imposter = { ...probe.definition, manifest: { ...probe.definition.manifest, plugin_id: builtin.manifest.plugin_id } };
    assert.throws(() => new MolisWorkLocalHost({ homeDirectory: home, pluginFixtures: { home: [imposter] } }), /不能冒充内置/u);
    assert.throws(() => new MolisWorkLocalHost({ pluginFixtures: { home: [probe.definition] } }), /明确的 Home/u);
    const boxed = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { home: [{ ...probe.definition, execution: "sandbox" }] } });
    try { await assert.rejects(boxed.homePlugins!.ready(), /沙箱/u); assert.equal(probe.contexts.length, 0); }
    finally { await boxed.close(); }
    assert.equal(existsSync(join(home, "plugin-runtime", "plugin-runtime.db")), false);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("W3-06-F-02 local web discovers a scene-only Home installation by actual scope and current grants", { timeout: 60_000 }, async t => {
  const probe = homeProbe("home-scene"), original = probe.definition.start;
  probe.definition.manifest = { ...probe.definition.manifest, actions: [], routes: [] };
  probe.definition.start = async context => { const contribution = await original(context); return { kind: "app", action_scenes: contribution.kind === "app" ? contribution.action_scenes : [] }; };
  const { host, request, project } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  const { platform, install } = await grantHomeProbe(host, probe);
  const one = await project("Home scene scope");
  const catalog = async (prefix = "") => {
    const reply = await request(`${prefix}/api/functions/catalog`);
    assert.equal(reply.status, 200, await reply.clone().text());
    return (await reply.json()).catalog.destinations as Array<{ destination_id: string; provider_id?: string; availability?: { available: boolean } }>;
  };
  const home = await catalog(), projectScoped = await catalog(`/projects/${one.project_id}`);
  assert.ok(home.some(row => row.destination_id === probe.scenes[0]!.scene_id && row.provider_id === install.install_id && row.availability?.available !== false));
  assert.ok(!home.some(row => row.destination_id === probe.scenes[1]!.scene_id && row.availability?.available !== false));
  assert.ok(projectScoped.some(row => row.destination_id === probe.scenes[1]!.scene_id && row.provider_id === install.install_id && row.availability?.available !== false));
  await platform.runtime.stop(install.install_id); platform.runtime.grant(install.install_id, ["storage:private"]);
  await platform.supervisor.restart(probe.id);
  assert.ok(!(await catalog()).some(row => probe.scenes.some(scene => scene.scene_id === row.destination_id)), "no scene can borrow a previous installation grant");
});

test("W3-06-F-02 a Home database comes from the trusted definition entry, never an identity, path or another owner's library", async t => {
  const probe = homeProbe("dbprobe");
  const declaration: PluginDatabaseDeclaration = { store_name: "dataset", version: 1, schema: "CREATE TABLE notes (text TEXT NOT NULL);",
    read_permission: "dbprobe:read", write_permission: "dbprobe:write" };
  const { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [{ definition: probe.definition, database: declaration }] } });
  const platform = await host.homePlugins!.ready();
  const record = host.homePlugins!.installation(probe.id)!;
  assert.equal(record.state, "running");
  assert.throws(() => probe.contexts.at(-1)!.services!.database!.get("SELECT text FROM notes"), { code: "actions.forbidden" });
  assert.equal(probe.contexts.at(-1)!.services!.storage!.get("note"), null);
  await grantHomeProbe(host, probe);
  const database = probe.contexts.at(-1)!.services!.database!;
  await database.transaction(async () => {}, tx => tx.run("INSERT INTO notes VALUES (?)", ["kept"]));
  assert.equal(database.get("SELECT text FROM notes")!.text, "kept");
  const entered = deferred(), release = deferred();
  probe.behavior.stop = async context => {
    // W3-06-F-06: the actual stop hook cannot submit a database write, before the writer connection is closed.
    await assert.rejects(context.services!.database!.transaction(async () => {}, tx => tx.run("INSERT INTO notes VALUES ('stop')")), { code: "actions.forbidden" });
    entered.resolve(); await release.promise;
  };
  const stopping = platform.runtime.stop(record.install_id);
  try {
    await Promise.race([entered.promise, stopping]);
    await assert.rejects(database.transaction(async () => {}, tx => tx.run("INSERT INTO notes VALUES ('late')")), { code: "actions.forbidden" });
  } finally { release.resolve(); }
  await stopping;
  await platform.supervisor.restart(probe.id);
  const currentDatabase = probe.contexts.at(-1)!.services!.database!;
  assert.deepEqual(currentDatabase.all("SELECT text FROM notes").map(row => row.text), ["kept"]);
  const lookalike = homeProbe("dbprobe", "1.1.0");
  await platform.runtime.upgrade({ install_id: record.install_id, definition: lookalike.definition, grants: probe.permissions });
  assert.equal(lookalike.contexts.at(-1)!.services!.database, undefined, "the new object cannot inherit the old entry's library");
  await assert.rejects(currentDatabase.transaction(async () => {}, tx => tx.run("INSERT INTO notes VALUES ('old')")), { code: "actions.plugin_unavailable" });
});

test("W3-06-F-02 a fixture cannot take the Host's Issue library or declare an invalid or duplicate Home store", async () => {
  for (const [store, message] of [["issues", /宿主自己的库/u], ["plugin-runtime", /宿主自己的库/u], ["../dataset", /一个目录名/u], ["unregistered", /清除清单/u]] as const) {
    const home = mkdtempSync(join(tmpdir(), "home-store-owner-")), probe = homeProbe();
    const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { home: [{ definition: probe.definition,
      database: { store_name: store, version: 1, schema: "CREATE TABLE notes(text TEXT);", read_permission: "homeprobe:read", write_permission: "homeprobe:write" } }] } });
    try { await assert.rejects(host.homePlugins!.ready(), message); assert.equal(probe.contexts.length, 0); }
    finally { await host.close(); rmSync(home, { recursive: true, force: true }); }
  }
  const home = mkdtempSync(join(tmpdir(), "home-duplicate-store-")), one = homeProbe("one-store"), two = homeProbe("two-store");
  const entry = (probe: ReturnType<typeof homeProbe>) => ({ definition: probe.definition,
    database: { store_name: "dataset", version: 1, schema: "CREATE TABLE notes(text TEXT);", read_permission: `${probe.definition.manifest.name}:read`, write_permission: `${probe.definition.manifest.name}:write` } });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { home: [entry(one), entry(two)] } });
  try {
    await assert.rejects(host.homePlugins!.ready(), /库归属重复/u);
    assert.equal(one.contexts.length + two.contexts.length, 0);
    assert.equal(existsSync(join(home, "dataset", "dataset.db")), false);
  } finally { await host.close(); rmSync(home, { recursive: true, force: true }); }
});

test("W3-06-F-07 shared Home operations preserve POST protection, revision and the original upload limit", { timeout: 60_000 }, async t => {
  const probe = homeProbe(), { host, request } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  const { install } = await grantHomeProbe(host, probe);
  const route = (operation: string) => `/api/plugins/${probe.id}/${operation}`;
  for (const operation of ["restart", "release-quarantine", "upgrade", "disable", "enable", "retry"]) {
    assert.equal((await request(route(operation))).status, 405, operation);
    assert.equal((await request(route(operation), { method: "POST", body: {}, authorized: false })).status, 403, operation);
  }
  assert.equal(host.homePlugins!.installation(probe.id)!.installation_generation, install.installation_generation);
  assert.equal((await request(route("not-declared"))).status, 404);
  assert.equal((await request("/api/plugins/io.molis.work.not-installed/restart", { method: "POST", body: {} })).status, 404);
  const first = await request(route("view-revision")); assert.equal(first.headers.get("cache-control"), "no-store");
  const revision = (await first.json()).revision;
  assert.equal((await (await request(route("view-revision"))).json()).revision, revision);
  const big = await request(route("save"), { method: "POST", body: { text: "x".repeat(1_100_000) } });
  assert.equal(big.status, 200, await big.clone().text());
  assert.notEqual((await (await request(route("view-revision"))).json()).revision, revision);
  const oversized = await request(route("save"), { method: "POST", body: { text: "x".repeat(12 * 1024 * 1024) } });
  assert.equal(oversized.status, 413);
  assert.equal(probe.contexts.at(-1)!.services!.storage!.get("note")!.length, 1_100_000, "the refusal writes nothing");
  assert.equal((await request(route("disable"), { method: "POST", body: {} })).status, 200);
  assert.equal((await request(route("state"))).status, 503);
  const restarted = await request(route("enable"), { method: "POST", body: {} });
  assert.equal(restarted.status, 200, await restarted.clone().text());
});
