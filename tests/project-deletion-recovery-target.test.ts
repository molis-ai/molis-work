import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync, promises as fs } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { openMolisWorkProjectCatalog, openDesktopProjectDeletionRecoveryTarget } from "@molis-ai/molis-work-app-desktop";
import { openProjectDeletionRecoveryInspection, projectDeletedHooksFor, type ProjectDeletedOwner,
  type ProjectDeletionRecoveryGroup, type ProjectDeletionCatalogSnapshot } from "@molis-ai/molis-work-app-local-host";
import { ProjectsModule, type StoredProjectDeletion } from "@molis-ai/molis-work-module-projects";

const invalid = { code: "catalog.project_storage_invalid" };
async function fixture(t: TestContext) {
  const home = await mkdtemp("/private/tmp/molis-catalog-target-"), sourceHome = await mkdtemp("/private/tmp/molis-catalog-later-");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const sourceCatalog = await openMolisWorkProjectCatalog({ homeDirectory: sourceHome });
  const gone = await catalog.createProject({ display_name: "Delete fixed target", actor_id: "person",
    project_id: `project-onboarding-${randomUUID()}` });
  const kept = await catalog.createProject({ display_name: "Keep target", actor_id: "person" });
  await writeFile(join(home, "projects", gone.project_id, "original.txt"), "original target");
  await writeFile(join(home, "projects", kept.project_id, "keep.txt"), "keep these bytes");
  const db = new Database(join(home, "projects", "catalog.db"));
  const sourceDb = new Database(join(sourceHome, "projects", "catalog.db"));
  const projects = new ProjectsModule({ db, plugins: { has: () => false, companions: () => [] } });
  const sourceProjects = new ProjectsModule({ db: sourceDb, plugins: { has: () => false, companions: () => [] } });
  const ownerIds = projectDeletedHooksFor(home).owners().map(owner => owner.id);
  const groups: ProjectDeletionRecoveryGroup[] = [], changes: { before: ProjectDeletionCatalogSnapshot; after: ProjectDeletionCatalogSnapshot }[] = [];
  const seen: { operation: string; original: boolean; verification?: string }[] = [];
  let revoked = false, clearCount = 0, originalChecks = 0;
  const current = () => { if (revoked) throw new Error("maintenance withdrawn"); };
  const actual = projectDeletedHooksFor(home).owners().find(owner => owner.id === "memory")!;
  // The real absent-runtime owner supplies its hold and ledger behavior. Only the new exact-empty verification hook is supplied here.
  const memory: ProjectDeletedOwner = { ...actual,
    withRecovery(input, work) {
      seen.push({ operation: input.operation_id, original: Boolean(input.original), verification: input.verification });
      return actual.withRecovery!(input, (plan, proof) => work(plan, { ...proof, async verifyOriginal() {
        current(); assert.equal(plan.kind, "absent"); originalChecks++; await proof.verifyMemory();
      } }));
    },
    async clear(projectId, deletion, control) { current(); clearCount++; await actual.clear(projectId, deletion, control); },
  };
  function sourceReceipt(input: Partial<StoredProjectDeletion> = {}, owner_ids = ownerIds) {
    const id = input.deletion_id ?? `project-deletion-${randomUUID()}`, projectId = input.project_id ?? gone.project_id;
    const row: StoredProjectDeletion = { deletion_id: id, project_id: projectId, actor_id: "person", idempotency_key: id,
      request_fingerprint: JSON.stringify({ project_id: projectId, delete_confirmed: true }), display_name: "source private name",
      staged_directory: "/source-only/do-not-copy", deleted_binding_count: 0, cleanup_state: "complete", cleanup_error: null,
      deleted_at: "2026-10-25T00:00:00.000Z", cleaned_at: "2026-10-25T00:00:01.000Z",
      recovery_plan: JSON.stringify({ version: 1, kind: "absent", project_id: projectId, operation_id: id }), ...input };
    sourceProjects.lifecycle.insertDeletion(row); sourceProjects.lifecycle.insertDeletionSteps(id, owner_ids);
    if (row.cleanup_state === "complete") for (const owner of owner_ids) sourceProjects.lifecycle.updateDeletionStep(id, owner, { state: "complete", error: null });
    return row;
  }
  const open = async (overrides: Partial<Parameters<typeof openDesktopProjectDeletionRecoveryTarget>[0]> = {}) => {
    const source = overrides.source ?? await openProjectDeletionRecoveryInspection({ homeDirectory: sourceHome, assertCurrent: current });
    if (!overrides.source) t.after(() => source.close());
    const handle = await openDesktopProjectDeletionRecoveryTarget({ homeDirectory: home, source, groups, memory, assertCurrent: current,
      async recordTargets(group) { groups.push(structuredClone(group)); }, catalogCommitted(change) { changes.push(structuredClone(change)); }, ...overrides });
    t.after(() => handle.close()); return handle;
  };
  t.after(async () => { catalog.close(); sourceCatalog.close(); db.close(); sourceDb.close(); await rm(home, { recursive: true, force: true }); await rm(sourceHome, { recursive: true, force: true }); });
  return { home, sourceHome, catalog, projects, sourceProjects, sourceReceipt, open, memory, ownerIds, groups, changes, seen, gone, kept,
    revoke() { revoked = true; }, resume() { revoked = false; }, get clearCount() { return clearCount; }, get originalChecks() { return originalChecks; } };
}

