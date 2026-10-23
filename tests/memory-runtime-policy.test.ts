import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import type { AgentMemoryCaller, AgentMemoryMeta } from "@molis-ai/molis-work-contracts/services/agent-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { MemoryService, characterOwner, defaultPrefs } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { memoryRuntimePolicy, type MemoryRuntimePolicyOwner } from "@molis-ai/molis-work-app-local-host";
import { prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";

const person: AgentMemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "a", consumer: "ui", person: true, current_scene: "common", purpose: "management" };
const task: AgentMemoryCaller = { ...person, consumer: "agent", person: false, purpose: "task" };
const meta: AgentMemoryMeta = { kind: "convention", source: "manual", approved_by: { by: "person" }, classification: { scenes: ["common"], lifecycle: "long-term" } };

async function fixture(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "molis-memory-runtime-policy-"));
  const ledger = openMemoryLedger({ homeDirectory: home });
  for (const key of ["personal", "project-default"]) ledger.savePrefs(LOCAL_PERSON_ACTOR_ID, key, defaultPrefs(key === "personal" ? "personal" : "project", "reviewed"));
  const projects = new Set(["a", "b"]);
  let alive = true, registered = true, projectCheck: ((id: string) => Promise<boolean>) | undefined;
  let service!: MemoryService;
  const owner: MemoryRuntimePolicyOwner = { alive: () => alive,
    prefsFor: (scope, project) => service.prefsFor(LOCAL_PERSON_ACTOR_ID, scope, project),
    owners: project => ledger.owners(project), candidateOwners: project => ledger.candidateOwners(project),
    projectExists: id => projectCheck ? projectCheck(id) : Promise.resolve(projects.has(id)), deletingProject: () => undefined };
  const options = memoryRuntimePolicy(() => registered ? owner : undefined);
  let network = 0;
  t.mock.method(globalThis, "fetch", async () => { network++; throw new Error("Memory policy must not send model requests"); });
  const open = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "agent-runtime"), memory: options,
    modelConfiguration: async () => { throw new Error("No model is needed for policy"); } });
  let adapter = await open();
  service = new MemoryService({ ledger, backend: prologueMemoryBackend(async () => adapter.memory!) });
  t.after(async () => { await adapter.close(); ledger.close(); rmSync(home, { recursive: true, force: true }); assert.equal(network, 0); });
  return { home, ledger, service, options, projects, owner, get adapter() { return adapter; }, bound: (caller = person) => adapter.memory!.withCaller(caller),
    save: (id: string, extra: Partial<AgentMemoryMeta> = {}) => adapter.memory!.withCaller(person).write({ scope: "project", owner: "a", text: `Convention ${id}`, origin: "person", operation_id: id, meta: { ...meta, ...extra } }),
    reopen: async () => { await adapter.close(); adapter = await open(); }, closeOwner: () => { alive = false; }, unregister: () => { registered = false; },
    projectCheck: (check: (id: string) => Promise<boolean>) => { projectCheck = check; } };
}

test("off keeps personal management and deletion but refuses new saves, candidate acceptance and restore", async t => {
  const f = await fixture(t), caller = { ...person, project_id: null }, memory = f.bound(caller);
  const entry = await memory.write({ scope: "user", owner: person.actor_id, text: "Use plain language", origin: "person", operation_id: "personal", meta });
  const candidate = await memory.candidates.propose({ scope: "user", owner: person.actor_id, text: "Use concise answers", origin: "person", meta, expected_version: 0, operation_id: "proposal" });
  const disabled = await memory.disable({ scope: "user", owner: person.actor_id, memory_id: entry.memory_id, expected_version: entry.version, operation_id: "disable", reason: "person" });
  f.service.savePrefs({ ...caller, consumer: "ui" }, "personal", "off");
  assert.equal((await memory.list("user", person.actor_id)).length, 1);
  await assert.rejects(memory.write({ scope: "user", owner: person.actor_id, text: "New text", origin: "person", operation_id: "off-save", meta }));
  await assert.rejects(memory.resume({ scope: "user", owner: person.actor_id, memory_id: entry.memory_id, expected_version: disabled.version, operation_id: "off-restore" }));
  await assert.rejects(memory.candidates.accept({ scope: "user", owner: person.actor_id, candidate_id: candidate.candidate_id, expected_version: candidate.version, operation_id: "off-accept" }));
  await memory.remove({ scope: "user", owner: person.actor_id, memory_id: entry.memory_id, expected_version: disabled.version, operation_id: "delete" });
  await f.reopen(); assert.deepEqual(await f.bound(caller).list("user", person.actor_id), []);
});

