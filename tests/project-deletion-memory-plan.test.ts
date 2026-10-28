import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { characterOwner, applyProjectMemoryPurge as applyFixedProjectMemoryPurge, previewProjectMemoryPurge as previewFixedProjectMemoryPurge, readProjectMemoryPurgeLedgerFacts, projectMemoryPurgeLedger, type MemoryBackendPort, type MemoryCaller, type MemoryService } from "@molis-ai/molis-work-service-memory";
import { MolisWorkLocalHost, ensureSystemAgentService, prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import type { ProjectDeletionResult } from "@molis-ai/molis-work-contracts/modules/projects";
import type { MemoryLedgerPort } from "@molis-ai/molis-work-contracts/services/memory";
import type { AgentMemoryExecutionControl } from "@molis-ai/molis-work-contracts/services/agent-host";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { memoryServiceHome, observeMemoryBackend, originalMemorySources, scriptedMemoryExtraction } from "./fixtures/memory-service-home.js";

import { openTestHome } from "./fixtures/test-home.js";

const caller = (operation_id: string): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", consumer: "ui",
  person: true, purpose: "management", current_scene: "common", operation_id });
const control = { beforeEffect: async () => undefined, assert_current: () => undefined };
// Existing online fixtures bind the same production backend and ledger to the narrower deletion ports.
type OnlinePorts = { backend: MemoryBackendPort | null; ledger: MemoryLedgerPort; caller: MemoryCaller };
function previewProjectMemoryPurge(ports: OnlinePorts, projectId: string,
  selection: Omit<Parameters<typeof previewFixedProjectMemoryPurge>[2], "scopes"> & { scopes?: Parameters<typeof previewFixedProjectMemoryPurge>[2]["scopes"] }) {
  return previewFixedProjectMemoryPurge({ backend: ports.backend?.withCaller(ports.caller) ?? null, caller: ports.caller,
    current() {}, readLedgerFacts: query => readProjectMemoryPurgeLedgerFacts(ports.ledger, query) }, projectId,
  { ...selection, scopes: selection.scopes ?? [...ports.ledger.owners(projectId), ...ports.ledger.candidateOwners(projectId)]
    .flatMap(item => item.scope === "character" ? [{ scope: item.scope, owner: item.owner }] : []) });
}
function applyProjectMemoryPurge(ports: OnlinePorts & { control: AgentMemoryExecutionControl },
  plan: Parameters<typeof applyFixedProjectMemoryPurge>[1]) {
  const bound = ports.backend?.withCaller(ports.caller);
  return applyFixedProjectMemoryPurge({ caller: ports.caller, control: ports.control,
    backend: bound ? { purgeMemory: input => bound.remove(input), purgeCandidate: input => bound.candidates.purge(input) } : null,
    ledger: projectMemoryPurgeLedger(ports.ledger, ports.caller.actor_id), verifyScopeCleanup: async () => {
    assert.ok(bound);
    for (const target of plan.scopes.filter(item => item.scope !== "personal")) for (const kind of ["memory", "memory-candidate"] as const) {
      const page = await bound.previewPurge({ scope: target.scope, owner: target.owner, kind });
      assert.equal(page.outcome, "completed"); assert.deepEqual(page.issues, []);
      assert.deepEqual(page.items, []); assert.equal(page.exhausted, true);
    }
  } }, plan);
}

