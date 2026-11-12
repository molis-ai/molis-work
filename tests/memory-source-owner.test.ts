import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { memoryRuntimePolicy, memorySources, memoryExtractor, hostTextGeneration, prologueMemoryBackend, ensureSystemAgentService, withConnectorConnections, type MemorySourceOwner } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MemoryService, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { acquireStorageOwner, initializeMemoryForgetting, openMemoryLedger, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentMemoryCaller, AgentMemoryMeta, AgentMemorySourceRef, AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";
import { untilSetup } from "./fixtures/connector-assistant-model.js";
import { openTestHome } from "./fixtures/test-home.js";
import { endingReviewAnswer } from "./fixtures/ending-review.js";

const actor = LOCAL_PERSON_ACTOR_ID, coding = "io.molis.work.coding", project = "source-project";
const sourceRef = (session: string, input: string, kind = "original"): AgentMemorySourceRef => ({
  event_id: "molis-input:1:" + JSON.stringify([actor, session, kind, input]), version: "1",
});
const meta: AgentMemoryMeta = { kind: "preference", classification: { scenes: ["coding"], lifecycle: "long-term" }, basis: "explicit" };
const personDecision = (caller: AgentMemoryCaller) => ({ ...caller, consumer: "assistant" as const, current_scene: "assistant" as const,
  person: true, purpose: "management" as const, source_use: undefined });

function formationReply(body: { messages: Array<{ content: string | Array<{ type: string; text?: string }> }> }) {
  const content = body.messages.at(-1)!.content;
  const prompt = typeof content === "string" ? content : content.filter(block => block.type === "text").map(block => block.text).join("\n");
  const data = JSON.parse(prompt.slice(prompt.lastIndexOf("\n\n") + 2)) as {
    sources: Array<{ id: string; text: string }>;
    destinations: Array<{ scope: string; replacement?: string; slots: Record<string, string> }>;
  };
  const slot = data.destinations.find(destination => destination.scope === "user" && !destination.replacement)?.slots.preference;
  assert.ok(slot, "Coding's current permission supplies a personal preference slot");
  assert.equal(data.sources.length, 1, "continuation never manufactures a second original");
  const source = data.sources[0]!;
  return cogniaScriptedResponse(undefined, JSON.stringify({ drafts: [{ slot_id: slot, text: source.text,
    suggested_basis: "explicit", evidence: [{ source_id: source.id, quote: source.text }] }] }));
}

async function localModel(t: test.TestContext, response: (turn: number) => Response | Promise<Response>) {
  let calls = 0, formationCalls = 0;
  const server = createServer(async (request, reply) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const review = endingReviewAnswer(body, () => []);
    const result = request.url?.startsWith("/formation/") ? (formationCalls++, formationReply(body))
      : review === undefined ? await response(++calls) : cogniaScriptedResponse(undefined, review);
    reply.writeHead(result.status, { "content-type": "text/event-stream" }); reply.end(await result.text());
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  return { base: `http://127.0.0.1:${address.port}`, get calls() { return calls; }, get formationCalls() { return formationCalls; } };
}

/** Actual Node/SQLite and loopback model; only the Host's mutable installation grant is a supplied dependency. */
async function sourceHome(t: test.TestContext, response: (turn: number) => Response | Promise<Response> = () => cogniaScriptedResponse(undefined, "完成。")) {
  const home = await mkdtemp(join(tmpdir(), "memory-source-owner-"));
  const model = await localModel(t, response);
  const storageOwner = acquireStorageOwner(join(home, "agent-runtime"));
  initializeMemoryForgetting({ homeDirectory: home, storageOwner, assertCurrent() {} });
  await writeFile(join(home, "read.txt"), "read-only fixture");
  let ledger = openMemoryLedger({ homeDirectory: home, storageOwner });
  let service: MemoryService, adapter!: Awaited<ReturnType<typeof createPrologueNodeAdapter>>, alive = true, contextTokens: number | undefined;
  let installed: MemorySourceOwner["sessionAllowed"] = async () => true;
  let afterSourceRead: (() => Promise<void>) | undefined;
  let afterSourceCheck: (() => void) | undefined;
  const policy: MemorySourceOwner["policy"] = { alive: () => alive,
    prefsFor: (scope, id) => service.prefsFor(actor, scope, id), owners: id => ledger.owners(id), candidateOwners: id => ledger.candidateOwners(id),
    forgettingPhase: () => service.forgettingPhase(),
    projectExists: async id => id === project || id === "second-project", deletingProject: () => undefined };
  const sources = memorySources(home, () => alive ? { adapter, policy, sessionAllowed: owner => installed(owner),
    sourceAllowed: (id, scope, owner, refs) => service.sourceAllowed(id, scope, owner, refs) } : undefined);
  const generate = hostTextGeneration({ homeDirectory: home, resolveInference: async () => adapter.inference,
    env: { MOLIS_WORK_TEXT_API_KEY: "fixture-loopback-only", MOLIS_WORK_TEXT_BASE_URL: model.base + "/formation/v1", MOLIS_WORK_TEXT_MODEL: "fixture" } });
  assert.ok(generate);
  const open = async () => {
    adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "agent-runtime"), storageOwner,
      memory: { ...memoryRuntimePolicy(() => policy, memoryExtractor(home, () => generate)), sources: { ...sources, check: async (caller, request) => { const result = await sources.check(caller, request); afterSourceCheck?.(); return result; }, resolve: async (caller, request) => { const result = await sources.resolve(caller, request); await afterSourceRead?.(); return result; } }, promotion: { policy: "memory.write-gate", version: 1,
        decide: (caller, request) => service.promotion.decide(caller, request), undo: {
          prepare: (caller, request) => service.promotion.undo.prepare(caller, request), record: (caller, request) => service.promotion.undo.record(caller, request) } } },
      modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: model.base + "/v1/messages", model: "fixture", credential_ref: "fixture",
        ...(contextTokens === undefined ? {} : { context_tokens: contextTokens }) }),
      resolveCredential: () => "fixture-loopback-only" });
    service = new MemoryService({ backend: prologueMemoryBackend(async () => adapter.memory!), ledger, timeZone: "UTC" });
  };
  await open();
  t.after(async () => { alive = false; await adapter.close(); ledger.close(); storageOwner.release(); await rm(home, { recursive: true, force: true }); });
  const owner = { actor_id: actor, project_id: project, plugin_id: coding, install_id: "actual-test-install" };
  const directory = { canonical_path: home, realpath_verified: true };
  const session = await adapter.createSession({ ...owner, directory, title: "Canonical sources" });
  let caller: AgentMemoryCaller = { actor_id: actor, project_id: project, plugin_id: coding, consumer: "agent", session_id: session.session_id,
    current_scene: "coding", purpose: "management", source_use: "learning" };
  const start = async (text: string, extra: { continued_from?: AgentRunRef; original_input?: { input_id: string; text: string; written_by: "person" | "host"; occurred_at: string } } = {}) => {
    const memory = await service.forRun({ actor_id: actor, project_id: project, plugin_id: coding, consumer: "agent" }, { query: text });
    const run = await adapter.start({ ...owner, directory, session, task: text, role_id: "reader", queued: "carry", ...extra,
      role: { role_id: "reader", version: 1, execution: "read-only", prompts: [], host_tools: ["read-file"], memory } });
    caller = { ...caller, class_restrictions: (await adapter.read(run.ref)).class_restrictions };
    return run;
  };
  const request = (refs: AgentMemorySourceRef[]) => ({ app_id: "io.molis.work", target: { scope: "user" as const, owner: actor }, refs });
  const completed = (run: AgentRunRef) => untilSetup(async () => { const view = await adapter.read(run); return view.phase === "completed" ? view : undefined; }, "real source Run completion");
  const propose = (ref: AgentMemorySourceRef, bound = caller) => adapter.memory!.withCaller(bound).candidates.propose({ scope: "user", owner: actor,
    text: "回答请保留步骤", origin: "source owner contract", meta, sources: [ref], expected_version: 0, operation_id: randomUUID() });
  return { home, session, get caller() { return caller; }, sources, request, start, completed, propose, policy,
    get service() { return service; }, get adapter() { return adapter; }, get calls() { return model.calls; },
    get formationCalls() { return model.formationCalls; },
    installation(check: typeof installed) { installed = check; },
    afterSourceRead(check: typeof afterSourceRead) { afterSourceRead = check; },
    afterSourceCheck(check: typeof afterSourceCheck) { afterSourceCheck = check; },
    contextWindow(tokens: number | undefined) { contextTokens = tokens; },
    async reopen() { await adapter.close(); ledger.close(); ledger = openMemoryLedger({ homeDirectory: home, storageOwner }); await open(); },
  };
}

