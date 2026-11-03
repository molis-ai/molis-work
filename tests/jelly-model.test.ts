import test from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import fs, { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { syncBuiltinESMExports } from "node:module";
import { LocalSqliteStorage, LocalCatalogMetadata, createFileSecretStore, runWithMolisWorkHome, resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { HOST_BUILD_TRUST } from "@molis-ai/molis-work-plugin-runtime";
import { ModelProviderStore, createModelProviderTables, hostCompleteText } from "@molis-ai/molis-work-app-local-host";
import { CATALOG_OWNER, CATALOG_SCHEMA_VERSION } from "../apps/local-host/dist/project-catalog-contract.js";
import { createConsumerModelConfiguration } from "../apps/local-host/dist/model-configuration.js";
import { JELLY_MODEL_CONFIGURATION, type JellyModelSettings } from "@molis-ai/molis-work-plugin-jelly";
const configuration = (home: string) => createConsumerModelConfiguration(home, JELLY_MODEL_CONFIGURATION);
const completion = (home: string) => hostCompleteText({ homeDirectory: home, selection: configuration(home).selection() });
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { bindPrologueInference } from "../apps/local-host/dist/prologue-inference-host.js";

type InferenceRequest = { protocol: string; endpoint: string; model: string; credential_ref: string; resolveCredential(ref: string): unknown };
/** Model calls go through the Home's Prologue inference; stand in at that seam and report what reached it. */
function inferenceAt(t: test.TestContext, home: string, reply: string) {
  const seen: Array<{ protocol: string; endpoint: string; model: string; key: unknown }> = [];
  const release = bindPrologueInference(home, { completeTextResult: async (input: InferenceRequest) => {
    seen.push({ protocol: input.protocol, endpoint: input.endpoint, model: input.model, key: await input.resolveCredential(input.credential_ref) });
    return { value: reply, configuredModel: input.model, reportedModels: [], usage: [], state: "completed", run_ref: { kind: "run", id: "fixture", revision: 1 } };
  } } as never);
  t.after(release);
  return seen;
}

function modelConnection(home: string, name: string, token: string, address?: string) {
  return withConnectorConnections(home, store => {
    const connection = store.createToken({ serviceId: "model-api", displayName: name, token });
    if (address) store.assertTarget(connection.connection_id, "model-api", address);
    return connection;
  });
}

const modelEnvironments = new WeakMap<test.TestContext, NodeJS.ProcessEnv>();
function homeFor(t: test.TestContext, catalog = true): string {
  const home = mkdtempSync(join(tmpdir(), "jelly-model-"));
  const prior = modelEnvironments.get(t) ?? { ...process.env }; modelEnvironments.set(t, prior); process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  for (const key of ["MOLIS_WORK_TEXT_API_KEY", "MOLIS_WORK_TEXT_BASE_URL", "MOLIS_WORK_TEXT_MODEL", "MOLIS_WORK_TEXT_API_FORMAT", "MINIMAX_API_KEY"]) delete process.env[key];
  t.after(() => { process.env = prior; resetSecretStoreCache(); rmSync(home, { recursive: true, force: true }); });
  if (catalog) { mkdirSync(join(home, "projects")); const db = new LocalSqliteStorage(join(home, "projects", "catalog.db")); const metadata = new LocalCatalogMetadata(db.db); metadata.create(); metadata.initialize(CATALOG_OWNER, CATALOG_SCHEMA_VERSION); createModelProviderTables(db.db); db.close(); }
  return home;
}
function providerStore(home: string, action: (store: ModelProviderStore, storage: LocalSqliteStorage) => void): void {
  const storage = new LocalSqliteStorage(join(home, "projects", "catalog.db"));
  try { const secrets = runWithMolisWorkHome(home, () => createFileSecretStore()); action(new ModelProviderStore({ db: storage.db, secrets }), storage); } finally { storage.close(); }
}

test("Jelly empty model settings do not create a catalog, preferences, secret files or send a request", t => {
  const home = homeFor(t, false); let requests = 0; t.mock.method(globalThis, "fetch", async () => { requests++; throw new Error("unexpected network"); });
  assert.deepEqual(configuration(home).read(), { configured: false, providers: [], connections: [], source: "none" }); assert.equal(completion(home), undefined); assert.equal(requests, 0);
  assert.equal(existsSync(join(home, "projects")), false); assert.equal(existsSync(join(home, "jelly")), false); assert.equal(existsSync(join(home, "feed")), false);
  assert.throws(() => configuration(home).save({ base_url: "https://example.com/v1", model_id: "model" }), /尚未初始化/); assert.equal(existsSync(join(home, "projects")), false);
});

test("W1-18-MODEL-SCHEMA-01 standalone model consumers refuse old, future and invalid catalogs without changing them", t => {
  const home = homeFor(t), file = join(home, "projects", "catalog.db");
  for (const version of [CATALOG_SCHEMA_VERSION - 1, CATALOG_SCHEMA_VERSION + 1, NaN]) {
    const storage = new LocalSqliteStorage(file);
    try { new LocalCatalogMetadata(storage.db).setVersion(version); } finally { storage.close(); }
    const before = readFileSync(file);
    assert.throws(() => completion(home), /schema|版本/i);
    assert.throws(() => configuration(home).read(), /schema|版本/i);
    assert.deepEqual(readFileSync(file), before, "a rejected read does not repair or rewrite the catalog");
    assert.equal(existsSync(join(home, "jelly")), false, "no preference or material store is created");
    const after = new LocalSqliteStorage(file);
    try { assert.ok(Object.is(new LocalCatalogMetadata(after.db).version(), version)); } finally { after.close(); }
  }
  const current = new LocalSqliteStorage(file);
  try { new LocalCatalogMetadata(current.db).setVersion(CATALOG_SCHEMA_VERSION); } finally { current.close(); }
  const before = readFileSync(file);
  assert.equal(completion(home), undefined);
  assert.deepEqual(configuration(home).read(), { configured: false, providers: [], connections: [], source: "none" });
  assert.deepEqual(readFileSync(file), before, "the current empty catalog can be read without mutation");
});

test("Jelly custom model selects a Connector credential and keeps preferences free of secrets", t => {
  const home = homeFor(t); let requests = 0; t.mock.method(globalThis, "fetch", async () => { requests++; throw new Error("unexpected network"); });
  const connection = modelConnection(home, "Jelly 账号", "jelly-test-plaintext-key");
  const settings = configuration(home).save({ base_url: "https://models.example.com/v1", api_format: "openai-chat-completions", model_id: "text-a", connection_id: connection.connection_id });
  assert.equal(settings.configured, true); assert.equal(settings.source, "selection"); assert.deepEqual(settings.selection, { provider_id: "jelly-text", model_id: "text-a" }); assert.equal(settings.providers[0]!.has_credential, true); assert.equal(requests, 0);
  assert.equal(settings.custom_connection_id, connection.connection_id);
  const prefs = readFileSync(join(home, "jelly", "preferences.json"), "utf8"); assert.equal(prefs.includes("jelly-test-plaintext-key"), false); assert.deepEqual(JSON.parse(prefs), { schema_version: 1, provider_id: "jelly-text", model_id: "text-a" }); assert.equal(JSON.stringify(settings).includes("jelly-test-plaintext-key"), false);
  providerStore(home, (store, storage) => { assert.equal(store.get("jelly-text")?.base_url, "https://models.example.com/v1"); assert.equal(store.get("jelly-text")?.credential_ref, connection.credential_ref); assert.equal(JSON.stringify(storage.db.prepare("SELECT * FROM model_providers").all()).includes("jelly-test-plaintext-key"), false); });
  const secrets = runWithMolisWorkHome(home, () => createFileSecretStore()); assert.equal(secrets.get(connection.credential_ref!), "jelly-test-plaintext-key");
  configuration(home).save({ provider_id: "jelly-text", model_id: "text-b" });
  assert.equal(configuration(home).read().custom_connection_id, connection.connection_id);
  assert.equal(secrets.get(connection.credential_ref!), "jelly-test-plaintext-key");
});

test("Jelly existing-provider selection changes no shared record or key, and scoped home credentials remain isolated", async t => {
  const home = homeFor(t); const shared = modelConnection(home, "已有供应商", "shared-test-key", "https://shared.example.com/v1");
  providerStore(home, store => { store.upsert({ credential_ref: shared.credential_ref!, provider_id: "shared", display_name: "已有供应商", base_url: "https://shared.example.com/v1", api_format: "openai-chat-completions", models: [{ model_id: "existing-model", enabled: true }] }); });
  assert.equal(configuration(home).read().source, "provider"); let before = ""; providerStore(home, store => { before = JSON.stringify(store.get("shared")); });
  configuration(home).save({ provider_id: "shared", model_id: "existing-model" }); providerStore(home, store => assert.equal(JSON.stringify(store.get("shared")), before));
  assert.throws(() => configuration(home).save({ provider_id: "shared", model_id: "existing-model", api_key: "replacement" } as never), /Connectors/);
  const seen = inferenceAt(t, home, "完成");
  const complete = completion(home); assert.ok(complete); assert.equal(await complete("用户明确请求的一次摘要"), "完成");
  assert.deepEqual(seen, [{ protocol: "openai-compatible", endpoint: "https://shared.example.com/v1/chat/completions", model: "existing-model", key: "shared-test-key" }]);
});

test("Jelly uses the selected Connector for local model calls and falls back to host environment", async t => {
  const home = homeFor(t); const connection = modelConnection(home, "本机模型", "local-test-key");
  configuration(home).save({ base_url: "http://127.0.0.1:9000/anthropic", api_format: "anthropic-messages", model_id: "anthropic-model", connection_id: connection.connection_id });
  const seen = inferenceAt(t, home, "Anthropic结果");
  assert.equal(await completion(home)!("生成"), "Anthropic结果");
  assert.deepEqual(seen.at(-1), { protocol: "anthropic-compatible", endpoint: "http://127.0.0.1:9000/anthropic/v1/messages", model: "anthropic-model", key: "local-test-key" });
  const emptyHome = join(home, "another-home"); mkdirSync(emptyHome); process.env.MOLIS_WORK_TEXT_API_KEY = "env-test-key"; process.env.MOLIS_WORK_TEXT_API_FORMAT = "anthropic-messages"; process.env.MOLIS_WORK_TEXT_BASE_URL = "https://env.example.com"; process.env.MOLIS_WORK_TEXT_MODEL = "env-model";
  const environment = inferenceAt(t, emptyHome, "Anthropic结果");
  assert.equal(configuration(emptyHome).read().source, "environment"); assert.equal(await completion(emptyHome)!("生成"), "Anthropic结果");
  assert.equal(environment.at(-1)?.key, "env-test-key"); assert.equal(environment.at(-1)?.endpoint, "https://env.example.com/v1/messages");
});

test("Jelly rejects insecure configuration and unowned catalogs without mutating credentials or preferences", t => {
  const home = homeFor(t); const connection = modelConnection(home, "保留账号", "preserved-key");
  configuration(home).save({ base_url: "https://models.example.com/v1", model_id: "good", connection_id: connection.connection_id }); const before = readFileSync(join(home, "jelly", "preferences.json"), "utf8");
  for (const base_url of ["http://192.168.1.8/v1", "http://external.example.com", "https://user:password@example.com", "https://example.com?api_key=secret", "file:///tmp/model"]) assert.throws(() => configuration(home).save({ base_url, model_id: "bad", connection_id: connection.connection_id }));
  assert.equal(readFileSync(join(home, "jelly", "preferences.json"), "utf8"), before); assert.equal(runWithMolisWorkHome(home, () => createFileSecretStore()).get(connection.credential_ref!), "preserved-key");
  const unknown = join(home, "unknown"); mkdirSync(join(unknown, "projects"), { recursive: true }); const db = new LocalSqliteStorage(join(unknown, "projects", "catalog.db")); db.close(); assert.throws(() => configuration(unknown).read(), /未知项目目录数据库/); assert.equal(existsSync(join(unknown, "feed")), false);
});

test("Jelly model actions reuse the original provider and preference owners and discover live disablement", async t => {
  const { MolisWorkLocalHost } = await import("@molis-ai/molis-work-app-local-host");
  const { jellyActions, jellyServiceActions } = await import("@molis-ai/molis-work-plugin-jelly");
  const { bindActionClient } = await import("@molis-ai/molis-work-contracts/platform/actions");
  const home = homeFor(t, false);
  await withMolisWorkProjectCatalog({ homeDirectory: home }, () => undefined);
  const shared = modelConnection(home, "已有模型", "fixture-key", "https://shared.example.com/v1");
  providerStore(home, store => {
    store.upsert({ credential_ref: shared.credential_ref!, provider_id: "shared", display_name: "已有模型", base_url: "https://shared.example.com/v1", api_format: "openai-chat-completions", models: [{ model_id: "model", enabled: true }] });
  });
  let sharedBefore = ""; providerStore(home, store => { sharedBefore = JSON.stringify(store.get("shared")); });
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  const actions = bindActionClient(host.homeActionClient(), () => ({ actor_id: "owner", project_id: null, audience: "user", permissions: ["jelly:settings", "jelly:read", "model:invoke"] }));
  try {
    assert.equal((await actions.invoke(jellyServiceActions.modelSettings, {})).source, "provider");
    const saved = await actions.invoke(jellyServiceActions.saveModelSettings, { provider_id: "shared", model_id: "model" });
    assert.deepEqual(saved.selection, { provider_id: "shared", model_id: "model" });
    assert.deepEqual(configuration(home).read(), saved);
    providerStore(home, store => { assert.equal(JSON.stringify(store.get("shared")), sharedBefore); });
    assert.doesNotMatch(JSON.stringify(saved), /fixture-key/);
    assert.equal((await actions.discover()).find(row => row.capability_id === jellyActions.modelPlan.capability_id)!.availability.available, true);
    // ASC-16 ASC-20: disabling a shared credential blocks its model consumers without changing their selection.
    withConnectorConnections(home, store => store.setEnabled(shared.connection_id, false));
    const disabled = await actions.invoke(jellyServiceActions.modelSettings, {});
    assert.equal(disabled.connections.find(row => row.connection_id === shared.connection_id)!.state, "disconnected");
    assert.deepEqual(disabled.selection, saved.selection);
    await assert.rejects(actions.invoke(jellyActions.modelPlan, { source_type: "text", text: "已停用账号不能调用" }), { code: "actions.connection_required" });
    withConnectorConnections(home, store => store.setEnabled(shared.connection_id, true));
    assert.equal((await actions.discover()).find(row => row.capability_id === jellyActions.modelPlan.capability_id)!.availability.available, true);
    providerStore(home, store => { const existing = store.get("shared")!; store.upsert({ ...existing, enabled: false }); });
    assert.equal((await actions.discover()).find(row => row.capability_id === jellyActions.modelPlan.capability_id)!.availability.available, false);
    await assert.rejects(actions.invoke(jellyActions.modelPlan, { source_type: "text", text: "不可使用已停用模型" }), { code: "actions.connection_required" });
  } finally { await host.close(); }
});

test("W5-01-JMC-01 real Jelly Runtime keeps all actions, isolated selection and settings-only repair without network", async t => {
  const { serveHomeRuntime, person } = await import("./fixtures/home-runtime.js");
  const { jellyActions, jellyServiceActions, JELLY_ACTIONS, JELLY_PLUGIN_ID } = await import("@molis-ai/molis-work-plugin-jelly");
  const home = homeFor(t, false);
  await withMolisWorkProjectCatalog({ homeDirectory: home }, () => undefined);
  const { host, request } = await serveHomeRuntime(t, { homeDirectory: home });
  try {
  const connection = modelConnection(home, "配置账号", "runtime-config-fixture");
  const platform = await host.homePlugins!.ready(), installation = host.homePlugins!.installation(JELLY_PLUGIN_ID)!;
  const directory = await host.homeActionClient().discover(person(["jelly:read", "jelly:write", "jelly:settings", "model:invoke"]));
  const jelly = directory.filter(action => action.provider.plugin_id === JELLY_PLUGIN_ID);
  assert.equal(jelly.length, JELLY_ACTIONS.length); assert.equal(jelly.length, 53);
  assert.ok(jelly.every(action => action.provider.plugin_install_id === installation.install_id));
  await platform.runtime.stop(installation.install_id);
  platform.runtime.grant(installation.install_id, installation.grants.filter(grant => grant !== "model:invoke"));
  await platform.supervisor.restart(JELLY_PLUGIN_ID);
  let requests = 0; t.mock.method(globalThis, "fetch", async () => { requests++; throw new Error("unexpected model network"); });
  const saved = await host.homeActionClient().invoke(person(["jelly:settings"]), jellyServiceActions.saveModelSettings,
    { base_url: "https://jelly-runtime.example/v1", model_id: "private", connection_id: connection.connection_id }) as JellyModelSettings;
  assert.deepEqual(saved.selection, { provider_id: "jelly-text", model_id: "private" });
  assert.equal(requests, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(home, "jelly", "preferences.json"), "utf8")), { schema_version: 1, provider_id: "jelly-text", model_id: "private" });
  assert.deepEqual(await host.homeActionClient().invoke(person(["jelly:settings"]), jellyServiceActions.modelSettings, {}), saved);
  await assert.rejects(host.homeActionClient().invoke(person(["jelly:read", "model:invoke"]), jellyActions.modelPlan, { source_type: "text", text: "plan" }));
  t.mock.restoreAll();
  assert.equal((await request("/api/plugins/io.molis.work.jelly/model-settings")).status, 200);
  } finally { await host.close(); }
});

