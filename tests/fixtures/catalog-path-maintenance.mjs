#!/usr/bin/env node
// W5-17 maintenance (specs/repository-anti-corruption/c-end-readiness.md decision #21, docs/releases/CHECKLIST.md 4.5): the project catalog
// (<Home>/projects/catalog.db) used to store the absolute path of every project database in `projects.database_path`. From catalog v23 it
// stores no path: a project's database is <Home>/projects/<project_id>/molis-work.db, derived from the Home and the project id, so a Home
// that is copied, restored or moved points at its own files. This lists, and then rewrites, a v22 catalog into v23. Delete this file and
// tests/catalog-path-maintenance.test.ts together once the real Home has been done (they stay in Git history).
//
//   node tests/fixtures/catalog-path-maintenance.mjs list    --home <copy of the Home> [--json]
//       READ ONLY. Says, for every project in the catalog, where the catalog says its database is and where it will be looked for, and names the
//       project databases under <Home>/projects that the catalog does not list.
//   node tests/fixtures/catalog-path-maintenance.mjs rewrite --home <Home or copy> [--json] [--maintenance-window]
//       Reads everything first and writes nothing while one project is in a state the person must decide; otherwise rebuilds `projects` without
//       the column and sets the catalog's version to 23, in one transaction, then reads the catalog again. The real Home (~/.molis-work,
//       ~/.goalboard, $MOLIS_WORK_HOME) is refused unless --maintenance-window says the user approved the window; `list` never accepts it, run
//       `list` on a copy. Nothing may hold the catalog (lsof is asked) and on the real Home the ports 4173, 4207 and 4208 must be quiet.
//       Running it again on a v23 catalog changes nothing. Back the Home up before the real run (docs/releases/CHECKLIST.md 4.5).
//   Exit code: 0 done or nothing to do, 3 the report names projects that block the rewrite (nothing was written), 1 a problem (nothing was
//   written when it was found while reading), 2 a bad command, or the real Home without the flag.
//
// A PROJECT IS ONE OF (the path the catalog stores is compared with where the Home keeps the project; only the second form is accepted for a rewrite):
//   in-place     the stored path is exactly <Home>/projects/<project_id>/molis-work.db
//   other-home   the stored path ends in projects/<project_id>/molis-work.db under some other Home: a copy or a moved Home. The derived path is
//                the one that exists in this Home, which is what the rewrite keeps
//   outside      the stored path is anywhere else. The rewrite would make the project's database forget where it is, so the person decides; the
//                tool moves no file
//   bad-id       the project id is not one plain path segment, so it has no directory
//   missing      there is no database at the derived path
// WHAT IS NOT TOUCHED: `project_events` keeps the `database_path` its `project.created` events were written with (the event table is an append-only
// history, not the owner of the path), and no project database is opened or moved.
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import { describeSqliteSchema } from "@molis-ai/molis-work-storage";

const OWNER = "molis-work-project-catalog-v1";
const FROM = 22, TO = 23;
const DATABASE_FILE = "molis-work.db";
/** The `projects` table of catalog v23, as modules/projects creates it; tests/catalog-path-maintenance.test.ts holds this to the module's own. */
const PROJECTS_TABLE = name => `CREATE TABLE ${name} (
      project_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('created')),
      data_class TEXT NOT NULL CHECK (data_class IN ('user', 'regenerable_demo')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`;
const DISPLAY_INDEX = "CREATE INDEX projects_display_name_idx ON projects(display_name COLLATE NOCASE, project_id)";
const KEPT_COLUMNS = "project_id, display_name, source, data_class, created_at, updated_at";
const PLAIN_SEGMENT = id => !!id && id !== "." && id !== ".." && !/[\\/\0]/u.test(id);

/** One project of the catalog, and what the rewrite can do with it. */
export function classify(home, row) {
  const derived = PLAIN_SEGMENT(row.project_id) ? path.join(home, "projects", row.project_id, DATABASE_FILE) : null;
  const stored = String(row.database_path);
  if (!derived) return { project_id: row.project_id, stored, derived, state: "bad-id" };
  const resolved = path.resolve(stored), parent = path.dirname(resolved);
  // A stored path can point into the live Home while this script is inspecting a copy. Compare text only; never stat/open that path.
  const same = resolved === derived;
  const state = same ? "in-place"
    : path.basename(resolved) === DATABASE_FILE && path.basename(parent) === row.project_id && path.basename(path.dirname(parent)) === "projects" ? "other-home"
    : "outside";
  return { project_id: row.project_id, stored, derived, state: existsSync(derived) ? state : state === "outside" ? "outside" : "missing" };
}

const schemaFor = version => {
  const reference = new DatabaseSync(":memory:");
  try {
    reference.exec(readFileSync(new URL("./catalog-before-w517.sql", import.meta.url), "utf8"));
    if (version === TO) {
      reference.exec("DROP TABLE projects");
      reference.exec(PROJECTS_TABLE("projects"));
      reference.exec(DISPLAY_INDEX);
    }
    return describeSqliteSchema(reference);
  } finally { reference.close(); }
};
const matchesSchema = (db, version) => !db.prepare("SELECT 1 FROM sqlite_master WHERE type IN ('view', 'trigger') LIMIT 1").get()
  && isDeepStrictEqual(describeSqliteSchema(db), schemaFor(version));
