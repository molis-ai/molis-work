import { registerMaintenanceChecks } from "./fixtures/home-store-maintenance.mjs";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";
import { AssistantStore } from "@molis-ai/molis-work-app-local-host";

// PG-036 (C8-3): the Assistant's store goes from version 2 to 3 (the executor of a work is a plugin by id, no longer the one kind
// "coding"). A version 2 store is refused on open; this rehearses the offline maintenance a real Home gets before the new build opens it.
const maintenance = readFileSync(new URL("./fixtures/assistant-maintenance-v3.sql", import.meta.url), "utf8");
const project = { project_id: "project", storage_key: "memory:project" };

/** A version 3 store with an Assistant work and a Coding work and the Sends that made them, written back to the version 2 shape the old build left. */
function fixture(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "assistant-maintenance-v3-")), file = join(home, "assistant.db");
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const db = new DatabaseSync(file), store = new AssistantStore(db);
  const own = store.create({ actor_id: "web-user", title: "整理周报", scope: { kind: "personal" }, origin: null });
  const carried = store.create({ actor_id: "web-user", title: "加法函数", scope: { kind: "project", project_id: "project" }, origin: null, project_ref: project,
    executor: { kind: "plugin", plugin_id: "io.molis.work.coding", title: "Coding", session_id: "session-1", mode: "plan" } });
  store.addRound(carried.work_id, { run_id: "run-1", text: "写一个加法函数", materials: [], context: null, started_at: "2026-10-24T00:00:00.000Z", executor: "plugin" });
  store.addRound(own.work_id, { run_id: "run-2", text: "整理一下", materials: [], context: null, started_at: "2026-10-24T00:00:00.000Z" });
  // The Sends: finished ones keep their whole result, which a repeat of the request id gets back; one is still in flight (no result yet).
  for (const [requestId, work, run] of [["request-carried", carried, "run-1"], ["request-own", own, "run-2"]] as const) {
    store.claimRequest("web-user", requestId);
    store.finishRequest("web-user", requestId, { work: { ...work, state: "running" }, outcome: "started", run_id: run } as never);
  }
  store.claimRequest("web-user", "request-pending");
  const repeated = (id: string) => (store.claimRequest("web-user", id) as { result: unknown }).result;
  const expected = { works: store.list("web-user"), carried: store.get("web-user", carried.work_id), rounds: store.rounds(carried.work_id), own: store.rounds(own.work_id),
    results: { carried: repeated("request-carried"), own: repeated("request-own") } };
  db.exec(`UPDATE assistant_works SET body = json_remove(json_set(body, '$.executor.kind', 'coding'), '$.executor.plugin_id') WHERE json_extract(body, '$.executor.kind') = 'plugin';
    UPDATE assistant_rounds SET body = json_set(body, '$.executor', 'coding') WHERE json_extract(body, '$.executor') = 'plugin';
    UPDATE assistant_requests SET result = json_remove(json_set(result, '$.work.executor.kind', 'coding'), '$.work.executor.plugin_id') WHERE json_extract(result, '$.work.executor.kind') = 'plugin';
    PRAGMA user_version = 2;`);
  db.close();
  return { file, expected, carriedId: carried.work_id };
}
const rows = (file: string) => {
  const db = new DatabaseSync(file);
  try { return { version: db.prepare("PRAGMA user_version").get()!.user_version, works: db.prepare("SELECT body FROM assistant_works ORDER BY work_id").all().map(row => String(row.body)),
    rounds: db.prepare("SELECT body FROM assistant_rounds ORDER BY work_id, run_id").all().map(row => String(row.body)),
    requests: db.prepare("SELECT request_id, state, result FROM assistant_requests ORDER BY request_id").all().map(row => `${row.request_id} ${row.state} ${row.result}`) }; }
  finally { db.close(); }
};

test("RAC-447 a version 2 Assistant store is refused untouched; the maintenance names the plugin in every work, round and stored Send result, and the store opens at version 3 with the same works", t => {
  const { file, expected, carriedId } = fixture(t), bytes = readFileSync(file);
  assert.throws(() => new AssistantStore(new DatabaseSync(file)), error => error instanceof SqliteSchemaVersionError && error.found === 2 && error.expected === 3);
  assert.deepEqual(readFileSync(file), bytes, "the refusal writes nothing");
  const before = rows(file);
  assert.ok(before.works.some(body => body.includes('"kind":"coding"')) && before.rounds.some(body => body.includes('"executor":"coding"'))
    && before.requests.some(row => row.includes('"kind":"coding"')), "the fixture is the old shape");
  const db = new DatabaseSync(file);
  try { registerMaintenanceChecks(db, "assistant"); db.exec(maintenance); } finally { db.close(); }
  const after = rows(file);
  assert.equal(after.version, 3);
  assert.ok(!after.works.some(body => body.includes('"coding"')) && !after.rounds.some(body => body.includes('"coding"'))
    && !after.requests.some(row => row.includes('"coding"')), "no body or stored result names the old kind");
  assert.ok(after.requests.some(row => row.startsWith("request-pending pending null")), "a Send still in flight has no result and is left as it was");
  const opened = new DatabaseSync(file), store = new AssistantStore(opened);
  try {
    assert.deepEqual(store.list("web-user"), expected.works);
    assert.deepEqual(store.get("web-user", carriedId), expected.carried);
    assert.deepEqual(store.rounds(carriedId), expected.rounds);
    // A repeat of a finished Send gets its stored result back: the work in it is in the current shape too.
    for (const [id, result] of [["request-carried", expected.results.carried], ["request-own", expected.results.own]] as const) {
      assert.deepEqual(store.claimRequest("web-user", id), { claimed: false, result }, id);
    }
  } finally { opened.close(); }
});

test("RAC-448 another version and a failing write roll back the entire Assistant maintenance", t => {
  const { file } = fixture(t), original = rows(file);
  for (const version of [0, 3]) {
    const db = new DatabaseSync(file); db.exec(`PRAGMA user_version = ${version}`); db.close();
    const wrong = new DatabaseSync(file);
    try { registerMaintenanceChecks(wrong, "assistant"); assert.throws(() => wrong.exec(maintenance)); } finally { wrong.close(); }
    assert.deepEqual({ ...rows(file), version: 2 }, original, `version ${version}: nothing was changed`);
    const restore = new DatabaseSync(file); restore.exec("PRAGMA user_version = 2"); restore.close();
  }
  // A write failing at any of the three tables (the last one comes after the works and rounds were already rewritten) undoes them all.
  for (const table of ["assistant_works", "assistant_rounds", "assistant_requests"]) {
    const blocked = new DatabaseSync(file);
    try {
      blocked.exec(`CREATE TEMP TRIGGER fail_${table} BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, '${table} is locked'); END`);
      registerMaintenanceChecks(blocked, "assistant");
      assert.throws(() => blocked.exec(maintenance), new RegExp(`${table} is locked`));
      assert.equal(blocked.isTransaction, true, "the script stops at the first error and leaves the transaction to be rolled back by closing");
    } finally { blocked.close(); }
    const after = rows(file); // closing the connection rolled the open transaction back
    assert.deepEqual(after, original, `${table}: works, rounds, stored results and the version are all as they were`);
  }
});
