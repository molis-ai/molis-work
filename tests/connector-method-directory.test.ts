import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG_CONNECTORS } from "@molis-ai/molis-work-integration-catalog";
import { OFFICIAL_CONNECTOR_METHODS, officialMethodsFor } from "@molis-ai/molis-work-integration-catalog";
import { listConnectorSettingsCards } from "../apps/local-host/src/connector-directory.ts";
import { renderConnectorsSettings } from "../apps/workbench/src/settings-connectors.ts";
import { recommendedMethod, renderConnectorConnect, renderConnectorWays } from "../apps/workbench/src/settings-connector-guide.ts";
import { CONNECTORS_SETTINGS_CLIENT_SCRIPT } from "../apps/workbench/src/scripts/connectors-settings.ts";

// A Home's registry is keyed by its path and nothing here reads the disk; the directory is what a Home with no installed package lists,
// without the three flags a listing adds from this machine's own settings.
const HOME = "connector-method-directory-test-home";
const HOST_CONNECTOR_DIRECTORY = (await listConnectorSettingsCards(HOME)).map((entry) => entry);
/** A service's open part on the connections page: from its row to the next service's row. */
const serviceBody = (html: string, id: string) => html.split(`data-connector-item="${id}"`)[1]?.split("data-connector-item=")[0] ?? "";
/** The part of it before 高级: what the row offers without opening anything else. */
const connectPart = (html: string, id: string) => serviceBody(html, id).split("data-connector-advanced")[0]!;

test("every catalog service and the two host account services have official method choices", () => {
  const ids = new Set(["github", "gmail", ...CATALOG_CONNECTORS.map((row) => row.id)]);
  assert.deepEqual(new Set(Object.keys(OFFICIAL_CONNECTOR_METHODS)), ids);
  for (const id of ids) {
    const methods = officialMethodsFor(id);
    assert.ok(methods.length > 0, id);
    assert.equal(new Set(methods.map((method) => method.kind)).size, methods.length, id);
    if (id !== "loom") assert.ok(methods.some((method) => method.kind === "token" && method.support === "paste"), id);
    else assert.deepEqual(methods.map(method => method.kind), ["mcp"]);
    for (const method of methods) {
      assert.ok(method.note.trim().length > 0, `${id}:${method.kind}`);
      assert.ok(method.links.length > 0, `${id}:${method.kind}`);
      for (const link of method.links) {
        assert.match(link.url, /^https:\/\/[^/]+/, `${id}:${method.kind}`);
        assert.ok(link.label.trim().length > 0, `${id}:${method.kind}`);
      }
    }
  }
});

test("only implemented methods claim an in-app flow; Notion MCP needs separate authorization", () => {
  const actual = Object.entries(OFFICIAL_CONNECTOR_METHODS).flatMap(([id, methods]) =>
    methods.filter((method) => method.support === "in_app").map((method) => `${id}:${method.kind}`));
  assert.deepEqual(actual.sort(), ["feishu:cli", "github:oauth", "gmail:oauth", "notion:oauth"]);
  const notionMcp = officialMethodsFor("notion").find((method) => method.kind === "mcp");
  assert.equal(notionMcp?.support, "external");
  assert.match(notionMcp?.note ?? "", /另行授权/);
  assert.match(notionMcp?.links[0]?.url ?? "", /developers\.notion\.com\/guides\/mcp/);
});

test("restricted or preview methods retain their real availability limits", () => {
  const hasNote = (id: string, kind: string, fragment: RegExp) =>
    assert.match(officialMethodsFor(id).find((method) => method.kind === kind)?.note ?? "", fragment);
  hasNote("gmail", "mcp", /开发者预览/);
  hasNote("figma", "mcp", /获准/);
  hasNote("loom", "mcp", /Rovo|Atlassian/);
  hasNote("bitbucket", "token", /App Password 已停用/);
});

test("all current Connector cards expose a method directory with safe official links", async () => {
  assert.deepEqual(
    new Set(HOST_CONNECTOR_DIRECTORY.map((row) => row.connector_id)),
    new Set([...Object.keys(OFFICIAL_CONNECTOR_METHODS), "model-api", "typesafe", "image-api", "mcp-bearer"]),
  );
  for (const row of HOST_CONNECTOR_DIRECTORY) {
    assert.ok(row.method_options?.length, row.connector_id);
    for (const method of row.method_options ?? []) {
      assert.ok(method.links.every((link) => link.url.startsWith("https://")), `${row.connector_id}:${method.kind}`);
    }
  }
  const settingsCards = await listConnectorSettingsCards(HOME);
  assert.deepEqual(new Set(settingsCards.map((row) => row.connector_id)), new Set(HOST_CONNECTOR_DIRECTORY.map((row) => row.connector_id)));
  assert.ok(settingsCards.every((row) => row.method_options?.length), "settings endpoint cards must forward method options");
  const html = renderConnectorsSettings({
    connectors: HOST_CONNECTOR_DIRECTORY,
  }, { L: (value) => value, escapeHtml: (value) => String(value ?? ""), icon: () => "" });
  const notionDetail = serviceBody(html, "notion");
  assert.match(notionDetail, /data-connector-method="mcp" data-method-support="in_app"/);
  assert.match(notionDetail, /需另行授权/);
  assert.match(html, /data-connector-method="cli" data-method-support="in_app"/);
  assert.match(html, /data-connector-method="token" data-method-support="paste"/);
  assert.match(html, /target="_blank" rel="noopener noreferrer" data-connector-method-link/);
});