test("source complete/absent still accepts a new fixed target plan and runs real business/directory owners", async t => {
  const f = await fixture(t), source = f.sourceReceipt();
  const target = await f.open({ async recordTargets(group) {
    assert.equal(f.projects.query.listProjectDeletions().length, 0, "whole association precedes Catalog acceptance");
    f.groups.push(structuredClone(group));
  } });
  assert.equal(f.clearCount, 0);
  const result = await target.restore(source.deletion_id);
  assert.equal(result.cleanup_state, "complete"); assert.notEqual(result.target_deletion_id, source.deletion_id);
  assert.equal(f.clearCount, 1); assert.deepEqual(f.seen.map(row => row.original), [false]);
  assert.equal(existsSync(join(f.home, "projects", f.gone.project_id)), false);
  assert.equal(f.projects.lifecycle.retainedProject(f.gone.project_id), null);
  assert.equal(await readFile(join(f.home, "projects", f.kept.project_id, "keep.txt"), "utf8"), "keep these bytes");
  const receipt = f.projects.lifecycle.getDeletion(result.target_deletion_id);
  assert.equal(JSON.parse(receipt.recovery_plan!).operation_id, result.target_deletion_id);
  assert.ok(receipt.staged_directory.startsWith(join(f.home, "projects", ".deleting-")));
  assert.equal(f.changes[0]!.before.receipts.length, 0); assert.equal(f.changes[0]!.after.receipts.length, 1);
  assert.equal(f.changes.at(-1)!.after.receipts[0]!.cleanup_state, "complete");
});

test("source and target requirements form one fixed union; unavailable owner remains pending across restart", async t => {
  const f = await fixture(t), source = f.sourceReceipt({}, ["memory", "unknown-source-owner"]);
  let target = await f.open(); const first = await target.restore(source.deletion_id);
  assert.equal(first.cleanup_state, "pending");
  const saved = f.projects.lifecycle.getDeletion(first.target_deletion_id);
  const steps = f.projects.lifecycle.deletionSteps(first.target_deletion_id);
  assert.ok(f.ownerIds.every(id => steps.some(step => step.owner_id === id)));
  assert.equal(steps.at(-1)!.owner_id, "unknown-source-owner");
  await target.close(); target = await f.open();
  const retry = await target.restore(source.deletion_id); assert.equal(retry.target_deletion_id, first.target_deletion_id);
  assert.equal(retry.cleanup_state, "pending");
  assert.equal(f.projects.lifecycle.getDeletion(first.target_deletion_id).recovery_plan, saved.recovery_plan);
  assert.deepEqual(f.seen.map(row => row.original), [false, true]);
  assert.ok(existsSync(join(f.home, "projects", f.gone.project_id, "original.txt")));
});

