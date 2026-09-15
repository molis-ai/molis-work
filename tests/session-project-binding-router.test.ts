import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { type RuntimeWorkContext } from "@molis-ai/molis-work-app-local-host";

test("one exact workspace Project reconnects a fresh Runtime Session without writing a binding", async () => {
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
    assert.equal(resolution.status, "bound");
    assert.equal(resolution.project?.project_id, project.project_id);
    assert.equal(resolution.connection?.project_id, project.project_id);
    assert.deepEqual(resolution.suggested_projects, []);
    assert.equal(catalog.listRuntimeContextBindings().length, 0);
    assert.equal(catalog.listWorkspaceMemberships().some((membership) => membership.is_default), false);
  } finally {
    catalog.close();
    await rm(directory, { recursive: true, force: true });
  }
});
