import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";


test("workspace directory canonicalizes symlinks, keeps monorepo paths distinct, and never creates defaults", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-workspace-directory-"));
  const home = path.join(directory, ".molis-work");
  const repository = path.join(directory, "repository");
  const packageDirectory = path.join(repository, "packages", "app");
  const alias = path.join(directory, "repository-alias");
  const missing = path.join(directory, "moved-repository");
  await mkdir(packageDirectory, { recursive: true });
  await symlink(repository, alias);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    const project = await catalog.createProject({ display_name: "工作目录项目", actor_id: "user" });
    assert.throws(() => catalog.addWorkspaceProject({
      canonical_path: repository,
      project_id: project.project_id,
      actor_id: "user",
      user_confirmed: false,
    }), /明确确认/);

    const root = catalog.addWorkspaceProject({
      canonical_path: repository,
      project_id: project.project_id,
      actor_id: "user",
      user_confirmed: true,
    });
    const sameViaAlias = catalog.addWorkspaceProject({
      canonical_path: alias,
      project_id: project.project_id,
      actor_id: "user",
      user_confirmed: true,
    });
    const monorepoChild = catalog.addWorkspaceProject({
      canonical_path: packageDirectory,
      project_id: project.project_id,
      actor_id: "user",
      user_confirmed: true,
    });
    const missingRecord = catalog.addWorkspaceProject({
      canonical_path: missing,
      project_id: project.project_id,
      actor_id: "user",
      user_confirmed: true,
    });

    assert.equal(root.workspace_id, sameViaAlias.workspace_id);
    assert.notEqual(root.workspace_id, monorepoChild.workspace_id);
    assert.equal(missingRecord.realpath_verified, false);
    assert.equal(catalog.listWorkspaceDirectory(project.project_id).length, 3);
    assert.equal(catalog.listWorkspaceMemberships().some((membership) => membership.is_default), false);
  } finally {
    catalog.close();
    await rm(directory, { recursive: true, force: true });
  }
});