const rowCounts = db => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
  .map(row => [row.name, Number(db.prepare(`SELECT count(*) AS n FROM "${row.name.replaceAll('"', '""')}"`).get().n)]);

const BLOCKING = new Set(["outside", "bad-id", "missing"]);

function readProjects(db) {
  return db.prepare("SELECT project_id, display_name, source, data_class, created_at, updated_at, database_path FROM projects ORDER BY project_id").all();
}

/** The project databases under <Home>/projects that the catalog does not list. */
function orphans(home, listed) {
  const root = path.join(home, "projects");
  let entries;
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return []; }
  return entries.filter(entry => entry.isDirectory() && !entry.name.startsWith(".") && !listed.has(entry.name) && existsSync(path.join(root, entry.name, DATABASE_FILE)))
    .map(entry => path.join(root, entry.name, DATABASE_FILE)).sort();
}

function inspect(home, db) {
  const meta = key => db.prepare("SELECT value FROM catalog_meta WHERE key = ?").get(key)?.value;
  if (meta("owner") !== OWNER) return { problem: "the catalog does not name Molis Work as its owner" };
  const version = Number(meta("schema_version"));
  if (version === TO) return matchesSchema(db, TO) ? { version, projects: [], orphans: [] } : { problem: "current catalog schema mismatch" };
  if (version !== FROM) return { problem: `the catalog is at version ${version}; this tool only knows ${FROM} -> ${TO}` };
  if (!matchesSchema(db, FROM)) return { problem: "old catalog schema mismatch; run the preceding catalog maintenance first" };
  if (db.prepare("PRAGMA integrity_check").all().some(row => row.integrity_check !== "ok")
    || db.prepare("PRAGMA foreign_key_check").all().length) return { problem: "old catalog integrity check failed" };
  const projects = readProjects(db).map(row => classify(home, row));
  return { version, projects, orphans: orphans(home, new Set(projects.map(project => project.project_id))) };
}

// Recognize the configured locations lexically; rehearsals must never stat the person's Home merely to identify its name.
const realHomes = () => [path.join(homedir(), ".molis-work"), path.join(homedir(), ".goalboard"), process.env.MOLIS_WORK_HOME ?? ""]
  .filter(Boolean).map(candidate => path.resolve(candidate));

/** Which of the Host's ports something listens on, or null when lsof is not there to ask. */
function listening() {
  const found = [];
  for (const port of [4173, 4207, 4208]) {
    const asked = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" });
    if (asked.error) return null;
    if (asked.stdout.trim()) found.push(port);
  }
  return found;
}

/** Process ids holding any of the files, or null when lsof is not there to ask. */
function holders(files) {
  if (!files.length) return [];   // `lsof -t --` with no file lists every process of the machine
  const asked = spawnSync("lsof", ["-t", "--", ...files], { encoding: "utf8" });
  return asked.error ? null : asked.stdout.split("\n").filter(Boolean);
}

const withCatalog = (file, options, use) => {
  const db = new DatabaseSync(file, options);
  try { return use(db); } finally { db.close(); }
};

/** Rebuilds `projects` without `database_path` and sets the version, in one transaction; the rows must come out exactly as they went in. */
function rebuild(home, file) {
  return withCatalog(file, {}, db => {
    // Foreign keys are off for the table swap so that dropping `projects` does not cascade into the tables that reference it (SQLite's own
    // procedure for changing a table); they are checked before the commit.
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN IMMEDIATE");
    try {
      const found = inspect(home, db);
      if (found.problem) throw new Error(found.problem);
      const blocked = found.projects.filter(project => BLOCKING.has(project.state));
      if (blocked.length) { db.exec("ROLLBACK"); return { blocked, ...found }; }
      const countsBefore = rowCounts(db);
      const before = db.prepare(`SELECT rowid AS kept_rowid, ${KEPT_COLUMNS} FROM projects ORDER BY project_id`).all();
      db.exec(PROJECTS_TABLE("projects_next"));
      db.exec(`INSERT INTO projects_next (rowid, ${KEPT_COLUMNS}) SELECT rowid, ${KEPT_COLUMNS} FROM projects`);
      db.exec("DROP TABLE projects");
      db.exec("ALTER TABLE projects_next RENAME TO projects");
      db.exec(DISPLAY_INDEX);
      db.prepare("UPDATE catalog_meta SET value = ? WHERE key = 'schema_version'").run(String(TO));
      const after = db.prepare(`SELECT rowid AS kept_rowid, ${KEPT_COLUMNS} FROM projects ORDER BY project_id`).all();
      if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error("the rebuilt projects table does not hold the rows it was built from");
      const dangling = db.prepare("PRAGMA foreign_key_check").all();
      if (dangling.length) throw new Error(`${dangling.length} row(s) of the catalog reference a project that is not there after the rebuild`);
      if (!isDeepStrictEqual(rowCounts(db), countsBefore)) throw new Error("catalog row counts changed");
      const problems = currentProblems(db);
      if (problems.length) throw new Error(problems.join("; "));
      db.exec("COMMIT");
      return { blocked: [], ...found, rewrote: true };
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch { /* the transaction was already closed */ }
      throw error;
    }
  });
}

