import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { alchemistManifest, ALCHEMIST_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-alchemist";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { controlledAlchemistAi } from "./fixtures/alchemist-actions.js";
import { serveTestHost, type TestHostServer, type TestProject } from "./fixtures/test-home.js";

// Every MCP client is a separate stdio process. Only the resident Host opens this Home; the budget stops hangs, not slow CI startup.
/** `held` keeps the resident studio from draining its queued jobs. */
async function mcpHome(t: TestContext, held = false) {
  const home = await mkdtemp(join(tmpdir(), "alchemist-mcp-")), clients: Client[] = [];
  const projects = new Map<string, TestProject>();
  let host: MolisWorkLocalHost, served: TestHostServer;
  const closeClients = async () => { await Promise.all(clients.splice(0).map(client => client.close())); };
  const stop = async () => {
    const failures: unknown[] = [];
    for (const step of [closeClients, () => served?.close(), () => host?.close()]) {
      try { await step(); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, "Alchemist MCP fixture cleanup failed");
  };
  t.after(async () => { await stop(); await rm(home, { recursive: true, force: true }); });
  const start = async () => {
    const { ai } = controlledAlchemistAi();
    host = new MolisWorkLocalHost({ homeDirectory: home, alchemist: { ai: () => ai, pulseSourceMode: "fixture",
      ...(held ? { wrapStudio(runtime) { runtime.start = () => {}; } } : {}) } });
    served = await serveTestHost(null, { home, host });
  };
  await start();
  const connect = async (projectName: string, access = "write") => {
    let project = projects.get(projectName);
    if (!project) { project = await served.createProject(projectName); projects.set(projectName, project); }
    const clientId = access === "read" ? "fixture-reader" : "fixture-owner";
    const permissions: readonly string[] = access === "read" ? ["alchemist:read"] : ALCHEMIST_ACTION_PERMISSIONS;
    const directory = await host.inspectActions({ actor_id: clientId, project_id: project.project_id, audience: "mcp", permissions: [] }, project.reference);
    await served.grant(clientId, project.project_id, directory.filter(view => view.capability_id.startsWith("alchemist.")
      && view.action.permissions.every(permission => permissions.includes(permission))));
    const client = new Client({ name: "external-alchemist", version: "1" }); clients.push(client);
    const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", fileURLToPath(new URL("./fixtures/alchemist-mcp-server.ts", import.meta.url)), home, project.project_id, clientId, served.origin], stderr: "pipe" });
    let errors = ""; transport.stderr?.on("data", data => { errors += String(data); });
    try { await client.connect(transport); } catch (error) { throw new Error(`${String(error)}\n${errors}`); }
    return client;
  };
  // A tool is named after the version the Manifest serves, so an action that is revised later is called by its current name.
  const tool = (name: string) => `alchemist.${name}__v${alchemistManifest.actions!.find(action => action.capability_id === `alchemist.${name}`)!.version}`;
  const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name: tool(name), arguments: args });
    assert.equal(result.isError, false, JSON.stringify(result)); return result.structuredContent as any;
  };
  return { connect, call, tool, close: closeClients, async restart() { await stop(); await start(); } };
}

