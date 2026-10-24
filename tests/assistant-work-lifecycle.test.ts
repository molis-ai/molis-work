import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, type PrologueMemoryOptions } from "@molis-ai/molis-work-service-agent-host";
import { AssistantService, AssistantStore, LocalHost, MolisWorkLocalHost, assistantAuthority, resolveWebControlToken } from "@molis-ai/molis-work-app-local-host";
import { createDesktopWebHost } from "@molis-ai/molis-work-app-desktop";
import { openHomeSqliteDatabase, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID, ASSISTANT_INSTALL_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { endingReviewReply } from "./fixtures/ending-review.js";
import { roleViews } from "./fixtures/work-executor-fake.js";
import type { ActionDefinition, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";

const actor = "web-user", app = { appId: "io.molis.assistant-lifecycle-test", appVersion: "1.0.0" };
const control = { beforeEffect: async () => {}, assert_current: () => {} };
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
const owner = { project_id: ASSISTANT_PERSONAL_OWNER, plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID, actor_id: actor };
const ref = (id: string) => ({ runtime_id: "prologue", session_id: id });

async function fixture(t: TestContext, configure = (ports: ConstructorParameters<typeof AssistantService>[1]) => ports, memory?: PrologueMemoryOptions) {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-lifecycle-"));
  let requests = 0;
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    requests++;
    const text = endingReviewReply(raw) ?? "已整理好这段内容。";
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text }, finish_reason: null }] })}\n\n`
      + 'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const endpoint = `http://127.0.0.1:${address.port}/v1/chat/completions`;
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  let db!: DatabaseSync, store!: AssistantStore, service!: AssistantService, adapter!: Awaited<ReturnType<typeof createPrologueNodeAdapter>>, closed = true;
  const open = async () => {
    const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
    adapter = await createPrologueNodeAdapter({ app, storageRoot: join(home, "sdk"), reviewQueue: queue, resolveCredential: () => "fixture-only", ...(memory ? { memory } : {}),
      modelConfiguration: async () => ({ protocol: "openai-compatible", endpoint, model: "fixture", credential_ref: "fixture" }) });
    host.register(adapter); db = new DatabaseSync(join(home, "assistant.sqlite")); store = new AssistantStore(db);
    service = new AssistantService(store, configure({ pages: async () => [], host: async () => host, authority: async work => assistantAuthority(local, work, () => new Set()) }), actor);
    closed = false;
  };
  const close = async () => { if (closed) return; closed = true; service.continuations.close(); await adapter.close(); db.close(); };
  t.after(async () => { await close(); await local.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(home, { recursive: true, force: true }); });
  await open();
  return { home, endpoint, get requests() { return requests; }, get db() { return db; }, get service() { return service; }, get store() { return store; }, get adapter() { return adapter; },
    close, async reopen() { await close(); await open(); },
    async create(session = true) {
      let work = store.create({ actor_id: actor, title: "工作", scope: { kind: "personal" }, origin: null });
      if (session) { const sdk = await adapter.createSession({ ...owner, title: "自有会话" }); work = store.update(actor, work.work_id, work.revision, { session_id: sdk.session_id }); }
      return work;
    },
  };
}

test("AST-MEM-ARCH: SDK archive/restore precedes the Work commit; history reads and local-only work create no model run", async t => {
  const f = await fixture(t), work = await f.create(), other = await f.create(), local = await f.create(false);
  const request = await f.service.lifecycle.preview(work.work_id, true);
  const before = await f.adapter.sessionLifecycle!.read(ref(work.session_id!), owner);
  assert.equal(f.store.get(actor, work.work_id).archived, false);
  const archived = await f.service.archive(work.work_id, request, control);
  assert.equal(archived.archived, true);
  const sdk = await f.adapter.sessionLifecycle!.read(ref(work.session_id!), owner);
  assert.equal(sdk.state, "archived"); assert.equal(sdk.version, before.version! + 1);
  await f.service.read(work.work_id);
  assert.equal((await f.adapter.sessionLifecycle!.read(ref(work.session_id!), owner)).state, "archived", "read is not restore");
  assert.equal((await f.service.archive(work.work_id, request, control)).revision, archived.revision, "lost response retries do not write Work twice");
  await f.service.archive(work.work_id, await f.service.lifecycle.preview(work.work_id, false), control);
  await assert.rejects(f.service.archive(work.work_id, request, control));
  assert.equal((await f.adapter.sessionLifecycle!.read(ref(other.session_id!), owner)).state, "active");
  await f.service.archive(local.work_id, await f.service.lifecycle.preview(local.work_id, true), control);
  assert.equal(f.store.get(actor, local.work_id).session_id, null);
  assert.equal(f.requests, 0);
  await f.reopen();
  assert.equal(f.store.get(actor, work.work_id).archived, false);
  assert.equal((await f.adapter.sessionLifecycle!.read(ref(work.session_id!), owner)).state, "active");
});

