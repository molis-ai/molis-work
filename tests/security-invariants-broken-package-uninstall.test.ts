import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { SANDBOX_PACKAGE_FILES } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginInstalledView, PluginUninstallTarget } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import { PACKAGE_PLUGIN_ID, newPublisher, signedPackage } from "./fixtures/sandbox-package.js";
import { fixture, homePackage, mac, operate, operationsOf, valuesOf } from "./fixtures/home-sandbox.js";
import { serveTestHost } from "./fixtures/test-home.js";
import { installedPackageHost, readsAndWrites } from "./fixtures/signed-package-host.js";

// BL-915, S-94: a signed sandbox installation comes off from its trusted row alone. Its package is not read, so one that is gone or altered is
// taken off from the Home's and the project's settings doors like any other (B27-UN-01); the request names the row's installation and nothing
// newer is touched on its account (B27-UN-03); a clean-up that did not finish keeps the row listed, stopped, with its first data choice, until the
// person retries it, and a finished one asked again answers as it is (B27-UN-04).

type Failure = { code?: string; status?: number };
const failsWith = (code: string) => (error: Failure) => error.code === code;
const keptPackageDirectory = (home: string) => {
  const root = join(home, "plugin-packages"), [directory] = readdirSync(root);
  return join(root, directory!);
};
/** Another entrypoint in place of the signed one: the package no longer checks against what was installed. */
const alterEntrypoint = (home: string) => {
  const entry = join(keptPackageDirectory(home), SANDBOX_PACKAGE_FILES.entrypoint);
  chmodSync(entry, 0o600); writeFileSync(entry, "export const operations = {};\n");
};

async function homeRig(t: TestContext) {
  const h = await fixture(t);
  let served = await serveTestHost(null, { home: h.home, host: h.host });
  t.after(() => served.close());
  const row = async () => (await served.web.post<{ plugins: PluginInstalledView[] }>("/api/settings/plugin-permissions/list", {})).plugins.find(item => item.plugin_id === PACKAGE_PLUGIN_ID);
  const uninstall = (body: { keep_data?: boolean; target?: PluginUninstallTarget | undefined }) =>
    served.web.post<{ plugin_id: string; state: string }>("/api/settings/plugin-permissions/uninstall", { plugin_id: PACKAGE_PLUGIN_ID, ...body });
  const add = async (text: string) => operate(h.projectClient(), h.projectCaller(), await operationsOf(h.projectClient(), h.projectCaller()), "notes.add", { text });
  const offered = async () => (await operationsOf(h.projectClient(), h.projectCaller())).length;
  /** A POST as the page sends it, with headers of the caller's choosing. */
  const raw = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(served.origin + path, { method: "POST", body: JSON.stringify(body),
    headers: { origin: served.origin, "content-type": "application/json", "x-molis-work-control-token": served.controlToken, "x-molis-work-idempotency-key": randomUUID(), ...headers } });
  return { h, row, uninstall, add, offered, raw, get web() { return served.web; },
    async reopen() { await served.close(); await h.reopen(); served = await serveTestHost(null, { home: h.home, host: h.host }); } };
}

