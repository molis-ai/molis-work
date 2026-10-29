import { connectorControl } from "./fixtures/connector-control.js";
import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCatalogProvider, catalogWhoami, readExternalDocument } from "@molis-ai/molis-work-integration-catalog";
import { createFileSecretStore, resetSecretStoreCache, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { createCatalogConnector, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { feishuCliFetch, feishuCliStatus } from "../apps/local-host/dist/feishu-cli.js";
import { completeNotionOAuth, resolveUsableNotionToken, startNotionOAuth } from "../apps/local-host/dist/notion-oauth.js";
import { HOST_CONNECTOR_DIRECTORY } from "../apps/local-host/dist/connector-directory.js";
import { renderConnectorsSettings } from "../apps/workbench/dist/settings-connectors.js";

async function isolated<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "connector-oauth-choice-"));
  const keys = ["MOLIS_WORK_HOME", "MOLIS_WORK_SECRET_BACKEND", "MOLIS_WORK_ENCRYPTION_KEY", "MOLIS_WORK_FEISHU_CLI_PATH"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.MOLIS_WORK_HOME = directory;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  process.env.MOLIS_WORK_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");
  resetSecretStoreCache();
  try { return await run(directory); }
  finally {
    resetSecretStoreCache();
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    await rm(directory, { recursive: true, force: true });
  }
}

const NOTION_CONNECTION = "11111111-1111-4111-8111-111111111111";
function registerNotionConnection(directory: string) {
  withConnectorConnections(directory, store => store.upsertOAuth({ connectionId: NOTION_CONNECTION, serviceId: "notion", displayName: "Work",
    accessRef: `connector-connection:${NOTION_CONNECTION}:access`, refreshRef: `connector-connection:${NOTION_CONNECTION}:refresh` }));
}

test("Notion OAuth rejects wrong state, exchanges code into its connection, and refreshes on demand", async () => isolated(async directory => {
  const started = startNotionOAuth({ origin: "http://127.0.0.1:8787", clientId: "client-id", clientSecret: "client-secret", connectionId: NOTION_CONNECTION });
  const auth = new URL(started.authorizationUrl);
  assert.equal(auth.origin, "https://api.notion.com");
  assert.equal(auth.searchParams.get("redirect_uri"), "http://localhost:8787/api/settings/connectors/notion/oauth/callback");
  const state = auth.searchParams.get("state")!;
  const callbackUrl = new URL(`${started.redirectUri}?code=code-1&state=${state}`);
  let exchanges = 0;
  const fetchImpl: typeof fetch = async (_url, init) => {
    exchanges++;
    assert.equal((init?.headers as Record<string, string>).Authorization, `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`);
    const body = JSON.parse(String(init?.body)) as { grant_type: string; code?: string; refresh_token?: string };
    assert.equal(body.grant_type, exchanges === 1 ? "authorization_code" : "refresh_token");
    if (exchanges === 1) assert.equal(body.code, "code-1");
    else assert.equal(body.refresh_token, "refresh-1");
    return Response.json({ access_token: `access-${exchanges}`, refresh_token: `refresh-${exchanges}`, workspace_id: "workspace-1", workspace_name: "Demo", bot_id: "bot-1" });
  };
  await assert.rejects(() => completeNotionOAuth({ code: "code-1", state: "wrong", callbackUrl, fetchImpl }), /状态不匹配/);
  assert.equal(exchanges, 0);
  assert.equal((await completeNotionOAuth({ code: "code-1", state, callbackUrl, fetchImpl })).connectionId, NOTION_CONNECTION);
  registerNotionConnection(directory);
  assert.equal(await resolveUsableNotionToken(NOTION_CONNECTION, connectorControl()), "access-1");
  assert.equal(await resolveUsableNotionToken(NOTION_CONNECTION, connectorControl(), true, fetchImpl), "access-2");
  assert.equal(createFileSecretStore().get(`connector-connection:${NOTION_CONNECTION}:refresh`), "refresh-2");
  assert.equal(createFileSecretStore().get("connector:notion:token"), null, "tokens live only under the connection");
}));

