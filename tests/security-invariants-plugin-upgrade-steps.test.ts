// S-upgrade-plugin-steps-scope (docs/system/security-invariants/; the design's provisional S-147, S-46 carried to a plugin's upgrade
// steps; specs/upgrade-continuity/upgrade-chain-design.md §2.4, §10): a plugin's steps reach
// only that plugin's own tables, by the same checks for a plugin of the Host's own build and an installed one, and an installed plugin
// may not declare steps at all until U4. Every refusal here is asserted by its result only: the code, and a library left exactly as
// it was, the platform's tables, every other plugin's and the plugin's own. The libraries are temporary files.
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { after, type TestContext } from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseDeclaration, PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PLATFORM_PLUGIN_REGISTRATIONS, pluginSyncNamespace } from "@molis-ai/molis-work-app-local-host";
import {
  HOST_BUILD_TRUST, PLUGIN_PROJECT_DATABASES_SCHEMA_SQL, PluginRuntime, UNSIGNED_TRUST, assertPluginUpgradeStepsAdmitted, openPluginProjectDatabase, pluginUpgradeSteps,
  upgradePluginProjectTables, type PluginUpgradeInspector,
} from "@molis-ai/molis-work-plugin-runtime";
import { describeSqliteSchema, listSqliteObjects, LocalSqliteStorage, nativeSqliteOwnerBoundary, nativeSqliteSchemaBoundary } from "@molis-ai/molis-work-storage";
import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import {
  declaration, ledgerRow, libraryState, libraryTemplate, openCode, othersOf, probeManifest, projectLibrary, tracking, upgradeCode, type LibraryState,
} from "./fixtures/plugin-upgrade-library.js";

const OUT_OF_SCOPE = "plugin.project_database.upgrade_out_of_scope";
const template = libraryTemplate();

/** Another plugin beside the probe, with tables the probe's steps try to reach; one of them is named like the probe's with a U+00A0 after it. */
const NEIGHBOUR = probeManifest(declaration(1, `CREATE TABLE neighbour_items (id INTEGER PRIMARY KEY, note TEXT);
CREATE INDEX neighbour_items_note ON neighbour_items(note);
CREATE TABLE "probe_notes " (id INTEGER PRIMARY KEY, note TEXT);`, undefined, "neighbour"), { id: "io.molis.work.example.neighbour" });

/** The probe has tables named `main` and `if` too, the two names a reader of the first word alone gets wrong. */
const PROBE_SCHEMA = `CREATE TABLE probe_notes (id INTEGER PRIMARY KEY, note TEXT);
CREATE TABLE "main" (id INTEGER PRIMARY KEY, note TEXT);
CREATE TABLE "if" (id INTEGER PRIMARY KEY, note TEXT);`;
const PROBE_V1 = probeManifest(declaration(1, PROBE_SCHEMA), { sync: tracking("probe_notes") });
const PROBE_TABLES = ["probe_notes", "main", "if"];

const at2 = (sql: string, schema = PROBE_SCHEMA): PluginManifest =>
  probeManifest(declaration(2, schema, [{ from: 1, sql, reduces_rows: PROBE_TABLES }]), { sync: tracking("probe_notes") });

/** The probe and its neighbour in a project's library this build made, each table with a row. */
function library(t: TestContext) {
  const opened = projectLibrary(t, template, NEIGHBOUR, PROBE_V1);
  opened.db.exec(`INSERT INTO neighbour_items VALUES (1, 'neighbour'); INSERT INTO "probe_notes " VALUES (1, 'look-alike');
    INSERT INTO probe_notes VALUES (1, 'mine'); INSERT INTO "main" VALUES (1, 'main'); INSERT INTO "if" VALUES (1, 'if');`);
  return opened;
}

/** A step is refused before any of it runs: the scope error, nothing changed anywhere, and only the probe stops. */
function refused(t: TestContext, sql: string, schema?: string): void {
  const { db, file } = library(t), before = libraryState(db), v2 = at2(sql, schema);
  assert.equal(upgradeCode(db, v2), OUT_OF_SCOPE, sql);
  assert.deepEqual(libraryState(db), before, `${sql}: the library is as it was, the probe's own tables included`);
  assert.equal(openCode(db, file, v2), "plugin.project_database.version_mismatch", `${sql}: the probe stops`);
  assert.equal(openCode(db, file, NEIGHBOUR), "ok", `${sql}: its neighbour opens`);
}