test("AST-MEM-ARCH: changed owner/binding, omitted original, missing adapter and current-authority denial do not mutate stored work", async t => {
  const f = await fixture(t), work = await f.create(), other = await f.create();
  const request = await f.service.lifecycle.preview(work.work_id, true);
  await assert.rejects(f.service.archive(work.work_id, { archived: true } as never, control));
  await assert.rejects(f.service.archive(work.work_id, { ...request, session_id: other.session_id }, control));
  await assert.rejects(f.service.archive(work.work_id, request, { ...control, assert_current: () => { throw new Error("revoked"); } }), /revoked/);
  const alien = f.store.create({ actor_id: "other-person", title: "他人", scope: { kind: "personal" }, origin: null });
  await assert.rejects(f.service.lifecycle.preview(alien.work_id, true));
  const withEffect = f.adapter.withEffect;
  Object.defineProperty(f.adapter, "withEffect", { value: undefined, configurable: true });
  try { await assert.rejects(f.service.archive(work.work_id, request, control), { code: "assistant.unsupported" }); }
  finally { Object.defineProperty(f.adapter, "withEffect", { value: withEffect, configurable: true }); }
  assert.deepEqual(f.store.get(actor, work.work_id), work);
  assert.equal((await f.adapter.sessionLifecycle!.read(ref(work.session_id!), owner)).state, "active");
  await f.reopen(); assert.deepEqual(f.store.get(actor, work.work_id), work); assert.equal(f.requests, 0);
});

test("AST-MEM-ARCH: archive and restore preserve actual Session-bound memory and its original TTL", { timeout: 30_000 }, async t => {
  const policy: PrologueMemoryOptions = {
    policy: { version: 1, preset: "manual", taxonomy: { version: 1, scenes: { values: [{ id: "assistant", label: "Assistant" }] },
      kinds: { values: [{ id: "preference", label: "Preference" }] }, lifecycles: { values: [{ id: "session", label: "Session", retention: "session" }] } },
      matrix: { default: { formation: [] } } },
    authorize: async caller => caller.actor_id === actor, authorizeRecall: async () => ({ allowed: false }),
    authorizeManagement: async caller => ({ allowed: caller.actor_id === actor }), callerForSession: async () => undefined,
  };
  const f = await fixture(t, ports => ports, policy), work = await f.create(), expires = Date.now() + 3600_000;
  const caller = { actor_id: actor, session_id: work.session_id!, consumer: "assistant", current_scene: "assistant", purpose: "management" as const };
  const memory = () => f.adapter.memory!.withCaller(caller);
  const entry = await memory().write({ scope: "user", owner: actor, text: "只在原会话保留的偏好", origin: "person", operation_id: "session-memory-before-archive",
    meta: { kind: "preference", source: "manual", approved_by: { by: "person" }, classification: { scenes: ["assistant"], lifecycle: "session" },
      session_ref: { kind: "session", id: work.session_id!, revision: 1 }, expires_at_ms: expires } });
  assert.equal(entry.meta.expires_at_ms, expires);
  for (const archived of [true, false]) {
    await f.service.archive(work.work_id, await f.service.lifecycle.preview(work.work_id, archived), control);
    assert.deepEqual(await memory().list("user", actor), [entry], "archive/restore changes neither formal memory nor its Session ref, version, text or TTL");
  }
  await f.reopen(); assert.deepEqual(await memory().list("user", actor), [entry]); assert.equal(f.requests, 0);
});

