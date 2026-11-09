import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as projectsExports from "@molis-ai/molis-work-module-projects";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";

import {
  createProjectsSchema,
  ProjectsModule,
} from "@molis-ai/molis-work-module-projects";
import { openTestSqlite, type SqliteDatabase } from "@molis-ai/molis-work-test-kit/sqlite";

function createModule(db: SqliteDatabase, directory: string): ProjectsModule {
  let sequence = 0;
  return new ProjectsModule({
    db,
    projects_directory: directory,
    outputs_directory: join(directory, "outputs"),
    plugins: { has: id => id === "goals", companions: () => [] },
    now: () => `2026-09-02T00:00:${String(sequence).padStart(2, "0")}.000Z`,
    id: (prefix) => `${prefix}-${++sequence}`,
    plugins: { has: id => id === "pages", companions: () => [] },
  });
}

test("Projects Module owns canonical project identity and workspace membership", () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "molis-work-projects-module-")));
  const db = openTestSqlite(":memory:");
  try {
    db.pragma("foreign_keys = ON");
    createProjectsSchema(db);
    const projects = createModule(db, directory);
    // W5-08-MOD-01/02: records stay behind business services; the complete identity/membership path below remains public.
    assert.equal("ProjectsRepository" in projectsExports, false);
    assert.equal("repository" in projects, false);

    const first = projects.lifecycle.prepareRecord({
      display_name: "同名项目",
      data_class: "user",
    });
    const second = projects.lifecycle.prepareRecord({
      display_name: "同名项目",
      data_class: "user",
    });
    projects.lifecycle.register(first, "project.created", "user-1");
    projects.lifecycle.register(second, "project.created", "user-1");

    assert.equal(projects.query.listProjects().length, 2, "duplicate display names do not change identity");
    // PERSAF-05: a never-installed plugin and an explicit user removal are different facts.
    assert.equal(projects.query.wasProjectPluginRemoved(first.project_id, "pages"), false);
    projects.commands.addProjectPlugin({ project_id: first.project_id, plugin_id: "pages", actor_id: "user-1" });
    projects.commands.removeProjectPlugin({ project_id: first.project_id, plugin_id: "pages", actor_id: "user-1" });
    assert.equal(projects.query.wasProjectPluginRemoved(first.project_id, "pages"), true);
    assert.equal(projects.query.wasProjectPluginRemoved(second.project_id, "pages"), false);
    assert.deepEqual(projects.query.selections().map((project) => project.project_id), [first.project_id, second.project_id]);
    // I4-01: the Host's existing missing-project classification is preserved by the owner.
    assert.throws(() => projects.query.getProject("absent-project"), (error: unknown) => {
      assert.ok(error instanceof ActionError);
      assert.equal(error.code, "catalog.project_not_found");
      assert.equal(error.message, "找不到 Molis Work 项目: absent-project");
      assert.equal(error.kind, "not_found");
      assert.equal(actionHttpStatus(error), 404);
      return true;
    });

    const workspacePath = join(directory, "workspace");
    mkdirSync(workspacePath);
    const workspace = projects.commands.addWorkspaceProject({
      canonical_path: workspacePath,
      project_id: first.project_id,
      actor_id: "user-1",
      user_confirmed: true,
    });
    assert.deepEqual(workspace.project_ids, [first.project_id]);
    // A linked folder is an input; what names no folder goes to the project's output, its default output directory (SSC-17, SSC-20).
    assert.deepEqual(projects.query.projectDirectories(first.project_id).directories.map(item => [item.canonical_path, item.roles]),
      [[join(directory, "outputs", first.project_id), ["output"]], [workspacePath, ["input"]]]);
    assert.equal(projects.query.outputDirectory(first.project_id).canonical_path, join(directory, "outputs", first.project_id));
    assert.deepEqual(
      projects.query.workspaceProjectSelections(workspace.workspace_id),
      [{ project_id: first.project_id, display_name: first.display_name }],
    );

    assert.throws(
      () => projects.commands.addWorkspaceProject({
        canonical_path: workspacePath,
        project_id: second.project_id,
        actor_id: "user-1",
        user_confirmed: false,
      }),
      // R4A2-01: project membership owns this separate confirmation refusal.
      (error: unknown) => {
        // I4-01: a missing user confirmation stays a Catalog input refusal, before facts change.
        assert.ok(error instanceof ActionError);
        assert.equal(error.code, "catalog.context.user_confirmation_required");
        assert.equal(error.message, "只有用户明确确认后才能关联工作目录");
        assert.equal(error.kind, "invalid");
        assert.equal(actionHttpStatus(error), 400);
        assert.equal(Object.hasOwn(error, "details"), false);
        return true;
      },
    );
    assert.deepEqual(projects.query.workspaceProjectSelections(workspace.workspace_id),
      [{ project_id: first.project_id, display_name: first.display_name }]);
    assert.throws(
      () => projects.lifecycle.prepareRecord({
        display_name: " ",
        data_class: "user",
      }),
      (error: unknown) => {
        assert.ok(error instanceof ActionError);
        assert.equal(error.code, "catalog.invalid_name");
        assert.equal(error.message, "项目显示名称不能为空");
        assert.equal(actionHttpStatus(error), 400);
        return true;
      },
    );
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

/** A catalog with two projects, so that a directory can belong to one or to both. */
function withTwoProjects(run: (env: { db: SqliteDatabase; projects: ProjectsModule; first: string; second: string; link: (projectId: string, path: string) => string; output: (projectId: string) => string }) => void): void {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "molis-work-projects-module-")));
  const db = openTestSqlite(":memory:");
  try {
    db.pragma("foreign_keys = ON");
    createProjectsSchema(db);
    const projects = createModule(db, directory);
    const ids = ["甲", "乙"].map(name => {
      const record = projects.lifecycle.prepareRecord({ display_name: name, data_class: "user" });
      projects.lifecycle.register(record, "project.created", "user-1");
      return record.project_id;
    });
    const link = (projectId: string, path: string) => {
      mkdirSync(join(directory, path), { recursive: true });
      return projects.commands.addWorkspaceProject({
        canonical_path: join(directory, path), project_id: projectId, actor_id: "user-1", user_confirmed: true,
      }).workspace_id;
    };
    const output = (projectId: string) => projects.query.outputDirectory(projectId).workspace_id;
    run({ db, projects, first: ids[0]!, second: ids[1]!, link, output });
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
const rows = (db: SqliteDatabase, table: "workspaces" | "workspace_project_memberships"): number =>
  Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);

