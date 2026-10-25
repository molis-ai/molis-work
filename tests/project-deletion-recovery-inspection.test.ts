import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { createProjectsSchema, ProjectsModule } from "@molis-ai/molis-work-module-projects";
import { LocalCatalogMetadata } from "@molis-ai/molis-work-storage";
import { CATALOG_OWNER, CATALOG_SCHEMA_VERSION, openProjectDeletionRecoveryInspection } from "@molis-ai/molis-work-app-local-host";

function fixture(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "molis-catalog-source-"));
  mkdirSync(join(home, "projects"));
  const filename = join(home, "projects", "catalog.db"), db = new Database(filename);
  db.pragma("journal_mode=WAL"); db.pragma("wal_autocheckpoint=0"); db.pragma("busy_timeout=0");
  const metadata = new LocalCatalogMetadata(db); metadata.create(); metadata.initialize(CATALOG_OWNER, CATALOG_SCHEMA_VERSION);
  createProjectsSchema(db);
  const projects = new ProjectsModule({ db, plugins: { has: () => false, companions: () => [] } });
  t.after(() => { db.close(); rmSync(home, { recursive: true, force: true }); });
  function seed(n: number, complete = n % 2 === 0) {
    const id = `decision-${String(n).padStart(4, "0")}`, project = `project-${n}`;
    const recovery = { version: 1, kind: "absent", project_id: project, operation_id: id };
    projects.lifecycle.insertDeletion({ deletion_id: id, project_id: project, actor_id: "person", idempotency_key: `key-${n}`,
      request_fingerprint: `fingerprint-${n}`, cleanup_state: complete ? "complete" : "pending", recovery_plan: JSON.stringify(recovery),
      display_name: "secret-display", staged_directory: "/secret/staged", cleanup_error: "secret-error", deleted_binding_count: 0,
      deleted_at: "2026-10-25T00:00:00Z", cleaned_at: complete ? "2026-10-25T00:00:01Z" : null });
    projects.lifecycle.insertDeletionSteps(id, ["memory", "business"]);
    if (complete) for (const owner of ["memory", "business"]) projects.lifecycle.updateDeletionStep(id, owner, { state: "complete", error: null });
    return { id, project, recovery };
  }
  const open = (assertCurrent = () => {}, signal?: AbortSignal) => openProjectDeletionRecoveryInspection({ homeDirectory: home, assertCurrent, signal });
  return { home, filename, db, metadata, seed, open };
}
function runtimePlan(project: string, operation: string) {
  const session = { runtime_id: "prologue", session_id: "session-1" };
  return { version: 1, kind: "runtime", project_id: project, operation_id: operation,
    sessions: { project_id: project, operation_id: operation, sessions: [{ session,
      owner: { project_id: project, plugin_id: "coding", install_id: "install", actor_id: "person" },
      decision: { operation_id: "child-operation", expected_version: 3, expected_state: "archived" },
      preview: { session, version: 3, state: "archived", runs: 2, resources: 1, destroys_key: true }, state: "archived", indexed: true }] },
    memory: { project_id: project, operation_id: operation, actor_id: "person", scopes: [{ scope: "project", owner: project,
      memories: [{ memory_id: "memory-1", version: 2 }], candidates: [], sources: [] }] } };
}
const invalid = { code: "catalog.project_storage_invalid" };

test("Catalog source exhausts pending and complete across bounded pages and only returns body-free identities", async t => {
  const f = fixture(t);
  for (let n = 0; n < 105; n++) f.seed(n);
  f.db.prepare("INSERT INTO projects (project_id, display_name, database_path, source, data_class, created_at, updated_at) VALUES (?, ?, ?, 'created', 'user', ?, ?)")
    .run("project-0", "secret-successor", "/secret/project", "2026-10-25", "2026-10-25");
  f.db.prepare("INSERT INTO projects (project_id, display_name, database_path, source, data_class, created_at, updated_at) VALUES (?, ?, ?, 'created', 'user', ?, ?)")
    .run("project-1", "secret-retained", "/secret/retained", "2026-10-24", "2026-10-24");
  f.db.prepare("UPDATE project_deletions SET recovery_plan=? WHERE deletion_id=?").run(JSON.stringify(runtimePlan("project-0", "decision-0000")), "decision-0000");
  const handle = await f.open(); t.after(() => handle.close());
  const first = await handle.next(); assert.equal(first.items.length, 40); assert.equal(first.exhausted, false);
  const second = await handle.next({ limit: 40 }), last = await handle.next({ limit: 100 });
  assert.equal(second.items.length, 40); assert.equal(last.items.length, 25); assert.equal(last.exhausted, true);
  assert.deepEqual((await handle.next()).items, []);
  const all = [...first.items, ...second.items, ...last.items];
  assert.equal(new Set(all.map(item => item.deletion_id)).size, 105);
  assert.ok(all.some(item => item.cleanup_state === "pending")); assert.ok(all.some(item => item.cleanup_state === "complete"));
  assert.deepEqual(first.items[0]!.current_project, { project_id: "project-0", data_class: "user", created_at: "2026-10-25" });
  assert.equal(first.items[1]!.current_project, null); assert.equal(first.items[1]!.retained_project?.project_id, "project-1");
  assert.deepEqual(first.items[0]!.recovery, runtimePlan("project-0", "decision-0000"));
  assert.deepEqual(first.items[1]!.owner_steps, [{ owner_id: "memory", state: "pending" }, { owner_id: "business", state: "pending" }]);
  for (const forbidden of ["secret", "recovery_plan", "display_name", "cleanup_error", "staged_directory", "database_path", f.home])
    assert.equal(JSON.stringify(all).includes(forbidden), false, forbidden);
});

