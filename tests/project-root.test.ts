import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { LocalProjectDatabase, PROJECT_DATABASE_BASELINE } from "@molis-ai/molis-work-app-local-host";
import { listProjectRoots, PROJECT_ROOT_SCHEMA_SQL, writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import { SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";

test("project root keeps its data instance and creation time through repeated writes and reopen", () => {
  const directory = mkdtempSync(join(tmpdir(), "project-root-instance-"));
  const filename = join(directory, "project.db");
  const projectId = "same-business-project", createdAt = "2026-10-27T00:00:00.000Z";
  try {
    const first = new LocalProjectDatabase(filename);
    let original: ReturnType<typeof listProjectRoots>;
    try {
      assert.equal(PROJECT_DATABASE_BASELINE.version, 12);
      assert.deepEqual(listProjectRoots(first.db), []);
      assert.equal(writeProjectRoot(first.db, projectId, createdAt), true);
      original = listProjectRoots(first.db);
      assert.equal(original.length, 1);
      assert.equal(original[0]!.project_id, projectId);
      assert.equal(original[0]!.created_at, createdAt);
      assert.match(original[0]!.data_instance_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
      assert.equal(writeProjectRoot(first.db, projectId, "2026-10-28T00:00:00.000Z"), false);
      assert.deepEqual(listProjectRoots(first.db), original);
    } finally { first.close(); }

    const reopened = new LocalProjectDatabase(filename);
    try {
      assert.deepEqual(listProjectRoots(reopened.db), original);
      assert.equal(writeProjectRoot(reopened.db, projectId, "2026-10-29T00:00:00.000Z"), false);
      assert.deepEqual(listProjectRoots(reopened.db), original);
    } finally { reopened.close(); }

    const replacement = new LocalProjectDatabase(join(directory, "new-instance.db"));
    try {
      assert.equal(writeProjectRoot(replacement.db, projectId, createdAt), true);
      const current = listProjectRoots(replacement.db);
      assert.equal(current[0]!.project_id, projectId);
      assert.equal(current[0]!.created_at, createdAt);
      assert.notEqual(current[0]!.data_instance_id, original[0]!.data_instance_id);
    } finally { replacement.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("project root requires an explicit nonempty persisted instance and never invents one while reading", () => {
  const db = new Database(":memory:");
  try {
    db.exec(PROJECT_ROOT_SCHEMA_SQL);
    assert.throws(() => db.prepare("INSERT INTO project_root (project_id, created_at) VALUES (?, ?)").run("missing", "2026-10-27"), /NOT NULL/u);
    for (const invalid of [null, "", "   "])
      assert.throws(() => db.prepare("INSERT INTO project_root (project_id, created_at, data_instance_id) VALUES (?, ?, ?)").run("invalid", "2026-10-27", invalid));
    assert.deepEqual(listProjectRoots(db), []);
    db.prepare("INSERT INTO project_root (project_id, created_at, data_instance_id) VALUES (?, ?, ?)").run("malformed", "2026-10-27", Buffer.from("instance"));
    const before = db.prepare("SELECT * FROM project_root").all();
    assert.throws(() => listProjectRoots(db), { code: "catalog.project_storage_invalid" });
    assert.deepEqual(db.prepare("SELECT * FROM project_root").all(), before);
  } finally { db.close(); }
});

test("a version 10 project is refused without adding or filling a data instance", () => {
  const directory = mkdtempSync(join(tmpdir(), "project-root-old-")), filename = join(directory, "project.db");
  try {
    const old = new Database(filename);
    try {
      old.exec("CREATE TABLE project_root (project_id TEXT PRIMARY KEY, created_at TEXT NOT NULL); PRAGMA user_version = 10");
      old.prepare("INSERT INTO project_root (project_id, created_at) VALUES (?, ?)").run("original-project", "2026-10-26");
    } finally { old.close(); }
    assert.throws(() => new LocalProjectDatabase(filename), error =>
      error instanceof SqliteSchemaVersionError && error.found === 10 && error.expected === 12);
    const unchanged = new Database(filename, { readonly: true });
    try {
      assert.equal(unchanged.pragma("user_version", { simple: true }), 10);
      assert.deepEqual(unchanged.prepare("SELECT * FROM project_root").all(), [{ project_id: "original-project", created_at: "2026-10-26" }]);
      assert.deepEqual(unchanged.pragma("table_info(project_root)").map((row: { name: string }) => row.name), ["project_id", "created_at"]);
      assert.throws(() => listProjectRoots(unchanged), /no such column: data_instance_id/u);
    } finally { unchanged.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
