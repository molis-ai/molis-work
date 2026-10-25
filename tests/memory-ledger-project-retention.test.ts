import assert from "node:assert/strict";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import test, { type TestContext } from "node:test";
import { beginMemoryLedgerAdoption, createMemoryLedgerProjectRetention, homeSqlitePath, inspectMemoryLedgerAdoption,
  MEMORY_LEDGER_BASELINE, MEMORY_LEDGER_STORE, type MemoryLedgerProjectRetentionPlan } from "@molis-ai/molis-work-storage";

const plan = () => ({ project_id: "project-a", actor_id: "person", operation_id: "original-delete", scopes: [
  { scope: "project" as const, owner: "project-a", memories: [{ memory_id: "memory-a", version: 2 }], candidates: [{ candidate_id: "candidate-a", version: 1 }], sources: [{ event_id: "source-a", version: "2" }] },
  { scope: "character" as const, owner: "character-a", memories: [], candidates: [], sources: [] },
] } satisfies MemoryLedgerProjectRetentionPlan);
const denied = { code: "memory.adoption_conflict" };
const tables = ["memory_revisions", "memory_uses", "memory_pairs", "memory_changes", "memory_candidates", "memory_markers", "memory_owners", "memory_prefs", "memory_signal_events"];
function access<T>(home: string, work: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(homeSqlitePath(home, MEMORY_LEDGER_STORE));
  try { return work(db); } finally { db.close(); }
}
const state = (home: string) => access(home, db => Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()])));
function fixture(t: TestContext) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "molis-project-retention-"))); t.after(() => rmSync(home, { recursive: true, force: true }));
  mkdirSync(join(home, MEMORY_LEDGER_STORE));
  access(home, db => {
    db.exec(MEMORY_LEDGER_BASELINE.schema); db.exec("PRAGMA user_version=3");
    for (const key of ["personal", "project-default", "project:project-a", "project:keep"]) db.prepare("INSERT INTO memory_prefs VALUES (?,?,?)").run("person", key, JSON.stringify({ form: true, key }));
    db.prepare("INSERT INTO memory_markers VALUES (?,?,?,?)").run("person", "strategy-adoption", "before", JSON.stringify({ origin: "existing-home" }));
    for (const id of ["memory-a", "keep"]) {
      db.prepare("INSERT INTO memory_revisions VALUES (?,?,?)").run(id, 1, JSON.stringify({ version: 1, text: `${id} revision` }));
      db.prepare("INSERT INTO memory_uses VALUES (?,?,?,?,?,?)").run(id, `receipt-${id}`, "before", null, "response-observed", JSON.stringify({
        memory_id: id, receipt_id: `receipt-${id}`, at: "before", work_id: null, state: "response-observed", consumer: "assistant", title: `${id} use` }));
      db.prepare("INSERT INTO memory_changes VALUES (?,?,?,?,?)").run(`change-${id}`, "person", id, "before", JSON.stringify({
        change_id: `change-${id}`, actor_id: "person", at: "before", memory_id: id, scope: id === "memory-a" ? "project" : "personal", owner: id === "memory-a" ? "project-a" : "person", text: `${id} change`, reason: "reason", undoable: true, undo: { text: "private undo" } }));
    }
    db.prepare("INSERT INTO memory_pairs VALUES (?,?,?,?)").run("pair-a", "person", "pending", JSON.stringify({ pair_id: "pair-a", state: "pending", scope: "project", owner: "project-a", a: { memory_id: "memory-a" }, b: { memory_id: "keep" } }));
    for (const id of ["candidate-a", "linked-copy"]) db.prepare("INSERT INTO memory_candidates VALUES (?,?,?,?)").run(id, "person", "pending", JSON.stringify({
      candidate_id: id, actor_id: "person", state: "pending", project_id: id === "candidate-a" ? "project-a" : null, scope: id === "candidate-a" ? "project" : "personal", owner: id === "candidate-a" ? "project-a" : "person",
      memory_id: id === "candidate-a" ? null : "memory-a", text: `${id} text`, why: "source text" }));
    for (const [scope, owner, project] of [["project", "project-a", "project-a"], ["character", "character-a", "project-a"], ["project", "keep", "keep"]]) {
      db.prepare("INSERT INTO memory_owners VALUES (?,?,?,?,?)").run(scope!, owner!, project!, "title", owner!);
      db.prepare("INSERT INTO memory_signal_events VALUES (?,?,?,?,?)").run(`event-${owner}`, "person", `${scope}|${owner}|signal`, "once", "before");
      db.prepare("INSERT INTO memory_markers VALUES (?,?,?,?)").run("person", `tidy:${scope}:${owner}`, "before", JSON.stringify({ value: owner }));
    }
  });
  const snapshot = beginMemoryLedgerAdoption({ homeDirectory: home, snapshot: inspectMemoryLedgerAdoption({ homeDirectory: home }) });
  const input = { homeDirectory: home, plan: plan(), mode: "cleanup" as const, assertCurrent: () => {} };
  return { home, snapshot, input, owner: createMemoryLedgerProjectRetention(input) };
}
function cleanObjects(f: ReturnType<typeof fixture>) {
  let snapshot = f.owner.suppressSources({ snapshot: f.snapshot, scope: "project", owner: "project-a", sources: plan().scopes[0]!.sources });
  snapshot = f.owner.dropCandidate({ snapshot, candidate_id: "candidate-a" });
  return f.owner.forget({ snapshot, memory_id: "memory-a" });
}

