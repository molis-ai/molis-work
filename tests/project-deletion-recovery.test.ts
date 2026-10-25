import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, ensureSystemAgentService, projectDeletedHooksFor, AssistantStore, ASSISTANT_STORE_NAME, molisWorkHostProjectReference, memoryRuntimePolicy, DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { openMemoryLedger, openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { characterOwner } from "@molis-ai/molis-work-service-memory";
import { memoryActions } from "@molis-ai/molis-work-contracts/services/memory";
import { ASSISTANT_PLUGIN_ID, ASSISTANT_INSTALL_ID, ASSISTANT_PERSONAL_OWNER } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentMemoryMeta, AgentMemoryCapability } from "@molis-ai/molis-work-contracts/services/agent-host";

const actor = LOCAL_PERSON_ACTOR_ID;
const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk"));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
const meta: AgentMemoryMeta = { kind: "fact", source: "manual", approved_by: { by: "person" }, classification: { scenes: ["common"], lifecycle: "long-term" } };
function runtimeRecords(root: string): Record<string, string> {
  return Object.fromEntries(readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? Object.entries(runtimeRecords(join(root, entry.name))).map(([name, bytes]) => [`${entry.name}/${name}`, bytes])
    : [[entry.name, readFileSync(join(root, entry.name)).toString("base64")]]));
}
/** Public SDK setup represents originals predating App ownership records; the tested operation uses the resident owner. */
function openOriginalRuntime(home: string, source?: { eventId: string; version: string; text: string }) {
  const declared = memoryRuntimePolicy(() => undefined).policy;
  const policy = { ...declared, matrix: { ...declared.matrix, rows: declared.matrix?.rows?.map(row => ({ ...row,
    actions: row.actions?.filter(action => action !== "promote"), write: { ...row.write, approval: "person" } })) } };
  return createRuntime({ app: { appId: "io.molis.work", appVersion: "0.0.0" },
    host: createNodeHost({ storageRoot: join(home, "agent-runtime"), exclusiveOwner: true }), config: { memory: policy },
    ...(source ? { memorySources: {
      resolve: async (request: { refs: readonly { eventId: string; version: string }[] }) => request.refs.every(ref => ref.eventId === source.eventId && ref.version === source.version)
        ? [{ ...source, speaker: { kind: "person" as const, id: actor }, derivation: "original" as const, occurredAtMs: 1 }] : [],
      check: async (request: { identities: readonly { eventId: string; version: string }[] }) => request.identities.every(ref => ref.eventId === source.eventId && ref.version === source.version),
    } } : {}),
    memoryAuthority: { authorize: async () => true, authorizeManagement: async () => ({ allowed: true, storageCost: "visible" }),
      defaultContext: { consumer: "ui", currentScene: "common", purpose: "management" } } });
}
async function fixture(t: TestContext, project_id?: string) {
  const home = await mkdtemp(join(tmpdir(), "molis-project-fixed-recovery-"));
  let catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const gone = await catalog.createProject({ project_id, display_name: "Delete this project", actor_id: actor });
  const kept = await catalog.createProject({ display_name: "Keep this project", actor_id: actor });
  let host!: MolisWorkLocalHost;
  const open = async () => { host = new MolisWorkLocalHost({ homeDirectory: home }); const service = ensureSystemAgentService(host, home, withMolisWorkProjectCatalog); await service.ready; return service; };
  let agents = await open();
  const close = async () => { await host.close(); catalog.close(); };
  t.after(async () => { await close(); await rm(home, { recursive: true, force: true }); });
  const caller = (project_id: string | null = gone.project_id) => ({ actor_id: actor, project_id, person: true, consumer: "ui" as const, current_scene: "common", purpose: "management" as const });
  const request = { project_id: gone.project_id, actor_id: actor, delete_confirmed: true, idempotency_key: "original-project-deletion" };
  const storage = () => new DatabaseSync(join(home, "projects", "catalog.db"), { readOnly: true });
  const retained = () => { const db = storage(); try { return Number((db.prepare("SELECT count(*) n FROM projects WHERE project_id=?").get(gone.project_id) as { n: number }).n); } finally { db.close(); } };
  return { home, gone, kept, caller, request, storage, retained, get catalog() { return catalog; }, get host() { return host; },
    get agents() { return agents; }, adapter: () => agents.agentHost.adapter("prologue"),
    memory: (project?: string | null, session_id?: string) => agents.agentHost.adapter("prologue").memory!.withCaller({ ...caller(project), ...(session_id ? { session_id } : {}) }),
    async originalCandidate(sessionId: string) {
      await host.close();
      const source = { eventId: "original-person-statement", version: "1", text: "Keep the original candidate for deletion recovery" };
      const runtime = await openOriginalRuntime(home, source);
      try {
        const sessionRef = { kind: "session" as const, id: sessionId, revision: 1 }, bound = runtime.bindMemory({ consumer: "ui", currentScene: "common", purpose: "management", sessionRef });
        const entry = await bound.candidates.propose({ scope: "project", owner: gone.project_id, text: "Retained original candidate", origin: "person",
          sources: [{ eventId: source.eventId, version: source.version }],
          meta: { kind: "fact", source: "manual", approvedBy: { by: "person" }, classification: { scenes: ["common"], lifecycle: "long-term" }, sessionRef } },
        { operationId: "orphan-candidate", expectedVersion: 0 });
        return { candidate_id: entry.ref.id, version: entry.version };
      } finally { await runtime.shutdown(); agents = await open(); }
    },
    reopen: async () => { await close(); catalog = await openMolisWorkProjectCatalog({ homeDirectory: home }); agents = await open(); } };
}

