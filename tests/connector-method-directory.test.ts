import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG_CONNECTORS } from "../plugins/official-integrations/catalog/src/catalog.ts";
import { OFFICIAL_CONNECTOR_METHODS, officialMethodsFor } from "../plugins/official-integrations/catalog/src/methods.ts";
import { HOST_CONNECTOR_DIRECTORY, listConnectorSettingsCards } from "../apps/local-host/src/connector-directory.ts";
import { renderConnectorsSettings } from "../apps/workbench/src/settings-connectors.ts";

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
    connectors: HOST_CONNECTOR_DIRECTORY.map((row) => ({ ...row, account_state: "disconnected" as const })),
  }, { L: (value) => value, escapeHtml: (value) => String(value ?? ""), icon: () => "" });
  const notionDetail = html.match(/data-connector-detail="notion"[\s\S]*?(?=<section class="settings-connector-detail"|<\/section>\s*<section class="settings-connector-subgroup")/)?.[0] ?? "";
  assert.match(notionDetail, /data-connector-method="mcp" data-method-support="in_app"/);
  assert.match(notionDetail, /需另行授权/);
  assert.match(html, /data-connector-method="cli" data-method-support="in_app"/);
  assert.match(html, /data-connector-method="token" data-method-support="paste"/);
  assert.match(html, /target="_blank" rel="noopener noreferrer" data-connector-method-link/);
});


test("every displayed official method has an executable host adapter and configuration controls", () => {
  const html = renderConnectorsSettings({ connectors: HOST_CONNECTOR_DIRECTORY.map(row => ({ ...row, account_state: "disconnected" as const })) }, { L: value => value, escapeHtml: value => String(value ?? ""), icon: () => "" });
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