test("AST-MEM-ARCH: a held archive rejects opposite commands and Send; cancellation after SDK commit keeps the original recoverable", async t => {
  const f = await fixture(t), work = await f.create(), request = await f.service.lifecycle.preview(work.work_id, true);
  const entered = deferred(), released = deferred(), abort = new AbortController(); let stopped = false;
  const pending = f.service.archive(work.work_id, request, { beforeEffect: async () => {
    // This is after the lifecycle command returns; reading its receipt is safe and only observes production state.
    if (!stopped) {
      const view = await f.adapter.sessionLifecycle!.read(ref(work.session_id!), owner).catch(() => null);
      if (view?.operation?.completed) { stopped = true; entered.resolve(); await released.promise; }
    }
  }, assert_current: () => abort.signal.throwIfAborted() });
  await Promise.race([entered.promise, pending.then(() => { throw new Error("did not hold after SDK commit"); })]);
  try {
    await assert.rejects(f.service.archive(work.work_id, { ...request, archived: false }, control), { code: "assistant.busy" });
    await assert.rejects(f.service.send({ work_id: work.work_id, text: "不能启动", request_id: "held-archive-send" }, {}), { code: "assistant.busy" });
    assert.equal(f.store.get(actor, work.work_id).archived, false);
    abort.abort(new Error("request cancelled"));
  } finally { released.resolve(); }
  await assert.rejects(pending, /request cancelled/);
  assert.equal((await f.adapter.sessionLifecycle!.read(ref(work.session_id!), owner)).state, "archived");
  assert.equal(f.store.get(actor, work.work_id).archived, false);
  await f.reopen();
  await f.service.archive(work.work_id, request, control);
  assert.equal(f.store.get(actor, work.work_id).archived, true); assert.equal(f.requests, 0);
});

test("AST-MEM-ARCH: SDK completion plus failed SQLite commit resumes the same request in a new Node process", async t => {
  const f = await fixture(t), work = await f.create(), request = await f.service.lifecycle.preview(work.work_id, true);
  f.db.exec("CREATE TRIGGER refuse_archive BEFORE UPDATE ON assistant_works WHEN NEW.archived=1 BEGIN SELECT RAISE(ABORT, 'injected SQLite commit failure'); END");
  await assert.rejects(f.service.archive(work.work_id, request, control), /SQLite commit failure/);
  assert.equal(f.store.get(actor, work.work_id).archived, false);
  assert.equal((await f.adapter.sessionLifecycle!.read(ref(work.session_id!), owner)).state, "archived");
  f.db.exec("DROP TRIGGER refuse_archive");
  await f.close();
  const script = `
    import { DatabaseSync } from 'node:sqlite';
    import { join } from 'node:path';
    import { AgentHost, createPrologueNodeAdapter } from '@molis-ai/molis-work-service-agent-host';
    import { AssistantStore, AssistantService } from '@molis-ai/molis-work-app-local-host';
    const [home, id, raw, endpoint] = process.argv.slice(1);
    const adapter = await createPrologueNodeAdapter({ app: ${JSON.stringify(app)}, storageRoot: join(home,'sdk'), resolveCredential: () => 'fixture-only', modelConfiguration: async () => ({protocol:'openai-compatible',endpoint,model:'fixture',credential_ref:'fixture'}) });
    const host = new AgentHost(); host.register(adapter);
    const db = new DatabaseSync(join(home,'assistant.sqlite')), store = new AssistantStore(db);
    const service = new AssistantService(store, {host:async()=>host,pages:async()=>[],authority:async()=>({manifest:{roles:[]},authorizedDirectories:[]})},'web-user');
    try { const result = await service.archive(id,JSON.parse(raw),{beforeEffect:async()=>{},assert_current:()=>{}}); process.stdout.write(JSON.stringify({archived:result.archived,revision:result.revision})); }
    finally { service.continuations.close(); await adapter.close(); db.close(); }
  `;
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script, f.home, work.work_id, JSON.stringify(request), f.endpoint], { cwd: process.cwd() });
    let stdout = "", stderr = ""; child.stdout.on("data", value => { stdout += value; }); child.stderr.on("data", value => { stderr += value; });
    child.on("error", reject); child.on("exit", code => code === 0 ? resolve(stdout) : reject(new Error(`child ${code}: ${stderr}`)));
  });
  assert.deepEqual(JSON.parse(output), { archived: true, revision: request.revision + 1 });
  await f.reopen();
  assert.equal(f.store.get(actor, work.work_id).archived, true);
  assert.equal((await f.adapter.sessionLifecycle!.read(ref(work.session_id!), owner)).operation?.decision.operation_id, request.decision!.operation_id);
});