test("nonempty fixed cleanup reuses retention, returns committed post snapshots, and preserves all unrelated data", t => {
  const f = fixture(t), before = state(f.home), snapshot = cleanObjects(f);
  assert.deepEqual(snapshot, f.snapshot, "ordinary retention does not pretend the adoption snapshot is an all-ledger version");
  const retained = state(f.home);
  assert.deepEqual(retained.memory_revisions, before.memory_revisions!.filter(row => row.memory_id === "keep"));
  assert.deepEqual(retained.memory_uses, before.memory_uses!.filter(row => row.memory_id === "keep"));
  assert.equal(retained.memory_pairs!.length, 0);
  const change = JSON.parse(String(retained.memory_changes!.find(row => row.memory_id === "memory-a")!.body));
  assert.deepEqual([change.text, change.reason, change.undoable, change.undo], ["", null, false, null]);
  const linked = JSON.parse(String(retained.memory_candidates![0]!.body));
  assert.deepEqual([linked.candidate_id, linked.text, linked.why, linked.memory_id], ["linked-copy", "", "", null]);
  f.owner.verifyOriginal({ snapshot });
  const post = f.owner.forgetScopes({ snapshot });
  assert.deepEqual(post, inspectMemoryLedgerAdoption({ homeDirectory: f.home }));
  assert.notDeepEqual(post, snapshot); assert.equal(post.version, 3);
  assert.deepEqual(post.owners, [{ scope: "project", owner: "keep", project_id: "keep" }]);
  assert.deepEqual(post.profiles.map(row => row.key), ["personal", "project-default", "project:keep"]);
  const after = state(f.home);
  assert.deepEqual(after.memory_changes, before.memory_changes!.filter(row => row.memory_id === "keep"));
  assert.deepEqual(after.memory_signal_events, before.memory_signal_events!.filter(row => row.event_id === "event-keep"));
  assert.deepEqual(after.memory_markers!.filter(row => row.key === "tidy:project:keep"), before.memory_markers!.filter(row => row.key === "tidy:project:keep"));
  f.owner.verifyOriginal({ snapshot: post });
  assert.deepEqual(f.owner.forgetScopes({ snapshot: post }), post, "same original decision remains idempotent");
});

test("plan is captured before authority callbacks and rejects out-of-plan IDs, scopes and source versions without effects", t => {
  const f = fixture(t), original = plan(), owner = createMemoryLedgerProjectRetention({ ...f.input, plan: original, assertCurrent: () => {
    original.scopes[0]!.memories = [...original.scopes[0]!.memories, { memory_id: "keep", version: 1 }]; original.operation_id = "later";
  } }), before = state(f.home);
  assert.throws(() => owner.forget({ snapshot: f.snapshot, memory_id: "keep" }), denied);
  assert.throws(() => owner.dropCandidate({ snapshot: f.snapshot, candidate_id: "linked-copy" }), denied);
  assert.throws(() => owner.suppressSources({ snapshot: f.snapshot, scope: "project", owner: "keep", sources: [] }), denied);
  assert.throws(() => owner.suppressSources({ snapshot: f.snapshot, scope: "project", owner: "project-a", sources: [{ event_id: "source-a", version: "3" }] }), denied);
  assert.deepEqual(state(f.home), before);
  owner.forget({ snapshot: f.snapshot, memory_id: "memory-a" });
  assert.deepEqual(state(f.home).memory_revisions, before.memory_revisions!.filter(row => row.memory_id === "keep"));
});

