import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";

// PG-094 S13 (specs/repository-anti-corruption/slices/goals-s10-s11-runtime-switch.md §5.3): the person's planning methods leave the
// project catalog for Goals' library in the Home. Only disposable Homes here; the script's real-Home refusals are tried by moving the
// "temp" line the script draws (its own TMPDIR), never by pointing it at a Home that exists.

const SCRIPT = fileURLToPath(new URL("../scripts/maintenance/goals-personal-planning-move.mjs", import.meta.url));
const TABLE = "personal_planning_method_packs";
const COLUMNS = ["method_id", "version", "enabled", "pack_json", "created_at", "updated_at"];
const ROWS = [
  { method_id: "personal-a", version: 3, enabled: 1, pack_json: JSON.stringify({ method_id: "personal-a", scope: "personal", version: 3 }), created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-10-01T00:00:00.000Z" },
  { method_id: "personal-b", version: 1, enabled: 0, pack_json: JSON.stringify({ method_id: "personal-b", scope: "personal", version: 1 }), created_at: "2026-09-02T00:00:00.000Z", updated_at: "2026-09-02T00:00:00.000Z" },
];

async function home(t: test.TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "goals-personal-move-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

/** A catalog as the build before this one made it: this build's catalog, plus the table and the rows the person had in it. */
async function oldCatalog(directory: string): Promise<string> {
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: directory });
  catalog.close();
  const path = join(directory, "projects", "catalog.db");
  const db = new DatabaseSync(path);
  try {
    db.exec(`CREATE TABLE ${TABLE} (method_id TEXT PRIMARY KEY, version INTEGER NOT NULL, enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      pack_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    for (const row of ROWS) db.prepare(`INSERT INTO ${TABLE} (${COLUMNS.join(", ")}) VALUES (?, ?, ?, ?, ?, ?)`).run(...COLUMNS.map(column => (row as Record<string, string | number>)[column]!));
  } finally { db.close(); }
  return path;
}

const digest = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const catalogHasTable = (path: string) => {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(TABLE) !== undefined; } finally { db.close(); }
};
const homeRows = (directory: string) => {
  const db = new DatabaseSync(join(directory, "goals", "goals.db"), { readOnly: true });
  try { return (db.prepare(`SELECT ${COLUMNS.join(", ")} FROM ${TABLE} ORDER BY method_id`).all() as Array<Record<string, unknown>>).map(row => ({ ...row })); } finally { db.close(); }
};
const run = (args: string[], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env: { ...process.env, ...env } });

test("RAC-709 list reads the catalog's methods and writes nothing", async t => {
  const directory = await home(t), catalog = await oldCatalog(directory), before = digest(catalog);
  const listed = run(["list", "--home", directory]);
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /2 条个人规划方法/u);
  assert.match(listed.stdout, /personal-a/u);
  assert.equal(digest(catalog), before, "the catalog is byte for byte the same");
  assert.equal(existsSync(join(directory, "goals", "goals.db")), false, "and Goals' library was not made");
});

test("RAC-709 move copies every row to Goals' Home library, reads them back, then drops the catalog's table; run again it changes nothing", async t => {
  const directory = await home(t), catalog = await oldCatalog(directory);
  const moved = run(["move", "--home", directory]);
  assert.equal(moved.status, 0, moved.stderr);
  assert.deepEqual(homeRows(directory), ROWS.map(row => ({ ...row })), "every column is the person's");
  assert.equal(catalogHasTable(catalog), false, "the catalog no longer holds the table");

  const catalogAfter = digest(catalog), libraryAfter = digest(join(directory, "goals", "goals.db"));
  const again = run(["move", "--home", directory]);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /已经没有个人规划表/u);
  assert.equal(digest(catalog), catalogAfter, "a second run leaves the catalog as it was");
  assert.equal(digest(join(directory, "goals", "goals.db")), libraryAfter, "and Goals' library");
});

test("RAC-709 move that meets a different method of the same id in Goals' library stops and leaves the catalog's table whole", async t => {
  const directory = await home(t), catalog = await oldCatalog(directory);
  assert.equal(run(["move", "--home", directory]).status, 0);
  // The person changed a method in the new library, then a catalog restored from a backup brings the old table back.
  const library = new DatabaseSync(join(directory, "goals", "goals.db"));
  try { library.prepare(`UPDATE ${TABLE} SET version = 9 WHERE method_id = 'personal-a'`).run(); } finally { library.close(); }
  const db = new DatabaseSync(catalog);
  try {
    db.exec(`CREATE TABLE ${TABLE} (method_id TEXT PRIMARY KEY, version INTEGER NOT NULL, enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      pack_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    const row = ROWS[0]!;
    db.prepare(`INSERT INTO ${TABLE} (${COLUMNS.join(", ")}) VALUES (?, ?, ?, ?, ?, ?)`).run(...COLUMNS.map(column => (row as Record<string, string | number>)[column]!));
  } finally { db.close(); }

  const refused = run(["move", "--home", directory]);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /不覆盖/u);
  assert.equal(catalogHasTable(catalog), true, "the table is still there to look at");
  assert.equal(homeRows(directory).find(row => row.method_id === "personal-a")?.version, 9, "and the library keeps what the person changed");
});

