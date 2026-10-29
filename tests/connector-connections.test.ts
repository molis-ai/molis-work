import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ConnectorConnectionStore, withConnectorConnections } from "../apps/local-host/dist/connector-connection-store.js";
import { DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { createFileSecretStore, resetSecretStoreCache, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { CONNECTOR_CONNECTIONS_SCHEMA } from "@molis-ai/molis-work-service-connector-host";
import { HomePluginHost } from "@molis-ai/molis-work-app-local-host";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { imagesActions, IMAGES_ACTION_PERMISSIONS, imagesManifest, createImagesPlugin, imagesProjectData } from "@molis-ai/molis-work-plugin-images";
import { refreshFeedConnectionState } from "./fixtures/feed-library.js";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.ts";
import { bindPrologueInference } from "../apps/local-host/dist/prologue-inference-host.js";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";

const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";

test("one service keeps two independent credentials and bindings never cross services", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(CONNECTOR_CONNECTIONS_SCHEMA);
  const values = new Map<string, string>();
  const store = new ConnectorConnectionStore(db, {
    get: (ref) => values.get(ref) ?? null,
    put: (ref, value) => { values.set(ref, value); },
    delete: (ref) => { values.delete(ref); },
  }, () => new Date("2026-10-16T09:00:00.000Z"));
  try {
    const first = store.createToken({ serviceId: "gmail", displayName: "工作邮箱", token: "gmail-work-token" });
    const second = store.createToken({ serviceId: "gmail", displayName: "个人邮箱", token: "gmail-home-token" });
    assert.notEqual(first.connection_id, second.connection_id);
    assert.notEqual(first.credential_ref, second.credential_ref);
    assert.equal(store.resolveToken(first.connection_id, "gmail"), "gmail-work-token");
    assert.equal(store.resolveToken(second.connection_id, "gmail"), "gmail-home-token");
    assert.throws(() => store.resolveToken(first.connection_id, "github"), { code: "connector.connection.service_mismatch", message: /不属于这个服务/ });
    store.bind({ scopeId: "project-a", pluginId: "feed", slotId: "inbox", serviceId: "gmail", connectionId: second.connection_id });
    assert.equal(store.binding("project-a", "feed", "inbox")?.connection_id, second.connection_id);
    // ASC-19: every mutation invalidates a captured revision even under a frozen clock.
    const paused = store.setEnabled(first.connection_id, false);
    const enabled = store.setEnabled(first.connection_id, true);
    assert.ok(paused.updated_at > first.updated_at); assert.ok(enabled.updated_at > paused.updated_at);
    store.disconnect(first.connection_id);
    assert.ok(store.require(first.connection_id).updated_at > enabled.updated_at);
    assert.equal(store.state(store.require(first.connection_id)), "disconnected");
    // J2B-01: connection state stays a business value; the refusal carries its owner's current code.
    assert.throws(() => store.resolveToken(first.connection_id, "gmail"), { code: "connector.connection.disconnected", message: /断开/ });
    assert.equal(store.resolveToken(second.connection_id, "gmail"), "gmail-home-token");
    assert.equal(JSON.stringify(store.list()).includes("gmail-home-token"), false);
  } finally { db.close(); }
});

test("API and MCP credentials pin their first destination origin and reject a different host", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(CONNECTOR_CONNECTIONS_SCHEMA);
  const values = new Map<string, string>();
  const store = new ConnectorConnectionStore(db, {
    get: ref => values.get(ref) ?? null,
    put: (ref, value) => { values.set(ref, value); },
    delete: ref => { values.delete(ref); },
  });
  try {
    const model = store.createToken({ serviceId: "model-api", displayName: "模型账号", token: "model-secret" });
    assert.equal(store.assertTarget(model.connection_id, "model-api", "https://api.example.com/v1"), "https://api.example.com");
    assert.equal(store.assertTarget(model.connection_id, "model-api", "https://api.example.com/v2"), "https://api.example.com");
    assert.equal(store.view(model).target_origin, "https://api.example.com");
    assert.throws(() => store.assertTarget(model.connection_id, "model-api", "https://other.example.com/v1"), /请新建连接/);
    assert.throws(() => store.assertTarget(model.connection_id, "image-api", "https://api.example.com/v1"), /不属于这个服务/);
    assert.throws(() => store.assertTarget(model.connection_id, "model-api", "http://api.example.com/v1"), /HTTPS/);
    const mcp = store.createToken({ serviceId: "mcp-bearer", displayName: "MCP 账号", token: "mcp-secret" });
    assert.equal(store.assertTarget(mcp.connection_id, "mcp-bearer", "http://127.0.0.1:8787/mcp"), "http://127.0.0.1:8787");
  } finally { db.close(); }
});