test("AST-MEM-ARCH: unchanged request snapshots and Work revisions fence a late business commit", async t => {
  const f = await fixture(t), work = await f.create(), request = await f.service.lifecycle.preview(work.work_id, true);
  const entered = deferred(), released = deferred(); let held = false;
  const pending = f.service.archive(work.work_id, request, { beforeEffect: async () => { if (!held) { held = true; entered.resolve(); await released.promise; } }, assert_current: () => {} });
  await entered.promise; request.archived = false; request.decision!.operation_id = "mutated-after-start"; released.resolve();
  assert.equal((await pending).archived, true, "caller mutation does not replace the captured original");
  await f.service.archive(work.work_id, await f.service.lifecycle.preview(work.work_id, false), control);
  const original = await f.service.lifecycle.preview(work.work_id, true); let changed = false;
  await assert.rejects(f.service.archive(work.work_id, original, { beforeEffect: async () => {
    if (!changed) {
      const view = await f.adapter.sessionLifecycle!.read(ref(work.session_id!), owner).catch(() => null);
      if (view?.operation?.decision.operation_id === original.decision!.operation_id && view.operation.completed) {
        changed = true; f.store.update(actor, work.work_id, null, { title: "另一次修改" });
      }
    }
  }, assert_current: () => {} }), { code: "assistant.conflict" });
  assert.equal(f.store.get(actor, work.work_id).archived, false);
  assert.equal(f.store.get(actor, work.work_id).title, "另一次修改");
  assert.equal((await f.adapter.sessionLifecycle!.read(ref(work.session_id!), owner)).state, "archived");
});

