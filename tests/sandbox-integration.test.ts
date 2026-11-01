import { connectorControl } from "./fixtures/connector-control.js";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest, PluginPackagePayload } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginConnectionServiceDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import {
  SANDBOX_INTEGRATION_CONTRACT, SANDBOX_INTEGRATION_LIMITS, SANDBOX_INTEGRATION_OPERATIONS, SANDBOX_INTEGRATION_SOURCE_SLOT,
  type SandboxJson, type SandboxOperationContract, type SandboxPluginContract,
} from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { createCallConnectionsClient, type CallConnectionsPort, type PluginConnectionDispatch } from "@molis-ai/molis-work-plugin-runtime";
import { createSandboxRunner } from "@molis-ai/molis-work-plugin-sandbox";
import { definePollingIntegrationPlugin, parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { IntegrationRegistry, readSandboxIntegrationPackage, sandboxedIntegrationDefinition, sandboxIntegrationContribution } from "@molis-ai/molis-work-app-local-host";

// BL-530 (specs/repository-anti-corruption/slices/bl530-sandboxed-integrations.md): an external integration is a signed sandbox package
// of its own kind, run in the sandbox and reached by the Host's proxy as the platform's operations. These tests take the parts that do not
// wait for the Home's sandbox instance (BL-628): the package's shape, the proxy's reading of a pull, and where a service's origins come from.

const PLUGIN_ID = "io.molis.work.example.feedprobe";
const code = (expected: string) => (error: unknown) => (error as { code?: string } | undefined)?.code === expected;
const mac = { skip: process.platform !== "darwin" };

const service = (id: string, extra: Partial<PluginConnectionServiceDeclaration> = {}): PluginConnectionServiceDeclaration => ({
  service_id: id, title: `${id} service`, group_id: "work", summary: `${id} fixture`, auth_kind: "token",
  auth: { methods: [{ kind: "token", label: `${id} token` }] }, capabilities: [{ label: "Feed 拉取", fulfillment: "live" }], ...extra,
});
const SERVICE = service("example-feed", { origins: ["https://api.example-feed.com"] });

function manifest(extra: Partial<PluginManifest> = {}): PluginManifest {
  return {
    schema_version: 2, host_api_version: 2, plugin_id: PLUGIN_ID, version: "1.0.0", name: "Feed probe", kind: "integration",
    publisher: { publisher_id: "io.example", signature: "example-signature-v1" },
    entrypoints: [{ deployment: "local", entrypoint: "./plugin.mjs" }],
    permissions: [{ permission: "storage:private", required: true, reason: "保存这个插件自己的数据" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, runtime: { scope: "home" },
    connection_services: [SERVICE], integrations: [{ integration_id: "example-feed", kind: "source", service_id: "example-feed" }],
    ...extra,
  };
}

const SOURCE_INPUT = { source_id: "src-1", config_json: "{}", has_connection: true };
const operation = (name: keyof typeof SANDBOX_INTEGRATION_OPERATIONS): SandboxOperationContract => ({
  id: SANDBOX_INTEGRATION_OPERATIONS[name], ...structuredClone(SANDBOX_INTEGRATION_CONTRACT[name]), errors: [],
  examples: [{ input: name === "presentation" ? { presentation_id: "example-display" } : name === "health" ? SOURCE_INPUT : name === "poll" ? { ...SOURCE_INPUT, rebuild: false } : { ...SOURCE_INPUT, cursor: "c" }, outputIncludes: {} }],
});
function contract(names: Array<keyof typeof SANDBOX_INTEGRATION_OPERATIONS> = ["health", "poll", "account"]): SandboxPluginContract {
  return { version: 1, pluginId: PLUGIN_ID, revision: "one", entities: [], pages: [], acceptance: [], operations: names.map(operation) };
}
const file = (path: string, value: unknown) => ({ path, content_base64: Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64") });
function payload(options: { manifest?: PluginManifest; contract?: unknown; extra?: Array<ReturnType<typeof file>> } = {}): PluginPackagePayload {
  const declared = options.manifest ?? manifest();
  return { schema_version: 1, manifest: declared, files: [file("manifest.json", declared), file("contract.json", options.contract ?? contract()), file("plugin.mjs", "export const operations = {};"), ...(options.extra ?? [])] };
}
const refusedWith = (pattern: RegExp) => (error: unknown) => error instanceof ActionError && error.code === "plugin.declaration_invalid" && pattern.test(error.message);

test("RAC-893: a sandboxed integration package is an Integration Plugin's Manifest, the platform's operations and the code", () => {
  const read = readSandboxIntegrationPackage(payload());
  assert.equal(read.manifest.kind, "integration");
  assert.deepEqual(read.contract.operations.map(item => item.id), ["integration.health", "integration.poll", "integration.account"]);
  assert.deepEqual(read.permissions.connections, [SANDBOX_INTEGRATION_SOURCE_SLOT], "what the person approves: the source's account");
  // `integration.account` is the one the plugin may leave out.
  assert.doesNotThrow(() => readSandboxIntegrationPackage(payload({ contract: contract(["health", "poll"]) })));
});

test("RAC-893: a package that is not that shape is refused before anything is written", () => {
  assert.throws(() => readSandboxIntegrationPackage(payload({ extra: [file("interface.json", { parts: [], nodes: [] })] })), refusedWith(/interface\.json/u));
  assert.throws(() => readSandboxIntegrationPackage(payload({ extra: [file("prompts.json", [])] })), refusedWith(/prompts\.json/u));
  assert.throws(() => readSandboxIntegrationPackage(payload({ manifest: manifest({ routes: [{ route_id: "call", method: "POST", path: "/call" }] }) })), refusedWith(/形状/u));
  assert.throws(() => readSandboxIntegrationPackage(payload({ manifest: manifest({ ui: { contributions: ["x.ui.v1"], views: [{ view_id: "app", slot: "stage", title: "x", contribution_id: "x.ui.v1" }] } }) })), refusedWith(/./u));
  // It runs in the Home, as its Manifest says, and nowhere else.
  assert.throws(() => readSandboxIntegrationPackage(payload({ manifest: manifest({ runtime: undefined }) })), refusedWith(/./u));
  assert.throws(() => readSandboxIntegrationPackage(payload({ manifest: manifest({ runtime: JSON.parse(`{ "scope": "project" }`) }) })), refusedWith(/./u));
  // One source and its one service.
  const second = service("example-feed-2", { origins: ["https://api.example-feed.com"] });
  assert.throws(() => readSandboxIntegrationPackage(payload({ manifest: manifest({ connection_services: [SERVICE, second], integrations: [
    { integration_id: "example-feed", kind: "source", service_id: "example-feed" }, { integration_id: "example-feed-2", kind: "source", service_id: "example-feed-2" }] }) })), refusedWith(/一个来源/u));
  assert.throws(() => readSandboxIntegrationPackage(payload({ contract: contract(["health"]) })), refusedWith(/integration\.poll/u));
  const extra = contract(); extra.operations.push({ ...operation("health"), id: "integration.write" });
  assert.throws(() => readSandboxIntegrationPackage(payload({ contract: extra })), refusedWith(/integration\.write/u));
  // Each one still a valid contract of its own (its examples match): only being the platform's operation is wrong.
  for (const field of ["input", "output", "effects", "kind"] as const) {
    const changed = contract();
    const poll = changed.operations[1]!;
    if (field === "kind") poll.kind = "command";
    else if (field === "effects") poll.effects = { connections: [SANDBOX_INTEGRATION_SOURCE_SLOT], networkDomains: ["api.example-feed.com"] };
    else poll[field] = { ...poll[field], properties: { ...poll[field].properties, extra: { type: "string" } } };
    assert.throws(() => readSandboxIntegrationPackage(payload({ contract: changed })), refusedWith(new RegExp(`integration\\.poll 的 ${field}`, "u")), field);
  }
  const paged = contract(); paged.pages.push({ id: "home", title: "x", regions: [] });
  assert.throws(() => readSandboxIntegrationPackage(payload({ contract: paged })), refusedWith(/页面/u));
  assert.throws(() => readSandboxIntegrationPackage(payload({ manifest: manifest({ integrations: [{ integration_id: "example-docs", kind: "document_import", service_id: "example-feed", document_source: "example", connection_methods: ["token"] }] }) })), refusedWith(/BL-694/u));
});

test("RAC-899: a service's origins are the platform's when it has them, the package's own otherwise, and only exact public https origins", () => {
  assert.throws(() => readSandboxIntegrationPackage(payload({ manifest: manifest({ connection_services: [service("github", { origins: ["https://api.github.com"] })], integrations: [{ integration_id: "gh", kind: "source", service_id: "github" }] }) })), refusedWith(/平台/u));
  assert.throws(() => readSandboxIntegrationPackage(payload({ manifest: manifest({ connection_services: [service("example-feed")] }) })), refusedWith(/origins/u));
  for (const origin of ["http://api.example-feed.com", "https://api.example-feed.com/", "https://api.example-feed.com/v1", "https://user@api.example-feed.com",
    "https://93.184.216.34", "https://[2606:2800::1]", "https://localhost", "https://feed.localhost", "https://printer.local", "https://intranet", "https://*.example-feed.com"]) {
    assert.throws(() => parsePluginManifest(manifest({ connection_services: [service("example-feed", { origins: [origin] })] })), (error: unknown) => error instanceof ActionError && /origins|来源/u.test(error.message), origin);
  }
  assert.throws(() => parsePluginManifest(manifest({ connection_services: [service("example-feed", { origins: ["https://api.example-feed.com", "https://api.example-feed.com"] })] })), /重复/u);
  assert.doesNotThrow(() => parsePluginManifest(manifest({ connection_services: [service("example-feed", { origins: ["https://api.example-feed.com", "https://api.example-feed.com:8443"] })] })));
});

test("RAC-899: a plugin the Host builds never declares origins: the registry refuses it", async () => {
  const registry = new IntegrationRegistry();
  const plugin = definePollingIntegrationPlugin({ manifest: manifest({ entrypoints: [{ deployment: "local", entrypoint: "./dist/index.js" }] }),
    createProvider: () => ({ type: "probe", health: async () => ({ ok: true, status: "connected", message: "" }), sync: async () => ({ ok: true, mode: "live", items: [], cursor: null }) }) });
  await assert.rejects(registry.enable(plugin), refusedWith(/平台的请求表/u));
  assert.equal(registry.connectionServices().some(item => item.service_id === "example-feed"), false);
});

test("RAC-895-CONFIG: a source's serialized settings are bounded by UTF-8 bytes, including the exact Chinese-text boundary", () => {
  let calls = 0;
  const contribution = sandboxIntegrationContribution({ manifest: manifest(), operations: [],
    call: async () => { calls++; return null; }, connections: () => { throw new Error("no call was made"); } });
  const limit = SANDBOX_INTEGRATION_LIMITS.configLength;
  const bind = (text: string) => contribution.bind({ source_id: "s", connection_id: null, credential_ref: null, config: { text } });
  const overhead = Buffer.byteLength(JSON.stringify({ text: "" }));
  const chinese = "中".repeat(Math.floor((limit - overhead) / 3));
  const exact = chinese + "a".repeat(limit - overhead - Buffer.byteLength(chinese));
  assert.equal(Buffer.byteLength(JSON.stringify({ text: exact })), limit);
  assert.doesNotThrow(() => bind(exact));
  assert.throws(() => bind(exact + "中"), { code: "host.integration_source_invalid" });
  assert.doesNotThrow(() => bind("a".repeat(limit - overhead)));
  assert.throws(() => bind("a".repeat(limit - overhead + 1)), { code: "host.integration_source_invalid" });
  assert.equal(calls, 0, "oversized settings are refused when binding, before any sandbox call");
});

/** A real sandboxed process answering the platform's operations, behind the Host's proxy with a stand-in for the call's connections. */
async function proxied(body: string, names: Array<keyof typeof SANDBOX_INTEGRATION_OPERATIONS> = ["health", "poll", "account"]) {
  const directory = await mkdtemp(join(tmpdir(), "sandbox-integration-"));
  const bundlePath = join(directory, "plugin.mjs");
  await writeFile(bundlePath, body);
  const sent: PluginConnectionDispatch[] = [], signals: AbortSignal[] = [];
  const port: CallConnectionsPort = {
    async request(_connection, dispatch) { await dispatch.beforeEffect(); sent.push(dispatch); return { status: 200, headers: {}, body: '{"login":"probe"}', authenticated: true }; },
    describe: () => ({ bound: true, display_name: "Probe", state: "connected" }),
  };
  const declared = contract(names);
  const runner = await createSandboxRunner({ bundlePath, contract: declared, grants: { connections: [SANDBOX_INTEGRATION_SOURCE_SLOT] }, services: {},
    identity: { projectId: "home", installationId: "install-probe", pluginId: PLUGIN_ID, namespace: "installed" } });
  const contribution = sandboxIntegrationContribution({ manifest: manifest(names.includes("presentation") ? { source_presentations: ["example-display"] } : {}), operations: declared.operations.map(item => item.id),
    call: (id, input, control) => runner.call(id, input, control),
    connections: (binding, control) => { signals.push(control.signal); return createCallConnectionsClient(port, { plugin_id: PLUGIN_ID, install_id: "install-feed", service_id: "example-feed", connection_id: binding.connection_id, origins: ["https://api.example-feed.com"] }, SANDBOX_INTEGRATION_SOURCE_SLOT, control); },
    now: () => new Date("2026-10-26T00:00:00.000Z") });
  const bound = contribution.bind({ source_id: "src-1", connection_id: "c-1", credential_ref: null, config: { repo: "a" } });
  return { bound, contribution, sent, signals, async close() { await runner.stop(); await rm(directory, { recursive: true, force: true }); } };
}

const POLL = (answer: string, account = true) => `export const operations = {
  'integration.health': async () => ({ ok: true, status: 'connected', message: 'ok' }),
  'integration.poll': async (input, sdk) => { const me = await sdk.connections.request('source', { url: 'https://api.example-feed.com/me' }); return ${answer}; },
  ${account ? "'integration.account': async input => ({ account_label: 'probe@' + input.cursor })," : ""}
};`;

test("RAC-895: a source's pull goes through the sandbox and the call's own account and reaches the Feed as any integration's", mac, async () => {
  const f = await proxied(POLL(`{ ok: true, items: [{ externalId: 'e1', title: 'T', summary: JSON.parse(me.body).login + ':' + input.config_json, url: 'https://example-feed.com/e1', kind: 'issue' }], cursor: 'c2' }`));
  try {
    const result = await f.bound.connector_driver.poll({ cursor: "c1" }, connectorControl());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.cursor_after, "c2");
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0]!.payload.summary, 'probe:{"repo":"a"}');
    assert.equal(f.bound.signal_adapter.toSignalDraft(result.events[0]!, { project_id: "p", source_id: "src-1" }).kind, "issue");
    assert.deepEqual(f.bound.account?.("c2", null), { account_label: "probe@c2" });
    assert.equal(f.sent.length, 1);
    assert.equal(f.sent[0]!.url.href, "https://api.example-feed.com/me");
    assert.ok(f.signals.length >= 2 && f.signals.every(signal => signal.aborted), "every call's connection ended with the call");
    assert.deepEqual(await f.bound.connector_driver.health(connectorControl()), { ok: true, status: "connected", message: "ok" });
  } finally { await f.close(); }
});

test("RAC-895: a pull that does not fit is refused whole, and nothing of it reaches the Feed", mac, async () => {
  const cases: Array<[string, (error: unknown) => boolean]> = [
    ["{ ok: true, items: [] }", code("host.integration_pull_invalid")],
    ["{ ok: true, items: [], cursor: 'c', failure: 'provider' }", code("host.integration_pull_invalid")],
    ["{ ok: false, failure: 'provider', message: 'x', items: [] }", code("host.integration_pull_invalid")],
    ["{ ok: false, failure: 'provider', message: 'x', http_status: 99 }", code("host.integration_pull_invalid")],
    ["{ ok: true, items: [{ externalId: 'e', title: 't', summary: 's' }, { externalId: 'e', title: 't', summary: 's' }], cursor: 'c' }", code("host.integration_pull_invalid")],
    ["{ ok: true, items: [{ externalId: 'e', title: 't', summary: 's', url: 'javascript:alert(1)' }], cursor: 'c' }", error => code("host.integration_pull_invalid")(error) || code("sandbox.protocol_error")(error)],
    ["{ ok: true, items: [{ externalId: 'e', title: 't', summary: 's', secret: 1 }], cursor: 'c' }", code("sandbox.protocol_error")],
    ["{ ok: true, items: Array.from({ length: 201 }, (_, i) => ({ externalId: 'e' + i, title: 't', summary: 's' })), cursor: 'c' }", code("sandbox.protocol_error")],
  ];
  for (const [answer, refused] of cases) {
    const f = await proxied(POLL(answer));
    try { await assert.rejects(f.bound.connector_driver.poll({ cursor: null }, connectorControl()), refused, answer); } finally { await f.close(); }
  }
  const failed = await proxied(POLL("{ ok: false, failure: 'needs_auth', message: '请重新连接', http_status: 401 }", false), ["health", "poll"]);
  try {
    assert.deepEqual(await failed.bound.connector_driver.poll({ cursor: null }, connectorControl()), { ok: false, mode: "live", failure: "needs_auth", message: "请重新连接", http_status: 401 });
    assert.equal(failed.bound.account, undefined, "no account step without integration.account");
  } finally { await failed.close(); }
});

test("RAC-895: only the Host's proxy gives a call the source's account; a call without it has no account service", mac, async () => {
  const directory = await mkdtemp(join(tmpdir(), "sandbox-integration-bare-"));
  const bundlePath = join(directory, "plugin.mjs");
  await writeFile(bundlePath, POLL("{ ok: true, items: [], cursor: 'c' }"));
  const runner = await createSandboxRunner({ bundlePath, contract: contract(), grants: { connections: [SANDBOX_INTEGRATION_SOURCE_SLOT] }, services: {},
    identity: { projectId: "home", installationId: "install-probe", pluginId: PLUGIN_ID, namespace: "installed" } });
  try {
    await assert.rejects(runner.call(SANDBOX_INTEGRATION_OPERATIONS.poll, { ...SOURCE_INPUT, rebuild: false } as SandboxJson), code("sandbox.plugin_error"));
  } finally { await runner.stop(); await rm(directory, { recursive: true, force: true }); }
});

// T-218 M1 (RAC-2464): the runtime saves a stopped or removed package as such only after its `stop()` returns, so the installation
// record still reads running while the runner is being stopped. The Home's definition withdraws its calls itself: from the moment
// `stop()` begins, and once the runtime has revoked its context (`requireGrant` throws). A withdrawn instance starts no runner again and
// sends nothing.
test("S-95 RAC-2464 a sandboxed integration's calls stop counting as current when its stop begins, and once its context is revoked", mac, async t => {
  const directory = await mkdtemp(join(tmpdir(), "sandbox-integration-live-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bundlePath = join(directory, "plugin.mjs");
  await writeFile(bundlePath, POLL("{ ok: true, items: [], cursor: 'c2' }"));
  const sent: PluginConnectionDispatch[] = [];
  const port: CallConnectionsPort = {
    async request(_connection, dispatch) { await dispatch.beforeEffect(); sent.push(dispatch); return { status: 200, headers: {}, body: '{"login":"probe"}', authenticated: true }; },
    describe: () => ({ bound: true, display_name: "Probe", state: "connected" }),
  };
  const release = { pluginId: PLUGIN_ID, bundlePath, design: { contract: contract() }, packaged: { manifest: manifest(), trust: "signed" } } as never;
  const storage = { get: () => null, set() {}, delete() {}, compareAndSet: () => true };
  for (const withdrawn of ["stopping", "revoked"] as const) {
    let revoked = false;
    const context = { project_id: null, install_id: "install-probe", services: { storage },
      requireGrant() { if (revoked) throw new ActionError("plugin.grant_revoked", "授权已撤回"); } } as never;
    const definition = sandboxedIntegrationDefinition(release, { connections: [SANDBOX_INTEGRATION_SOURCE_SLOT] }, { connections: port, assertLive() {} });
    const contribution: ReturnType<typeof sandboxIntegrationContribution> = await definition.start!(context) as never;
    const bound = contribution.bind({ source_id: "src-1", connection_id: "c-1", credential_ref: null, config: {} });
    try {
      const stopping = withdrawn === "stopping" ? definition.stop!() : undefined;
      if (withdrawn === "revoked") revoked = true;
      const outcome = await bound.connector_driver.poll({ cursor: "c1" }, connectorControl()).then(result => result, (error: unknown) => error);
      await stopping;
      assert.notEqual((outcome as { ok?: unknown }).ok, true, `${withdrawn}: the pull does not succeed`);
      assert.equal(sent.length, 0, `${withdrawn}: nothing reached the Host's side`);
    } finally { await definition.stop!(); }
  }
});

test("RAC-2507 a signed source presentation redeems a closed pure query and receives no source binding or effect port", async () => {
  const declared = manifest({ source_presentations: ["example-display"] }), fixed = contract(["health", "poll", "presentation"]);
  assert.ok(readSandboxIntegrationPackage(payload({ manifest: declared, contract: fixed })));
  assert.throws(() => readSandboxIntegrationPackage(payload({ manifest: declared })), refusedWith(/一同兑现/u));
  assert.throws(() => readSandboxIntegrationPackage(payload({ contract: fixed })), refusedWith(/一同兑现/u));
  const withConnections = structuredClone(fixed); withConnections.operations[2]!.effects = { connections: ["source"] };
  assert.throws(() => readSandboxIntegrationPackage(payload({ manifest: declared, contract: withConnections })), refusedWith(/effects/u));
  const seen: unknown[] = [], contribution = sandboxIntegrationContribution({ manifest: declared, operations: fixed.operations.map(op => op.id),
    call: async (id, input, control) => { seen.push({ id, input, control }); return { presentation_json: JSON.stringify({ home_url: null, conditional_request: "not-fetched" }) }; },
    connections: () => { throw new Error("pure presentation gets no account"); } });
  assert.deepEqual(await contribution.presentSource!("example-display", { cursor: { position: 4 } }), { home_url: null, conditional_request: "not-fetched" });
  assert.deepEqual(seen, [{ id: "integration.presentation", input: { presentation_id: "example-display", cursor_json: '{"position":4}' }, control: {} }]);
  await assert.rejects(contribution.presentSource!("other", {}), { code: "host.integration_source_invalid" });
  assert.equal(seen.length, 1);
});

test("RAC-2507 a real sandbox presentation cannot use the pull's connection effect", mac, async () => {
  const f = await proxied(`export const operations = {
    'integration.health': async () => ({ ok: true, status: 'connected', message: 'ok' }),
    'integration.poll': async () => ({ ok: true, items: [], cursor: 'unused' }),
    'integration.presentation': async (input, sdk) => {
    await sdk.connections.request('source', { url: 'https://api.example-feed.com/me' });
    return { presentation_json: JSON.stringify({ home_url: 'https://example-feed.com/' }) };
  } };`, ["health", "poll", "presentation"]);
  try { await assert.rejects(f.contribution.presentSource!("example-display", {}), { code: "sandbox.plugin_error", message: /Undeclared or unapproved connections/u }); assert.deepEqual(f.sent, []); }
  finally { await f.close(); }
});
