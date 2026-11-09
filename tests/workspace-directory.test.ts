import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";


// SSC-16: a path whose realpath cannot be verified is refused by `add`; SSC-03: one output, linked folders are inputs; SSC-24: the
// default output directory is a row before its folder exists.
test("workspace directory canonicalizes symlinks, keeps monorepo paths distinct, refuses missing folders, and creates no folder up front", async () => {
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
    assert.throws(() => catalog.addWorkspaceProject({
      canonical_path: missing,
      project_id: project.project_id,
      actor_id: "user",
      user_confirmed: true,
    }), (error: unknown) => (error as { code?: string }).code === "projects.directory_missing");

    assert.equal(root.workspace_id, sameViaAlias.workspace_id);
    assert.notEqual(root.workspace_id, monorepoChild.workspace_id);
    assert.equal(root.realpath_verified, true);
    const output = catalog.outputDirectory(project.project_id);
    const directories = catalog.projectDirectories(project.project_id).directories;
    assert.deepEqual(directories.map(item => item.workspace_id).sort(), [output.workspace_id, root.workspace_id, monorepoChild.workspace_id].sort());
    assert.deepEqual(directories.filter(item => item.roles.includes("output")).map(item => item.workspace_id), [output.workspace_id]);
    assert.deepEqual(directories.find(item => item.workspace_id === root.workspace_id)?.roles, ["input"]);
    assert.equal(directories.some(item => item.canonical_path === missing), false);
    assert.equal(existsSync(output.canonical_path), false, "the default output directory is created on first use, not with the project");
  } finally {
    catalog.close();
    await rm(directory, { recursive: true, force: true });
  }
});