test("concurrent Notion refreshes share a request only within the same Home", async () => isolated(async directory => {
  const homes = [join(directory, "alpha"), join(directory, "beta")];
  for (const [index, home] of homes.entries()) runWithMolisWorkHome(home, () => {
    const store = createFileSecretStore();
    store.put("connector:notion:client_id", "fixture-client");
    store.put("connector:notion:client_secret", "fixture-secret");
    store.put(`connector-connection:${NOTION_CONNECTION}:refresh`, `refresh-${index}`);
    store.put(`connector-connection:${NOTION_CONNECTION}:access`, `access-${index}`);
    registerNotionConnection(home);
    store.delete(`connector-connection:${NOTION_CONNECTION}:access`);
  });
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const requests: string[] = [];
  const fetchImpl: typeof fetch = async (_url, init) => {
    const token = JSON.parse(String(init?.body)).refresh_token as string;
    requests.push(token);
    await waiting;
    return Response.json({ access_token: `access-for-${token}`, refresh_token: `rotated-${token}`, workspace_id: token, workspace_name: token, bot_id: token });
  };
  const pending = homes.flatMap(home => [0, 1].map(() => runWithMolisWorkHome(home, () => resolveUsableNotionToken(NOTION_CONNECTION, connectorControl(), true, fetchImpl))));
  release();
  assert.deepEqual(await Promise.all(pending), ["access-for-refresh-0", "access-for-refresh-0", "access-for-refresh-1", "access-for-refresh-1"]);
  assert.deepEqual(requests.sort(), ["refresh-0", "refresh-1"]);
  for (const [index, home] of homes.entries()) runWithMolisWorkHome(home, () => {
    assert.equal(createFileSecretStore().get(`connector-connection:${NOTION_CONNECTION}:refresh`), `rotated-refresh-${index}`);
    assert.equal(createFileSecretStore().get(`connector-connection:${NOTION_CONNECTION}:access`), `access-for-refresh-${index}`);
  });
}));

// FI-C-02 reversed by W5-11 slice 5 (RAC-1085; 用户 10-27 定：只存新令牌): a sent refresh is not aborted when its callers leave, since a
// service that rotates refresh tokens may already have retired the old one; when every caller cancelled, only the rotated tokens are kept.
test("FI-C-02 RAC-1085 Notion shared refresh isolates either caller's cancellation, and when both leave the sent request still ends and only its tokens are kept", async t => {
  for (const cancelled of [0, 1, "both"] as const) await t.test(`cancel ${cancelled}`, async () => isolated(async directory => {
    const refs = `connector-connection:${NOTION_CONNECTION}`;
    const store = createFileSecretStore();
    store.put("connector:notion:client_id", "fixture-client");
    store.put("connector:notion:client_secret", "fixture-secret");
    store.put(`${refs}:refresh`, "original-refresh");
    store.put(`${refs}:access`, "expired-access");
    registerNotionConnection(directory);
    store.delete(`${refs}:access`);
    const revision = withConnectorConnections(directory, connections => connections.require(NOTION_CONNECTION).updated_at);
    let release!: () => void, sent!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const dispatched = new Promise<void>(resolve => { sent = resolve; });
    const requests: string[] = [], signals: AbortSignal[] = [];
    const originalFetch = globalThis.fetch;
    const fetchImpl: typeof fetch = async (url, init) => {
      requests.push(String(url));
      if (String(url).endsWith("/oauth/token")) {
        signals.push(init!.signal!);
        sent();
        await waiting;
        return Response.json({ access_token: "fresh-access", refresh_token: "fresh-refresh", workspace_id: "work", workspace_name: "Work", bot_id: "bot" });
      }
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fresh-access");
      return String(url).endsWith("/users/me") ? Response.json({ id: "bot", name: "Bot" }) : Response.json({ results: [] });
    };
    globalThis.fetch = fetchImpl;
    try {
      const provider = createCatalogConnector({ connectorId: "notion", connectionId: NOTION_CONNECTION, fetchImpl });
      const controllers = [new AbortController(), new AbortController()];
      const controls = controllers.map(controller => connectorControl({ signal: controller.signal }));
      const first = provider.sync({ cursor: {} }, controls[0]!);
      await dispatched;
      const second = provider.sync({ cursor: {} }, controls[1]!);
      // Drain the resolver's microtasks: both calls have entered the same pending refresh, with no second request.
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(requests.length, 1);
      const results = Promise.allSettled([first, second]);
      if (cancelled === "both") controllers.forEach(controller => controller.abort(new Error("caller cancelled")));
      else controllers[cancelled]!.abort(new Error("caller cancelled"));
      assert.equal(signals[0]!.aborted, false, "a sent refresh is not aborted, whoever leaves");
      release();
      const settled = await results;
      for (const [index, result] of settled.entries()) {
        if (cancelled === "both" || index === cancelled) {
          assert.equal(result.status, "rejected");
          if (result.status === "rejected") assert.equal(result.reason, controllers[index]!.signal.reason);
        } else {
          assert.equal(result.status, "fulfilled");
          if (result.status === "fulfilled") assert.equal(result.value.ok, true, "a live caller is not misreported as needs_auth");
        }
      }
      assert.equal(requests.filter(url => url.endsWith("/oauth/token")).length, 1, "normal refresh deduplication remains");
      // Both cancelled too: the rotated tokens are written back to the connection, so its next refresh sends the new refresh token.
      assert.equal(store.get(`${refs}:access`), "fresh-access");
      assert.equal(store.get(`${refs}:refresh`), "fresh-refresh");
      assert.equal(withConnectorConnections(directory, connections => connections.require(NOTION_CONNECTION).updated_at), revision);
      if (cancelled === "both") {
        assert.equal(requests.length, 1, "no API read or retry after the last caller leaves");
        assert.equal(store.get(`${refs}:workspace`), null, "nothing but the tokens is written for an answer nobody waits for");
      }
    } finally { release(); globalThis.fetch = originalFetch; }
  }));
});

