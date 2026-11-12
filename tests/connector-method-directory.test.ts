import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG_CONNECTORS, createCatalogIntegrationPlugin } from "@molis-ai/molis-work-integration-catalog";
import { createGithubIntegrationPlugin } from "@molis-ai/molis-work-integration-github";
import { createGmailIntegrationPlugin } from "@molis-ai/molis-work-integration-gmail";
import { connectorDirectory, homeIntegrationRegistry, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { workbenchPlatformText } from "@molis-ai/molis-work-app-workbench";
import { pluginLocaleReader } from "@molis-ai/molis-work-plugin-runtime";
import type { PluginConnectionWord } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { renderMolisWorkSettings, type MolisWorkSettingsView } from "./workbench-renderer-fixture.js";

// A Home's registry is keyed by its path and nothing here reads the disk; the directory is what a Home with no installed package lists,
// without the three flags a listing adds from this machine's own settings.
const HOME = "connector-method-directory-test-home";
const listConnectorSettingsCards = async (home: string) => connectorDirectory(await homeIntegrationRegistry(home));
const HOST_CONNECTOR_DIRECTORY = await runWithLocale("zh", () => listConnectorSettingsCards(HOME));
const notNeeded = () => assert.fail("No provider binding is needed to inspect its declared guides");
const official = [createGithubIntegrationPlugin({ providerFor: notNeeded }), createGmailIntegrationPlugin({ providerFor: notNeeded }),
  ...CATALOG_CONNECTORS.map(({ id }) => createCatalogIntegrationPlugin({ connectorId: id, providerFor: notNeeded }))];
const OFFICIAL_CONNECTOR_METHODS = Object.fromEntries(official.flatMap(({ manifest, connectionText }) => {
  const fallback = pluginLocaleReader(manifest, connectionText.readLocale)?.pack("zh");
  const project = (word: PluginConnectionWord): string => typeof word === "string" ? word : "literal" in word ? word.literal : String(
    (word.key.startsWith("common.") ? workbenchPlatformText.pack("zh") : fallback)?.messages[word.key] ?? "");
  return Object.entries(connectionText.guides).map(([id, methods]) => [id, methods.map(method => ({
    ...method, note: project(method.note), links: method.links.map(link => ({ ...link, label: project(link.label) })),
  }))] as const);
}));
const officialMethodsFor = (id: string) => OFFICIAL_CONNECTOR_METHODS[id] ?? [];
type DirectoryView = Pick<MolisWorkSettingsView, "connectors" | "connector_connections">;
const renderDirectory = (view: DirectoryView, locale = "zh") => runWithLocale(locale, () => renderMolisWorkSettings({
  section: "connectors", projects: [], runtimes: [],
  web_service: { provider: "macos-launchagent", state: "absent", supported: true, owned: false, running: false,
    label: "Web", plist_path: "", command: [], stdout_log: "", stderr_log: "", message: "" },
  diagnostics: { home_directory: "/tmp", installation_state: "ready", version: "0.2.0", release_directory: "/tmp", project_count: 0, launchers: [] },
  ...view,
}, "connector-method-directory-test"));
/** A service's open part on the connections page: from its row to the next service's row. */
const serviceBody = (html: string, id: string) => html.split(`data-connector-item="${id}"`)[1]?.split("data-connector-item=")[0] ?? "";
/** The part of it before 高级: what the row offers without opening anything else. */
const advanced = /<details\b[^>]*\bdata-connector-advanced(?=[ >])/u;
const connectPart = (html: string, id: string) => serviceBody(html, id).split(advanced)[0]!;

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
  const settingsCards = await runWithLocale("zh", () => listConnectorSettingsCards(HOME));
  assert.deepEqual(new Set(settingsCards.map((row) => row.connector_id)), new Set(HOST_CONNECTOR_DIRECTORY.map((row) => row.connector_id)));
  assert.ok(settingsCards.every((row) => row.method_options?.length), "settings endpoint cards must forward method options");
  const html = renderDirectory({ connectors: HOST_CONNECTOR_DIRECTORY });
  const notionDetail = serviceBody(html, "notion");
  assert.match(notionDetail, /data-connector-method="mcp" data-method-support="in_app"/);
  assert.match(notionDetail, /需另行授权/);
  assert.match(html, /data-connector-method="cli" data-method-support="in_app"/);
  assert.match(html, /data-connector-method="token" data-method-support="paste"/);
  assert.match(html, /target="_blank" rel="noopener noreferrer" data-connector-method-link/);
});


test("every displayed official method has an executable host adapter and configuration controls", () => {
  const html = renderDirectory({ connectors: HOST_CONNECTOR_DIRECTORY });
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
  const cards = await runWithLocale("zh", () => listConnectorSettingsCards(HOME));
  const mcp = (id: string) => cards.find(row => row.connector_id === id)!.method_options!.find(method => method.kind === "mcp")!;
  const github = mcp("github");
  assert.equal(github.mcp?.client_registration, "manual");
  assert.match(github.mcp?.note ?? "", /认证方式：OAuth 或 Bearer/);
  assert.match(github.mcp?.note ?? "", /仅描述 OAuth 客户端注册要求/);
  assert.match(mcp("notion").mcp?.note ?? "", /认证方式：OAuth。/);
  assert.match(mcp("figma").mcp?.note ?? "", /认证方式：无需鉴权。/);
});

