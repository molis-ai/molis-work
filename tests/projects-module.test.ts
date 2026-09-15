import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createProjectsSchema,
  migrateProjectDataClassSchema,
  ProjectsModule,
} from "@molis-ai/molis-work-module-projects";
import Database from "better-sqlite3";

class ProjectsTestError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

function createModule(db: Database.Database): ProjectsModule {
  let sequence = 0;
  return new ProjectsModule({
    db,
    errorFactory: (code, message) => new ProjectsTestError(code, message),
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
      source: "created",
      data_class: "user",
      migrated_from_path: null,
    });
    const second = projects.lifecycle.prepareRecord({
      display_name: "同名项目",
      projects_directory: directory,
      source: "migrated",
      data_class: "migrated_user",
      board_id: "legacy-board",
      migrated_from_path: join(directory, "legacy.db"),
    });
    projects.lifecycle.register(first, "project.created", "user-1");
    projects.lifecycle.register(second, "project.migrated", "user-1");

    assert.equal(first.board_id, first.project_id, "a newly created project uses project_id as its V1 board identity");
    assert.equal(second.board_id, "legacy-board", "a migrated project preserves its old board identity");
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
      (error: unknown) => error instanceof ProjectsTestError && error.code === "context.user_confirmation_required",
    );
    assert.throws(
      () => projects.lifecycle.prepareRecord({
        display_name: " ",
        projects_directory: directory,
        source: "created",
        data_class: "user",
        migrated_from_path: null,
      }),
      (error: unknown) => error instanceof ProjectsTestError && error.code === "catalog.invalid_name",
    );
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("project identity schema migration is rollback-safe and idempotent", () => {
  const db = new Database(":memory:");
  try {
    db.exec(`
      CREATE TABLE projects (
        project_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        board_id TEXT NOT NULL,
        database_path TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL,
        migrated_from_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO projects VALUES
        ('created-project', 'Created', 'created-project', '/tmp/created.db', 'created', NULL, 'now', 'now'),
        ('migrated-project', 'Migrated', 'legacy-board', '/tmp/migrated.db', 'migrated', '/tmp/legacy.db', 'now', 'now');
    `);

    assert.throws(() => db.transaction(() => {
      migrateProjectDataClassSchema(db);
      throw new Error("rollback fixture");
    })(), /rollback fixture/);
    assert.equal(
      (db.pragma("table_info(projects)") as Array<{ name: string }>).some((column) => column.name === "data_class"),
      false,
    );

    migrateProjectDataClassSchema(db);
    migrateProjectDataClassSchema(db);
    assert.deepEqual(
      db.prepare("SELECT project_id, board_id, data_class FROM projects ORDER BY project_id").all(),
      [
        { project_id: "created-project", board_id: "created-project", data_class: "user" },
        { project_id: "migrated-project", board_id: "legacy-board", data_class: "migrated_user" },
      ],
    );
  } finally {
    db.close();
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
