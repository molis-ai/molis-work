import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { SANDBOX_PACKAGE_FILES, type PluginManifest, type PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SANDBOX_INTEGRATION_CONTRACT, SANDBOX_INTEGRATION_OPERATIONS, type SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { HomeConsentLedger, homeIntegrationRegistry, pluginInstallActions, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { newPublisher, payloadOf } from "./fixtures/sandbox-package.js";
import { signPluginPackage } from "@molis-ai/molis-work-plugin-runtime";
import { fixture, mac, person, ref } from "./fixtures/home-sandbox.js";
import { openTestHome, type TestHome } from "./fixtures/test-home.js";

// BL-530 part 2 (specs/repository-anti-corruption/slices/bl530-sandboxed-integrations.md §2.2, §2.7, §2.8): a signed integration package is
// installed in the Home and runs in its sandbox instance (BL-628). The Home hands the registry its declarations and the Host's proxy while it
// runs, and takes them back when it is switched off or removed; its ids are checked against the registry before anything is written.

const PLUGIN_ID = "io.molis.work.example.feedprobe";
const ORIGINS = ["https://api.example-feed.com"];
const SOURCE = { source_id: "src-1", connection_id: null, credential_ref: null, config: {} };
const code = (expected: string, mentions?: string) => (error: unknown) =>
  error instanceof ActionError && error.code === expected && (mentions === undefined || error.message.includes(mentions));

// The code marks the process it runs in: the test's process is the Host's, so the mark must never appear here.
const CODE = `globalThis.__feedprobeLoaded = true;
export const operations = {
  'integration.health': async () => ({ ok: true, status: 'connected', message: 'ok' }),
  'integration.poll': async input => ({ ok: true, items: [{ externalId: 'e-' + input.source_id, title: 'T', summary: 'pulled' }], cursor: 'c1' }),
};
`;

function integrationPackage(publisher = newPublisher(), options: { pluginId?: string; serviceId?: string; integrationId?: string } = {}): PluginPackageBundle {
  const pluginId = options.pluginId ?? PLUGIN_ID, serviceId = options.serviceId ?? "example-feed";
  const manifest: PluginManifest = {
    schema_version: 2, host_api_version: 2, plugin_id: pluginId, version: "1.0.0", name: "Feed probe", kind: "integration",
    publisher: { publisher_id: "example", signature: publisher.identity },
    entrypoints: [{ deployment: "local", entrypoint: "./plugin.mjs" }],
    permissions: [{ permission: "storage:private", required: true, reason: "保存这个插件自己的数据" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, runtime: { scope: "home" },
    // A service of the platform's request table takes the table's origins; any other declares its own.
    connection_services: [{ service_id: serviceId, title: "Example feed", group_id: "work", summary: "Example feed fixture", auth_kind: "token",
      auth: { methods: [{ kind: "token", label: "Example token" }] }, capabilities: [{ label: "Feed 拉取", fulfillment: "live" }], ...serviceId === "github" ? {} : { origins: ORIGINS } }],
    integrations: [{ integration_id: options.integrationId ?? serviceId, kind: "source", service_id: serviceId }],
  };
  const operations = (["health", "poll"] as const).map(name => ({ id: SANDBOX_INTEGRATION_OPERATIONS[name], ...structuredClone(SANDBOX_INTEGRATION_CONTRACT[name]), errors: [],
    examples: [{ input: { source_id: "s", config_json: "{}", has_connection: false, ...(name === "poll" ? { rebuild: false } : {}) }, outputIncludes: {} }] }));
  const contract: SandboxPluginContract = { version: 1, pluginId, revision: "one", entities: [], pages: [], acceptance: [], operations };
  const payload = payloadOf(manifest, { [SANDBOX_PACKAGE_FILES.contract]: JSON.stringify(contract), [SANDBOX_PACKAGE_FILES.entrypoint]: CODE });
  return signPluginPackage({ payload, signature: null, publisher_key: null }, publisher.signer);
}

async function installer(home: TestHome) {
  const project = await home.createProject("Feeds");
  const client = home.host.actionClient(project.reference), who = person(project.project_id);
  return {
    preview: (bundle: PluginPackageBundle) => client.invoke(who, ref(pluginInstallActions.preview), { bundle }) as Promise<{ preview_id: string; runtime_scope: string; origins?: unknown }>,
    confirm: (previewId: string) => client.invoke(who, ref(pluginInstallActions.confirm), { preview_id: previewId, consent: true, pin_label: "Test publisher" }),
  };
}

const pull = async (home: { home: string }, integrationId = "example-feed") => {
  const bound = await (await homeIntegrationRegistry(home.home)).bind(integrationId, "source", SOURCE);
  return bound.connector_driver.poll({ cursor: null });
};

test("RAC-894 RAC-1000: an integration package installs in the Home's sandbox instance, lists its origins first, and its sources pull through the Host's proxy", mac, async t => {
  const home = await openTestHome(t), install = await installer(home);
  const preview = await install.preview(integrationPackage());
  assert.equal(preview.runtime_scope, "home", "an integration package always runs in the Home");
  assert.deepEqual(preview.origins, [{ service_id: "example-feed", title: "Example feed", origins: ORIGINS }], "the person sees where its requests may go before installing");
  await install.confirm(preview.preview_id);

  const registry = await homeIntegrationRegistry(home.home);
  assert.equal(registry.integration("example-feed")?.plugin_id, PLUGIN_ID);
  assert.ok(registry.connectionServices().some(entry => entry.declaration.service_id === "example-feed" && entry.owner === PLUGIN_ID));
  const record = home.host.homePlugins!.installation(PLUGIN_ID);
  assert.equal(record?.execution, "sandbox");
  assert.equal(record?.publisher_trust, "pinned");

  const result = await pull(home);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.events.map(event => event.provider_dedupe_id), ["e-src-1"]);
  assert.equal(result.events[0]!.payload.summary, "pulled");
  assert.equal((globalThis as { __feedprobeLoaded?: unknown }).__feedprobeLoaded, undefined, "its code never ran in the Host's process");
});

test("RAC-897: a package whose ids the registry already has is refused at the preview, naming the id and its holder, and nothing is written", mac, async t => {
  const home = await openTestHome(t), install = await installer(home);
  for (const [options, id] of [[{ serviceId: "github" }, "github"], [{ integrationId: "github" }, "github"]] as const) {
    await assert.rejects(install.preview(integrationPackage(newPublisher(), options)), code("plugin.integration_declaration_conflict", id));
  }
  assert.equal(existsSync(join(home.home, "plugin-packages")) && readdirSync(join(home.home, "plugin-packages")).length > 0, false, "no package was kept");
  assert.deepEqual(new HomeConsentLedger(home.home).publishers(), [], "no publisher was pinned");
  assert.equal(home.host.homePlugins!.hasPackage(PLUGIN_ID), false);
});

test("RAC-897: a package that took the same id between a preview and its confirmation stops the confirmation", mac, async t => {
  const home = await openTestHome(t), install = await installer(home);
  const first = await install.preview(integrationPackage());
  const second = await install.preview(integrationPackage(newPublisher(), { pluginId: "io.molis.work.example.feedprobe2" }));
  await install.confirm(first.preview_id);
  await assert.rejects(install.confirm(second.preview_id), code("plugin.integration_declaration_conflict", "example-feed"));
  assert.equal(home.host.homePlugins!.hasPackage("io.molis.work.example.feedprobe2"), false);
  assert.equal((await homeIntegrationRegistry(home.home)).integration("example-feed")?.plugin_id, PLUGIN_ID, "the holder is not touched");
});

test("RAC-898 RAC-1001: switched off its sources are unavailable and come back when it is on again; removed its card goes, the person's connection stays", mac, async t => {
  const home = await openTestHome(t), install = await installer(home);
  await install.confirm((await install.preview(integrationPackage())).preview_id);
  const connection = withConnectorConnections(home.home, store => store.createToken({ serviceId: "example-feed", displayName: "Example account", token: "fixture-token-rac898" })).connection_id;

  await home.web.post(`/api/plugins/${PLUGIN_ID}/disable`, {});
  await assert.rejects(pull(home), code("plugin.integration_unavailable", "example-feed"));
  await home.web.post(`/api/plugins/${PLUGIN_ID}/enable`, {});
  assert.equal((await pull(home)).ok, true, "enabled again it pulls again");

  await home.web.post(`/api/plugins/${PLUGIN_ID}/uninstall`, { keep_data: false });
  const registry = await homeIntegrationRegistry(home.home);
  assert.equal(registry.connectionServices().some(entry => entry.declaration.service_id === "example-feed"), false, "its service card is gone");
  await assert.rejects(pull(home), code("plugin.integration_unavailable", "example-feed"));
  assert.ok(withConnectorConnections(home.home, store => store.list().some(row => row.connection_id === connection)), "the person's connection is theirs and stays");
});

test("RAC-1002: closing the Host lets the package's ids go, and the next Host starts it from its kept package and binds its sources again", mac, async t => {
  const f = await fixture(t);
  await f.install(integrationPackage());
  assert.equal((await pull(f)).ok, true);
  await f.host.close();
  assert.equal((await homeIntegrationRegistry(f.home)).integration("example-feed"), undefined, "a closed Host's instance holds nothing");
  await f.reopen();
  assert.equal((await pull(f)).ok, true, "started again after the restart, from the package the Home kept");
});
