import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
// @ts-expect-error the gate modules are plain .mjs
import { scanTables, tableOwnerProblems } from "../scripts/gates/table-owners.mjs";

// specs/repository-anti-corruption §4.11 (W2-06): a table is read and written only by the package that creates it
// (scripts/gates/table-owners.mjs, tooling/gates/table-owners.json). The rule has no baseline: it starts at zero. As in
// tests/doc-reference-gates.test.ts, each way of breaking it is added on a branch of a small scratch repository and
// `--base main` must fail with the rule's message; what the rule must not flag stays green; and the definitions are also
// checked on in-memory snapshots, where they are quick to write down.
const script = fileURLToPath(new URL("../scripts/check-health-gates.mjs", import.meta.url));
let repo = "";

const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args],
  { cwd: repo, encoding: "utf8", stdio: "pipe" });
const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text); };
const read = (file: string) => readFileSync(path.join(repo, file), "utf8");
const append = (file: string, text: string) => put(file, read(file) + text);
const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "--allow-empty", "-m", message); };
const gate = (...args: string[]) => {
  const run = spawnSync(process.execPath, [script, "--root", repo, ...args], { encoding: "utf8" });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
};
const branch = (name: string, mutate: () => void) => {
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
  git("checkout", "-q", "-B", name);
  mutate();
  commit(name);
};
const lines = (...parts: string[]) => `${parts.join("\n")}\n`;
const manifest = (name: string) => JSON.stringify({ name }, null, 2) + "\n";
const REASON = "Several packages append to this log inside their own transaction, so a journal API could not join them.";
const EVENTS_ENTRY = { owner: "packages/storage", users: ["modules/alpha"], reason: REASON };
const SAME_REASON = "Two tables in two databases that share a name; neither package reads the other's.";
const WORKSPACES_ENTRY = { packages: ["modules/beta", "plugins/native/gamma"], reason: SAME_REASON };
const AREA = "plugins/native/delta/src/store";
const AREA_REASON = "The store owns the tables it creates; the rest of the plugin goes through the store's functions.";
const AREAS = { [AREA]: { reason: AREA_REASON } };
const allowance = (shared: Record<string, unknown>, sameName: Record<string, unknown> = { workspaces: WORKSPACES_ENTRY }, areas: Record<string, unknown> = AREAS) =>
  JSON.stringify({ note: "fixture", shared, same_name: sameName, areas }, null, 2) + "\n";

