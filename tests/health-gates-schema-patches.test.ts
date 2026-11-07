import assert from "node:assert/strict";
import test from "node:test";
import { countSchemaPatches, measureSchemaPatches, schemaPatchesWantText } from "../scripts/gates/schema-patches.mjs";

// specs/upgrade-continuity/upgrade-chain-design.md §11.4: ALTER TABLE is left out of the count in one place only, the `upgrades` of a
// baseline constant. Each case says where the words stand and how many it should count. The scratch-repository form of these
// (the gate failing against a merge-base, and --update not hiding it) is in tests/health-gates-merge-base.test.ts.
const FILE = "packages/alpha/src/store.ts";
const count = (source: string, file = FILE): number => countSchemaPatches(file, source);
const STEP = 'sql: "ALTER TABLE t ADD COLUMN c TEXT"';
const inBaseline = (upgrades: string, type = ": SqliteBaseline") => `export const STORE${type} = { version: 2, schema: "CREATE TABLE t (a TEXT)", upgrades: ${upgrades} };\n`;

test("UPG1-i-patches-01: what the old regex counted still counts", () => {
  for (const [name, source] of [
    ["a string", 'export const sql = "ALTER TABLE t ADD COLUMN c TEXT";'],
    ["a template", "db.exec(`ALTER TABLE t ADD COLUMN c TEXT`);"],
    ["a template with a value", "db.exec(`ALTER TABLE ${name} ADD COLUMN c TEXT`);"],
    ["a comment", "// ALTER TABLE t ADD COLUMN c TEXT\nexport const a = 1;"],
    ["a block comment", "/* ALTER TABLE t */ export const a = 1;"],
    ["the helper", "ensureSqliteColumn(db, 't', 'c');"],
    ["the helper's definition", "function ensureSqliteColumn(db: Db) { return db; }"],
    ["a concatenation that holds the words", 'db.exec("ALTER TABLE " + name);'],
  ] as const) assert.equal(count(source), 1, name);
  assert.equal(count('db.exec("ALTER TABLE a"); db.exec("ALTER TABLE b"); ensureSqliteColumn(db);'), 3, "each place counts");
});

test("UPG1-i-patches-02: the sql and the run of a step in a baseline's upgrades do not count, in each way of declaring a baseline", () => {
  const steps = `[{ from: 1, ${STEP} }]`;
  assert.equal(count(inBaseline(steps)), 0, "annotated");
  assert.equal(count(inBaseline(steps, ": PluginDatabaseDeclaration")), 0, "a plugin declaration");
  assert.equal(count(inBaseline(steps, ": HomePluginDatabaseDeclaration")), 0, "a Home plugin declaration");
  assert.equal(count(`const STORE = { version: 2, schema: "", upgrades: ${steps} } satisfies SqliteBaseline;`), 0, "satisfies");
  assert.equal(count(`const STORE = { version: 2, schema: "", upgrades: ${steps} } as SqliteBaseline;`), 0, "as");
  assert.equal(count(`const STORE = ({ version: 2, schema: "", upgrades: ${steps} as const }) as const satisfies SqliteBaseline;`), 0, "wrapped");
  assert.equal(count(inBaseline("[{ from: 1, sql: `ALTER TABLE t ADD COLUMN c TEXT` }]")), 0, "a template");
  assert.equal(count(inBaseline("[{ from: 1, sql: `DROP TRIGGER x; ALTER TABLE t ADD COLUMN c TEXT; ${TRIGGERS}; ALTER TABLE t ADD COLUMN d TEXT` }]")), 0, "a template with the current trigger text in it");
  assert.equal(count(inBaseline('[{ from: 1, run: (db) => { db.exec("ALTER TABLE t ADD COLUMN c TEXT"); } }]')), 0, "a run function");
  assert.equal(count(inBaseline('[{ from: 1, run: function (db) { for (const n of names) db.exec(`ALTER TABLE ${n} ADD COLUMN c TEXT`); } }]')), 0, "a run function expression");
  assert.equal(count(`const NAME = 1;\n${inBaseline(`[{ from: 1, ${STEP} }, { from: 2, ${STEP} }]`)}`), 0, "two steps");
});