test("mixed on/off scope queries remain admitted while canonical task reads use current consumer switches", async t => {
  const f = await fixture(t); await f.save("project");
  await f.bound().write({ scope: "user", owner: person.actor_id, text: "Private convention", origin: "person", operation_id: "personal", meta });
  f.service.savePrefs({ ...person, consumer: "ui" }, "personal", "off");
  const query = await f.options.authorizeRecall(task, { appId: "io.molis.work", context: { consumer: "agent", currentScene: "common", purpose: "task" },
    scopes: [{ scope: "user", owner: person.actor_id }, { scope: "project", owner: "a" }], readMode: "task", filter: {} });
  assert.equal(query.allowed, true); assert.equal(query.storageCost, "redacted");
  await assert.rejects(f.bound(task).recall({ scope: "user", owner: person.actor_id, text: "convention" }), { code: "MEMORY_SCOPE_DENIED" });
  assert.equal((await f.bound(task).recall({ scope: "project", owner: "a", text: "Convention" })).length, 1);
  f.service.savePrefs({ ...person, consumer: "ui" }, "project", "manual");
  await assert.rejects(f.bound(task).recall({ scope: "project", owner: "a", text: "Convention" }), { code: "MEMORY_SCOPE_DENIED" });
  assert.equal((await f.bound().list("project", "a")).length, 1);
});

test("all-off scope queries refuse task and explicit admission while management stays available", async t => {
  const f = await fixture(t); await f.save("retained");
  f.service.savePrefs({ ...person, consumer: "ui" }, "personal", "off");
  f.service.savePrefs({ ...person, consumer: "ui" }, "project", "off");
  for (const readMode of ["task", "explicit"] as const) {
    const caller = readMode === "task" ? task : person;
    const query = await f.options.authorizeRecall(caller, { appId: "io.molis.work",
      context: { consumer: caller.consumer, currentScene: caller.current_scene, purpose: caller.purpose },
      scopes: [{ scope: "user", owner: person.actor_id }, { scope: "project", owner: "a" }], readMode, filter: {} });
    assert.equal(query.allowed, false);
  }
  await assert.rejects(f.bound(task).recall({ scope: "project", owner: "a", text: "Convention" }), { code: "MEMORY_SCOPE_DENIED" });
  assert.equal((await f.bound().list("project", "a")).length, 1);
});

test("the trusted scene, plugin kinds and namespace intersect without granting a foreign project", async t => {
  const f = await fixture(t);
  await f.save("coding", { classification: { scenes: ["coding"], lifecycle: "long-term" } });
  await f.save("assistant", { classification: { scenes: ["assistant"], lifecycle: "long-term" } });
  await f.save("own", { namespace: "io.molis.work.coding" }); await f.save("foreign", { namespace: "other.plugin" });
  await f.save("fact", { kind: "fact" });
  const coding: AgentMemoryCaller = { ...task, current_scene: "coding", plugin_id: "io.molis.work.coding" };
  const texts = (await f.bound(coding).recall({ scope: "project", owner: "a", text: "Convention" })).map(hit => hit.entry.text).sort();
  assert.deepEqual(texts, ["Convention coding", "Convention own"]);
  assert.deepEqual(await f.bound(coding).list("project", "b"), []);
  await assert.rejects(f.bound(coding).write({ scope: "project", owner: "b", text: "Cross-project", origin: "person", meta, operation_id: "foreign-project" }));
  f.service.savePrefs({ ...person, consumer: "ui" }, "project", { plugins: { "io.molis.work.coding": { allowed: false, kinds: ["convention"] } } });
  await assert.rejects(f.bound(coding).recall({ scope: "project", owner: "a", text: "Convention" }), { code: "MEMORY_SCOPE_DENIED" });
});

test("revoking current preferences during project admission prevents the formal commit and survives restart", async t => {
  const f = await fixture(t); let release!: () => void, entered!: () => void;
  const waiting = new Promise<void>(done => { entered = done; }), gate = new Promise<void>(done => { release = done; });
  f.projectCheck(async () => { entered(); await gate; return true; });
  const pending = f.save("revoked"); await waiting;
  f.service.savePrefs({ ...person, consumer: "ui" }, "project", "off"); release();
  await assert.rejects(pending); await f.reopen(); assert.deepEqual(await f.bound().list("project", "a"), []);
});