/** One connection as the shared-refresh cases start: client credentials, the original refresh token, no access token. */
function seedNotionRefresh(directory: string) {
  const refs = `connector-connection:${NOTION_CONNECTION}`;
  const store = createFileSecretStore();
  store.put("connector:notion:client_id", "fixture-client");
  store.put("connector:notion:client_secret", "fixture-secret");
  store.put(`${refs}:refresh`, "original-refresh");
  store.put(`${refs}:access`, "expired-access");
  registerNotionConnection(directory);
  store.delete(`${refs}:access`);
  const revision = () => withConnectorConnections(directory, connections => connections.require(NOTION_CONNECTION).updated_at);
  return { store, refs, revision };
}

/** A token endpoint that holds each request until the test releases it and ignores abort, answering request n with access-n and refresh-n. */
function heldTokenEndpoint() {
  const requests: Array<{ refreshToken: string; signal: AbortSignal; release: () => void }> = [];
  let arrived = () => {};
  const fetchImpl: typeof fetch = async (_url, init) => {
    const index = requests.length;
    const held = new Promise<void>(resolve => requests.push({ refreshToken: JSON.parse(String(init?.body)).refresh_token as string, signal: init!.signal!, release: resolve }));
    arrived();
    await held;
    return Response.json({ access_token: `access-${index}`, refresh_token: `refresh-${index}`, workspace_id: "work", workspace_name: "Work", bot_id: "bot" });
  };
  return { requests, fetch: fetchImpl, next: () => new Promise<void>(resolve => { arrived = resolve; }), releaseAll: () => requests.forEach(request => request.release()) };
}

test("FI-C-02 RAC-1085 an answer nobody waits for keeps only the rotated tokens, and the next refresh sends the rotated refresh token", async () => isolated(async directory => {
  // 用户 10-27 定：只存新令牌 (W5-11 §2.6). Before slice 5 the last caller leaving aborted the request and the answer was dropped.
  const { store, refs, revision } = seedNotionRefresh(directory);
  const before = revision(), endpoint = heldTokenEndpoint();
  try {
    const controllers = [new AbortController(), new AbortController()];
    const sent = endpoint.next();
    const leaving = controllers.map(controller => resolveUsableNotionToken(NOTION_CONNECTION, connectorControl({ signal: controller.signal }), true, endpoint.fetch));
    await sent;
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(endpoint.requests.length, 1);
    const settled = Promise.allSettled(leaving);
    controllers.forEach(controller => controller.abort(new Error("caller cancelled")));
    assert.equal(endpoint.requests[0]!.signal.aborted, false, "the last caller leaving does not end a sent request");
    endpoint.requests[0]!.release();
    for (const [index, result] of (await settled).entries()) {
      assert.equal(result.status, "rejected");
      if (result.status === "rejected") assert.equal(result.reason, controllers[index]!.signal.reason);
    }
    // A cancelled caller is answered once the shared refresh it left has ended, so its answer has been handled when these are read.
    assert.equal(store.get(`${refs}:access`), "access-0");
    assert.equal(store.get(`${refs}:refresh`), "refresh-0");
    assert.equal(store.get(`${refs}:workspace`), null);
    assert.equal(revision(), before);
    const sentAgain = endpoint.next();
    const next = resolveUsableNotionToken(NOTION_CONNECTION, connectorControl(), true, endpoint.fetch);
    await sentAgain;
    endpoint.requests[1]!.release();
    assert.equal(await next, "access-1");
    assert.deepEqual(endpoint.requests.map(request => request.refreshToken), ["original-refresh", "refresh-0"]);
  } finally { endpoint.releaseAll(); }
}));