test("a native pending target continues the original operation and never previews a replacement", async t => {
  const f = await fixture(t);
  const dispose = projectDeletedHooksFor(f.home).register({ ...f.memory, async clear() { throw new Error("first Memory interruption"); } });
  const accepted = await f.catalog.deleteProject({ project_id: f.gone.project_id, actor_id: "person", delete_confirmed: true, idempotency_key: "native" }); dispose();
  const original = f.projects.lifecycle.getDeletion(accepted.deletion.deletion_id);
  const source = f.sourceReceipt({ ...original, cleanup_state: "complete" });
  f.seen.length = 0;
  let addedCalls = 0;
  const target = await f.open({ projectRuntime: { id: "project-runtime", label: null, clear() { addedCalls++; } } });
  const result = await target.restore(source.deletion_id);
  assert.equal(result.target_deletion_id, original.deletion_id); assert.equal(result.cleanup_state, "complete");
  assert.equal(addedCalls, 0); assert.equal(f.projects.lifecycle.deletionSteps(original.deletion_id).some(step => step.owner_id === "project-runtime"), false);
  assert.deepEqual(f.seen.map(row => [row.operation, row.original]), [[original.deletion_id, true]]);
  assert.equal(f.projects.lifecycle.getDeletion(original.deletion_id).recovery_plan, original.recovery_plan);
});

test("native complete ignores a newly declared owner, verifies its original selection and preserves a same-ID successor", async t => {
  const f = await fixture(t);
  const gone = await f.catalog.deleteProject({ project_id: f.gone.project_id, actor_id: "person", delete_confirmed: true, idempotency_key: "complete" });
  const source = f.sourceReceipt(f.projects.lifecycle.getDeletion(gone.deletion.deletion_id));
  await f.catalog.createProject({ project_id: f.gone.project_id, display_name: "Successor", actor_id: "person" });
  await writeFile(join(f.home, "projects", f.gone.project_id, "successor.txt"), "later bytes");
  let addedCalls = 0;
  assert.equal(f.ownerIds.includes("project-runtime"), false, "this owner was absent from the accepted original decision");
  const target = await f.open({ projectRuntime: { id: "project-runtime", label: null, clear() { addedCalls++; } } });
  const result = await target.restore(source.deletion_id);
  assert.equal(result.cleanup_state, "complete"); assert.equal(f.clearCount, 0); assert.equal(f.originalChecks, 1);
  assert.equal(addedCalls, 0);
  assert.equal(f.changes.length, 0); assert.equal(f.seen[0]!.verification, "original");
  assert.equal(await readFile(join(f.home, "projects", f.gone.project_id, "successor.txt"), "utf8"), "later bytes");
  assert.equal(f.projects.query.getProject(f.gone.project_id).display_name, "Successor");
});

