import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ActionError, bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ARTIFACT_ACTIONS, ARTIFACT_ACTION_PERMISSIONS, artifactsActions as a, type ArtifactImportResult } from "@molis-ai/molis-work-plugin-artifacts";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createFileSecretStore, resetSecretStoreCache, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { projectActionAvailability } from "../apps/local-host/src/project-action-availability.js";
import { createMcpActionGrant, hostActionToolName } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";

test("Artifacts share real records through Host and production MCP, preserving fixed versions, authority and restart", { timeout: 120_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "artifacts-actions-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "Artifact actions", actor_id: "owner" });
  catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "artifacts", actor_id: "owner" });
  const policy = projectActionAvailability(async (_options, run) => run(catalog), home);
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: policy,
    workspaceFor: async () => ({ workspace_id: "fixture", canonical_path: await realpath(home), realpath_verified: true }) });
  const ref = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
  const caller: ActionCallContext = { actor_id: "owner", project_id: project.project_id, audience: "user", permissions: ARTIFACT_ACTION_PERMISSIONS };
  const client = host.actionClient(ref), bound = bindActionClient(client, () => caller);
  const clients: Client[] = [];
  const connect = async (identity: string) => {
    const sdk = new Client({ name: "untrusted-name", version: "1" }); clients.push(sdk);
    await sdk.connect(new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx",
      fileURLToPath(new URL("./fixtures/production-action-mcp-server.ts", import.meta.url)), home, project.project_id, identity, project.database_path, project.board_id], stderr: "pipe" }));
    return sdk;
  };
  try {
    const directory = (await client.discover(caller)).filter(row => row.provider.plugin_id === "io.molis.work.artifacts");
    assert.deepEqual(directory.map(row => row.capability_id).sort(), ARTIFACT_ACTIONS.map(row => row.capability_id).sort());
    const input = { source: "file" as const, filename: "结果.md", content: "# 固定原文\n跨入口保存" };
    const first = await bound.invoke(a.importFile, input);
    const record = (await bound.invoke(a.read, { reference: { artifact_id: first.artifact_id, version: first.version } })).selected!;
    assert.equal(record.created_by, "owner"); assert.equal(record.scope, "personal");
    assert.deepEqual(JSON.parse((await bound.invoke(a.export, { reference: { artifact_id: first.artifact_id, version: first.version } })).content), record);
    assert.equal((await bound.invoke(a.importFile, input)).reused, true);
    assert.equal((await bound.invoke(a.browser, {})).versions.length, 1);
    await assert.rejects(client.invoke({ ...caller, permissions: ["artifacts:read"] }, a.importFile, input), { code: "actions.forbidden" });
    await assert.rejects(client.invoke({ ...caller, project_id: "other" }, a.read, { reference: first }), { code: "actions.scope_mismatch" });
    await assert.rejects(client.invoke({ ...caller, permissions: ["artifacts:read", "artifacts:write"] }, a.importExternal,
      { source: "notion", url: "https://www.notion.so/11223344556677889900112233445566" }), { code: "actions.forbidden" });
    for (const authority of [{ actor_id: "intruder" }, { producer: { plugin_id: "other" } }, { scope: "team_project" }]) {
      await assert.rejects(bound.invoke(a.importFile, { ...input, ...authority } as never), { code: "actions.input_invalid" });
    }
    await writeFile(join(home, "result.txt"), "原始文件字节\n");
    assert.equal(Buffer.from((await bound.invoke(a.projectReference, { reference: "project://result.txt" })).content_base64, "base64").toString(), "原始文件字节\n");
    await assert.rejects(bound.invoke(a.projectReference, { reference: "project://../outside.txt" }), /路径|目录|引用/);
    await assert.rejects(bound.invoke(a.projectReference, { reference: "project://result.txt", projectRoot: "/" } as never), { code: "actions.input_invalid" });
    await host.closeProject(ref);
    assert.deepEqual((await bound.invoke(a.read, { reference: { artifact_id: first.artifact_id, version: 1 } })).selected, record);

    for (const definition of [a.importFile, a.read, a.browser, a.export]) {
      await writeMcpActionGrant(home, createMcpActionGrant("runtime:writer", project.project_id,
        directory.find(row => row.capability_id === definition.capability_id)!, true));
    }
    const sdk = await connect("writer");
    assert.ok((await sdk.listTools()).tools.some(tool => tool.name === hostActionToolName(a.importFile)));
    const result = await sdk.callTool({ name: hostActionToolName(a.importFile), arguments: { ...input, content: "MCP 原文" },
      _meta: { actor_id: "forged", project_id: "other" } });
    assert.equal(result.isError, false, JSON.stringify(result));
    const saved = result.structuredContent as unknown as ArtifactImportResult;
    const exact = { artifact_id: saved.artifact_id, version: saved.version };
    const mcpRecord = (await bound.invoke(a.read, { reference: exact })).selected!;
    assert.equal(mcpRecord.created_by, "runtime:writer");
    assert.equal((mcpRecord.payload as { content: string }).content, "MCP 原文");
    const read = await sdk.callTool({ name: hostActionToolName(a.read), arguments: { reference: exact } });
    assert.deepEqual((read.structuredContent as any).selected, mcpRecord);
    const stranger = await connect("stranger");
    assert.equal((await stranger.callTool({ name: hostActionToolName(a.read), arguments: { reference: exact } })).isError, true);
    const grant = createMcpActionGrant("runtime:writer", project.project_id, directory.find(row => row.capability_id === a.importFile.capability_id)!, false);
    await writeMcpActionGrant(home, grant);
    assert.equal((await sdk.callTool({ name: hostActionToolName(a.importFile), arguments: { ...input, content: "撤权后不能保存" } })).isError, true);
    assert.equal((await bound.invoke(a.browser, {})).versions.length, 2);
    catalog.removeProjectPlugin({ project_id: project.project_id, plugin_id: "artifacts", actor_id: "owner" });
    assert.equal((await client.discover(caller)).find(row => row.capability_id === a.read.capability_id)!.availability.available, false);
    await assert.rejects(bound.invoke(a.read, { reference: exact }), { code: "actions.plugin_disabled" });
    catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "artifacts", actor_id: "owner" });
    assert.deepEqual((await bound.invoke(a.read, { reference: exact })).selected, mcpRecord);
  } finally {
    await Promise.all(clients.map(value => value.close())); await host.close(); catalog.close(); await rm(home, { recursive: true, force: true });
  }
});

