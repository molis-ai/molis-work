import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ConnectorDirectoryEntry } from "@molis-ai/molis-work-contracts/services/connector-host";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { connectorDirectory, connectorManagementActions, connectorSetupAction, homeIntegrationRegistry } from "@molis-ai/molis-work-app-local-host";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { openTestHome, type TestHome } from "./fixtures/test-home.js";

// RAC-2466 to RAC-2470 (BL-740, T-119): the settings cards and the new-connection paths read the Home's integration registry, so a service an
// installed integration package declares has its card and can take a connection, and the card goes when the package is detached.

const PLUGIN_ID = "io.molis.work.example.feedprobe";
const SERVICE = "example-feed";
/** A throwaway credential for the probe service, made per call so no credential-shaped literal sits in the file. */
const probeToken = (n: number) => `fixture-probe-token-${String(n).padStart(4, "0")}`;
const caller: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: ["connectors:management:read", "connectors:management:write"] };

/** What a signed integration package declares; `attach` reads the declarations only, nothing runs. */
function packageManifest(): PluginManifest {
  return {
    schema_version: 2, host_api_version: 2, plugin_id: PLUGIN_ID, version: "1.0.0", name: "Feed probe", kind: "integration",
    publisher: { publisher_id: "example", signature: newPublisher().identity },
    entrypoints: [{ deployment: "local", entrypoint: "./plugin.mjs" }],
    permissions: [{ permission: "storage:private", required: true, reason: "保存这个插件自己的数据" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, runtime: { scope: "home" },
    connection_services: [{ service_id: SERVICE, title: "Example feed", group_id: "work", summary: "Example feed fixture", auth_kind: "token",
      auth: { methods: [{ kind: "token", label: "Example token" }] }, capabilities: [{ label: "Feed 拉取", fulfillment: "live" }], origins: ["https://api.example-feed.com"] }],
    integrations: [{ integration_id: SERVICE, kind: "source", service_id: SERVICE }],
  };
}
const attach = async (home: TestHome) => (await homeIntegrationRegistry(home.home)).attach(packageManifest(), () => null, () => true);
const detach = async (home: TestHome) => (await homeIntegrationRegistry(home.home)).detach(PLUGIN_ID);
const cards = async (home: TestHome) => (await home.web.get<{ connectors: Array<ConnectorDirectoryEntry & Record<string, unknown>> }>("/api/settings/connectors")).connectors;
// A registry keyed by a path no test attaches to lists only the built-in services; nothing reads the disk for it.
const builtinIds = async () => connectorDirectory(await homeIntegrationRegistry("connector-home-directory-test-builtin")).map(entry => entry.connector_id);
const sourceOf = (file: string) => readFileSync(new URL(`../apps/local-host/src/${file}`, import.meta.url), "utf8");

test("RAC-2466 a service an installed package declares has its settings card, and the card goes when the package is detached", async t => {
  const home = await openTestHome(t);
  assert.deepEqual((await cards(home)).map(card => card.connector_id), await builtinIds(), "a Home with no package lists the built-in services, in their order");
  assert.equal(await attach(home), true);
  const attached = await cards(home);
  const card = attached.find(entry => entry.connector_id === SERVICE);
  assert.ok(card, "the package's service has a card");
  assert.deepEqual([card.availability, card.feed_available, card.title], ["live", true, "Example feed"]);
  assert.ok(card.method_options?.some(method => method.kind === "token" && method.support === "paste"), "its token can be pasted");
  assert.deepEqual(attached.map(entry => entry.connector_id).filter(id => id !== SERVICE), await builtinIds(), "the built-in cards are the same, in the same order");
  await detach(home);
  assert.deepEqual((await cards(home)).map(entry => entry.connector_id), await builtinIds(), "detached: the card is gone");
});

test("RAC-2467 a connection can be made to a package's service by pasting a credential, and removing the package keeps the person's connection", async t => {
  const home = await openTestHome(t);
  await attach(home);
  const made = await home.web.post<{ connection: { connection_id: string; service_id: string } }>("/api/settings/connectors/connections",
    { service_id: SERVICE, display_name: "Probe account", token: probeToken(1) });
  assert.equal(made.connection.service_id, SERVICE);
  await detach(home);
  await assert.rejects(home.web.post("/api/settings/connectors/connections", { service_id: SERVICE, display_name: "Again", token: probeToken(2) }), { status: 400 });
  const kept = await home.web.get<{ connections: Array<{ connection_id: string }> }>(`/api/settings/connectors/connections?service_id=${SERVICE}`);
  assert.deepEqual(kept.connections.map(row => row.connection_id), [made.connection.connection_id], "the connection record stays; only the service is gone");
});

test("RAC-2468 the connection-management catalog and the setup action know a package's service while it is attached", async t => {
  const home = await openTestHome(t), actions = home.host.homeActionClient();
  const catalog = async () => (await actions.invoke(caller, connectorManagementActions.catalog, { service_id: SERVICE }) as { services: Array<{ connector_id: string }> }).services;
  const prepare = () => actions.invoke(caller, connectorSetupAction, { service_id: SERVICE, method: "token", display_name: "Probe account", expected_revision: null }) as Promise<{ authorization_id: string }>;
  assert.deepEqual(await catalog(), [], "not attached: nothing");
  await assert.rejects(prepare(), { code: "connector.setup.unsupported" });
  await attach(home);
  assert.deepEqual((await catalog()).map(row => row.connector_id), [SERVICE]);
  assert.ok((await prepare()).authorization_id, "a token setup can be prepared for it");
  await detach(home);
  assert.deepEqual(await catalog(), []);
  await assert.rejects(prepare(), { code: "connector.setup.unsupported" });
});

test("RAC-2469 none of the readers keeps the built-in list or reads the built-in declarations itself", () => {
  for (const file of ["connector-directory.ts", "web-connector-settings.ts", "web-connectors-settings.ts", "connector-management-actions.ts", "connector-setup.ts", "web-connector-connections.ts"]) {
    assert.doesNotMatch(sourceOf(file), /HOST_CONNECTOR_DIRECTORY|builtinIntegrationDeclarations/u, `${file} reads the Home's registry, not a built-in list`);
  }
});

test("RAC-2470 the connections page offers a package's service while it is attached", async t => {
  const home = await openTestHome(t);
  const page = async () => { const response = await fetch(`${home.origin}/capabilities/connections`); assert.equal(response.status, 200); return response.text(); };
  assert.doesNotMatch(await page(), new RegExp(`data-connector-open="${SERVICE}"`, "u"));
  await attach(home);
  assert.match(await page(), new RegExp(`data-connector-open="${SERVICE}"`, "u"));
  await detach(home);
  assert.doesNotMatch(await page(), new RegExp(`data-connector-open="${SERVICE}"`, "u"));
});
