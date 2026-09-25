import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { openJellyStore } from "@molis-ai/molis-work-plugin-jelly";

test("standard MCP clients share Jelly facts, preserve permissions and recover previews across process restart", { timeout: 45_000 }, async () => {
  const homes = await Promise.all([mkdtemp(join(tmpdir(), "jelly-mcp-a-")), mkdtemp(join(tmpdir(), "jelly-mcp-b-"))]);
  const clients: Client[] = [];
  const connect = async (home: string, access = "write") => {
    const client = new Client({ name: "external-jelly", version: "1" }); clients.push(client);
    const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", fileURLToPath(new URL("./fixtures/jelly-mcp-server.ts", import.meta.url)), home, access], stderr: "pipe" });
    let errors = ""; transport.stderr?.on("data", chunk => { errors += String(chunk); });
    try { await client.connect(transport); } catch (error) { throw new Error(`${String(error)}\n${errors}`); }
    return client;
  };
  const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name: `jelly.${name}__v1`, arguments: args });
    assert.equal(result.isError, false, JSON.stringify(result)); return result.structuredContent as any;
  };
  try {
    const a = await connect(homes[0]!), reader = await connect(homes[0]!, "read"), b = await connect(homes[1]!);
    const tools = (await a.listTools()).tools.map(row => row.name);
    for (const name of ["note.create", "workspace.get", "calendar.list", "plan.manual", "material.extract", "model.settings", "inspiration.delete_preview"]) assert.ok(tools.includes(`jelly.${name}__v1`));
    const state = (await call(a, "note.create", { expected_revision: 0, title: "外部笔记", markdown: "核对真正的结果" })).state;
    const id = state.notes[0].id;
    assert.equal((await call(reader, "workspace.get")).state.notes[0].id, id);
    assert.equal((await call(b, "workspace.get")).state.notes.length, 0);
    assert.equal((await reader.callTool({ name: "jelly.note.create__v1", arguments: { expected_revision: 1, title: "Denied" } })).isError, true);
    assert.equal((await reader.callTool({ name: "jelly.model.settings__v1", arguments: {} })).isError, true);
    assert.equal((await a.callTool({ name: "jelly.note.update__v1", arguments: { expected_revision: 1, id, patch: { title: "Spoof" }, project_id: "other" } })).isError, true);
    const plan = (await call(reader, "plan.manual", { source_type: "note", source_id: id })).plan;
    const applied = (await call(a, "plan.apply", { expected_revision: state.revision, plan })).state;
    assert.ok(applied.notes[0].blocks.some((block: { kind: string }) => block.kind === "task"));
    const material = await call(a, "material.extract", { file_name: "source.txt", data_base64: Buffer.from("来源内容可重新读取").toString("base64") });
    assert.equal((await call(a, "material.reread", { file_name: material.file_name, sha256: material.source_sha256 })).text, "来源内容可重新读取");
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
    const store = openJellyStore(homes[0]!); try { assert.deepEqual(store.read(), undone); } finally { store.close(); }
  } finally { await Promise.all(clients.map(client => client.close())); await Promise.all(homes.map(home => rm(home, { recursive: true, force: true }))); }
});