test("project deletion freezes tombstones and original versions, then resumes SDK deletion after ledger failure", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a", "project-b"] });
  let service = await f.open();
  const first = (await service.write(caller("first"), { scope: "project", text: "First project convention" })).memory!;
  const second = (await service.write(caller("second"), { scope: "project", text: "Second project convention" })).memory!;
  const personal = (await service.write(caller("personal"), { scope: "personal", text: "Personal item stays" })).memory!;
  const tombstone = await f.raw(caller("tombstone")).tombstone({ scope: "project", owner: "project-a", memory_id: second.memory_id,
    expected_version: second.version, operation_id: "tombstone-original" });
  const who = caller("project-delete-fixed"), backend = () => prologueMemoryBackend(async () => f.adapter().memory!);
  const plan = await previewProjectMemoryPurge({ backend: backend(), ledger: f.ledger(), caller: who }, "project-a", { sessions: [] });
  const targets = plan.scopes.flatMap(scope => scope.memories);
  assert.deepEqual(targets.map(item => item.memory_id).sort(), [first.memory_id, second.memory_id].sort());
  assert.equal(targets.find(item => item.memory_id === second.memory_id)?.version, tombstone.version);
  assert.equal(JSON.stringify(plan).includes("project convention"), false, "the Catalog plan contains no text");
  const retained = JSON.parse(JSON.stringify(plan)) as typeof plan;
  const fail = t.mock.method(f.ledger(), "forget", () => { throw new Error("Ledger commit failed"); });
  await assert.rejects(applyProjectMemoryPurge({ backend: backend(), ledger: f.ledger(), caller: who, control }, retained), /Ledger commit failed/);
  assert.equal((await f.raw(caller("inspect")).page({ scope: "project", owner: "project-a", filter: { tombstone: true } })).items.some(item => item.memory_id === second.memory_id), true);
  assert.ok(f.ledger().revisions(first.memory_id).length > 0);
  fail.mock.restore(); await f.close(); service = await f.open();
  await applyProjectMemoryPurge({ backend: backend(), ledger: f.ledger(), caller: who, control }, retained);
  for (const tombstone of [false, true]) assert.deepEqual((await f.raw(caller("inspect")).page({ scope: "project", owner: "project-a", filter: { tombstone } })).items, []);
  assert.deepEqual(f.ledger().revisions(first.memory_id), []);
  assert.deepEqual(f.ledger().revisions(second.memory_id), []);
  assert.equal((await service.list(caller("personal-after"), { scope: "personal" })).items[0]?.memory_id, personal.memory_id);
  await applyProjectMemoryPurge({ backend: backend(), ledger: f.ledger(), caller: who, control }, retained);
});

test("project deletion never adopts a successor version when retrying its original targets", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }), service = await f.open();
  const original = (await service.write(caller("original"), { scope: "project", text: "Original project convention" })).memory!;
  const who = caller("original-delete"), backend = prologueMemoryBackend(async () => f.adapter().memory!);
  const plan = await previewProjectMemoryPurge({ backend, ledger: f.ledger(), caller: who }, "project-a", { sessions: [] });
  const successor = await f.raw(caller("edit")).update({ scope: "project", owner: "project-a", memory_id: original.memory_id,
    expected_version: original.version, operation_id: "successor", change: { text: "Successor must remain" } });
  await assert.rejects(applyProjectMemoryPurge({ backend, ledger: f.ledger(), caller: who, control }, plan), error => (error as { code?: string }).code === "agent.memory_conflict");
  assert.equal((await f.raw(caller("inspect")).list("project", "project-a"))[0]?.version, successor.version);
  assert.ok(f.ledger().revisions(original.memory_id).length > 0);
});

test("revocation after the SDK purge stops ledger cleanup and later targets", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }), service = await f.open();
  for (const name of ["First", "Second"]) await service.write(caller(name), { scope: "project", text: name + " project convention" });
  const who = caller("revoked-delete"), raw = prologueMemoryBackend(async () => f.adapter().memory!);
  const plan = await previewProjectMemoryPurge({ backend: raw, ledger: f.ledger(), caller: who }, "project-a", { sessions: [] });
  let allowed = true, removes = 0, forgotten = 0;
  const ledgerForget = f.ledger().forget;
  t.mock.method(f.ledger(), "forget", (id: string) => { forgotten++; ledgerForget(id); });
  const backend = observeMemoryBackend(raw, bound => ({ ...bound, remove: async input => { removes++; await bound.remove(input); allowed = false; } }));
  const revoked = { beforeEffect: async () => undefined, assert_current: () => { if (!allowed) throw new Error("Original grant revoked"); } };
  await assert.rejects(applyProjectMemoryPurge({ backend, ledger: f.ledger(), caller: who, control: revoked }, plan), /Original grant revoked/);
  assert.equal(removes, 1); assert.equal(forgotten, 0);
  assert.equal((await f.raw(caller("inspect")).list("project", "project-a")).length, 1);
  await applyProjectMemoryPurge({ backend: raw, ledger: f.ledger(), caller: who, control }, plan);
  assert.deepEqual(await f.raw(caller("inspect")).list("project", "project-a"), []);
});

