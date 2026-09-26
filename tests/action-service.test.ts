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
  const bindings = new Map<string, ActionSceneBinding>([[binding.binding_id, { ...binding, function: { ...binding.function, provider_id: provider.provider_id } }]]);
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
    const bindings = new Map<string, ActionSceneBinding>([[binding.binding_id, { ...binding, function: { ...binding.function, provider_id: provider.provider_id } }]]);
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
    scenes: [scene], scene_handlers: [consumer(new Map([[binding.binding_id, { ...binding, function: { ...binding.function, provider_id: provider.provider_id } }]]), () => { consumed = true; })] });
  await assert.rejects(service.runScene(context, scene, binding.binding_id, { text: "broken" }), (e: ActionError) => e.code === "actions.output_invalid");
  assert.equal(consumed, false);
});

test("scene prepares private context from a validated event and snapshots the binding before preparation", async () => {
  const service = new ActionService();
  const current = { ...binding, function: { ...binding.function, provider_id: provider.provider_id }, revision: "before" };
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
  const saved = new Map([[binding.binding_id, { ...binding, function: { ...binding.function, provider_id: provider.provider_id }, revision: "1" }]]);
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
  beforeFailure = () => { saved.set(binding.binding_id, { ...binding, function: { ...binding.function, provider_id: provider.provider_id }, revision: "2" }); };
  await assert.rejects(service.runScene(context, scene, binding.binding_id, { text: "valid" }), { code: "actions.binding_changed" });
  assert.equal(failures, 1);
  saved.set(binding.binding_id, { ...binding, function: { ...binding.function, provider_id: provider.provider_id }, revision: "1" });
  const controller = new AbortController();
  beforeFailure = () => controller.abort(new Error("cancelled"));
  await assert.rejects(service.runScene({ ...context, signal: controller.signal }, scene, binding.binding_id, { text: "valid" }), /cancelled/);
  assert.equal(failures, 1);
});

test("scene bindings pin the registered provider and cannot silently follow a replacement with the same action ID", async () => {
  const service = new ActionService();
  const bindings = new Map<string, ActionSceneBinding>();
  let consumed = 0;
  const stop = service.registerProvider({ provider, definitions: [judgment], handlers: [{ ...judgment, handle: () => ({ follow_up: true }) }] });
  service.registerProvider({ provider: { provider_id: "feedback", title: "Feedback", kind: "plugin" }, definitions: [], handlers: [], scenes: [scene],
    scene_handlers: [consumer(bindings, () => { consumed++; })] });
  await service.bind(context, binding);
  assert.equal(bindings.get(binding.binding_id)!.function.provider_id, provider.provider_id);
  stop();
  const replacement = { ...provider, provider_id: "replacement.judge" };
  service.registerProvider({ provider: replacement, definitions: [judgment], handlers: [{ ...judgment, handle: () => ({ follow_up: true }) }] });
  assert.equal((await service.usages(context))[0]!.availability.available, false);
  await assert.rejects(service.runScene(context, scene, binding.binding_id, { text: "old reference" }), { code: "actions.scene_incompatible" });
  assert.equal(consumed, 0);
  await service.bind(context, { ...binding, function: { ...binding.function, provider_id: replacement.provider_id } });
  await service.runScene(context, scene, binding.binding_id, { text: "explicit new binding" });
  assert.equal(consumed, 1);
  bindings.set(binding.binding_id, binding);
  const unpinned = (await service.usages(context))[0]!;
  assert.equal(unpinned.enabled, true);
  assert.equal(unpinned.availability.available, false, "an old unpinned binding remains visible but cannot follow a new provider");
  await assert.rejects(service.runScene(context, scene, binding.binding_id, { text: "legacy unpinned reference" }), { code: "actions.binding_invalid" });
  assert.equal(consumed, 1);
  await service.bind(context, binding);
  assert.equal(bindings.get(binding.binding_id)!.function.provider_id, replacement.provider_id);
});

