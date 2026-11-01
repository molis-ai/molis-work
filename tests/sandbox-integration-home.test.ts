import { createLocalFeedApplication } from "./fixtures/feed-library.js";
import { accountSourceRecord } from "./fixtures/feed-account-source.js";
import { feedManifest, feedSourceActions } from "@molis-ai/molis-work-plugin-feed";
import { pluginBindingScope } from "@molis-ai/molis-work-service-connector-host";
import { SignalsModule, fromBetterSqlite } from "@molis-ai/molis-work-plugin-feed/store";
import { connectorControl } from "./fixtures/connector-control.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { type PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import { HomeConsentLedger, homeIntegrationRegistry, pluginInstallActions, withConnectorConnections, LocalProjectDatabase, DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { integrationPackage } from "./fixtures/home-upgrade-source.js";
import { fixture, mac, person, ref } from "./fixtures/home-sandbox.js";
import { openTestHome, type TestHome } from "./fixtures/test-home.js";
import { deferred } from "./fixtures/home-runtime.js";
import { definePollingIntegrationPlugin } from "@molis-ai/molis-work-plugin-sdk";

// BL-530 part 2 (specs/repository-anti-corruption/slices/bl530-sandboxed-integrations.md §2.2, §2.7, §2.8): a signed integration package is
// installed in the Home and runs in its sandbox instance (BL-628). The Home hands the registry its declarations and the Host's proxy while it
// runs, and takes them back when it is switched off or removed; its ids are checked against the registry before anything is written.

const PLUGIN_ID = "io.molis.work.example.feedprobe";
const ORIGINS = ["https://api.example-feed.com"];
const SOURCE = { source_id: "src-1", connection_id: null, credential_ref: null, config: {} };
const code = (expected: string, mentions?: string) => (error: unknown) =>
  error instanceof ActionError && error.code === expected && (mentions === undefined || error.message.includes(mentions));

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
  return bound.connector_driver.poll({ cursor: null }, connectorControl());
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
  const connection = withConnectorConnections(home.home, store => store.createToken({ serviceId: "example-feed", displayName: "Example account", token: randomUUID() })).connection_id;

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