test("S-upgrade-plugin-steps-scope: the platform's tables, another plugin's, and their rows: DROP TABLE, ALTER TABLE \"GOALS\", DELETE FROM, CREATE INDEX on them", t => {
  for (const sql of ["DROP TABLE plugin_project_databases", "DROP TABLE project_root", "DROP TABLE goals", "DROP TABLE neighbour_items",
    "ALTER TABLE \"GOALS\" ADD COLUMN probe TEXT", "DELETE FROM goals", "DELETE FROM neighbour_items", "UPDATE project_root SET project_id = project_id",
    "INSERT INTO probe_notes (note) SELECT note FROM neighbour_items", "CREATE INDEX probe_on_goals ON goals(project_id)",
    "CREATE UNIQUE INDEX neighbour_items_probe ON neighbour_items(id)", "DROP INDEX neighbour_items_note"]) refused(t, sql);
});

test("S-upgrade-plugin-steps-scope: what a step may never be: CREATE TABLE … AS SELECT, ATTACH, PRAGMA writable_schema, CREATE TRIGGER (on its own table too), CREATE VIEW, VACUUM", t => {
  for (const sql of ["CREATE TABLE probe_copy AS SELECT * FROM goals", "ATTACH DATABASE ':memory:' AS elsewhere", "PRAGMA writable_schema = ON",
    "CREATE TRIGGER probe_trigger AFTER INSERT ON probe_notes BEGIN DELETE FROM goals; END", "CREATE VIEW probe_view AS SELECT * FROM goals", "VACUUM",
    "REINDEX", "BEGIN", "COMMIT", "SAVEPOINT probe", "CREATE VIRTUAL TABLE probe_fts USING fts5(note)", "CREATE TEMP TABLE probe_temp (id INTEGER)"]) refused(t, sql);
});

test("S-upgrade-plugin-steps-scope: the four whose text comes back the same while the data does not: a column dropped and added again, a table renamed away and back, dropped and made again, the ledger made again", t => {
  refused(t, "ALTER TABLE neighbour_items DROP COLUMN note; ALTER TABLE neighbour_items ADD COLUMN note TEXT");
  refused(t, "ALTER TABLE neighbour_items RENAME TO probe_borrowed; ALTER TABLE probe_borrowed RENAME TO neighbour_items");
  refused(t, "DROP TABLE neighbour_items; CREATE TABLE neighbour_items (id INTEGER PRIMARY KEY, note TEXT); CREATE INDEX neighbour_items_note ON neighbour_items(note); INSERT INTO neighbour_items VALUES (1, 'neighbour')");
  refused(t, `DROP TABLE plugin_project_databases; ${PLUGIN_PROJECT_DATABASES_SCHEMA_SQL}`);
});

test("S-upgrade-plugin-steps-scope: the objects the platform keeps for the plugin: its own technical tables, altered or dropped, and a trigger on its own table", t => {
  const namespace = pluginSyncNamespace(PROBE_V1, "notes");
  for (const sql of [`ALTER TABLE ${namespace}_replica_changes ADD COLUMN probe TEXT`, `DROP TABLE ${namespace}_replica_outbox`, `DELETE FROM ${namespace}_replica_state`,
    `DROP TRIGGER ${namespace}_track_0_insert`, "CREATE TRIGGER probe_notes_more AFTER UPDATE ON probe_notes BEGIN SELECT 1; END"]) refused(t, sql);
});

test("S-upgrade-plugin-steps-scope: names read past the way a reader of words would: a comment in between, [other], `other`, another case, a U+00A0 after a name", t => {
  for (const sql of ["ALTER /*x*/ TABLE neighbour_items DROP COLUMN note", "ALTER TABLE /*x*/ neighbour_items DROP COLUMN note", "ALTER TABLE [neighbour_items] DROP COLUMN note",
    "ALTER TABLE `neighbour_items` DROP COLUMN note", "ALTER TABLE NEIGHBOUR_ITEMS DROP COLUMN note", "ALTER TABLE probe_notes  ADD COLUMN extra TEXT",
    "ALTER TABLE \"probe_notes \" ADD COLUMN extra TEXT", "DELETE FROM \"probe_notes \"", "ALTER TABLE neighbour_items--x\nDROP COLUMN note"]) refused(t, sql);
});