test("MEM-35: a canonical original stays one source across continuation/restart and cannot be routed to another owner", { timeout: 60_000 }, async t => {
  const f = await sourceHome(t), text = "以后回答请保留步骤", id = randomUUID(), occurred_at = new Date().toISOString();
  const first = await f.start(text, { original_input: { input_id: id, text, written_by: "person", occurred_at } }); await f.completed(first.ref);
  const ref = sourceRef(f.session.session_id, id), snapshots = await f.sources.resolve(f.caller, f.request([ref]));
  assert.deepEqual(snapshots, [{ ...ref, speaker: { kind: "person", id: actor }, derivation: "original", occurred_at_ms: Date.parse(occurred_at), text }]);
  const candidate = await f.propose(ref); assert.deepEqual(candidate.sources, [{ ...ref, speaker: { kind: "person", id: actor },
    derivation: "original", occurred_at_ms: Date.parse(occurred_at) }]);
  const next = await f.start("Host continuation", { continued_from: first.ref }); await f.completed(next.ref);
  assert.deepEqual((await f.adapter.readOriginalInput!({ session_id: f.session.session_id, input_id: id, version: 1 }))?.accepted_run, first.ref);
  assert.deepEqual(await f.sources.resolve(f.caller, f.request([ref])), snapshots);
  const person: MemoryCaller = { actor_id: actor, project_id: project, consumer: "ui", person: true };
  const checking = Promise.withResolvers<void>(), resume = Promise.withResolvers<void>(); t.after(() => resume.resolve()); let checked = 0;
  f.installation(async () => { if (++checked === 2) { checking.resolve(); await resume.promise; } return true; });
  const beforePreferenceChange = f.sources.resolve(f.caller, f.request([ref])); await checking.promise;
  f.service.savePrefs(person, "project", { learn_from_work: false });
  resume.resolve();
  assert.deepEqual(await beforePreferenceChange, [], "personal learning rechecks the original project's formation choice after awaiting its installation owner");
  f.installation(async () => true);
  assert.equal((await f.sources.resolve({ ...f.caller, source_use: "explicit" }, f.request([ref]))).length, 1, "explicit save is independent from automatic learning");
  f.service.savePrefs(person, "project", { learn_from_work: true });
  const learning: MemoryCaller = { ...f.caller, consumer: "agent", operation_id: "first-learning" };
  const input = { said: [text], sources: snapshots } satisfies Parameters<MemoryService["learnFromWork"]>[1];
  const firstLearning = await f.service.learnFromWork(learning, input);
  assert.equal(firstLearning.formation.outcome, "completed"); assert.equal(firstLearning.formation.extraction.calls, 1);
  assert.equal(f.formationCalls, 1, "the production extractor dispatched through the actual local HTTP model");
  assert.equal(firstLearning.recording_error, undefined); assert.equal(firstLearning.learned[0]?.outcome, "candidate");
  const pending = await f.service.candidates(person, { scope: "personal" });
  assert.equal(pending.length, 1, "the direct SDK proposal has no App note; actual form records its own candidate");
  assert.equal(pending[0]!.candidate_id, firstLearning.learned[0]!.candidate_id);
  assert.notEqual(pending[0]!.candidate_id, candidate.candidate_id);
  assert.equal(pending[0]!.basis, "explicit");
  const rawCandidates = () => f.adapter.memory!.withCaller({ ...f.caller, consumer: "ui", person: true }).candidates.list("user", actor);
  const before = await rawCandidates(); assert.equal(before.length, 2);
  assert.deepEqual(before.find(entry => entry.candidate_id === pending[0]!.candidate_id)!.sources, candidate.sources);
  const unchanged = async (operation_id: string) => {
    const result = await f.service.learnFromWork({ ...learning, operation_id }, input);
    assert.equal(result.formation.outcome, "completed"); assert.equal(result.formation.extraction.calls, 1);
    assert.equal(result.recording_error, undefined);
    assert.deepEqual(result.formation.items, [], "the extractor removes the already represented original before SDK writes");
    assert.deepEqual(result.learned, [], "another Run using the same original does not add independent evidence");
    assert.deepEqual(await rawCandidates(), before, "candidate identities, versions and original sources stay unchanged");
    assert.deepEqual(await f.service.candidates(person, { scope: "personal" }), pending);
    assert.deepEqual(await f.adapter.memory!.withCaller({ ...f.caller, consumer: "ui", person: true }).list("user", actor), []);
  };
  await unchanged("continued-learning");
  await f.reopen();
  await unchanged("restarted-learning");
  assert.equal(f.formationCalls, 3, "each invocation may extract again, but the same original never adds evidence or writes");
  assert.deepEqual(await f.sources.resolve(f.caller, f.request([ref])), snapshots);
  assert.deepEqual(await f.sources.resolve({ ...f.caller, actor_id: "another-person" }, f.request([ref])), []);
  assert.deepEqual(await f.sources.resolve(f.caller, { ...f.request([ref]), target: { scope: "project", owner: "second-project" } }), []);
  assert.deepEqual(await f.sources.resolve(f.caller, f.request([sourceRef(f.session.session_id, "unknown")])), []);
});