test("a mapped pending target missing an original source owner is refused without adding steps or running cleanup", async t => {
  const f = await fixture(t), source = f.sourceReceipt({}, [...f.ownerIds, "required-original-owner"]);
  const targetId = `project-deletion-${randomUUID()}`;
  f.projects.lifecycle.insertDeletion({ ...source, deletion_id: targetId, cleanup_state: "pending", cleaned_at: null,
    staged_directory: join(f.home, "projects", `.deleting-${f.gone.project_id}-${randomUUID()}`),
    recovery_plan: JSON.stringify({ version: 1, kind: "absent", project_id: f.gone.project_id, operation_id: targetId }) });
  f.projects.lifecycle.insertDeletionSteps(targetId, f.ownerIds);
  const { deletion_id, project_id, actor_id, idempotency_key, request_fingerprint } = source;
  f.groups.push({ project_id, sources: [{ deletion_id, project_id, actor_id, idempotency_key, request_fingerprint }],
    targets: [{ source_deletion_id: deletion_id, target_deletion_id: targetId }], disposal: { primary_target: targetId, dependent_targets: [] } });
  const original = f.projects.lifecycle.getDeletion(targetId), steps = f.projects.lifecycle.deletionSteps(targetId);
  const target = await f.open();
  await assert.rejects(target.restore(source.deletion_id), invalid);
  assert.deepEqual(f.projects.lifecycle.getDeletion(targetId), original);
  assert.deepEqual(f.projects.lifecycle.deletionSteps(targetId), steps);
  assert.equal(f.clearCount, 0); assert.equal(f.seen.length, 0); assert.equal(f.changes.length, 0);
  assert.equal(await readFile(join(f.home, "projects", f.gone.project_id, "original.txt"), "utf8"), "original target");
});

test("all source-only requests are associated before the primary write and later requests verify its fixed disposal", async t => {
  const f = await fixture(t); f.sourceReceipt(); f.sourceReceipt();
  let target = await f.open();
  assert.equal(f.groups.length, 1); assert.equal(f.groups[0]!.targets.length, 2);
  const group = f.groups[0]!, primary = group.targets.find(ref => ref.target_deletion_id === group.disposal.primary_target)!;
  const later = group.targets.find(ref => ref.target_deletion_id !== group.disposal.primary_target)!;
  await assert.rejects(target.restore(later.source_deletion_id), invalid);
  assert.equal(f.projects.query.listProjectDeletions().length, 0);
  assert.equal((await target.restore(primary.source_deletion_id)).cleanup_state, "complete");
  await target.close(); target = await f.open();
  assert.equal((await target.restore(later.source_deletion_id)).cleanup_state, "complete");
  assert.ok(f.originalChecks >= 1); assert.equal(f.projects.query.listProjectDeletions().length, 2);
  const prior = JSON.stringify(f.groups); await target.close(); target = await f.open();
  await target.restore(later.source_deletion_id); assert.equal(JSON.stringify(f.groups), prior);
  assert.equal(f.projects.query.listProjectDeletions().length, 2);
});

test("incompatible complete history is rejected before associations or target effects", async t => {
  for (const fault of ["missing", "regressed", "plan", "fingerprint"] as const) await t.test(fault, async t => {
    const f = await fixture(t);
    const removed = await f.catalog.deleteProject({ project_id: f.gone.project_id, actor_id: "person", delete_confirmed: true, idempotency_key: "native" });
    const original = f.projects.lifecycle.getDeletion(removed.deletion.deletion_id);
    if (fault !== "missing") f.sourceReceipt({ ...original, ...(fault === "regressed" ? { cleanup_state: "pending" as const }
      : fault === "plan" ? { recovery_plan: JSON.stringify({ version: 1, kind: "absent", project_id: original.project_id, operation_id: "wrong" }) }
      : { request_fingerprint: "collision" }) });
    await assert.rejects(f.open(), invalid); assert.equal(f.groups.length, 0); assert.equal(f.clearCount, 0);
  });
});

test("source exhaustion and successful close precede all target writes and malformed authority cannot authorize work", async t => {
  const f = await fixture(t); f.sourceReceipt();
  const source = await openProjectDeletionRecoveryInspection({ homeDirectory: f.sourceHome, assertCurrent() {} });
  await assert.rejects(f.open({ source: { next: request => source.next(request), async close() { await source.close(); throw new Error("close failed"); } } }), /close failed/);
  assert.equal(f.groups.length, 0); assert.equal(f.projects.query.listProjectDeletions().length, 0);
  const second = await openProjectDeletionRecoveryInspection({ homeDirectory: f.sourceHome, assertCurrent() {} });
  try { await assert.rejects(f.open({ source: second, assertCurrent: async () => {} }), invalid); } finally { await second.close(); }
  assert.equal(f.groups.length, 0);
});

