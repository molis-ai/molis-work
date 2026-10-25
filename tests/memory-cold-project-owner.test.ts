import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { LOCAL_PERSON_ACTOR_ID as actor } from "@molis-ai/molis-work-contracts/platform/actions";
import { createColdMemoryProjectOwner, type ColdMemoryProjectOwnerInput } from "@molis-ai/molis-work-app-local-host";
import { openPrologueMemoryAdoption, openPrologueMemoryAdoptionInspection, type PrologueMemoryAdoptionInput } from "@molis-ai/molis-work-service-agent-host";
import { acquireStorageOwner, assertStorageOwner, beginMemoryLedgerAdoption, homeSqlitePath, inspectMemoryLedgerAdoption, MEMORY_LEDGER_STORE, type StorageOwner } from "@molis-ai/molis-work-storage";
import { memoryServiceHome } from "./fixtures/memory-service-home.js";

const project = "project-a", operation = "original-project-delete";
type ProjectDeletionRecovery = NonNullable<Parameters<NonNullable<ReturnType<typeof createColdMemoryProjectOwner>["withRecovery"]>>[0]["original"]>;
const who = { actor_id: actor, project_id: project, consumer: "ui" as const, person: true, purpose: "management" as const,
  current_scene: "common" as const, operation_id: "seed" };

