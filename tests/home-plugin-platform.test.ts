import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { captureHostLog, MolisWorkLocalHost, type HostLogEntry } from "@molis-ai/molis-work-app-local-host";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { issuesActions, ISSUES_PLUGIN_ID } from "@molis-ai/molis-work-plugin-issues";
import { type ActionDefinition, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import { AgentHost, registerAgentHostCapabilities } from "@molis-ai/molis-work-service-agent-host";
import { CapabilityRegistry } from "@molis-ai/molis-work-kernel";
import { deferred, grantHomeProbe, homeProbe, person, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { withLibrary } from "./fixtures/home-library.js";
import { PENDING, within } from "./fixtures/stopped-calls.js";

test("W3-06-F-01 W3-06-F-02 concurrent discovery, scenes and HTTP share the Home registration and genuine project scopes", { timeout: 60_000 }, async t => {
  const probe = homeProbe(), { host, origin, request, project } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  const caller = person([...probe.permissions, ...issuesActions.read.action.permissions]);
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
  const read = await request(`/api/plugins/${probe.id}/state?project_id=forged`, { headers: { referer: `${origin}/` } });
  assert.equal(read.status, 200, await read.clone().text());
  assert.deepEqual(await read.json(), { value: "one Home", project_id: null }, "a query does not manufacture project authority");
  assert.deepEqual(probe.seen.at(-1)?.page_context, { url: "/", title: null, provenance: "client_reported" });
  const scoped = await request(`/api/plugins/${probe.id}/project?project_id=${one.project_id}`);
  assert.equal(scoped.status, 400); assert.equal((await scoped.json()).code, "actions.project_required");
  // Under a project's path a Home route runs in that project only when the project shows the plugin (S-31); a fixture has no place in
  // any project's plugin list, so its routes there are refused, and the probe stays the person's own.
  for (const prefix of [`/projects/${one.project_id}`, `/projects/${two.project_id}`]) {
    const refused = await request(`${prefix}/api/plugins/${probe.id}/state?project_id=forged`, { headers: { referer: `${origin}${prefix}` } });
    assert.equal(refused.status, 403, await refused.clone().text());
    assert.equal((await refused.json()).code, "actions.plugin_disabled");
  }
});

test("W3-06-F-02 Home consumes Host actions with its real identity and no project; project and Agent entries refuse that caller", async t => {
  const probe = homeProbe("homeidentity");
  const homeAction: ActionDefinition<Record<string, never>, { plugin_id: string; install_id: string; actor_id: string; project_id: string | null }> = {
    capability_id: "fixture.host.identity", version: 1, operation: "query", action: { title: "Host identity", description: "Reads the Host-bound caller",
      kind: "query", scope: "home", audiences: ["plugin"], permissions: [probe.permissions[1]!], subject_kinds: [], input_schema: { type: "object", additionalProperties: false } },
  };
  const projectAction = { ...homeAction, capability_id: "fixture.host.project", action: { ...homeAction.action, scope: "project" as const } };
  probe.definition.manifest = { ...probe.definition.manifest, capabilities: { provides: [], consumes: [homeAction.capability_id, projectAction.capability_id] } };
  const { host, project } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  let captured: HostPluginCaller | undefined, projectCalls = 0;
  const unregister = host.actionRegistry().registerProvider({ provider: { provider_id: "platform", title: "Molis Work", kind: "system" },
    definitions: [homeAction, projectAction], handlers: [
      { ...homeAction, handle(context) {
        captured = context.host_plugin; assert.ok(captured);
        return { plugin_id: captured.plugin_id, install_id: captured.install_id, actor_id: captured.actor_id, project_id: captured.project_id };
      } },
      { ...projectAction, handle() { projectCalls++; throw new Error("a Home caller cannot enter a project handler"); } },
    ] });
  try {
    const { install } = await grantHomeProbe(host, probe);
    const actions = probe.contexts.at(-1)!.services!.actions!;
    assert.deepEqual(await actions.invoke(homeAction, {}), { plugin_id: probe.id, install_id: install.install_id, actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null });
    await assert.rejects(actions.invoke(projectAction, {}), { code: "actions.project_required" });
    assert.equal(projectCalls, 0);
    const one = await project("Agent needs a genuine project caller");
    const caller = captured; assert.ok(caller);
    const registry = new CapabilityRegistry<{ project_id: string }>(), agent = new AgentHost();
    let effects = 0;
    const dispose = registerAgentHostCapabilities<{ project_id: string }>({ register: (definition, handler) => registry.register(definition, (context, input) => handler(context, input,
      { consumer: "plugin", plugin: caller, beforeEffect: async () => { effects++; }, assertAuthorityCurrent: () => {} })) },
      { agentHost: () => agent, projectId: context => context.project_id, authority: () => { throw new Error("a Home caller cannot receive Agent project authority"); } });
    try {
      await assert.rejects(registry.invoke({ project_id: one.project_id }, agentHostCapabilities.listRuntimes, []), { code: "agent.session_unknown" });
      assert.equal(effects, 0, "the Agent rejects Home scope before its effect barrier or Runtime dispatch");
      // The Home session's own caller names no project: presented in a project, the gateway refuses it as an issued caller that does not match its call.
      await assert.rejects(host.actionClient(one.reference).invoke({ actor_id: caller.actor_id, actor_kind: "user", project_id: one.project_id, audience: "plugin", permissions: [],
        plugin_install_id: caller.install_id, host_plugin: caller }, agentHostCapabilities.listRuntimes, []), { code: "host.plugin_caller_mismatch" });
    } finally { dispose(); }
  } finally { unregister(); }
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
  for (const scene of probe.scenes) Object.assign(scene, { result_type: "molis.behavior-recommendation.v1",
    result_schema: { type: "object", properties: { suggested_behavior_ids: { type: "array", items: { type: "string", enum: ["keep"] } } }, additionalProperties: false } });
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
  const entries: HostLogEntry[] = [];
  t.after(captureHostLog(entries));
  const probe = homeProbe("dbprobe");
  const declaration: PluginDatabaseDeclaration = { store_name: "dbprobe-notes", version: 1, schema: "CREATE TABLE notes (text TEXT NOT NULL);",
    read_permission: "dbprobe:read", write_permission: "dbprobe:write" };
  const { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [{ definition: withLibrary(probe.definition, declaration) }] } });
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
  // BL-411: the upgrade stopped the activation that was given this library: outside every call its write is refused and never answers.
  assert.equal(await within(currentDatabase.transaction(async () => {}, tx => tx.run("INSERT INTO notes VALUES ('old')"))), PENDING);
  assert.deepEqual(entries.filter(entry => entry.event === "stopped_service_call").map(entry => [entry.fields?.service, entry.fields?.method]), [["database", "transaction"]], "the Host noted the refused write");
});