test("UPG1-i-patches-03: moved out of the upgrades of a baseline, the words count again", () => {
  const cases: ReadonlyArray<readonly [string, string, number]> = [
    ["a step constant outside the literal", `const S = { from: 1, ${STEP} };\n${inBaseline("[S]")}`, 1],
    ["a list constant outside the literal", `const LIST = [{ from: 1, ${STEP} }];\n${inBaseline("LIST")}`, 1],
    ["an sql constant outside the literal", `const SQL = "ALTER TABLE t ADD COLUMN c TEXT";\n${inBaseline("[{ from: 1, sql: SQL }]")}`, 1],
    ["a run function outside the literal", `const run = (db) => db.exec("ALTER TABLE t ADD COLUMN c TEXT");\n${inBaseline("[{ from: 1, run }]")}`, 1],
    ["the schema of the baseline", 'const STORE: SqliteBaseline = { version: 2, schema: "ALTER TABLE t ADD COLUMN c TEXT", upgrades: [] };', 1],
    ["an object with upgrades that is not a baseline", `export const NOTE = { upgrades: [{ from: 1, ${STEP} }] };`, 1],
    ["a baseline type under another name", `const STORE: SomethingElse = { upgrades: [{ from: 1, ${STEP} }] };`, 1],
    ["an untyped constant", `const STORE = { upgrades: [{ from: 1, ${STEP} }] };`, 1],
    ["a property called something else", `const STORE: SqliteBaseline = { version: 2, schema: "", steps: [{ from: 1, ${STEP} }] };`, 1],
    ["a nested upgrades, not the baseline's own", `const STORE: SqliteBaseline = { version: 2, schema: "", extra: { upgrades: [{ from: 1, ${STEP} }] } };`, 1],
    ["a let", `let STORE: SqliteBaseline = { version: 2, schema: "", upgrades: [{ from: 1, ${STEP} }] };`, 1],
    ["an assignment, not a declaration", `STORE.upgrades = [{ from: 1, ${STEP} }];`, 1],
    ["a function that reads upgrades", `function open(db) { const upgrades = [{ from: 1, ${STEP} }]; db.exec(upgrades[0].sql); }`, 1],
  ];
  for (const [name, source, expected] of cases) assert.equal(count(source), expected, name);
});

test("UPG1-i-patches-04: inside the literal, only the sql and the run are left out", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["a verify function", inBaseline('[{ from: 1, verify: (db) => db.exec("ALTER TABLE t ADD COLUMN c TEXT") }]')],
    ["another property of the step", inBaseline('[{ from: 1, note: "ALTER TABLE t ADD COLUMN c TEXT" }]')],
    ["a comment in the step", inBaseline('[{ from: 1 /* ALTER TABLE t */ }]')],
    ["a comment in a run", inBaseline("[{ from: 1, run: (db) => { /* ALTER TABLE t */ db.exec(q); } }]")],
    ["a call run when the module loads", inBaseline('[(db.exec("ALTER TABLE t ADD COLUMN c TEXT"), { from: 1 })]')],
    ["a call in the sql, run when the module loads", inBaseline('[{ from: 1, sql: run("ALTER TABLE t ADD COLUMN c TEXT") }]')],
    ["a call inside a template of the sql", inBaseline('[{ from: 1, sql: `SELECT ${run("ALTER TABLE t ADD COLUMN c TEXT")}` }]')],
    ["a concatenation in the sql", inBaseline('[{ from: 1, sql: "ALTER TABLE t" + " ADD COLUMN c TEXT" }]')],
    ["a helper for the run, called when the module loads", inBaseline('[{ from: 1, run: make("ALTER TABLE t ADD COLUMN c TEXT") }]')],
    ["the list built by a call", inBaseline(`build([{ from: 1, ${STEP} }])`)],
    ["a spread", inBaseline(`[...[{ from: 1, ${STEP} }]]`)],
    ["the helper, in a run", inBaseline("[{ from: 1, run: (db) => ensureSqliteColumn(db) }]")],
  ];
  for (const [name, source] of cases) assert.equal(count(source), 1, name);
});

test("UPG1-i-patches-05: a step in a baseline does not excuse the same words beside it", () => {
  const beside = `${inBaseline(`[{ from: 1, ${STEP} }]`)}export function open(db) { db.exec("ALTER TABLE t ADD COLUMN c TEXT"); }\n`;
  assert.equal(count(beside), 1);
});

