import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { LocalProjectDatabase, AssistantStore, createSessionBusinessPurgeOwner, ASSISTANT_STORE_NAME, type SessionBusinessPurgeOwner } from "@molis-ai/molis-work-app-local-host";
import { LocalSqliteStorage, openHomeSqliteDatabase, homeSqlitePath, openExistingSqliteConnection } from "@molis-ai/molis-work-storage";
import { writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { PluginRuntime, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { createCodingPlugin, codingManifest, CODING_PLUGIN_ID } from "@molis-ai/molis-work-plugin-coding";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PLUGIN_ID, ASSISTANT_PERSONAL_OWNER } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentSessionOwner } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";

const at = "2026-10-26T00:00:00.000Z", session = { runtime_id: "prologue", session_id: "canonical-original" };
const assistantOwner = { actor_id: "person", plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID, project_id: ASSISTANT_PERSONAL_OWNER };
function home(t: TestContext) { const path = mkdtempSync("/private/tmp/molis-session-business-"); t.after(() => rmSync(path, { recursive: true, force: true })); return path; }
function owner(t: TestContext, directory: string, project: string, current: () => void = () => {}): SessionBusinessPurgeOwner {
  const value = createSessionBusinessPurgeOwner({ homeDirectory: directory, assertCurrent: current,
    projectDatabase: id => { assert.equal(id, "project"); return { path: project, assertCurrent: current }; } });
  t.after(() => value.close()); return value;
}
async function coding(t: TestContext, runtimeId = session.runtime_id) {
  const directory = home(t), path = join(directory, "project.db"), store = new LocalProjectDatabase(path);
  writeProjectRoot(store.db, "project", at);
  const repository = new SqlitePluginRuntimeRepository(store.db), runtime = new PluginRuntime(repository, undefined, { hostIds: new Set([CODING_PLUGIN_ID]) });
  const install = runtime.install({ definition: createCodingPlugin(), deployment: "local", trust: { level: "host" },
    grants: codingManifest.permissions.map(item => item.permission) }).install;
  const binding: AgentSessionOwner = { project_id: "project", actor_id: "person", plugin_id: CODING_PLUGIN_ID, install_id: install.install_id };
  const sessions = codingSessions(store);
  for (const [id, canonical] of [["original", session.session_id], ["neighbor", "other-canonical"]]) {
    await sessions.create(noEffect, { project_id: "project", session_id: id!, title: id!, runtime_id: runtimeId, at });
    await sessions.setRuntimeSession(noEffect, "project", id!, canonical!, at);
  }
  const set = (installId: string, key: string, value: string) => store.db.prepare("INSERT INTO plugin_private_values VALUES (?, ?, ?)").run(installId, key, value);
  for (const key of ["draft:original", "cards:original", "step-verdict:original:step", "wake-note:wait-original", "queued:wait-original", "draft:neighbor", "queued:wait-neighbor", "goal-title:shared-goal"])
    set(install.install_id, key, `secret:${key}`);
  set("another-install", "draft:original", "independent");
  store.db.prepare("INSERT INTO coding_plan_drafts VALUES (?, ?, ?, ?)").run("project", "original", 1, "private draft");
  const snapshot = () => ({ sessions: store.db.prepare("SELECT * FROM coding_sessions ORDER BY session_id").all(),
    drafts: store.db.prepare("SELECT * FROM coding_plan_drafts ORDER BY session_id").all(), private: store.db.prepare("SELECT * FROM plugin_private_values ORDER BY install_id,item_key").all() });
  t.after(() => store.close()); return { directory, path, store, install, binding, repository, sessions, snapshot };
}
function assistant(t: TestContext) {
  const directory = home(t), db = openHomeSqliteDatabase(directory, ASSISTANT_STORE_NAME), store = new AssistantStore(db, () => new Date(at));
  const create = (canonical: string, actor = "person") => {
    const work = store.create({ actor_id: actor, title: "independent work", scope: { kind: "personal" }, origin: null });
    return store.update(actor, work.work_id, work.revision, { session_id: canonical, draft: "work-owned private text" });
  };
  const work = create(session.session_id), neighbor = create("other-canonical"), foreign = create(session.session_id, "another-person");
  for (const item of [work, neighbor, foreign]) {
    store.addRound(item.work_id, { run_id: `run-${item.work_id}`, executor: "plugin", text: "independent result", materials: [], context: null, started_at: at });
    store.addCard({ card_id: `card-${item.work_id}`, work_id: item.work_id, revision: 1, run_id: null, title: "own card", summary: "private card",
      provider: "fixture", capability_title: "fixture", effect: "read", reference: { capability_id: "fixture.read", version: 1, provider_id: "fixture" },
      input: { text: "private input" }, input_schema: {}, editable: [], missing: [], status: "ready", created_at: at, updated_at: at });
    store.claimRequest(item.actor_id, `send-${item.work_id}`);
    store.finishRequest(item.actor_id, `send-${item.work_id}`, { work: { ...item, state: "idle", delegated_by: undefined }, outcome: "started" });
    store.usage.record(item.actor_id, { work_id: item.work_id, run_id: `run-${item.work_id}`, ended_at: at, input: 10, output: 20, cached: 0 });
    store.relations.link({ work_id: item.work_id, project_id: null }, "material", { kind: "note", id: "kept-note", revision: "1" }, "private relation cause");
  }
  store.relations.unlink({ work_id: work.work_id, project_id: null }, "material", { kind: "note", id: "kept-note" }, "private removed cause");
  const path = homeSqlitePath(directory, ASSISTANT_STORE_NAME);
  const ledgerDb = new LocalSqliteStorage(path), access = { actor_id: "module:assistant", scope: { kind: "personal" as const, id: "assistant" } };
  const ledger = createContextLedger(ledgerDb.db, { initializeSchema: false, authorize: () => true });
  const ref = (id: string) => ({ module: "assistant" as const, id, version: null, scope: access.scope, project_id: null, object_type: "work" });
  ledger.commands.put(access, { key: "incoming-owned-by-neighbor", type: "assistant.reference", source: ref(neighbor.work_id), target: ref(work.work_id), cause: "neighbor independent context" });
  ledgerDb.close();
  t.after(() => db.close()); return { directory, db, store, work, neighbor, foreign, path, create };
}

