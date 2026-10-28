import assert from "node:assert/strict";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalHost } from "@molis-ai/molis-work-app-local-host";
import { createPrologueNodeAdapter, AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";
import { WORKFLOWS_ACTION_PERMISSIONS, workflowsActions as w } from "@molis-ai/molis-work-plugin-workflows";
import { MolisWorkLocalHost, type MolisWorkProjectRuntime } from "../apps/local-host/dist/project-host.js";
import { NATIVE_CONTENT_PERMISSIONS } from "../apps/local-host/dist/native-content-permissions.js";
import { createExternalMcpDirectory } from "../apps/local-host/dist/external-mcp-actions.js";
import { EXTERNAL_MCP_PERMISSION, isMcpToolCapability, mcpInputContract } from "../apps/local-host/dist/mcp-tool-actions.js";
import { MCP_FIXTURE } from "./fixtures/mcp-notes-server.js";
import { serveTestHost } from "./fixtures/test-home.js";

test("ASC-01 ASC-02 ASC-32: a connected external MCP tool is one directory action: local user, workflow step and granted MCP client all run it through the runtime's gate", { timeout: 120_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "external-mcp-actions-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  // The Home is served so that the project and the MCP client's grant are made the way a person makes them; this file keeps its own host (it needs `src` types of the directory).
  const served = await serveTestHost(t, { home, host });
  const project = await served.createProject("外部 MCP", ["feed"]);
  await writeFile(join(home, "server.mjs"), MCP_FIXTURE);
  let directoryAllowed = true;
  const openAdapter = () => createPrologueNodeAdapter({ app: { appId: "io.molis.external-mcp-test", appVersion: "1.0.0" }, reviewQueue: new AgentReviewQueue(),
    storageRoot: join(home, "runtime"), modelConfiguration: async () => null, resolveCredential: () => null,
    checks: { directoryAuthorized: async (id, directory) => directoryAllowed && id === project.project_id && directory === home } });
  let adapter = await openAdapter();
  const reference = project.reference;
  let directory = createExternalMcpDirectory({ localHost: host, homeDirectory: home });
  const owner = { project_id: project.project_id, plugin_id: "io.molis.work.coding" };
  let library = adapter.mcpLibrary!;
  const runtime = await host.withProject(reference, project => project) as MolisWorkProjectRuntime;
  const user: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: [...WORKFLOWS_ACTION_PERMISSIONS, ...NATIVE_CONTENT_PERMISSIONS, EXTERNAL_MCP_PERMISSION] };
  const client = host.actionClient(reference);
  const notes = async () => (await readFile(join(home, "mcp-notes.jsonl"), "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line).note);
  try {
    const saved = await library.save(owner, { expected_version: 0, label: "笔记服务", transport: "stdio", enabled: true, timeout_ms: 5000,
      directory: { canonical_path: home, realpath_verified: true }, executable: process.execPath, argv: ["server.mjs"] });
    await library.control(owner, saved.id, "connect");
    await directory.sync(runtime, "prologue", library, owner);

    // The tool is discovered in the same directory, grouped under its server, with the shape the server declared.
    const view = (await client.discover(user)).find(row => isMcpToolCapability(row.capability_id) && row.action.title === "record_review_note")!;
    assert.ok(view, "the external tool is in the project directory");
    assert.equal(view.provider.title, "笔记服务");
    assert.equal(view.provider.plugin_id, undefined, "Coding is provenance, not the execution provider");
    assert.equal(view.provider.kind, "mcp");
    assert.equal(view.availability.available, true);
    assert.deepEqual((view.action.input_schema as { required: string[] }).required, ["note"]);
    const ref = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };

    // 1. The local user runs it directly.
    assert.deepEqual(await client.invoke(user, ref, { note: "直接调用" }), { text: "Saved one note: 直接调用", truncated: false });
    await assert.rejects(client.invoke(user, ref, { note: 1 }), { code: "actions.input_invalid" });

    // 2. A workflow step maps handed-over content into it and runs it.
    const actions = bindActionClient(client, () => user);
    const step = (await actions.invoke(w.actionSteps, {})).actions.find(row => row.ref.capability_id === ref.capability_id)!;
    assert.equal(step.group, "笔记服务");
    const { workflow } = await actions.invoke(w.create, { title: "消息记成外部笔记", chain: { stations: [{ plugin: "feed" },
      { plugin: "action", action: { ref: step.ref, title: step.title, group: step.group, mapping: { note: { from: "title" } } } }],
      links: [{ kind: "function", title_template: "", body_template: "{正文}", instructions: "" }] } });
    const source = createLocalFeedSourceService(runtime.store.db, project.project_id).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "twitter-ai-observation" }).source;
    createLocalFeedApplication(runtime.store.db).ingestItem({ source, externalId: "one", title: "工作流交来的标题", summary: "s", body: "正文", occurredAt: new Date().toISOString(), attention: false });
    const item = (await actions.invoke(w.stationItems, { plugin: "feed" })).items[0]!;
    const run = (await actions.invoke(w.start, { id: workflow.workflow_id, item_id: item.item_id })).instance;
    const done = (await actions.invoke(w.continue, { id: run.instance_id })).instance;
    assert.equal(done.status, "done");
    assert.deepEqual(done.steps[1]!.result, { text: "Saved one note: 工作流交来的标题", truncated: false });

    // 3. An external MCP client of Molis calls it only with an exact grant, under its own identity.
    const mcp = await served.mcp("client-x", project.project_id);
    await assert.rejects(mcp.client.invoke(mcp.caller, ref, { note: "未授权" }), { code: "mcp.action_revoked" });
    await served.grant("client-x", project.project_id, [view]);
    assert.deepEqual(await mcp.client.invoke(mcp.caller, ref, { note: "MCP 客户端" }), { text: "Saved one note: MCP 客户端", truncated: false });
    assert.deepEqual(await notes(), ["直接调用", "工作流交来的标题", "MCP 客户端"], "every call reached the real server once");

    // Revoke while the real SDK is refreshing the selected server, after the directory's initial check.
    const validate = library.validate;
    library.validate = async (...args) => {
      const checked = await validate(...args);
      await served.revoke("client-x", project.project_id, [view]);
      return checked;
    };
    try {
      await assert.rejects(mcp.client.invoke(mcp.caller, ref, { note: "准备过程中已撤权" }), { code: "mcp.action_revoked" });
      assert.deepEqual(await notes(), ["直接调用", "工作流交来的标题", "MCP 客户端"], "revocation after SDK discovery must prevent the actual stdio write");
    } finally { library.validate = validate; }

    // An enabled disconnected server stays usable on demand. Discovery starts no process, and missing authority cannot reconnect it.
    await library.control(owner, saved.id, "disconnect");
    // Sync preserves the exact discovered tool version.
    await directory.sync(runtime, "prologue", library, owner);
    const offline = (await client.discover(user)).find(row => row.capability_id === ref.capability_id && row.version === ref.version)!;
    assert.equal(offline.availability.available, true);
    assert.equal((await library.list(owner))[0]?.health, "disconnected");
    await assert.rejects(client.invoke({ ...user, audience: "agent", permissions: [] }, ref, { note: "无权限不能重连" }), { code: "actions.forbidden" });
    assert.equal((await library.list(owner))[0]?.health, "disconnected");
    await library.control(owner, saved.id, "connect");
    await directory.sync(runtime, "prologue", library, owner);
    assert.ok((await client.discover(user)).some(row => row.capability_id === ref.capability_id && row.version === ref.version && row.availability.available));
    assert.equal((await notes()).length, 3);

    // After a restart the saved server's tool is back in the directory before anyone opens the MCP settings:
    // the same reference, no process started by discovery, and available to the Assistant under its own identity.
    directory.close();
    await adapter.close?.();
    adapter = await openAdapter(); library = adapter.mcpLibrary!;
    directory = createExternalMcpDirectory({ localHost: host, homeDirectory: home });
    assert.ok(!(await client.discover(user)).some(row => row.capability_id === ref.capability_id), "nothing is registered by itself");
    await directory.restore(reference, async () => library);
    const restored = (await client.discover(user)).find(row => row.capability_id === ref.capability_id && row.version === ref.version)!;
    assert.ok(restored, "the saved server's tool is back after the restart");
    assert.equal(restored.provider.title, "笔记服务");
    assert.equal(restored.availability.available, true);
    assert.equal((await library.list(owner))[0]?.health, "disconnected");
    assert.deepEqual((await library.catalog!()).map(entry => entry.owner), [owner]);
    const assistant: ActionCallContext = { ...user, actor_id: "assistant:test-work", audience: "agent" };
    assert.ok((await client.discover(assistant)).some(row => row.capability_id === ref.capability_id));
    await assert.rejects(client.invoke({ ...assistant, project_id: "another-project" }, ref, { note: "跨项目拒绝" }));
    directoryAllowed = false;
    await assert.rejects(client.invoke(assistant, ref, { note: "撤销目录授权" }), /取消授权/);
    assert.equal((await library.list(owner))[0]?.health, "disconnected", "a revoked directory never starts a process");
    directoryAllowed = true;
    assert.deepEqual(await client.invoke(assistant, ref, { note: "重启后" }), { text: "Saved one note: 重启后", truncated: false });
    assert.equal((await notes()).length, 4);
    // Explicitly disabling the configuration refuses the old reference and starts no process.
    await library.save(owner, { id: saved.id, expected_version: saved.version, label: saved.label, enabled: false,
      transport: "stdio", timeout_ms: 5000, directory: saved.directory, executable: saved.executable, argv: saved.argv });
    await directory.sync(runtime, "prologue", library, owner);
    await assert.rejects(client.invoke(assistant, ref, { note: "停用后" }), { code: "actions.connection_unavailable" });
    assert.equal((await notes()).length, 4);
    // Removing the configuration removes its entries.
    await library.control(owner, saved.id, "remove");
    await directory.sync(runtime, "prologue", library, owner);
    assert.ok(!(await client.discover(user)).some(row => row.capability_id === ref.capability_id));
    // A removed server is not brought back by the next restart either.
    directory.close();
    directory = createExternalMcpDirectory({ localHost: host, homeDirectory: home });
    await directory.restore(reference, async () => library);
    assert.ok(!(await client.discover(user)).some(row => row.capability_id === ref.capability_id));
  } finally {
    await served.close();
    directory.close();
    await host.close();
    await adapter.close?.();
    await rm(home, { recursive: true, force: true });
  }
});

