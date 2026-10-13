import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, MEMORY_PROVIDER_ID, memoryActions, type MemoryRecallResponse } from "@molis-ai/molis-work-contracts/services/memory";
import { MolisWorkLocalHost, molisWorkHostProjectReference, readMcpToolPreference } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";

/** What the server answers to tools/list and tools/call, as far as this test reads it. */
interface McpResult { tools: Array<{ name: string }>; isError?: boolean; content: Array<{ text: string }> }

// Decision 19 (specs/repository-anti-corruption, W2-03): the MCP audience of memory stays, and this is the use case that goes through the
// person's grant (`config/mcp-tools.json`, which only the person's own settings write) the way a real external client meets it: nothing is
// visible or callable before the grant, only `memory.recall` can be granted, what it reads follows the person's switches, and revoking the
// grant takes the tool away.
const RECALL_TOOL = "molis_work_v1_action_memory.recall__v1";

test("an external MCP client reads memory only through the person's grant for memory.recall, by the person's switches, and loses it when the grant is revoked", { timeout: 240_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-mcp-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const servers: MolisWorkServer[] = [];
  t.after(async () => { for (const server of servers) await server.close(); await host.close(); await rm(home, { recursive: true, force: true }); });
  const projectId = "memory-mcp";
  const reference = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId });
  const person: ActionCallContext = { actor_id: "web-user", project_id: projectId, audience: "user", permissions: [...MEMORY_PERMISSIONS] };
  const asPerson = bindActionClient(host.actionClient(reference), () => person);
  await asPerson.invoke(memoryActions.write, { scope: "project", text: "本项目的周报先写风险", kind: "convention" });
  await asPerson.invoke(memoryActions.write, { scope: "personal", text: "我的周报先写风险再写进展", kind: "preference" });

  const connect = (runtimeId: string) => {
    const server = new MolisWorkServer("runtime", { databasePath: reference.storage_key, projectId, webBaseUrl: "http://127.0.0.1:4173" },
      { homeDirectory: home, runtimeContext: { runtime_id: runtimeId, stable_work_context_id: `session-${runtimeId}`, host_declares_stable: true } }, host);
    servers.push(server);
    const rpc = async (method: string, params: object) => ((await server.handleMessage({ jsonrpc: "2.0", id: 1, method, params }) as { result: McpResult }).result);
    return {
      tools: async () => (await rpc("tools/list", {})).tools.map((tool: { name: string }) => tool.name) as string[],
      call: (name: string, args: object) => rpc("tools/call", { name, arguments: args }),
    };
  };
  const codex = connect("codex"), stranger = connect("stranger");
  const recalled = async (client: typeof codex, query: string) => {
    const result = await client.call(RECALL_TOOL, { query });
    assert.equal(result.isError, false, JSON.stringify(result));
    return JSON.parse(result.content[0].text) as MemoryRecallResponse;
  };
  // The person's grant, as the settings page records it: one record per client, action, version and provider; memory.recall is a Home action.
  const grant = { client_id: "runtime:codex", project_id: null, capability_id: "memory.recall", version: 1, provider_id: MEMORY_PROVIDER_ID, permissions: ["memory:recall"], enabled: true };
  const record = async (grants: readonly object[]) => {
    await mkdir(join(home, "config"), { recursive: true });
    await writeFile(join(home, "config", "mcp-tools.json"), JSON.stringify({ version: 2, action_grants: grants }, null, 2));
  };

  // Before a grant the client sees nothing of memory, and a call by name is refused without leaking a memory.
  assert.equal((await codex.tools()).some(name => name.includes("memory.")), false, "declaring an MCP audience grants nothing");
  const refused = await codex.call(RECALL_TOOL, { query: "周报 风险" });
  assert.equal(refused.isError, true);
  assert.doesNotMatch(JSON.stringify(refused), /先写风险/);

  // What an MCP client can be granted of memory is memory.recall and nothing else: listing everything, writing and managing stay closed to it.
  const mcpCaller: ActionCallContext = { actor_id: "runtime:codex", project_id: projectId, audience: "mcp", permissions: [] };
  const inspected = (await host.inspectActions(mcpCaller, reference)).filter(view => view.provider.provider_id === MEMORY_PROVIDER_ID);
  assert.deepEqual(inspected.map(view => [view.capability_id, view.version, view.action.permissions]), [["memory.recall", 1, ["memory:recall"]]]);

  await record([grant]);
  assert.deepEqual((await readMcpToolPreference(home)).action_grants, [grant], "the record is one the Host accepts");
  assert.deepEqual((await codex.tools()).filter(name => name.includes("memory.")), [RECALL_TOOL], "only the granted tool appears; list, write and manage never do");
  assert.equal((await stranger.tools()).includes(RECALL_TOOL), false, "another client holds no grant");
  assert.equal((await stranger.call(RECALL_TOOL, { query: "周报 风险" })).isError, true);

  // The client reads the project's memories; the person's personal ones stay out until the person switches that on for external AI clients.
  assert.deepEqual((await recalled(codex, "周报 风险")).items.map(item => [item.scope, item.text]), [["project", "本项目的周报先写风险"]]);
  await asPerson.invoke(memoryActions.savePrefs, { scope: "personal", prefs: { consumers: { mcp: true } } });
  assert.deepEqual((await recalled(codex, "周报 风险")).items.map(item => item.scope).sort(), ["personal", "project"]);
  await asPerson.invoke(memoryActions.savePrefs, { scope: "project", prefs: { consumers: { mcp: false } } });
  assert.deepEqual((await recalled(codex, "周报 风险")).items.map(item => item.scope), ["personal"], "the project switch for external clients holds");
  await asPerson.invoke(memoryActions.savePrefs, { scope: "project", prefs: { consumers: { mcp: true } } });

  // Who is asking comes from the connection, never from the arguments; unknown arguments are refused rather than read as a claim.
  const forged = await codex.call(RECALL_TOOL, { query: "周报 风险", consumer: "ui", actor_id: "web-user", project_id: "other" });
  assert.equal(forged.isError, true);
  assert.equal((await recalled(codex, "周报 风险")).items.length, 2);
  const uses = (await asPerson.invoke(memoryActions.list, {})).items.map(item => item.last_used?.consumer);
  assert.deepEqual(uses, ["mcp", "mcp"], "each recall by the client is a use receipt, shown to the person as used by an external AI client");

  // Revoking the grant takes the tool away at once and the next call is refused; granting again restores it.
  await record([{ ...grant, enabled: false }]);
  assert.equal((await codex.tools()).includes(RECALL_TOOL), false);
  const revoked = await codex.call(RECALL_TOOL, { query: "周报 风险" });
  assert.equal(revoked.isError, true);
  assert.doesNotMatch(JSON.stringify(revoked), /先写风险/);
  await record([grant]);
  assert.equal((await recalled(codex, "周报 风险")).items.length, 2, "granting again restores it");
});
