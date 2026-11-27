import assert from "node:assert/strict";
import test from "node:test";
import { countSchemaExecs, countSchemaPatches, measureSchemaExecs, measureSchemaPatches, schemaExecsWantText, schemaPatchesWantText } from "../scripts/gates/schema-patches.mjs";

// Pre-development schema-patches gate: every ALTER TABLE and ensureSqliteColumn( in source counts, with no upgrades exemption.
// The scratch-repository form of these (the gate failing against a merge-base, and --update not hiding it) is in
// tests/health-gates-merge-base.test.ts.
const FILE = "packages/alpha/src/store.ts";
const count = (source: string, file = FILE): number => countSchemaPatches(file, source);
const STEP = 'sql: "ALTER TABLE t ADD COLUMN c TEXT"';
const inBaseline = (upgrades: string, type = ": SqliteBaseline") => `export const STORE${type} = { version: 2, schema: "CREATE TABLE t (a TEXT)", upgrades: ${upgrades} };\n`;

test("UPG1-i-patches-01: ALTER TABLE and ensureSqliteColumn count everywhere in source", () => {
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

test("pre-dev schema-patches: ALTER TABLE inside a baseline's upgrades is NOT exempted", () => {
  const steps = `[{ from: 1, ${STEP} }]`;
  for (const [name, source, expected] of [
    ["annotated SqliteBaseline", inBaseline(steps), 1],
    ["PluginDatabaseDeclaration", inBaseline(steps, ": PluginDatabaseDeclaration"), 1],
    ["HomePluginDatabaseDeclaration", inBaseline(steps, ": HomePluginDatabaseDeclaration"), 1],
    ["satisfies", `const STORE = { version: 2, schema: "", upgrades: ${steps} } satisfies SqliteBaseline;`, 1],
    ["as", `const STORE = { version: 2, schema: "", upgrades: ${steps} } as SqliteBaseline;`, 1],
    ["template sql", inBaseline("[{ from: 1, sql: `ALTER TABLE t ADD COLUMN c TEXT` }]"), 1],
    ["run function", inBaseline('[{ from: 1, run: (db) => { db.exec("ALTER TABLE t ADD COLUMN c TEXT"); } }]'), 1],
    ["two steps", inBaseline(`[{ from: 1, ${STEP} }, { from: 2, ${STEP} }]`), 2],
    ["the helper in a run", inBaseline("[{ from: 1, run: (db) => ensureSqliteColumn(db) }]"), 1],
  ] as const) {
    assert.equal(count(source), expected, name);
  }
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
  assert.equal(schemaPatchesWantText("tests/fixtures/sample.sql"), false);
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
  assert.equal(measureSchemaPatches({ files: Object.keys(files), read: (file: string) => files[file] }), 3);
});

test("VG-32 a schema constant handed to exec counts once per call, however it is spelled", () => {
  const counted: Array<[string, string, number]> = [
    ["the plain call", "db.exec(ALPHA_SCHEMA_SQL);", 1],
    ["a field holding the connection", "this.db.exec(ALPHA_SCHEMA_SQL);", 1],
    ["a name ending on SCHEMA", "db.exec(BINDING_METADATA_SCHEMA);", 1],
    ["the bare word", "db.exec(SCHEMA);", 1],
    ["a constant on another object", "db.exec(tables.ALPHA_SCHEMA_SQL);", 1],
    ["a cast", "db.exec(ALPHA_SCHEMA_SQL as string);", 1],
    ["a template", "db.exec(`${ALPHA_SCHEMA_SQL}\\nCREATE TABLE b (id TEXT);`);", 1],
    ["joined to more text", 'db.exec(ALPHA_SCHEMA_SQL + "CREATE TABLE b (id TEXT);");', 1],
    ["space and a line break", "db.exec(\n  ALPHA_SCHEMA_SQL\n);", 1],
    ["two calls", "db.exec(ALPHA_SCHEMA_SQL); db.exec(BETA_SCHEMA_SQL);", 2],
    ["nothing to do with a schema", 'db.exec("CREATE TABLE a (id TEXT)"); db.exec(sql);', 0],
    ["the text declared, not run", 'export const ALPHA_SCHEMA_SQL = "CREATE TABLE a (id TEXT)";', 0],
    ["SCHEMA inside a longer word", "db.exec(SCHEMATIC); db.exec(MY_SCHEMAS);", 0],
    ["a comment", "// db.exec(ALPHA_SCHEMA_SQL);\nexport const a = 1;", 0],
    ["another method", "db.prepare(ALPHA_SCHEMA_SQL);", 0],
  ];
  for (const [name, source, expected] of counted) assert.equal(countSchemaExecs(FILE, source), expected, name);
});

test("VG-33 schema text run by hand is counted per file, in every code file under the source roots, a package's own tests too", () => {
  assert.equal(schemaExecsWantText("plugins/native/schedule/tests/replication.test.ts"), true);
  assert.equal(schemaExecsWantText("packages/alpha/src/store.tsx"), true);
  assert.equal(schemaExecsWantText("tests/fixture.test.ts"), false, "the top-level tests build in-memory fixtures");
  assert.equal(schemaExecsWantText("docs/a.ts"), false);
  const files: Record<string, string> = {
    "packages/alpha/src/a.ts": "db.exec(ALPHA_SCHEMA_SQL); db.exec(BETA_SCHEMA_SQL);",
    "plugins/native/x/tests/b.test.ts": "db.exec(X_SCHEMA_SQL);",
    "packages/alpha/src/clean.ts": "export const ALPHA_SCHEMA_SQL = 'CREATE TABLE a (id TEXT)';",
    "tests/c.test.ts": "db.exec(ALPHA_SCHEMA_SQL);",
  };
  assert.deepEqual(measureSchemaExecs({ files: Object.keys(files), read: (file: string) => files[file] }), { "packages/alpha/src/a.ts": 2, "plugins/native/x/tests/b.test.ts": 1 });
});
