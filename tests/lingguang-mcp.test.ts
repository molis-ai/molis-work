import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { openLingguangStore } from "@molis-ai/molis-work-plugin-lingguang";

test("official stdio MCP client uses actual Lingguang business actions with scoped grants and shared persisted results", { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "lingguang-mcp-"));
  const clients: Client[] = [];
  const connect = async (project: string, access = "write") => {
    const client = new Client({ name: "external-lingguang", version: "1" }); clients.push(client);
    const transport = new StdioClientTransport({ command: process.execPath,
      args: ["--import", "tsx", fileURLToPath(new URL("./fixtures/lingguang-mcp-server.ts", import.meta.url)), home, project, access], stderr: "pipe" });
    let errors = ""; transport.stderr?.on("data", data => { errors += String(data); });
    try { await client.connect(transport); } catch (error) { throw new Error(`${String(error)}\n${errors}`); }
    return client;
  };
  const call = async (client: Client, name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name: `${name}__v1`, arguments: args });
    assert.equal(result.isError, false, JSON.stringify(result)); return result.structuredContent as any;
  };
  try {
    const a = await connect("a"), b = await connect("b"), reader = await connect("a", "read");
    const available = (await a.listTools()).tools.map(row => row.name);
    assert.ok(available.includes("lingguang.conversation.message__v1"));
    const { spark } = await call(a, "lingguang.create", { title: "External", body: "Written through MCP" });
    assert.equal((await call(reader, "lingguang.get", { id: spark.id })).spark.body, "Written through MCP");
    assert.deepEqual((await call(b, "lingguang.list", {})).sparks, []);
    assert.equal((await b.callTool({ name: "lingguang.get__v1", arguments: { id: spark.id } })).isError, true);
    assert.equal((await reader.callTool({ name: "lingguang.create__v1", arguments: { title: "Denied" } })).isError, true);
    assert.equal((await a.callTool({ name: "lingguang.create__v1", arguments: { title: "Spoof", project_id: "b" } })).isError, true);
    await call(a, "lingguang.update", { id: spark.id, body: "Updated", expected_updated_at: spark.updated_at });
    const { conversation } = await call(a, "lingguang.conversation.open", { spark_ids: [spark.id] });
    const result = await call(a, "lingguang.conversation.message", { id: conversation.id, body: "Next step?" });
    assert.equal(result.messages.at(-1).role, "assistant");
    const store = openLingguangStore(home);
    try {
      assert.equal(store.get(spark.id, "a").body, "Updated");
      assert.equal(store.conversation(conversation.id, "a").messages.at(-1)?.body, "MCP fixture reply");
    } finally { store.close(); }
    await a.close();
    const restarted = await connect("a");
    assert.deepEqual((await call(restarted, "lingguang.conversation.get", { id: conversation.id })).messages, result.messages);
    await call(restarted, "lingguang.discard", { ids: [spark.id] });
    assert.deepEqual((await call(reader, "lingguang.list", {})).sparks, []);
  } finally { await Promise.all(clients.map(client => client.close())); await rm(home, { recursive: true, force: true }); }
});
