import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LocalMcpServer, type RuntimeWorkContext } from "@molis-ai/molis-work-app-local-host";

test("W1-18-SESSION-CONFIRM-01 a fresh Session only gets the exact workspace Project as a suggestion", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-workspace-suggestion-"));
  const home = path.join(directory, ".molis-work");
  const workspacePath = path.join(directory, "repository");
  await mkdir(workspacePath, { recursive: true });
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    const project = await catalog.createProject({ display_name: "候选项目", actor_id: "user" });
    catalog.addWorkspaceProject({
      canonical_path: workspacePath,
      project_id: project.project_id,
      actor_id: "user",
      user_confirmed: true,
    });
    const context: RuntimeWorkContext = {
      runtime_id: "codex",
      stable_work_context_id: "fresh-runtime-session",
      host_declares_stable: true,
      workspace: { canonical_path: workspacePath, realpath_verified: true },
    };

    const resolution = catalog.resolveRuntimeContext(context);
    assert.equal(resolution.status, "suggested");
    assert.equal(resolution.project, null);
    assert.equal(resolution.connection, null);
    assert.deepEqual(resolution.suggested_projects.map(item => item.project_id), [project.project_id]);
    assert.equal(catalog.listRuntimeContextBindings().length, 0);
    assert.equal(catalog.listWorkspaceMemberships().some((membership) => membership.is_default), false);
  } finally {
    catalog.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("W1-18-SESSION-CONFIRM-01 formal MCP requires confirmation, restores that Session, and cannot resurrect an unbound connection", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-mcp-session-confirm-")), home = path.join(directory, "home"), workspace = path.join(directory, "workspace");
  await mkdir(workspace);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const host = { homeDirectory: home, runtimeContext: { runtime_id: "codex", stable_work_context_id: "confirmed-session", host_declares_stable: true,
    workspace: { canonical_path: workspace, realpath_verified: true } } };
  let server = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", null, host);
  const call = async (name: string, input: Record<string, unknown> = {}) => {
    const reply = await server.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: input } }) as {
      result: { isError: boolean; content: Array<{ text: string }> };
    };
    return reply.result;
  };
  const resolve = async () => { const reply = await call("molis_work_v1_context_resolve"); assert.equal(reply.isError, false, reply.content[0]?.text); return JSON.parse(reply.content[0]!.text); };
  try {
    const project = await catalog.createProject({ display_name: "Exact workspace", actor_id: "user" });
    catalog.addWorkspaceProject({ canonical_path: workspace, project_id: project.project_id, actor_id: "user", user_confirmed: true });
    const fresh = await resolve();
    assert.equal(fresh.status, "suggested"); assert.equal(fresh.connection, null);
    assert.deepEqual(fresh.suggested_projects.map((item: { project_id: string }) => item.project_id), [project.project_id]);
    assert.deepEqual(catalog.listRuntimeContextBindings(), []);
    assert.equal((await call("molis_work_v1_context_bind", { project_id: project.project_id, user_confirmed: false })).isError, true);
    assert.deepEqual(catalog.listRuntimeContextBindings(), []);
    const bound = await call("molis_work_v1_context_bind", { project_id: project.project_id, user_confirmed: true });
    assert.equal(bound.isError, false, bound.content[0]?.text);
    assert.equal(JSON.parse(bound.content[0]!.text).connection.project_id, project.project_id);
    await server.close(); server = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", null, host);
    const restored = await resolve(); assert.equal(restored.status, "bound"); assert.equal(restored.connection.project_id, project.project_id);
    const unbound = await call("molis_work_v1_context_unbind", { user_confirmed: true }); assert.equal(unbound.isError, false, unbound.content[0]?.text);
    const after = await resolve(); assert.equal(after.status, "suggested"); assert.equal(after.connection, null);
    await server.close();
    server = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", null, { ...host, runtimeContext: { ...host.runtimeContext, stable_work_context_id: "new-session" } });
    const other = await resolve(); assert.equal(other.status, "suggested"); assert.equal(other.connection, null);
  } finally { await server.close(); catalog.close(); await rm(directory, { recursive: true, force: true }); }
});
