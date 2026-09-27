import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { createPrologueNodeAdapter, AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { WORKFLOWS_ACTION_PERMISSIONS, workflowsActions as w } from "@molis-ai/molis-work-plugin-workflows";
import { MolisWorkLocalHost, molisWorkHostProjectReference, type MolisWorkProjectRuntime } from "../apps/local-host/src/project-host.js";
import { NATIVE_CONTENT_PERMISSIONS } from "../apps/local-host/src/content-action-providers.js";
import { createExternalMcpDirectory } from "../apps/local-host/src/external-mcp-actions.js";
import { EXTERNAL_MCP_PERMISSION, isMcpToolCapability } from "../apps/local-host/src/mcp-tool-actions.js";
import { authorizeMcpActions } from "../apps/local-host/src/mcp-action-client.js";
import { createMcpActionGrant } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";
import { MCP_FIXTURE } from "./fixtures/mcp-notes-server.js";

test("a connected external MCP tool is one directory action: local user, workflow step and granted MCP client all run it through the runtime's gate", { timeout: 120_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "external-mcp-actions-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "外部 MCP", actor_id: "web-user" });
  if (!catalog.listProjectPlugins(project.project_id).includes("feed")) catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "feed", actor_id: "web-user" });
  catalog.close();
  await writeFile(join(home, "server.mjs"), MCP_FIXTURE);
  const openAdapter = () => createPrologueNodeAdapter({ app: { appId: "io.molis.external-mcp-test", appVersion: "1.0.0" }, reviewQueue: new AgentReviewQueue(),
    storageRoot: join(home, "runtime"), modelConfiguration: async () => null, resolveCredential: () => null });
  let adapter = await openAdapter();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
  let directory = createExternalMcpDirectory({ localHost: host, homeDirectory: home });
  const owner = { board_id: project.board_id, plugin_id: "io.molis.work.coding" };
  let library = adapter.mcpLibrary!;
  const runtime = await host.withProject(reference, project => project) as MolisWorkProjectRuntime;
  const user: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: [...WORKFLOWS_ACTION_PERMISSIONS, ...NATIVE_CONTENT_PERMISSIONS, EXTERNAL_MCP_PERMISSION] };
  const client = host.actionClient(reference);
  const notes = async () => (await readFile(join(home, "mcp-notes.jsonl"), "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line).note);
  try {
    const saved = await library.save(owner, { expected_version: 0, label: "笔记服务", transport: "stdio", enabled: true, timeout_ms: 5000,
      directory: { canonical_path: home, realpath_verified: true }, executable: process.execPath, argv: ["server.mjs"] });
    await library.control(owner, saved.id, "connect");
    await directory.sync(runtime, owner.plugin_id, "prologue", library, owner);

    // The tool is discovered in the same directory, grouped under its server, with the shape the server declared.
    const view = (await client.discover(user)).find(row => isMcpToolCapability(row.capability_id) && row.action.title === "record_review_note")!;
    assert.ok(view, "the external tool is in the project directory");
    assert.equal(view.provider.title, "笔记服务");
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
    const { createLocalFeedApplication, createLocalFeedSourceService } = await import("@molis-ai/molis-work-app-local-host");
    const source = createLocalFeedSourceService(runtime.store.db, project.board_id).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "twitter-ai-observation" }).source;
    createLocalFeedApplication(runtime.store.db).ingestItem({ source, externalId: "one", title: "工作流交来的标题", summary: "s", body: "正文", occurredAt: new Date().toISOString(), attention: false });
    const item = (await actions.invoke(w.stationItems, { plugin: "feed" })).items[0]!;
    const run = (await actions.invoke(w.start, { id: workflow.workflow_id, item_id: item.item_id })).instance;
    const done = (await actions.invoke(w.continue, { id: run.instance_id })).instance;
    assert.equal(done.status, "done");
    assert.deepEqual(done.steps[1]!.result, { text: "Saved one note: 工作流交来的标题", truncated: false });

    // 3. An external MCP client of Molis calls it only with an exact grant, under its own identity.
    const mcpCaller: ActionCallContext = { actor_id: "client-x", project_id: project.project_id, audience: "mcp", permissions: [] };
    const denied = await authorizeMcpActions(host, mcpCaller, home, reference);
    await assert.rejects(denied.service.invoke(denied.context, ref, { note: "未授权" }));
    await writeMcpActionGrant(home, createMcpActionGrant("client-x", project.project_id, view, true));
    const granted = await authorizeMcpActions(host, mcpCaller, home, reference);
    assert.deepEqual(await granted.service.invoke(granted.context, ref, { note: "MCP 客户端" }), { text: "Saved one note: MCP 客户端", truncated: false });
    assert.deepEqual(await notes(), ["直接调用", "工作流交来的标题", "MCP 客户端"], "every call reached the real server once");

    // Disconnecting keeps the entry and says why; nothing is sent. Reconnecting with the same shape keeps the same version.
    await library.control(owner, saved.id, "disconnect");
    // The product re-syncs after every connection change; the configured server's tool stays, unavailable.
    await directory.sync(runtime, owner.plugin_id, "prologue", library, owner);
    const offline = (await client.discover(user)).find(row => row.capability_id === ref.capability_id && row.version === ref.version)!;
    assert.equal(offline.availability.available, false);
    assert.match(offline.availability.available ? "" : offline.availability.reason, /已断开/);
    await assert.rejects(client.invoke(user, ref, { note: "断开后" }), { code: "actions.connection_unavailable" });
    await library.control(owner, saved.id, "connect");
    await directory.sync(runtime, owner.plugin_id, "prologue", library, owner);
    assert.ok((await client.discover(user)).some(row => row.capability_id === ref.capability_id && row.version === ref.version && row.availability.available));
    assert.equal((await notes()).length, 3);

    // After a restart the saved server's tool is back in the directory before anyone opens the MCP settings:
    // unavailable with the reason, the same reference, and no process started on its own.
    directory.close();
    await adapter.close?.();
    adapter = await openAdapter(); library = adapter.mcpLibrary!;
    directory = createExternalMcpDirectory({ localHost: host, homeDirectory: home });
    assert.ok(!(await client.discover(user)).some(row => row.capability_id === ref.capability_id), "nothing is registered by itself");
    await directory.restore(reference, async () => library);
    const restored = (await client.discover(user)).find(row => row.capability_id === ref.capability_id && row.version === ref.version)!;
    assert.ok(restored, "the saved server's tool is back after the restart");
    assert.equal(restored.provider.title, "笔记服务");
    assert.equal(restored.availability.available, false);
    await assert.rejects(client.invoke(user, ref, { note: "重启后未连接" }), { code: "actions.connection_unavailable" });
    await library.control(owner, saved.id, "connect");
    await directory.sync(runtime, owner.plugin_id, "prologue", library, owner);
    assert.deepEqual(await client.invoke(user, ref, { note: "重启后" }), { text: "Saved one note: 重启后", truncated: false });
    assert.equal((await notes()).length, 4);
    // Removing the configuration removes its entries.
    await library.control(owner, saved.id, "remove");
    await directory.sync(runtime, owner.plugin_id, "prologue", library, owner);
    assert.ok(!(await client.discover(user)).some(row => row.capability_id === ref.capability_id));
    // A removed server is not brought back by the next restart either.
    directory.close();
    directory = createExternalMcpDirectory({ localHost: host, homeDirectory: home });
    await directory.restore(reference, async () => library);
    assert.ok(!(await client.discover(user)).some(row => row.capability_id === ref.capability_id));
  } finally {
    directory.close();
    await host.close();
    await adapter.close?.();
    await rm(home, { recursive: true, force: true });
  }
});