test("S-upgrade-plugin-steps-scope: the two a reader of the first word misses: main . other with a table of its own named main, DROP TABLE IF EXISTS with one named if", t => {
  refused(t, "ALTER TABLE main . neighbour_items DROP COLUMN note; ALTER TABLE main . neighbour_items ADD COLUMN note TEXT");
  refused(t, "ALTER TABLE main/*x*/.neighbour_items DROP COLUMN note");
  refused(t, "DROP TABLE IF EXISTS neighbour_items; CREATE TABLE IF NOT EXISTS neighbour_items (id INTEGER PRIMARY KEY, note TEXT)");
});

test("S-upgrade-plugin-steps-scope: the scope starts from what the library holds: a new declaration that names another plugin's table does not make it the plugin's", t => {
  refused(t, "DROP TABLE neighbour_items", `${PROBE_SCHEMA}\nCREATE TABLE neighbour_items (id INTEGER PRIMARY KEY, note TEXT);`);
});

test("S-upgrade-plugin-steps-scope: its own tables, on the other hand, a step may change, and the library opens with them", t => {
  const { db, file } = library(t);
  const others = othersOf(libraryState(db), [...PROBE_TABLES, ledgerRow(PROBE_V1.plugin_id)]);
  const v2 = at2("UPDATE probe_notes SET note = upper(note); DELETE FROM \"main\"; INSERT INTO \"if\" (note) VALUES ('more')");
  assert.equal(upgradeCode(db, v2), "ok");
  assert.equal(openCode(db, file, v2), "ok");
  assert.deepEqual(othersOf(libraryState(db), [...PROBE_TABLES, ledgerRow(PROBE_V1.plugin_id)]), others);
});

/**
 * The words around a name, the names a step may write, and the statements it may make of them: 13 × 27 × 12 = 4212 ways to write a step
 * (§2.4). Each one runs on a copy of the same small library twice: once as plain SQL, to see what it would do with nothing in its way, and
 * once as the plugin's step. Whatever the step is, nothing that is not the plugin's changes; whatever SQLite on its own would let reach
 * another's table, the step is refused for its scope. It does not pin how many go through: another SQLite may refuse a legal one.
 */
const SEPARATORS = [" ", "\t", "\n", "\r", "\f", "   ", "/*x*/", " /*x*/ ", "--x\n", " ", "\u000b", " ", "\n/* a\nb */\n"];
const NAMES = ["other", "OTHER", "Other", "\"other\"", "\"OTHER\"", "[other]", "`other`", "'other'", "main.other", "main{s}.{s}other", "\"main\".\"other\"", "main/*x*/.other",
  "mine ", "\"mine \"", "mine", "MINE", "\"mine\"", "[mine]", "`mine`", "main.mine", "\"main\"", "main", "\"if\"", "if", "plugin_project_databases", "project_root", "sqlite_master"];
const STATEMENTS = ["ALTER{s}TABLE{s}{n}{s}ADD{s}COLUMN{s}extra{s}TEXT", "ALTER{s}TABLE{s}{n}{s}DROP{s}COLUMN{s}note", "ALTER{s}TABLE{s}{n}{s}RENAME{s}TO{s}renamed",
  "ALTER{s}TABLE{s}{n}{s}RENAME{s}COLUMN{s}note{s}TO{s}note2", "DROP{s}TABLE{s}{n}", "CREATE{s}INDEX{s}probe_index{s}ON{s}{n}{s}(note)",
  "CREATE{s}UNIQUE{s}INDEX{s}probe_unique{s}ON{s}{n}{s}(id)", "CREATE{s}TABLE{s}{n}{s}(id{s}INTEGER)", "INSERT{s}INTO{s}{n}{s}(note){s}VALUES{s}('x')",
  "UPDATE{s}{n}{s}SET{s}note{s}={s}'x'", "DELETE{s}FROM{s}{n}", "INSERT{s}INTO{s}mine{s}(note){s}SELECT{s}note{s}FROM{s}{n}"];