test("the accepted project plan clears real Sessions and bound personal tombstones before business owners; retry preserves its original decision", { timeout: 90_000 }, async t => {
  const f = await fixture(t);
  const coding = { project_id: f.gone.project_id, plugin_id: "io.molis.work.coding", install_id: "coding-installed", actor_id: actor };
  const root = await f.adapter().createSession({ ...coding, workspace: "none", role_id: "coding", title: "Archived Coding session" });
  const lifecycle = f.adapter().sessionLifecycle!;
  const state = await lifecycle.read(root, coding);
  await lifecycle.archive(root, { operation_id: "archive-original", expected_version: state.version!, expected_state: "active" }, coding);
  const assistantOwner = { project_id: ASSISTANT_PERSONAL_OWNER, plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID, actor_id: actor };
  const assistant = await f.adapter().createSession({ ...assistantOwner, workspace: "none", role_id: "assistant", title: "Associated personal session" });
  const db = openHomeSqliteDatabase(f.home, ASSISTANT_STORE_NAME), works = new AssistantStore(db);
  const work = works.create({ actor_id: actor, title: "Associated Work", scope: { kind: "project", project_id: f.gone.project_id }, origin: null });
  works.update(actor, work.work_id, work.revision, { session_id: assistant.session_id, archived: true }); db.close();
  const reference = molisWorkHostProjectReference({ databasePath: f.gone.database_path, projectId: f.gone.project_id });
  const project = await f.host.actionClient(reference).invoke(await f.host.localPersonContext(reference), memoryActions.write,
    { scope: "project", text: "Project text to remove" });
  const personal = await f.memory(null, assistant.session_id).write({ scope: "user", owner: actor, text: "Bound personal text", origin: "person", operation_id: "bound-personal",
    meta: { ...meta, session_ref: { kind: "session", id: assistant.session_id, revision: 1 } } });
  const tombstone = await f.memory(null).tombstone({ scope: "user", owner: actor, memory_id: personal.memory_id, expected_version: personal.version, operation_id: "bound-tombstone" });
  const kept = await f.memory(null).write({ scope: "user", owner: actor, text: "Pure reference stays", origin: "person", operation_id: "pure-reference",
    meta: { ...meta, evidence: [{ kind: "session", ref: assistant.session_id }] } });
  let fail = true, calls = 0;
  const unregister = projectDeletedHooksFor(f.home).register({ id: "test-after-memory", label: null, clear: async () => {
    calls++;
    assert.equal((await f.adapter().sessionLifecycle!.read(root, coding)).state, "purged");
    assert.equal((await f.adapter().sessionLifecycle!.read(assistant, assistantOwner)).state, "purged");
    assert.equal(f.retained(), 1, "the Catalog row still exists when a business owner clears");
    assert.equal(existsSync(f.gone.database_path), true, "the project directory remains through business cleanup");
    if (fail) throw new Error("Business owner failed after runtime purge");
  } }); t.after(unregister);
  const first = await f.catalog.deleteProject(f.request);
  assert.equal(first.deletion.cleanup_state, "pending"); assert.equal(first.deletion.owner_steps.find(step => step.owner_id === "memory")?.state, "complete");
  assert.equal(f.catalog.listProjects().some(row => row.project_id === f.gone.project_id), false);
  assert.throws(() => f.catalog.getProject(f.gone.project_id), { code: "catalog.project_not_found" });
  assert.equal(f.retained(), 1); assert.equal(existsSync(f.gone.database_path), true);
  const saved = f.storage(); const plan = String((saved.prepare("SELECT recovery_plan FROM project_deletions WHERE deletion_id=?").get(first.deletion.deletion_id) as { recovery_plan: string }).recovery_plan); saved.close();
  assert.equal(plan.includes("text to remove"), false); assert.equal(plan.includes("Bound personal text"), false);
  const original = JSON.parse(plan); assert.ok(original.memory.scopes.find((scope: { scope: string }) => scope.scope === "personal").memories.some((row: { memory_id: string; version: number }) => row.memory_id === personal.memory_id && row.version === tombstone.version));
  assert.ok(original.sessions.sessions.some((row: { session: { session_id: string }; owner: { project_id: string } }) => row.session.session_id === assistant.session_id && row.owner.project_id === ASSISTANT_PERSONAL_OWNER));
  await f.reopen(); fail = false;
  const repeated = await f.catalog.deleteProject(f.request);
  assert.equal(repeated.replayed, true); assert.equal(repeated.deletion.cleanup_state, "complete"); assert.equal(calls, 2);
  assert.equal(f.retained(), 0); assert.equal(existsSync(f.gone.database_path), false);
  const after = f.storage(); assert.equal((after.prepare("SELECT recovery_plan FROM project_deletions WHERE deletion_id=?").get(first.deletion.deletion_id) as { recovery_plan: string }).recovery_plan, plan); after.close();
  assert.deepEqual((await f.memory(null).page({ scope: "user", owner: actor, filter: { tombstone: true } })).items, []);
  assert.deepEqual((await f.memory(null).list("user", actor)).map(row => row.memory_id), [kept.memory_id]);
  assert.ok(f.catalog.getProject(f.kept.project_id));
  assert.ok(project && typeof project === "object" && "memory" in project && project.memory);
});