// The fixture: storage creates the shared journal; alpha owns alpha_items and reads the journal (it is the one listed user);
// beta and gamma each create `workspaces` (two databases, one name, listed under same_name); the host owns its own table and
// touches nothing else. Delta is a plugin whose `src/store/` is an area (BL-802, the shape of Feed): the store creates and uses
// delta_items and delta_events, even from a nested folder, and the rest of the plugin owns delta_rules, which it creates itself.
before(() => {
  repo = mkdtempSync(path.join(tmpdir(), "molis-table-owner-gates-"));
  git("init", "-q", "-b", "main");
  put("tooling/gates/limits.json", JSON.stringify({ file: 800, classLines: 300, classMethods: 25, functionLines: 150, vendoredPrologueSdk: 2 }, null, 2) + "\n");
  put("tooling/gates/table-owners.json", allowance({ events: EVENTS_ENTRY }));
  for (const dir of ["packages/storage", "modules/alpha", "modules/beta", "plugins/native/gamma", "plugins/native/delta", "apps/local-host"]) put(`${dir}/package.json`, manifest(`@fx/${path.basename(dir)}`));
  put("packages/storage/src/journal.ts", lines(
    "export const JOURNAL_SQL = `CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, project_id TEXT NOT NULL);`;",
    'export const append = (db: Db, project: string) => db.prepare("INSERT INTO events (project_id) VALUES (?)").run(project);',
    "interface Db { prepare(sql: string): { run(...a: unknown[]): unknown } }"));
  put("modules/alpha/src/repository.ts", lines(
    "export const ALPHA_SQL = `CREATE TABLE IF NOT EXISTS alpha_items (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, body TEXT);`;",
    "export class AlphaRepository {",
    "  constructor(private readonly db: Db) {}",
    '  list() { return this.db.prepare("SELECT id FROM alpha_items ORDER BY id").all(); }',
    '  add(id: string) { this.db.prepare("INSERT INTO alpha_items (id) VALUES (?)").run(id); }',
    '  cursor() { return this.db.prepare("SELECT COALESCE(MAX(seq), 0) AS cursor FROM events WHERE project_id = ?").get("p"); }',
    "}",
    "interface Db { prepare(sql: string): { all(...a: unknown[]): unknown[]; get(...a: unknown[]): unknown; run(...a: unknown[]): unknown } }"));
  put("modules/alpha/src/deep/nested.ts", 'export const nested = (db: { prepare(s: string): { run(): void } }) => db.prepare("DELETE FROM alpha_items").run();\n');
  put("modules/beta/src/repository.ts", "export const BETA_SQL = `CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY); CREATE TABLE IF NOT EXISTS beta_things (id TEXT PRIMARY KEY);`;\n");
  put("plugins/native/gamma/src/store.ts", lines(
    "export const GAMMA_SQL = `CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, title TEXT); CREATE TABLE IF NOT EXISTS gamma_notes (id TEXT PRIMARY KEY);`;",
    'export const titles = (db: { prepare(s: string): { all(): unknown[] } }) => db.prepare("SELECT title FROM workspaces").all();'));
  put("plugins/native/delta/src/store/items.ts", lines(
    "export const ITEMS_SQL = `CREATE TABLE IF NOT EXISTS delta_items (id TEXT PRIMARY KEY); CREATE TABLE IF NOT EXISTS delta_events (seq INTEGER PRIMARY KEY);`;",
    'export const items = (db: { prepare(s: string): { all(): unknown[] } }) => db.prepare("SELECT id FROM delta_items").all();'));
  put("plugins/native/delta/src/store/rows/read.ts", 'export const rows = (db: { prepare(s: string): { all(): unknown[] } }) => db.prepare("SELECT seq FROM delta_events JOIN delta_items ON 1 = 1").all();\n');
  put("plugins/native/delta/src/out-rules.ts", lines(
    "export const RULES_SQL = `CREATE TABLE IF NOT EXISTS delta_rules (id TEXT PRIMARY KEY)`;",
    'export const rules = (db: { prepare(s: string): { all(): unknown[] } }) => db.prepare("SELECT id FROM delta_rules").all();'));
  put("plugins/native/delta/src/view.ts", 'import { items } from "./store/items.js";\nexport const view = items;\n');
  put("apps/local-host/src/host.ts", lines(
    "export const HOST_SQL = `CREATE TABLE IF NOT EXISTS host_settings (key TEXT PRIMARY KEY, value TEXT);`;",
    "type Db = { prepare(sql: string): { all(...a: unknown[]): unknown[]; get(...a: unknown[]): unknown } };",
    'export const settings = (db: Db) => db.prepare("SELECT key, value FROM host_settings").all();',
    // What the rule must leave alone: the system catalog, table functions, a sub-select, dynamic names.
    'export const catalog = (db: Db) => db.prepare("SELECT name FROM sqlite_master WHERE type = \'table\'").all();',
    'export const each = (db: Db) => db.prepare("SELECT value FROM json_each(?)").all("[]");',
    'export const nested = (db: Db) => db.prepare("SELECT n FROM (SELECT 1 AS n)").all();',
    "export const dynamic = (db: Db, table: string) => db.prepare(`SELECT * FROM ${table}`).all();"));
  commit("base");
});
after(() => { if (repo) rmSync(repo, { recursive: true, force: true }); });

const expectFailure = (name: string, mutate: () => void, patterns: RegExp[]) => test(name, () => {
  branch(name.replace(/\W+/g, "-").slice(0, 40), mutate);
  const run = gate("--base", "main");
  assert.equal(run.code, 1, run.out);
  for (const pattern of patterns) assert.match(run.out, pattern);
});
const expectPass = (name: string, mutate: () => void) => test(name, () => {
  branch(name.replace(/\W+/g, "-").slice(0, 40), mutate);
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
});

test("the clean base passes: own tables, a listed shared table, a name two packages create, the system catalog and dynamic names", () => {
  git("checkout", "-q", "-f", "main");
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
});