for (const boundary of ["project", "installation"] as const) test(`MEM-35: a personal candidate cannot borrow another Coding ${boundary}'s original`, { timeout: 60_000 }, async t => {
  const f = await sourceHome(t), text = "以后回答请保留步骤", id = randomUUID();
  const run = await f.start(text, { original_input: { input_id: id, text, written_by: "person", occurred_at: new Date().toISOString() } });
  await f.completed(run.ref);
  const ref = sourceRef(f.session.session_id, id);
  assert.equal((await f.sources.resolve(f.caller, f.request([ref])))[0]?.text, text, "the original is valid for its own Coding owner");
  const otherOwner = { actor_id: actor, project_id: boundary === "project" ? "second-project" : project,
    plugin_id: coding, install_id: boundary === "installation" ? "another-test-install" : "actual-test-install" };
  const other = await f.adapter.createSession({ ...otherOwner, role_id: "reader", workspace: "none", title: "Another Coding owner" });
  const caller = { ...f.caller, project_id: otherOwner.project_id, session_id: other.session_id };
  await assert.rejects(f.propose(ref, caller), { code: "MEMORY_NOT_ACCEPTED" }, "personal scope is not permission to use a different Coding owner's source");
  assert.deepEqual(await f.sources.resolve(caller, f.request([ref])), []);
  assert.deepEqual(await f.sources.resolve({ ...f.caller, session_id: undefined }, f.request([ref])), [], "Coding source reads require the current caller's Session");
  assert.deepEqual(await f.sources.resolve({ ...caller, project_id: boundary === "project" ? project : "second-project" }, f.request([ref])), [], "the caller's project must agree with its persistent Session owner");
  assert.deepEqual(await f.adapter.memory!.withCaller({ ...f.caller, consumer: "ui", person: true }).candidates.list("user", actor), [], "denial persists no candidate");
  const person = { ...caller, consumer: "ui", person: true, session_id: undefined };
  assert.equal((await f.sources.resolve(person, f.request([ref])))[0]?.text, text, "the person's existing personal management scope is unchanged");
});