for (const phase of ["purged", "prepared"] as const) test(`a new deletion recovers retained originals from an independently ${phase} indexed Session`, { timeout: 60_000 }, async t => {
  const f = await fixture(t), owner = { project_id: f.gone.project_id, plugin_id: "io.molis.work.coding", install_id: "installed", actor_id: actor };
  const session = await f.adapter().createSession({ ...owner, workspace: "none", role_id: "coding", title: "Prior purged Session" });
  const peer = await f.adapter().createSession({ ...owner, workspace: "none", role_id: "coding", title: "Another selected Session" });
  const entry = await f.memory(f.gone.project_id, session.session_id).write({ scope: "project", owner: f.gone.project_id, text: "Retained orphan", origin: "person", operation_id: "orphan",
    meta: { ...meta, session_ref: { kind: "session", id: session.session_id, revision: 1 } } });
  const candidate = await f.originalCandidate(session.session_id);
  const peerEntry = await f.memory(f.gone.project_id, peer.session_id).write({ scope: "project", owner: f.gone.project_id, text: "Second retained original", origin: "person", operation_id: "peer",
    meta: { ...meta, session_ref: { kind: "session", id: peer.session_id, revision: 1 } } });
  const kept = await f.memory(null).write({ scope: "user", owner: actor, text: "Unselected source reference", origin: "person", operation_id: "pure-source",
    meta: { ...meta, evidence: [{ kind: "session", ref: session.session_id }] } });
  const other = await f.memory(f.kept.project_id).write({ scope: "project", owner: f.kept.project_id, text: "Other project original", origin: "person", operation_id: "other", meta });
  const preview = await f.adapter().sessionLifecycle!.previewPurge(session, owner);
  const decision = { operation_id: "prior-session-purge", expected_version: preview.version, expected_state: preview.state };
  await f.adapter().sessionLifecycle![phase === "purged" ? "purge" : "preparePurge"](session, decision, preview, owner);
  const peerPreview = await f.adapter().sessionLifecycle!.previewPurge(peer, owner);
  await f.adapter().sessionLifecycle![phase === "purged" ? "purge" : "preparePurge"](peer,
    { operation_id: "prior-peer-purge", expected_version: peerPreview.version, expected_state: peerPreview.state }, peerPreview, owner);
  await f.reopen();
  const records = () => runtimeRecords(join(f.home, "agent-runtime", "records")), before = records();
  const target = { scope: "project" as const, owner: f.gone.project_id, memory_id: entry.memory_id, expected_version: entry.version, operation_id: "ordinary" };
  const refused = () => Promise.all([
    assert.rejects(f.memory().remove(target), { code: "MEMORY_SCOPE_DENIED" }),
    assert.rejects(f.memory().setMeta({ ...target, meta }), { code: "MEMORY_SCOPE_DENIED" }),
    assert.rejects(f.memory(f.gone.project_id, session.session_id).write({ scope: "project", owner: f.gone.project_id, text: "Caller only late save", origin: "person", operation_id: "late", meta }), { code: "MEMORY_SCOPE_DENIED" }),
  ]);
  await refused(); assert.deepEqual(records(), before);
  const hooks = projectDeletedHooksFor(f.home), original = hooks.owners().find(item => item.id === "memory")!;
  let entered!: () => void, release!: () => void, releaseEscaped!: () => void, escaped!: Promise<void>;
  const waiting = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  const escapeGate = new Promise<void>(resolve => { releaseEscaped = resolve; });
  const capability = f.adapter().memory!, bind = capability.withCaller.bind(capability);
  let failAfterCandidate = true;
  const interrupted = (bound: AgentMemoryCapability): AgentMemoryCapability => ({ ...bound,
    withExecution: control => interrupted(bound.withExecution!(control)),
    candidates: { ...bound.candidates, purge: async input => {
      const result = await bound.candidates.purge(input);
      if (input.candidate_id === candidate.candidate_id && failAfterCandidate) {
        failAfterCandidate = false; throw new Error("Interrupt after the original candidate was physically removed");
      }
      return result;
    } } });
  const failure = t.mock.method(capability, "withCaller", (who: Parameters<AgentMemoryCapability["withCaller"]>[0]) => interrupted(bind(who)));
  const dispose = hooks.register({ ...original, withRecovery: (input, work) => original.withRecovery!(input, async (plan, proof) => {
    assert.equal(plan.kind, "runtime"); if (plan.kind !== "runtime") throw new Error("runtime plan required");
    assert.equal(plan.sessions.sessions.find(item => item.session.session_id === session.session_id)?.decision.operation_id, decision.operation_id);
    assert.ok(plan.memory.scopes.some(scope => scope.memories.some(row => row.memory_id === entry.memory_id && row.version === entry.version)));
    const child = `${plan.operation_id}:memory:${entry.memory_id}`;
    // Even inside the trusted deletion frame, ordinary reads and modified effects have no retained-Session permission.
    assert.deepEqual((await f.memory().page({ scope: "project", owner: f.gone.project_id })).items, [], "ordinary pages omit denied entries and disclose no retained body");
    await assert.rejects(f.memory().remove({ ...target, operation_id: child }), { code: "MEMORY_SCOPE_DENIED" }, "a prepared plan cannot delete before the Catalog calls its original clear owner");
    await assert.rejects(f.memory().remove({ ...target, operation_id: `${child}-replacement` }), { code: "MEMORY_SCOPE_DENIED" });
    await assert.rejects(f.memory().remove({ ...target, operation_id: child, expected_version: entry.version + 1 }));
    await assert.rejects(f.memory().remove({ ...target, owner: f.kept.project_id, memory_id: other.memory_id, operation_id: `${plan.operation_id}:memory:${other.memory_id}` }));
    assert.deepEqual(records(), before, "discovery and rejected replacement effects do not write the originals");
    escaped = assert.rejects(escapeGate.then(() => f.memory().remove({ ...target, operation_id: child })), { code: "MEMORY_SCOPE_DENIED" });
    entered(); await gate; return work(plan, proof);
  }) }); t.after(dispose);
  const deleting = f.catalog.deleteProject(f.request);
  await Promise.race([waiting, deleting.then(() => { throw new Error("deletion did not reach the held original plan"); })]);
  try { await refused(); assert.deepEqual(records(), before, "concurrent ordinary calls cannot borrow the held deletion frame"); }
  finally { release(); }
  const partial = await deleting;
  assert.equal(partial.deletion.cleanup_state, "pending");
  assert.match(partial.deletion.cleanup_error!, /Interrupt after the original candidate/);
  assert.equal(partial.deletion.owner_steps.find(step => step.owner_id === "memory")?.state, "pending");
  assert.equal(f.retained(), 1); assert.equal(existsSync(f.gone.database_path), true);
  const interruptedBytes = records(); releaseEscaped(); await escaped; await refused();
  assert.deepEqual(records(), interruptedBytes, "an escaped original ALS and ordinary callers cannot continue after its active interval");
  const persistedPlan = () => {
    const db = f.storage();
    try { return (db.prepare("SELECT recovery_plan FROM project_deletions WHERE deletion_id=?").get(partial.deletion.deletion_id) as { recovery_plan: string }).recovery_plan; }
    finally { db.close(); }
  };
  const recovery = persistedPlan(); assert.equal(typeof recovery, "string");
  dispose(); failure.mock.restore(); await f.reopen();
  const deleted = await f.catalog.deleteProject(f.request);
  assert.equal(deleted.replayed, true); assert.equal(deleted.deletion.deletion_id, partial.deletion.deletion_id);
  assert.equal(persistedPlan(), recovery, "restart reuses the persisted fixed original plan after a real partial purge");
  assert.equal(deleted.deletion.cleanup_state, "complete", deleted.deletion.cleanup_error ?? "");
  assert.equal(f.retained(), 0); assert.equal(existsSync(f.gone.database_path), false);
  assert.equal((await f.adapter().sessionLifecycle!.read(session, owner)).operation?.decision.operation_id, decision.operation_id);
  assert.deepEqual((await f.memory(null).list("user", actor)).map(row => row.memory_id), [kept.memory_id]);
  assert.deepEqual((await f.memory(f.kept.project_id).list("project", f.kept.project_id)).map(row => row.memory_id), [other.memory_id]);
  // A stale CAS could not delete a retained original; absence makes this a no-op.
  await f.memory().remove({ scope: "project", owner: f.gone.project_id, memory_id: entry.memory_id,
    expected_version: entry.version + 1, operation_id: "prove-absent" });
  await f.memory().candidates.purge({ scope: "project", owner: f.gone.project_id, candidate_id: candidate.candidate_id,
    expected_version: candidate.version + 1, operation_id: "prove-candidate-absent" });
  await f.memory().remove({ scope: "project", owner: f.gone.project_id, memory_id: peerEntry.memory_id,
    expected_version: peerEntry.version + 1, operation_id: "prove-peer-absent" });
});