test("Images uses the chosen Connector credential for each generation and survives another account disconnect", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-image-connector-"));
  const previousBackend = process.env.MOLIS_WORK_SECRET_BACKEND;
  const registry = new ActionService();
  const imageHost = new HomePluginHost({ home, actorId: LOCAL_PERSON_ACTOR_ID, registry, client: registry, entries: [{ scope: "home", manifest: imagesManifest, create: createImagesPlugin,
    project_data: { owner_id: "images" }, package_name: "@molis-ai/molis-work-plugin-images", factory_export: "createImagesPlugin" }] });
  const seen: string[] = [];
  const unbind = bindPrologueInference(home, {
    completeText: async () => { throw new Error("Unexpected text inference"); },
    completeTextResult: async () => { throw new Error("Unexpected text inference"); },
    evaluateTypeSafe: async () => { throw new Error("Unexpected TypeSafe inference"); },
    generateImages: async input => {
      seen.push(`Bearer ${await input.resolveCredential(input.credential_ref)}`);
      assert.equal(input.endpoint, "https://images.example/v1/images/generations");
      return [{ bytes: Buffer.from(PIXEL, "base64"), mime: "image/png" }];
    },
  });
  try {
    process.env.MOLIS_WORK_SECRET_BACKEND = "file";
    resetSecretStoreCache();
    const [a, b] = withConnectorConnections(home, store => [
      store.createToken({ serviceId: "image-api", displayName: "图片账号 A", token: "image-token-a" }),
      store.createToken({ serviceId: "image-api", displayName: "图片账号 B", token: "image-token-b" }),
    ]);
    await imageHost.ready();
    assert.equal(imageHost.installation(imagesManifest.plugin_id)?.state, "running");
    const client = (projectId: string | null) => bindActionClient(registry, () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: projectId, audience: "user", permissions: IMAGES_ACTION_PERMISSIONS }));
    const settings = client(null), images = client("board-one");
    const config = { name: "生图服务", api_format: "openai-images" as const, base_url: "https://images.example/v1", model: "image-model" };
    const { connection } = await settings.invoke(imagesActions.saveConnection, { ...config, auth_connection_id: a!.connection_id });
    async function generate(requestId: string) {
      const { job } = await images.invoke(imagesActions.start, { request_id: requestId, connection_id: connection.id, prompt: "一张图" });
      let current = job;
      for (let i = 0; i < 100 && current.status === "running"; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
        current = (await images.invoke(imagesActions.get, { id: job.id })).job;
      }
      assert.equal(current.status, "succeeded", JSON.stringify(current));
    }
    await generate("account-a");
    assert.equal(withConnectorConnections(home, store => store.targetOrigin(a!.connection_id)), "https://images.example");
    await settings.invoke(imagesActions.saveConnection, { ...config, id: connection.id, auth_connection_id: b!.connection_id });
    withConnectorConnections(home, store => store.disconnect(a!.connection_id));
    await generate("account-b");
    assert.deepEqual(seen, ["Bearer image-token-a", "Bearer image-token-b"]);
    assert.equal((await settings.invoke(imagesActions.connections, {})).connections[0]?.auth_connection_id, b!.connection_id);
  } finally {
    await imageHost.close();
    unbind();
    resetSecretStoreCache();
    if (previousBackend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND;
    else process.env.MOLIS_WORK_SECRET_BACKEND = previousBackend;
    rmSync(home, { recursive: true, force: true });
  }
});