test("MEM-40 Coding purges its canonical aggregate and fixed keys, retaining neighboring Session/install/shared keys", async t => {
  const f = await coding(t), maintenance = owner(t, f.directory, f.path);
  const independentDb = openHomeSqliteDatabase(f.directory, ASSISTANT_STORE_NAME), independentStore = new AssistantStore(independentDb);
  t.after(() => independentDb.close());
  const independent = independentStore.create({ actor_id: "person", title: "Independent result", scope: { kind: "personal" }, origin: null,
    executor: { kind: "plugin", plugin_id: CODING_PLUGIN_ID, title: "Coding", session_id: "original" } });
  independentStore.update("person", independent.work_id, independent.revision, { session_id: "independent-assistant-canonical", handover_brief: "independent Work text" });
  independentStore.addRound(independent.work_id, { run_id: "independent-run", executor: "plugin", text: "kept result", materials: [], context: null, started_at: at });
  const independentBefore = { work: independentStore.get("person", independent.work_id), rounds: independentStore.rounds(independent.work_id) };
  const activation = t.mock.method(PluginRuntime.prototype, "start", () => { throw new Error("cold maintenance must not activate a plugin"); });
  const before = f.snapshot(), selected = await maintenance.prepare({ session, owner: f.binding, wait_ids: ["wait-original"] });
  assert.equal(selected.kind, "coding"); if (selected.kind !== "coding") assert.fail();
  assert.deepEqual(selected.selection.sessions.map(item => item.session_id), ["original"]);
  assert.deepEqual(selected.selection.waits, [{ wait_id: "wait-original", keys: ["queued:wait-original", "wake-note:wait-original"] }]);
  assert.ok(!JSON.stringify(selected).includes("secret:")); assert.deepEqual(f.snapshot(), before, "prepare is read-only");
  await maintenance.clear(selected); await maintenance.verifyOriginal(selected); await maintenance.clear(selected);
  assert.equal(activation.mock.callCount(), 0);
  assert.deepEqual({ work: independentStore.get("person", independent.work_id), rounds: independentStore.rounds(independent.work_id) }, independentBefore);
  const after = f.snapshot(); assert.deepEqual(after.sessions, before.sessions.filter(row => (row as { session_id: string }).session_id === "neighbor"));
  assert.deepEqual(after.drafts, []);
  assert.deepEqual(after.private, before.private.filter(row => { const key = row as { install_id: string; item_key: string };
    return key.install_id !== f.install.install_id || ["draft:neighbor", "queued:wait-neighbor", "goal-title:shared-goal"].includes(key.item_key); }));
});

