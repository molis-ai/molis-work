import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { createActionMcpPorts, actionMcpToolName, handleMcpMessage } from "@molis-ai/molis-work-app-mcp";
import { defineAction, definePlugin } from "../packages/plugin-sdk/src/index.js";
import { MemoryPluginRuntimeRepository, PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { ActionError, type ActionCallContext, type ActionDefinition, type ActionSceneBinding,
  type ActionSceneDefinition, type ActionSceneHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";

const context: ActionCallContext = { actor_id: "alice", project_id: "project-one", audience: "user", permissions: ["notes:write"] };
const provider = { provider_id: "system-judgments", title: "判断规则", kind: "system" as const };
const textInput = { type: "object", properties: { text: { type: "string", minLength: 1 } }, required: ["text"], additionalProperties: false };
const decisionOutput = { type: "object", properties: { follow_up: { type: "boolean" } }, required: ["follow_up"], additionalProperties: false };
const judgment: ActionDefinition = {
  capability_id: "judgments.follow-up", version: 1, operation: "command",
  action: { title: "判断跟进", description: "判断一段反馈是否需要跟进", kind: "judgment", scope: "project",
    audiences: ["user", "workflow", "mcp", "agent"], permissions: [], subject_kinds: ["feedback"],
    input_schema: textInput, output_schema: decisionOutput },
};
const scene: ActionSceneDefinition = { scene_id: "feedback.arrived", version: 1, title: "反馈到达", description: "处理新反馈",
  trigger: "feedback-created", scope: "project", subject_kinds: ["feedback"], input_schema: textInput,
  result_schema: decisionOutput, permissions: [] };
const binding: ActionSceneBinding = { binding_id: "follow-up", scene_id: scene.scene_id, scene_version: 1,
  project_id: context.project_id, function: { capability_id: judgment.capability_id, version: 1 }, enabled: true, title: "客户反馈", href: "/projects/project-one/rules/follow-up" };

function consumer(store: Map<string, ActionSceneBinding>, consume: ActionSceneHandlerBinding["consume"]): ActionSceneHandlerBinding {
  return { scene_id: scene.scene_id, version: 1,
    bindings: () => [...store.values()], bind: (_c, value) => { store.set(value.binding_id, value); }, consume };
}

test("unknown SDK plugin registers a real write and read through Runtime; stopping withdraws both", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, project TEXT NOT NULL, body TEXT NOT NULL)");
  const service = new ActionService();
  const id = "io.molis.work.example.dynamic-notes";
  const write = defineAction<{ text: string }, { id: number }>({
    capability_id: `${id}.create`, version: 1, operation: "command",
    action: { title: "新建笔记", description: "将内容保存到当前项目", kind: "operation", scope: "project",
      audiences: ["user", "workflow", "agent", "mcp"], permissions: ["notes:write"], subject_kinds: ["text"],
      input_schema: textInput, output_schema: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] } },
  }, (c, input) => ({ id: Number(db.prepare("INSERT INTO notes (project, body) VALUES (?, ?)").run(c.project_id, input.text).lastInsertRowid) }));
  const read = defineAction<Record<string, never>, unknown[]>({ capability_id: `${id}.list`, version: 1, operation: "query",
    action: { ...write.definition.action, title: "读取笔记", kind: "query", permissions: [],
      input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "array", items: { type: "object" } } },
  }, c => db.prepare("SELECT id, body FROM notes WHERE project = ? ORDER BY id").all(c.project_id));
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name: "测试笔记",
    kind: "app", publisher: { publisher_id: "example", signature: "example-binding" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: "notes:write", required: false, reason: "保存笔记" }], capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [write.definition, read.definition] },
    async start() { return { kind: "app", actions: [write.handler, read.handler] }; },
  });
  const repository = new MemoryPluginRuntimeRepository();
  const runtime = new PluginRuntime(repository, undefined, { actions: { registry: service, project_id: context.project_id! } });
  try {
    const installed = runtime.install({ definition: plugin, deployment: "local", grants: ["notes:write"] }).install;
    assert.deepEqual(service.discover(context), []);
    await runtime.start(installed.install_id);
    assert.deepEqual(service.discover(context).map(x => x.capability_id), [write.definition.capability_id, read.definition.capability_id]);
    await assert.rejects(service.invoke(context, write.definition, { text: 42 }), (e: ActionError) => e.code === "actions.input_invalid");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM notes").get()!.n, 0);
    assert.deepEqual(await service.invoke(context, write.definition, { text: "Repair the login failure" }), { id: 1 });
    assert.deepEqual(JSON.parse(JSON.stringify(await service.invoke(context, read.definition, {}))), [{ id: 1, body: "Repair the login failure" }]);
    const mcp = createActionMcpPorts({ service, context: () => context, serverInfo: { name: "unknown-plugin-test", version: "1" } });
    const call = async (definition: ActionDefinition, input: unknown, meta?: unknown) => (await handleMcpMessage({ id: 1,
      method: "tools/call", params: { name: actionMcpToolName(definition), arguments: input, _meta: meta } }, mcp))!.result as
      { isError: boolean; structuredContent?: Record<string, unknown> };
    assert.equal((await mcp.tools).length, 2);
    // MCP uses the same Runtime registration and data. Untrusted metadata cannot move the write.
    assert.equal((await call(write.definition, { text: "Saved through MCP" }, { project_id: "other", actor_id: "mallory" })).isError, false);
    assert.deepEqual(JSON.parse(JSON.stringify((await call(read.definition, {})).structuredContent)), { result: [
      { id: 1, body: "Repair the login failure" }, { id: 2, body: "Saved through MCP" },
    ] });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM notes WHERE project = 'other'").get()!.n, 0);
    const denied = { ...context, permissions: [] };
    assert.deepEqual(service.discover(denied).map(d => d.capability_id), [read.definition.capability_id]);
    await assert.rejects(service.invoke(denied, write.definition, { text: "hidden" }), (e: ActionError) => e.code === "actions.forbidden");
    assert.deepEqual(service.discover({ ...context, project_id: "other" }), []);
    await assert.rejects(service.invoke({ ...context, project_id: "other" }, write.definition, { text: "wrong project" }), (e: ActionError) => e.code === "actions.scope_mismatch");
    // Caller permission alone cannot replace a plugin installation's missing grant.
    repository.save({ ...runtime.get(installed.install_id), grants: [] });
    await assert.rejects(service.invoke(context, write.definition, { text: "revoked" }), (e: ActionError) => e.code === "actions.plugin_permission");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM notes").get()!.n, 2);
    assert.equal((await mcp.tools).length, 1);
    assert.equal((await call(write.definition, { text: "revoked via MCP" })).isError, true);
    await runtime.stop(installed.install_id);
    assert.deepEqual(service.discover(context), []);
    assert.deepEqual(await mcp.tools, []);
    assert.equal((await call(read.definition, {})).isError, true);
    await assert.rejects(service.invoke(context, read.definition, {}), (e: ActionError) => e.code === "actions.missing");
    repository.save({ ...runtime.get(installed.install_id), grants: ["notes:write"] });
    await runtime.start(installed.install_id);
    assert.equal((await service.invoke(context, read.definition, {}) as unknown[]).length, 2);
    await runtime.uninstall(installed.install_id);
    assert.deepEqual(service.discover(context), []);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM notes").get()!.n, 2);
  } finally { db.close(); }
});

