import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import type { AgentRunHandle, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MemoryService, defaultPrefs, MEMORY_GATE_POLICY, MEMORY_GATE_VERSION } from "@molis-ai/molis-work-service-memory";
import { acquireStorageOwner, initializeMemoryForgetting, openMemoryLedger } from "@molis-ai/molis-work-storage";
import { memoryRuntimePolicy, type MemoryRuntimePolicyOwner } from "@molis-ai/molis-work-app-local-host";
import { prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";

const project = "run-facts", coding = "io.molis.work.coding";
const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project, consumer: "agent", plugin_id: coding, current_scene: "coding" } as const;
const person = { ...caller, consumer: "ui", person: true, purpose: "management" } as const;

async function finished(adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>>, handle: AgentRunHandle, expected = "completed"): Promise<AgentRunView> {
  const until = Date.now() + 15_000;
  for (;;) {
    const view = await adapter.read(handle.ref);
    if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) {
      assert.equal(view.phase, expected, JSON.stringify({ phase: view.phase, stop_reason: view.stop_reason }));
      return view;
    }
    if (Date.now() > until) assert.fail(`Run did not finish: ${view.phase}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

/** Real Node/HTTP/SQLite and production App authority; scripted model output is engineering evidence, not model quality. */
// MEM-14: memory reaches the model only through the SDK's own recall and its receipt, on the asynchronous Run path; Molis
// prepares no body of its own (the §9.2 benefit clause is MEM-38's measurement, not proven here).
// MEM-07: the real Run keeps the retrieval's receipt id into the final Context, and a round refused before dispatch keeps
// its ready retrieval apart from delivery (injected stays empty). MEM-06: the vector-fallback case reports each attempt as it ran.
// MEM-16: the recent reference is the final Context's receipt, survives a usage-sink fault and adapter reopen, a repeat read keeps it,
// and a refused round cannot replace it.
for (const strategy of ["keyword", "vector-fallback"] as const) test(`${strategy}: trusted Run goal/object facts select only applicable memory through final HTTP Context and survive Session reopen`, { timeout: 40_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-run-context-")), requests: string[] = [];
  const server = createServer(async (request, response) => {
    let body = ""; for await (const chunk of request) body += chunk;
    requests.push(body);
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end('data: {"model":"scripted","choices":[{"index":0,"delta":{"content":"Ready."},"finish_reason":null}]}\n\n'
      + 'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":20,"completion_tokens":2}}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const initialOwner = acquireStorageOwner(join(home, "agent-runtime"));
  try { initializeMemoryForgetting({ homeDirectory: home, storageOwner: initialOwner, assertCurrent() {} }); }
  finally { initialOwner.release(); }
  const ledger = openMemoryLedger({ homeDirectory: home });
  for (const key of ["personal", "project-default"]) ledger.savePrefs(caller.actor_id, key, defaultPrefs(key === "personal" ? "personal" : "project", "reviewed"));
  let alive = true, service!: MemoryService, failUsage = true;
  const owner: MemoryRuntimePolicyOwner = { alive: () => alive, forgettingPhase: () => service.forgettingPhase(), prefsFor: (scope, id) => service.prefsFor(caller.actor_id, scope, id),
    owners: id => ledger.owners(id), candidateOwners: id => ledger.candidateOwners(id),
    projectExists: async id => id === project, deletingProject: () => undefined };
  const memory = memoryRuntimePolicy(() => owner), matrix = memory.policy.matrix;
  assert.ok(matrix?.rows);
  // The existing public Adapter policy port configures this engineering case, not a new product setting.
  // All owners, grants, taxonomy and budgets remain the production App's. No vector backend is installed.
  const policy = strategy === "keyword" ? memory.policy : { ...memory.policy, matrix: { ...matrix,
    rows: matrix.rows.map((row): typeof row => ({ ...row, read: { ...row.read, algorithm: "vector",
      fallback: { algorithm: "keyword", on: ["unavailable"] } } })) } };
  const open = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "agent-runtime"),
    memoryUsage: receipt => { if (failUsage) throw new Error("isolated ledger fault"); service.settleUses(receipt); },
    memory: { ...memory, policy, promotion: { policy: MEMORY_GATE_POLICY, version: MEMORY_GATE_VERSION,
      decide: (caller, request) => service.promotion.decide(caller, request),
      undo: { prepare: (caller, request) => service.promotion.undo.prepare(caller, request),
        record: (caller, request) => service.promotion.undo.record(caller, request) } } }, modelConfiguration: async () => ({ protocol: "openai-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/chat/completions`,
      model: "scripted", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  let adapter = await open().catch(async error => {
    ledger.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true }); throw error;
  });
  const backend = prologueMemoryBackend(async () => adapter.memory!);
  service = new MemoryService({ ledger, backend });
  try {
    const entries: Awaited<ReturnType<typeof backend.write>>[] = [];
    for (const item of [{ text: "Release checklist: ALPHA_ONLY", goal: "goal-a", object: "file" },
      { text: "Release checklist: BETA_ONLY", goal: "goal-b", object: "document" }]) {
      entries.push(await backend.withCaller(person).write({ scope: "project", owner: project, text: item.text, origin: "person", operation_id: item.goal,
        meta: { kind: "convention", source: "manual", approved_by: { by: "person" }, classification: { scenes: ["coding"], lifecycle: "long-term" },
          applies_when: { plugins: [coding], goals: [item.goal], object_kinds: [item.object] } } }));
    }
    const sessionOwner = { project_id: project, plugin_id: coding, install_id: "coding", actor_id: caller.actor_id };
    const session = await adapter.createSession({ ...sessionOwner, workspace: "none", role_id: "reader", title: "Memory context" });
    const run = async (goal: string, object: string) => {
      const recipe = await service.forRun({ ...caller, work: { work_id: "work-context", title: "Release preparation" } }, { query: "Release checklist", situation: { goal_id: goal, object_kind: object } });
      assert.ok(recipe); assert.equal(recipe.task, true); assert.equal(recipe.skip, false); assert.deepEqual(recipe.pinned, []);
      assert.deepEqual(recipe.facts, { plugins: [coding], goals: [goal], object_kinds: [object] });
      return finished(adapter, await adapter.start({ ...sessionOwner, session, workspace: "none", role_id: "reader", task: "Release checklist", history: "digest",
        role: { role_id: "reader", version: 1, workspace: "none", execution: "read-only", host_tools: [], prompts: [], memory: recipe } }));
    };
    const first = await run("goal-a", "file");
    assert.equal(requests.length, 1); assert.match(requests[0]!, /ALPHA_ONLY/); assert.doesNotMatch(requests[0]!, /BETA_ONLY/);
    const verifyReceipt = (view: AgentRunView, expected: typeof entries[number]) => {
      assert.deepEqual(view.memory_recalled?.injected, [{ memory_id: expected.memory_id, version: expected.version }]);
      const retrievals = view.memory_recalled?.retrievals, retrieval = retrievals?.find(one => one.outcome === "ready");
      assert.ok(retrieval, "the actual SDK retrieval receipt reaches the public Run");
      assert.deepEqual(retrieval.attempts, strategy === "keyword" ? [{ algorithm: "keyword", outcome: "ready" }] : [
        { algorithm: "vector", outcome: "unavailable", error_code: "RUNTIME_MODULE_UNAVAILABLE" },
        { algorithm: "keyword", outcome: "ready", fallback_from: "vector" },
      ], "attempt order, primary failure and explicit fallback survive the original SDK event projection");
      assert.equal(retrieval.error_code, undefined);
      const cost = retrieval.cost; assert.ok(cost, "the SDK's body-free retrieval accounting is retained");
      assert.equal(cost.recaller_calls, 0, "the existing built-in keyword recipe makes no custom recaller call");
      assert.equal(cost.recaller_usage, undefined, "no reported token use is not manufactured as zero");
      assert.deepEqual([cost.directory_entries, cost.directory_enumerations, cost.directory_traversal, cost.metadata_reads, cost.body_reads, cost.records_scanned],
        ["unknown", "unknown", "unknown", "unknown", "unknown", "unknown"], "the production App policy redacts physical storage costs");
      assert.ok(cost.candidates_exposed >= 1); assert.ok(Number.isFinite(cost.elapsed_ms) && cost.elapsed_ms >= 0);
      assert.equal(typeof cost.complete, "boolean");
      assert.ok(!JSON.stringify(retrievals).includes(home) && !JSON.stringify(retrievals).includes(expected.text), "retrieval facts contain neither paths nor memory bodies");
      const contexts = view.memory_recalled?.contexts; assert.equal(contexts?.length, 1);
      assert.equal(contexts![0]!.status, "response-observed"); assert.ok(contexts![0]!.tokens > 0);
      assert.ok(contexts![0]!.tokens <= contexts![0]!.budget_tokens);
      assert.deepEqual(contexts![0]!.references.map(ref => ({ memory_id: ref.memory_id, version: ref.version })),
        [{ memory_id: expected.memory_id, version: expected.version }]);
      assert.ok(contexts![0]!.references.every(ref => ref.receipt_id));
      assert.ok(contexts![0]!.references.some(ref => ref.receipt_id === retrieval.receipt_id), "final Context retains the original retrieval identity");
    };
    verifyReceipt(first, entries[0]!);
    assert.equal(first.memory_recalled?.recording_error, "memory.receipt_unrecorded");
    assert.deepEqual(service.uses({ work_id: "work-context" }), [], "a failed projection does not fabricate saved usage or repeat the model call");
    await adapter.close(); adapter = await open();
    failUsage = false;
    const recovered = await adapter.read(first.ref);
    // The measured recall time belongs to the live run on this machine only: a saved Run does not keep it (Prologue
    // serializeEvents), so the replay is the live view less elapsed_ms, everything else exactly as it was.
    const unmeasured = first.memory_recalled?.retrievals.map(({ cost, ...rest }) => {
      if (!cost) return rest;
      const { elapsed_ms: _measured, ...kept } = cost;
      return { ...rest, cost: kept };
    });
    assert.ok(recovered.memory_recalled?.retrievals.every(item => item.cost?.elapsed_ms === undefined), "a replayed Run carries no measured time");
    assert.deepEqual(recovered.memory_recalled?.retrievals, unmeasured, "Run replay preserves the exact attempts and cost without rerunning retrieval");
    assert.equal(requests.length, 1, "restoring the original receipt does not dispatch another model request");
    assert.equal(recovered.memory_recalled?.recording_error, undefined);
    const firstUse = service.uses({ work_id: "work-context" });
    assert.equal(firstUse.length, 1);
    assert.equal(firstUse[0]!.state, "response-observed"); assert.equal(firstUse[0]!.source, "run-context");
    assert.equal(firstUse[0]!.at, first.started_at); assert.equal(firstUse[0]!.time_basis, "run-start");
    assert.equal(firstUse[0]!.memory_version, entries[0]!.version);
    assert.equal(firstUse[0]!.receipt_id, recovered.memory_recalled!.contexts![0]!.references[0]!.receipt_id);
    assert.equal(firstUse[0]!.evidence_call_id, recovered.memory_recalled!.contexts![0]!.call_id);
    assert.deepEqual(firstUse[0]!.run, first.ref);
    await adapter.read(first.ref);
    assert.deepEqual(service.uses({ work_id: "work-context" }), firstUse, "repeat read preserves the original receipt and round time");
    const second = await run("goal-b", "document");
    assert.equal(requests.length, 2); assert.match(requests[1]!, /BETA_ONLY/); assert.doesNotMatch(requests[1]!, /ALPHA_ONLY/);
    verifyReceipt(second, entries[1]!);
    assert.equal(service.uses({ work_id: "work-context" }).length, 2);
    assert.notEqual(second.ref.run_id, first.ref.run_id);
    const recipe = await service.forRun({ ...caller, work: { work_id: "refused-work", title: "Refused release" } },
      { query: "Release checklist", situation: { goal_id: "goal-a", object_kind: "file" } });
    assert.ok(recipe);
    let finalFenceChecks = 0;
    const refused = await finished(adapter, await adapter.start({ ...sessionOwner, session, workspace: "none", role_id: "reader", task: "Release checklist",
      role: { role_id: "reader", version: 1, workspace: "none", execution: "read-only", host_tools: [], prompts: [], memory: recipe } },
    { beforeDispatch: () => () => { finalFenceChecks++; throw new Error("current dispatch authorization withdrawn"); } }), "failed");
    assert.equal(requests.length, 2, "refusal after Context preparation makes no HTTP request");
    assert.ok(finalFenceChecks > 0, "the same-call closure reaches the final transport check before a not-dispatched receipt");
    assert.ok(refused.memory_recalled?.contexts?.some(context => context.status === "not-dispatched"));
    assert.ok(refused.memory_recalled?.retrievals?.some(one => one.outcome === "ready" && one.attempts?.some(attempt => attempt.algorithm === "keyword" && attempt.outcome === "ready")),
      "ready retrieval remains distinct from the final dispatch refusal");
    assert.deepEqual(refused.memory_recalled?.injected, [], "retrieval ready alone is never projected as delivered memory");
    assert.deepEqual(service.uses({ work_id: "refused-work" }).map(use => [use.memory_id, use.state]), [[entries[0]!.memory_id, "not-dispatched"]]);
    assert.equal(ledger.lastUse(entries[0]!.memory_id)?.run?.run_id, first.ref.run_id, "a refused round cannot replace confirmed recent reference");
    assert.deepEqual((await backend.withCaller(person).list("project", project)).map(row => row.memory_id).sort(), entries.map(row => row.memory_id).sort());
  } finally {
    alive = false; await adapter.close(); ledger.close();
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});