for (const damage of ["missing", "altered"] as const) {
  test(`B27-UN-01 S-94 a Home package whose kept package is ${damage} is listed with its code and comes off from its trusted row`, mac, async t => {
    const r = await homeRig(t);
    await r.h.install(homePackage(newPublisher()));
    await r.add("before the damage");
    const installId = r.h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)!.install_id;
    assert.ok(valuesOf(r.h.home, installId).length > 0);
    if (damage === "missing") rmSync(join(r.h.home, "plugin-packages"), { recursive: true, force: true }); else alterEntrypoint(r.h.home);
    await r.reopen();

    const listed = await r.row();
    assert.ok(listed, "still listed");
    assert.equal(listed.recovery_error, damage === "missing" ? "plugin.package_missing" : "plugin.package_invalid");
    assert.equal(await r.offered(), 0, "nothing of it is offered");
    await assert.rejects(r.web.post("/api/settings/plugin-permissions/enable", { plugin_id: PACKAGE_PLUGIN_ID }), (error: Failure) => typeof error.code === "string" && error.status !== 500);
    const target = listed.uninstall_target;
    assert.ok(target);
    assert.deepEqual([target.install_id, target.installation_generation], [installId, r.h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)!.installation_generation]);

    // B27-UN-03: a request naming another installation of the row is refused, and nothing is withdrawn or cleaned.
    await assert.rejects(r.uninstall({ keep_data: false, target: { ...target, installation_generation: "an-earlier-one" } }), failsWith("plugin.install_replaced"));
    await assert.rejects(r.uninstall({ keep_data: false, target: { ...target, version: "0.9.0" } }), failsWith("plugin.install_replaced"));
    assert.ok(valuesOf(r.h.home, installId).length > 0, "the refused requests deleted nothing");
    assert.equal((await r.row())?.state, listed.state);

    const removed = await r.uninstall({ keep_data: false, target });
    assert.deepEqual([removed.plugin_id, removed.state], [PACKAGE_PLUGIN_ID, "uninstalled"]);
    assert.equal(await r.row(), undefined, "gone from the list");
    assert.deepEqual(valuesOf(r.h.home, installId), [], "its private data went as the person chose");
    assert.equal(r.h.host.homePlugins!.hasPackage(PACKAGE_PLUGIN_ID), false);
    const tombstone = (await r.h.host.homePlugins!.ready()).runtime.get(installId);
    assert.deepEqual([tombstone.state, tombstone.last_error_code, tombstone.retain_private_data], ["uninstalled", null, false]);

    // B27-UN-04: the same request again answers as it is: the tombstone is not written again.
    const again = await r.uninstall({ keep_data: false, target });
    assert.equal(again.state, "uninstalled");
    assert.deepEqual((await r.h.host.homePlugins!.ready()).runtime.get(installId), tombstone, "replayed, nothing changed");
    await assert.rejects(r.uninstall({ keep_data: false, target: { ...target, install_id: "another-installation" } }), failsWith("plugin.state_invalid"));
  });
}

test("B27-UN-01 S-94 a project package whose kept package is gone is listed with its code and comes off at the project settings door, its data kept", mac, async () => {
  const h = await installedPackageHost();
  try {
    await h.install(signedPackage(newPublisher(), readsAndWrites));
    const { install_id } = (await h.plugins())[0]!;
    const caller = { ...h.person };
    const views = async () => (await h.client.discover(caller)).filter(view => view.provider.plugin_id === PACKAGE_PLUGIN_ID);
    await operate(h.client, caller, await views(), "notes.add", { text: "kept" });
    const before = await h.data(install_id);
    assert.notDeepEqual(before, []);
    rmSync(join(h.home, "plugin-packages"), { recursive: true, force: true });
    await h.reopen();

    const rows = async () => (await h.client.invoke(h.person, { capability_id: pluginInstallActions.installed.capability_id, version: pluginInstallActions.installed.version }, {}) as
      { plugins: PluginInstalledView[] }).plugins.filter(item => item.plugin_id === PACKAGE_PLUGIN_ID);
    const [listed] = await rows();
    assert.equal(listed?.recovery_error, "plugin.package_missing");
    assert.equal((await views()).length, 0, "nothing of it is offered");
    assert.deepEqual(await h.control("uninstall", { plugin_id: PACKAGE_PLUGIN_ID, keep_data: true }), { plugin_id: PACKAGE_PLUGIN_ID, state: "uninstalled" });
    assert.deepEqual(await rows(), [], "gone from the list");
    assert.deepEqual(await h.data(install_id), before, "its data was kept, as the person chose");
  } finally { await h.close(); }
});

