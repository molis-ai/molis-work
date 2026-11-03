import assert from "node:assert/strict";
import test from "node:test";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { alchemistActions as alchemist } from "@molis-ai/molis-work-plugin-alchemist";
import { molisWorkActionToolName } from "@molis-ai/molis-work-app-mcp";
import { openTestHome } from "./fixtures/test-home.js";

// Every MCP client here starts its own forwarding process, which takes several seconds on a loaded Linux CI runner (30–45 s for the
// whole test at two files at once): the budget only stops a hang, it is not a speed check.
test("production MCP reads persisted scoped grants on every list/call, shares real Alchemist data and preserves revocation after restart", { timeout: 120_000 }, async t => {
  const clients: Client[] = [];
  const testHome = await openTestHome(t), home = testHome.home;
  const a = await testHome.createProject("授权项目 A"), b = await testHome.createProject("授权项目 B");
  const diagnostics = new Map<Client, () => string>();
  const connect = async (project: { project_id: string; database_path: string }, actor: string) => {
    const client = new Client({ name: "untrusted-client-name", version: "1" }); clients.push(client);
    const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", fileURLToPath(new URL("./fixtures/production-action-mcp-server.ts", import.meta.url)),
      home, project.project_id, actor, project.database_path, testHome.origin], stderr: "pipe" });
    let errors = ""; transport.stderr?.on("data", chunk => { errors += String(chunk); });
    diagnostics.set(client, () => errors);
    try { await client.connect(transport); } catch (error) { throw new Error(`${String(error)}\n${errors}`); }
    return client;
  };
  try {
    const catalog = await testHome.inspect("runtime:alpha", a.project_id);
    const definition = (id: string) => catalog.find(row => row.capability_id === id)!;
    assert.ok(definition(alchemist.directionCreate.capability_id));
    await assert.rejects(access(join(home, "alchemist/projects", a.project_id, "studio.sqlite")), { code: "ENOENT" });
    const alpha = await connect(a, "alpha"), beta = await connect(a, "beta"), otherProject = await connect(b, "alpha");
    const names = async (client: Client) => {
      try { return (await client.listTools()).tools.map(tool => tool.name); }
      catch (error) { throw new Error(`${String(error)}\n${diagnostics.get(client)?.() ?? ""}`); }
    };
    const createName = molisWorkActionToolName(alchemist.directionCreate), bootstrapName = molisWorkActionToolName(alchemist.bootstrap);
    assert.equal((await names(alpha)).includes(createName), false);
    await testHome.grant("runtime:alpha", a.project_id, [definition(alchemist.directionCreate.capability_id), definition(alchemist.bootstrap.capability_id)]);
    await testHome.grant("runtime:beta", a.project_id, [definition(alchemist.bootstrap.capability_id)]);
    assert.ok((await names(alpha)).includes(createName));
    assert.equal((await names(beta)).includes(createName), false);
    assert.equal((await names(otherProject)).includes(createName), false);
    const created = await alpha.callTool({ name: createName, arguments: { description: "正式 MCP 授权写入的研究方向" },
      _meta: { actor_id: "runtime:beta", project_id: b.project_id } });
    assert.equal(created.isError, false, JSON.stringify(created));
    const state = await beta.callTool({ name: bootstrapName, arguments: {} });
    assert.equal(state.isError, false);
    assert.ok(JSON.stringify(state.structuredContent).includes((created.structuredContent as any).direction.id));
    for (const client of [beta, otherProject]) assert.equal((await client.callTool({ name: createName, arguments: { description: "不能写入" } })).isError, true);
    assert.equal((await alpha.callTool({ name: createName, arguments: { description: "不能冒充", actor_id: "beta" } })).isError, true);
    await testHome.revoke("runtime:alpha", a.project_id, [definition(alchemist.directionCreate.capability_id)]);
    assert.equal((await names(alpha)).includes(createName), false);
    assert.equal((await alpha.callTool({ name: createName, arguments: { description: "撤权后不能写入" } })).isError, true);
    await alpha.close(); const restarted = await connect(a, "alpha");
    assert.equal((await names(restarted)).includes(createName), false);
    assert.deepEqual((await restarted.callTool({ name: bootstrapName, arguments: {} })).structuredContent, { ...state.structuredContent, actor: { id: "runtime:alpha", name: "runtime:alpha" } });
  } finally { await Promise.all(clients.map(client => client.close())); }
});
