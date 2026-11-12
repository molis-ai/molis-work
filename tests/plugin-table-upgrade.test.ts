// UPG1-10: a plugin's tables in a project's library, in the upgrade process (specs/upgrade-continuity/upgrade-chain-design.md §2.4, §6).
// The platform's steps on the file come first; then each plugin's tables, one transaction each. A plugin whose steps fail is rolled back
// alone and stops; the platform's tables and the other plugins' are the new version. The Home, the project's library and both plugins
// exist only for the test: the descriptors are registered by the test, the library is one this build makes.
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ensureHomeUpgraded, openProjectPluginDatabases, PROJECT_DATABASE_BASELINE, pluginTablesDescriptor, type HomeUpgradeDescriptor } from "@molis-ai/molis-work-app-local-host";
import { acquireStorageOwner, openSqliteConnection, readUpgradeStoreSpace } from "@molis-ai/molis-work-storage";
import { ledgerFile, upgradeTestHome, useDescriptors } from "./fixtures/home-upgrade-home.js";
import { declaration, ledgerRow, libraryState, libraryTemplate, mineOf, probeManifest, tracking } from "./fixtures/plugin-upgrade-library.js";

const template = libraryTemplate();
const LIBRARY = join("projects", "p1", "molis-work.db");
const N = PROJECT_DATABASE_BASELINE.version;

const plugin = (name: string, version: number, upgrades?: Parameters<typeof declaration>[2]): PluginManifest =>
  probeManifest(declaration(version, version === 1 ? `CREATE TABLE ${name}_notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);`
    : `CREATE TABLE ${name}_notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL, tag TEXT);`, upgrades, name), { id: `io.molis.work.example.${name}`, sync: tracking(`${name}_notes`) });
const GOOD = plugin("good", 1), BAD = plugin("bad", 1);
const GOOD_V2 = plugin("good", 2, [{ from: 1, sql: "ALTER TABLE good_notes ADD COLUMN tag TEXT; UPDATE good_notes SET tag = upper(body);" }]);
const BAD_V2 = plugin("bad", 2, [{ from: 1, sql: "ALTER TABLE bad_notes ADD COLUMN tag TEXT; UPDATE bad_notes SET tag = body; DELETE FROM project_root;" }]);
const BAD_TABLES = ["bad_notes", ledgerRow(BAD.plugin_id)];

/** A Home with one project whose library has both plugins' tables at v1, each with rows. */
function home(t: TestContext) {
  const { home: root, lock } = upgradeTestHome(t), file = join(root, LIBRARY);
  mkdirSync(join(root, "projects", "p1"), { recursive: true, mode: 0o700 });
  copyFileSync(template, file);
  const db = openSqliteConnection(file);
  try {
    for (const outcome of openProjectPluginDatabases(db, file, [GOOD, BAD]).values()) if ("error" in outcome) throw outcome.error;
    db.exec("INSERT INTO good_notes (body) VALUES ('one'), ('two'); INSERT INTO bad_notes (body) VALUES ('kept'), ('as it was');");
  } finally { db.close(); }
  return { root, lock, file };
}

const library = { pattern: LIBRARY, paths: () => [LIBRARY], version: N + 1 };
/** The platform's own step on the file: one more table, so the file is at N + 1 once it is through. */
const platform = (sql = "CREATE TABLE platform_extra (id INTEGER PRIMARY KEY)"): HomeUpgradeDescriptor => ({ owner: "tests/project", block: { kind: "project" }, pattern: LIBRARY, open: file => openSqliteConnection(file),
  baseline: { version: N + 1, schema: `${PROJECT_DATABASE_BASELINE.schema}\nCREATE TABLE platform_extra (id INTEGER PRIMARY KEY);`, upgrades: [{ from: N, sql }] } });

function round(root: string, lock: string, file: string) {
  const owner = acquireStorageOwner(lock), space = readUpgradeStoreSpace(file);
  try { return ensureHomeUpgraded(root, owner, space ? { expectedSpace: space } : {}); }
  finally { owner.release(); }
}

