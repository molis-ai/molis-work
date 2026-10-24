import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createPrologueNodeAdapter, PrologueAgentAdapter, type PrologueRuntimePort } from "@molis-ai/molis-work-service-agent-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentMemoryTools, AgentRunHandle, AgentRecalledMemory, AgentMemoryPromotion } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryRunReadControl, MemoryRunReadResult } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService, defaultPrefs, MEMORY_GATE_POLICY, MEMORY_GATE_VERSION } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { memoryRuntimePolicy, prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";
import { scriptedModelServer } from "./fixtures/connector-assistant-model.js";

/** The same promotion/undo owner as memoryRuntime; policy compilation needs these even when this Run only reads. */
function memoryPromotion(service: () => MemoryService): AgentMemoryPromotion {
  return { policy: MEMORY_GATE_POLICY, version: MEMORY_GATE_VERSION,
    decide: (caller, request) => service().promotion.decide(caller, request),
    undo: { prepare: (caller, request) => service().promotion.undo.prepare(caller, request),
      record: (caller, request) => service().promotion.undo.record(caller, request) } };
}

/** Public production composition with deterministic loopback model replies. */
async function expansionHome(t: TestContext, endpoint: string, projects: readonly string[]) {
  const home = await mkdtemp(join(tmpdir(), "memory-expansion-wiring-")), appId = "io.molis.work";
  let ledger = openMemoryLedger({ homeDirectory: home });
  for (const key of ["personal", "project-default"]) ledger.savePrefs(LOCAL_PERSON_ACTOR_ID, key,
    { ...defaultPrefs(key === "personal" ? "personal" : "project"), form: false, auto: false, task_recall: false });
  let service!: MemoryService;
  const policy = memoryRuntimePolicy(() => ({ alive: () => true,
    prefsFor: (scope, id) => service.prefsFor(LOCAL_PERSON_ACTOR_ID, scope, id), owners: id => ledger.owners(id), candidateOwners: id => ledger.candidateOwners(id),
    projectExists: async id => projects.includes(id), deletingProject: () => undefined }));
  const open = () => createPrologueNodeAdapter({ app: { appId, appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), memory: { ...policy, promotion: memoryPromotion(() => service) },
    memoryUsage: receipt => service.settleUses(receipt), resolveCredential: () => "test-only",
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint, model: "fixture", credential_ref: "fixture" }) });
  let adapter = await open();
  const backend = prologueMemoryBackend(async () => adapter.memory!);
  service = new MemoryService({ ledger, backend });
  let closed = false;
  const close = async () => { if (!closed) { closed = true; await adapter.close(); } };
  t.after(async () => { try { await close(); } finally { ledger.close(); await rm(home, { recursive: true, force: true }); } });
  const prepare = async (project: string, text: string, budget: number) => {
    const owner = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project, plugin_id: "io.molis.work.coding", install_id: "coding" };
    const person = { actor_id: owner.actor_id, project_id: project, consumer: "ui" as const, person: true };
    const entry = await backend.withCaller(person).write({ scope: "project", owner: project, text, origin: "person", operation_id: crypto.randomUUID(),
      meta: { kind: "convention", source: "manual", approved_by: { by: "person" }, classification: { scenes: ["coding"], lifecycle: "long-term" } } });
    const session = await adapter.createSession({ ...owner, workspace: "business", role_id: "reader", title: project });
    const recipe = await service.forRun({ ...owner, consumer: "agent", current_scene: "coding" }, { query: project, used_for: "Expansion" }); assert.ok(recipe);
    const start = (list: NonNullable<AgentMemoryTools["list"]>) => adapter.start({ ...owner, session, workspace: "business", role_id: "reader", task: project, history: "digest",
      role: { role_id: "reader", version: 1, workspace: "business", execution: "read-only", host_tools: [], prompts: [], memory: { ...recipe, budget_tokens: budget },
        action_gateway: { operate: false, client: { discover: async () => [], invoke: async () => { throw new Error("No Actions"); }, memory: { list } } } } });
    return { owner, person, session, entry, start };
  };
  return { home, appId, get adapter() { return adapter; }, get service() { return service; }, prepare, close,
    reopen: async () => {
      await close(); ledger.close(); ledger = openMemoryLedger({ homeDirectory: home });
      adapter = await open(); closed = false; service = new MemoryService({ ledger, backend });
    } };
}