test("MEM-40 Assistant purges same-canonical Works and source-owned removed history, retaining other actor, incoming references and different canonical results", async t => {
  const f = assistant(t), maintenance = owner(t, f.directory, "unused");
  const selected = await maintenance.prepare({ session, owner: assistantOwner, wait_ids: [] });
  assert.equal(selected.kind, "assistant"); if (selected.kind !== "assistant") assert.fail();
  assert.equal(selected.selection.works.length, 1); assert.equal(selected.selection.works[0]!.relations.length, 2);
  assert.ok(!JSON.stringify(selected).includes("cause")); assert.ok(!("wait_ids" in selected.selection));
  f.store.addRound(f.work.work_id, { run_id: "same-root-later-child", text: "also owned", materials: [], context: null, started_at: at });
  const kept = [f.neighbor, f.foreign].map(work => ({ work: f.store.get(work.actor_id, work.work_id), rounds: f.store.rounds(work.work_id), cards: f.store.cards(work.work_id), request: f.db.prepare("SELECT * FROM assistant_requests WHERE work_id=?").all(work.work_id) }));
  await maintenance.clear(selected); await maintenance.verifyOriginal(selected); await maintenance.clear(selected);
  assert.deepEqual(f.db.prepare("SELECT * FROM assistant_rounds WHERE work_id=?").all(f.work.work_id), []);
  assert.deepEqual(f.store.cards(f.work.work_id), []); assert.deepEqual(f.db.prepare("SELECT * FROM assistant_requests WHERE work_id=?").all(f.work.work_id), []);
  assert.equal(f.store.usage.of("person", [f.work.work_id]).input, 10, "body-free usage retains the original owner's counting policy");
  const histories = JSON.stringify(f.db.prepare("SELECT * FROM context_edges").all());
  assert.ok(!histories.includes("private removed cause")); assert.ok(histories.includes("incoming-owned-by-neighbor"));
  assert.deepEqual([f.neighbor, f.foreign].map(work => ({ work: f.store.get(work.actor_id, work.work_id), rounds: f.store.rounds(work.work_id), cards: f.store.cards(work.work_id), request: f.db.prepare("SELECT * FROM assistant_requests WHERE work_id=?").all(work.work_id) })), kept);
});

