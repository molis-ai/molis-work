import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { SANDBOX_PACKAGE_FILES } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { MemoryPluginConsentLedger } from "@molis-ai/molis-work-plugin-runtime";
import { PLUGIN_INSTALL_PERMISSIONS, PluginInstallService, SandboxPackageStore, pluginControlActions, pluginInstallProvider } from "@molis-ai/molis-work-app-local-host";
import { PACKAGE_PLUGIN_ID, newPublisher, signedPackage } from "./fixtures/sandbox-package.js";
import { caller, installedPackageHost, mac, readsAndWrites } from "./fixtures/signed-package-host.js";

// BL-623 (ac-trust, S-84): what the person does with a plugin installed from a signed package once it is installed. A newer package of the same
// plugin and publisher is its upgrade (the install path, preview then confirm); switching it off and on and taking it off are three actions of
// the person's own, `plugins.installed.{disable,enable,uninstall}@1`. BL623-01 an upgrade keeps the installation and its data and runs the new
// code; BL623-02 what is not an upgrade is refused and changes nothing; BL623-03 switching off keeps the data and stays off across a restart,
// switching on runs it again; BL623-04 taking it off keeps or deletes the data as the person says; BL623-05 a publisher taken back cannot be
// switched on or upgraded but can be taken off; BL623-06 only the person, in a project, reaches the three actions; BL623-07 a plugin that did not
// come from a signed package is not touched by them.

const V2 = `export const operations = {
  'notes.list': async (_input, sdk) => JSON.parse((await sdk.storage.get('notes')) ?? '[]'),
  'notes.add': async (input, sdk) => { const notes = JSON.parse((await sdk.storage.get('notes')) ?? '[]'); notes.push({ id: String(notes.length + 1), text: 'v2:' + input.text }); await sdk.storage.set('notes', JSON.stringify(notes)); return true; }
};\n`;
/** The package of version 1.1.0 that declares it can be upgraded to from 1.0.0, and runs other code. */
const upgrade = (declare = true) => (files: Parameters<typeof readsAndWrites>[0], manifest: { upgrade_compatibility?: { compatible_from_versions: string[] } }) => {
  readsAndWrites(files); files[SANDBOX_PACKAGE_FILES.entrypoint] = V2;
  if (declare) manifest.upgrade_compatibility = { compatible_from_versions: ["1.0.0"] };
};
const refused = (code: string) => (error: unknown) => error instanceof ActionError && error.code === code;

type Host = Awaited<ReturnType<typeof installedPackageHost>>;
async function notes(h: Host) {
  const list = (await h.operation("notes.list"))!;
  return (await h.client.invoke(caller, list, {}) as Array<{ text: string }>).map(note => note.text);
}
async function add(h: Host, text: string) { return h.client.invoke(caller, (await h.operation("notes.add"))!, { text }); }
const only = async (h: Host) => { const [one] = await h.plugins(); return one!; };

test("BL623-01 S-84 a newer package of an installed plugin and publisher is its upgrade: the installation and its data stay and the new code runs", mac, async () => {
  const h = await installedPackageHost(), publisher = newPublisher();
  try {
    await h.install(signedPackage(publisher, readsAndWrites));
    const before = await only(h);
    assert.equal(before.version, "1.0.0");
    await add(h, "one");
    await h.install(signedPackage(publisher, upgrade(), { version: "1.1.0" }));
    const after = await only(h);
    assert.deepEqual([after.version, after.state, after.install_id], ["1.1.0", "running", before.install_id], "the same installation, now at the new version, running");
    assert.deepEqual(await notes(h), ["one"], "what it kept is still there");
    await add(h, "two");
    assert.deepEqual(await notes(h), ["one", "v2:two"], "the new code runs");
    await h.reopen();
    assert.deepEqual([(await only(h)).version, (await only(h)).state], ["1.1.0", "running"], "and a restart starts the new version");
    assert.deepEqual(await notes(h), ["one", "v2:two"]);
  } finally { await h.close(); }
});

test("BL623-01 S-84 a newer package that asks for more than the installed one gets it from the person's confirmation of the preview, and not before", mac, async () => {
  const h = await installedPackageHost(), publisher = newPublisher();
  try {
    await h.install(signedPackage(publisher));
    await assert.rejects(add(h, "one"), error => error instanceof Error, "the installed version declares only a write, so its reading is refused");
    await h.install(signedPackage(publisher, upgrade(), { version: "1.1.0" }));
    await add(h, "two");
    assert.deepEqual(await notes(h), ["v2:two"], "the new version, which declares the read as well, runs with what the person agreed to");
  } finally { await h.close(); }
});

