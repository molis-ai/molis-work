import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError, type ActionCallContext, type ActionDefinition, type ActionSceneBinding, type ActionSceneDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseDeclaration, PluginDefinition, PluginHostServices, PluginManifest, PluginProjectDatabaseTransaction } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginPlatform, DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";

// S-85 (PG-032 P4, user decision 2026-10-26): a plugin's scene callback writes an Inbox entry or a ledger edge through
// `services.attention` / `services.contextLedger` only when the scene itself declares the write permission, the callback may write
// (not a read-only one) and its own `beforeEffect` already returned. Everything else keeps being refused, and the write joins the
// plugin's own project transaction.

const OWNER = "owner", A_WRITE = "attention:write", L_WRITE = "context-ledger:write";
const textInput = { type: "object", properties: { text: { type: "string", minLength: 1 } }, required: ["text"], additionalProperties: false };
const decisionOutput = { type: "object", properties: { follow_up: { type: "boolean" } }, required: ["follow_up"], additionalProperties: false };
const judgment: ActionDefinition = { capability_id: "judgments.scene-write", version: 1, operation: "command",
  action: { title: "判断", description: "判断一段文字", kind: "judgment", scope: "project", audiences: ["user", "workflow", "mcp", "agent"], permissions: [],
    subject_kinds: ["feedback"], input_schema: textInput, output_schema: decisionOutput } };
const ref = (id: string) => ({ module: "plugins" as const, id, version: null, scope: { kind: "personal" as const, id: DEMO_PROJECT_ID }, project_id: DEMO_PROJECT_ID, object_type: "probe" });

type Step = "write" | "no-before" | "revoked" | "ledger" | "retained";