test("missing Ledger is never created and a writable original state requires the persisted adopting barrier", t => {
  const f = fixture(t), empty = join(f.home, "absent"), owner = createMemoryLedgerProjectRetention({ ...f.input, homeDirectory: empty });
  assert.throws(() => owner.forget({ snapshot: f.snapshot, memory_id: "memory-a" }));
  assert.throws(() => owner.verifyOriginal({ snapshot: f.snapshot }));
  assert.equal(existsSync(empty), false);
  access(f.home, db => db.prepare("UPDATE memory_markers SET body=? WHERE key='strategy-adoption'").run(JSON.stringify({ origin: "existing-home" })));
  const snapshot = inspectMemoryLedgerAdoption({ homeDirectory: f.home }), before = state(f.home);
  assert.throws(() => f.owner.forget({ snapshot, memory_id: "memory-a" }), denied); assert.deepEqual(state(f.home), before);
});

test("authority revocation and cancellation after the real retention mutation roll back every copy", t => {
  for (const action of ["revoke", "abort"] as const) {
    const f = fixture(t), before = state(f.home), controller = new AbortController(), failure = new Error(action);
    let active: DatabaseSync | undefined, sawMutation = false;
    const exec = DatabaseSync.prototype.exec;
    const mock = t.mock.method(DatabaseSync.prototype, "exec", function(this: DatabaseSync, sql: string) {
      const result = exec.call(this, sql); if (sql.includes("BEGIN IMMEDIATE")) active = this; return result;
    });
    const owner = createMemoryLedgerProjectRetention({ ...f.input, signal: controller.signal, assertCurrent: () => {
      if (active?.prepare("SELECT 1 FROM memory_markers WHERE key='memory-forgotten:memory-a'").get()) {
        sawMutation = true; if (action === "abort") controller.abort(failure); else throw failure;
      }
    } });
    assert.throws(() => owner.forget({ snapshot: f.snapshot, memory_id: "memory-a" }), error => error === failure);
    mock.mock.restore(); assert.equal(sawMutation, true); assert.deepEqual(state(f.home), before);
  }
});

test("a second SQLite writer changing version after capture conflicts instead of accepting a callback-mutated expected snapshot", t => {
  const f = fixture(t), expected = structuredClone(f.snapshot), before = state(f.home); let armed = false;
  const owner = createMemoryLedgerProjectRetention({ ...f.input, assertCurrent: () => {
    if (!armed) return; armed = false;
    access(f.home, db => db.exec("PRAGMA user_version=4"));
    Object.assign(expected, inspectMemoryLedgerAdoption({ homeDirectory: f.home }));
  } });
  armed = true;
  assert.throws(() => owner.forget({ snapshot: expected, memory_id: "memory-a" }), denied);
  assert.equal(expected.version, 4); assert.deepEqual(state(f.home), before);
});

test("COMMIT failure returns no post snapshot, rolls back, then retries the unchanged original plan", t => {
  const f = fixture(t), before = state(f.home), failure = new Error("commit denied"), exec = DatabaseSync.prototype.exec;
  let post: unknown, failed = false;
  const mock = t.mock.method(DatabaseSync.prototype, "exec", function(this: DatabaseSync, sql: string) {
    if (sql === "COMMIT") { failed = true; throw failure; } return exec.call(this, sql);
  });
  assert.throws(() => { post = f.owner.forget({ snapshot: f.snapshot, memory_id: "memory-a" }); }, error => error === failure);
  mock.mock.restore(); assert.equal(failed, true); assert.equal(post, undefined); assert.deepEqual(state(f.home), before);
  const resumed = f.owner.forget({ snapshot: f.snapshot, memory_id: "memory-a" });
  assert.deepEqual(resumed, inspectMemoryLedgerAdoption({ homeDirectory: f.home }));
  f.owner.forget({ snapshot: resumed, memory_id: "memory-a" });
  assert.equal(state(f.home).memory_markers!.filter(row => row.key === "memory-forgotten:memory-a").length, 1);
});