test("same BEGIN snapshot includes WAL and remains stable while a working-copy writer adds and changes facts; close releases it", async t => {
  const f = fixture(t); f.seed(1); f.seed(2);
  assert.ok(existsSync(`${f.filename}-wal`));
  const handle = await f.open(); t.after(() => handle.close());
  f.seed(3); f.db.prepare("UPDATE project_deletions SET actor_id='changed' WHERE deletion_id='decision-0002'").run();
  assert.equal((await handle.next({ limit: 1 })).items[0]!.deletion_id, "decision-0001");
  const last = await handle.next({ limit: 1 }); assert.equal(last.items[0]!.actor_id, "person"); assert.equal(last.exhausted, true);
  assert.equal((f.db.pragma("wal_checkpoint(TRUNCATE)") as { busy: number }[])[0]!.busy, 1);
  await handle.close(); await handle.close();
  assert.equal((f.db.pragma("wal_checkpoint(TRUNCATE)") as { busy: number }[])[0]!.busy, 0);
  await assert.rejects(handle.next(), invalid);
  const reopened = await f.open(); try { assert.equal((await reopened.next()).items.length, 3); } finally { await reopened.close(); }
});

test("last current check rejects without advancing the page, including exhausted pages", async t => {
  const f = fixture(t); f.seed(1); f.seed(2);
  let calls = 0, rejectAt = 0;
  const handle = await f.open(() => { if (++calls === rejectAt) throw new Error("revoked"); });
  t.after(() => handle.close());
  rejectAt = calls + 2;
  await assert.rejects(handle.next({ limit: 1 }), /revoked/);
  rejectAt = 0; assert.equal((await handle.next({ limit: 1 })).items[0]!.deletion_id, "decision-0001");
  rejectAt = calls + 2; await assert.rejects(handle.next({ limit: 1 }), /revoked/);
  rejectAt = 0; const last = await handle.next({ limit: 1 }); assert.equal(last.items[0]!.deletion_id, "decision-0002"); assert.equal(last.exhausted, true);
  rejectAt = calls + 1; await handle.close(); assert.equal(calls + 1, rejectAt, "close does not require revoked permission");
});

test("cancellation at the final check refuses output and still permits releasing the read snapshot", async t => {
  const f = fixture(t); f.seed(1); const controller = new AbortController(); let cancel = false, calls = 0;
  const handle = await f.open(() => { if (cancel && ++calls === 2) controller.abort(); }, controller.signal);
  cancel = true; await assert.rejects(handle.next(), { name: "AbortError" }); await handle.close();
  assert.equal((f.db.pragma("wal_checkpoint(TRUNCATE)") as { busy: number }[])[0]!.busy, 0);
  await assert.rejects(f.open(() => {}, controller.signal), { name: "AbortError" });
});

test("bad pagination requests reject and do not lose the first page", async t => {
  const f = fixture(t); f.seed(1); const handle = await f.open(); t.after(() => handle.close());
  for (const request of [{ limit: 0 }, { limit: -1 }, { limit: 101 }, { limit: 1.5 }, { limit: NaN }, { limit: "1" }, { limit: null }, { cursor: "forged" }, null, []])
    await assert.rejects(Reflect.apply(handle.next, handle, [request]), invalid);
  assert.equal((await handle.next({ limit: 1 })).items[0]!.deletion_id, "decision-0001");
});

