import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { SANDBOX_PACKAGE_FILES, type PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginPublisherPin } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { MemoryPluginConsentLedger, SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { DEMO_PROJECT_ID, HomeConsentLedger, MolisWorkLocalHost, PLUGIN_INSTALL_PERMISSIONS, PluginInstallService, SandboxPackageStore, molisWorkHostProjectReference,
  pluginInstallActions, pluginInstallProvider, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { PACKAGE_PLUGIN_ID, newPublisher, signedPackage, type PackageFiles } from "./fixtures/sandbox-package.js";

// S-87 (ac-trust T5b, BL-559): a publisher the person pinned can be taken back, and only the person can: at the Host's settings entry,
// the same one that takes an agreement back (S-77). Taking one back is for good. What it signed can no longer be installed; what is
// installed from it can no longer do anything (denied at its next effect, whatever began before), is stopped when its project next looks,
// is not started again by a restart and cannot be enabled; its data stays, and the person can uninstall it.

const AT = "2026-10-25T00:00:00.000Z", LATER = "2026-10-26T00:00:00.000Z";
const KEY = "ed25519:sha256:" + "a".repeat(64);
const pin = (keyId = KEY): Omit<PluginPublisherPin, "revoked_at"> => ({ key_id: keyId, public_key_spki_base64: "spki", label: "Example", pinned_at: AT, pinned_by: LOCAL_PERSON_ACTOR_ID });
const refused = (code: string) => (error: unknown) => error instanceof ActionError && error.code === code;
const REVOKE: ActionReference = { capability_id: pluginInstallActions.revokePublisher.capability_id, version: 1 };

test("RAC-392 S-87 a ledger takes a publisher back once: the first time stays, the pin stays and is never lifted by pinning again, and a key nobody pinned answers null", () => {
  const ledger = new MemoryPluginConsentLedger();
  ledger.pinPublisher(pin());
  assert.equal(ledger.revokePublisher("ed25519:sha256:" + "b".repeat(64), AT), null);
  const first = ledger.revokePublisher(KEY, AT)!;
  assert.deepEqual(first, { ...pin(), revoked_at: AT });
  assert.deepEqual(ledger.revokePublisher(KEY, LATER), first, "taking back a publisher again changes nothing");
  assert.deepEqual(ledger.pinPublisher({ ...pin(), label: "Again", pinned_at: LATER }), first, "pinning it again does not lift it");
  assert.deepEqual(ledger.publishers(), [first]);
});

test("RAC-392 S-87 only the person at the Host's settings entry takes a publisher back; an Agent, MCP, a workflow, a plugin and a user call without that entry are refused, and nothing is written", async () => {
  const ledger = new MemoryPluginConsentLedger();
  ledger.pinPublisher(pin());
  const service = new PluginInstallService({ ledger, packages: new SandboxPackageStore("/nonexistent"), now: () => LATER, install: async () => undefined, installed: async () => [] });
  const actions = new ActionService();
  actions.registerProvider(pluginInstallProvider(service));
  const caller = (extra: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: null, permissions: PLUGIN_INSTALL_PERMISSIONS, ...extra });
  for (const audience of ["agent", "mcp", "workflow", "plugin"] as const) {
    assert.deepEqual((await actions.discover(caller({ audience }))).filter(view => view.capability_id === REVOKE.capability_id), [], `${audience} does not see it`);
    await assert.rejects(actions.invoke(caller({ audience }), REVOKE, { key_id: KEY }), error => error instanceof ActionError, `${audience} cannot call it`);
  }
  const user_action = { source: "management" as const, conversation_ref: "forged:settings", message_ref: "forged:request" };
  await assert.rejects(actions.invoke(caller(), REVOKE, { key_id: KEY }), refused("actions.forbidden"), "the person's call with no credential");
  await assert.rejects(actions.invoke(caller({ user_action }), REVOKE, { key_id: KEY }), refused("actions.forbidden"), "a user_action written by hand is not the Host's entry");
  await assert.rejects(actions.invoke(caller({ project_id: "project-one", user_action }), REVOKE, { key_id: KEY }), refused("actions.forbidden"), "nor is a project page's");
  assert.equal(ledger.publishers()[0]!.revoked_at, null, "nothing was written");
});

test("RAC-392 S-87 the settings entry takes a publisher back over HTTP, answers the pin, keeps the first time, and refuses an unauthorized call and an unknown key", async t => {
  const f = await serveHomeRuntime(t);
  const ledger = new HomeConsentLedger(f.home);
  ledger.pinPublisher(pin());
  const revoke = (body: unknown, authorized = true) => f.request("/api/settings/plugin-publishers/revoke", { method: "POST", body, authorized });
  assert.equal((await revoke({ key_id: KEY }, false)).status, 403);
  assert.equal(ledger.publishers()[0]!.revoked_at, null);
  const first = await revoke({ key_id: KEY });
  assert.equal(first.status, 200);
  const taken = (await first.json()).publisher as PluginPublisherPin;
  assert.ok(taken.revoked_at); assert.deepEqual(taken, { ...pin(), revoked_at: taken.revoked_at });
  const second = await revoke({ key_id: KEY });
  assert.equal(second.status, 200); assert.deepEqual((await second.json()).publisher, taken, "the first time stays");
  const unknown = await revoke({ key_id: "ed25519:sha256:" + "c".repeat(64) });
  assert.equal(unknown.status, 400); assert.equal((await unknown.json()).code, "plugin.publisher_untrusted");
  assert.deepEqual(ledger.publishers(), [taken]);
});

/** The fixture's adding operation reads before it writes but declares only the write; a package that can really add a note declares both. */
function readsAndWrites(files: PackageFiles) {
  const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!);
  for (const operation of contract.operations) if (operation.id === "notes.add") operation.effects = { storage: ["read", "write"] };
  files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
}

