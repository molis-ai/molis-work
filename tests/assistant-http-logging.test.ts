import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID, type AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { createDesktopWebHost } from "@molis-ai/molis-work-app-desktop";
import {
  assistantServiceFor, captureHostLog, closeAssistantService, ensureSystemAgentService, hostQuestionTypes, MolisWorkLocalHost,
  type AssistantHttpPorts, type HostLogEntry,
} from "@molis-ai/molis-work-app-local-host";
import { currentCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { cogniaModelResponse, cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";

const CALL_ID = "751e9090-0000-4000-9000-000000000116";
const PRIVATE_TEXT = "以后每次整理都先列风险，RAC116 PRIVATE PROMPT";
const PRIVATE_URL = "https://private.invalid/rac116";
const PRIVATE_CREDENTIAL = "RAC116 PRIVATE CREDENTIAL";
const privateFailure = () => Object.assign(new Error(`${PRIVATE_TEXT} ${PRIVATE_URL} ${PRIVATE_CREDENTIAL}`), { code: "EIO" });

async function until<T>(read: () => T | Promise<T>, done: (value: T) => boolean, label: string): Promise<T> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

async function fixture(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "assistant-http-logging-"));
  const local = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const agents = ensureSystemAgentService(local, home);
  const entries: HostLogEntry[] = [], warnings: unknown[][] = [];
  const restoreLog = captureHostLog(entries);
  t.mock.method(console, "warn", (...args: unknown[]) => { warnings.push(args); });
  t.after(async () => {
    restoreLog(); closeAssistantService(local);
    await local.close();
    await rm(home, { recursive: true, force: true });
  });
  const ports: AssistantHttpPorts = { localHost: local, homeDirectory: home, agentHost: agents.agentHost,
    agentReady: async () => {}, projectTitle: async () => null, pages: async () => [] };
  return { home, local, agents, ports, entries, warnings };
}

function warning(entries: HostLogEntry[], area: string, event: string, failure: Error, callId = CALL_ID) {
  const found = entries.filter(entry => entry.area === area && entry.event === event);
  assert.equal(found.length, 1, "the actual failure path writes one structured warning");
  const { at, ...entry } = found[0]!;
  assert.ok(!Number.isNaN(Date.parse(at)));
  assert.deepEqual(entry, { level: "warn", area, event, call_id: callId, error: { name: "Error", code: "EIO" } });
  const written = JSON.stringify(found);
  for (const value of [PRIVATE_TEXT, PRIVATE_URL, PRIVATE_CREDENTIAL, failure.message, failure.stack!]) {
    assert.equal(written.includes(value), false, "private input and original error details must not enter the log");
  }
}