test("scene binding, reverse usage and real result consumption share the same registered contracts", async () => {
  const service = new ActionService();
  const bindings = new Map<string, ActionSceneBinding>();
  const followed: string[] = [];
  const stopJudgment = service.registerProvider({ provider, definitions: [judgment], handlers: [{ ...judgment,
    handle: (_c, input) => ({ follow_up: (input as { text: string }).text.includes("broken") }) }] });
  service.registerProvider({ provider: { provider_id: "feedback", title: "反馈", kind: "plugin" }, definitions: [], handlers: [], scenes: [scene],
    scene_handlers: [consumer(bindings, (_c, input, result) => {
      if ((result as { follow_up: boolean }).follow_up) followed.push((input as { text: string }).text);
      return { created: followed.length };
    })] });
  assert.equal(service.discoverScenes(context, judgment)[0]!.compatible, true);
  assert.deepEqual(await service.usages(context, judgment), []);
  await service.bind(context, binding);
  assert.equal((await service.usages(context, judgment))[0]!.href, binding.href);
  assert.deepEqual(await service.runScene(context, scene, binding.binding_id, { text: "login broken" }), { created: 1 });
  assert.deepEqual(followed, ["login broken"]);
  assert.deepEqual(await service.runScene(context, scene, binding.binding_id, { text: "thanks" }), { created: 1 });
  await assert.rejects(service.bind({ ...context, project_id: "other" }, binding), (e: ActionError) => e.code === "actions.scope_mismatch");
  stopJudgment();
  const usage = (await service.usages(context))[0]!;
  assert.equal(usage.enabled, true);
  assert.equal(usage.availability.available, false);
  assert.equal(bindings.size, 1);
  await assert.rejects(service.runScene(context, scene, binding.binding_id, { text: "another broken" }), (e: ActionError) => e.code === "actions.scene_incompatible");
  assert.equal(followed.length, 1);
});

