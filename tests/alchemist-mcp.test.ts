import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { alchemistManifest } from "@molis-ai/molis-work-plugin-alchemist";

test("Alchemist standard MCP shares persisted business state across processes with project and read-only fixture grants", { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "alchemist-mcp-")), clients: Client[] = [];
  const connect = async (project: string, access = "write") => {
    const client = new Client({ name: "external-alchemist", version: "1" }); clients.push(client);
    const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", fileURLToPath(new URL("./fixtures/alchemist-mcp-server.ts", import.meta.url)), home, project, access], stderr: "pipe" });
    let errors = ""; transport.stderr?.on("data", data => { errors += String(data); });
    try { await client.connect(transport); } catch (error) { throw new Error(`${String(error)}\n${errors}`); }
    return client;
  };
  const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name: `alchemist.${name}__v1`, arguments: args });
    assert.equal(result.isError, false, JSON.stringify(result)); return result.structuredContent as any;
  };
  try {
    const writer = await connect("a"), reader = await connect("a", "read"), other = await connect("b");
    const tools = (await writer.listTools()).tools;
    assert.deepEqual(tools.map(tool => tool.name).filter(name => name.startsWith("alchemist.")).sort(), alchemistManifest.actions!.map(action => `${action.capability_id}__v1`).sort());
    const { direction } = await call(writer, "directions.create", { title: "外部 MCP 方向", description: "通过统一能力创建并跨进程读取方向" });
    assert.equal((await call(reader, "workspace.read")).directions[0].id, direction.id);
    assert.deepEqual((await call(other, "workspace.read")).directions, []);
    for (const [client, name, args] of [[reader, "directions.create", { description: "只读调用不能创建方向" }], [writer, "directions.create", { description: "身份不得来自调用参数", project_id: "b" }],
      [other, "directions.update", { id: direction.id, description: "不得修改其他项目已有方向" }]] as const) {
      assert.equal((await client.callTool({ name: `alchemist.${name}__v1`, arguments: args })).isError, true);
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
    assert.deepEqual((await call(reader, "legacy.export")).directions, []);
    assert.equal((await call(reader, "ideas.version", { id: kept.idea.id, version: 1 })).version.content.title, "证据卡");
    const reply = await call(writer, "conversation.send", { body: "如何验证", context: { kind: "idea", label: "证据卡", ideaId: kept.idea.id, version: 1, panel: "brief" } });
    assert.equal(reply.assistantMessage.responseState, "complete");
    const exported = await call(writer, "workspace.export", { format: "json" });
    assert.equal(JSON.parse(Buffer.from(exported.content, "base64").toString()).data.ideas[0].id, kept.idea.id);
    await writer.close();
    const reopened = await connect("a");
    assert.equal((await call(reopened, "ideas.version", { id: kept.idea.id, version: 1 })).version.id, kept.version.id);
    assert.equal((await call(reopened, "conversation.list")).messages[1].id, reply.assistantMessage.id);
    assert.equal((await reopened.callTool({ name: "alchemist.cards.keep__v1", arguments: { id: exploration.cards[0].id } })).isError, true);
    assert.equal((await call(reader, "workspace.read")).ideas.length, 1);
  } finally { await Promise.all(clients.map(client => client.close())); await rm(home, { recursive: true, force: true }); }
});
