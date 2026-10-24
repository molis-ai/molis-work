import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { PluginRuntime, SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { CODING_PLUGIN_ID, CODING_UI_CONTRIBUTION_ID, codingManifest, type CodingUiHostModel } from "@molis-ai/molis-work-plugin-coding";
import { DEMO_PROJECT_ID, LocalProjectDatabase, PluginHostExecutor, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { characterPluginActions } from "@molis-ai/molis-work-contracts/modules/characters";
import { charactersActions } from "@molis-ai/molis-work-module-characters";
import { goalPluginActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";
import { ActionError, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineInstructionPrompt, instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { PluginDefinition, PluginManifest, PluginModelClient, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingSdkRuntime } from "./fixtures/coding-sdk-runtime.js";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";
import { fakeGoalDirectory } from "./fixtures/plugin-actions.js";
import { deferred } from "./fixtures/home-runtime.js";

// Coding reads what it used to be handed by the Host through the platform instead (W5-01 C2; specs/coding-plugin §4 H): the models
// from `services.model` (PG-047, V-13), the Goal titles from Goals' public read action (PG-091), the Characters from Characters' two
// public actions `characters.list` and the plugin-only `characters.runnable` (PG-086), each declared in its Manifest and checked by the
// platform's grant. The person's `characters.execution` (the local program and folders) stays out of a plugin's reach. There is no
// `ready` port to wait for.

/** What the page's own routes answer (`/state`, `/sessions/:id/characters`), as far as these tests read it. */
type Reply = { status: number; body: { models: Array<{ provider_id: string; model_id: string; label: string }>; sessions: Array<{ session_id: string; goal_title: string | null }>;
  characters: Array<{ reference: { artifact_id: string }; available: boolean; reason?: string }> } };
const callOf = (call: (path: string) => Promise<unknown>) => async (path: string) => await call(path) as Reply;
const pick = ({ provider_id, model_id, label }: { provider_id: string; model_id: string; label: string }) => ({ provider_id, model_id, label });
const at = "2026-10-21T00:00:00Z";

/** A plugin that only lists the models, to see the list any other plugin is given. */
function modelReader() {
  let client: PluginModelClient | undefined;
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.modelreader", version: "1.0.0", name: "modelreader", kind: "app",
    publisher: { publisher_id: "example", signature: "example-modelreader" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: "model:read", required: true, reason: "Lists the models" }], capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [], routes: [] };
  const definition: PluginDefinition = { manifest, async start(context) { client = context.services?.model; return { kind: "app", views: [], actions: [], routes: [] }; } };
  return { definition, model: () => client ?? assert.fail("the plugin was given no services.model") };
}

type DirectoryView = { descriptor: { contribution_id: string }; render(request: { surface: string; model: CodingUiHostModel }): string };
/** The session directory Coding draws at once, as the Host asks for it (apps/local-host coding-surface.ts). */
function directoryHtml(platform: { supervisor: { contribution(pluginId: string): unknown } }): string {
  const views = (platform.supervisor.contribution(CODING_PLUGIN_ID) as { views?: DirectoryView[] } | null)?.views ?? [];
  const view = views.find(entry => entry.descriptor.contribution_id === CODING_UI_CONTRIBUTION_ID) ?? assert.fail("Coding registers its page");
  return view.render({ surface: "directory", model: { route_prefix: "", face: "sessions", filter: "all", tools: [], workspace_path: null, companion_directory: "", companion_result: "",
    primitives: { escape: value => String(value), icon: () => "", text: value => value, formatDate: value => value.slice(0, 10) } } });
}
const until = async (done: () => boolean, ms = 5_000) => { for (const end = Date.now() + ms; !done() && Date.now() < end;) await new Promise(resolve => setTimeout(resolve, 50)); assert.ok(done(), "the awaited step happened"); };
const registration = (service: Pick<ActionService, "registerProvider" | "invoke" | "discover">) => ({ registry: service, client: service, project_id: DEMO_PROJECT_ID });

test("W5-01-CODING-23 PG035-07 Coding declares model:read, model:invoke only as optional for its two explicit drafts, and lists the draft, Goals and Characters actions it reads through under consumes", () => {
  const modelPermissions = codingManifest.permissions.filter(declared => declared.permission.startsWith("model:"));
  assert.deepEqual(modelPermissions.map(({ permission, required }) => ({ permission, required })), [{ permission: "model:read", required: true }, { permission: "model:invoke", required: false }]);
  // model:invoke is for the platform's draft action alone (the commit message, the digest of earlier rounds); no action of Coding's
  // asks the model for text itself: a call to complete() needs an own action that declares model:invoke.
  for (const action of codingManifest.actions) assert.equal(action.action.permissions.includes("model:invoke"), false, `${action.capability_id} does not declare model:invoke`);
  const consumed = codingManifest.capabilities.consumes;
  assert.ok(consumed.includes(agent.draftText.capability_id), "Coding lists the draft action under consumes");
  for (const definition of [goalPluginActions.list, goalPluginActions.contract, characterPluginActions.list, characterPluginActions.runnable]) {
    assert.ok(consumed.includes(definition.capability_id), `Coding lists ${definition.capability_id} under consumes`);
  }
  assert.equal(consumed.includes(charactersActions.execution.capability_id), false, "Coding does not ask for how a Character is launched");
  assert.deepEqual(charactersActions.runnable.action.audiences, ["plugin"], "the runnable answer is for plugins only");
  assert.deepEqual(charactersActions.execution.action.audiences, ["user"], "the local program and folders stay the person's");
});

test("W5-01-CODING-24 Coding reads the model list and each model's availability from services.model with model:read only; complete() is not available to it", { timeout: 60_000 }, async t => {
  let model: PluginModelClient | undefined;
  const s = await codingSdkRuntime(t, { wrapCoding: definition => ({ ...definition, async start(context: PluginStartContext) { model = context.services?.model; return definition.start(context); } }) });
  const installed = s.platform.runtime.list().find(record => record.plugin_id === CODING_PLUGIN_ID) ?? assert.fail("Coding is installed");
  assert.equal(installed.grants.includes("model:read"), true);
  assert.equal(installed.grants.includes("model:invoke"), false, "the installation was never given the right to send");
  const client = model ?? assert.fail("Coding was given services.model");
  assert.deepEqual(client.choices().map(({ provider_id, model_id }) => ({ provider_id, model_id })), [{ provider_id: "fixture", model_id: "fixture" }]);
  assert.equal(client.availability({ provider_id: "fixture", model_id: "fixture" }).available, true);
  assert.equal(client.availability({ provider_id: "fixture", model_id: "never-configured" }).available, false);
  // The page's list is that list.
  const state = await callOf(s.call)("/state");
  assert.equal(state.status, 200, JSON.stringify(state.body));
  assert.deepEqual(state.body.models.map(pick), client.choices().map(pick));
  // complete() is the one thing model:read does not give: it is refused before anything is sent, outside an action of Coding's own.
  const summarize = defineInstructionPrompt({ owner_id: CODING_PLUGIN_ID, prompt_id: "summarize", version: 1, title: "摘要", purpose: "把材料压成一句话", used_by: ["测试"], body: "把下面的材料压成一句话。" });
  await assert.rejects(client.complete(instructed(summarize, "材料")), { code: "plugin.model_action_required" });
});

test("W5-01-CODING-25 V-13 one model list only: what Coding lists is the list every other plugin with model:read is given, and a disabled model is in neither", { timeout: 60_000 }, async t => {
  const reader = modelReader();
  const s = await codingSdkRuntime(t, { extraPlugins: [{ definition: reader.definition, grants: ["model:read"] }] });
  await seedConfiguredModels(s.home, [{ provider_id: "second", model_id: "on" }, { provider_id: "second", model_id: "off", enabled: false }]);
  const listed = (await callOf(s.call)("/state")).body.models as Array<{ provider_id: string; model_id: string; label: string }>;
  const given = reader.model().choices();
  assert.deepEqual(listed.map(pick), given.map(pick), "the same list, in the same order");
  assert.deepEqual(listed.map(entry => `${entry.provider_id}/${entry.model_id}`), ["fixture/fixture", "second/on"], "the disabled model is dropped from the one list");
});

test("W5-01-CODING-26 SYS-15-Q1 SYS-15-Q2 a Goal title is read without persistence, saved by observation and survives a restart with Goals gone", { timeout: 60_000 }, async t => {
  const release = deferred(); t.after(() => release.resolve());
  let services: PluginStartContext["services"];
  const s = await codingSdkRuntime(t, { wrapCoding: definition => ({ ...definition, async start(context) {
    services = context.services;
    const background = context.services!.background!;
    return definition.start({ ...context, services: { ...context.services, background: { ...background,
      keep: (id, work) => background.keep(id, async control => { await release.promise; return work(control); }),
    } } });
  } }) }), titles: Record<string, string> = { g1: "让首次使用不再卡住" }, seen: ActionCallContext[] = [];
  fakeGoalDirectory(registration(s.service), () => titles, 100, seen);
  await s.sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "with-goal", title: "带目标的会话", runtime_id: "prologue", goal_id: "g1", at });
  // The directory is drawn at once and cannot wait for an action: before any read it shows the Goal's id.
  assert.doesNotMatch(directoryHtml(s.platform), /让首次使用不再卡住/);
  assert.match(directoryHtml(s.platform), /g1/);
  // The page asks coding.state as it opens; that reads the title from Goals as the plugin audience, with Coding's own grants.
  const state = await callOf(s.call)("/state");
  assert.equal(state.status, 200, JSON.stringify(state.body));
  assert.equal(state.body.sessions.find(session => session.session_id === "with-goal")?.goal_title, "让首次使用不再卡住");
  assert.ok(seen.length >= 1 && seen.every(caller => caller.audience === "plugin" && caller.host_plugin?.plugin_id === CODING_PLUGIN_ID), "Goals answered Coding as a plugin");
  assert.match(directoryHtml(s.platform), /让首次使用不再卡住/);
  assert.equal(services!.storage!.get("goal-title:g1"), null, "the query changes no persistent title while observation is held");
  release.resolve();
  await until(() => services!.storage!.get("goal-title:g1") === titles.g1, 10_000);
  // Goals can no longer be read: the title stays what it was, in this process and, kept in Coding's private storage, after a restart.
  delete titles.g1;
  assert.equal((await callOf(s.call)("/state")).body.sessions.find(session => session.session_id === "with-goal")?.goal_title, "让首次使用不再卡住");
  await s.platform.supervisor.restart(CODING_PLUGIN_ID);
  assert.match(directoryHtml(s.platform), /让首次使用不再卡住/);
});