async function expansionFinished(adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>>, handle: AgentRunHandle) {
  const deadline = performance.now() + 15_000;
  for (;;) {
    const view = await adapter.read(handle.ref);
    if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) return view;
    assert.ok(performance.now() < deadline, "the real Run did not finish");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

async function expansionBarrier<T>(pending: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([pending, new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 10_000);
  })]); } finally { clearTimeout(timer); }
}

test("MEM-33: two live Runs retain their own scope, frame, deduplication and remaining budget", { timeout: 40_000 }, async t => {
  const server = await scriptedModelServer(t, body => JSON.stringify(body.messages).includes('"tool_result"') ? "Checked." : { name: "list-memories", input: {} });
  const f = await expansionHome(t, server.base + "/v1/messages", ["RUN_ALPHA", "RUN_BETA"]);
  const a = await f.prepare("RUN_ALPHA", "ALPHA_CANONICAL_MEMORY", 600), b = await f.prepare("RUN_BETA", "BETA_CANONICAL_MEMORY", 900);
  const atA = Promise.withResolvers<MemoryRunReadControl>(), atB = Promise.withResolvers<MemoryRunReadControl>();
  const doneA = Promise.withResolvers<MemoryRunReadResult>(), doneB = Promise.withResolvers<MemoryRunReadResult>();
  const ref = (one: typeof a) => ({ scope: "project" as const, owner: one.owner.project_id, memory_id: one.entry.memory_id, version: one.entry.version });
  try {
    const startA = await a.start(call => { assert.ok(call.memory_read); atA.resolve(call.memory_read); return doneA.promise; });
    const startB = await b.start(call => { assert.ok(call.memory_read); atB.resolve(call.memory_read); return doneB.promise; });
    const [controlA, controlB] = await expansionBarrier(Promise.all([atA.promise, atB.promise]), "both live Run tools");
    assert.notEqual(controlA, controlB);
    assert.notEqual(startA.ref.run_id, startB.ref.run_id);
    const active = await Promise.all([f.adapter.read(startA.ref), f.adapter.read(startB.ref)]);
    assert.ok(active.every(view => !["completed", "failed", "cancelled", "stopped"].includes(view.phase)), "both original Runs are still active while their tools wait");
    const emptyA = await controlA.read(async scopes => { assert.ok(scopes.some(scope => scope.owner === a.owner.project_id)); assert.ok(!scopes.some(scope => scope.owner === b.owner.project_id)); return []; });
    const emptyB = await controlB.read(async scopes => { assert.ok(scopes.some(scope => scope.owner === b.owner.project_id)); assert.ok(!scopes.some(scope => scope.owner === a.owner.project_id)); return []; });
    assert.equal(emptyA.remaining_tokens, 600); assert.equal(emptyB.remaining_tokens, 900);
    const cross = await controlA.read(async () => [ref(b)]);
    assert.equal(cross.outcome, "failed"); assert.deepEqual(cross.queued, []); assert.equal(cross.remaining_tokens, 600);
    const ownA = await controlA.read(async () => [ref(a)]);
    assert.equal(ownA.outcome, "queued"); assert.deepEqual(ownA.queued, [{ memory_id: a.entry.memory_id, version: a.entry.version }]);
    assert.ok(ownA.tokens > 0); assert.equal(ownA.remaining_tokens, 600 - ownA.tokens);
    assert.equal((await controlB.read(async () => [])).remaining_tokens, 900, "A's admission never charges B");
    const ownB = await controlB.read(async () => [ref(b)]);
    assert.equal(ownB.outcome, "queued"); assert.equal(ownB.remaining_tokens, 900 - ownB.tokens);
    const againA = await controlA.read(async () => [ref(a)]);
    assert.deepEqual(againA.queued, []); assert.equal(againA.remaining_tokens, ownA.remaining_tokens, "B did not replace A's admission set");
    doneA.resolve(ownA); doneB.resolve(ownB);
    const views = await Promise.all([expansionFinished(f.adapter, startA), expansionFinished(f.adapter, startB)]);
    assert.ok(views.every(view => view.phase === "completed"));
    for (const [project, own, other] of [["RUN_ALPHA", a, b], ["RUN_BETA", b, a]] as const) {
      const requests = server.requests.filter(body => JSON.stringify(body.messages).includes(project));
      assert.equal(requests.length, 2);
      assert.doesNotMatch(JSON.stringify(requests[0]), new RegExp(own.entry.text));
      assert.match(JSON.stringify(requests[1]), new RegExp(own.entry.text));
      assert.doesNotMatch(JSON.stringify(requests), new RegExp(other.entry.text));
      const results = (requests[1]!.messages as Array<{ content?: unknown }>).flatMap(message => Array.isArray(message.content) ? message.content : []).filter(block => block.type === "tool_result");
      assert.doesNotMatch(JSON.stringify(results), /ALPHA_CANONICAL_MEMORY|BETA_CANONICAL_MEMORY/);
    }
  } finally {
    const empty: MemoryRunReadResult = { mode: "run-expansion", receipt_id: "cleanup", outcome: "cancelled", queued: [], omitted: [], tokens: 0, basis: "conservative-estimate", remaining_tokens: 0 };
    doneA.resolve(empty); doneB.resolve(empty);
  }
});