async function modelServer(t: TestContext, gate: () => Promise<void>) {
  const server = createServer((request, response) => {
    request.resume();
    void gate().then(async () => {
      const reply = cogniaModelResponse("整理完成。");
      response.writeHead(200, Object.fromEntries(reply.headers));
      response.end(await reply.text());
    }).catch((error: unknown) => response.destroy(error instanceof Error ? error : undefined));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}/v1/messages`;
}

// A detached callback has no current call after its owner ends; keep this operation open through the observed refusal.
test("RAC-116: learning enqueue refusal stays observable and private while the completed work and next explicit round keep their behavior", { timeout: 60_000 }, async t => withCallId(CALL_ID, async () => {
  const f = await fixture(t);
  // Public composition ports use an owned real SDK, without starting another Home runtime or calling an external model.
  t.mock.getter(f.agents, "ready", () => Promise.resolve());
  let modelGate = Promise.resolve(), finishModel = () => {};
  const endpoint = await modelServer(t, () => modelGate);
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-log-test", appVersion: "1.0.0" }, storageRoot: join(f.home, "sdk"),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint, model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only" });
  f.agents.agentHost.register(adapter);
  try {
    const schedule = adapter.schedule; assert.ok(schedule);
    const enqueue = schedule.enqueue.bind(schedule), attempts: Array<Parameters<typeof enqueue>[0]> = [];
    const failure = privateFailure(); let refuse = true;
    t.mock.method(schedule, "enqueue", async (input: Parameters<typeof enqueue>[0]) => {
      if (input.kind === "memory.learn") { attempts.push(input); if (refuse) throw failure; }
      return enqueue(input);
    });
    const { service, store } = assistantServiceFor(f.ports);
    const round = async (text: string) => {
      modelGate = new Promise<void>(resolve => { finishModel = resolve; });
      const owner = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: ASSISTANT_PERSONAL_OWNER, plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_PLUGIN_ID };
      const session = await adapter.createSession({ ...owner, workspace: "none", role_id: "assistant", title: text });
      const work = store.create({ actor_id: LOCAL_PERSON_ACTOR_ID, title: text, scope: { kind: "personal" }, origin: null });
      store.update(LOCAL_PERSON_ACTOR_ID, work.work_id, null, { session_id: session.session_id });
      const run = await adapter.start({ ...owner, session, task: text, workspace: "none", role_id: "assistant",
        role: { role_id: "assistant", workspace: "none", version: 1, execution: "read-only", prompts: [], host_tools: [] } });
      store.addRound(work.work_id, { run_id: run.ref.run_id, text, materials: [], context: null, started_at: new Date().toISOString() });
      await until(async () => (await service.list()).find(item => item.work_id === work.work_id)?.state, state => state === "running", "real work running before completion");
      finishModel();
      await until(async () => (await adapter.read(run.ref)).phase, phase => phase === "completed", "real SDK round completion");
      const completed = await withCallId(CALL_ID, () => service.list());
      assert.equal(completed.find(item => item.work_id === work.work_id)?.state, "completed");
      return { work, run, session, key: `memory-learn:${work.work_id}:${run.ref.run_id}` };
    };
    const first = await round(PRIVATE_TEXT);
    await until(() => attempts.length, count => count === 1, "the production Memory Host's enqueue refusal");
    await until(() => f.entries.some(entry => entry.event === "learning_not_queued"), Boolean, "structured learning enqueue warning");
    warning(f.entries, "memory", "learning_not_queued", failure);
    assert.deepEqual(f.warnings, [], "the old console must not print the raw error");
    assert.equal(Boolean(schedule.find(first.key)), false, "a refused enqueue creates no task");
    await service.list(); await service.list();
    assert.equal(attempts.length, 1, "observing a completed work does not automatically retry its rejected enqueue");
    assert.equal((await service.read(first.work.work_id)).work.state, "completed");
    refuse = false;
    const second = await round(`${PRIVATE_TEXT}，第二次明确整理`);
    await until(() => schedule.find(second.key), Boolean, "next explicit round's real queued task");
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts[1]!.payload, { actor_id: LOCAL_PERSON_ACTOR_ID, work_id: second.work.work_id, run_id: second.run.ref.run_id,
      session_id: second.session.session_id, sources: [{ run_id: second.run.ref.run_id, input_id: null, version: "1" }] });
    assert.equal(Boolean(schedule.find(first.key)), false);
    assert.equal(f.entries.filter(entry => entry.event === "learning_not_queued").length, 1);
    assert.deepEqual(f.warnings, []);
  } finally { finishModel(); await adapter.close(); }
}));

test("RAC-116: rule action registration refusal logs once, keeps the cached service usable and a fresh registration can succeed", async t => {
  const f = await fixture(t), registry = f.local.actionRegistry();
  const register = registry.registerProvider.bind(registry), failure = privateFailure();
  let attempts = 0;
  const rejected = t.mock.method(f.local, "actionRegistry", () => ({
    registerProvider: (input: Parameters<typeof register>[0]) => {
      if (input.definitions.some(definition => definition.capability_id === "assistant.rules.list")) { attempts++; throw failure; }
      return register(input);
    },
  }));
  const entry = await withCallId(CALL_ID, () => assistantServiceFor(f.ports));
  assert.equal(attempts, 1);
  assert.deepEqual(await entry.service.list(), []);
  assert.equal(assistantServiceFor(f.ports), entry, "the same service is cached despite failed registration");
  assert.equal(attempts, 1, "reading the cached service does not register again");
  warning(f.entries, "assistant", "rule_actions_registration_failed", failure);
  assert.deepEqual(f.warnings, []);
  rejected.mock.restore();
  closeAssistantService(f.local);
  const fresh = assistantServiceFor(f.ports);
  assert.notEqual(fresh, entry);
  assert.deepEqual(await fresh.service.list(), []);
  const views = await f.local.homeActionClient().discover({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user", permissions: ["assistant:read"] });
  assert.ok(views.some(view => view.capability_id === "assistant.rules.list"), "the next fresh service registers its real rule actions");
  assert.equal(f.entries.filter(item => item.event === "rule_actions_registration_failed").length, 1);
  assert.deepEqual(f.warnings, []);
});

async function httpFixture(t: TestContext) {
  const f = await fixture(t);
  // The question test registers its own real SDK; reads without a session need no model or second Home runtime.
  t.mock.getter(f.agents, "ready", () => Promise.resolve());
  const entry = assistantServiceFor(f.ports), token = randomUUID();
  const server = createDesktopWebHost({ ptyClientFilePath: () => "" })({ homeDirectory: f.home, localHost: f.local, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  let closing: Promise<void> | undefined;
  const close = () => closing ??= new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()); });
  t.after(close);
  return { ...f, ...entry,
    request: (path: string, body?: object) => fetch(origin + path, { method: body ? "POST" : "GET", headers: { origin,
      "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID() }, ...(body ? { body: JSON.stringify(body) } : {}) }),
    close,
  };
}

async function questionnaire(t: TestContext, f: Awaited<ReturnType<typeof httpFixture>>) {
  let modelCalls = 0;
  const model = createServer((request, response) => {
    request.resume(); modelCalls++;
    const answer = modelCalls === 1 ? cogniaScriptedResponse({ name: "ask-user", input: { why: "确认时长", questions: [
      { id: "minutes", type: "number", prompt: "时长", min: 15, max: 120, integer: true, unit: "分钟" },
    ] } }) : cogniaModelResponse("问卷已完成。");
    response.writeHead(200, Object.fromEntries(answer.headers));
    void answer.text().then(text => response.end(text));
  });
  let adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined, closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => { await adapter?.close(); model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); })();
  t.after(close);
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  const address = model.address(); assert.ok(address && typeof address === "object");
  adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-catch-test", appVersion: "1.0.0" }, storageRoot: join(f.home, "question-sdk"), reviewQueue: new AgentReviewQueue(), questionTypes: hostQuestionTypes(),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/messages`, model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  f.agents.agentHost.register(adapter);
  const owner = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: ASSISTANT_PERSONAL_OWNER, plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_PLUGIN_ID };
  const session = await adapter.createSession({ ...owner, workspace: "business", role_id: "assistant", title: PRIVATE_TEXT });
  const work = f.store.create({ actor_id: LOCAL_PERSON_ACTOR_ID, title: PRIVATE_TEXT, scope: { kind: "personal" }, origin: null });
  f.store.update(LOCAL_PERSON_ACTOR_ID, work.work_id, null, { session_id: session.session_id });
  const run = await adapter.start({ ...owner, session, task: PRIVATE_TEXT, workspace: "business", role_id: "assistant",
    role: { role_id: "assistant", workspace: "business", version: 1, execution: "operate", prompts: [], host_tools: ["ask-user"] } });
  f.store.addRound(work.work_id, { run_id: run.ref.run_id, text: PRIVATE_TEXT, materials: [], context: null, started_at: new Date().toISOString() });
  const running = adapter;
  const waiting = await until(() => running.read(run.ref), value => value.awaiting_input.some(item => item.answerable), "real SDK questionnaire");
  const pending = waiting.awaiting_input.find(item => item.answerable)!;
  f.store.update(LOCAL_PERSON_ACTOR_ID, work.work_id, null, { question_drafts: { [pending.pending_id]: { n0: "60" } } });
  return { adapter, run, work, pending, modelCalls: () => modelCalls, path: `/api/assistant/works/${work.work_id}`,
    close };
}

