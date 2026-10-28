import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { copyFileSync, existsSync, linkSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { LOCAL_PERSON_ACTOR_ID as actor } from "@molis-ai/molis-work-contracts/platform/actions";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { homeSqlitePath, openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { characterOwner } from "@molis-ai/molis-work-service-memory";
import { ASSISTANT_STORE_NAME, AssistantStore, collectMemoryOwnerCoverage, molisWorkHostProjectReference,
  openAssistantMemoryRelations } from "@molis-ai/molis-work-app-local-host";

type Facts = Parameters<typeof collectMemoryOwnerCoverage>[0];
const emptyFacts = (): Facts => ({ projects: [], deletions: [], owners: [], assistant: [] });
const denied = { code: "memory.conflict" };

function home(t: TestContext): string {
  const value = realpathSync(mkdtempSync(join(tmpdir(), "molis-recovery-owner-coverage-")));
  t.after(() => rmSync(value, { recursive: true, force: true }));
  return value;
}

function fixture(t: TestContext) {
  const directory = home(t), db = openHomeSqliteDatabase(directory, ASSISTANT_STORE_NAME), store = new AssistantStore(db);
  let work = store.create({ actor_id: actor, title: "PRIVATE work title", scope: { kind: "project", project_id: "a" }, origin: null,
    project_ref: molisWorkHostProjectReference({ projectId: "a", databasePath: join(directory, "projects", "a", "project.db") }) });
  work = store.update(actor, work.work_id, work.revision, { archived: true, session_id: "original-session",
    character: { artifact_id: "current-character", version: 1, title: "PRIVATE current Character" } });
  store.addRound(work.work_id, { run_id: "old-round", text: "PRIVATE history", materials: [], context: null, started_at: "2026-10-25T00:00:00Z",
    character: { artifact_id: "historical-character", version: 1, title: "PRIVATE historical Character" } });
  db.close();
  return { directory, path: homeSqlitePath(directory, ASSISTANT_STORE_NAME), workId: work.work_id };
}

test("MEM-40-FRAME-06: the same pure join combines retained Catalog, ownership snapshots and exact Assistant Work relations", () => {
  const retained = characterOwner("deleted", "former-character"), assistant = characterOwner("a", "current-character");
  const facts: Facts = { projects: [{ project_id: "a" }], deletions: [{ project_id: "deleted", recovery: {
    version: 1, kind: "runtime", project_id: "deleted", operation_id: "delete-original",
    sessions: { project_id: "deleted", operation_id: "delete-original", sessions: [] },
    memory: { project_id: "deleted", operation_id: "delete-original", actor_id: actor,
      scopes: [{ scope: "character", owner: retained, memories: [], candidates: [], sources: [] }] },
  } }], owners: [{ scope: "character", owner: assistant, project_id: "a" }], assistant: [{ project_id: "a", subject: "current-character" }] };
  const before = structuredClone(facts), coverage = collectMemoryOwnerCoverage(facts);
  assert.deepEqual(coverage.forProject("a"), [{ scope: "character", owner: assistant }, { scope: "project", owner: "a" }]);
  assert.deepEqual(coverage.forProject("deleted"), [{ scope: "character", owner: retained }, { scope: "project", owner: "deleted" }]);
  assert.ok(coverage.knownScopes.some(row => row.scope === "user" && row.owner === actor));
  assert.equal(coverage.knownScopes.length, 5);
  assert.deepEqual(facts, before, "the join must not fill a missing persisted subject");
  coverage.knownScopes.length = 0;
  assert.equal(coverage.forProject("a").length, 2, "returned arrays do not own the retained relation join");
  assert.throws(() => coverage.forProject("missing"), denied);
});

test("MEM-40-FRAME-06: pure coverage rejects contrary owners, subjects, actors and parent project identities", () => {
  const owner = characterOwner("a", "writer");
  const cases: Facts[] = [
    { ...emptyFacts(), owners: [{ scope: "character", owner, project_id: "b" }], assistant: [{ project_id: "a", subject: "writer" }] },
    { ...emptyFacts(), owners: [{ scope: "character", owner, project_id: "a", subject: "other" }] },
    { ...emptyFacts(), owners: [{ scope: "character", owner, project_id: null }] },
    { ...emptyFacts(), owners: [{ scope: "personal", owner: "other-person", project_id: null }] },
    { ...emptyFacts(), owners: [{ scope: "project", owner: "a", project_id: "b" }] },
    { ...emptyFacts(), assistant: [{ project_id: "a", subject: "" }] },
    { ...emptyFacts(), deletions: [{ project_id: "a", recovery: { version: 1, kind: "absent", project_id: "b", operation_id: "original" } }] },
    { ...emptyFacts(), deletions: [{ project_id: "a", recovery: { version: 1, kind: "runtime", project_id: "a", operation_id: "original",
      sessions: { project_id: "a", operation_id: "original", sessions: [] },
      memory: { project_id: "a", operation_id: "original", actor_id: "other-person", scopes: [] } } }] },
  ];
  for (const facts of cases) assert.throws(() => collectMemoryOwnerCoverage(facts), denied);
});

test("MEM-40-FRAME-06: a retained Assistant reader returns only its persisted Work pair and leaves source bytes unchanged", t => {
  const f = fixture(t), before = readFileSync(f.path);
  const input = { homeDirectory: f.directory, assertCurrent() { input.homeDirectory = "/unrelated"; } };
  const reader = openAssistantMemoryRelations(input);
  try {
    assert.deepEqual(reader.read(), [{ project_id: "a", subject: "current-character" }]);
    const changed = reader.read(); changed.length = 0;
    assert.deepEqual(reader.read(), [{ project_id: "a", subject: "current-character" }]);
  } finally { reader.close(); }
  assert.deepEqual(readFileSync(f.path), before);
  assert.throws(() => reader.read(), denied);
});

test("MEM-40-FRAME-06: project inspection includes archived Works and observes an extra current association without disclosing its body", t => {
  const f = fixture(t), reader = openAssistantMemoryRelations({ homeDirectory: f.directory, assertCurrent() {} });
  const expected = (session_id: string, project_id = "a") => ({ session: { runtime_id: "prologue", session_id },
    owner: { project_id, plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID, actor_id: actor } });
  try {
    assert.deepEqual(reader.projectSessions("a"), [expected("original-session")]);
    const db = openHomeSqliteDatabase(f.directory, ASSISTANT_STORE_NAME), works = new AssistantStore(db);
    try {
      for (const [projectId, sessionId] of [["a", "extra-session"], ["b", "neighbor-session"], ["a", null]] as const) {
        const work = works.create({ actor_id: actor, title: "PRIVATE additional Work", scope: { kind: "project", project_id: projectId }, origin: null,
          project_ref: molisWorkHostProjectReference({ projectId, databasePath: join(f.directory, "projects", projectId, "project.db") }) });
        works.update(actor, work.work_id, work.revision, { session_id: sessionId });
      }
    } finally { db.close(); }
    const before = readFileSync(f.path), selected = reader.projectSessions("a");
    assert.deepEqual(selected.sort((a, b) => a.session.session_id.localeCompare(b.session.session_id)), [expected("extra-session"), expected("original-session")]);
    assert.deepEqual(reader.projectSessions("b"), [expected("neighbor-session", "b")]);
    selected[0]!.owner.project_id = "caller-mutated";
    assert.ok(reader.projectSessions("a").every(row => row.owner.project_id === "a"));
    assert.deepEqual(readFileSync(f.path), before);
  } finally { reader.close(); }
  assert.throws(() => reader.projectSessions("a"), denied);
});

test("MEM-40-FRAME-06: a retained project association does not invent a project owner for a personal Session", t => {
  const directory = home(t), db = openHomeSqliteDatabase(directory, ASSISTANT_STORE_NAME), works = new AssistantStore(db);
  const work = works.create({ actor_id: actor, title: "Retained association", scope: { kind: "project", project_id: "a" }, origin: null });
  works.update(actor, work.work_id, work.revision, { session_id: "personal-session", archived: true }); db.close();
  const reader = openAssistantMemoryRelations({ homeDirectory: directory, assertCurrent() {} });
  try {
    assert.deepEqual(reader.projectSessions("a"), [{ session: { runtime_id: "prologue", session_id: "personal-session" },
      owner: { project_id: ASSISTANT_PERSONAL_OWNER, plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID, actor_id: actor } }]);
  } finally { reader.close(); }
});

for (const [label, sql] of [
  ["mismatched Work identity", "UPDATE assistant_works SET body=json_set(body,'$.work_id','different-work')"],
  ["unknown actor", "UPDATE assistant_works SET actor_id='other-person', body=json_set(body,'$.actor_id','other-person')"],
  ["mismatched revision", "UPDATE assistant_works SET body=json_set(body,'$.revision',99)"],
  ["unknown association before filtering", "UPDATE assistant_works SET body=json_remove(json_set(body,'$.scope.kind','unknown'),'$.project_ref')"],
  ["contradictory project identities", "UPDATE assistant_works SET body=json_set(body,'$.scope.project_id','other-project')"],
  ["unknown Session", "UPDATE assistant_works SET body=json_remove(body,'$.session_id')"],
  ["malformed Work body", "UPDATE assistant_works SET body='unreadable'"],
] as const) test(`MEM-40-FRAME-06: project inspection rejects ${label} instead of reporting absence`, t => {
  const f = fixture(t), db = new DatabaseSync(f.path); db.exec(sql); db.close();
  const reader = openAssistantMemoryRelations({ homeDirectory: f.directory, assertCurrent() {} });
  try { assert.throws(() => reader.projectSessions("a"), { code: "assistant.conflict" }); } finally { reader.close(); }
});

test("MEM-40-FRAME-06: an absent Assistant store remains absent and its later appearance invalidates that reader", t => {
  const directory = home(t), file = homeSqlitePath(directory, ASSISTANT_STORE_NAME);
  let currentCalls = 0;
  const reader = openAssistantMemoryRelations({ homeDirectory: directory, assertCurrent() { currentCalls++; } });
  assert.deepEqual(reader.read(), []); assert.deepEqual(reader.projectSessions("a"), []);
  assert.equal(existsSync(dirname(file)), false);
  const created = openHomeSqliteDatabase(directory, ASSISTANT_STORE_NAME); new AssistantStore(created); created.close();
  assert.throws(() => reader.read(), { code: "storage.maintenance_path" });
  assert.throws(() => reader.projectSessions("a"), { code: "storage.maintenance_path" });
  const beforeClose = currentCalls; reader.close(); reader.close(); assert.equal(currentCalls, beforeClose);
});

for (const query of ["relations", "project Sessions"] as const) test(`MEM-40-FRAME-06: final current rejection withholds nonempty ${query} while close works after withdrawal`, t => {
  const f = fixture(t), prepare = DatabaseSync.prototype.prepare;
  let queried = false, currentCalls = 0;
  const revoked = new Error("authority withdrawn after actual Work query");
  t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
    const result = prepare.call(this, sql);
    if (sql.includes("SELECT work_id, actor_id")) queried = true;
    return result;
  });
  const reader = openAssistantMemoryRelations({ homeDirectory: f.directory, assertCurrent() { currentCalls++; if (queried) throw revoked; } });
  assert.throws(() => query === "relations" ? reader.read() : reader.projectSessions("a"), error => error === revoked); assert.equal(queried, true);
  const beforeClose = currentCalls; reader.close(); assert.equal(currentCalls, beforeClose);
  assert.throws(() => reader.read(), denied);
  assert.throws(() => reader.projectSessions("a"), denied);
});

