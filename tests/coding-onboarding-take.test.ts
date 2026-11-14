import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { codingManifest } from "@molis-ai/molis-work-plugin-coding";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";

/**
 * BCD-18 (batch12-design §7.4): Coding's declared take action. Only the person calls it; it takes the folder only when it is the
 * project's output; a retry of the same take opens the same session and does not make a second one.
 */
test("BCD-18 Coding's onboarding take is the person's alone, takes only the project's output, and a retry finds the same session", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "coding-onboarding-take-"));
  const code = await mkdtemp(join(tmpdir(), "coding-onboarding-code-")), folder = join(code, "my-app"); await mkdir(folder);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "上手接手", actor_id: "web-user" });
  catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "coding", actor_id: "web-user" });
  await catalog.commit(() => catalog.changeDirectories({ project_id: project.project_id, actor_id: "web-user",
    change: { kind: "set_output", target: { workspace_path: folder } }, expected_revision: catalog.projectDirectories(project.project_id).revision }));
  const output = catalog.projectDirectories(project.project_id).directories.find(row => row.roles.includes("output"))!;
  catalog.close();
  assert.equal(output.canonical_path, await realpath(folder));
  const workspace = { workspace_id: output.workspace_id, canonical_path: output.canonical_path, realpath_verified: true as const, display_name: "my-app" };
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, workspaceFor: async () => workspace, workspacesFor: async () => [workspace] });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); await rm(code, { recursive: true, force: true }); });
  host.configurePersonalPlanning(home, withMolisWorkProjectCatalog);
  const client = host.actionClient(molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id }));
  const owner: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: ["artifact:read", "artifact:write", "storage:private"] };
  const take = codingManifest.actions!.find(row => row.capability_id === "coding.onboarding.take")!;
  assert.deepEqual(take.action.audiences, ["user"]);
  const input = { request_id: "onboarding:j1:take", code_root: { workspace_id: output.workspace_id }, materials: [] };

  // Not the person: an Agent or an MCP client cannot hand Coding a folder.
  for (const audience of ["agent", "mcp"] as const)
    await assert.rejects(client.invoke({ ...owner, actor_id: "runtime:client", audience }, take, input), audience);
  // A folder that is not the project's output is refused, and no session is made.
  await assert.rejects(client.invoke(owner, take, { ...input, request_id: "onboarding:j0:take", code_root: { workspace_id: "elsewhere" } }),
    (error: { code?: string }) => error.code === "coding.onboarding_root_mismatch");
  const state = async () => ((await client.invoke(owner, codingManifest.actions!.find(row => row.capability_id === "coding.state")!, {})) as { sessions: Array<{ session_id: string; title: string }> }).sessions;
  assert.equal((await state()).length, 0);

  const first = await client.invoke(owner, take, input) as { open: { item_id: string; title: string } };
  assert.ok(first.open.item_id && first.open.title);
  const again = await client.invoke(owner, take, input) as { open: { item_id: string } };
  assert.equal(again.open.item_id, first.open.item_id, "the same take opens the same session");
  assert.deepEqual((await state()).map(row => row.session_id), [first.open.item_id]);
});