async function fixture(t: TestContext, options: { unknownSources?: boolean; omitCoverage?: boolean } = {}) {
  const handles = new Set<{ close(): Promise<void> }>(); let parent: StorageOwner | undefined, allowed = true;
  t.after(async () => { allowed = true; for (const handle of handles) await handle.close(); parent?.release(); });
  const f = await memoryServiceHome(t, { projects: [project, "project-kept"] }), service = await f.open();
  let formal = (await service.write(who, { scope: "project", text: "Original project memory" })).memory!;
  const kept = (await service.write({ ...who, project_id: "project-kept", operation_id: "kept" }, { scope: "project", text: "Other project stays" })).memory!;
  const sessionOwner = { actor_id: actor, project_id: project, plugin_id: "io.molis.work.coding", install_id: "coding" };
  const session = await f.adapter().createSession({ ...sessionOwner, workspace: "none", role_id: "coding", title: "Original Session" });
  const before = (await f.raw(who).list("project", project)).find(item => item.memory_id === formal.memory_id)!;
  const targetVersion = await f.raw({ ...who, session_id: session.session_id }).setMeta({ scope: "project", owner: project, memory_id: formal.memory_id,
    expected_version: formal.version, operation_id: "bind-project-session", meta: { ...before.meta, session_ref: { kind: "session", id: session.session_id, revision: 1 } } });
  formal = { ...formal, version: targetVersion.version };
  const personal = await f.adapter().memory!.withCaller({ ...who, session_id: session.session_id }).write({ scope: "user", owner: actor,
    text: "Selected personal original", origin: "person", operation_id: "personal", meta: { kind: "fact", source: "manual",
      classification: { scenes: ["common"], lifecycle: "long-term" }, session_ref: { kind: "session", id: session.session_id, revision: 1 } } });
  const candidate = await f.raw(who).candidates.propose({ scope: "project", owner: project, text: "Original candidate", origin: "person",
    expected_version: 0, operation_id: "candidate", meta: { kind: "fact", source: "manual", approved_by: { by: "person" },
      classification: { scenes: ["common"], lifecycle: "long-term" } } });
  const sourcePlan = await f.adapter().projectDeletion.withHold({ project_id: project, associated_sessions: [] }, held => held.preview(operation));
  f.ledger().setMarker(actor, "strategy-adoption", { origin: "existing-home" }, "2026-10-25T00:00:00.000Z");
  await f.close();
  const home = realpathSync(f.home), storageRoot = join(home, "sdk");
  const access = <T>(work: (db: DatabaseSync) => T) => { const db = new DatabaseSync(homeSqlitePath(home, MEMORY_LEDGER_STORE)); try { return work(db); } finally { db.close(); } };
  access(db => {
    if (!options.unknownSources) db.prepare("INSERT INTO memory_candidates VALUES (?,?,?,?)").run(candidate.candidate_id, actor, "pending", JSON.stringify({
      candidate_id: candidate.candidate_id, actor_id: actor, scope: "project", owner: project, project_id: project, state: "pending", version: 999,
      memory_id: null, supersedes: null, source_refs: [{ event_id: "original-event", version: "source-version-is-not-CAS" }] }));
  });
  let expected = beginMemoryLedgerAdoption({ homeDirectory: home, snapshot: inspectMemoryLedgerAdoption({ homeDirectory: home }) });
  parent = acquireStorageOwner(storageRoot);
  const knownScopes = [{ scope: "project" as const, owner: project }, { scope: "user" as const, owner: actor },
    ...(options.omitCoverage ? [] : [{ scope: "project" as const, owner: "project-kept" }])];
  const scopes = [{ scope: "project" as const, owner: project }];
  const current = () => { assert.ok(allowed, "frame revoked"); assertStorageOwner(storageRoot, parent); assert.deepEqual(inspectMemoryLedgerAdoption({ homeDirectory: home }), expected); };
  const bridge: PrologueMemoryAdoptionInput = { storageRoot, storageOwner: parent, appVersion: "1.0.0", policy: f.policy,
    scopes: [...scopes, { scope: "user", owner: actor }], assertCurrent: current,
    purgeInspection: { operationId: operation, knownScopes, selections: sourcePlan.sessions.map(item => ({ kind: "session",
      sessionRef: { kind: "session", id: item.session.session_id, revision: 1 }, operationId: operation })) } };
  let openChildren = 0, writers = 0, reads = 0, commits = 0, rejectAtCommit = Infinity;
  const withReader = async <T>(work: (reader: Awaited<ReturnType<typeof openPrologueMemoryAdoptionInspection>>) => Promise<T>) => {
    assert.equal(openChildren, 0); openChildren++; reads++;
    const reader = await openPrologueMemoryAdoptionInspection(bridge); handles.add(reader);
    try { return await work(reader); } finally { await reader.close(); handles.delete(reader); openChildren--; }
  };
  const input: ColdMemoryProjectOwnerInput = {
    homeDirectory: home, assertCurrent: current, ledgerExpected: () => structuredClone(expected),
    ledgerCommitted({ before, after }) {
      commits++;
      const cached = commits === rejectAtCommit ? { ...expected, version: expected.version === 4 ? 3 : 4 } : expected;
      assert.deepEqual(before, cached, "cached before mismatch"); expected = structuredClone(after);
    },
    async prepareProject(request) {
      const sessions = request.original?.kind === "runtime" ? request.original.sessions
        : await withReader(reader => reader.prepareProjectSessionPurge({ sourcePlan, operationId: operation }));
      return { scopes, knownScopes, sessions };
    },
    withInspection: work => withReader(reader => work({ inspectMemory: reader.inspectMemory, previewMemoryPurge: reader.previewMemoryPurge,
      verifyPurgeCoverage: reader.verifyPurgeCoverage, verifyProjectSessionPurge: reader.verifyProjectSessionPurge })),
    async withWriter(selection, work) {
      assert.equal(openChildren, 0); openChildren++; writers++;
      const writer = await openPrologueMemoryAdoption({ ...bridge, memoryPurges: selection.memoryPurges, projectSessionPurges: [selection.sessionPlan] }); handles.add(writer);
      try { return await work({ purgeMemoryTarget: writer.purgeMemoryTarget, purgeSessionTarget: writer.purgeSessionTarget,
        inspectMemory: writer.inspectMemory, previewMemoryPurge: writer.previewMemoryPurge, verifyPurgeCoverage: writer.verifyPurgeCoverage,
        verifyProjectSessionPurge: writer.verifyProjectSessionPurge }); }
      finally { await writer.close(); handles.delete(writer); openChildren--; }
    },
  };
  const newOwner = () => { const owner = createColdMemoryProjectOwner(input); handles.add(owner); return owner; };
  const owner = newOwner();
  return { home, formal, personal, candidate, kept, session, sourcePlan, owner, input, access, withReader, current,
    counters: () => ({ writers, reads, commits, openChildren }), newOwner, revoke: () => { allowed = false; }, grant: () => { allowed = true; },
    rejectCommit: (at = 1) => { rejectAtCommit = at; } };
}

