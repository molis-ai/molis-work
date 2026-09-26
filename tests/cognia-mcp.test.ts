import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { openCogniaStore } from "@molis-ai/molis-work-plugin-cognia";

test("standard Cognia MCP clients share real imports and fixed bytes, isolate Home/read grants, and resume after restart", { timeout: 45_000 }, async () => {
  const homes = await Promise.all([mkdtemp(join(tmpdir(), "cognia-mcp-a-")), mkdtemp(join(tmpdir(), "cognia-mcp-b-"))]);
  const clients: Client[] = [];
  const connect = async (home: string, access = "write") => {
    const client = new Client({ name: "external-cognia", version: "1" }); clients.push(client);
    const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", fileURLToPath(new URL("./fixtures/cognia-mcp-server.ts", import.meta.url)), home, access], stderr: "pipe" });
    let errors = ""; transport.stderr?.on("data", chunk => { errors += String(chunk); });
    try { await client.connect(transport); } catch (error) { throw new Error(`${String(error)}\n${errors}`); }
    return client;
  };
  const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name: `cognia.${name}__v1`, arguments: args });
    assert.equal(result.isError, false, JSON.stringify(result)); return result.structuredContent as any;
  };
  try {
    const a = await connect(homes[0]!), reader = await connect(homes[0]!, "read"), b = await connect(homes[1]!);
    const tools = (await a.listTools()).tools.map(row => row.name);
    for (const name of ["material.create", "workspace.get", "material.search", "material.download", "import.preview", "import.commit", "draft.save"]) assert.ok(tools.includes(`cognia.${name}__v1`));
    assert.ok(!(await reader.listTools()).tools.some(row => row.name === "cognia.directory.scan__v1"));
    const preview = (await call(a, "import.preview", { kind: "markdown", name: "External", files: [{ path: "original.md", data: Buffer.from("# Evidence\nOriginal bytes").toString("base64") }] })).preview;
    await a.close(); const restarted = await connect(homes[0]!);
    const receipt = (await call(restarted, "import.commit", { preview_id: preview.id })).receipt;
    assert.deepEqual((await call(restarted, "import.commit", { preview_id: preview.id })).receipt, receipt);
    const id = receipt.material_ids[0];
    assert.equal((await call(reader, "material.search", { query: "Evidence" })).materials[0].id, id);
    assert.equal(Buffer.from((await call(reader, "material.download", { id, revision: 1 })).data, "base64").toString(), "# Evidence\nOriginal bytes");
    assert.equal((await call(b, "workspace.get")).materials.length, 0);
    assert.equal((await reader.callTool({ name: "cognia.material.create__v1", arguments: { title: "denied", body: "x" } })).isError, true);
    assert.equal((await reader.callTool({ name: "cognia.directory.scan__v1", arguments: { path: homes[0] } })).isError, true);
    assert.equal((await restarted.callTool({ name: "cognia.material.get__v1", arguments: { id, project_id: "other" } })).isError, true);
    await call(restarted, "source.delete", { id: receipt.source_id });
    assert.equal((await call(reader, "workspace.get")).materials.length, 0);
    assert.equal((await call(reader, "material.get", { id, revision: 1 })).material.body, "# Evidence\nOriginal bytes");
    const store = openCogniaStore(homes[0]!); try { assert.equal(store.read(id, 1).body, "# Evidence\nOriginal bytes"); assert.equal(store.materials().length, 0); } finally { store.close(); }
  } finally { await Promise.all(clients.map(client => client.close())); await Promise.all(homes.map(home => rm(home, { recursive: true, force: true }))); }
});
