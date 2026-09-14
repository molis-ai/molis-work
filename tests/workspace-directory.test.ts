import { openGoalBoardProjectCatalog } from "@adeptify/goalboard-app-desktop";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { GoalBoardSessionRegistry } from "@adeptify/goalboard-module-private-work-context";
import { PROJECT_OPERATIONS_STYLES } from "@adeptify/goalboard-plugin-work";
import {
  GoalBoardWorkspaceActionError,
  repairProjectWorkspace,
  unlinkProjectWorkspace,
} from "@adeptify/goalboard-plugin-work";

test("Session and workspace row states render one status frame", () => {
  assert.doesNotMatch(PROJECT_OPERATIONS_STYLES, /\.project-record-row \.directory-row-state/);
  assert.doesNotMatch(PROJECT_OPERATIONS_STYLES, /\.project-record-state\s*\{/);
  assert.match(PROJECT_OPERATIONS_STYLES, /\.project-record-directory \.tree-entry\.is-selected \{ color: var\(--ink\); background: var\(--paper\); box-shadow: 0 1px 2px/);
});

test("workspace repair and unlink restore Catalog membership when Session Registry update fails", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "goalboard-workspace-compensation-"));
  const home = path.join(directory, ".goalboard");
  const previous = path.join(directory, "previous");
  const next = path.join(directory, "next");
  await mkdir(previous, { recursive: true });
  await mkdir(next, { recursive: true });
  const catalog = await openGoalBoardProjectCatalog({ homeDirectory: home });
  try {
    const project = await catalog.createProject({ display_name: "补偿事务项目", actor_id: "user" });
    const workspace = catalog.addWorkspaceProject({
      canonical_path: previous,
      project_id: project.project_id,
      actor_id: "user",
      user_confirmed: true,
    });
    const failingRegistry = {
      reassignWorkspaceSessions(): never {
        throw new Error("SESSION-REGISTRY-FAILURE");
      },
    };
    const current = { id: workspace.workspace_id, path: workspace.canonical_path, projectLinked: true };

    assert.throws(() => repairProjectWorkspace({
      catalog,
      registry: failingRegistry,
      current,
      canonicalPath: next,
      projectId: project.project_id,
      actorId: "user",
    }), (error) => error instanceof GoalBoardWorkspaceActionError
      && error.code === "workspace.change_rolled_back"
      && /已自动恢复/.test(error.message));
    assert.deepEqual(
      catalog.listWorkspaceDirectory(project.project_id).map((record) => record.canonical_path),
      [workspace.canonical_path],
    );

    assert.throws(() => unlinkProjectWorkspace({
      catalog,
      registry: failingRegistry,
      current,
      projectId: project.project_id,
      actorId: "user",
    }), (error) => error instanceof GoalBoardWorkspaceActionError
      && error.code === "workspace.change_rolled_back"
      && /已自动恢复/.test(error.message));
    assert.deepEqual(
      catalog.listWorkspaceDirectory(project.project_id).map((record) => record.canonical_path),
      [workspace.canonical_path],
    );
  } finally {
    catalog.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("workspace directory canonicalizes symlinks, keeps monorepo paths distinct, and never creates defaults", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "goalboard-workspace-directory-"));
  const home = path.join(directory, ".goalboard");
  const repository = path.join(directory, "repository");
  const packageDirectory = path.join(repository, "packages", "app");
  const alias = path.join(directory, "repository-alias");
  const missing = path.join(directory, "moved-repository");
  await mkdir(packageDirectory, { recursive: true });
  await symlink(repository, alias);
  const catalog = await openGoalBoardProjectCatalog({ homeDirectory: home });
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

test("workspace Session reassignment is project isolated and preserves Session identity", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "goalboard-workspace-sessions-"));
  const home = path.join(directory, ".goalboard");
  const previous = path.join(directory, "previous");
  const next = path.join(directory, "next");
  await mkdir(previous, { recursive: true });
  await mkdir(next, { recursive: true });
  const registry = await openWorkSessionRegistry({ homeDirectory: home });
  try {
    const first = registry.createSession({
      runtime_id: "claude-code",
      actor_id: "user",
      user_confirmed: true,
      project_id: "project-a",
      workspace_id: "workspace-previous",
      workspace_path: previous,
      title: "目标 Session",
    });
    const otherProject = registry.createSession({
      runtime_id: "claude-code",
      actor_id: "user",
      user_confirmed: true,
      project_id: "project-b",
      workspace_id: "workspace-previous",
      workspace_path: previous,
      title: "其他项目 Session",
    });
    assert.throws(() => registry.reassignWorkspaceSessions({
      project_id: "project-a",
      actor_id: "user",
      user_confirmed: false,
      previous_workspace_path: previous,
      workspace_id: "workspace-next",
      workspace_path: next,
    }), /明确确认/);

    const changed = registry.reassignWorkspaceSessions({
      project_id: "project-a",
      actor_id: "user",
      user_confirmed: true,
      previous_workspace_id: "workspace-previous",
      previous_workspace_path: previous,
      workspace_id: "workspace-next",
      workspace_path: next,
    });
    assert.deepEqual(changed.map((session) => session.session_id), [first.session_id]);
    assert.equal(registry.get(first.session_id).workspace_path, next);
    assert.equal(registry.get(first.session_id).workspace_id, "workspace-next");
    assert.equal(registry.get(otherProject.session_id).workspace_path, previous);
    assert.equal(registry.get(otherProject.session_id).workspace_id, "workspace-previous");
  } finally {
    registry.close();
    await rm(directory, { recursive: true, force: true });
  }
});
import { openWorkSessionRegistry } from "@adeptify/goalboard-app-local-host";
