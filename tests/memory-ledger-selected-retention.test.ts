import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { beginMemoryLedgerAdoption, createMemoryLedgerProjectRetention, createMemoryLedgerSelectedRetention, homeSqlitePath,
  inspectMemoryLedgerAdoption, MEMORY_LEDGER_BASELINE, MEMORY_LEDGER_STORE, type MemoryLedgerSelectedRetentionPlan } from "@molis-ai/molis-work-storage";

const denied = { code: "memory.adoption_conflict" };
const identities = [
  { scope: "personal", owner: "person", project_id: null },
  { scope: "project", owner: "project-a", project_id: "project-a" },
  { scope: "character", owner: "character-b", project_id: "project-b" },
  { scope: "project", owner: "project-b", project_id: "project-b" },
] as const;
const plan = (): MemoryLedgerSelectedRetentionPlan => ({ actor_id: "person", operation_id: "fixed-selection", scopes: identities.map(({ scope, owner }) => ({
  scope, owner, memories: [{ memory_id: `selected-${owner}`, version: 2 }], candidates: [{ candidate_id: `candidate-${owner}`, version: 1 }],
  sources: [{ event_id: `source-${owner}`, version: "2" }, { event_id: `barrier-${owner}` }],
})) });
const tables = ["memory_revisions", "memory_uses", "memory_pairs", "memory_changes", "memory_candidates", "memory_markers", "memory_owners", "memory_prefs", "memory_signal_events"];
const pathOf = (home: string) => homeSqlitePath(home, MEMORY_LEDGER_STORE);
function access<T>(home: string, work: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(pathOf(home));
  try { return work(db); } finally { db.close(); }
}
const state = (home: string) => access(home, db => Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()])));

function fixture(t: TestContext) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "molis-selected-retention-"))); t.after(() => rmSync(home, { recursive: true, force: true }));
  mkdirSync(join(home, MEMORY_LEDGER_STORE));
  access(home, db => {
    db.exec(MEMORY_LEDGER_BASELINE.schema); db.exec("PRAGMA user_version=3; PRAGMA journal_mode=DELETE");
    for (const key of ["personal", "project-default", "project:project-a", "project:project-b"]) db.prepare("INSERT INTO memory_prefs VALUES (?,?,?)")
      .run("person", key, JSON.stringify({ form: true, key }));
    db.prepare("INSERT INTO memory_markers VALUES ('person','strategy-adoption','before',?)").run(JSON.stringify({ origin: "existing-home" }));
    for (const identity of identities) {
      const { scope, owner, project_id } = identity;
      db.prepare("INSERT INTO memory_owners VALUES (?,?,?,?,?)").run(scope, owner, project_id, "title", owner);
      db.prepare("INSERT INTO memory_signal_events VALUES (?,?,?,?,?)").run(`event-${owner}`, "person", `${scope}|${owner}|signal`, "once", "before");
      db.prepare("INSERT INTO memory_markers VALUES ('person',?,'before',?)").run(`tidy:${scope}:${owner}`, JSON.stringify({ value: owner }));
      for (const prefix of ["selected", "neighbor"]) {
        const id = `${prefix}-${owner}`;
        db.prepare("INSERT INTO memory_revisions VALUES (?,1,?)").run(id, JSON.stringify({ version: 1, text: `${id} revision` }));
        db.prepare("INSERT INTO memory_uses VALUES (?,?,'before',NULL,'response-observed',?)").run(id, `receipt-${id}`, JSON.stringify({
          memory_id: id, receipt_id: `receipt-${id}`, at: "before", work_id: null, state: "response-observed", consumer: "assistant", title: `${id} use` }));
        db.prepare("INSERT INTO memory_changes VALUES (?,'person',?,'before',?)").run(`change-${id}`, id, JSON.stringify({
          change_id: `change-${id}`, actor_id: "person", at: "before", memory_id: id, ...identity, text: `${id} change`, reason: "reason", undoable: true, undo: { text: "private undo" } }));
        db.prepare("INSERT INTO memory_pairs VALUES (?,'person','pending',?)").run(`pair-${id}`, JSON.stringify({ pair_id: `pair-${id}`, state: "pending", ...identity,
          a: { memory_id: id }, b: { memory_id: `neighbor-${owner}` } }));
      }
      for (const prefix of ["candidate", "neighbor-candidate"]) {
        const id = `${prefix}-${owner}`;
        db.prepare("INSERT INTO memory_candidates VALUES (?,'person','pending',?)").run(id, JSON.stringify({ candidate_id: id, actor_id: "person", state: "pending",
          ...identity, memory_id: null, text: `${id} text`, why: "source text" }));
      }
    }
  });
  const snapshot = beginMemoryLedgerAdoption({ homeDirectory: home, snapshot: inspectMemoryLedgerAdoption({ homeDirectory: home }) });
  const input = { homeDirectory: home, plan: plan(), mode: "cleanup" as const, assertCurrent: () => {} };
  return { home, snapshot, input, owner: createMemoryLedgerSelectedRetention(input) };
}
function clean(f: ReturnType<typeof fixture>) {
  let snapshot = f.snapshot;
  for (const target of f.input.plan.scopes) {
    snapshot = f.owner.suppressSources({ snapshot, scope: target.scope, owner: target.owner, sources: target.sources });
    for (const item of target.candidates) snapshot = f.owner.dropCandidate({ snapshot, candidate_id: item.candidate_id });
    for (const item of target.memories) snapshot = f.owner.forget({ snapshot, memory_id: item.memory_id });
  }
  return snapshot;
}

