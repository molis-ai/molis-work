import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, ensureSystemAgentService, projectDeletedHooksFor, AssistantStore, ASSISTANT_STORE_NAME, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { memoryActions } from "@molis-ai/molis-work-contracts/services/memory";
import { ASSISTANT_PLUGIN_ID, ASSISTANT_INSTALL_ID, ASSISTANT_PERSONAL_OWNER } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentMemoryMeta } from "@molis-ai/molis-work-contracts/services/agent-host";

const actor = LOCAL_PERSON_ACTOR_ID;
const meta: AgentMemoryMeta = { kind: "fact", source: "manual", approved_by: { by: "person" }, classification: { scenes: ["common"], lifecycle: "long-term" } };
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
    reopen: async () => { await close(); catalog = await openMolisWorkProjectCatalog({ homeDirectory: home }); agents = await open(); } };
}

test("the accepted project plan clears real Sessions and bound personal tombstones before business owners; retry preserves its original decision", { timeout: 90_000 }, async t => {
  const f = await fixture(t);
  const coding = { project_id: f.gone.project_id, plugin_id: "io.molis.work.coding", install_id: "coding-installed", actor_id: actor };
  const root = await f.adapter().createSession({ ...coding, workspace: "none", title: "Archived Coding session" });
  const lifecycle = f.adapter().sessionLifecycle!;
  const state = await lifecycle.read(root, coding);
  await lifecycle.archive(root, { operation_id: "archive-original", expected_version: state.version!, expected_state: "active" }, coding);
  const assistantOwner = { project_id: ASSISTANT_PERSONAL_OWNER, plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID, actor_id: actor };
  const assistant = await f.adapter().createSession({ ...assistantOwner, workspace: "none", title: "Associated personal session" });
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
  assert.ok(project.memory);
});

test("preparation failure accepts no receipt and leaves Catalog, directory and originals unchanged", { timeout: 60_000 }, async t => {
  const f = await fixture(t), owner = { project_id: f.gone.project_id, plugin_id: "io.molis.work.coding", install_id: "installed", actor_id: actor };
  const session = await f.adapter().createSession({ ...owner, workspace: "none", title: "Prior purged Session" });
  const entry = await f.memory(f.gone.project_id, session.session_id).write({ scope: "project", owner: f.gone.project_id, text: "Retained orphan", origin: "person", operation_id: "orphan",
    meta: { ...meta, session_ref: { kind: "session", id: session.session_id, revision: 1 } } });
  const preview = await f.adapter().sessionLifecycle!.previewPurge(session, owner);
  await f.adapter().sessionLifecycle!.purge(session, { operation_id: "prior-session-purge", expected_version: preview.version, expected_state: preview.state }, preview, owner);
  await assert.rejects(f.catalog.deleteProject(f.request), /先前清除/);
  assert.deepEqual(f.catalog.listProjectDeletions(), []); assert.equal(f.retained(), 1); assert.equal(existsSync(f.gone.database_path), true);
  assert.ok(f.catalog.getProject(f.gone.project_id));
  await assert.rejects(f.memory().remove({ scope: "project", owner: f.gone.project_id, memory_id: entry.memory_id,
    expected_version: entry.version + 1, operation_id: "wrong-version" }), { code: "agent.memory_conflict" });
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
  const session = await f.adapter().createSession({ ...owner, workspace: "none", title: "Held Session" });
  await f.memory(null, session.session_id).write({ scope: "user", owner: actor, text: "Accepted before the hold", origin: "person", operation_id: "before-hold",
    meta: { ...meta, session_ref: { kind: "session", id: session.session_id, revision: 1 } } });
  const hooks = projectDeletedHooksFor(f.home), original = hooks.owners().find(item => item.id === "memory")!;
  let entered!: () => void, release!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  const dispose = hooks.register({ ...original, withRecovery: (input, work) => original.withRecovery!(input, async plan => { entered(); await gate; return work(plan); }) }); t.after(dispose);
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
  ledger.savePrefs(actor, `project:${gone.project_id}`, defaultPrefs("project", "off"));
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
    install_id: "installed", actor_id: actor, workspace: "none", title: "Must remain refused after restart" }), { code: "agent.session_busy" });
  await assert.rejects(memory.withCaller(caller(gone.project_id)).write({ scope: "project", owner: gone.project_id, text: "Still closed after restart",
    origin: "person", operation_id: "late-after-restart", meta }));
  fail = false;
  const repeated = await catalog.deleteProject(request);
  assert.equal(repeated.deletion.cleanup_state, "complete", repeated.deletion.cleanup_error ?? "");
  assert.equal(repeated.deletion.deletion_id, first.deletion.deletion_id);
  assert.deepEqual((await memory.withCaller(caller(kept.project_id)).list("project", kept.project_id)).map(item => item.memory_id), [later.memory_id]);
});