test("listing the servers again while an external tool is being called replaces only what changed, so the call is not withdrawn", async () => {
  const host = new LocalHost<object>({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const place = { project_id: "p1", storage_key: "memory:p1" };
  const tool = (name: string, description = name) => ({ server: "srv", server_label: "Srv", configuration_version: 1, tool: name, version: `shape-${name}`, description, input_schema: { type: "object", properties: { m: { type: "string" } } } });
  let tools = [tool("echo")], dispatched = 0, resync: (() => Promise<void>) | undefined;
  const library = { list: async () => [{ id: "srv", enabled: true, version: 1, health: "connected" }], tools: async () => tools, live: () => true,
    call: async (_owner: unknown, _tool: unknown, _args: unknown, options: { beforeDispatch?: () => Promise<void> }) => {
      // Between the handler's start and its dispatch (validation, workspace authority, clock) the settings page lists the servers.
      await resync?.();
      await options.beforeDispatch?.();
      dispatched++;
      return { text: "ok", truncated: false };
    } };
  const home = await mkdtemp(join(tmpdir(), "external-mcp-resync-"));
  const directory = createExternalMcpDirectory({ localHost: host as never, homeDirectory: home });
  const runtime = { project_id: "p1", store: { path: "memory:p1" } } as MolisWorkProjectRuntime;
  const owner = { project_id: "p1", plugin_id: "coding" };
  const sync = () => directory.sync(runtime, "prologue", library as never, owner);
  const client = host.actionClient(place);
  const user: ActionCallContext = { actor_id: "web-user", project_id: "p1", audience: "user", permissions: [EXTERNAL_MCP_PERMISSION] };
  const find = async (name: string) => (await client.discover(user)).find(row => row.capability_id.endsWith(`.${name}`));
  try {
    await sync();
    const echo = (await find("echo"))!;
    const ref = { capability_id: echo.capability_id, version: echo.version, provider_id: echo.provider.provider_id };
    // The same servers, listed again, and one more tool: the call to the unchanged tool goes through.
    resync = async () => { tools = [tool("echo"), tool("search")]; await sync(); };
    assert.deepEqual(await client.invoke(user, ref, { m: "x" }), { text: "ok", truncated: false });
    assert.equal(dispatched, 1);
    assert.ok(await find("search"), "the new tool joined the directory");
    const same = (await find("echo"))!;
    assert.equal(same.version, echo.version, "the unchanged tool keeps its version");
    // A tool whose description the server changed is replaced; its in-flight call is withdrawn before dispatch, the other is not.
    resync = async () => { tools = [tool("echo", "Echo, reworded"), tool("search")]; await sync(); };
    await assert.rejects(client.invoke(user, ref, { m: "x" }), { code: "actions.provider_changed" });
    assert.equal(dispatched, 1, "the withdrawn call dispatched nothing");
    resync = undefined;
    assert.match((await find("echo"))!.action.description, /Echo, reworded/);
    const search = (await find("search"))!;
    assert.deepEqual(await client.invoke(user, { capability_id: search.capability_id, version: search.version, provider_id: search.provider.provider_id }, { m: "y" }), { text: "ok", truncated: false });
    // A tool the server stops offering leaves the directory.
    tools = [tool("search")];
    await sync();
    assert.equal(await find("echo"), undefined);
    assert.ok(await find("search"));
  } finally { directory.close(); await host.close(); await rm(home, { recursive: true, force: true }); }
});

// BL-155：MCP 参数标注的规则写在两份实现里——SDK 的校验副本（`mcpToolInputSchema`）和动作合同进目录时的副本
// （`mcpActionInputSchema`）。SDK 没有公开它，包边界也不许深导入，所以这里钉住两份对同一批 schema 的结论一致，
// 以及两处有意分歧：动作合同保留 `default`（它是约束，不是默认值注入）、只处理顶层标注。
test("BL-155: the MCP parameter annotation rule is one behaviour in two copies: same accept, same reject, and `default` only in the action copy", async () => {
  const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
  const packageRoot = dirname(dirname(requireSdk.resolve("@prologue/sdk")));
  const sdk = await import(pathToFileURL(join(packageRoot, "dist", "mcp", "core", "input-schema.js")).href) as {
    mcpToolInputSchema: (schema: Readonly<Record<string, unknown>>) => Record<string, unknown>;
  };
  const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;
  const annotated = (note: Record<string, unknown>) => ({ type: "object", properties: { note }, required: ["note"], additionalProperties: false });

  // 合法标注：两边都去掉传输层标注，留下的动作合同相同（SDK 的对象没有原型，按 JSON 归一后比较）。
  const legal = annotated({ type: "string", "x-mcp-header": "X-Note" });
  const kept = mcpInputContract(legal);
  assert.equal(kept.availability.available, true);
  assert.deepEqual(asJson(kept.schema), asJson(sdk.mcpToolInputSchema(legal)));

  // 有意分歧：动作合同保留 `default`（它是约束，不会注入默认值）；SDK 的校验副本把它当不需要的标注去掉。
  const withDefault = annotated({ type: "string", default: "x", "x-mcp-header": "X-Note" });
  assert.deepEqual((mcpInputContract(withDefault).schema.properties as Record<string, unknown>).note, { type: "string", default: "x" });
  assert.deepEqual(asJson((sdk.mcpToolInputSchema(withDefault).properties as Record<string, unknown>).note), { type: "string" });

  // 坏标注：两边都拒绝——SDK 拒绝整份 schema，动作合同让工具可见但不可用，等合同更新后重新发现。
  const bad = [
    annotated({ type: "string", "x-mcp-header": "bad header" }),
    annotated({ type: "number", "x-mcp-header": "X-Note" }),
    { type: "object", properties: { a: { type: "string", "x-mcp-header": "X-Dup" }, b: { type: "string", "x-mcp-header": "x-dup" } } },
  ];
  for (const schema of bad) {
    assert.throws(() => sdk.mcpToolInputSchema(schema), (error: unknown) => (error as { code?: unknown }).code === "MCP_PROTOCOL_UNSUPPORTED");
    assert.equal(mcpInputContract(schema).availability.code, "actions.schema_unsupported");
  }
});
