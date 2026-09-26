import { createServer } from "node:https";
import { createServer as createHttpServer } from "node:http";
import { cogniaModelResponse as response } from "./fixtures/cognia-model-response.js";
import { execFileSync } from "node:child_process";
import { getCACertificates, setDefaultCACertificates } from "node:tls";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, existsSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalSqliteStorage, LocalCatalogMetadata, createFileSecretStore, runWithMolisWorkHome, resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { COGNIA_ACTION_PERMISSIONS, cogniaActions as actions } from "@molis-ai/molis-work-plugin-cognia";
import { ModelProviderStore } from "../apps/local-host/src/model-provider-store.js";
import { CATALOG_OWNER, CATALOG_SCHEMA_VERSION } from "../apps/local-host/src/project-catalog-contract.js";
import { withConnectorConnections } from "../apps/local-host/src/connector-connection-store.js";
import { createCogniaProloguePort } from "../apps/local-host/src/cognia-prologue.js";
import { MolisWorkLocalHost } from "../apps/local-host/src/project-host.js";

function fixture(t: test.TestContext, endpoint = "https://1.1.1.1") {
  const home = mkdtempSync(join(tmpdir(), "cognia-prologue-"));
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  mkdirSync(join(home, "projects"));
  const db = new LocalSqliteStorage(join(home, "projects", "catalog.db"));
  const metadata = new LocalCatalogMetadata(db.db); metadata.create(); metadata.initialize(CATALOG_OWNER, CATALOG_SCHEMA_VERSION); db.close();
  const secrets = runWithMolisWorkHome(home, () => createFileSecretStore());
  const models = <T>(run: (store: ModelProviderStore) => T): T => {
    const db = new LocalSqliteStorage(join(home, "projects", "catalog.db"));
    try { return run(new ModelProviderStore({ db: db.db, secrets })); } finally { db.close(); }
  };
  const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "model-api", displayName: "Cognia account", token: "cognia-fixture-secret" }));
  withConnectorConnections(home, store => store.assertTarget(connection.connection_id, "model-api", endpoint));
  models(store => { store.upsert({ provider_id: "cognia-test", display_name: "Cognia model", base_url: endpoint, api_format: "anthropic-messages", models: [{ model_id: "fixture-model", enabled: true }] }); store.selectConnection("cognia-test", connection.credential_ref!); });
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  const bound = bindActionClient(host.homeActionClient(), () => ({ actor_id: "trusted-cognia-user", project_id: null, audience: "user", permissions: COGNIA_ACTION_PERMISSIONS }));
  t.after(async () => { await host.close(); if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior; resetSecretStoreCache(); rmSync(home, { recursive: true, force: true }); });
  return { home, host, bound, models, secrets, connection };
}


test("Cognia discovery never decrypts or starts Prologue; actual packed SDK receives fixed evidence and no tools", { timeout: 30_000 }, async t => {
  const f = fixture(t); let reads = 0, requests = 0;
  const get = f.secrets.get.bind(f.secrets); t.mock.method(f.secrets, "get", ref => { reads++; return get(ref); });
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    requests++; const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    assert.equal(body.model, "fixture-model"); assert.equal(body.tools?.length ?? 0, 0);
    assert.match(JSON.stringify(body.messages), /ORIGINAL_FIXED_EVIDENCE/); assert.match(JSON.stringify(body.messages), /不可信资料/);
    assert.doesNotMatch(JSON.stringify(body), /UNSELECTED_EVIDENCE/);
    return response("# SDK 知识草稿\n已读取固定证据 [S1]");
  });
  assert.equal((await f.bound.discover()).find(d => d.capability_id === actions.synthesize.capability_id)!.availability.available, true);
  const port = createCogniaProloguePort({ homeDirectory: f.home }); assert.match(port.runtimeLabel!, /Prologue/);
  assert.equal(reads, 0); assert.equal(requests, 0); assert.equal(existsSync(join(f.home, "cognia", "runtime")), false);
  const { material } = await f.bound.invoke(actions.createMaterial, { title: "Selected", body: "ORIGINAL_FIXED_EVIDENCE" });
  await f.bound.invoke(actions.createMaterial, { title: "Private", body: "UNSELECTED_EVIDENCE" });
  const { draft } = await f.bound.invoke(actions.synthesize, { material_ids: [material.id] });
  assert.equal(draft.title, "SDK 知识草稿"); assert.equal(draft.references[0]!.material_id, material.id);
  assert.equal(requests, 1); assert.ok(reads > 0);
  const saved = await f.bound.invoke(actions.saveDraft, { id: draft.id }); assert.equal(saved.material.body, "已读取固定证据 [S1]");
});