test("malformed receipt and step facts refuse the same page rather than inventing empty or complete", async t => {
  const mutations = [
    "UPDATE project_deletions SET recovery_plan=NULL", "UPDATE project_deletions SET recovery_plan='not-json'",
    "UPDATE project_deletions SET deletion_id=NULL", "UPDATE project_deletions SET actor_id=''", "UPDATE project_deletions SET project_id=''",
    "UPDATE project_deletions SET idempotency_key=''", "UPDATE project_deletions SET request_fingerprint=''",
    "UPDATE project_deletions SET cleanup_state='unknown'", "UPDATE project_deletion_steps SET state='unknown'",
    "UPDATE project_deletion_steps SET owner_id='' WHERE position=0", "UPDATE project_deletion_steps SET position=0",
    "DELETE FROM project_deletion_steps", "UPDATE project_deletions SET cleanup_state='complete'",
  ];
  for (const mutation of mutations) await t.test(mutation, async sub => {
    const f = fixture(sub); f.seed(1); f.db.pragma("ignore_check_constraints=ON"); f.db.exec(mutation);
    const handle = await f.open(); try { await assert.rejects(handle.next(), invalid); await assert.rejects(handle.next(), invalid); } finally { await handle.close(); }
  });
});

test("the unique plan decoder refuses body, wrong receipt and contradictory Session identity/version", async t => {
  const variants = [
    (plan: ReturnType<typeof runtimePlan>) => ({ ...plan, body: "secret-body" }),
    (plan: ReturnType<typeof runtimePlan>) => ({ ...plan, operation_id: "other-decision" }),
    (plan: ReturnType<typeof runtimePlan>) => ({ ...plan, memory: { ...plan.memory, actor_id: "other-person" } }),
    (plan: ReturnType<typeof runtimePlan>) => ({ ...plan, sessions: { ...plan.sessions, sessions: [...plan.sessions.sessions, ...plan.sessions.sessions] } }),
    (plan: ReturnType<typeof runtimePlan>) => { plan.sessions.sessions[0]!.preview.session = { runtime_id: "prologue", session_id: "other-session" }; return plan; },
    (plan: ReturnType<typeof runtimePlan>) => { plan.sessions.sessions[0]!.preview.version = 4; return plan; },
  ];
  for (let n = 0; n < variants.length; n++) await t.test(`plan-${n}`, async sub => {
    const f = fixture(sub), seeded = f.seed(1), bad = variants[n]!(runtimePlan(seeded.project, seeded.id));
    f.db.prepare("UPDATE project_deletions SET recovery_plan=?").run(JSON.stringify(bad));
    const handle = await f.open(); try { await assert.rejects(handle.next(), invalid); } finally { await handle.close(); }
  });
});

test("missing, unknown owner/schema and invalid database are refused without creating a Catalog", async t => {
  const f = fixture(t), missing = join(f.home, "missing");
  await assert.rejects(openProjectDeletionRecoveryInspection({ homeDirectory: missing, assertCurrent() {} }), invalid);
  assert.equal(existsSync(missing), false);
  f.metadata.setOwner("other-owner"); await assert.rejects(f.open(), { code: "catalog.unknown_database" });
  f.metadata.setOwner(CATALOG_OWNER); f.metadata.setVersion(CATALOG_SCHEMA_VERSION + 1); await assert.rejects(f.open(), { code: "catalog.reader_too_old" });
  f.metadata.setVersion(1); await assert.rejects(f.open(), { code: "catalog.unsupported_schema" });
  f.metadata.setVersion(CATALOG_SCHEMA_VERSION);
  const corrupt = join(f.home, "corrupt"); mkdirSync(join(corrupt, "projects"), { recursive: true });
  const filename = join(corrupt, "projects", "catalog.db"); writeFileSync(filename, "not SQLite"); const before = readFileSync(filename);
  await assert.rejects(openProjectDeletionRecoveryInspection({ homeDirectory: corrupt, assertCurrent() {} }), invalid);
  assert.deepEqual(readFileSync(filename), before);
});


test("invalid retained identity and duplicate or NULL persisted owner steps are not projected as trustworthy", async t => {
  for (const corruption of ["class", "created", "duplicate", "null-owner"]) await t.test(corruption, async sub => {
    const f = fixture(sub); f.seed(1);
    if (corruption === "class" || corruption === "created") {
      f.db.pragma("ignore_check_constraints=ON");
      f.db.prepare("INSERT INTO projects (project_id, display_name, database_path, source, data_class, created_at, updated_at) VALUES ('project-1', 'secret', '/secret', 'created', ?, ?, '2026')")
        .run(corruption === "class" ? "unknown" : "user", corruption === "created" ? "" : "2026");
    } else {
      f.db.exec("DROP TABLE project_deletion_steps; CREATE TABLE project_deletion_steps (deletion_id TEXT, owner_id TEXT, position INTEGER, state TEXT)");
      f.db.prepare("INSERT INTO project_deletion_steps VALUES ('decision-0001', ?, 0, 'pending')").run(corruption === "duplicate" ? "memory" : null);
      f.db.exec("INSERT INTO project_deletion_steps VALUES ('decision-0001', 'memory', 1, 'complete')");
    }
    const handle = await f.open(); try { await assert.rejects(handle.next(), invalid); } finally { await handle.close(); }
  });
});