test("an unavailable runtime cannot certify an empty plan or erase the original ledger", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }), service = await f.open();
  const item = (await service.write(caller("kept"), { scope: "project", text: "Keep until runtime is available" })).memory!;
  const who = caller("unavailable-delete");
  await assert.rejects(previewProjectMemoryPurge({ backend: null, ledger: f.ledger(), caller: who }, "project-a", { sessions: [] }),
    error => (error as { code?: string }).code === "memory.unavailable");
  await assert.rejects(applyProjectMemoryPurge({ backend: null, ledger: f.ledger(), caller: who, control },
    { project_id: "project-a", actor_id: who.actor_id, operation_id: who.operation_id!, scopes: [] }),
    error => (error as { code?: string }).code === "memory.unavailable");
  assert.ok(f.ledger().revisions(item.memory_id).length > 0);
  assert.equal((await f.raw().list("project", "project-a"))[0]?.memory_id, item.memory_id);
});

test("a non-exhausted page without a continuation cannot certify completion", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }); await f.open();
  const raw = prologueMemoryBackend(async () => f.adapter().memory!);
  const backend = observeMemoryBackend(raw, bound => ({ ...bound, previewPurge: async query => {
    const { cursor: _cursor, ...page } = await bound.previewPurge(query); return { ...page, exhausted: false };
  } }));
  await assert.rejects(previewProjectMemoryPurge({ backend, ledger: f.ledger(), caller: caller("unknown-delete") }, "project-a", { sessions: [] }),
    error => (error as { code?: string }).code === "memory.conflict");
});

test("partial and cancelled online previews never freeze a plan or change the ledger", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }), service = await f.open();
  const item = (await service.write(caller("kept-for-preview"), { scope: "project", text: "Keep incomplete original" })).memory!;
  const raw = prologueMemoryBackend(async () => f.adapter().memory!);
  for (const outcome of ["partial", "cancelled"] as const) {
    const backend = observeMemoryBackend(raw, bound => ({ ...bound,
      previewPurge: async query => ({ ...await bound.previewPurge(query), outcome }) }));
    await assert.rejects(previewProjectMemoryPurge({ backend, ledger: f.ledger(), caller: caller(`refuse-${outcome}`) }, "project-a", { sessions: [] }),
      { code: "memory.conflict" });
    assert.ok(f.ledger().revisions(item.memory_id).length > 0);
    assert.equal((await f.raw().list("project", "project-a"))[0]?.memory_id, item.memory_id);
  }
});

test("a canonical candidate with unrecorded sources is not treated as an empty source set", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }); await f.open();
  const item = await f.raw().candidates.propose({ scope: "project", owner: "project-a", text: "Suggestion without recorded source identity",
    origin: "person", expected_version: 0, operation_id: "unrecorded-candidate",
    meta: { kind: "fact", source: "manual", approved_by: { by: "person" }, classification: { scenes: ["common"], lifecycle: "long-term" } } });
  assert.deepEqual(f.ledger().candidates(LOCAL_PERSON_ACTOR_ID), []);
  const backend = prologueMemoryBackend(async () => f.adapter().memory!);
  const page = await backend.withCaller(caller("inspect-candidate")).previewPurge({ kind: "memory-candidate", scope: "project", owner: "project-a" });
  assert.equal(page.items[0]?.kind === "memory-candidate" && page.items[0].sources, null);
  await assert.rejects(previewProjectMemoryPurge({ backend, ledger: f.ledger(), caller: caller("unknown-candidate-source") }, "project-a", { sessions: [] }),
    { code: "memory.conflict" });
  assert.equal((await f.raw().candidates.list("project", "project-a"))[0]?.candidate_id, item.candidate_id);
});

