import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { describeSqliteSchema, SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { PROJECT_DATABASE_BASELINE } from "../apps/local-host/src/project-database-schema.js";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const shape = (sql: string) => { const db = new DatabaseSync(":memory:"); try { db.exec(sql); return describeSqliteSchema(db); } finally { db.close(); } };
const shapeOf = (path: string) => { const db = new DatabaseSync(path, { readOnly: true }); try { return describeSqliteSchema(db); } finally { db.close(); } };

// A project's database (repository-anti-corruption §4.1) has one current schema, made of every owner's creation
// statements. The fixture is that schema as of version 7: changing any owner's tables means a new version and a new
// fixture, never a silent drift.
test("the project database baseline is version 7 and every owner's current tables", () => {
  assert.equal(PROJECT_DATABASE_BASELINE.version, 7);
  assert.deepEqual(shape(PROJECT_DATABASE_BASELINE.schema), shape(readFileSync(new URL("./fixtures/project-database-schema.sql", import.meta.url), "utf8")));
});

test("a new project database is created at the baseline, and a project's plugins add nothing to it", async t => {
  const home = mkdtempSync(join(tmpdir(), "project-database-baseline-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "基线", actor_id: "web-user" });
  for (const plugin_id of ["coding", "feed", "schedule", "artifacts"]) catalog.addProjectPlugin({ project_id: project.project_id, plugin_id, actor_id: "web-user" });
  catalog.close();
  const created = new DatabaseSync(project.database_path, { readOnly: true });
  try { assert.equal((created.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, PROJECT_DATABASE_BASELINE.version); }
  finally { created.close(); }
  assert.deepEqual(shapeOf(project.database_path), shape(PROJECT_DATABASE_BASELINE.schema));

  // Opening the project's pages starts its plugins and their owners, each of which creates its own tables if missing.
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken: "project-database-baseline-token-123456789" });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}/projects/${project.project_id}`;
  for (const path of ["/", "/api/plugins/io.molis.work.shelf/project-results", "/feed", "/schedule", "/coding"]) await (await fetch(origin + path)).arrayBuffer();
  assert.deepEqual(shapeOf(project.database_path), shape(PROJECT_DATABASE_BASELINE.schema));
});

test("a project database at another version, or with tables but no version, is refused and left as it is", () => {
  const directory = mkdtempSync(join(tmpdir(), "project-database-refused-"));
  try {
    const unversioned = join(directory, "unversioned.db"), later = join(directory, "later.db");
    const raw = new DatabaseSync(unversioned); raw.exec("CREATE TABLE boards (project_id TEXT PRIMARY KEY)"); raw.close();
    const ahead = new DatabaseSync(later); ahead.exec(PROJECT_DATABASE_BASELINE.schema); ahead.exec(`PRAGMA user_version = ${PROJECT_DATABASE_BASELINE.version + 1}`); ahead.close();
    for (const path of [unversioned, later]) {
      const before = shapeOf(path);
      assert.throws(() => new LocalProjectDatabase(path), (error: unknown) => error instanceof SqliteSchemaVersionError && error.path === path);
      assert.throws(() => new LocalProjectDatabase(path, { existingOnly: true }), { code: "project_recovery_unsupported_schema" });
      assert.deepEqual(shapeOf(path), before, "nothing is upgraded in place");
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
