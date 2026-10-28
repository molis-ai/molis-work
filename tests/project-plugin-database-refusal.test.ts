import { pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalProjectDatabase, MolisWorkLocalHost, molisWorkHostProjectReference, releaseProjectPlugins, scheduleServiceFor, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { CODING_ACTIONS, CODING_PLUGIN_ID } from "@molis-ai/molis-work-plugin-coding";
import { FEED_ITEM_ACTIONS, FEED_PLUGIN_ID, FEED_SOURCE_ACTIONS } from "@molis-ai/molis-work-plugin-feed";
import { SCHEDULE_ACTIONS, SCHEDULE_PLUGIN_ID, reminderActions, scheduledOperationActions } from "@molis-ai/molis-work-plugin-schedule";
import { describeSqliteSchema } from "@molis-ai/molis-work-storage";
import { scheduledOwnerPlugin } from "./fixtures/schedule-runtime.js";
import { codingView } from "./fixtures/coding-view.js";

/**
 * PLIB-04 (the Host half, L1b; specs/plugin-project-database/spec.md §2.3): when the Host opens a project's library, a plugin
 * whose tables there no longer match its ledger row (another publisher, another version, a changed shape) is refused, and only
 * that plugin stops: its actions are not in the project's directory, its page says why, and the project, Goals and the other
 * plugins open as usual. Nothing in the library is repaired, recreated or recorded anew; the refusal stays until the plugin or
 * the library is put right. Each case changes one plugin's row or table in a one-off Home, the way a different build or a hand
 * edit would.
 */
const PLUGINS = [CODING_PLUGIN_ID, FEED_PLUGIN_ID, SCHEDULE_PLUGIN_ID];
const GOALS_PLUGIN_ID = "io.molis.work.goals";
/** The directory lists only what the caller may call, so the person asking holds what the three plugins' actions need. */
const PERMISSIONS = [...new Set([...CODING_ACTIONS, ...FEED_ITEM_ACTIONS, ...FEED_SOURCE_ACTIONS, ...SCHEDULE_ACTIONS].flatMap(definition => definition.action.permissions))];

async function scratch(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "molis-project-plugin-refusal-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function withDatabase<T>(path: string, run: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(path);
  try { return run(db); } finally { db.close(); }
}

/** What a refusal must leave as it was: the ledger, the objects and the structure of every table. */
const library = (path: string) => withDatabase(path, db => ({
  ledger: db.prepare("SELECT * FROM plugin_project_databases ORDER BY plugin_id").all().map(row => JSON.stringify(row)),
  master: db.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all().map(row => JSON.stringify(row)),
  shape: describeSqliteSchema(db),
  coding: db.prepare("SELECT * FROM coding_sessions ORDER BY project_id, session_id").all(),
}));

/** A Home with one project, made by this build: its library has the three plugins' tables and ledger rows. */
async function project(directory: string) {
  const home = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    const made = await catalog.createProject({ display_name: "拒绝只停一个插件", actor_id: "test-user" });
    return { home, projectId: made.project_id, databasePath: made.database_path };
  } finally { catalog.close(); }
}