test("onboarding prefers ready account login and keeps developer configuration optional", () => {
  const connect = (entry: NonNullable<DirectoryView["connectors"]>[number]) => connectPart(renderDirectory({ connectors: [entry] }), entry.connector_id);
  const waysOf = (entry: NonNullable<DirectoryView["connectors"]>[number]) => serviceBody(renderDirectory({ connectors: [entry] }), entry.connector_id).split(advanced)[1]!;
  const script = [...renderDirectory({ connectors: HOST_CONNECTOR_DIRECTORY }).matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gu)]
    .find(match => match[1]?.includes("molisWorkBindConnectorsSettings"))?.[1];
  assert.ok(script);
  for (const service of ["gmail", "notion", "github"]) {
    const entry = HOST_CONNECTOR_DIRECTORY.find(c => c.connector_id === service)!;
    // Gmail's and Notion's ready login is their OAuth method's own `login_ready` (the generic flow's product client), never a per-service flag.
    const ready = { ...entry,
      method_options: entry.method_options?.map(m => m.kind === "oauth" ? { ...m, login_ready: true, ...(m.oauth?.device ? { oauth: { ...m.oauth, device: { login_ready: true } } } : {}) } : m) };
    const html = connect(ready);
    // Gmail and Notion sign in through the generic flow: the same start button, with no dedicated-login marker of their own.
    assert.equal(html.includes("data-device-login"), service === "github", service);
    // The device button names the service the code is typed at, and the page script starts the device flow from it, never the web one.
    if (service === "github") {
      assert.match(html, /data-device-login="GitHub"/u);
      assert.match(script, /'deviceLogin' in button\.dataset[^;]*deviceFlow\(area, body, popup, button\.dataset\.deviceLogin\)/u);
      assert.match(script, /api\('methods\/device\/start', body\)/u);
      assert.doesNotMatch(script, /输入设备码[^)]*GitHub/u, "no service is written into the generic script");
    }
    assert.ok(html.includes("data-protocol-start=\"oauth\""), service);
    // ASC-75: the one click asks for nothing; an own app is under 高级, with its fields.
    assert.doesNotMatch(html, /<input[^>]* required/);
    const ways = waysOf(ready);
    assert.match(ways, /data-method-choice="oauth"><summary>用自己的应用/);
    assert.match(ways, /data-protocol-field="client_id"[^>]*required/);
  }
  const gmailEntry = HOST_CONNECTOR_DIRECTORY.find(c => c.connector_id === "gmail")!;
  const gmail = { ...gmailEntry, method_options: gmailEntry.method_options?.map(m => m.kind === "oauth" ? { ...m, login_ready: false } : m) };
  const main = connect(gmail);
  // ASC-47 ASC-75: a service with no one-click login says so, why, and the ways that work now; no button that cannot work.
  assert.match(main, /还不能一键连接：Molis Work 还没开通 Gmail 的一键登录/);
  assert.match(main, /现在能走的路：用你自己的 Google 应用登录/);
  assert.match(main, /data-connector-advanced-open/);
  assert.doesNotMatch(main, /<input|data-protocol-start/);
  const ways = waysOf(gmail);
  assert.match(ways, /data-protocol-field="client_id"[^>]*required/);
  assert.doesNotMatch(main + ways, /data-device-login/);
  assert.match(connect(HOST_CONNECTOR_DIRECTORY.find(c => c.connector_id === "loom")!), /data-protocol-start="mcp"/);
  // Compile the actual generated browser program, including template escaping.
  assert.doesNotThrow(() => new Function(script));
});

test("ASC-73 ASC-75: a ready official login is the row's one click; account management and services without one stay apart", () => {
  const cards = HOST_CONNECTOR_DIRECTORY;
  const html = renderDirectory({ connectors: cards });
  for (const id of ["notion", "linear", "gitlab", "stripe"]) {
    const main = connectPart(html, id);
    assert.match(main, /data-protocol-start="mcp"/, id);
    assert.doesNotMatch(main, /<input[^>]* required/, id);
  }
  for (const id of ["gmail", "dropbox", "box", "zoom", "x"]) {
    assert.doesNotMatch(connectPart(html, id), /data-protocol-start/, id);
    assert.match(connectPart(html, id), /data-mw-state="unavailable">(还不能一键连接|暂未接入)/, id);
  }
  const jira = cards.find(c => c.connector_id === "jira")!;
  const productJira = { ...jira, method_options: jira.method_options!.map(m => m.kind === "oauth" ? { ...m, login_ready: true } : m) };
  const jiraMain = connectPart(renderDirectory({ connectors: [productJira] }), "jira");
  assert.match(jiraMain, /data-protocol-start="oauth"/);
  assert.doesNotMatch(jiraMain, /<input[^>]* required/, "server-owned workspace settings must not block the browser login button");
});

test("composite credentials keep separate labeled inputs when adding and replacing an account", () => {
  const card = HOST_CONNECTOR_DIRECTORY.find(c => c.connector_id === "jira")!;
  const html = renderDirectory({ connectors: [{ ...card }], connector_connections: [{
    connection_id: "11111111-1111-4111-8111-111111111111", service_id: "jira", display_name: "工作 Jira", account_label: "me@example.com", auth_method: "token", source: "managed", state: "connected",
  }] });
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
  const render = (locale: string) => renderDirectory({ connectors: [], connector_connections: [pinned, plain] }, locale);
  const row = (html: string, id: string) => html.match(new RegExp(`data-connection-row="${id}"[\\s\\S]*?</div>`))![0];
  const zh = render("zh");
  assert.match(row(zh, pinned.connection_id), /<small data-connection-declared-by>建于 · Example &lt;Feed&gt;<\/small>/);
  assert.doesNotMatch(row(zh, plain.connection_id), /data-connection-declared-by/);
  assert.match(row(render("en"), pinned.connection_id), /Made for · Example &lt;Feed&gt;/);
});