test("Feed switching account creates a separate source and keeps the old history, plan and capture rule", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-connector-source-"));
  const home = join(directory, "home");
  const databasePath = join(home, "projects", "board.db");
  const previousBackend = process.env.MOLIS_WORK_SECRET_BACKEND;
  try {
    process.env.MOLIS_WORK_SECRET_BACKEND = "file";
    resetSecretStoreCache();
    mkdirSync(join(home, "projects"), { recursive: true });
    const catalog = new DatabaseSync(join(home, "projects", "catalog.db"));
    catalog.exec("CREATE TABLE projects (database_path TEXT NOT NULL)");
    catalog.prepare("INSERT INTO projects (database_path) VALUES (?)").run(databasePath);
    catalog.close();
    seedDemoBoard(databasePath);
    const board = new LocalProjectDatabase(databasePath);
    try {
      const [first, second] = withConnectorConnections(home, (store) => [
        store.createToken({ serviceId: "github", displayName: "账号 A", token: "github-token-account-a" }),
        store.createToken({ serviceId: "github", displayName: "账号 B", token: "github-token-account-b" }),
      ]);
      const feed = createLocalFeedApplication(board.db);
      const source = feed.sources.upsert({
        project_id: DEMO_PROJECT_ID, source_id: "github-source-original", kind: "github", definition_id: "github",
        sync_kind: "github", name: "GitHub A", description: "通知", status: "active", enabled: true,
        item_count: 0, origin: "molis_work", config: { connection_id: first!.connection_id },
        schedule: { mode: "interval", enabled: true, interval_minutes: 30, next_pull_at: "2026-09-24T12:00:00.000Z" },
        cursor: { after: "old-checkpoint" }, credential_ref: first!.credential_ref,
        account_label: "account-a", last_sync_at: "2026-09-24T10:00:00.000Z", last_outcome: "success",
        last_error_code: null, imported_at: "2026-09-24T09:00:00.000Z", updated_at: "2026-09-24T10:00:00.000Z",
      });
      const historical = feed.ingestItem({
        source, externalId: "account-a-message", title: "Old account message", summary: "Saved history",
        occurredAt: "2026-09-24T09:30:00.000Z", attention: false,
      }).item;
      const rule = feed.outRules.create(DEMO_PROJECT_ID, {
        name: "需要回应", match: { source_id: source.source_id, contains: "review" },
        enabled: true, admission: "suggest",
      });
      const service = createLocalFeedSourceService(board.db, DEMO_PROJECT_ID, undefined, undefined, home);
      const switched = service.update(source.source_id, { connection_id: second!.connection_id });
      assert.notEqual(switched.source_id, source.source_id);
      assert.equal(switched.credential_ref, second!.credential_ref);
      assert.deepEqual(switched.cursor, {});
      assert.equal(switched.schedule.mode, "interval");
      assert.equal(switched.item_count, 0);
      const old = feed.sources.get(DEMO_PROJECT_ID, source.source_id);
      assert.equal(old.status, "paused");
      assert.deepEqual(old.cursor, { after: "old-checkpoint" });
      assert.equal(feed.snapshot(DEMO_PROJECT_ID).feed_items.find((item) => item.item_id === historical.item_id)?.source_id, old.source_id);
      assert.equal(feed.outRules.list(DEMO_PROJECT_ID).filter((item) => item.match.source_id === switched.source_id).length, 1);
      assert.equal(feed.outRules.list(DEMO_PROJECT_ID).find((item) => item.rule_id === rule.rule_id)?.match.source_id, source.source_id);
      assert.equal(service.update(switched.source_id, { connection_id: second!.connection_id }).source_id, switched.source_id);
      withConnectorConnections(home, store => store.disconnect(second!.connection_id));
      refreshFeedConnectionState(home, second!.connection_id);
      // J3C-01: disconnection changes the error fact; reconnect clears it.
      assert.equal(feed.sources.get(DEMO_PROJECT_ID, switched.source_id).status, "disconnected");
      assert.equal(feed.sources.get(DEMO_PROJECT_ID, switched.source_id).last_error_code, "sources.connector_disconnected");
      assert.equal(feed.sources.get(DEMO_PROJECT_ID, source.source_id).status, "paused");
      withConnectorConnections(home, store => store.replaceToken(second!.connection_id, "github-token-account-b-rotated"));
      assert.equal(withConnectorConnections(home, store => store.state(store.require(second!.connection_id))), "connected");
      assert.equal(feed.sources.get(DEMO_PROJECT_ID, switched.source_id).enabled, true);
      refreshFeedConnectionState(home, second!.connection_id);
      assert.equal(feed.sources.get(DEMO_PROJECT_ID, switched.source_id).status, "active");
      assert.equal(feed.sources.get(DEMO_PROJECT_ID, switched.source_id).last_error_code, null);
      assert.deepEqual(feed.sources.get(DEMO_PROJECT_ID, switched.source_id).cursor, {});
    } finally { board.close(); }
  } finally {
    resetSecretStoreCache();
    if (previousBackend == null) delete process.env.MOLIS_WORK_SECRET_BACKEND;
    else process.env.MOLIS_WORK_SECRET_BACKEND = previousBackend;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("managed Gmail OAuth creates a named connection and refuses reauthorizing it as another mailbox", async t => {
  const home = mkdtempSync(join(tmpdir(), "molis-managed-gmail-"));
  const prior = { home: process.env.MOLIS_WORK_HOME, backend: process.env.MOLIS_WORK_SECRET_BACKEND };
  process.env.MOLIS_WORK_HOME = home;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  resetSecretStoreCache();
  const controlToken = "managed-gmail-test-control-token";
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  let mailbox = "a@example.com";
  const actualFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: mailbox.startsWith("a") ? "access-token-a" : "access-token-b", refresh_token: "refresh-token", expires_in: 3600 });
    if (url === "https://gmail.googleapis.com/gmail/v1/users/me/profile") return Response.json({ emailAddress: mailbox });
    return actualFetch(input, init);
  });
  const headers = () => ({ origin, "content-type": "application/json", "x-molis-work-control-token": controlToken,
    "x-molis-work-idempotency-key": crypto.randomUUID() });
  async function start(connectionId?: string) {
    const response = await fetch(`${origin}/api/settings/connectors/gmail/oauth/start`, { method: "POST", headers: headers(),
      body: JSON.stringify({ client_id: "test-client-id", redirect_uri: `${origin}/api/feed/connectors/gmail/oauth/callback`,
        manage_connection: true, display_name: "工作 Gmail", ...(connectionId ? { connection_id: connectionId } : {}) }) });
    assert.equal(response.status, 200);
    return response.json() as Promise<{ state: string; connection_id: string }>;
  }
  try {
    const first = await start();
    const callback = await fetch(`${origin}/api/feed/connectors/gmail/oauth/callback?state=${first.state}&code=first`);
    assert.equal(callback.status, 200);
    assert.ok(callback.url.includes(`connection=${first.connection_id}`));
    const list = await (await fetch(`${origin}/api/settings/connectors/connections?service_id=gmail`)).json() as {
      connections: Array<{ connection_id: string; display_name: string; account_label: string }>;
    };
    assert.equal(list.connections.length, 1);
    assert.equal(list.connections[0]?.connection_id, first.connection_id);
    assert.equal(list.connections[0]?.display_name, "工作 Gmail");
    assert.equal(list.connections[0]?.account_label, "a@example.com");
    assert.equal(withConnectorConnections(home, store => store.resolveToken(first.connection_id, "gmail")), "access-token-a");
    mailbox = "b@example.com";
    const second = await start(first.connection_id);
    const mismatch = await fetch(`${origin}/api/feed/connectors/gmail/oauth/callback?state=${second.state}&code=second`);
    assert.equal(mismatch.status, 200);
    assert.match(mismatch.url, /connector=gmail/);
    assert.match(mismatch.url, /connection_error=failed/);
    assert.equal(withConnectorConnections(home, store => store.resolveToken(first.connection_id, "gmail")), "access-token-a");
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    resetSecretStoreCache();
    if (prior.home === undefined) delete process.env.MOLIS_WORK_HOME; else process.env.MOLIS_WORK_HOME = prior.home;
    if (prior.backend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior.backend;
    rmSync(home, { recursive: true, force: true });
  }
});