test("a queued revocation never crosses an extra promise gap into the ledger write", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }), service = await f.open();
  await service.write(caller("one"), { scope: "project", text: "One project item" });
  const who = caller("microtask-delete"), backend = prologueMemoryBackend(async () => f.adapter().memory!);
  const plan = await previewProjectMemoryPurge({ backend, ledger: f.ledger(), caller: who }, "project-a", { sessions: [] });
  let allowed = true, effects = 0, unauthorizedWrites = 0;
  const forget = f.ledger().forget;
  t.mock.method(f.ledger(), "forget", (id: string) => { if (!allowed) unauthorizedWrites++; forget(id); });
  const current = { beforeEffect: async () => {
    if (++effects === 2) queueMicrotask(() => queueMicrotask(() => { allowed = false; }));
  }, assert_current: () => { if (!allowed) throw new Error("Original grant revoked"); } };
  await assert.rejects(applyProjectMemoryPurge({ backend, ledger: f.ledger(), caller: who, control: current }, plan), /Original grant revoked/);
  assert.equal(allowed, false); assert.equal(unauthorizedWrites, 0);
});

test("project cleanup and restart retain suppression of the original source", { timeout: 30_000 }, async t => {
  const originals = originalMemorySources(["project-a"]), extraction = scriptedMemoryExtraction();
  let service: MemoryService;
  const allowed = (who: Parameters<typeof originals.port.resolve>[0], request: Parameters<typeof originals.port.resolve>[1]) =>
    service.sourceAllowed(who.actor_id, request.target.scope === "user" ? "personal" : request.target.scope, request.target.owner, request.refs);
  const sources: typeof originals.port = {
    async resolve(who, request) { if (!allowed(who, request)) return []; const found = await originals.port.resolve(who, request); return allowed(who, request) ? found : []; },
    async check(who, request) { const query = { ...request, refs: request.identities.map(({ event_id, version }) => ({ event_id, version })) };
      return allowed(who, query) && await originals.port.check(who, request) && allowed(who, query); },
  };
  const generate = t.mock.fn(extraction.generate), f = await memoryServiceHome(t, { projects: ["project-a"], sources, generate });
  service = await f.open();
  service.savePrefs(caller("formation-project"), "project", "assisted");
  service.savePrefs(caller("formation-personal"), "personal", { learn_from_work: false });
  const text = "以后发布说明先列风险与核对步骤", original = originals.add("project-original-event", text);
  extraction.set([{ text, scope: "project", kind: "convention", basis: "explicit", quote: text }]);
  const worker: MemoryCaller = { ...caller("source-recipe"), person: false, consumer: "assistant", current_scene: "assistant",
    source_use: "learning", purpose: "task", session_id: "project-source-session" };
  const recipe = await service.forRun(worker, { query: "发布核对" }); assert.ok(recipe);
  const learn = (operation_id: string) => service.learnFromWork({ ...worker, operation_id, class_restrictions: recipe.class_restrictions }, { said: [text], sources: [original] });
  const formed = await learn("form-original");
  assert.equal(formed.formation.outcome, "completed"); assert.equal(formed.learned[0]?.outcome, "candidate");
  const candidate = (await service.candidates(caller("view"), { scope: "project" }))[0]!;
  const accepted = await service.accept(caller("accept"), candidate.candidate_id, { expected_version: candidate.version });
  assert.ok(accepted.memory);
  const who = caller("purge-source"), backend = () => prologueMemoryBackend(async () => f.adapter().memory!);
  const plan = await previewProjectMemoryPurge({ backend: backend(), ledger: f.ledger(), caller: who }, "project-a", { sessions: [] });
  assert.ok(plan.scopes.some(scope => scope.sources.some(source => source.event_id === original.event_id)));
  await applyProjectMemoryPurge({ backend: backend(), ledger: f.ledger(), caller: who, control }, plan);
  const calls = generate.mock.callCount();
  for (const operation of ["same-source", "source-after-restart"]) {
    // Restore the normal formation switches so the source refusal, not disabled formation, is exercised.
    service.savePrefs(caller(operation), "project", "assisted");
    assert.equal(service.sourceAllowed(LOCAL_PERSON_ACTOR_ID, "project", "project-a", [original]), false);
    const refused = await learn(operation);
    assert.equal(refused.formation.outcome, "failed"); assert.equal(refused.formation.extraction.calls, 0);
    assert.equal(generate.mock.callCount(), calls); assert.deepEqual(refused.learned, []);
    assert.deepEqual(await f.raw().list("project", "project-a"), []);
    assert.deepEqual(await f.raw().candidates.list("project", "project-a"), []);
    assert.deepEqual(f.ledger().revisions(accepted.memory.memory_id), []);
    await f.close(); service = await f.open();
  }
});

