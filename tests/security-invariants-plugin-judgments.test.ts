import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError, type ActionCallContext, type ActionDefinition, type ActionReference, type ActionSceneBinding, type ActionSceneDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseDeclaration, PluginDefinition, PluginHostServices, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginPlatform, DEMO_PROJECT_ID, homeStores, LocalProjectDatabase, seedDemoBoard, withFunctionsService } from "@molis-ai/molis-work-app-local-host";
import { purgeFunctionsProject } from "@molis-ai/molis-work-module-functions";
import { createFeedSceneRuntime, feedCaptureScene, feedCaptureSubjectRevision, type FeedApplication, type FeedItemRecord } from "@molis-ai/molis-work-plugin-feed";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { homeStoreRegistry } from "@molis-ai/molis-work-storage";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";

// S-90 (PG-032 P2): a plugin reads and records the judgments of the scenes its own Manifest declares only through `services.judgments`,
// in the project of the call, from a call that may write; the function key is the platform's; a cancelled, revoked or stopped call
// records nothing. The ledger is the Home's Functions library, so a row stays when the plugin's own project transaction rolls back.

const JR = "judgments:read", JW = "judgments:write", OTHER_PROJECT = "another-project";
const textInput = { type: "object", properties: { text: { type: "string", minLength: 1 } }, required: ["text"], additionalProperties: false };
const decisionOutput = { type: "object", properties: { follow_up: { type: "boolean" } }, required: ["follow_up"], additionalProperties: false };
const judge = (capability_id: string): ActionDefinition => ({ capability_id, version: 1, operation: "command",
  action: { title: "判断", description: "判断一段文字", kind: "judgment", scope: "project", audiences: ["user", "workflow", "mcp", "agent"], permissions: [],
    subject_kinds: ["feedback", "feed_item"], input_schema: textInput, output_schema: decisionOutput } });
const judgment = judge("judgments.ledger"), failing = judge("judgments.ledger-failing");
const judgmentRef: ActionReference = { capability_id: judgment.capability_id, version: 1 };

type Step = "latest" | "record" | "revoked" | "cancelled" | "borrow";
type SceneStep = "scene-record" | "scene-no-wait" | "scene-revoked" | "scene-failed" | "scene-rollback" | "scene-late" | "prepare-record";
interface StepInput { readonly step: Step; readonly scene?: string; readonly kind?: string; readonly project?: string; readonly subject?: string; readonly forged?: string }
interface ProbeOptions { readonly grants?: readonly string[]; readonly scene?: boolean; readonly scenePermissions?: readonly string[] }

