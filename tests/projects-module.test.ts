import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";

import {
  createProjectsSchema,
  ProjectsModule,
} from "@molis-ai/molis-work-module-projects";
import Database from "better-sqlite3";

function createModule(db: Database.Database): ProjectsModule {
  let sequence = 0;
  return new ProjectsModule({
    db,
    now: () => `2026-09-02T00:00:${String(sequence).padStart(2, "0")}.000Z`,
    id: (prefix) => `${prefix}-${++sequence}`,
  });
}

test("Projects Module owns canonical project identity and workspace membership", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-projects-module-"));
  const db = new Database(":memory:");
  try {
    db.pragma("foreign_keys = ON");
    createProjectsSchema(db);
    const projects = createModule(db);

    const first = projects.lifecycle.prepareRecord({
      display_name: "同名项目",
      projects_directory: directory,
      data_class: "user",
    });
    const second = projects.lifecycle.prepareRecord({
      display_name: "同名项目",
      projects_directory: directory,
      data_class: "user",
    });
    projects.lifecycle.register(first, "project.created", "user-1");
    projects.lifecycle.register(second, "project.created", "user-1");

    assert.equal(projects.query.listProjects().length, 2, "duplicate display names do not change identity");
    assert.deepEqual(projects.query.selections().map((project) => project.project_id), [first.project_id, second.project_id]);

    const workspacePath = join(directory, "workspace");
    const workspace = projects.commands.addWorkspaceProject({
      canonical_path: workspacePath,
      project_id: first.project_id,
      actor_id: "user-1",
      user_confirmed: true,
    });
    assert.deepEqual(workspace.project_ids, [first.project_id]);
    assert.equal(projects.query.preferredWorkspacePath(first.project_id), workspacePath);
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
        projects_directory: directory,
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