test("single capability lookups keep metadata and project isolation without copying unrelated descriptors", async () => {
  const { CapabilityRegistry } = await import("@molis-ai/molis-work-kernel");
  class CountingRegistry extends CapabilityRegistry<ActionCallContext> {
    directoryCopies = 0;
    override descriptors() { this.directoryCopies++; return super.descriptors(); }
  }
  const registry = new CountingRegistry(); const service = new ActionService(registry);
  const read: ActionDefinition = { capability_id: "lookup.note.read", version: 1, operation: "query", action: {
    title: "Original title", description: "Read this project's record", kind: "query", scope: "project", audiences: ["user"], permissions: [], subject_kinds: ["note"],
    input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "object", properties: { project: { type: "string" } }, required: ["project"], additionalProperties: false } } };
  const write = { ...read, capability_id: "lookup.note.update", operation: "command" as const, action: { ...read.action, kind: "operation" as const, required_actions: [{ capability_id: read.capability_id, version: 1 }] } };
  const register = (project: string) => service.registerProvider({ provider: { provider_id: "notes-" + project, title: "Notes", kind: "plugin", project_id: project },
    definitions: [read, write], handlers: [{ ...read, handle: () => ({ project }) }, { ...write, handle: () => ({ project }) }] });
  const stopA = register("a"), stopB = register("b");
  const copy = registry.descriptor(read, "a")!;
  (copy.action as { title: string }).title = "Changed by consumer";
  assert.equal(registry.descriptor(read, "a")!.action!.title, "Original title");
  assert.equal(registry.descriptor(read)?.action_provider, undefined);
  assert.deepEqual(await service.invoke({ ...context, project_id: "a" }, write, {}), { project: "a" });
  assert.deepEqual(await service.invoke({ ...context, project_id: "b" }, write, {}), { project: "b" });
  assert.equal(registry.directoryCopies, 0, "normal dispatch and dependency checks resolve only their target");
  const visible = service.discover({ ...context, project_id: "a" });
  assert.ok(visible.every(view => view.provider.project_id === "a" && view.availability.available));
  assert.equal(registry.directoryCopies, 1, "one full directory copy serves discovery; dependency checks do not copy it again");
  await assert.rejects(service.invoke({ ...context, project_id: "foreign" }, write, {}), { code: "actions.scope_mismatch" });
  await assert.rejects(service.invoke({ ...context, project_id: "a" }, { ...write, provider_id: "notes-b" }, {}), { code: "actions.provider_changed" });
  stopA(); assert.equal(registry.descriptor(read, "a"), undefined);
  assert.deepEqual(await service.invoke({ ...context, project_id: "b" }, write, {}), { project: "b" }); stopB();
});

test("persisted consumer bindings cannot run a judgment authored for a different scene provider", async () => {
  const service = new ActionService();
  let consumed = 0;
  const intent = { scene_id: scene.scene_id, version: scene.version, provider_id: "original-scene" };
  const authored = { ...judgment, action: { ...judgment.action, result_scene: intent } };
  service.registerProvider({ provider, definitions: [authored], handlers: [{ ...authored, handle: () => ({ follow_up: true }) }] });
  const saved = new Map([[binding.binding_id, { ...binding, function: { capability_id: judgment.capability_id, version: judgment.version, provider_id: provider.provider_id } }]]);
  const register = (provider_id: string) => service.registerProvider({ provider: { provider_id, title: "Consumer", kind: "plugin" }, definitions: [], handlers: [],
    scenes: [scene], scene_handlers: [consumer(saved, () => { consumed++; return "consumed"; })] });
  const stop = register(intent.provider_id);
  assert.equal(await service.runScene(context, scene, binding.binding_id, { text: "Original feedback" }), "consumed");
  stop(); register("replacement-scene");
  assert.equal(service.discoverScenes(context, authored)[0]!.compatible, false);
  await assert.rejects(service.runScene(context, scene, binding.binding_id, { text: "Original feedback" }), { code: "actions.scene_incompatible" });
  assert.equal(consumed, 1, "original persisted bindings do not delegate authored intent to a replacement provider");
  assert.deepEqual(await service.invoke(context, authored, { text: "Independent judgment" }), { follow_up: true });
});