test("external Artifact import checks live authority and plugin state after fetching and before saving", { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "artifacts-await-"));
  const keys = ["MOLIS_WORK_SECRET_BACKEND", "MOLIS_WORK_ENCRYPTION_KEY"] as const;
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  process.env.MOLIS_WORK_ENCRYPTION_KEY = Buffer.alloc(32, 19).toString("base64");
  resetSecretStoreCache();
  runWithMolisWorkHome(home, () => createFileSecretStore().put("connector:google-drive:token", "fixture-only-token"));
  let enabled = true;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null,
    actionAvailability: () => enabled ? { available: true } : { available: false, code: "actions.plugin_disabled", reason: "已停用" } });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), boardId: "board", projectId: "project" });
  const caller: ActionCallContext = { actor_id: "owner", project_id: "project", audience: "user", permissions: ARTIFACT_ACTION_PERMISSIONS };
  const client = host.actionClient(ref), originalFetch = globalThis.fetch;
  try {
    await host.withProject(ref, runtime => runtime.coordinator.initializeBoard({ board_id: "board", title: "Imports", actor_id: "owner", idempotency_key: "init" }));
    for (const mode of ["revoked", "disabled", "cancelled", "success"] as const) {
      let enter!: () => void, release!: () => void, allowed = true;
      const entered = new Promise<void>(resolve => { enter = resolve; });
      const released = new Promise<void>(resolve => { release = resolve; });
      globalThis.fetch = async (url, init) => {
        assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer fixture-only-token");
        if (!String(url).includes("/export?")) return Response.json({ id: "fixtureDocument12345", name: "外部原文", mimeType: "application/vnd.google-apps.document" });
        enter(); await released;
        return new Response("真实等待后的文档内容");
      };
      const controller = new AbortController();
      const pending = client.invoke({ ...caller, signal: controller.signal, validate_authority: async () => {
        if (!allowed) throw new ActionError("mcp.action_revoked", "撤权");
      } }, a.importExternal, { source: "google-docs", url: "https://docs.google.com/document/d/fixtureDocument12345/edit" });
      const rejection = mode === "success" ? null : assert.rejects(pending, mode === "revoked" ? { code: "mcp.action_revoked" }
        : mode === "disabled" ? { code: "actions.plugin_disabled" } : { name: "AbortError" });
      await entered;
      if (mode === "revoked") allowed = false;
      if (mode === "disabled") enabled = false;
      if (mode === "cancelled") controller.abort();
      release();
      if (rejection) await rejection; else await pending;
      enabled = true;
      const rows = await client.invoke(caller, a.browser, {});
      assert.equal(rows.versions.length, mode === "success" ? 1 : 0);
    }
  } finally {
    globalThis.fetch = originalFetch; await host.close(); resetSecretStoreCache();
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
    await rm(home, { recursive: true, force: true });
  }
});