for (const change of ["canonical", "created", "installation", "install-key", "new-key", "new-root"] as const) test(`MEM-40 Coding ${change} conflict deletes nothing`, async t => {
  const f = await coding(t), maintenance = owner(t, f.directory, f.path), selected = await maintenance.prepare({ session, owner: f.binding, wait_ids: ["wait-original"] });
  if (change === "canonical") await f.sessions.setRuntimeSession(noEffect, "project", "original", "successor", at);
  if (change === "created") f.store.db.prepare("UPDATE coding_sessions SET created_at=? WHERE session_id='original'").run("2026-10-27T00:00:00.000Z");
  if (change === "installation") f.repository.save({ ...f.install, installation_generation: "next-install" });
  if (change === "install-key") f.store.db.prepare("UPDATE plugin_runtime_installs SET install_id=? WHERE install_id=?").run("different-install-key", f.install.install_id);
  if (change === "new-key") f.store.db.prepare("INSERT INTO plugin_private_values VALUES (?, ?, ?)").run(f.install.install_id, "budget:original", "new selection needed");
  if (change === "new-root") { await f.sessions.create(noEffect, { project_id: "project", session_id: "another-root", title: "new", runtime_id: "prologue", at }); await f.sessions.setRuntimeSession(noEffect, "project", "another-root", session.session_id, at); }
  const before = f.snapshot(); await assert.rejects(maintenance.clear(selected)); assert.deepEqual(f.snapshot(), before);
});

test("MEM-40 Assistant rebound/revised Work conflicts before aggregate deletion", async t => {
  const f = assistant(t), maintenance = owner(t, f.directory, "unused");
  const selected = await maintenance.prepare({ session, owner: assistantOwner, wait_ids: [] });
  f.store.update("person", f.work.work_id, f.work.revision, { session_id: "successor" });
  const before = f.db.prepare("SELECT * FROM assistant_works ORDER BY work_id").all();
  await assert.rejects(maintenance.clear(selected)); assert.deepEqual(f.db.prepare("SELECT * FROM assistant_works ORDER BY work_id").all(), before);
});

test("MEM-40 native COMMIT failure rolls back all owners; explicit same selection retry completes", async t => {
  const f = await coding(t), maintenance = owner(t, f.directory, f.path), selected = await maintenance.prepare({ session, owner: f.binding, wait_ids: ["wait-original"] });
  const before = f.snapshot(), prototype = Object.getPrototypeOf(f.store.db), exec = prototype.exec; let inject = true;
  t.mock.method(prototype, "exec", function (this: typeof f.store.db, sql: string) {
    if (this.name === f.path && sql === "COMMIT" && inject) {
      inject = false; exec.call(this, "PRAGMA defer_foreign_keys=ON");
      this.prepare("INSERT INTO coding_plan_drafts VALUES ('project','missing-root',1,'fault')").run();
    }
    return exec.call(this, sql);
  });
  await assert.rejects(maintenance.clear(selected), { code: "SQLITE_CONSTRAINT_FOREIGNKEY" }); assert.deepEqual(f.snapshot(), before);
  await maintenance.clear(selected); await maintenance.verifyOriginal(selected);
});

test("MEM-40 authority revoked after real write lock rolls back before any owner deletion", async t => {
  const f = await coding(t); let authorized = true;
  const maintenance = owner(t, f.directory, f.path, () => { if (!authorized) throw new Error("revoked"); });
  const selected = await maintenance.prepare({ session, owner: f.binding, wait_ids: ["wait-original"] }), before = f.snapshot();
  const prototype = Object.getPrototypeOf(f.store.db), exec = prototype.exec;
  t.mock.method(prototype, "exec", function (this: typeof f.store.db, sql: string) { const value = exec.call(this, sql); if (this.name === f.path && sql === "BEGIN IMMEDIATE") authorized = false; return value; });
  await assert.rejects(maintenance.clear(selected), /revoked/); assert.deepEqual(f.snapshot(), before);
});