test("an incomplete online preview accepts no receipt and leaves Catalog, directory and originals unchanged", { timeout: 60_000 }, async t => {
  const f = await fixture(t);
  const entry = await f.memory().write({ scope: "project", owner: f.gone.project_id, text: "Retained on incomplete preview", origin: "person", operation_id: "incomplete", meta });
  const capability = f.adapter().memory!, original = capability.withCaller.bind(capability);
  const incomplete = (bound: AgentMemoryCapability): AgentMemoryCapability => ({ ...bound,
    withExecution: control => incomplete(bound.withExecution!(control)),
    previewPurge: async query => ({ ...await bound.previewPurge(query), outcome: "partial", issues: [{ code: "STORAGE_RECONCILE_REQUIRED" }] }) });
  const failure = t.mock.method(capability, "withCaller", (who: Parameters<AgentMemoryCapability["withCaller"]>[0]) => incomplete(original(who)));
  await assert.rejects(f.catalog.deleteProject(f.request), /尚未完整确认/);
  assert.deepEqual(f.catalog.listProjectDeletions(), []); assert.equal(f.retained(), 1); assert.equal(existsSync(f.gone.database_path), true);
  assert.ok(f.catalog.getProject(f.gone.project_id)); failure.mock.restore();
  assert.equal((await f.memory().list("project", f.gone.project_id))[0]?.memory_id, entry.memory_id);
  assert.equal((await f.catalog.deleteProject(f.request)).deletion.cleanup_state, "complete");
});

test("a legacy NULL recovery receipt stays pending without running owners or rescanning a new plan", { timeout: 60_000 }, async t => {
  const f = await fixture(t); let called = 0;
  const unregister = projectDeletedHooksFor(f.home).register({ id: "test-legacy", label: null, clear: () => { called++; throw new Error("leave pending"); } }); t.after(unregister);
  const first = await f.catalog.deleteProject(f.request); assert.equal(first.deletion.cleanup_state, "pending"); assert.equal(called, 1);
  const db = new DatabaseSync(join(f.home, "projects", "catalog.db")); db.prepare("UPDATE project_deletions SET recovery_plan=NULL WHERE deletion_id=?").run(first.deletion.deletion_id); db.close();
  await f.reopen();
  const repeated = await f.catalog.deleteProject(f.request);
  assert.equal(repeated.deletion.cleanup_state, "pending"); assert.match(repeated.deletion.cleanup_error!, /原项目删除计划缺失/);
  assert.equal(called, 1); assert.equal(f.retained(), 1); assert.equal(existsSync(f.gone.database_path), true);
});

test("a receipt commit failure after directory removal resumes the same completed owner steps", { timeout: 60_000 }, async t => {
  const f = await fixture(t, "project-onboarding-00000000-0000-4000-8000-000000000011"); let calls = 0;
  const dispose = projectDeletedHooksFor(f.home).register({ id: "test-directory-recovery", label: null, clear: () => { calls++; } }); t.after(dispose);
  const fault = new DatabaseSync(join(f.home, "projects", "catalog.db"));
  fault.exec("CREATE TRIGGER fail_completion BEFORE UPDATE OF cleanup_state ON project_deletions WHEN NEW.cleanup_state='complete' BEGIN SELECT RAISE(ABORT,'receipt completion failed'); END");
  const first = await f.catalog.deleteProject(f.request);
  assert.equal(first.deletion.cleanup_state, "pending"); assert.match(first.deletion.cleanup_error!, /receipt completion failed/);
  assert.equal(f.retained(), 0); assert.equal(existsSync(f.gone.database_path), false); assert.equal(calls, 1);
  assert.ok(first.deletion.owner_steps.every(step => step.state === "complete"));
  await assert.rejects(f.catalog.createProject({ project_id: f.gone.project_id, display_name: "Cannot replace pending deletion", actor_id: actor }),
    { code: "catalog.project_storage_invalid" });
  assert.equal(f.retained(), 0); assert.equal(existsSync(f.gone.database_path), false);
  fault.exec("DROP TRIGGER fail_completion"); fault.close();
  await f.reopen();
  const repeated = await f.catalog.deleteProject(f.request);
  assert.equal(repeated.replayed, true); assert.equal(repeated.deletion.deletion_id, first.deletion.deletion_id);
  assert.equal(repeated.deletion.cleanup_state, "complete"); assert.equal(calls, 1);
  const successor = await f.catalog.createProject({ project_id: f.gone.project_id, display_name: "A new project after completion", actor_id: actor });
  const completeReplay = await f.catalog.deleteProject(f.request);
  assert.equal(completeReplay.replayed, true); assert.equal(calls, 1);
  assert.equal(f.catalog.getProject(successor.project_id).display_name, successor.display_name);
  assert.equal(existsSync(successor.database_path), true, "an already completed original deletion cannot delete its successor");
});

