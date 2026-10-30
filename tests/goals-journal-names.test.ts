import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import { journalRows, writeOldNamedLibrary } from "./fixtures/goals-old-names.js";

// PG-094 S9-2 (specs/repository-anti-corruption/slices/goals-s10-s11-runtime-switch.md §5.3): the maintenance that puts Goals' id on the
// bare names its history, idempotency records and ledger edges had before it ran as a Runtime plugin. Only disposable Homes here; the real-Home
// refusals are tried by moving the "temp" line the script draws (its own TMPDIR), never by pointing it at a Home that exists.

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = join(ROOT, "scripts", "maintenance", "goals-journal-names.mjs");
const NAMESPACE = `${GOALS_PLUGIN_ID}:`;

async function home(t: test.TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "goals-journal-names-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
const run = (args: string[], env: Record<string, string> = {}) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
const sources = (directory: string): string[] => readdirSync(directory).flatMap(name => {
  const path = join(directory, name);
  return statSync(path).isDirectory() ? sources(path) : /\.ts$/u.test(name) ? [path] : [];
});

test("RAC-799 the names the script renames are the names Goals writes: its plugin id, its event object types and its ledger relation types", async () => {
  const script = await import(pathToFileURL(SCRIPT).href) as { GOALS_PLUGIN_ID: string; NAMESPACE: string; EVENT_OBJECT_TYPES: string[]; EDGE_RELATION_TYPES: string[] };
  assert.equal(script.GOALS_PLUGIN_ID, GOALS_PLUGIN_ID);
  assert.equal(script.NAMESPACE, NAMESPACE);
  const text = sources(join(ROOT, "plugins", "native", "goals", "src")).map(file => readFileSync(file, "utf8")).join("\n");
  const objectTypes = new Set([...text.matchAll(/(?:objectType|object_type):\s*"([a-z_]+)"/gu)].map(match => match[1]!));
  assert.deepEqual([...objectTypes].sort(), [...script.EVENT_OBJECT_TYPES].sort(),
    "an event object type Goals writes is not in the script (its old rows would stay bare), or the script lists one Goals does not write");
  const relations = new Set([...text.matchAll(/"(goal\.(?:input|output)(?:\.proposal)?)"/gu)].map(match => match[1]!));
  assert.deepEqual([...relations].sort(), [...script.EDGE_RELATION_TYPES].sort(), "the ledger relation types Goals writes and the script's list differ");
});

test("RAC-799 list reads the libraries and writes nothing", async t => {
  const directory = await home(t), file = writeOldNamedLibrary(directory, "alpha");
  const before = journalRows(file);
  const listed = run(["list", "--home", directory]);
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /alpha\s+事件 4、幂等记录 2、引用关系 3/u);
  assert.equal(journalRows(file), before);
});