/** A plugin of the test: actions that make the ledger call `step` names, and a scene whose callbacks do what `state.sceneStep` says, with a table of its own. */
function probe(short: string, options: ProbeOptions = {}) {
  const id = `io.molis.work.example.${short}`, grants = options.grants ?? [JR, JW], hasScene = options.scene ?? true, write = grants.includes(JW);
  const scene: ActionSceneDefinition = { scene_id: `${id}.arrived`, version: 1, title: "到达", description: "处理到达的文字", trigger: "arrived", scope: "project",
    subject_kinds: ["feedback", "feed_item"], event_schema: textInput, input_schema: textInput, result_schema: decisionOutput, permissions: [...options.scenePermissions ?? (write ? [JW] : [])] };
  const state = { services: undefined as PluginHostServices | undefined, value: undefined as unknown, error: undefined as unknown, hook: () => {}, sceneStep: "scene-record" as SceneStep,
    sceneOutcome: undefined as unknown, late: undefined as unknown, bindings: new Map<string, ActionSceneBinding>() };
  const define = (name: string, operation: "command" | "query", permissions: readonly string[], scheduling?: "concurrent"): ActionDefinition<StepInput, boolean> => ({
    capability_id: `${id}.${name}`, version: 1, operation,
    action: { scope: "project", audiences: ["user"], permissions: [...permissions], subject_kinds: [], title: name, description: name, kind: operation === "query" ? "query" : "operation",
      ...(scheduling ? { scheduling } : {}),
      input_schema: { type: "object", required: ["step"], properties: { step: { type: "string" }, scene: { type: "string" }, kind: { type: "string" }, project: { type: "string" }, subject: { type: "string" }, forged: { type: "string" } } },
      output_schema: { type: "boolean" } } });
  // `wait` declares the write permission, `bare` is concurrent without it, `serial` declares it but does not wait, `look` is a query.
  const wait = define("wait", "command", write ? [JW] : [], "concurrent"), bare = define("bare", "command", [], "concurrent");
  const serial = define("serial", "command", write ? [JW] : []), look = define("look", "query", []);
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name: id, kind: "app",
    publisher: { publisher_id: "molis", signature: `probe-${short}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: ["storage:private", `${short}:read`, `${short}:write`, ...grants].map(permission => ({ permission, required: true, reason: "记自己场景的判断" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [wait, bare, serial, look],
    ...(hasScene ? { action_scenes: [scene] } : {}),
    databases: { project: { store_name: short, version: 1, read_permission: `${short}:read`, write_permission: `${short}:write`,
      schema: `CREATE TABLE ${short}_notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);` } satisfies PluginDatabaseDeclaration },
    upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } };
  const record = (input: Pick<StepInput, "scene" | "kind" | "project" | "subject" | "forged"> = {}, outcome: "ok" | "needs_review" = "ok", error_code: string | null = null) =>
    state.services!.judgments!.record({ function: judgmentRef, subject: { kind: input.kind ?? "feedback", id: input.subject ?? "subject-1", project_id: input.project ?? DEMO_PROJECT_ID },
      scene_id: input.scene ?? scene.scene_id, scene_provenance: { binding_id: "binding", binding_revision: "r1", function: judgmentRef, subject_revision: "s1" },
      outcome, suggested_behavior_ids: [], error_code, ...(input.forged ? { function_key: input.forged } : {}) } as Parameters<NonNullable<PluginHostServices["judgments"]>["record"]>[0]);
  const attempt = (input: StepInput) => {
    const judgments = state.services!.judgments!;
    switch (input.step) {
      case "latest": return judgments.latest(input.scene ?? scene.scene_id);
      case "record": return record(input);
      case "revoked": state.hook(); return record(input);
      case "cancelled": state.hook(); return record(input);
      case "borrow": return record(input);
      default: throw new Error(`unknown step ${input.step}`);
    }
  };
  const handler = (definition: ActionDefinition<StepInput, boolean>) => ({ ...definition, handle: (_caller: ActionCallContext, raw: unknown) => {
    try { state.value = attempt(raw as StepInput); state.error = undefined; } catch (error) { state.value = undefined; state.error = error; }
    return true;
  } });
  const definition: PluginDefinition = { manifest, async start(context) {
    state.services = context.services;
    return { kind: "app", views: [], actions: [handler(wait), handler(bare), handler(serial), handler(look)],
      ...(hasScene ? { action_scenes: [{ scene_id: scene.scene_id, version: 1, bindings: () => [...state.bindings.values()],
        bind: (_caller: ActionCallContext, value: ActionSceneBinding) => { state.bindings.set(value.binding_id, value); },
        // A read-only callback: it is handed no way to write, and the ledger agrees.
        prepare: (_caller: ActionCallContext, event: unknown) => {
          if (state.sceneStep === "prepare-record") try { state.sceneOutcome = record({ subject: "from-prepare" }); } catch (error) { state.sceneOutcome = error; }
          return { input: event };
        },
        consume: async (caller: ActionCallContext & { beforeEffect(): Promise<void> }, input: unknown) => {
          const name = (input as { text: string }).text, subject = { subject: name };
          const outcome = async (run: () => unknown) => { try { state.sceneOutcome = await run(); } catch (error) { state.sceneOutcome = error; } };
          switch (state.sceneStep) {
            case "prepare-record": break;
            case "scene-no-wait": await outcome(() => record(subject)); break;
            case "scene-revoked": await caller.beforeEffect(); state.hook(); await outcome(() => record(subject)); break;
            case "scene-rollback":
              await caller.beforeEffect(); state.sceneOutcome = record({ ...subject, kind: "feed_item" });
              await state.services!.project_database!.transaction(async () => {}, tx => { tx.run(`INSERT INTO ${short}_notes (text) VALUES (?)`, [name]); throw new Error("the plugin's own rows did not follow"); });
              break;
            case "scene-late":
              await caller.beforeEffect();
              // Past the end of this callback, in the same asynchronous chain: the callback's authority is gone.
              setTimeout(() => { try { record(subject); state.late = "recorded"; } catch (error) { state.late = error; } }, 20);
              break;
            default: await caller.beforeEffect(); await outcome(() => record(subject));
          }
          return { follow_up: true };
        },
        failed: async (caller: ActionCallContext & { beforeEffect(): Promise<void> }, input: unknown) => {
          await caller.beforeEffect();
          await (async () => { try { state.sceneOutcome = record({ subject: (input as { text: string }).text }, "needs_review", "functions.invoke_failed"); } catch (error) { state.sceneOutcome = error; } })();
          return { follow_up: false };
        } }] } : {}) };
  } };
  return { id, short, scene, definition, state, wait, bare, serial, look };
}

async function platform(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "plugin-judgments-")), file = join(home, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), actions = pluginActions(store, DEMO_PROJECT_ID);
  const ports = { db: store.db, appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event),
    eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const running = createPluginPlatform({ actions, project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store,
    artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), ui: new UiHost(),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
    home: { directory: home, completeText: () => null, stores: homeStoreRegistry(homeStores().stores) } });
  t.after(async () => {
    try {
      await running.closeCoordination();
      for (const instance of running.runtime.list()) if (instance.state === "running") await running.runtime.stop(instance.install_id);
    } finally { store.close(); rmSync(home, { recursive: true, force: true }); }
  });
  const main = probe("judgemain"), other = probe("judgeother"), lean = probe("judgelean", { scenePermissions: [] }), readonly = probe("judgeread", { grants: [JR] });
  const ungranted = probe("judgeungranted", { grants: [] }), sceneless = probe("judgesceneless", { scene: false });
  const all = [main, other, lean, readonly, ungranted, sceneless];
  const started = await running.start(all.map(item => ({ definition: item.definition, trust: { level: "host" as const } })));
  assert.deepEqual(started.running.toSorted(), all.map(item => item.id).toSorted(), JSON.stringify(started));
  actions.registry.registerProvider({ provider: { provider_id: "system-judgments", title: "判断", kind: "system" }, definitions: [judgment, failing],
    handlers: [{ ...judgment, handle: () => ({ follow_up: true }) }, { ...failing, handle: () => { throw new ActionError("actions.service_unavailable", "the judgment is down"); } }] });
  const ledger = () => withFunctionsService(home, service => service.listJudgments());
  const seed = (scene: string, subject: string, project: string, outcome: "ok" | "needs_review" = "ok") => withFunctionsService(home, service => service.recordSceneJudgment({
    function_key: "seeded", function_version: 1, subject: { kind: "feedback", id: subject, project_id: project }, scene_id: scene, outcome,
    suggested_behavior_ids: [], error_code: null }));
  const noted = (short: string, name: string) => store.db.prepare(`SELECT 1 FROM ${short}_notes WHERE text = ?`).get(name) !== undefined;
  return { home, running, client: actions.client, main, other, lean, readonly, ungranted, sceneless, ledger, seed, noted };
}

type Env = Awaited<ReturnType<typeof platform>>;
type Probe = ReturnType<typeof probe>;

/** The original caller; `revoke` makes its last authority check fail from then on, `cancel` aborts its signal. */
function caller() {
  let refusal: ActionError | undefined;
  const controller = new AbortController();
  const context: ActionCallContext = { actor_id: "owner", project_id: DEMO_PROJECT_ID, audience: "user", permissions: [JW, JR], signal: controller.signal,
    assert_authority_current: () => { controller.signal.throwIfAborted(); if (refusal) throw refusal; } };
  return { context, revoke: () => { refusal = new ActionError("actions.forbidden", "the caller was revoked"); }, cancel: () => controller.abort() };
}

/** Runs `step` inside an action of `item`, and gives what the ledger call returned or threw. */
async function inAction(env: Env, item: Probe, input: StepInput, which: "wait" | "bare" | "serial" | "look" = "wait", who = caller()) {
  item.state.hook = input.step === "cancelled" ? who.cancel : who.revoke; item.state.value = undefined; item.state.error = undefined;
  await env.client.invoke(who.context, item[which], input).catch(() => undefined);
  return { value: item.state.value, error: item.state.error as { code?: string; message?: string } | undefined };
}

/** Binds the scene to `fn` and runs it, so `step` decides what the scene's callbacks do with the ledger. */
async function runScene(env: Env, item: Probe, step: SceneStep, text: string, fn: ActionDefinition = judgment, who = caller()) {
  item.state.sceneStep = step; item.state.sceneOutcome = undefined; item.state.hook = who.revoke;
  const binding: ActionSceneBinding = { binding_id: `${item.short}-${step}`, scene_id: item.scene.scene_id, scene_version: 1, project_id: DEMO_PROJECT_ID,
    function: { capability_id: fn.capability_id, version: 1 }, enabled: true, title: "绑定", href: "/x" };
  await env.client.bind(who.context, binding);
  await env.client.runScene(who.context, item.scene, binding.binding_id, { text }).catch(() => undefined);
  return item.state.sceneOutcome as { code?: string; message?: string; judgment_id?: string } | undefined;
}

const refused = (error: { code?: string; message?: string } | undefined, code: string, why?: RegExp) => error?.code === code && (why === undefined || why.test(error.message ?? ""));
const subjects = (env: Env, scene: string) => env.ledger().filter(row => row.scene_id === scene).map(row => `${row.subject.project_id}/${row.subject.id}`).toSorted();

test("RAC-840 S-90 the service exists only for a plugin that declares judgments:read or judgments:write and has scenes of its own", async t => {
  const env = await platform(t);
  assert.ok(env.main.state.services!.judgments, "a plugin with both permissions and a scene has it");
  assert.ok(env.readonly.state.services!.judgments, "judgments:read alone is enough to have it");
  assert.equal(env.ungranted.state.services!.judgments, undefined, "a scene without any judgments permission has none");
  assert.equal(env.sceneless.state.services!.judgments, undefined, "judgments permissions without a scene of its own give none");
  const write = await inAction(env, env.readonly, { step: "record" });
  assert.ok(write.error, "a plugin that holds only judgments:read cannot record");
  assert.deepEqual(env.ledger(), []);
});

test("RAC-841 S-90 latest returns only the newest judgment per subject of the plugin's own scene in this project", async t => {
  const env = await platform(t);
  const scene = env.main.scene.scene_id;
  env.seed(scene, "a", DEMO_PROJECT_ID, "needs_review"); env.seed(scene, "a", DEMO_PROJECT_ID, "ok"); env.seed(scene, "b", DEMO_PROJECT_ID);
  env.seed(scene, "elsewhere", OTHER_PROJECT); env.seed(env.other.scene.scene_id, "theirs", DEMO_PROJECT_ID);
  for (const which of ["wait", "bare", "serial", "look"] as const) {
    const { value, error } = await inAction(env, env.main, { step: "latest" }, which);
    assert.equal(error, undefined, `${which}: ${error?.message}`);
    const rows = value as { subject: { id: string }; outcome: string }[];
    assert.deepEqual(rows.map(row => row.subject.id).toSorted(), ["a", "b"], `${which}: no row of another project or of another plugin's scene`);
    assert.equal(rows.find(row => row.subject.id === "a")!.outcome, "ok", `${which}: the newest of a subject`);
  }
  assert.deepEqual(env.main.state.services!.judgments!.latest(scene).map(row => row.subject.id).toSorted(), ["a", "b"], "a read needs no running action");
  for (const foreign of [env.other.scene.scene_id, "home.dock", `${env.main.id}.never-declared`]) {
    const refusal = await inAction(env, env.main, { step: "latest", scene: foreign });
    assert.ok(refused(refusal.error, "plugin.scene_not_declared"), `${foreign}: ${refusal.error?.code} ${refusal.error?.message}`);
  }
});

