// BL-701: a signed sandboxed package's switches for what its signed Manifest has no row for (sites, secrets, platform capabilities,
// background starts, an integration's source account). The Host projects them from the verified release, they start off, the person
// turns them on and off in Settings, and an operation that needs one that is off is refused before any of its code runs, whichever door
// it came through. The installation, its data and its signed package stay as they were.
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, actionReachesAudience } from "@molis-ai/molis-work-contracts/platform/actions";
import { SANDBOX_PACKAGE_FILES, type PluginDefinition, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { platformPermissionMeaning, type PluginInstalledView } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { sandboxOperationSwitches, sandboxProjectedPermissions, sandboxRequestedPermissions } from "@molis-ai/molis-work-plugin-sdk";
import { MemoryPluginRuntimeRepository, PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { newPublisher, signedPackage } from "./fixtures/sandbox-package.js";
import { fixture, mac, operate, operationsOf } from "./fixtures/home-sandbox.js";
import { serveTestHost } from "./fixtures/test-home.js";
import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";

const ID = "io.molis.work.example.switches";

/** The notes package, plus `probe`, which counts its own runs and then calls `capability`, answering what became of the call, and `runs`. */
const switchesPackage = (capability: string) => signedPackage(newPublisher(), (files, manifest) => {
  manifest.runtime = { scope: "home" };
  const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
  contract.operations.find(operation => operation.id === "notes.add")!.effects.storage = ["read", "write"];
  const none = { type: "object", properties: {}, required: [], additionalProperties: false } as const;
  contract.operations.push({ id: "probe", kind: "command", input: none, output: { type: "string" }, errors: [], effects: { storage: ["read", "write"], capabilities: [capability] }, examples: [{ input: {}, output: "x" }] },
    { id: "runs", kind: "query", input: none, output: { type: "number" }, errors: [], effects: { storage: ["read"] }, examples: [{ input: {}, output: 0 }] });
  contract.pages[0]!.regions[0]!.operationIds.push("probe", "runs");
  files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
  files[SANDBOX_PACKAGE_FILES.entrypoint] += `operations.runs = async (_input, sdk) => Number((await sdk.storage.get('runs')) ?? '0');
operations.probe = async (_input, sdk) => { await sdk.storage.set('runs', String(Number((await sdk.storage.get('runs')) ?? '0') + 1)); try { await sdk.capability.call(${JSON.stringify(capability)}, {}); return 'allowed'; } catch (error) { return error.code ?? String(error); } };\n`;
}, { pluginId: ID });

async function rig(t: TestContext) {
  const h = await fixture(t);
  await h.host.homePlugins!.ready();
  const caller = h.homeCaller();
  // A read of the Home's that a plugin may call and that needs no input.
  const read = (await h.homeClient().discover(caller)).find(view => view.action.kind === "query" && view.action.scope === "home" && actionReachesAudience(view.action, view.capability_id, "plugin")
    && view.availability.available !== false && !view.action.permissions.length && !(view.action.input_schema as { required?: string[] }).required?.length);
  assert.ok(read, "the Host offers a read of the Home's");
  let served = await serveTestHost(null, { home: h.home, host: h.host });
  t.after(() => served.close());
  const record = () => h.host.homePlugins!.installation(ID)!;
  const list = async () => (await served.web.post<{ plugins: PluginInstalledView[] }>("/api/settings/plugin-permissions/list", {})).plugins.find(plugin => plugin.plugin_id === ID)!.permissions;
  const set = (permission: string, granted: boolean) => served.web.post<{ changed: boolean }>("/api/settings/plugin-permissions/set", { install_id: record().install_id, permission, granted });
  const run = async (operation: string, input: unknown = {}) => operate(h.homeClient(), caller, await operationsOf(h.homeClient(), caller, ID), operation, input);
  await h.install(switchesPackage(read.capability_id));
  return { h, list, set, run, record, runs: () => run("runs") as Promise<number>,
    async reopen() { await served.close(); await h.reopen(); served = await serveTestHost(null, { home: h.home, host: h.host }); } };
}

const offSwitch = (error: unknown) => error instanceof ActionError && error.code === "actions.plugin_permission";

test("B27-PERM-01 BL-701 a projected switch is listed off, refuses the operation before its code runs, and turning it on and off in Settings keeps the installation and its data", mac, async t => {
  const r = await rig(t);
  const before = r.record();
  assert.deepEqual(before.grants, ["storage:private"], "a new switch starts off");
  const rows = await r.list(), row = rows.find(item => item.permission === "capabilities:call");
  assert.deepEqual(row && [row.required, row.requested, row.granted], [false, true, false]);
  assert.equal(row!.meaning, platformPermissionMeaning("capabilities:call"));
  assert.ok(!rows.some(item => item.permission === "network:request"), "only what this release asks for is projected");

  await assert.rejects(r.run("probe"), offSwitch);
  assert.equal(await r.runs(), 0, "none of its code ran");
  assert.equal(await r.run("notes.add", { text: "kept" }), true, "an operation that needs no switch still runs");

  assert.equal((await r.set("capabilities:call", true)).changed, true);
  assert.equal(await r.run("probe"), "allowed"); assert.equal(await r.runs(), 1);

  await r.set("capabilities:call", false);
  await assert.rejects(r.run("probe"), offSwitch);
  assert.equal(await r.runs(), 1, "switched off again: it does not run");
  const after = r.record();
  assert.deepEqual([after.install_id, after.manifest_digest, after.publisher_signature, after.version], [before.install_id, before.manifest_digest, before.publisher_signature, before.version]);
  assert.deepEqual(await r.run("notes.list", {}), [{ id: "1", text: "kept" }], "the plugin's data is kept");

  // Settings refuses a switch this release does not ask for.
  await assert.rejects(r.set("network:request", true), (error: { code?: string }) => error.code === "plugin.grant_denied");

  // A restart keeps it off; on again after the restart, it runs.
  await r.reopen();
  assert.equal(r.record().grants.includes("capabilities:call"), false);
  await assert.rejects(r.run("probe"), offSwitch);
  await r.set("capabilities:call", true);
  assert.equal(await r.run("probe"), "allowed"); assert.equal(await r.runs(), 2);
});

test("B27-PERM-02 BL-701 the plugin's own call route refuses the same operation before its code runs, with the action error body", mac, async t => {
  const r = await rig(t);
  const platform = await r.h.host.homePlugins!.ready();
  const call = () => platform.router().dispatch({ method: "POST", pathname: "/api/plugins/" + ID + "/call", actor_id: LOCAL_PERSON_ACTOR_ID,
    execution: { beforeEffect: async () => {} }, body: { operation: "probe", input: {} } });
  const refused = await call();
  assert.equal(refused?.status, 403);
  assert.equal((refused?.body as { code?: string }).code, "actions.forbidden");
  assert.match(String((refused?.body as { error?: string }).error), /capabilities:call/);
  assert.equal(await r.runs(), 0);
  await r.set("capabilities:call", true);
  assert.deepEqual((await call())?.body, { value: "allowed" });
});

/** A Home package with `fetch` (one site) and `signed` (the same site with a saved secret); each counts its runs before doing anything else. */
const sitesPackage = () => signedPackage(newPublisher(), (files, manifest) => {
  manifest.runtime = { scope: "home" };
  const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
  const none = { type: "object", properties: {}, required: [], additionalProperties: false } as const;
  for (const [id, effects] of [["fetch", { storage: ["read", "write"], networkDomains: ["api.example.test"] }], ["signed", { storage: ["read", "write"], networkDomains: ["api.example.test"], secretRefs: ["token"] }]] as const) {
    contract.operations.push({ id, kind: "command", input: none, output: { type: "number" }, errors: [], effects: structuredClone(effects) as never, examples: [{ input: {}, output: 1 }] });
  }
  contract.pages[0]!.regions[0]!.operationIds.push("fetch", "signed");
  files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
  files[SANDBOX_PACKAGE_FILES.entrypoint] += `const count = async (sdk, key) => { const next = Number((await sdk.storage.get(key)) ?? '0') + 1; await sdk.storage.set(key, String(next)); return next; };
operations.fetch = async (_input, sdk) => count(sdk, 'fetch');
operations.signed = async (_input, sdk) => count(sdk, 'signed');\n`;
}, { pluginId: ID });

test("B27-PERM-02 BL-701 with sites on and secrets off, the operation that sends a secret is refused before its code runs and the one that only reaches the site runs", mac, async t => {
  const h = await fixture(t);
  await h.host.homePlugins!.ready();
  await h.install(sitesPackage());
  const caller = h.homeCaller(), run = async (operation: string) => operate(h.homeClient(), caller, await operationsOf(h.homeClient(), caller, ID), operation, {});
  await assert.rejects(run("fetch"), offSwitch, "sites start off");
  await h.switchOn(ID, "network:request");
  assert.equal(await run("fetch"), 1);
  await assert.rejects(run("signed"), offSwitch, "a secret needs its own switch");
  await h.switchOn(ID, "secret:use");
  assert.equal(await run("signed"), 1, "the refused call never ran: this is its first run");
  const platform = await h.host.homePlugins!.ready();
  await platform.runtime.regrant(h.host.homePlugins!.installation(ID)!.install_id, "network:request", false);
  await assert.rejects(run("signed"), offSwitch, "the secret's switch alone does not reach the site");
  await assert.rejects(run("fetch"), offSwitch);
});

test("B27-PERM-03 BL-701 the SDK projects only what a signed Manifest has no row for, and an operation's switches include its background targets'", () => {
  const manifest = { permissions: [{ permission: "storage:private", required: true, reason: "x" }, { permission: "connections:use", required: false, reason: "x" }] } as Pick<PluginManifest, "permissions">;
  const effects = { networkDomains: ["api.example.test"], secretRefs: ["token"], capabilities: ["a.b"], background: ["job"], connections: ["slot"] };
  assert.deepEqual(sandboxProjectedPermissions(manifest, effects).map(row => [row.permission, row.required]),
    [["network:request", false], ["secret:use", false], ["capabilities:call", false], ["background:start", false]]);
  // An integration's Manifest has only its storage row, so its source account is one of its switches.
  assert.deepEqual(sandboxProjectedPermissions({ permissions: [manifest.permissions[0]!] }, { connections: ["source"] }).map(row => row.permission), ["connections:use"]);
  assert.deepEqual(sandboxOperationSwitches({ storage: ["read"] }), []);
  assert.deepEqual(sandboxOperationSwitches({ networkDomains: ["x.test"], background: ["job"] }), ["network:request", "background:start"]);
  assert.ok(sandboxRequestedPermissions(effects).includes("secret:use"), "a projected switch is requested, so Settings may turn it on");
  for (const permission of ["network:request", "secret:use", "capabilities:call", "background:start"]) {
    assert.ok(platformPermissionMeaning(permission) && !platformPermissionMeaning(permission)!.endsWith(permission.split(":")[1]!), permission + " has its own platform words, not a site or secret named after it");
  }
});

test("B27-PERM-04 BL-701 the Runtime counts projected rows in every grant ceiling and drops one an upgrade no longer asks for", async () => {
  const projected = new Map<string, string[]>([["1.0.0", ["network:request"]], ["1.1.0", []]]);
  const definitionOf = (version: string): PluginDefinition => ({ async start() { return { kind: "app", views: [] }; }, async stop() {}, manifest: {
    schema_version: 1, host_api_version: 1, plugin_id: "io.molis.work.example.ceiling", version, name: "Ceiling", kind: "app",
    publisher: { publisher_id: "fixture", signature: "agent-built:ceiling" }, entrypoints: [{ deployment: "local", entrypoint: "./plugin.mjs" }],
    ...(version === "1.0.0" ? {} : { upgrade_compatibility: { compatible_from_versions: ["1.0.0"] } }),
    permissions: [{ permission: "storage:private", required: true, reason: "x" }], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [] } });
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { hostIds: ISOLATED_HOST_IDS,
    permissionDeclarations: definition => projected.get(definition.manifest.version)!.map(permission => ({ permission, required: false, reason: "projected" })) });
  const { install } = runtime.install({ definition: definitionOf("1.0.0"), deployment: "local", trust: { level: "unsigned" }, grants: ["storage:private"] });
  await runtime.regrant(install.install_id, "network:request", true);
  assert.deepEqual(runtime.get(install.install_id)!.grants, ["network:request", "storage:private"]);
  assert.throws(() => runtime.grant(install.install_id, ["storage:private", "secret:use"]), { code: "plugin.grant_denied" }, "a row nobody projected is past the ceiling");
  await runtime.upgrade({ install_id: install.install_id, definition: definitionOf("1.1.0") });
  assert.deepEqual(runtime.get(install.install_id)!.grants, ["storage:private"], "the upgrade drops the switch its release no longer asks for, instead of refusing");
});