for (const cause of ["schema", "pragma"] as const) test(`MEM-40 ${cause} failure plus close failure retains both reasons and retries only the same connection`, async t => {
  const f = await coding(t), maintenance = owner(t, f.directory, f.path), selected = await maintenance.prepare({ session, owner: f.binding, wait_ids: [] });
  const prototype = Object.getPrototypeOf(f.store.db), exec = prototype.exec, close = prototype.close; let retained: typeof f.store.db | undefined, attempts = 0;
  if (cause === "schema") f.store.db.pragma("user_version = 1");
  t.mock.method(prototype, "exec", function (this: typeof f.store.db, sql: string) { if (this.name === f.path && sql === "PRAGMA foreign_keys = ON" && cause === "pragma") throw new Error("pragma fault"); return exec.call(this, sql); });
  t.mock.method(prototype, "close", function (this: typeof f.store.db) { if (this.name === f.path && this !== f.store.db) { retained ??= this; assert.equal(this, retained); attempts++; if (attempts < 3) throw new Error("close fault"); } return close.call(this); });
  const failure = await maintenance.clear(selected).catch(error => error);
  assert.ok(failure instanceof AggregateError); assert.equal(failure.errors.length, 2); assert.match(String(failure.errors[1]), /close fault/);
  assert.match(String(failure.errors[0]), cause === "schema" ? /结构版本/ : /pragma fault/);
  await assert.rejects(maintenance.prepare({ session, owner: f.binding, wait_ids: [] }));
  await assert.rejects(maintenance.close(), /原业务连接仍未关闭/); await maintenance.close(); assert.equal(attempts, 3); assert.equal(retained!.open, false);
});

test("MEM-40 empty known owner selection is fixed; unknown owner/malformed rows/old schema cannot claim completion", async t => {
  const directory = home(t), maintenance = owner(t, directory, "unused"), path = homeSqlitePath(directory, ASSISTANT_STORE_NAME);
  const selected = await maintenance.prepare({ session, owner: assistantOwner, wait_ids: [] });
  await maintenance.clear(selected); await maintenance.verifyOriginal(selected); assert.equal(existsSync(path), false);
  await assert.rejects(maintenance.prepare({ session, owner: { ...assistantOwner, plugin_id: "unknown" }, wait_ids: [] }));
  await assert.rejects(maintenance.prepare({ session, owner: { ...assistantOwner, install_id: "wrong" }, wait_ids: [] }));
  assert.throws(() => openExistingSqliteConnection(join(directory, "missing.db"), { readonly: false })); assert.equal(existsSync(join(directory, "missing.db")), false);
  const db = openHomeSqliteDatabase(directory, ASSISTANT_STORE_NAME), store = new AssistantStore(db); t.after(() => db.close());
  const work = store.create({ actor_id: "person", title: "later", scope: { kind: "personal" }, origin: null });
  store.update("person", work.work_id, work.revision, { session_id: session.session_id });
  await assert.rejects(maintenance.clear(selected));
  db.prepare("UPDATE assistant_works SET body = '{' WHERE work_id = ?").run(work.work_id);
  await assert.rejects(maintenance.prepare({ session, owner: assistantOwner, wait_ids: [] }));
});


test("MEM-40 changed source history conflicts without clearing original or neighbor", async t => {
  const f = assistant(t), maintenance = owner(t, f.directory, "unused");
  const selected = await maintenance.prepare({ session, owner: assistantOwner, wait_ids: [] });
  f.store.relations.link({ work_id: f.work.work_id, project_id: null }, "material", { kind: "note", id: "later-reference", revision: "1" }, "new source identity");
  const before = f.db.prepare("SELECT * FROM context_edges ORDER BY edge_key,revision").all();
  await assert.rejects(maintenance.clear(selected)); assert.deepEqual(f.db.prepare("SELECT * FROM context_edges ORDER BY edge_key,revision").all(), before);
  assert.equal(f.store.get("person", f.work.work_id).session_id, session.session_id);
});

test("MEM-40 completed original verification and retry never delete a same-id successor", async t => {
  const f = await coding(t), maintenance = owner(t, f.directory, f.path);
  const selected = await maintenance.prepare({ session, owner: f.binding, wait_ids: ["wait-original"] });
  await maintenance.clear(selected); await maintenance.verifyOriginal(selected);
  await f.sessions.create(noEffect, { project_id: "project", session_id: "original", title: "successor", runtime_id: "prologue", at: "2026-10-27T00:00:00.000Z" });
  await f.sessions.setRuntimeSession(noEffect, "project", "original", "successor-canonical", at);
  const before = f.snapshot(); await assert.rejects(maintenance.verifyOriginal(selected)); await assert.rejects(maintenance.clear(selected)); assert.deepEqual(f.snapshot(), before);
});

