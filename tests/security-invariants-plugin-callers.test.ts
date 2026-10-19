import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { createPluginArtifactClient } from "@molis-ai/molis-work-plugin-artifacts";
import { deferred, person, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { CALLERS_READ as READ, CALLERS_WRITE as WRITE, callAs, callerPlugin, issuedCaller, registerProbe, startProjectPlugins, type CallerPlugin, type CallerScope } from "./fixtures/plugin-callers.js";
import { openTestHome } from "./fixtures/test-home.js";

/*
 * S-15 / PG-110: the action gateway accepts a plugin's call only with a caller the Host issued to that session and has not withdrawn,
 * for the call's own person, project and installation, and only for what the plugin both declares and holds. Each refusal below is
 * asserted by its code, and the provider never runs for it.
 */

/** A probe consumer. `write` is how its Manifest lists the write permission; a fixture is granted only what it requires. */
const consumer = (name: string, scope: CallerScope, write: "required" | "optional" | "undeclared", extra: readonly string[] = []) =>
  callerPlugin(name, scope, { ...Object.fromEntries(extra.map(id => [id, true])), ...(write === "undeclared" ? {} : { [WRITE]: write === "required" }) });

async function homeSetup(t: TestContext, consumers: readonly CallerPlugin[]) {
  const runtime = await serveHomeRuntime(t, { pluginFixtures: { home: consumers.map(item => item.definition) } });
  const probe = registerProbe(runtime.host.actionRegistry(), "home");
  const platform = await runtime.host.homePlugins!.ready();
  return { ...runtime, probe, platform };
}

async function projectSetup(t: TestContext, consumers: readonly CallerPlugin[]) {
  const home = await openTestHome(t, { catalogPolicy: false, host: { pluginFixtures: { project: consumers.map(item => item.definition) } } });
  const open = async (name: string) => {
    const project = await home.createProject(name);
    await home.host.withProject(project.reference, () => undefined);
    const probe = registerProbe(home.host.actionRegistry(project.reference), "project");
    await startProjectPlugins(home.host, project.reference);
    return { ...project, probe };
  };
  return { host: home.host, open };
}

test("PG110-01 S-15 the gateway refuses a plugin call without a caller the Host issued: none, a copy, a forged one, or one a person's call carries", async t => {
  const reader = consumer("callerreader", "home", "required");
  const { host, probe } = await homeSetup(t, [reader]);
  const issued = await issuedCaller(probe, reader), client = host.homeActionClient(), reached = probe.state.callers.length;
  const forged: HostPluginCaller = { plugin_id: issued.plugin_id, install_id: issued.install_id, actor_id: issued.actor_id, project_id: issued.project_id,
    declaration: issued.declaration, assertActive: () => {} };
  const { host_plugin: _issued, ...bare } = callAs(issued, [READ]);
  const refused: ReadonlyArray<readonly [string, ActionCallContext]> = [
    ["no caller from the Host", bare],
    ["a copy of the issued caller", callAs(issued, [READ], { host_plugin: { ...issued } })],
    ["a caller built outside the Host", callAs(issued, [READ], { host_plugin: forged })],
    ["a person's call carrying a copy", { ...person([READ]), host_plugin: { ...issued } }],
  ];
  for (const [label, caller] of refused) await assert.rejects(client.invoke(caller, probe.peek, {}), { code: "host.plugin_caller_invalid" }, label);
  assert.equal(probe.state.callers.length, reached, "no refused call reached the provider");
  assert.equal(await client.invoke(callAs(issued, [READ]), probe.peek, {}), null, "the caller the Host issued passes");
});

test("PG110-02 S-15 the gateway refuses an issued Home caller presented for another person, installation or project", async t => {
  const one = consumer("callerone", "home", "required"), two = consumer("callertwo", "home", "required");
  const { host, probe, project } = await homeSetup(t, [one, two]);
  const first = await issuedCaller(probe, one), second = await issuedCaller(probe, two), elsewhere = await project("Elsewhere");
  assert.notEqual(first.install_id, second.install_id);
  const reached = probe.state.callers.length, client = host.homeActionClient();
  await assert.rejects(client.invoke(callAs(first, [READ], { actor_id: "someone-else" }), probe.peek, {}), { code: "host.plugin_caller_mismatch" }, "another person");
  await assert.rejects(client.invoke(callAs(first, [READ], { plugin_install_id: second.install_id }), probe.peek, {}), { code: "host.plugin_caller_mismatch" }, "another installation");
  await assert.rejects(client.invoke(callAs(second, [READ], { plugin_install_id: first.install_id }), probe.peek, {}), { code: "host.plugin_caller_mismatch" }, "the other way round");
  await assert.rejects(host.actionClient(elsewhere.reference).invoke(callAs(first, [READ], { project_id: elsewhere.project_id }), probe.peek, {}),
    { code: "host.plugin_caller_mismatch" }, "a project the Home caller was not issued for");
  assert.equal(probe.state.callers.length, reached, "no refused call reached the provider");
});

test("PG110-02 S-15 a project session's caller is refused in another project, even naming that project's installation", async t => {
  const reader = consumer("callerproject", "project", "required");
  const { host, open } = await projectSetup(t, [reader]);
  const one = await open("One"), two = await open("Two");
  const first = await issuedCaller(one.probe, reader, one.project_id), second = await issuedCaller(two.probe, reader, two.project_id);
  assert.equal(first.project_id, one.project_id);
  assert.equal(second.project_id, two.project_id);
  const reached = two.probe.state.callers.length, client = host.actionClient(two.reference);
  await assert.rejects(client.invoke(callAs(first, [READ], { project_id: two.project_id }), two.probe.peek, {}), { code: "host.plugin_caller_mismatch" }, "project one's caller");
  await assert.rejects(client.invoke(callAs(first, [READ], { project_id: two.project_id, plugin_install_id: second.install_id }), two.probe.peek, {}),
    { code: "host.plugin_caller_mismatch" }, "project one's caller naming project two's installation");
  assert.equal(two.probe.state.callers.length, reached, "no refused call reached the provider");
  assert.equal(await client.invoke(callAs(second, [READ]), two.probe.peek, {}), null, "project two's own caller passes");
});

test("PG110-03 PG110-04 PG110-05 S-15 a plugin reaches an action only with a permission it both declares and was granted", async t => {
  const undeclared = consumer("callerundeclared", "home", "undeclared"), optional = consumer("calleroptional", "home", "optional");
  const granted = consumer("callergranted", "home", "required");
  const { host, probe } = await homeSetup(t, [undeclared, optional, granted]);
  assert.equal(host.homePlugins!.installation(optional.id)!.grants.includes(WRITE), false, "an optional permission is not granted by declaring it");
  const client = host.homeActionClient(), claimed = [READ, WRITE];
  for (const [label, plugin] of [["PG110-03 undeclared", undeclared], ["PG110-04 declared, not granted", optional]] as const) {
    const issued = await issuedCaller(probe, plugin);
    await assert.rejects(client.invoke(callAs(issued, claimed), probe.note, { text: label }), { code: "actions.plugin_permission" }, label);
    // A Home plugin's SDK checks its installation's current grants before its own: what it lacks is refused there, before the gateway.
    await assert.rejects(plugin.actions().invoke(probe.note, { text: label }), { code: "actions.forbidden" }, `${label}, through the SDK`);
  }
  assert.equal(probe.state.stored, null, "no refused call wrote");
  const issued = await issuedCaller(probe, granted);
  assert.equal(await client.invoke(callAs(issued, claimed), probe.note, { text: "direct" }), "stored", "PG110-05 declared and granted");
  assert.equal(probe.state.stored, "direct");
  assert.equal(await granted.actions().invoke(probe.note, { text: "through the SDK" }), "stored", "PG110-05 through the SDK");
  assert.equal(probe.state.stored, "through the SDK");
  assert.deepEqual(probe.state.refusals, []);
});

test("PG110-06 S-15 disabling a Home plugin withdraws its caller; enabling it again issues a new one", async t => {
  const reader = consumer("callerdisabled", "home", "required");
  const { host, probe, platform, request } = await homeSetup(t, [reader]);
  const old = await issuedCaller(probe, reader);
  const disabled = await request(`/api/plugins/${reader.id}/disable`, { method: "POST", body: {} });
  assert.equal(disabled.status, 200, await disabled.clone().text());
  await assert.rejects(host.homeActionClient().invoke(callAs(old, [READ]), probe.peek, {}), { code: "host.plugin_caller_invalid" });
  await platform.supervisor.enable(reader.id);
  const fresh = await issuedCaller(probe, reader);
  assert.notEqual(fresh, old);
  await assert.rejects(host.homeActionClient().invoke(callAs(old, [READ]), probe.peek, {}), { code: "host.plugin_caller_invalid" }, "the old caller stays withdrawn");
});

test("PG110-06 S-15 withdrawing a grant withdraws the caller that held it; the next session holds only what is granted", async t => {
  const writer = consumer("callerregranted", "home", "optional");
  const { host, probe, platform } = await homeSetup(t, [writer]);
  const install = () => host.homePlugins!.installation(writer.id)!.install_id;
  await platform.runtime.stop(install());
  platform.runtime.grant(install(), ["storage:private", READ, WRITE]);
  await platform.supervisor.restart(writer.id);
  const old = await issuedCaller(probe, writer);
  assert.equal(await host.homeActionClient().invoke(callAs(old, [READ, WRITE]), probe.note, { text: "granted" }), "stored");
  await platform.runtime.stop(install());
  platform.runtime.grant(install(), ["storage:private", READ]);
  await platform.supervisor.restart(writer.id);
  await assert.rejects(host.homeActionClient().invoke(callAs(old, [READ, WRITE]), probe.note, { text: "old grant" }), { code: "host.plugin_caller_invalid" });
  const fresh = await issuedCaller(probe, writer);
  await assert.rejects(host.homeActionClient().invoke(callAs(fresh, [READ, WRITE]), probe.note, { text: "new session" }), { code: "actions.plugin_permission" });
  assert.equal(probe.state.stored, "granted");
});

test("PG110-06 S-15 uninstalling a Home plugin withdraws its caller", async t => {
  const reader = consumer("calleruninstalled", "home", "required");
  const { host, probe, platform } = await homeSetup(t, [reader]);
  const old = await issuedCaller(probe, reader);
  await platform.runtime.uninstall(old.install_id, { retain_private_data: true });
  await assert.rejects(host.homeActionClient().invoke(callAs(old, [READ]), probe.peek, {}), { code: "host.plugin_caller_invalid" });
});

test("PG110-06 S-15 a caller from before a Host restart is refused by the restarted Host", async t => {
  const reader = consumer("callerrestarted", "home", "required");
  const { host, home, probe } = await homeSetup(t, [reader]);
  const old = await issuedCaller(probe, reader);
  await host.close();
  const reopened = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { home: [reader.definition] } });
  try {
    const again = registerProbe(reopened.actionRegistry(), "home");
    await reopened.homePlugins!.ready();
    await assert.rejects(reopened.homeActionClient().invoke(callAs(old, [READ]), again.peek, {}), { code: "host.plugin_caller_invalid" });
    const fresh = await issuedCaller(again, reader);
    assert.equal(fresh.install_id, old.install_id, "the same installation");
    assert.notEqual(fresh, old);
  } finally { await reopened.close(); }
});