test("W5-01-CODING-27 a Goal the directory does not list (archived or discarded) is read by its id through Goals' contract action, once", { timeout: 60_000 }, async t => {
  const s = await codingSdkRuntime(t), reads: string[] = [];
  fakeGoalDirectory(registration(s.service), () => ({}));
  // The directory answers for open Goals only; this stand-in answers the by-id read, whose full schema is Goals' own to test.
  const relaxed: ActionDefinition<{ goal_id: string }, unknown> = { ...goalPluginActions.contract, action: { ...goalPluginActions.contract.action, output_schema: { type: "object" } } };
  s.service.registerProvider({ provider: { provider_id: "goals-contract-fixture", title: "目标", kind: "system" }, definitions: [relaxed],
    handlers: [{ ...relaxed, handle: (_caller, input) => {
      const { goal_id } = input as { goal_id: string };
      reads.push(goal_id);
      if (goal_id !== "archived") throw new ActionError("goals.not_found", "没有这个目标");
      return { goal: { goal_id, title: "已归档的目标" } };
    } }] });
  await s.sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "old", title: "旧会话", runtime_id: "prologue", goal_id: "archived", at });
  await s.sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "gone", title: "无目标可读", runtime_id: "prologue", goal_id: "deleted", at });
  const sessions = (await callOf(s.call)("/state")).body.sessions as Array<{ session_id: string; goal_title: string | null }>;
  assert.equal(sessions.find(session => session.session_id === "old")?.goal_title, "已归档的目标");
  assert.equal(sessions.find(session => session.session_id === "gone")?.goal_title, null, "a Goal that cannot be read has no title; the read is not an error");
  assert.deepEqual([...reads].sort(), ["archived", "deleted"]);
  await callOf(s.call)("/state");
  assert.deepEqual(reads.filter(id => id === "archived"), ["archived"], "a title already known is not read again");
});