test("cold first plan uses target CAS and the same deletion kernel, keeps other project and proves original Session", async t => {
  const f = await fixture(t); let original!: ProjectDeletionRecovery;
  await f.owner.withRecovery!({ project_id: project, operation_id: operation }, async (plan, proof) => {
    assert.equal(plan.kind, "runtime"); if (plan.kind !== "runtime") return;
    assert.equal(plan.memory.scopes.find(scope => scope.scope === "project")!.memories[0]!.version, f.formal.version);
    assert.equal(plan.memory.scopes.find(scope => scope.scope === "project")!.candidates[0]!.version, f.candidate.version);
    assert.ok(plan.memory.scopes.find(scope => scope.scope === "personal")!.memories.some(item => item.memory_id === f.personal.memory_id));
    assert.ok(plan.memory.scopes.find(scope => scope.scope === "project")!.sources.some(source => source.version === "source-version-is-not-CAS"));
    original = structuredClone(plan);
    await f.owner.clear(project, { project_id: project, deletion_id: operation, recovery: original }, { assertCurrent: f.current });
    await proof.verifyMemory(); await proof.verifyOriginal!();
  });
  assert.equal(f.counters().openChildren, 0); assert.equal(f.counters().writers, 1); assert.ok(f.counters().commits >= 5);
  f.access(db => {
    assert.equal(db.prepare("SELECT 1 FROM memory_candidates WHERE candidate_id=?").get(f.candidate.candidate_id), undefined);
    assert.equal(db.prepare("SELECT 1 FROM memory_changes WHERE memory_id=?").get(f.formal.memory_id), undefined);
    assert.ok(db.prepare("SELECT 1 FROM memory_changes WHERE memory_id=?").get(f.kept.memory_id));
    assert.ok(db.prepare("SELECT 1 FROM memory_markers WHERE key=?").get('memory-source-forgotten:["project","project-a","original-event"]'));
  });
  await f.owner.withRecovery!({ project_id: project, operation_id: operation, original, verification: "original" }, async (_plan, proof) => {
    await proof.verifyOriginal!();
    await assert.rejects(async () => f.owner.clear(project, { project_id: project, deletion_id: operation, recovery: original }));
  });
  assert.equal(f.counters().writers, 1);
});

for (const reason of ["unknown-sources", "unknown-fact", "incomplete-coverage"] as const) test(`cold planning refuses ${reason} before any writer`, async t => {
  const f = await fixture(t, { unknownSources: reason === "unknown-sources", omitCoverage: reason === "incomplete-coverage" });
  if (reason === "unknown-fact") f.access(db => db.prepare("INSERT INTO memory_markers VALUES (?,?,?,?)").run(actor, "memory-unknown-producer:x", "now", "{}"));
  await assert.rejects(f.owner.withRecovery!({ project_id: project, operation_id: operation }, async () => assert.fail("must not publish a plan")));
  assert.equal(f.counters().writers, 0); assert.equal(f.counters().commits, 0);
  await f.withReader(async reader => assert.equal((await reader.inspectMemory({ ref: { kind: "memory", id: f.formal.memory_id, revision: 1 },
    identity: { scope: "project", owner: project } })).state, "present"));
});

test("cold owner rejects a changed receipt, reentry, and a stale proof without granting a writer", async t => {
  const f = await fixture(t); let stale!: () => void, staleProof!: () => Promise<void>;
  await f.owner.withRecovery!({ project_id: project, operation_id: operation }, async (plan, proof) => {
    stale = proof.assertCurrent; staleProof = proof.verifyOriginal!;
    await assert.rejects(f.owner.withRecovery!({ project_id: project, operation_id: operation }, async () => undefined));
    await assert.rejects(async () => f.owner.clear(project, { project_id: project, deletion_id: operation, recovery: { ...plan, operation_id: "changed" } }));
  });
  const reads = f.counters().reads;
  assert.throws(stale); await assert.rejects(staleProof()); assert.equal(f.counters().reads, reads); assert.equal(f.counters().writers, 0);
});

test("authority revoked after real target Session preparation refuses publication and never opens a writer", async t => {
  const f = await fixture(t), prepare = f.input.prepareProject;
  f.input.prepareProject = async request => { const result = await prepare(request); f.revoke(); return result; };
  await assert.rejects(f.owner.withRecovery!({ project_id: project, operation_id: operation }, async () => assert.fail("revoked frame")), /frame revoked/);
  f.grant(); assert.equal(f.counters().writers, 0); assert.equal(f.counters().commits, 0);
  await f.withReader(async reader => assert.equal((await reader.inspectMemory({ ref: { kind: "memory", id: f.formal.memory_id, revision: 1 },
    identity: { scope: "project", owner: project } })).state, "present"));
});

test("an empty completed original proves only its empty selection and leaves later nonempty SDK and Ledger data", async t => {
  const f = await fixture(t);
  f.input.prepareProject = async () => assert.fail("complete original must not prepare new targets");
  const original: ProjectDeletionRecovery = { version: 1, kind: "runtime", project_id: project, operation_id: operation,
    sessions: { project_id: project, operation_id: operation, sessions: [] }, memory: { project_id: project, operation_id: operation, actor_id: actor, scopes: [] } };
  await f.owner.withRecovery!({ project_id: project, operation_id: operation, original, verification: "original" }, async (_plan, proof) => { await proof.verifyOriginal!(); });
  assert.equal(f.counters().writers, 0); assert.equal(f.counters().commits, 0);
  await f.withReader(async reader => assert.equal((await reader.inspectMemory({ ref: { kind: "memory", id: f.formal.memory_id, revision: 1 },
    identity: { scope: "project", owner: project } })).state, "present"));
  f.access(db => assert.ok(db.prepare("SELECT 1 FROM memory_changes WHERE memory_id=?").get(f.formal.memory_id)));
});

