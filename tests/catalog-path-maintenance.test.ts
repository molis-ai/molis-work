import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { DatabaseSync } from "node:sqlite";
import { describeSqliteSchema } from "@molis-ai/molis-work-storage";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { CATALOG_OWNER, CATALOG_SCHEMA_VERSION } from "@molis-ai/molis-work-app-local-host";
import { createProjectsSchema, ProjectsModule } from "@molis-ai/molis-work-module-projects";
import { run } from "./fixtures/catalog-path-maintenance.mjs";

// The rehearsal of the W5-17 maintenance (docs/releases/CHECKLIST.md 4.5): a catalog at version 22, the way the product wrote it, rewritten into
// version 23 (no stored path). Delete this file with tests/fixtures/catalog-path-maintenance.mjs once the real Home has been done.

type Stored = { id: string; path: (home: string) => string; file: boolean };
const plugins = { has: (id: string) => id === "goals", companions: () => [] };
const scratch = () => mkdtempSync(join(tmpdir(), "catalog-path-maintenance-"));

/** A Home whose catalog is at version 22: the projects table holds `database_path`, and a table that references `projects` holds rows. */
function v22Home(rows: Stored[], options: { owner?: string; version?: number; extra?: string } = {}) {
  const home = scratch(), projects = join(home, "projects");
  mkdirSync(projects, { recursive: true });
  const db = new Database(join(projects, "catalog.db"));
  db.pragma("foreign_keys = OFF");
  db.exec(readFileSync(new URL("./fixtures/catalog-before-w517.sql", import.meta.url), "utf8"));
  db.prepare("INSERT INTO catalog_meta VALUES ('owner', ?), ('schema_version', ?)").run(options.owner ?? CATALOG_OWNER, String(options.version ?? 22));
  for (const row of rows) {
    db.prepare("INSERT INTO projects VALUES (?, ?, ?, 'created', 'user', '2026-01-01', '2026-01-02')").run(row.id, `项目 ${row.id}`, row.path(home));
    db.prepare("INSERT INTO project_plugins (project_id, plugin_id, added_at) VALUES (?, 'goals', '2026-01-01')").run(row.id);
    db.prepare("INSERT INTO project_events (event_id, project_id, type, actor_id, payload_json, created_at) VALUES (?, ?, 'project.created', 'tester', ?, '2026-01-01')")
      .run(`event-${row.id}`, row.id, JSON.stringify({ project_id: row.id, database_path: row.path(home) }));
    if (row.file) { mkdirSync(join(projects, row.id)); writeFileSync(join(projects, row.id, "molis-work.db"), ""); }
  }
  if (options.extra) db.exec(options.extra);
  db.close();
  return { home, catalog: join(projects, "catalog.db"), cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

const derived = (id: string) => (home: string) => join(home, "projects", id, "molis-work.db");
const clean: Stored[] = [
  { id: "p-in", path: derived("p-in"), file: true },
  { id: "p-copy", path: () => "/Users/someone/.molis-work/projects/p-copy/molis-work.db", file: true },
];
const blocking: Stored[] = [
  ...clean,
  { id: "p-out", path: () => "/custom/place/other.db", file: true },
  { id: "p-missing", path: derived("p-missing"), file: false },
  { id: "../bad", path: () => "/x/molis-work.db", file: false },
];
const states = (report: { projects: Array<{ project_id: string; state: string }> }) => Object.fromEntries(report.projects.map(project => [project.project_id, project.state]));
const normalize = (sql: string | undefined) => (sql ?? "").replace(/"projects"/g, "projects").replace(/\s+/g, " ").trim();

test("RAC-2304 list names where the catalog says each project database is and where it will be looked for, writes nothing, and exits 3 while one project is for the person to decide", () => {
  const { home, catalog, cleanup } = v22Home(blocking);
  try {
    mkdirSync(join(home, "projects", "left-over")); writeFileSync(join(home, "projects", "left-over", "molis-work.db"), "");
    const before = readFileSync(catalog);
    const { code, report } = run(["list", "--home", home]);
    assert.equal(code, 3);
    assert.deepEqual(states(report), { "../bad": "bad-id", "p-copy": "other-home", "p-in": "in-place", "p-missing": "missing", "p-out": "outside" });
    assert.equal(report.orphans.length, 1);
    assert.match(report.orphans[0], /left-over\/molis-work\.db$/);
    assert.equal(report.projects.find((project: { project_id: string }) => project.project_id === "p-copy").derived.endsWith("projects/p-copy/molis-work.db"), true);
    assert.deepEqual(readFileSync(catalog), before, "list does not write");
    const ready = v22Home(clean);
    try { assert.equal(run(["list", "--home", ready.home]).code, 0); } finally { ready.cleanup(); }
  } finally { cleanup(); }
});

test("RAC-2305 rewrite writes nothing while a project is outside the Home, has no database, or has an id that is not a directory name", () => {
  const { home, catalog, cleanup } = v22Home(blocking);
  try {
    const before = readFileSync(catalog);
    const { code, report } = run(["rewrite", "--home", home]);
    assert.equal(code, 3);
    assert.equal(report.blocked, 3);
    assert.equal(report.rewrote, undefined);
    assert.deepEqual(readFileSync(catalog), before, "the catalog is byte for byte what it was");
  } finally { cleanup(); }
});

test("RAC-2306 rewrite turns a version 22 catalog into the version 23 one: no path column, the same rows, nothing cascaded away, the product's own table", async () => {
  const { home, catalog, cleanup } = v22Home(clean);
  try {
    const { code, report } = run(["rewrite", "--home", home]);
    assert.equal(code, 0, JSON.stringify(report));
    assert.equal(report.rewrote, true);
    assert.deepEqual(report.problems, []);
    const db = new Database(catalog, { readonly: true });
    try {
      assert.equal(db.prepare("SELECT value FROM catalog_meta WHERE key = 'schema_version'").pluck().get(), String(CATALOG_SCHEMA_VERSION));
      assert.deepEqual(db.prepare("SELECT project_id, display_name, source, data_class, created_at, updated_at FROM projects ORDER BY project_id").all(),
        [{ project_id: "p-copy", display_name: "项目 p-copy", source: "created", data_class: "user", created_at: "2026-01-01", updated_at: "2026-01-02" },
         { project_id: "p-in", display_name: "项目 p-in", source: "created", data_class: "user", created_at: "2026-01-01", updated_at: "2026-01-02" }]);
      assert.equal(db.prepare("SELECT count(*) FROM project_plugins").pluck().get(), 2, "dropping the old table did not cascade into the tables that reference it");
      assert.equal(db.prepare("SELECT count(*) FROM project_events").pluck().get(), 2, "the event history is kept as it was written");
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
      assert.equal(db.prepare("PRAGMA integrity_check").pluck().get(), "ok");
      // The table and index are the ones a new catalog gets.
      const fresh = new Database(":memory:");
      createProjectsSchema(fresh);
      for (const name of ["projects", "projects_display_name_idx"]) {
        const sql = (connection: Database.Database) => normalize(connection.prepare("SELECT sql FROM sqlite_master WHERE name = ?").pluck().get(name) as string | undefined);
        assert.equal(sql(db), sql(fresh), name);
      }
      assert.deepEqual(db.prepare("PRAGMA table_xinfo(projects)").all(), fresh.prepare("PRAGMA table_xinfo(projects)").all());
      fresh.close();
      const referenceHome = join(home, "reference");
      const referenceCatalog = await openMolisWorkProjectCatalog({ homeDirectory: referenceHome });
      referenceCatalog.close();
      const referenceDb = new Database(join(referenceHome, "projects", "catalog.db"), { readonly: true });
      try { assert.deepEqual(describeSqliteSchema(db), describeSqliteSchema(referenceDb), "all tables, ordered columns, CHECKs, foreign keys and indexes match the actual new catalog"); }
      finally { referenceDb.close(); }
      // And the product reads it: the paths are derived in the Home the catalog now sits in.
      const projects = new ProjectsModule({ db, projects_directory: join(home, "projects"), plugins });
      assert.deepEqual(projects.query.listProjects().map(project => project.database_path).sort(), [derived("p-copy")(home), derived("p-in")(home)]);
    } finally { db.close(); }
  } finally { cleanup(); }
});

test("RAC-2307 rewrite on a version 23 catalog changes nothing, and neither does list", () => {
  const { home, catalog, cleanup } = v22Home(clean);
  try {
    assert.equal(run(["rewrite", "--home", home]).code, 0);
    const after = readFileSync(catalog);
    for (const mode of ["rewrite", "list"]) {
      const { code, report } = run([mode, "--home", home]);
      assert.equal(code, 0);
      assert.equal(report.already_current, true);
      assert.deepEqual(readFileSync(catalog), after, `${mode} wrote to a catalog that is already current`);
    }
  } finally { cleanup(); }
});

test("RAC-2308 a rewrite that fails after dropping the old table rolls back the entire catalog", () => {
  const { home, catalog, cleanup } = v22Home(clean);
  const original = DatabaseSync.prototype.exec;
  try {
    const before = readFileSync(catalog);
    let reached = false;
    DatabaseSync.prototype.exec = function (sql) {
      if (sql === "ALTER TABLE projects_next RENAME TO projects") { reached = true; throw new Error("injected table-swap failure"); }
      return original.call(this, sql);
    };
    const { code, error } = run(["rewrite", "--home", home]);
    assert.equal(reached, true, "the injection is reached after the business table was dropped");
    assert.equal(code, 1);
    assert.match(error, /nothing was written: injected table-swap failure/);
    assert.deepEqual(readFileSync(catalog), before);
  } finally { DatabaseSync.prototype.exec = original; cleanup(); }
});

// RAC-2309: a correct number cannot authorize an unexpected structure, including objects outside Projects' own tables.
test("RAC-2309 wrong old catalog columns, indexes, views and triggers are refused without a persisted change", () => {
  for (const extra of ["ALTER TABLE projects ADD COLUMN unexpected TEXT", "CREATE INDEX unexpected_idx ON projects (source)",
    "CREATE VIEW unexpected_view AS SELECT project_id FROM projects", "CREATE TRIGGER unexpected_trigger AFTER INSERT ON project_events BEGIN SELECT 1; END"]) {
    const { home, catalog, cleanup } = v22Home(clean, { extra });
    try {
      const before = readFileSync(catalog), result = run(["rewrite", "--home", home]);
      assert.equal(result.code, 1, extra);
      assert.match(result.error, /schema mismatch/);
      assert.deepEqual(readFileSync(catalog), before);
    } finally { cleanup(); }
  }
});

test("RAC-2309 the real Home is refused without the window flag, a catalog that is not Molis Work's or at another version is not touched, and nothing may hold the catalog", async t => {
  const real = v22Home(clean);
  const previous = process.env.MOLIS_WORK_HOME;
  try {
    process.env.MOLIS_WORK_HOME = real.home;
    for (const argv of [["list", "--home", real.home], ["rewrite", "--home", real.home]]) {
      assert.equal(run(argv).code, 2, argv.join(" "));
      assert.match(run(argv).error, /real Home/);
    }
  } finally { if (previous === undefined) delete process.env.MOLIS_WORK_HOME; else process.env.MOLIS_WORK_HOME = previous; real.cleanup(); }
  for (const [name, options] of [["owner", { owner: "someone-else" }], ["version", { version: 21 }]] as const) {
    const { home, catalog, cleanup } = v22Home(clean, options);
    try {
      const before = readFileSync(catalog);
      assert.equal(run(["rewrite", "--home", home]).code, 1, name);
      assert.deepEqual(readFileSync(catalog), before, name);
    } finally { cleanup(); }
  }
  assert.equal(run(["rewrite"]).code, 2);
  assert.equal(run(["rewrite", "--home", join(tmpdir(), "catalog-path-maintenance-no-such-directory")]).code, 2);
  if (spawnSync("lsof", ["-v"]).error) { t.diagnostic("lsof is not here: the occupancy check is not rehearsed"); return; }
  const { home, catalog, cleanup } = v22Home(clean);
  const holder = spawn(process.execPath, ["-e", `const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync(${JSON.stringify(catalog)}); db.exec("SELECT 1"); console.log("open"); setInterval(() => {}, 1000);`], { stdio: ["ignore", "pipe", "ignore"] });
  try {
    await new Promise<void>(resolve => holder.stdout!.once("data", () => resolve()));
    const before = readFileSync(catalog);
    const { code, error } = run(["rewrite", "--home", home]);
    assert.equal(code, 1);
    assert.match(error, /holds the catalog/);
    assert.deepEqual(readFileSync(catalog), before);
  } finally { holder.kill(); cleanup(); }
});
