import test from "node:test";
import assert from "node:assert/strict";
import fs, { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { syncBuiltinESMExports } from "node:module";
import { LocalSqliteStorage, LocalCatalogMetadata, createFileSecretStore, runWithMolisWorkHome, resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { ModelProviderStore, initializeCatalog, hostCompleteText, CATALOG_SCHEMA_VERSION, createConsumerModelConfiguration, bindPrologueInference } from "@molis-ai/molis-work-app-local-host";
/** A consumer's declaration: where its choice is kept and its own provider. The Host derives one for each Home package (`sandboxModelDeclaration`, BL-491). */
const PROBE_MODEL_CONFIGURATION = { preference: { store_name: "probe", file_name: "preferences.json" }, custom_provider: { provider_id: "probe-text", display_name: "探针模型" } };
const configuration = (home: string) => createConsumerModelConfiguration(home, PROBE_MODEL_CONFIGURATION);
const completion = (home: string) => hostCompleteText({ homeDirectory: home, selection: configuration(home).selection() });
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";

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
  const home = mkdtempSync(join(tmpdir(), "consumer-model-"));
  const prior = modelEnvironments.get(t) ?? { ...process.env }; modelEnvironments.set(t, prior); process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  for (const key of ["MOLIS_WORK_TEXT_API_KEY", "MOLIS_WORK_TEXT_BASE_URL", "MOLIS_WORK_TEXT_MODEL", "MOLIS_WORK_TEXT_API_FORMAT", "MINIMAX_API_KEY"]) delete process.env[key];
  t.after(() => { process.env = prior; resetSecretStoreCache(); rmSync(home, { recursive: true, force: true }); });
  if (catalog) {
    mkdirSync(join(home, "projects"));
    const db = new LocalSqliteStorage(join(home, "projects", "catalog.db"));
    try {
      createContextLedger(db.db, { initializeSchema: true, authorize: () => false });
      initializeCatalog(db);
    } finally { db.close(); }
  }
  return home;
}
function providerStore(home: string, action: (store: ModelProviderStore, storage: LocalSqliteStorage) => void): void {
  const storage = new LocalSqliteStorage(join(home, "projects", "catalog.db"));
  try { const secrets = runWithMolisWorkHome(home, () => createFileSecretStore()); action(new ModelProviderStore({ db: storage.db, secrets }), storage); } finally { storage.close(); }
}

test("A consumer's empty model settings do not create a catalog, preferences, secret files or send a request", t => {
  const home = homeFor(t, false); let requests = 0; t.mock.method(globalThis, "fetch", async () => { requests++; throw new Error("unexpected network"); });
  assert.deepEqual(configuration(home).read(), { configured: false, providers: [], connections: [], source: "none" }); assert.equal(completion(home), undefined); assert.equal(requests, 0);
  assert.equal(existsSync(join(home, "projects")), false); assert.equal(existsSync(join(home, "probe")), false); assert.equal(existsSync(join(home, "security")), false);
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
    assert.equal(existsSync(join(home, "probe")), false, "no preference or material store is created");
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

test("A consumer's custom model selects a Connector credential and keeps preferences free of secrets", t => {
  const home = homeFor(t); let requests = 0; t.mock.method(globalThis, "fetch", async () => { requests++; throw new Error("unexpected network"); });
  const connection = modelConnection(home, "探针账号", "probe-test-plaintext-key");
  const settings = configuration(home).save({ base_url: "https://models.example.com/v1", api_format: "openai-chat-completions", model_id: "text-a", connection_id: connection.connection_id });
  assert.equal(settings.configured, true); assert.equal(settings.source, "selection"); assert.deepEqual(settings.selection, { provider_id: "probe-text", model_id: "text-a" }); assert.equal(settings.providers[0]!.has_credential, true); assert.equal(requests, 0);
  assert.equal(settings.custom_connection_id, connection.connection_id);
  const prefs = readFileSync(join(home, "probe", "preferences.json"), "utf8"); assert.equal(prefs.includes("probe-test-plaintext-key"), false); assert.deepEqual(JSON.parse(prefs), { schema_version: 1, selection: { provider_id: "probe-text", model_id: "text-a" }, revision: 1, receipts: {} }); assert.equal(JSON.stringify(settings).includes("probe-test-plaintext-key"), false);
  providerStore(home, (store, storage) => { assert.equal(store.get("probe-text")?.base_url, "https://models.example.com/v1"); assert.equal(store.get("probe-text")?.credential_ref, connection.credential_ref); assert.equal(JSON.stringify(storage.db.prepare("SELECT * FROM model_providers").all()).includes("probe-test-plaintext-key"), false); });
  const secrets = runWithMolisWorkHome(home, () => createFileSecretStore()); assert.equal(secrets.get(connection.credential_ref!), "probe-test-plaintext-key");
  configuration(home).save({ provider_id: "probe-text", model_id: "text-b" });
  assert.equal(configuration(home).read().custom_connection_id, connection.connection_id);
  assert.equal(secrets.get(connection.credential_ref!), "probe-test-plaintext-key");
});

test("QEA-185: a consumer's existing-provider selection changes no shared record or key, and scoped home credentials remain isolated", async t => {
  const home = homeFor(t); const shared = modelConnection(home, "已有供应商", "shared-test-key", "https://shared.example.com/v1");
  providerStore(home, store => { store.upsert({ credential_ref: shared.credential_ref!, provider_id: "shared", display_name: "已有供应商", base_url: "https://shared.example.com/v1", api_format: "openai-chat-completions", models: [{ model_id: "existing-model", enabled: true }] }); });
  assert.equal(configuration(home).read().source, "provider"); let before = ""; providerStore(home, store => { before = JSON.stringify(store.get("shared")); });
  configuration(home).save({ provider_id: "shared", model_id: "existing-model" }); providerStore(home, store => assert.equal(JSON.stringify(store.get("shared")), before));
  assert.throws(() => configuration(home).save({ provider_id: "shared", model_id: "existing-model", api_key: "replacement" } as never), {
    code: "host.model_configuration_invalid",
    message: "模型设置包含不支持的字段；请在「设置 › 服务连接」中管理模型 API Key",
  });
  const seen = inferenceAt(t, home, "完成");
  const complete = completion(home); assert.ok(complete); assert.equal(await complete("用户明确请求的一次摘要"), "完成");
  assert.deepEqual(seen, [{ protocol: "openai-compatible", endpoint: "https://shared.example.com/v1/chat/completions", model: "existing-model", key: "shared-test-key" }]);
});

test("A consumer uses the selected Connector for local model calls and falls back to host environment", async t => {
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

test("A consumer rejects insecure configuration and unowned catalogs without mutating credentials or preferences", t => {
  const home = homeFor(t); const connection = modelConnection(home, "保留账号", "preserved-key");
  configuration(home).save({ base_url: "https://models.example.com/v1", model_id: "good", connection_id: connection.connection_id }); const before = readFileSync(join(home, "probe", "preferences.json"), "utf8");
  for (const base_url of ["http://192.168.1.8/v1", "http://external.example.com", "https://user:password@example.com", "https://example.com?api_key=secret", "file:///tmp/model"]) assert.throws(() => configuration(home).save({ base_url, model_id: "bad", connection_id: connection.connection_id }));
  assert.equal(readFileSync(join(home, "probe", "preferences.json"), "utf8"), before); assert.equal(runWithMolisWorkHome(home, () => createFileSecretStore()).get(connection.credential_ref!), "preserved-key");
  const unknown = join(home, "unknown"); mkdirSync(join(unknown, "projects"), { recursive: true }); const db = new LocalSqliteStorage(join(unknown, "projects", "catalog.db")); db.close(); assert.throws(() => configuration(unknown).read(), /未知项目目录数据库/); assert.equal(existsSync(join(unknown, "security")), false);
});

test("W5-01-JMC-03 a preference write failure rolls back the provider but retains the existing first-origin-pin boundary", t => {
  const home = homeFor(t), connection = modelConnection(home, "首次地址", "pin-boundary-fixture");
  const path = join(home, "probe", "preferences.json"), rename = fs.renameSync;
  t.mock.method(fs, "renameSync", (from: fs.PathLike, to: fs.PathLike) => {
    if (String(to) === path) throw new Error("injected preference rename failure");
    return rename(from, to);
  });
  syncBuiltinESMExports();
  try {
    assert.throws(() => configuration(home).save({ base_url: "https://pinned.example/v1", model_id: "uncommitted", connection_id: connection.connection_id }), /injected preference/);
    providerStore(home, store => assert.equal(store.get("probe-text"), null));
    assert.equal(existsSync(path), false);
    assert.throws(() => withConnectorConnections(home, store => store.assertTarget(connection.connection_id, "model-api", "https://different.example/v1")));
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
});