test("MEM-35: failed originals use the latest accepted direct retry; derived completion cannot wash a failed or cancelled source", { timeout: 60_000 }, async t => {
  const held = Promise.withResolvers<void>(); t.after(() => held.resolve());
  const f = await sourceHome(t, async turn => {
    if (turn === 1 || turn === 4) return Response.json({ type: "error", error: { type: "invalid_request_error", message: "controlled failure" } }, { status: 400 });
    if (turn === 6) await held.promise;
    return cogniaScriptedResponse(undefined, "完成。");
  });
  const text = "以后回答请保留步骤", original = { input_id: randomUUID(), text, written_by: "person" as const, occurred_at: new Date().toISOString() };
  const originalRef = { session_id: f.session.session_id, input_id: original.input_id, version: 1 as const }, ref = sourceRef(f.session.session_id, original.input_id);
  const terminal = (run: AgentRunRef, phase: string) => untilSetup(async () => { const view = await f.adapter.read(run); return view.phase === phase ? view : undefined; }, phase);
  const first = await f.start(text, { original_input: original }); const failed = await terminal(first.ref, "failed");
  const derived = await f.start("Host continuation", { continued_from: first.ref }); await f.completed(derived.ref);
  assert.deepEqual((await f.adapter.readOriginalInput!(originalRef))?.accepted_run, first.ref);
  assert.deepEqual(await f.sources.resolve(f.caller, f.request([ref])), []);
  const retry = await f.start(text, { original_input: { ...original, occurred_at: new Date(Date.parse(original.occurred_at) + 10_000).toISOString() } });
  const completed = await f.completed(retry.ref); assert.deepEqual(completed.original_input, failed.original_input);
  assert.deepEqual((await f.adapter.readOriginalInput!(originalRef))?.accepted_run, retry.ref);
  assert.equal((await f.sources.resolve(f.caller, f.request([ref])))[0]?.occurred_at_ms, Date.parse(original.occurred_at));
  await f.reopen(); assert.deepEqual((await f.adapter.readOriginalInput!(originalRef))?.accepted_run, retry.ref);
  assert.equal((await f.sources.resolve(f.caller, f.request([ref]))).length, 1);
  const later = await f.start(text, { original_input: original }); await terminal(later.ref, "failed");
  const afterFailure = await f.start("Derived completion", { continued_from: later.ref }); await f.completed(afterFailure.ref);
  assert.deepEqual((await f.adapter.readOriginalInput!(originalRef))?.accepted_run, later.ref);
  assert.deepEqual(await f.sources.resolve(f.caller, f.request([ref])), []);
  const cancelled = await f.start(text, { original_input: original });
  await untilSetup(async () => f.calls === 6 ? true : undefined, "latest direct attempt reached the local server");
  await f.adapter.control(cancelled.ref, { kind: "cancel" }); held.resolve(); await terminal(cancelled.ref, "cancelled");
  const afterCancel = await f.start("Derived after cancellation", { continued_from: cancelled.ref }); await f.completed(afterCancel.ref);
  assert.deepEqual((await f.adapter.readOriginalInput!(originalRef))?.accepted_run, cancelled.ref);
  assert.deepEqual(await f.sources.resolve(f.caller, f.request([ref])), []);
  assert.deepEqual(await f.sources.resolve(personDecision(f.caller), f.request([ref])), [], "a person cannot accept a cancelled original as a failed source");
});

test("MEM-35: the person accepts an existing failed-original candidate with automatic formation off and retains it after reopening", { timeout: 60_000 }, async t => {
  const reply = Promise.withResolvers<void>(); t.after(() => reply.resolve());
  const f = await sourceHome(t, async () => {
    await reply.promise;
    return Response.json({ type: "error", error: { type: "invalid_request_error", message: "controlled source failure after proposal" } }, { status: 400 });
  });
  const text = "以后回答请保留步骤", id = randomUUID(), occurred_at = new Date().toISOString();
  const run = await f.start(text, { original_input: { input_id: id, text, written_by: "person", occurred_at } });
  await untilSetup(async () => f.calls ? true : undefined, "source Run is waiting on its actual model request");
  const ref = sourceRef(f.session.session_id, id), human = personDecision(f.caller);
  assert.deepEqual(await f.sources.resolve(human, f.request([ref])), [], "the manual decision does not admit a running source");
  const candidate = await f.service.propose({ ...f.caller, consumer: "agent", source_use: "explicit", operation_id: "propose-before-source-failure" },
    { scope: "personal", text, kind: "preference", basis: "explicit", why: "The person's persisted original", from: "gate" },
    { sources: [ref], classificationMeta: meta });
  assert.equal(candidate.state, "pending");
  const canonical = (await f.adapter.memory!.withCaller(human).candidates.list("user", actor)).find(item => item.candidate_id === candidate.candidate_id)!;
  assert.ok(canonical); assert.equal(canonical.version, candidate.version);
  assert.deepEqual(canonical.sources, [{ ...ref, speaker: { kind: "person", id: actor }, derivation: "original", occurred_at_ms: Date.parse(occurred_at) }]);
  reply.resolve();
  await untilSetup(async () => (await f.adapter.read(run.ref)).phase === "failed" ? true : undefined, "real source Run failure");
  assert.deepEqual((await f.adapter.readOriginalInput!({ session_id: f.session.session_id, input_id: id, version: 1 }))?.accepted_run, run.ref);
  for (const bound of [{ ...human, person: false }, { ...human, source_use: "learning" as const }, { ...human, source_use: "explicit" as const },
    { ...human, purpose: "task" as const }]) assert.deepEqual(await f.sources.resolve(bound, f.request([ref])), [], "failed originals are not an automatic or explicit-tool source");
  await assert.rejects(f.service.accept({ ...human, person: false }, candidate.candidate_id), { code: "memory.forbidden" });

  for (const scope of ["personal", "project"] as const) {
    const prefs = f.service.prefs(human, scope).prefs;
    f.service.savePrefs(human, scope, { ...prefs, form: false, auto: false, learn_from_work: false, learn_from_ui: false,
      consumers: { ...prefs.consumers, assistant: false, agent: false, plugin: false } });
  }
  assert.equal((await f.sources.resolve(human, f.request([ref])))[0]?.text, text, "manual acceptance remains separate from automatic and source-consumer switches");
  for (const scope of ["personal", "project"] as const) {
    f.service.savePrefs(human, scope, { enabled: false });
    assert.deepEqual(await f.sources.resolve(human, f.request([ref])), [], "both the target and original project must still be enabled");
    f.service.savePrefs(human, scope, { enabled: true });
  }
  let checks = 0;
  f.installation(async () => ++checks < 2);
  await assert.rejects(f.service.accept({ ...human, operation_id: "accept-with-revoked-source-install" }, candidate.candidate_id,
    { expected_version: candidate.version }), { code: "MEMORY_NOT_ACCEPTED" });
  assert.equal(checks, 2, "the current installation refusal is reached after the initial source lookup");
  f.installation(async () => true);
  const pending = (await f.adapter.memory!.withCaller(human).candidates.list("user", actor)).find(item => item.candidate_id === candidate.candidate_id)!;
  assert.equal(pending.state, "pending"); assert.equal(pending.version, candidate.version); assert.deepEqual(pending.sources, canonical.sources);
  assert.deepEqual((await f.service.list(human, { scope: "personal" })).items, [], "a refused candidate decision creates no formal memory");
  const accepted = await f.service.accept({ ...human, operation_id: "accept-existing-failed-source" }, candidate.candidate_id,
    { expected_version: candidate.version });
  assert.equal(accepted.candidate.candidate_id, candidate.candidate_id); assert.equal(accepted.candidate.state, "accepted");
  assert.ok(accepted.memory); assert.equal(accepted.memory.text, text);
  await f.reopen();
  const items = (await f.service.list(human, { scope: "personal" })).items;
  assert.equal(items.length, 1); assert.equal(items[0]!.memory_id, accepted.memory.memory_id); assert.equal(items[0]!.text, text);
  const reopened = (await f.adapter.memory!.withCaller(human).candidates.list("user", actor)).find(item => item.candidate_id === candidate.candidate_id)!;
  assert.equal(reopened.state, "accepted"); assert.equal(reopened.memory_id, accepted.memory.memory_id);
  assert.deepEqual(reopened.sources, canonical.sources);
  for (const scope of ["personal", "project"] as const) {
    const prefs = f.service.prefs(human, scope).prefs;
    assert.equal(prefs.form, false); assert.equal(prefs.learn_from_work, false); assert.equal(prefs.consumers.agent, false); assert.equal(prefs.consumers.assistant, false);
  }
});