test("one directory isolates same capability and scene identities activated in different projects", async () => {
  const service = new ActionService();
  const consumed: string[] = [];
  const register = (project: string) => {
    const bindings = new Map<string, ActionSceneBinding>();
    return service.registerProvider({ provider: { ...provider, project_id: project }, definitions: [judgment],
      handlers: [{ ...judgment, handle: () => ({ follow_up: true }) }], scenes: [scene],
      scene_handlers: [consumer(bindings, () => { consumed.push(project); })] });
  };
  const stopA = register("a"); register("b");
  for (const project of ["a", "b"]) {
    const caller = { ...context, project_id: project };
    assert.equal(service.discover(caller).length, 1);
    assert.equal(service.discoverScenes(caller).length, 1);
    await service.bind(caller, { ...binding, project_id: project });
    await service.runScene(caller, scene, binding.binding_id, { text: "broken" });
  }
  assert.deepEqual(consumed, ["a", "b"]);
  stopA();
  assert.deepEqual(service.discover({ ...context, project_id: "a" }), []);
  await service.runScene({ ...context, project_id: "b" }, scene, binding.binding_id, { text: "still broken" });
  assert.deepEqual(consumed, ["a", "b", "b"]);
});

test("a changed binding during an asynchronous judgment cannot consume the stale result", async () => {
  const service = new ActionService();
  const bindings = new Map<string, ActionSceneBinding>([[binding.binding_id, binding]]);
  let release!: (value: unknown) => void;
  let entered!: () => void;
  const started = new Promise<void>(r => { entered = r; });
  let consumed = 0;
  service.registerProvider({ provider, definitions: [judgment], handlers: [{ ...judgment, handle: async () => {
    entered(); return new Promise(r => { release = r; });
  } }], scenes: [scene], scene_handlers: [consumer(bindings, () => { consumed++; })] });
  const pending = service.runScene(context, scene, binding.binding_id, { text: "broken" });
  await started;
  await service.bind(context, { ...binding, enabled: false });
  release({ follow_up: true });
  await assert.rejects(pending, (e: ActionError) => e.code === "actions.binding_changed");
  assert.equal(consumed, 0);
});

test("registration fails atomically for unfulfilled handlers or invalid schemas", () => {
  const service = new ActionService();
  assert.throws(() => service.registerProvider({ provider, definitions: [judgment], handlers: [] }), (e: ActionError) => e.code === "actions.unredeemed");
  const broken: ActionDefinition = { ...judgment, capability_id: "judgments.invalid", action: { ...judgment.action, input_schema: { type: "nonsense" } } };
  assert.throws(() => service.registerProvider({ provider, definitions: [judgment, broken], handlers: [judgment, broken].map(d => ({ ...d, handle: () => ({ follow_up: true }) })) }), (e: ActionError) => e.code === "actions.schema_invalid");
  assert.deepEqual(service.discover(context), []);
  assert.throws(() => service.registerProvider({ provider, definitions: [], handlers: [], scenes: [scene], scene_handlers: [] }), (e: ActionError) => e.code === "actions.unredeemed");
});

test("reloading either provider during a judgment cannot deliver an old result into the replacement", async () => {
  for (const replace of ["judgment", "scene"] as const) {
    const service = new ActionService();
    const bindings = new Map<string, ActionSceneBinding>([[binding.binding_id, binding]]);
    let release!: (result: unknown) => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    let consumed = 0;
    const registerJudgment = () => service.registerProvider({ provider, definitions: [judgment], handlers: [{ ...judgment,
      handle: async () => { entered(); return new Promise(resolve => { release = resolve; }); } }] });
    const registerScene = () => service.registerProvider({ provider: { ...provider, provider_id: "consumer" }, definitions: [], handlers: [],
      scenes: [scene], scene_handlers: [consumer(bindings, () => { consumed++; })] });
    const stopJudgment = registerJudgment();
    const stopScene = registerScene();
    const pending = service.runScene(context, scene, binding.binding_id, { text: "broken" });
    await started;
    if (replace === "judgment") { stopJudgment(); registerJudgment(); }
    else { stopScene(); registerScene(); }
    release({ follow_up: true });
    await assert.rejects(pending, (e: ActionError) => e.code === "actions.provider_changed");
    assert.equal(consumed, 0);
  }
});