test("online purge preview retains originals hidden from public listing after Session purge", async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-plan-retained-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home }), ledger = openMemoryLedger({ homeDirectory: home });
  const project = await catalog.createProject({ actor_id: LOCAL_PERSON_ACTOR_ID, display_name: "Original scope" });
  let host!: MolisWorkLocalHost;
  const open = async () => {
    host = new MolisWorkLocalHost({ homeDirectory: home });
    const service = ensureSystemAgentService(host, home, withMolisWorkProjectCatalog); await service.ready;
    return service.agentHost.adapter("prologue");
  };
  let adapter = await open();
  t.after(async () => { await host.close(); ledger.close(); catalog.close(); await rm(home, { recursive: true, force: true }); });
  const owner = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, plugin_id: "io.molis.work.coding", install_id: "coding" };
  const session = await adapter.createSession({ ...owner, workspace: "none", role_id: "coding", title: "Original scope binding" });
  const who = { ...caller("session-original"), purpose: "management" as const, project_id: project.project_id, session_id: session.session_id, current_scene: "coding" as const };
  const raw = () => adapter.memory!.withCaller(who), target = { scope: "project" as const, owner: project.project_id };
  const formal = await raw().write({ ...target, text: "Private Session original", origin: "Session", operation_id: "raw-original",
    meta: { kind: "convention", source: "manual", classification: { scenes: ["coding"], lifecycle: "session" },
      session_ref: { kind: "session", id: session.session_id, revision: 1 } } });
  assert.deepEqual(ledger.revisions(formal.memory_id), []);
  const life = adapter.sessionLifecycle!;
  const preview = await life.previewPurge(session, owner);
  await life.purge(session, { operation_id: "session-first", expected_version: preview.version, expected_state: preview.state }, preview, owner);
  await host.close(); adapter = await open();
  for (const tombstone of [false, true]) {
    const page = await raw().page({ ...target, filter: { tombstone } });
    assert.equal(page.exhausted, true); assert.deepEqual(page.items, []);
  }
  await assert.rejects(previewProjectMemoryPurge({ backend: prologueMemoryBackend(async () => adapter.memory!), ledger,
    caller: { ...caller("new-project-plan"), project_id: project.project_id } }, project.project_id, { sessions: [] }), { code: "MEMORY_SCOPE_DENIED" });
  await assert.rejects(raw().remove({ ...target, memory_id: formal.memory_id,
    expected_version: formal.version + 1, operation_id: "prove-original-retained" }), { code: "MEMORY_SCOPE_DENIED" });
  const deleted = await catalog.deleteProject({ project_id: project.project_id, actor_id: LOCAL_PERSON_ACTOR_ID,
    delete_confirmed: true, idempotency_key: "new-project-plan" });
  assert.equal(deleted.deletion.cleanup_state, "complete", deleted.deletion.cleanup_error ?? "");
  const db = new DatabaseSync(join(home, "projects", "catalog.db"), { readOnly: true });
  let persisted: string;
  try { persisted = (db.prepare("SELECT recovery_plan FROM project_deletions WHERE deletion_id=?").get(deleted.deletion.deletion_id) as { recovery_plan: string }).recovery_plan; }
  finally { db.close(); }
  assert.equal(typeof persisted, "string");
  const plan = JSON.parse(persisted) as { kind: string; memory: Awaited<ReturnType<typeof previewProjectMemoryPurge>> };
  assert.equal(plan.kind, "runtime");
  if (plan.kind !== "runtime") throw new Error("Original runtime plan required");
  assert.deepEqual(plan.memory.scopes.flatMap(scope => scope.memories), [{ memory_id: formal.memory_id, version: formal.version }]);
  assert.equal(JSON.stringify(plan).includes("Private Session original"), false);
  // The same retained original is physically absent after its real Catalog owner's fixed purge.
  await raw().remove({ ...target, memory_id: formal.memory_id,
    expected_version: formal.version + 1, operation_id: "prove-original-absent" });
});