test("FI-C-02 RAC-1085 a call arriving after both callers left joins the sent refresh and is answered by it", async () => isolated(async directory => {
  const { store, refs, revision } = seedNotionRefresh(directory);
  const before = revision(), endpoint = heldTokenEndpoint();
  try {
    const controllers = [new AbortController(), new AbortController()];
    const sent = endpoint.next();
    const leaving = controllers.map(controller => resolveUsableNotionToken(NOTION_CONNECTION, connectorControl({ signal: controller.signal }), true, endpoint.fetch));
    await sent;
    await new Promise<void>(resolve => setImmediate(resolve));
    const settled = Promise.allSettled(leaving);
    controllers.forEach(controller => controller.abort(new Error("caller cancelled")));
    // Before the answer comes back a third call arrives: it joins the refresh still in flight, with no second request.
    const third = resolveUsableNotionToken(NOTION_CONNECTION, connectorControl(), true, endpoint.fetch);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(endpoint.requests.length, 1);
    endpoint.requests[0]!.release();
    assert.equal(await third, "access-0");
    for (const result of await settled) assert.equal(result.status, "rejected");
    // A participant still waits, so the answer is written as usual.
    assert.equal(store.get(`${refs}:access`), "access-0");
    assert.equal(store.get(`${refs}:refresh`), "refresh-0");
    assert.equal(JSON.parse(store.get(`${refs}:workspace`)!).id, "work");
    assert.equal(revision(), before);
    assert.equal(endpoint.requests.length, 1);
  } finally { endpoint.releaseAll(); }
}));

test("FI-C-02 a shared refresh a caller still awaits writes nothing when the refresh token or the connection changes meanwhile", async t => {
  for (const change of ["refresh", "revision"] as const) await t.test(change, async () => isolated(async directory => {
    const { store, refs, revision } = seedNotionRefresh(directory);
    const endpoint = heldTokenEndpoint();
    try {
      const leaving = new AbortController();
      const sent = endpoint.next();
      const calls = [connectorControl({ signal: leaving.signal }), connectorControl()].map(control => resolveUsableNotionToken(NOTION_CONNECTION, control, true, endpoint.fetch));
      await sent;
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(endpoint.requests.length, 1);
      const settled = Promise.allSettled(calls);
      leaving.abort(new Error("caller cancelled"));
      assert.equal(endpoint.requests[0]!.signal.aborted, false, "the caller still waiting keeps the shared request");
      if (change === "refresh") store.put(`${refs}:refresh`, "replaced-refresh");
      else withConnectorConnections(directory, connections => { connections.setEnabled(NOTION_CONNECTION, false); connections.setEnabled(NOTION_CONNECTION, true); });
      const changed = revision();
      endpoint.requests[0]!.release();
      const [left, stayed] = await settled;
      assert.equal(left!.status, "rejected");
      if (left!.status === "rejected") assert.equal(left!.reason, leaving.signal.reason);
      // The caller still waiting is refused by the current rule: a changed refresh token, or a changed connection revision.
      assert.equal(stayed!.status, "rejected");
      if (stayed!.status === "rejected") {
        assert.equal((stayed!.reason as Error).message, change === "refresh" ? "Notion 连接在刷新期间已改变，请重试" : "连接在刷新期间已变化，请重试");
      }
      assert.equal(store.get(`${refs}:access`), null);
      assert.equal(store.get(`${refs}:refresh`), change === "refresh" ? "replaced-refresh" : "original-refresh");
      assert.equal(store.get(`${refs}:workspace`), null);
      assert.equal(revision(), changed, "the refused refresh does not touch the connection");
      assert.equal(endpoint.requests.length, 1);
    } finally { endpoint.releaseAll(); }
  }));
});