test("an error after actual COMMIT cannot publish a post snapshot or silently advance the original expected state", t => {
  const f = fixture(t), snapshot = cleanObjects(f), exec = DatabaseSync.prototype.exec, failure = new Error("commit response lost");
  let post: unknown, committed = false;
  const mock = t.mock.method(DatabaseSync.prototype, "exec", function(this: DatabaseSync, sql: string) {
    const result = exec.call(this, sql); if (sql === "COMMIT") { committed = true; throw failure; } return result;
  });
  assert.throws(() => { post = f.owner.forgetScopes({ snapshot }); }, error => error instanceof AggregateError && error.cause === failure);
  mock.mock.restore(); assert.equal(committed, true); assert.equal(post, undefined);
  const after = state(f.home); assert.equal(after.memory_owners!.length, 1);
  assert.throws(() => f.owner.forgetScopes({ snapshot }), denied);
  assert.deepEqual(state(f.home), after);
});

test("forgotten marker alone is insufficient, and every original object proof rejects residual content or missing barriers", t => {
  const raw = fixture(t);
  access(raw.home, db => db.prepare("INSERT INTO memory_markers VALUES ('','memory-forgotten:memory-a','after',?)").run(JSON.stringify({ memory_id: "memory-a", state: "forgotten" })));
  assert.throws(() => raw.owner.verifyOriginal({ snapshot: raw.snapshot }), denied);
  const corruptions = [
    `INSERT INTO memory_revisions VALUES ('memory-a',2,'{"version":2,"text":"late"}')`,
    `INSERT INTO memory_uses VALUES ('memory-a','late','after',NULL,'response-observed','{"memory_id":"memory-a","receipt_id":"late","at":"after","work_id":null,"state":"response-observed","consumer":"assistant","title":"late"}')`,
    `INSERT INTO memory_pairs VALUES ('late','person','pending','{"pair_id":"late","state":"pending","a":{"memory_id":"keep"},"b":{"memory_id":"memory-a"}}')`,
    `UPDATE memory_changes SET body=json_set(body,'$.text','leak') WHERE memory_id='memory-a'`,
    `INSERT INTO memory_candidates VALUES ('candidate-a','person','pending','{"candidate_id":"candidate-a","actor_id":"person","state":"pending","scope":"project","owner":"project-a","project_id":"project-a","memory_id":null}')`,
    `UPDATE memory_candidates SET body=json_set(body,'$.memory_id','memory-a','$.text','late') WHERE candidate_id='linked-copy'`,
    "DELETE FROM memory_markers WHERE key LIKE 'memory-source-forgotten:%'",
    "UPDATE memory_changes SET body='[]' WHERE memory_id='memory-a'",
    "UPDATE memory_candidates SET body=json_remove(body,'$.memory_id') WHERE candidate_id='linked-copy'",
  ];
  for (const corruption of corruptions) {
    const f = fixture(t), snapshot = cleanObjects(f); access(f.home, db => db.exec(corruption));
    const before = state(f.home); assert.throws(() => f.owner.verifyOriginal({ snapshot }), denied);
    assert.deepEqual(state(f.home), before, corruption);
  }
});

test("scope close refuses an unselected later object and a newly attached owner even with a fresh adoption snapshot", t => {
  for (const extra of [
    `INSERT INTO memory_candidates VALUES ('later','person','pending','{"candidate_id":"later","actor_id":"person","state":"pending","project_id":"project-a","scope":"project","owner":"project-a","memory_id":null}')`,
    `INSERT INTO memory_changes VALUES ('later','person','later','after','{"change_id":"later","actor_id":"person","at":"after","memory_id":"later","scope":"project","owner":"project-a"}')`,
    `INSERT INTO memory_pairs VALUES ('later','person','pending','{"pair_id":"later","state":"pending","scope":"project","owner":"project-a","a":{"memory_id":"later"},"b":{"memory_id":"keep"}}')`,
    `INSERT INTO memory_owners VALUES ('character','later','project-a','Later','later')`,
  ]) {
    const f = fixture(t); cleanObjects(f); access(f.home, db => db.exec(extra));
    const before = state(f.home), snapshot = inspectMemoryLedgerAdoption({ homeDirectory: f.home });
    assert.throws(() => f.owner.forgetScopes({ snapshot }), denied); assert.deepEqual(state(f.home), before);
  }
});

