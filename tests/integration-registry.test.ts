import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { IntegrationProviderPort, PluginDefinition, PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type {
  IntegrationBinding,
  PluginConnectionServiceDeclaration,
  PluginIntegrationDeclaration,
} from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { IntegrationRegistry, connectorDirectory, homeIntegrationRegistry } from "@molis-ai/molis-work-app-local-host";
import { integrationKeyOf } from "@molis-ai/molis-work-plugin-feed";
import { definePollingIntegrationPlugin, parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";

// PG-046 (specs/repository-anti-corruption/slices/feed-inbox-integration-registry.md): the Home's integration registry is built from
// the declarations of the plugins enabled in it. The fixtures below are plugins nothing in the repository knows by name; they take the
// same path as the built-in ones.
const root = fileURLToPath(new URL("..", import.meta.url));
const source = (path: string) => readFileSync(join(root, path), "utf8");

const service = (id: string, extra: Partial<PluginConnectionServiceDeclaration> = {}): PluginConnectionServiceDeclaration => ({
  service_id: id, title: `${id} service`, group_id: "work", summary: `${id} fixture`, auth_kind: "token",
  auth: { methods: [{ kind: "token", label: `${id} token` }] },
  capabilities: [{ label: "Feed 拉取", fulfillment: "live" }], ...extra,
});

function manifestOf(pluginId: string, services: readonly PluginConnectionServiceDeclaration[], integrations: readonly PluginIntegrationDeclaration[]): PluginManifest {
  return {
    schema_version: 2, plugin_id: pluginId, version: "1.0.0", name: pluginId, kind: "integration",
    publisher: { publisher_id: "io.example", signature: "example-signature-v1" },
    host_api_version: 2,
    entrypoints: [{ deployment: "local", entrypoint: "./dist/index.js" }],
    permissions: [{ permission: "network:api.example.com", required: true, reason: "read the fixture service" }],
    capabilities: { provides: [`connector.driver.${pluginId}.v1`], consumes: ["connector.host.v1"] },
    artifacts: { produces: [], consumes: [] },
    ui: { contributions: [] },
    ...(services.length ? { connection_services: services } : {}),
    ...(integrations.length ? { integrations } : {}),
  };
}

interface Seen { context: PluginStartContext; binding: IntegrationBinding }

function fixturePlugin(
  pluginId: string, services: readonly PluginConnectionServiceDeclaration[], integrations: readonly PluginIntegrationDeclaration[],
  onProvider: (seen: Seen) => void = () => {},
): PluginDefinition {
  return definePollingIntegrationPlugin({
    manifest: manifestOf(pluginId, services, integrations),
    createProvider(context, binding): IntegrationProviderPort {
      onProvider({ context, binding });
      return {
        type: "fixture",
        async health() { return { ok: true, status: "connected", message: "ready" }; },
        async sync() { return { ok: true, mode: "fixture", items: [], cursor: { source: binding.source_id } }; },
      };
    },
  });
}

const binding = (sourceId: string, extra: Partial<IntegrationBinding> = {}): IntegrationBinding =>
  ({ source_id: sourceId, connection_id: `connection-${sourceId}`, credential_ref: `secret:fixture:${sourceId}`, config: {}, ...extra });

const holderOf = (pluginId: string, serviceId: string) => fixturePlugin(pluginId, [service(serviceId)], [{ integration_id: serviceId, kind: "source", service_id: serviceId }]);

test("RAC-488 the registry names no service: the old host file is gone and the keyed files hold no integration literal", () => {
  assert.equal(existsSync(join(root, "apps/local-host/src/official-integrations.ts")), false);
  for (const file of ["integration-registry.ts", "integration-declarations.ts"]) {
    assert.doesNotMatch(source(`apps/local-host/src/${file}`), /["'`](?:github|gmail|notion|feishu|lark|google-docs|google-drive|catalog)["'`]/u, file);
  }
  assert.doesNotMatch(source("apps/local-host/src/connector-directory.ts"), /CATALOG_CONNECTORS/u, "the directory is built from declarations");
  assert.doesNotMatch(source("apps/local-host/src/artifact-document-import.ts"), /CONNECTOR_IDS/u, "document import reads the registry");
});

test("RAC-488 Feed keys a source by its sync kind and connector kind; the key is the only thing the registry is asked with", () => {
  assert.equal(integrationKeyOf({ sync_kind: "github", kind: "github" }), "github");
  assert.equal(integrationKeyOf({ sync_kind: "gmail", kind: "gmail" }), "gmail");
  assert.equal(integrationKeyOf({ sync_kind: "connector", kind: "ext-feed" }), "ext-feed");
  assert.equal(integrationKeyOf({ sync_kind: "public_source", kind: "rss" }), null);
  assert.equal(integrationKeyOf({ sync_kind: "manual", kind: "manual" }), null);
});

test("RAC-488 a plugin nothing names is registered and bound the way the built-in ones are", async () => {
  const registry = await homeIntegrationRegistry("unused-home", () => ({
    type: "fixture", async health() { return { ok: true, status: "connected", message: "ready" }; },
    async sync() { return { ok: true, mode: "fixture", items: [], cursor: {} }; },
  }));
  await registry.enable(holderOf("io.molis.work.example.ext-feed", "ext-feed"));
  assert.equal(registry.integration("ext-feed")?.plugin_id, "io.molis.work.example.ext-feed");
  assert.ok(registry.hasSource("ext-feed"));
  assert.ok(connectorDirectory(registry).some(entry => entry.connector_id === "ext-feed" && entry.feed_available === true));
  const key = integrationKeyOf({ sync_kind: "connector", kind: "ext-feed" })!;
  const bound = await registry.bind(key, "source", binding("source-ext"));
  assert.equal((await bound.connector_driver.health()).ok, true);
  assert.equal((await bound.connector_driver.poll({ cursor: null })).ok, true);
});

test("RAC-489 one start per plugin, one provider per bound source, and a source's failure stays that source's", async () => {
  const providers: IntegrationBinding[] = [];
  let starts = 0;
  const plugin = fixturePlugin("io.molis.work.example.shared", [service("shared")], [{ integration_id: "shared", kind: "source", service_id: "shared" }],
    ({ binding: seen }) => {
      providers.push(seen);
      if (seen.source_id === "bad") throw new Error("provider for this source cannot be built");
    });
  const registry = new IntegrationRegistry();
  await registry.enable({ ...plugin, async start(context) { starts += 1; return plugin.start(context); } });
  const first = await registry.bind("shared", "source", binding("one"));
  const second = await registry.bind("shared", "source", binding("two"));
  assert.equal(starts, 1, "the plugin is started once, not once per source");
  assert.notEqual(first.connector_driver, second.connector_driver);
  await assert.rejects(registry.bind("shared", "source", binding("bad")), /cannot be built/u);
  const third = await registry.bind("shared", "source", binding("three"));
  assert.equal((await first.connector_driver.health()).ok, true, "a source that was bound earlier is untouched");
  assert.equal((await third.connector_driver.health()).ok, true, "one source failing does not stop the integration for the others");
  assert.equal(starts, 1);
  assert.deepEqual(providers.map(item => item.source_id), ["one", "two", "bad", "three"]);
});

test("RAC-489 a changed source setting binds a new provider without a restart", async () => {
  let starts = 0;
  const seen: IntegrationBinding[] = [];
  const plugin = fixturePlugin("io.molis.work.example.settings", [service("settings")], [{ integration_id: "settings", kind: "source", service_id: "settings" }], ({ binding: item }) => { seen.push(item); });
  const registry = new IntegrationRegistry();
  await registry.enable({ ...plugin, async start(context) { starts += 1; return plugin.start(context); } });
  await registry.bind("settings", "source", binding("one", { config: { scope: "in:inbox is:unread" } }));
  await registry.bind("settings", "source", binding("one", { config: { scope: "in:inbox" } }));
  assert.equal(starts, 1);
  assert.deepEqual(seen.map(item => item.config), [{ scope: "in:inbox is:unread" }, { scope: "in:inbox" }]);
});

test("RAC-489 a disabled plugin leaves its sources with an integration-unavailable fault, and the others keep working", async () => {
  const registry = new IntegrationRegistry();
  await registry.enable(holderOf("io.molis.work.example.gone", "gone"));
  await registry.enable(holderOf("io.molis.work.example.stays", "stays"));
  assert.ok(await registry.bind("gone", "source", binding("one")));
  await registry.disable("io.molis.work.example.gone");
  await assert.rejects(registry.bind("gone", "source", binding("one")), { code: "plugin.integration_unavailable" });
  assert.equal(registry.integration("gone"), undefined);
  assert.equal(registry.connectionServices().some(entry => entry.declaration.service_id === "gone"), false);
  assert.equal((await (await registry.bind("stays", "source", binding("two"))).connector_driver.health()).ok, true);
});

test("RAC-490 a later plugin that declares a held id fails to enable naming the id and the holder, and the holder is untouched", async () => {
  const registry = new IntegrationRegistry();
  await registry.enable(holderOf("io.molis.work.example.first", "contested"));
  const rival = fixturePlugin("io.molis.work.example.rival", [service("rival-service")], [{ integration_id: "contested", kind: "source", service_id: "rival-service" }]);
  await assert.rejects(registry.enable(rival), (error: unknown) => {
    assert.equal((error as { code?: string }).code, "plugin.integration_declaration_conflict");
    assert.match((error as Error).message, /contested/u);
    assert.match((error as Error).message, /io\.molis\.work\.example\.first/u);
    return true;
  });
  const sameService = fixturePlugin("io.molis.work.example.copycat", [service("contested")], []);
  await assert.rejects(registry.enable(sameService), { code: "plugin.integration_declaration_conflict" });
  assert.equal(registry.integration("contested")?.plugin_id, "io.molis.work.example.first");
  assert.equal(registry.connectionServices().find(entry => entry.declaration.service_id === "contested")?.owner, "io.molis.work.example.first");
  assert.equal(registry.connectionServices().some(entry => entry.declaration.service_id === "rival-service"), false, "a refused plugin records nothing");
  assert.equal((await (await registry.bind("contested", "source", binding("one"))).connector_driver.health()).ok, true);
});

test("RAC-490 installed plugins restore oldest first: the earlier install holds the id and the later one is reported refused", async () => {
  const early = holderOf("io.molis.work.example.early", "contested");
  const late = fixturePlugin("io.molis.work.example.late", [service("late-service")], [{ integration_id: "contested", kind: "source", service_id: "late-service" }]);
  const registry = new IntegrationRegistry();
  const refused = await registry.restore([
    { definition: late, installed_at: "2026-02-01T00:00:00.000Z" },
    { definition: early, installed_at: "2026-01-01T00:00:00.000Z" },
  ]);
  assert.deepEqual(refused.map(entry => entry.plugin_id), ["io.molis.work.example.late"]);
  assert.equal((refused[0]!.error as { code?: string }).code, "plugin.integration_declaration_conflict");
  assert.equal(registry.integration("contested")?.plugin_id, "io.molis.work.example.early");
});

test("RAC-490 the platform's own declarations come before any plugin's", async () => {
  const registry = new IntegrationRegistry({ platform: [service("host-card")] });
  assert.equal(registry.connectionServices()[0]?.owner, "platform");
  await assert.rejects(registry.enable(fixturePlugin("io.molis.work.example.takeover", [service("host-card")], [])),
    (error: unknown) => (error as { code?: string }).code === "plugin.integration_declaration_conflict" && /platform/u.test((error as Error).message));
  assert.equal(registry.connectionServices().find(entry => entry.declaration.service_id === "host-card")?.owner, "platform");
});

test("RAC-490 a declaration outside the shape is refused before it reaches the registry", () => {
  const ok = [service("shape")];
  const base = (integration: Record<string, unknown>) => ({ ...manifestOf("io.molis.work.example.shape", ok, []), integrations: [integration] });
  assert.throws(() => parsePluginManifest(base({ integration_id: "shape", kind: "stream", service_id: "shape" })), { code: "plugin.declaration_invalid" });
  assert.throws(() => parsePluginManifest(base({ integration_id: "shape", kind: "source", service_id: "someone-elses" })), { code: "plugin.declaration_invalid" }, "a service of another plugin cannot be referenced");
  assert.throws(() => parsePluginManifest(base({ integration_id: "shape", kind: "source", service_id: "shape", document_source: "notes" })), { code: "plugin.declaration_invalid" });
  assert.throws(() => parsePluginManifest(base({ integration_id: "shape", kind: "document_import", service_id: "shape" })), { code: "plugin.declaration_invalid" });
  assert.ok(parsePluginManifest(base({ integration_id: "shape", kind: "document_import", service_id: "shape", document_source: "notes" })));
});

test("RAC-490 a source integration is not a document import, and a document import is not a source", async () => {
  const registry = new IntegrationRegistry();
  await registry.enable(fixturePlugin("io.molis.work.example.both", [service("both")], [
    { integration_id: "both", kind: "source", service_id: "both" },
    { integration_id: "both-documents", kind: "document_import", service_id: "both", document_source: "both-docs" },
  ]));
  assert.ok(await registry.bind("both", "source", binding("one")));
  await assert.rejects(registry.bind("both", "document_import", binding("one")), { code: "plugin.integration_unavailable" });
  await assert.rejects(registry.bind("both-documents", "source", binding("one")), { code: "plugin.integration_unavailable" });
  assert.deepEqual(registry.listIntegrations("document_import").map(entry => entry.declaration.document_source), ["both-docs"]);
  assert.deepEqual(registry.listIntegrations("source").map(entry => entry.declaration.integration_id), ["both"]);
});

test("RAC-491 the directory is the platform's cards then each plugin's declared services, built from declarations alone", async () => {
  const registry = await homeIntegrationRegistry("unused-home", () => ({
    type: "fixture", async health() { return { ok: true, status: "connected", message: "ready" }; },
    async sync() { return { ok: true, mode: "fixture", items: [], cursor: {} }; },
  }));
  const directory = connectorDirectory(registry);
  assert.equal(directory.length, 4 + 2 + 39, "four platform cards, GitHub and Gmail, and the catalog's connectors");
  assert.deepEqual(directory.slice(0, 4).map(entry => entry.connector_id), ["model-api", "typesafe", "image-api", "mcp-bearer"]);
  assert.deepEqual(directory.slice(4, 6).map(entry => entry.connector_id), ["github", "gmail"]);
  const loom = directory.find(entry => entry.connector_id === "loom")!;
  assert.equal(loom.feed_available, false, "a service with no source integration says Feed cannot read it");
  assert.equal(directory.find(entry => entry.connector_id === "github")!.feed_available, true);
  assert.equal(directory.find(entry => entry.connector_id === "model-api")!.feed_available, undefined, "a platform card does not say");
});

test("RAC-491 notion is both a Feed source and a document import; google-docs reads with the google-drive account", async () => {
  const registry = await homeIntegrationRegistry("unused-home", () => ({
    type: "fixture", async health() { return { ok: true, status: "connected", message: "ready" }; },
    async sync() { return { ok: true, mode: "fixture", items: [], cursor: {} }; },
  }));
  assert.equal(registry.integration("notion")?.declaration.kind, "source");
  assert.deepEqual(registry.integration("notion-documents")?.declaration, { integration_id: "notion-documents", kind: "document_import", service_id: "notion", document_source: "notion" });
  assert.equal(registry.integration("notion")?.plugin_id, registry.integration("notion-documents")?.plugin_id);
  const documents = Object.fromEntries(registry.listIntegrations("document_import").map(entry => [entry.declaration.document_source, entry.declaration.service_id]));
  assert.deepEqual(documents, { notion: "notion", feishu: "feishu", lark: "lark", "google-docs": "google-drive" });
});

test("RAC-519 declaring a service that is registered is refused, and the registered one keeps its card and its sources", async () => {
  const registry = await homeIntegrationRegistry("unused-home", () => ({
    type: "fixture", async health() { return { ok: true, status: "connected", message: "ready" }; },
    async sync() { return { ok: true, mode: "fixture", items: [], cursor: {} }; },
  }));
  await assert.rejects(registry.enable(fixturePlugin("io.molis.work.example.lookalike", [service("github", { title: "GitHub, honest" })], [{ integration_id: "github-clone", kind: "source", service_id: "github" }])),
    (error: unknown) => (error as { code?: string }).code === "plugin.integration_declaration_conflict" && /github/u.test((error as Error).message));
  assert.equal(registry.connectionServices().find(entry => entry.declaration.service_id === "github")?.declaration.title, "GitHub");
  assert.equal(registry.integration("github-clone"), undefined);
  assert.ok(await registry.bind("github", "source", binding("one")));
});

test("RAC-519 a registered plugin gets no connection service and its binding holds only the references of its source's own connection", async () => {
  const seen: Seen[] = [];
  const registry = new IntegrationRegistry();
  await registry.enable(fixturePlugin("io.molis.work.example.cardholder", [service("cardholder")], [{ integration_id: "cardholder", kind: "source", service_id: "cardholder" }], item => seen.push(item)));
  await registry.bind("cardholder", "source", binding("mine"));
  const { context, binding: given } = seen[0]!;
  assert.equal(context.services?.connections, undefined, "owning a card does not open the connections service");
  assert.throws(() => context.requireGrant("connections:use"), { code: "plugin.grant_denied" });
  assert.deepEqual(Object.keys(given).sort(), ["config", "connection_id", "credential_ref", "source_id"]);
  assert.equal(given.connection_id, "connection-mine");
  assert.equal(given.credential_ref, "secret:fixture:mine");
  assert.ok(!JSON.stringify(given).includes("service_id"), "the binding is not looked up by service");
});
