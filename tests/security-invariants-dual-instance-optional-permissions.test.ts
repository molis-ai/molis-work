import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { runningProjectPlatform } from "@molis-ai/molis-work-app-local-host";
import { type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionSceneBinding, type ActionSceneDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginBackgroundExecution, PluginDefinition, PluginJobControl, PluginKeptJob, PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PluginRouteRouter } from "@molis-ai/molis-work-plugin-runtime";
import { deferred, serveHomeRuntime } from "./fixtures/home-runtime.js";

const ID = "io.molis.work.example.optionaldual", OPTIONAL = "optionaldual:use", STORAGE = "storage:private";
const DELEGATE = "actions:delegate";
const empty = { type: "object", additionalProperties: false };
type Mode = "write" | "query" | "scene" | "job" | "required-job" | "background" | "route" | "consume" | "extra" | "judgment" | "discovery";

/** One generic trusted dual fixture. Every effect and failure uses the production storage service. */
function probe() {
  const contexts = new Map<string, PluginStartContext>(), jobs: PluginKeptJob[] = [], backgrounds: PluginBackgroundExecution<string>[] = [];
  const jobControls: PluginJobControl[] = [];
  const held = new Map<Mode, { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred>; finished: ReturnType<typeof deferred> }>();
  const hold = (mode: Mode) => { const latch = { entered: deferred(), release: deferred(), finished: deferred() }; held.set(mode, latch); return latch; };
  const wait = async (mode: Mode) => { const latch = held.get(mode); latch?.entered.resolve(); await latch?.release.promise; };
  const action = (suffix: string, operation: "query" | "command", permissions: string[]): ActionDefinition => ({ capability_id: `optionaldual.${suffix}`, version: 1, operation,
    action: { title: suffix, description: "可选权限真实调用", scope: "project", kind: operation === "query" ? "query" : "operation", audiences: ["user", "plugin"],
      permissions, input_schema: empty, scheduling: "concurrent", subject_kinds: [] } });
  const actions = { write: action("write", "command", [STORAGE, OPTIONAL]), query: action("query", "query", [OPTIONAL]),
    required: action("required", "query", [STORAGE]), keep: action("keep", "command", [STORAGE]), extra: action("extra", "command", [STORAGE]),
    plain: action("plain", "command", [STORAGE]),
    delegate: action("delegate", "command", [STORAGE]),
    keepRequired: action("keep-required", "command", [STORAGE, OPTIONAL]),
    status: action("status", "query", []), background: action("background", "command", [STORAGE, OPTIONAL]) };
  actions.background.action.background_job = { status: actions.status, id: "id", input: "id", state: "state", done: ["succeeded"], failed: ["failed"] };
  actions.background.action.input_schema = { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false };
  actions.background.action.output_schema = { type: "object", properties: { id: { type: "string" }, state: { type: "string" } }, required: ["id", "state"], additionalProperties: false };
  actions.status.action.input_schema = actions.background.action.input_schema;
  actions.status.action.output_schema = { type: "object", properties: { state: { type: "string" } }, required: ["state"], additionalProperties: false };
  const consumed = action("consumed", "command", [STORAGE, OPTIONAL]);
  consumed.action.audiences = ["user", "plugin", "workflow"];
  const judgment = action("judgment", "command", []); judgment.action.kind = "judgment";
  judgment.action.output_schema = empty;
  const scene: ActionSceneDefinition = { scene_id: "optionaldual.arrived", version: 1, title: "到达", description: "可选消费", scope: "project", trigger: "arrived",
    permissions: [STORAGE, OPTIONAL], configuration_permissions: [STORAGE], subject_kinds: [], event_schema: empty, input_schema: empty, result_schema: empty };
  const manifest: PluginManifest = { schema_version: 1, host_api_version: 1, plugin_id: ID, version: "1.0.0", name: "双实例可选权限", kind: "app",
    publisher: { publisher_id: "example", signature: "optional-dual-test" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: STORAGE, required: true, reason: "探针数据" }, { permission: OPTIONAL, required: false, reason: "可关闭的能力" },
      { permission: DELEGATE, required: false, reason: "运行时首次使用的可选目录" }],
    capabilities: { provides: [], consumes: [consumed.capability_id] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    actions: Object.values(actions), action_scenes: [scene], background: { jobs: [{ job_id: "follow", reason: "可选作业", permissions: [STORAGE, OPTIONAL] },
      { job_id: "required", reason: "独立的必需权限作业", permissions: [STORAGE] }] },
    routes: [{ route_id: "optional", method: "POST", path: "/optional", permission: OPTIONAL }] };
  const effect = async (context: PluginStartContext, mode: Mode, before: () => Promise<void>) => {
    try {
      await wait(mode); await before();
      context.services!.storage!.set(`effect.${mode}`, "done"); return "done";
    } catch (error) {
      // The required storage service must refuse failure bookkeeping too when this call's optional source was withdrawn.
      context.services!.storage!.set(`failure.${mode}`, "failed"); throw error;
    } finally { held.get(mode)?.finished.resolve(); }
  };
  const bindings = new Map<string, ActionSceneBinding>();
  const half = (home: boolean): PluginDefinition => ({ manifest, start(context) {
    contexts.set(home ? "home" : context.project_id!, context);
    if (home) return { kind: "app" };
    const handlers = Object.entries(actions).map(([name, definition]) => ({ ...definition, handle: async (caller: ActionExecutionContext, input: unknown) => {
      if (name === "required") return "required";
      if (name === "delegate") return context.services!.actions!.directory!.invoke(consumed, {});
      if (name === "query") { await wait("query"); return "late"; }
      if (name === "status") return { state: "running" };
      if (name === "keep") {
        await caller.beforeEffect();
        jobs.push(context.services!.background!.keep("follow", async control => { await effect(context, "job", control.beforeEffect); })); return "kept";
      }
      if (name === "keepRequired") {
        await caller.beforeEffect();
        jobs.push(context.services!.background!.keep("required", async control => { jobControls.push(control); await effect(context, "required-job", control.beforeEffect); }));
        return "kept";
      }
      if (name === "background") {
        backgrounds.push(await context.services!.background!.start(control => effect(context, "background", control.beforeEffect)));
        return { id: (input as { id: string }).id, state: "running" };
      }
      if (name === "extra") { context.requireGrant(OPTIONAL); return effect(context, "extra", caller.beforeEffect); }
      return effect(context, "write", caller.beforeEffect);
    } }));
    return { kind: "app", actions: handlers, routes: [{ route_id: "optional", async handle(request) {
      if ((request.body as { keepRequired?: boolean })?.keepRequired) return { status: 200, body: await context.services!.actions!.invoke(actions.keepRequired, {}, request.execution) };
      if ((request.body as { self?: boolean | string })?.self) return { status: 200, body: (request.body as { self: boolean | string }).self === "plain"
        ? await context.services!.actions!.invoke(actions.plain, {}) : await context.services!.actions!.invoke(actions.write, {}, request.execution) };
      await effect(context, "route", request.execution!.beforeEffect); return { status: 200, body: { ok: true } };
    } }], action_scenes: [{ scene_id: scene.scene_id, version: 1, bindings: () => [...bindings.values()], bind: (_caller, binding) => { bindings.set(binding.binding_id, binding); },
      prepare: (_caller, event) => ({ input: event }), consume: async caller => { await effect(context, "scene", caller.beforeEffect); return {}; } }] };
  } });
  const target: PluginDefinition = { manifest: { ...manifest, plugin_id: "io.molis.work.example.optionaldual-target", name: "被消费的提供方", publisher: { publisher_id: "example", signature: "optional-target" },
    permissions: manifest.permissions.map(item => ({ ...item, required: true })), capabilities: { provides: [], consumes: [] }, actions: [consumed, judgment], action_scenes: [], background: undefined, routes: [] },
    start(context) { contexts.set(`target:${context.project_id}`, context); return { kind: "app", actions: [
      { ...consumed, handle: caller => effect(context, "consume", caller.beforeEffect) }, { ...judgment, handle: async () => { await wait("judgment"); return {}; } },
    ] }; } };
  return { home: half(true), project: half(false), target, actions, scene, consumed, judgment, contexts, hold, wait, jobs, jobControls, backgrounds,
    stored: (projectId: string, mode: Mode, failure = false, target = false) => contexts.get(target ? `target:${projectId}` : projectId)!.services!.storage!.get(`${failure ? "failure" : "effect"}.${mode}`) };
}