test("existing-complete only proves original IDs and preserves the whole same-ID successor without any writes", t => {
  const f = fixture(t), cleaned = f.owner.forgetScopes({ snapshot: cleanObjects(f) });
  access(f.home, db => {
    db.prepare("INSERT INTO memory_owners VALUES ('project','project-a','project-a','Successor','project-a')").run();
    db.prepare("INSERT INTO memory_prefs VALUES ('person','project:project-a',?)").run(JSON.stringify({ form: false, successor: true }));
    db.exec(`INSERT INTO memory_candidates VALUES ('successor-candidate','person','pending','{"candidate_id":"successor-candidate","actor_id":"person","state":"pending","project_id":"project-a","scope":"project","owner":"project-a","memory_id":null}');
      INSERT INTO memory_revisions VALUES ('successor-memory',1,'{"version":1,"text":"new private body"}');
      INSERT INTO memory_pairs VALUES ('successor-pair','person','pending','{"pair_id":"successor-pair","state":"pending","a":{"memory_id":"successor-memory"},"b":{"memory_id":"keep"}}');
      INSERT INTO memory_signal_events VALUES ('successor-signal','person','project|project-a|signal','again','after');`);
  });
  const snapshot = inspectMemoryLedgerAdoption({ homeDirectory: f.home }), before = state(f.home), path = homeSqlitePath(f.home, MEMORY_LEDGER_STORE), bytes = readFileSync(path);
  assert.notDeepEqual(snapshot, cleaned);
  const owner = createMemoryLedgerProjectRetention({ ...f.input, mode: "original" }); owner.verifyOriginal({ snapshot });
  assert.throws(() => owner.forget({ snapshot, memory_id: "memory-a" }), denied);
  assert.throws(() => owner.dropCandidate({ snapshot, candidate_id: "candidate-a" }), denied);
  assert.throws(() => owner.suppressSources({ snapshot, scope: "project", owner: "project-a", sources: plan().scopes[0]!.sources }), denied);
  assert.throws(() => owner.forgetScopes({ snapshot }), denied);
  assert.deepEqual(state(f.home), before); assert.deepEqual(readFileSync(path), bytes);
});

test("physical Ledger and ancestor redirection after capture is rejected while source and original target remain intact", t => {
  for (const boundary of ["file", "directory", "home"]) {
    const target = fixture(t), source = fixture(t), sourceBefore = state(source.home), targetBefore = state(target.home);
    const targetPath = boundary === "file" ? homeSqlitePath(target.home, MEMORY_LEDGER_STORE) : boundary === "directory" ? join(target.home, MEMORY_LEDGER_STORE) : target.home;
    const sourcePath = boundary === "file" ? homeSqlitePath(source.home, MEMORY_LEDGER_STORE) : boundary === "directory" ? join(source.home, MEMORY_LEDGER_STORE) : source.home;
    const moved = `${targetPath}-original`;
    renameSync(targetPath, moved); symlinkSync(sourcePath, targetPath);
    try {
      assert.throws(() => target.owner.forget({ snapshot: target.snapshot, memory_id: "memory-a" }), { code: "storage.maintenance_path" });
      assert.throws(() => target.owner.verifyOriginal({ snapshot: target.snapshot }), { code: "storage.maintenance_path" });
      assert.deepEqual(state(source.home), sourceBefore);
    } finally { unlinkSync(targetPath); renameSync(moved, targetPath); }
    assert.deepEqual(state(target.home), targetBefore);
    target.owner.forget({ snapshot: target.snapshot, memory_id: "memory-a" });
  }
});

test("db and every SQLite sidecar reject links, and a disappeared Ledger is never recreated", t => {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) for (const kind of ["symbolic", "hard"]) {
    const target = fixture(t), source = fixture(t), path = homeSqlitePath(target.home, MEMORY_LEDGER_STORE) + suffix;
    const sourcePath = homeSqlitePath(source.home, MEMORY_LEDGER_STORE), before = readFileSync(sourcePath);
    if (!suffix) renameSync(path, `${path}-original`);
    if (kind === "symbolic") symlinkSync(sourcePath, path); else linkSync(sourcePath, path);
    try { assert.throws(() => target.owner.forget({ snapshot: target.snapshot, memory_id: "memory-a" }), { code: "storage.maintenance_path" }); }
    finally { unlinkSync(path); if (!suffix) renameSync(`${path}-original`, path); }
    assert.deepEqual(readFileSync(sourcePath), before);
  }
  const f = fixture(t), path = homeSqlitePath(f.home, MEMORY_LEDGER_STORE);
  renameSync(path, `${path}-original`);
  assert.throws(() => f.owner.forget({ snapshot: f.snapshot, memory_id: "memory-a" }), { code: "storage.maintenance_path" });
  assert.equal(existsSync(path), false);
});

