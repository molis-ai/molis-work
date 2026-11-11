import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { homeSqlitePath, MEMORY_LEDGER_BASELINE, MEMORY_LEDGER_STORE, runSqliteUpgrade } from "@molis-ai/molis-work-storage";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";

// Memory V0 (#2020, BL-1071): a Home from before the indexed SDK store reaches the new generation without migration (user 2026-11-07). The ledger's
// 1 → 2 step drops what it knew about the old memories, keeps owner titles and every switch, and gives the one new preference (the per-class
// restriction list) an empty value (user 2026-11-11). Only that step's marker creates a forgetting file.

const CONTENT = ["memory_revisions", "memory_candidates", "memory_changes", "memory_signal_events", "memory_uses", "memory_pairs", "memory_markers"];
const PENDING = "memory-generation:forgetting-pending";
/** Preferences as the build before Memory V0 saved them: eight fields, memory switched off by the person. */
const OLD_PREFS = JSON.stringify({ enabled: false, task_recall: true, form: true, auto: false, learn_from_work: true, learn_from_ui: true,
  consumers: { assistant: true, agent: true, ui: true, plugin: true, mcp: false }, plugins: { "io.example.plugin": { allowed: false, kinds: [] } } });
const upgradedPrefs = () => ({ ...JSON.parse(OLD_PREFS), class_restrictions: [] });

function scratch(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "molis-memory-ledger-upgrade-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

/** One row in every ledger table, the way a version-1 Home could hold them. */
function fillVersionOne(db: DatabaseSync) {
  db.exec(`
INSERT INTO memory_revisions VALUES ('m1', 1, '{"text":"旧正文"}');
INSERT INTO memory_candidates VALUES ('c1', 'person', 'pending', '{}');
INSERT INTO memory_changes VALUES ('ch1', 'person', 'm1', '2026-11-01T00:00:00.000Z', '{}');
INSERT INTO memory_prefs VALUES ('person', 'personal', '${OLD_PREFS}');
INSERT INTO memory_signal_events VALUES ('e1', 'person', 'k', 'o', '2026-11-01T00:00:00.000Z');
INSERT INTO memory_uses VALUES ('m1', 'r1', '2026-11-01T00:00:00.000Z', NULL, 'used', '{}');
INSERT INTO memory_owners VALUES ('project', 'p1', 'p1', '项目一', NULL);
INSERT INTO memory_pairs VALUES ('pair1', 'person', 'open', '{}');
INSERT INTO memory_markers VALUES ('', 'memory-forgotten:m0', '2026-11-01T00:00:00.000Z', '{}');
PRAGMA user_version = 1;`);
}

const count = (db: DatabaseSync, table: string) => Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n);
const ledgerVersion = (home: string) => {
  const db = new DatabaseSync(homeSqlitePath(home, MEMORY_LEDGER_STORE), { readOnly: true });
  try { return Number(db.prepare("PRAGMA user_version").get()!.user_version); } finally { db.close(); }
};
const pending = (home: string) => {
  const db = new DatabaseSync(homeSqlitePath(home, MEMORY_LEDGER_STORE), { readOnly: true });
  try { return db.prepare("SELECT 1 FROM memory_markers WHERE actor_id='' AND key=?").get(PENDING) !== undefined; } finally { db.close(); }
};
const forgetting = (home: string) => join(home, "memory-forgetting-v2.json");
const OLD_KINDS = ["io.molis.work~memories", "io.molis.work~memory-candidates"];
const records = (home: string) => join(home, "agent-runtime", "records");
/** Every path under agent-runtime except the two old memory folders, to show nothing else is touched. */
const runtimeTree = (home: string) => readdirSync(join(home, "agent-runtime"), { recursive: true, encoding: "utf8" })
  .filter(path => !OLD_KINDS.some(kind => path.includes(kind))).sort();

async function start(home: string) {
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  await host.close();
}

/** A current Home put back to what the build before Memory V0 left: ledger version 1 with old facts, and no forgetting file. */
async function versionOneHome(t: TestContext) {
  const home = scratch(t);
  await start(home);
  const db = new DatabaseSync(homeSqlitePath(home, MEMORY_LEDGER_STORE));
  try {
    db.exec("PRAGMA user_version = 1"); for (const table of CONTENT) db.exec(`DELETE FROM ${table}`);
    db.exec("UPDATE memory_prefs SET body = json_remove(body, '$.class_restrictions')");
    db.prepare("UPDATE memory_prefs SET body = ? WHERE actor_id = ? AND key = 'personal'").run(OLD_PREFS, LOCAL_PERSON_ACTOR_ID);
    fillVersionOne(db);
  } finally { db.close(); }
  unlinkSync(forgetting(home));
  for (const kind of OLD_KINDS) {
    mkdirSync(join(records(home), kind), { recursive: true, mode: 0o700 });
    writeFileSync(join(records(home), kind, "old.v1.json"), '{"old":"layout"}', { mode: 0o600 });
  }
  return home;
}