test("PG110-06 S-15 closing a project withdraws its plugin sessions' callers", async t => {
  const reader = consumer("callerclosed", "project", "required");
  const { host, open } = await projectSetup(t, [reader]);
  const one = await open("Closing");
  const old = await issuedCaller(one.probe, reader, one.project_id);
  assert.equal(await host.closeProject(one.reference), true);
  await assert.rejects(host.actionClient(one.reference).invoke(callAs(old, [READ]), one.probe.peek, {}), { code: "host.plugin_caller_invalid" });
});

test("PG110-07 S-15 S-35 a call whose plugin loses its grant while the call runs writes nothing", async t => {
  const writer = consumer("callerinflight", "home", "required");
  const { host, probe, platform } = await homeSetup(t, [writer]);
  const install = host.homePlugins!.installation(writer.id)!.install_id, reached = deferred(), release = deferred();
  probe.state.hold = { reached: reached.resolve, release: release.promise };
  const pending = writer.actions().invoke(probe.note, { text: "late" });
  const refused = assert.rejects(pending);
  try {
    await Promise.race([reached.promise, pending]);
    await platform.runtime.stop(install);
    platform.runtime.grant(install, ["storage:private", READ]);
  } finally { release.resolve(); }
  await refused;
  assert.equal(probe.state.refusals.length, 1, "the write was refused at its last check");
  assert.equal(probe.state.stored, null, "the revoked call wrote no business record");
});