test("every displayed official method has an executable host adapter and configuration controls", () => {
  const html = renderConnectorsSettings({ connectors: HOST_CONNECTOR_DIRECTORY }, { L: value => value, escapeHtml: value => String(value ?? ""), icon: () => "" });
  for (const service of HOST_CONNECTOR_DIRECTORY) {
    for (const method of service.method_options ?? []) {
      assert.notEqual(method.support, "external", `${service.connector_id}:${method.kind}`);
      if (method.kind !== "token" && service.connector_id !== "mcp-bearer") {
        assert.ok(method.oauth || method.cli || method.mcp, `${service.connector_id}:${method.kind} adapter configuration`);
        assert.ok(html.includes(`data-protocol="${method.kind}" data-protocol-service="${service.connector_id}"`));
      }
    }
    assert.ok(html.includes(`data-connector-mark="${service.connector_id}"`));
  }
});

test("ASC-28: MCP method facts distinguish authentication from OAuth client registration", async () => {
  const cards = await listConnectorSettingsCards(HOME);
  const mcp = (id: string) => cards.find(row => row.connector_id === id)!.method_options!.find(method => method.kind === "mcp")!;
  const github = mcp("github");
  assert.equal(github.mcp?.client_registration, "manual");
  assert.match(github.mcp?.note ?? "", /认证方式：OAuth 或 Bearer/);
  assert.match(github.mcp?.note ?? "", /仅描述 OAuth 客户端注册要求/);
  assert.match(mcp("notion").mcp?.note ?? "", /认证方式：OAuth。/);
  assert.match(mcp("figma").mcp?.note ?? "", /认证方式：无需鉴权。/);
});

test("onboarding prefers ready account login and keeps developer configuration optional", () => {
  const L = (text: string, values?: Record<string, string | number>) => Object.entries(values ?? {}).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, String(value)), text);
  const p = { L, escapeHtml: (v: unknown) => String(v ?? ""), icon: () => "" };
  for (const service of ["gmail", "notion", "github"]) {
    const entry = HOST_CONNECTOR_DIRECTORY.find(c => c.connector_id === service)!;
    // Gmail's and Notion's ready login is their OAuth method's own `login_ready` (the generic flow's product client), never a per-service flag.
    const ready = { ...entry,
      method_options: entry.method_options?.map(m => m.kind === "oauth" ? { ...m, login_ready: true, ...(m.oauth?.device ? { oauth: { ...m.oauth, device: { login_ready: true } } } : {}) } : m) };
    assert.equal(recommendedMethod(ready)?.kind, "oauth", service);
    const html = renderConnectorConnect(ready, p);
    // Gmail and Notion sign in through the generic flow: the same start button, with no dedicated-login marker of their own.
    assert.equal(html.includes("data-device-login"), service === "github", service);
    // The device button names the service the code is typed at, and the page script starts the device flow from it, never the web one.
    if (service === "github") {
      assert.match(html, /data-device-login="GitHub"/u);
      assert.match(CONNECTORS_SETTINGS_CLIENT_SCRIPT, /'deviceLogin' in button\.dataset[^;]*deviceFlow\(area, body, popup, button\.dataset\.deviceLogin\)/u);
      assert.match(CONNECTORS_SETTINGS_CLIENT_SCRIPT, /api\('methods\/device\/start', body\)/u);
      assert.doesNotMatch(CONNECTORS_SETTINGS_CLIENT_SCRIPT, /输入设备码[^)]*GitHub/u, "no service is written into the generic script");
    }
    assert.ok(html.includes("data-protocol-start=\"oauth\""), service);
    // ASC-75: the one click asks for nothing; an own app is under 高级, with its fields.
    assert.doesNotMatch(html, /<input[^>]* required/);
    const ways = renderConnectorWays(ready, p);
    assert.match(ways, /data-method-choice="oauth"><summary>用自己的应用/);
    assert.match(ways, /data-protocol-field="client_id"[^>]*required/);
  }
  const gmailEntry = HOST_CONNECTOR_DIRECTORY.find(c => c.connector_id === "gmail")!;
  const gmail = { ...gmailEntry, method_options: gmailEntry.method_options?.map(m => m.kind === "oauth" ? { ...m, login_ready: false } : m) };
  const main = renderConnectorConnect(gmail, p);
  // ASC-47 ASC-75: a service with no one-click login says so, why, and the ways that work now; no button that cannot work.
  assert.match(main, /还不能一键连接：Molis Work 还没开通 Gmail 的一键登录/);
  assert.match(main, /现在能走的路：用你自己的 Google 应用登录/);
  assert.match(main, /data-connector-advanced-open/);
  assert.doesNotMatch(main, /<input|data-protocol-start/);
  assert.equal(recommendedMethod(gmail), undefined);
  const ways = renderConnectorWays(gmail, p);
  assert.match(ways, /data-protocol-field="client_id"[^>]*required/);
  assert.doesNotMatch(main + ways, /data-device-login/);
  assert.equal(recommendedMethod({ ...gmail, connector_id: "loom", method_options: HOST_CONNECTOR_DIRECTORY.find(c => c.connector_id === "loom")!.method_options })?.kind, "mcp");
  // Compile the actual generated browser program, including template escaping.
  assert.doesNotThrow(() => new Function(CONNECTORS_SETTINGS_CLIENT_SCRIPT));
});

