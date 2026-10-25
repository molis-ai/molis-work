import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { LOCAL_PERSON_ACTOR_ID as actor } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryCandidateRecord } from "@molis-ai/molis-work-contracts/services/memory";
import { openMemoryLedger, homeSqlitePath, LocalSqliteStorage, openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { characterOwner, defaultPrefs } from "@molis-ai/molis-work-service-memory";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { ProjectsModule } from "@molis-ai/molis-work-module-projects";
import { readMemoryOwnerCoverage, AssistantStore, ASSISTANT_STORE_NAME, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";

function fixture(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "molis-memory-owner-coverage-"));
  const ledger = openMemoryLedger({ homeDirectory: home });
  ledger.savePrefs(actor, "personal", defaultPrefs("personal", "reviewed"));
  ledger.savePrefs(actor, "project-default", defaultPrefs("project", "reviewed"));
  ledger.setMarker(actor, "strategy-adoption", { origin: "new-home" }, "2026-10-25T00:00:00Z");
  t.after(() => { ledger.close(); rmSync(home, { recursive: true, force: true }); });
  return { home, ledger, read: (projectId = "a") => readMemoryOwnerCoverage({ homeDirectory: home, ledger, projectId }) };
}
const candidate = (project: string, owner: string): MemoryCandidateRecord => ({ candidate_id: "candidate-old-window", actor_id: actor, scope: "character",
  owner, project_id: project, version: 1, kind: "fact", text: "PRIVATE CANDIDATE", applies: {}, basis: "inferred", why: "PRIVATE REASON",
  from: "work", work: null, hold_reason: null, supersedes: null, state: "pending", created_at: "2026-10-25T00:00:00Z", memory_id: null });

test("coverage derives both selections from full ledger relations including the old candidate-only window", t => {
  const f = fixture(t), a = characterOwner("a", "writer"), b = characterOwner("b", "writer");
  f.ledger.noteOwner({ scope: "character", owner: b, project_id: "b", subject: "writer", title: "PRIVATE TITLE" });
  f.ledger.saveCandidate(candidate("a", a));
  assert.throws(() => f.read("unknown-project"), { code: "memory.conflict" });
  const expected = [{ scope: "character", owner: a }, { scope: "project", owner: "a" }];
  assert.deepEqual(f.read().scopes, expected);
  assert.ok(f.read().knownScopes.some(row => row.scope === "user" && row.owner === actor));
  assert.deepEqual(f.read().knownScopes.filter(row => row.scope === "character").map(row => row.owner).sort(), [a, b].sort());
  assert.equal(JSON.stringify(f.read()).includes("PRIVATE"), false);
  assert.equal(JSON.stringify(f.ledger.ownerRelations()).includes("PRIVATE"), false);
  f.ledger.noteOwner({ scope: "character", owner: a, project_id: "a", subject: "writer", title: "Renamed" });
  assert.deepEqual(f.read().scopes, expected, "the later owner record deduplicates the same identity");
  const second = openMemoryLedger({ homeDirectory: f.home });
  try { assert.deepEqual(second.ownerRelations(), f.ledger.ownerRelations()); } finally { second.close(); }
});

test("coverage refuses candidate index/body conflicts and cross-source project or subject contradictions", t => {
  const f = fixture(t), a = characterOwner("a", "writer");
  f.ledger.noteOwner({ scope: "character", owner: a, project_id: "a", subject: "writer", title: "Original" });
  f.ledger.noteOwner({ scope: "project", owner: "a", project_id: "a", title: "Known target remains" });
  f.ledger.saveCandidate(candidate("b", a));
  assert.throws(f.read, { code: "memory.conflict" });
  f.ledger.saveCandidate(candidate("a", a));
  const db = new DatabaseSync(homeSqlitePath(f.home, "memory"));
  try {
    for (const change of [{ actor_id: "other" }, { candidate_id: "other" }, { state: "expired" }, { scope: "unknown" }]) {
      db.prepare("UPDATE memory_candidates SET body=?").run(JSON.stringify({ ...candidate("a", a), ...change }));
      assert.throws(f.read, { code: "memory.conflict" });
    }
    db.prepare("UPDATE memory_candidates SET body='not-json'").run();
    assert.throws(f.read, { code: "memory.conflict" });
    db.prepare("DELETE FROM memory_candidates").run();
    db.prepare("UPDATE memory_owners SET subject='wrong-subject' WHERE scope='character'").run();
    assert.throws(f.read, { code: "memory.conflict" });
    db.prepare("UPDATE memory_owners SET subject=NULL, project_id=NULL WHERE scope='character'").run();
    assert.throws(f.read, { code: "memory.conflict" });
  } finally { db.close(); }
});