// Delay only the real afterStart index commit, not SDK start or its independent model/tool drive.
for (const outcome of ["release", "commit-fails", "read-cancelled"] as const) test(`MEM-33: real early tool ${outcome} while App Run binding waits for storage`, { timeout: 40_000 }, async t => {
  const server = await scriptedModelServer(t, (_body, turn) => turn === 1 ? { name: "list-memories", input: {} } : "Checked.");
  const f = await expansionHome(t, server.base + "/v1/messages", ["EARLY_RUN"]), one = await f.prepare("EARLY_RUN", "EARLY_CANONICAL_MEMORY", 900);
  const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
  const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
  const inspector = createNodeHost({ storageRoot: join(f.home, "sdk") });
  const indexKind = `molis-agent-index-${createHash("sha256").update(f.appId).digest("hex").slice(0, 24)}`;
  const atCommit = Promise.withResolvers<void>(), releaseCommit = Promise.withResolvers<void>(), atTool = Promise.withResolvers<void>();
  const toolSettled = Promise.withResolvers<{ ok: boolean }>(), cancelRead = new AbortController();
  const failure = new Error("Injected afterStart index persistence failure");
  // Observe the existing public Host port; do not import or replace SDK Runtime internals.
  type CommitInput = { kind: string; id: string; secureBody?: Uint8Array };
  const prototype: { commit(input: CommitInput): Promise<unknown> } = Object.getPrototypeOf(inspector.storage), commit = prototype.commit;
  let held = false, startReturned = false, selections = 0;
  let originalToolSignal: AbortSignal | undefined;
  const barrier = t.mock.method(prototype, "commit", async function(this: typeof prototype, input: CommitInput) {
    if (!held && input.kind === indexKind && input.id === one.session.session_id && input.secureBody) {
      const value = JSON.parse(new TextDecoder().decode(input.secureBody)) as { attempts: Array<{ run_id?: string }> };
      if (value.attempts.some(attempt => attempt.run_id)) {
        held = true; atCommit.resolve(); await releaseCommit.promise;
        if (outcome === "commit-fails") throw failure;
      }
    }
    return commit.call(this, input);
  });
  const started = one.start(async call => {
    assert.ok(call.memory_read); assert.equal(startReturned, false, "the real first tool runs before App start returns");
    originalToolSignal = call.signal;
    const pending = call.memory_read.read(async () => { selections++; return [{ scope: "project", owner: one.owner.project_id, memory_id: one.entry.memory_id, version: one.entry.version }]; },
      AbortSignal.any([call.signal, cancelRead.signal]));
    atTool.resolve();
    try { const result = await pending; toolSettled.resolve({ ok: true }); return result; }
    catch (error) { toolSettled.resolve({ ok: false }); throw error; }
  }).then(value => { startReturned = true; return { value }; }, error => ({ error }));
  try {
    await expansionBarrier(Promise.all([atCommit.promise, atTool.promise]), "afterStart commit and first real tool");
    assert.equal(startReturned, false); assert.equal(selections, 0); assert.equal(server.requests.length, 1);
    if (outcome === "read-cancelled") {
      cancelRead.abort();
      assert.deepEqual(await expansionBarrier(toolSettled.promise, "cancelled read"), { ok: false }, "the read's supplied signal releases ready waiting while App start is still held");
      assert.equal(selections, 0); assert.equal(startReturned, false);
    }
    releaseCommit.resolve();
    const settled = await started;
    if (outcome === "commit-fails") {
      assert.ok("error" in settled); assert.equal(settled.error, failure);
      assert.equal(originalToolSignal?.aborted, true, "afterStart failure aborts the production tool signal");
      assert.deepEqual(await expansionBarrier(toolSettled.promise, "failed-start read"), { ok: false });
      await f.close(); // Drain the accepted SDK Run before asserting that no later request escaped.
      assert.equal(selections, 0); assert.equal(server.requests.length, 1, "failed App registration stops the accepted Run before another request");
    } else {
      assert.ok("value" in settled);
      const view = await expansionFinished(f.adapter, settled.value);
      assert.equal(view.phase, "completed");
      assert.equal(selections, outcome === "release" ? 1 : 0);
      assert.equal(server.requests.length, 2);
      if (outcome === "release") assert.match(JSON.stringify(server.requests[1]), /EARLY_CANONICAL_MEMORY/);
      else assert.doesNotMatch(JSON.stringify(server.requests), /EARLY_CANONICAL_MEMORY/);
    }
  } finally { cancelRead.abort(); releaseCommit.resolve(); await started; barrier.mock.restore(); }
});