test("input contract and semantic type mismatches are excluded from usable judgment scenes", async () => {
  const service = new ActionService();
  const bad: ActionDefinition = { ...judgment, action: { ...judgment.action, input_type: "invoice", output_type: "decision" } };
  service.registerProvider({ provider, definitions: [bad], handlers: [{ ...bad, handle: () => ({ follow_up: true }) }],
    scenes: [scene], scene_handlers: [consumer(new Map(), () => null)] });
  const view = service.discoverScenes(context, bad)[0]!;
  assert.equal(view.compatible, false);
  assert.equal(view.reason, "输入对象类型不匹配");
  await assert.rejects(service.bind(context, binding), (e: ActionError) => e.code === "actions.scene_incompatible");
});

test("invalid provider output does not reach the scene consumer", async () => {
  const service = new ActionService();
  let consumed = false;
  service.registerProvider({ provider, definitions: [judgment], handlers: [{ ...judgment, handle: () => ({ follow_up: "yes" }) }],
    scenes: [scene], scene_handlers: [consumer(new Map([[binding.binding_id, binding]]), () => { consumed = true; })] });
  await assert.rejects(service.runScene(context, scene, binding.binding_id, { text: "broken" }), (e: ActionError) => e.code === "actions.output_invalid");
  assert.equal(consumed, false);
});

test("scene prepares private context from a validated event and snapshots the binding before preparation", async () => {
  const service = new ActionService();
  const current = { ...binding, revision: "before" };
  const eventScene = { ...scene, event_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false } };
  let prepared = 0, invoked = 0, consumed = 0, mutate = true;
  service.registerProvider({ provider, definitions: [judgment], handlers: [{ ...judgment, handle: (_caller, input) => {
    invoked++; assert.deepEqual(input, { text: "real object context" }); return { follow_up: true };
  } }], scenes: [eventScene], scene_handlers: [{ ...consumer(new Map([[current.binding_id, current]]), (_caller, input, _result, execution) => {
    consumed++; assert.deepEqual(input, { text: "real object context" }); assert.deepEqual(execution.state, { revision: 7 }); return "saved";
  }), prepare: (_caller, event) => {
    prepared++; assert.deepEqual(event, { id: "actual-object" });
    if (mutate) current.revision = "after";
    return { input: { text: "real object context" }, state: { revision: 7 } };
  } }] });
  await assert.rejects(service.runScene(context, eventScene, binding.binding_id, { id: "actual-object", revision: 999 }), { code: "actions.input_invalid" });
  assert.equal(prepared, 0, "caller cannot inject the private consumer state");
  await assert.rejects(service.runScene(context, eventScene, binding.binding_id, { id: "actual-object" }), { code: "actions.binding_changed" });
  assert.equal(invoked, 0, "a changed binding during prepare must not call the model");
  mutate = false;
  assert.equal(await service.runScene(context, eventScene, binding.binding_id, { id: "actual-object" }), "saved");
  assert.equal(invoked, 1); assert.equal(consumed, 1);
});

test("scene failure consumption cannot bypass changed bindings or cancellation", async () => {
  const service = new ActionService();
  const saved = new Map([[binding.binding_id, { ...binding, revision: "1" }]]);
  let failures = 0, beforeFailure: (() => void) | undefined;
  service.registerProvider({ provider, definitions: [judgment], handlers: [{ ...judgment, handle: () => {
    beforeFailure?.(); throw new Error("provider failed");
  } }], scenes: [scene], scene_handlers: [{ ...consumer(saved, () => { throw new Error("must not consume a success"); }),
    failed: (_caller, _input, error, execution) => {
      assert.match((error as Error).message, /provider failed/); assert.equal(execution.binding.revision, "1");
      failures++; return { outcome: "needs_review" };
    },
  }] });
  assert.deepEqual(await service.runScene(context, scene, binding.binding_id, { text: "valid" }), { outcome: "needs_review" });
  beforeFailure = () => { saved.set(binding.binding_id, { ...binding, revision: "2" }); };
  await assert.rejects(service.runScene(context, scene, binding.binding_id, { text: "valid" }), { code: "actions.binding_changed" });
  assert.equal(failures, 1);
  saved.set(binding.binding_id, { ...binding, revision: "1" });
  const controller = new AbortController();
  beforeFailure = () => controller.abort(new Error("cancelled"));
  await assert.rejects(service.runScene({ ...context, signal: controller.signal }, scene, binding.binding_id, { text: "valid" }), /cancelled/);
  assert.equal(failures, 1);
});