test("W5-01-JMC-02 revoked private storage prevents preference, provider and connector-origin writes", async t => {
  const { serveHomeRuntime, person } = await import("./fixtures/home-runtime.js");
  const { jellyServiceActions, JELLY_PLUGIN_ID } = await import("@molis-ai/molis-work-plugin-jelly");
  const home = homeFor(t, false);
  await withMolisWorkProjectCatalog({ homeDirectory: home }, () => undefined);
  const { host } = await serveHomeRuntime(t, { homeDirectory: home });
  try {
  const connection = modelConnection(home, "尚未绑定地址", "no-late-effects-fixture");
  const platform = await host.homePlugins!.ready(), installation = host.homePlugins!.installation(JELLY_PLUGIN_ID)!;
  await platform.runtime.stop(installation.install_id);
  platform.runtime.grant(installation.install_id, installation.grants.filter(grant => grant !== "storage:private"));
  await assert.rejects(host.homeActionClient().invoke(person(["jelly:settings"]), jellyServiceActions.saveModelSettings,
    { base_url: "https://unwritten.example/v1", model_id: "unwritten", connection_id: connection.connection_id }));
  assert.equal(existsSync(join(home, "jelly", "preferences.json")), false);
  providerStore(home, store => assert.equal(store.get("jelly-text"), null));
  // A refused save must not pin the connection: another origin can still become its first target.
  withConnectorConnections(home, store => store.assertTarget(connection.connection_id, "model-api", "https://first-target.example/v1"));
  } finally { await host.close(); }
});