/** Read the catalog again after the rewrite, from a new connection: the version, the missing column, and the integrity of the file. */
function currentProblems(db) {
  const problems = [];
  if (db.prepare("SELECT value FROM catalog_meta WHERE key = 'schema_version'").get()?.value !== String(TO)) problems.push(`the catalog is not at version ${TO}`);
  if (!matchesSchema(db, TO)) problems.push("current catalog schema mismatch");
  const integrity = db.prepare("PRAGMA integrity_check").all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") problems.push("the catalog fails its integrity check");
  if (db.prepare("PRAGMA foreign_key_check").all().length) problems.push("the catalog has rows that reference a missing project");
  return problems;
}
const verify = file => withCatalog(file, { readOnly: true }, currentProblems);

export function run(argv) {
  const [mode, ...rest] = argv;
  const index = rest.indexOf("--home");
  const usage = "usage: catalog-path-maintenance.mjs <list|rewrite> --home <Home copy> [--json] [--maintenance-window]";
  if (!["list", "rewrite"].includes(mode) || index < 0 || !rest[index + 1]) return { code: 2, error: usage };
  let home;
  try { home = realpathSync(path.resolve(rest[index + 1])); } catch { return { code: 2, error: `${rest[index + 1]} is not a directory\n${usage}` }; }
  if (!statSync(home).isDirectory()) return { code: 2, error: `${home} is not a directory` };
  const real = realHomes().includes(home), apply = mode === "rewrite";
  if (real && (!apply || !rest.includes("--maintenance-window"))) {
    return { code: 2, error: `${home} is the real Home: ${apply ? "rewrite needs --maintenance-window (the user approved the window)" : "run list on a copy"}` };
  }
  const file = path.join(home, "projects", "catalog.db");
  if (!existsSync(file)) return { code: 1, error: `${file} does not exist` };
  if (!lstatSync(path.dirname(file)).isDirectory() || !lstatSync(file).isFile() || lstatSync(file).nlink !== 1) return { code: 1, error: "the catalog must be an ordinary file inside the copy" };
  let found;
  try { found = withCatalog(file, { readOnly: true }, db => inspect(home, db)); }
  catch (error) { return { code: 1, error: `the catalog cannot be read: ${String(error.message).slice(0, 200)}` }; }
  if (found.problem) return { code: 1, error: found.problem };
  const blocked = found.projects.filter(project => BLOCKING.has(project.state));
  const report = { home, mode, from_version: found.version, to_version: TO, projects: found.projects, orphans: found.orphans, blocked: blocked.length };
  if (!apply || found.version === TO) return { code: blocked.length ? 3 : 0, report: { ...report, already_current: found.version === TO } };
  if (blocked.length) return { code: 3, report };
  const held = holders([file, `${file}-wal`].filter(existsSync));
  if (held === null && real) return { code: 2, error: "lsof is needed to check that nothing holds the Home" };
  if (held?.length) return { code: 1, error: `a process holds the catalog: ${[...new Set(held)].join(" ")}` };
  const ports = real ? listening() : [];
  if (ports?.length) return { code: 1, error: `something listens on port ${ports.join(", ")}: stop the Host first` };
  let done;
  try { done = rebuild(home, file); }
  catch (error) { return { code: 1, error: `nothing was written: ${String(error.message).slice(0, 200)}` }; }
  if (done.blocked.length) return { code: 3, report: { ...report, projects: done.projects, blocked: done.blocked.length } };
  const problems = verify(file);
  return { code: problems.length ? 1 : 0, report: { ...report, rewrote: true, problems } };
}

const lines = report => [
  `${report.mode} on ${report.home}: catalog version ${report.from_version}${report.already_current ? " (already current, nothing to do)" : ` -> ${report.to_version}`}`,
  ...report.projects.map(project => `  ${project.state.padEnd(10)} ${project.project_id}  ${project.stored}${project.derived && project.derived !== project.stored ? `  -> ${project.derived}` : ""}`),
  ...report.orphans.map(orphan => `  orphan     ${orphan} (no project in the catalog)`),
  ...(report.rewrote ? ["rewrote the catalog", ...(report.problems ?? []).map(problem => `  PROBLEM ${problem}`)] : []),
];

function main() {
  const result = run(process.argv.slice(2));
  if (result.error) process.stderr.write(`${result.error}\n`);
  else process.stdout.write(`${process.argv.includes("--json") ? JSON.stringify(result.report, null, 2) : lines(result.report).join("\n")}\n`);
  process.exit(result.code);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
