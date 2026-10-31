import assert from "node:assert/strict";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginInstalledView } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { HomeConsentLedger, pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import { PACKAGE_PLUGIN_ID, newPublisher, signedPackage } from "./fixtures/sandbox-package.js";
import { SECOND_PLUGIN_ID, fixture, homePackage, mac, operate, operationsOf, person, ref, valuesOf } from "./fixtures/home-sandbox.js";
import { openTestHome } from "./fixtures/test-home.js";

// BL-715 (PG-011, S-94; specs/repository-anti-corruption/slices/bl628-sandboxed-home-plugins.md): what the settings page tells the person about the
// packages installed in the Home, and what the person can do with them from there. The lists say why a package is not running (RAC-2601, RAC-2607),
// the Home's list is reconciled against the publishers the person took back before it is read (RAC-2602), and a package of the Home is switched off
// and on and taken off through the Host settings door (RAC-2605). The refusals of that door are in security-invariants-plugin-permissions*.test.ts.

/** Takes the kept packages of one plugin off the disk, as when a Home was copied without them; the Host must be closed. */
function dropKeptPackage(home: string, pluginId: string): void {
  for (const name of readdirSync(join(home, "plugin-packages"))) {
    const bundle = JSON.parse(readFileSync(join(home, "plugin-packages", name, "bundle.json"), "utf8")) as PluginPackageBundle;
    if (bundle.payload.manifest.plugin_id === pluginId) rmSync(join(home, "plugin-packages", name), { recursive: true, force: true });
  }
}

test("RAC-2601 the Home's installed list says why a package is not running: none while it runs, and the reason once its kept package is gone", mac, async t => {
  const h = await fixture(t);
  await h.install(homePackage());
  const list = async () => ((await h.homeClient().invoke(person(null), ref(pluginInstallActions.homeInstalled), {})) as { plugins: PluginInstalledView[] }).plugins.find(item => item.plugin_id === PACKAGE_PLUGIN_ID);
  const before = await list();
  assert.deepEqual([before?.state, before?.recovery_error], ["running", null]);
  await h.host.close();
  dropKeptPackage(h.home, PACKAGE_PLUGIN_ID);
  await h.reopen();
  const after = await list();
  assert.ok(after, "it is still listed");
  assert.equal(after.state, h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)?.state, "the state is the record's own, not rewritten to say it failed");
  assert.match(after.recovery_error ?? "", /找不到已安装的插件包/);
});

/** A Home package whose publisher the person has taken back, with nothing read in between: the Home's own list is the first to look. */
async function revokedHomePackage(t: Parameters<typeof openTestHome>[0]) {
  const home = await openTestHome(t);
  const project = await home.createProject("撤销");
  const client = home.host.actionClient(project.reference);
  const caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: [] };
  const preview = await client.invoke(person(project.project_id), ref(pluginInstallActions.preview), { bundle: homePackage() }) as { preview_id: string };
  await client.invoke(person(project.project_id), ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Test publisher" });
  const list = async () => (await home.web.post<{ plugins: PluginInstalledView[] }>("/api/settings/plugin-permissions/list", {})).plugins.find(item => item.plugin_id === PACKAGE_PLUGIN_ID);
  const offered = async () => (await operationsOf(client, caller)).length;
  assert.equal((await list())?.state, "running");
  assert.ok(await offered() > 0);
  await home.web.post("/api/settings/plugin-publishers/revoke", { key_id: new HomeConsentLedger(home.home).publishers()[0]!.key_id });
  return { home, list, offered };
}

test("RAC-2602 the Home's installed list is read after the publishers the person took back are reconciled: the package is switched off before it is listed, without the project's list being read", mac, async t => {
  const { list, offered } = await revokedHomePackage(t);
  assert.equal((await list())?.state, "disabled");
  assert.equal(await offered(), 0, "no project is offered its actions");
});

test("RAC-2602 a Home package of a publisher the person took back cannot be switched on: the answer is plugin.publisher_revoked, not an internal error, and it stays off with no actions offered", mac, async t => {
  const { home, list, offered } = await revokedHomePackage(t);
  await list();
  await assert.rejects(home.web.post("/api/settings/plugin-permissions/enable", { plugin_id: PACKAGE_PLUGIN_ID }), (error: { status?: number; code?: string }) => error.code === "plugin.publisher_revoked" && error.status !== 500);
  assert.equal((await list())?.state, "disabled");
  assert.equal(await offered(), 0, "nothing of it was started");
});

