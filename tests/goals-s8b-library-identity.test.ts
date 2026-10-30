import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, validateManagedProject, runV1Cli } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";

// PG-094 S8b (PG094-10, PG-021): a project's library is the project's, not Goals': it is made with the platform's root row alone, a
// library check reads only that row, and Goals makes its own board when the project is first opened.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function scratch(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "molis-goals-s8b-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function rows(path: string, sql: string): Array<Record<string, unknown>> {
  const db = new DatabaseSync(path);
  try { return db.prepare(sql).all() as Array<Record<string, unknown>>; } finally { db.close(); }
}

function exec(path: string, sql: string): void {
  const db = new DatabaseSync(path);
  try { db.exec(sql); } finally { db.close(); }
}

/** A Home with one project made by the catalog, which is how a person's new project is made. */
async function newProject(directory: string) {
  const home = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    const made = await catalog.createProject({ display_name: "库的身份是项目", actor_id: "test-user" });
    return { home, projectId: made.project_id, databasePath: made.database_path };
  } finally { catalog.close(); }
}

/** What the library holds of the project's identity and of Goals' board. */
const identity = (databasePath: string) => ({
  roots: rows(databasePath, "SELECT project_id FROM project_root").map(row => row.project_id),
  boards: rows(databasePath, "SELECT project_id FROM boards").map(row => row.project_id),
  created: rows(databasePath, "SELECT actor_id FROM events WHERE type = 'io.molis.work.goals:board.created'").map(row => row.actor_id),
});

/** The project opened by a Host of its own, as a page or a tool opens it; `initialize` is Goals' board action, as the management door calls it. */
async function openProject(home: string, projectId: string, databasePath: string, initializeKey?: string, readBoard = false): Promise<{ replayed: boolean } | undefined> {
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try {
    const reference = molisWorkHostProjectReference({ projectId, databasePath });
    await host.withProject(reference, runtime => runtime.project_id);
    const caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience: "user", project_id: projectId,
      permissions: goalsActions.initialize.action.permissions,
      user_action: { source: "management", conversation_ref: `management:${projectId}`, message_ref: `management:${initializeKey}` } };
    if (readBoard) await host.actionClient(reference).invoke({ ...caller, permissions: ["goals:read"] }, goalsActions.snapshot, {});
    if (!initializeKey) return undefined;
    return await host.actionClient(reference).invoke(caller, goalsActions.initialize, { idempotency_key: initializeKey }) as { replayed: boolean };
  } finally { await host.close(); }
}

test("PG094-10 RAC-261 a new project's library holds its root row and no board; the library check reads the root alone", async t => {
  const { projectId, databasePath } = await newProject(await scratch(t));
  assert.deepEqual(identity(databasePath), { roots: [projectId], boards: [], created: [] }, "the project exists before Goals has run in it");
  validateManagedProject(databasePath, projectId);
  assert.throws(() => validateManagedProject(databasePath, "another-project"), /project_id/, "the root belongs to one project");
  exec(databasePath, "DELETE FROM project_root");
  assert.throws(() => validateManagedProject(databasePath, projectId), /项目根记录/, "a library with no root row is not a project");
});

test("PG094-10 RAC-262 opening the project makes Goals' board once, as the creation used to; reopening and the board action add nothing", async t => {
  const { home, projectId, databasePath } = await newProject(await scratch(t));
  await openProject(home, projectId, databasePath, undefined, true);
  assert.deepEqual(identity(databasePath), { roots: [projectId], boards: [projectId], created: [LOCAL_PERSON_ACTOR_ID] }, "one board, made for the person on this machine");
  await openProject(home, projectId, databasePath, undefined, true);
  assert.deepEqual(identity(databasePath).created, [LOCAL_PERSON_ACTOR_ID], "reopening makes no second board event");
  const replay = await openProject(home, projectId, databasePath, `project-catalog-create-${projectId}`);
  assert.equal(replay?.replayed, true, "the board action replays the key creating the project has always given it");
  assert.deepEqual(identity(databasePath).created, [LOCAL_PERSON_ACTOR_ID]);
});

test("PG094-10 RAC-262 a bare library stays without a board until the management CLI initializes its root and first board", async t => {
  const directory = await scratch(t), databasePath = join(directory, "bare.db"), projectId = "project/bare";
  await openProject(directory, projectId, databasePath);
  assert.deepEqual(identity(databasePath), { roots: [], boards: [], created: [] }, "opening the bare library makes neither a root nor a board");
  const host = new MolisWorkLocalHost({ homeDirectory: directory, completeText: null }), lines: string[] = [];
  const log = t.mock.method(console, "log", (...values: unknown[]) => { lines.push(values.map(String).join(" ")); });
  try {
    assert.equal(await runV1Cli(["init", "--db", databasePath, "--json", JSON.stringify({ project_id: projectId, idempotency_key: "init" })],
      { localHost: host, homeDirectory: directory }), 0);
    assert.equal((JSON.parse(lines.at(-1)!) as { replayed: boolean }).replayed, false, "the first management call makes the root and board");
  } finally { log.mock.restore(); await host.close(); }
  assert.deepEqual(identity(databasePath), { roots: [projectId], boards: [projectId], created: [LOCAL_PERSON_ACTOR_ID] });
});

test("PG094-10 RAC-263 when Goals' tables are refused the library check still passes and opening makes no board", async t => {
  const { home, projectId, databasePath } = await newProject(await scratch(t));
  exec(databasePath, "UPDATE plugin_project_databases SET version = 2 WHERE plugin_id = 'io.molis.work.goals'");
  validateManagedProject(databasePath, projectId);
  await openProject(home, projectId, databasePath);
  assert.deepEqual(identity(databasePath), { roots: [projectId], boards: [], created: [] }, "a refused Goals is left as the platform found it");
});

test("PG094-10 RAC-264 the Host no longer has a board-shaped library check", () => {
  let found = "";
  try { found = execFileSync("git", ["grep", "-lE", "validateManagedBoard|readManagedBoard", "--", "apps"], { cwd: ROOT, encoding: "utf8" }); } catch { /* exit 1: no match */ }
  assert.equal(found, "", "no file under apps/ names the board-shaped library functions");
});
