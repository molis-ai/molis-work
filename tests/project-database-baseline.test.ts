import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { describeSqliteSchema, SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { PROJECT_DATABASE_BASELINE } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const shape = (sql: string) => { const db = new DatabaseSync(":memory:"); try { db.exec(sql); return describeSqliteSchema(db); } finally { db.close(); } };
const shapeOf = (path: string) => { const db = new DatabaseSync(path, { readOnly: true }); try { return describeSqliteSchema(db); } finally { db.close(); } };

// A project's database (repository-anti-corruption §4.1) has one current schema, made of every owner's creation
// statements. The fixture is that schema as of version 15: changing any owner's tables means a new version and a new
// fixture, never a silent drift.
test("the project database baseline is version 15 and every owner's current tables", () => {
  assert.equal(PROJECT_DATABASE_BASELINE.version, 15);
  assert.deepEqual(shape(PROJECT_DATABASE_BASELINE.schema), shape(readFileSync(new URL("./fixtures/project-database-schema.sql", import.meta.url), "utf8")));
});

test('PCSYNC-12 a v8 project refuses before WAL or ownership writes and keeps every original byte',t=>{
 const directory=mkdtempSync(join(tmpdir(),'project-v8-refusal-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));const path=join(directory,'old.db'),db=new DatabaseSync(path);
 db.exec(readFileSync(new URL('./fixtures/project-database-schema-v8.sql',import.meta.url),'utf8')+'PRAGMA user_version=8');db.close();
 const before=readFileSync(path);assert.throws(()=>new LocalProjectDatabase(path),{code:'storage.schema_version_mismatch'});assert.deepEqual(readFileSync(path),before);
});

test('PCSYNC-12 a v9 project also refuses unchanged before installing a new journal',t=>{
 const directory=mkdtempSync(join(tmpdir(),'project-v9-refusal-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));const path=join(directory,'old.db'),db=new DatabaseSync(path);
 db.exec(readFileSync(new URL('./fixtures/project-database-schema-v9.sql',import.meta.url),'utf8')+'PRAGMA user_version=9');db.close();
 const before=readFileSync(path);assert.throws(()=>new LocalProjectDatabase(path),{code:'storage.schema_version_mismatch'});assert.deepEqual(readFileSync(path),before);
});

test('PCSYNC-12 a v10 project refuses unchanged before adding message-content journals',t=>{
 const directory=mkdtempSync(join(tmpdir(),'project-v10-refusal-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));const path=join(directory,'old.db'),db=new DatabaseSync(path);
 db.exec(readFileSync(new URL('./fixtures/project-database-schema-v10.sql',import.meta.url),'utf8')+'PRAGMA user_version=10');db.close();
 const before=readFileSync(path);assert.throws(()=>new LocalProjectDatabase(path),{code:'storage.schema_version_mismatch'});assert.deepEqual(readFileSync(path),before);
});

test('PCSYNC-12 a v11 project refuses unchanged before adding process-item journals',t=>{
 const directory=mkdtempSync(join(tmpdir(),'project-v11-refusal-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));const path=join(directory,'old.db'),db=new DatabaseSync(path);
 db.exec(readFileSync(new URL('./fixtures/project-database-schema-v11.sql',import.meta.url),'utf8')+'PRAGMA user_version=11');db.close();
 const before=readFileSync(path);assert.throws(()=>new LocalProjectDatabase(path),{code:'storage.schema_version_mismatch'});assert.deepEqual(readFileSync(path),before);
});

test('PCSYNC-12 a v12 project refuses unchanged before adding private Coding journals and editor high-water marks',t=>{
 const directory=mkdtempSync(join(tmpdir(),'project-v12-refusal-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));const path=join(directory,'old.db'),db=new DatabaseSync(path);
 db.exec(readFileSync(new URL('./fixtures/project-database-schema-v12.sql',import.meta.url),'utf8')+'PRAGMA user_version=12');db.close();
 const before=readFileSync(path);assert.throws(()=>new LocalProjectDatabase(path),{code:'storage.schema_version_mismatch'});assert.deepEqual(readFileSync(path),before);
});

test('PCSYNC-12 a v13 project refuses unchanged before adding private authoring item journals',t=>{
 const directory=mkdtempSync(join(tmpdir(),'project-v13-refusal-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));const path=join(directory,'old.db'),db=new DatabaseSync(path);
 db.exec(readFileSync(new URL('./fixtures/project-database-schema-v13.sql',import.meta.url),'utf8')+'PRAGMA user_version=13');db.close();
 const before=readFileSync(path);assert.throws(()=>new LocalProjectDatabase(path),{code:'storage.schema_version_mismatch'});assert.deepEqual(readFileSync(path),before);
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
      // J7A-01/J7A-02: recovery refuses the current owner code and preserves the database shape.
      assert.throws(() => new LocalProjectDatabase(path, { existingOnly: true }), { code: "catalog.project_recovery_unsupported_schema", message: "catalog.project_recovery_unsupported_schema", kind: "invalid" });
      assert.deepEqual(shapeOf(path), before, "nothing is upgraded in place");
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

// PCSYNC-12: never alter an existing v14 database while adding canonical derived history.
test('a v14 project refuses unchanged before adding derived saved SDK history',t=>{
 const directory=mkdtempSync(join(tmpdir(),'project-v14-refusal-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));const path=join(directory,'old.db'),db=new DatabaseSync(path);
 db.exec(readFileSync(new URL('./fixtures/project-database-schema-v14.sql',import.meta.url),'utf8')+'PRAGMA user_version=14');db.close();
 const before=readFileSync(path);assert.throws(()=>new LocalProjectDatabase(path),{code:'storage.schema_version_mismatch'});assert.deepEqual(readFileSync(path),before);
});