test("MEM-35: a refused start with no Run does not hide the same original's later accepted retry", { timeout: 60_000 }, async t => {
  const f = await sourceHome(t), text = "以后回答请保留完整步骤。".repeat(1000);
  const original = { input_id: randomUUID(), text, written_by: "person" as const, occurred_at: new Date().toISOString() };
  const ref = { session_id: f.session.session_id, input_id: original.input_id, version: 1 as const };
  f.contextWindow(100);
  await assert.rejects(f.start(text, { original_input: original }), { code: "CONTEXT_BUDGET_EXCEEDED" });
  assert.equal(f.calls, 0); assert.equal(await f.adapter.readOriginalInput!(ref), undefined);
  assert.deepEqual((await f.adapter.readSession(f.session)).runs, [], "context refusal creates no SDK Run");
  f.contextWindow(undefined);
  const retry = await f.start(text, { original_input: { ...original, occurred_at: new Date(Date.parse(original.occurred_at) + 10_000).toISOString() } });
  const completed = await f.completed(retry.ref);
  assert.equal(completed.original_input?.occurred_at, original.occurred_at, "the refusal retained the original's first time");
  assert.deepEqual((await f.adapter.readOriginalInput!(ref))?.accepted_run, retry.ref);
  await f.reopen(); assert.deepEqual((await f.adapter.readOriginalInput!(ref))?.accepted_run, retry.ref);
  assert.equal((await f.sources.resolve(f.caller, f.request([sourceRef(f.session.session_id, original.input_id)])))[0]?.text, text);
});

test("MEM-35: a Run cancelled during source authorization cannot persist a candidate, and an aborted query does no owner lookup", { timeout: 60_000 }, async t => {
  const response = Promise.withResolvers<void>(); t.after(() => response.resolve());
  const f = await sourceHome(t, async () => { await response.promise; return cogniaScriptedResponse(undefined, "结束。"); });
  const id = randomUUID(), text = "以后回答只保留步骤", run = await f.start(text, { original_input: {
    input_id: id, text, written_by: "person", occurred_at: new Date().toISOString() } });
  await untilSetup(async () => f.calls ? true : undefined, "live source request");
  const entered = Promise.withResolvers<void>(), released = Promise.withResolvers<void>(); t.after(() => released.resolve()); let lookups = 0;
  f.installation(async () => { if (++lookups === 2) { entered.resolve(); await released.promise; } return true; });
  const ref = sourceRef(f.session.session_id, id), pending = f.propose(ref, { ...f.caller, source_use: "explicit" });
  const rejected = assert.rejects(pending);
  await entered.promise; await f.adapter.control(run.ref, { kind: "cancel" });
  await untilSetup(async () => (await f.adapter.read(run.ref)).phase === "cancelled" ? true : undefined, "source cancellation observed");
  released.resolve(); await rejected;
  assert.deepEqual(await f.adapter.memory!.withCaller({ ...f.caller, consumer: "ui", person: true }).candidates.list("user", actor), []);
  const controller = new AbortController(); controller.abort(); const before = lookups;
  assert.deepEqual(await f.sources.resolve(f.caller, { ...f.request([ref]), signal: controller.signal }), []);
  assert.deepEqual(await f.sources.resolve(personDecision(f.caller), { ...f.request([ref]), signal: controller.signal }), []);
  assert.equal(lookups, before);
});