test("unknown Runtime scene exposes actual configuration targets and preserves owner CAS, grants and provider identity", async () => {
  const service = new ActionService();
  let stopJudgment = service.registerProvider({ provider, definitions: [judgment], handlers: [{ ...judgment, handle: () => ({ follow_up: true }) }] });
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE config (id TEXT PRIMARY KEY, revision TEXT NOT NULL, binding TEXT NOT NULL)");
  let serial = 0;
  let needsActivation = false;
  const current = () => {
    const row = db.prepare("SELECT revision, binding FROM config WHERE id = 'real-slot'").get() as { revision: string; binding: string } | undefined;
    return row ? { ...JSON.parse(row.binding), revision: row.revision } as ActionSceneBinding : null;
  };
  const configurable = { ...scene, configuration_permissions: ["notes:write"] };
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.configurable", version: "1.0.0", name: "配置位置插件",
    kind: "app", publisher: { publisher_id: "example", signature: "fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: ["notes:write", "notes:activate"].map(permission => ({ permission, required: false, reason: "配置原业务规则" })), capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
    ui: { contributions: [] }, actions: [], action_scenes: [configurable] }, async start() { return { kind: "app", action_scenes: [{ ...configurable,
      targets: () => [{ binding_id: "real-slot", title: "实际客户反馈规则", href: "/real-settings", revision: current()?.revision ?? null, activation_permissions: needsActivation ? ["notes:activate"] : [] }],
      bindings: () => { const value = current(); return value ? [value] : []; },
      bind: (_caller, value, options) => {
        const revision = String(++serial);
        const write = options?.expected_revision === null
          ? db.prepare("INSERT INTO config VALUES ('real-slot', ?, ?) ON CONFLICT(id) DO NOTHING").run(revision, JSON.stringify(value))
          : db.prepare("UPDATE config SET revision = ?, binding = ? WHERE id = 'real-slot' AND revision = ?").run(revision, JSON.stringify(value), options?.expected_revision ?? current()?.revision ?? "");
        if (write.changes !== 1) throw new ActionError("fixture.conflict", "原配置已变化");
      }, consume: (_caller, _input, result) => result,
    }] }; } });
  const repository = new MemoryPluginRuntimeRepository();
  const runtime = new PluginRuntime(repository, undefined, { actions: { registry: service, project_id: context.project_id! } });
  const installed = runtime.install({ definition: plugin, deployment: "local", grants: [] }).install;
  await runtime.start(installed.install_id);
  try {
    const fn = { ...judgment, provider_id: provider.provider_id };
    let target = (await service.targets(context, fn))[0]!;
    assert.equal(target.binding, null); assert.equal(target.binding_id, "real-slot");
    assert.equal(target.availability.available, false, "the caller's permission is not a plugin installation grant");
    const value = { ...binding, binding_id: target.binding_id, function: fn, title: "forged title", href: "/forged" };
    await assert.rejects(service.bind(context, value, { provider_id: target.provider_id, expected_revision: null }), { code: "actions.plugin_permission" });
    repository.save({ ...runtime.get(installed.install_id), grants: ["notes:write"] });
    target = (await service.targets(context, fn))[0]!;
    assert.equal(target.availability.available, true);
    assert.equal((await service.targets({ ...context, permissions: [] }, fn))[0]!.availability.available, false);
    assert.deepEqual(await service.targets({ ...context, project_id: "other" }, fn), []);
    await assert.rejects(service.bind(context, value, { provider_id: "wrong-provider", expected_revision: null }), { code: "actions.provider_changed" });
    await service.bind(context, value, { provider_id: target.provider_id, expected_revision: null });
    assert.equal(current()?.title, "实际客户反馈规则"); assert.equal(current()?.href, "/real-settings");
    assert.equal(current()?.function.provider_id, provider.provider_id);
    await assert.rejects(service.bind(context, value, { provider_id: target.provider_id, expected_revision: null }), { code: "actions.binding_changed" });
    needsActivation = true;
    const activationCaller = { ...context, permissions: [...context.permissions, "notes:activate"] };
    repository.save({ ...runtime.get(installed.install_id), grants: ["notes:write", "notes:activate"] });
    await assert.rejects(service.bind(activationCaller, value, { provider_id: target.provider_id, expected_revision: current()!.revision!, before_write: () => {
      repository.save({ ...runtime.get(installed.install_id), grants: ["notes:write"] });
    } }), { code: "actions.plugin_permission" });
    assert.equal(current()?.enabled, true, "revoking an activation permission during the shared check prevents the owner write");
    needsActivation = false;
    const revision = current()!.revision!;
    await assert.rejects(service.bind({ ...context, validate_authority: () => { db.prepare("UPDATE config SET revision = 'concurrent-edit' WHERE id = 'real-slot'").run(); } },
      value, { provider_id: target.provider_id, expected_revision: revision }), { code: "fixture.conflict" });
    assert.equal(current()?.revision, "concurrent-edit", "the original owner prevents a write after asynchronous checks used an older target");
    await assert.rejects(service.bind(context, value, { provider_id: target.provider_id, expected_revision: "concurrent-edit", before_write: () => {
      stopJudgment();
      stopJudgment = service.registerProvider({ provider, definitions: [judgment], handlers: [{ ...judgment, handle: () => ({ follow_up: false }) }] });
    } }), { code: "actions.provider_changed" });
    assert.equal(current()?.revision, "concurrent-edit", "same identity reloaded during authorization cannot change the original config");
    await assert.rejects(service.bind(context, { ...current()!, enabled: false }, { provider_id: target.provider_id, expected_revision: "concurrent-edit",
      before_write: () => { throw new ActionError("actions.forbidden", "management grant revoked"); } }), { code: "actions.forbidden" });
    assert.equal(current()?.enabled, true, "disable also rechecks its originating management grant");
    await service.bind(context, { ...current()!, enabled: false }, { provider_id: target.provider_id, expected_revision: "concurrent-edit" });
    assert.equal(current()?.enabled, false);
    repository.save({ ...runtime.get(installed.install_id), grants: [] });
    assert.equal((await service.targets(context, fn))[0]!.availability.available, false);
    await runtime.stop(installed.install_id);
    assert.deepEqual(await service.targets(context, fn), []);
    assert.ok(current(), "stopping a scene provider preserves its original configuration");
  } finally { await runtime.stop(installed.install_id); db.close(); }
});