test("Alchemist standard MCP shares persisted business state across processes with project and read-only fixture grants", { timeout: 120_000 }, async t => {
  const { connect, call, tool, close, restart } = await mcpHome(t);
  try {
    const writer = await connect("a"), reader = await connect("a", "read"), other = await connect("b");
    const tools = (await writer.listTools()).tools;
    // MCP offers the actions that name it as an audience; choosing which GitHub account the market pulse uses stays with the person (user only).
    const offered = alchemistManifest.actions!.filter(action => action.action.audiences.includes("mcp")).map(action => `${action.capability_id}__v1`).sort();
    // W5-01-ALC-RES-AUTH-04: the four model actions also declare model:invoke and keep version 1 (① 10-20), so MCP still offers them under their v1 names
    // and a client granted before sees the changed permissions and grants again, rather than finding no tool.
    for (const name of ["reuse.assess", "conversation.send", "explorations.start", "research.start"]) assert.ok(offered.includes(`alchemist.${name}__v1`) && !offered.includes(`alchemist.${name}__v2`), `${name} is offered as v1`);
    assert.deepEqual(tools.map(entry => entry.name).filter(name => name.startsWith("alchemist.")).sort(), offered);
    assert.deepEqual(alchemistManifest.actions!.filter(action => !action.action.audiences.includes("mcp")).map(action => action.capability_id).sort(), ["alchemist.pulse.github", "alchemist.pulse.github.configure"], "only the account choice is kept from MCP");
    const { direction } = await call(writer, "directions.create", { title: "外部 MCP 方向", description: "通过统一能力创建并跨进程读取方向" });
    assert.equal((await call(reader, "workspace.read")).directions[0].id, direction.id);
    assert.deepEqual((await call(other, "workspace.read")).directions, []);
    for (const [client, name, args] of [[reader, "directions.create", { description: "只读调用不能创建方向" }], [writer, "directions.create", { description: "身份不得来自调用参数", project_id: "b" }],
      [other, "directions.update", { id: direction.id, description: "不得修改其他项目已有方向" }]] as const) {
      assert.equal((await client.callTool({ name: tool(name), arguments: args })).isError, true);
    }
    const receipt = await call(writer, "explorations.start", { id: direction.id });
    let events: any;
    for (let n = 0; n < 100; n++) {
      events = await call(reader, "runs.events", { id: receipt.jobId });
      if (events.status === "completed" || events.status === "failed") break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(events.status, "completed"); assert.equal(events.events.at(-1).type, "completed");
    const { exploration } = await call(reader, "explorations.get", { id: receipt.runId });
    const kept = await call(writer, "cards.keep", { id: exploration.cards[0].id });
    assert.equal(kept.version.revision.actorId, "fixture-owner");
    // The old demo record was deleted (specs/artifact-positioning P8): its read-only export is no longer offered.
    assert.equal(tools.some(entry => entry.name === "alchemist.legacy.export__v1"), false);
    assert.equal((await call(reader, "ideas.version", { id: kept.idea.id, version: 1 })).version.content.title, "证据卡");
    const reply = await call(writer, "conversation.send", { body: "如何验证", context: { kind: "idea", label: "证据卡", ideaId: kept.idea.id, version: 1, panel: "brief" } });
    assert.equal(reply.assistantMessage.responseState, "complete");
    const exported = await call(writer, "workspace.export", { format: "json" });
    assert.equal(JSON.parse(Buffer.from(exported.content, "base64").toString()).data.ideas[0].id, kept.idea.id);
    await writer.close();
    const reopened = await connect("a");
    assert.equal((await call(reopened, "ideas.version", { id: kept.idea.id, version: 1 })).version.id, kept.version.id);
    assert.equal((await call(reopened, "conversation.list")).messages[1].id, reply.assistantMessage.id);
    assert.equal((await reopened.callTool({ name: tool("cards.keep"), arguments: { id: exploration.cards[0].id } })).isError, true);
    assert.equal((await call(reader, "workspace.read")).ideas.length, 1);
    // A fresh Host and a fresh stdio process must read the same persisted owner facts, not the old Host's live runtime.
    await restart();
    const fresh = await connect("a");
    assert.equal((await call(fresh, "ideas.version", { id: kept.idea.id, version: 1 })).version.id, kept.version.id);
    assert.equal((await call(fresh, "conversation.list")).messages[1].id, reply.assistantMessage.id);
  } finally { await close(); }
});

// W5-01-ALC-RES11: the tool an MCP client names is `alchemist.research.cancel__v1` (the action stays at version 1 although it now also stops a
// Pulse: tool names and the grants made on them stay as they were). A wrong name or version resolves to no tool, so this fails with it.
test("W5-01-ALC-RES11: a queued Pulse is stopped through the MCP tool alchemist.research.cancel__v1", { timeout: 120_000 }, async t => {
  const { connect, call, close } = await mcpHome(t, true);
  try {
    // The studio of this process never drains, so the Pulse is still queued, between pulse.start and runPending, when the tool is called.
    const client = await connect("p");
    const names = (await client.listTools()).tools.map(tool => tool.name);
    assert.ok(names.includes("alchemist.research.cancel__v1"), "the cancel tool is offered under its version 1 name");
    assert.ok(!names.some(name => name.startsWith("alchemist.research.cancel__") && name !== "alchemist.research.cancel__v1"), "and under no other version");
    const { run } = await call(client, "pulse.start");
    assert.equal(run.status, "queued");
    const stopped = await call(client, "research.cancel", { id: run.jobId });
    assert.equal(stopped.kind, "pulse");
    assert.deepEqual([stopped.run.id, stopped.run.status], [run.id, "cancelled"]);
    assert.equal((await call(client, "pulse.reports")).latestRun.status, "cancelled", "the Pulse reads back as stopped");
    const again = await client.callTool({ name: "alchemist.research.cancel__v1", arguments: { id: run.jobId } });
    assert.equal(again.isError, true, "a stopped Pulse cannot be stopped again");
    assert.equal((await call(client, "pulse.reports")).latestRun.status, "cancelled", "and the refusal left it as it was");
    assert.equal((await client.callTool({ name: "alchemist.research.cancel__v2", arguments: { id: run.jobId } })).isError, true, "no other version of the tool exists");
  } finally { await close(); }
});
