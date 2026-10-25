import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { PluginRuntime, MemoryPluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { definePlugin, defineWorkflowContentActions, bindWorkflowContentHandlers } from "@molis-ai/molis-work-plugin-sdk";
import { ActionError, bindActionClient, WORKFLOW_CONTENT_SCHEMAS, WORKFLOW_CONTENT_VERSIONS, type ActionCallContext, type ActionDefinition, type BoundActionClient, type WorkflowContentActions, type WorkflowPayload } from "@molis-ai/molis-work-contracts/platform/actions";
import { createWorkflowContentPorts, createWorkflowsActionHandlers, manualLink, workflowsActions as w, workflowsManifest, WORKFLOWS_ACTION_PERMISSIONS, type Workflow, type WorkflowInstance } from "@molis-ai/molis-work-plugin-workflows";
import { openWorkflowsStore } from "./fixtures/plugin-home-stores.js";
import { workflowsTestPorts, type WorkflowsPortOptions } from "./fixtures/workflows-actions.js";
import { createActionMcpPorts, actionMcpToolName, handleMcpMessage } from "@molis-ai/molis-work-app-mcp";

const caller: ActionCallContext = { actor_id: "owner", project_id: "project-a", audience: "workflow", permissions: ["drafts:read", "drafts:write"] };
const declarations = defineWorkflowContentActions({ id: "unknown-drafts", title: "未知草稿", icon: "note", create: true, subject_kind: "unknown_draft",
  read_permissions: ["drafts:read"], write_permissions: ["drafts:write"] });

async function fixture(run: (f: {
  home: string; db: DatabaseSync; service: ActionService; runtime: PluginRuntime; install: string;
  ports: ReturnType<typeof createWorkflowContentPorts>; actions: BoundActionClient; store: ReturnType<typeof openWorkflowsStore>;
  /** Every role at its current version; or, with a number, every role of the plugin at that one version (an upgrade or a withdrawal). */
  register(version?: number): Promise<string>;
}) => Promise<void>, portOptions: WorkflowsPortOptions = {}) {
  const home = mkdtempSync(join(tmpdir(), "workflow-action-contract-"));
  const db = new DatabaseSync(join(home, "unknown-plugin.sqlite"));
  db.exec("CREATE TABLE drafts (id INTEGER PRIMARY KEY, project TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL)");
  const service = new ActionService();
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { actions: { registry: service, project_id: caller.project_id! } });
  const register = async (version?: number) => {
    const actions = Object.fromEntries(Object.entries(declarations).map(([role, definition]) => [role, version === undefined ? definition : { ...definition, version }])) as unknown as WorkflowContentActions;
    const plugin = definePlugin({ manifest: {
      upgrade_compatibility: { compatible_from_versions: ["1.0.0"] },
      schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.unknown-drafts", version: `${version ?? 1}.0.0`, name: "未知草稿",
      kind: "app", publisher: { publisher_id: "example", signature: "fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: caller.permissions.map(permission => ({ permission, required: true, reason: "读取和保存草稿" })),
      capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: Object.values(actions),
    }, async start() {
      const create = (title: string, body: string, project: string | null) => {
        const id = db.prepare("INSERT INTO drafts (project, title, body) VALUES (?, ?, ?)").run(project, title, body).lastInsertRowid;
        return { plugin: "unknown-drafts", item_id: String(id), title };
      };
      return { kind: "app", actions: bindWorkflowContentHandlers(actions, {
        list: context => db.prepare("SELECT CAST(id AS TEXT) AS item_id, title, '草稿' AS caption, NULL AS at FROM drafts WHERE project = ? ORDER BY id").all(context.project_id) as never,
        read: ({ item_id }, context) => {
          const item = db.prepare("SELECT title, body FROM drafts WHERE id = ? AND project = ?").get(item_id, context.project_id);
          if (!item) throw new ActionError("actions.missing", "草稿不存在");
          return { ...item } as unknown as WorkflowPayload;
        },
        create: ({ title }, context) => create(title, "", context.project_id),
        receive: ({ title, body }, context) => create(title, body, context.project_id),
      }) };
    } });
    const existing = runtime.list().find(item => item.plugin_id === plugin.manifest.plugin_id);
    const installed = existing ? (await runtime.upgrade({ install_id: existing.install_id, definition: plugin })).install
      : runtime.install({ trust: { level: "unsigned" }, definition: plugin, deployment: "local", grants: [...caller.permissions] }).install;
    await runtime.start(installed.install_id);
    return installed.install_id;
  };
  const store = openWorkflowsStore(home);
  try {
    const install = await register();
    const ports = createWorkflowContentPorts(bindActionClient(service, () => caller));
    // The Workflows actions are registered over the same store and service, the way the Runtime plugin gives them their ports.
    service.registerProvider({ provider: { provider_id: workflowsManifest.plugin_id, title: workflowsManifest.name, kind: "plugin", project_id: caller.project_id! },
      definitions: workflowsManifest.actions!, handlers: createWorkflowsActionHandlers(caller.project_id!, workflowsTestPorts(store, service, portOptions)) });
    const actions = bindActionClient(service, () => ({ ...caller, audience: "user", permissions: [...caller.permissions, ...WORKFLOWS_ACTION_PERMISSIONS] }));
    await run({ home, db, service, runtime, install, ports, actions, store, register });
  } finally {
    for (const installed of runtime.list()) await runtime.stop(installed.install_id);
    store.close(); db.close(); rmSync(home, { recursive: true, force: true });
  }
}

const chain = () => ({ stations: [{ plugin: "unknown-drafts" }, { plugin: "unknown-drafts" }],
  links: [{ ...manualLink(), kind: "function", body_template: "材料：{正文}", title_template: "交接：{标题}" }] });

test("unknown Runtime plugin is discovered, saved, run and read through workflow and MCP with real plugin data", async () => {
  await fixture(async ({ ports, actions, db, store, home, service }) => {
    assert.deepEqual((await ports.stations()).map(s => [s.plugin, s.supported, s.can_start_blank]), [["unknown-drafts", true, true]]);
    const flow = (await actions.invoke(w.create, { title: "未知能力链", chain: chain() })).workflow as Workflow;
    assert.equal(flow.stations[0]!.content!.actions.receive!.capability_id, declarations.receive.capability_id);
    const instance = (await actions.invoke(w.start, { id: flow.workflow_id, title: "原始草稿" })).instance as WorkflowInstance;
    db.prepare("UPDATE drafts SET body = ? WHERE id = ?").run("本地实际内容", instance.steps[0]!.item!.item_id);
    const done = (await actions.invoke(w.continue, { id: instance.instance_id, updated_at: instance.updated_at })).instance as WorkflowInstance;
    assert.equal(done.status, "done");
    assert.deepEqual(await ports.read(done.steps[1]!.item!, done.chain.stations[1]!.content), { title: "交接：原始草稿", body: "材料：本地实际内容" });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM drafts").get()!.n, 2);
    assert.equal(store.instance(done.instance_id, caller.project_id!).steps[0]!.handoff!.input.body, "本地实际内容");
    const reopened = openWorkflowsStore(home);
    try { assert.deepEqual(reopened.instance(done.instance_id, caller.project_id!).chain.stations, done.chain.stations); }
    finally { reopened.close(); }
    const mcp = createActionMcpPorts({ service, context: () => ({ ...caller, audience: "mcp" }), serverInfo: { name: "content-test", version: "1" } });
    const result = (await handleMcpMessage({ id: 1, method: "tools/call", params: { name: actionMcpToolName(declarations.read), arguments: { item_id: done.steps[1]!.item!.item_id } } }, mcp))!.result as any;
    assert.equal(result.isError, false);
    assert.equal(result.structuredContent.body, "材料：本地实际内容");
    assert.deepEqual(await createWorkflowContentPorts(bindActionClient(service, () => ({ ...caller, project_id: "project-b" }))).stations(), []);
    const denied = createWorkflowContentPorts(bindActionClient(service, () => ({ ...caller, permissions: ["drafts:read"] })));
    assert.equal((await denied.stations())[0]!.supported, false);
    await assert.rejects(denied.receive("unknown-drafts", { title: "bad", body: "bad" }, "workflow:denied:1"), /缺少已授权/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM drafts").get()!.n, 2);
  });
});

test("saved versions survive withdrawal and upgrades; old unbound workflows pin refs when a run starts", async () => {
  await fixture(async ({ actions, store, runtime, install, register, ports, db }) => {
    const flow = (await actions.invoke(w.create, { title: "固定版本", chain: chain() })).workflow as Workflow;
    // Existing data has only plugin ids, and is left intact while starting snapshots resolved capabilities.
    const old = store.create({ project_id: caller.project_id!, title: "旧流程", chain: { stations: flow.stations.map(({ content, ...station }) => station), links: flow.links } });
    const run = (await actions.invoke(w.start, { id: old.workflow_id, title: "旧记录" })).instance as WorkflowInstance;
    assert.equal(store.get(old.workflow_id, caller.project_id!).stations[0]!.content, undefined);
    assert.equal(run.chain.stations[0]!.content!.actions.read!.version, 1);
    const oldRunning = store.startInstance(old, run.steps[0]!.item!);
    db.prepare("UPDATE drafts SET body = ? WHERE id = ?").run("旧实例已编辑的内容", oldRunning.steps[0]!.item!.item_id);
    const advanced = (await actions.invoke(w.continue, { id: oldRunning.instance_id })).instance as WorkflowInstance;
    assert.equal(advanced.status, "done");
    assert.ok(store.instance(oldRunning.instance_id, caller.project_id!).chain.stations.every(station => station.content?.actions.read?.version === 1));
    await runtime.stop(install);
    const unavailable = (await actions.invoke(w.get, { id: flow.workflow_id })).workflow;
    assert.equal(unavailable.stations[0].availability.available, false);
    assert.deepEqual(unavailable.stations[0].content, flow.stations[0]!.content);
    await assert.rejects(actions.invoke(w.start, { id: flow.workflow_id }), /原引用已保留/);
    await register(2);
    assert.equal((await ports.stations())[0]!.supported, true);
    await assert.rejects(actions.invoke(w.continue, { id: run.instance_id }), /v1 不可用/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM drafts").get()!.n, 2);
    assert.equal(store.instance(run.instance_id, caller.project_id!).status, "active");
    assert.deepEqual(store.get(flow.workflow_id, caller.project_id!).stations, flow.stations);
  });
});

test("W4-6-04 a receive pinned at v1 stays pinned and reports itself unavailable; removing and re-adding the station pins v2", async () => {
  await fixture(async ({ actions, store, ports, db }) => {
    const flow = (await actions.invoke(w.create, { title: "接收 v2", chain: chain() })).workflow as Workflow;
    assert.equal(flow.stations[1]!.content!.actions.receive!.version, 2, "a new station pins the current receive");
    const run = (await actions.invoke(w.start, { id: flow.workflow_id, title: "原始草稿" })).instance as WorkflowInstance;
    db.prepare("UPDATE drafts SET body = ? WHERE id = ?").run("本地实际内容", run.steps[0]!.item!.item_id);
    // A flow saved before the bump: station 2 holds `receive@1`, the rest are what they were.
    const content = flow.stations[1]!.content!;
    const pinned = { ...content, actions: { ...content.actions, receive: { ...content.actions.receive!, version: 1 } } };
    const saved = store.create({ project_id: caller.project_id!, title: "接收 v1", chain: { stations: [flow.stations[0]!, { ...flow.stations[1]!, content: pinned }], links: flow.links } });
    const drafts = db.prepare("SELECT COUNT(*) AS n FROM drafts").get()!.n;

    await assert.rejects(actions.invoke(w.start, { id: saved.workflow_id }), /已保存的接收能力 v1 不可用/);
    // An instance already running against it reports the same, and nothing is written or swapped.
    const running = store.startInstance(saved, run.steps[0]!.item!);
    await assert.rejects(actions.invoke(w.continue, { id: running.instance_id }), /已保存的接收能力 v1 不可用/);
    await assert.rejects(ports.receive("unknown-drafts", { title: "x", body: "y" }, "workflow:pinned:1", pinned), /已保存的接收能力 v1 不可用/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM drafts").get()!.n, drafts);
    assert.equal(store.instance(running.instance_id, caller.project_id!).status, "active");
    assert.equal(store.get(saved.workflow_id, caller.project_id!).stations[1]!.content!.actions.receive!.version, 1);
    assert.equal(store.instance(running.instance_id, caller.project_id!).chain.stations[1]!.content!.actions.receive!.version, 1);

    // Removing the station and adding it back is how it is repaired: the new reference is the current receive.
    const repaired = store.create({ project_id: caller.project_id!, title: "接收 v1 修好", chain: { stations: saved.stations.map(({ content, ...station }) => station), links: saved.links } });
    const again = (await actions.invoke(w.start, { id: repaired.workflow_id, title: "重新开始" })).instance as WorkflowInstance;
    db.prepare("UPDATE drafts SET body = ? WHERE id = ?").run("修好之后的内容", again.steps[0]!.item!.item_id);
    assert.equal(again.chain.stations[1]!.content!.actions.receive!.version, WORKFLOW_CONTENT_VERSIONS.receive);
    const done = (await actions.invoke(w.continue, { id: again.instance_id, updated_at: again.updated_at })).instance as WorkflowInstance;
    assert.equal(done.status, "done");
  });
});

test("W4-6-01 receive is v2 with a flat input and a required request id; the other roles stay v1; an old-shape receive is refused", () => {
  assert.deepEqual(WORKFLOW_CONTENT_VERSIONS, { list: 1, read: 1, receive: 2, create: 1 });
  const stations = defineWorkflowContentActions({ id: "unknown-drafts", title: "未知草稿", icon: "note", create: true, subject_kind: "unknown_draft",
    read_permissions: ["drafts:read"], write_permissions: ["drafts:write"] });
  assert.deepEqual([stations.list.version, stations.read.version, stations.receive.version, stations.create!.version], [1, 1, 2, 1]);
  assert.equal(stations.receive.action.input_type, "molis.workflow.content.receive.input.v2");
  assert.equal(stations.receive.action.output_type, "molis.workflow.content.receive.output.v1");
  assert.deepEqual(stations.list.action.input_type, "molis.workflow.content.list.input.v1");
  const schema = stations.receive.action.input_schema as { properties: Record<string, { minLength?: number; maxLength?: number } | undefined>; required: string[]; additionalProperties: boolean };
  assert.deepEqual(Object.keys(schema.properties).sort(), ["body", "feed_item_id", "request_id", "source", "title", "url"]);
  assert.deepEqual([...schema.required].sort(), ["body", "request_id", "title"]);
  assert.deepEqual([schema.properties.request_id?.minLength, schema.properties.request_id?.maxLength], [1, 160]);
  assert.equal(schema.additionalProperties, false);

  const service = new ActionService();
  const register = (definition: ActionDefinition) => () => service.registerProvider({ provider: { provider_id: "old-shape", title: "old", kind: "plugin" },
    definitions: [definition], handlers: [{ ...definition, handle: () => ({ plugin: "unknown-drafts", item_id: "1", title: "x" }) }] });
  const oldShape: ActionDefinition = { ...stations.receive, version: 1, action: { ...stations.receive.action, input_type: "molis.workflow.content.receive.input.v1",
    input_schema: { type: "object", properties: { payload: WORKFLOW_CONTENT_SCHEMAS.read.output, context: { type: "object" } }, required: ["payload", "context"], additionalProperties: false } } };
  assert.throws(register(oldShape), /没有兑现工作流内容协议 receive v2 的输入合同/);
  // A flat input without the request id is the old shape too: the schema must be the protocol's own.
  const withoutRequestId: ActionDefinition = { ...stations.receive, action: { ...stations.receive.action,
    input_schema: { ...schema, properties: { ...schema.properties, request_id: undefined }, required: ["title", "body"] } as never } };
  assert.throws(register(withoutRequestId), /没有兑现工作流内容协议 receive v2 的输入合同/);
  assert.doesNotThrow(register(stations.receive as ActionDefinition));
});

test("content protocol rejects lying schemas and preserves provider identity at invocation", async () => {
  const service = new ActionService();
  const definition: ActionDefinition = { ...declarations.read, action: { ...declarations.read.action, output_schema: { type: "string" } } };
  assert.throws(() => service.registerProvider({ provider: { provider_id: "wrong", title: "wrong", kind: "plugin" },
    definitions: [definition], handlers: [{ ...definition, handle: () => "not content" }] }), /没有兑现工作流内容协议/);
  let writes = 0;
  const dispose = service.registerProvider({ provider: { provider_id: "original", title: "original", kind: "plugin" },
    definitions: [declarations.receive], handlers: [{ ...declarations.receive, handle: () => { writes++; return { plugin: "unknown-drafts", item_id: "1", title: "x" }; } }] });
  dispose();
  service.registerProvider({ provider: { provider_id: "replacement", title: "replacement", kind: "plugin" },
    definitions: [declarations.receive], handlers: [{ ...declarations.receive, handle: () => { writes++; return { plugin: "unknown-drafts", item_id: "2", title: "x" }; } }] });
  await assert.rejects(service.invoke(caller, { ...declarations.receive, provider_id: "original" }, { title: "x", body: "x", request_id: "workflow:one:1" }), { code: "actions.provider_changed" });
  assert.equal(writes, 0);
});

test("W5-01-WORKFLOWS-08 a model answer is recorded only while its original call is current: the check runs inside the commit, and a refused answer leaves no handoff", async () => {
  let answers = 0;
  const current = { value: false };
  const options: WorkflowsPortOptions = { textModel: { available: true }, complete: async () => {
    answers++;
    return { text: "模型整理的标题\n\n模型整理的正文", validateResult() { if (!current.value) throw new ActionError("actions.cancelled", "原调用已经结束"); } };
  } };
  await fixture(async ({ actions, store, db }) => {
    const flow = (await actions.invoke(w.create, { title: "模型交接", chain: { stations: [{ plugin: "unknown-drafts" }, { plugin: "unknown-drafts" }],
      links: [{ kind: "ai", title_template: "", body_template: "", instructions: "整理成一页" }] } })).workflow as Workflow;
    const run = (await actions.invoke(w.start, { id: flow.workflow_id, title: "原始草稿" })).instance as WorkflowInstance;
    db.prepare("UPDATE drafts SET body = ? WHERE id = ?").run("本地实际内容", run.steps[0]!.item!.item_id);
    const drafts = db.prepare("SELECT COUNT(*) AS n FROM drafts").get()!.n;
    await assert.rejects(actions.invoke(w.continue, { id: run.instance_id }), { code: "actions.cancelled" });
    assert.equal(answers, 1);
    assert.equal(store.instance(run.instance_id, caller.project_id!).steps[0]!.pending, undefined, "the refused answer was not kept");
    assert.equal(store.instance(run.instance_id, caller.project_id!).steps[0]!.handoff ?? null, null);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM drafts").get()!.n, drafts, "and nothing was delivered");
    current.value = true;
    const done = (await actions.invoke(w.continue, { id: run.instance_id })).instance as WorkflowInstance;
    assert.equal(done.status, "done");
    assert.equal(done.steps[0]!.handoff?.actor, "ai");
    assert.equal(done.steps[0]!.handoff?.output.title, "模型整理的标题");
  }, options);
});
