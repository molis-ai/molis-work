import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { alchemistActions as a } from "@molis-ai/molis-work-plugin-alchemist";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { createMcpActionGrant, hostActionToolName } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";

test("production MCP reads persisted scoped grants on every list/call, shares real Alchemist data and preserves revocation after restart", { timeout: 40_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "production-action-mcp-")), clients: Client[] = [];
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "a.sqlite"), boardId: "a", projectId: "a" });
  const diagnostics = new Map<Client, () => string>();
  const connect = async (project: string, actor: string) => {
    const client = new Client({ name: "untrusted-client-name", version: "1" }); clients.push(client);
    const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", fileURLToPath(new URL("./fixtures/production-action-mcp-server.ts", import.meta.url)), home, project, actor], stderr: "pipe" });
    let errors = ""; transport.stderr?.on("data", chunk => { errors += String(chunk); });
    diagnostics.set(client, () => errors);
    try { await client.connect(transport); } catch (error) { throw new Error(`${String(error)}\n${errors}`); }
    return client;
  };
  try {
    const catalog = await host.inspectActions({ actor_id: "runtime:alpha", project_id: "a", audience: "mcp", permissions: [] }, ref);
    const definition = (id: string) => catalog.find(row => row.capability_id === id)!;
    assert.ok(definition(a.directionCreate.capability_id));
    await assert.rejects(access(join(home, "alchemist/projects/a/studio.sqlite")), { code: "ENOENT" });
    const alpha = await connect("a", "alpha"), beta = await connect("a", "beta"), otherProject = await connect("b", "alpha");
    const names = async (client: Client) => {
      try { return (await client.listTools()).tools.map(tool => tool.name); }
      catch (error) { throw new Error(`${String(error)}\n${diagnostics.get(client)?.() ?? ""}`); }
    };
    const createName = hostActionToolName(a.directionCreate), bootstrapName = hostActionToolName(a.bootstrap);
    assert.equal((await names(alpha)).includes(createName), false);
    const createGrant = createMcpActionGrant("runtime:alpha", "a", definition(a.directionCreate.capability_id), true);
    await writeMcpActionGrant(home, createGrant);
    await writeMcpActionGrant(home, createMcpActionGrant("runtime:alpha", "a", definition(a.bootstrap.capability_id), true));
    await writeMcpActionGrant(home, createMcpActionGrant("runtime:beta", "a", definition(a.bootstrap.capability_id), true));
    assert.ok((await names(alpha)).includes(createName));
    assert.equal((await names(beta)).includes(createName), false);
    assert.equal((await names(otherProject)).includes(createName), false);
    const created = await alpha.callTool({ name: createName, arguments: { description: "正式 MCP 授权写入的研究方向" },
      _meta: { actor_id: "runtime:beta", project_id: "b" } });
    assert.equal(created.isError, false, JSON.stringify(created));
    const state = await beta.callTool({ name: bootstrapName, arguments: {} });
    assert.equal(state.isError, false);
    assert.ok(JSON.stringify(state.structuredContent).includes((created.structuredContent as any).direction.id));
    for (const client of [beta, otherProject]) assert.equal((await client.callTool({ name: createName, arguments: { description: "不能写入" } })).isError, true);
    assert.equal((await alpha.callTool({ name: createName, arguments: { description: "不能冒充", actor_id: "beta" } })).isError, true);
    await writeMcpActionGrant(home, { ...createGrant, enabled: false });
    assert.equal((await names(alpha)).includes(createName), false);
    assert.equal((await alpha.callTool({ name: createName, arguments: { description: "撤权后不能写入" } })).isError, true);
    await alpha.close(); const restarted = await connect("a", "alpha");
    assert.equal((await names(restarted)).includes(createName), false);
    assert.deepEqual((await restarted.callTool({ name: bootstrapName, arguments: {} })).structuredContent, { ...state.structuredContent, actor: { id: "runtime:alpha", name: "runtime:alpha" } });
  } finally { await Promise.all(clients.map(client => client.close())); await host.close(); await rm(home, { recursive: true, force: true }); }
});