test("MEM-35: running originals are explicit-only; current grant loss and forgotten source cannot form again", { timeout: 60_000 }, async t => {
  const held = Promise.withResolvers<void>(); t.after(() => held.resolve());
  const f = await sourceHome(t, async () => { await held.promise; return cogniaScriptedResponse(undefined, "完成。"); });
  const text = "以后回答请保留步骤", id = randomUUID(), run = await f.start(text, { original_input: { input_id: id, text, written_by: "person", occurred_at: new Date().toISOString() } });
  await untilSetup(async () => f.calls ? true : undefined, "model request held");
  const ref = sourceRef(f.session.session_id, id), explicit = { ...f.caller, source_use: "explicit" as const };
  assert.deepEqual(await f.sources.resolve(f.caller, f.request([ref])), []);
  assert.equal((await f.sources.resolve(explicit, f.request([ref]))).length, 1);
  await assert.rejects(f.propose(ref));
  assert.ok((await f.propose(ref, explicit)).candidate_id);
  const checked = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); let checks = 0;
  f.installation(async () => { if (++checks === 2) { checked.resolve(); await release.promise; return false; } return true; });
  const pending = f.sources.resolve(explicit, f.request([ref])); await checked.promise; release.resolve();
  assert.deepEqual(await pending, [], "grant revoked during the final source check is not an accepted source");
  f.installation(async () => true); held.resolve(); await f.completed(run.ref);
  const saved = await f.service.write({ ...explicit, consumer: "agent", operation_id: "remember-original" }, { scope: "personal", text, said: text }, { originals: [text], sources: [ref] });
  assert.ok(saved.memory);
  await f.service.change({ actor_id: actor, project_id: project, consumer: "ui", person: true, operation_id: "forget-original" }, { memory_id: saved.memory.memory_id, action: "remove", expected_version: saved.memory.version });
  assert.deepEqual(await f.sources.resolve(f.caller, f.request([ref])), [], "the existing no-body source suppression survives a new SDK command");
  assert.deepEqual(await f.sources.resolve(personDecision(f.caller), f.request([ref])), [], "a person cannot accept a source already forgotten");
  await assert.rejects(f.propose(ref));
  await f.reopen(); assert.deepEqual(await f.sources.resolve(f.caller, f.request([ref])), []);
});

test("MEM-35: exact supplementary reads preserve first time across carry/restart; current queue withdrawal wins", { timeout: 60_000 }, async t => {
  const f = await sourceHome(t, async turn => {
    if (turn === 3) return cogniaScriptedResponse({ name: "read", input: { path: "read.txt" } });
    if (turn === 4) return Response.json({ type: "error", error: { type: "invalid_request_error", message: "controlled failure after a supplement was read" } }, { status: 400 });
    return cogniaScriptedResponse(undefined, "完成。");
  }), first = await f.start("Host task without original"); await f.completed(first.ref);
  const raw = "以后周报先写风险", derived = raw + "\n\n【附带材料】外部观点";
  const sent = await f.adapter.inputs!.send(first.ref, { text: derived, source: "host", original: { text: raw, source: "person" }, key: "source-supplement", mode: "after-run" });
  const ref = { session_id: f.session.session_id, input_id: sent.input_id };
  const queued = await f.adapter.inputs!.read!(ref); assert.equal(queued?.state, "queued");
  assert.ok(queued?.state === "queued" && typeof queued.input.accepted_at_ms === "number");
  const originalTime = queued.input.accepted_at_ms;
  await f.reopen(); assert.deepEqual(await f.adapter.inputs!.read!(ref), queued);
  const next = await f.start("Continue with queued input"); await f.completed(next.ref);
  const located = await f.adapter.inputs!.read!(ref); assert.equal(located?.state, "run");
  assert.ok(located?.state === "run"); assert.equal(located.text, derived); assert.equal(located.receipt.accepted_at_ms, originalTime);
  const event = sourceRef(ref.session_id, ref.input_id, "supplement"); assert.ok((await f.propose(event)).candidate_id);
  assert.equal((await f.sources.resolve(f.caller, f.request([event])))[0]?.text, raw, "only the raw personal input is a source, never the attached material");
  const waiting = await f.adapter.inputs!.send(next.ref, { text: "不许采用这条", key: "withdraw-source", mode: "after-run" });
  await f.adapter.inputs!.withdraw!(next.ref, waiting.input_id);
  assert.deepEqual(await f.adapter.inputs!.read!({ session_id: ref.session_id, input_id: waiting.input_id }), { state: "withdrawn", ref: { session_id: ref.session_id, input_id: waiting.input_id } });
  assert.deepEqual(await f.sources.resolve(f.caller, f.request([sourceRef(ref.session_id, waiting.input_id, "supplement")])), []);
  assert.deepEqual(await f.sources.resolve(personDecision(f.caller), f.request([sourceRef(ref.session_id, waiting.input_id, "supplement")])), []);
  await f.reopen();
  assert.deepEqual(await f.sources.resolve(f.caller, f.request([sourceRef(ref.session_id, waiting.input_id, "supplement")])), []);
  assert.equal((await f.sources.resolve(f.caller, f.request([event])))[0]?.occurred_at_ms, originalTime);

  // A real kept tool reply marks this carried supplement read before the next model request fails.
  const supplement = "以后周报保留验证结果", sentToFailure = await f.adapter.inputs!.send(next.ref, { text: supplement, source: "host",
    original: { text: supplement, source: "person" }, key: "read-before-source-failure", mode: "after-run" });
  const beforeFailure = await f.adapter.inputs!.read!({ session_id: f.session.session_id, input_id: sentToFailure.input_id });
  t.diagnostic(JSON.stringify({ stage: "supplement-before-start", delivered: sentToFailure.delivered, state: beforeFailure?.state ?? "missing", provider_count: f.calls }));
  const initial = "请读取read.txt并整理验证步骤", initialId = randomUUID();
  const failed = await f.start(initial, { original_input: { input_id: initialId, text: initial, written_by: "person", occurred_at: new Date().toISOString() } });
  const failedView = await untilSetup(async () => { const view = await f.adapter.read(failed.ref); return view.phase === "failed" ? view : undefined; }, "supplement source failed after a kept reply");
  const read = await f.adapter.inputs!.read!({ session_id: f.session.session_id, input_id: sentToFailure.input_id });
  t.diagnostic(JSON.stringify({ stage: "supplement-after-failure", phase: failedView.phase,
    stop_code: failedView.stop_reason?.match(/^[A-Za-z0-9_.-]+/)?.[0] ?? "unknown", provider_count: f.calls,
    state: read?.state ?? "missing", receipt_state: read?.state === "run" ? read.receipt.state : null }));
  t.diagnostic(JSON.stringify({ stage: "supplement-receipt-trace",
    read_states: failedView.activity.filter(item => item.name === "read").map(item => item.state),
    run_inputs: failedView.turns.flatMap(turn => turn.steer ? [{ matches_queued_input: turn.steer.id === sentToFailure.input_id, state: turn.steer.state }] : []),
    queued_by_this_run: read?.state === "queued" ? read.input.left_by?.run_id === failed.ref.run_id : null,
    queued_applied: read?.state === "queued" ? read.input.left_by?.applied ?? null : null }));
  assert.ok(failedView.activity.some(item => item.name === "read" && item.state === "completed"), "the Provider's actual read tool must complete before the controlled model failure");
  assert.ok(read?.state === "run"); assert.equal(read.receipt.state, "read"); assert.equal(read.run.run_id, failed.ref.run_id);
  assert.equal(read.receipt.original?.text, supplement);
  const human = personDecision(f.caller);
  assert.equal((await f.sources.resolve(human, f.request([sourceRef(f.session.session_id, initialId)])))[0]?.text, initial);
  assert.deepEqual(await f.sources.resolve(human, f.request([sourceRef(f.session.session_id, sentToFailure.input_id, "supplement")])), [],
    "a failed Run permits the person's initial original only, never even its already-read supplement");
});