test("managed Notion OAuth keeps workspace identity and the selected connection name", async t => {
  const home = mkdtempSync(join(tmpdir(), "molis-managed-notion-"));
  const prior = { home: process.env.MOLIS_WORK_HOME, backend: process.env.MOLIS_WORK_SECRET_BACKEND };
  process.env.MOLIS_WORK_HOME = home;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  resetSecretStoreCache();
  const controlToken = "managed-notion-test-control-token";
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  let workspace = "workspace-a";
  const actualFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "https://api.notion.com/v1/oauth/token") {
      return Response.json({ access_token: `notion-token-${workspace}`, refresh_token: "notion-refresh-token",
        workspace_id: workspace, workspace_name: workspace, bot_id: "bot-1" });
    }
    return actualFetch(input, init);
  });
  const headers = () => ({ origin, "content-type": "application/json", "x-molis-work-control-token": controlToken,
    "x-molis-work-idempotency-key": crypto.randomUUID() });
  async function start(connectionId?: string) {
    const response = await fetch(`${origin}/api/settings/connectors/notion/oauth/start`, { method: "POST", headers: headers(),
      body: JSON.stringify({ client_id: "notion-test-client", client_secret: "notion-test-secret", manage_connection: true,
        display_name: "Notion 工作区", ...(connectionId ? { connection_id: connectionId } : {}) }) });
    assert.equal(response.status, 200);
    const started = await response.json() as { authorizationUrl: string; connection_id: string };
    return { connectionId: started.connection_id, state: new URL(started.authorizationUrl).searchParams.get("state")! };
  }
  async function callback(state: string) {
    return fetch(`http://localhost:${address.port}/api/settings/connectors/notion/oauth/callback?state=${state}&code=code`);
  }
  try {
    const first = await start();
    const completed = await callback(first.state);
    assert.equal(completed.status, 200);
    assert.equal(withConnectorConnections(home, store => store.resolveToken(first.connectionId, "notion")), "notion-token-workspace-a");
    const saved = withConnectorConnections(home, store => store.require(first.connectionId));
    assert.equal(saved.display_name, "Notion 工作区");
    assert.equal(saved.account_label, "workspace-a");
    workspace = "workspace-b";
    const second = await start(first.connectionId);
    const mismatch = await callback(second.state);
    assert.equal(mismatch.status, 200);
    assert.match(mismatch.url, /connector=notion/);
    assert.match(mismatch.url, /connection_error=failed/);
    assert.equal(withConnectorConnections(home, store => store.resolveToken(first.connectionId, "notion")), "notion-token-workspace-a");
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    resetSecretStoreCache();
    if (prior.home === undefined) delete process.env.MOLIS_WORK_HOME; else process.env.MOLIS_WORK_HOME = prior.home;
    if (prior.backend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior.backend;
    rmSync(home, { recursive: true, force: true });
  }
});