test("RAC-1001-QUEUE: an attach skipped after a real registry wait cannot undo a fast disable-enable registration", mac, async t => {
  const home = await openTestHome(t), install = await installer(home), registry = await homeIntegrationRegistry(home.home);
  const entered = deferred(), release = deferred(), firstAttach = deferred(), secondAttach = deferred();
  const base = integrationPackage().payload.manifest;
  const blocker = definePollingIntegrationPlugin({ manifest: { ...base, plugin_id: "io.molis.work.example.queueholder", publisher: { publisher_id: "example", signature: "queue-holder-fixture" },
    connection_services: [{ ...base.connection_services![0]!, service_id: "queue-holder", origins: undefined }],
    integrations: [{ integration_id: "queue-holder", kind: "source", service_id: "queue-holder" }] },
    createProvider: () => ({ type: "queue", health: async () => ({ ok: true, status: "connected", message: "ready" }), sync: async () => ({ ok: true, mode: "live", items: [], cursor: null }) }) });
  const held = registry.enable({ ...blocker, async start(context) { entered.resolve(); await release.promise; return blocker.start(context); } });
  const original = registry.attach.bind(registry), outcomes: boolean[] = [];
  let calls = 0;
  registry.attach = async (...args) => {
    if (args[0].plugin_id === PLUGIN_ID) (++calls === 1 ? firstAttach : secondAttach).resolve();
    const attached = await original(...args); outcomes.push(attached); return attached;
  };
  let installing: Promise<unknown> | undefined, enabling: Promise<void> | undefined;
  const within = async (label: string, work: Promise<unknown>) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([work, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Registry queue test stalled: ${label}`)), 8_000); })]); }
    finally { clearTimeout(timer); }
  };
  try {
    await within("blocker start", Promise.race([entered.promise, held.then(() => { throw new Error("Registry blocker completed before entering its start"); })]));
    const preview = await within("package preview", install.preview(integrationPackage())) as { preview_id: string };
    installing = install.confirm(preview.preview_id);
    await within("first attach queued", firstAttach.promise);
    await within("disable", home.host.homePlugins!.packageAction(PLUGIN_ID, "disable"));
    assert.equal(home.host.homePlugins!.installation(PLUGIN_ID)?.state, "disabled");
    await assert.rejects(pull(home), code("plugin.integration_unavailable"));
    enabling = home.host.homePlugins!.packageAction(PLUGIN_ID, "enable");
    await within("second attach queued", secondAttach.promise);
    release.resolve(); await Promise.all([held, installing, enabling]);
    assert.deepEqual(outcomes, [false, true], "the old attach actually returned without registration; the new one registered");
    assert.equal(home.host.homePlugins!.installation(PLUGIN_ID)?.state, "running");
    assert.equal(registry.integration("example-feed")?.plugin_id, PLUGIN_ID);
    assert.equal(registry.connectionServices().filter(entry => entry.owner === PLUGIN_ID).length, 1);
    assert.equal((await pull(home)).ok, true, "the queued detach did not remove the new activation's source");
    await home.host.homePlugins!.packageAction(PLUGIN_ID, "disable");
    await registry.detach("not-an-installation");
    assert.equal(registry.integration("example-feed"), undefined, "no old marker or declaration survives a final stop");
  } finally {
    release.resolve(); await Promise.allSettled([held, ...(installing ? [installing] : []), ...(enabling ? [enabling] : [])]);
    registry.attach = original;
    await registry.disable("io.molis.work.example.queueholder");
  }
});

test("RAC-2615-SOURCE RAC-2615-COMP a signed source upgrades declarations and real pull; expose failure restores the previous live source", mac, async t => {
  const h = await fixture(t), publisher = newPublisher();
  await h.install(integrationPackage(publisher));
  const registry = await homeIntegrationRegistry(h.home), before = h.host.homePlugins!.installation(PLUGIN_ID)!;
  const next = integrationPackage(publisher, { version: "1.1.0", serviceId: "new-feed", origins: ["https://new.example.com"], title: "New feed",
    code: `export const operations = { 'integration.health': async () => ({ok:true,status:'connected',message:'v2'}), 'integration.poll': async () => ({ok:true,items:[{externalId:'v2',title:'v2',summary:'v2'}],cursor:'v2'}) };` });
  const attach = registry.attach.bind(registry);
  let entered = false;
  registry.attach = async (manifest, ...args) => {
    if (manifest.plugin_id === PLUGIN_ID && manifest.version === "1.1.0" && !entered) {
      entered = true;
      assert.equal(h.host.homePlugins!.installation(PLUGIN_ID)!.version, "1.1.0", "failure occurs after the real Runtime switched");
      throw new Error("T141 expose fault");
    }
    return attach(manifest, ...args);
  };
  try { await assert.rejects(h.install(next), /T141 expose fault/); }
  finally { registry.attach = attach; }
  assert.equal(entered, true);
  assert.equal(h.host.homePlugins!.installation(PLUGIN_ID)!.version, "1.0.0");
  assert.equal(h.host.homePlugins!.installation(PLUGIN_ID)!.install_id, before.install_id);
  assert.equal((await pull(h)).ok, true, "the old live contribution is restored after failed exposure");
  assert.deepEqual(registry.connectionServices().find(entry => entry.owner === PLUGIN_ID)!.declaration.origins, ORIGINS);
  await h.install(next);
  assert.equal(h.host.homePlugins!.installation(PLUGIN_ID)!.install_id, before.install_id);
  assert.equal(registry.integration("example-feed"), undefined);
  assert.deepEqual(registry.connectionServices().find(entry => entry.owner === PLUGIN_ID)!.declaration.origins, ["https://new.example.com"]);
  assert.equal(registry.connectionDeclarer("new-feed")!.install_id, before.install_id);
  const result = await pull(h, "new-feed"); assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.events[0]!.payload.summary, "v2");
  await h.reopen();
  assert.equal(h.host.homePlugins!.installation(PLUGIN_ID)!.version, "1.1.0");
  assert.equal((await pull(h, "new-feed")).ok, true);
});

// RAC-2615-QUEUE: keep the actual signed runner's result at its post-result authority check, then switch versions.
test("RAC-2615-QUEUE an old source response cannot write Listener, Signal or Feed facts after upgrade", mac, async t => {
  const h = await fixture(t), publisher = newPublisher();
  const registry = await homeIntegrationRegistry(h.home);
  // Free the test Home's built-in GitHub declaration through its normal registry lifecycle, then install the real signed runner.
  await registry.disable(registry.integration("github")!.plugin_id);
  await h.install(integrationPackage(publisher, { serviceId: "github" }));
  const original = registry.bind.bind(registry);
  const entered = deferred(), release = deferred();
  let checks = 0;
  registry.bind = async (...args) => {
    const bound = await original(...args), poll = bound.connector_driver.poll.bind(bound.connector_driver);
    return { ...bound, connector_driver: { ...bound.connector_driver, poll: (input, control) => poll(input, { ...control, beforeEffect: async () => {
      await control.beforeEffect();
      // proxy admission, instance admission, runner pre-call, then runner post-result (no SDK calls in this package).
      if (++checks === 4) { entered.resolve(); await release.promise; }
    } }) } };
  };
  const store = new LocalProjectDatabase(join(h.home, "project.sqlite"));
  const feed = createLocalFeedApplication(store.db);
  const source = feed.sources.upsert(accountSourceRecord("github", { source_id: "t141-old-response", status: "active", config: {} }));
  const snapshot = () => ({ feed: feed.snapshot(DEMO_PROJECT_ID),
    signals: new SignalsModule(fromBetterSqlite(store.db)).query.list(DEMO_PROJECT_ID, source.source_id),
    deliveries: store.db.prepare("SELECT * FROM listener_deliveries WHERE project_id = ? AND source_id = ?").all(DEMO_PROJECT_ID, source.source_id),
    checkpoint: store.db.prepare("SELECT cursor_json, state, attempt, retry_at, last_error_code, updated_at FROM listener_instances WHERE project_id = ? AND source_id = ?").get(DEMO_PROJECT_ID, source.source_id),
    events: store.db.prepare("SELECT * FROM events WHERE project_id = ? AND object_id = ? ORDER BY event_id").all(DEMO_PROJECT_ID, source.source_id) });
  const caller = { ...h.projectCaller(), permissions: feedSourceActions.sync.action.permissions };
  const client = h.projectClient(), view = (await h.host.inspectActions(caller, h.reference)).find(view => view.capability_id === feedSourceActions.sync.capability_id)!;
  assert.ok(view, "the Runtime Feed sync is in the Host action directory");
  caller.permissions = view.action.permissions;
  assert.ok(view.provider.plugin_install_id, "the actual Runtime Feed owns this sync");
  withConnectorConnections(h.home, connections => {
    const account = connections.createToken({ serviceId: "github", displayName: "Fixture", token: randomUUID() });
    connections.bind({ scopeId: pluginBindingScope({ install_id: view.provider.plugin_install_id!, project_id: DEMO_PROJECT_ID, record_key: source.source_id }),
      pluginId: feedManifest.plugin_id, slotId: "github", serviceId: "github", connectionId: account.connection_id });
  });
  const pending = client.invoke(caller, ref(feedSourceActions.sync), { source_id: source.source_id, idempotency_key: "t141-old-pull" }).then(value => ({ value }), error => ({ error }));
  try {
    await Promise.race([entered.promise, pending.then(result => { throw new Error("source pull did not reach the real post-result barrier", { cause: "error" in result ? result.error : result.value }); })]);
    const before = snapshot();
    await h.install(integrationPackage(publisher, { version: "1.1.0", serviceId: "github", code: `export const operations = {
      'integration.health': async () => ({ok:true,status:'connected',message:'v2'}),
      'integration.poll': async input => {
        if (input.source_id === 't141-current-throw') throw new Error('Fixture polling fault');
        return input.source_id === 't141-current-failure' ? {ok:false,failure:'provider',message:'Fixture provider failed'}
          : {ok:true,items:[{externalId:'v2',title:'Version two',summary:'current v2'}],cursor:'v2'};
      }
    };` }));
    release.resolve();
    const result = await pending; assert.ok("error" in result, "the old in-flight call must reject");
    assert.deepEqual(snapshot(), before, "old version results and failure bookkeeping cannot write new-version business facts");
    const current = await client.invoke(caller, ref(feedSourceActions.sync), { source_id: source.source_id, idempotency_key: "t141-old-pull" }) as { created: number };
    assert.equal(current.created, 1, "a fresh call can resume the same operation under the current provider");
    assert.deepEqual(feed.snapshot(DEMO_PROJECT_ID).feed_items.filter(item => item.source_id === source.source_id).map(item => item.summary), ["current v2"]);
    // An ordinary error from the still-current provider remains a legitimate failed sync, with its failure facts.
    for (const outcome of ["failure", "throw"] as const) {
      const failed = feed.sources.upsert(accountSourceRecord("github", { source_id: "t141-current-" + outcome, status: "active", config: {} }));
      withConnectorConnections(h.home, connections => {
        const account = connections.binding(pluginBindingScope({ install_id: view.provider.plugin_install_id!, project_id: DEMO_PROJECT_ID, record_key: source.source_id }), feedManifest.plugin_id, "github")!;
        connections.bind({ scopeId: pluginBindingScope({ install_id: view.provider.plugin_install_id!, project_id: DEMO_PROJECT_ID, record_key: failed.source_id }),
          pluginId: feedManifest.plugin_id, slotId: "github", serviceId: "github", connectionId: account.connection_id });
      });
      await assert.rejects(client.invoke(caller, ref(feedSourceActions.sync), { source_id: failed.source_id, idempotency_key: "t141-current-" + outcome }),
        code(outcome === "failure" ? "feed.connector_failed" : "feed.source_sync_interrupted"));
      const stored = feed.sources.get(DEMO_PROJECT_ID, failed.source_id);
      assert.equal(stored.status, "error");
      if (outcome === "failure") assert.equal(stored.last_outcome, "failed");
      else assert.equal(stored.last_error_code, "listener.connector_failed");
      assert.deepEqual(store.db.prepare("SELECT type FROM events WHERE project_id = ? AND object_id = ?").all(DEMO_PROJECT_ID, failed.source_id).map(row => row.type),
        [outcome === "failure" ? "io.molis.work.feed:feed_connector.sync_failed" : "io.molis.work.feed:feed_connector.sync_interrupted"]);
    }
  } finally { release.resolve(); await pending; registry.bind = original; store.close(); }
});