for (const change of ["target-owner", "foreign-content"] as const) test(
  `online project deletion refuses ${change} during runtime release without widening its saved plan`, { timeout: 60_000 }, async t => {
    const entered = Promise.withResolvers<void>(), resume = Promise.withResolvers<void>();
    let heldProject = "", deleting: Promise<ProjectDeletionResult> | undefined;
    t.after(async () => { resume.resolve(); await deleting; });
    const home = await openTestHome(t, { host: { async onRuntimeClose(reference) {
      if (reference.project_id === heldProject) { entered.resolve(); await resume.promise; }
    } } });
    const target = await home.createProject("Original deletion"), neighbor = await home.createProject("Original neighbor");
    await home.host.withProject(target.reference, () => undefined);
    const service = ensureSystemAgentService(home.host, home.home, withMolisWorkProjectCatalog); await service.ready;
    const adapter = service.agentHost.adapter("prologue"), ledger = openMemoryLedger({ homeDirectory: home.home });
    const raw = (projectId: string) => adapter.memory!.withCaller({ ...caller("interleaving"), project_id: projectId, purpose: "management" as const, current_scene: "coding" as const });
    const write = (projectId: string, text: string) => raw(projectId).write({ scope: "project", owner: projectId, text, origin: "Person", operation_id: text,
      meta: { kind: "convention", source: "manual", approved_by: { by: "person" }, classification: { scenes: ["coding"], lifecycle: "long-term" } } });
    const savedPlan = () => {
      const db = new DatabaseSync(join(home.home, "projects", "catalog.db"), { readOnly: true });
      try { return (db.prepare("SELECT recovery_plan FROM project_deletions WHERE project_id=?").get(target.project_id) as { recovery_plan: string }).recovery_plan; }
      finally { db.close(); }
    };
    try {
      const original = await write(target.project_id, "Original target memory"), kept = await write(neighbor.project_id, "Neighbor body stays exact");
      heldProject = target.project_id;
      deleting = home.web.post(`/api/settings/projects/${target.project_id}/delete`, { delete_confirmed: true, idempotency_key: `coverage-${change}` });
      await Promise.race([entered.promise, deleting.then(() => assert.fail("runtime release barrier was not reached"))]);
      const plan = savedPlan();
      assert.ok(plan.includes(original.memory_id));
      let added: { project_id: string } | undefined, addedMemory: { memory_id: string } | undefined;
      if (change === "target-owner") ledger.noteOwner({ scope: "character", owner: characterOwner(target.project_id, "late-role"), project_id: target.project_id, subject: "late-role", title: "New target relation" });
      else {
        added = await home.createProject("New unrelated project");
        addedMemory = await write(added.project_id, "New unrelated SDK body stays exact");
      }
      resume.resolve();
      const result = await deleting;
      assert.equal(result.deletion.cleanup_state, "pending");
      assert.match(result.deletion.cleanup_error ?? "", change === "target-owner" ? /原删除归属已变化/u : /记忆归属覆盖不完整/u);
      assert.equal(result.deletion.owner_steps.find(step => step.owner_id === "memory")?.state, "complete");
      assert.equal(savedPlan(), plan, "the original decision is never replaced or expanded");
      assert.equal(existsSync(target.database_path), true, "pending deletion retains the original directory");
      const read = async (projectId: string) => (await raw(projectId).page({ scope: "project", owner: projectId })).items;
      assert.deepEqual((await read(neighbor.project_id)).map(item => [item.memory_id, item.text]), [[kept.memory_id, "Neighbor body stays exact"]]);
      if (added && addedMemory) assert.deepEqual((await read(added.project_id)).map(item => [item.memory_id, item.text]), [[addedMemory.memory_id, "New unrelated SDK body stays exact"]]);
    } finally { resume.resolve(); await deleting; ledger.close(); }
  });