test("RAC-842 S-90 record works from a concurrent action that declares judgments:write and from the plugin's own scene callbacks", async t => {
  const env = await platform(t);
  const fromAction = await inAction(env, env.main, { step: "record", subject: "from-action" });
  assert.equal(fromAction.error, undefined, String(fromAction.error?.message));
  assert.equal((await runScene(env, env.main, "scene-record", "from-consume") as { judgment_id: string }).judgment_id.length > 0, true, "consume records once its beforeEffect returned");
  const failed = await runScene(env, env.main, "scene-failed", "from-failed", failing);
  assert.equal((failed as { error_code: string } | undefined)?.error_code, "functions.invoke_failed", "failed records the failure of the judgment");
  assert.deepEqual(subjects(env, env.main.scene.scene_id), [`${DEMO_PROJECT_ID}/from-action`, `${DEMO_PROJECT_ID}/from-consume`, `${DEMO_PROJECT_ID}/from-failed`]);
});

test("RAC-842 S-90 record is refused from a read-only callback, a query, a serial or undeclaring action, a stray call and another installation's action", async t => {
  const env = await platform(t);
  const cases: [string, { error?: { code?: string; message?: string } }, RegExp][] = [
    ["a query action", await inAction(env, env.main, { step: "record", subject: "q" }, "look"), /可写插件调用/],
    ["a serial action", await inAction(env, env.main, { step: "record", subject: "s" }, "serial"), /可等待并行动作/],
    ["a concurrent action that does not declare judgments:write", await inAction(env, env.main, { step: "record", subject: "b" }, "bare"), /声明了这项权限/],
  ];
  for (const [what, { error }, why] of cases) assert.ok(refused(error, "actions.forbidden", why), `${what}: ${error?.code} ${error?.message}`);
  assert.throws(() => env.main.state.services!.judgments!.record({ function: judgmentRef, subject: { kind: "feedback", id: "stray", project_id: DEMO_PROJECT_ID }, scene_id: env.main.scene.scene_id,
    scene_provenance: { binding_id: "b", binding_revision: "r", function: judgmentRef, subject_revision: "s" }, outcome: "ok", suggested_behavior_ids: [], error_code: null }),
  (error: ActionError) => refused(error, "actions.forbidden", /可写插件调用/), "outside every call");
  await runScene(env, env.main, "prepare-record", "prepared");
  assert.ok(refused(env.main.state.sceneOutcome as never, "actions.forbidden", /可写插件调用/), "prepare is read-only");
  env.other.state.services = { ...env.other.state.services, judgments: env.main.state.services!.judgments } as PluginHostServices;
  const borrowed = await inAction(env, env.other, { step: "borrow", scene: env.main.scene.scene_id, subject: "borrowed" });
  assert.ok(refused(borrowed.error, "actions.forbidden", /另一个插件实例/), `${borrowed.error?.code} ${borrowed.error?.message}`);
  assert.deepEqual(env.ledger(), [], "none of them wrote a row");
});