test("RAC-116-01: a settlement storage failure keeps the real HTTP notice and logs once; the next request settles it once and empty reads are quiet", { timeout: 60_000 }, async t => {
  const f = await httpFixture(t);
  try {
    const empty = await f.request("/api/assistant/notices"); assert.equal(empty.status, 200); assert.deepEqual((await empty.json()).notices, []);
    const work = f.store.create({ actor_id: LOCAL_PERSON_ACTOR_ID, title: PRIVATE_TEXT, scope: { kind: "personal" }, origin: null });
    await f.service.list();
    const notice = f.store.raiseNotice(LOCAL_PERSON_ACTOR_ID, { work_id: work.work_id, work_title: PRIVATE_TEXT, kind: "completed", text: PRIVATE_TEXT }, "catch-notice");
    assert.ok(notice);
    // Only the result owner's observation is supplied; the settlement service, its failed write and persisted notice are real.
    t.mock.method(f.service.reads, "workObjects", async () => [{ relation: "result", subject: { kind: "note", id: "result" }, title: "result", recorded_revision: "1",
      current_revision: "2", recorded_at: notice.created_at, state: "changed" }]);
    const settle = f.store.settleNotices.bind(f.store), failure = privateFailure();
    let refuse = true, attempts = 0, failureCallId: string | undefined;
    t.mock.method(f.store, "settleNotices", (...args: Parameters<typeof settle>) => { attempts++; if (refuse) { failureCallId = currentCallId(); throw failure; } return settle(...args); });
    const failed = await f.request("/api/assistant/notices"); assert.equal(failed.status, 200);
    assert.deepEqual((await failed.json()).notices.map((item: { notice_id: string }) => item.notice_id), [notice.notice_id]);
    assert.equal(attempts, 1, "the catch does not retry the settlement");
    assert.equal(f.store.openNotices(LOCAL_PERSON_ACTOR_ID).length, 1, "the failed write did not settle anything");
    assert.ok(failureCallId, "the actual HTTP storage failure has an open call scope");
    warning(f.entries, "assistant", "handled_notices_settlement_failed", failure, failureCallId);
    refuse = false;
    const recovered = await f.request("/api/assistant/notices"); assert.equal(recovered.status, 200); assert.deepEqual((await recovered.json()).notices, []);
    assert.equal(attempts, 2); assert.deepEqual(f.store.openNotices(LOCAL_PERSON_ACTOR_ID), []);
    const again = await f.request("/api/assistant/notices"); assert.equal(again.status, 200); assert.deepEqual((await again.json()).notices, []);
    assert.equal(attempts, 2, "the one notice is not settled twice");
    assert.equal(f.entries.filter(entry => entry.event === "handled_notices_settlement_failed").length, 1);
    assert.deepEqual(f.warnings, []);
  } finally { await f.close(); }
});