test("W3-06-F-02 a fixture cannot take the Host's Issue library or declare an invalid or duplicate Home store", async () => {
  // W4-11: a fixture is given a library under a free name (registered as its own); a name the Home registered to another
  // owner stays theirs. A shipped plugin's unregistered library is refused in plugin-project-database.test.ts.
  for (const [store, message] of [["issues", /登记的主人是 io\.molis\.work\.issues，/u], ["plugin-runtime", /登记的主人是 apps\/local-host，/u],
    ["dataset", /登记的主人是 io\.molis\.work\.dataset，/u], ["feed", /归 packages\/storage，不是库/u], ["../dataset", /一个目录名/u]] as const) {
    const home = mkdtempSync(join(tmpdir(), "home-store-owner-")), probe = homeProbe();
    const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { home: [{ definition: withLibrary(probe.definition,
      { store_name: store, version: 1, schema: "CREATE TABLE notes(text TEXT);", read_permission: "homeprobe:read", write_permission: "homeprobe:write" }) }] } });
    try { await assert.rejects(host.homePlugins!.ready(), message); assert.equal(probe.contexts.length, 0); }
    finally { await host.close(); rmSync(home, { recursive: true, force: true }); }
  }
  const home = mkdtempSync(join(tmpdir(), "home-duplicate-store-")), one = homeProbe("one-store"), two = homeProbe("two-store");
  const entry = (probe: ReturnType<typeof homeProbe>) => ({ definition: withLibrary(probe.definition,
    { store_name: "shared-notes", version: 1, schema: "CREATE TABLE notes(text TEXT);", read_permission: `${probe.definition.manifest.name}:read`, write_permission: `${probe.definition.manifest.name}:write` }) });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { home: [entry(one), entry(two)] } });
  try {
    // The first fixture is given the free name; the second cannot take a library registered as another's.
    await assert.rejects(host.homePlugins!.ready(), new RegExp(`库 shared-notes 登记的主人是 ${one.id.replaceAll(".", "\\.")}，插件 ${two.id.replaceAll(".", "\\.")} 不能用`, "u"));
    assert.equal(one.contexts.length + two.contexts.length, 0);
    assert.equal(existsSync(join(home, "shared-notes")), false);
  } finally { await host.close(); rmSync(home, { recursive: true, force: true }); }
});