test("the preparation hold rejects new project and bound-personal writes before the Catalog accepts, while unrelated personal data remains usable", { timeout: 60_000 }, async t => {
  const f = await fixture(t), owner = { project_id: f.gone.project_id, plugin_id: "io.molis.work.coding", install_id: "installed", actor_id: actor };
  const session = await f.adapter().createSession({ ...owner, workspace: "none", role_id: "coding", title: "Held Session" });
  await f.memory(null, session.session_id).write({ scope: "user", owner: actor, text: "Accepted before the hold", origin: "person", operation_id: "before-hold",
    meta: { ...meta, session_ref: { kind: "session", id: session.session_id, revision: 1 } } });
  const hooks = projectDeletedHooksFor(f.home), original = hooks.owners().find(item => item.id === "memory")!;
  let entered!: () => void, release!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  const dispose = hooks.register({ ...original, withRecovery: (input, work) => original.withRecovery!(input, async (plan, proof) => { entered(); await gate; return work(plan, proof); }) }); t.after(dispose);
  const deleting = f.catalog.deleteProject(f.request); await waiting;
  assert.deepEqual(f.catalog.listProjectDeletions(), []);
  await assert.rejects(f.memory().write({ scope: "project", owner: f.gone.project_id, text: "Late project write", origin: "person", operation_id: "late-project", meta }));
  await assert.rejects(f.memory(null, session.session_id).write({ scope: "user", owner: actor, text: "Late bound write", origin: "person", operation_id: "late-bound",
    meta: { ...meta, session_ref: { kind: "session", id: session.session_id, revision: 1 } } }));
  const kept = await f.memory(null).write({ scope: "user", owner: actor, text: "Unrelated personal memory", origin: "person", operation_id: "unrelated-during-hold", meta });
  release(); assert.equal((await deleting).deletion.cleanup_state, "complete");
  assert.deepEqual((await f.memory(null).list("user", actor)).map(item => item.memory_id), [kept.memory_id]);
});

test("a Catalog-only new Home can clear project preferences without starting a Runtime; unknown ledger content refuses before acceptance", async t => {
  const { openMemoryLedger, memoryLedgerHasOnlyPreferences } = await import("@molis-ai/molis-work-storage");
  const { defaultPrefs } = await import("@molis-ai/molis-work-service-memory");
  const home = await mkdtemp(join(tmpdir(), "molis-project-empty-runtime-")), catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  t.after(async () => { catalog.close(); await rm(home, { recursive: true, force: true }); });
  const gone = await catalog.createProject({ display_name: "No runtime project", actor_id: actor });
  const next = await catalog.createProject({ display_name: "Unknown ledger project", actor_id: actor });
  const ledger = openMemoryLedger({ homeDirectory: home }); t.after(() => ledger.close());
  ledger.savePrefs(actor, `project:${gone.project_id}`, defaultPrefs("project", "reviewed"));
  assert.equal(memoryLedgerHasOnlyPreferences({ homeDirectory: home }), true);
  const request = (id: string) => ({ actor_id: actor, project_id: id, delete_confirmed: true, idempotency_key: `delete-${id}` });
  assert.equal((await catalog.deleteProject(request(gone.project_id))).deletion.cleanup_state, "complete");
  assert.equal(existsSync(join(home, "agent-runtime")), false);
  assert.equal(ledger.prefs(actor, `project:${gone.project_id}`), null); assert.ok(ledger.prefs(actor, "personal"));
  ledger.setMarker(actor, "unknown-state", { value: "must retain" }, new Date().toISOString());
  assert.equal(memoryLedgerHasOnlyPreferences({ homeDirectory: home }), false);
  await assert.rejects(catalog.deleteProject(request(next.project_id)), /账注|原件范围/);
  assert.equal(catalog.listProjectDeletions().length, 1); assert.ok(catalog.getProject(next.project_id)); assert.equal(existsSync(next.database_path), true);
  assert.deepEqual(ledger.marker(actor, "unknown-state")?.body, { value: "must retain" });
});

test("an accepted absent plan can resume after another project starts the Runtime without adopting its new data", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-project-absent-recovery-"));
  let catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  let host: MolisWorkLocalHost | undefined;
  t.after(async () => { await host?.close(); catalog.close(); await rm(home, { recursive: true, force: true }); });
  const gone = await catalog.createProject({ display_name: "Originally empty project", actor_id: actor });
  const kept = await catalog.createProject({ display_name: "Later running project", actor_id: actor });
  let fail = true;
  const dispose = projectDeletedHooksFor(home).register({ id: "test-absent-retry", label: null, clear: () => { if (fail) throw new Error("business failure after absent Memory step"); } }); t.after(dispose);
  const request = { project_id: gone.project_id, actor_id: actor, delete_confirmed: true, idempotency_key: "original-absent" };
  const first = await catalog.deleteProject(request);
  assert.equal(first.deletion.cleanup_state, "pending"); assert.equal(first.deletion.owner_steps.find(step => step.owner_id === "memory")?.state, "complete");
  host = new MolisWorkLocalHost({ homeDirectory: home });
  const system = ensureSystemAgentService(host, home, withMolisWorkProjectCatalog); await system.ready;
  let memory = system.agentHost.adapter("prologue").memory!;
  const caller = (project_id: string) => ({ actor_id: actor, project_id, person: true, consumer: "ui" as const, current_scene: "common", purpose: "management" as const });
  const later = await memory.withCaller(caller(kept.project_id)).write({ scope: "project", owner: kept.project_id, text: "Later unrelated original", origin: "person", operation_id: "later-other-project", meta });
  await assert.rejects(memory.withCaller(caller(gone.project_id)).write({ scope: "project", owner: gone.project_id, text: "Pending project must stay closed", origin: "person", operation_id: "late-deleted-project", meta }));
  await host.close(); catalog.close();
  catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  host = new MolisWorkLocalHost({ homeDirectory: home });
  const resumed = ensureSystemAgentService(host, home, withMolisWorkProjectCatalog); await resumed.ready;
  memory = resumed.agentHost.adapter("prologue").memory!;
  await assert.rejects(resumed.agentHost.adapter("prologue").createSession({ project_id: gone.project_id, plugin_id: "io.molis.work.coding",
    install_id: "installed", actor_id: actor, workspace: "none", role_id: "coding", title: "Must remain refused after restart" }), { code: "agent.session_busy" });
  await assert.rejects(memory.withCaller(caller(gone.project_id)).write({ scope: "project", owner: gone.project_id, text: "Still closed after restart",
    origin: "person", operation_id: "late-after-restart", meta }));
  fail = false;
  const repeated = await catalog.deleteProject(request);
  assert.equal(repeated.deletion.cleanup_state, "complete", repeated.deletion.cleanup_error ?? "");
  assert.equal(repeated.deletion.deletion_id, first.deletion.deletion_id);
  assert.deepEqual((await memory.withCaller(caller(kept.project_id)).list("project", kept.project_id)).map(item => item.memory_id), [later.memory_id]);
});

