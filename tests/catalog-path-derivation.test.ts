import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { CATALOG_SCHEMA_VERSION } from "@molis-ai/molis-work-app-local-host";
import {
  createProjectsSchema,
  listCatalogProjectsForUninstall,
  listProjectDatabasePaths,
  ProjectsModule,
  projectDatabasePath,
  projectDirectoryPath,
} from "@molis-ai/molis-work-module-projects";
import { PROJECT_DATABASE_FILENAME } from "@molis-ai/molis-work-storage";

// W5-17 (catalog v23): the project catalog stores no database path. A project's database is <projects directory>/<project_id>/molis-work.db, derived
// in one place, so a catalog that is copied, restored or moved points at the files of the Home it now sits in, and no row can name a file outside.

const plugins = { has: (id: string) => id === "goals", companions: () => [] };
const open = (file: string, projectsDirectory: string) => {
  const db = new Database(file);
  db.pragma("foreign_keys = ON");
  createProjectsSchema(db);
  return { db, projects: new ProjectsModule({ db, projects_directory: projectsDirectory, plugins }) };
};
const scratch = () => mkdtempSync(join(tmpdir(), "catalog-path-derivation-"));

test("RAC-2300 the catalog stores no path: a project's database is derived from the projects directory and its id, and follows the catalog into another Home", () => {
  const first = scratch(), second = scratch();
  try {
    const { db, projects } = open(join(first, "catalog.db"), first);
    const record = projects.lifecycle.prepareRecord({ project_id: "project-a", display_name: "甲", data_class: "user" });
    projects.lifecycle.register(record, "project.created", "tester");
    assert.equal(record.database_path, join(first, "project-a", "molis-work.db"));
    assert.equal(projects.query.getProject("project-a").database_path, record.database_path);
    assert.deepEqual(db.prepare("PRAGMA table_info(projects)").all().map((column: { name: string }) => column.name),
      ["project_id", "display_name", "source", "data_class", "created_at", "updated_at"], "the projects table has no path column");
    db.pragma("wal_checkpoint(TRUNCATE)"); db.close();
    // The same catalog file, restored into a Home somewhere else.
    copyFileSync(join(first, "catalog.db"), join(second, "catalog.db"));
    const moved = open(join(second, "catalog.db"), second);
    assert.equal(moved.projects.query.getProject("project-a").database_path, join(second, "project-a", "molis-work.db"));
    assert.deepEqual(listProjectDatabasePaths(moved.db, second), [join(second, "project-a", "molis-work.db")]);
    assert.deepEqual(listCatalogProjectsForUninstall(moved.db, second).map(project => project.database_path), [join(second, "project-a", "molis-work.db")]);
    moved.db.close();
  } finally { rmSync(first, { recursive: true, force: true }); rmSync(second, { recursive: true, force: true }); }
});

test("RAC-2301 a project id that is not one plain path segment has no directory: refused when a project is created and when a row is read", () => {
  const directory = scratch();
  try {
    const { db, projects } = open(join(directory, "catalog.db"), directory);
    for (const id of ["..", ".", "../escape", "a/b", "a\\b", "nul\0byte", "/absolute"]) {
      assert.throws(() => projectDatabasePath(directory, id), { code: "catalog.project_storage_invalid" }, JSON.stringify(id));
      assert.throws(() => projectDirectoryPath(directory, id), { code: "catalog.project_storage_invalid" }, JSON.stringify(id));
      assert.throws(() => projects.lifecycle.prepareRecord({ project_id: id, display_name: "逃逸", data_class: "user" }), { code: "catalog.project_storage_invalid" }, JSON.stringify(id));
    }
    assert.equal(projects.query.listProjects().length, 0, "nothing was registered");
    // A row written around the module (a catalog edited by hand) is not read into a path outside the directory either.
    db.prepare("INSERT INTO projects (project_id, display_name, source, data_class, created_at, updated_at) VALUES ('../x', 'x', 'created', 'user', 't', 't')").run();
    assert.throws(() => projects.query.listProjects(), { code: "catalog.project_storage_invalid" });
    assert.throws(() => listProjectDatabasePaths(db, directory), { code: "catalog.project_storage_invalid" });
    db.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("RAC-2302 the project.created event records the project, not a path; the module has no way to move a project's database", () => {
  const directory = scratch();
  try {
    const { db, projects } = open(join(directory, "catalog.db"), directory);
    const record = projects.lifecycle.prepareRecord({ project_id: "project-b", display_name: "乙", data_class: "user" });
    projects.lifecycle.register(record, "project.created", "tester");
    const payload = JSON.parse(String(db.prepare("SELECT payload_json FROM project_events WHERE type = 'project.created'").pluck().get()));
    assert.deepEqual(payload, { project_id: "project-b" });
    assert.equal("updateDatabasePath" in projects.lifecycle, false);
    db.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("RAC-2303 the derived file name is the one the storage package names, and the catalog's version is 23", () => {
  assert.equal(projectDatabasePath("/home/projects", "p"), join("/home/projects", "p", PROJECT_DATABASE_FILENAME));
  assert.equal(CATALOG_SCHEMA_VERSION, 23, "catalog v23 is the one that stores no path");
});