test("RAC-2602 a Home package of a publisher the person took back can still be taken off, its data kept or not, and nothing of it is offered or started on the way", mac, async t => {
  const { home, list, offered } = await revokedHomePackage(t);
  await list();
  const removed = await home.web.post<{ plugin_id: string; state: string }>("/api/settings/plugin-permissions/uninstall", { plugin_id: PACKAGE_PLUGIN_ID, keep_data: true });
  assert.deepEqual([removed.plugin_id, removed.state], [PACKAGE_PLUGIN_ID, "uninstalled"]);
  assert.equal(await list(), undefined);
  assert.equal(await offered(), 0);
  assert.equal(home.host.homePlugins!.hasPackage(PACKAGE_PLUGIN_ID), false);
});

test("RAC-2605 a package installed in the Home is switched off and on and taken off through the Host settings door: the projects lose and regain its actions, the project's door cannot do it, and removing the data removes it", mac, async t => {
  const home = await openTestHome(t);
  const one = await home.createProject("一"), two = await home.createProject("二");
  const clientOf = (project: typeof one) => home.host.actionClient(project.reference);
  const callerOf = (project: typeof one): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: [] });
  const preview = await clientOf(one).invoke(person(one.project_id), ref(pluginInstallActions.preview), { bundle: homePackage() }) as { preview_id: string };
  await clientOf(one).invoke(person(one.project_id), ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Test publisher" });
  const offered = async (project: typeof one) => (await operationsOf(clientOf(project), callerOf(project))).length;
  await operate(clientOf(one), callerOf(one), await operationsOf(clientOf(one), callerOf(one)), "notes.add", { text: "kept for the uninstall" });
  const installId = home.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)!.install_id;
  const body = { plugin_id: PACKAGE_PLUGIN_ID };

  // The project's door does not reach a package of the Home.
  await assert.rejects(home.web.post(`/projects/${one.project_id}/api/plugin-trust/installed/disable`, body), (error: { code?: string }) => error.code === "plugin.state_invalid");
  assert.equal(home.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)?.state, "running");

  const off = await home.web.post<{ plugin_id: string; state: string }>("/api/settings/plugin-permissions/disable", body);
  assert.deepEqual([off.plugin_id, off.state], [PACKAGE_PLUGIN_ID, "disabled"]);
  for (const project of [one, two]) assert.equal(await offered(project), 0, "no project is offered the actions of a stopped package");
  const on = await home.web.post<{ state: string }>("/api/settings/plugin-permissions/enable", body);
  assert.equal(on.state, "running");
  for (const project of [one, two]) assert.ok(await offered(project) > 0, "and they are back");

  assert.ok(valuesOf(home.home, installId).length > 0);
  const gone = await home.web.post<{ state: string }>("/api/settings/plugin-permissions/uninstall", { ...body, keep_data: false });
  assert.equal(gone.state, "uninstalled");
  assert.equal(home.host.homePlugins!.hasPackage(PACKAGE_PLUGIN_ID), false);
  assert.deepEqual(valuesOf(home.home, installId), [], "its private data is gone");
  for (const project of [one, two]) assert.equal(await offered(project), 0);
});

test("RAC-2607 a project's installed list says why a signed package of the project is not running, and null for one that is", mac, async t => {
  const h = await fixture(t);
  await h.install(signedPackage(newPublisher()));
  await h.install(signedPackage(newPublisher(), undefined, { pluginId: SECOND_PLUGIN_ID }));
  const list = async () => ((await h.projectClient().invoke(person(), ref(pluginInstallActions.installed), {})) as { plugins: PluginInstalledView[] }).plugins;
  const running = (await list()).filter(item => item.plugin_id === PACKAGE_PLUGIN_ID || item.plugin_id === SECOND_PLUGIN_ID);
  assert.deepEqual(running.map(item => item.recovery_error), [null, null], "running ones have none");
  await h.host.close();
  dropKeptPackage(h.home, PACKAGE_PLUGIN_ID);
  await h.reopen();
  const after = await list();
  const lost = after.find(item => item.plugin_id === PACKAGE_PLUGIN_ID), kept = after.find(item => item.plugin_id === SECOND_PLUGIN_ID);
  assert.match(lost?.recovery_error ?? "", /找不到已安装的插件包/);
  assert.equal(kept?.recovery_error, null);
});