async function open(t: TestContext) {
  const p = probe(), fixtures = { home: [{ definition: p.home, dual_instance: true as const }], project: [p.project, p.target] };
  const f = await serveHomeRuntime(t, { pluginFixtures: fixtures, actionAvailability: async (caller, view) => {
    if (caller.audience === "plugin" && view.capability_id === p.consumed.capability_id) await p.wait("discovery");
    return view.availability;
  } });
  const home = await f.host.homePlugins!.ready(), a = await f.project("可选权限甲"), b = await f.project("可选权限乙");
  await f.host.localPersonContext(a.reference); await f.host.localPersonContext(b.reference);
  const platform = async (project = a) => {
    const found = await f.host.withProject(project.reference, runtime => runningProjectPlatform(runtime.store, runtime.project_id)); assert.ok(found); return found;
  };
  const installation = f.host.homePlugins!.installation(ID)!;
  const switchHome = async (granted: boolean, permission = OPTIONAL) => {
    const response = await f.request("/api/settings/plugin-permissions/set", { method: "POST", body: { install_id: installation.install_id, permission, granted } });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  await switchHome(true);
  for (const project of [a, b]) await (await platform(project)).runtime.regrant(installation.install_id, OPTIONAL, true);
  const caller = (project = a) => f.host.localPersonContext(project.reference);
  const invoke = async (action: ActionDefinition, input: unknown = {}, project = a, retained?: ActionCallContext) => f.host.actionClient(project.reference).invoke(retained ?? await caller(project), action, input);
  const cycle = async () => { await switchHome(false); await switchHome(true); };
  return { ...f, homeDirectory: f.home, p, a, b, home, fixtures, platform, installation, switchHome, caller, invoke, cycle };
}

test("RAC-2906 RAC-2910 two projects intersect own grants with the Home switch; the project setter rejects without changing either ledger", { timeout: 90_000 }, async t => {
  const f = await open(t), { p } = f;
  assert.equal(await f.invoke(p.actions.query), "late"); assert.equal(await f.invoke(p.actions.query, {}, f.b), "late");
  const a = await f.platform(), b = await f.platform(f.b), before = a.runtime.get(f.installation.install_id), other = b.runtime.get(f.installation.install_id);
  const refused = await f.request(`/projects/${f.a.project_id}/api/plugin-trust/permissions/set`, { method: "POST", body: { install_id: before.install_id, permission: OPTIONAL, granted: false } });
  assert.equal(refused.status, 400); assert.equal((await refused.json()).code, "plugin.grant_denied");
  assert.deepEqual(a.runtime.get(before.install_id), before); assert.equal(f.home.runtime.get(before.install_id).grants.includes(OPTIONAL), true);
  await a.runtime.regrant(before.install_id, OPTIONAL, false);
  await assert.rejects(f.invoke(p.actions.query)); assert.equal(await f.invoke(p.actions.query, {}, f.b), "late", "Home cannot supply the project's missing grant");
  await f.switchHome(false);
  await assert.rejects(f.invoke(p.actions.query, {}, f.b)); assert.equal(await f.invoke(p.actions.required, {}, f.b), "required");
  assert.deepEqual(b.runtime.get(other.install_id), other, "Home does not rewrite the project's state, generation or grants");
  const list = await f.request("/api/settings/plugin-permissions/list", { method: "POST", body: {} });
  const body = await list.json(); assert.equal(body.plugins.find((row: { install_id: string }) => row.install_id === before.install_id).permissions.find((row: { permission: string }) => row.permission === OPTIONAL).granted, false);
  await f.switchHome(true); assert.equal(await f.invoke(p.actions.query, {}, f.b), "late");
});

for (const mode of ["write", "query", "extra", "job", "background", "route", "scene", "consume"] as const) {
  test(`RAC-2907 RAC-2908 ${mode}: off→on never revives an accepted call, effect or failure row; a new call works`, { timeout: 90_000 }, async t => {
    const f = await open(t), { p } = f, latch = p.hold(mode), platform = await f.platform();
    t.after(() => latch.release.resolve());
    const original = platform.runtime.get(f.installation.install_id);
    let call: Promise<unknown>;
    if (mode === "job") { await f.invoke(p.actions.keep); call = p.jobs.at(-1)!.done; }
    else if (mode === "background") { await f.invoke(p.actions.background, { id: "old" }); call = p.backgrounds.at(-1)!.result; }
    else if (mode === "route") call = f.request(`/projects/${f.a.project_id}/api/plugins/${ID}/optional`, { method: "POST", body: {} }).then(async response => {
      if (response.status !== 200) throw Object.assign(new Error("route refused"), await response.json()); return response.json();
    });
    else if (mode === "scene") {
      const client = f.host.sceneClient(f.a.reference), caller = await f.caller();
      await client.bind(caller, { binding_id: "optional", scene_id: p.scene.scene_id, scene_version: 1, project_id: f.a.project_id,
        function: p.judgment, enabled: true, title: "可选绑定", href: "/" });
      call = client.runScene(caller, p.scene, "optional", {});
    } else if (mode === "consume") call = p.contexts.get(f.a.project_id)!.services!.actions!.invoke(p.consumed, {});
    else call = f.invoke(p.actions[mode]);
    const outcome = call.then(value => ({ value, error: undefined }), (error: unknown) => ({ value: undefined, error }));
    await Promise.race([latch.entered.promise, outcome.then(value => { throw new Error(`settled before accepted: ${JSON.stringify(value)}`); })]);
    await f.cycle(); latch.release.resolve();
    const result = await outcome; assert.ok(result.error, `old ${mode} result must be refused`);
    assert.equal(result.value, undefined); assert.deepEqual(platform.runtime.get(original.install_id), original);
    if (mode !== "query") {
      await latch.finished.promise;
      assert.equal(p.stored(f.a.project_id, mode, false, mode === "consume"), null);
      assert.equal(p.stored(f.a.project_id, mode, true, mode === "consume"), null);
    }
    if (mode === "write" || mode === "query" || mode === "extra") assert.ok(await f.invoke(p.actions[mode]));
    else if (mode === "consume") assert.equal(await p.contexts.get(f.a.project_id)!.services!.actions!.invoke(p.consumed, {}), "done");
    else if (mode === "job") { await f.invoke(p.actions.keep); await p.jobs.at(-1)!.done; }
    else if (mode === "background") { await f.invoke(p.actions.background, { id: "new" }); await p.backgrounds.at(-1)!.result; }
    else if (mode === "route") assert.equal((await f.request(`/projects/${f.a.project_id}/api/plugins/${ID}/optional`, { method: "POST", body: {} })).status, 200);
    else await f.host.sceneClient(f.a.reference).runScene(await f.caller(), p.scene, "optional", {});
    if (mode !== "query") assert.equal(p.stored(f.a.project_id, mode, false, mode === "consume"), "done");
  });
}

test("RAC-2908 an old local-user context stays revoked after regrant, and discovery excludes the optional action while off", { timeout: 90_000 }, async t => {
  const f = await open(t), old = await f.caller();
  await f.switchHome(false);
  const views = await f.host.actionClient(f.a.reference).discover(await f.caller());
  assert.equal(views.some(view => view.capability_id === f.p.actions.query.capability_id), false);
  assert.ok(views.some(view => view.capability_id === f.p.actions.required.capability_id));
  await f.switchHome(true); await assert.rejects(f.invoke(f.p.actions.query, {}, f.a, old));
  assert.equal(await f.invoke(f.p.actions.required, {}, f.a, old), "required");
  assert.equal(await f.invoke(f.p.actions.query), "late");
});

test("RAC-2907 a scene also retains the original permission while its judgment is waiting", { timeout: 90_000 }, async t => {
  const f = await open(t), latch = f.p.hold("judgment"), caller = await f.caller(), client = f.host.sceneClient(f.a.reference);
  t.after(() => latch.release.resolve());
  await client.bind(caller, { binding_id: "judgment-wait", scene_id: f.p.scene.scene_id, scene_version: 1, project_id: f.a.project_id,
    function: f.p.judgment, enabled: true, title: "判断期间撤权", href: "/" });
  const call = client.runScene(caller, f.p.scene, "judgment-wait", {});
  const outcome = call.then(value => ({ value, error: undefined }), (error: unknown) => ({ value: undefined, error }));
  await Promise.race([latch.entered.promise, outcome.then(value => { throw new Error(`settled before judgment: ${JSON.stringify(value)}`); })]);
  await f.cycle(); latch.release.resolve();
  assert.ok((await outcome).error, "old scene must be refused before the consumer is entered");
  assert.equal(f.p.stored(f.a.project_id, "scene"), null);
  assert.equal(f.p.stored(f.a.project_id, "scene", true), null);
  await client.runScene(await f.caller(), f.p.scene, "judgment-wait", {});
  assert.equal(f.p.stored(f.a.project_id, "scene"), "done");
});

test("RAC-2908 a no-outer SDK call captures before asynchronous provider discovery", { timeout: 90_000 }, async t => {
  const f = await open(t), latch = f.p.hold("discovery"); t.after(() => latch.release.resolve());
  const call = f.p.contexts.get(f.a.project_id)!.services!.actions!.invoke(f.p.consumed, {});
  const outcome = call.then(value => ({ value, error: undefined }), (error: unknown) => ({ value: undefined, error }));
  await Promise.race([latch.entered.promise, outcome.then(value => { throw new Error(`settled before directory: ${JSON.stringify(value)}`); })]);
  await f.cycle(); latch.release.resolve();
  assert.ok((await outcome).error); assert.equal(f.p.stored(f.a.project_id, "consume", false, true), null);
  assert.equal(f.p.stored(f.a.project_id, "consume", true, true), null);
  assert.equal(await f.p.contexts.get(f.a.project_id)!.services!.actions!.invoke(f.p.consumed, {}), "done");
});

test("RAC-2907 RAC-2908 an optional directory grant first used by a required-only source prevents a different provider's late effect and failure", { timeout: 90_000 }, async t => {
  const f = await open(t), platform = await f.platform();
  await f.switchHome(true, DELEGATE); await platform.runtime.regrant(f.installation.install_id, DELEGATE, true);
  const oldHome = f.p.contexts.get("home"), oldProject = f.p.contexts.get(f.a.project_id), row = platform.runtime.get(f.installation.install_id);
  const latch = f.p.hold("consume"); t.after(() => latch.release.resolve());
  const pending = f.invoke(f.p.actions.delegate).then(value => ({ value, error: undefined }), (error: unknown) => ({ value: undefined, error }));
  await Promise.race([latch.entered.promise, pending.then(value => { throw new Error(`settled before target: ${JSON.stringify(value)}`); })]);
  await f.switchHome(false, DELEGATE); await f.switchHome(true, DELEGATE);
  assert.equal(f.p.contexts.get(f.a.project_id), oldProject); assert.notEqual(f.p.contexts.get("home"), oldHome);
  assert.equal(f.home.runtime.get(f.installation.install_id).installation_generation, f.installation.installation_generation);
  latch.release.resolve(); assert.ok((await pending).error); await latch.finished.promise;
  assert.equal(f.p.stored(f.a.project_id, "consume", false, true), null);
  assert.equal(f.p.stored(f.a.project_id, "consume", true, true), null);
  assert.deepEqual(platform.runtime.get(f.installation.install_id), row);
  assert.equal(await f.invoke(f.p.actions.required), "required");
  assert.equal(await f.invoke(f.p.actions.delegate), "done");
});

test("RAC-2908 route admission captures before ensureStarted waits", { timeout: 90_000 }, async t => {
  const f = await open(t), platform = await f.platform(), entered = deferred(), release = deferred(); t.after(() => release.resolve());
  const router = new PluginRouteRouter({ generation: id => platform.supervisor.generation(id), ensureStarted: async id => {
    entered.resolve(); await release.promise; return platform.supervisor.ensureStarted(id);
  } }, [f.p.project.manifest], { capturePermission: (_id, permission) => platform.runtime.capturePermission(f.installation.install_id, permission) });
  const input = { method: "POST", pathname: `/api/plugins/${ID}/optional`, actor_id: "local-host", granted: [STORAGE, OPTIONAL], execution: { beforeEffect: async () => {} } };
  const call = router.dispatch(input); await entered.promise; await f.cycle(); release.resolve();
  const old = await call; assert.equal(old?.status, 400); assert.equal((old?.body as { code: string }).code, "plugin.grant_denied");
  assert.equal(f.p.stored(f.a.project_id, "route"), null); assert.equal(f.p.stored(f.a.project_id, "route", true), null);
  assert.equal((await router.dispatch(input))?.status, 200); assert.equal(f.p.stored(f.a.project_id, "route"), "done");
});

for (const mode of ["sdk", "route", "route-plain"] as const) {
  test(`RAC-2908 ${mode} nested own action cannot replace the source call's fence with its own ALS`, { timeout: 90_000 }, async t => {
    const f = await open(t), latch = f.p.hold("write"); t.after(() => latch.release.resolve());
    const invoke = () => mode !== "sdk" ? f.request(`/projects/${f.a.project_id}/api/plugins/${ID}/optional`, { method: "POST", body: { self: mode === "route-plain" ? "plain" : true } }).then(async response => {
      if (response.status !== 200) throw Object.assign(new Error("route refused"), await response.json()); return response.json();
    }) : f.p.contexts.get(f.a.project_id)!.services!.actions!.invoke(f.p.actions.write, {});
    const pending = invoke().then(value => ({ value, error: undefined }), (error: unknown) => ({ value: undefined, error }));
    await Promise.race([latch.entered.promise, pending.then(value => { throw new Error(`settled before own handler: ${JSON.stringify(value)}`); })]);
    await f.cycle(); latch.release.resolve(); assert.ok((await pending).error);
    assert.equal(f.p.stored(f.a.project_id, "write"), null, "old own action must not commit before the outer result is refused");
    assert.equal(f.p.stored(f.a.project_id, "write", true), null);
    await invoke(); assert.equal(f.p.stored(f.a.project_id, "write"), "done");
  });
}

for (const source of ["action", "route", "sdk"] as const) {
  test(`RAC-2909 S-52 a required-only job outlives its optional ${source} source and survives the sweep after Home is off`, { timeout: 90_000 }, async t => {
    const f = await open(t), latch = f.p.hold("required-job"), platform = await f.platform(), before = platform.runtime.get(f.installation.install_id);
    // Observe the real sweep checkpoint. Native timers retain their creating ALS; fake timer ticks do not model that inheritance.
    const schedule = globalThis.setInterval, swept = deferred(); let watch = false;
    t.mock.method(globalThis, "setInterval", (callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => schedule((...values: unknown[]) => {
      try { callback(...values); } finally { if (watch && callback.name === "sweep") swept.resolve(); }
    }, delay, ...args));
    try {
      if (source === "action") assert.equal(await f.invoke(f.p.actions.keepRequired), "kept");
      else if (source === "sdk") assert.equal(await f.p.contexts.get(f.a.project_id)!.services!.actions!.invoke(f.p.actions.keepRequired, {}), "kept");
      else {
        const response = await f.request(`/projects/${f.a.project_id}/api/plugins/${ID}/optional`, { method: "POST", body: { keepRequired: true } });
        assert.equal(response.status, 200); assert.equal(await response.json(), "kept");
      }
      // Awaiting the source's returned answer proves it ended; only the independent required job remains waiting.
      await latch.entered.promise;
      const job = f.p.jobs.at(-1)!, control = f.p.jobControls.at(-1)!, done = job.done.then(() => ({ error: undefined }), (error: unknown) => ({ error }));
      assert.deepEqual(f.p.project.manifest.background!.jobs.find(item => item.job_id === control.job)!.permissions, [STORAGE]);
      await f.switchHome(false);
      watch = true;
      if (!control.signal.aborted) await Promise.race([swept.promise, done]);
      const aborted = control.signal.aborted;
      latch.release.resolve(); const result = await done;
      assert.equal(aborted, false, "the independent required job must not inherit its ended source's optional fence");
      assert.equal(result.error, undefined); assert.equal(f.p.stored(f.a.project_id, "required-job"), "done");
      assert.equal(f.p.stored(f.a.project_id, "required-job", true), null);
      assert.deepEqual(platform.runtime.get(f.installation.install_id), before);
    } finally { latch.release.resolve(); t.mock.restoreAll(); }
  });
}

test("RAC-2909 missing/stopped/reinstalled Home denies only optional capabilities; cold startup preserves off", { timeout: 90_000 }, async t => {
  const f = await open(t), platform = await f.platform(), project = platform.runtime.get(f.installation.install_id), old = await f.caller();

  await f.home.runtime.stop(f.installation.install_id);
  await assert.rejects(f.invoke(f.p.actions.query)); assert.equal(await f.invoke(f.p.actions.required), "required");
  await f.home.runtime.uninstall(f.installation.install_id, { keep_data: true });
  await assert.rejects(f.invoke(f.p.actions.query)); assert.equal(await f.invoke(f.p.actions.required), "required");
  const replacement = f.home.runtime.install({ trust: { level: "unsigned" }, definition: f.p.home, deployment: "local", grants: [STORAGE, OPTIONAL] }).install;
  await f.home.runtime.start(replacement.install_id);
  assert.notEqual(replacement.installation_generation, f.installation.installation_generation);
  await assert.rejects(f.invoke(f.p.actions.query, {}, f.a, old)); assert.equal(await f.invoke(f.p.actions.query), "late");
  assert.deepEqual(platform.runtime.get(project.install_id), project);
  await f.switchHome(false); await f.host.close();
  const reopened = await serveHomeRuntime(t, { homeDirectory: f.homeDirectory, pluginFixtures: f.fixtures });
  try {
    await reopened.host.homePlugins!.ready();
    const caller = await reopened.host.localPersonContext(f.a.reference);
    assert.equal(reopened.host.homePlugins!.installation(ID)!.grants.includes(OPTIONAL), false);
    await assert.rejects(reopened.host.actionClient(f.a.reference).invoke(caller, f.p.actions.query, {}));
    assert.equal(await reopened.host.actionClient(f.a.reference).invoke(caller, f.p.actions.required, {}), "required");
  } finally { await reopened.host.close(); } // Both hosts close before the first fixture removes their shared temporary Home.
});