test("UPG1-i-patches-06: moving the words does not get past the count", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["a plus", 'db.exec("ALTER " + "TABLE t ADD COLUMN c TEXT");'],
    ["a plus inside the verb", 'db.exec("ALTER TA" + "BLE t ADD COLUMN c TEXT");'],
    ["a plus around a value", 'db.exec("ALTER " + name + " TABLE t");'],
    ["parentheses", 'db.exec(("ALTER ") + ("TABLE t"));'],
    ["a template with the verb and the noun apart", "db.exec(`ALTER ${noun} TABLE t`);"],
    ["a template with a literal in it", 'db.exec(`ALTER ${"TABLE"} t`);'],
    ["an array join", 'db.exec(["ALTER", "TABLE", "t"].join(" "));'],
    ["a string that ends on the verb", 'const VERB = "ALTER"; db.exec(`${VERB} ${noun}`);'],
    ["two lines", 'db.exec("ALTER\\n TABLE t");\ndb.exec(`SELECT 1`);'],
    ["the words on two lines of a template", "db.exec(`ALTER\n  TABLE t ADD COLUMN c TEXT`);"],
    ["lower case", 'db.exec("alter table t add column c text");'],
    ["mixed case", 'db.exec("Alter Table t");'],
    ["extra spaces", 'db.exec("ALTER   TABLE t");'],
    ["in a call inside a plus", 'db.exec("SELECT " + run("ALTER " + "TABLE t"));'],
  ];
  for (const [name, source] of cases) assert.equal(count(source), 1, name);
  assert.equal(count("ALTER TABLE t ADD COLUMN c TEXT;\nalter table t add column d text;\n", "packages/alpha/src/patch.sql"), 2, "a .sql file");
});

test("UPG1-i-patches-07: ordinary text is not a patch", () => {
  for (const source of [
    'export const a = "CREATE TABLE t (a TEXT)";',
    'export const b = "DROP TABLE t";',
    'export const c = "alternate table";',
    'export const d = "Walter";',
    'export const e = "an alter";',
    "export const f = `alter ${x}`;",
    'export const g = "ALTER INDEX i";',
    "// ALTER is a word\nexport const h = 1;",
  ]) assert.equal(count(source), 0, source);
});

test("UPG1-i-patches-09: the words cut apart still count unless both are cut, which is the gap the README lists", () => {
  assert.equal(countSchemaPatches("packages/alpha/src/a.ts", 'export const a = "ALT" + "ER TABLE t";'), 1);
  assert.equal(countSchemaPatches("packages/alpha/src/a.ts", 'export const a = "ALTER TA" + "BLE t";'), 1);
  assert.equal(countSchemaPatches("packages/alpha/src/a.ts", 'export const a = "ALT" + "ER TA" + "BLE t";'), 0);
});

test("UPG1-i-patches-08: it reads the source files and the .sql files of the source areas, nothing else, and D1 migrations are not Home libraries", () => {
  assert.equal(schemaPatchesWantText("packages/alpha/src/a.ts"), true);
  assert.equal(schemaPatchesWantText("packages/alpha/src/a.sql"), true);
  assert.equal(schemaPatchesWantText("server/migrations/sync/0001_sync.sql"), false);
  assert.equal(schemaPatchesWantText("server/src/a.sql"), true);
  assert.equal(schemaPatchesWantText("tests/fixtures/goals-home-v1.sql"), false);
  assert.equal(schemaPatchesWantText("apps/sync-worker/fixtures/baseline-v4.sql"), false);
  assert.equal(schemaPatchesWantText("packages/alpha/tests/a.sql"), false);
  assert.equal(schemaPatchesWantText("docs/a.sql"), false);
  const files: Record<string, string> = {
    "packages/alpha/src/a.ts": 'export const a = "ALTER TABLE t";',
    "packages/alpha/src/b.sql": "ALTER TABLE t;",
    "packages/alpha/src/c.ts": inBaseline(`[{ from: 1, ${STEP} }]`),
    "tests/d.test.ts": 'db.exec("ALTER TABLE t");',
    "docs/e.md": "ALTER TABLE t",
  };
  assert.equal(measureSchemaPatches({ files: Object.keys(files), read: (file: string) => files[file] }), 2);
});