/** Real public Node/SQLite/HTTP path; deterministic loopback replies do not prove model quality. */
for (const scenario of ["read-only", "off", "role-denied", "class-denied", "consumer-off", "wrong-owner", "cancel", "revoke-after-selection", "version-changed", "expired-after-selection", "installation-revoked"] as const) {
  test(`same Run expansion: ${scenario}, no tool body or unconfirmed use`, { timeout: 40_000 }, async t => {
    const clock = Date.now();
    if (scenario === "expired-after-selection") t.mock.timers.enable({ apis: ["Date"], now: clock });
    const home = await mkdtemp(join(tmpdir(), "memory-run-expand-"));
    const project = "expand-project", plugin = "io.molis.work.coding", sentinel = "EXPANSION_ONLY_CANONICAL_TEXT";
    const owner = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project, plugin_id: plugin, install_id: "coding" };
    const person = { actor_id: owner.actor_id, project_id: project, consumer: "ui" as const, person: true };
    const caller = { actor_id: owner.actor_id, project_id: project, consumer: "agent" as const, plugin_id: plugin, current_scene: "coding" };
    const receipts: MemoryRunReadResult[] = [];
    let retained: MemoryRunReadControl | undefined;
    let installed = true, revokedChecks = 0, selected = false, installationReadRejected = false;
    const installationDenied = new Error("The original installation is no longer authorized");
    const server = await scriptedModelServer(t, (_body, turn) => turn === 1 ? { name: "list-memories", input: {} } : "Checked.");
    const ledger = openMemoryLedger({ homeDirectory: home });
    for (const key of ["personal", "project-default"]) ledger.savePrefs(owner.actor_id, key, { ...defaultPrefs(key === "personal" ? "personal" : "project"), form: false, auto: false, task_recall: false });
    let service!: MemoryService, scans = 0;
    const policy = memoryRuntimePolicy(() => ({ alive: () => true,
      prefsFor: (scope, id) => service.prefsFor(owner.actor_id, scope, id), owners: id => ledger.owners(id), candidateOwners: id => ledger.candidateOwners(id),
      projectExists: async id => id === project, deletingProject: () => undefined }));
    const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"),
      memory: { ...policy, promotion: memoryPromotion(() => service) }, memoryUsage: receipt => service.settleUses(receipt),
      modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: server.base + "/v1/messages", model: "fixture", credential_ref: "fixture" }),
      resolveCredential: () => "test-only" });
    const backend = prologueMemoryBackend(async () => adapter.memory!);
    const observe: typeof backend.withCaller = bound => {
      const store = backend.withCaller(bound);
      return { ...store, withCaller: observe, list: async (...args) => { scans++; return store.list(...args); } };
    };
    service = new MemoryService({ ledger, backend: { ...backend, withCaller: observe } });
    try {
      const entry = await backend.withCaller(person).write({ scope: "project", owner: project, text: sentinel, origin: "person", operation_id: crypto.randomUUID(),
        meta: { kind: "convention", source: "manual", approved_by: { by: "person" }, classification: { scenes: ["coding"], lifecycle: scenario === "expired-after-selection" ? "short-term" : "long-term" },
          ...(scenario === "expired-after-selection" ? { expires_at_ms: clock + 60_000 } : {}) } });
      const session = await adapter.createSession({ ...owner, workspace: "business", role_id: "reader", title: "Expansion" });
      if (scenario === "off") for (const scope of ["personal", "project"] as const) service.savePrefs(person, scope, { enabled: false });
      if (scenario === "consumer-off") for (const scope of ["personal", "project"] as const) service.savePrefs(person, scope, { consumers: { ...service.prefsFor(owner.actor_id, scope, project).consumers, agent: false } });
      if (scenario === "class-denied") for (const scope of ["personal", "project"] as const) service.savePrefs(person, scope, { class_restrictions: [{ selector: { consumer: "agent", current_scene: "coding" }, read: "off", form: "inherit" }] });
      const recipe = await service.forRun(caller, { query: "Read memory", used_for: "Expansion" }); assert.ok(recipe);
      assert.equal(recipe.task, false); assert.equal(recipe.skip, true);
      const reader = { ...caller, session_id: session.session_id, purpose: "task" as const, class_restrictions: recipe.class_restrictions };
      const list: NonNullable<AgentMemoryTools["list"]> = async call => {
        assert.ok(call.memory_read); retained = call.memory_read;
        if (scenario === "cancel") {
          const cancelled = new AbortController(); cancelled.abort();
          return service.expand({ ...reader, signal: cancelled.signal }, { list: { scope: "project" } }, retained);
        }
        if (["revoke-after-selection", "version-changed", "expired-after-selection", "installation-revoked"].includes(scenario)) {
          const reading = retained.read(async scopes => {
            assert.equal(scopes.some(scope => scope.owner === project), true);
            selected = true;
            if (scenario === "expired-after-selection") t.mock.timers.setTime(clock + 60_001);
            else if (scenario === "installation-revoked") installed = false;
            else if (scenario === "revoke-after-selection") service.savePrefs(person, "project", { enabled: false });
            else await backend.withCaller(person).update({ scope: "project", owner: project, memory_id: entry.memory_id,
              expected_version: entry.version, operation_id: crypto.randomUUID(), change: { text: "REPLACEMENT_VERSION_TEXT" } });
            return [{ scope: "project", owner: project, memory_id: entry.memory_id, version: entry.version }];
          }, call.signal);
          if (scenario === "installation-revoked") {
            await assert.rejects(reading, error => error === installationDenied);
            installationReadRejected = true;
            return reading;
          }
          const result = await reading; receipts.push(result); return result;
        }
        const selectedCaller = scenario === "wrong-owner" ? { ...reader, actor_id: "another-person", project_id: "another-project" } : reader;
        const values = await Promise.all([service.expand({ ...selectedCaller, signal: call.signal }, { list: { scope: "project" } }, retained),
          service.expand({ ...selectedCaller, signal: call.signal }, { list: { scope: "project" } }, retained)]);
        receipts.push(...values); return values[0]!;
      };
      const handle: AgentRunHandle = await adapter.start({ ...owner, session, workspace: "business", role_id: "reader", task: "Read memory", history: "digest",
        role: { role_id: "reader", version: 1, workspace: "business", execution: "read-only", host_tools: [], prompts: [],
          ...(scenario === "role-denied" ? {} : { memory: recipe }), action_gateway: { operate: false, client: { discover: async () => [], invoke: async () => { throw new Error("No Actions"); }, memory: { list } } } } }, {
          // The public execution port is the same trusted current-installation fence supplied by the Host.
          beforeDispatch: () => { if (!installed) { revokedChecks++; throw installationDenied; } },
        });
      const deadline = performance.now() + 15_000;
      let view = await adapter.read(handle.ref);
      while (!["completed", "failed", "cancelled", "stopped"].includes(view.phase)) {
        assert.ok(performance.now() < deadline, "Run must finish without a start/tool circular wait");
        await new Promise(resolve => setTimeout(resolve, 10)); view = await adapter.read(handle.ref);
      }
      if (scenario === "installation-revoked") {
        assert.equal(selected, true); assert.equal(installationReadRejected, true);
        assert.ok(revokedChecks >= 2, "both the post-selection and next-dispatch fences reject the revoked installation");
        assert.equal(view.phase, "failed"); assert.equal(server.requests.length, 1);
        assert.doesNotMatch(JSON.stringify(server.requests), new RegExp(sentinel));
        assert.deepEqual(service.uses({}), []); assert.equal(scans, 0);
        return;
      }
      assert.ok(server.requests.length >= 2, "the real tool result must reach the next model request");
      const messages = server.requests[1]!.messages as Array<{ content?: unknown }>;
      const results = messages.flatMap(message => Array.isArray(message.content) ? message.content : []).filter(block => block.type === "tool_result");
      assert.ok(results.length); assert.doesNotMatch(JSON.stringify(results), new RegExp(sentinel));
      assert.doesNotMatch(JSON.stringify(server.requests[0]), new RegExp(sentinel), "manual is not automatic recall");
      if (scenario === "read-only") {
        assert.match(JSON.stringify(server.requests[1]), new RegExp(sentinel), "explicit mode survives the later captureReads dispatch fence");
        assert.deepEqual(receipts.flatMap(receipt => receipt.queued), [{ memory_id: entry.memory_id, version: entry.version }], "concurrent calls admit the same version once");
        assert.ok(receipts.some(receipt => receipt.omitted.some(ref => ref.memory_id === entry.memory_id)));
        assert.ok(view.memory_recalled?.contexts?.some(context => context.status === "response-observed" && context.references.some(ref => ref.memory_id === entry.memory_id)));
        assert.ok(view.memory_recalled?.contexts?.every(context => context.tokens <= context.budget_tokens));
        assert.ok(service.uses({}).every(use => use.source === "run-context"), "selection writes no returned/use ledger");
      } else {
        if (scenario === "expired-after-selection") {
          assert.equal(selected, true); assert.equal(receipts.length, 1);
          assert.deepEqual(receipts[0]!.queued, []); assert.equal(receipts[0]!.tokens, 0);
          assert.ok(!view.memory_recalled?.contexts?.some(context => context.references.some(ref => ref.memory_id === entry.memory_id)));
        }
        assert.doesNotMatch(JSON.stringify(server.requests), new RegExp(sentinel));
        assert.deepEqual(service.uses({}), []);
        assert.equal(scans, 0, "off, missing role, cancellation or denied exact refs never scan through App list");
      }
      assert.ok(retained);
      let lateSelection = false;
      await assert.rejects(retained.read(async () => { lateSelection = true; return []; }), /已结束|读取控制/);
      assert.equal(lateSelection, false, "terminal controls cannot select or borrow another Run");
    } finally { await adapter.close(); ledger.close(); await rm(home, { recursive: true, force: true }); }
  });
}