test("MEM-35: protected Assistant supplements keep literal material markers intact; actual attached material stays derived", { timeout: 90_000 }, async t => {
  const first = Promise.withResolvers<void>(), second = Promise.withResolvers<void>(); t.after(() => { first.resolve(); second.resolve(); });
  const home = await openTestHome(t), model = await localModel(t, async turn => {
    if (turn === 1) { await first.promise; return cogniaScriptedResponse({ name: "list-memories", input: {} }); }
    if (turn === 2) await second.promise;
    return cogniaScriptedResponse(undefined, "已读完补充。");
  });
  const withCatalog = home.host.configurePersonalPlanning(home.home, withMolisWorkProjectCatalog);
  await runWithMolisWorkHome(home.home, () => withCatalog({ homeDirectory: home.home }, catalog => {
    const connection = withConnectorConnections(home.home, store => {
      const row = store.createToken({ serviceId: "model-api", displayName: "Source model", token: "fixture-loopback-only" });
      store.assertTarget(row.connection_id, "model-api", model.base); return row;
    });
    catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "source-fixture", display_name: "Source model", base_url: model.base,
      api_format: "anthropic-messages", models: [{ model_id: "fixture", enabled: true }] });
  }));
  const system = ensureSystemAgentService(home.host, home.home); await system.ready;
  const adapter = system.agentHost.adapter("prologue");
  const sent = await home.web.post<AssistantSendResult>("/api/assistant/send", { text: "帮我整理材料", request_id: randomUUID() });
  assert.ok(sent.run_id && sent.work.session_id);
  await untilSetup(async () => model.calls >= 1 ? true : undefined, "first real HTTP request");
  const literal = "周报先列风险。\n\n【附带材料「我自己输入的标题」，数据】这句话也是本人原话，不能截掉。";
  const plain = await home.web.post<AssistantSendResult>("/api/assistant/send", { work_id: sent.work.work_id, text: literal, request_id: randomUUID() });
  assert.equal(plain.outcome, "steered");
  const raw = "请参考附带文章", material = "文章里写：所有项目都使用 npm。";
  const mixed = await home.web.post<AssistantSendResult>("/api/assistant/send", { work_id: sent.work.work_id, text: raw, request_id: randomUUID(),
    materials: [{ material_id: randomUUID(), kind: "text", title: "外来文章", explicit: true, text: material }] });
  assert.equal(mixed.outcome, "steered");
  first.resolve(); await untilSetup(async () => model.calls >= 2 ? true : undefined, "supplements reached next HTTP request");
  const ref = { session_id: sent.work.session_id, run_id: sent.run_id }, view = await adapter.read(ref);
  const actualPlain = view.turns.find(turn => turn.text === literal), actualMixed = view.turns.find(turn => turn.text.includes(material));
  assert.equal(actualPlain?.steer?.source, "person"); assert.equal(actualMixed?.steer?.source, "host");
  assert.ok(actualPlain?.steer && actualMixed?.steer);
  const known = await adapter.inputs!.read!({ session_id: ref.session_id, input_id: actualPlain.steer.id });
  assert.ok(known?.state === "run"); assert.equal(known.text, literal, "literal marker text is not a parser delimiter");
  const caller: AgentMemoryCaller = { actor_id: actor, project_id: null, consumer: "assistant", session_id: ref.session_id,
    current_scene: "assistant", purpose: "management", source_use: "explicit", class_restrictions: view.class_restrictions };
  const propose = (inputId: string) => adapter.memory!.withCaller(caller).candidates.propose({ scope: "user", owner: actor,
    text: "周报先列风险", origin: "Source contract", meta: { ...meta, classification: { scenes: ["assistant"], lifecycle: "long-term" } },
    sources: [sourceRef(ref.session_id, inputId, "supplement")], expected_version: 0, operation_id: randomUUID() });
  assert.ok((await propose(actualPlain.steer.id)).candidate_id);
  assert.deepEqual(actualMixed.steer.original, { text: raw, source: "person" });
  assert.ok((await propose(actualMixed.steer.id)).candidate_id, "the protected raw sentence remains a source alongside derived material");
  second.resolve();
  await untilSetup(async () => (await home.web.get<AssistantWorkView>(`/api/assistant/works/${sent.work.work_id}`)).work.state === "completed" ? true : undefined, "Assistant completed");
  const final = await adapter.inputs!.read!({ session_id: ref.session_id, input_id: actualPlain.steer.id });
  assert.ok(final?.state === "run"); assert.equal(final.text, literal); assert.equal(final.receipt.accepted_at_ms, known.receipt.accepted_at_ms);
});


