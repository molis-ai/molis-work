import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import type { AgentMemoryCaller, AgentMemoryMeta } from "@molis-ai/molis-work-contracts/services/agent-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { MemoryService, MEMORY_GATE_POLICY, MEMORY_GATE_VERSION, characterOwner, defaultPrefs } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { memoryRuntimePolicy, type MemoryRuntimePolicyOwner } from "@molis-ai/molis-work-app-local-host";
import { prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";

const person: AgentMemoryCaller & { consumer: "ui"; current_scene: string } = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "a", consumer: "ui", person: true, current_scene: "common", purpose: "management" };
const task: AgentMemoryCaller & { consumer: "agent"; current_scene: string } = { ...person, consumer: "agent", person: false, purpose: "task" };
const assistantManagement: AgentMemoryCaller = { ...task, consumer: "assistant", purpose: "management" };
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
  const options = { ...memoryRuntimePolicy(() => registered ? owner : undefined), promotion: {
    policy: MEMORY_GATE_POLICY, version: MEMORY_GATE_VERSION,
    decide: (caller, request) => service.promotion.decide(caller, request),
    undo: { prepare: (caller, request) => service.promotion.undo.prepare(caller, request),
      record: (caller, request) => service.promotion.undo.record(caller, request) },
  } } satisfies NonNullable<Parameters<typeof createPrologueNodeAdapter>[0]["memory"]>;
  let network = 0;
  t.mock.method(globalThis, "fetch", async () => { network++; throw new Error("Memory policy must not send model requests"); });
  const open = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "agent-runtime"), memory: options,
    modelConfiguration: async () => { throw new Error("No model is needed for policy"); } });
  let adapter!: Awaited<ReturnType<typeof open>>;
  t.after(async () => { await adapter?.close(); ledger.close(); rmSync(home, { recursive: true, force: true }); assert.equal(network, 0); });
  adapter = await open();
  service = new MemoryService({ ledger, backend: prologueMemoryBackend(async () => adapter.memory!) });
  return { home, ledger, service, options, projects, owner, get adapter() { return adapter; }, bound: (caller: AgentMemoryCaller = person) => adapter.memory!.withCaller(caller),
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

test("MEM-33 disable is independent of formation, while disabled-entry edits and forged operation fields remain refused", async t => {
  const f = await fixture(t), original = await f.save("disable-without-formation");
  f.service.savePrefs(person, "project", { form: false });
  const input = { scope: "project" as const, owner: "a", memory_id: original.memory_id,
    expected_version: original.version, operation_id: "disable-once", reason: "No longer useful" };
  const disabled = await f.bound(assistantManagement).disable(input);
  assert.equal(disabled.version, original.version + 1); assert.equal(disabled.disabled?.reason, input.reason);
  assert.equal(disabled.text, original.text); assert.deepEqual(disabled.meta, original.meta);
  const spoofed = { ...assistantManagement, operation: "disable" }, memory = f.bound(spoofed);
  const target = { ...input, expected_version: disabled.version };
  await assert.rejects(memory.write({ scope: "project", owner: "a", text: "Not a disable", origin: "person", meta, operation_id: "ordinary-write" }), { code: "MEMORY_SCOPE_DENIED" });
  await assert.rejects(memory.update({ ...target, operation_id: "ordinary-update", change: { text: "Changed while disabled" } }), { code: "MEMORY_SCOPE_DENIED" });
  await assert.rejects(memory.setMeta({ ...target, operation_id: "ordinary-meta", meta: { ...meta, basis: "repeated" } }), { code: "MEMORY_SCOPE_DENIED" });
  await assert.rejects(memory.resume({ ...target, operation_id: "ordinary-resume" }), { code: "MEMORY_SCOPE_DENIED" });
  assert.deepEqual(await f.bound().list("project", "a"), [disabled]);
  await f.reopen(); assert.deepEqual(await f.bound().list("project", "a"), [disabled]);
  assert.deepEqual(await f.bound(assistantManagement).disable(input), disabled, "the original operation does not advance the version again");
  await f.reopen(); assert.deepEqual(await f.bound().list("project", "a"), [disabled]);
});

test("MEM-33 disable retains current task-read, frozen classification and scope grants", async t => {
  const f = await fixture(t), original = await f.save("disable-denied");
  const input = { scope: "project" as const, owner: "a", memory_id: original.memory_id,
    expected_version: original.version, operation_id: "denied-disable", reason: "No longer useful" };
  const restriction = { selector: { consumer: "assistant" as const, current_scene: "common" as const, kind: "convention" as const },
    read: "explicit-only" as const, form: "inherit" as const };
  f.service.savePrefs(person, "project", { form: false, task_recall: false });
  await assert.rejects(f.bound({ ...assistantManagement, run_explicit: true }).disable(input), { code: "MEMORY_SCOPE_DENIED" });
  f.service.savePrefs(person, "project", { task_recall: true, class_restrictions: [restriction] });
  await assert.rejects(f.bound(assistantManagement).disable(input), { code: "MEMORY_SCOPE_DENIED" });
  const recipe = await f.service.forRun(assistantManagement, { scopes: ["project"] }); assert.ok(recipe);
  f.service.savePrefs(person, "project", { class_restrictions: [] });
  await assert.rejects(f.bound({ ...assistantManagement, class_restrictions: recipe.class_restrictions }).disable(input), { code: "MEMORY_SCOPE_DENIED" });
  await assert.rejects(f.bound({ ...assistantManagement, project_id: "b" }).disable(input));
  await assert.rejects(f.bound({ ...assistantManagement, consumer: "plugin", plugin_id: "example.plugin" }).disable(input), { code: "MEMORY_SCOPE_DENIED" });
  assert.deepEqual(await f.bound().list("project", "a"), [original]);
  await f.reopen(); assert.deepEqual(await f.bound().list("project", "a"), [original]);
});

test("MEM-33 disable rechecks task-read in the final synchronous fence", async t => {
  const f = await fixture(t), original = await f.save("disable-fence");
  f.service.savePrefs(person, "project", { form: false });
  const authorize = f.options.authorize, assertCurrent = f.options.assertCurrent!; let revoked = false, fenced = false;
  f.options.authorize = async (caller, requests, operation) => {
    const allowed = await authorize(caller, requests, operation);
    if (!revoked && operation === "disable" && requests.some(request => request.action === "save")) {
      assert.equal(allowed, true); revoked = true; f.service.savePrefs(person, "project", { task_recall: false });
    }
    return allowed;
  };
  f.options.assertCurrent = (caller, requests, operation) => {
    const allowed = assertCurrent(caller, requests, operation);
    if (operation === "disable" && requests.some(request => request.action === "save") && !allowed) fenced = true;
    return allowed;
  };
  await f.reopen();
  await assert.rejects(f.bound(assistantManagement).disable({ scope: "project", owner: "a", memory_id: original.memory_id,
    expected_version: original.version, operation_id: "fenced-disable", reason: "No longer useful" }), { code: "MEMORY_SCOPE_DENIED" });
  assert.equal(revoked, true); assert.equal(fenced, true);
  await f.reopen(); assert.deepEqual(await f.bound().list("project", "a"), [original]);
});

test("MEM-33 a waiting disable cannot lend its operation to a concurrent disabled-entry update", { timeout: 30_000 }, async t => {
  const f = await fixture(t), original = await f.save("waiting-disable"), other = await f.save("already-disabled");
  const disabledOther = await f.bound().disable({ scope: "project", owner: "a", memory_id: other.memory_id,
    expected_version: other.version, operation_id: "person-disable", reason: "Person disabled" });
  f.service.savePrefs(person, "project", { form: false });
  let enter!: () => void, release!: () => void, intercepted = false;
  const entered = new Promise<void>(done => { enter = done; }), gate = new Promise<void>(done => { release = done; });
  const authorize = f.options.authorize;
  f.options.authorize = async (caller, requests, operation) => {
    if (!intercepted && operation === "disable" && requests.some(request => request.action === "save")) {
      intercepted = true; enter(); await gate;
    }
    if (requests.some(request => request.action === "save" && request.target.ref.id === other.memory_id)) assert.equal(operation, undefined);
    return authorize(caller, requests, operation);
  };
  await f.reopen();
  const pending = f.bound(assistantManagement).disable({ scope: "project", owner: "a", memory_id: original.memory_id,
    expected_version: original.version, operation_id: "waiting-disable", reason: "No longer useful" });
  let rejected: Promise<void> | undefined, disabled: Awaited<typeof pending>;
  try {
    await Promise.race([entered, pending.then(() => assert.fail("disable completed without reaching the authorization barrier"))]);
    rejected = assert.rejects(f.bound(assistantManagement).update({ scope: "project", owner: "a", memory_id: other.memory_id,
      expected_version: disabledOther.version, operation_id: "parallel-update", change: { text: "Must remain unchanged" } }), { code: "MEMORY_SCOPE_DENIED" });
    // Both mutations use the SDK owner's queue; release its first entry before awaiting the queued update.
    release();
    [disabled] = await Promise.all([pending, rejected]);
  } finally {
    release();
    await Promise.allSettled(rejected ? [pending, rejected] : [pending]);
  }
  assert.equal(disabled.version, original.version + 1); assert.deepEqual(disabled.meta, original.meta);
  await f.reopen();
  const stored = await f.bound().list("project", "a");
  assert.equal(stored.length, 2);
  assert.deepEqual(stored.find(item => item.memory_id === other.memory_id), disabledOther);
  assert.deepEqual(stored.find(item => item.memory_id === original.memory_id), disabled);
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

test("a trusted current Character can start with an empty scope without blocking other recall scopes", async t => {
  const f = await fixture(t), owner = characterOwner("a", "reviewer");
  const caller = { ...task, character_id: "reviewer" };
  const request = { appId: "io.molis.work", context: { consumer: "agent", currentScene: "common", purpose: "task" as const },
    scopes: [{ scope: "project" as const, owner: "a" }, { scope: "character" as const, owner }], readMode: "task" as const, filter: {} };
  assert.deepEqual(f.ledger.owners("a"), []);
  assert.equal((await f.options.authorizeRecall(caller, request)).allowed, true);
  assert.deepEqual(await f.bound(caller).recall({ scope: "character", owner, text: "Review" }), []);
  for (const other of [{ ...caller, character_id: "different" }, { ...caller, character_id: undefined }, { ...caller, project_id: "b" }]) {
    assert.equal((await f.options.authorizeRecall(other, request)).allowed, false);
  }
  f.ledger.noteOwner({ scope: "character", owner, project_id: "a", title: "Conflicting owner", subject: "different" });
  assert.equal((await f.options.authorizeRecall(caller, request)).allowed, false);
});

test("global personal candidate management binds each ledger-owned project without widening task callers", async t => {
  const f = await fixture(t), global = { ...person, project_id: null };
  const propose = (project_id: string, text: string) => f.service.propose({ ...person, project_id },
    { scope: "project", text, kind: "convention", basis: "explicit", why: "Person proposed", from: "work" });
  const a = await propose("a", "Use pnpm"), b = await propose("b", "Use npm");
  assert.deepEqual((await f.service.candidates(global, { scope: "all", anywhere: true })).map(one => one.candidate_id).sort(), [a.candidate_id, b.candidate_id].sort());
  await assert.rejects(f.service.candidates(task, { scope: "all", anywhere: true }), { code: "MEMORY_SCOPE_DENIED" },
    "a task caller cannot turn the global management option into a candidate read grant");
  await assert.rejects(f.service.accept({ ...person, project_id: "b" }, a.candidate_id, { expected_version: a.version }));
  const accepted = await f.service.accept(global, a.candidate_id, { expected_version: a.version });
  assert.equal(accepted.memory?.project_id, "a");
  assert.equal((await f.service.discard(global, b.candidate_id, b.version)).candidate.state, "discarded");
  await f.reopen();
  assert.deepEqual(await f.service.candidates(global, { scope: "all", anywhere: true }), []);
  assert.equal((await f.bound().list("project", "a"))[0]?.text, "Use pnpm");
  assert.deepEqual(await f.bound({ ...person, project_id: "b" }).list("project", "b"), []);
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
  const receipt = { deletion_id: "confirmed-deletion", project_id: "a" };
  let release!: () => void, entered!: () => void, first = true;
  const gate = new Promise<void>(done => { release = done; }), pending = new Promise<void>(done => { entered = done; });
  const backend = prologueMemoryBackend(async () => f.adapter.memory!, {
    beforeEffect: async () => { if (first) { first = false; entered(); await gate; } }, assert_current: () => undefined });
  const deletion = registerMemoryProjectDeletion({ homeDirectory: f.home, backend, ledger: f.ledger,
    alive: f.owner.alive, executes: () => true, ready: async () => undefined, projectExists: f.owner.projectExists });
  f.owner.deletingProject = deletion.deletingProject;
  f.projects.delete("a");
  await assert.rejects(projectDeletedHooksFor(f.home).clear("memory", "a"), { code: "memory.forbidden" });
  await assert.rejects(projectDeletedHooksFor(f.home).clear("memory", "a", { ...receipt, project_id: "b" }), { code: "memory.forbidden" });
  f.service.savePrefs({ ...person, consumer: "ui" }, "project", "off");
  const clearing = projectDeletedHooksFor(f.home).clear("memory", "a", receipt); await pending;
  assert.equal(deletion.deletingProject(), undefined, "the in-flight clear does not grant its scope to another invocation");
  await assert.rejects(f.bound(task).remove({ scope: "project", owner: "a", memory_id: original.memory_id, expected_version: original.version, operation_id: "task-delete" }));
  release(); assert.equal(await clearing, true);
  assert.equal(deletion.deletingProject(), undefined);
  f.projects.add("a"); f.service.savePrefs({ ...person, consumer: "ui" }, "project", "reviewed");
  assert.deepEqual(await f.bound().list("project", "a"), []);
  const later = await f.save("after-original-preview");
  f.projects.delete("a"); await projectDeletedHooksFor(f.home).clear("memory", "a", receipt);
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
    alive: f.owner.alive, executes: () => true, ready: async () => undefined, projectExists: f.owner.projectExists });
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


test("candidate sources resolve through the same trusted caller and foreign or absent bindings read no originals", async t => {
  const f = await fixture(t), calls: string[] = [];
  let sourceCurrent = true;
  const original = { event_id: "person-input", version: "1", speaker: { kind: "person" as const, id: person.actor_id },
    derivation: "original" as const, occurred_at_ms: 1000, text: "For this project use pnpm." };
  f.options.sources = {
    async resolve(caller, request) {
      assert.equal(caller.actor_id, person.actor_id); assert.equal(caller.project_id, "a"); assert.equal(caller.person, true);
      assert.equal(caller.consumer, "ui"); assert.equal(request.target.owner, "a");
      calls.push("resolve"); return sourceCurrent ? [original] : [];
    },
    async check(caller, request) {
      assert.equal(caller.actor_id, person.actor_id); assert.equal(caller.project_id, "a");
      calls.push("check"); return sourceCurrent && request.identities.every(one => one.event_id === original.event_id && one.version === original.version);
    },
  };
  await f.reopen();
  const proposal = { scope: "project" as const, owner: "a", text: "Use pnpm", origin: "person", meta,
    sources: [{ event_id: original.event_id, version: original.version }], expected_version: 0 as const, operation_id: "bound-source" };
  const candidate = await f.bound().candidates.propose(proposal);
  assert.deepEqual(candidate.sources?.map(one => [one.event_id, one.version, one.speaker.kind]), [[original.event_id, "1", "person"]]);
  assert.ok(calls.includes("resolve")); assert.ok(calls.includes("check"));
  const before = calls.length;
  await assert.rejects(f.adapter.memory!.candidates.propose({ ...proposal, operation_id: "no-caller" }));
  await assert.rejects(f.bound({ ...person, project_id: "b" }).candidates.propose({ ...proposal, operation_id: "foreign-caller" }));
  assert.equal(calls.length, before, "rejected identities never ask the source owner for text");
  sourceCurrent = false;
  await assert.rejects(f.bound().candidates.propose({ ...proposal, operation_id: "withdrawn" }), { code: "MEMORY_NOT_ACCEPTED" });
  assert.deepEqual((await f.bound().candidates.list("project", "a")).map(one => one.candidate_id), [candidate.candidate_id]);
});


test("learning candidate management stays independent of task recall without granting formal or unrelated reads", async t => {
  const f = await fixture(t); await f.save("formal-retained");
  const candidate = await f.bound().candidates.propose({ scope: "project", owner: "a", text: "Keep reports concise", origin: "person",
    meta, expected_version: 0, operation_id: "candidate-management" });
  const privateCandidate = await f.bound().candidates.propose({ scope: "project", owner: "a", text: "Private plugin candidate", origin: "person",
    meta: { ...meta, namespace: "another.plugin" }, expected_version: 0, operation_id: "private-candidate-management" });
  f.service.savePrefs({ ...person, consumer: "ui" }, "project", { task_recall: false });
  const learner: AgentMemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "a", consumer: "assistant",
    current_scene: "common", purpose: "management", source_use: "learning" };
  const explicit: AgentMemoryCaller = { ...learner, source_use: "explicit" };
  assert.deepEqual((await f.bound(learner).candidates.list("project", "a")).map(row => row.candidate_id), [candidate.candidate_id]);
  assert.deepEqual((await f.bound(explicit).candidates.list("project", "a")).map(row => row.candidate_id), [candidate.candidate_id],
    "explicit proposal context reads the same allowed candidates, never another plugin's namespace");
  assert.deepEqual(await f.bound(learner).list("project", "a"), [], "the candidate grant is not formal memory access");
  assert.deepEqual(await f.bound(explicit).list("project", "a"), [], "explicit formation is not formal task access");
  await assert.rejects(f.bound({ ...learner, purpose: "task" }).candidates.list("project", "a"), { code: "MEMORY_SCOPE_DENIED" },
    "a task caller cannot turn a candidate query into management");
  for (const other of [{ ...learner, source_use: undefined }, { ...learner, project_id: "b" }, { ...explicit, project_id: "b" }]) {
    assert.deepEqual(await f.bound(other).candidates.list("project", "a"), []);
  }
  f.service.savePrefs({ ...person, consumer: "ui" }, "project", { learn_from_work: false });
  assert.deepEqual(await f.bound(learner).candidates.list("project", "a"), []);
  assert.deepEqual((await f.bound(explicit).candidates.list("project", "a")).map(row => row.candidate_id), [candidate.candidate_id]);
  const restricted = { selector: { consumer: "assistant" as const, current_scene: "common" }, read: "inherit" as const, form: "off" as const };
  f.service.savePrefs({ ...person, consumer: "ui" }, "project", { class_restrictions: [restricted] });
  const recipe = await f.service.forRun(explicit, { scopes: ["project"] }); assert.ok(recipe);
  f.service.savePrefs({ ...person, consumer: "ui" }, "project", { class_restrictions: [] });
  assert.deepEqual(await f.bound({ ...explicit, session_id: "original-form-off", class_restrictions: recipe.class_restrictions }).candidates.list("project", "a"), [],
    "the original Run's form restriction survives a later current preference change");
  for (const override of [{ form: false }, { enabled: false }, { class_restrictions: [restricted] },
    { consumers: { ...defaultPrefs("project", "reviewed").consumers, assistant: false } }]) {
    f.service.savePrefs({ ...person, consumer: "ui" }, "project", { ...defaultPrefs("project", "reviewed"), task_recall: false, ...override });
    assert.deepEqual(await f.bound(learner).candidates.list("project", "a"), []);
    assert.deepEqual(await f.bound(explicit).candidates.list("project", "a"), []);
  }
  f.service.savePrefs({ ...person, consumer: "ui" }, "project", "reviewed"); await f.reopen();
  assert.deepEqual((await f.bound().candidates.list("project", "a")).map(row => [row.candidate_id, row.version]).sort(),
    [[candidate.candidate_id, candidate.version], [privateCandidate.candidate_id, privateCandidate.version]].sort());
  assert.equal((await f.bound().list("project", "a")).length, 1, "permission probes never modify persistent values");
});