test("MEM-40-FRAME-06: synchronous current-triggered close rejects before the next SQL operation", t => {
  const f = fixture(t);
  let closeInside = false, queries = 0;
  let reader: ReturnType<typeof openAssistantMemoryRelations> | undefined;
  reader = openAssistantMemoryRelations({ homeDirectory: f.directory, assertCurrent() { if (closeInside) reader!.close(); } });
  const prepare = DatabaseSync.prototype.prepare;
  t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) { queries++; return prepare.call(this, sql); });
  closeInside = true;
  assert.throws(() => reader!.read(), denied); assert.equal(queries, 0);
  assert.throws(() => reader!.projectSessions("a"), denied); assert.equal(queries, 0);
  reader.close();
});

for (const physicallyClosed of [false, true]) test(`MEM-40-FRAME-06: close failure ${physicallyClosed ? "after" : "before"} native disposal retains only the original connection`, t => {
  const f = fixture(t), reader = openAssistantMemoryRelations({ homeDirectory: f.directory, assertCurrent() {} });
  assert.equal(reader.projectSessions("a").length, 1);
  const close = DatabaseSync.prototype.close;
  const observed: { connection?: DatabaseSync } = {};
  let calls = 0, sqlCalls = 0;
  t.mock.method(DatabaseSync.prototype, "close", function(this: DatabaseSync) {
    calls++; observed.connection = this;
    if (calls === 1) { if (physicallyClosed) close.call(this); throw new Error("actual close fault"); }
    return close.call(this);
  });
  const prepare = DatabaseSync.prototype.prepare;
  t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) { sqlCalls++; return prepare.call(this, sql); });
  assert.throws(() => reader.close(), /actual close fault/);
  assert.ok(observed.connection); assert.equal(observed.connection.isOpen, !physicallyClosed);
  assert.throws(() => reader.read(), denied);
  assert.throws(() => reader.projectSessions("a"), denied);
  reader.close(); reader.close();
  assert.equal(observed.connection.isOpen, false); assert.equal(calls, physicallyClosed ? 1 : 2); assert.equal(sqlCalls, 0);
});

