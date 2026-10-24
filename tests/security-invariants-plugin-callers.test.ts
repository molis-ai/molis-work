import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { ActionError, type ActionCallContext, type ActionDefinition, type ActionSceneBinding, type ActionSceneDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { createPluginArtifactClient } from "@molis-ai/molis-work-plugin-artifacts";
import { assertPluginActionCurrent } from "@molis-ai/molis-work-plugin-runtime";
import { deferred, person, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { CALLERS_READ as READ, CALLERS_WRITE as WRITE, callAs, callerPlugin, issuedCaller, probeActions, registerProbe, startProjectPlugins, type CallerPlugin, type CallerScope } from "./fixtures/plugin-callers.js";
import { openTestHome } from "./fixtures/test-home.js";

/*
 * S-15 / PG-110: the action gateway accepts a plugin's call only with a caller the Host issued to that session and has not withdrawn,
 * for the call's own person, project and installation, and only for what the plugin both declares and holds. Each refusal below is
 * asserted by its code, and the provider never runs for it.
 */

/** A probe consumer. `write` is how its Manifest lists the write permission; a fixture is granted only what it requires. */
const consumer = (name: string, scope: CallerScope, write: "required" | "optional" | "undeclared", extra: readonly string[] = []) =>
  callerPlugin(name, scope, { ...Object.fromEntries(extra.map(id => [id, true])), ...(write === "undeclared" ? {} : { [WRITE]: write === "required" }) });

/**
 * A Home consumer with an action of its own, `relay`, offered to people: its handler records through the probe's note with its SDK
 * and passes no control, so the consumed action learns of the person's call only through the Host. `nested` holds each such call.
 */
function relaying(name: string) {
  const base = consumer(name, "home", "required"), { note } = probeActions("home"), nested: Promise<unknown>[] = [];
  const relay: ActionDefinition<{ text: string }, string> = { capability_id: `${base.id}.relay`, version: 1, operation: "command",
    action: { title: "转记", description: "经探针记下一段内容", kind: "operation", scope: "home", scheduling: "concurrent", audiences: ["user"], permissions: [READ], subject_kinds: [],
      input_schema: { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } }, output_schema: { type: "string" } } };
  const definition: PluginDefinition = { manifest: { ...base.definition.manifest, actions: [relay] }, async start(context) {
    await base.definition.start(context);
    return { kind: "app", views: [], actions: [{ ...relay, handle: (_caller, input) => {
      const call = context.services!.actions!.invoke(note, input as { text: string });
      nested.push(call.catch(() => undefined));
      return call;
    } }] };
  } };
  return { ...base, definition, relay, nested };
}

/**
 * A Home plugin whose action `relay`, offered to people, calls `keep`, an action of its own, with its SDK and passes no control, so
 * `keep` learns of the person's call only through the Host. `keep` waits at `state.hold` between its two checks, then records the text;
 * a refusal at its last check is kept in `state.refusals`. `nested` holds each such call.
 */
function selfRelaying(name: string) {
  const base = consumer(name, "home", "required"), nested: Promise<unknown>[] = [];
  const state = { stored: null as string | null, refusals: [] as unknown[], hold: undefined as { reached(): void; release: Promise<void> } | undefined };
  const own = (verb: string, title: string, permission: string): ActionDefinition<{ text: string }, string> => ({ capability_id: `${base.id}.${verb}`, version: 1, operation: "command",
    action: { title, description: title + "一段内容", kind: "operation", scope: "home", scheduling: "concurrent", audiences: ["user"], permissions: [permission], subject_kinds: [],
      input_schema: { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } }, output_schema: { type: "string" } } });
  const relay = own("relay", "转存", READ), keep = own("keep", "存下", WRITE);
  const definition: PluginDefinition = { manifest: { ...base.definition.manifest, actions: [relay, keep] }, async start(context) {
    await base.definition.start(context);
    return { kind: "app", views: [], actions: [
      { ...relay, handle: (_caller, input) => {
        const call = context.services!.actions!.invoke(keep, input as { text: string });
        nested.push(call.catch(() => undefined));
        return call;
      } },
      { ...keep, async handle(caller, input) {
        await caller.beforeEffect();
        if (state.hold) { state.hold.reached(); await state.hold.release; }
        try { await caller.beforeEffect(); } catch (error) { state.refusals.push(error); throw error; }
        state.stored = (input as { text: string }).text;
        return "stored";
      } },
    ] };
  } };
  return { ...base, definition, relay, keep, nested, state };
}

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
    const context: PluginStartContext = { install_id: installId, installation_generation: "1", provider_id: installId, plugin_id: manifest.plugin_id, version: manifest.version,
      deployment: "local", grants: ["storage:private", READ, "artifact:read"], requireGrant: () => {} };
    return createPluginArtifactClient({ assertInput: assertActionInput, ...modules, manifest, context, plugin_caller: caller, project_id: two.project_id, actor_id: caller.actor_id, assertCallerCurrent: () => assertPluginActionCurrent(context.install_id),
      actions: { registry: host.actionRegistry(two.reference), client: host.syncActionClient(two.reference), project_id: two.project_id } });
  };
  for (const [label, caller, code] of [["another session's live caller", live, "host.plugin_caller_mismatch"], ["a withdrawn caller", withdrawn, "host.plugin_caller_invalid"]] as const) {
    const borrowed = borrowing(caller, `borrowed-${code}`);
    try { assert.throws(() => borrowed.client.listConsumable(), { code }, label); }
    finally { borrowed.dispose(); }
  }
});

