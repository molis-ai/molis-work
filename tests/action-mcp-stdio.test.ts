import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("official MCP client discovers a Runtime plugin, persists data and isolates launch identities across processes", { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "action-mcp-"));
  const database = join(root, "notes.sqlite");
  const clients: Client[] = [];
  const connect = async (project: string, actor: string) => {
    const client = new Client({ name: "external-client", version: "1.0.0" });
    clients.push(client);
    const transport = new StdioClientTransport({ command: process.execPath,
      args: ["--import", "tsx", fileURLToPath(new URL("./fixtures/action-mcp-server.ts", import.meta.url)), database, project, actor], stderr: "pipe" });
    let errors = "";
    transport.stderr?.on("data", chunk => { errors += String(chunk); });
    try { await client.connect(transport); } catch (error) { throw new Error(`${String(error)}\n${errors}`); }
    return client;
  };
  try {
    const alice = await connect("project-one", "alice");
    const bob = await connect("project-two", "bob");
    const names = (await alice.listTools()).tools.map(t => t.name);
    assert.deepEqual(names, ["fixture.notes.create__v1", "fixture.notes.list__v1"]);
    await bob.listTools();
    const saved = await alice.callTool({ name: names[0]!, arguments: { text: "MCP wrote this" },
      _meta: { actor_id: "bob", project_id: "project-two", "molis-work/sessionId": "spoofed" } });
    assert.equal(saved.isError, false);
    assert.deepEqual(saved.structuredContent, { id: 1 });
    const read = await alice.callTool({ name: names[1]!, arguments: {} });
    assert.deepEqual(read.structuredContent, { result: [{ text: "MCP wrote this", actor: "alice" }] });
    assert.deepEqual((await bob.callTool({ name: names[1]!, arguments: {} })).structuredContent, { result: [] });
    const rejected = await alice.callTool({ name: names[0]!, arguments: { text: "spoof", actor_id: "bob" } });
    assert.equal(rejected.isError, true);
    await alice.close();
    const restarted = await connect("project-one", "alice");
    await restarted.listTools();
    assert.deepEqual((await restarted.callTool({ name: names[1]!, arguments: {} })).structuredContent, read.structuredContent);
    const db = new DatabaseSync(database);
    try { assert.deepEqual(JSON.parse(JSON.stringify(db.prepare("SELECT project, actor, text FROM notes").all())),
      [{ project: "project-one", actor: "alice", text: "MCP wrote this" }]); } finally { db.close(); }
  } finally { await Promise.all(clients.map(client => client.close())); await rm(root, { recursive: true, force: true }); }
});