const INSPECTOR: PluginUpgradeInspector = {
  scratch: () => new LocalSqliteStorage(":memory:").db, objects: db => listSqliteObjects(db), shape: db => describeSqliteSchema(db),
  rows: (db, tables) => nativeSqliteOwnerBoundary(db, tables, new Map()), schema: (db, tables) => nativeSqliteSchemaBoundary(db, tables),
};
const MINE: PluginDatabaseDeclaration = declaration(1, "CREATE TABLE mine (id INTEGER PRIMARY KEY, note TEXT);\nCREATE TABLE \"main\" (id INTEGER PRIMARY KEY, note TEXT);\nCREATE TABLE \"if\" (id INTEGER PRIMARY KEY, note TEXT);", undefined, "mine");
const OTHER: PluginDatabaseDeclaration = declaration(1, "CREATE TABLE other (id INTEGER PRIMARY KEY, note TEXT);\nCREATE INDEX other_note ON other(note);\nCREATE TABLE \"mine \" (id INTEGER PRIMARY KEY, note TEXT);", undefined, "other");
const owner = (declared: PluginDatabaseDeclaration, id: string) => ({ plugin_id: id, publisher_signature: `sig-${id}`, declaration: declared });

function smallLibrary(): string {
  const area = realpathSync(mkdtempSync(join(tmpdir(), "molis-plugin-steps-variants-")));
  after(() => rmSync(area, { recursive: true, force: true }));
  const file = join(area, "template.db"), db = new DatabaseSync(file);
  try {
    db.exec(`PRAGMA journal_mode = DELETE; ${PLUGIN_PROJECT_DATABASES_SCHEMA_SQL} CREATE TABLE project_root (project_id TEXT PRIMARY KEY); INSERT INTO project_root VALUES ('p');`);
    openPluginProjectDatabase(db, owner(OTHER, "other"), INSPECTOR, { path: "variants" });
    openPluginProjectDatabase(db, owner(MINE, "mine"), INSPECTOR, { path: "variants" });
    db.exec(`INSERT INTO other VALUES (1, 'other'); INSERT INTO "mine " VALUES (1, 'look-alike'); INSERT INTO mine VALUES (1, 'mine'), (2, 'mine');
      INSERT INTO "main" VALUES (1, 'main'); INSERT INTO "if" VALUES (1, 'if');`);
  } finally { db.close(); }
  return file;
}

test("S-upgrade-plugin-steps-scope: 4212 ways to write a step: nothing that is not the plugin's ever changes, and each one that would reach another's table is refused for its scope", t => {
  const source = smallLibrary(), area = realpathSync(mkdtempSync(join(tmpdir(), "molis-plugin-steps-variant-")));
  after(() => rmSync(area, { recursive: true, force: true }));
  const mine = ["mine", "main", "if", "renamed", ledgerRow("mine")];
  const copy = (name: string) => { const file = join(area, name); copyFileSync(source, file); return new DatabaseSync(file); };
  const baseline = (() => { const db = copy("baseline.db"); try { return libraryState(db); } finally { db.close(); } })();
  const othersBefore = othersOf(baseline, mine);
  const differs = (state: LibraryState) => JSON.stringify(othersOf(state, mine)) !== JSON.stringify(othersBefore);
  let variants = 0, reaching = 0, passed = 0;
  const escaped: string[] = [], unrefused: string[] = [];
  for (const separator of SEPARATORS) for (const name of NAMES) for (const statement of STATEMENTS) {
    const sql = statement.replaceAll("{n}", name.replaceAll("{s}", separator)).replaceAll("{s}", separator);
    variants += 1;
    const plain = copy("plain.db");
    let reaches: boolean;
    try {
      try { plain.exec(sql); } catch { /* SQLite's own refusal changes nothing; what changed is read below either way. */ }
      reaches = differs(libraryState(plain));
    } finally { plain.close(); }
    if (reaches) reaching += 1;
    const guarded = copy("guarded.db");
    try {
      let code = "ok";
      try { upgradePluginProjectTables(guarded, owner(declaration(2, MINE.schema, [{ from: 1, sql, reduces_rows: ["mine", "main", "if"] }], "mine"), "mine"), INSPECTOR, { path: "variants" }); }
      catch (error) { code = String((error as { code?: unknown }).code); }
      const state = libraryState(guarded);
      if (code === "ok") passed += 1;
      if (differs(state) || (code !== "ok" && JSON.stringify([...state.schema, ...state.tables]) !== JSON.stringify([...baseline.schema, ...baseline.tables]))) escaped.push(JSON.stringify(sql));
      if (reaches && code !== OUT_OF_SCOPE) unrefused.push(`${JSON.stringify(sql)} → ${code}`);
    } finally { guarded.close(); }
  }
  assert.equal(variants, 13 * 27 * 12);
  t.diagnostic(`${reaching} of ${variants} would reach another's table on their own; ${passed} went through as a step`);
  assert.deepEqual(escaped, [], "no way of writing a step changes anything not the plugin's, and a refused one changes nothing at all");
  assert.deepEqual(unrefused, [], "every one SQLite alone would let reach another's table is refused for its scope");
  assert.ok(reaching > 0, "the table holds ways that would reach another's table");
  assert.ok(passed > 0, "and ways that go through: a step of its own rows");
});