test("PG110-11 S-15 S-18 a plugin's call to an action it consumes answers to the original caller of the action it runs in: revoked or cancelled while that action waits, nothing is written", async t => {
  const plugin = relaying("callerrelay");
  const { host, probe } = await homeSetup(t, [plugin]);
  const client = host.homeActionClient();
  for (const failure of ["revoke", "cancel"] as const) {
    const abort = new AbortController(), reached = deferred(), release = deferred(), refusals = probe.state.refusals.length;
    let revoked = false;
    const caller: ActionCallContext = { ...person([READ]), signal: abort.signal,
      assert_authority_current: () => { if (revoked) throw new ActionError("actions.forbidden", "the person's call was revoked"); } };
    probe.state.hold = { reached: reached.resolve, release: release.promise };
    const pending = client.invoke(caller, plugin.relay, { text: failure }).then(() => "stored", (error: unknown) => error);
    try {
      await Promise.race([reached.promise, pending]);
      probe.state.hold = undefined;
      if (failure === "revoke") revoked = true; else abort.abort();
    } finally { release.resolve(); }
    const outcome = await pending;
    await plugin.nested.at(-1);
    assert.equal(probe.state.refusals.length, refusals + 1, `${failure}: the consumed action's write was refused at its last check`);
    const refusal = probe.state.refusals.at(-1) as { code?: string; name?: string };
    if (failure === "revoke") {
      assert.equal(refusal.code, "actions.forbidden", "revoke: the person's own check refused it");
      assert.equal((outcome as { code?: string }).code, "actions.forbidden", "revoke: and the person's call failed with it");
    } else {
      assert.equal(refusal.name, "AbortError", "cancel: the person's cancelled call refused it");
      assert.notEqual(outcome, "stored", "cancel: the person's call did not succeed");
    }
    assert.equal(probe.state.stored, null, `${failure}: nothing was written`);
  }
  assert.equal(await client.invoke(person([READ]), plugin.relay, { text: "current" }), "stored", "a current caller's call writes through the same path");
  assert.equal(probe.state.stored, "current");
});

