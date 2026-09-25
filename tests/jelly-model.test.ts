import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalSqliteStorage, LocalCatalogMetadata, createFileSecretStore, runWithMolisWorkHome, resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { ModelProviderStore } from "../apps/local-host/src/model-provider-store.js";
import { CATALOG_OWNER, CATALOG_SCHEMA_VERSION } from "../apps/local-host/src/project-catalog-contract.js";
import { readJellyModelSettings, saveJellyModelSettings, createJellyCompletion } from "../apps/local-host/src/jelly-model.js";
import { withConnectorConnections } from "../apps/local-host/src/connector-connection-store.js";

function modelConnection(home: string, name: string, token: string) {
  return withConnectorConnections(home, store => store.createToken({ serviceId: "model-api", displayName: name, token }));
}

function homeFor(t: test.TestContext, catalog = true): string {
  const home = mkdtempSync(join(tmpdir(), "jelly-model-"));
  const prior = { ...process.env }; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  for (const key of ["MOLIS_WORK_TEXT_API_KEY", "MOLIS_WORK_TEXT_BASE_URL", "MOLIS_WORK_TEXT_MODEL", "MOLIS_WORK_TEXT_API_FORMAT", "MINIMAX_API_KEY"]) delete process.env[key];
  t.after(() => { process.env = prior; resetSecretStoreCache(); rmSync(home, { recursive: true, force: true }); });
  if (catalog) { mkdirSync(join(home, "projects")); const db = new LocalSqliteStorage(join(home, "projects", "catalog.db")); const metadata = new LocalCatalogMetadata(db.db); metadata.create(); metadata.initialize(CATALOG_OWNER, CATALOG_SCHEMA_VERSION); db.close(); }
  return home;
}
function providerStore(home: string, action: (store: ModelProviderStore, storage: LocalSqliteStorage) => void): void {
  const storage = new LocalSqliteStorage(join(home, "projects", "catalog.db"));
  try { const secrets = runWithMolisWorkHome(home, () => createFileSecretStore()); action(new ModelProviderStore({ db: storage.db, secrets }), storage); } finally { storage.close(); }
}

test("Jelly empty model settings do not create a catalog, preferences, secret files or send a request", t => {
  const home = homeFor(t, false); let requests = 0; t.mock.method(globalThis, "fetch", async () => { requests++; throw new Error("unexpected network"); });
  assert.deepEqual(readJellyModelSettings(home), { configured: false, providers: [], connections: [], source: "none" }); assert.equal(createJellyCompletion(home), undefined); assert.equal(requests, 0);
  assert.equal(existsSync(join(home, "projects")), false); assert.equal(existsSync(join(home, "jelly")), false); assert.equal(existsSync(join(home, "feed")), false);
  assert.throws(() => saveJellyModelSettings(home, { base_url: "https://example.com/v1", model_id: "model" }), /尚未初始化/); assert.equal(existsSync(join(home, "projects")), false);
});

test("Jelly custom model selects a Connector credential and keeps preferences free of secrets", t => {
  const home = homeFor(t); let requests = 0; t.mock.method(globalThis, "fetch", async () => { requests++; throw new Error("unexpected network"); });
  const connection = modelConnection(home, "Jelly 账号", "jelly-test-plaintext-key");
  const settings = saveJellyModelSettings(home, { base_url: "https://models.example.com/v1", api_format: "openai-chat-completions", model_id: "text-a", connection_id: connection.connection_id });
  assert.equal(settings.configured, true); assert.equal(settings.source, "selection"); assert.deepEqual(settings.selection, { provider_id: "jelly-text", model_id: "text-a" }); assert.equal(settings.providers[0]!.has_credential, true); assert.equal(requests, 0);
  assert.equal(settings.custom_connection_id, connection.connection_id);
  const prefs = readFileSync(join(home, "jelly", "preferences.json"), "utf8"); assert.equal(prefs.includes("jelly-test-plaintext-key"), false); assert.deepEqual(JSON.parse(prefs), { schema_version: 1, provider_id: "jelly-text", model_id: "text-a" }); assert.equal(JSON.stringify(settings).includes("jelly-test-plaintext-key"), false);
  providerStore(home, (store, storage) => { assert.equal(store.get("jelly-text")?.base_url, "https://models.example.com/v1"); assert.equal(store.get("jelly-text")?.credential_ref, connection.credential_ref); assert.equal(JSON.stringify(storage.db.prepare("SELECT * FROM model_providers").all()).includes("jelly-test-plaintext-key"), false); });
  const secrets = runWithMolisWorkHome(home, () => createFileSecretStore()); assert.equal(secrets.get(connection.credential_ref!), "jelly-test-plaintext-key");
  saveJellyModelSettings(home, { provider_id: "jelly-text", model_id: "text-b" });
  assert.equal(readJellyModelSettings(home).custom_connection_id, connection.connection_id);
  assert.equal(secrets.get(connection.credential_ref!), "jelly-test-plaintext-key");
});

test("Jelly existing-provider selection changes no shared record or key, and scoped home credentials remain isolated", async t => {
  const home = homeFor(t); providerStore(home, store => { store.upsert({ provider_id: "shared", display_name: "已有供应商", base_url: "https://shared.example.com/v1", api_format: "openai-chat-completions", models: [{ model_id: "existing-model", enabled: true }] }); store.setCredential("shared", "shared-test-key"); });
  assert.equal(readJellyModelSettings(home).source, "provider"); let before = ""; providerStore(home, store => { before = JSON.stringify(store.get("shared")); });
  saveJellyModelSettings(home, { provider_id: "shared", model_id: "existing-model" }); providerStore(home, store => assert.equal(JSON.stringify(store.get("shared")), before));
  assert.throws(() => saveJellyModelSettings(home, { provider_id: "shared", model_id: "existing-model", api_key: "replacement" } as never), /Connectors/);
  let captured: RequestInit | undefined; t.mock.method(globalThis, "fetch", async (_url: unknown, options: RequestInit) => { captured = options; return new Response(JSON.stringify({ choices: [{ message: { content: "完成" } }] }), { status: 200 }); });
  const complete = createJellyCompletion(home); assert.ok(complete); assert.equal(await complete("用户明确请求的一次摘要"), "完成"); assert.equal((captured?.headers as Record<string, string>).authorization, "Bearer shared-test-key"); assert.equal(JSON.parse(String(captured?.body)).model, "existing-model");
});

