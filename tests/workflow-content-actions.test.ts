import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { PluginRuntime, MemoryPluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { definePlugin, defineWorkflowContentActions, bindWorkflowContentHandlers } from "../packages/plugin-sdk/src/index.js";
import { ActionError, bindActionClient, type ActionCallContext, type ActionDefinition, type WorkflowContentActions, type WorkflowPayload } from "@molis-ai/molis-work-contracts/platform/actions";
import { createWorkflowContentPorts, createWorkflowsRouteHandlers, WorkflowsPluginRouteTable, openWorkflowsStore, manualLink,
  type Workflow, type WorkflowInstance, type WorkflowsRoutePorts } from "@molis-ai/molis-work-plugin-workflows";
import { createActionMcpPorts, actionMcpToolName, handleMcpMessage } from "@molis-ai/molis-work-app-mcp";

const caller: ActionCallContext = { actor_id: "owner", project_id: "project-a", audience: "workflow", permissions: ["drafts:read", "drafts:write"] };
const declarations = defineWorkflowContentActions({ id: "unknown-drafts", title: "未知草稿", icon: "note", create: true,
  read_permissions: ["drafts:read"], write_permissions: ["drafts:write"] });

async function fixture(run: (f: {
  home: string; db: DatabaseSync; service: ActionService; runtime: PluginRuntime; install: string;
  ports: WorkflowsRoutePorts; table: WorkflowsPluginRouteTable; store: ReturnType<typeof openWorkflowsStore>;
  register(version: number): Promise<string>;
}) => Promise<void>) {
  const home = mkdtempSync(join(tmpdir(), "workflow-action-contract-"));
  const db = new DatabaseSync(join(home, "unknown-plugin.sqlite"));
  db.exec("CREATE TABLE drafts (id INTEGER PRIMARY KEY, project TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL)");
  const service = new ActionService();
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { actions: { registry: service, project_id: caller.project_id! } });
  const register = async (version: number) => {
    const actions = Object.fromEntries(Object.entries(declarations).map(([role, definition]) => [role, { ...definition, version }])) as unknown as WorkflowContentActions;
    const plugin = definePlugin({ manifest: {
      upgrade_compatibility: { compatible_from_versions: ["1.0.0"] },
      schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.unknown-drafts", version: `${version}.0.0`, name: "未知草稿",
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
        receive: ({ payload }, context) => create(payload.title, payload.body, context.project_id),
      }) };
    } });
    const existing = runtime.list().find(item => item.plugin_id === plugin.manifest.plugin_id);
    const installed = existing ? (await runtime.upgrade({ install_id: existing.install_id, definition: plugin })).install
      : runtime.install({ definition: plugin, deployment: "local", grants: [...caller.permissions] }).install;
    await runtime.start(installed.install_id);
    return installed.install_id;
  };
  const store = openWorkflowsStore(home);
  try {
    const install = await register(1);
    const ports: WorkflowsRoutePorts = { projectId: caller.project_id!, aiAvailable: () => false,
      ...createWorkflowContentPorts(bindActionClient(service, () => caller)) };
    const table = new WorkflowsPluginRouteTable(createWorkflowsRouteHandlers(store, ports));
    await run({ home, db, service, runtime, install, ports, table, store, register });
  } finally {
    for (const installed of runtime.list()) await runtime.stop(installed.install_id);
    store.close(); db.close(); rmSync(home, { recursive: true, force: true });
  }
}

async function request(table: WorkflowsPluginRouteTable, method: "GET" | "POST", pathname: string, body: Record<string, unknown> = {}) {
  const response = await table.handle({ method, pathname, body, query: new URLSearchParams() });
  assert.equal(response?.status, 200);
  return response!.body as Record<string, any>;
}
const chain = () => ({ stations: [{ plugin: "unknown-drafts" }, { plugin: "unknown-drafts" }],
  links: [{ ...manualLink(), kind: "function", body_template: "材料：{正文}", title_template: "交接：{标题}" }] });