// ---- one package using another's table ----------------------------------------------------------------------------------
const hostFile = "apps/local-host/src/host.ts";
const reads = (sql: string) => append(hostFile, `export const more = (db: { prepare(s: string): { all(): unknown[] } }) => db.prepare(${JSON.stringify(sql)}).all();\n`);
expectFailure("a SELECT from another package's table", () => reads("SELECT id FROM alpha_items"),
  [/apps\/local-host\/src\/host\.ts:\d+ reads table "alpha_items", which modules\/alpha creates; go through that package's own API/]);
expectFailure("a JOIN to another package's table", () => reads("SELECT h.key FROM host_settings h JOIN alpha_items a ON a.id = h.key"),
  [/reads table "alpha_items", which modules\/alpha creates/]);
expectFailure("an INSERT into another package's table", () => reads("INSERT INTO alpha_items (id) VALUES ('x')"),
  [/writes table "alpha_items", which modules\/alpha creates/]);
expectFailure("an INSERT OR REPLACE into another package's table", () => reads("INSERT OR REPLACE INTO alpha_items (id) VALUES ('x')"), [/writes table "alpha_items"/]);
expectFailure("a REPLACE INTO another package's table", () => reads("REPLACE INTO alpha_items (id) VALUES ('x')"), [/writes table "alpha_items"/]);
expectFailure("an UPDATE of another package's table", () => reads("UPDATE alpha_items SET body = 'x'"), [/writes table "alpha_items"/]);
expectFailure("an UPDATE OR IGNORE of another package's table", () => reads("UPDATE OR IGNORE alpha_items SET body = 'x'"), [/writes table "alpha_items"/]);
expectFailure("a DELETE from another package's table is a write, not a read", () => reads("DELETE FROM alpha_items"), [/writes table "alpha_items"/]);
expectFailure("an ALTER TABLE on another package's table", () => reads("ALTER TABLE alpha_items ADD COLUMN note TEXT"), [/writes table "alpha_items"/]);
expectFailure("a DROP TABLE of another package's table", () => reads("DROP TABLE IF EXISTS alpha_items"), [/writes table "alpha_items"/]);
expectFailure("a quoted table name", () => reads('SELECT id FROM "alpha_items"'), [/reads table "alpha_items"/]);
expectFailure("a table name in other letters", () => reads("SELECT id FROM Alpha_Items"), [/reads table "alpha_items"/]);
expectFailure("a template literal with the table on a later line", () => append(hostFile, "export const wide = `\n  SELECT id\n  FROM\n    alpha_items\n  WHERE id = ${1}`;\n"),
  [/reads table "alpha_items"/]);
expectFailure("the part of a template after an interpolation", () => append(hostFile, "export const tail = (c: string) => `SELECT ${c} AS c, (SELECT COUNT(*) FROM alpha_items) AS n`;\n"),
  [/reads table "alpha_items"/]);
expectFailure("two places in one file are one finding", () => { reads("SELECT id FROM alpha_items"); reads("SELECT body FROM alpha_items"); },
  [/reads table "alpha_items" \(2 places\)/]);
expectFailure("a plugin using a module's table, and a module using a plugin's", () => {
  put("plugins/native/gamma/src/peek.ts", 'export const peek = (db: { prepare(s: string): { all(): unknown[] } }) => db.prepare("SELECT id FROM alpha_items").all();\n');
  put("modules/beta/src/peek.ts", 'export const peek = (db: { prepare(s: string): { all(): unknown[] } }) => db.prepare("SELECT id FROM gamma_notes").all();\n');
}, [/plugins\/native\/gamma\/src\/peek\.ts:\d+ reads table "alpha_items", which modules\/alpha creates/, /modules\/beta\/src\/peek\.ts:\d+ reads table "gamma_notes", which plugins\/native\/gamma creates/]);
expectFailure("a table two packages create is still not the host's", () => reads("SELECT id FROM workspaces"),
  [/reads table "workspaces", which modules\/beta and plugins\/native\/gamma creates/]);
expectFailure("a package in a folder with its own package.json is its own owner", () => {
  put("modules/alpha/tools/package.json", manifest("@fx/alpha-tools"));
  put("modules/alpha/tools/src/peek.ts", 'export const peek = (db: { prepare(s: string): { all(): unknown[] } }) => db.prepare("SELECT id FROM alpha_items").all();\n');
}, [/modules\/alpha\/tools\/src\/peek\.ts:\d+ reads table "alpha_items", which modules\/alpha creates/]);
expectFailure("the rule needs no baseline: rewriting baseline.json does not help", () => {
  reads("SELECT id FROM alpha_items");
  put("tooling/gates/baseline.json", "{}\n");
}, [/reads table "alpha_items"/]);

// ---- what is not a finding ----------------------------------------------------------------------------------------------
expectPass("comments, prose, lower-case words, tests, fixtures, build output and declarations are not SQL", () => {
  append(hostFile, lines(
    "// SELECT * FROM alpha_items would be wrong here.",
    "/* INSERT INTO alpha_items (id) VALUES ('x') */",
    'export const prose = "Save a copy from alpha_items or update alpha_items by hand";',
    'export const label = "Items from Alpha_Items";'));
  put("tests/alpha.test.ts", 'export const read = "SELECT id FROM alpha_items";\n');
  put("apps/local-host/tests/alpha.ts", 'export const read = "SELECT id FROM alpha_items";\n');
  put("apps/local-host/src/fixtures/alpha.ts", 'export const read = "SELECT id FROM alpha_items";\n');
  put("apps/local-host/dist/alpha.js", 'export const read = "SELECT id FROM alpha_items";\n');
  put("apps/local-host/src/alpha.test.ts", 'export const read = "SELECT id FROM alpha_items";\n');
  put("apps/local-host/src/alpha.d.ts", 'export declare const read = "SELECT id FROM alpha_items";\n');
  put("apps/local-host/scripts/alpha.mjs", 'export const read = "SELECT id FROM alpha_items";\n');
});
expectPass("a package's own files and nested folders may use its tables, and a co-owner of a name may use it", () => {
  put("modules/alpha/src/more/again.ts", 'export const again = (db: { prepare(s: string): { all(): unknown[] } }) => db.prepare("SELECT id FROM alpha_items JOIN alpha_items b ON b.id = alpha_items.id").all();\n');
  put("modules/beta/src/own.ts", 'export const own = (db: { prepare(s: string): { all(): unknown[] } }) => db.prepare("SELECT id FROM workspaces").all();\n');
});
expectFailure("creating a table another package creates does not make the host its co-owner", () => {
  put("apps/local-host/src/own-alpha.ts", lines(
    "export const COPY_SQL = `CREATE TABLE IF NOT EXISTS alpha_items (id TEXT PRIMARY KEY)`;",
    'export const q = "SELECT id FROM alpha_items";'));
}, [/table "alpha_items" is created by apps\/local-host and modules\/alpha: one table, one creating package\. .*list the table under "same_name" in tooling\/gates\/table-owners\.json/]);
expectFailure("a duplicate CREATE of a shared journal table is a second creator too", () => {
  put("modules/beta/src/own-events.ts", 'export const COPY_SQL = `CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, project_id TEXT)`;\nexport const q = "SELECT seq FROM events";\n');
}, [/table "events" is created by modules\/beta and packages\/storage: one table, one creating package/]);
expectPass("a second creator listed under same_name with its reason is a decision made in the open", () => {
  put("apps/local-host/src/own-alpha.ts", "export const COPY_SQL = `CREATE TABLE IF NOT EXISTS alpha_items (id TEXT PRIMARY KEY)`;\nexport const q = \"SELECT id FROM alpha_items\";\n");
  put("tooling/gates/table-owners.json", allowance({ events: EVENTS_ENTRY }, {
    workspaces: WORKSPACES_ENTRY, alpha_items: { packages: ["apps/local-host", "modules/alpha"], reason: SAME_REASON } }));
});
expectPass("a change that removes the access passes", () => {
  put("modules/alpha/src/repository.ts", read("modules/alpha/src/repository.ts").replace(/  cursor\(\).*\n/, ""));
  put("tooling/gates/table-owners.json", allowance({}));
});

// ---- the shared tables --------------------------------------------------------------------------------------------------
expectFailure("a package that uses a shared table and is not listed", () => {
  put("modules/beta/src/log.ts", 'export const log = (db: { prepare(s: string): { run(): void } }) => db.prepare("INSERT INTO events (project_id) VALUES (\'p\')").run();\n');
}, [/modules\/beta\/src\/log\.ts:\d+ writes table "events", which packages\/storage creates;.*tooling\/gates\/table-owners\.json lists the packages that may use it, and modules\/beta is not one of them/]);
expectFailure("a missing allowance file leaves the shared table open to nobody", () => git("rm", "-q", "tooling/gates/table-owners.json"),
  [/modules\/alpha\/src\/repository\.ts:\d+ reads table "events", which packages\/storage creates/]);
expectPass("a new user added to the list with its reason is a decision made in the open", () => {
  put("modules/beta/src/log.ts", 'export const log = (db: { prepare(s: string): { run(): void } }) => db.prepare("INSERT INTO events (project_id) VALUES (\'p\')").run();\n');
  put("tooling/gates/table-owners.json", allowance({ events: { ...EVENTS_ENTRY, users: ["modules/alpha", "modules/beta"] } }));
});
expectFailure("a listed package that no longer uses the table", () => put("tooling/gates/table-owners.json", allowance({ events: { ...EVENTS_ENTRY, users: ["modules/alpha", "modules/beta"] } })),
  [/table-owners\.json: events: modules\/beta no longer reads or writes this table; remove it from "users"/]);
expectFailure("an entry for a table nobody creates", () => put("tooling/gates/table-owners.json", allowance({ events: EVENTS_ENTRY, ghosts: { owner: "modules/alpha", users: ["modules/beta"], reason: REASON } })),
  [/table-owners\.json: ghosts: no package creates a table of this name; delete the entry/]);
expectFailure("an owner that is not the creator", () => put("tooling/gates/table-owners.json", allowance({ events: { ...EVENTS_ENTRY, owner: "modules/beta" } })),
  [/table-owners\.json: events: "owner" is modules\/beta, but the table is created by packages\/storage/]);
expectFailure("the creator listed as a user", () => put("tooling/gates/table-owners.json", allowance({ events: { ...EVENTS_ENTRY, users: ["modules/alpha", "packages/storage"] } })),
  [/table-owners\.json: events: packages\/storage creates the table and is not a "user" of it/]);
expectFailure("an entry with no reason, or one that says nothing", () => put("tooling/gates/table-owners.json", allowance({ events: { ...EVENTS_ENTRY, reason: " shared " } })),
  [/table-owners\.json: events: "reason" needs at least 20 characters that say why several packages share this table/]);
expectFailure("an entry with no users", () => put("tooling/gates/table-owners.json", allowance({ events: { ...EVENTS_ENTRY, users: [] } })),
  [/table-owners\.json: events: "users" must list the other package directories that use the table/]);
expectFailure("an entry with a field the gate does not know", () => put("tooling/gates/table-owners.json", allowance({ events: { ...EVENTS_ENTRY, until: "2027" } })),
  [/table-owners\.json: events: unknown field "until"/]);
expectFailure("an allowance file that is not JSON", () => put("tooling/gates/table-owners.json", "<<<<<<< ours\n"), [/table-owners\.json is not valid JSON/]);
expectFailure("an allowance file without a shared object", () => put("tooling/gates/table-owners.json", "{}\n"), [/table-owners\.json needs a "shared" object keyed by table name/]);

// ---- the same-name tables -----------------------------------------------------------------------------------------------
const sameName = (workspaces: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  put("tooling/gates/table-owners.json", allowance({ events: EVENTS_ENTRY }, { workspaces, ...extra }));
expectFailure("a name two packages create that nobody listed", () => put("tooling/gates/table-owners.json", allowance({ events: EVENTS_ENTRY }, {})),
  [/table "workspaces" is created by modules\/beta and plugins\/native\/gamma: one table, one creating package\. .*"same_name" in tooling\/gates\/table-owners\.json/]);
expectFailure("an allowance file with no same_name section lists nothing", () => put("tooling/gates/table-owners.json", JSON.stringify({ shared: { events: EVENTS_ENTRY } })),
  [/table "workspaces" is created by modules\/beta and plugins\/native\/gamma/]);
expectFailure("a third package that creates a listed name", () => {
  put("modules/alpha/src/workspaces.ts", "export const SQL = `CREATE TABLE IF NOT EXISTS workspaces (id TEXT)`;\n");
}, [/table-owners\.json: workspaces: modules\/alpha also creates this table and is not in "packages"; list it with the reason, or drop its CREATE/]);
expectFailure("a listed package that does not create the table", () => sameName({ ...WORKSPACES_ENTRY, packages: ["modules/beta", "plugins/native/gamma", "modules/alpha"] }),
  [/table-owners\.json: workspaces: modules\/alpha does not create this table; remove it from "packages"/]);
expectFailure("an entry that only one package creates now", () => {
  put("plugins/native/gamma/src/store.ts", read("plugins/native/gamma/src/store.ts").replace("CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, title TEXT); ", "").replace('FROM workspaces', 'FROM gamma_notes'));
}, [/table-owners\.json: workspaces: only modules\/beta creates this table now; delete the entry from "same_name"/]);
expectFailure("a same_name entry for a table nobody creates", () => sameName(WORKSPACES_ENTRY, { ghosts: { packages: ["modules/alpha", "modules/beta"], reason: SAME_REASON } }),
  [/table-owners\.json: ghosts: no package creates a table of this name; delete the entry from "same_name"/]);
expectFailure("a table listed as both shared and same-name", () => put("tooling/gates/table-owners.json", allowance(
  { events: EVENTS_ENTRY, workspaces: { owner: "modules/beta", users: ["apps/local-host"], reason: REASON } }, { workspaces: WORKSPACES_ENTRY })),
[/table-owners\.json: workspaces: listed under both "shared" and "same_name"/]);
expectFailure("a same_name entry with a reason that says nothing", () => sameName({ ...WORKSPACES_ENTRY, reason: " other db " }),
  [/table-owners\.json: workspaces: "reason" needs at least 20 characters that say why these packages each create a table of this name/]);
expectFailure("a same_name entry with one package, or the same package twice", () => sameName({ ...WORKSPACES_ENTRY, packages: ["modules/beta", "modules/beta"] }),
  [/table-owners\.json: workspaces: "packages" must list the package directories \(at least two, each once\)/]);
expectFailure("a same_name entry with a field the gate does not know", () => sameName({ ...WORKSPACES_ENTRY, until: "2027" }),
  [/table-owners\.json: workspaces: unknown field "until"/]);
expectFailure("a same_name section that is not an object", () => put("tooling/gates/table-owners.json", JSON.stringify({ shared: { events: EVENTS_ENTRY }, same_name: [] })),
  [/table-owners\.json needs a "same_name" object keyed by table name/]);
expectFailure("a section the gate does not know", () => put("tooling/gates/table-owners.json", JSON.stringify({ shared: { events: EVENTS_ENTRY }, same_name: { workspaces: WORKSPACES_ENTRY }, samename: {} })),
  [/table-owners\.json: unknown section "samename"/]);

// ---- the areas: a directory inside a package that owns its tables (BL-802) ---------------------------------------------------
const deltaReads = (file: string, sql: string) => put(`plugins/native/delta/src/${file}`, `export const q = (db: { prepare(s: string): { all(): unknown[] } }) => db.prepare(${JSON.stringify(sql)}).all();\n`);
expectFailure("RAC-1701 a table the store creates later is the store's, with no list to update: the rest of the plugin reading it fails", () => {
  append("plugins/native/delta/src/store/items.ts", "export const LATER_SQL = `CREATE TABLE IF NOT EXISTS delta_later (id TEXT PRIMARY KEY)`;\n");
  deltaReads("later.ts", "SELECT id FROM delta_later");
}, [/plugins\/native\/delta\/src\/later\.ts:1 reads table "delta_later", which plugins\/native\/delta\/src\/store creates; go through that package's own API/]);
// Every way of naming a table that BL-802 found the old Feed rule missing, each in its own file outside the store, all red at once.
const FORMS: Record<string, string> = {
  join: "SELECT r.id FROM delta_rules r JOIN delta_items i ON i.id = r.id",
  "double-quoted": 'SELECT id FROM "delta_items"',
  backticked: "SELECT id FROM `delta_items`",
  bracketed: "SELECT id FROM [delta_items]",
  "main-schema": "SELECT id FROM main.delta_items",
  "temp-schema": "SELECT id FROM temp.delta_items",
  "quoted-schema": 'SELECT id FROM "main"."delta_items"',
  "upper-schema": "SELECT id FROM MAIN.delta_items",
  alter: "ALTER TABLE delta_items ADD COLUMN note TEXT",
  drop: "DROP TABLE delta_items",
  "drop-if-exists": "DROP TABLE IF EXISTS delta_events",
  replace: "REPLACE INTO delta_items (id) VALUES ('x')",
  "insert-or-replace": "INSERT OR REPLACE INTO delta_items (id) VALUES ('x')",
  "update-or-ignore": "UPDATE OR IGNORE delta_items SET id = 'x'",
};
expectFailure("RAC-1702 outside the store, every form of naming the store's table fails: JOIN, quotes, the main and temp schema, ALTER, DROP, REPLACE and the OR forms", () => {
  for (const [name, sql] of Object.entries(FORMS)) deltaReads(`forms/${name}.ts`, sql);
}, Object.entries(FORMS).map(([name, sql]) => new RegExp(String.raw`plugins/native/delta/src/forms/${name}\.ts:1 ${/^(SELECT)/.test(sql) ? "reads" : "writes"} table "delta_(?:items|events)", which plugins/native/delta/src/store creates`)));
expectPass("RAC-1703 not a finding: the store's own SQL, the plugin's own table outside the store, comments, JSDoc and lower-case English", () => {
  append("plugins/native/delta/src/store/rows/read.ts", 'export const more = "DELETE FROM delta_items WHERE id = ?";\n');
  append("plugins/native/delta/src/out-rules.ts", 'export const clear = "DELETE FROM delta_rules";\n');
  put("plugins/native/delta/src/notes.ts", lines(
    "// read from delta_items rows through the store: SELECT id FROM delta_items",
    "/** Never `UPDATE delta_items` here; the store does it. */",
    'export const label = "updates from delta_items";'));
});
expectFailure("RAC-1704 outside the store, a second CREATE of the store's table is a second creator", () => {
  put("plugins/native/delta/src/copy.ts", "export const COPY_SQL = `CREATE TABLE delta_items (id TEXT PRIMARY KEY)`;\n");
}, [/table "delta_items" is created by plugins\/native\/delta and plugins\/native\/delta\/src\/store: one table, one creating package/]);
expectFailure("RAC-1705 between packages, a table named with its schema is still that table: main., temp. and the quoted schema", () => {
  reads("SELECT id FROM main.alpha_items");
  put("modules/beta/src/temp.ts", 'export const q = "UPDATE temp.alpha_items SET body = 1";\n');
  put("modules/beta/src/quoted.ts", 'export const q = "SELECT id FROM \\"main\\".\\"alpha_items\\"";\n');
}, [/apps\/local-host\/src\/host\.ts:\d+ reads table "alpha_items", which modules\/alpha creates/, /modules\/beta\/src\/temp\.ts:1 writes table "alpha_items"/,
  /modules\/beta\/src\/quoted\.ts:1 reads table "alpha_items"/]);
expectFailure("RAC-1705 a CREATE with the schema creates the table, so a second package creating it is a second creator", () => {
  put("modules/beta/src/own-alpha.ts", "export const SQL = `CREATE TABLE IF NOT EXISTS main.alpha_items (id TEXT)`;\n");
}, [/table "alpha_items" is created by modules\/alpha and modules\/beta: one table, one creating package/]);
const areas = (entries: Record<string, unknown>) => put("tooling/gates/table-owners.json", allowance({ events: EVENTS_ENTRY }, { workspaces: WORKSPACES_ENTRY }, entries));
expectFailure("RAC-1706 an area that does not exist", () => areas({ ...AREAS, "plugins/native/delta/src/gone": { reason: AREA_REASON } }),
  [/table-owners\.json: areas: plugins\/native\/delta\/src\/gone: no such directory; delete the entry/]);
expectFailure("RAC-1706 an area that no longer creates a table: its directory has files and no CREATE", () => {
  put("plugins/native/delta/src/ui/panel.ts", "export const panel = 1;\n");
  areas({ ...AREAS, "plugins/native/delta/src/ui": { reason: AREA_REASON } });
}, [/table-owners\.json: areas: plugins\/native\/delta\/src\/ui: no table is created in this directory any more; delete the entry/]);
expectFailure("RAC-1706 an area with a reason that says nothing", () => areas({ [AREA]: { reason: " the store " } }),
  [/table-owners\.json: areas: plugins\/native\/delta\/src\/store: "reason" needs at least 20 characters that say why this directory owns its tables/]);
expectFailure("RAC-1706 an area that is a package already, or sits inside another area", () => areas({ ...AREAS, "plugins/native/delta": { reason: AREA_REASON },
  "plugins/native/delta/src/store/rows": { reason: AREA_REASON } }),
[/areas: plugins\/native\/delta: the directory holds a package\.json, so it owns its tables already/, /areas: plugins\/native\/delta\/src\/store\/rows: inside the area plugins\/native\/delta\/src\/store; one area per owner/]);
expectFailure("RAC-1706 an area key that is not a plain directory, and a field the gate does not know", () => areas({
  "./plugins/native/delta/src/store": { reason: AREA_REASON }, "plugins/native/delta/src/store/": { reason: AREA_REASON }, [AREA]: { reason: AREA_REASON, until: "2027" } }),
[/areas: \.\/plugins\/native\/delta\/src\/store: the key must be a directory relative to the repository root/, /areas: plugins\/native\/delta\/src\/store\/: the key must be a directory/,
  /areas: plugins\/native\/delta\/src\/store: unknown field "until"/]);
expectFailure("RAC-1706 an areas section that is not an object", () => put("tooling/gates/table-owners.json", JSON.stringify({ shared: { events: EVENTS_ENTRY }, same_name: { workspaces: WORKSPACES_ENTRY }, areas: [] })),
  [/table-owners\.json needs an "areas" object keyed by directory/]);
expectPass("RAC-1706 without the area the store and the rest of the plugin are one owner again, so the same SQL passes: the area is what draws the line", () => {
  areas({});
  deltaReads("later.ts", "SELECT id FROM delta_items");
});

// ---- definitions on in-memory snapshots -------------------------------------------------------------------------------------
const isSource = (file: string) => /^(apps|horizontal|modules|packages|plugins|server|tooling)\//.test(file) && /\.(ts|mts)$/.test(file) && !file.endsWith(".d.ts")
  && !/(^|\/)(tests?|dist|node_modules|fixtures)\//.test(file) && !/\.test\.(ts|mts)$/.test(file);
const snapshot = (files: Record<string, string>) => ({ files: Object.keys(files), read: (file: string) => files[file] ?? null });
const worldFiles = (extra: Record<string, string>): Record<string, string> => ({
  "modules/a/package.json": "{}", "modules/b/package.json": "{}", "apps/h/package.json": "{}",
  "modules/a/src/s.ts": "export const SQL = `CREATE TABLE IF NOT EXISTS a_items (id TEXT)`;",
  ...extra,
});
const world = (extra: Record<string, string>) => snapshot(worldFiles(extra));

test("definition: the packages that create a table are its owners, and a virtual table is a table", () => {
  const { owners } = scanTables(world({ "modules/b/src/s.ts": "export const SQL = `CREATE VIRTUAL TABLE b_search USING fts5(body); CREATE TABLE a_items (x)`;" }), isSource);
  assert.deepEqual([...owners.get("a_items")].sort(), ["modules/a", "modules/b"]);
  assert.deepEqual([...owners.get("b_search")], ["modules/b"]);
});
test("definition: every access by a non-owner is listed with its package, line and whether it writes", () => {
  const { accesses } = scanTables(world({ "apps/h/src/x.ts": 'const a = 1;\nexport const q = "SELECT * FROM a_items";\nexport const w = "UPDATE a_items SET id = 1";' }), isSource);
  assert.deepEqual(accesses.map((access: { file: string; line: number; package: string; table: string; writes: boolean }) => [access.file, access.line, access.package, access.table, access.writes]),
    [["apps/h/src/x.ts", 2, "apps/h", "a_items", false], ["apps/h/src/x.ts", 3, "apps/h", "a_items", true]]);
});
test("definition: SQL keywords are read in upper case only, because lower case is English", () => {
  // A keyword in a comment keeps the file from being skipped as "no SQL in it", so only the case of the words decides.
  const { accesses } = scanTables(world({ "apps/h/src/x.ts": '// UPDATE\nexport const q = "select * from a_items; delete from a_items";' }), isSource);
  assert.deepEqual(accesses, []);
});
test("definition: a file in an area belongs to the area, the nearest of an area and a package.json wins, and with no areas the package owns all", () => {
  const files = { "plugins/p/package.json": "{}", "plugins/p/src/store/s.ts": "export const SQL = `CREATE TABLE p_items (x)`;",
    "plugins/p/src/view.ts": "export const q = 'SELECT * FROM p_items';", "plugins/p/src/store/tool/package.json": "{}",
    "plugins/p/src/store/tool/t.ts": "export const q = 'SELECT * FROM p_items';" };
  const isAny = (file: string) => file.endsWith(".ts");
  const { owners, accesses } = scanTables(snapshot(files), isAny, ["plugins/p/src/store"]);
  assert.deepEqual([...owners.get("p_items")], ["plugins/p/src/store"]);
  assert.deepEqual(accesses.map((access: { file: string; package: string }) => [access.file, access.package]),
    [["plugins/p/src/view.ts", "plugins/p"], ["plugins/p/src/store/tool/t.ts", "plugins/p/src/store/tool"]]);
  assert.deepEqual(scanTables(snapshot(files), isAny).accesses.map((access: { file: string }) => access.file), ["plugins/p/src/store/tool/t.ts"]);
});
test("definition: a file with no package.json above it belongs to the repository root, which owns what it creates", () => {
  const files = { "tooling/x.ts": "export const SQL = `CREATE TABLE t (x)`; export const q = 'SELECT * FROM t';" };
  assert.deepEqual(tableOwnerProblems(snapshot(files), { isSource }), []);
  const other = snapshot({ ...files, "tooling/pkg/package.json": "{}", "tooling/pkg/y.ts": "export const q = 'SELECT * FROM t';" });
  assert.match(tableOwnerProblems(other, { isSource }).join("\n"), /tooling\/pkg\/y\.ts:1 reads table "t", which \. creates/);
});
test("definition: a second creator is reported unless the table is listed under same_name with exactly the creators", () => {
  const files = { "modules/b/src/s.ts": "export const SQL = `CREATE TABLE IF NOT EXISTS a_items (x)`;" };
  const allow = (sameNameEntries: Record<string, unknown>) => ({ "tooling/gates/table-owners.json": JSON.stringify({ shared: {}, same_name: sameNameEntries }) });
  const listed = { a_items: { packages: ["modules/a", "modules/b"], reason: "Two tables in two databases with one name." } };
  assert.match(tableOwnerProblems(world(files), { isSource }).join("\n"), /table "a_items" is created by modules\/a and modules\/b/);
  assert.deepEqual(tableOwnerProblems(snapshot({ ...worldFiles(files), ...allow(listed) }), { isSource }), []);
  assert.match(tableOwnerProblems(snapshot({ ...worldFiles(files), ...allow({ a_items: { ...listed.a_items, packages: ["modules/a", "apps/h"] } }) }), { isSource }).join("\n"),
    /a_items: apps\/h does not create this table[^]*a_items: modules\/b also creates this table and is not in "packages"/);
});
test("the real repository's allowance names no journal table (PG-094 S9-1), no Goals table (S9-3), and the two names that are two databases", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const file = JSON.parse(readFileSync(path.join(root, "tooling/gates/table-owners.json"), "utf8")) as {
    shared: Record<string, { owner: string; users: string[]; reason: string }>; same_name: Record<string, { packages: string[]; reason: string }>;
    areas: Record<string, { reason: string }> };
  const ownedBy = (owner: string) => Object.entries(file.shared).filter(([, entry]) => entry.owner === owner);
  // The two journal tables are storage's and nobody else's statements name them: Goals and Governance reach them through the journal port.
  assert.deepEqual(ownedBy("packages/storage").map(([table]) => table).sort(), []);
  // Goals declares its tables in its Manifest (S8) and the plugin creates them. The SQL that reads and writes them lived in its two
  // Modules until S9-3 moved both into the plugin's package, so no Goals table is shared any more and nothing else may be shared on
  // that footing.
  assert.deepEqual(ownedBy("plugins/native/goals"), []);
  assert.deepEqual(Object.keys(file.shared), []);
  assert.deepEqual(Object.fromEntries(Object.entries(file.same_name).map(([table, entry]) => [table, [...entry.packages].sort()])),
    { jobs: ["plugins/native/alchemist", "plugins/native/images"], workspaces: ["modules/projects", "plugins/native/alchemist"] });
  // BL-802: Feed's store owns the Feed store's tables; the rest of the Feed package goes through its functions. One area today.
  assert.deepEqual(Object.keys(file.areas), ["plugins/native/feed/src/store"]);
});