test("W5-01-CODING-28 Characters are read through characters.list and characters.runnable as a plugin caller; the reason a version cannot run is Characters' own", { timeout: 60_000 }, async t => {
  const s = await codingSdkRuntime(t), seen: Array<{ capability_id: string; caller: ActionCallContext }> = [];
  const publication = (artifact_id: string, title: string) => ({ artifact_id, version: 1, lifecycle_state: "active", availability: "available", payload: { title, instructions: "固定要求", host_tools: null } });
  s.service.registerProvider({ provider: { provider_id: "characters-fixture", title: "角色", kind: "system" }, definitions: [characterPluginActions.list, characterPluginActions.runnable],
    handlers: [
      { ...characterPluginActions.list, handle: caller => { seen.push({ capability_id: characterPluginActions.list.capability_id, caller }); return { drafts: [], publications: [publication("c-ok", "可用角色"), publication("c-off", "已停用角色")] }; } },
      { ...characterPluginActions.runnable, handle: (caller, input) => {
        seen.push({ capability_id: characterPluginActions.runnable.capability_id, caller });
        // A version that cannot run is an answer with Characters' reason, not a failed call.
        if ((input as { reference: { artifact_id: string } }).reference.artifact_id === "c-off") return { available: false, reason: "该角色已停用或删除" };
        return { available: true };
      } },
    ] });
  await s.create("s1");
  const reply = await callOf(s.call)("/sessions/s1/characters");
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
  const byId = new Map((reply.body.characters as Array<{ reference: { artifact_id: string }; available: boolean; reason?: string }>).map(entry => [entry.reference.artifact_id, entry]));
  assert.equal(byId.get("c-ok")?.available, true);
  assert.equal(byId.get("c-off")?.available, false);
  assert.equal(byId.get("c-off")?.reason, "该角色已停用或删除", "the reason is the one Characters gave");
  assert.deepEqual([...new Set(seen.map(entry => entry.capability_id))].sort(), ["characters.list", "characters.runnable"]);
  assert.ok(seen.every(({ caller }) => caller.audience === "plugin" && caller.host_plugin?.plugin_id === CODING_PLUGIN_ID), "both reads reached Characters as Coding, the plugin audience");
});

