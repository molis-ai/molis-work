import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { workspaceReadActions } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { readMcpActionAccess } from "@molis-ai/molis-work-test-kit/local-host-http";
import { openTestHome } from "./fixtures/test-home.js";

test("project folders are readable through one action id by the person and by exactly granted clients", { timeout: 60_000 }, async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "workspace-read-actions-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const folder = join(root, "repository");
  await mkdir(join(folder, "docs"), { recursive: true });
  await writeFile(join(folder, "docs", "plan.md"), "# 发布计划\n先修导出。\n");
  await writeFile(join(root, "outside.txt"), "不属于工作目录");
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: folder });
  const workspace = { workspace_id: "workspace-read", canonical_path: folder, realpath_verified: true, display_name: "repository" };
  // The folder reads are the Host's own, so no installed plugin makes them unavailable; this policy switches them off to try a grant the Host refuses.
  let reading = true;
  const home = await openTestHome(t, { host: { workspacesFor: async () => [workspace], actionAvailability: (_caller, action) => reading || action.capability_id !== workspaceReadActions.file.capability_id
    ? { available: true } : { available: false, code: "fixture.reads_offline", reason: "文件读取暂不可用" } } });
  const { host } = home;
  const project = await home.createProject("读取");
  const reference = project.reference;
  const user: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: ["workspace:read"] };
  const client = host.actionClient(reference);
  const directory = await client.discover(user);
  const file = directory.find(row => row.capability_id === workspaceReadActions.file.capability_id)!;
  const git = directory.find(row => row.capability_id === workspaceReadActions.git.capability_id)!;
  assert.ok(file && git, "both reads are in the project directory");
  assert.ok(file.action.audiences.includes("mcp") && file.action.audiences.includes("agent"));
  // One id per read: the directory holds each exactly once, and the retired plugin-facing ids are registered nowhere.
  assert.equal(directory.filter(row => row.capability_id === file.capability_id).length, 1);
  assert.equal(directory.filter(row => row.capability_id === git.capability_id).length, 1);
  const registered = host.status().capabilities.map(row => row.capability_id);
  for (const retired of ["projects.workspace.file.read.v1", "projects.workspace.git.read.v1"]) assert.ok(!registered.includes(retired), `${retired} is retired`);

  const listed = await client.invoke(user, file, { workspace_id: workspace.workspace_id, path: ["docs"], kind: "directory" }) as { outcome: string; entries: Array<{ name: string }> };
  assert.equal(listed.outcome, "directory"); assert.deepEqual(listed.entries.map(entry => entry.name), ["plan.md"]);
  const text = await client.invoke(user, file, { workspace_id: workspace.workspace_id, path: ["docs", "plan.md"], kind: "text" }) as { outcome: string; text: string };
  assert.equal(text.outcome, "text"); assert.match(text.text, /先修导出/);
  await assert.rejects(client.invoke(user, file, { workspace_id: workspace.workspace_id, path: ["..", "outside.txt"], kind: "text" }), /无效/, "a path outside the folder is refused, never read");
  const other = await client.invoke(user, file, { workspace_id: "another-folder", path: ["docs", "plan.md"], kind: "text" }) as { outcome: string };
  assert.notEqual(other.outcome, "text", "a folder of another project is never read");
  const summary = await client.invoke(user, git, { workspace_id: workspace.workspace_id, kind: "summary" }) as { outcome: string; branch: string | null };
  assert.equal(summary.outcome, "summary"); assert.equal(summary.branch, "main");
  await assert.rejects(client.invoke({ ...user, permissions: [] }, file, { workspace_id: workspace.workspace_id, path: ["docs", "plan.md"], kind: "text" }));

  // An external client reads nothing until it is granted exactly this read.
  const reader = await home.mcp("client-reader", project.project_id);
  const fileRef = { capability_id: file.capability_id, version: file.version, provider_id: file.provider.provider_id };
  const gitRef = { capability_id: git.capability_id, version: git.version, provider_id: git.provider.provider_id };
  const plan = { workspace_id: workspace.workspace_id, path: ["docs", "plan.md"], kind: "text" };
  await assert.rejects(reader.client.invoke(reader.caller, fileRef, plan), { code: "mcp.action_revoked" });
  // The grant goes through the access settings, which check what the client could really use: a read the Host reports unavailable is refused, and nothing is saved.
  reading = false;
  await assert.rejects(home.grant("client-reader", project.project_id, [file]), { status: 400, code: "fixture.reads_offline" });
  assert.deepEqual((await readMcpActionAccess(home.web, { clientId: "client-reader", projectId: project.project_id })).grants, [], "a refused grant leaves no record");
  await assert.rejects(reader.client.invoke(reader.caller, fileRef, plan), { code: "mcp.action_revoked" });
  reading = true;
  await home.grant("client-reader", project.project_id, [file]);
  const read = await reader.client.invoke(reader.caller, fileRef, plan) as { text: string };
  assert.match(read.text, /发布计划/);
  await assert.rejects(reader.client.invoke(reader.caller, gitRef, { workspace_id: workspace.workspace_id, kind: "summary" }), { code: "mcp.action_revoked" }, "a grant for file reads does not open Git");

  // The Host's own project client has no second door to the same read: an id with no registered action is missing.
  await assert.rejects(host.client(reference).invoke({ capability_id: "projects.workspace.file.read.v1", version: 1, operation: "query" } as ActionDefinition,
    { workspace_id: workspace.workspace_id, path: ["docs", "plan.md"], kind: "text" }), { code: "actions.missing" });
});