test("RAC-2453 deleting a project's memberships removes the directory records that no project belongs to any more", () => {
  withTwoProjects(({ db, projects, first, second, link, output }) => {
    link(first, "alone");
    // Each project also has its default output directory: one row and one membership of its own (SSC-20).
    assert.deepEqual([rows(db, "workspaces"), rows(db, "workspace_project_memberships")], [3, 3]);
    assert.equal(projects.lifecycle.removeWorkspaceMembershipsForProject(first), 2, "the count is still the memberships removed: the folder and the default output");
    assert.deepEqual([rows(db, "workspaces"), rows(db, "workspace_project_memberships")], [1, 1]);
    assert.deepEqual(db.prepare("SELECT workspace_id FROM workspaces").all(), [{ workspace_id: output(second) }]);
  });
});

test("RAC-2454 a directory two projects share stays, with the other project's membership, until the last one goes", () => {
  withTwoProjects(({ db, projects, first, second, link }) => {
    const shared = link(first, "shared");
    assert.equal(link(second, "shared"), shared);
    assert.equal(projects.lifecycle.removeWorkspaceMembershipsForProject(first), 2, "the shared folder and the first project's default output");
    assert.deepEqual([rows(db, "workspaces"), rows(db, "workspace_project_memberships")], [2, 2]);
    assert.deepEqual(projects.query.workspaceProjectSelections(shared).map(selection => selection.project_id), [second]);
    assert.equal(projects.lifecycle.removeWorkspaceMembershipsForProject(second), 2);
    assert.deepEqual([rows(db, "workspaces"), rows(db, "workspace_project_memberships")], [0, 0]);
  });
});

test("RAC-2455 of a project's two directories, the one only it belongs to goes and the shared one stays", () => {
  withTwoProjects(({ db, projects, first, second, link, output }) => {
    const alone = link(first, "alone"), shared = link(first, "shared");
    link(second, "shared");
    assert.equal(projects.lifecycle.removeWorkspaceMembershipsForProject(first), 3, "two folders and the default output");
    assert.deepEqual(db.prepare("SELECT workspace_id FROM workspaces ORDER BY workspace_id").all(),
      [shared, output(second)].sort().map(workspace_id => ({ workspace_id })));
    assert.notEqual(alone, shared);
  });
});

test("RAC-2456 a deletion that fails after the memberships go puts the directory records back, and records this deletion did not empty are not touched", () => {
  withTwoProjects(({ db, projects, first, second, link, output }) => {
    link(first, "alone");
    // A directory with no member at all was there before this deletion: it is not this deletion's to remove.
    db.prepare("INSERT INTO workspaces (workspace_id, canonical_path, realpath_verified, display_name, created_at, updated_at) VALUES ('stale', '/stale', 0, 'stale', 'x', 'x')").run();
    assert.throws(() => projects.lifecycle.transaction(() => {
      assert.equal(projects.lifecycle.removeWorkspaceMembershipsForProject(first), 2);
      assert.deepEqual(db.prepare("SELECT workspace_id FROM workspaces ORDER BY workspace_id").all(),
        ["stale", output(second)].sort().map(workspace_id => ({ workspace_id })));
      throw new Error("the deletion failed after the directory step");
    }), /deletion failed/u);
    assert.deepEqual([rows(db, "workspaces"), rows(db, "workspace_project_memberships")], [4, 3], "rolled back: the directory, the default output and their memberships are back");
    assert.equal(projects.lifecycle.removeWorkspaceMembershipsForProject(second), 1, "a project with no folder of its own removes only its default output");
    assert.equal(rows(db, "workspaces"), 3);
    assert.ok(db.prepare("SELECT 1 FROM workspaces WHERE workspace_id = 'stale'").get(), "the record this deletion did not empty stays");
  });
});

test("Host Catalog reaches Projects only through the public module entrypoint", () => {
  const source = readFileSync(new URL("../apps/local-host/src/project-catalog.ts", import.meta.url), "utf8");
  assert.match(source, /from "@molis-ai\/molis-work-module-projects"/u);
  assert.doesNotMatch(source, /@molis-ai\/molis-work-module-projects\//u, "deep imports are forbidden");
  assert.doesNotMatch(
    source,
    /\b(?:SELECT\b[^;`]*\bFROM|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+(?:projects|project_events|workspaces|workspace_project_memberships|project_deletions)\b/iu,
    "Project-owned tables must not be queried or mutated by the Host Catalog",
  );
});