/**
 * A consumer plugin and the stand-in Characters it calls: the platform's checks of a plugin's consumption, with Coding's own declarations
 * and Characters' own user-only `characters.execution`.
 */
async function consumers() {
  const home = mkdtempSync(join(tmpdir(), "coding-input-ports-")), file = join(home, "board.sqlite");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), service = new ActionService(), reached: string[] = [];
  service.registerProvider({ provider: { provider_id: "characters-fixture", title: "角色", kind: "system" },
    definitions: [characterPluginActions.list, characterPluginActions.runnable, charactersActions.execution],
    handlers: [
      { ...characterPluginActions.list, handle: () => { reached.push("list"); return { drafts: [], publications: [] }; } },
      { ...characterPluginActions.runnable, handle: () => { reached.push("runnable"); return { available: true }; } },
      { ...charactersActions.execution, handle: () => { reached.push("execution"); return { executable: "/usr/local/bin/agent", workspaces: [] }; } },
    ] });
  const actions = registration(service);
  const artifacts = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event) }), processItems = new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event) });
  const privateStorage = new SqlitePluginPrivateStorage(store.db);
  const runtime = new PluginRuntime(undefined, new PluginHostExecutor({ actions, project_id: DEMO_PROJECT_ID, actor_id: "owner", artifacts, processItems,
    ui: new UiHost(), privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest) }), { actions });
  const contexts = new Map<string, PluginStartContext>();
  const plugin = (name: string, consumes: string[]): PluginDefinition => ({
    manifest: { schema_version: 2, host_api_version: 2, plugin_id: `io.molis.work.example.${name}`, version: "1.0.0", name, kind: "app",
      publisher: { publisher_id: "example", signature: `example-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: [{ permission: "artifact:read", required: false, reason: "Reads the Characters it is shown" }], capabilities: { provides: [], consumes },
      artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [], routes: [] },
    async start(context) { contexts.set(name, context); return { kind: "app", actions: [], routes: [] }; } });
  const start = async (name: string, consumes: string[], grants: string[]) => {
    const installed = runtime.install({ definition: plugin(name, consumes), deployment: "local", grants }).install;
    await runtime.start(installed.install_id);
    return installed;
  };
  const client = (name: string) => contexts.get(name)?.services?.actions ?? assert.fail(`${name} was given no action client`);
  return { runtime, reached, start, client, close: () => { store.close(); rmSync(home, { recursive: true, force: true }); } };
}
const reference = { artifact_id: "c-ok", version: 1 };

test("W5-01-CODING-29 S-15 a plugin that does not list characters.runnable under consumes is refused it (actions.forbidden), whatever it holds, while the action it lists is reachable; the person's characters.execution is out of reach even when listed", { timeout: 60_000 }, async () => {
  const item = await consumers();
  try {
    await item.start("lists-both", [characterPluginActions.list.capability_id, characterPluginActions.runnable.capability_id], ["artifact:read"]);
    await item.start("lists-one", [characterPluginActions.list.capability_id], ["artifact:read"]);
    await item.start("lists-none", [goalPluginActions.list.capability_id], ["artifact:read"]);
    await item.start("lists-execution", [charactersActions.execution.capability_id], ["artifact:read"]);
    // Coding's own Manifest asks for both, so it gets both.
    assert.deepEqual(await item.client("lists-both").invoke(characterPluginActions.runnable, { reference }), { available: true });
    assert.deepEqual(await item.client("lists-both").invoke(characterPluginActions.list, {}), { drafts: [], publications: [] });
    assert.deepEqual(item.reached, ["runnable", "list"]);
    // Not listed: refused before Characters is asked.
    assert.deepEqual(await item.client("lists-one").invoke(characterPluginActions.list, {}), { drafts: [], publications: [] });
    await assert.rejects(item.client("lists-one").invoke(characterPluginActions.runnable, { reference }), { code: "actions.forbidden" });
    await assert.rejects(item.client("lists-none").invoke(characterPluginActions.runnable, { reference }), { code: "actions.forbidden" });
    await assert.rejects(item.client("lists-none").invoke(characterPluginActions.list, {}), { code: "actions.forbidden" });
    // Listed and granted, but the launch details are the person's: the action is not offered to plugins, so for this plugin what it
    // lists does not exist in the project (it is not told the action is there and refused).
    await assert.rejects(item.client("lists-execution").invoke(charactersActions.execution, { reference }), { code: "actions.dependency_missing" });
    assert.deepEqual(item.reached, ["runnable", "list", "list"], "the refused calls never reached Characters");
  } finally { item.close(); }
});

test("W5-01-CODING-30 S-15 once the person has withdrawn the grant, the listed action is refused (plugin.grant_denied) and Characters is not asked", { timeout: 60_000 }, async () => {
  const item = await consumers();
  try {
    const consumes = [characterPluginActions.list.capability_id, characterPluginActions.runnable.capability_id];
    const installed = await item.start("revoked", consumes, ["artifact:read"]);
    assert.deepEqual(await item.client("revoked").invoke(characterPluginActions.runnable, { reference }), { available: true });
    assert.deepEqual(item.reached, ["runnable"]);
    // The running plugin's grants do not change under it: the person stops it, withdraws the grant, and it starts again without it.
    await item.runtime.stop(installed.install_id);
    item.runtime.grant(installed.install_id, []);
    await item.runtime.start(installed.install_id);
    await assert.rejects(item.client("revoked").invoke(characterPluginActions.runnable, { reference }), { code: "plugin.grant_denied" });
    await assert.rejects(item.client("revoked").invoke(characterPluginActions.list, {}), { code: "plugin.grant_denied" });
    assert.deepEqual(item.reached, ["runnable"], "the withdrawn grant refused both before Characters was asked");
    // A plugin that was never given it is refused the same way.
    await item.start("never", consumes, []);
    await assert.rejects(item.client("never").invoke(characterPluginActions.runnable, { reference }), { code: "plugin.grant_denied" });
    assert.deepEqual(item.reached, ["runnable"]);
  } finally { item.close(); }
});

test("W5-01-CODING-31 SYS15-Q2 recovery retries after a failed Agent read without a page; coding.state never starts a loop", { timeout: 60_000 }, async t => {
  const waits: unknown[] = [];
  const s = await codingSdkRuntime(t, { wrapCapabilities: client => new Proxy(client, { get(target, key) {
    const value = Reflect.get(target, key, target);
    if (key !== "invoke") return typeof value === "function" ? value.bind(target) : value;
    return async (definition: { capability_id: string }, ...rest: unknown[]) => {
      if (definition.capability_id !== agent.awaitContinuations.capability_id) return (value as (...args: unknown[]) => unknown).call(target, definition, ...rest);
      waits.push(rest[0]);
      throw new Error("Agent 运行时没有起来");
    };
  } }) });
  assert.equal(waits.length, 0, "a project with no session tied to an Agent run starts no loop");
  await s.sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "tied", title: "重启前的会话", runtime_id: "prologue", at });
  await s.sessions.setRuntimeSession(noEffect, DEMO_PROJECT_ID, "tied", "sdk", at);
  await s.platform.supervisor.restart(CODING_PLUGIN_ID);
  await until(() => waits.length >= 1);
  await until(() => waits.length >= 2, 10_000);
  const beforeQuery = waits.length;
  assert.equal((await callOf(s.call)("/state")).status, 200);
  assert.equal(waits.length, beforeQuery, "a query does not revive the failed loop");
});