test("unknown Runtime plugin is discovered, saved, run and read through workflow and MCP with real plugin data", async () => {
  await fixture(async ({ ports, table, db, store, home, service }) => {
    assert.deepEqual((await ports.stations()).map(s => [s.plugin, s.supported, s.can_start_blank]), [["unknown-drafts", true, true]]);
    const flow = (await request(table, "POST", "/api/workflows", { title: "未知能力链", chain: chain() })).workflow as Workflow;
    assert.equal(flow.stations[0]!.content!.actions.receive!.capability_id, declarations.receive.capability_id);
    const instance = (await request(table, "POST", `/api/workflows/${flow.workflow_id}/instances`, { title: "原始草稿" })).instance as WorkflowInstance;
    db.prepare("UPDATE drafts SET body = ? WHERE id = ?").run("本地实际内容", instance.steps[0]!.item!.item_id);
    const done = (await request(table, "POST", `/api/workflows/instances/${instance.instance_id}/continue`, { updated_at: instance.updated_at })).instance as WorkflowInstance;
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
    await assert.rejects(denied.receive("unknown-drafts", { title: "bad", body: "bad" }, { instance_id: "denied", step: 1 }), /缺少已授权/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM drafts").get()!.n, 2);
  });
});

test("saved versions survive withdrawal and upgrades; old unbound workflows pin refs when a run starts", async () => {
  await fixture(async ({ table, store, runtime, install, register, ports, db }) => {
    const flow = (await request(table, "POST", "/api/workflows", { title: "固定版本", chain: chain() })).workflow as Workflow;
    // Existing data has only plugin ids, and is left intact while starting snapshots resolved capabilities.
    const old = store.create({ project_id: caller.project_id!, title: "旧流程", chain: { stations: flow.stations.map(({ content, ...station }) => station), links: flow.links } });
    const run = (await request(table, "POST", `/api/workflows/${old.workflow_id}/instances`, { title: "旧记录" })).instance as WorkflowInstance;
    assert.equal(store.get(old.workflow_id, caller.project_id!).stations[0]!.content, undefined);
    assert.equal(run.chain.stations[0]!.content!.actions.read!.version, 1);
    const oldRunning = store.startInstance(old, run.steps[0]!.item!);
    db.prepare("UPDATE drafts SET body = ? WHERE id = ?").run("旧实例已编辑的内容", oldRunning.steps[0]!.item!.item_id);
    const advanced = (await request(table, "POST", `/api/workflows/instances/${oldRunning.instance_id}/continue`, {})).instance as WorkflowInstance;
    assert.equal(advanced.status, "done");
    assert.ok(store.instance(oldRunning.instance_id, caller.project_id!).chain.stations.every(station => station.content?.actions.read?.version === 1));
    await runtime.stop(install);
    const unavailable = (await request(table, "GET", `/api/workflows/${flow.workflow_id}`)).workflow;
    assert.equal(unavailable.stations[0].availability.available, false);
    assert.deepEqual(unavailable.stations[0].content, flow.stations[0]!.content);
    await assert.rejects(request(table, "POST", `/api/workflows/${flow.workflow_id}/instances`, {}), /原引用已保留/);
    await register(2);
    assert.equal((await ports.stations())[0]!.supported, true);
    await assert.rejects(request(table, "POST", `/api/workflows/instances/${run.instance_id}/continue`, {}), /v1 不可用/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM drafts").get()!.n, 2);
    assert.equal(store.instance(run.instance_id, caller.project_id!).status, "active");
    assert.deepEqual(store.get(flow.workflow_id, caller.project_id!).stations, flow.stations);
  });
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
  await assert.rejects(service.invoke(caller, { ...declarations.receive, provider_id: "original" }, { payload: { title: "x", body: "x" }, context: { instance_id: "one", step: 1 } }), { code: "actions.provider_changed" });
  assert.equal(writes, 0);
});