test("MEM-40 UPG2: the memory ledger's 1 → 2 step clears the old memories' facts, keeps every switch and owner title, and adds an empty class list", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(MEMORY_LEDGER_BASELINE.schema);
    fillVersionOne(db);
    assert.deepEqual(runSqliteUpgrade(db, MEMORY_LEDGER_STORE, MEMORY_LEDGER_BASELINE), { from: 1, to: 2 });
    for (const table of CONTENT.filter(table => table !== "memory_markers")) assert.equal(count(db, table), 0, table);
    assert.deepEqual(db.prepare("SELECT actor_id, key FROM memory_markers").all().map(row => ({ ...row })), [{ actor_id: "", key: PENDING }]);
    assert.deepEqual(db.prepare("SELECT body FROM memory_prefs").all().map(row => JSON.parse(String(row.body))), [upgradedPrefs()]);
    assert.deepEqual(db.prepare("SELECT title FROM memory_owners").all().map(row => row.title), ["项目一"]);
  } finally { db.close(); }
});

test("MEM-40 UPG2: a version-1 Home starts the new memory generation with an empty forgetting file and keeps the person's switches", async t => {
  const home = await versionOneHome(t), before = runtimeTree(home);
  await start(home);
  for (const kind of OLD_KINDS) assert.equal(existsSync(join(records(home), kind)), false, `${kind}: the old file-layout folder is gone`);
  assert.deepEqual(runtimeTree(home).filter(path => before.includes(path)), before, "no other runtime entry is removed");
  assert.equal(ledgerVersion(home), 2);
  assert.equal(pending(home), false, "the marker is spent once the file is written");
  assert.deepEqual(JSON.parse(readFileSync(forgetting(home), "utf8")), { format_version: 1, decisions: [] });
  const db = new DatabaseSync(homeSqlitePath(home, MEMORY_LEDGER_STORE), { readOnly: true });
  try {
    assert.equal(count(db, "memory_revisions"), 0);
    assert.deepEqual(JSON.parse(String(db.prepare("SELECT body FROM memory_prefs WHERE actor_id=? AND key='personal'").get(LOCAL_PERSON_ACTOR_ID)!.body)), upgradedPrefs(),
      "the person's own switches, memory off included, survive; only the new list is added");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM memory_prefs WHERE json_type(body, '$.class_restrictions') = 'array'").get()!.n, count(db, "memory_prefs"));
  } finally { db.close(); }
  await start(home);
});

test("MEM-40 UPG2: a start interrupted after the forgetting file was written keeps that file and spends the marker", async t => {
  const home = await versionOneHome(t);
  await start(home);
  const written = readFileSync(forgetting(home));
  const db = new DatabaseSync(homeSqlitePath(home, MEMORY_LEDGER_STORE));
  try { db.prepare("INSERT INTO memory_markers VALUES ('', ?, '2026-11-11T00:00:00.000Z', '{}')").run(PENDING); } finally { db.close(); }
  await start(home);
  assert.equal(pending(home), false);
  assert.deepEqual(readFileSync(forgetting(home)), written);
});

test("MEM-40: a current Home that lost its forgetting file without the upgrade's marker is still refused", async t => {
  const home = scratch(t);
  await start(home);
  unlinkSync(forgetting(home));
  assert.throws(() => new MolisWorkLocalHost({ homeDirectory: home, completeText: null }), { code: "memory.forgetting_invalid" });
  assert.equal(existsSync(forgetting(home)), false);
  assert.equal(ledgerVersion(home), 2);
});

test("MEM-40 UPG2: an old memory folder name that is a link is refused, and neither the link nor its target is removed", async t => {
  const home = await versionOneHome(t), outside = mkdtempSync(join(tmpdir(), "molis-memory-ledger-upgrade-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, "kept.json"), "{}");
  rmSync(join(records(home), OLD_KINDS[1]!), { recursive: true });
  symlinkSync(outside, join(records(home), OLD_KINDS[1]!));
  assert.throws(() => new MolisWorkLocalHost({ homeDirectory: home, completeText: null }), { code: "memory.unavailable" });
  assert.equal(readFileSync(join(outside, "kept.json"), "utf8"), "{}");
  assert.equal(lstatSync(join(records(home), OLD_KINDS[1]!)).isSymbolicLink(), true);
  assert.equal(pending(home), true, "the marker stays for a start that can finish");
  assert.equal(existsSync(forgetting(home)), false);
});
