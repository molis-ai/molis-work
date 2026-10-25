import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { openJellyStore, JELLY_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-jelly";
import { molisWorkActionToolName } from "@molis-ai/molis-work-app-mcp";
import { openTestHome, type TestHome } from "./fixtures/test-home.js";
import { residentMcpGrants } from "./fixtures/resident-mcp-grants.js";

// RAC-105-A-16: each Home has one resident; the independent stdio clients may reconnect without taking its owner.
test("standard MCP clients share Jelly facts, preserve permissions and recover previews across client restart", { timeout: 45_000 }, async t => {
  const homes = await Promise.all([openTestHome(t), openTestHome(t)]);
  const clients: Client[] = [];
  const grant = residentMcpGrants();
  const connect = async (resident: TestHome, access = "write") => {
    const actor = `runtime:fixture-${access}`, permissions = access === "read" ? ["jelly:read"] : JELLY_ACTION_PERMISSIONS.filter(permission => permission !== "model:invoke");
    await grant(resident, null, actor, "jelly", permissions);
    const client = new Client({ name: "external-jelly", version: "1" }); clients.push(client);
    const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", fileURLToPath(new URL("./fixtures/jelly-mcp-server.ts", import.meta.url)), resident.home, `fixture-${access}`, resident.origin], stderr: "pipe" });
    let errors = ""; transport.stderr?.on("data", chunk => { errors += String(chunk); });
    try { await client.connect(transport); } catch (error) { throw new Error(`${String(error)}\n${errors}`); }
    return client;
  };
  const tool = (name: string) => molisWorkActionToolName({ capability_id: `jelly.${name}`, version: 1 });
  const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name: tool(name), arguments: args });
    assert.equal(result.isError, false, JSON.stringify(result)); return result.structuredContent as any;
  };
  try {
    const a = await connect(homes[0]!), reader = await connect(homes[0]!, "read"), b = await connect(homes[1]!);
    const tools = (await a.listTools()).tools.map(row => row.name);
    for (const name of ["note.create", "workspace.get", "calendar.list", "plan.manual", "model.settings", "note.delete_preview"]) assert.ok(tools.includes(tool(name)));
    // Reading files and pages, and keeping ideas, belong to 灵光 now.
    for (const name of ["material.extract", "source.read", "inspiration.create", "inspiration.delete_preview"]) assert.ok(!tools.includes(tool(name)), name);
    const state = (await call(a, "note.create", { expected_revision: 0, title: "外部笔记", markdown: "核对真正的结果" })).state;
    const id = state.notes[0].id;
    assert.equal((await call(reader, "workspace.get")).state.notes[0].id, id);
    assert.equal((await call(b, "workspace.get")).state.notes.length, 0);
    assert.equal((await reader.callTool({ name: tool("note.create"), arguments: { expected_revision: 1, title: "Denied" } })).isError, true);
    assert.equal((await reader.callTool({ name: tool("model.settings"), arguments: {} })).isError, true);
    assert.equal((await a.callTool({ name: tool("note.update"), arguments: { expected_revision: 1, id, patch: { title: "Spoof" }, project_id: "other" } })).isError, true);
    const plan = (await call(reader, "plan.manual", { source_type: "note", source_id: id })).plan;
    const applied = (await call(a, "plan.apply", { expected_revision: state.revision, plan })).state;
    assert.ok(applied.notes[0].blocks.some((block: { kind: string }) => block.kind === "task"));
    assert.equal((await call(a, "model.settings")).configured, false);
    const archived = (await call(a, "note.archive", { id, expected_revision: applied.revision })).state;
    const preview = (await call(a, "note.delete_preview", { id })).preview;
    await a.close();
    const restarted = await connect(homes[0]!);
    const deleted = (await call(restarted, "note.delete", { id, expected_revision: archived.revision, confirmation_token: preview.confirmation_token })).state;
    assert.equal(deleted.notes.length, 0);
    const undone = (await call(restarted, "undo", { expected_revision: deleted.revision })).state;
    assert.equal(undone.notes[0].id, id);
    assert.deepEqual((await call(reader, "workspace.get")).state, undone);
    const store = openJellyStore(homes[0]!.home); try { assert.deepEqual(store.read(), undone); } finally { store.close(); }
  } finally { await Promise.all(clients.map(client => client.close())); }
});