test("MEM-40-SELECTED-01/03: multi-scope exact cleanup preserves neighbors, owners, all preferences and signals", t => {
  const f = fixture(t), before = state(f.home), snapshot = clean(f), after = state(f.home);
  assert.deepEqual(Object.keys(f.owner).sort(), ["dropCandidate", "forget", "suppressSources", "verifyOriginal"]);
  assert.deepEqual(snapshot, inspectMemoryLedgerAdoption({ homeDirectory: f.home }));
  assert.deepEqual(snapshot, f.snapshot, "these selected writes do not change adoption identities");
  for (const table of ["memory_owners", "memory_prefs", "memory_signal_events"]) assert.deepEqual(after[table], before[table]);
  assert.deepEqual(after.memory_markers!.filter(row => String(row.key).startsWith("tidy:")), before.memory_markers!.filter(row => String(row.key).startsWith("tidy:")));
  for (const table of ["memory_revisions", "memory_uses"]) assert.deepEqual(after[table], before[table]!.filter(row => String(row.memory_id).startsWith("neighbor-")));
  assert.deepEqual(after.memory_pairs, before.memory_pairs!.filter(row => String(row.pair_id).startsWith("pair-neighbor-")));
  assert.deepEqual(after.memory_candidates, before.memory_candidates!.filter(row => String(row.candidate_id).startsWith("neighbor-")));
  for (const change of after.memory_changes!) {
    if (String(change.memory_id).startsWith("neighbor-")) assert.deepEqual(change, before.memory_changes!.find(row => row.change_id === change.change_id));
    else {
      const body = JSON.parse(String(change.body)); assert.deepEqual([body.text, body.reason, body.undoable, body.undo], ["", null, false, null]);
    }
  }
  f.owner.verifyOriginal({ snapshot });
  assert.deepEqual(clean(f), snapshot, "the same fixed choice retries without clearing the scope");
});

test("MEM-40-SELECTED-02: a bare event barrier needs no invented version and only the original source tuple is authorized", t => {
  const f = fixture(t), before = state(f.home), choice: MemoryLedgerSelectedRetentionPlan = { actor_id: "person", operation_id: "event-barrier", scopes: [
    { scope: "project", owner: "project-a", memories: [], candidates: [], sources: [{ event_id: "bare" }, { event_id: "versioned", version: "3" }] },
  ] }, owner = createMemoryLedgerSelectedRetention({ ...f.input, plan: choice });
  for (const sources of [[{ event_id: "bare", version: "3" }], [{ event_id: "versioned" }], [{ event_id: "versioned", version: "4" }]])
    assert.throws(() => owner.suppressSources({ snapshot: f.snapshot, scope: "project", owner: "project-a", sources }), denied);
  assert.deepEqual(state(f.home), before);
  const post = owner.suppressSources({ snapshot: f.snapshot, scope: "project", owner: "project-a", sources: choice.scopes[0]!.sources });
  owner.verifyOriginal({ snapshot: post });
  const after = state(f.home);
  for (const table of tables.filter(table => table !== "memory_markers")) assert.deepEqual(after[table], before[table]);
  assert.equal(after.memory_markers!.length, before.memory_markers!.length + 2);
  for (const row of after.memory_markers!.filter(row => String(row.key).startsWith("memory-source-forgotten:")))
    assert.deepEqual(Object.keys(JSON.parse(String(row.body))), ["event_id"]);
  assert.throws(() => createMemoryLedgerProjectRetention({ ...f.input, plan: { ...choice, project_id: "project-a" } as never }), denied);
});

