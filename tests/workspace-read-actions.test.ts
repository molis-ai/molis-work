import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { readWorkspaceFileCapability, workspaceReadActions } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { authorizeMcpActions } from "../apps/local-host/src/mcp-action-client.js";
import { createMcpActionGrant } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";

test("project folders are readable through directory actions by the person and by exactly granted clients, while plugins keep their own capability", { timeout: 60_000 }, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "workspace-read-actions-")));
  const home = join(root, "home"), folder = join(root, "repository");
  await mkdir(join(folder, "docs"), { recursive: true }); await mkdir(home, { recursive: true });
  await writeFile(join(folder, "docs", "plan.md"), "# 发布计划\n先修导出。\n");
  await writeFile(join(root, "outside.txt"), "不属于工作目录");
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: folder });
  const workspace = { workspace_id: "workspace-read", canonical_path: folder, realpath_verified: true, display_name: "repository" };
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, workspacesFor: async () => [workspace] });
  const reference = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "project-read" });
  const user: ActionCallContext = { actor_id: "web-user", project_id: "project-read", audience: "user", permissions: ["workspace:read"] };
  const client = host.actionClient(reference);
  try {
    await host.withProject(reference, runtime => runtime.coordinator.initializeBoard({ project_id: "project-read", title: "读取", actor_id: "web-user", idempotency_key: "init" }));
    const directory = await client.discover(user);
    const file = directory.find(row => row.capability_id === workspaceReadActions.file.capability_id)!;
    const git = directory.find(row => row.capability_id === workspaceReadActions.git.capability_id)!;
    assert.ok(file && git, "both reads are in the project directory");
    assert.ok(file.action.audiences.includes("mcp") && file.action.audiences.includes("agent"));
    assert.ok(!directory.some(row => row.capability_id === readWorkspaceFileCapability.capability_id), "the plugin-facing capability stays out of the directory");

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
    const mcpCaller: ActionCallContext = { actor_id: "client-reader", project_id: "project-read", audience: "mcp", permissions: [] };
    const denied = await authorizeMcpActions(host, mcpCaller, home, reference);
    await assert.rejects(denied.service.invoke(denied.context, { capability_id: file.capability_id, version: file.version, provider_id: file.provider.provider_id },
      { workspace_id: workspace.workspace_id, path: ["docs", "plan.md"], kind: "text" }));
    await writeMcpActionGrant(home, createMcpActionGrant(mcpCaller.actor_id, "project-read", file, true));
    const granted = await authorizeMcpActions(host, mcpCaller, home, reference);
    const read = await granted.service.invoke(granted.context, { capability_id: file.capability_id, version: file.version, provider_id: file.provider.provider_id },
      { workspace_id: workspace.workspace_id, path: ["docs", "plan.md"], kind: "text" }) as { text: string };
    assert.match(read.text, /发布计划/);
    await assert.rejects(granted.service.invoke(granted.context, { capability_id: git.capability_id, version: git.version, provider_id: git.provider.provider_id },
      { workspace_id: workspace.workspace_id, kind: "summary" }), "a grant for file reads does not open Git");

    // Plugins keep calling the Host capability through their own client, unchanged.
    const viaPlugin = await host.client(reference).invoke(readWorkspaceFileCapability, { workspace_id: workspace.workspace_id, path: ["docs", "plan.md"], kind: "text" });
    assert.equal(viaPlugin.outcome, "text");
  } finally {
    await host.close();
    await rm(root, { recursive: true, force: true });
  }
});