test("project deletion clears canonical originals hidden by a purged Session even without an App index or ledger", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-project-canonical-orphan-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  let host: MolisWorkLocalHost | undefined;
  t.after(async () => { await host?.close(); catalog.close(); await rm(home, { recursive: true, force: true }); });
  const project = await catalog.createProject({ display_name: "Unindexed canonical original", actor_id: actor });
  let runtime = await openOriginalRuntime(home);
  let original: { ref: { kind: "memory"; id: string; revision: number }; version: number };
  try {
    const session = await runtime.sessions.create();
    const bound = runtime.bindMemory({ consumer: "ui", currentScene: "common", purpose: "management", sessionRef: session.ref });
    original = await bound.memory.write({ scope: "project", owner: project.project_id, text: "Retained canonical project original",
      origin: "public SDK setup", idempotencyKey: "unindexed-original", meta: { kind: "fact", source: "manual", approvedBy: { by: "person" },
        classification: { scenes: ["common"], lifecycle: "long-term" }, sessionRef: session.ref } });
    await runtime.sessions.purge(await session.previewPurge());
    const page = await bound.memory.page({ scope: "project", owner: project.project_id });
    assert.deepEqual(page.items, []); assert.equal(page.exhausted, true, "ordinary listing hides the retained original");
  } finally { await runtime.shutdown(); }
  host = new MolisWorkLocalHost({ homeDirectory: home });
  await ensureSystemAgentService(host, home, withMolisWorkProjectCatalog).ready;
  const removed = await catalog.deleteProject({ project_id: project.project_id, actor_id: actor,
    delete_confirmed: true, idempotency_key: "delete-unindexed-original" });
  assert.equal(removed.deletion.cleanup_state, "complete", removed.deletion.cleanup_error ?? "");
  await host.close();
  runtime = await openOriginalRuntime(home);
  try {
    // A retained canonical original rejects this stale version. An absent locator is a no-op; it cannot delete a survivor.
    await assert.doesNotReject(runtime.memory.purge(original!.ref, { expectedVersion: original!.version + 1,
      operationId: "prove-original-is-absent", identity: { scope: "project", owner: project.project_id } }));
  } finally { await runtime.shutdown(); }
});

for (const missingSteps of [false, true]) test(`a complete demo deletion receipt ${missingSteps ? "without owner steps " : ""}cannot clear later canonical originals or authorize recreation`, { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-demo-current-original-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  let host = new MolisWorkLocalHost({ homeDirectory: home });
  t.after(async () => { await host.close(); catalog.close(); await rm(home, { recursive: true, force: true }); });
  const input = { actor_id: actor, user_confirmed: true }, demo = await catalog.ensureDemoProject(input);
  await ensureSystemAgentService(host, home, withMolisWorkProjectCatalog).ready;
  assert.equal((await catalog.removeDemoProject({ project_id: DEMO_PROJECT_ID, actor_id: actor,
    delete_confirmed: true, idempotency_key: "old-demo-deletion" })).deletion.cleanup_state, "complete");
  if (missingSteps) {
    const receipts = new DatabaseSync(join(home, "projects", "catalog.db"));
    try {
      const originalPlan = receipts.prepare("SELECT recovery_plan FROM project_deletions WHERE project_id = ?").get(DEMO_PROJECT_ID);
      assert.equal(JSON.parse(String(originalPlan?.recovery_plan)).kind, "runtime", "missing steps retain the real original runtime plan");
      receipts.prepare("DELETE FROM project_deletion_steps WHERE deletion_id IN (SELECT deletion_id FROM project_deletions WHERE project_id = ?)").run(DEMO_PROJECT_ID);
      assert.equal(receipts.prepare("SELECT recovery_plan FROM project_deletions WHERE project_id = ?").get(DEMO_PROJECT_ID)?.recovery_plan, originalPlan?.recovery_plan);
    } finally { receipts.close(); }
    assert.deepEqual(catalog.listProjectDeletions()[0]?.owner_steps, []);
  }
  await host.close();
  let runtime = await openOriginalRuntime(home);
  let original: { ref: { kind: "memory"; id: string; revision: number }; version: number };
  try {
    original = await runtime.memory.write({ scope: "project", owner: DEMO_PROJECT_ID, text: "Later canonical original must remain",
      origin: "public SDK setup", idempotencyKey: "later-demo-original", meta: { kind: "fact", source: "manual", approvedBy: { by: "person" },
        classification: { scenes: ["common"], lifecycle: "long-term" } } });
  } finally { await runtime.shutdown(); }
  host = new MolisWorkLocalHost({ homeDirectory: home });
  await ensureSystemAgentService(host, home, withMolisWorkProjectCatalog).ready;
  const historical = catalog.listProjectDeletions();
  await assert.rejects(catalog.deleteProject({ project_id: DEMO_PROJECT_ID, actor_id: actor,
    delete_confirmed: true, idempotency_key: "old-demo-deletion" }), /仍有当前记忆原件/);
  assert.deepEqual(catalog.listProjectDeletions(), historical, "a failed current proof never rewrites the old complete receipt");
  await assert.rejects(catalog.ensureDemoProject(input), /仍有当前记忆原件/);
  assert.equal(catalog.listProjects().some(project => project.project_id === DEMO_PROJECT_ID), false);
  assert.equal(existsSync(demo.project.database_path), false);
  assert.equal(catalog.listProjectDeletions().length, 1);
  await host.close(); runtime = await openOriginalRuntime(home);
  try {
    await runtime.memory.hydrate([{ scope: "project", owner: DEMO_PROJECT_ID }]);
    assert.equal((await runtime.memory.get(original!.ref))?.text, "Later canonical original must remain");
    await assert.rejects(runtime.memory.purge(original!.ref, { expectedVersion: original!.version + 1,
      operationId: "prove-later-original-retained", identity: { scope: "project", owner: DEMO_PROJECT_ID } }), { code: "STORAGE_CONFLICT" });
  } finally { await runtime.shutdown(); }
});