test("MEM-40-SELECTED-01: scope/ID ambiguity, actor substitution and malformed plans are rejected before effects", t => {
  const f = fixture(t), original = plan(), before = state(f.home);
  const invalid = [
    { ...original, project_id: "project-a" },
    { ...original, actor_id: "other" },
    { ...original, scopes: [...original.scopes, original.scopes[0]!] },
    { ...original, scopes: [{ ...original.scopes[1]!, memories: original.scopes[0]!.memories }, original.scopes[0]!] },
    { ...original, scopes: [{ ...original.scopes[1]!, candidates: original.scopes[0]!.candidates }, original.scopes[0]!] },
    { ...original, scopes: [{ ...original.scopes[0]!, sources: [{ event_id: "bare", version: "" }] }] },
    { ...original, scopes: [{ ...original.scopes[0]!, sources: [{ event_id: "bare", version: undefined }] }] },
    { ...original, scopes: [{ ...original.scopes[0]!, memories: [{ memory_id: "selected-person", version: 0 }] }] },
  ];
  for (const choice of invalid) assert.throws(() => createMemoryLedgerSelectedRetention({ ...f.input, plan: choice }), denied);
  assert.deepEqual(state(f.home), before);
});

test("MEM-40-SELECTED-01/04: callback mutation cannot replace captured plans, requests or expected snapshots", t => {
  const f = fixture(t), original = structuredClone(plan()), owner = createMemoryLedgerSelectedRetention({ ...f.input, plan: original, assertCurrent: () => {
    Object.assign(original, { operation_id: "changed", scopes: [{ scope: "project", owner: "project-a", memories: [{ memory_id: "neighbor-project-a", version: 2 }], candidates: [], sources: [] }] });
  } }), before = state(f.home);
  assert.throws(() => owner.forget({ snapshot: f.snapshot, memory_id: "neighbor-project-a" }), denied);
  assert.throws(() => owner.dropCandidate({ snapshot: f.snapshot, candidate_id: "neighbor-candidate-project-a" }), denied);
  assert.throws(() => owner.suppressSources({ snapshot: f.snapshot, scope: "project", owner: "unselected", sources: [] }), denied);
  assert.throws(() => owner.forget({ snapshot: f.snapshot, memory_id: "selected-person", owner: "other" } as never), denied);
  assert.deepEqual(state(f.home), before);
  const request = { snapshot: f.snapshot, memory_id: "selected-person" }; let armed = false;
  const captured = createMemoryLedgerSelectedRetention({ ...f.input, assertCurrent: () => { if (armed) request.memory_id = "neighbor-person"; } });
  armed = true; captured.forget(request);
  assert.equal(state(f.home).memory_revisions!.some(row => row.memory_id === "neighbor-person"), true);
  const expected = structuredClone(f.snapshot); armed = false;
  const stale = createMemoryLedgerSelectedRetention({ ...f.input, assertCurrent: () => {
    if (!armed) return; armed = false; access(f.home, db => db.exec("PRAGMA user_version=4"));
    Object.assign(expected, inspectMemoryLedgerAdoption({ homeDirectory: f.home }));
  } });
  const prior = state(f.home); armed = true;
  assert.throws(() => stale.forget({ snapshot: expected, memory_id: "selected-project-a" }), denied);
  assert.equal(expected.version, 4); assert.deepEqual(state(f.home), prior);
});

test("MEM-40-SELECTED-04: real write-journal observation revokes or cancels after mutation and rolls back every copy", t => {
  for (const kind of ["revoke", "cancel"]) {
    const f = fixture(t), before = state(f.home), abort = new AbortController(), failure = new Error(kind);
    let observedWrite = false;
    const owner = createMemoryLedgerSelectedRetention({ ...f.input, signal: abort.signal, assertCurrent: () => {
      const journal = `${pathOf(f.home)}-journal`;
      if (existsSync(journal) && statSync(journal).size > 0) {
        observedWrite = true; if (kind === "cancel") abort.abort(failure); else throw failure;
      }
    } });
    assert.throws(() => owner.forget({ snapshot: f.snapshot, memory_id: "selected-person" }), error => error === failure);
    assert.equal(observedWrite, true); assert.deepEqual(state(f.home), before);
  }
});