test("pending empty proof still checks every original scope after its current relation disappeared", async t => {
  const f = await fixture(t), prepare = f.input.prepareProject;
  f.input.prepareProject = async request => ({ ...await prepare(request), scopes: [] });
  const original: ProjectDeletionRecovery = { version: 1, kind: "runtime", project_id: project, operation_id: operation,
    sessions: { project_id: project, operation_id: operation, sessions: [] }, memory: { project_id: project, operation_id: operation, actor_id: actor,
      scopes: [{ scope: "project", owner: project, memories: [], candidates: [], sources: [] }] } };
  await assert.rejects(f.owner.withRecovery!({ project_id: project, operation_id: operation, original }, async plan => {
    await f.owner.clear(project, { project_id: project, deletion_id: operation, recovery: plan });
  }), /项目仍有当前记忆原件/);
  f.access(db => assert.ok(db.prepare("SELECT 1 FROM memory_changes WHERE memory_id=?").get(f.formal.memory_id)));
});

test("a committed Ledger result must advance the cached before before ordinary current, mismatch invalidates owner", async t => {
  const f = await fixture(t); f.rejectCommit();
  await assert.rejects(f.owner.withRecovery!({ project_id: project, operation_id: operation }, async plan => {
    await f.owner.clear(project, { project_id: project, deletion_id: operation, recovery: plan });
  }), /cached before mismatch/);
  assert.equal(f.counters().commits, 1); assert.equal(f.owner.alive!(), false);
  await assert.rejects(f.owner.withRecovery!({ project_id: project, operation_id: operation }, async () => undefined));
  await f.withReader(async reader => assert.equal((await reader.inspectMemory({ ref: { kind: "memory", id: f.formal.memory_id, revision: 1 },
    identity: { scope: "project", owner: project } })).state, "present"));
});

test("a new controlled frame resumes the same Catalog plan after a real candidate purge and committed Ledger failure", async t => {
  const f = await fixture(t); let original!: ProjectDeletionRecovery; f.rejectCommit(2);
  await assert.rejects(f.owner.withRecovery!({ project_id: project, operation_id: operation }, async plan => {
    original = structuredClone(plan);
    await f.owner.clear(project, { project_id: project, deletion_id: operation, recovery: plan });
  }), /cached before mismatch/);
  await f.withReader(async reader => {
    assert.equal((await reader.inspectMemory({ ref: { kind: "memory-candidate", id: f.candidate.candidate_id, revision: 1 }, identity: { scope: "project", owner: project } })).state, "cleared");
    assert.equal((await reader.inspectMemory({ ref: { kind: "memory", id: f.formal.memory_id, revision: 1 }, identity: { scope: "project", owner: project } })).state, "present");
  });
  await f.owner.close(); const resumed = f.newOwner();
  await resumed.withRecovery!({ project_id: project, operation_id: operation, original }, async (plan, proof) => {
    assert.deepEqual(plan, original);
    await resumed.clear(project, { project_id: project, deletion_id: operation, recovery: plan });
    await proof.verifyOriginal!();
  });
});

test("a real Ledger reader close failure retains the handle, blocks another phase and closes on retry", async t => {
  const f = await fixture(t), close = DatabaseSync.prototype.close, prepare = DatabaseSync.prototype.prepare;
  const scanned = new WeakSet<DatabaseSync>();
  t.mock.method(DatabaseSync.prototype, "prepare", function (this: DatabaseSync, sql: string) {
    if (this.location() === homeSqlitePath(f.home, MEMORY_LEDGER_STORE) && sql.includes("rowid AS row_number")) scanned.add(this);
    return prepare.call(this, sql);
  });
  let retained: DatabaseSync | undefined, fail = true;
  t.mock.method(DatabaseSync.prototype, "close", function (this: DatabaseSync) {
    if (fail && this.isTransaction && scanned.has(this)) {
      fail = false; retained = this; throw new Error("reader close failed");
    }
    return close.call(this);
  });
  await assert.rejects(f.owner.withRecovery!({ project_id: project, operation_id: operation }, async () => assert.fail("unclosed reader")), { code: "memory.recovery_close_failed" });
  assert.ok(retained?.isOpen); assert.equal(f.counters().writers, 0);
  const reads = f.counters().reads;
  await assert.rejects(f.owner.withRecovery!({ project_id: project, operation_id: operation }, async () => undefined));
  assert.equal(f.counters().reads, reads);
  await assert.rejects(f.owner.close());
  assert.equal(retained.isOpen, false);
  await f.owner.close();
});