test("W3-06-F-07 shared Home operations preserve POST protection, revision and the original upload limit", { timeout: 60_000 }, async t => {
  const entries: HostLogEntry[] = [];
  t.after(captureHostLog(entries));
  const probe = homeProbe(), { host, request, project } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  const { platform, install } = await grantHomeProbe(host, probe);
  const route = (operation: string) => `/api/plugins/${probe.id}/${operation}`;
  for (const operation of ["restart", "release-quarantine", "upgrade", "disable", "enable", "retry"]) {
    assert.equal((await request(route(operation))).status, 405, operation);
    assert.equal((await request(route(operation), { method: "POST", body: {}, authorized: false })).status, 403, operation);
  }
  assert.equal(host.homePlugins!.installation(probe.id)!.installation_generation, install.installation_generation);
  assert.equal((await request(route("not-declared"))).status, 404);
  // An unregistered global URL retains the catalog's project-required response; a real project's unknown route is 404.
  const notInstalled = await request("/api/plugins/io.molis.work.not-installed/restart", { method: "POST", body: {} });
  assert.deepEqual([notInstalled.status, await notInstalled.json()], [400, { error: "请先选择一个 Molis Work 项目" }]);
  const one = await project("Home operations coexist with project routes");
  assert.equal((await request(`/projects/${one.project_id}/api/plugins/io.molis.work.not-installed/restart`, { method: "POST", body: {} })).status, 404);
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
  // W3-06-F-06/W3-06-F-07: a known Home entry cannot fall through to a project instance or reinstall itself after uninstall.
  const old = probe.contexts.at(-1)!;
  await platform.runtime.stop(install.install_id);
  await platform.runtime.uninstall(install.install_id, { retain_private_data: true });
  const facts = platform.runtime.list();
  assert.equal(platform.runtime.get(install.install_id).state, "uninstalled");
  for (const prefix of ["", `/projects/${one.project_id}`]) for (const operation of ["state", "restart", "retry", "enable"]) {
    const refused = await request(`${prefix}${route(operation)}`, operation === "state" ? {} : { method: "POST", body: {} });
    assert.deepEqual([refused.status, (await refused.json()).code], [404, "actions.missing"]);
  }
  // BL-411: outside every call the uninstalled activation's handles are refused and throw nothing: the write gives undefined, the call never answers.
  assert.equal(old.services!.storage!.set("note", "after uninstall"), undefined);
  assert.equal(await within(old.services!.actions!.invoke(probe.save, { text: "after uninstall" })), PENDING);
  assert.deepEqual(entries.filter(entry => entry.event === "stopped_service_call").map(entry => [entry.fields?.service, entry.fields?.method]), [["storage", "set"], ["actions", "invoke"]], "the Host noted both refusals");
  assert.deepEqual(platform.runtime.list(), facts, "lookup and rejected control requests preserve grants, generation, state and install facts");
});