test("Notion feed refreshes after an API 401 and retries with the new token", async () => {
  let refreshes = 0;
  const seen: string[] = [];
  const provider = createCatalogProvider({
    connectorId: "notion",
    resolveToken: (force) => {
      if (force) refreshes++;
      return force ? "fresh-token" : "stale-token";
    },
    fetchImpl: async (url, init) => {
      const authorization = (init?.headers as Record<string, string>).Authorization;
      seen.push(authorization);
      if (authorization === "Bearer stale-token") return Response.json({ message: "expired" }, { status: 401 });
      if (String(url).endsWith("/users/me")) return Response.json({ id: "bot-1", name: "Demo" });
      return Response.json({ results: [] });
    },
  });
  const result = await provider.sync({ cursor: {} }, connectorControl());
  assert.equal(result.ok, true);
  assert.equal(refreshes, 1);
  assert.deepEqual(seen, ["Bearer stale-token", "Bearer fresh-token", "Bearer fresh-token"]);
});

test("Feishu CLI mode reads identity and document without copying its user token", async () => isolated(async (directory) => {
  const executable = join(directory, "fake-lark-cli");
  await writeFile(executable, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "auth" && args[1] === "status") console.log(JSON.stringify({ok:true,identity:"user",identities:{user:{available:true,name:"Ada"}}}));
else if (args[0] === "api" && args[1] === "GET") {
 const path = args[2];
 if (path.endsWith("/wiki/v2/spaces/get_node")) { console.log(JSON.stringify({ok:true,data:{code:99991672,msg:"permission denied"}})); process.exit(0); }
 const data = path.endsWith("/user_info") ? {name:"Ada"} : path.endsWith("/raw_content") ? {content:"Document body"} : path.includes("/documents/") ? {document:{document_id:"abcdefghij",title:"Notes"}} : {items:[{chat_id:"chat1",name:"Team"}]};
 console.log(JSON.stringify({ok:true,data:{code:0,data}}));
} else process.exit(1);
`);
  await chmod(executable, 0o755);
  process.env.MOLIS_WORK_FEISHU_CLI_PATH = executable;
  assert.equal(feishuCliStatus().authorized, true);
  const whoami = await catalogWhoami({ connectorId: "feishu", token: "lark-cli", fetchImpl: feishuCliFetch });
  assert.deepEqual(whoami, { ok: true, login: "Ada" });
  const provider = createCatalogProvider({ connectorId: "feishu", token: "lark-cli", fetchImpl: feishuCliFetch });
  const synced = await provider.sync({ cursor: {} }, connectorControl());
  assert.equal(synced.ok, true);
  if (synced.ok) assert.equal(synced.items[0]?.title, "Team");
  const document = await readExternalDocument({ source: "feishu", url: "https://example.feishu.cn/docx/abcdefghij" }, { token: "lark-cli", fetch: feishuCliFetch });
  assert.equal(document.content, "Document body");
  const denied = await feishuCliFetch("https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token=abcdefghij");
  assert.equal(denied.status, 401);
  await assert.rejects(() => feishuCliFetch("https://open.feishu.cn/open-apis/im/v1/messages", { method: "POST" }), /只读接口/);
  assert.equal(createFileSecretStore().get("connector:feishu:token"), null, "the CLI's user token is never copied");
}));

test("settings show the available method choices for Gmail, Notion, and Feishu", () => {
  const cards = [
    { connector_id: "gmail", title: "Gmail", auth_kind: "gmail", group_id: "mail" },
    { connector_id: "notion", title: "Notion", auth_kind: "notion", group_id: "files" },
    { connector_id: "feishu", title: "飞书", auth_kind: "feishu", group_id: "chat" },
  ] as const;
  const html = renderConnectorsSettings({ connectors: cards.map((card) => ({
    ...card, method_options: HOST_CONNECTOR_DIRECTORY.find(row => row.connector_id === card.connector_id)!.method_options, availability: "live" as const, summary: card.title,
  })) }, { L: (value) => value, escapeHtml: (value) => String(value ?? ""), icon: () => "" });
  for (const marker of ["data-protocol-start=\"oauth\"", "data-connector-token=\"gmail\"", "data-connector-token=\"notion\"", "data-cli-login", 'data-connector-auth="feishu" data-credential-separator=":"']) assert.ok(html.includes(marker), marker);
  assert.match(html, /data-credential-part type="text"[^>]*placeholder="cli_…"/);
  assert.match(html, /应用密钥<\/span><input[^>]+data-credential-part type="password"/);
});