test("RAC-799 rename puts Goals' id on exactly Goals' rows, Goals then reads them as its own, and run again it changes nothing", async t => {
  const directory = await home(t), file = writeOldNamedLibrary(directory, "alpha");
  writeOldNamedLibrary(directory, "beta");

  const unseen = new LocalProjectDatabase(file);
  try {
    assert.equal(unseen.ownedEventCursor("alpha", NAMESPACE), 0, "before the maintenance Goals sees none of its history");
    assert.equal(unseen.getIdempotency("alpha", "owner", `${NAMESPACE}create`, "key-1"), null);
  } finally { unseen.close(); }

  const renamed = run(["rename", "--home", directory]);
  assert.equal(renamed.status, 0, renamed.stderr);
  assert.match(renamed.stdout, /alpha: 已改 事件 4、幂等记录 2、引用关系 3/u);
  assert.match(renamed.stdout, /beta: 已改/u);

  const rows = JSON.parse(journalRows(file)) as { events: Array<{ type: string; object_type: string }>; idempotency: Array<{ operation: string }>; edges: Array<{ edge_key: string; revision: number }> };
  assert.deepEqual(rows.events.map(event => `${event.type} | ${event.object_type}`), [
    `${NAMESPACE}board.created | ${NAMESPACE}board`, `${NAMESPACE}goal.created | ${NAMESPACE}goal`, `${NAMESPACE}relation.added | ${NAMESPACE}relation`,
    `${NAMESPACE}goal_tree_proposal.decided | ${NAMESPACE}goal_tree_proposal`, "feed_source.registered | feed_source"], "the Feed event is not Goals'");
  assert.deepEqual(rows.idempotency.map(record => record.operation), [`${NAMESPACE}create`, `${NAMESPACE}submit_goal_tree_proposal`, "io.molis.work.other:thing"],
    "another plugin's record keeps its name");
  assert.deepEqual(rows.edges.map(edge => `${edge.edge_key}#${edge.revision}`), [
    "feed.promote:item-1#1", `${NAMESPACE}goal.input.proposal:goal-1:artifact-1:1#1`,
    `${NAMESPACE}goal.output:goal-1:artifact-1:1#1`, `${NAMESPACE}goal.output:goal-1:artifact-1:1#2`], "every revision of a Goals edge moves; Feed's edge does not");

  const seen = new LocalProjectDatabase(file);
  try {
    assert.equal(seen.readOwnedEventsDescending("alpha", NAMESPACE).length, 4, "Goals reads its history again");
    assert.deepEqual(seen.readOwnedEventsDescending("alpha", NAMESPACE).map(event => event.type.slice(NAMESPACE.length)).sort(),
      ["board.created", "goal.created", "goal_tree_proposal.decided", "relation.added"], "the platform's binding hands Goals these without the namespace");
    assert.ok(seen.ownedEventCursor("alpha", NAMESPACE) > 0);
    assert.equal(seen.getIdempotency("alpha", "owner", `${NAMESPACE}create`, "key-1")?.request_hash, "hash", "and a retry with an old key replays");
  } finally { seen.close(); }

  const settled = journalRows(file);
  const again = run(["rename", "--home", directory]);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /没有项目库里还留着 Goals 的旧名/u);
  assert.equal(journalRows(file), settled);
});

test("RAC-799 rename that meets a name already taken stops and leaves that library as it was", async t => {
  const directory = await home(t), file = writeOldNamedLibrary(directory, "alpha");
  const taken = new LocalProjectDatabase(file);
  try { taken.putIdempotency({ projectId: "alpha", actorId: "owner", operation: `${NAMESPACE}create`, key: "key-1", requestHash: "other", outcome: {}, at: "2026-10-02T00:00:00.000Z" }); } finally { taken.close(); }
  const before = journalRows(file);

  const refused = run(["rename", "--home", directory]);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /alpha/u);
  assert.equal(journalRows(file), before, "the events and edges of that library were not renamed either");
});

test("RAC-799 a Home that is not under the temp directory is a real one: rename needs the maintenance window and refuses a library another process holds", async t => {
  const directory = await home(t), file = writeOldNamedLibrary(directory, "alpha");
  const elsewhere = join(directory, "other-tmp");
  mkdirSync(elsewhere);
  const env = { TMPDIR: elsewhere };
  const before = journalRows(file);

  const noWindow = run(["rename", "--home", directory], env);
  assert.equal(noWindow.status, 1);
  assert.match(noWindow.stderr, /--maintenance-window/u);
  assert.equal(journalRows(file), before, "nothing was written without the window");

  const holder = new DatabaseSync(file);
  try {
    holder.exec("BEGIN IMMEDIATE");
    const busy = run(["rename", "--home", directory, "--maintenance-window"], env);
    assert.equal(busy.status, 1);
    assert.match(busy.stderr, /占用/u);
  } finally { holder.exec("ROLLBACK"); holder.close(); }
  assert.equal(journalRows(file), before, "a library another process holds is not renamed");

  const window = run(["rename", "--home", directory, "--maintenance-window"], env);
  assert.equal(window.status, 0, window.stderr);
  assert.notEqual(journalRows(file), before);
});