test("missing owners, deleted projects and unknown actors cannot reuse management grants", async t => {
  const f = await fixture(t); await f.save("before-deletion"); f.projects.delete("a");
  assert.deepEqual(await f.bound().list("project", "a"), []);
  await assert.rejects(f.save("deleted"));
  await assert.rejects(f.bound({ ...person, actor_id: "other" }).write({ scope: "user", owner: "other", text: "Foreign", origin: "person", operation_id: "foreign", meta }));
  f.projects.add("a"); f.unregister(); await assert.rejects(f.save("missing-owner"));
  assert.equal(await f.options.callerForSession({ actor_id: "other", project_id: "a", plugin_id: "io.molis.work.coding", install_id: "coding" }, "session"), undefined);
});

test("only recorded character membership authorizes a task; background sessions do not invent it", async t => {
  const f = await fixture(t), id = "reviewer", owner = characterOwner("a", id);
  f.ledger.noteOwner({ scope: "character", owner, project_id: "a", title: "Reviewer", subject: id });
  await f.bound().write({ scope: "character", owner, text: "Review in small steps", origin: "person", operation_id: "character", meta });
  assert.equal((await f.bound({ ...task, character_id: id }).list("character", owner)).length, 1);
  assert.deepEqual(await f.bound({ ...task, character_id: "other" }).list("character", owner), []);
  const session = await f.adapter.createSession({ actor_id: person.actor_id, project_id: "a", plugin_id: "io.molis.work.coding", install_id: "coding", workspace: "none", role_id: "coding", title: "Code" });
  const view = await f.adapter.readSession(session), restored = await f.options.callerForSession(view.owner, session.session_id);
  assert.equal(restored?.current_scene, "coding"); assert.equal(restored?.character_id, undefined);
  assert.deepEqual(await f.bound(restored!).list("character", owner), []);
  f.projects.delete("a"); assert.equal(await f.options.callerForSession(view.owner, session.session_id), undefined);
});

test("an app or session scope cannot reuse a recorded character owner", async t => {
  const f = await fixture(t), owner = characterOwner("a", "reviewer");
  f.ledger.noteOwner({ scope: "character", owner, project_id: "a", title: "Reviewer", subject: "reviewer" });
  for (const scope of ["app", "session"] as const) {
    assert.equal(await f.options.authorize(person, [{ appId: "io.molis.work", context: { consumer: "ui", currentScene: "common", purpose: "management" },
      action: "manage-read", target: { scope, owner, ref: { kind: "memory", id: "scope-probe", revision: 1 }, version: 1,
        createdAtMs: 1, identityKnown: true } }]), false);
    assert.equal((await f.options.authorizeRecall(person, { appId: "io.molis.work", context: { consumer: "ui", currentScene: "common", purpose: "management" },
      scopes: [{ scope, owner }], readMode: "explicit", filter: {} })).allowed, false);
  }
  assert.deepEqual(await f.bound().list("project", "a"), []);
});

test("Assistant session owners restore their actual personal/project scope without a private plugin namespace", async t => {
  const f = await fixture(t);
  for (const project_id of [ASSISTANT_PERSONAL_OWNER, "a"]) {
    const session = await f.adapter.createSession({ actor_id: person.actor_id, project_id, plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID, workspace: "none", role_id: "assistant", title: "Assist" });
    const view = await f.adapter.readSession(session), caller = await f.options.callerForSession(view.owner, session.session_id);
    assert.equal(caller?.consumer, "assistant"); assert.equal(caller?.current_scene, "assistant"); assert.equal(caller?.plugin_id, undefined);
    assert.equal(caller?.project_id, project_id === ASSISTANT_PERSONAL_OWNER ? null : "a");
    assert.equal(await f.options.callerForSession({ ...view.owner, install_id: "other-install" }, session.session_id), undefined);
  }
  f.closeOwner(); assert.equal(await f.options.callerForSession({ actor_id: person.actor_id, project_id: ASSISTANT_PERSONAL_OWNER,
    plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID }, "session"), undefined);
});

