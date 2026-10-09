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
const allowance = (shared: Record<string, unknown>) => JSON.stringify({ note: "fixture", shared }, null, 2) + "\n";
const REASON = "Several packages append to this log inside their own transaction, so a journal API could not join them.";
const EVENTS_ENTRY = { owner: "packages/storage", users: ["modules/alpha"], reason: REASON };

// The fixture: storage creates the shared journal; alpha owns alpha_items and reads the journal (it is the one listed user);
// beta and gamma each create `workspaces` (two databases, one name); the host owns its own table and touches nothing else.
before(() => {
  repo = mkdtempSync(path.join(tmpdir(), "molis-table-owner-gates-"));
  git("init", "-q", "-b", "main");
  put("tooling/gates/limits.json", JSON.stringify({ file: 800, classLines: 300, classMethods: 25, functionLines: 150, vendoredPrologueSdk: 2 }, null, 2) + "\n");
  put("tooling/gates/table-owners.json", allowance({ events: EVENTS_ENTRY }));
  for (const dir of ["packages/storage", "modules/alpha", "modules/beta", "plugins/native/gamma", "apps/local-host"]) put(`${dir}/package.json`, manifest(`@fx/${path.basename(dir)}`));
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
expectPass("a table another package creates, once the user creates it too, is its own", () => {
  put("apps/local-host/src/own-alpha.ts", lines(
    "export const COPY_SQL = `CREATE TABLE IF NOT EXISTS alpha_items (id TEXT PRIMARY KEY)`;",
    'export const q = "SELECT id FROM alpha_items";'));
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

// ---- definitions on in-memory snapshots -------------------------------------------------------------------------------------
const isSource = (file: string) => /^(apps|horizontal|modules|packages|plugins|server|tooling)\//.test(file) && /\.(ts|mts)$/.test(file) && !file.endsWith(".d.ts")
  && !/(^|\/)(tests?|dist|node_modules|fixtures)\//.test(file) && !/\.test\.(ts|mts)$/.test(file);
const snapshot = (files: Record<string, string>) => ({ files: Object.keys(files), read: (file: string) => files[file] ?? null });
const world = (extra: Record<string, string>) => snapshot({
  "modules/a/package.json": "{}", "modules/b/package.json": "{}", "apps/h/package.json": "{}",
  "modules/a/src/s.ts": "export const SQL = `CREATE TABLE IF NOT EXISTS a_items (id TEXT)`;",
  ...extra,
});

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
test("definition: a file with no package.json above it belongs to the repository root, which owns what it creates", () => {
  const files = { "tooling/x.ts": "export const SQL = `CREATE TABLE t (x)`; export const q = 'SELECT * FROM t';" };
  assert.deepEqual(tableOwnerProblems(snapshot(files), { isSource }), []);
  const other = snapshot({ ...files, "tooling/pkg/package.json": "{}", "tooling/pkg/y.ts": "export const q = 'SELECT * FROM t';" });
  assert.match(tableOwnerProblems(other, { isSource }).join("\n"), /tooling\/pkg\/y\.ts:1 reads table "t", which \. creates/);
});
test("the real repository's allowance names exactly the two journal tables that storage creates", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const file = JSON.parse(readFileSync(path.join(root, "tooling/gates/table-owners.json"), "utf8")) as { shared: Record<string, { owner: string; users: string[]; reason: string }> };
  assert.deepEqual(Object.keys(file.shared).sort(), ["events", "idempotency_records"]);
  for (const entry of Object.values(file.shared)) assert.equal(entry.owner, "packages/storage");
});