test("MEM-40-SELECTED-04: a real SQLite reader prevents COMMIT, returns no post, and the original selection retries", t => {
  const f = fixture(t), before = state(f.home), reader = new DatabaseSync(pathOf(f.home), { readOnly: true });
  let post: unknown, observedWrite = false;
  const owner = createMemoryLedgerSelectedRetention({ ...f.input, assertCurrent: () => {
    const journal = `${pathOf(f.home)}-journal`; if (existsSync(journal) && statSync(journal).size > 0) observedWrite = true;
  } });
  try {
    reader.exec("BEGIN"); reader.prepare("SELECT * FROM memory_revisions").all();
    assert.throws(() => { post = owner.forget({ snapshot: f.snapshot, memory_id: "selected-person" }); }, error =>
      error instanceof Error && "errcode" in error && error.errcode === 5);
    assert.equal(observedWrite, true, "BEGIN succeeded and the real write reached COMMIT");
    assert.equal(post, undefined); assert.deepEqual(state(f.home), before);
  } finally { reader.close(); }
  const snapshot = owner.forget({ snapshot: f.snapshot, memory_id: "selected-person" });
  assert.deepEqual(snapshot, inspectMemoryLedgerAdoption({ homeDirectory: f.home }));
  assert.equal(state(f.home).memory_revisions!.some(row => row.memory_id === "selected-person"), false);
});

test("MEM-40-SELECTED-04/05: contradictory column/JSON identities reject all writes and proof without erasing evidence", t => {
  for (const corruption of [
    "UPDATE memory_changes SET body=json_set(body,'$.memory_id','neighbor-person') WHERE memory_id='selected-person'",
    "UPDATE memory_candidates SET body=json_set(body,'$.actor_id','other') WHERE candidate_id='candidate-person'",
    "UPDATE memory_uses SET body=json_set(body,'$.receipt_id','wrong') WHERE memory_id='selected-person'",
    "UPDATE memory_revisions SET body=json_set(body,'$.version',2) WHERE memory_id='selected-person'",
    "UPDATE memory_pairs SET body=json_set(body,'$.pair_id','wrong') WHERE pair_id='pair-selected-person'",
  ]) {
    const f = fixture(t); access(f.home, db => db.exec(corruption)); const before = state(f.home);
    assert.throws(() => f.owner.forget({ snapshot: f.snapshot, memory_id: "selected-person" }), denied);
    assert.throws(() => f.owner.dropCandidate({ snapshot: f.snapshot, candidate_id: "candidate-person" }), denied);
    assert.throws(() => f.owner.suppressSources({ snapshot: f.snapshot, scope: "personal", owner: "person", sources: plan().scopes[0]!.sources }), denied);
    assert.throws(() => f.owner.verifyOriginal({ snapshot: f.snapshot }), denied);
    assert.deepEqual(state(f.home), before);
  }
});

test("MEM-40-SELECTED-03: a valid candidate with a different bound actor or scope is never deleted", t => {
  const f = fixture(t), before = state(f.home), choices = [
    { actor_id: "other", scope: "project" as const, owner: "project-a", id: "candidate-project-a" },
    { actor_id: "person", scope: "project" as const, owner: "project-b", id: "candidate-project-a" },
  ];
  for (const { actor_id, scope, owner, id } of choices) {
    const selected = createMemoryLedgerSelectedRetention({ ...f.input, plan: { actor_id, operation_id: "wrong-identity", scopes: [
      { scope, owner, memories: [], candidates: [{ candidate_id: id, version: 1 }], sources: [] },
    ] } });
    assert.throws(() => selected.dropCandidate({ snapshot: f.snapshot, candidate_id: id }), denied);
    assert.deepEqual(state(f.home), before);
  }
});