/** A plugin of the test: a scene whose callbacks do what `state.step` says, with a table of its own in the project's library. */
function sceneProbe(short: string, scenePermissions: readonly string[]) {
  const id = `io.molis.work.example.${short}`, read = `${short}:read`, write = `${short}:write`;
  const scene: ActionSceneDefinition = { scene_id: `${id}.arrived`, version: 1, title: "到达", description: "处理到达的文字", trigger: "arrived", scope: "project",
    subject_kinds: ["feedback"], event_schema: textInput, input_schema: textInput, result_schema: decisionOutput, permissions: [...scenePermissions] };
  const state = { step: "write" as Step, hook: () => {}, outcome: undefined as unknown, prepared: undefined as unknown, services: undefined as PluginHostServices | undefined,
    retained: undefined as (() => unknown) | undefined, bindings: new Map<string, ActionSceneBinding>() };
  const table: PluginDatabaseDeclaration = { store_name: short, version: 1, read_permission: read, write_permission: write,
    schema: `CREATE TABLE ${short}_notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);` };
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name: id, kind: "app",
    publisher: { publisher_id: "molis", signature: `probe-${short}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: ["storage:private", read, write, A_WRITE, L_WRITE, "attention:read"].map(permission => ({ permission, required: true, reason: "写自己的数据" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [], action_scenes: [scene],
    databases: { project: table }, attention: { subjects: ["goal_decision"] },
    upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } };
  const attempt = (tx: PluginProjectDatabaseTransaction, name: string, services: PluginHostServices) => {
    tx.run(`INSERT INTO ${short}_notes (text) VALUES (?)`, [name]);
    if (state.step === "ledger") services.contextLedger!.join(tx, w => { w.put({ key: `edge-${name}`, type: "probe.refers", source: ref(name), target: ref(`${name}-target`), cause: "测试" }); });
    else services.attention!.join(tx, w => { w.create({ owner_plugin_id: id, subject_type: "goal_decision", subject_id: name, reason: "goal_decision" }); });
  };
  const definition: PluginDefinition = { manifest, async start(context) {
    state.services = context.services;
    return { kind: "app", views: [], actions: [], action_scenes: [{ scene_id: scene.scene_id, version: 1,
      bindings: () => [...state.bindings.values()],
      bind: (_caller, value) => { state.bindings.set(value.binding_id, value); },
      // A read-only callback that tries to write: it is handed no way to.
      prepare: async (_caller, event) => {
        if (state.step === "write") try {
          await state.services!.project_database!.transaction(async () => {}, tx => { attempt(tx, "from-prepare", state.services!); });
          state.prepared = "allowed";
        } catch (error) { state.prepared = error; }
        return { input: event };
      },
      consume: async (caller, input) => {
        const name = (input as { text: string }).text, own = state.services!, database = own.project_database!;
        if (state.step === "no-before") { await database.transaction(async () => {}, tx => { attempt(tx, name, own); }); return {}; }
        if (state.step === "retained") {
          await caller.beforeEffect();
          await database.transaction(async () => {}, tx => { own.attention!.join(tx, w => { state.retained = () => w.create({ owner_plugin_id: id, subject_type: "goal_decision", subject_id: name, reason: "goal_decision" }); }); });
          return {};
        }
        await database.transaction(caller.beforeEffect, tx => {
          if (state.step === "revoked") state.hook();
          try { attempt(tx, name, own); state.outcome = "allowed"; } catch (error) { state.outcome = error; throw error; }
        });
        return {};
      } }] };
  } };
  return { id, short, scene, definition, state };
}

async function platform(t: TestContext, scenePermissions: Record<string, readonly string[]>) {
  const home = mkdtempSync(join(tmpdir(), "plugin-scene-writes-")), file = join(home, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), actions = pluginActions(store, DEMO_PROJECT_ID);
  const ports = { db: store.db, appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event),
    eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const running = createPluginPlatform({ actions, project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store,
    artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), ui: new UiHost(),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }), home: null });
  t.after(async () => {
    try {
      await running.closeCoordination();
      for (const instance of running.runtime.list()) if (instance.state === "running") await running.runtime.stop(instance.install_id);
    } finally { store.close(); rmSync(home, { recursive: true, force: true }); }
  });
  const probes = Object.fromEntries(Object.entries(scenePermissions).map(([short, permissions]) => [short, sceneProbe(short, permissions)]));
  const started = await running.start(Object.values(probes).map(item => ({ definition: item.definition, trust: { level: "host" as const } })));
  assert.deepEqual(started.running.toSorted(), Object.values(probes).map(item => item.id).toSorted(), JSON.stringify(started));
  actions.registry.registerProvider({ provider: { provider_id: "system-judgments", title: "判断", kind: "system" }, definitions: [judgment],
    handlers: [{ ...judgment, handle: () => ({ follow_up: true }) }] });
  const entry = (name: string) => store.db.prepare("SELECT project_id, reason FROM inbox_entries WHERE subject_id = ?").get(name);
  const edge = (name: string) => store.db.prepare("SELECT actor_id FROM context_edges WHERE edge_key LIKE ?").get(`%:edge-${name}`);
  const noted = (short: string, name: string) => store.db.prepare(`SELECT 1 FROM ${short}_notes WHERE text = ?`).get(name) !== undefined;
  return { store, client: actions.client, probes, entry, edge, noted };
}

/** The original caller; `revoke` makes its last authority check fail from then on. */
function caller() {
  let refusal: ActionError | undefined;
  const context: ActionCallContext = { actor_id: OWNER, project_id: DEMO_PROJECT_ID, audience: "user", permissions: [A_WRITE, L_WRITE], assert_authority_current: () => { if (refusal) throw refusal; } };
  return { context, revoke: () => { refusal = new ActionError("actions.forbidden", "the caller was revoked"); } };
}

async function runScene(env: Awaited<ReturnType<typeof platform>>, probe: ReturnType<typeof sceneProbe>, step: Step, text: string, who = caller()) {
  probe.state.step = step; probe.state.hook = who.revoke;
  const binding: ActionSceneBinding = { binding_id: `${probe.short}-${step}`, scene_id: probe.scene.scene_id, scene_version: 1, project_id: DEMO_PROJECT_ID,
    function: { capability_id: judgment.capability_id, version: 1 }, enabled: true, title: "绑定", href: "/x" };
  await env.client.bind(who.context, binding);
  return env.client.runScene(who.context, probe.scene, binding.binding_id, { text }).then(() => "ran" as const, (error: unknown) => error as { code?: string });
}

/** Refused with `actions.forbidden` for the reason `why` says: the gate that is meant to refuse is the one that did. */
const refusedFor = (outcome: unknown, why: RegExp) => {
  const error = outcome as { code?: string; message?: string };
  return error.code === "actions.forbidden" && why.test(error.message ?? "");
};

test("RAC-847 S-85 a scene that declares attention:write writes an Inbox entry, once its beforeEffect returned, in the plugin's own transaction", async t => {
  const env = await platform(t, { sceneopen: [A_WRITE, L_WRITE], scenelean: [A_WRITE] });
  const open = env.probes.sceneopen!;
  assert.equal(await runScene(env, open, "write", "allowed-entry"), "ran");
  assert.deepEqual(env.entry("allowed-entry"), { project_id: DEMO_PROJECT_ID, reason: "goal_decision" });
  assert.ok(env.noted("sceneopen", "allowed-entry"), "the plugin's own row and the entry land in one transaction");
  assert.equal(await runScene(env, open, "ledger", "allowed-edge"), "ran");
  assert.deepEqual(env.edge("allowed-edge"), { actor_id: OWNER });
  assert.ok(env.noted("sceneopen", "allowed-edge"));
});

test("RAC-848 S-85 a read-only scene callback cannot write, and nothing of its attempt stays", async t => {
  const env = await platform(t, { sceneopen: [A_WRITE, L_WRITE] });
  const open = env.probes.sceneopen!;
  assert.equal(await runScene(env, open, "write", "after-prepare"), "ran");
  assert.ok(refusedFor(open.state.prepared, /只读/), `prepare ran read-only and was refused: ${String((open.state.prepared as Error)?.message)}`);
  assert.equal(env.entry("from-prepare"), undefined);
  assert.equal(env.noted("sceneopen", "from-prepare"), false);
});

test("RAC-848 S-85 a scene that does not declare the permission cannot write it, even though the plugin holds the grant", async t => {
  const env = await platform(t, { scenelean: [A_WRITE], scenebare: [] });
  const lean = env.probes.scenelean!, bare = env.probes.scenebare!;
  const noEdge = await runScene(env, lean, "ledger", "needs-l-write");
  assert.ok(refusedFor(noEdge, /场景自己声明了这项权限/), `a scene with attention:write only cannot write the ledger: ${String((noEdge as Error).message)}`);
  assert.equal(env.edge("needs-l-write"), undefined);
  assert.equal(env.noted("scenelean", "needs-l-write"), false);
  const noEntry = await runScene(env, bare, "write", "needs-a-write");
  assert.ok(refusedFor(noEntry, /场景自己声明了这项权限/), `a scene that declares nothing writes nothing: ${String((noEntry as Error).message)}`);
  assert.equal(env.entry("needs-a-write"), undefined);
  assert.equal(env.noted("scenebare", "needs-a-write"), false);
});

test("RAC-848 S-85 a scene callback writes only after its own beforeEffect returned: a no-op wait in its place is refused", async t => {
  const env = await platform(t, { sceneopen: [A_WRITE, L_WRITE] });
  const outcome = await runScene(env, env.probes.sceneopen!, "no-before", "skipped-wait");
  assert.ok(refusedFor(outcome, /beforeEffect/), String((outcome as Error).message));
  assert.equal(env.entry("skipped-wait"), undefined);
  assert.equal(env.noted("sceneopen", "skipped-wait"), false);
});

test("RAC-849 S-85 a caller revoked after the callback's wait writes nothing, and a writer kept past the callback writes nothing", async t => {
  const env = await platform(t, { sceneopen: [A_WRITE, L_WRITE] });
  const open = env.probes.sceneopen!;
  const revoked = await runScene(env, open, "revoked", "revoked-entry");
  assert.ok(refusedFor(revoked, /the caller was revoked/), String((revoked as Error).message));
  assert.equal(env.entry("revoked-entry"), undefined);
  assert.equal(env.noted("sceneopen", "revoked-entry"), false);
  assert.equal(await runScene(env, open, "retained", "kept-entry"), "ran");
  assert.throws(() => open.state.retained!(), (error: ActionError) => refusedFor(error, /仍在执行的事务/));
  assert.equal(env.entry("kept-entry"), undefined);
});
