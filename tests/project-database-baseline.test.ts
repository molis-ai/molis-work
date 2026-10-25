import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { describeSqliteSchema, SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import { PROJECT_DATABASE_BASELINE } from "@molis-ai/molis-work-app-local-host";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const shape = (sql: string) => { const db = new DatabaseSync(":memory:"); try { db.exec(sql); return describeSqliteSchema(db); } finally { db.close(); } };
const shapeOf = (path: string) => { const db = new DatabaseSync(path, { readOnly: true }); try { return describeSqliteSchema(db); } finally { db.close(); } };

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const ledgerOf = (path: string) => { const db = new DatabaseSync(path, { readOnly: true }); try { return db.prepare("SELECT plugin_id, publisher_signature, store_name, version, tables_json FROM plugin_project_databases ORDER BY plugin_id").all().map(row => ({ ...row })); } finally { db.close(); } };
/** The built-in project plugins that declare tables in the library, as the Host reads them from the one catalog. */
const declaring = BUILTIN_PLUGIN_CATALOG.filter(entry => entry.manifest.runtime?.scope !== "home" && entry.manifest.databases?.project).map(entry => entry.manifest);
/** What a library is once the Host has opened it: the baseline, then each declaring plugin's own statements. */
const opened = shape([PROJECT_DATABASE_BASELINE.schema, ...declaring.map(manifest => manifest.databases!.project!.schema)].join("\n"));
/** The eleven tables of the baseline and the plugins (other than Goals' board) whose rows belong to the project (PLIB-09). */
const ROOTED = ["coding_sessions", "events", "feed_items", "feed_materials", "feed_out_rules", "feed_source_runs", "feed_sources",
  "idempotency_records", "inbox_entries", "library_artifacts", "process_items"];

// A project's database (repository-anti-corruption §4.1) has one current schema, made of the platform's and the Modules'
// creation statements; the plugins' own tables, Goals' among them (S8), are theirs (PG-020) and come with their declarations.
// ATTN-OWNER-07: the fixture is that schema as of version 11 (FI-5: the Feed items, Sources, Signals and Listener Host tables are Feed's
// declaration's, so they left the baseline; version 10 was ac-trust T1 and S9-0b together): changing any owner's tables means a new
// version and a new fixture, never a silent drift.
test("the project database baseline is version 11 and the platform's and Modules' current tables", () => {
  assert.equal(PROJECT_DATABASE_BASELINE.version, 11);
  assert.deepEqual(shape(PROJECT_DATABASE_BASELINE.schema), shape(fixture("project-database-schema.sql")));
});

test("ATTN-OWNER-07 a version 9 project with legal namespace-shaped ids is refused without rewriting its schema or rows", () => {
  const home = mkdtempSync(join(tmpdir(), "attention-v9-refusal-")), file = join(home, "project.db");
  try {
    const old = new DatabaseSync(file);
    old.exec(fixture("project-database-schema-v9.sql"));
    old.exec("PRAGMA user_version = 9");
    old.prepare("INSERT INTO project_root (project_id, created_at) VALUES (?, ?)").run("p", "2026-10-24");
    old.prepare("INSERT INTO inbox_entries (project_id, entry_id, subject_type, subject_id, reason, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("p", "io.molis.work.example:entry", "goal_decision", "io.molis.work.example:goal", "goal_decision", "open", "2026-10-24", "2026-10-24");
    const before = { schema: describeSqliteSchema(old), rows: old.prepare("SELECT * FROM inbox_entries").all() };
    old.close();
    assert.throws(() => new LocalProjectDatabase(file), error => error instanceof SqliteSchemaVersionError && error.found === 9 && error.expected === 11);
    const after = new DatabaseSync(file, { readOnly: true });
    try {
      assert.equal(after.prepare("PRAGMA user_version").get()!.user_version, 9);
      assert.deepEqual(describeSqliteSchema(after), before.schema);
      assert.deepEqual(after.prepare("SELECT * FROM inbox_entries").all(), before.rows);
    } finally { after.close(); }
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("PLIB-01, PLIB-13: the library's baseline imports no plugin package, so no plugin's tables, Goals' among them, can enter it", () => {
  const source = readFileSync(new URL("../apps/local-host/src/project-database-schema.ts", import.meta.url), "utf8");
  const imported = [...source.matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g)].map(match => match[1] ?? match[2]!);
  assert.ok(imported.length > 0, "the baseline is still put together from its owners' statements");
  const plugins = new URL("../plugins/native/", import.meta.url);
  const pluginPackages = new Set(readdirSync(plugins, { withFileTypes: true }).filter(entry => entry.isDirectory())
    .map(entry => (JSON.parse(readFileSync(new URL(`${entry.name}/package.json`, plugins), "utf8")) as { name: string }).name));
  assert.ok(pluginPackages.has("@molis-ai/molis-work-plugin-coding"));
  assert.deepEqual(imported.filter(name => pluginPackages.has(name) || /plugins\/native\//.test(name)), []);
  for (const manifest of declaring) {
    for (const table of Object.keys(shape(manifest.databases!.project!.schema).tables)) {
      assert.equal(table in shape(PROJECT_DATABASE_BASELINE.schema).tables, false, `${manifest.plugin_id}'s ${table} is not in the baseline`);
    }
  }
});

test("PLIB-02: the plugins' tables are the ones version 7 had in the baseline, the project they belong to now the root instead of the board", () => {
  assert.deepEqual(declaring.map(manifest => manifest.plugin_id).sort(), ["io.molis.work.coding", "io.molis.work.feed", "io.molis.work.goals", "io.molis.work.schedule"]);
  const before = shape(fixture("project-database-schema-v7.sql")).tables;
  for (const manifest of declaring) {
    for (const [table, now] of Object.entries(shape(manifest.databases!.project!.schema).tables)) {
      const then = before[table];
      assert.ok(then, `${table} was in version 7`);
      // Goals' tables hang under Goals' own board as before; only the board itself is keyed to the root, and has no name (PLIB-13).
      if (manifest.plugin_id === GOALS_PLUGIN_ID) {
        if (table !== "boards") assert.deepEqual(now, then, table);
        continue;
      }
      // The shape lists keys in the order of their table and column, so the key that moved from the board to the root moves in the list too.
      const foreignKeys = then.foreign_keys.map(key => key.table === "boards" ? { ...key, table: "project_root" } : key)
        .sort((left, right) => `${left.table}.${left.from}`.localeCompare(`${right.table}.${right.from}`));
      assert.deepEqual(now, { ...then, foreign_keys: foreignKeys }, table);
    }
  }
});

test("PLIB-09: the project is one root row; the eleven tables and Goals' board, which Goals declares, point at it, and Goals' other tables point at the board", () => {
  const tables = opened.tables;
  assert.deepEqual(tables.project_root!.columns.map(column => column.name), ["project_id", "created_at"]);
  const pointing = (target: string) => Object.entries(tables).filter(([, table]) => table.foreign_keys.some(key => key.table === target)).map(([name]) => name).sort();
  assert.deepEqual(pointing("project_root"), [...ROOTED, "boards"].sort());
  const goals = declaring.find(manifest => manifest.plugin_id === GOALS_PLUGIN_ID)!;
  const declared = Object.keys(shape(goals.databases!.project!.schema).tables);
  assert.ok(declared.includes("boards"), "the board is a table Goals declares, no longer one of the baseline's");
  assert.equal("boards" in shape(PROJECT_DATABASE_BASELINE.schema).tables, false);
  const underBoard = pointing("boards");
  assert.ok(underBoard.length > 0 && underBoard.every(name => declared.includes(name) && !ROOTED.includes(name)), "and everything that still points at the board is Goals' own");
});

test("a new project database is made at the baseline, its plugins' tables made and recorded when the Host opens it, and starting the plugins adds nothing", async t => {
  const home = mkdtempSync(join(tmpdir(), "project-database-baseline-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "基线", actor_id: "web-user" });
  for (const plugin_id of ["coding", "feed", "schedule", "artifacts"]) catalog.addProjectPlugin({ project_id: project.project_id, plugin_id, actor_id: "web-user" });
  catalog.close();
  const created = new DatabaseSync(project.database_path, { readOnly: true });
  try {
    assert.equal((created.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, PROJECT_DATABASE_BASELINE.version);
    assert.deepEqual(created.prepare("SELECT project_id FROM project_root").all().map(row => row.project_id), [project.project_id], "exactly one root row, the project's");
  } finally { created.close(); }
  assert.deepEqual(shapeOf(project.database_path), opened);
  const ledger = ledgerOf(project.database_path);
  assert.deepEqual(ledger.map(row => [row.plugin_id, row.publisher_signature, row.store_name, row.version]), declaring.map(manifest => [manifest.plugin_id, manifest.publisher.signature, manifest.databases!.project!.store_name, manifest.databases!.project!.version]).sort());

  // Opening the project's pages starts its plugins and their owners; none of them makes a table of its own any more.
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken: "project-database-baseline-token-123456789" });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}/projects/${project.project_id}`;
  for (const path of ["/", "/api/plugins/io.molis.work.shelf/project-results", "/feed", "/schedule", "/coding"]) await (await fetch(origin + path)).arrayBuffer();
  assert.deepEqual(shapeOf(project.database_path), opened);
  assert.deepEqual(ledgerOf(project.database_path), ledger, "and records nothing new");
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
