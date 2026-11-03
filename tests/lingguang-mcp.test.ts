import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { serveTestHost, type TestHostServer } from "./fixtures/test-home.js";
import { openLingguangStore } from "./fixtures/plugin-home-stores.js";

// RAC-32: three official stdio clients share the single resident Host; restarting that Host preserves the original library.
test("official stdio MCP clients share Lingguang Runtime, scoped grants and persisted results across a Host restart", { timeout: 120_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "lingguang-mcp-"));
  let host: MolisWorkLocalHost | undefined, web: TestHostServer | undefined;
  const start = async () => { host = new MolisWorkLocalHost({ homeDirectory: home, completeText: async () => "MCP fixture reply" }); web = await serveTestHost(null, { home, host }); };
  const stop = async () => { await web?.close(); await host?.close(); web = undefined; host = undefined; };
  const clients: Client[] = [];
  const connect = async (project: string, clientId = "writer") => {
    const client = new Client({ name: "external-lingguang", version: "1" }); clients.push(client);
    const transport = new StdioClientTransport({ command: process.execPath,
      args: ["--import", "tsx", fileURLToPath(new URL("./fixtures/lingguang-mcp-server.ts", import.meta.url)), home, web!.origin, project, clientId], stderr: "pipe" });
    let errors = ""; transport.stderr?.on("data", data => { errors += String(data); });
    try { await client.connect(transport); } catch (error) { throw new Error(`${String(error)}\n${errors}`); }
    return client;
  };
  const call = async (client: Client, name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name: `${name}__v1`, arguments: args });
    assert.equal(result.isError, false, JSON.stringify(result)); return result.structuredContent as any;
  };
  try {
    await start();
    const first = await web!.createProject("Lingguang A"), second = await web!.createProject("Lingguang B");
    for (const [clientId, project] of [["writer", first], ["reader", first], ["other", second]] as const) {
      const views = (await web!.inspect(clientId, project.project_id)).filter(view => view.capability_id.startsWith("lingguang.")
        && (clientId !== "reader" || view.action.permissions.every(permission => permission === "lingguang:read")));
      await web!.grant(clientId, project.project_id, views);
    }
    const a = await connect(first.project_id), b = await connect(second.project_id, "other"), reader = await connect(first.project_id, "reader");
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
      assert.equal(store.get(spark.id, first.project_id).body, "Updated");
      assert.equal(store.conversation(conversation.id, first.project_id).messages.at(-1)?.body, "MCP fixture reply");
    } finally { store.close(); }
    await Promise.all(clients.map(client => client.close()));
    await stop(); await start();
    const restarted = await connect(first.project_id), readerAgain = await connect(first.project_id, "reader");
    assert.deepEqual((await call(restarted, "lingguang.conversation.get", { id: conversation.id })).messages, result.messages);
    const latest = (await call(restarted, "lingguang.get", { id: spark.id })).spark;
    await call(restarted, "lingguang.discard", { ids: [spark.id], expected_updated_at: { [spark.id]: latest.updated_at } });
    assert.deepEqual((await call(readerAgain, "lingguang.list", {})).sparks, []);
  } finally { await Promise.all(clients.map(client => client.close())); await stop(); await rm(home, { recursive: true, force: true }); }
});