const state = (file: string) => { const db = openSqliteConnection(file, { readonly: true }); try { return libraryState(db); } finally { db.close(); } };
const opened = (file: string, manifests: readonly PluginManifest[]) => {
  const db = openSqliteConnection(file);
  try { return Object.fromEntries([...openProjectPluginDatabases(db, file, manifests)].map(([id, outcome]) => [id, "error" in outcome ? String((outcome.error as { code?: unknown }).code) : "ok"])); }
  finally { db.close(); }
};

test("UPG1-10 the platform's step goes through, one plugin's fails: that plugin is rolled back alone and stops, the platform's tables and the other plugin's are the new version", t => {
  const { root, lock, file } = home(t), before = state(file);
  useDescriptors(t, platform(), pluginTablesDescriptor(GOOD_V2, library), pluginTablesDescriptor(BAD_V2, library));
  const report = round(root, lock, file);
  assert.deepEqual(report.units.map(unit => [unit.relative_path, unit.kind, unit.state, unit.error?.code ?? null]), [
    [LIBRARY, "sqlite", "committed", null],
    [`${LIBRARY}#good`, "plugin_tables", "committed", null],
    [`${LIBRARY}#bad`, "plugin_tables", "failed", "plugin.project_database.upgrade_out_of_scope"],
  ]);
  const after = state(file);
  assert.deepEqual(mineOf(after, BAD_TABLES), mineOf(before, BAD_TABLES), "every table of the plugin that failed: its rows and its structure, word for word");
  assert.ok(after.schema.has("table:platform_extra"), "the platform's tables are the new version");
  assert.deepEqual(opened(file, [GOOD_V2, BAD_V2]), { [GOOD.plugin_id]: "ok", [BAD.plugin_id]: "plugin.project_database.version_mismatch" }, "only the plugin that failed stops");
  assert.equal(report.stamped, false, "a failed unit leaves no stamp");
  const recorded = readFileSync(ledgerFile(root), "utf8");
  assert.ok(!recorded.includes("as it was"), "the record keeps the code and the reason, never a row");
  assert.equal(round(root, lock, file).units.find(unit => unit.relative_path === `${LIBRARY}#bad`)?.state, "failed", "under the same build it is not tried again");
});

test("UPG1-10 a plugin's tables wait for their file: when the platform's step fails, they are not touched", t => {
  const { root, lock, file } = home(t), before = state(file);
  useDescriptors(t, platform("CREATE TABLE platform_extra (id INTEGER PRIMARY KEY); SELECT no_such_function()"), pluginTablesDescriptor(GOOD_V2, library));
  const report = round(root, lock, file);
  assert.deepEqual(report.units.map(unit => [unit.relative_path, unit.state, unit.error?.reason ?? null]), [
    [LIBRARY, "failed", "step_failed"], [`${LIBRARY}#good`, "failed", "prerequisite_failed"]]);
  assert.deepEqual(state(file), before, "the platform's snapshot went back, and the plugin's tables were never opened to write");
});

test("UPG1-10 a plugin's tables newer than this build are left as they are, and only that plugin stops", t => {
  const { root, lock, file } = home(t);
  const newer = plugin("good", 2, [{ from: 1, sql: "ALTER TABLE good_notes ADD COLUMN tag TEXT" }]);
  useDescriptors(t, platform());
  round(root, lock, file);
  const db = openSqliteConnection(file);
  try { db.exec(`UPDATE plugin_project_databases SET version = 3 WHERE plugin_id = '${GOOD.plugin_id}'`); }
  finally { db.close(); }
  const before = state(file);
  useDescriptors(t, pluginTablesDescriptor(newer, library));
  const report = round(root, lock, file);
  assert.deepEqual(report.units.filter(unit => unit.kind === "plugin_tables").map(unit => [unit.relative_path, unit.state, unit.from]), [[`${LIBRARY}#good`, "too_new", 3]]);
  assert.deepEqual(state(file), before);
});
