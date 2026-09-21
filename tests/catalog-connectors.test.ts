import assert from "node:assert/strict";
import test from "node:test";
import { parsePluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  CATALOG_CONNECTORS,
  catalogIntegrationManifest,
  catalogWhoami,
  createCatalogProvider,
} from "@molis-ai/molis-work-integration-catalog";

test("every catalog connector has a valid Integration Manifest and identity URL", () => {
  assert.equal(CATALOG_CONNECTORS.length, 38);
  const ids = new Set<string>();
  for (const spec of CATALOG_CONNECTORS) {
    assert.equal(ids.has(spec.id), false, spec.id);
    ids.add(spec.id);
    const parsed = parsePluginManifest(catalogIntegrationManifest(spec.id));
    assert.equal(parsed.kind, "integration");
    assert.ok(parsed.behaviors?.some((row) => row.behavior_id === "whoami"), spec.id);
    assert.ok(spec.token_label.length > 0, spec.id);
    assert.ok(spec.inbound.length > 0, spec.id);
    assert.ok(spec.setup_links.length > 0, spec.id);
    const urls = new Set<string>();
    for (const link of spec.setup_links) {
      assert.match(link.url, /^https:\/\//, `${spec.id}:${link.label}`);
      assert.ok(link.label.trim().length > 0, spec.id);
      assert.equal(urls.has(link.url), false, `${spec.id} duplicate ${link.url}`);
      urls.add(link.url);
    }
  }
});

test("Notion search poll uses the official versioned API", async () => {
  const urls: string[] = [];
  const provider = createCatalogProvider({
    connectorId: "notion",
    token: "ntn_liveTokenABCD",
    fetchImpl: async (input, init) => {
      const url = String(input);
      urls.push(url);
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers.Authorization, "Bearer ntn_liveTokenABCD");
      assert.equal(headers["Notion-Version"], "2022-06-28");
      if (url.endsWith("/users/me")) {
        return new Response(JSON.stringify({ object: "user", id: "u1", name: "Ada", bot: { owner: { user: { name: "Ada" } } } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      assert.equal(init?.method, "POST");
      return new Response(JSON.stringify({
        results: [{
          id: "page-1",
          url: "https://notion.so/page-1",
          last_edited_time: "2026-09-21T00:00:00.000Z",
          properties: { title: { type: "title", title: [{ plain_text: "产品规格" }] } },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const synced = await provider.sync({ cursor: {} });
  assert.equal(synced.ok, true);
  if (!synced.ok) throw new Error("expected live sync");
  assert.equal(synced.items[0]?.title, "产品规格");
  assert.deepEqual(urls, [
    "https://api.notion.com/v1/users/me",
    "https://api.notion.com/v1/search",
  ]);
});

test("Jira uses site|email|token basic auth against the Cloud REST API", async () => {
  const result = await catalogWhoami({
    connectorId: "jira",
    token: "acme.atlassian.net|ada@example.com|ATATT3x00000ABCD",
    fetchImpl: async (input, init) => {
      assert.equal(String(input), "https://acme.atlassian.net/rest/api/3/myself");
      const headers = init?.headers as Record<string, string>;
      assert.match(headers.Authorization, /^Basic /);
      return new Response(JSON.stringify({ displayName: "Ada", emailAddress: "ada@example.com" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.login, "Ada");
});

test("Cloudflare identity uses the official API token verifier not /user", async () => {
  const result = await catalogWhoami({
    connectorId: "cloudflare",
    token: "cf_token_ABCDEFGH",
    fetchImpl: async (input, init) => {
      assert.equal(String(input), "https://api.cloudflare.com/client/v4/user/tokens/verify");
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers.Authorization, "Bearer cf_token_ABCDEFGH");
      return new Response(JSON.stringify({ success: true, result: { id: "tok1", status: "active" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.login, "active");
});

test("Jira issue poll uses search/jql after the legacy search sunset", async () => {
  const urls: string[] = [];
  const provider = createCatalogProvider({
    connectorId: "jira",
    token: "acme.atlassian.net|ada@example.com|ATATT3x00000ABCD",
    fetchImpl: async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith("/myself")) {
        return new Response(JSON.stringify({ displayName: "Ada" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      assert.match(url, /\/rest\/api\/3\/search\/jql\?/);
      assert.doesNotMatch(url, /\/rest\/api\/3\/search\?/);
      return new Response(JSON.stringify({
        issues: [{ id: "10001", key: "ENG-1", fields: { summary: "登录失败", updated: "2026-09-21T00:00:00.000Z" } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const synced = await provider.sync({ cursor: {} });
  assert.equal(synced.ok, true);
  if (!synced.ok) throw new Error("expected live sync");
  assert.equal(synced.items[0]?.title, "ENG-1 登录失败");
  assert.equal(synced.items[0]?.url, "https://acme.atlassian.net/browse/ENG-1");
});

test("Asana task poll supplies workspace because assignee=me alone is rejected", async () => {
  const urls: string[] = [];
  const provider = createCatalogProvider({
    connectorId: "asana",
    token: "2/123456789:asanaPATToken",
    fetchImpl: async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith("/users/me")) {
        return new Response(JSON.stringify({ data: { name: "Ada", workspaces: [{ gid: "ws1", name: "Team" }] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      assert.match(url, /assignee=me/);
      assert.match(url, /workspace=ws1/);
      return new Response(JSON.stringify({ data: [{ gid: "t1", name: "写规格", permalink_url: "https://app.asana.com/0/t1" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const synced = await provider.sync({ cursor: {} });
  assert.equal(synced.ok, true);
  if (!synced.ok) throw new Error("expected live sync");
  assert.equal(synced.items[0]?.title, "写规格");
  assert.equal(urls.filter((url) => url.endsWith("/users/me")).length, 2);
});

test("monday.com personal tokens go in Authorization without Bearer", async () => {
  const result = await catalogWhoami({
    connectorId: "monday",
    token: "mondayPersonalTokenABCD",
    fetchImpl: async (input, init) => {
      assert.equal(String(input), "https://api.monday.com/v2");
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers.Authorization, "mondayPersonalTokenABCD");
      assert.equal(headers["API-Version"], "2024-10");
      return new Response(JSON.stringify({ data: { me: { name: "Ada", email: "ada@example.com" } } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.login, "Ada");
});

test("Dropbox identity POSTs JSON null as the official empty body", async () => {
  const result = await catalogWhoami({
    connectorId: "dropbox",
    token: "sl.dropboxTokenABCD",
    fetchImpl: async (input, init) => {
      assert.equal(String(input), "https://api.dropboxapi.com/2/users/get_current_account");
      assert.equal(init?.body, "null");
      return new Response(JSON.stringify({ email: "ada@example.com", name: { display_name: "Ada" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.login, "ada@example.com");
});

test("Google Drive file list encodes the orderBy space", async () => {
  const provider = createCatalogProvider({
    connectorId: "google-drive",
    token: "ya29.driveTokenABCD",
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("/drive/v3/about")) {
        return new Response(JSON.stringify({ user: { emailAddress: "ada@example.com" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      assert.match(url, /orderBy=modifiedTime%20desc/);
      assert.doesNotMatch(url, /orderBy=modifiedTime desc/);
      return new Response(JSON.stringify({ files: [{ id: "f1", name: "规格.docx", modifiedTime: "2026-09-21T00:00:00.000Z" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const synced = await provider.sync({ cursor: {} });
  assert.equal(synced.ok, true);
  if (!synced.ok) throw new Error("expected live sync");
  assert.equal(synced.items[0]?.title, "规格.docx");
});

test("enterprise WeChat exchanges corpid:secret then lists departments", async () => {
  const urls: string[] = [];
  const provider = createCatalogProvider({
    connectorId: "wechat",
    token: "wwcorpid:corpsecret",
    fetchImpl: async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/cgi-bin/gettoken")) {
        return new Response(JSON.stringify({ errcode: 0, access_token: "wecom-access" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/cgi-bin/get_api_domain_ip")) {
        return new Response(JSON.stringify({ errcode: 0, ip_list: ["1.1.1.1"] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      assert.match(url, /access_token=wecom-access/);
      return new Response(JSON.stringify({
        errcode: 0,
        department: [{ id: 1, name: "产品" }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const synced = await provider.sync({ cursor: {} });
  assert.equal(synced.ok, true);
  if (!synced.ok) throw new Error("expected live sync");
  assert.equal(synced.items[0]?.title, "产品");
  assert.equal(urls.filter((url) => url.includes("/cgi-bin/gettoken")).length, 1);
});