test("MEM-40-FRAME-06: initializer rejection and native close failure preserve both errors and a close-only retry", async t => {
  const f = fixture(t), close = DatabaseSync.prototype.close;
  const observed: { connection?: DatabaseSync } = {};
  let closeCalls = 0, currentCalls = 0;
  const rejection = new Error("initializer current refusal"), closeFailure = new Error("native close refusal");
  t.mock.method(DatabaseSync.prototype, "close", function(this: DatabaseSync) {
    if (!this.prepare("PRAGMA database_list").all().some(row => row.file === f.path)) return close.call(this);
    observed.connection = this;
    if (++closeCalls === 1) throw closeFailure;
    return close.call(this);
  });
  let failure: unknown;
  try { openAssistantMemoryRelations({ homeDirectory: f.directory, assertCurrent() { if (++currentCalls === 3) throw rejection; } }); }
  catch (error) { failure = error; }
  assert.ok(failure instanceof AggregateError); assert.equal(failure.cause, rejection);
  assert.deepEqual(failure.errors, [rejection, closeFailure]);
  assert.ok("close" in failure && typeof failure.close === "function"); assert.equal(Object.keys(failure).includes("close"), false);
  assert.ok(observed.connection); assert.equal(observed.connection.isOpen, true);
  const beforeRetry = currentCalls;
  const retry = failure.close;
  await retry(); await retry();
  assert.equal(observed.connection.isOpen, false); assert.equal(closeCalls, 2); assert.equal(currentCalls, beforeRetry);
});