test("RAC-709 a Home that is not under the temp directory is a real one: move needs the maintenance window and refuses another process holding the catalog", async t => {
  const directory = await home(t), catalog = await oldCatalog(directory);
  const elsewhere = join(directory, "other-tmp");
  await mkdir(elsewhere);
  // The script draws "temp" from its own TMPDIR; with that moved, this Home is a real one to it.
  const env = { TMPDIR: elsewhere };
  const before = digest(catalog);

  const noWindow = run(["move", "--home", directory], env);
  assert.equal(noWindow.status, 1);
  assert.match(noWindow.stderr, /--maintenance-window/u);
  assert.equal(digest(catalog), before, "nothing was written without the window");
  assert.equal(existsSync(join(directory, "goals", "goals.db")), false);

  const holder = new DatabaseSync(catalog);
  try {
    holder.exec("BEGIN IMMEDIATE");
    const busy = run(["move", "--home", directory, "--maintenance-window"], env);
    assert.equal(busy.status, 1);
    assert.match(busy.stderr, /占用/u);
    assert.equal(existsSync(join(directory, "goals", "goals.db")), false, "a catalog another process holds is not moved from");
  } finally { holder.exec("ROLLBACK"); holder.close(); }

  const window = run(["move", "--home", directory, "--maintenance-window"], env);
  assert.equal(window.status, 0, window.stderr);
  assert.equal(catalogHasTable(catalog), false);
  assert.equal(homeRows(directory).length, ROWS.length);
});

test("RAC-709 a database that is not Molis Work's project catalog is left alone", async t => {
  const directory = await home(t);
  await mkdir(join(directory, "projects"), { recursive: true });
  const path = join(directory, "projects", "catalog.db");
  const db = new DatabaseSync(path);
  try { db.exec(`CREATE TABLE ${TABLE} (method_id TEXT PRIMARY KEY, version INTEGER, enabled INTEGER, pack_json TEXT, created_at TEXT, updated_at TEXT)`); } finally { db.close(); }
  const before = digest(path);
  const refused = run(["move", "--home", directory]);
  assert.equal(refused.status, 1);
  assert.equal(digest(path), before);
  assert.equal(existsSync(join(directory, "goals", "goals.db")), false);
});

test("RAC-710 a catalog that still holds the personal planning table is refused with the maintenance to run; a new catalog has none", async t => {
  const directory = await home(t);
  const fresh = await openMolisWorkProjectCatalog({ homeDirectory: directory });
  fresh.close();
  const path = join(directory, "projects", "catalog.db");
  assert.equal(catalogHasTable(path), false, "a catalog this build makes has no such table");
  await openMolisWorkProjectCatalog({ homeDirectory: directory }).then(catalog => catalog.close());

  const db = new DatabaseSync(path);
  try { db.exec(`CREATE TABLE ${TABLE} (method_id TEXT PRIMARY KEY, version INTEGER, enabled INTEGER, pack_json TEXT, created_at TEXT, updated_at TEXT)`); } finally { db.close(); }
  await assert.rejects(openMolisWorkProjectCatalog({ homeDirectory: directory }), (error: { code?: string; message?: string }) =>
    error.code === "catalog.unsupported_schema" && /goals-personal-planning-move\.mjs/u.test(error.message ?? ""));
});