test("RAC-842 S-90 a scene callback records only when its scene declares judgments:write and its beforeEffect returned", async t => {
  const env = await platform(t);
  await runScene(env, env.lean, "scene-record", "lean-scene");
  assert.ok(refused(env.lean.state.sceneOutcome as never, "actions.forbidden", /场景自己声明了这项权限/), "the plugin holds the grant, the scene does not declare it");
  await runScene(env, env.main, "scene-no-wait", "skipped-wait");
  assert.ok(refused(env.main.state.sceneOutcome as never, "actions.forbidden", /beforeEffect/), "a callback that did not wait for the recheck");
  assert.deepEqual(env.ledger(), []);
});

test("RAC-843 S-90 record refuses a subject of another project, a kind the scene does not declare and a scene that is not the plugin's; the function key is the platform's", async t => {
  const env = await platform(t);
  const project = await inAction(env, env.main, { step: "record", project: OTHER_PROJECT });
  assert.ok(refused(project.error, "actions.scope_mismatch"), `${project.error?.code} ${project.error?.message}`);
  const kind = await inAction(env, env.main, { step: "record", kind: "goal" });
  assert.ok(refused(kind.error, "actions.forbidden", /没有声明这种对象/), `${kind.error?.code} ${kind.error?.message}`);
  for (const foreign of [env.other.scene.scene_id, "home.dock"]) {
    const scene = await inAction(env, env.main, { step: "record", scene: foreign });
    assert.ok(refused(scene.error, "plugin.scene_not_declared"), `${foreign}: ${scene.error?.code} ${scene.error?.message}`);
  }
  assert.deepEqual(env.ledger(), [], "each refusal wrote nothing");
  const accepted = await inAction(env, env.main, { step: "record", forged: "forged-key" });
  assert.equal(accepted.error, undefined, String(accepted.error?.message));
  const [row] = env.ledger();
  assert.equal(row!.function_key, judgment.capability_id, "the key comes from the function the plugin names, not from the input");
  assert.equal(row!.function_version, 1);
  assert.equal(row!.subject.project_id, DEMO_PROJECT_ID);
});