test("W5-01-JMC-03 a preference write failure rolls back the provider but retains the existing first-origin-pin boundary", t => {
  const home = homeFor(t), connection = modelConnection(home, "首次地址", "pin-boundary-fixture");
  const path = join(home, "jelly", "preferences.json"), rename = fs.renameSync;
  t.mock.method(fs, "renameSync", (from: fs.PathLike, to: fs.PathLike) => {
    if (String(to) === path) throw new Error("injected preference rename failure");
    return rename(from, to);
  });
  syncBuiltinESMExports();
  try {
    assert.throws(() => configuration(home).save({ base_url: "https://pinned.example/v1", model_id: "uncommitted", connection_id: connection.connection_id }), /injected preference/);
    providerStore(home, store => assert.equal(store.get("jelly-text"), null));
    assert.equal(existsSync(path), false);
    assert.throws(() => withConnectorConnections(home, store => store.assertTarget(connection.connection_id, "model-api", "https://different.example/v1")));
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
});

async function trustedJelly(t: test.TestContext) {
  const { HomePluginHost } = await import("@molis-ai/molis-work-app-local-host");
  const { ActionService } = await import("@molis-ai/molis-work-kernel");
  const { createJellyPlugin, jellyManifest } = await import("@molis-ai/molis-work-plugin-jelly");
  const home = homeFor(t), service = new ActionService();
  const definitions: import("@molis-ai/molis-work-contracts/platform/plugin").PluginDefinition[] = [];
  const contexts: import("@molis-ai/molis-work-contracts/platform/plugin").PluginStartContext[] = [];
  const registrations: import("@molis-ai/molis-work-contracts/platform/actions").ActionProviderRegistration[] = [];
  // The plugin's own Manifest carries the declaration; this copy is the one the startup caller keeps hold of.
  const declaration = structuredClone(JELLY_MODEL_CONFIGURATION), manifest = { ...jellyManifest, model_configuration: declaration };
  const host = new HomePluginHost({ home, actorId: "person", client: service, registry: {
    registerProvider(registration) { registrations.push(registration); return service.registerProvider(registration); },
  }, entries: [{ scope: "home", manifest, create() {
    const plugin = createJellyPlugin();
    const definition = { ...plugin, manifest, async start(context: import("@molis-ai/molis-work-contracts/platform/plugin").PluginStartContext) { contexts.push(context); return plugin.start(context); } };
    definitions.push(definition); return definition;
  },
  package_name: "@molis-ai/molis-work-plugin-jelly", factory_export: "createJellyPlugin" }] });
  const platform = await host.ready(), install = host.installation(jellyManifest.plugin_id)!;
  return { home, host, service, platform, install, contexts, registrations, declaration, definitions };
}

test("W5-01-JMC-02 real configuration rejects stopped, revoked and replaced installations before any persistent effect", async t => {
  const { deferred } = await import("./fixtures/home-runtime.js");
  const { jellyServiceActions } = await import("@molis-ai/molis-work-plugin-jelly");
  for (const change of ["stop", "revoke", "reinstall"] as const) {
    const f = await trustedJelly(t), connection = modelConnection(f.home, "未绑定连接", "lifecycle-config-fixture");
    try {
      const entered = deferred(), release = deferred();
      const handler = f.registrations.flatMap(registration => registration.handlers).find(action => action.capability_id === jellyServiceActions.saveModelSettings.capability_id)!;
      const pending = Promise.resolve(handler.handle({ actor_id: "person", audience: "user", project_id: null, permissions: ["jelly:settings"],
        beforeEffect: async () => { entered.resolve(); await release.promise; } },
      { base_url: "https://late-save.example/v1", model_id: "late", connection_id: connection.connection_id }));
      const refused = assert.rejects(pending);
      await entered.promise;
      await f.platform.runtime.stop(f.install.install_id);
      if (change === "revoke") f.platform.runtime.grant(f.install.install_id, f.install.grants.filter(grant => grant !== "storage:private"));
      if (change === "reinstall") {
        await f.platform.runtime.uninstall(f.install.install_id);
        const replacement = f.platform.runtime.install({ trust: HOST_BUILD_TRUST, definition: f.definitions[0]!, deployment: "local", grants: f.install.grants }).install;
        assert.notEqual(replacement.installation_generation, f.install.installation_generation);
        await f.platform.runtime.start(replacement.install_id);
      }
      release.resolve(); await refused;
      assert.equal(existsSync(join(f.home, "jelly", "preferences.json")), false);
      providerStore(f.home, store => assert.equal(store.get("jelly-text"), null));
      withConnectorConnections(f.home, store => store.assertTarget(connection.connection_id, "model-api", "https://first-save.example/v1"));
      assert.equal(f.contexts[0]!.services!.model!.configuration!.selection(), undefined, `${change}: the stopped activation's handle answers nothing (BL-411)`);
    } finally { await f.host.close(); }
  }
});

test("W5-01-JMC-02 a property stuck on a definition declares nothing, and the Manifest's declaration is copied before plugin code runs", async t => {
  const { MolisWorkLocalHost } = await import("@molis-ai/molis-work-app-local-host");
  const { homeProbe } = await import("./fixtures/home-runtime.js");
  const probe = homeProbe("forgedconfiguration"), forged = Object.assign(probe.definition, { model_configuration: JELLY_MODEL_CONFIGURATION });
  const home = homeFor(t, false);
  await withMolisWorkProjectCatalog({ homeDirectory: home }, () => undefined);
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { home: [forged] } });
  try {
    await host.homePlugins!.ready();
    assert.equal(probe.contexts.at(-1)!.services!.model!.configuration, undefined);
  } finally { await host.close(); }
  const f = await trustedJelly(t);
  try {
    // The startup caller retaining its declaration cannot retarget a live instance's preference or provider.
    Object.assign(f.declaration.preference, { store_name: "not-jelly", file_name: "stolen.json" });
    Object.assign(f.declaration.custom_provider, { provider_id: "not-jelly" });
    const connection = modelConnection(f.home, "合法配置", "frozen-declaration-fixture");
    const { jellyServiceActions } = await import("@molis-ai/molis-work-plugin-jelly");
    const result = await f.service.invoke({ actor_id: "person", audience: "user", project_id: null, permissions: ["jelly:settings"] },
      jellyServiceActions.saveModelSettings, { base_url: "https://original-binding.example/v1", model_id: "original", connection_id: connection.connection_id }) as JellyModelSettings;
    assert.deepEqual(result.selection, { provider_id: "jelly-text", model_id: "original" });
    assert.equal(existsSync(join(f.home, "not-jelly")), false);
    assert.equal(existsSync(join(f.home, "jelly", "preferences.json")), true);
  } finally { await f.host.close(); }
});