test("shared registration schemas retain independent validation and later registration adopts changed contracts", async () => {
  const service = new ActionService();
  const shared = { type: "object", properties: { nested: { type: "object", properties: { count: { type: "integer", minimum: 1 } }, required: ["count"] } }, required: ["nested"] };
  const definitions = ["shared.first", "shared.second"].map(capability_id => ({ ...judgment, capability_id, action: { ...judgment.action, input_schema: shared, output_schema: shared } }));
  const register = () => service.registerProvider({ provider, definitions, handlers: definitions.map(definition => ({ ...definition, handle: (_caller, input) => input })) });
  let dispose = register();
  try {
    for (const definition of definitions) {
      assert.deepEqual(await service.invoke(context, definition, { nested: { count: 2 } }), { nested: { count: 2 } });
      await assert.rejects(service.invoke(context, definition, { nested: { count: "2" } }), { code: "actions.input_invalid" });
    }
    shared.properties.nested.properties.count.minimum = 5;
    assert.deepEqual(await service.invoke(context, definitions[0]!, { nested: { count: 2 } }), { nested: { count: 2 } }, "active registration keeps its frozen contract");
    dispose(); dispose = register();
    for (const definition of definitions) await assert.rejects(service.invoke(context, definition, { nested: { count: 2 } }), { code: "actions.input_invalid" });
  } finally { dispose(); }
});
