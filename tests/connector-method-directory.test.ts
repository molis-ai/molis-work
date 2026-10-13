import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG_CONNECTORS } from "../plugins/official-integrations/catalog/src/catalog.ts";
import { OFFICIAL_CONNECTOR_METHODS, officialMethodsFor } from "../plugins/official-integrations/catalog/src/methods.ts";
import { HOST_CONNECTOR_DIRECTORY, listConnectorSettingsCards } from "../apps/local-host/src/connector-directory.ts";
import { renderConnectorsSettings } from "../apps/workbench/src/settings-connectors.ts";
import { recommendedMethod, renderConnectorSetup } from "../apps/workbench/src/settings-connector-guide.ts";
import { CONNECTORS_SETTINGS_CLIENT_SCRIPT } from "../apps/workbench/src/scripts/connectors-settings.ts";

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

test("all current Connector cards expose a method directory with safe official links", () => {
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
  const settingsCards = listConnectorSettingsCards();
  assert.deepEqual(new Set(settingsCards.map((row) => row.connector_id)), new Set(HOST_CONNECTOR_DIRECTORY.map((row) => row.connector_id)));
  assert.ok(settingsCards.every((row) => row.method_options?.length), "settings endpoint cards must forward method options");
  const html = renderConnectorsSettings({
    connectors: HOST_CONNECTOR_DIRECTORY,
  }, { L: (value) => value, escapeHtml: (value) => String(value ?? ""), icon: () => "" });
  const notionDetail = html.match(/data-connector-detail="notion"[\s\S]*?(?=<section class="settings-connector-detail"|<\/section>\s*<section class="settings-connector-subgroup")/)?.[0] ?? "";
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

test("onboarding prefers ready account login and keeps developer configuration optional", () => {
  const p = { L: (s: string) => s, escapeHtml: (v: unknown) => String(v ?? ""), icon: () => "" };
  for (const service of ["gmail", "notion", "github"]) {
    const entry = HOST_CONNECTOR_DIRECTORY.find(c => c.connector_id === service)!;
    const ready = { ...entry, gmail_oauth_configured: true, notion_oauth_configured: true, github_client_id_configured: true };
    assert.equal(recommendedMethod(ready)?.kind, "oauth", service);
    const html = renderConnectorSetup(ready, p);
    assert.ok(html.includes(`data-account-login="${service}"`));
    assert.match(html, /<details class="settings-connector-help"><summary>使用其他应用配置/);
    const primary = html.split('<details class="settings-connector-alternatives">')[0]!;
    assert.doesNotMatch(primary, /<input[^>]* required/);
  }
  const gmail = { ...HOST_CONNECTOR_DIRECTORY.find(c => c.connector_id === "gmail")!, gmail_oauth_configured: false };
  const html = renderConnectorSetup(gmail, p);
  const main = html.split('<details class="settings-connector-alternatives">')[0]!;
  assert.match(main, /登录接入准备中/);
  assert.doesNotMatch(main, /<input|data-protocol-start/);
  assert.equal(recommendedMethod(gmail), undefined);
  assert.match(html, /首次连接需要服务商的应用配置/);
  assert.match(html, /data-protocol-field="client_id"[^>]*required/);
  assert.doesNotMatch(html, /data-account-login/);
  assert.equal(recommendedMethod({ ...gmail, connector_id: "loom", method_options: HOST_CONNECTOR_DIRECTORY.find(c => c.connector_id === "loom")!.method_options })?.kind, "mcp");
  // Compile the actual generated browser program, including template escaping.
  assert.doesNotThrow(() => new Function(CONNECTORS_SETTINGS_CLIENT_SCRIPT));
});

test("directory starts ready official login directly but keeps account management and unavailable services separate", () => {
  const cards = HOST_CONNECTOR_DIRECTORY;
  const html = renderConnectorsSettings({ connectors: cards }, { L: s => s, escapeHtml: v => String(v ?? ""), icon: () => "" });
  for (const id of ["notion", "linear", "gitlab", "stripe"]) {
    assert.match(html, new RegExp(`data-connector-open="${id}" data-connector-direct="mcp"`));
    assert.equal(recommendedMethod(cards.find(c => c.connector_id === id)!)?.kind, "mcp");
  }
  for (const id of ["gmail", "dropbox", "box", "zoom", "x"]) assert.doesNotMatch(html, new RegExp(`data-connector-open="${id}" data-connector-direct`));
  const notion = cards.find(c => c.connector_id === "notion")!;
  const main = renderConnectorSetup(notion, { L: s => s, escapeHtml: v => String(v ?? ""), icon: () => "" }).split('<details class="settings-connector-alternatives">')[0]!;
  assert.match(main, /data-protocol-start="mcp"/);
  assert.doesNotMatch(main, /<input[^>]* required/);
  const jira = cards.find(c => c.connector_id === "jira")!;
  const productJira = { ...jira, method_options: jira.method_options!.map(m => m.kind === "oauth" ? { ...m, login_ready: true } : m) };
  const jiraMain = renderConnectorSetup(productJira, { L: s => s, escapeHtml: v => String(v ?? ""), icon: () => "" }).split('<details class="settings-connector-alternatives">')[0]!;
  assert.match(jiraMain, /data-protocol-start="oauth"/);
  assert.doesNotMatch(jiraMain, /<input[^>]* required/, "server-owned workspace settings must not block the browser login button");
});

test("composite credentials keep separate labeled inputs when adding and replacing an account", () => {
  const card = HOST_CONNECTOR_DIRECTORY.find(c => c.connector_id === "jira")!;
  const html = renderConnectorsSettings({ connectors: [{ ...card }], connector_connections: [{
    connection_id: "11111111-1111-4111-8111-111111111111", service_id: "jira", display_name: "工作 Jira", account_label: "me@example.com", auth_method: "token", source: "managed", state: "connected",
  }] }, { L: s => s, escapeHtml: v => String(v ?? ""), icon: () => "" });
  const replace = html.match(/<form data-connection-replace=[\s\S]*?<\/form>/)![0];
  assert.match(replace, /data-credential-separator="\|"/);
  assert.match(replace, /站点域名/);
  assert.match(replace, /Atlassian 邮箱/);
  assert.equal([...replace.matchAll(/data-credential-part/g)].length, 3);
  assert.match(html, /<strong>工作 Jira<\/strong>/);
});