test("ASC-73 ASC-75: a ready official login is the row's one click; account management and services without one stay apart", () => {
  const cards = HOST_CONNECTOR_DIRECTORY;
  const html = renderConnectorsSettings({ connectors: cards }, { L: s => s, escapeHtml: v => String(v ?? ""), icon: () => "" });
  for (const id of ["notion", "linear", "gitlab", "stripe"]) {
    const main = connectPart(html, id);
    assert.match(main, /data-protocol-start="mcp"/, id);
    assert.doesNotMatch(main, /<input[^>]* required/, id);
    assert.equal(recommendedMethod(cards.find(c => c.connector_id === id)!)?.kind, "mcp");
  }
  for (const id of ["gmail", "dropbox", "box", "zoom", "x"]) {
    assert.doesNotMatch(connectPart(html, id), /data-protocol-start/, id);
    assert.match(connectPart(html, id), /data-mw-state="unavailable">(还不能一键连接|暂未接入)/, id);
  }
  const jira = cards.find(c => c.connector_id === "jira")!;
  const productJira = { ...jira, method_options: jira.method_options!.map(m => m.kind === "oauth" ? { ...m, login_ready: true } : m) };
  const jiraMain = renderConnectorConnect(productJira, { L: s => s, escapeHtml: v => String(v ?? ""), icon: () => "" });
  assert.match(jiraMain, /data-protocol-start="oauth"/);
  assert.doesNotMatch(jiraMain, /<input[^>]* required/, "server-owned workspace settings must not block the browser login button");
});

test("composite credentials keep separate labeled inputs when adding and replacing an account", () => {
  const card = HOST_CONNECTOR_DIRECTORY.find(c => c.connector_id === "jira")!;
  const html = renderConnectorsSettings({ connectors: [{ ...card }], connector_connections: [{
    connection_id: "11111111-1111-4111-8111-111111111111", service_id: "jira", display_name: "工作 Jira", account_label: "me@example.com", auth_method: "token", source: "managed", state: "connected",
  }] }, { L: s => s, escapeHtml: v => String(v ?? ""), icon: () => "" });
  const replace = html.match(/<form[^>]*data-connection-replace=[\s\S]*?<\/form>/)![0];
  assert.match(replace, /data-credential-separator="\|"/);
  assert.match(replace, /站点域名/);
  assert.match(replace, /Atlassian 邮箱/);
  assert.equal([...replace.matchAll(/data-credential-part/g)].length, 3);
  assert.match(html, /<h4>工作 Jira<\/h4>/);
});

// T-134: a connection made for a signed package's service says which package it was made for, the only one that may use it.
test("RAC-2528 a connection pinned to a package shows 建于 and its name through the translator; one that is not pinned shows nothing", () => {
  const pinned = { connection_id: "22222222-2222-4222-8222-222222222222", service_id: "example-feed", display_name: "Feed 账号", account_label: null, auth_method: "token" as const,
    source: "managed" as const, state: "connected" as const, declared_by: { plugin_id: "io.molis.work.example.feed", title: "Example <Feed>" } };
  const plain = { ...pinned, connection_id: "33333333-3333-4333-8333-333333333333", service_id: "github", display_name: "GitHub 账号", declared_by: undefined };
  const render = (L: (value: string) => string) => renderConnectorsSettings({ connectors: [], connector_connections: [pinned, plain] },
    { L, escapeHtml: v => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"), icon: () => "" });
  const row = (html: string, id: string) => html.match(new RegExp(`data-connection-row="${id}"[\\s\\S]*?</div>`))![0];
  const zh = render(value => value);
  assert.match(row(zh, pinned.connection_id), /<small data-connection-declared-by>建于 · Example &lt;Feed&gt;<\/small>/);
  assert.doesNotMatch(row(zh, plain.connection_id), /data-connection-declared-by/);
  // Its words go through the translator like the row's others; the translation gate (pnpm health:check) holds their English.
  const asked: string[] = [];
  render(value => { asked.push(value); return value; });
  assert.ok(asked.includes("建于"));
});