test("B27-UN-03 S-94 an old request does not take off the installation that replaced it, and a plugin's page cannot take one off", mac, async t => {
  const r = await homeRig(t), publisher = newPublisher();
  await r.h.install(homePackage(publisher));
  const first = (await r.row())!.uninstall_target!;
  await r.uninstall({ keep_data: true, target: first });
  await r.h.install(homePackage(publisher));
  await r.add("the new installation's");
  const second = (await r.row())!.uninstall_target!;
  assert.equal(second.install_id, first.install_id, "kept data: the same install id");
  assert.notEqual(second.installation_generation, first.installation_generation, "a new generation");
  await assert.rejects(r.uninstall({ keep_data: false, target: first }), failsWith("plugin.install_replaced"));
  assert.equal((await r.row())?.state, "running", "the new installation is running");
  assert.ok(await r.offered() > 0, "and its actions were not withdrawn");
  assert.ok(valuesOf(r.h.home, second.install_id).length > 0, "nor its data deleted");
  // A plugin's own page is not the person (S-94).
  const opened = await r.raw("/api/host/plugin-pages", { plugin_id: "io.molis.work.cognia" });
  assert.equal(opened.status, 200, await opened.clone().text());
  const page = { "x-molis-plugin-page": (await opened.json() as { page_id: string }).page_id };
  const refused = await r.raw("/api/settings/plugin-permissions/uninstall", { plugin_id: PACKAGE_PLUGIN_ID, keep_data: false, target: second }, page);
  assert.equal(refused.status, 403, await refused.clone().text());
  assert.equal((await refused.json() as Failure).code, "actions.forbidden");
  assert.equal((await r.row())?.state, "running", "still running");
});

test("B27-UN-04 S-94 a clean-up that did not finish keeps the row listed with its first choice; the other choice, a reinstall and an enable are refused; the retry finishes it", mac, async t => {
  const r = await homeRig(t), publisher = newPublisher();
  await r.h.install(homePackage(publisher));
  await r.add("to be deleted");
  const target = (await r.row())!.uninstall_target!, installId = target.install_id;
  // The installation's owner-file folder resolves outside the Home: the clean-up refuses it and stops there.
  const external = mkdtempSync(join(tmpdir(), "bl915-outside-")), parent = join(r.h.home, "plugin-files"), held = parent + "-held";
  t.after(() => rmSync(external, { recursive: true, force: true }));
  mkdirSync(join(external, installId));
  const moved = existsSync(parent);
  if (moved) renameSync(parent, held);
  symlinkSync(external, parent);
  await assert.rejects(r.uninstall({ keep_data: false, target }), failsWith("plugin.declaration_invalid"));
  const pending = await r.row();
  assert.ok(pending, "still listed");
  assert.equal(pending.pending_keep_data, false, "with the first data choice");
  assert.equal(await r.offered(), 0, "and stopped");
  const record = (await r.h.host.homePlugins!.ready()).runtime.get(installId);
  assert.deepEqual([record.state, record.last_error_code], ["uninstalled", "plugin.uninstall_cleanup_pending"]);

  await assert.rejects(r.uninstall({ keep_data: true, target: pending.uninstall_target }), failsWith("plugin.state_invalid"), "the other choice is not a retry");
  await assert.rejects(r.web.post("/api/settings/plugin-permissions/enable", { plugin_id: PACKAGE_PLUGIN_ID }), (error: Failure) => error.status !== 500 && error.code !== undefined);
  await assert.rejects(r.h.install(homePackage(publisher)), (error: Failure) => error.code === "plugin.uninstall_cleanup_pending", "nor a reinstall");
  await assert.rejects(r.h.install(homePackage(publisher, { version: "1.1.0" })), (error: Failure) => error.code === "plugin.uninstall_cleanup_pending", "nor an upgrade");
  assert.deepEqual((await r.h.host.homePlugins!.ready()).runtime.get(installId), record, "none of those changed the row");

  unlinkSync(parent); if (moved) renameSync(held, parent);
  await r.reopen();
  const after = await r.row();
  assert.equal(after?.pending_keep_data, false, "listed again after a restart");
  const finished = await r.uninstall({ keep_data: false, target: after!.uninstall_target });
  assert.equal(finished.state, "uninstalled");
  assert.equal(await r.row(), undefined);
  assert.deepEqual(valuesOf(r.h.home, installId), [], "the retry deleted its data");
  assert.equal((await r.h.host.homePlugins!.ready()).runtime.get(installId).last_error_code, null);
  await r.h.install(homePackage(publisher));
  assert.equal((await r.row())?.state, "running", "and it can be installed again");
});
