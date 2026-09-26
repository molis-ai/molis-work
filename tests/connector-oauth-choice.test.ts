import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCatalogProvider, catalogWhoami, readExternalDocument } from "@molis-ai/molis-work-integration-catalog";
import { createFileSecretStore, resetSecretStoreCache, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { bindConnectorToken, bindFeishuCli, clearGmailOAuthForManualToken, connectorCredentialStatus, resolveConnectorToken, unbindConnectorToken } from "../apps/local-host/src/connector-credentials.ts";
import { feishuCliFetch, feishuCliStatus } from "../apps/local-host/src/feishu-cli.ts";
import { completeNotionOAuth, resolveUsableNotionToken, startNotionOAuth } from "../apps/local-host/src/notion-oauth.ts";
import { HOST_CONNECTOR_DIRECTORY } from "../apps/local-host/src/connector-directory.ts";
import { renderConnectorsSettings } from "../apps/workbench/src/settings-connectors.ts";

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

test("Notion OAuth rejects wrong state, exchanges code, refreshes on demand, and yields to manual token", async () => isolated(async () => {
  const started = startNotionOAuth({ origin: "http://127.0.0.1:8787", clientId: "client-id", clientSecret: "client-secret" });
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
  await completeNotionOAuth({ code: "code-1", state, callbackUrl, fetchImpl });
  assert.equal(await resolveUsableNotionToken(), "access-1");
  assert.equal(await resolveUsableNotionToken(true, fetchImpl), "access-2");
  assert.equal(createFileSecretStore().get("connector:notion:refresh"), "refresh-2");
  bindConnectorToken("notion", "ntn_manual_123456");
  assert.equal(resolveConnectorToken("notion"), "ntn_manual_123456");
  assert.equal(createFileSecretStore().get("connector:notion:refresh"), null);
  unbindConnectorToken("notion");
  assert.equal(connectorCredentialStatus("notion").bound, false);
}));

test("concurrent Notion refreshes share a request only within the same Home", async () => isolated(async directory => {
  const homes = [join(directory, "alpha"), join(directory, "beta")];
  for (const [index, home] of homes.entries()) runWithMolisWorkHome(home, () => {
    const store = createFileSecretStore();
    store.put("connector:notion:client_id", "fixture-client");
    store.put("connector:notion:client_secret", "fixture-secret");
    store.put("connector:notion:refresh", `refresh-${index}`);
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
  const pending = homes.flatMap(home => [0, 1].map(() => runWithMolisWorkHome(home, () => resolveUsableNotionToken(true, fetchImpl))));
  release();
  assert.deepEqual(await Promise.all(pending), ["access-for-refresh-0", "access-for-refresh-0", "access-for-refresh-1", "access-for-refresh-1"]);
  assert.deepEqual(requests.sort(), ["refresh-0", "refresh-1"]);
  for (const [index, home] of homes.entries()) runWithMolisWorkHome(home, () => {
    assert.equal(createFileSecretStore().get("connector:notion:refresh"), `rotated-refresh-${index}`);
    assert.equal(createFileSecretStore().get("connector:notion:token"), `access-for-refresh-${index}`);
  });
}));

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
  const result = await provider.sync({ cursor: {} });
  assert.equal(result.ok, true);
  assert.equal(refreshes, 1);
  assert.deepEqual(seen, ["Bearer stale-token", "Bearer fresh-token", "Bearer fresh-token"]);
});

test("Gmail OAuth token persistence keeps refresh; choosing manual token clears its refresh session", async () => isolated(async () => {
  const store = createFileSecretStore();
  store.put("connector:gmail:refresh", "refresh-current");
  store.put("connector:gmail:token_expires_at", "2026-10-01T00:00:00Z");
  const state = "samplePendingState1234567890";
  store.put("connector:gmail:oauth:pending:index", JSON.stringify([{ state, createdAt: new Date().toISOString() }]));
  store.put(`connector:gmail:oauth:pending:${state}`, "pending");
  bindConnectorToken("gmail", "ya29_oauth_access_token");
  assert.equal(store.get("connector:gmail:refresh"), "refresh-current");
  bindConnectorToken("gmail", "ya29_manual_access_token");
  clearGmailOAuthForManualToken();
  assert.equal(resolveConnectorToken("gmail"), "ya29_manual_access_token");
  assert.equal(store.get("connector:gmail:refresh"), null);
  assert.equal(store.get(`connector:gmail:oauth:pending:${state}`), null);
}));

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
  bindFeishuCli();
  assert.equal(resolveConnectorToken("feishu"), "lark-cli");
  assert.equal(createFileSecretStore().get("connector:feishu:token"), null);
  const whoami = await catalogWhoami({ connectorId: "feishu", token: "lark-cli", fetchImpl: feishuCliFetch });
  assert.deepEqual(whoami, { ok: true, login: "Ada" });
  const provider = createCatalogProvider({ connectorId: "feishu", token: "lark-cli", fetchImpl: feishuCliFetch });
  const synced = await provider.sync({ cursor: {} });
  assert.equal(synced.ok, true);
  if (synced.ok) assert.equal(synced.items[0]?.title, "Team");
  const document = await readExternalDocument({ source: "feishu", url: "https://example.feishu.cn/docx/abcdefghij" }, { token: "lark-cli", fetch: feishuCliFetch });
  assert.equal(document.content, "Document body");
  const denied = await feishuCliFetch("https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token=abcdefghij");
  assert.equal(denied.status, 401);
  await assert.rejects(() => feishuCliFetch("https://open.feishu.cn/open-apis/im/v1/messages", { method: "POST" }), /只读接口/);
  bindConnectorToken("feishu", "cli_app:app-secret-123");
  assert.equal(createFileSecretStore().get("connector:feishu:auth_mode"), null);
  assert.equal(resolveConnectorToken("feishu"), "cli_app:app-secret-123");
}));

test("settings show the available method choices for Gmail, Notion, and Feishu", () => {
  const cards = [
    { connector_id: "gmail", title: "Gmail", auth_kind: "gmail", group_id: "mail" },
    { connector_id: "notion", title: "Notion", auth_kind: "notion", group_id: "files" },
    { connector_id: "feishu", title: "飞书", auth_kind: "feishu", group_id: "chat" },
  ] as const;
  const html = renderConnectorsSettings({ connectors: cards.map((card) => ({
    ...card, method_options: HOST_CONNECTOR_DIRECTORY.find(row => row.connector_id === card.connector_id)!.method_options, availability: "live" as const, summary: card.title, account_state: "disconnected" as const,
  })) }, { L: (value) => value, escapeHtml: (value) => String(value ?? ""), icon: () => "" });
  for (const marker of ["data-protocol-start=\"oauth\"", "data-connector-token=\"gmail\"", "data-connector-token=\"notion\"", "data-cli-login", "data-connector-token=\"feishu\""]) assert.ok(html.includes(marker), marker);
});