test("MEM-40 an undeclared Coding trigger refuses maintenance before any delete", async t => {
  const f = await coding(t), maintenance = owner(t, f.directory, f.path);
  const selected = await maintenance.prepare({ session, owner: f.binding, wait_ids: [] });
  f.store.db.exec("CREATE TRIGGER unrelated_delete AFTER DELETE ON coding_sessions BEGIN DELETE FROM coding_sessions; END");
  const before = f.snapshot(); await assert.rejects(maintenance.clear(selected)); assert.deepEqual(f.snapshot(), before);
});

test("MEM-40 read-only prepare close failure retains its exact connection without issuing a plan", async t => {
  const f = await coding(t), maintenance = owner(t, f.directory, f.path), before = f.snapshot();
  const prototype = Object.getPrototypeOf(f.store.db), close = prototype.close; let retained: typeof f.store.db | undefined;
  t.mock.method(prototype, "close", function (this: typeof f.store.db) {
    if (this.name === f.path && this.readonly && !retained) { retained = this; throw new Error("read close fault"); }
    return close.call(this);
  });
  await assert.rejects(maintenance.prepare({ session, owner: f.binding, wait_ids: [] }), /关闭失败/);
  assert.equal(retained!.open, true); assert.deepEqual(f.snapshot(), before); await maintenance.close(); assert.equal(retained!.open, false);
});


test("MEM-40 committed clear with lost response stays retryable with only the original selection", async t => {
  const f = await coding(t), maintenance = owner(t, f.directory, f.path), selected = await maintenance.prepare({ session, owner: f.binding, wait_ids: ["wait-original"] });
  const prototype = Object.getPrototypeOf(f.store.db), exec = prototype.exec; let lost = false;
  t.mock.method(prototype, "exec", function (this: typeof f.store.db, sql: string) {
    const value = exec.call(this, sql);
    if (this.name === f.path && sql === "COMMIT" && !lost) { lost = true; throw new Error("commit response lost"); }
    return value;
  });
  await assert.rejects(maintenance.clear(selected), /commit response lost/); await maintenance.verifyOriginal(selected);
  const committed = f.snapshot(); await maintenance.clear(selected); assert.deepEqual(f.snapshot(), committed);
});


for (const guard of ["home", "project"] as const) test(`MEM-40 asynchronous ${guard} current callback cannot authorize maintenance`, async t => {
  const f = await coding(t), before = f.snapshot();
  const maintenance = createSessionBusinessPurgeOwner({ homeDirectory: f.directory,
    assertCurrent: guard === "home" ? async () => {} : () => {},
    projectDatabase: () => ({ path: f.path, assertCurrent: guard === "project" ? async () => {} : () => {} }) });
  t.after(() => maintenance.close());
  await assert.rejects(maintenance.prepare({ session, owner: f.binding, wait_ids: [] })); assert.deepEqual(f.snapshot(), before);
});

test("MEM-40 business owner keeps its original Home, authority and project resolver after caller mutation", async t => {
  const f = await coding(t), before = f.snapshot();
  const input = { homeDirectory: f.directory, assertCurrent() {}, projectDatabase: (_id: string) => ({ path: f.path, assertCurrent() {} }) };
  const maintenance = createSessionBusinessPurgeOwner(input); t.after(() => maintenance.close());
  input.homeDirectory = home(t); input.assertCurrent = () => { throw new Error("replacement authority"); };
  input.projectDatabase = () => { throw new Error("replacement Catalog"); };
  const selected = await maintenance.prepare({ session, owner: f.binding, wait_ids: [] });
  assert.equal(selected.kind, "coding"); assert.deepEqual(f.snapshot(), before);
});