test("PG110-12 S-15 an issued caller speaks only for a plugin-audience call: a person's, an Agent's or a workflow's call carrying it is refused", async t => {
  const reader = consumer("calleraudience", "home", "required");
  const { host, probe } = await homeSetup(t, [reader]);
  const issued = await issuedCaller(probe, reader), client = host.homeActionClient(), reached = probe.state.callers.length;
  for (const audience of ["user", "agent", "workflow"] as const) {
    await assert.rejects(client.invoke(callAs(issued, [READ], { audience }), probe.peek, {}), { code: "host.plugin_caller_mismatch" }, audience);
  }
  await assert.rejects(client.discover(callAs(issued, [READ], { audience: "user" })), { code: "host.plugin_caller_mismatch" }, "discovery too");
  assert.equal(probe.state.callers.length, reached, "no refused call reached the provider");
  assert.equal(await client.invoke(callAs(issued, [READ]), probe.peek, {}), null, "the same caller on a plugin call passes");
});

test("PG110-13 S-15 S-35 a caller captured while its call waits is refused once its session stops: presented directly, and by the waiting call's own write", async t => {
  const writer = consumer("callerstopped", "home", "required");
  const { host, probe, platform } = await homeSetup(t, [writer]);
  const install = host.homePlugins!.installation(writer.id)!.install_id, reached = deferred(), release = deferred();
  probe.state.hold = { reached: reached.resolve, release: release.promise };
  const pending = writer.actions().invoke(probe.note, { text: "held" });
  const refused = assert.rejects(pending);
  try {
    await Promise.race([reached.promise, pending]);
    probe.state.hold = undefined;
    const captured = probe.state.callers.at(-1)!;
    assert.equal(captured.install_id, install);
    await platform.runtime.stop(install);
    await assert.rejects(host.homeActionClient().invoke(callAs(captured, [READ, WRITE]), probe.note, { text: "presented" }), { code: "host.plugin_caller_invalid" },
      "the captured caller, presented to the gateway after its session stopped");
  } finally { release.resolve(); }
  await refused;
  assert.equal(probe.state.refusals.length, 1, "the waiting call's write was refused at its last check");
  assert.equal(probe.state.stored, null, "neither the presented call nor the waiting one wrote");
});

test("PG110-16 S-15 S-18 a plugin's call to an action of its own answers to the original caller of the action it runs in: revoked or cancelled while that action waits, nothing is written", async t => {
  const plugin = selfRelaying("callerself"), state = plugin.state;
  const { host } = await homeSetup(t, [plugin]);
  const client = host.homeActionClient();
  for (const failure of ["revoke", "cancel"] as const) {
    const abort = new AbortController(), reached = deferred(), release = deferred(), refusals = state.refusals.length;
    let revoked = false;
    const caller: ActionCallContext = { ...person([READ]), signal: abort.signal,
      assert_authority_current: () => { if (revoked) throw new ActionError("actions.forbidden", "the person's call was revoked"); } };
    state.hold = { reached: reached.resolve, release: release.promise };
    const pending = client.invoke(caller, plugin.relay, { text: failure }).then(() => "stored", (error: unknown) => error);
    try {
      await Promise.race([reached.promise, pending]);
      state.hold = undefined;
      if (failure === "revoke") revoked = true; else abort.abort();
    } finally { release.resolve(); }
    const outcome = await pending;
    await plugin.nested.at(-1);
    assert.equal(state.refusals.length, refusals + 1, `${failure}: the plugin's own action was refused at its last check`);
    const refusal = state.refusals.at(-1) as { code?: string; name?: string };
    if (failure === "revoke") {
      assert.equal(refusal.code, "actions.forbidden", "revoke: the person's own check refused it");
      assert.equal((outcome as { code?: string }).code, "actions.forbidden", "revoke: and the person's call failed with it");
    } else {
      assert.equal(refusal.name, "AbortError", "cancel: the person's cancelled call refused it");
      assert.notEqual(outcome, "stored", "cancel: the person's call did not succeed");
    }
    assert.equal(state.stored, null, `${failure}: nothing was written`);
  }
  // The control: the same path with a current caller writes.
  assert.equal(await client.invoke(person([READ]), plugin.relay, { text: "current" }), "stored", "a current caller's call writes through the same path");
  assert.equal(state.stored, "current");
});