test("RAC-116-02: HTTP drawing logs a failed draft read without losing its persisted answer; absent drafts and a missing work are quiet and the next read recovers", { timeout: 60_000 }, async t => {
  const f = await httpFixture(t), q = await questionnaire(t, f);
  try {
    const get = f.store.get.bind(f.store), read = f.service.read.bind(f.service), update = f.store.update.bind(f.store), failure = privateFailure();
    let drawing = false, refusal: Error | undefined, draftReads = 0, draftWrites = 0, failureCallId: string | undefined;
    t.mock.method(f.store, "update", (...args: Parameters<typeof update>) => { if (args[3].question_drafts !== undefined) draftWrites++; return update(...args); });
    t.mock.method(f.service, "read", async (...args: Parameters<typeof read>) => { drawing = false; const view = await read(...args); drawing = true; return view; });
    t.mock.method(f.store, "get", (...args: Parameters<typeof get>) => { if (drawing) { draftReads++; drawing = false; if (refusal) { failureCallId = currentCallId(); throw refusal; } } return get(...args); });
    const html = (view: AssistantWorkView) => {
      const pending = view.rounds.flatMap(round => round.awaiting_input).find(item => item.pending_id === q.pending.pending_id);
      return pending && "html" in pending && typeof pending.html === "string" ? pending.html : "";
    };
    const first = await f.request(q.path); assert.equal(first.status, 200); assert.match(html(await first.json()), /value="60"/);
    refusal = failure;
    const failed = await f.request(q.path); assert.equal(failed.status, 200); assert.doesNotMatch(html(await failed.json()), /value="60"/);
    assert.equal(draftReads, 2, "one drawing read per request, without a retry");
    assert.deepEqual(get(LOCAL_PERSON_ACTOR_ID, q.work.work_id).question_drafts, { [q.pending.pending_id]: { n0: "60" } });
    assert.ok(failureCallId);
    warning(f.entries, "assistant", "question_drafts_read_failed", failure, failureCallId);
    refusal = new ActionError("assistant.not_found", "The work disappeared while its reply was being drawn");
    const missing = await f.request(q.path); assert.equal(missing.status, 200); assert.doesNotMatch(html(await missing.json()), /value="60"/);
    assert.equal(f.entries.filter(entry => entry.event === "question_drafts_read_failed").length, 1, "a normal missing work is not a storage warning");
    refusal = undefined;
    const recovered = await f.request(q.path); assert.equal(recovered.status, 200); assert.match(html(await recovered.json()), /value="60"/);
    assert.equal(draftWrites, 0, "failed, missing and recovered reads never write the draft");
    f.store.update(LOCAL_PERSON_ACTOR_ID, q.work.work_id, null, { question_drafts: {} });
    const empty = await f.request(q.path); assert.equal(empty.status, 200); assert.doesNotMatch(html(await empty.json()), /value="60"/);
    assert.equal(f.entries.filter(entry => entry.event === "question_drafts_read_failed").length, 1);
    assert.equal(draftWrites, 1, "only the explicit draft clear wrote the record");
    assert.equal(q.modelCalls(), 1, "drawing and recovery do not answer the question or call the model");
    assert.deepEqual(f.warnings, []);
  } finally { await q.close(); await f.close(); }
});

