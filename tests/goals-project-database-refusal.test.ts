import { pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalProjectDatabase, MolisWorkLocalHost, runLocalPluginDevelopment, isProjectPluginDatabaseRefusal, molisWorkHostProjectReference, openProjectPluginDatabases, releaseProjectPlugins, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { CODING_ACTIONS, CODING_PLUGIN_ID } from "@molis-ai/molis-work-plugin-coding";
import { FEED_ITEM_ACTIONS, FEED_PLUGIN_ID, FEED_SOURCE_ACTIONS } from "@molis-ai/molis-work-plugin-feed";
import { GOALS_PLUGIN_ID, goalsActions, goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import type { PluginProjectDatabaseRecord, PluginRuntimeDatabase } from "@molis-ai/molis-work-plugin-runtime";
import { SCHEDULE_ACTIONS, SCHEDULE_PLUGIN_ID } from "@molis-ai/molis-work-plugin-schedule";
import { describeSqliteSchema } from "@molis-ai/molis-work-storage";
import { codingView } from "./fixtures/coding-view.js";

/**
 * PLIB-14 (S8; specs/plugin-project-database/spec.md §2.3 and §2.4): Goals' tables in a project's library are Goals' own, declared in
 * its Manifest and opened by the platform like Coding's, Feed's and Schedule's. When they no longer match Goals' ledger row (another
 * publisher, another version, a changed shape), Goals alone is refused: its actions are not in the project's directory and a call to one
 * is refused, the refusal the platform recorded is the one the library keeps, and the library itself opens, with the other plugins
 * working as usual. Nothing in it is repaired, recreated or recorded anew. Each case changes Goals' row or table in a one-off Home,
 * the way a different build or a hand edit would.
 */
const OTHERS = [CODING_PLUGIN_ID, FEED_PLUGIN_ID, SCHEDULE_PLUGIN_ID];
/** The directory lists only what the caller may call, so the person asking holds what these plugins' actions need. */
const PERMISSIONS = [...new Set([...CODING_ACTIONS, ...FEED_ITEM_ACTIONS, ...FEED_SOURCE_ACTIONS, ...SCHEDULE_ACTIONS].flatMap(definition => definition.action.permissions)), "goals:read", "goals:write"];

async function scratch(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "molis-goals-database-refusal-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function withDatabase<T>(path: string, run: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(path);
  try { return run(db); } finally { db.close(); }
}

/** What a refusal must leave as it was: the ledger, the objects and the structure of every table, and every row of the project's root and board. */
const library = (path: string) => withDatabase(path, db => ({
  ledger: db.prepare("SELECT * FROM plugin_project_databases ORDER BY plugin_id").all().map(row => JSON.stringify(row)),
  master: db.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all().map(row => JSON.stringify(row)),
  shape: describeSqliteSchema(db),
  rows: ["project_root", "boards", "goals", "events"].map(table => db.prepare(`SELECT * FROM ${table}`).all().map(row => JSON.stringify(row))),
}));

/** A Home with one project, made by this build: its library has the four plugins' tables and ledger rows. */
async function project(directory: string) {
  const home = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    const made = await catalog.createProject({ display_name: "拒绝只停 Goals", actor_id: "test-user" });
    return { home, projectId: made.project_id, databasePath: made.database_path };
  } finally { catalog.close(); }
}

/** The plugins whose actions the project's directory lists, as the person's pages would ask for them, and what a call to a Goals action does. */
async function directory(home: string, projectId: string, databasePath: string): Promise<{ plugins: Set<string>; homeGoals: boolean; goalsCall: { code?: string } | "answered" }> {
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try {
    const caller: ActionCallContext = { actor_id: "web-user", actor_kind: "user", audience: "user", project_id: projectId, permissions: PERMISSIONS };
    const client = host.actionClient(molisWorkHostProjectReference({ projectId, databasePath }));
    const directory = await client.discover(caller);
    const providers = directory.filter(row => row.provider.plugin_id !== GOALS_PLUGIN_ID || row.action.scope === "project").map(row => row.provider.plugin_id ?? "");
    const homeGoals = directory.some(row => row.provider.plugin_id === GOALS_PLUGIN_ID && row.action.scope === "home");
    let goalsCall: { code?: string } | "answered" = "answered";
    try { await client.invoke(caller, goalsActions.snapshot, {}); } catch (error) { goalsCall = { code: (error as { code?: string }).code }; }
    return { plugins: new Set(providers.filter(id => id === GOALS_PLUGIN_ID || OTHERS.includes(id))), homeGoals, goalsCall };
  } finally { await host.close(); }
}

/** RAC-997 PLIB-14: the real developer entry owns its state; no ordinary Home Host is marked private for a test. */
async function developmentState(t: TestContext) {
  const directory = await scratch(t), sample = join(directory, "sample");
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  await mkdir(sample);
  for (const name of ["index.mjs", "manifest.json", "package.json"]) await copyFile(join(root, "examples/plugin-sample", name), join(sample, name));
  await mkdir(join(sample, "node_modules/@molis-ai"), { recursive: true });
  await symlink(join(root, "packages/plugin-sdk"), join(sample, "node_modules/@molis-ai/molis-work-plugin-sdk"), "dir");
  const manifest = JSON.parse(await readFile(join(sample, "manifest.json"), "utf8")) as { permissions: Array<{ permission: string }> };
  const state = join(directory, "state");
  const run = () => runLocalPluginDevelopment({ directory: sample, state_directory: state,
    grants: manifest.permissions.map(value => value.permission), allow_unsigned_development: true });
  assert.equal((await run()).poll.ok, true, "the real entry reaches current Goals initialize and runs the sample");
  const databasePath = join(state, "development.db");
  assert.equal(withDatabase(databasePath, db => db.prepare("SELECT COUNT(*) AS count FROM boards").get()?.count), 1,
    "the actual owner initialized this development board");
  return { run, databasePath };
}

/** The Coding panel of the project's page, from the library as the Host opens it. */
async function codingPanel(databasePath: string, projectId: string): Promise<string> {
  const store = new LocalProjectDatabase(databasePath);
  try {
    const panel = await codingView({ store, ...openProjectVersionStores(store), projectId, actions: pluginActions(store, projectId), actorId: "web-user",
      escapeHtml: value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") });
    await releaseProjectPlugins(store, projectId);
    return panel;
  } finally { store.close(); }
}

test("PLIB-14: a library this build made opens Goals' tables from its declaration, and Goals' actions are in the directory with the others'", async t => {
  const { home, projectId, databasePath } = await project(await scratch(t));
  const store = new LocalProjectDatabase(databasePath);
  try {
    const outcome = store.pluginDatabases.get(GOALS_PLUGIN_ID);
    assert.ok(outcome && "record" in outcome, "Goals' tables were opened, not refused");
    assert.equal(outcome.record.store_name, "goals");
    assert.equal(outcome.record.version, 1);
  } finally { store.close(); }
  const open = await directory(home, projectId, databasePath);
  assert.deepEqual([...open.plugins].sort(), [GOALS_PLUGIN_ID, ...OTHERS].sort());
  assert.equal(open.goalsCall, "answered");
  // Actual entry success pins the current public initialize path; its version is no longer recorded through a Host injection.
  await developmentState(t);
});

const cases = [
  { change: "its ledger row says another version", sql: `UPDATE plugin_project_databases SET version = 2 WHERE plugin_id = '${GOALS_PLUGIN_ID}'`, code: "plugin.project_database.version_mismatch" },
  { change: "its ledger row names another publisher", sql: `UPDATE plugin_project_databases SET publisher_signature = 'someone-else' WHERE plugin_id = '${GOALS_PLUGIN_ID}'`, code: "plugin.project_database.publisher_mismatch" },
  { change: "one of its tables gained a column", sql: "ALTER TABLE goals ADD COLUMN added_by_hand TEXT", code: "plugin.project_database.shape_mismatch" },
  { change: "its board has the name column version 7 gave it", sql: "ALTER TABLE boards ADD COLUMN title TEXT", code: "plugin.project_database.shape_mismatch" },
  // Goals' own reads would fail on this one, so nothing the Host does while it opens the project may read Goals' tables.
  { change: "one of its tables is gone", sql: "PRAGMA foreign_keys = OFF; DROP TABLE goal_tree_proposals", code: "plugin.project_database.shape_mismatch" },
];

for (const { change, sql, code } of cases) {
  test(`PLIB-14: when ${change}, only Goals is refused with ${code}, the library opens and the other plugins work`, async t => {
    const { home, projectId, databasePath } = await project(await scratch(t));
    withDatabase(databasePath, db => { db.exec(sql); });
    const before = library(databasePath);

    const store = new LocalProjectDatabase(databasePath);
    try {
      const outcome = store.pluginDatabases.get(GOALS_PLUGIN_ID);
      assert.ok(outcome && "error" in outcome, "Goals' open is refused");
      assert.equal((outcome.error as { code?: string }).code, code, "and the code the platform recorded is the one it keeps");
      for (const other of OTHERS) assert.ok("record" in store.pluginDatabases.get(other)!, `${other} was opened as usual`);
      assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM project_root").get()?.n, 1, "the library itself opens, the project's root in it");
    } finally { store.close(); }

    const open = await directory(home, projectId, databasePath);
    assert.equal(open.plugins.has(GOALS_PLUGIN_ID), false, "the refused project's Goals actions are not in the directory");
    assert.equal(open.homeGoals, true, "the independent Home instance remains available");
    assert.deepEqual([...open.plugins].sort(), [...OTHERS].sort(), "the other plugins' actions are");
    assert.deepEqual(open.goalsCall, { code: "actions.missing" }, "and a call to a Goals action is refused: there is nothing registered to answer it");
    assert.doesNotMatch(await codingPanel(databasePath, projectId), /role="alert"/, "Coding opens while Goals is refused");
    const developer = await developmentState(t);
    withDatabase(developer.databasePath, db => { db.exec(sql); });
    const developerBefore = library(developer.databasePath);
    await assert.rejects(developer.run(), { code: "actions.missing" }, "the real development entry refuses the absent public action");
    assert.deepEqual(library(developer.databasePath), developerBefore, "the refused development entry repairs nothing and writes no half result");

    assert.deepEqual(library(databasePath), before, "the refusal repairs nothing, recreates nothing and records nothing");
  });
}

test("PLIB-14: only the platform's own refusal stops one plugin; a temporary SQLite error surfaces instead of being recorded as a refusal", () => {
  const db: PluginRuntimeDatabase = { exec: () => undefined, prepare: () => ({ get: () => undefined, all: () => [], run: () => undefined }) };
  const record: PluginProjectDatabaseRecord = { plugin_id: GOALS_PLUGIN_ID, publisher_signature: goalsManifest.publisher.signature, store_name: "goals", version: 1, objects: [], created_at: "2026-10-23T00:00:00.000Z" };
  const refused = openProjectPluginDatabases(db, "/tmp/probe.db", [goalsManifest], () => { throw new ActionError("plugin.project_database.version_mismatch", "another version"); });
  const refusal = refused.get(GOALS_PLUGIN_ID);
  assert.ok(refusal && "error" in refusal, "the declaration's own refusal is recorded against that plugin only");
  assert.throws(() => openProjectPluginDatabases(db, "/tmp/probe.db", [goalsManifest], () => { throw new Error("SQLITE_BUSY: database is locked"); }), /SQLITE_BUSY/, "a temporary SQLite error that stays is thrown, not turned into a plugin refusal");
  assert.throws(() => openProjectPluginDatabases(db, "/tmp/probe.db", [goalsManifest], () => { throw new TypeError("bad open"); }), /bad open/, "so is a programming error");
  let attempts = 0;
  const retried = openProjectPluginDatabases(db, "/tmp/probe.db", [goalsManifest], () => {
    attempts += 1;
    if (attempts < 3) throw new Error("SQLITE_BUSY: database is locked");
    return record;
  }).get(GOALS_PLUGIN_ID);
  assert.ok(retried && "record" in retried, "a moment of SQLite contention is retried and the plugin opens, as the library would on the next attempt");
  assert.equal(attempts, 3, "two transient answers were tried again before the third opened it");
  const opened = openProjectPluginDatabases(db, "/tmp/probe.db", [goalsManifest], () => record).get(GOALS_PLUGIN_ID);
  assert.ok(opened && "record" in opened, "an open plugin keeps its record");
  assert.equal(isProjectPluginDatabaseRefusal(new ActionError("plugin.project_database.version_mismatch", "x")), true, "the platform's refusal prefix is recognized");
  assert.equal(isProjectPluginDatabaseRefusal(new Error("SQLITE_BUSY: database is locked")), false, "anything else is not");
});