test("PG110-17 S-15 plugin callbacks cannot acquire an upstream Host-issued caller, and their own SDK still works", async t => {
  const receiver = consumer("callerreceiver", "home", "required"), { peek } = probeActions("home"), seen = new Set<string>();
  const accept: ActionDefinition<Record<string, never>, string | null> = { ...peek, capability_id: `${receiver.id}.accept`, operation: "command",
    action: { ...peek.action, title: "接受调用", kind: "operation", scheduling: "concurrent" } };
  const sender = callerPlugin("callersender", "home", { [WRITE]: true }, [accept.capability_id]);
  const scene: ActionSceneDefinition = { scene_id: `${receiver.id}.scene`, version: 1, title: "身份场景", description: "检查各回调的身份视图", trigger: "manual",
    scope: "home", subject_kinds: [], input_schema: { type: "object" }, result_schema: { type: "boolean" }, event_schema: { type: "object" },
    permissions: [READ], configuration_permissions: [READ] };
  const judge: ActionDefinition = { capability_id: "callers.identity.judge", version: 1, operation: "command", action: { ...peek.action,
    title: "身份判断", kind: "judgment", input_schema: scene.input_schema, output_schema: scene.result_schema } };
  const binding: ActionSceneBinding = { binding_id: "identity", scene_id: scene.scene_id, scene_version: 1, project_id: null,
    function: { capability_id: judge.capability_id, version: 1, provider_id: "identity-judgment" }, enabled: true, title: "Identity", revision: "1" };
  const runtimeMemory: NonNullable<ActionCallContext["runtime_memory"]> = { plugin_id: sender.id, current_scene: "common",
    class_restrictions: { policy_version: 2, taxonomy_version: 1, personal: [],
      project: [{ selector: { consumer: "agent", current_scene: "common", kind: "convention" }, read: "off", form: "off" }] } };
  const originalPolicy = structuredClone(runtimeMemory), protectedCallbacks = new Set<string>();
  const runtimeMemoryRead: NonNullable<ActionCallContext["runtime_memory_read"]> = {
    read: async () => { throw new Error("The Host control is not a plugin callback API"); },
  };
  let forgedReads = 0;
  const forgedRead: typeof runtimeMemoryRead = { read: async () => { forgedReads++; throw new Error("Forged control executed"); } };
  let checkingPolicy = false, judgments = 0;
  const check = (name: string, caller: ActionCallContext) => {
    assert.equal(Object.hasOwn(caller, "host_plugin"), false, `${name}: no issued identity property reaches plugin code`);
    assert.equal(caller.host_plugin, undefined, `${name}: the upstream identity is unavailable`);
    assert.equal(Object.hasOwn(caller, "runtime_memory"), false, `${name}: no Host Run policy property reaches plugin code`);
    assert.equal(caller.runtime_memory, undefined, `${name}: the original policy is unavailable`);
    assert.equal(Object.hasOwn(caller, "runtime_memory_read"), false, `${name}: no live Run control reaches plugin code`);
    assert.equal(caller.runtime_memory_read, undefined, `${name}: the live capability is unavailable`);
    Reflect.set(caller, "runtime_memory_read", forgedRead);
    // A plugin can edit its callback view, including adding a lookalike field, but cannot alter the Host's policy.
    const replacement = structuredClone(runtimeMemory);
    replacement.class_restrictions.project[0]!.read = "inherit";
    Reflect.set(caller, "runtime_memory", replacement);
    assert.deepEqual(runtimeMemory, originalPolicy, `${name}: editing the plugin view cannot change the original restriction`);
    if (checkingPolicy) protectedCallbacks.add(name);
    seen.add(name);
  };
  let fail = false;
  const base = receiver.definition;
  receiver.definition = { ...base, manifest: { ...base.manifest, actions: [accept], action_scenes: [scene] }, async start(context) {
    await base.start(context);
    return { kind: "app", actions: [{ ...accept,
      availability: caller => { check("action availability", caller); return { available: true }; },
      async handle(caller) {
        check("action", caller); await caller.beforeEffect();
        context.services!.storage!.set("accepted", "yes");
        return context.services!.actions!.invoke(peek, {});
      },
    }], action_scenes: [{ ...scene,
      bindings: caller => { check("bindings", caller); return [binding]; },
      targets: caller => { check("targets", caller); return [{ binding_id: binding.binding_id, title: binding.title, revision: "1" }]; },
      prepare: (caller, event) => { check("prepare", caller); return { input: event }; },
      availability: caller => { check("scene availability", caller); return { available: true }; },
      configuration_availability: caller => { check("configuration availability", caller); return { available: true }; },
      bind: async caller => { check("bind", caller); await caller.beforeEffect(); context.services!.storage!.set("bound", "yes"); },
      consume: async caller => { check("consume", caller); await caller.beforeEffect(); return context.services!.actions!.invoke(peek, {}); },
      failed: async (caller, _input, error) => { check("failed", caller); assert.match(String(error), /identity judgment failed/u); await caller.beforeEffect(); },
    }] };
  } };
  const { host, probe } = await homeSetup(t, [sender, receiver]);
  const original = await issuedCaller(probe, sender);
  host.actionRegistry().registerProvider({ provider: { provider_id: "identity-judgment", title: "Identity judgment", kind: "system" },
    definitions: [judge], handlers: [{ ...judge, handle: caller => {
      assert.equal(caller.host_plugin, original, "the Host retains the real upstream identity for authorization");
      assert.equal(caller.runtime_memory, runtimeMemory, "the Host judgment retains the same original Run snapshot object");
      assert.equal(caller.runtime_memory_read, runtimeMemoryRead, "callback lookalikes cannot replace the Host's original control");
      assert.deepEqual(caller.runtime_memory, originalPolicy, "plugin callbacks cannot relax the Host judgment's policy");
      judgments++;
      if (fail) throw new Error("identity judgment failed");
      return true;
    } }] });
  assert.equal(await sender.actions().invoke(accept, {}), null, "A reaches B, and B reaches its declared Host query");
  assert.equal(receiver.context().services!.storage!.get("accepted"), "yes");
  assert.equal(probe.state.callers.at(-1)!.plugin_id, receiver.id, "B's SDK uses B's own issued identity");
  const caller = callAs(original, [READ], { runtime_memory: runtimeMemory, runtime_memory_read: runtimeMemoryRead }), scenes = host.sceneClient();
  checkingPolicy = true;
  assert.equal(await host.homeActionClient().invoke(caller, accept, {}), null, "the Host-bound caller traverses the actual plugin action boundary");
  assert.equal(caller.runtime_memory, runtimeMemory, "the plugin action cannot replace the original Host binding");
  const offered = (await scenes.discoverScenes(caller)).find(value => value.definition.scene_id === scene.scene_id)!;
  await scenes.targets(caller, undefined, { scene_id: scene.scene_id, scene_version: 1, provider_id: offered.provider.provider_id });
  await scenes.bind(caller, binding, { provider_id: offered.provider.provider_id, expected_revision: "1" });
  assert.equal(receiver.context().services!.storage!.get("bound"), "yes");
  await scenes.runScene(caller, scene, binding.binding_id, {});
  assert.equal(probe.state.callers.at(-1)!.plugin_id, receiver.id, "the scene's own SDK also uses B's identity");
  fail = true;
  assert.equal(await scenes.runScene(caller, scene, binding.binding_id, {}), undefined, "the failed consumer handles the judgment error");
  assert.deepEqual([...seen].sort(), ["action", "action availability", "bindings", "targets", "prepare", "scene availability",
    "configuration availability", "bind", "consume", "failed"].sort());
  assert.deepEqual([...protectedCallbacks].sort(), [...seen].sort(), "every callback was exercised with the Host policy present upstream");
  assert.equal(judgments, 2, "both successful and failed Host judgments retained their original policy");
  assert.deepEqual(caller.runtime_memory, originalPolicy);
  assert.equal(caller.runtime_memory_read, runtimeMemoryRead);
  assert.equal(forgedReads, 0, "no callback-created control ran through an action or scene");
});