for (const command of ["prepare", "clear", "verifyOriginal"] as const) test(`MEM-40 ${command} isolates its original selection before a current callback can change it`, async t => {
  const f = await coding(t); let change: (() => void) | undefined;
  const maintenance = owner(t, f.directory, f.path, () => { const run = change; change = undefined; run?.(); });
  const selected = await maintenance.prepare({ session, owner: f.binding, wait_ids: [] });
  if (command === "prepare") {
    const binding = { session: { ...session }, owner: { ...f.binding }, wait_ids: [] };
    change = () => { binding.session.session_id = "other-canonical"; };
    const prepared = await maintenance.prepare(binding);
    assert.equal(prepared.selection.session.session_id, session.session_id);
    assert.deepEqual(prepared, selected);
  } else {
    const original = structuredClone(selected);
    if (command === "verifyOriginal") await maintenance.clear(selected);
    change = () => { original.selection.session.runtime_id = "replacement-runtime"; };
    await maintenance[command](original);
    assert.deepEqual(f.store.db.prepare("SELECT session_id FROM coding_sessions ORDER BY session_id").all(), [{ session_id: "neighbor" }]);
  }
});

test("MEM-40 a close inside the absent-library current check still refuses prepare", async t => {
  const directory = home(t); let calls = 0, maintenance: SessionBusinessPurgeOwner;
  maintenance = owner(t, directory, "unused", () => { if (++calls === 3) void maintenance.close(); });
  await assert.rejects(maintenance.prepare({ session, owner: assistantOwner, wait_ids: [] }), { code: "host.session_purge_conflict", kind: "conflict" });
  assert.equal(existsSync(homeSqlitePath(directory, ASSISTANT_STORE_NAME)), false);
});

test("MEM-40 an absent Assistant library never validates a Coding selection or a forged Assistant identity", async t => {
  const f = await coding(t), maintenance = owner(t, f.directory, f.path), before = f.snapshot();
  const invalid = { kind: "assistant" as const, selection: { session, owner: f.binding, works: [] } };
  await assert.rejects(maintenance.clear(invalid)); await assert.rejects(maintenance.verifyOriginal(invalid));
  for (const owner of [{ ...assistantOwner, install_id: "another-install" }, { ...assistantOwner, actor_id: "" }]) {
    const forged = { kind: "assistant" as const, selection: { session, owner, works: [] } };
    await assert.rejects(maintenance.clear(forged)); await assert.rejects(maintenance.verifyOriginal(forged));
  }
  const absent = await maintenance.prepare({ session, owner: assistantOwner, wait_ids: [] });
  await maintenance.clear(absent); await maintenance.verifyOriginal(absent);
  assert.deepEqual(f.snapshot(), before); assert.equal(existsSync(homeSqlitePath(f.directory, ASSISTANT_STORE_NAME)), false);
});

test("MEM-40 Coding cleanup follows its stored Runtime identity without choosing the Host's Runtime", async t => {
  const f = await coding(t, "secondary-runtime"), maintenance = owner(t, f.directory, f.path);
  const original = await maintenance.prepare({ session: { ...session, runtime_id: "secondary-runtime" }, owner: f.binding, wait_ids: [] });
  assert.equal(original.kind, "coding");
  if (original.kind !== "coding") throw new Error("Expected Coding selection");
  assert.deepEqual(original.selection.sessions.map(item => item.session_id), ["original"]);
  const before = f.snapshot();
  await assert.rejects(maintenance.clear({ ...original, selection: { ...original.selection,
    session: { ...original.selection.session, runtime_id: "different-runtime" } } }));
  assert.deepEqual(f.snapshot(), before, "a different Runtime cannot delete the fixed business rows or private keys");
  await maintenance.clear(original);
  await maintenance.verifyOriginal(original);
  assert.deepEqual(f.sessions.list("project").map(row => row.session_id), ["neighbor"]);
});