/** The same real Node/HTTP/SQLite App wiring as above, for the cases that only need one Run and its final HTTP body. */
async function runRig(options: { read?: (read: Record<string, unknown>) => Record<string, unknown>; appId?: string; home?: string } = {}) {
  const readPolicy = options.read, ownHome = !options.home;
  const home = options.home ?? await mkdtemp(join(tmpdir(), "molis-memory-run-rig-")), requests: string[] = [];
  const server = createServer(async (request, response) => {
    let body = ""; for await (const chunk of request) body += chunk;
    requests.push(body);
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end('data: {"model":"scripted","choices":[{"index":0,"delta":{"content":"Ready."},"finish_reason":null}]}\n\n'
      + 'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":20,"completion_tokens":2}}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  if (ownHome) {
    const initialOwner = acquireStorageOwner(join(home, "agent-runtime"));
    try { initializeMemoryForgetting({ homeDirectory: home, storageOwner: initialOwner, assertCurrent() {} }); }
    finally { initialOwner.release(); }
  }
  const ledger = openMemoryLedger({ homeDirectory: home });
  if (ownHome) for (const key of ["personal", "project-default"]) ledger.savePrefs(caller.actor_id, key, defaultPrefs(key === "personal" ? "personal" : "project", "reviewed"));
  let alive = true, service!: MemoryService;
  const owner: MemoryRuntimePolicyOwner = { alive: () => alive, forgettingPhase: () => service.forgettingPhase(), prefsFor: (scope, id) => service.prefsFor(caller.actor_id, scope, id),
    owners: id => ledger.owners(id), candidateOwners: id => ledger.candidateOwners(id),
    projectExists: async id => id === project, deletingProject: () => undefined };
  const memory = memoryRuntimePolicy(() => owner), matrix = memory.policy.matrix;
  assert.ok(matrix?.rows);
  const policy = !readPolicy ? memory.policy : { ...memory.policy, matrix: { ...matrix,
    rows: matrix.rows.map((row): typeof row => ({ ...row, read: readPolicy(row.read as never) as typeof row.read })) } };
  const close = async () => {
    alive = false; ledger.close();
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    if (ownHome) await rm(home, { recursive: true, force: true });
  };
  const adapter = await createPrologueNodeAdapter({ app: { appId: options.appId ?? "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "agent-runtime"),
    memoryUsage: receipt => service.settleUses(receipt), memory: { ...memory, policy, promotion: { policy: MEMORY_GATE_POLICY, version: MEMORY_GATE_VERSION,
      decide: (caller, request) => service.promotion.decide(caller, request),
      undo: { prepare: (caller, request) => service.promotion.undo.prepare(caller, request), record: (caller, request) => service.promotion.undo.record(caller, request) } } },
    modelConfiguration: async () => ({ protocol: "openai-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/chat/completions`, model: "scripted", credential_ref: "fixture" }),
    resolveCredential: () => "test-only" }).catch(async error => { await close(); throw error; });
  const backend = prologueMemoryBackend(async () => adapter.memory!);
  service = new MemoryService({ ledger, backend });
  const sessionOwner = { project_id: project, plugin_id: coding, install_id: "coding", actor_id: caller.actor_id };
  const session = await adapter.createSession({ ...sessionOwner, workspace: "none", role_id: "reader", title: "Memory context" });
  return {
    home, requests, service, backend, ledger,
    save: (text: string, meta: Record<string, unknown>) => backend.withCaller(person).write({ scope: "project", owner: project, text, origin: "person", operation_id: text,
      meta: { kind: "convention", source: "manual", approved_by: { by: "person" }, ...meta } as never }),
    start: async (recipe: NonNullable<Awaited<ReturnType<MemoryService["forRun"]>>>, expected = "completed") => finished(adapter, await adapter.start({ ...sessionOwner, session, workspace: "none",
      role_id: "reader", task: "Release checklist", role: { role_id: "reader", version: 1, workspace: "none", execution: "read-only", host_tools: [], prompts: [], memory: recipe } }), expected),
    close: async () => { try { await adapter.close(); } finally { await close(); } },
  };
}

// MEM-06: fallback happens only as the App configured it. With no vector backend installed, a vector policy without a
// fallback, or with a fallback for another reason only, is refused when the runtime is assembled: it never starts and
// quietly answers with keyword instead (the configured "unavailable" fallback, reported attempt by attempt, is the
// vector-fallback case above). The runtime half is the SDK slot's own contract: a failed or timed-out algorithm closes
// its reader without falling back, and fabricated references or replacement bodies are refused (Prologue
// packages/sdk/test/memory-recaller.live.test.ts "closes a failed algorithm's reader without falling back…",
// "does not fallback for normal empty results or a reason excluded by the recipe", "rejects fabricated references and
// replacement bodies", "still rejects fabricated results and version violations with fallback enabled").
test("MEM-06 vector with no fallback, or a fallback for another reason only, is refused at assembly instead of silently using keyword", { timeout: 40_000 }, async () => {
  for (const read of [
    (row: Record<string, unknown>) => { const { fallback: _none, ...rest } = row; return { ...rest, algorithm: "vector" }; },
    (row: Record<string, unknown>) => ({ ...row, algorithm: "vector", fallback: { algorithm: "keyword", on: ["failed"] } }),
  ]) {
    await assert.rejects(runRig({ read }), (error: { code?: string; safeMessage?: string }) =>
      error.code === "RUNTIME_OPTIONS_INVALID" && /recall algorithm vector unavailable/.test(error.safeMessage ?? ""));
  }
});

// MEM-32: a skip scene does no automatic recall and puts no memory in the final Context; the person's explicit recall
// still reads it; a Coding Run never receives an entry classified for the Assistant; and a preference is not pinned into
// every Run: a preference recall selects does arrive (the positive control), one it does not select stays out, and the
// recipe pins nothing. The explicit-only HTTP entry under the manual preset is
// memory-presets.test.ts "manual recall is explicit only…".
test("MEM-32 skip Runs carry no memory in the final HTTP Context, explicit recall still reads, Coding never gets Assistant entries, preferences are not pinned", { timeout: 40_000 }, async () => {
  const rig = await runRig();
  try {
    const coded = await rig.save("Release checklist: CODING_ONLY", { classification: { scenes: ["coding"], lifecycle: "long-term" } });
    await rig.save("Release checklist: ASSISTANT_ONLY", { classification: { scenes: ["assistant"], lifecycle: "long-term" } });
    await rig.save("Indentation: PREFERENCE_ONLY", { kind: "preference", classification: { scenes: ["coding"], lifecycle: "long-term" } });
    const matching = await rig.save("Release checklist: PREFERENCE_MATCH", { kind: "preference", classification: { scenes: ["coding"], lifecycle: "long-term" } });
    const markers = /CODING_ONLY|ASSISTANT_ONLY|PREFERENCE_ONLY|PREFERENCE_MATCH/;
    const skipped = await rig.service.forRun({ ...caller, work: { work_id: "skip", title: "Release" } }, { query: "Release checklist" }, { skip: true });
    assert.ok(skipped); assert.equal(skipped.skip, true); assert.equal(skipped.task, false); assert.deepEqual(skipped.pinned, []);
    const quiet = await rig.start(skipped);
    assert.equal(rig.requests.length, 1); assert.doesNotMatch(rig.requests[0]!, markers);
    assert.deepEqual(quiet.memory_recalled?.injected ?? [], []);
    assert.deepEqual(quiet.memory_recalled?.retrievals.map(({ receipt_id: _id, ...rest }) => rest), [{ outcome: "skip" }],
      "a skip Run attempts no algorithm and scans nothing");
    assert.deepEqual(quiet.memory_recalled?.selected, []);
    assert.deepEqual(quiet.memory_recalled?.contexts?.map(context => [context.status, context.tokens, context.references.length]), [["response-observed", 0, 0]],
      "the final Context the model saw holds no memory");
    assert.deepEqual(rig.service.uses({ work_id: "skip" }), []);
    const explicit = await rig.service.recall(person, { query: "Release checklist" });
    assert.ok(explicit.items.some(item => item.memory_id === coded.memory_id), "explicit recall is still readable while the Run skipped");
    const automatic = await rig.service.forRun({ ...caller, work: { work_id: "auto", title: "Release" } }, { query: "Release checklist" });
    assert.ok(automatic); assert.equal(automatic.task, true); assert.deepEqual(automatic.pinned, [], "no preference is pinned into every Run");
    const view = await rig.start(automatic);
    assert.equal(rig.requests.length, 2);
    assert.match(rig.requests[1]!, /CODING_ONLY/);
    assert.doesNotMatch(rig.requests[1]!, /ASSISTANT_ONLY/, "the Coding scene never receives an Assistant entry");
    assert.match(rig.requests[1]!, /PREFERENCE_MATCH/, "a preference recall selects does reach the Context, so the next line is not vacuous");
    assert.doesNotMatch(rig.requests[1]!, /PREFERENCE_ONLY/, "a preference the recall did not select stays out of the Context");
    assert.deepEqual(view.memory_recalled?.injected.map(one => one.memory_id).sort(), [coded.memory_id, matching.memory_id].sort());
  } finally { await rig.close(); }
});

// MEM-25: one entry classified for two scenes is the same reference in both, with no copied body; Molis's own authority
// refuses an App that is not Molis on the same storage (it answers no for any other App id, so this part proves Molis's
// gate, not the SDK's isolation); Molis's classes are unchanged when it reopens. The SDK's own cross-App isolation, each
// App's own taxonomy and kinds the SDK does not rewrite, is Prologue packages/sdk/test/memory-access.live.test.ts
// "并行场景视图固定身份；分类跨重启保存且不同 App 隔离" (an App with another taxonomy and its own permissive authority).
test("MEM-25 two scenes share one reference without copies, and Molis's authority refuses another App on the same storage", { timeout: 40_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-two-apps-"));
  try {
    const owner = acquireStorageOwner(join(home, "agent-runtime"));
    try { initializeMemoryForgetting({ homeDirectory: home, storageOwner: owner, assertCurrent() {} }); } finally { owner.release(); }
    const seed = openMemoryLedger({ homeDirectory: home });
    for (const key of ["personal", "project-default"]) seed.savePrefs(caller.actor_id, key, defaultPrefs(key === "personal" ? "personal" : "project", "reviewed"));
    seed.close();
    const molis = await runRig({ home });
    let shared: Awaited<ReturnType<typeof molis.save>>;
    try {
      shared = await molis.save("Release checklist: SHARED_ONLY", { classification: { scenes: ["coding", "assistant"], lifecycle: "long-term" } });
      const assistant = { actor_id: caller.actor_id, project_id: project, consumer: "assistant", current_scene: "assistant", purpose: "task" } as const;
      const fromCoding = await molis.service.recall(caller, { query: "Release checklist" });
      const fromAssistant = await molis.service.recall(assistant, { query: "Release checklist" });
      assert.deepEqual(fromCoding.items.map(item => item.memory_id), [shared.memory_id]);
      assert.deepEqual(fromAssistant.items.map(item => item.memory_id), [shared.memory_id], "both scenes read the one reference");
      assert.equal((await molis.backend.withCaller(person).list("project", project)).length, 1, "no per-scene copy is stored");
    } finally { await molis.close(); }
    const other = await runRig({ home, appId: "io.example.notes" });
    try {
      assert.deepEqual(await other.backend.withCaller(person).list("project", project), [], "Molis's authority shows another App nothing");
      await assert.rejects(other.save("Release checklist: OTHER_APP", { classification: { scenes: ["coding"], lifecycle: "long-term" } }), { code: "MEMORY_SCOPE_DENIED" });
    } finally { await other.close(); }
    const again = await runRig({ home });
    try {
      const rows = await again.backend.withCaller(person).list("project", project);
      assert.deepEqual(rows.map(row => [row.memory_id, row.meta.classification]), [[shared.memory_id, { scenes: ["coding", "assistant"], lifecycle: "long-term" }]]);
    } finally { await again.close(); }
  } finally { await rm(home, { recursive: true, force: true }); }
});