for (const change of ["disable", "disconnect"] as const) test(`Cognia packed Prologue rejects ${change} during a run before persisting a draft`, { timeout: 30_000 }, async t => {
  const f = fixture(t), started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; started.resolve(); await release.promise; return response("# Late result\nFixed evidence [S1]"); });
  const { material } = await f.bound.invoke(actions.createMaterial, { title: "Evidence", body: "Fixed evidence" });
  const pending = f.bound.invoke(actions.synthesize, { material_ids: [material.id] });
  const rejected = assert.rejects(pending, { code: "actions.configuration_changed" });
  await started.promise;
  if (change === "disable") f.models(store => store.upsert({ ...store.get("cognia-test")!, enabled: false }));
  else withConnectorConnections(f.home, store => store.disconnect(f.connection.connection_id));
  assert.equal((await f.bound.discover()).find(d => d.capability_id === actions.synthesize.capability_id)!.availability.available, false);
  release.resolve(); await rejected;
  assert.equal((await f.bound.invoke(actions.workspace, {})).drafts.length, 0);
  await assert.rejects(f.bound.invoke(actions.synthesize, { material_ids: [material.id] }), { code: "actions.connection_required" });
  assert.equal(requests, 1);
});


for (const protocol of ["http", "https"]) test(`configured Cognia model runs through actual ${protocol.toUpperCase()} and packed Prologue, then cancellation leaves no extra draft`, { timeout: 30_000 }, async t => {
  let requests = 0, hold = false;
  const entered = Promise.withResolvers<void>();
  const certificates = mkdtempSync(join(tmpdir(), "cognia-test-tls-"));
  const keyFile = join(certificates, "key.pem"), certFile = join(certificates, "cert.pem");
  if (protocol === "https") execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyFile, "-out", certFile, "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" });
  const priorCAs = getCACertificates("default");
  if (protocol === "https") setDefaultCACertificates([...priorCAs, readFileSync(certFile, "utf8")]);
  const server = protocol === "https" ? createServer({ key: readFileSync(keyFile), cert: readFileSync(certFile) }) : createHttpServer();
  server.on("request", async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    const input = JSON.parse(body); requests++;
    assert.equal(req.url, "/v1/messages"); assert.equal(req.headers["x-api-key"], "cognia-fixture-secret");
    assert.equal(input.model, "fixture-model"); assert.equal(input.tools?.length ?? 0, 0); assert.match(JSON.stringify(input.messages), /NETWORK_EVIDENCE/);
    if (hold) { entered.resolve(); return; }
    const output = response("# HTTP 知识草稿\n完整运行结果 [S1]"); res.writeHead(200, { "content-type": "text/event-stream" }); res.end(await output.text());
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const f = fixture(t, `${protocol}://127.0.0.1:${address.port}`);
  try {
    assert.equal((await f.bound.discover()).find(d => d.capability_id === actions.synthesize.capability_id)!.availability.available, true);
    assert.equal((await f.bound.invoke(actions.workspace, {})).ai_available, true);
    assert.equal(requests, 0);
    const { material } = await f.bound.invoke(actions.createMaterial, { title: "HTTP source", body: "NETWORK_EVIDENCE" });
    const { draft } = await f.bound.invoke(actions.synthesize, { material_ids: [material.id] });
    assert.equal(draft.body, "完整运行结果 [S1]"); assert.equal(requests, 1);
    hold = true;
    const abort = new AbortController();
    const pending = f.host.homeActionClient().invoke({ actor_id: "network-user", project_id: null, audience: "user", permissions: COGNIA_ACTION_PERMISSIONS, signal: abort.signal }, actions.synthesize, { material_ids: [material.id] });
    const rejected = assert.rejects(pending);
    await entered.promise; abort.abort(); await rejected;
    assert.equal(requests, 2); assert.equal((await f.bound.invoke(actions.workspace, {})).drafts.length, 1);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); setDefaultCACertificates(priorCAs); rmSync(certificates, { recursive: true, force: true }); }
});


test("disabled local model is unavailable before discovery or execution can start a Prologue run", async t => {
  const f = fixture(t, "http://127.0.0.1:9000");
  f.models(store => store.upsert({ ...store.get("cognia-test")!, enabled: false }));
  let requests = 0; t.mock.method(globalThis, "fetch", async () => { requests++; throw new Error("must not dispatch"); });
  const view = (await f.bound.discover()).find(d => d.capability_id === actions.synthesize.capability_id)!;
  assert.equal(view.availability.available, false);
  if (!view.availability.available) assert.match(view.availability.reason, /模型/);
  const workspace = await f.bound.invoke(actions.workspace, {});
  assert.equal(workspace.ai_available, false); assert.match(workspace.ai_unavailable_reason!, /模型/);
  await assert.rejects(f.bound.invoke(actions.query, { question: "cannot start" }), { code: "actions.connection_required" });
  assert.equal(requests, 0); assert.equal(existsSync(join(f.home, "cognia", "runtime")), false);
});