test("BL623-02 S-84 what is not an upgrade is refused and changes nothing: the same version, one that does not declare the upgrade, another publisher's package", mac, async () => {
  const h = await installedPackageHost(), publisher = newPublisher();
  try {
    await h.install(signedPackage(publisher, readsAndWrites));
    await add(h, "one");
    const unchanged = async () => {
      const one = await only(h);
      assert.deepEqual([one.version, one.state], ["1.0.0", "running"]);
      assert.deepEqual(await notes(h), ["one"]);
    };
    await assert.rejects(h.install(signedPackage(publisher, readsAndWrites)), refused("plugin.upgrade_required"), "the same version again");
    await unchanged();
    await assert.rejects(h.install(signedPackage(publisher, upgrade(false), { version: "1.1.0" })), refused("plugin.upgrade_required"), "a package that does not say it can be upgraded to from this version");
    await unchanged();
    const pins = h.ledger.publishers();
    const other = newPublisher();
    await assert.rejects(h.install(signedPackage(other, readsAndWrites, { version: "2.0.0" })), refused("plugin.definition_conflict"), "another publisher's package of the same plugin");
    assert.deepEqual(h.ledger.publishers(), pins, "and that publisher was not pinned on the way");
    await unchanged();
  } finally { await h.close(); }
});

test("BL623-03 S-84 a signed plugin switched off keeps its data and stays off across a restart; switched on it runs again", mac, async () => {
  const h = await installedPackageHost(), publisher = newPublisher();
  try {
    await h.install(signedPackage(publisher, readsAndWrites));
    await add(h, "one");
    assert.deepEqual(await h.control("disable", { plugin_id: PACKAGE_PLUGIN_ID }), { plugin_id: PACKAGE_PLUGIN_ID, state: "disabled" });
    assert.equal((await only(h)).state, "disabled");
    assert.equal(await h.operation("notes.add"), undefined, "its actions are no longer offered");
    await h.reopen();
    assert.equal((await only(h)).state, "disabled", "a restart does not start it");
    assert.equal(await h.operation("notes.add"), undefined);
    assert.deepEqual(await h.control("enable", { plugin_id: PACKAGE_PLUGIN_ID }), { plugin_id: PACKAGE_PLUGIN_ID, state: "running" });
    assert.ok(await h.operation("notes.add"), "its actions are offered again");
    await add(h, "two");
    assert.deepEqual(await notes(h), ["one", "two"], "its data was kept, and it works");
  } finally { await h.close(); }
});

async function upgradeWhileOff(restart: boolean) {
  const h = await installedPackageHost(), publisher = newPublisher();
  try {
    await h.install(signedPackage(publisher, readsAndWrites));
    await add(h, "one");
    await h.control("disable", { plugin_id: PACKAGE_PLUGIN_ID });
    if (restart) await h.reopen();
    await h.install(signedPackage(publisher, upgrade(), { version: "1.1.0" }));
    const after = await only(h);
    assert.deepEqual([after.version, after.state], ["1.1.0", "disabled"], "a new version never switches it on");
    assert.equal(await h.operation("notes.add"), undefined, "and offers no action");
    await h.control("enable", { plugin_id: PACKAGE_PLUGIN_ID });
    await add(h, "two");
    assert.deepEqual(await notes(h), ["one", "v2:two"], "switched on, it is the new version, with the data it had");
  } finally { await h.close(); }
}

test("BL623-03 S-84 a signed plugin that is switched off can still be upgraded in the same run, and stays off", mac, () => upgradeWhileOff(false));
test("BL623-03 S-84 a signed plugin that is switched off can still be upgraded after a restart, and stays off", mac, () => upgradeWhileOff(true));

test("BL623-04 S-84 taking a signed plugin off keeps its data when the person says so, and deletes it when they do not", mac, async () => {
  const h = await installedPackageHost(), publisher = newPublisher();
  try {
    await h.install(signedPackage(publisher, readsAndWrites));
    const { install_id } = await only(h);
    await add(h, "one");
    assert.deepEqual(await h.control("uninstall", { plugin_id: PACKAGE_PLUGIN_ID, keep_data: true }), { plugin_id: PACKAGE_PLUGIN_ID, state: "uninstalled" });
    assert.deepEqual(await h.plugins(), [], "it is no longer installed");
    assert.equal(await h.operation("notes.add"), undefined, "its actions are gone");
    assert.notDeepEqual(await h.data(install_id), [], "its data was kept");
    await h.install(signedPackage(publisher, readsAndWrites));
    assert.deepEqual(await notes(h), ["one"], "installed again, it finds what it kept");
    const again = (await only(h)).install_id;
    await h.control("uninstall", { plugin_id: PACKAGE_PLUGIN_ID, keep_data: false });
    assert.deepEqual(await h.plugins(), []);
    assert.deepEqual(await h.data(again), [], "its data was deleted");
  } finally { await h.close(); }
});