test("RAC-116-03: a failed answer-context read preserves the real SDK refusal and draft; a missing work is quiet and a later valid answer runs only once", { timeout: 60_000 }, async t => {
  const f = await httpFixture(t), q = await questionnaire(t, f);
  try {
    const get = f.store.get.bind(f.store), control = q.adapter.control.bind(q.adapter), update = f.store.update.bind(f.store), failure = privateFailure();
    let readingContext = false, refusal: Error | undefined = failure, answers = 0, contextReads = 0, draftWrites = 0, failureCallId: string | undefined;
    t.mock.method(f.store, "update", (...args: Parameters<typeof update>) => { if (args[3].question_drafts !== undefined) draftWrites++; return update(...args); });
    t.mock.method(q.adapter, "control", async (...args: Parameters<typeof control>) => { answers++; try { return await control(...args); } catch (error) { readingContext = true; throw error; } });
    t.mock.method(f.store, "get", (...args: Parameters<typeof get>) => { if (readingContext) { readingContext = false; contextReads++; if (refusal) { failureCallId = currentCallId(); throw refusal; } } return get(...args); });
    const send = (value: string) => f.request(q.path + "/answer", { run_id: q.run.ref.run_id, pending_id: q.pending.pending_id, pending_revision: q.pending.pending_revision, values: { n0: value } });
    const failed = await send("240"); assert.equal(failed.status, 400);
    const invalid = await failed.json(); assert.equal(invalid.code, "assistant.invalid");
    assert.equal(invalid.details.errors.q0, "这个数太大了");
    assert.equal(answers, 1); assert.equal(contextReads, 1); assert.equal(q.modelCalls(), 1);
    assert.deepEqual(get(LOCAL_PERSON_ACTOR_ID, q.work.work_id).question_drafts, { [q.pending.pending_id]: { n0: "60" } });
    assert.equal((await q.adapter.read(q.run.ref)).phase, "awaiting-input", "a storage failure does not accept the refused answer");
    assert.ok(failureCallId);
    warning(f.entries, "assistant", "answer_context_read_failed", failure, failureCallId);
    refusal = undefined;
    const restored = await send("240"); assert.equal(restored.status, 400);
    assert.equal((await restored.json()).details.errors.n0, "不能超过 120 分钟", "the normal read supplies the question's own limit");
    refusal = new ActionError("assistant.not_found", "The work disappeared while explaining the refused answer");
    const missing = await send("240"); assert.equal(missing.status, 400); assert.equal((await missing.json()).details.errors.q0, "这个数太大了");
    assert.equal(f.entries.filter(entry => entry.event === "answer_context_read_failed").length, 1);
    assert.equal(draftWrites, 0, "three refused answers keep the persisted draft without a write");
    refusal = undefined;
    const accepted = await send("45"); assert.equal(accepted.status, 200, await accepted.clone().text());
    await until(() => q.adapter.read(q.run.ref), value => value.phase === "completed", "the next valid answer's real SDK completion");
    assert.equal(answers, 4, "each explicit answer was sent once, with no automatic retry");
    assert.equal(q.modelCalls(), 2, "only the valid answer continues the model");
    assert.equal(get(LOCAL_PERSON_ACTOR_ID, q.work.work_id).question_drafts?.[q.pending.pending_id], undefined);
    assert.equal(draftWrites, 1, "the valid answer drops its draft once");
    assert.equal(f.entries.filter(entry => entry.event === "answer_context_read_failed").length, 1);
    assert.deepEqual(f.warnings, []);
  } finally { await q.close(); await f.close(); }
});
