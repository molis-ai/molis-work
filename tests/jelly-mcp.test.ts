import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { JELLY_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-jelly";
import { openJellyStore } from "./fixtures/plugin-home-stores.js";
import { molisWorkActionToolName } from "@molis-ai/molis-work-app-mcp";
import { openTestHome, type TestHome } from "./fixtures/test-home.js";
import { residentMcpGrants } from "./fixtures/resident-mcp-grants.js";

// RAC-105-A-16: each Home has one resident; the independent stdio clients may reconnect without taking its owner.
// 90 s: the loaded Linux full-suite runner took 45.8 s on main (#2315) and timed out at 45 s twice on batch 106; 14 s on a development machine.
test("standard MCP clients share Jelly rows, keep their permissions and can undo a delete after a client restart", { timeout: 90_000 }, async t => {
  const homes = await Promise.all([openTestHome(t), openTestHome(t)]);
  // Jelly works in a partition (batch 108): each Home's clients are bound to one project that has it.
  const projects = new Map(await Promise.all(homes.map(async home => [home, await home.createProject("Calendar", ["jelly"])] as const)));
  const clients: Client[] = [];
  const grant = residentMcpGrants();
  const connect = async (resident: TestHome, access = "write") => {
    const actor = `runtime:fixture-${access}`, permissions = access === "read" ? ["jelly:read"] : JELLY_ACTION_PERMISSIONS;
    const project = projects.get(resident)!;
    await grant(resident, project.project_id, actor, "jelly", permissions);
    const client = new Client({ name: "external-jelly", version: "1" }); clients.push(client);
    const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", fileURLToPath(new URL("./fixtures/jelly-mcp-server.ts", import.meta.url)), resident.home, `fixture-${access}`, resident.origin, project.database_path, project.project_id], stderr: "pipe" });
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
    for (const name of ["calendar.list", "item.create", "note.save", "note.list", "note.delete", "restore"]) assert.ok(tools.includes(tool(name)), name);
    // Jelly has no model, settings or plans since batch 112-2, and reading files and pages belongs to 灵光.
    for (const name of ["model.settings", "plan.manual", "plan.generate", "workspace.get", "material.extract", "source.read"]) assert.ok(!tools.includes(tool(name)), name);
    const { note } = await call(a, "note.save", { expected_revision: 0, title: "外部笔记", body: "核对真正的结果", day: "2026-10-20" });
    assert.deepEqual((await call(reader, "note.list", { day: "2026-10-20" })).notes.map((row: { id: string }) => row.id), [note.id]);
    assert.equal((await call(b, "note.list")).notes.length, 0, "another Home sees none of it");
    assert.equal((await reader.callTool({ name: tool("note.save"), arguments: { expected_revision: 0, title: "Denied" } })).isError, true);
    assert.equal((await a.callTool({ name: tool("note.save"), arguments: { id: note.id, expected_revision: 1, body: "Spoof", project_id: "other" } })).isError, true);
    const { item } = await call(a, "item.create", { item: { title: "外部日程", start_date: "2026-10-20" } });
    assert.deepEqual((await call(reader, "calendar.list", { start: "2026-10-01", end: "2026-10-31" })).items.map((row: { id: string }) => row.id), [item.id]);
    const { restore } = await call(a, "note.delete", { id: note.id, expected_revision: 1 });
    await a.close();
    // Undo still works from a client started after the delete: the restore rows travel with the answer, not the session.
    const restarted = await connect(homes[0]!);
    await call(restarted, "restore", { rows: restore });
    assert.equal((await call(reader, "note.get", { id: note.id })).note.body, "核对真正的结果");
    const store = openJellyStore(homes[0]!.home, projects.get(homes[0]!)!.project_id); try { assert.equal(store.read(s => s.get("note", note.id))?.title, "外部笔记"); } finally { store.close(); }
  } finally { await Promise.all(clients.map(client => client.close())); }
});