// CONERR-01 / CONERR-02: real HTTP classification preserves authorization and masks private connection failures.
test("MCP settings keep authorization at 401 and missing connections as safe provider failures", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-mcp-refusal-"));
  const prior = { home: process.env.MOLIS_WORK_HOME, backend: process.env.MOLIS_WORK_SECRET_BACKEND };
  process.env.MOLIS_WORK_HOME = home; process.env.MOLIS_WORK_SECRET_BACKEND = "file"; resetSecretStoreCache();
  const controlToken = randomUUID();
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = "http://127.0.0.1:" + address.port;
  const headers = () => ({ origin, "content-type": "application/json", "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID() });
  try {
    const before = withConnectorConnections(home, store => store.list());
    const refused = await fetch(origin + "/api/settings/connectors/methods/mcp/complete", { method: "POST", headers: headers(),
      body: JSON.stringify({ returned_url: origin + "/api/settings/connectors/methods/mcp/callback?state=missing-state&code=unused" }) });
    assert.equal(refused.status, 401);
    assert.deepEqual(await refused.json(), { error: "MCP 授权会话无效、已取消、已过期或已使用，请重新连接", code: "connector.mcp.authorization" });
    const missing = await fetch(origin + "/api/settings/connectors/connections/missing-connection/mcp", { method: "POST", headers: headers(), body: JSON.stringify({ action: "inspect" }) });
    assert.equal(missing.status, 400);
    assert.deepEqual(await missing.json(), { error: "MCP 连接失败，请检查服务地址、账号权限和 OAuth 应用配置后重试", code: "connector.mcp.provider" });
    assert.deepEqual(withConnectorConnections(home, store => store.list()), before);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); resetSecretStoreCache();
    if (prior.home === undefined) delete process.env.MOLIS_WORK_HOME; else process.env.MOLIS_WORK_HOME = prior.home;
    if (prior.backend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior.backend;
    rmSync(home, { recursive: true, force: true });
  }
});

for (const service of ["gmail", "notion"] as const) test(`S-37 ASC-19 ASC-35 ${service} cancellation and stale callbacks preserve existing credentials`, { timeout: 30_000 }, async t => {
  const home = mkdtempSync(join(tmpdir(), `molis-${service}-cancel-`));
  const prior = { home: process.env.MOLIS_WORK_HOME, backend: process.env.MOLIS_WORK_SECRET_BACKEND };
  process.env.MOLIS_WORK_HOME = home; process.env.MOLIS_WORK_SECRET_BACKEND = "file"; resetSecretStoreCache();
  const controlToken = randomUUID();
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const actualFetch = globalThis.fetch;
  let hold = false, generation = 0, reached!: () => void, release!: () => void;
  let entered: Promise<void>, waiting: Promise<void>;
  function block() { hold = true; entered = new Promise<void>(resolve => { reached = resolve; }); waiting = new Promise<void>(resolve => { release = resolve; }); }
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token" || url === "https://api.notion.com/v1/oauth/token") {
      const issued = ++generation; if (hold) { reached(); await waiting; }
      return Response.json({ access_token: `fixture-access-${issued}`, refresh_token: `fixture-refresh-${issued}`, expires_in: 3600,
        workspace_id: "workspace", workspace_name: "Work", bot_id: "bot" });
    }
    if (url === "https://gmail.googleapis.com/gmail/v1/users/me/profile") return Response.json({ emailAddress: "work@example.test" });
    return actualFetch(input, init);
  });
  const headers = () => ({ origin, "content-type": "application/json", "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID() });
  async function start(connectionId?: string) {
    const response = await fetch(`${origin}/api/settings/connectors/${service}/oauth/start`, { method: "POST", headers: headers(), body: JSON.stringify({
      client_id: "fixture-app", client_secret: "fixture-secret", display_name: "Work", manage_connection: true,
      redirect_uri: `${origin}/api/feed/connectors/gmail/oauth/callback`, ...(connectionId ? { connection_id: connectionId } : {}) }) });
    assert.equal(response.status, 200);
    const result = await response.json() as { authorizationUrl: string; authorization_id: string; connection_id: string };
    const consent = new URL(result.authorizationUrl), redirect = new URL(consent.searchParams.get("redirect_uri")!);
    return { ...result, callback: redirect.href + `?state=${consent.searchParams.get("state")}&code=fixture-code` };
  }
  const complete = (attempt: Awaited<ReturnType<typeof start>>) => fetch(attempt.callback, { redirect: "manual" });
  const cancel = async (attempt: Awaited<ReturnType<typeof start>>) => {
    const response = await fetch(`${origin}/api/settings/connectors/authorizations/${attempt.authorization_id}`, { method: "DELETE", headers: headers() });
    assert.equal(response.status, 200); return response.json() as Promise<{ status: string }>;
  };
  try {
    const first = await start(); const connected = await complete(first);
    assert.match(connected.headers.get("location") ?? "", new RegExp(`connection=${first.connection_id}`));
    assert.equal(withConnectorConnections(home, store => store.resolveToken(first.connection_id, service)), "fixture-access-1");
    assert.equal((await cancel(first)).status, "connected", "a committed connection is not reported as rolled back");
    const reauth = await start(first.connection_id); block();
    const response = complete(reauth); await entered!;
    assert.equal((await cancel(reauth)).status, "cancelled"); release(); await response;
    assert.equal(withConnectorConnections(home, store => store.resolveToken(first.connection_id, service)), "fixture-access-1");
    assert.equal(runWithMolisWorkHome(home, () => createFileSecretStore().get(`connector-connection:${first.connection_id}:refresh`)), "fixture-refresh-1");
    const beforeReplay = generation; await complete(reauth); assert.equal(generation, beforeReplay);
    const fresh = await start(); block();
    const freshResponse = complete(fresh); await entered!; await cancel(fresh); release(); await freshResponse;
    assert.equal(withConnectorConnections(home, store => store.get(fresh.connection_id)), null);
    assert.equal(runWithMolisWorkHome(home, () => createFileSecretStore().get(`connector-connection:${fresh.connection_id}:access`)), null);
    for (const phase of ["consent", "exchange"]) {
      hold = false;
      const stale = await start(first.connection_id);
      let staleResponse: Promise<Response> | undefined;
      if (phase === "exchange") { block(); staleResponse = complete(stale); await entered!; }
      hold = false;
      const newer = await start(first.connection_id);
      const accepted = await complete(newer);
      assert.match(accepted.headers.get("location") ?? "", /connected=/);
      const current = withConnectorConnections(home, store => store.require(first.connection_id));
      const credentials = runWithMolisWorkHome(home, () => ["access", "refresh"].map(kind => createFileSecretStore().get(`connector-connection:${first.connection_id}:${kind}`)));
      release();
      const rejected = await (staleResponse ?? complete(stale));
      assert.match(rejected.headers.get("location") ?? "", /connection_error=failed/, `${phase}: stale authorization must be rejected`);
      assert.deepEqual(withConnectorConnections(home, store => store.require(first.connection_id)), current);
      assert.deepEqual(runWithMolisWorkHome(home, () => ["access", "refresh"].map(kind => createFileSecretStore().get(`connector-connection:${first.connection_id}:${kind}`))), credentials);
    }
  } finally {
    release?.(); await new Promise<void>(resolve => server.close(() => resolve())); resetSecretStoreCache();
    if (prior.home === undefined) delete process.env.MOLIS_WORK_HOME; else process.env.MOLIS_WORK_HOME = prior.home;
    if (prior.backend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior.backend;
    rmSync(home, { recursive: true, force: true });
  }
});