test("AST-MEM-ARCH: actual Assistant rounds use the local model before and after restoration, never while archived", async t => {
  const f = await fixture(t);
  const sent = await f.service.send({ text: "整理这段内容", request_id: "before-archive" }, {});
  const complete = async () => {
    for (let count = 0; count < 1000; count++) {
      const view = await f.service.read(sent.work.work_id);
      if (view.work.state === "completed") return view;
      assert.notEqual(view.work.state, "failed", "local stub round must finish successfully");
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error("round did not complete");
  };
  const first = await complete(), requests = f.requests;
  assert.ok(requests > 0, "real local HTTP model was called");
  await f.service.archive(sent.work.work_id, await f.service.lifecycle.preview(sent.work.work_id, true), control);
  const archived = await f.service.read(sent.work.work_id);
  assert.equal(archived.rounds.length, first.rounds.length);
  assert.equal(archived.work.archived, true);
  await assert.rejects(f.service.send({ work_id: sent.work.work_id, text: "归档后不能发起", request_id: "while-archived" }, {}));
  assert.equal(f.requests, requests);
  await f.service.archive(sent.work.work_id, await f.service.lifecycle.preview(sent.work.work_id, false), control);
  await f.service.send({ work_id: sent.work.work_id, text: "继续整理", request_id: "after-restore" }, {});
  assert.equal((await complete()).rounds.length, first.rounds.length + 1);
  assert.ok(f.requests > requests);
});

test("AST-MEM-ARCH: a terminal stopped hold can archive; arbitrary plugin sessions are observed but never cascaded", async t => {
  const plugin = "io.molis.fixture.executor", calls: string[] = [];
  let phase = "running";
  const actions: BoundActionClient = { discover: async () => roleViews(plugin, "任意执行方", "fixture_session"),
    invoke: async <I, O>(definition: ActionDefinition<I, O>, input: I) => {
      calls.push(definition.capability_id);
      assert.equal(definition.capability_id, `${plugin}.session.read`, "archive only observes the executor through its read role");
      return { session_id: (input as { session_id: string }).session_id, title: "执行方会话", mode: null, runtime_session_id: null, recovery: null,
        runs: [{ ref: { run_id: "executor-run" }, phase, turns: [], activity: [], awaiting_input: [], usage: {}, started_at: new Date().toISOString() }] } as O;
    } };
  const f = await fixture(t, ports => ({ ...ports, personActions: async () => actions }));
  const stopped = await f.create();
  f.store.update(actor, stopped.work_id, stopped.revision, { continuation_hold: "stopped" });
  assert.equal((await f.service.archive(stopped.work_id, await f.service.lifecycle.preview(stopped.work_id, true), control)).archived, true);
  const work = await f.create(), foreign = await f.create(), local = await f.create(false);
  for (const item of [work, local]) f.store.update(actor, item.work_id, item.revision,
    { executor: { kind: "plugin", plugin_id: plugin, title: "任意执行方", session_id: foreign.session_id } });
  const foreignBefore = await f.adapter.sessionLifecycle!.read(ref(foreign.session_id!), owner);
  await assert.rejects(f.service.archive(work.work_id, await f.service.lifecycle.preview(work.work_id, true), control), { code: "assistant.state" });
  assert.equal((await f.adapter.sessionLifecycle!.read(ref(work.session_id!), owner)).state, "active");
  phase = "completed";
  for (const item of [work, local]) await f.service.archive(item.work_id, await f.service.lifecycle.preview(item.work_id, true), control);
  assert.equal((await f.adapter.sessionLifecycle!.read(ref(work.session_id!), owner)).state, "archived");
  assert.equal(f.store.get(actor, local.work_id).session_id, null);
  assert.deepEqual(await f.adapter.sessionLifecycle!.read(ref(foreign.session_id!), owner), foreignBefore);
  assert.ok(calls.length > 0); assert.equal(f.requests, 0);
});

test("AST-MEM-ARCH: preparation can be cancelled by archive; only the real Session binding gap is held", async t => {
  const entered = deferred(), release = deferred(); let hold = true;
  const f = await fixture(t, ports => ({ ...ports, authority: async work => {
    if (hold) { entered.resolve(); await release.promise; }
    return ports.authority(work);
  } }));
  const local = await f.create(false);
  const pending = f.service.send({ work_id: local.work_id, text: "尚在准备", request_id: "early-start" }, {}, "host");
  await entered.promise;
  await f.service.archive(local.work_id, await f.service.lifecycle.preview(local.work_id, true), control);
  hold = false; release.resolve();
  await assert.rejects(pending, { code: "assistant.conflict" });
  assert.equal(f.store.get(actor, local.work_id).session_id, null); assert.equal(f.requests, 0);
  const work = await f.create(false), bound = deferred(), resume = deferred(), create = f.adapter.createSession.bind(f.adapter);
  const mock = t.mock.method(f.adapter, "createSession", async (...args: Parameters<typeof create>) => {
    const session = await create(...args); bound.resolve(); await resume.promise; return session;
  });
  const starting = f.service.send({ work_id: work.work_id, text: "正在绑定", request_id: "binding-start" }, {}, "host");
  try {
    await bound.promise;
    assert.equal(f.store.get(actor, work.work_id).session_id, null);
    await assert.rejects(f.service.archive(work.work_id, await f.service.lifecycle.preview(work.work_id, true), control), { code: "assistant.busy" });
  } finally { resume.resolve(); }
  await starting; mock.mock.restore();
  assert.ok(f.store.get(actor, work.work_id).session_id);
});

test("AST-MEM-ARCH: a follow-up awaiting the real schedule cannot join an already archived Work", async t => {
  const entered = deferred(), release = deferred(); let armed = false;
  const f = await fixture(t, ports => ({ ...ports, host: async () => {
    const host = await ports.host();
    if (armed) { armed = false; entered.resolve(); await release.promise; }
    return host;
  } }));
  const work = await f.create(), request = await f.service.lifecycle.preview(work.work_id, true);
  const enqueued: string[] = [], enqueue = f.adapter.schedule!.enqueue.bind(f.adapter.schedule!);
  t.mock.method(f.adapter.schedule!, "enqueue", async task => { enqueued.push(task.key); return enqueue(task); });
  armed = true;
  const pending = f.service.followUps.save({ work_id: work.work_id, label: "迟到定时", text: "不可新增", at: new Date(Date.now() + 3600_000).toISOString() })
    .then(value => ({ value, error: undefined }), error => ({ value: undefined, error }));
  try { await entered.promise; await f.service.archive(work.work_id, request, control); }
  finally { release.resolve(); }
  const result = await pending;
  assert.equal(f.store.get(actor, work.work_id).archived, true);
  assert.deepEqual(f.service.followUps.list(work.work_id), [], "no enabled record is saved after archive");
  assert.equal(result.error?.code, "assistant.conflict"); assert.equal(result.value, undefined);
  assert.deepEqual(enqueued, [], "no queue submission follows the completed archive");
  await f.reopen(); assert.deepEqual(f.service.followUps.list(work.work_id), []); assert.equal(f.requests, 0);
});

test("AST-MEM-ARCH: a new follow-up cannot escape the archive cancellation snapshot", async t => {
  const f = await fixture(t), work = await f.create(), entered = deferred(), release = deferred(), at = new Date(Date.now() + 3600_000).toISOString();
  const first = await f.service.followUps.save({ work_id: work.work_id, label: "原定时", text: "原安排", at });
  const key = `fu-${first.followup_id}-${Date.parse(at)}`, request = await f.service.lifecycle.preview(work.work_id, true);
  const schedule = f.adapter.schedule!, cancel = schedule.cancel.bind(schedule), enqueued: string[] = [], enqueue = schedule.enqueue.bind(schedule);
  t.mock.method(schedule, "enqueue", async task => { enqueued.push(task.key); return enqueue(task); });
  t.mock.method(schedule, "cancel", async target => {
    if (target === key) { entered.resolve(); await release.promise; }
    return cancel(target);
  });
  const archiving = f.service.archive(work.work_id, request, control);
  let saved: Awaited<ReturnType<typeof f.service.followUps.save>> | undefined, failure: { code?: string } | undefined;
  try {
    await entered.promise;
    await f.service.followUps.save({ work_id: work.work_id, label: "快照后新增", text: "不可漏停", at }).then(value => { saved = value; }, error => { failure = error; });
  } finally { release.resolve(); }
  await archiving;
  assert.equal(f.store.get(actor, work.work_id).archived, true);
  assert.deepEqual(f.service.followUps.list(work.work_id).map(item => item.enabled), [false], "archive leaves no new enabled follow-up outside its snapshot");
  assert.equal(schedule.find(key)?.state, "cancelled");
  if (saved) assert.notEqual(schedule.find(`fu-${saved.followup_id}-${Date.parse(at)}`)?.state, "queued");
  assert.equal(failure?.code, "assistant.busy"); assert.equal(saved, undefined); assert.equal(f.requests, 0);
  assert.deepEqual(enqueued, [], "the competing save never submits another queue entry");
  await f.reopen(); assert.deepEqual(f.service.followUps.list(work.work_id).map(item => item.enabled), [false]);
});

test("AST-MEM-ARCH: an enqueue completed after archive is cancelled using its disabled original record", async t => {
  const f = await fixture(t), work = await f.create(), entered = deferred(), release = deferred(), schedule = f.adapter.schedule!;
  const enqueue = schedule.enqueue.bind(schedule), request = await f.service.lifecycle.preview(work.work_id, true);
  t.mock.method(schedule, "enqueue", async task => { entered.resolve(); await release.promise; return enqueue(task); });
  const pending = f.service.followUps.save({ work_id: work.work_id, label: "已保存待入队", text: "保留已发生事实", at: new Date(Date.now() + 3600_000).toISOString() });
  try { await entered.promise; await f.service.archive(work.work_id, request, control); }
  finally { release.resolve(); }
  const saved = await pending, key = `fu-${saved.followup_id}-${Date.parse(saved.next_at!)}`;
  assert.equal(f.store.get(actor, work.work_id).archived, true);
  assert.equal(f.service.followUps.list(work.work_id)[0]!.enabled, false);
  assert.equal(schedule.find(key)?.state, "cancelled", "the real late queue commit is cancelled, not left for tick");
  await f.reopen(); assert.equal(f.adapter.schedule!.find(key)?.state, "cancelled");
  assert.equal(f.service.followUps.list(work.work_id)[0]!.enabled, false); assert.equal(f.requests, 0);
});

test("AST-MEM-ARCH: queue and SQLite failures retain exact partial follow-up results for the original request", async t => {
  const f = await fixture(t), work = await f.create(), schedule = f.adapter.schedule!, cancel = schedule.cancel.bind(schedule);
  const at = new Date(Date.now() + 3600_000).toISOString();
  for (const id of ["first", "second"]) {
    f.store.followUps.save(actor, { followup_id: id, work_id: work.work_id, label: id, text: id, repeat: "none", next_at: at,
      time_zone: "UTC", enabled: true, created_at: id === "first" ? "2026-10-24T00:00:00Z" : "2026-10-24T00:00:01Z" });
    await schedule.enqueue({ key: `fu-${id}-${Date.parse(at)}`, session_id: work.session_id!, kind: "assistant.follow-up", payload: { followup_id: id }, due_at: at });
  }
  const request = await f.service.lifecycle.preview(work.work_id, true), secondKey = `fu-second-${Date.parse(at)}`;
  const mock = t.mock.method(schedule, "cancel", async key => { if (key === secondKey) throw new Error("queue cancellation unavailable"); return cancel(key); });
  await assert.rejects(f.service.archive(work.work_id, request, control), /queue cancellation unavailable/);
  assert.equal(f.store.get(actor, work.work_id).archived, false);
  assert.deepEqual(f.service.followUps.list(work.work_id).map(item => [item.enabled, item.next_at ?? null]), [[false, null], [true, at]]);
  assert.equal(schedule.find(secondKey)?.state, "queued");
  const completed = await f.adapter.sessionLifecycle!.read(ref(work.session_id!), owner); assert.equal(completed.state, "archived");
  mock.mock.restore();
  f.db.exec("CREATE TRIGGER refuse_followup BEFORE UPDATE ON assistant_followups WHEN NEW.followup_id='second' BEGIN SELECT RAISE(ABORT, 'follow-up save refused'); END");
  await assert.rejects(f.service.archive(work.work_id, request, control), /follow-up save refused/);
  assert.equal(schedule.find(secondKey)?.state, "cancelled");
  assert.equal(f.service.followUps.list(work.work_id)[1]!.enabled, true);
  assert.equal(f.store.get(actor, work.work_id).archived, false);
  f.db.exec("DROP TRIGGER refuse_followup");
  await f.reopen();
  await f.service.archive(work.work_id, request, control);
  assert.deepEqual(f.service.followUps.list(work.work_id).map(item => item.enabled), [false, false]);
  assert.deepEqual(await f.adapter.sessionLifecycle!.read(ref(work.session_id!), owner), completed);
  assert.equal(f.requests, 0);
});

test("AST-MEM-ARCH: the final Work CAS synchronously rejects authority revoked in the last await microtask", async t => {
  const f = await fixture(t), work = await f.create(), request = await f.service.lifecycle.preview(work.work_id, true);
  f.store.followUps.save(actor, { followup_id: "last-await", work_id: work.work_id, label: "定时", text: "定时", repeat: "none",
    time_zone: "UTC", enabled: true, created_at: new Date().toISOString() });
  let current = true, armed = false;
  await assert.rejects(f.service.archive(work.work_id, request, { beforeEffect: async () => {
    if (!armed && !f.service.followUps.list(work.work_id)[0]!.enabled) {
      armed = true; queueMicrotask(() => queueMicrotask(() => { current = false; }));
    }
  }, assert_current: () => { if (!current) throw new Error("last-microtask revocation"); } }), /last-microtask revocation/);
  assert.equal(armed, true); assert.equal(f.store.get(actor, work.work_id).archived, false);
  assert.equal((await f.adapter.sessionLifecycle!.read(ref(work.session_id!), owner)).state, "archived");
  await f.service.archive(work.work_id, request, control);
  assert.equal(f.store.get(actor, work.work_id).archived, true); assert.equal(f.requests, 0);
});

test("AST-MEM-ARCH: deleting a follow-up during actual queue cancellation cannot resurrect it; the original archive resumes without another cancellation", { timeout: 30_000 }, async t => {
  const f = await fixture(t), work = await f.create(), entered = deferred(), release = deferred();
  const followUp = await f.service.followUps.save({ work_id: work.work_id, text: "待删除的安排", label: "原定时", at: new Date(Date.now() + 3600_000).toISOString() });
  const key = `fu-${followUp.followup_id}-${Date.parse(followUp.next_at!)}`, schedule = f.adapter.schedule!, cancel = schedule.cancel.bind(schedule);
  let held = false;
  t.mock.method(schedule, "cancel", async requested => {
    if (!held && requested === key) { held = true; entered.resolve(); await release.promise; }
    return cancel(requested);
  });
  const request = await f.service.lifecycle.preview(work.work_id, true), pending = f.service.archive(work.work_id, request, control);
  try {
    await Promise.race([entered.promise, pending.then(() => { throw new Error("archive did not reach the original queued task"); })]);
    assert.equal(f.store.get(actor, work.work_id).archived, false);
    assert.equal(await f.service.followUps.remove(followUp.followup_id), true);
    assert.deepEqual(f.service.followUps.list(work.work_id), []);
    assert.equal(schedule.find(key)?.state, "cancelled");
  } finally { release.resolve(); }
  await assert.rejects(pending, { code: "assistant.conflict" });
  assert.deepEqual(f.service.followUps.list(work.work_id), []);
  assert.equal(f.store.get(actor, work.work_id).archived, false);
  const committed = await f.adapter.sessionLifecycle!.read(ref(work.session_id!), owner); assert.equal(committed.state, "archived");
  await f.reopen();
  t.mock.method(f.adapter.schedule!, "cancel", async () => { throw new Error("deleted follow-up must not be cancelled again"); });
  await f.service.archive(work.work_id, request, control);
  assert.deepEqual(f.service.followUps.list(work.work_id), []);
  assert.equal(f.store.get(actor, work.work_id).archived, true);
  assert.deepEqual(await f.adapter.sessionLifecycle!.read(ref(work.session_id!), owner), committed); assert.equal(f.requests, 0);
});

for (const reason of ["disconnect", "host-close"] as const) test(`AST-MEM-ARCH: actual HTTP ${reason} refuses the held archive before any business commit`, { timeout: 30_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "assistant-archive-http-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null }), entered = deferred(), release = deferred(), settled = deferred();
  const originalArchive = AssistantService.prototype.archive;
  let check: (() => void) | undefined;
  t.mock.method(AssistantService.prototype, "archive", async function (this: AssistantService, ...args: Parameters<typeof originalArchive>) {
    const [id, request, caller] = args; check = caller.assert_current; let held = false;
    try { return await originalArchive.call(this, id, request, { beforeEffect: async () => {
      if (!held) { held = true; entered.resolve(); await release.promise; }
      await caller.beforeEffect();
    }, assert_current: caller.assert_current }); }
    finally { settled.resolve(); }
  });
  const factory = createDesktopWebHost({ ptyClientFilePath: () => "" });
  let server: ReturnType<typeof factory> | undefined, db: DatabaseSync | undefined;
  try { await runWithMolisWorkHome(home, async () => {
    const token = resolveWebControlToken(home); server = factory({ homeDirectory: home, localHost: host, controlToken: token });
    await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    db = openHomeSqliteDatabase(home, "assistant"); const store = new AssistantStore(db);
    const work = store.create({ actor_id: actor, title: "原归档请求", scope: { kind: "personal" }, origin: null });
    const path = origin + `/api/assistant/works/${work.work_id}/archive`, headers = { origin, "content-type": "application/json", "x-molis-work-control-token": token };
    const preview = await fetch(path + "-preview?archived=true", { headers }); assert.equal(preview.status, 200);
    const input = await preview.json(), abort = new AbortController();
    const pending = fetch(path, { method: "POST", headers: { ...headers, "x-molis-work-idempotency-key": randomUUID() }, signal: abort.signal, body: JSON.stringify(input) });
    const observed = reason === "disconnect" ? assert.rejects(pending, { name: "AbortError" }) : pending;
    await entered.promise;
    let closing: Promise<void> | undefined;
    if (reason === "disconnect") { abort.abort(); await observed; }
    else closing = host.close();
    const until = Date.now() + 5000;
    while (true) {
      try { check!(); } catch { break; }
      assert.ok(Date.now() < until, "the real HTTP/Host cancellation must reach its original current checker");
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    release.resolve(); await settled.promise;
    if (reason === "host-close") {
      const response = await pending, body = await response.json(); assert.equal(response.ok, false); assert.equal(body.code, "assistant.cancelled");
      await closing;
    }
    assert.deepEqual(store.get(actor, work.work_id), work); assert.deepEqual(store.rounds(work.work_id), []);
  }); } finally {
    release.resolve(); if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); }
    await host.close(); db?.close(); await rm(home, { recursive: true, force: true });
  }
});
