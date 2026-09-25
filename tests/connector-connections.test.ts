import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ConnectorConnectionStore, withConnectorConnections } from "../apps/local-host/src/connector-connection-store.ts";
import { createLocalFeedApplication, createLocalFeedSourceService, DEMO_BOARD_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { ImagesHostService } from "../apps/local-host/src/images-service-host.ts";
import { refreshFeedConnectionState } from "../apps/local-host/src/web-connector-connections.ts";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.ts";

const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";

test("one service keeps two independent credentials and bindings never cross services", () => {
  const db = new DatabaseSync(":memory:");
  const values = new Map<string, string>();
  const store = new ConnectorConnectionStore(db, {
    get: (ref) => values.get(ref) ?? null,
    put: (ref, value) => { values.set(ref, value); },
    delete: (ref) => { values.delete(ref); },
  });
  try {
    const first = store.createToken({ serviceId: "gmail", displayName: "工作邮箱", token: "gmail-work-token" });
    const second = store.createToken({ serviceId: "gmail", displayName: "个人邮箱", token: "gmail-home-token" });
    assert.notEqual(first.connection_id, second.connection_id);
    assert.notEqual(first.credential_ref, second.credential_ref);
    assert.equal(store.resolveToken(first.connection_id, "gmail"), "gmail-work-token");
    assert.equal(store.resolveToken(second.connection_id, "gmail"), "gmail-home-token");
    assert.throws(() => store.resolveToken(first.connection_id, "github"), /不属于这个服务/);
    store.bind({ scopeId: "project-a", pluginId: "feed", slotId: "inbox", serviceId: "gmail", connectionId: second.connection_id });
    assert.equal(store.binding("project-a", "feed", "inbox")?.connection_id, second.connection_id);
    store.disconnect(first.connection_id);
    assert.equal(store.state(store.require(first.connection_id)), "disconnected");
    assert.equal(store.resolveToken(second.connection_id, "gmail"), "gmail-home-token");
    assert.equal(JSON.stringify(store.list()).includes("gmail-home-token"), false);
  } finally { db.close(); }
});

test("old fixed secret is adopted once without copying or replacing it", () => {
  const db = new DatabaseSync(":memory:");
  const values = new Map([["connector:github:token", "old-github-token"]]);
  const store = new ConnectorConnectionStore(db, {
    get: (ref) => values.get(ref) ?? null,
    put: (ref, value) => { values.set(ref, value); },
    delete: (ref) => { values.delete(ref); },
  });
  try {
    const first = store.adoptLegacy({ serviceId: "github", displayName: "原有连接", credentialRef: "connector:github:token" });
    const again = store.adoptLegacy({ serviceId: "github", displayName: "原有连接", credentialRef: "connector:github:token" });
    assert.equal(first?.connection_id, again?.connection_id);
    assert.equal(store.list("github").length, 1);
    assert.equal(values.get("connector:github:token"), "old-github-token");
  } finally { db.close(); }
});

test("API and MCP credentials pin their first destination origin and reject a different host", () => {
  const db = new DatabaseSync(":memory:");
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

test("Images uses the chosen Connector credential for each generation and survives another account disconnect", async t => {
  const home = mkdtempSync(join(tmpdir(), "molis-image-connector-"));
  const previousBackend = process.env.MOLIS_WORK_SECRET_BACKEND;
  const imageHost = new ImagesHostService(home);
  const seen: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, options: RequestInit) => {
    seen.push(String((options.headers as Record<string, string>).authorization));
    return new Response(JSON.stringify({ data: [{ b64_json: PIXEL }] }), { status: 200, headers: { "content-type": "application/json" } });
  });
  try {
    process.env.MOLIS_WORK_SECRET_BACKEND = "file";
    resetSecretStoreCache();
    const [a, b] = withConnectorConnections(home, store => [
      store.createToken({ serviceId: "image-api", displayName: "图片账号 A", token: "image-token-a" }),
      store.createToken({ serviceId: "image-api", displayName: "图片账号 B", token: "image-token-b" }),
    ]);
    const images = imageHost.get();
    const config = { name: "生图服务", api_format: "openai-images" as const, base_url: "https://images.example/v1", model: "image-model" };
    const connection = images.saveConnection({ ...config, auth_connection_id: a!.connection_id });
    async function generate(requestId: string) {
      const job = images.start("board-one", { request_id: requestId, connection_id: connection.id, prompt: "一张图" });
      for (let i = 0; i < 100 && images.getJob("board-one", job.id).status === "running"; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal(images.getJob("board-one", job.id).status, "succeeded");
    }
    await generate("account-a");
    assert.equal(withConnectorConnections(home, store => store.targetOrigin(a!.connection_id)), "https://images.example");
    images.saveConnection({ ...config, id: connection.id, auth_connection_id: b!.connection_id });
    withConnectorConnections(home, store => store.disconnect(a!.connection_id));
    await generate("account-b");
    assert.deepEqual(seen, ["Bearer image-token-a", "Bearer image-token-b"]);
    assert.equal(images.listConnections()[0]?.auth_connection_id, b!.connection_id);
  } finally {
    await imageHost.close();
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
      const source = feed.upsertSource({
        board_id: DEMO_BOARD_ID, source_id: "github-source-original", kind: "github", definition_id: "github",
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
      const rule = feed.createOutRule(DEMO_BOARD_ID, {
        name: "需要回应", match: { source_id: source.source_id, contains: "review" },
        enabled: true, admission: "suggest",
      });
      const service = createLocalFeedSourceService(board.db, DEMO_BOARD_ID, undefined, undefined, home);
      const switched = service.update(source.source_id, { connection_id: second!.connection_id });
      assert.notEqual(switched.source_id, source.source_id);
      assert.equal(switched.credential_ref, second!.credential_ref);
      assert.deepEqual(switched.cursor, {});
      assert.equal(switched.schedule.mode, "interval");
      assert.equal(switched.item_count, 0);
      const old = feed.getSource(DEMO_BOARD_ID, source.source_id);
      assert.equal(old.status, "paused");
      assert.deepEqual(old.cursor, { after: "old-checkpoint" });
      assert.equal(feed.snapshot(DEMO_BOARD_ID).feed_items.find((item) => item.item_id === historical.item_id)?.source_id, old.source_id);
      assert.equal(feed.listOutRules(DEMO_BOARD_ID).filter((item) => item.match.source_id === switched.source_id).length, 1);
      assert.equal(feed.listOutRules(DEMO_BOARD_ID).find((item) => item.rule_id === rule.rule_id)?.match.source_id, source.source_id);
      assert.equal(service.update(switched.source_id, { connection_id: second!.connection_id }).source_id, switched.source_id);
      withConnectorConnections(home, store => store.disconnect(second!.connection_id));
      refreshFeedConnectionState(home, second!.connection_id);
      assert.equal(feed.getSource(DEMO_BOARD_ID, switched.source_id).status, "disconnected");
      assert.equal(feed.getSource(DEMO_BOARD_ID, source.source_id).status, "paused");
      withConnectorConnections(home, store => store.replaceToken(second!.connection_id, "github-token-account-b-rotated"));
      assert.equal(withConnectorConnections(home, store => store.state(store.require(second!.connection_id))), "connected");
      assert.equal(feed.getSource(DEMO_BOARD_ID, switched.source_id).enabled, true);
      refreshFeedConnectionState(home, second!.connection_id);
      assert.equal(feed.getSource(DEMO_BOARD_ID, switched.source_id).status, "active");
      assert.deepEqual(feed.getSource(DEMO_BOARD_ID, switched.source_id).cursor, {});
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
    assert.equal(mismatch.status, 400);
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
    assert.equal((await callback(second.state)).status, 400);
    assert.equal(withConnectorConnections(home, store => store.resolveToken(first.connectionId, "notion")), "notion-token-workspace-a");
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    resetSecretStoreCache();
    if (prior.home === undefined) delete process.env.MOLIS_WORK_HOME; else process.env.MOLIS_WORK_HOME = prior.home;
    if (prior.backend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior.backend;
    rmSync(home, { recursive: true, force: true });
  }
});