test("failed post-COMMIT snapshot advancement preserves acceptance and prevents cleanup or failure bookkeeping", async t => {
  const f = await fixture(t), source = f.sourceReceipt();
  const target = await f.open({ catalogCommitted() { throw new Error("frame did not accept committed snapshot"); } });
  await assert.rejects(target.restore(source.deletion_id), /frame did not accept/);
  assert.equal(f.projects.query.listProjectDeletions().length, 1);
  assert.equal(f.projects.query.listProjectDeletions()[0]!.cleanup_state, "pending");
  assert.equal(f.clearCount, 0); assert.ok(existsSync(join(f.home, "projects", f.gone.project_id, "original.txt")));
  await assert.rejects(target.restore(source.deletion_id), invalid);
});

test("authority loss after a real directory rename prevents final facts/rm and resumes the original stage", async t => {
  const f = await fixture(t), source = f.sourceReceipt();
  const target = await f.open();
  const originalRename = fs.rename;
  fs.rename = async (from, to) => { await originalRename(from, to); if (String(from) === join(f.home, "projects", f.gone.project_id)) f.revoke(); };
  try { await assert.rejects(target.restore(source.deletion_id), /maintenance withdrawn/); } finally { fs.rename = originalRename; }
  const record = f.projects.lifecycle.getDeletion(f.groups[0]!.disposal.primary_target!);
  assert.equal(record.cleanup_state, "pending"); assert.ok(f.projects.lifecycle.retainedProject(f.gone.project_id));
  assert.ok(existsSync(join(record.staged_directory, "original.txt")));
  f.resume(); await target.close(); const resumed = await f.open();
  assert.equal((await resumed.restore(source.deletion_id)).cleanup_state, "complete");
  assert.equal(existsSync(record.staged_directory), false);
});

test("a directory replaced while an owner awaits is preserved and leaves the original target decision pending", async t => {
  const f = await fixture(t), source = f.sourceReceipt(), directory = join(f.home, "projects", f.gone.project_id);
  const preserved = join(f.home, "selected-original");
  const target = await f.open({ memory: { ...f.memory, async clear(projectId, deletion, control) {
    await f.memory.clear(projectId, deletion, control);
    await fs.rename(directory, preserved); await mkdir(directory); await writeFile(join(directory, "unselected.txt"), "do not delete");
  } } });
  assert.equal((await target.restore(source.deletion_id)).cleanup_state, "pending");
  assert.equal(await readFile(join(directory, "unselected.txt"), "utf8"), "do not delete");
  assert.equal(await readFile(join(preserved, "original.txt"), "utf8"), "original target");
  assert.ok(f.projects.lifecycle.retainedProject(f.gone.project_id));
});

test("failure to persist the whole association group leaves all target receipts and files untouched", async t => {
  const f = await fixture(t); f.sourceReceipt(); f.sourceReceipt();
  await assert.rejects(f.open({ async recordTargets(group) { assert.equal(group.sources.length, 2); throw new Error("marker unavailable"); } }), /marker unavailable/);
  assert.equal(f.projects.query.listProjectDeletions().length, 0); assert.equal(f.clearCount, 0);
  assert.ok(existsSync(join(f.home, "projects", f.gone.project_id, "original.txt")));
});

test("a missing original verification capability cannot certify an old complete receipt", async t => {
  const f = await fixture(t);
  const gone = await f.catalog.deleteProject({ project_id: f.gone.project_id, actor_id: "person", delete_confirmed: true, idempotency_key: "complete" });
  const source = f.sourceReceipt(f.projects.lifecycle.getDeletion(gone.deletion.deletion_id));
  const actual = projectDeletedHooksFor(f.home).owners().find(owner => owner.id === "memory")!;
  const target = await f.open({ memory: actual });
  await assert.rejects(target.restore(source.deletion_id), invalid);
  assert.equal(f.changes.length, 0);
});
