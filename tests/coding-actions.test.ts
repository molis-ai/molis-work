import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { CODING_ACTIONS, codingRouteActions } from "@molis-ai/molis-work-plugin-coding";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";

test("Coding's business surface is redeemed by the project Runtime, owner-bound, and the same code answers its routes", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "coding-actions-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "编码动作", actor_id: "web-user" });
  catalog.close();
  const workspace = { workspace_id: "fixture", canonical_path: await realpath(home), realpath_verified: true as const, display_name: "fixture" };
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, workspaceFor: async () => workspace, workspacesFor: async () => [workspace] });
  const ref = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
  const owner: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: ["artifact:read", "artifact:write", "storage:private"] };
  const client = host.actionClient(ref);
  const find = (id: string) => codingRouteActions[id]!.definition;
  try {
    const directory = (await client.discover(owner)).filter(row => row.provider.plugin_id === "io.molis.work.coding");
    assert.deepEqual(directory.map(row => row.capability_id).sort(), CODING_ACTIONS.map(row => row.capability_id).sort());

    const created = await client.invoke(owner, find("coding.create-session"), { title: "修复登录" }) as { session: { session_id: string; title: string } };
    assert.equal(created.session.title, "修复登录");
    const state = await client.invoke(owner, find("coding.state"), {}) as { sessions: Array<{ session_id: string }> };
    assert.ok(state.sessions.some(row => row.session_id === created.session.session_id));
    const read = await client.invoke(owner, find("coding.read-session"), { session_id: created.session.session_id }) as { session: { session_id: string }; runs: unknown[] };
    assert.equal(read.session.session_id, created.session.session_id);
    assert.deepEqual(read.runs, []);
    const renamed = await client.invoke(owner, find("coding.update-session"), { session_id: created.session.session_id, title: "修复登录超时" }) as { session: { title: string } };
    assert.equal(renamed.session.title, "修复登录超时");
    await assert.rejects(client.invoke(owner, find("coding.read-session"), { session_id: "missing" }), (error: { code?: string }) => error.code === "coding.session_unknown");

    // Other identities see the directory rows unavailable; starting rounds never reaches an Agent or MCP client at all.
    const external = (await client.discover({ ...owner, actor_id: "runtime:client", audience: "mcp" })).filter(row => row.provider.plugin_id === "io.molis.work.coding");
    assert.ok(external.length > 0 && external.every(row => !row.availability.available));
    assert.ok(!external.some(row => ["coding.runs.start", "coding.runs.control", "coding.sessions.update"].includes(row.capability_id)));
    await assert.rejects(client.invoke({ ...owner, actor_id: "runtime:client", audience: "mcp" }, find("coding.state"), {}),
      (error: { code?: string }) => ["actions.owner_mismatch", "actions.forbidden"].includes(error.code ?? ""));
  } finally {
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});