test("MEM-40-SELECTED-05: original is strictly read-only and a forgotten marker cannot replace real retention proof", t => {
  const f = fixture(t), original = createMemoryLedgerSelectedRetention({ ...f.input, mode: "original" }), before = state(f.home), bytes = readFileSync(pathOf(f.home));
  assert.throws(() => original.forget({ snapshot: f.snapshot, memory_id: "selected-person" }), denied);
  assert.throws(() => original.dropCandidate({ snapshot: f.snapshot, candidate_id: "candidate-person" }), denied);
  assert.throws(() => original.suppressSources({ snapshot: f.snapshot, scope: "personal", owner: "person", sources: [] }), denied);
  assert.throws(() => original.verifyOriginal({ snapshot: f.snapshot }), denied);
  assert.deepEqual(state(f.home), before); assert.deepEqual(readFileSync(pathOf(f.home)), bytes);
  access(f.home, db => db.prepare("INSERT INTO memory_markers VALUES ('','memory-forgotten:selected-person','after',?)")
    .run(JSON.stringify({ memory_id: "selected-person", state: "forgotten" })));
  assert.throws(() => original.verifyOriginal({ snapshot: f.snapshot }), denied);
  const snapshot = clean(f), after = state(f.home), cleanBytes = readFileSync(pathOf(f.home));
  original.verifyOriginal({ snapshot }); assert.deepEqual(state(f.home), after); assert.deepEqual(readFileSync(pathOf(f.home)), cleanBytes);
});

test("MEM-40-SELECTED-05: exact original proof rejects every retained-copy family and a missing source barrier", t => {
  for (const corruption of [
    `INSERT INTO memory_revisions VALUES ('selected-person',2,'{"version":2,"text":"late"}')`,
    `INSERT INTO memory_uses VALUES ('selected-person','late','after',NULL,'response-observed','{"memory_id":"selected-person","receipt_id":"late","at":"after","work_id":null,"state":"response-observed"}')`,
    `INSERT INTO memory_pairs VALUES ('late','person','pending','{"pair_id":"late","state":"pending","a":{"memory_id":"selected-person"},"b":{"memory_id":"neighbor-person"}}')`,
    "UPDATE memory_changes SET body=json_set(body,'$.undo',json('{\"text\":\"late\"}')) WHERE memory_id='selected-person'",
    "UPDATE memory_candidates SET body=json_set(body,'$.memory_id','selected-person') WHERE candidate_id='neighbor-candidate-person'",
    `INSERT INTO memory_candidates VALUES ('candidate-person','person','pending','{"candidate_id":"candidate-person","actor_id":"person","state":"pending","scope":"personal","owner":"person","project_id":null,"memory_id":null}')`,
    "DELETE FROM memory_markers WHERE key LIKE 'memory-source-forgotten:%'",
  ]) {
    const f = fixture(t), snapshot = clean(f); access(f.home, db => db.exec(corruption)); const before = state(f.home);
    const original = createMemoryLedgerSelectedRetention({ ...f.input, mode: "original" });
    assert.throws(() => original.verifyOriginal({ snapshot }), denied); assert.deepEqual(state(f.home), before);
  }
});

test("MEM-40-SELECTED-04/06: missing or redirected target cannot create a Ledger or touch the source", t => {
  const f = fixture(t), missing = join(f.home, "missing"), absent = createMemoryLedgerSelectedRetention({ ...f.input, homeDirectory: missing });
  assert.throws(() => absent.forget({ snapshot: f.snapshot, memory_id: "selected-person" }));
  assert.throws(() => absent.verifyOriginal({ snapshot: f.snapshot })); assert.equal(existsSync(missing), false);
  const source = fixture(t), sourceBefore = state(source.home), targetBefore = state(f.home), held = `${f.home}-held`;
  renameSync(f.home, held); t.after(() => rmSync(held, { recursive: true, force: true })); symlinkSync(source.home, f.home, "dir");
  assert.throws(() => f.owner.forget({ snapshot: f.snapshot, memory_id: "selected-person" }));
  assert.throws(() => f.owner.dropCandidate({ snapshot: f.snapshot, candidate_id: "candidate-person" }));
  assert.throws(() => f.owner.suppressSources({ snapshot: f.snapshot, scope: "personal", owner: "person", sources: plan().scopes[0]!.sources }));
  assert.throws(() => f.owner.verifyOriginal({ snapshot: f.snapshot }));
  assert.deepEqual(state(source.home), sourceBefore); assert.deepEqual(state(held), targetBefore);
});
