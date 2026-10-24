import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import type { AgentMemoryCaller, AgentRecalledMemory, AgentRunHandle } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryClassRestriction } from "@molis-ai/molis-work-contracts/services/memory";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MemoryService, defaultPrefs, MEMORY_GATE_POLICY, MEMORY_GATE_VERSION } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { memoryRuntimePolicy, prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";

const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "frozen-policy", consumer: "agent", plugin_id: "io.molis.work.coding", current_scene: "coding" } as const;
const person = { ...caller, consumer: "ui", person: true, purpose: "management" } as const;
const restriction: MemoryClassRestriction = { selector: { consumer: "agent", current_scene: "coding", kind: "convention" }, read: "off", form: "inherit" };

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-class-run-")), requests: string[] = [], authorized: AgentMemoryCaller[] = [];
  const server = createServer(async (request, response) => {
    let body = ""; for await (const chunk of request) body += chunk;
    requests.push(body); response.writeHead(200, { "content-type": "text/event-stream" });
    response.end('data: {"choices":[{"index":0,"delta":{"content":"Ready."},"finish_reason":null}]}\n\n'
      + 'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const ledger = openMemoryLedger({ homeDirectory: home });
  for (const key of ["personal", "project-default"]) ledger.savePrefs(caller.actor_id, key, defaultPrefs(key === "personal" ? "personal" : "project", "reviewed"));
  let alive = true, service!: MemoryService, beforeCaller: () => Promise<void> = async () => {};
  let transformCaller: (trusted: AgentMemoryCaller | undefined) => AgentMemoryCaller | undefined = trusted => trusted;
  const policy = memoryRuntimePolicy(() => ({ alive: () => alive, prefsFor: (scope, project) => service.prefsFor(caller.actor_id, scope, project),
    owners: project => ledger.owners(project), candidateOwners: project => ledger.candidateOwners(project),
    projectExists: async project => project === caller.project_id, deletingProject: () => undefined }));
  const open = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"),
    memory: { ...policy, promotion: { policy: MEMORY_GATE_POLICY, version: MEMORY_GATE_VERSION,
      decide: (caller, request) => service.promotion.decide(caller, request),
      undo: { prepare: (caller, request) => service.promotion.undo.prepare(caller, request),
        record: (caller, request) => service.promotion.undo.record(caller, request) } },
      callerForSession: async (owner, id) => { await beforeCaller(); return transformCaller(await policy.callerForSession(owner, id)); }, authorize: async (trusted, requests) => { authorized.push(structuredClone(trusted)); return policy.authorize(trusted, requests); },
      authorizeRecall: async (trusted, request) => { authorized.push(structuredClone(trusted)); return policy.authorizeRecall(trusted, request); } },
    modelConfiguration: async () => ({ protocol: "openai-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/chat/completions`, model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "test-only" });
  let adapter: Awaited<ReturnType<typeof open>>;
  t.after(async () => { alive = false; await adapter?.close(); ledger.close(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve())); await rm(home, { recursive: true, force: true }); });
  adapter = await open();
  const backend = prologueMemoryBackend(async () => adapter.memory!);
  service = new MemoryService({ ledger, backend });
  const entry = await backend.withCaller(person).write({ scope: "project", owner: caller.project_id, text: "Release checklist: FROZEN_CONVENTION", origin: "person", operation_id: "seed",
    meta: { kind: "convention", source: "manual", approved_by: { by: "person" }, classification: { scenes: ["coding"], lifecycle: "long-term" } } });
  const owner = { project_id: caller.project_id, plugin_id: caller.plugin_id, install_id: "coding", actor_id: caller.actor_id };
  const session = await adapter.createSession({ ...owner, workspace: "none", role_id: "reader", title: "Frozen policy" });
  const recipe = async () => { const memory = await service.forRun(caller, { query: "Release checklist" }); assert.ok(memory); return memory; };
  const run = async (memory: AgentRecalledMemory, beforeDispatch?: () => void | Promise<void>) => {
    const handle = await adapter.start({ ...owner, session, workspace: "none", role_id: "reader", task: "Release checklist", history: "digest",
      role: { role_id: "reader", version: 1, workspace: "none", execution: "read-only", host_tools: [], prompts: [], memory } }, { beforeDispatch });
    return finish(handle);
  };
  const finish = async (handle: AgentRunHandle) => {
    for (const until = Date.now() + 15_000;; await new Promise(resolve => setTimeout(resolve, 10))) {
      const view = await adapter.read(handle.ref);
      if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) return view;
      assert.ok(Date.now() < until, `run did not finish: ${view.phase}`);
    }
  };
  return { service, backend, entry, requests, authorized, recipe, run, get adapter() { return adapter; },
    beforeCaller: (check: () => Promise<void>) => { beforeCaller = check; },
    transformCaller: (transform: typeof transformCaller) => { transformCaller = transform; },
    restart: async () => { await adapter.close(); adapter = await open(); } };
}

test("MEM-CLASS-02: actual SDK Run retains its frozen restriction after reopening, while the next Run uses new preferences", { timeout: 40_000 }, async t => {
  const f = await fixture(t);
  f.service.savePrefs(person, "project", { class_restrictions: [restriction] });
  const frozen = await f.recipe();
  f.service.savePrefs(person, "project", { class_restrictions: [] });
  const first = await f.run(frozen);
  assert.equal(first.phase, "completed", first.stop_reason);
  assert.deepEqual(first.class_restrictions, { policy_version: 2, taxonomy_version: 1, personal: [], project: [restriction] });
  assert.equal(f.requests.length, 1); assert.doesNotMatch(f.requests[0]!, /FROZEN_CONVENTION/);
  assert.ok(f.authorized.some(item => item.purpose === "task" && item.class_restrictions?.project.length === 1), "the SDK authority saw the actual Run snapshot");
  const second = await f.run(await f.recipe());
  assert.equal(second.phase, "completed", second.stop_reason); assert.match(f.requests[1]!, /FROZEN_CONVENTION/);
  assert.deepEqual(second.class_restrictions?.project, []);
  await f.restart();
  assert.deepEqual((await f.adapter.read(first.ref)).class_restrictions, frozen.class_restrictions);
  assert.deepEqual((await f.adapter.read(second.ref)).class_restrictions?.project, []);
  assert.equal(f.requests.length, 2, "restoring policy projections does not re-run models");
  const task = f.backend.withCaller({ ...caller, session_id: first.ref.session_id, purpose: "task", class_restrictions: first.class_restrictions });
  assert.deepEqual(await task.list("project", caller.project_id), [], "backend caller binding retains the earlier restriction");
  assert.equal((await f.backend.withCaller(person).list("project", caller.project_id)).length, 1, "the restriction does not hide management records");
});

test("MEM-CLASS-02: current restrictions still tighten a captured Run before it dispatches", { timeout: 40_000 }, async t => {
  const f = await fixture(t), permissive = await f.recipe();
  f.service.savePrefs(person, "project", { class_restrictions: [restriction] });
  const view = await f.run(permissive);
  assert.equal(view.phase, "completed", view.stop_reason);
  assert.equal(f.requests.length, 1); assert.doesNotMatch(f.requests[0]!, /FROZEN_CONVENTION/);
  assert.deepEqual(view.class_restrictions?.project, [], "the current denial does not rewrite the original snapshot");
  f.service.savePrefs(person, "personal", { class_restrictions: [{ ...restriction, selector: { consumer: "agent", current_scene: "coding" } }] });
  f.service.savePrefs(person, "project", { class_restrictions: [{ ...restriction, selector: { consumer: "agent", current_scene: "coding" } }] });
  const off = await f.recipe(); assert.equal(off.skip, true); assert.equal(off.task, false);
});


test("MEM-CLASS-02: a pending start excludes another attempt and keeps its async authority through completion", { timeout: 40_000 }, async t => {
  const f = await fixture(t), allowed = await f.recipe();
  f.service.savePrefs(person, "project", { class_restrictions: [restriction] });
  const closed = await f.recipe(); f.service.savePrefs(person, "project", { class_restrictions: [] });
  const atAuthority = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let callers = 0;
  f.beforeCaller(async () => { if (++callers === 1) { atAuthority.resolve(); await release.promise; } });
  const first = f.run(allowed);
  try {
    await atAuthority.promise;
    await assert.rejects(f.run(closed), { code: "agent.session_busy" });
    release.resolve();
    const firstView = await first;
    assert.equal(firstView.phase, "completed", firstView.stop_reason);
    assert.match(f.requests[0]!, /FROZEN_CONVENTION/);
    assert.deepEqual(firstView.class_restrictions?.project, []);
    const next = await f.run(closed);
    assert.equal(next.phase, "completed", next.stop_reason);
    assert.doesNotMatch(f.requests[1]!, /FROZEN_CONVENTION/);
    assert.deepEqual(next.class_restrictions?.project, [restriction]);
  } finally { release.resolve(); await first.catch(() => undefined); }
});


test("MEM-CLASS-02: closing a class while the actual network guard waits prevents its prepared body from dispatching", { timeout: 40_000 }, async t => {
  const f = await fixture(t), recipe = await f.recipe();
  const atDispatch = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const running = f.run(recipe, async () => { atDispatch.resolve(); await release.promise; });
  try {
    await atDispatch.promise;
    f.service.savePrefs(person, "project", { class_restrictions: [restriction] });
    release.resolve();
    const view = await running;
    assert.equal(f.requests.length, 0, "a current class denial at the actual network boundary must prevent the already prepared memory body from leaving");
    assert.equal(view.phase, "failed");
    assert.deepEqual(view.memory_recalled?.injected ?? [], []);
  } finally { release.resolve(); await running.catch(() => undefined); }
});


test("MEM-CLASS-02: a resolver cannot replace the trusted project behind an unchanged SDK context while the Host guard waits", { timeout: 40_000 }, async t => {
  const f = await fixture(t), recipe = await f.recipe();
  const atDispatch = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const replacements: Array<{ original: AgentMemoryCaller; changed: AgentMemoryCaller }> = [];
  const running = f.run(recipe, async () => { atDispatch.resolve(); await release.promise; });
  try {
    await atDispatch.promise;
    assert.ok(f.authorized.some(trusted => trusted.purpose === "task" && trusted.project_id === caller.project_id),
      "the real Run reached its Host dispatch guard after authorization with the original project");
    f.transformCaller(trusted => {
      if (!trusted) return trusted;
      const changed = { ...trusted, project_id: "another-trusted-project" };
      replacements.push({ original: structuredClone(trusted), changed: structuredClone(changed) });
      return changed;
    });
    release.resolve();
    const view = await running;
    assert.ok(replacements.length > 0, "the production resolver was consulted again after the Host wait");
    for (const { original, changed } of replacements) {
      const { project_id: originalProject, ...originalContext } = original;
      const { project_id: changedProject, ...changedContext } = changed;
      assert.notEqual(changedProject, originalProject);
      assert.deepEqual(changedContext, originalContext, "only the trusted project changed; every SDK context field stayed fixed");
    }
    assert.equal(f.requests.length, 0, "an unchanged SDK context cannot authorize dispatch for another trusted project");
    assert.equal(view.phase, "failed");
    assert.deepEqual(view.memory_recalled?.injected ?? [], []);
    assert.equal(f.authorized.some(trusted => trusted.project_id === "another-trusted-project"), false,
      "the substituted caller must be rejected before it reaches App authorization, not merely rejected by the App's scope policy");
  } finally { release.resolve(); await running.catch(() => undefined); }
});
