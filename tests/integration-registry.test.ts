import { connectorControl } from "./fixtures/connector-control.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { IntegrationProviderPort, PluginDefinition, PluginManifest, PluginPackagePayload, PluginStartContext, PluginIntegrationContribution } from "@molis-ai/molis-work-contracts/platform/plugin";
import type {
  IntegrationBinding,
  PluginConnectionServiceDeclaration,
  PluginIntegrationDeclaration,
} from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { IntegrationRegistry, connectorDirectory, homeIntegrationRegistry, PluginInstallService, SandboxPackageStore, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { MemoryPluginConsentLedger, signPluginPackage } from "@molis-ai/molis-work-plugin-runtime";
import { integrationPackage } from "./fixtures/home-upgrade-source.js";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { integrationKeyOf } from "@molis-ai/molis-work-plugin-feed";
import { definePollingIntegrationPlugin, parsePluginManifest, pollingIntegrationBinding } from "@molis-ai/molis-work-plugin-sdk";
import { rssIntegrationManifest, rssSourcePresentation } from "@molis-ai/molis-work-integration-rss";
import { gmailIntegrationManifest, gmailSourcePresentation } from "@molis-ai/molis-work-integration-gmail";

test("RAC-2507 presentation declarations use schema/API 2 and the packaged JSON keeps the same unreleased plugin identity", () => {
  assert.equal(rssIntegrationManifest.version, "1.0.0");
  assert.throws(() => parsePluginManifest({ ...rssIntegrationManifest, schema_version: 1, host_api_version: 1 }), /source_presentations 需要 schema_version 2/u);
  assert.throws(() => parsePluginManifest({ ...rssIntegrationManifest, host_api_version: 1 }), /host_api_version 与之相同/u);
  for (const [id, manifest] of [["rss", rssIntegrationManifest], ["gmail", gmailIntegrationManifest]] as const) {
    assert.deepEqual(parsePluginManifest(JSON.parse(source(`plugins/official-integrations/${id}/manifest.json`))), parsePluginManifest(manifest));
  }
});

test("RAC-2507 pure presentations use the actual declaring integration, without binding a source or reading an account", async () => {
  const registry = new IntegrationRegistry();
  let bound = 0, reads = 0, result: unknown = { scope_options: [{ value: "narrow", label: "Narrow scope" }] };
  const manifest = { ...manifestOf("io.molis.work.example.pure", [], []), source_presentations: ["fixture-display"] };
  const definition = definePollingIntegrationPlugin({ manifest, createProvider() { bound++; throw new Error("must not bind"); },
    presentSource(id, input) { reads++; assert.equal(id, "fixture-display"); assert.deepEqual(input, { cursor: { last: "one" } }); return result as never; } });
  await registry.enable(definition);
  const input = { cursor: { last: "one" } }, answer = await registry.presentSource("fixture-display", input);
  assert.deepEqual(answer, result); assert.notEqual(answer, result); assert.deepEqual(input, { cursor: { last: "one" } });
  await assert.rejects(registry.presentSource("not-declared", input), { code: "plugin.integration_unavailable" });
  await assert.rejects(registry.presentSource("fixture-display", { cursor: new Date() }), { code: "plugin.declaration_invalid" });
  for (const invalid of [{ home_url: "https://user:secret@example.com" }, { home_url: "javascript:alert(1)" }, { scope_options: [{ value: "x", label: "<script>" }] }, { credential_ref: "secret" }]) {
    result = invalid; await assert.rejects(registry.presentSource("fixture-display", input), { code: "plugin.declaration_invalid" });
  }
  const rival = definePollingIntegrationPlugin({ ...definition, manifest: { ...manifest, plugin_id: "io.molis.work.example.rival-pure" }, createProvider() { throw new Error("never"); }, presentSource: () => ({}) });
  await assert.rejects(registry.enable(rival), { code: "plugin.integration_declaration_conflict" });
  assert.equal(bound, 0); assert.equal(reads, 5);
  await registry.disable(manifest.plugin_id);
  await assert.rejects(registry.presentSource("fixture-display", input), { code: "plugin.integration_unavailable" });
  const builtin = await homeIntegrationRegistry("/tmp/t402-pure-presentations-only");
  const cursor = (fields: Record<string, unknown>) => ({ rss_http: { schema: "molis-work-rss-http-v1", consecutive_failures: 0, ...fields } });
  for (const [fields, status] of [[{}, "not-fetched"], [{ last_success_at: "2026-10-30T10:00:00Z" }, "unvalidated"], [{ last_modified: "yesterday" }, "last-modified"], [{ etag: "v1", last_modified: "yesterday" }, "etag"]] as const) {
    const request = { cursor: cursor({ ...fields, home_url: "https://example.com/news#top" }) };
    const presented = await builtin.presentSource("rss-http", request);
    assert.deepEqual(presented, rssSourcePresentation(request)); assert.equal(presented.conditional_request, status); assert.equal(presented.home_url, "https://example.com/news");
  }
  const scopes = await builtin.presentSource("gmail-scope", {});
  assert.deepEqual(scopes, gmailSourcePresentation()); assert.deepEqual(scopes.scope_options, [
    { value: "in:inbox is:unread", label: "未读收件箱" }, { value: "in:inbox", label: "全部收件箱" },
    { value: "is:starred", label: "星标邮件" }, { value: "is:important", label: "重要邮件" }]);
});

test("RAC-2507 an attached presentation cannot return data after its original provider is replaced or withdrawn", async () => {
  const registry = new IntegrationRegistry(), manifest = { ...manifestOf("io.molis.work.example.held-display", [], []), source_presentations: ["held-display"] };
  let release!: () => void, entered!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const original: PluginIntegrationContribution = { kind: "integration", bind: () => { throw new Error("no binding"); },
    async presentSource() { entered(); await held; return { home_url: "https://old.example.com" }; } };
  let active: PluginIntegrationContribution | null = original;
  await registry.attach(manifest, "display-install", () => active, () => active !== null);
  const pending = registry.presentSource("held-display", {}), refused = assert.rejects(pending, { code: "plugin.integration_unavailable" });
  await waiting; active = { ...original, presentSource: () => ({ home_url: "https://new.example.com" }) }; release(); await refused;
  assert.equal((await registry.presentSource("held-display", {})).home_url, "https://new.example.com");
  active = null; await assert.rejects(registry.presentSource("held-display", {}), { code: "plugin.integration_unavailable" });
  await registry.detach(manifest.plugin_id);
});

// PG-046 (specs/repository-anti-corruption/slices/feed-inbox-integration-registry.md): the Home's integration registry is built from
// the declarations of the plugins enabled in it. The fixtures below are plugins nothing in the repository knows by name; they take the
// same path as the built-in ones.
const root = fileURLToPath(new URL("..", import.meta.url));

test("RAC2880 signed data-MCP is refused by the real preview and attach, including an existing attachment", async () => {
  const home = mkdtempSync(join(tmpdir(), "t068-mcp-preview-")), registry = new IntegrationRegistry();
  const publisher = newPublisher(), original = integrationPackage(publisher);
  const base = original.payload.manifest as PluginManifest;
  const manifest: PluginManifest = { ...base, connection_services: base.connection_services!.map(service => ({
    ...service, auth: { methods: [...service.auth.methods, { kind: "mcp" as const, endpoint: "https://api.example-feed.com/mcp", auth: "oauth" as const }] },
  })) };
  const payload: PluginPackagePayload = { ...original.payload, manifest, files: original.payload.files.map(file => file.path === "manifest.json"
    ? { ...file, content_base64: Buffer.from(JSON.stringify(manifest)).toString("base64") } : file) };
  const bundle = signPluginPackage({ payload, signature: null, publisher_key: null }, publisher.signer);
  const ledger = new MemoryPluginConsentLedger(), installs: string[] = [];
  const install = new PluginInstallService({ ledger, packages: new SandboxPackageStore(home),
    assertIntegrationsFree: async value => registry.assertFree(value),
    installed: async () => [], control: async () => "disabled",
    installInProject: async () => { installs.push("project"); }, installInHome: async () => { installs.push("home"); } });
  let contributions = 0;
  try {
    assert.ok(parsePluginManifest(manifest), "shape validation permits Host data; admission is the registry's boundary");
    const bare: PluginManifest = { ...manifest, connection_services: manifest.connection_services!.map(service => ({
      ...service, auth: { methods: [{ kind: "mcp" as const }] },
    })) };
    assert.equal(await registry.attach(bare, "same-install", () => null, () => true), true, "kind-only MCP remains admissible");
    const before = registry.connectionServices();
    await assert.rejects(install.preview({ bundle }, { project_id: "t068-preview", actor_id: "person" }),
      { code: "plugin.declaration_invalid", message: /MCP.*example-feed.*宿主构建/ });
    for (const live of [true, false]) await assert.rejects(registry.attach(manifest, "same-install", () => {
      contributions++; return null;
    }, () => live), { code: "plugin.declaration_invalid" });
    assert.equal(contributions, 0);
    assert.deepEqual(registry.connectionServices(), before);
    assert.equal(registry.mcpOwner("example-feed"), undefined);
    assert.deepEqual(ledger.publishers(), []);
    assert.deepEqual(installs, []);
    assert.deepEqual(readdirSync(home), [], "preview/attach created no package, installation, protocol or secret file");
    assert.deepEqual(withConnectorConnections(home, store => store.list()), []);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("RAC2887 malformed remote MCP data refuses the whole manifest while valid data starts as a real Host contribution", async () => {
  const method = { kind: "mcp", endpoint: "https://mcp.example.test/mcp", auth: "either" };
  const declare = (value: Record<string, unknown>) => ({ ...manifestOf("io.molis.work.example.mcp-shape", [], []),
    connection_services: [{ ...service("mcp-shape"), auth: { methods: [value] } }] });
  for (const value of [
    { ...method, extra: true }, { ...method, endpoint: "http://mcp.example.test/mcp" },
    { ...method, endpoint: "https://person:password@mcp.example.test/mcp" },
    { ...method, endpoint: "https://mcp.example.test/mcp#private" }, { ...method, endpoint: "https://mcp.example.test/mcp?token=fixture" },
    { ...method, auth: "password" }, { ...method, auth: {} }, { ...method, registration: "dynamic" },
    { ...method, token_scheme: "Unknown" }, { kind: "mcp", endpoint: method.endpoint },
    { ...method, endpoint_pattern: ".*" }, { ...method, endpoint_pattern: { source: "https://.*", flags: "u" } },
    { ...method, endpoint_pattern: { source: "^https://.*$", flags: "g" } },
    { ...method, endpoint_pattern: { source: "^[$", flags: "u" } },
  ]) assert.throws(() => parsePluginManifest(declare(value)), { code: "plugin.declaration_invalid" });
  assert.ok(parsePluginManifest(declare({ kind: "mcp" })));
  const valid = { kind: "mcp", endpoint: "https://mcp.example.test/mcp", auth: "either",
    endpoint_pattern: { source: "^https://mcp\\.example\\.test/mcp$", flags: "iu" } } as const;
  const registry = new IntegrationRegistry();
  await registry.enable(fixturePlugin("io.molis.work.example.mcp-shape", [service("mcp-shape", { auth: { methods: [valid] } })], []));
  assert.deepEqual(registry.mcpOwner("mcp-shape")?.method, valid);
  assert.equal(registry.mcpOwner("mcp-shape")?.state, "running");
});
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
  assert.equal((await bound.connector_driver.health(connectorControl())).ok, true);
  assert.equal((await bound.connector_driver.poll({ cursor: null }, connectorControl())).ok, true);
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
  assert.equal((await first.connector_driver.health(connectorControl())).ok, true, "a source that was bound earlier is untouched");
  assert.equal((await third.connector_driver.health(connectorControl())).ok, true, "one source failing does not stop the integration for the others");
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
  assert.equal((await (await registry.bind("stays", "source", binding("two"))).connector_driver.health(connectorControl())).ok, true);
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
  assert.equal((await (await registry.bind("contested", "source", binding("one"))).connector_driver.health(connectorControl())).ok, true);
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
  assert.ok(parsePluginManifest(base({ integration_id: "shape", kind: "document_import", service_id: "shape", document_source: "notes", connection_methods: ["token"] })));
});

test("RAC-490 a source integration is not a document import, and a document import is not a source", async () => {
  const registry = new IntegrationRegistry();
  await registry.enable(fixturePlugin("io.molis.work.example.both", [service("both")], [
    { integration_id: "both", kind: "source", service_id: "both" },
    { integration_id: "both-documents", kind: "document_import", service_id: "both", document_source: "both-docs", connection_methods: ["token"] },
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
  assert.deepEqual(registry.integration("notion-documents")?.declaration, { integration_id: "notion-documents", kind: "document_import", service_id: "notion", document_source: "notion", connection_methods: ["token", "oauth"] });
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

// PG-046's remainder (specs/repository-anti-corruption/slices/pg046-integrations-from-manifest.md §3).
const fixtureProvider = () => ({
  type: "fixture", async health() { return { ok: true, status: "connected" as const, message: "ready" }; },
  async sync() { return { ok: true as const, mode: "fixture" as const, items: [], cursor: {} }; },
});

test("RAC-890 a source's account reads the way its integration plugin says; the Host picks no integration's account function", async () => {
  const host = source("apps/local-host/src/connector-source-pull.ts");
  assert.doesNotMatch(host, /AccountPresentation|sync_kind\s*===/u, "the Feed's Host side names no integration's account");
  const registry = await homeIntegrationRegistry("unused-home", fixtureProvider);
  const github = await registry.bind("github", "source", binding("gh"));
  assert.equal(github.account?.({ provider: "github", account_login: "octo" }, null)?.account_label, "@octo");
  const gmail = await registry.bind("gmail", "source", binding("mail", { config: { scope: "in:inbox" } }));
  const mail = gmail.account?.({ mode: "live", account_email: "Me@Example.com" }, "old label");
  assert.equal(mail?.account_label, "me@example.com");
  assert.equal(mail?.scope, "in:inbox", "Gmail's scope comes from the source's own binding");
  const catalog = await registry.bind("notion", "source", binding("notes"));
  assert.equal(catalog.account?.({ mode: "live", provider: "notion", account_login: "team" }, null)?.account_label, "team");
  assert.equal(catalog.account?.({ mode: "fixture" }, "kept"), null, "a pull that says nothing about the account changes nothing");

  const seen: string[] = [];
  const own = new IntegrationRegistry();
  await own.enable(definePollingIntegrationPlugin({
    manifest: manifestOf("io.molis.work.example.labelled", [service("labelled")], [{ integration_id: "labelled", kind: "source", service_id: "labelled" }]),
    createProvider: fixtureProvider,
    presentAccount(cursor, label, bound) { seen.push(bound.source_id); return { account_label: `${label} → ${(cursor as { who: string }).who}`, region: "eu" }; },
  }));
  assert.deepEqual((await own.bind("labelled", "source", binding("one"))).account?.({ who: "ann" }, "before"), { account_label: "before → ann", region: "eu" });
  assert.deepEqual(seen, ["one"], "the plugin is told which source it is presenting");
  await own.enable(holderOf("io.molis.work.example.silent", "silent"));
  assert.equal((await own.bind("silent", "source", binding("two"))).account, undefined, "a plugin that says nothing leaves the source's account alone");
});

test("RAC-892 the SDK refuses connection_methods missing, empty, repeated or unknown on a document import, and on a source", () => {
  const base = (integration: Record<string, unknown>) => ({ ...manifestOf("io.molis.work.example.methods", [service("methods")], []), integrations: [integration] });
  const documents = (extra: Record<string, unknown>) => base({ integration_id: "methods", kind: "document_import", service_id: "methods", document_source: "notes", ...extra });
  for (const [why, methods] of [["missing", undefined], ["empty", []], ["repeated", ["token", "token"]], ["unknown", ["token", "password"]], ["not a list", "token"]] as const) {
    assert.throws(() => parsePluginManifest(documents(methods === undefined ? {} : { connection_methods: methods })), { code: "plugin.declaration_invalid", message: /connection_methods/u }, why);
  }
  assert.throws(() => parsePluginManifest(base({ integration_id: "methods", kind: "source", service_id: "methods", connection_methods: ["token"] })),
    { code: "plugin.declaration_invalid", message: /只有文档导入才写 connection_methods/u });
  assert.ok(parsePluginManifest(documents({ connection_methods: ["token", "oauth", "cli"] })));
});

// W5-11 slice 3 §2.8 (specs/repository-anti-corruption/slices/w511-connector-oauth-declarations.md): until installs are trusted by
// signature, an OAuth flow as data is the Host's build's alone. A signed sandbox package that carries one is refused before anything of
// its install or its ids is held. Since slice 4 a bare kind is refused by the Manifest checks.
test("RAC-1081 a signed package's data-bearing oauth method is refused at attach and at the install preview, and holds nothing", async () => {
  // A flow the SDK's own checks pass (asana's identity address is in the platform's table), so what refuses it is the registry.
  const flow = { kind: "oauth", grant: "authorization_code", authorize_url: "https://app.asana.com/-/oauth_authorize", token_url: "https://app.asana.com/-/oauth_token",
    scopes: [], identity: { url: "https://app.asana.com/api/1.0/users/me", account_id: [[], ["identity:/data/gid"]], label: ["identity:/data/name"] } } as const;
  const carrying = manifestOf("io.molis.work.example.oauth-carrier", [service("asana", { auth: { methods: [{ kind: "token", label: "token" }, flow] } })],
    [{ integration_id: "oauth-carrier", kind: "source", service_id: "asana" }]);
  assert.ok(parsePluginManifest(carrying), "the Manifest itself is well formed");
  const registry = new IntegrationRegistry();
  let asked = 0;
  assert.throws(() => registry.assertFree(carrying), { code: "plugin.declaration_invalid", message: /asana.*宿主构建的插件/u });
  await assert.rejects(registry.attach(carrying, "install-carrier", () => { asked += 1; return null; }, () => true), { code: "plugin.declaration_invalid", message: /asana.*宿主构建的插件/u });
  assert.equal(asked, 0, "the package's instance is never asked for a contribution");
  assert.equal(registry.connectionServices().some(entry => entry.declaration.service_id === "asana"), false);
  assert.equal(registry.integration("oauth-carrier"), undefined);
  assert.equal(registry.oauthOwner("asana"), undefined);
  // The bare kind named the platform's table, which is gone (W5-11 slice 4): the Manifest itself is refused, so nothing attaches.
  const bare = manifestOf("io.molis.work.example.oauth-bare", [service("oauth-bare", { auth: { methods: [{ kind: "oauth" }] } })], [{ integration_id: "oauth-bare", kind: "source", service_id: "oauth-bare" }]);
  assert.throws(() => parsePluginManifest(bare), { code: "plugin.declaration_invalid", message: /要把授权流程写成数据/u });
  assert.equal(registry.oauthOwner("oauth-bare"), undefined);
  // The Host's own build may carry the flow: it is enabled, and is the owner with its install, publisher and method.
  await registry.enable(fixturePlugin("io.molis.work.example.oauth-built", [service("asana", { auth: { methods: [flow] } })], []));
  const owner = registry.oauthOwner("asana");
  assert.equal(owner?.plugin_id, "io.molis.work.example.oauth-built");
  assert.equal(owner?.publisher_id, "io.example");
  assert.ok(owner?.install_id);
  assert.deepEqual(owner?.method, flow);
});

// RAC-2447 (T-330, T-302 二审登记): two plugins cannot claim the same document source. The first holder keeps it, the refused one records
// nothing, and the document import table (what `documentImports()` reads from `listIntegrations`) is unchanged.
test("RAC-2447 RAC-2787 RAC-2788 document source conflicts refuse enable and attach before side effects", async () => {
  const registry = new IntegrationRegistry();
  const first = fixturePlugin("io.molis.work.example.docs", [service("docs-service")], [
    { integration_id: "docs-notes", kind: "document_import", service_id: "docs-service", document_source: "notes", connection_methods: ["token"] },
  ]);
  await registry.enable(first);
  const documents = () => Object.fromEntries(registry.listIntegrations("document_import").map(entry => [entry.declaration.document_source, entry.declaration.service_id]));
  assert.deepEqual(documents(), { notes: "docs-service" });
  const services = () => registry.connectionServices().map(entry => [entry.declaration.service_id, entry.owner]);
  const sources = () => registry.listIntegrations("document_import").map(entry =>
    [entry.declaration.document_source, entry.declaration.service_id, entry.plugin_id]);
  const holderServices = services();
  const holderSources = sources();
  assert.deepEqual(holderServices, [["docs-service", "io.molis.work.example.docs"]]);
  assert.deepEqual(holderSources, [["notes", "docs-service", "io.molis.work.example.docs"]]);
  assert.equal(registry.pluginName("io.molis.work.example.docs"), "io.molis.work.example.docs");
  const assertHolderAndRefusal = async () => {
    assert.deepEqual(services(), holderServices, "the holder's service owner survives refusal");
    assert.deepEqual(sources(), holderSources, "the holder's document source survives refusal");
    assert.equal(registry.pluginName("io.molis.work.example.docs"), "io.molis.work.example.docs");
    assert.equal(registry.connectionServices().some(entry => entry.declaration.service_id === "rival-docs-service"), false);
    assert.equal(registry.pluginName("io.molis.work.example.docs-rival"), undefined);
    assert.equal(registry.integration("rival-notes"), undefined);
    const bound = await registry.bind("docs-notes", "document_import", binding("holder-notes"));
    assert.equal((await bound.connector_driver.health(connectorControl())).ok, true, "the holder still binds a healthy driver");
  };
  const rival = fixturePlugin("io.molis.work.example.docs-rival", [service("rival-docs-service")], [
    { integration_id: "rival-notes", kind: "document_import", service_id: "rival-docs-service", document_source: "notes", connection_methods: ["token"] },
  ]);
  let starts = 0;
  await assert.rejects(registry.enable({ ...rival, async start(context) { starts += 1; return rival.start(context); } }), (error: unknown) => {
    assert.equal((error as { code?: string }).code, "plugin.integration_declaration_conflict");
    assert.match((error as Error).message, /notes/u);
    assert.match((error as Error).message, /io\.molis\.work\.example\.docs/u);
    return true;
  });
  // RAC-2787 / RAC-2789: moving the production conflict check past start must fail here with starts=1.
  assert.equal(starts, 0, "a conflicting document source must be refused before start");
  assert.deepEqual(documents(), { notes: "docs-service" }, "the refused plugin records nothing and the first source stays");
  await assertHolderAndRefusal();
  // RAC-2788 / RAC-2789: attach asks live(), but must not ask for a contribution before refusal.
  let contributions = 0;
  await assert.rejects(registry.attach(rival.manifest, "fixture-docs-rival-install", () => { contributions += 1; return null; }, () => true),
    { code: "plugin.integration_declaration_conflict" });
  assert.equal(contributions, 0, "a conflicting document source must be refused before contribution");
  assert.deepEqual(documents(), { notes: "docs-service" });
  await assertHolderAndRefusal();
  // RAC-2790: the full file is rerun after both production mutations are restored.
});

// RAC-2448 (T-330): a plugin declaring its own source again is not a conflict; `release` frees it for another plugin; and one Manifest
// cannot write the same document_source in two integrations.
test("RAC-2448 a plugin's own source is not a conflict, release frees it, and one Manifest declares a source once", async () => {
  const registry = new IntegrationRegistry();
  const packaged = manifestOf("io.molis.work.example.packaged", [service("packaged-service")], [
    { integration_id: "packaged-notes", kind: "document_import", service_id: "packaged-service", document_source: "packaged", connection_methods: ["token"] },
  ]);
  await registry.attach(packaged, "fixture-docs-packaged-install", () => null, () => true);
  registry.assertFree(packaged);
  assert.throws(() => registry.assertFree(manifestOf("io.molis.work.example.same", [service("same-service")], [
    { integration_id: "same-one", kind: "document_import", service_id: "same-service", document_source: "notes", connection_methods: ["token"] },
    { integration_id: "same-two", kind: "document_import", service_id: "same-service", document_source: "notes", connection_methods: ["token"] },
  ])), { code: "plugin.integration_declaration_conflict" });
  await registry.detach("io.molis.work.example.packaged");
  const second = fixturePlugin("io.molis.work.example.after", [service("after-service")], [
    { integration_id: "after-packaged", kind: "document_import", service_id: "after-service", document_source: "packaged", connection_methods: ["token"] },
  ]);
  await registry.enable(second);
  assert.deepEqual(registry.listIntegrations("document_import").map(entry => [entry.declaration.document_source, entry.plugin_id]),
    [["packaged", "io.molis.work.example.after"]]);
});

// T-134 (BL-530 前置): a connection made for a package's service is pinned to the package that declared it. The registry names it from
// what the Home attached, the install id included; a service the Host's build or the platform declares is pinned to nothing.
test("RAC-2521 connectionDeclarer names the attached package and the install the Home gave it; a built or platform service has none, and none after detach", async () => {
  const registry = new IntegrationRegistry({ platform: [service("host-card")] });
  await registry.enable(fixturePlugin("io.molis.work.example.built", [service("built")], []));
  const packaged = manifestOf("io.molis.work.example.packaged", [service("packaged")], [{ integration_id: "packaged", kind: "source", service_id: "packaged" }]);
  assert.equal(await registry.attach(packaged, "install-from-home-record", () => null, () => true), true);
  assert.deepEqual(registry.connectionDeclarer("packaged"), { plugin_id: "io.molis.work.example.packaged", install_id: "install-from-home-record", plugin_title: "io.molis.work.example.packaged" });
  assert.equal(registry.connectionDeclarer("built"), undefined, "the Host's build declares it: nothing to pin");
  assert.equal(registry.connectionDeclarer("host-card"), undefined, "the platform declares it: nothing to pin");
  assert.equal(registry.connectionDeclarer("nobody"), undefined);
  await registry.detach("io.molis.work.example.packaged");
  assert.equal(registry.connectionDeclarer("packaged"), undefined, "a detached package declares nothing");
});

test("RAC-2615-REG reattaching the same installation replaces declarations atomically, and a refused replacement keeps the old owner", async () => {
  const registry = new IntegrationRegistry();
  const id = "io.molis.work.example.upgrade";
  const first = manifestOf(id, [service("old", { origins: ["https://old.example.com"] })], [{ integration_id: "old-source", kind: "source", service_id: "old" }]);
  const next = manifestOf(id, [service("new", { title: "New title", origins: ["https://new.example.com"] })], [{ integration_id: "new-source", kind: "source", service_id: "new" }]);
  await registry.attach(first, "same-install", () => null, () => true);
  await registry.attach(next, "same-install", () => null, () => true);
  assert.equal(registry.integration("old-source"), undefined);
  assert.equal(registry.integration("new-source")?.plugin_id, id);
  assert.deepEqual(registry.connectionServices().map(entry => entry.declaration.service_id), ["new"]);
  assert.deepEqual(registry.connectionDeclarer("new"), { plugin_id: id, install_id: "same-install", plugin_title: id });
  const snapshot = registry.connectionServices();
  const rival = manifestOf("io.molis.work.example.rival", [service("taken")], []);
  await registry.attach(rival, "rival-install", () => null, () => true);
  const conflict = manifestOf(id, [service("taken")], []);
  await assert.rejects(registry.attach(conflict, "same-install", () => null, () => true), { code: "plugin.integration_declaration_conflict" });
  assert.deepEqual(registry.connectionServices().filter(entry => entry.owner === id), snapshot);
  assert.equal(registry.connectionDeclarer("new")?.install_id, "same-install");
  const oauth = manifestOf(id, [service("asana", { auth: { methods: [{ kind: "oauth", grant: "authorization_code", authorize_url: "https://app.asana.com/-/oauth_authorize", token_url: "https://app.asana.com/-/oauth_token", scopes: [], identity: { url: "https://app.asana.com/api/1.0/users/me", account_id: [[], ["identity:/data/gid"]], label: ["identity:/data/name"] } }] } })], []);
  assert.ok(parsePluginManifest(oauth));
  await assert.rejects(registry.attach(oauth, "same-install", () => null, () => true), { code: "plugin.declaration_invalid", message: /宿主构建/ });
  assert.deepEqual(registry.connectionServices().filter(entry => entry.owner === id), snapshot);
  assert.equal(await registry.attach(first, "same-install", () => null, () => false), false);
  assert.equal(registry.integration("new-source")?.plugin_id, id, "a stopped queued attachment cannot restore old declarations");
});


// RAC-2615: the retained producer check is issued before the first provider wait, and belongs to that exact attachment.
test("RAC-2615-HELD a binding retains its provider before waiting; replacement cannot revive it and a refused replacement cannot revoke the current one", async () => {
  const registry = new IntegrationRegistry(), id = "io.molis.work.example.heldsource";
  const manifest = manifestOf(id, [service("held")], [{ integration_id: "held", kind: "source", service_id: "held" }]);
  const contribution: PluginIntegrationContribution = { kind: "integration", bind: () => pollingIntegrationBinding({ manifest,
    provider: { type: "fixture", health: async () => ({ ok: true, status: "connected", message: "ready" }),
      sync: async () => ({ ok: true, mode: "live", items: [], cursor: "current" }) } }) };
  let live = true;
  await registry.attach(manifest, "same-install", () => contribution, () => live);
  const held: Array<() => void> = [];
  const pending = registry.bind("held", "source", binding("one"), check => held.push(check)).then(value => ({ value }), error => ({ error }));
  try {
    assert.equal(held.length, 1, "the check was retained synchronously, before contribution recovery/binding could wait");
    live = false;
    assert.ok("error" in await pending, "a stopped instance cannot finish an already-entered binding");
    assert.throws(held[0]!, { code: "plugin.integration_unavailable" });
    await registry.attach(manifest, "same-install", () => contribution, () => true);
    const current: Array<() => void> = [];
    await registry.bind("held", "source", binding("two"), check => current.push(check));
    current[0]!();
    assert.throws(held[0]!, { code: "plugin.integration_unavailable" }, "reenabling the same installation does not revive the old check");
    await registry.attach(manifestOf("io.molis.work.example.rivalheld", [service("occupied")], []), "rival", () => null, () => true);
    await assert.rejects(registry.attach(manifestOf(id, [service("occupied")], []), "same-install", () => contribution, () => true), { code: "plugin.integration_declaration_conflict" });
    current[0]!();
    await registry.detach(id);
    assert.throws(current[0]!, { code: "plugin.integration_unavailable" });
  } finally { await pending; }
});