const mac = { skip: process.platform !== "darwin", timeout: 90_000 };
const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user" as const, permissions: [], project_id: DEMO_PROJECT_ID };

async function installed() {
  const home = await mkdtemp(join(tmpdir(), "publisher-revoke-"));
  let host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const databasePath = join(home, "project.sqlite"); seedDemoBoard(databasePath);
  const reference = molisWorkHostProjectReference({ databasePath, projectId: DEMO_PROJECT_ID });
  const person = { ...caller, permissions: PLUGIN_INSTALL_PERMISSIONS, user_action: { source: "management" as const, conversation_ref: "s86:install", message_ref: "s86:confirm" } };
  const install = async (bundle: PluginPackageBundle) => {
    const client = host.actionClient(reference);
    const preview = await client.invoke(person, { capability_id: pluginInstallActions.preview.capability_id, version: 2 }, { bundle }) as { preview_id: string };
    return client.invoke(person, { capability_id: pluginInstallActions.confirm.capability_id, version: 1 }, { preview_id: preview.preview_id, consent: true, pin_label: "Example" });
  };
  const plugins = async () => (await host.actionClient(reference).invoke(person, { capability_id: pluginInstallActions.installed.capability_id, version: 1 }, {}) as
    { plugins: Array<{ install_id: string; plugin_id: string; state: string }> }).plugins.filter(item => item.plugin_id === PACKAGE_PLUGIN_ID);
  const operation = async (name: string) => {
    await host.inspectActions(caller, reference);
    const view = (await host.actionClient(reference).discover(caller)).find(item => new RegExp(`^generated\\.[0-9a-f]{8}\\.${name.replace(".", "\\.")}$`).test(item.capability_id));
    return view && { capability_id: view.capability_id, version: view.version, provider_id: view.provider_id };
  };
  const data = (installId: string) => host.withProject(reference, runtime => new SqlitePluginPrivateStorage(runtime.store.db).snapshotInstallationData(installId));
  return { home, reference, install, plugins, operation, data, ledger: new HomeConsentLedger(home), person,
    get host() { return host; }, get client() { return host.actionClient(reference); },
    async reopen() { await host.close(); host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null }); },
    service: () => new PluginInstallService({ ledger: new HomeConsentLedger(home), packages: new SandboxPackageStore(home), install: async () => undefined, installed: async () => [] }),
    async close() { try { await host.close(); } finally { await rm(home, { recursive: true, force: true }); } } };
}

test("RAC-391 RAC-392 S-87 a publisher taken back: what it signed does nothing from then on (no write), stops, cannot be enabled or restarted, keeps its data, and its next package is refused", mac, async () => {
  const h = await installed(), publisher = newPublisher();
  try {
    await h.install(signedPackage(publisher, readsAndWrites));
    const [running] = await h.plugins();
    assert.equal(running!.state, "running");
    const add = (await h.operation("notes.add"))!, list = (await h.operation("notes.list"))!;
    assert.ok(add && list, "the package's actions are there");
    assert.equal(await h.client.invoke(caller, add, { text: "kept" }), true);
    const before = await h.data(running!.install_id);

    h.service().revokePublisher(publisher.identity);
    assert.ok(h.ledger.publishers()[0]!.revoked_at, "the pin is revoked in the Home's ledger");

    // Before the project has looked: whatever is still reachable is denied at its first effect, and nothing is written.
    await assert.rejects(h.client.invoke(caller, add, { text: "after" }), error => error instanceof Error, "a call after the revocation is refused");
    assert.deepEqual(await h.data(running!.install_id), before, "no write after the revocation");

    // The project looks: the installation is stopped, its data kept.
    assert.deepEqual((await h.plugins()).map(item => item.state), ["disabled"]);
    assert.deepEqual(await h.data(running!.install_id), before, "stopping it keeps its data");
    await h.host.inspectActions(caller, h.reference);
    assert.ok(!(await h.client.discover(caller)).some(view => view.capability_id === add.capability_id), "its actions are no longer offered");

    // A restart does not start it; it is not listed as running.
    await h.reopen();
    assert.deepEqual((await h.plugins()).map(item => item.state), ["disabled"]);
    assert.ok(!(await h.client.discover(caller)).some(view => view.capability_id === add.capability_id), "its actions are not offered after a restart");
    assert.deepEqual(await h.data(running!.install_id), before, "the data is there after a restart");

    // What the publisher signs next is refused at the preview.
    await assert.rejects(h.install(signedPackage(publisher, readsAndWrites, { version: "1.1.0" })), refused("plugin.publisher_revoked"));
  } finally { await h.close(); }
});