test("Jelly uses the selected Connector for local model calls and falls back to host environment", async t => {
  const home = homeFor(t); const connection = modelConnection(home, "本机模型", "local-test-key");
  saveJellyModelSettings(home, { base_url: "http://127.0.0.1:9000/anthropic", api_format: "anthropic-messages", model_id: "anthropic-model", connection_id: connection.connection_id });
  let lastUrl = "", lastHeaders: Record<string, string> = {}; t.mock.method(globalThis, "fetch", async (url: URL, options: RequestInit) => { lastUrl = String(url); lastHeaders = options.headers as Record<string, string>; return new Response(JSON.stringify({ content: [{ type: "text", text: "Anthropic结果" }] }), { status: 200 }); });
  assert.equal(await createJellyCompletion(home)!("生成"), "Anthropic结果"); assert.equal(lastUrl, "http://127.0.0.1:9000/anthropic/v1/messages"); assert.equal(lastHeaders["x-api-key"], "local-test-key");
  const emptyHome = join(home, "another-home"); mkdirSync(emptyHome); process.env.MOLIS_WORK_TEXT_API_KEY = "env-test-key"; process.env.MOLIS_WORK_TEXT_API_FORMAT = "anthropic-messages"; process.env.MOLIS_WORK_TEXT_BASE_URL = "https://env.example.com";
  assert.equal(readJellyModelSettings(emptyHome).source, "environment"); assert.equal(await createJellyCompletion(emptyHome)!("生成"), "Anthropic结果"); assert.equal(lastHeaders["x-api-key"], "env-test-key");
});

test("Jelly rejects insecure configuration and unowned catalogs without mutating credentials or preferences", t => {
  const home = homeFor(t); const connection = modelConnection(home, "保留账号", "preserved-key");
  saveJellyModelSettings(home, { base_url: "https://models.example.com/v1", model_id: "good", connection_id: connection.connection_id }); const before = readFileSync(join(home, "jelly", "preferences.json"), "utf8");
  for (const base_url of ["http://192.168.1.8/v1", "http://external.example.com", "https://user:password@example.com", "https://example.com?api_key=secret", "file:///tmp/model"]) assert.throws(() => saveJellyModelSettings(home, { base_url, model_id: "bad", connection_id: connection.connection_id }));
  assert.equal(readFileSync(join(home, "jelly", "preferences.json"), "utf8"), before); assert.equal(runWithMolisWorkHome(home, () => createFileSecretStore()).get(connection.credential_ref!), "preserved-key");
  const unknown = join(home, "unknown"); mkdirSync(join(unknown, "projects"), { recursive: true }); const db = new LocalSqliteStorage(join(unknown, "projects", "catalog.db")); db.close(); assert.throws(() => readJellyModelSettings(unknown), /未知项目目录数据库/); assert.equal(existsSync(join(unknown, "feed")), false);
});

test("Jelly model actions reuse the original provider and preference owners and discover live disablement", async t => {
  const { MolisWorkLocalHost } = await import("../apps/local-host/src/project-host.js");
  const { jellyActions, jellyServiceActions } = await import("@molis-ai/molis-work-plugin-jelly");
  const { bindActionClient } = await import("@molis-ai/molis-work-contracts/platform/actions");
  const home = homeFor(t);
  providerStore(home, store => {
    store.upsert({ provider_id: "shared", display_name: "已有模型", base_url: "https://shared.example.com/v1", api_format: "openai-chat-completions", models: [{ model_id: "model", enabled: true }] });
    store.setCredential("shared", "fixture-key");
  });
  let sharedBefore = ""; providerStore(home, store => { sharedBefore = JSON.stringify(store.get("shared")); });
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  const actions = bindActionClient(host.homeActionClient(), () => ({ actor_id: "owner", project_id: null, audience: "user", permissions: ["jelly:settings", "jelly:read", "model:invoke"] }));
  try {
    assert.equal((await actions.invoke(jellyServiceActions.modelSettings, {})).source, "provider");
    const saved = await actions.invoke(jellyServiceActions.saveModelSettings, { provider_id: "shared", model_id: "model" });
    assert.deepEqual(saved.selection, { provider_id: "shared", model_id: "model" });
    assert.deepEqual(readJellyModelSettings(home), saved);
    providerStore(home, store => { assert.equal(JSON.stringify(store.get("shared")), sharedBefore); });
    assert.doesNotMatch(JSON.stringify(saved), /fixture-key/);
    assert.equal((await actions.discover()).find(row => row.capability_id === jellyActions.modelPlan.capability_id)!.availability.available, true);
    providerStore(home, store => { const existing = store.get("shared")!; store.upsert({ ...existing, enabled: false }); });
    assert.equal((await actions.discover()).find(row => row.capability_id === jellyActions.modelPlan.capability_id)!.availability.available, false);
    await assert.rejects(actions.invoke(jellyActions.modelPlan, { source_type: "text", text: "不可使用已停用模型" }), { code: "actions.connection_required" });
  } finally { await host.close(); }
});