test("MEM-33: reopened historical Run cannot revive or lend its expansion control", { timeout: 40_000 }, async t => {
  const server = await scriptedModelServer(t, (_body, turn) => turn % 2 === 1 ? { name: "list-memories", input: {} } : "Checked.");
  const f = await expansionHome(t, server.base + "/v1/messages", ["HISTORICAL_RUN"]);
  const one = await f.prepare("HISTORICAL_RUN", "HISTORICAL_CANONICAL_MEMORY", 900);
  const reference = { scope: "project" as const, owner: one.owner.project_id, memory_id: one.entry.memory_id, version: one.entry.version };
  let original: MemoryRunReadControl | undefined;
  const first = await one.start(async call => {
    assert.ok(call.memory_read); original = call.memory_read;
    return original.read(async () => [reference], call.signal);
  });
  assert.equal((await expansionFinished(f.adapter, first)).phase, "completed");
  assert.equal(server.requests.length, 2);
  assert.match(JSON.stringify(server.requests[1]), /HISTORICAL_CANONICAL_MEMORY/);
  const before = await f.adapter.readSession(one.session);
  const uses = f.service.uses({}); assert.ok(uses.length > 0);
  await f.reopen();
  const restored = await f.adapter.readSession(one.session);
  assert.deepEqual(restored.runs, before.runs);
  assert.equal(restored.latest_run?.phase, "completed");
  assert.equal(restored.latest_run?.ref.run_id, first.ref.run_id);
  assert.equal("memory_read" in restored, false);
  assert.equal("memory_read" in restored.latest_run!, false);
  assert.deepEqual(f.service.uses({}), uses);
  assert.equal(server.requests.length, 2, "restoring history starts no model work");
  assert.ok(original);
  let oldSelections = 0;
  const rejectOriginal = () => assert.rejects(original!.read(async () => { oldSelections++; return [reference]; }), /已结束|读取控制/);
  await rejectOriginal();
  let newAdmission: MemoryRunReadResult | undefined;
  const second = await one.start(async call => {
    assert.ok(call.memory_read); assert.notEqual(call.memory_read, original);
    await rejectOriginal();
    const empty = await call.memory_read.read(async () => [], call.signal);
    assert.equal(empty.remaining_tokens, 900, "the new Run starts with its own admission budget");
    const result = await call.memory_read.read(async () => [reference], call.signal);
    assert.deepEqual(result.queued, [{ memory_id: one.entry.memory_id, version: one.entry.version }], "historical admission does not deduplicate the new Run");
    newAdmission = result; return result;
  });
  assert.notEqual(second.ref.run_id, first.ref.run_id);
  assert.equal((await expansionFinished(f.adapter, second)).phase, "completed");
  assert.ok(newAdmission, "the real second tool completed every control and admission assertion");
  assert.equal(oldSelections, 0);
  assert.equal((await f.adapter.read(first.ref)).phase, "completed");
  assert.equal(server.requests.length, 4);
  assert.doesNotMatch(JSON.stringify(server.requests[2]), /HISTORICAL_CANONICAL_MEMORY/);
  assert.match(JSON.stringify(server.requests[3]), /HISTORICAL_CANONICAL_MEMORY/);
});

