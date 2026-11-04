import { connectorControl } from "./fixtures/connector-control.js";
import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCatalogProvider, catalogWhoami, readExternalDocument } from "@molis-ai/molis-work-integration-catalog";
import { createFileSecretStore, resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { feishuCliFetch, feishuCliStatus } from "../apps/local-host/dist/feishu-cli.js";
import { listConnectorSettingsCards } from "../apps/local-host/dist/connector-directory.js";
import { renderConnectorsSettings } from "../apps/workbench/dist/settings-connectors.js";

// What a Home with no installed integration package lists, without the flags a listing adds from this machine's own settings.
const HOST_CONNECTOR_DIRECTORY = (await listConnectorSettingsCards("connector-oauth-choice-test-home"));

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

test("Notion feed refreshes after an API 401 and retries with the new token", async () => {
  let refreshes = 0;
  const seen: string[] = [];
  const provider = createCatalogProvider({
    connectorId: "notion",
    authExtras: { auth_method: "oauth" },
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
    { connector_id: "gmail", title: "Gmail", auth_kind: "oauth", group_id: "mail" },
    { connector_id: "notion", title: "Notion", auth_kind: "oauth", group_id: "files" },
    { connector_id: "feishu", title: "飞书", auth_kind: "feishu", group_id: "chat" },
  ] as const;
  const html = renderConnectorsSettings({ connectors: cards.map((card) => ({
    ...card, method_options: HOST_CONNECTOR_DIRECTORY.find(row => row.connector_id === card.connector_id)!.method_options, availability: "live" as const, summary: card.title,
  })) }, { L: (value) => value, escapeHtml: (value) => String(value ?? ""), icon: () => "" });
  for (const marker of ["data-protocol-start=\"oauth\"", "data-connector-token=\"gmail\"", "data-connector-token=\"notion\"", "data-cli-login", 'data-connector-auth="feishu" data-credential-separator=":"']) assert.ok(html.includes(marker), marker);
  assert.match(html, /data-credential-part type="text"[^>]*placeholder="cli_…"/);
  assert.match(html, /应用密钥<\/span><input[^>]+data-credential-part type="password"/);
});