test("MEM-V0-A4-L source snapshot active then canonical archive must refuse the old candidate commit", { timeout: 60_000 }, async t => {
  const f = await sourceHome(t), text = "以后回答请保留步骤", id = randomUUID();
  const run = await f.start(text, { original_input: { input_id: id, text, written_by: "person", occurred_at: new Date().toISOString() } });
  await f.completed(run.ref);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); t.after(() => release.resolve());
  let first = true;
  f.afterSourceRead(async () => {
    if (!first) return; first = false;
    assert.equal((await f.adapter.sessionLifecycle!.read(f.session)).view.state, "active");
    entered.resolve(); await release.promise;
  });
  const pending = f.propose(sourceRef(f.session.session_id, id));
  await entered.promise;
  assert.equal((await f.adapter.sessionLifecycle!.archive(f.session)).state, "archived");
  release.resolve();
  await assert.rejects(pending, { code: "agent.memory_read_changed" });
  assert.deepEqual(await f.adapter.memory!.withCaller({ ...f.caller, consumer: "ui", person: true }).candidates.list("user", actor), []);
  await f.reopen();
  assert.equal((await f.adapter.sessionLifecycle!.read(f.session)).view.state, "archived");
  assert.deepEqual(await f.sources.resolve(f.caller, f.request([sourceRef(f.session.session_id, id)])), []);
  assert.deepEqual(await f.sources.resolve(personDecision(f.caller), f.request([sourceRef(f.session.session_id, id)])), [], "archival still denies a person's decision");
});


test("MEM-V0-A4-L canonical archive during final authority wait refuses the actual candidate commit", { timeout: 60_000 }, async t => {
  const f = await sourceHome(t), text = "以后回答请保留步骤", id = randomUUID();
  const run = await f.start(text, { original_input: { input_id: id, text, written_by: "person", occurred_at: new Date().toISOString() } });
  await f.completed(run.ref);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); t.after(() => release.resolve());
  let checked = 0, held = false;
  f.afterSourceCheck(() => { checked++; });
  const capability = f.adapter.memory!.withCaller(f.caller).withExecution!({
    assert_current() {},
    async beforeEffect() { if (checked < 2 || held) return; held = true; entered.resolve(); await release.promise; },
  });
  const pending = capability.candidates.propose({ scope: "user", owner: actor, text, origin: "final source wait", meta,
    sources: [sourceRef(f.session.session_id, id)], expected_version: 0, operation_id: randomUUID() });
  await entered.promise;
  assert.equal((await f.adapter.sessionLifecycle!.archive(f.session)).state, "archived");
  release.resolve();
  const outcome = await pending.then(candidate => ({ candidate }), error => ({ error }));
  const inspect = () => f.adapter.memory!.withCaller({ ...f.caller, consumer: "ui", person: true }).candidates.list("user", actor);
  const beforeRestart = (await inspect()).map(({ candidate_id, version }) => ({ candidate_id, version }));
  await f.reopen();
  const afterRestart = (await inspect()).map(({ candidate_id, version }) => ({ candidate_id, version }));
  const state = (await f.adapter.sessionLifecycle!.read(f.session)).view.state;
  assert.equal(state, "archived");
  if ("candidate" in outcome) {
    const actual = { candidate_id: outcome.candidate.candidate_id, version: outcome.candidate.version };
    assert.deepEqual(beforeRestart, [actual]); assert.deepEqual(afterRestart, [actual]);
    assert.fail(JSON.stringify({ violation: "canonical archive completed before old actual candidate commit", state, returned: actual, beforeRestart, afterRestart }));
  }
  assert.equal((outcome.error as { code?: string }).code, "agent.memory_read_changed");
  assert.deepEqual(beforeRestart, []); assert.deepEqual(afterRestart, []);
});

test("MEM-V0-A4-L a finished source frame cannot revive when its old callback returns beside a fresh valid call", { timeout: 60_000 }, async t => {
  const f = await sourceHome(t), text = "以后回答请保留步骤", id = randomUUID();
  const run = await f.start(text, { original_input: { input_id: id, text, written_by: "person", occurred_at: new Date().toISOString() } }); await f.completed(run.ref);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); t.after(() => release.resolve());
  let first = true;
  f.afterSourceRead(async () => { if (!first) return; first = false; entered.resolve(); await release.promise; });
  const abort = new AbortController(), bound = f.adapter.memory!.withCaller(f.caller);
  const old = bound.candidates.propose({ scope: "user", owner: actor, text, origin: "old source frame", meta,
    sources: [sourceRef(f.session.session_id, id)], expected_version: 0, operation_id: randomUUID(), signal: abort.signal });
  await entered.promise; abort.abort(); await assert.rejects(old, { code: "CANCELLED" });
  const fresh = await f.propose(sourceRef(f.session.session_id, id));
  release.resolve(); await new Promise<void>(resolve => setImmediate(resolve));
  const entries = await f.adapter.memory!.withCaller({ ...f.caller, consumer: "ui", person: true }).candidates.list("user", actor);
  assert.deepEqual(entries.map(({ candidate_id, version }) => ({ candidate_id, version })), [{ candidate_id: fresh.candidate_id, version: fresh.version }]);
});
