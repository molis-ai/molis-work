import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parsePluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  GITHUB_WHOAMI_PUBLIC_BEHAVIOR_ID,
  githubIntegrationManifest,
  githubWhoami,
} from "@molis-ai/molis-work-integration-github";
import {
  catalogConnectorIds,
  catalogIntegrationManifest,
  catalogPublicBehaviorId,
  catalogWhoami,
} from "@molis-ai/molis-work-integration-catalog";
import { feedUiContribution, type FeedUiModel } from "@molis-ai/molis-work-plugin-feed";
import {
  DEMO_BOARD_ID,
  LocalProjectDatabase,
  bindConnectorToken,
  createLocalFeedConnectorService,
  liveHostFunctionAuthoringCatalog,
  seedDemoBoard,
  unbindConnectorToken,
} from "@molis-ai/molis-work-app-local-host";
import { createFileSecretStore, resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { HOST_CONNECTOR_DIRECTORY } from "../apps/local-host/src/connector-directory.ts";
import { GITHUB_AUTH_REF } from "../apps/local-host/src/connector-credentials.ts";
import { CONNECTOR_MARKS } from "../apps/workbench/src/connector-marks.ts";
import { renderConnectorsSettings } from "../apps/workbench/src/settings-connectors.ts";

const ROOT = dirname(fileURLToPath(import.meta.url));
const TOKEN = "ghp_liveTokenABCD";
const CONTROL = "connectors-http-token-012345678901";

const feedPrimitives: FeedUiModel["primitives"] = {
  escape: (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;"),
  icon: (name) => `<i data-icon="${name}"></i>`,
  text: (value, variables) => Object.entries(variables ?? {}).reduce(
    (result, [key, replacement]) => result.replaceAll(`{${key}}`, String(replacement)),
    value,
  ),
  formatDate: (value) => value,
  richText: (value) => `<p>${value ?? ""}</p>`,
  plainText: (value) => value ?? "",
  safeExternalHref: (value) => value,
};

async function withIsolatedHome<T>(run: (homeDirectory: string) => Promise<T>): Promise<T> {
  const homeDirectory = await mkdtemp(join(tmpdir(), "molis-work-connectors-"));
  const previous = {
    home: process.env.MOLIS_WORK_HOME,
    backend: process.env.MOLIS_WORK_SECRET_BACKEND,
    key: process.env.MOLIS_WORK_ENCRYPTION_KEY,
    github: process.env.GITHUB_TOKEN,
    molisGithub: process.env.MOLIS_WORK_GITHUB_TOKEN,
    gmail: process.env.GMAIL_ACCESS_TOKEN,
    molisGmail: process.env.MOLIS_WORK_GMAIL_ACCESS_TOKEN,
  };
  process.env.MOLIS_WORK_HOME = homeDirectory;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  process.env.MOLIS_WORK_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  delete process.env.GITHUB_TOKEN;
  delete process.env.MOLIS_WORK_GITHUB_TOKEN;
  delete process.env.GMAIL_ACCESS_TOKEN;
  delete process.env.MOLIS_WORK_GMAIL_ACCESS_TOKEN;
  resetSecretStoreCache();
  try {
    return await run(homeDirectory);
  } finally {
    resetSecretStoreCache();
    if (previous.home === undefined) delete process.env.MOLIS_WORK_HOME;
    else process.env.MOLIS_WORK_HOME = previous.home;
    if (previous.backend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND;
    else process.env.MOLIS_WORK_SECRET_BACKEND = previous.backend;
    if (previous.key === undefined) delete process.env.MOLIS_WORK_ENCRYPTION_KEY;
    else process.env.MOLIS_WORK_ENCRYPTION_KEY = previous.key;
    if (previous.github === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previous.github;
    if (previous.molisGithub === undefined) delete process.env.MOLIS_WORK_GITHUB_TOKEN;
    else process.env.MOLIS_WORK_GITHUB_TOKEN = previous.molisGithub;
    if (previous.gmail === undefined) delete process.env.GMAIL_ACCESS_TOKEN;
    else process.env.GMAIL_ACCESS_TOKEN = previous.gmail;
    if (previous.molisGmail === undefined) delete process.env.MOLIS_WORK_GMAIL_ACCESS_TOKEN;
    else process.env.MOLIS_WORK_GMAIL_ACCESS_TOKEN = previous.molisGmail;
    await rm(homeDirectory, { recursive: true, force: true });
  }
}

function agentBehaviorIds(catalog: ReturnType<typeof liveHostFunctionAuthoringCatalog>): readonly string[] {
  return catalog.destinations.find((row) => row.destination_id === "agent.mcp")?.behavior_ids ?? [];
}

test("GitHub Integration Manifest is schema 2 and names whoami", () => {
  const parsed = parsePluginManifest(githubIntegrationManifest);
  assert.equal(parsed.schema_version, 2);
  assert.equal(parsed.host_api_version, 2);
  assert.ok(parsed.behaviors?.some((row) => row.behavior_id === "whoami"));
  assert.equal(GITHUB_WHOAMI_PUBLIC_BEHAVIOR_ID, "github.whoami");
});

test("connector directory covers common Codex/Claude/Grok accounts without empty packages", () => {
  const github = HOST_CONNECTOR_DIRECTORY.find((row) => row.connector_id === "github");
  const gmail = HOST_CONNECTOR_DIRECTORY.find((row) => row.connector_id === "gmail");
  assert.equal(github?.availability, "live");
  assert.match(github?.outbound_note ?? "", /连接设置.*检查当前 GitHub 账号/);
  assert.doesNotMatch(github?.outbound_note ?? "", /Functions|可勾/);
  assert.equal(gmail?.availability, "live");
  assert.match(gmail?.outbound_note ?? "", /出站动作未兑现/);
  assert.deepEqual(
    HOST_CONNECTOR_DIRECTORY.map((row) => row.connector_id),
    ["model-api", "typesafe", "image-api", "mcp-bearer", "github", "gmail", ...catalogConnectorIds()],
  );
  assert.equal(HOST_CONNECTOR_DIRECTORY.some((row) => row.availability === "placeholder"), false);
  for (const row of HOST_CONNECTOR_DIRECTORY) {
    const icon = CONNECTOR_MARKS[row.connector_id as keyof typeof CONNECTOR_MARKS];
    if (icon) assert.ok(icon.includes("<svg"), row.connector_id);
    assert.equal(row.availability, "live", row.connector_id);
    assert.equal(row.capabilities.length, 2, row.connector_id);
    assert.ok(row.capabilities.every((item) => item.label.length > 0), row.connector_id);
    assert.ok(row.capabilities.some((item) => item.fulfillment === "live"), row.connector_id);
    if (!["model-api", "typesafe", "image-api", "mcp-bearer", "github", "gmail"].includes(row.connector_id)) {
      assert.equal(row.auth_kind, row.connector_id === "notion" || row.connector_id === "feishu" ? row.connector_id : "token", row.connector_id);
      assert.equal(existsSync(join(ROOT, "..", "plugins", "official-integrations", row.connector_id)), false, row.connector_id);
    }
  }
  assert.equal(existsSync(join(ROOT, "..", "plugins", "official-integrations", "catalog")), true);
  assert.equal(existsSync(join(ROOT, "..", "plugins", "native", "connectors")), false);
  assert.equal(existsSync(join(ROOT, "..", "modules", "connectors")), false);
});

test("Connectors settings cards distinguish account states and never echo the secret", () => {
  const html = renderConnectorsSettings({
    connector_connections: [
      { connection_id: "11111111-1111-4111-8111-111111111111", service_id: "github", display_name: "工作 GitHub", account_label: "octocat", auth_method: "token", source: "managed", state: "connected" },
      { connection_id: "22222222-2222-4222-8222-222222222222", service_id: "gmail", display_name: "私人 Gmail", account_label: "me@example.com", auth_method: "oauth", source: "managed", state: "reauth_required" },
    ],
    connectors: [
      {
        connector_id: "github",
        title: "GitHub",
        availability: "live",
        auth_kind: "github",
        group_id: "code",
        summary: "本机账号。Feed 拉未读通知，Functions 可勾已兑现动作。",
        account_state: "connected",
        hint: "…ABCD",
        outbound_note: "已兑现动作：查看当前 GitHub 账号（github.whoami）。判断只挑，不会自动调用。",
        capabilities: [
          { label: "Feed 拉未读通知", fulfillment: "live" },
          { label: "Functions 可勾查看当前账号（github.whoami）", fulfillment: "live" },
        ],
      },
      {
        connector_id: "gmail",
        title: "Gmail",
        availability: "live",
        auth_kind: "gmail",
        group_id: "mail",
        summary: "本机账号。Feed 只读收信。",
        account_state: "reauth_required",
        outbound_note: "出站动作未兑现：当前只读收信，不发送邮件。",
        capabilities: [
          { label: "Feed 只读收信", fulfillment: "live" },
          { label: "发送邮件", fulfillment: "unfulfilled" },
        ],
      },
      {
        connector_id: "wechat",
        title: "微信",
        availability: "live",
        auth_kind: "token",
        group_id: "chat",
        summary: "企业微信消息。",
        account_state: "disconnected",
        token_label: "企业微信 CorpID 与 Secret",
        token_placeholder: "ww…:secret",
        auth_help: "微信个人号没有稳定官方接口。这里连的是企业微信自建应用，格式 corpid:corpsecret。",
        capabilities: [
          { label: "Feed 拉企业微信通讯录", fulfillment: "live" },
          { label: "Functions 可勾查看当前账号", fulfillment: "live" },
        ],
      },
    ],
  }, {
    L: (text) => text,
    escapeHtml: (value) => String(value ?? ""),
    icon: () => "",
  });
  assert.match(html, /data-connectors-settings/);
  assert.match(html, /class="mw-card settings-connector-card"/);
  assert.match(html, /data-connector-group="live"/);
  assert.doesNotMatch(html, /data-connector-group="placeholder"/);
  assert.match(html, /可以连接/);
  assert.match(html, /工作 GitHub/);
  assert.match(html, /私人 Gmail/);
  assert.match(html, /settings-state--neutral[^>]*>凭据已保存/);
  assert.match(html, /settings-state--warning[^>]*>需重新授权/);
  assert.match(html, /data-connector-open="wechat"/);
  assert.match(html, /data-connector-mark="github"/);
  assert.match(html, /data-connector-mark="wechat"/);
  assert.match(html, /<svg[\s\S]*viewBox=/);
  assert.match(html, /data-fulfillment="live"/);
  assert.match(html, /data-fulfillment="unfulfilled"/);
  assert.match(html, /Feed 拉未读通知/);
  assert.match(html, /data-connector-subgroup="chat"/);
  assert.match(html, /企业微信自建应用/);
  assert.match(html, /type="password"[^>]*data-connector-token="gmail"/);
  assert.match(html, /type="password"[^>]*data-connector-token="wechat"/);
  assert.match(html, /data-connector-token="github"/);
  assert.doesNotMatch(html, /ghp_liveTokenABCD/);
  assert.match(html, /出站动作未兑现/);
});

test("every connector detail exposes official https setup links", () => {
  const primitives = {
    L: (text: string) => text,
    escapeHtml: (value: unknown) => String(value ?? ""),
    icon: () => "",
  };
  for (const row of HOST_CONNECTOR_DIRECTORY) {
    if (["model-api", "typesafe", "image-api", "mcp-bearer"].includes(row.connector_id)) continue;
    assert.ok((row.setup_links?.length ?? 0) > 0, row.connector_id);
    for (const link of row.setup_links ?? []) {
      assert.match(link.url, /^https:\/\//, `${row.connector_id}:${link.label}`);
      assert.ok(link.label.trim().length > 0, row.connector_id);
    }
  }
  const html = renderConnectorsSettings({
    connectors: HOST_CONNECTOR_DIRECTORY.map((row) => ({ ...row, account_state: "disconnected" as const })),
  }, primitives);
  assert.match(html, /https:\/\/github\.com\/settings\/tokens/);
  assert.match(html, /https:\/\/console\.cloud\.google\.com\/apis\/library\/gmail\.googleapis\.com/);
  assert.match(html, /https:\/\/api\.slack\.com\/apps/);
  assert.match(html, /https:\/\/www\.notion\.so\/my-integrations/);
  assert.match(html, /https:\/\/work\.weixin\.qq\.com\/wework_admin\/frame#apps/);
  assert.match(html, /https:\/\/id\.atlassian\.com\/manage-profile\/security\/api-tokens/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  const rendered = [...html.matchAll(/data-connector-setup-link/g)].length;
  const expected = HOST_CONNECTOR_DIRECTORY.reduce((count, row) => count + (row.setup_links?.length ?? 0), 0);
  assert.equal(rendered, expected);
});

test("an existing Gmail account offers targeted OAuth reauthorization while the form adds another account", () => {
  const html = renderConnectorsSettings({
    connector_connections: [{ connection_id: "33333333-3333-4333-8333-333333333333", service_id: "gmail", display_name: "工作邮箱", account_label: "work@example.com", auth_method: "oauth", source: "managed", state: "connected" }],
    connectors: HOST_CONNECTOR_DIRECTORY
      .filter((row) => row.connector_id === "gmail")
      .map((row) => ({ ...row, account_state: "connected" as const, hint: "…ABCD", gmail_oauth_configured: true, connection_method: "oauth" as const })),
  }, {
    L: (text) => text,
    escapeHtml: (value) => String(value ?? ""),
    icon: () => "",
  });
  assert.match(html, /data-connection-reauthorize="33333333-3333-4333-8333-333333333333"/);
  assert.match(html, /凭据已保存/);
  assert.match(html, /data-connector-gmail-oauth-start/);
  assert.match(html, /data-connection-disconnect="33333333-3333-4333-8333-333333333333"/);
  assert.match(html, /添加新连接/);
  const manualTokenHtml = renderConnectorsSettings({
    connectors: HOST_CONNECTOR_DIRECTORY
      .filter((row) => row.connector_id === "gmail")
      .map((row) => ({ ...row, account_state: "connected" as const, gmail_oauth_configured: false })),
  }, {
    L: (text) => text,
    escapeHtml: (value) => String(value ?? ""),
    icon: () => "",
  });
  assert.match(manualTokenHtml, /data-connector-gmail-client-id/);
  assert.match(manualTokenHtml, /data-connector-gmail-oauth-start/);
});

test("Feed add-source panel sends GitHub and Gmail to project-scoped Connectors", () => {
  const host = new UiHost();
  host.register(feedUiContribution);
  const panel = host.render({
    contribution_id: feedUiContribution.descriptor.contribution_id,
    surface: "workbench",
    model: {
      route_prefix: "/projects/project-test",
      preset: "feed",
      entries: [],
      sources: [],
      out_rules: [],
      source_catalog: [],
      connector_auth: { github: { bound: false }, gmail: { bound: true } },
      primitives: feedPrimitives,
      demo: false,
      active: true,
    },
  });
  assert.match(panel, /打开 Connectors/);
  assert.match(panel, /href="\/settings\/connectors\?connector=github&amp;project=project-test"/);
  assert.match(panel, /href="\/settings\/connectors\?connector=gmail&amp;project=project-test"/);
  assert.match(panel, /凭据已保存/);
  assert.doesNotMatch(panel, /data-feed-connector-token/);
  assert.doesNotMatch(panel, /GitHub 访问令牌/);
});

test("Functions and judgment sources do not talk to GitHub", async () => {
  const files = [
    "modules/functions/src/service.ts",
    "apps/local-host/src/functions-http/route-handlers.ts",
    "apps/workbench/src/functions/client.ts",
  ];
  for (const relative of files) {
    const source = await readFile(join(ROOT, "..", relative), "utf8");
    assert.equal(source.includes("api.github.com"), false, relative);
    assert.equal(source.includes("@molis-ai/molis-work-integration-github"), false, relative);
  }
});

test("GitHub whoami is the fulfilled GET /user action", async () => {
  const urls: string[] = [];
  const result = await githubWhoami({
    token: TOKEN,
    fetchImpl: async (input) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ login: "octocat" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-oauth-scopes": "notifications, read:user",
        },
      });
    },
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.login, "octocat");
  assert.deepEqual(urls, ["https://api.github.com/user"]);
});

test("legacy credential binding does not invent Agent capabilities absent from the action directory", async () => {
  await withIsolatedHome(async () => {
    assert.deepEqual(liveHostFunctionAuthoringCatalog().behaviors, []);
    bindConnectorToken("github", TOKEN);
    assert.deepEqual(liveHostFunctionAuthoringCatalog().behaviors, [], "credentials alone are not action registration or authorization");
    unbindConnectorToken("github");
    assert.deepEqual(liveHostFunctionAuthoringCatalog().behaviors, []);
  });
});

test("Connectors HTTP binds the same GitHub secret Feed uses, hides plaintext, and gates the catalog", async () => {
  await withIsolatedHome(async (homeDirectory) => {
    const githubCalls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = String(input);
      if (url.includes("api.github.com/user")) {
        githubCalls.push(url);
        return new Response(JSON.stringify({ login: "octocat" }), {
          status: 200,
          headers: { "content-type": "application/json", "x-oauth-scopes": "notifications" },
        });
      }
      if (url.includes("api.github.com")) {
        throw new Error(`unexpected GitHub call: ${url}`);
      }
      return realFetch(input, init);
    }) as typeof fetch;
    const server = createMolisWorkWebServer({ homeDirectory, controlToken: CONTROL });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    try {
      const headers = () => ({
        origin,
        "content-type": "application/json",
        "x-molis-work-control-token": CONTROL,
        "x-molis-work-idempotency-key": `connectors-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
      const disconnectedPage = await (await fetch(`${origin}/settings/connectors`)).text();
      assert.match(disconnectedPage, /data-connectors-settings/);
      assert.match(disconnectedPage, /class="mw-card settings-connector-card"/);
      assert.match(disconnectedPage, /type="password"[^>]*data-connector-token="github"/);
      assert.doesNotMatch(disconnectedPage, new RegExp(TOKEN));
      const mcp = await (await fetch(`${origin}/settings/mcp`)).text();
      const mcpStart = mcp.indexOf('class="settings-content"');
      const mcpEnd = mcp.indexOf("</main>");
      const mcpDocument = mcpStart >= 0 && mcpEnd > mcpStart ? mcp.slice(mcpStart, mcpEnd) : "";
      assert.match(mcp, /data-settings-section="mcp"/);
      assert.doesNotMatch(mcpDocument, /data-connectors-settings|data-connector-token/);
      const emptyCatalog = await (await fetch(`${origin}/api/functions/catalog`)).json() as {
        catalog: { destinations: Array<{ destination_id: string; behavior_ids: string[] }>; behaviors: Array<{ behavior_id: string }> };
      };
      assert.equal(
        emptyCatalog.catalog.destinations.find((row) => row.destination_id === "agent.mcp")
          ?.behavior_ids.includes(GITHUB_WHOAMI_PUBLIC_BEHAVIOR_ID),
        false,
      );
      const bound = await fetch(`${origin}/api/settings/connectors/github/token`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ token: TOKEN }),
      });
      assert.equal(bound.status, 200);
      assert.equal(createFileSecretStore().get(GITHUB_AUTH_REF), TOKEN);
      const boundBody = await bound.json() as { connectors: Array<{ connector_id: string; hint?: string }>; status: { hint?: string } };
      assert.equal(JSON.stringify(boundBody).includes(TOKEN), false);
      assert.equal(boundBody.status.hint, "…ABCD");
      const connectedPage = await (await fetch(`${origin}/settings/connectors`)).text();
      assert.match(connectedPage, /GitHub · 原有连接/);
      assert.doesNotMatch(connectedPage, new RegExp(TOKEN));
      assert.match(connectedPage, /data-connection-row="legacy-/);
      const liveCatalog = await (await fetch(`${origin}/api/functions/catalog`)).json() as {
        catalog: { destinations: Array<{ destination_id: string; behavior_ids: string[] }>; behaviors: Array<{ behavior_id: string }> };
      };
      assert.equal(liveCatalog.catalog.destinations.find(row => row.destination_id === "agent.mcp")?.behavior_ids.includes(GITHUB_WHOAMI_PUBLIC_BEHAVIOR_ID), false,
        "the legacy connector settings API is not a registered Agent action");
      const whoami = await fetch(`${origin}/api/settings/connectors/github/whoami`, {
        method: "POST",
        headers: headers(),
      });
      assert.equal(whoami.status, 200);
      assert.deepEqual(await whoami.json(), { login: "octocat", scopes: ["notifications"] });
      assert.deepEqual(githubCalls, ["https://api.github.com/user"]);
      const unbound = await fetch(`${origin}/api/settings/connectors/github/token`, {
        method: "DELETE",
        headers: headers(),
      });
      assert.equal(unbound.status, 200);
      const after = await (await fetch(`${origin}/api/functions/catalog`)).json() as {
        catalog: { destinations: Array<{ destination_id: string; behavior_ids: string[] }> };
      };
      assert.equal(
        after.catalog.destinations.find((row) => row.destination_id === "agent.mcp")
          ?.behavior_ids.includes(GITHUB_WHOAMI_PUBLIC_BEHAVIOR_ID),
        false,
      );
    } finally {
      globalThis.fetch = realFetch;
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});

test("deleting a Feed GitHub source keeps the machine credential", async () => {
  await withIsolatedHome(async (homeDirectory) => {
    const databasePath = join(homeDirectory, "molis-work.sqlite");
    seedDemoBoard(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    try {
      const service = createLocalFeedConnectorService(store.db, DEMO_BOARD_ID, undefined, homeDirectory);
      service.bindToken("github", TOKEN);
      const source = service.ensureSources().find((row) => row.sync_kind === "github");
      assert.ok(source);
      service.feed.retireSource(DEMO_BOARD_ID, source.source_id, "retain_history");
      assert.equal(createFileSecretStore().get(GITHUB_AUTH_REF), TOKEN);
    } finally {
      store.close();
    }
  });
});

test("catalog Slack whoami hits auth.test and appears in Functions only while bound", async () => {
  const parsed = parsePluginManifest(catalogIntegrationManifest("slack"));
  assert.equal(parsed.plugin_id, "io.molis.work.integration.slack");
  assert.equal(catalogPublicBehaviorId("slack"), "slack.whoami");
  const urls: string[] = [];
  const result = await catalogWhoami({
    connectorId: "slack",
    token: "xoxb-liveTokenABCD",
    fetchImpl: async (input) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ ok: true, user: "molis", team: "Adeptify" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.login, "molis");
  assert.deepEqual(urls, ["https://slack.com/api/auth.test"]);
  await withIsolatedHome(async () => {
    assert.equal(agentBehaviorIds(liveHostFunctionAuthoringCatalog()).includes("slack.whoami"), false);
    bindConnectorToken("slack", "xoxb-liveTokenABCD");
    assert.equal(agentBehaviorIds(liveHostFunctionAuthoringCatalog()).includes("slack.whoami"), false, "binding a legacy credential does not register an action");
    unbindConnectorToken("slack");
    assert.equal(agentBehaviorIds(liveHostFunctionAuthoringCatalog()).includes("slack.whoami"), false);
  });
});