test("RAC-844 S-90 a revoked or cancelled caller records nothing, and neither does a stopped installation or a callback that already ended", async t => {
  const env = await platform(t);
  const revoked = await inAction(env, env.main, { step: "revoked", subject: "revoked" });
  assert.ok(refused(revoked.error, "actions.forbidden", /the caller was revoked/), `${revoked.error?.code} ${revoked.error?.message}`);
  const cancelled = await inAction(env, env.main, { step: "cancelled", subject: "cancelled" });
  assert.ok(cancelled.error, "a cancelled call is refused");
  await runScene(env, env.main, "scene-revoked", "revoked-in-scene");
  assert.ok(refused(env.main.state.sceneOutcome as never, "actions.forbidden", /the caller was revoked/), String((env.main.state.sceneOutcome as Error)?.message));
  await runScene(env, env.main, "scene-late", "late");
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.ok(refused(env.main.state.late as never, "actions.expired"), `a write after the callback ended: ${String((env.main.state.late as Error)?.message)}`);
  const kept = env.main.state.services!.judgments!;
  const install = env.running.runtime.list().find(item => item.plugin_id === env.main.id)!;
  await env.running.runtime.stop(install.install_id);
  // Code a stopped activation left running outside every call is refused without a throw (BL-411): a synchronous method gives nothing back.
  assert.equal(kept.record({ function: judgmentRef, subject: { kind: "feedback", id: "after-stop", project_id: DEMO_PROJECT_ID }, scene_id: env.main.scene.scene_id,
    scene_provenance: { binding_id: "b", binding_revision: "r", function: judgmentRef, subject_revision: "s" }, outcome: "ok", suggested_behavior_ids: [], error_code: null }), undefined);
  assert.equal(kept.latest(env.main.scene.scene_id), undefined);
  assert.deepEqual(env.ledger(), [], "no row, and no failure row either");
});

