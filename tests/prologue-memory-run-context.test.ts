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
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
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
for (const history of ["digest", "session"] as const) test(`trusted ${history} Run facts and source presentation survive Session reopen`, { timeout: 40_000 }, async () => {
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
  const ledger = openMemoryLedger({ homeDirectory: home });
  for (const key of ["personal", "project-default"]) ledger.savePrefs(caller.actor_id, key, defaultPrefs(key === "personal" ? "personal" : "project", "reviewed"));
  let alive = true, service!: MemoryService, failUsage = true;
  let legacyDescription = true;
  const originalSource = "Legacy source description: follow the old release convention";
  const owner: MemoryRuntimePolicyOwner = { alive: () => alive, prefsFor: (scope, id) => service.prefsFor(caller.actor_id, scope, id),
    owners: id => ledger.owners(id), candidateOwners: id => ledger.candidateOwners(id),
    projectExists: async id => id === project, deletingProject: () => undefined };
  const open = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "agent-runtime"),
    memoryUsage: receipt => { if (failUsage) throw new Error("isolated ledger fault"); service.settleUses(receipt); },
    memory: { ...memoryRuntimePolicy(() => owner), ...(legacyDescription ? { modelOrigin: "description" as const } : {}), promotion: { policy: MEMORY_GATE_POLICY, version: MEMORY_GATE_VERSION,
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
      entries.push(await backend.withCaller(person).write({ scope: "project", owner: project, text: item.text, origin: originalSource, operation_id: item.goal,
        meta: { kind: "convention", source: "manual", approved_by: { by: "person" }, classification: { scenes: ["coding"], lifecycle: "long-term" },
          applies_when: { plugins: [coding], goals: [item.goal], object_kinds: [item.object] } } }));
    }
    const sessionOwner = { project_id: project, plugin_id: coding, install_id: "coding", actor_id: caller.actor_id };
    const session = await adapter.createSession({ ...sessionOwner, workspace: "none", role_id: "reader", title: "Memory context" });
    const run = async (goal: string, object: string) => {
      const recipe = await service.forRun({ ...caller, work: { work_id: "work-context", title: "Release preparation" } }, { query: "Release checklist", situation: { goal_id: goal, object_kind: object } });
      assert.ok(recipe); assert.equal(recipe.task, true); assert.equal(recipe.skip, false); assert.deepEqual(recipe.pinned, []);
      assert.deepEqual(recipe.facts, { plugins: [coding], goals: [goal], object_kinds: [object] });
      return finished(adapter, await adapter.start({ ...sessionOwner, session, workspace: "none", role_id: "reader", task: "Release checklist", history,
        role: { role_id: "reader", version: 1, workspace: "none", execution: "read-only", host_tools: [], prompts: [], memory: recipe } }));
    };
    const first = await run("goal-a", "file");
    assert.equal(requests.length, 1); assert.match(requests[0]!, /ALPHA_ONLY/); assert.doesNotMatch(requests[0]!, /BETA_ONLY/);
    const verifyReceipt = (view: AgentRunView, expected: typeof entries[number]) => {
      assert.deepEqual(view.memory_recalled?.injected, [{ memory_id: expected.memory_id, version: expected.version }]);
      const contexts = view.memory_recalled?.contexts; assert.equal(contexts?.length, 1);
      assert.equal(contexts![0]!.status, "response-observed"); assert.ok(contexts![0]!.tokens > 0);
      assert.ok(contexts![0]!.tokens <= contexts![0]!.budget_tokens);
      assert.deepEqual(contexts![0]!.references.map(ref => ({ memory_id: ref.memory_id, version: ref.version })),
        [{ memory_id: expected.memory_id, version: expected.version }]);
      assert.ok(contexts![0]!.references.every(ref => ref.receipt_id));
    };
    verifyReceipt(first, entries[0]!);
    assert.ok(requests[0]!.includes(originalSource), "the old configuration actually sent the source description");
    assert.equal(first.memory_recalled?.recording_error, "memory.receipt_unrecorded");
    assert.deepEqual(service.uses({ work_id: "work-context" }), [], "a failed projection does not fabricate saved usage or repeat the model call");
    await adapter.close(); legacyDescription = false; adapter = await open();
    failUsage = false;
    const recovered = await adapter.read(first.ref);
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
    assert.ok(!requests[1]!.includes(originalSource), "reopening the existing Session with the production policy projects the current memory source");
    const secondWire = JSON.parse(requests[1]!) as { messages: { content: unknown }[] };
    const memoryWrappers = secondWire.messages.flatMap(({ content }) => typeof content === "string" && content.startsWith("Untrusted context data.")
      ? [JSON.parse(content.slice(content.indexOf("\n") + 1)) as { source: string; origin: string; text: string }] : []).filter(one => one.source === "memory-recall");
    assert.deepEqual(memoryWrappers, [{ source: "memory-recall", origin: "memory", text: "Release checklist: BETA_ONLY" }]);
    assert.ok((await backend.withCaller(person).list("project", project)).every(entry => entry.origin === originalSource), "the stored source description remains available to management");
    assert.equal(service.uses({ work_id: "work-context" }).length, 2);
    assert.notEqual(second.ref.run_id, first.ref.run_id);
    const recipe = await service.forRun({ ...caller, work: { work_id: "refused-work", title: "Refused release" } },
      { query: "Release checklist", situation: { goal_id: "goal-a", object_kind: "file" } });
    assert.ok(recipe);
    const refused = await finished(adapter, await adapter.start({ ...sessionOwner, session, workspace: "none", role_id: "reader", task: "Release checklist",
      role: { role_id: "reader", version: 1, workspace: "none", execution: "read-only", host_tools: [], prompts: [], memory: recipe } },
    { beforeDispatch: () => { throw new Error("current dispatch authorization withdrawn"); } }), "failed");
    assert.equal(requests.length, 2, "refusal after Context preparation makes no HTTP request");
    assert.ok(refused.memory_recalled?.contexts?.some(context => context.status === "not-dispatched"));
    assert.deepEqual(service.uses({ work_id: "refused-work" }).map(use => [use.memory_id, use.state]), [[entries[0]!.memory_id, "not-dispatched"]]);
    assert.equal(ledger.lastUse(entries[0]!.memory_id)?.run?.run_id, first.ref.run_id, "a refused round cannot replace confirmed recent reference");
    assert.deepEqual((await backend.withCaller(person).list("project", project)).map(row => row.memory_id).sort(), entries.map(row => row.memory_id).sort());
  } finally {
    alive = false; await adapter.close(); ledger.close();
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});