test("unknown canonical Character ownership blocks the real Catalog acceptance without touching the original", { timeout: 60_000 }, async t => {
  const f = await fixture(t); await f.host.close();
  const owner = characterOwner(f.gone.project_id, "historic-unrecorded-character"), runtime = await openOriginalRuntime(f.home);
  let original;
  try { original = await runtime.memory.write({ scope: "character", owner, text: "Unknown ownership must not be guessed", origin: "historical SDK",
    idempotencyKey: "unknown-character", meta: { kind: "fact", source: "manual", approvedBy: { by: "person" }, classification: { scenes: ["common"], lifecycle: "long-term" } } }); }
  finally { await runtime.shutdown(); }
  await f.reopen();
  await assert.rejects(f.catalog.deleteProject(f.request), /归属覆盖不完整/);
  assert.deepEqual(f.catalog.listProjectDeletions(), []); assert.equal(f.retained(), 1); assert.equal(existsSync(f.gone.database_path), true);
  await f.host.close(); const inspect = await openOriginalRuntime(f.home);
  try {
    await inspect.memory.hydrate([{ scope: "character", owner }]);
    const retained = await inspect.memory.get(original.ref); assert.equal(retained?.version, original.version); assert.equal(retained?.text, original.text);
  } finally { await inspect.shutdown(); }
});

test("a new target relation between coverage pages rejects the old cursor before accepting a deletion", { timeout: 60_000 }, async t => {
  const f = await fixture(t), entry = await f.memory().write({ scope: "project", owner: f.gone.project_id, text: "Wait for complete coverage", origin: "person", operation_id: "before-pages", meta });
  const ledger = openMemoryLedger({ homeDirectory: f.home }); t.after(() => ledger.close());
  const capability = f.adapter().memory!, bind = capability.withCaller.bind(capability); let changed = false;
  const observe = (bound: AgentMemoryCapability): AgentMemoryCapability => ({ ...bound,
    withExecution: control => observe(bound.withExecution!(control)),
    verifyPurgeCoverage: async input => {
      const page = await bound.verifyPurgeCoverage({ ...input, limit: 1 });
      if (!changed && !page.exhausted) {
        changed = true; ledger.noteOwner({ scope: "character", owner: characterOwner(f.gone.project_id, "new-role"), project_id: f.gone.project_id, subject: "new-role", title: "New target role" });
      }
      return page;
    } });
  const mock = t.mock.method(capability, "withCaller", (caller: Parameters<AgentMemoryCapability["withCaller"]>[0]) => observe(bind(caller)));
  await assert.rejects(f.catalog.deleteProject(f.request), /归属已变化/); assert.equal(changed, true);
  assert.deepEqual(f.catalog.listProjectDeletions(), []); assert.equal((await f.memory().list("project", f.gone.project_id))[0]?.memory_id, entry.memory_id);
  mock.mock.restore(); assert.equal((await f.catalog.deleteProject(f.request)).deletion.cleanup_state, "complete");
});

test("a completed Memory step cannot delete a later original or certify the pending receipt", { timeout: 60_000 }, async t => {
  const f = await fixture(t); let fail = true;
  const dispose = projectDeletedHooksFor(f.home).register({ id: "test-later-original", label: null, clear: () => { if (fail) throw new Error("leave business pending"); } }); t.after(dispose);
  const first = await f.catalog.deleteProject(f.request); assert.equal(first.deletion.cleanup_state, "pending");
  assert.equal(first.deletion.owner_steps.find(step => step.owner_id === "memory")?.state, "complete");
  const db = f.storage(); const before = db.prepare("SELECT recovery_plan FROM project_deletions WHERE deletion_id=?").get(first.deletion.deletion_id)?.recovery_plan; db.close();
  await f.host.close(); const runtime = await openOriginalRuntime(f.home); let original;
  try { original = await runtime.memory.write({ scope: "project", owner: f.gone.project_id, text: "Later original is outside the fixed decision", origin: "historical SDK",
    idempotencyKey: "later-original", meta: { kind: "fact", source: "manual", approvedBy: { by: "person" }, classification: { scenes: ["common"], lifecycle: "long-term" } } }); }
  finally { await runtime.shutdown(); }
  fail = false; await f.reopen(); const retry = await f.catalog.deleteProject(f.request);
  assert.equal(retry.deletion.cleanup_state, "pending"); assert.match(retry.deletion.cleanup_error ?? "", /仍有当前记忆原件/); assert.equal(f.retained(), 1);
  const after = f.storage(); assert.equal(after.prepare("SELECT recovery_plan FROM project_deletions WHERE deletion_id=?").get(first.deletion.deletion_id)?.recovery_plan, before); after.close();
  await f.host.close(); const inspect = await openOriginalRuntime(f.home);
  try { await inspect.memory.hydrate([{ scope: "project", owner: f.gone.project_id }]); assert.equal((await inspect.memory.get(original.ref))?.version, original.version); }
  finally { await inspect.shutdown(); }
});

test("an original relation disappearing after the final asynchronous proof cannot cross the synchronous Catalog complete commit", { timeout: 60_000 }, async t => {
  const f = await fixture(t), hooks = projectDeletedHooksFor(f.home), original = hooks.owners().find(owner => owner.id === "memory")!;
  const ledger = openMemoryLedger({ homeDirectory: f.home }); t.after(() => ledger.close());
  const retainedOwner = { scope: "character" as const, owner: characterOwner(f.kept.project_id, "commit-window"), project_id: f.kept.project_id, subject: "commit-window", title: "Kept role" };
  ledger.noteOwner(retainedOwner);
  let armed = false, checks = 0;
  const business = hooks.register({ id: "test-arm-final-proof", label: null, clear: () => { armed = true; } }); t.after(business);
  const wrapped = hooks.register({ ...original, withRecovery: (input, work) => original.withRecovery!(input, (plan, proof) => work(plan, { ...proof,
    verifyMemory: async () => {
      await proof.verifyMemory();
      if (armed && ++checks === 2) ledger.forgetScopes({ scopes: [retainedOwner], project_id: f.kept.project_id, prefs_keys: [], signal_prefixes: [], marker_keys: [] });
    } })) }); t.after(wrapped);
  const result = await f.catalog.deleteProject(f.request);
  assert.equal(checks, 2, "the injected change follows the final beforeAcquire proof");
  assert.equal(result.deletion.cleanup_state, "pending"); assert.equal(result.deletion.cleaned_at, null); assert.match(result.deletion.cleanup_error ?? "", /归属已变化/);
  wrapped(); ledger.noteOwner(retainedOwner);
  assert.equal((await f.catalog.deleteProject(f.request)).deletion.cleanup_state, "complete");
});