// Adapter contract only: the double follows the SDK's independent-drive return contract. It does not
// prove a real Node afterStart storage failure; the public SDK/Host cases above cover that distinct path.
test("MEM-33: an accepted start failing before RunRecord binding releases the early read tool", { timeout: 5_000 }, async () => {
  const entered = Promise.withResolvers<void>(), finished = Promise.withResolvers<unknown>();
  const failure = new Error("afterStart registration failed"), toolAbort = new AbortController();
  let selected = false, stopped = false;
  const recipe: AgentRecalledMemory = { consumer: "assistant", current_scene: "assistant", scopes: [{ scope: "user", owner: "person" }],
    pinned: [], task: false, skip: true, budget_chars: 1000, budget_tokens: 1000,
    class_restrictions: { policy_version: 2, taxonomy_version: 1, personal: [], project: [] } };
  const runtime: PrologueRuntimePort = {
    workspaceBusiness: true, actionTools: true,
    sessions: { async create() { return { ref: { id: "session" } }; } },
    async startAgentRun(input) {
      // Accepted SDK work drives independently; never await the tool result as a prerequisite to start's return.
      const work = input.action_gateway!.client.memory!.list!({ operation_id: "early-read", signal: toolAbort.signal });
      void work.then(() => finished.resolve("unexpected read success"), error => finished.resolve(error));
      await entered.promise;
      // The real afterStart failure requests stop synchronously and throws; it does not await drive/drain.
      stopped = true;
      throw failure;
    },
    async shutdown() {},
  };
  const adapter = new PrologueAgentAdapter({ runtime,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://model.example/v1/messages", model: "fixture", credential_ref: "fixture" }) });
  const owner = { actor_id: "person", project_id: "project", plugin_id: "assistant", install_id: "assistant" };
  try {
    const session = await adapter.createSession({ ...owner, workspace: "business", role_id: "reader", title: "Early tool" });
    await assert.rejects(adapter.start({ ...owner, session, workspace: "business", role_id: "reader", task: "Read", role: {
      role_id: "reader", workspace: "business", version: 1, execution: "read-only", host_tools: [], prompts: [], memory: recipe,
      action_gateway: { operate: false, client: { discover: async () => [], invoke: async () => { throw new Error("No Actions"); }, memory: {
        list: call => {
          assert.ok(call.memory_read);
          const pending = call.memory_read.read(async () => { selected = true; return []; }, call.signal);
          entered.resolve(); return pending;
        },
      } } },
    } }), error => error === failure);
    assert.equal(await finished.promise, failure, "failed ready releases an already waiting read without waiting for drive");
    assert.equal(stopped, true); assert.equal(selected, false);
    assert.deepEqual((await adapter.readSession(session)).runs, [], "failed registration publishes no live Run");
  } finally { toolAbort.abort(); await adapter.close(); }
});
