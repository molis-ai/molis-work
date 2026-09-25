import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { DesktopPanelService } from "../apps/desktop/src/panels.js";
import { createDesktopPanelTables, SqliteDesktopPanelRepository } from "../apps/desktop/src/adapters/sqlite-panels.js";
import { MolisWorkProjectCatalog } from "../apps/local-host/src/project-catalog.js";
import { textStatsActions } from "@molis-ai/molis-work-plugin-text-stats";
import { filesActions } from "@molis-ai/molis-work-plugin-files";
import { diffActions } from "@molis-ai/molis-work-plugin-diff";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { projectActionAvailability } from "../apps/local-host/src/project-action-availability.js";
import { createMcpActionGrant, hostActionToolName } from "../apps/local-host/src/mcp-action-grants.js";
import { readMcpToolPreference, writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";

test("headless runtime companions are discovered and called by the official MCP client with live project and client grants", { timeout: 120_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "companion-actions-"));
  const catalog = await MolisWorkProjectCatalog.open({ homeDirectory: home }, {
    createPanelSchema: createDesktopPanelTables,
    createPanels: (db, ports) => new DesktopPanelService({ ...ports, repository: new SqliteDesktopPanelRepository(db) }),
  });
  const project = await catalog.createProject({ display_name: "Headless companions", actor_id: "owner" });
  catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "coding", actor_id: "owner" });
  let workspaceReads = 0, completions = 0;
  const host = new MolisWorkLocalHost({ homeDirectory: home,
    actionAvailability: projectActionAvailability(async (_options, operation) => operation(catalog), home),
    workspaceFor: async () => { workspaceReads++; return null; },
    completeText: async () => { completions++; throw new Error("Discovery must not call a model"); },
  });
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
  const caller: ActionCallContext = { actor_id: "runtime:reader", project_id: project.project_id, audience: "mcp", permissions: ["artifact:read"] };
  const client = host.actionClient(reference), clients: Client[] = [];
  const connect = async (identity: string) => {
    const sdk = new Client({ name: "untrusted", version: "1" }); clients.push(sdk);
    const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx",
      fileURLToPath(new URL("./fixtures/production-action-mcp-server.ts", import.meta.url)), home, project.project_id, identity, project.database_path, project.board_id], stderr: "pipe" });
    let errors = ""; transport.stderr?.on("data", chunk => { errors += String(chunk); });
    try { await sdk.connect(transport); } catch (error) { throw new Error(`${String(error)}\n${errors}`); }
    return sdk;
  };
  try {
    await assert.rejects(async () => client.discover({ ...caller, project_id: "wrong" }), { code: "actions.scope_mismatch" });
    const definitions = [textStatsActions.count, textStatsActions.state, diffActions.compare, diffActions.state];
    const directories = await Promise.all([client.discover(caller), client.discover(caller)]);
    const rows = directories[0].filter(row => definitions.some(def => def.capability_id === row.capability_id));
    assert.equal(rows.length, 4);
    assert.ok(rows.every(row => row.availability.available));
    assert.deepEqual(directories[0], directories[1], "concurrent discovery shares providers");
    assert.equal(workspaceReads, 0); assert.equal(completions, 0);
    const reader = await connect("reader"), stranger = await connect("stranger");
    const countName = hostActionToolName(textStatsActions.count);
    assert.equal((await reader.listTools()).tools.some(tool => tool.name === countName), false, "discovery does not grant execution");
    for (const row of rows) await writeMcpActionGrant(home, createMcpActionGrant(caller.actor_id, project.project_id, row, true));
    assert.ok((await reader.listTools()).tools.some(tool => tool.name === countName));
    const fileAction = (await host.inspectActions(caller, reference)).find(row => row.capability_id === filesActions.open.capability_id)!;
    assert.equal(fileAction.availability.available, false, "legacy owner-bound actions must disclose their current identity limit");
    await writeMcpActionGrant(home, createMcpActionGrant(caller.actor_id, project.project_id, fileAction, true));
    const foreignWrite = await reader.callTool({ name: hostActionToolName(filesActions.open), arguments: { workspace_id: "unknown", path: ["note.txt"] } });
    assert.equal(foreignWrite.isError, true, "an explicit action grant cannot impersonate the local Artifact owner");
    const counted = await reader.callTool({ name: countName, arguments: { text: "中🙂\r\nx\n" } });
    assert.equal(counted.isError, false, JSON.stringify(counted));
    assert.deepEqual(counted.structuredContent, { characters: 6, utf8_bytes: 11, lines: 2 });
    const compared = await reader.callTool({ name: hostActionToolName(diffActions.compare), arguments: { before: "a\r\nb\n", after: "a\r\nc" } });
    assert.equal(compared.isError, false, JSON.stringify(compared));
    const ops = (compared.structuredContent as any).ops;
    assert.equal(ops.filter((op: any) => op.kind !== "insert").map((op: any) => op.line.text + op.line.ending).join(""), "a\r\nb\n");
    assert.equal(ops.filter((op: any) => op.kind !== "delete").map((op: any) => op.line.text + op.line.ending).join(""), "a\r\nc");
    const state = await reader.callTool({ name: hostActionToolName(textStatsActions.state), arguments: {} });
    assert.equal(state.isError, false, JSON.stringify(state));
    assert.equal((state.structuredContent as any).view.phase, "waiting");
    assert.equal((await stranger.callTool({ name: countName, arguments: { text: "no" } })).isError, true);
    assert.equal((await reader.callTool({ name: countName, arguments: { text: "no", actor_id: "owner" } })).isError, true);
    const countGrant = createMcpActionGrant(caller.actor_id, project.project_id, rows.find(row => row.capability_id === textStatsActions.count.capability_id)!, true);
    await writeMcpActionGrant(home, { ...countGrant, enabled: false });
    assert.equal((await reader.callTool({ name: countName, arguments: { text: "no" } })).isError, true);
    await writeMcpActionGrant(home, countGrant);
    catalog.removeProjectPlugin({ project_id: project.project_id, plugin_id: "coding", actor_id: "owner" });
    assert.equal((await reader.callTool({ name: countName, arguments: { text: "no" } })).isError, true);
    await assert.rejects(client.invoke(caller, textStatsActions.count, { text: "no" }), { code: "actions.plugin_disabled" });
    assert.equal((await readMcpToolPreference(home)).action_grants?.length, 5, "disabling retains exact references");
    catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "coding", actor_id: "owner" });
    await reader.close();
    await host.closeProject(reference);
    const reopened = await client.discover(caller);
    assert.equal(reopened.find(row => row.capability_id === textStatsActions.count.capability_id)!.provider.provider_id, countGrant.provider_id);
    const restarted = await connect("reader");
    assert.equal((await restarted.callTool({ name: countName, arguments: { text: "" } })).isError, false);
  } finally { await Promise.all(clients.map(client => client.close())); await host.close(); catalog.close(); await rm(home, { recursive: true, force: true }); }
});
