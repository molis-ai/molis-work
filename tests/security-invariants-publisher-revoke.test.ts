import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { SANDBOX_PACKAGE_FILES } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginPublisherPin } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { MemoryPluginConsentLedger } from "@molis-ai/molis-work-plugin-runtime";
import { HomeConsentLedger, PLUGIN_INSTALL_PERMISSIONS, PluginInstallService, SandboxPackageStore, pluginInstallActions, pluginInstallProvider } from "@molis-ai/molis-work-app-local-host";
import { SandboxBroker } from "@molis-ai/molis-work-plugin-sandbox";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { newPublisher, signedPackage, type PackageFiles } from "./fixtures/sandbox-package.js";
import { caller, installedPackageHost, mac, readsAndWrites } from "./fixtures/signed-package-host.js";

// S-87 (ac-trust T5b, BL-559): a publisher the person pinned can be taken back, and only the person can: at the Host's settings entry,
// the same one that takes an agreement back (S-77). Taking one back is for good. What it signed can no longer be installed; what is
// installed from it can no longer do anything (denied at its next effect, whatever began before), is stopped when its project next looks,
// is not started again by a restart and cannot be enabled; its data stays, and the person can uninstall it. Enabling has no public path yet (BL-623), so
// that refusal is asserted at the lifecycle itself, in tests/installed-plugin-host.test.ts (this one is macOS-only too).

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
  const service = new PluginInstallService({ ledger, packages: new SandboxPackageStore("/nonexistent"), now: () => LATER, installInProject: async () => undefined, installInHome: async () => undefined, installed: async () => [], control: async () => "disabled" });
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

/** A real adding operation whose write request the test can hold after its read has finished. */
function savesLate(files: PackageFiles) {
  readsAndWrites(files);
  files[SANDBOX_PACKAGE_FILES.entrypoint] = `export const operations = {
  'notes.list': async (_input, sdk) => JSON.parse((await sdk.storage.get('notes')) ?? '[]'),
  'notes.add': async (input, sdk) => { await sdk.storage.get('notes'); await sdk.storage.set('late', input.text); return true; }
};\n`;
}

/**
 * Hold the same sandbox call's actual write request before the broker handles it. No business write signals readiness, and no project
 * list/prepare runs between revocation and release. The original method, arguments and standing guard run when the request is released.
 */
async function lateCall(h: Awaited<ReturnType<typeof installedPackageHost>>, between: () => void, t: TestContext) {
  const [running] = await h.plugins(), add = (await h.operation("notes.add"))!;
  assert.ok(add, "the package's action is there");
  const before = JSON.stringify(await h.data(running!.install_id));
  const reached = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const invoke = SandboxBroker.prototype.invoke;
  let readBy: SandboxBroker | undefined, writes = 0;
  const observer = t.mock.method(SandboxBroker.prototype, "invoke", async function (this: SandboxBroker, ...args: Parameters<SandboxBroker["invoke"]>) {
    const [operation, , method, input, guard] = args;
    if (operation.id === "notes.add" && method === "storage.set") {
      assert.equal(this, readBy, "the same broker finished the operation's real read");
      assert.deepEqual(input, ["late", "late note"]);
      assert.equal(typeof guard, "function", "the original call still carries its guard");
      assert.equal(++writes, 1, "one write request from the original call");
      reached.resolve();
      await release.promise;
    }
    const value = await invoke.apply(this, args);
    if (operation.id === "notes.add" && method === "storage.get") {
      assert.deepEqual(input, ["notes"]);
      readBy = this;
    }
    return value;
  });
  const outcome = Promise.resolve().then(() => h.client.invoke(caller, add, { text: "late note" }))
    .then(value => ({ value }), (error: unknown) => ({ error }));
  try {
    // The existing sandbox/test deadlines only bound failure; no elapsed time orders these steps.
    await Promise.race([reached.promise, outcome.then(ended => {
      throw new Error("the call ended before its write request: " + ("error" in ended ? String(ended.error) : JSON.stringify(ended.value)));
    })]);
    between();
    release.resolve();
    return { ...await outcome, before, stored: JSON.stringify(await h.data(running!.install_id)) };
  } finally {
    release.resolve();
    await outcome;
    observer.mock.restore();
  }
}

test("RAC-392 S-87 a call already inside an operation when the publisher is taken back is refused at its next save, with the denial itself, and writes nothing more", mac, async t => {
  const h = await installedPackageHost(), publisher = newPublisher();
  try {
    await h.install(signedPackage(publisher, savesLate));
    const taken = await lateCall(h, () => h.service().revokePublisher(publisher.identity), t);
    assert.ok("error" in taken, "the call did not finish: " + JSON.stringify(taken));
    assert.match(String((taken.error as Error).message), /安装执行身份已失效/, "refused by the installation's standing (the route hands the caller the message, not the sandbox's plugin.capability_denied code), not by a crash");
    assert.ok(!taken.stored.includes("late note"), "nothing was saved after");
    assert.equal(taken.stored, taken.before, "private business data was not added or changed");
  } finally { await h.close(); }
});

test("RAC-392 S-87 control: the same call, with the publisher still trusted, saves what it was asked to", mac, async t => {
  const h = await installedPackageHost(), publisher = newPublisher();
  try {
    await h.install(signedPackage(publisher, savesLate));
    const kept = await lateCall(h, () => undefined, t);
    assert.deepEqual("value" in kept ? kept.value : kept, true);
    assert.ok(kept.stored.includes("late note"), "the note was saved");
  } finally { await h.close(); }
});

test("RAC-391 RAC-392 S-87 a publisher taken back: what it signed does nothing from then on (no write), stops, is not started again by a restart, keeps its data, and its next package is refused", mac, async () => {
  const h = await installedPackageHost(), publisher = newPublisher();
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