test("PG110-08 S-15 the artifacts SDK runs only under its own session's live caller", async t => {
  const reader = consumer("callerartifacts", "project", "required", ["artifact:read"]);
  const { host, open } = await projectSetup(t, [reader]);
  const one = await open("Withdrawn"), two = await open("Borrowing");
  assert.deepEqual(reader.context(two.project_id).services!.artifacts!.listConsumable(), [], "a session's own client runs under its own caller");
  const live = await issuedCaller(two.probe, reader, two.project_id), withdrawn = await issuedCaller(one.probe, reader, one.project_id);
  assert.equal(await host.closeProject(one.reference), true);
  const modules = await host.withProject(two.reference, runtime => {
    const store = { db: runtime.store.db, appendEvent: (event: Parameters<typeof runtime.store.appendEvent>[0]) => runtime.store.appendEvent(event),
      eventCursor: (projectId: string) => runtime.store.eventCursor(projectId) };
    return { api: new ArtifactsModule(store), process: new ProcessItemsModule(store) };
  });
  const manifest = reader.definition.manifest;
  const borrowing = (caller: HostPluginCaller, installId: string) => {
    const context: PluginStartContext = { install_id: installId, provider_id: installId, plugin_id: manifest.plugin_id, version: manifest.version,
      deployment: "local", grants: ["storage:private", READ, "artifact:read"], requireGrant: () => {} };
    return createPluginArtifactClient({ assertInput: assertActionInput, ...modules, manifest, context, plugin_caller: caller, project_id: two.project_id, actor_id: caller.actor_id,
      actions: { registry: host.actionRegistry(two.reference), client: host.syncActionClient(two.reference), project_id: two.project_id } });
  };
  for (const [label, caller, code] of [["another session's live caller", live, "host.plugin_caller_mismatch"], ["a withdrawn caller", withdrawn, "host.plugin_caller_invalid"]] as const) {
    const borrowed = borrowing(caller, `borrowed-${code}`);
    try { assert.throws(() => borrowed.client.listConsumable(), { code }, label); }
    finally { borrowed.dispose(); }
  }
});