test("only the real deletion hook clears a missing project, keeping unrelated scopes and later retry targets", async t => {
  const { registerMemoryProjectDeletion } = await import("@molis-ai/molis-work-app-local-host");
  const { projectDeletedHooksFor } = await import("@molis-ai/molis-work-app-local-host");
  const f = await fixture(t), original = await f.save("clear-original");
  const other = await f.bound({ ...person, project_id: "b" }).write({ scope: "project", owner: "b", text: "Other project", origin: "person", meta, operation_id: "other-project" });
  let hasReceipt = false, release!: () => void, entered!: () => void, first = true;
  const gate = new Promise<void>(done => { release = done; }), pending = new Promise<void>(done => { entered = done; });
  const backend = prologueMemoryBackend(async () => f.adapter.memory!, {
    beforeEffect: async () => { if (first) { first = false; entered(); await gate; } }, assert_current: () => undefined });
  const deletion = registerMemoryProjectDeletion({ homeDirectory: f.home, backend, ledger: f.ledger,
    alive: f.owner.alive, executes: () => true, ready: async () => undefined, projectExists: f.owner.projectExists,
    pendingMemoryDeletion: async () => hasReceipt ? { deletion_id: "confirmed-deletion" } : null });
  f.owner.deletingProject = deletion.deletingProject;
  f.projects.delete("a");
  await assert.rejects(projectDeletedHooksFor(f.home).clear("memory", "a"), { code: "memory.forbidden" });
  hasReceipt = true;
  f.service.savePrefs({ ...person, consumer: "ui" }, "project", "off");
  const clearing = projectDeletedHooksFor(f.home).clear("memory", "a"); await pending;
  assert.equal(deletion.deletingProject(), undefined, "the in-flight clear does not grant its scope to another invocation");
  await assert.rejects(f.bound(task).remove({ scope: "project", owner: "a", memory_id: original.memory_id, expected_version: original.version, operation_id: "task-delete" }));
  release(); assert.equal(await clearing, true);
  assert.equal(deletion.deletingProject(), undefined);
  f.projects.add("a"); f.service.savePrefs({ ...person, consumer: "ui" }, "project", "reviewed");
  assert.deepEqual(await f.bound().list("project", "a"), []);
  const later = await f.save("after-original-preview");
  f.projects.delete("a"); await projectDeletedHooksFor(f.home).clear("memory", "a");
  f.projects.add("a");
  assert.deepEqual((await f.bound().list("project", "a")).map(item => item.memory_id), [later.memory_id]);
  assert.deepEqual((await f.bound({ ...person, project_id: "b" }).list("project", "b")).map(item => item.memory_id), [other.memory_id]);
});

test("demo cleanup keeps its operation after a failed dispatch and starts a new one only after completion", async t => {
  const { registerMemoryProjectDeletion } = await import("@molis-ai/molis-work-app-local-host");
  const { projectDeletedHooksFor } = await import("@molis-ai/molis-work-app-local-host");
  const f = await fixture(t); await f.save("demo-original");
  let refuse = true;
  const backend = prologueMemoryBackend(async () => f.adapter.memory!, {
    beforeEffect: async () => { if (refuse) throw new Error("controlled cleanup failure"); }, assert_current: () => undefined });
  const deletion = registerMemoryProjectDeletion({ homeDirectory: f.home, backend, ledger: f.ledger,
    alive: f.owner.alive, executes: () => true, ready: async () => undefined, projectExists: f.owner.projectExists,
    pendingMemoryDeletion: async () => null });
  f.owner.deletingProject = deletion.deletingProject;
  await assert.rejects(projectDeletedHooksFor(f.home).clear("memory", "a"));
  const first = f.ledger.marker(person.actor_id, "memory-project-delete:a")?.body;
  assert.ok(first && typeof first === "object" && "operation_id" in first && "complete" in first && first.complete === false);
  refuse = false; await projectDeletedHooksFor(f.home).clear("memory", "a");
  assert.deepEqual(f.ledger.marker(person.actor_id, "memory-project-delete:a")?.body, { operation_id: first.operation_id, complete: true });
  assert.deepEqual(await f.bound().list("project", "a"), []);
  await f.save("new-demo"); await projectDeletedHooksFor(f.home).clear("memory", "a");
  assert.notDeepEqual(f.ledger.marker(person.actor_id, "memory-project-delete:a")?.body, { operation_id: first.operation_id, complete: true });
  assert.deepEqual(await f.bound().list("project", "a"), []);
});