test("column and JSON identity contradictions refuse both proof and all fixed-plan writes without erasing the unselected row", t => {
  for (const corruption of [
    `UPDATE memory_changes SET memory_id='keep' WHERE memory_id='memory-a'`,
    `INSERT INTO memory_candidates VALUES ('later-candidate','person','pending','{"candidate_id":"candidate-a","actor_id":"person","state":"pending","project_id":"project-a","scope":"project","owner":"project-a","memory_id":null}')`,
    `UPDATE memory_uses SET body=json_set(body,'$.memory_id','memory-a') WHERE memory_id='keep'`,
    `UPDATE memory_uses SET body=json_set(body,'$.receipt_id','other') WHERE memory_id='keep'`,
    `UPDATE memory_uses SET body=json_set(body,'$.at','after') WHERE memory_id='keep'`,
    `UPDATE memory_uses SET body=json_set(body,'$.work_id','other') WHERE memory_id='keep'`,
    `UPDATE memory_uses SET body=json_set(body,'$.state','omitted') WHERE memory_id='keep'`,
    `UPDATE memory_revisions SET body=json_set(body,'$.version',2) WHERE memory_id='keep'`,
    `INSERT INTO memory_pairs VALUES ('later-pair','person','pending','{"pair_id":"other","state":"pending","a":{"memory_id":"keep"},"b":{"memory_id":"keep"}}')`,
    `INSERT INTO memory_pairs VALUES ('later-pair','person','pending','{"pair_id":"later-pair","state":"resolved","a":{"memory_id":"keep"},"b":{"memory_id":"keep"}}')`,
  ]) {
    const f = fixture(t), snapshot = cleanObjects(f); access(f.home, db => db.exec(corruption));
    const before = state(f.home), original = createMemoryLedgerProjectRetention({ ...f.input, mode: "original" });
    assert.throws(() => original.verifyOriginal({ snapshot }), denied);
    assert.throws(() => f.owner.forgetScopes({ snapshot }), denied);
    assert.throws(() => f.owner.forget({ snapshot, memory_id: "memory-a" }), denied);
    assert.throws(() => f.owner.suppressSources({ snapshot, scope: "project", owner: "project-a", sources: plan().scopes[0]!.sources }), denied);
    assert.deepEqual(state(f.home), before);
  }
});

test("a directory swapped by a second SQLite writer during BEGIN lock wait is refused before retention writes", async t => {
  const target = fixture(t), source = fixture(t), before = state(source.home), original = state(target.home);
  const directory = join(target.home, MEMORY_LEDGER_STORE), moved = `${directory}-original`, status = new Int32Array(new SharedArrayBuffer(8));
  const worker = new Worker(`
    const { workerData } = require('node:worker_threads');
    const { DatabaseSync } = require('node:sqlite');
    const { renameSync, symlinkSync } = require('node:fs');
    const status = new Int32Array(workerData.status), db = new DatabaseSync(workerData.database);
    db.exec('BEGIN IMMEDIATE'); Atomics.store(status, 0, 1); Atomics.notify(status, 0);
    Atomics.wait(status, 1, 0, 5000);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    renameSync(workerData.directory, workerData.moved); symlinkSync(workerData.source, workerData.directory);
    db.exec('ROLLBACK'); db.close();
  `, { eval: true, workerData: { status: status.buffer, database: homeSqlitePath(target.home, MEMORY_LEDGER_STORE), directory, moved, source: join(source.home, MEMORY_LEDGER_STORE) } });
  const finished = new Promise<void>((resolve, reject) => { worker.once("error", reject); worker.once("exit", code => code === 0 ? resolve() : reject(new Error(`worker exit ${code}`))); });
  let armed = false;
  const owner = createMemoryLedgerProjectRetention({ ...target.input, assertCurrent: () => {
    if (armed) { armed = false; Atomics.store(status, 1, 1); Atomics.notify(status, 1); }
  } });
  try {
    if (Atomics.load(status, 0) === 0) Atomics.wait(status, 0, 0, 5000);
    assert.equal(Atomics.load(status, 0), 1); armed = true;
    const started = performance.now();
    assert.throws(() => owner.forget({ snapshot: target.snapshot, memory_id: "memory-a" }), { code: "storage.maintenance_path" });
    assert.ok(performance.now() - started >= 150, "the independent SQLite writer held the write lock before releasing it after path substitution");
    await finished;
  } finally {
    await worker.terminate();
    if (existsSync(moved)) { unlinkSync(directory); renameSync(moved, directory); }
  }
  assert.deepEqual(state(source.home), before); assert.deepEqual(state(target.home), original);
  owner.forget({ snapshot: target.snapshot, memory_id: "memory-a" });
});