test("Catalog current projects and retained pending/complete plans stay in the same body-free relation set", async t => {
  const f = fixture(t), catalog = await openMolisWorkProjectCatalog({ homeDirectory: f.home });
  t.after(() => catalog.close());
  const live = await catalog.createProject({ display_name: "Private project name", actor_id: actor });
  const storage = new LocalSqliteStorage(join(f.home, "projects", "catalog.db"));
  try {
    const projects = new ProjectsModule({ db: storage.db, plugins: { has: () => false, companions: () => [] } });
    for (const state of ["pending", "complete"] as const) {
      const projectId = `deleted-${state}`, operation = `delete-${state}`, owner = characterOwner(projectId, "old-character");
      const recovery = { version: 1, kind: "runtime", project_id: projectId, operation_id: operation,
        sessions: { project_id: projectId, operation_id: operation, sessions: [] },
        memory: { project_id: projectId, operation_id: operation, actor_id: actor, scopes: [
          { scope: "character", owner, memories: [], candidates: [], sources: [] },
          { scope: "personal", owner: actor, memories: [], candidates: [], sources: [] }] } };
      projects.lifecycle.insertDeletion({ deletion_id: operation, actor_id: actor, idempotency_key: operation, request_fingerprint: operation,
        project_id: projectId, display_name: "Private deleted title", staged_directory: join(f.home, projectId), deleted_binding_count: 0,
        cleanup_state: state, cleanup_error: null, deleted_at: "2026-10-25T00:00:00Z", cleaned_at: state === "complete" ? "2026-10-25T00:00:00Z" : null,
        recovery_plan: JSON.stringify(recovery) });
      const projection = f.read(projectId);
      assert.deepEqual(projection.scopes, [{ scope: "character", owner }, { scope: "project", owner: projectId }]);
      assert.ok(projection.knownScopes.some(row => row.scope === "project" && row.owner === live.project_id));
      assert.equal(projection.scopes.some(row => row.owner === actor), false);
      assert.equal(JSON.stringify(projection).includes("Private"), false);
    }
    f.ledger.saveCandidate(candidate("conflicting-project", characterOwner("deleted-pending", "old-character")));
    assert.throws(() => f.read("deleted-pending"), { code: "memory.conflict" });
    f.ledger.dropCandidate("candidate-old-window");
    // A retained completed receipt is not permission to ignore its broken original plan.
    storage.db.prepare("UPDATE project_deletions SET recovery_plan='{}' WHERE deletion_id='delete-complete'").run();
    assert.throws(() => f.read(live.project_id), { code: "catalog.project_storage_invalid" });
  } finally { storage.close(); }
});

test("only the persisted Work's own project/Character pairing is usable; historical Rounds are not joined to it", async t => {
  const f = fixture(t), catalog = await openMolisWorkProjectCatalog({ homeDirectory: f.home });
  t.after(() => catalog.close());
  const project = await catalog.createProject({ display_name: "Project", actor_id: actor });
  const db = openHomeSqliteDatabase(f.home, ASSISTANT_STORE_NAME);
  try {
    const store = new AssistantStore(db);
    let work = store.create({ actor_id: actor, title: "Private Work", scope: { kind: "project", project_id: project.project_id }, origin: null,
      project_ref: molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path }) });
    assert.deepEqual(f.read(project.project_id).scopes.filter(row => row.scope === "character"), [], "an ordinary Work has no Character relation");
    work = store.update(actor, work.work_id, work.revision, { character: { artifact_id: "current-character", version: 1, title: "Private Character" }, archived: true });
    store.addRound(work.work_id, { run_id: "historical-round", text: "Private history", materials: [], context: null, started_at: "2026-10-25T00:00:00Z",
      character: { artifact_id: "old-character-without-project", version: 1, title: "Private old Character" } });
    work = store.update(actor, work.work_id, work.revision, { character: undefined });
    assert.deepEqual(f.read(project.project_id).scopes.filter(row => row.scope === "character"), [], "clearing the current Character does not borrow a historical Round's role");
    work = store.update(actor, work.work_id, work.revision, { character: { artifact_id: "current-character", version: 1, title: "Private Character" } });
    const owner = characterOwner(project.project_id, "current-character");
    f.ledger.noteOwner({ scope: "character", owner, project_id: project.project_id, title: "Original null subject" });
    const projected = f.read(project.project_id);
    assert.deepEqual(projected.scopes.filter(row => row.scope === "character"), [{ scope: "character", owner }]);
    assert.equal(JSON.stringify(projected).includes("Private"), false);
    assert.equal(f.ledger.owners(project.project_id)[0]?.subject, null, "projection never repairs persisted identity or grants mutation");
    db.prepare("UPDATE assistant_works SET body=json_set(body,'$.scope.project_id','other-project') WHERE work_id=?").run(work.work_id);
    assert.throws(() => f.read(project.project_id), { code: "memory.conflict" });
  } finally { db.close(); }
});