test("a real archived Work relation both covers and purges a Character that has no ledger mapping", { timeout: 60_000 }, async t => {
  const f = await fixture(t), subject = "retained-character", owner = characterOwner(f.gone.project_id, subject);
  const db = openHomeSqliteDatabase(f.home, ASSISTANT_STORE_NAME);
  try {
    const store = new AssistantStore(db), work = store.create({ actor_id: actor, title: "Archived work", scope: { kind: "project", project_id: f.gone.project_id }, origin: null,
      project_ref: molisWorkHostProjectReference({ projectId: f.gone.project_id, databasePath: f.gone.database_path }) });
    store.update(actor, work.work_id, work.revision, { archived: true, character: { artifact_id: subject, version: 1, title: "Retained Character" } });
  } finally { db.close(); }
  await f.host.close(); const runtime = await openOriginalRuntime(f.home); let original;
  try { original = await runtime.memory.write({ scope: "character", owner, text: "Old Character original", origin: "historical SDK", idempotencyKey: "historical-character",
    meta: { kind: "fact", source: "manual", approvedBy: { by: "person" }, classification: { scenes: ["common"], lifecycle: "long-term" } } }); }
  finally { await runtime.shutdown(); }
  await f.reopen();
  const result = await f.catalog.deleteProject(f.request); assert.equal(result.deletion.cleanup_state, "complete", result.deletion.cleanup_error ?? "");
  const receipt = f.storage();
  try {
    const plan = JSON.parse(String(receipt.prepare("SELECT recovery_plan FROM project_deletions WHERE deletion_id=?").get(result.deletion.deletion_id)?.recovery_plan));
    assert.ok(plan.memory.scopes.some((scope: { owner: string; memories: { memory_id: string }[] }) => scope.owner === owner && scope.memories.some(item => item.memory_id === original.ref.id)));
  } finally { receipt.close(); }
  await f.host.close(); const inspect = await openOriginalRuntime(f.home);
  try { await assert.doesNotReject(inspect.memory.purge(original.ref, { expectedVersion: original.version + 1, operationId: "prove-character-absent", identity: { scope: "character", owner } })); }
  finally { await inspect.shutdown(); }
});

test("a retained incomplete plan cannot purge its Session before the remaining Memory is reconciled", { timeout: 60_000 }, async t => {
  const f = await fixture(t), owner = { project_id: f.gone.project_id, plugin_id: "io.molis.work.coding", install_id: "installed", actor_id: actor };
  const session = await f.adapter().createSession({ ...owner, workspace: "none", role_id: "coding", title: "Must remain while Memory is unresolved" });
  const original = await f.memory(f.gone.project_id, session.session_id).write({ scope: "project", owner: f.gone.project_id, text: "Original omitted by old plan", origin: "person", operation_id: "omitted-original", meta: { ...meta, session_ref: { kind: "session", id: session.session_id, revision: 1 } } });
  const reference = molisWorkHostProjectReference({ databasePath: f.gone.database_path, projectId: f.gone.project_id });
  const tracked = await f.host.actionClient(reference).invoke(await f.host.localPersonContext(reference), memoryActions.write,
    { scope: "project", text: "Omitted ledger history must remain" });
  const ledger = openMemoryLedger({ homeDirectory: f.home }); t.after(() => ledger.close());
  ledger.noteOwner({ scope: "project", owner: f.gone.project_id, project_id: f.gone.project_id, title: "Original project relationship" });
  const hooks = projectDeletedHooksFor(f.home), memory = hooks.owners().find(item => item.id === "memory")!;
  const restore = hooks.register({ ...memory, clear: () => { throw new Error("stop before Memory effects"); } });
  const accepted = await f.catalog.deleteProject(f.request); restore(); assert.equal(accepted.deletion.cleanup_state, "pending");
  // A historical unselected ledger candidate is evidence, not a new SDK purge target.
  ledger.saveCandidate({ candidate_id: "old-held-candidate", actor_id: actor, scope: "project", owner: f.gone.project_id,
    project_id: f.gone.project_id, version: 1, kind: "fact", text: "Unselected held candidate", applies: {}, basis: "inferred",
    why: "Original evidence", from: "work", work: null, hold_reason: null, supersedes: null, state: "pending", created_at: "2026-10-25T00:00:00Z", memory_id: null });
  assert.ok(tracked.memory);
  const retainedLedger = { owners: ledger.owners(f.gone.project_id), candidates: ledger.candidates(actor),
    revisions: ledger.revisions(tracked.memory.memory_id), changes: ledger.changesOf(tracked.memory.memory_id) };
  assert.ok(retainedLedger.owners.length); assert.ok(retainedLedger.revisions.length); assert.ok(retainedLedger.changes.length);

  // Seed a historical incomplete fixed decision, not a new decision on retry.
  const db = new DatabaseSync(join(f.home, "projects", "catalog.db"));
  const row = db.prepare("SELECT recovery_plan FROM project_deletions WHERE deletion_id=?").get(accepted.deletion.deletion_id);
  const plan = JSON.parse(String(row?.recovery_plan));
  for (const scope of plan.memory.scopes) { scope.memories = []; scope.candidates = []; }
  const saved = JSON.stringify(plan); db.prepare("UPDATE project_deletions SET recovery_plan=? WHERE deletion_id=?").run(saved, accepted.deletion.deletion_id); db.close();
  const retry = await f.catalog.deleteProject(f.request);
  assert.equal(retry.deletion.cleanup_state, "pending"); assert.match(retry.deletion.cleanup_error ?? "", /仍有当前记忆原件/);
  assert.equal((await f.adapter().sessionLifecycle!.read(session, owner)).state, "active");
  assert.deepEqual({ owners: ledger.owners(f.gone.project_id), candidates: ledger.candidates(actor),
    revisions: ledger.revisions(tracked.memory.memory_id), changes: ledger.changesOf(tracked.memory.memory_id) }, retainedLedger);

  const current = f.storage(); assert.equal(current.prepare("SELECT recovery_plan FROM project_deletions WHERE deletion_id=?").get(accepted.deletion.deletion_id)?.recovery_plan, saved); current.close();
  await f.host.close(); const inspect = await openOriginalRuntime(f.home);
  try {
    await inspect.memory.hydrate([{ scope: "project", owner: f.gone.project_id }]);
    for (const entry of [original, tracked.memory]) assert.equal((await inspect.memory.get({ kind: "memory", id: entry.memory_id, revision: 1 }))?.version, entry.version);
  }
  finally { await inspect.shutdown(); }
});