test("RAC-845 S-90 the ledger row is in the Home's Functions library and stays when the plugin's own project transaction rolls back, and Feed's adoption recheck does not adopt it", async t => {
  const env = await platform(t);
  await runScene(env, env.main, "scene-rollback", "rolled-back");
  const recorded = env.main.state.sceneOutcome as { judgment_id: string };
  assert.ok(recorded.judgment_id, "the record call returned its row");
  assert.deepEqual(subjects(env, env.main.scene.scene_id), [`${DEMO_PROJECT_ID}/rolled-back`], "the ledger row is committed on its own");
  assert.equal(env.noted("judgemain", "rolled-back"), false, "the plugin's own row did not land: the two are not one transaction");
  assert.equal(env.ledger()[0]!.scene_provenance?.binding_id, "binding", "the row carries the provenance a later adoption rechecks");
  // The orphan is harmless (R-60): Feed adopts a judgment only while its binding, its function and the item's content still hold, with the real runtime over the ledger the service reads.
  const rows = [...env.main.state.services!.judgments!.latest(env.main.scene.scene_id)];
  assert.equal(rows.length, 1);
  const usage = { scene_id: feedCaptureScene.scene_id, binding_id: "binding", revision: "r1", enabled: true, availability: { available: true }, function: judgmentRef } as never;
  const adopted = (item: () => FeedItemRecord, judgments = rows) => createFeedSceneRuntime({ projectId: DEMO_PROJECT_ID, feed: {} as FeedApplication, actions: {} as never,
    scenes: { usages: async () => [usage], discoverScenes: async () => [] } as never,
    host: { latestJudgments: () => judgments, recordJudgment: () => ({}) as never, item } }).selection.recommendations({ actor_id: "tester", project_id: DEMO_PROJECT_ID, permissions: [] } as never);
  const item = { item_id: "rolled-back", revision: 1, title: "标题", summary: "摘要", body: null, materials: [] } as never as FeedItemRecord;
  const gone = () => { throw Object.assign(new Error("no such item"), { code: "feed.item_not_found" }); };
  assert.deepEqual(await adopted(gone), { recommendations: [] }, "the item the rolled-back transaction would have created is not there");
  assert.deepEqual(await adopted(() => item), { recommendations: [] }, "an item whose content is not the one the judgment was made on");
  const held = [{ ...rows[0]!, scene_provenance: { ...rows[0]!.scene_provenance!, subject_revision: feedCaptureSubjectRevision(item) } }];
  assert.equal((await adopted(() => item, held)).recommendations.length, 1, "the same row is adopted when everything it rests on holds: the recheck is not vacuous");
});

test("RAC-846 S-90 deleting the project clears its judgments from the ledger and leaves other projects' alone", async t => {
  const env = await platform(t);
  await inAction(env, env.main, { step: "record", subject: "gone" });
  env.seed(env.main.scene.scene_id, "stays", OTHER_PROJECT);
  assert.equal(env.main.state.services!.judgments!.latest(env.main.scene.scene_id).length, 1);
  purgeFunctionsProject(env.home, DEMO_PROJECT_ID);
  assert.deepEqual(env.main.state.services!.judgments!.latest(env.main.scene.scene_id), []);
  assert.deepEqual(subjects(env, env.main.scene.scene_id), [`${OTHER_PROJECT}/stays`]);
});