test("BL623-05 S-84 S-87 a plugin of a publisher taken back cannot be switched on or upgraded, and the person can still take it off", mac, async () => {
  const h = await installedPackageHost(), publisher = newPublisher();
  try {
    await h.install(signedPackage(publisher, readsAndWrites));
    const { install_id } = await only(h);
    await add(h, "one");
    h.service().revokePublisher(publisher.identity);
    await assert.rejects(h.control("enable", { plugin_id: PACKAGE_PLUGIN_ID }), refused("plugin.publisher_revoked"));
    await assert.rejects(h.install(signedPackage(publisher, upgrade(), { version: "1.1.0" })), refused("plugin.publisher_revoked"));
    assert.notDeepEqual(await h.data(install_id), [], "its data is still there");
    assert.deepEqual(await h.control("uninstall", { plugin_id: PACKAGE_PLUGIN_ID, keep_data: false }), { plugin_id: PACKAGE_PLUGIN_ID, state: "uninstalled" });
    assert.deepEqual(await h.data(install_id), [], "taken off, its data deleted as the person said");
  } finally { await h.close(); }
});

test("BL623-06 S-84 only the person in a project reaches the three actions: an Agent, MCP, a workflow, a plugin, a call without the entry's credential and one without a project are refused, and nothing is reached", async () => {
  let reached = 0;
  const service = new PluginInstallService({ ledger: new MemoryPluginConsentLedger(), packages: new SandboxPackageStore("/nonexistent"), installInProject: async () => undefined, installInHome: async () => undefined, installed: async () => [],
    control: async () => { reached += 1; return "disabled"; } });
  const actions = new ActionService();
  actions.registerProvider(pluginInstallProvider(service));
  const person = (extra: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: "project-one", permissions: PLUGIN_INSTALL_PERMISSIONS, ...extra });
  const user_action = { source: "management" as const, conversation_ref: "test:lifecycle", message_ref: "test:request" };
  const inputs = { disable: { plugin_id: "x" }, enable: { plugin_id: "x" }, uninstall: { plugin_id: "x", keep_data: true } } as const;
  for (const name of ["disable", "enable", "uninstall"] as const) {
    const action: ActionReference = { capability_id: pluginControlActions[name].capability_id, version: 1 };
    for (const audience of ["agent", "mcp", "workflow", "plugin"] as const) {
      assert.deepEqual((await actions.discover(person({ audience }))).filter(view => view.capability_id === action.capability_id), [], `${name}: ${audience} does not see it`);
      await assert.rejects(actions.invoke(person({ audience, user_action }), action, inputs[name]), error => error instanceof ActionError, `${name}: ${audience} cannot call it`);
    }
    await assert.rejects(actions.invoke(person(), action, inputs[name]), refused("actions.forbidden"), `${name}: the person's call without the entry's credential`);
    await assert.rejects(actions.invoke(person({ user_action, project_id: null }), action, inputs[name]), refused("actions.project_required"), `${name}: without a project`);
    await assert.rejects(actions.invoke(person({ user_action }), action, { ...inputs[name], extra: true }), error => error instanceof ActionError, `${name}: an input it does not define`);
  }
  assert.equal(reached, 0, "no refusal got as far as the project");
  await actions.invoke(person({ user_action }), { capability_id: pluginControlActions.disable.capability_id, version: 1 }, inputs.disable);
  assert.equal(reached, 1, "the person with the entry's credential, in a project, does");
});

test("BL623-07 S-84 a plugin that did not come from a signed package is not touched by the three actions", mac, async () => {
  const h = await installedPackageHost();
  try {
    for (const plugin_id of ["goals", "io.molis.work.example.nowhere"]) {
      await assert.rejects(h.control("disable", { plugin_id }), refused("plugin.state_invalid"), plugin_id);
      await assert.rejects(h.control("uninstall", { plugin_id, keep_data: false }), refused("plugin.state_invalid"), plugin_id);
    }
  } finally { await h.close(); }
});