test("MEM-40-FRAME-06: unknown Assistant schema and contradictory Work relations never become an empty result", t => {
  const f = fixture(t), db = new DatabaseSync(f.path);
  try {
    db.exec("PRAGMA user_version=999");
    assert.throws(() => openAssistantMemoryRelations({ homeDirectory: f.directory, assertCurrent() {} }));
    db.exec("PRAGMA user_version=3");
    db.prepare("UPDATE assistant_works SET body=json_set(body,'$.scope.project_id','different') WHERE work_id=?").run(f.workId);
  } finally { db.close(); }
  const reader = openAssistantMemoryRelations({ homeDirectory: f.directory, assertCurrent() {} });
  try { assert.throws(() => reader.read(), denied); } finally { reader.close(); }
});

test("MEM-40-FRAME-06: a reader rejects a replaced database without reopening it", t => {
  const f = fixture(t), reader = openAssistantMemoryRelations({ homeDirectory: f.directory, assertCurrent() {} });
  const original = `${f.path}.original`;
  renameSync(f.path, original); copyFileSync(original, f.path);
  const replacement = readFileSync(f.path);
  try {
    assert.throws(() => reader.read(), { code: "storage.maintenance_path" });
    assert.throws(() => reader.projectSessions("a"), { code: "storage.maintenance_path" });
  } finally { reader.close(); }
  assert.deepEqual(readFileSync(f.path), replacement);
});

test("MEM-40-FRAME-06: a current callback that replaces the database cannot deliver project associations", t => {
  const f = fixture(t), prepare = DatabaseSync.prototype.prepare;
  let replace = false, workQueries = 0;
  const reader = openAssistantMemoryRelations({ homeDirectory: f.directory, assertCurrent() {
    if (replace) { replace = false; renameSync(f.path, `${f.path}.original`); copyFileSync(`${f.path}.original`, f.path); }
  } });
  t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
    if (sql.includes("FROM assistant_works")) workQueries++;
    return prepare.call(this, sql);
  });
  replace = true;
  try {
    assert.throws(() => reader.projectSessions("a"), { code: "storage.maintenance_path" });
    assert.equal(workQueries, 0);
  } finally { reader.close(); }
});

for (const kind of ["hardlink", "ancestor-link", "sidecar-link"] as const)
  test(`MEM-40-FRAME-06: existing-only Assistant inspection rejects ${kind}`, t => {
    const f = fixture(t);
    if (kind === "hardlink") linkSync(f.path, `${f.path}.shared`);
    else if (kind === "ancestor-link") {
      const directory = dirname(f.path); renameSync(directory, `${directory}-original`); symlinkSync(`${directory}-original`, directory);
    } else {
      const sidecar = join(f.directory, "foreign-sidecar"); writeFileSync(sidecar, "untouched"); symlinkSync(sidecar, `${f.path}-wal`);
    }
    assert.throws(() => openAssistantMemoryRelations({ homeDirectory: f.directory, assertCurrent() {} }), { code: "storage.maintenance_path" });
  });