/** The plugins whose actions the project's directory lists, as the person's pages would ask for them; Goals stands for the project. */
async function pluginsInDirectory(home: string, projectId: string, databasePath: string): Promise<{ plugins: Set<string>; goals: boolean }> {
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try {
    const caller: ActionCallContext = { actor_id: "web-user", actor_kind: "user", audience: "user", project_id: projectId, permissions: PERMISSIONS };
    const providers = (await host.actionClient(molisWorkHostProjectReference({ projectId, databasePath })).discover(caller)).map(row => row.provider.plugin_id ?? "");
    return { plugins: new Set(providers.filter(id => PLUGINS.includes(id))), goals: providers.includes(GOALS_PLUGIN_ID) };
  } finally { await host.close(); }
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

test("PLIB-04: a library this build made opens every plugin that declares tables in it", async t => {
  const { home, projectId, databasePath } = await project(await scratch(t));
  const open = await pluginsInDirectory(home, projectId, databasePath);
  assert.deepEqual([...open.plugins].sort(), [...PLUGINS].sort());
  assert.equal(open.goals, true);
  assert.doesNotMatch(await codingPanel(databasePath, projectId), /role="alert"/);
});

const cases = [
  { plugin: CODING_PLUGIN_ID, oldVersion: 1, change: "Coding still has its exact version 1 baseline", sql: `INSERT INTO coding_sessions (project_id, session_id, title, state, runtime_id, created_at, updated_at) SELECT project_id, 'kept-v1', 'Nonempty old Coding', 'idle', 'prologue', '2026-10-25', '2026-10-25' FROM project_root; ALTER TABLE coding_sessions DROP COLUMN lifecycle_json; UPDATE plugin_project_databases SET version = 1 WHERE plugin_id = '${CODING_PLUGIN_ID}'` },
  { plugin: CODING_PLUGIN_ID, oldVersion: 2, change: "Coding still has its nonempty version 2 baseline", sql: `INSERT INTO coding_sessions (project_id, session_id, title, state, runtime_id, created_at, updated_at) SELECT project_id, 'kept-v2', 'Nonempty version 2 Coding', 'idle', 'prologue', '2026-10-25', '2026-10-25' FROM project_root; UPDATE plugin_project_databases SET version = 2 WHERE plugin_id = '${CODING_PLUGIN_ID}'` },
  { plugin: SCHEDULE_PLUGIN_ID, change: "its ledger row says another version", sql: `UPDATE plugin_project_databases SET version = 2 WHERE plugin_id = '${SCHEDULE_PLUGIN_ID}'` },
  { plugin: FEED_PLUGIN_ID, change: "its ledger row names another publisher", sql: `UPDATE plugin_project_databases SET publisher_signature = 'someone-else' WHERE plugin_id = '${FEED_PLUGIN_ID}'` },
  { plugin: CODING_PLUGIN_ID, change: "one of its tables gained a column", sql: "ALTER TABLE coding_plan_drafts ADD COLUMN added_by_hand TEXT" },
];

for (const { plugin, change, sql, oldVersion } of cases) {
  test(`PLIB-04: when ${change}, only ${plugin} stops and the library is left as it was`, async t => {
    const { home, projectId, databasePath } = await project(await scratch(t));
    withDatabase(databasePath, db => { db.exec(sql); });
    const before = library(databasePath);

    const open = await pluginsInDirectory(home, projectId, databasePath);
    assert.equal(open.plugins.has(plugin), false, `${plugin}'s actions are not in the directory`);
    assert.deepEqual([...open.plugins].sort(), PLUGINS.filter(id => id !== plugin).sort(), "the other plugins' actions are");
    assert.equal(open.goals, true, "and the project opens: Goals' actions are there");

    const panel = await codingPanel(databasePath, projectId);
    if (plugin === CODING_PLUGIN_ID) {
      assert.match(panel, /role="alert"/, "the Coding page says it did not open");
      assert.match(panel, /io\.molis\.work\.coding/, "and names the plugin it refused");
      assert.match(panel, oldVersion ? new RegExp(`是第 ${oldVersion} 版，这次声明的是第 4 版`) : /的表和索引与声明不同/, "the reason is the platform's refusal, not a failure further on");
    } else {
      assert.doesNotMatch(panel, /role="alert"/, "Coding opens while another plugin is refused");
    }

    assert.deepEqual(library(databasePath), before, "the refusal repairs nothing, recreates nothing and records nothing");
  });
}

/** The jobs the Scheduler keeps, with what a claim would move on: whether it is on, when it is next due, its lease and last wakeup. */
const jobs = (path: string) => withDatabase(path, db => db.prepare(
  "SELECT job_id, capability_id, enabled, next_due_at, lease_until, lease_token, last_wakeup_id FROM schedule_jobs ORDER BY job_id").all().map(row => JSON.stringify(row)));
const wakeups = (path: string) => withDatabase(path, db => (db.prepare("SELECT COUNT(*) AS count FROM schedule_wakeups").get() as { count: number }).count);

/**
 * Feed keeps its own job on the platform's clock (FI-6), set by its activation a moment after the project opens. It is not Schedule's:
 * once the open host has set it, the closed library moves it past the round below, which then sees only Schedule's two jobs (the running
 * Feed leaves a current job of its own alone).
 */
async function feedClockSet(path: string): Promise<void> {
  const set = () => withDatabase(path, db => (db.prepare("SELECT COUNT(*) AS count FROM schedule_jobs WHERE plugin_id = ?").get(FEED_PLUGIN_ID) as { count: number }).count);
  for (const deadline = Date.now() + 10_000; set() !== 1;) {
    assert.ok(Date.now() < deadline, "Feed set its clock job when the project opened");
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

test("PLIB-04/S-46: a refused Schedule claims none of its due jobs; they wait as they were until its library is put right", async t => {
  const { home, projectId, databasePath } = await project(await scratch(t));
  const due = new Date(Date.now() + 60_000), later = new Date(due.getTime() + 1_000);
  const owner = scheduledOwnerPlugin(), reference = molisWorkHostProjectReference({ projectId, databasePath });
  const options = { homeDirectory: home, completeText: null, pluginFixtures: { project: [owner.definition] } };
  // A one-off reminder (a claim would turn it off before its handler ran) and a scheduled operation (a claim prepares it first).
  const host = new MolisWorkLocalHost(options);
  try {
    await host.actionClient(reference).discover({ actor_id: "web-user", project_id: projectId, audience: "user", permissions: PERMISSIONS });
    await owner.actions(projectId).invoke(reminderActions.add, { at: due.toISOString(), text: "到点的一次性提醒" });
    await owner.actions(projectId).invoke(scheduledOperationActions.add, { at: due.toISOString(), operation: "summarize", input: { text: "到点的定时操作" }, inbox: true });
    await feedClockSet(databasePath);
  } finally { await host.close(); }
  withDatabase(databasePath, db => {
    db.exec(`UPDATE plugin_project_databases SET version = 2 WHERE plugin_id = '${SCHEDULE_PLUGIN_ID}'`);
    db.exec(`UPDATE schedule_jobs SET next_due_at = '9999-12-31T00:00:00.000Z' WHERE plugin_id = '${FEED_PLUGIN_ID}'`);
  });
  const before = { jobs: jobs(databasePath), wakeups: wakeups(databasePath), library: library(databasePath) };
  assert.equal(before.jobs.length, 3, "both jobs are due, beside Feed's parked one");

  const reopened = new MolisWorkLocalHost(options);
  try {
    await reopened.withProject(reference, async runtime => {
      const schedule = scheduleServiceFor(runtime.store.db);
      assert.deepEqual(await schedule.tick(later), { invoked: 0, failed: 0, skipped: 2 }, "both persisted Runtime jobs are skipped before a claim");
      assert.deepEqual(await schedule.tick(later), { invoked: 0, failed: 0, skipped: 2 }, "and the next round runs as well: no job stops the rounds");
    });
  } finally { await reopened.close(); }

  assert.deepEqual(jobs(databasePath), before.jobs, "neither job is turned off, moved on or leased");
  assert.equal(wakeups(databasePath), before.wakeups, "and no wakeup is recorded as failed");
  assert.deepEqual(library(databasePath), before.library, "the library is left as it was");
});