test("S-upgrade-plugin-steps-scope: an installed plugin that declares steps is refused at install and at a version change; one whose steps no plugin may write is refused for their scope first", async () => {
  const permissions = ["probe:read", "probe:write"].map(permission => ({ permission, required: true, reason: "读写自己的表" }));
  const manifest = (version: string, project: PluginDatabaseDeclaration): PluginManifest => ({ ...probeManifest(project), version, permissions });
  const definition = (value: PluginManifest): PluginDefinition => ({ manifest: value, async start() { return { kind: "app", views: [] }; }, async stop() {} });
  const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;
  const legal = declaration(2, "CREATE TABLE probe_notes (id INTEGER PRIMARY KEY, note TEXT, tag TEXT);", [{ from: 1, sql: "ALTER TABLE probe_notes ADD COLUMN tag TEXT" }]);
  const outOfScope = declaration(2, legal.schema, [{ from: 1, sql: "DROP TABLE IF EXISTS goals" }]);
  const install = (trust: typeof HOST_BUILD_TRUST, project: PluginDatabaseDeclaration) =>
    new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS }).install({ definition: definition(manifest("1.0.2", project)), deployment: "local", grants: ["probe:read", "probe:write"], trust });
  assert.throws(() => install(UNSIGNED_TRUST, legal), code("plugin.upgrade_steps_unsupported"));
  assert.throws(() => install(UNSIGNED_TRUST, outOfScope), code(OUT_OF_SCOPE), "a step no plugin may write says so first");
  assert.throws(() => install(HOST_BUILD_TRUST, outOfScope), code(OUT_OF_SCOPE), "the Host's own build gets the same check");
  assert.equal(install(HOST_BUILD_TRUST, legal).install.publisher_trust, "host");

  const runtime = new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS });
  const installed = runtime.install({ definition: definition(manifest("1.0.1", declaration(1, "CREATE TABLE probe_notes (id INTEGER PRIMARY KEY, note TEXT);"))), deployment: "local",
    grants: ["probe:read", "probe:write"], trust: UNSIGNED_TRUST });
  await assert.rejects(runtime.upgrade({ install_id: installed.install.install_id, definition: definition(manifest("1.0.2", legal)), grants: ["probe:read", "probe:write"] }),
    code("plugin.upgrade_steps_unsupported"));
});

test("S-upgrade-plugin-steps-scope: every plugin of the Host's own build passes the first layer, so a step none may write cannot ship", () => {
  for (const { manifest } of PLATFORM_PLUGIN_REGISTRATIONS) {
    assert.doesNotThrow(() => assertPluginUpgradeStepsAdmitted(manifest, "host"), manifest.plugin_id);
    for (const declared of [manifest.databases?.project, manifest.databases?.home]) if (declared) assert.doesNotThrow(() => pluginUpgradeSteps(declared), manifest.plugin_id);
  }
});
