import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { AgentReviewQueue, PrologueApprovalBridge, createPrologueNodeAdapter, createPrologueSurfaces, type ProloguePending, type ReviewDecisionControl } from "@molis-ai/molis-work-service-agent-host";
import type { HostSurfaceContext, HostSurfaceDriver } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";

const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
const session = (id: string) => ({ ref: { kind: "session" as const, id, revision: 1 } });
function authority() {
  let active = true;
  const control: ReviewDecisionControl = { beforeEffect() {}, assertCurrent() { if (!active) throw new Error("original authority expired"); } };
  return { control, expire: () => { active = false; }, restore: () => { active = true; } };
}

function driver(kind: "browser" | "desktop" = "browser") {
  const reads: HostSurfaceContext[] = [], inputs: HostSurfaceContext[] = [], releases: HostSurfaceContext[] = [];
  const surface: HostSurfaceDriver = {
    kind, project_id: kind === "desktop" ? null : "project",
    async identity(context) { context.assertCurrent(); reads.push(context); return "original-page"; },
    async scope(context) { context.assertCurrent(); return kind === "desktop" ? "io.fixture.editor" : "https://example.com"; },
    async observe(_kind, context) { context.assertCurrent(); reads.push(context); return new TextEncoder().encode("Original page"); },
    async perform(_action, context) { context.assertCurrent(); inputs.push(context); },
    async release(context) { releases.push(context); }, async close() { assert.fail("a round must not close the shared driver"); },
    async focusedField(context) { context.assertCurrent(); return { label: "Original field", sensitive: false, focus: "original-field" }; },
    async currentApp(context) { context.assertCurrent(); return { bundle_id: "io.fixture.editor", name: "Original app" }; },
    masked: bytes => bytes[0] === 42,
  };
  return { surface, reads, inputs, releases };
}

type SurfaceDeps = Parameters<typeof createPrologueSurfaces>;
type RuntimePort = ReturnType<SurfaceDeps[0]>;
type SdkSurface = Parameters<RuntimePort["surfaces"]["attach"]>[0];
const sdkTarget = { identity: "original-page", scope: "https://example.com", assertCurrent() {} };

/** Only the SDK attachment boundary is a fixture; the Molis owner and every per-round wrapper are production code. */
function assembly(t: TestContext, browser: HostSurfaceDriver | null, desktop?: HostSurfaceDriver) {
  const targets = new Map<string, SdkSurface>(), attached: Array<{ id: string; surface: SdkSurface }> = [];
  const closing = new Map<string, Promise<void>>();
  let beforeClose: (id: string) => Promise<void> = async () => {};
  let findDriver: SurfaceDeps[1]["driverFor"] = () => browser;
  let readText: SurfaceDeps[2] = async () => "private original text";
  const runtime: RuntimePort = {
    surfaces: {
      attach(surface, options) {
        const id = `target-${attached.length + 1}`;
        targets.set(id, surface); attached.push({ id, surface });
        return { ref: { kind: "ui-target", id, revision: 1 }, kind: surface.kind, open: true, owner: options?.owner };
      },
      reviewTarget(ref) {
        const item = attached.find(({ id }) => ref.id === id);
        if (!item) return undefined;
        return { targetRef: { kind: "ui-target", id: item.id, revision: 1 },
          expected: { ...sdkTarget, scope: item.surface.kind === "desktop" ? "io.fixture.editor" : sdkTarget.scope } };
      },
      detach(ref) {
        const running = closing.get(ref.id); if (running) return running;
        const surface = targets.get(ref.id); if (!surface) return Promise.resolve();
        const work = (async () => { await beforeClose(ref.id); await surface.close(); targets.delete(ref.id); })()
          .finally(() => { closing.delete(ref.id); });
        closing.set(ref.id, work); return work;
      },
    },
    effects: { remember() {}, forget: () => 0, releaseRun: () => 0 },
  };
  const host = createPrologueSurfaces(() => runtime, { driverFor: owner => findDriver(owner), siteDecisions: () => [], ...(desktop ? { desktop: () => desktop } : {}) }, ref => readText(ref));
  t.after(() => host.close());
  const attach = (id: string, control: ReviewDecisionControl = authority().control) => host.attach(session(id), "project", id, { readOnly: false, control });
  return { host, attached, targets, attach,
    holdClose: (operation: typeof beforeClose) => { beforeClose = operation; },
    find: (operation: typeof findDriver) => { findDriver = operation; },
    read: (operation: typeof readText) => { readText = operation; },
  };
}

test("APR-11: each Surface round gets a new target; delayed old close cannot clear the new round", async t => {
  const page = driver(), f = assembly(t, page.surface), release = deferred(), entered = deferred();
  t.after(() => release.resolve());
  const first = await f.attach("session"); first.noteRun("run-1");
  await f.attached[0]!.surface.observe("dom", sdkTarget);
  const oldContext = page.reads[0]!;
  f.holdClose(async id => { if (id === f.attached[0]!.id) { entered.resolve(); await release.promise; } });
  const ending = first.release("completed"); await entered.promise;
  assert.equal(f.host.current("run-1", "session", "browser"), false);
  await assert.rejects(f.attached[0]!.surface.perform({ what: "key", keys: ["Enter"] }, sdkTarget), /原轮次的界面已释放/);
  const next = await f.attach("session"); next.noteRun("run-2");
  await f.attached[1]!.surface.observe("dom", sdkTarget);
  const nextContext = page.reads[1]!;
  assert.notEqual(oldContext, nextContext); assert.notEqual(f.attached[0]!.id, f.attached[1]!.id);
  release.resolve(); await ending; await first.release("completed");
  assert.deepEqual(page.releases, [oldContext]); assert.equal(f.host.current("run-2", "session", "browser"), true);
  assert.throws(() => first.noteRun("run-2"), /原轮次的界面已释放/);
  assert.throws(() => f.host.review("run-1", "session", { kind: "effect", id: f.attached[0]!.id, revision: 1 },
    { surface: "browser", scope: sdkTarget.scope, action: "text" }), /原观察与这项审查/);
  await f.attached[1]!.surface.perform({ what: "key", keys: ["Enter"] }, sdkTarget);
  assert.deepEqual(page.inputs, [nextContext]); assert.deepEqual(await f.host.redact(new Uint8Array([42])), new Uint8Array([42]));
});

test("APR-11: browser exclusivity starts at attach, before either Run is named", async t => {
  const page = driver(), f = assembly(t, page.surface), gate = deferred();
  f.find(async () => { await gate.promise; return page.surface; });
  const one = f.attach("one"), two = f.attach("two"); gate.resolve();
  const [first, second] = await Promise.all([one, two]);
  assert.equal(f.attached.length, 1); assert.deepEqual(first.surfaces, ["browser"]); assert.deepEqual(second.tools, []);
  assert.match(second.note!, /另一项工作/);
});

test("APR-11: temporary authority refusal keeps browser exclusivity until explicit release", async t => {
  const page = driver(), f = assembly(t, page.surface), old = authority();
  const first = await f.attach("old", old.control); first.noteRun("old-run"); old.expire();
  assert.throws(() => f.attached[0]!.surface.assertCurrent!(), /original authority expired/);
  const waiting = await f.attach("waiting");
  assert.deepEqual(waiting.surfaces, []); assert.match(waiting.note!, /另一项工作/);
  assert.equal(page.releases.length, 0); assert.equal(f.targets.size, 1);
  old.restore(); await f.attached[0]!.surface.perform({ what: "key", keys: ["Enter"] }, sdkTarget);
  assert.equal(page.inputs.length, 1);
  await first.release("stopped");
  const newer = await f.attach("new"); newer.noteRun("new-run");
  assert.equal(f.attached.length, 2); assert.equal(f.host.current("new-run", "new", "browser"), true);
});

test("APR-11: an original authority lost during driver discovery attaches nothing and frees its reservation", async t => {
  const page = driver(), f = assembly(t, page.surface), control = authority(), entered = deferred(), release = deferred();
  f.find(async () => { entered.resolve(); await release.promise; return page.surface; });
  const started = f.attach("session", control.control), refused = assert.rejects(started, /original authority expired/);
  await entered.promise; control.expire(); release.resolve(); await refused;
  assert.equal(f.attached.length, 0);
  const next = await f.attach("session"); next.noteRun("next"); assert.equal(f.host.current("next", "session", "browser"), true);
});

test("APR-11: closing the Surface owner rejects a delayed discovery without creating a target", async t => {
  const page = driver(), f = assembly(t, page.surface), entered = deferred(), release = deferred();
  f.find(async () => { entered.resolve(); await release.promise; return page.surface; });
  const started = f.attach("session"), refused = assert.rejects(started, /界面|原轮次/);
  await entered.promise; await f.host.close(); release.resolve(); await refused;
  assert.equal(f.attached.length, 0);
});

test("APR-11: failure naming a desktop round releases both exact targets before another round attaches", async t => {
  const page = driver(), desk = driver("desktop"), f = assembly(t, page.surface, desk.surface);
  desk.surface.describeRound = () => { throw new Error("original metadata unavailable"); };
  await assert.rejects(f.attach("session"), /original metadata unavailable/);
  assert.equal(f.targets.size, 0); assert.equal(page.releases.length, 1); assert.equal(desk.releases.length, 1);
  desk.surface.describeRound = () => {};
  const next = await f.attach("session"); next.noteRun("next");
  assert.deepEqual(next.surfaces, ["browser", "desktop"]); assert.equal(f.host.current("next", "session", "browser"), true);
});

for (const finish of ["release", "revoke"] as const) test(`APR-11: ${finish} during original text resource read sends no text to either round`, async t => {
  const page = driver(), f = assembly(t, page.surface), control = authority(), entered = deferred(), release = deferred();
  const old = await f.attach("session", control.control); old.noteRun("old");
  f.read(async () => { entered.resolve(); await release.promise; return "private old body"; });
  const action = f.attached[0]!.surface.perform({ what: "text", body: { kind: "resource", id: "old-body", revision: 1 } }, sdkTarget);
  const refused = assert.rejects(action, /原轮次|original authority/); await entered.promise;
  if (finish === "release") await old.release(); else control.expire();
  release.resolve(); await refused;
  await old.release(); const next = await f.attach("session"); next.noteRun("new");
  assert.deepEqual(page.inputs, []); assert.equal(f.host.current("new", "session", "browser"), true);
});

test("APR-11: authority loss during desktop assessment refuses work without inventing a terminal release", async t => {
  const desk = driver("desktop"), f = assembly(t, null, desk.surface), control = authority(), entered = deferred(), release = deferred();
  desk.surface.assess = async () => { entered.resolve(); await release.promise; return { irreversible: false, why: "local edit" }; };
  await f.attach("session", control.control);
  const result = f.attached[0]!.surface.assess!({ what: "key", keys: ["Enter"] }, { ...sdkTarget, scope: "io.fixture.editor" });
  const refused = assert.rejects(result, /original authority expired/);
  await entered.promise; control.expire(); release.resolve(); await refused;
  assert.equal(f.targets.size, 1); assert.equal(desk.releases.length, 0);
  assert.throws(() => f.attached[0]!.surface.assertCurrent!(), /original authority expired/);
  await f.host.close(); assert.equal(f.targets.size, 0); assert.equal(desk.releases.length, 1); assert.deepEqual(desk.inputs, []);
});

test("APR-13: a delayed approval description remains tied to its original Run and never reads the next focus", async t => {
  const page = driver(), f = assembly(t, page.surface), entered = deferred(), release = deferred();
  const first = await f.attach("session"); first.noteRun("old");
  const described: HostSurfaceContext[] = [];
  page.surface.focusedField = async context => { described.push(context); entered.resolve(); await release.promise; return { label: "Old field", sensitive: false }; };
  const review = (runId: string, index: number) => f.host.review(runId, "session", { kind: "effect", id: f.attached[index]!.id, revision: 1 },
    { surface: "browser", scope: sdkTarget.scope, action: "text" });
  const description = review("old", 0).describe("text", "type text", "old secret"), refused = assert.rejects(description, /原轮次/);
  await entered.promise; await first.release(); const second = await f.attach("session"); second.noteRun("new");
  release.resolve(); await refused; assert.equal(described.length, 1);
  assert.equal(f.host.current("old", "session", "browser"), false); assert.equal(f.host.current("new", "another-session", "browser"), false);
  const detail = await review("new", 1).describe("text", "type text", "new body");
  assert.match(detail.raw, /new body/); assert.notEqual(described[0], described[1]);
});

test("APR-11: failing cleanup stays retryable and does not report the shared driver as closed", async t => {
  const page = driver(), f = assembly(t, page.surface); let failure = true;
  page.surface.release = async context => { page.releases.push(context); if (failure) throw new Error("original cleanup failed"); };
  const first = await f.attach("session");
  await assert.rejects(first.release(), /原轮次界面尚未完成释放/);
  assert.equal(f.targets.size, 1); failure = false; await first.release(); assert.equal(f.targets.size, 0);
  assert.equal(page.releases[0], page.releases[1]);
  const next = await f.attach("session"); next.noteRun("new"); assert.equal(f.host.current("new", "session", "browser"), true);
});

async function until<T>(read: () => Promise<T | undefined>, message: string): Promise<T> {
  for (const limit = Date.now() + 12_000; ;) {
    const result = await read(); if (result !== undefined) return result;
    assert.ok(Date.now() < limit, message); await new Promise(resolve => setTimeout(resolve, 10));
  }
}

test("APR-11: actual Adapter credential failure after attach releases that Surface; the same session can start a fresh round", { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-surface-start-")), page = driver();
  let fail = true, modelCalls = 0;
  t.mock.method(globalThis, "fetch", async () => { modelCalls += 1; return cogniaScriptedResponse(undefined, "Finished."); });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.surface-start", appVersion: "1.0.0" }, storageRoot: root, reviewQueue: new AgentReviewQueue(),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential() { if (fail) throw new Error("credential temporarily unreadable"); return "test-only"; },
    surfaces: { driverFor: () => page.surface, siteDecisions: () => [] },
  });
  t.after(async () => { await adapter.close(); await rm(root, { recursive: true, force: true }); });
  const owner = { project_id: "project", plugin_id: "io.molis.work.test", install_id: "test", actor_id: "person" };
  const original = await adapter.createSession({ ...owner, workspace: "business", role_id: "helper", title: "Original Surface" });
  const role = { role_id: "helper", version: 1, workspace: "business" as const, execution: "operate" as const, prompts: [], host_tools: [] };
  const request = { ...owner, session: original, workspace: "business" as const, role_id: role.role_id, role, task: "Read this page." };
  await assert.rejects(adapter.start(request), /credential temporarily unreadable/);
  assert.equal(modelCalls, 0); assert.equal(page.releases.length, 1); assert.throws(() => page.releases[0]!.assertCurrent());
  fail = false;
  const started = await adapter.start(request);
  await until(async () => { const view = await adapter.read(started.ref); return view.phase === "completed" ? view : undefined; }, "fresh round did not finish");
  assert.equal(modelCalls, 1); assert.equal(page.releases.length, 2); assert.notEqual(page.releases[0], page.releases[1]);
});

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
function toolResult(body: Record<string, unknown>): string {
  const results: unknown[] = [];
  for (const message of Array.isArray(body.messages) ? body.messages : []) {
    if (record(message) && message.role === "user" && Array.isArray(message.content)) {
      for (const part of message.content) if (record(part) && part.type === "tool_result") results.push(part.content);
    }
  }
  return JSON.stringify(results.at(-1)) ?? "";
}
const targetId = (body: Record<string, unknown>, kind: "browser" | "desktop") => {
  const id = new RegExp(`([A-Za-z0-9_-]+) — ${kind}`, "u").exec(toolResult(body))?.[1];
  assert.ok(id, "the real SDK did not list its target"); return id;
};
const observationId = (body: Record<string, unknown>) => {
  const id = /observation ([A-Za-z0-9_-]+)/u.exec(toolResult(body))?.[1];
  assert.ok(id, "the real SDK did not return an observation"); return id;
};

async function sdkFixture(t: TestContext, surface: HostSurfaceDriver, script: (body: Record<string, unknown>, turn: number) => Response) {
  const root = await mkdtemp(join(tmpdir(), "molis-surface-round-")), queue = new AgentReviewQueue(); let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const raw = init.body;
    assert.ok(typeof raw === "string" || raw instanceof Uint8Array);
    const body: unknown = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    assert.ok(record(body)); return script(body, calls++);
  });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.surface-round", appVersion: "1.0.0" }, storageRoot: root, reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "test-only", surfaces: { driverFor: () => surface.kind === "browser" ? surface : null,
      ...(surface.kind === "desktop" ? { desktop: () => surface } : {}), siteDecisions: () => [] },
  });
  t.after(async () => { await adapter.close(); await rm(root, { recursive: true, force: true }); });
  const owner = { project_id: "project", plugin_id: "io.molis.work.test", install_id: "test", actor_id: "person" };
  const original = await adapter.createSession({ ...owner, workspace: "business", role_id: "helper", title: "Original Surface" });
  const role = { role_id: "helper", version: 1, workspace: "business" as const, execution: "operate" as const, prompts: [], host_tools: [] };
  const request = { ...owner, session: original, workspace: "business" as const, role_id: role.role_id, role, task: "Use the attached interface.", budget: { max_turns: 8 } };
  const finished = (ref: Parameters<typeof adapter.read>[0]) => until(async () => {
    const view = await adapter.read(ref); return ["completed", "failed", "cancelled", "stopped"].includes(view.phase) ? view : undefined;
  }, "real Surface Run did not settle");
  return { adapter, queue, owner, request, finished, root, calls: () => calls };
}

test("APR-11: the adopted SDK removes the old target and refuses its observation in the next real Run", { timeout: 30_000 }, async t => {
  const page = driver(); let originalTarget = "", originalObservation = "", secondResult = "";
  const f = await sdkFixture(t, page.surface, (body, turn) => {
    if (turn === 0 || turn === 3) return cogniaScriptedResponse({ name: "surface-list", input: {} });
    if (turn === 1) { originalTarget = targetId(body, "browser"); return cogniaScriptedResponse({ name: "surface-observe", input: { target: originalTarget, kind: "dom" } }); }
    if (turn === 2) { originalObservation = observationId(body); return cogniaScriptedResponse(); }
    if (turn === 4) {
      assert.notEqual(targetId(body, "browser"), originalTarget); assert.ok(!toolResult(body).includes(originalTarget));
      return cogniaScriptedResponse({ name: "surface-act", input: { observation: originalObservation, do: "key", keys: ["Enter"] } });
    }
    secondResult = toolResult(body); return cogniaScriptedResponse();
  });
  const first = await f.adapter.start(f.request); await f.finished(first.ref);
  assert.ok(originalTarget && originalObservation); assert.equal(page.releases.length, 1);
  const second = await f.adapter.start(f.request); await f.finished(second.ref);
  assert.equal(secondResult, JSON.stringify("UI_TARGET_UNAVAILABLE: That observation is not of an interface this session may use."));
  assert.equal(f.calls(), 6); assert.deepEqual(page.inputs, []); assert.equal(f.queue.list(f.owner.project_id, "pending").length, 0);
});

test("APR-11: actual SDK assessment fallback cannot create an approval after the original authority expires", { timeout: 30_000 }, async t => {
  const desk = driver("desktop"), entered = deferred(), release = deferred(); let active = true;
  t.after(() => release.resolve());
  desk.surface.assess = async () => { entered.resolve(); await release.promise; return { irreversible: false, why: "local edit" }; };
  const f = await sdkFixture(t, desk.surface, (body, turn) => turn === 0 ? cogniaScriptedResponse({ name: "surface-list", input: {} })
    : turn === 1 ? cogniaScriptedResponse({ name: "surface-observe", input: { target: targetId(body, "desktop"), kind: "accessibility-tree" } })
      : turn === 2 ? cogniaScriptedResponse({ name: "surface-act", input: { observation: observationId(body), do: "key", keys: ["Enter"] } }) : cogniaScriptedResponse());
  const run = await f.adapter.start(f.request, { assertBeforeDispatch() { if (!active) throw new Error("original authority expired"); } });
  await entered.promise; active = false; release.resolve(); await f.finished(run.ref);
  assert.equal(f.calls(), 3); assert.deepEqual(desk.inputs, []); assert.equal(desk.releases.length, 1);
  assert.equal(f.queue.list(f.owner.project_id, "pending").length, 0, "SDK assessment's fail-closed risk classification must not resurrect the original target");
});

for (const kind of ["browser", "desktop"] as const) for (const failure of ["expired", "unreadable", "missing", "sensitive"] as const) test(`APR-13 / BL-360: actual ${kind} approval is refusal-only when its description is ${failure}`, { timeout: 30_000 }, async t => {
  const page = driver(kind), entered = deferred(), release = deferred(); let active = true, focusReads = 0;
  t.after(() => release.resolve());
  page.surface.focusedField = async context => {
    context.assertCurrent(); focusReads += 1; entered.resolve(); await release.promise;
    if (failure === "unreadable") throw new Error("Original focus is unreadable");
    return { label: "Original field", sensitive: failure === "sensitive" };
  };
  if (failure === "missing") delete page.surface.focusedField;
  const secret = "private original message body";
  const f = await sdkFixture(t, page.surface, (body, turn) => turn === 0 ? cogniaScriptedResponse({ name: "surface-list", input: {} })
    : turn === 1 ? cogniaScriptedResponse({ name: "surface-observe", input: { target: targetId(body, kind), kind: "accessibility-tree" } })
      : turn === 2 ? cogniaScriptedResponse({ name: "surface-act", input: { observation: observationId(body), do: "text", text: secret } }) : cogniaScriptedResponse());
  const run = await f.adapter.start(f.request, { assertBeforeDispatch() { if (!active) throw new Error("original authority expired"); } });
  if (failure !== "missing") { await entered.promise; assert.equal(f.queue.list(f.owner.project_id, "pending").length, 0); }
  if (failure === "expired") active = false; release.resolve();
  const review = await until(async () => f.queue.list(f.owner.project_id, "pending")[0], "original waiter did not retain its refusal-only card");
  assert.equal(focusReads, failure === "missing" ? 0 : 1); assert.deepEqual(page.inputs, []);
  assert.ok(!JSON.stringify(review.document).includes(secret), "an invalidated review must not retain the staged typed body");
  if (review.document.kind === "tool-operation") assert.equal(review.document.round_allow, undefined);
  const available = await f.queue.decisions(review.review_id);
  assert.equal(available.approve.available, false); assert.equal(available.reject.available, true);
  for (const remember of [undefined, "app-this-round"] as const) {
    await assert.rejects(f.queue.respond({ review_id: review.review_id, version: review.reference.version,
      decision: "approve", actor_id: "person", ...(remember ? { remember } : {}) }), { code: "agent.review_not_permitted" });
    assert.equal(f.queue.receipt(review.review_id)?.status, "pending");
    assert.equal(f.queue.receipt(review.review_id)?.decided_at, null);
  }
  assert.equal((await f.queue.respond({ review_id: review.review_id, version: review.reference.version, decision: "reject", actor_id: "person" })).status, "rejected");
  await f.finished(run.ref); assert.deepEqual(page.inputs, []);

});

for (const ending of ["cancelled", "expired"] as const) for (const stage of ["document", "reference", "authority"] as const) test(`APR-13: ${ending} during approval ${stage} read publishes and saves no new review`, async () => {
  let time = Date.now(); const now = () => new Date(time);
  const queue = new AgentReviewQueue({ now }), entered = deferred(), release = deferred(); let active = true, saved = 0;
  const pending: ProloguePending = { ref: { kind: "pending", id: "original", revision: 1 }, kind: "effect-approval", state: "open", why: "Original request",
    effectRef: { kind: "effect", id: "effect", revision: 1 }, origin: { session: "session", run: "run" }, expiresAtWallMs: time + 60_000 };
  const hold = async (at: typeof stage) => { if (stage === at) { entered.resolve(); await release.promise; } };
  const bridge = new PrologueApprovalBridge({ queue, now, recordRequest: async () => { saved += 1; }, pendings: {
    read: async () => pending,
    async document() { await hold("document"); return { kind: "tool-operation", tool: "surface-act", summary: "Original request", fields: [] }; },
    async reference() { await hold("reference"); return { owner: { kind: "agent-review", project_id: "project", plugin_id: "plugin", install_id: "install" }, id: "original", version: "version" }; },
    async approvalAuthority() { await hold("authority"); return { beforeEffect() {}, assertCurrent() {} }; },
    canAnswer: () => active,
    answer: async () => { assert.fail("reading cannot answer the original approval"); },
  } });
  try {
    const mirrored = bridge.mirrorPending({ pendingRef: pending.ref, owner: { project_id: "project", plugin_id: "plugin" }, run: { session_id: "session", run_id: "run" } });
    const refused = assert.rejects(mirrored, { code: "agent.pending_not_open" });
    await entered.promise; if (ending === "cancelled") active = false; else time = pending.expiresAtWallMs;
    release.resolve(); await refused;
    assert.equal(queue.list("project").length, 0); assert.equal(saved, 0);
  } finally { release.resolve(); await bridge.close(); }
});

for (const node of ["missing", "unreadable", "coordinates"] as const) test(`APR-13: browser ${node} target is approved only when the exact intended point is reviewable`, { timeout: 30_000 }, async t => {
  const page = driver();
  if (node === "unreadable") page.surface.describeNode = async () => { throw new Error("Original node is gone"); };
  const f = await sdkFixture(t, page.surface, (body, turn) => turn === 0 ? cogniaScriptedResponse({ name: "surface-list", input: {} })
    : turn === 1 ? cogniaScriptedResponse({ name: "surface-observe", input: { target: targetId(body, "browser"), kind: "dom" } })
      : turn === 2 ? cogniaScriptedResponse({ name: "surface-act", input: { observation: observationId(body), do: "pointer", x: 20, y: 30,
        ...(node === "coordinates" ? {} : { node: "original-node" }) } }) : cogniaScriptedResponse());
  const run = await f.adapter.start(f.request);
  const review = await until(async () => f.queue.list(f.owner.project_id, "pending")[0], "original pointer review did not appear");
  const available = await f.queue.decisions(review.review_id);
  assert.equal(available.approve.available, node === "coordinates"); assert.equal(available.reject.available, true);
  if (node !== "coordinates") {
    await assert.rejects(f.queue.respond({ review_id: review.review_id, version: review.reference.version, decision: "approve", actor_id: "person" }), { code: "agent.review_not_permitted" });
    assert.equal(f.queue.receipt(review.review_id)?.status, "pending"); assert.equal(f.queue.receipt(review.review_id)?.decided_at, null);
  } else assert.match(JSON.stringify(review.document), /20.*30/u);
  await f.queue.respond({ review_id: review.review_id, version: review.reference.version, decision: node === "coordinates" ? "approve" : "reject", actor_id: "person" });
  await f.finished(run.ref); assert.equal(page.inputs.length, node === "coordinates" ? 1 : 0);
});

test("APR-11 / BL-360: a failed stop save keeps the original Surface and waiter; only new approval is fenced while stopping", { timeout: 30_000 }, async t => {
  const page = driver(), entered = deferred(), release = deferred(); t.after(() => release.resolve());
  const f = await sdkFixture(t, page.surface, (body, turn) => turn === 0 ? cogniaScriptedResponse({ name: "surface-list", input: {} })
    : turn === 1 ? cogniaScriptedResponse({ name: "surface-observe", input: { target: targetId(body, "browser"), kind: "dom" } })
      : turn === 2 ? cogniaScriptedResponse({ name: "surface-act", input: { observation: observationId(body), do: "key", keys: ["Enter"] } }) : cogniaScriptedResponse());
  const run = await f.adapter.start(f.request);
  const review = await until(async () => f.queue.list(f.owner.project_id, "pending")[0], "original review did not appear");
  const context = page.reads[0]!;
  const saveFailure = new Error("stop intent save refused");
  const stopping = f.adapter.withEffect({ async beforeEffect() { entered.resolve(); await release.promise; throw saveFailure; }, assert_current() {} },
    () => f.adapter.control(run.ref, { kind: "stop" }));
  const failed = assert.rejects(stopping, error => error instanceof Error && "code" in error && error.code === "agent.control_failed" && error.cause === saveFailure);
  await entered.promise;
  assert.throws(() => context.assertCurrent(), /正在停止/);
  assert.equal(page.releases.length, 0);
  const temporarily = await f.queue.decisions(review.review_id);
  assert.equal(temporarily.approve.available, false); assert.equal(temporarily.reject.available, true);
  release.resolve(); await failed;
  context.assertCurrent(); assert.equal(page.releases.length, 0);
  assert.equal((await f.queue.decisions(review.review_id)).approve.available, true);
  await f.queue.respond({ review_id: review.review_id, version: review.reference.version, decision: "approve", actor_id: "person" });
  assert.equal((await f.finished(run.ref)).phase, "completed");
  assert.deepEqual(page.inputs, [context]); assert.equal(page.releases.length, 1);
});

test("APR-13: an otherwise approvable browser card refuses a forged app-this-round option before saving any decision", { timeout: 30_000 }, async t => {
  const page = driver();
  const f = await sdkFixture(t, page.surface, (body, turn) => turn === 0 ? cogniaScriptedResponse({ name: "surface-list", input: {} })
    : turn === 1 ? cogniaScriptedResponse({ name: "surface-observe", input: { target: targetId(body, "browser"), kind: "dom" } })
      : turn === 2 ? cogniaScriptedResponse({ name: "surface-act", input: { observation: observationId(body), do: "key", keys: ["Enter"] } }) : cogniaScriptedResponse());
  const run = await f.adapter.start(f.request);
  const review = await until(async () => f.queue.list(f.owner.project_id, "pending")[0], "original review did not appear");
  assert.equal((await f.queue.decisions(review.review_id)).approve.available, true);
  await assert.rejects(f.queue.respond({ review_id: review.review_id, version: review.reference.version, decision: "approve", actor_id: "person", remember: "app-this-round" }), { code: "agent.review_not_permitted" });
  assert.equal(f.queue.receipt(review.review_id)?.status, "pending"); assert.equal(f.queue.receipt(review.review_id)?.decided_at, null); assert.deepEqual(page.inputs, []);
  await f.queue.respond({ review_id: review.review_id, version: review.reference.version, decision: "approve", actor_id: "person" });
  await f.finished(run.ref); assert.equal(page.inputs.length, 1);
});


test("APR-13: cancelled pending projection is refused at the original session index queue after an earlier write settles", { timeout: 30_000 }, async t => {
  const page = driver(), focusEntered = deferred(), focusRelease = deferred(), writeEntered = deferred(), writeRelease = deferred();
  t.after(() => { focusRelease.resolve(); writeRelease.resolve(); });
  page.surface.focusedField = async () => { focusEntered.resolve(); await focusRelease.promise; return { label: "Original", sensitive: false }; };
  const f = await sdkFixture(t, page.surface, (body, turn) => turn === 0 ? cogniaScriptedResponse({ name: "surface-list", input: {} })
    : turn === 1 ? cogniaScriptedResponse({ name: "surface-observe", input: { target: targetId(body, "browser"), kind: "dom" } })
      : turn === 2 ? cogniaScriptedResponse({ name: "surface-act", input: { observation: observationId(body), do: "text", text: "Original draft" } }) : cogniaScriptedResponse());
  const run = await f.adapter.start(f.request); await focusEntered.promise;
  const stopping = f.adapter.withEffect({ async beforeEffect() { writeEntered.resolve(); await writeRelease.promise; }, assert_current() {} },
    () => f.adapter.control(run.ref, { kind: "stop" }));
  await writeEntered.promise; focusRelease.resolve();
  const review = await until(async () => f.queue.list(f.owner.project_id, "pending")[0], "refusal-only card did not appear while original index write was held");
  f.queue.cancel(review.review_id, "Original pending ended while its projection was queued");
  writeRelease.resolve(); await stopping; await f.finished(run.ref); await f.adapter.close();
  const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
  const sdk: { createNodeHost(input: { storageRoot: string }): { storage: { readSecure(input: { kind: string; id: string }): Promise<Uint8Array> } } } = await import(requireSdk.resolve("@prologue/sdk/node"));
  const kind = `molis-agent-index-${createHash("sha256").update("io.molis.work.surface-round").digest("hex").slice(0, 24)}`;
  const bytes = await sdk.createNodeHost({ storageRoot: f.root }).storage.readSecure({ kind, id: run.ref.session_id });
  try {
    const saved: unknown = JSON.parse(new TextDecoder().decode(bytes)); assert.ok(record(saved));
    const decisions = saved.review_decisions; assert.ok(decisions === undefined || record(decisions));
    assert.equal(decisions?.[review.review_id.slice("prologue:".length)], undefined, "a cancelled projection must not be newly persisted as pending");
  } finally { bytes.fill(0); }
  assert.deepEqual(page.inputs, []);
});

test("APR-13: an accepted desktop app-this-round choice is installed against its original binding after the pending settles", { timeout: 30_000 }, async t => {
  const desk = driver("desktop"); let observation = "";
  const f = await sdkFixture(t, desk.surface, (body, turn) => {
    if (turn === 0) return cogniaScriptedResponse({ name: "surface-list", input: {} });
    if (turn === 1) return cogniaScriptedResponse({ name: "surface-observe", input: { target: targetId(body, "desktop"), kind: "accessibility-tree" } });
    if (turn === 2) { observation = observationId(body); return cogniaScriptedResponse({ name: "surface-act", input: { observation, do: "key", keys: ["Enter"] } }); }
    if (turn === 3) return cogniaScriptedResponse({ name: "surface-act", input: { observation, do: "key", keys: ["Tab"] } });
    return cogniaScriptedResponse();
  });
  const run = await f.adapter.start(f.request);
  const review = await until(async () => f.queue.list(f.owner.project_id, "pending")[0], "desktop review did not appear");
  assert.ok(review.document.kind === "tool-operation" && review.document.round_allow);
  const receipt = await f.queue.respond({ review_id: review.review_id, version: review.reference.version, decision: "approve", actor_id: "person", remember: "app-this-round" });
  assert.equal(receipt.remember_error, undefined);
  await f.finished(run.ref); assert.equal(desk.inputs.length, 2); assert.equal(desk.inputs[0], desk.inputs[1]);
  assert.equal(f.queue.list(f.owner.project_id).length, 1);
});

test("APR-13: the person reviews the entire long text including its tail before that exact text reaches the driver", { timeout: 30_000 }, async t => {
  const page = driver(), body = "Original input. ".repeat(200) + "UNIQUE-END-OF-REVIEW", typed: string[] = [];
  page.surface.perform = async (action, context) => { context.assertCurrent(); assert.equal(action.what, "text"); if (action.what === "text") typed.push(action.text); };
  const f = await sdkFixture(t, page.surface, (request, turn) => turn === 0 ? cogniaScriptedResponse({ name: "surface-list", input: {} })
    : turn === 1 ? cogniaScriptedResponse({ name: "surface-observe", input: { target: targetId(request, "browser"), kind: "dom" } })
      : turn === 2 ? cogniaScriptedResponse({ name: "surface-act", input: { observation: observationId(request), do: "text", text: body } }) : cogniaScriptedResponse());
  const run = await f.adapter.start(f.request);
  const review = await until(async () => f.queue.list(f.owner.project_id, "pending")[0], "complete long-input review did not appear");
  assert.ok(JSON.stringify(review.document).includes(body), "the card must contain the complete proposed input, including text after character 2000");
  assert.deepEqual(typed, []);
  await f.queue.respond({ review_id: review.review_id, version: review.reference.version, decision: "approve", actor_id: "person" });
  await f.finished(run.ref); assert.deepEqual(typed, [body]);
});

for (const irreversible of [false, true]) test(`APR-13: a desktop node approval preserves its exact selector and irreversible=${irreversible} warning before input`, { timeout: 30_000 }, async t => {
  const desk = driver("desktop"), selector = "按钮:保存", selected: string[] = [];
  desk.surface.assess = async () => ({ irreversible, why: "Sends the prepared message" });
  desk.surface.perform = async (action, context) => { context.assertCurrent(); assert.equal(action.what, "pointer"); if (action.what === "pointer") selected.push(action.node!); };
  const f = await sdkFixture(t, desk.surface, (request, turn) => turn === 0 ? cogniaScriptedResponse({ name: "surface-list", input: {} })
    : turn === 1 ? cogniaScriptedResponse({ name: "surface-observe", input: { target: targetId(request, "desktop"), kind: "accessibility-tree" } })
      : turn === 2 ? cogniaScriptedResponse({ name: "surface-act", input: { observation: observationId(request), do: "pointer", node: selector, x: 0, y: 0 } }) : cogniaScriptedResponse());
  const run = await f.adapter.start(f.request);
  const review = await until(async () => f.queue.list(f.owner.project_id, "pending")[0], "desktop selector review did not appear");
  assert.ok(JSON.stringify(review.document).includes(selector)); assert.deepEqual(selected, []);
  if (irreversible) { assert.match(JSON.stringify(review.document), /IRREVERSIBLE/u); assert.ok(review.document.kind === "tool-operation"); assert.equal(review.document.round_allow, undefined); }
  await f.queue.respond({ review_id: review.review_id, version: review.reference.version, decision: "approve", actor_id: "person" });
  await f.finished(run.ref); assert.deepEqual(selected, [selector]);
});

test("APR-13: fractional and negative coordinates retain their exact position in the review", async t => {
  const page = driver(), desk = driver("desktop"), f = assembly(t, page.surface, desk.surface);
  const attached = await f.attach("session"); attached.noteRun("run");
  const summary = "click (1×left) at -1.5,0.25";
  const review = (index: number, kind: "browser" | "desktop", scope: string) =>
    f.host.review("run", "session", { kind: "effect", id: f.attached[index]!.id, revision: 1 }, { surface: kind, scope, action: "pointer" });
  const browserTarget = review(0, "browser", "https://example.com"), desktopTarget = review(1, "desktop", "io.fixture.editor");
  const browser = await browserTarget.describe("pointer", summary), desktop = await desktopTarget.describe("pointer", summary);
  assert.match(browser.raw, /-1\.5.*0\.25/u); assert.match(desktop.raw, /-1\.5.*0\.25/u);
  const odd = await browserTarget.describe("pointer", "click (1×left) at unknown-original-point");
  assert.equal(odd.raw, "click (1×left) at unknown-original-point");
  const named = await desktopTarget.describe("pointer", "click node 按钮:Save draft (1×left); the point is read from the tree at injection");
  assert.match(named.raw, /按钮:Save draft/u);
  const triple = await desktopTarget.describe("pointer", "click node 按钮:保存 (3×middle); the point is read from the tree at injection");
  assert.match(triple.raw, /3×middle.*按钮:保存/u);
  const doubleRight = await browserTarget.describe("pointer", "click (2×right) at -1.5,0.25");
  assert.match(doubleRight.raw, /2×right.*-1\.5.*0\.25/u);
});

test("APR-11: a failed Surface close still drains the actual SDK and retains ownership until explicit successful cleanup", { timeout: 30_000 }, async t => {
  const page = driver(), failure = new Error("original driver temporarily unavailable");
  page.surface.release = async context => { page.releases.push(context); if (page.releases.length === 1) throw failure; };
  const f = await sdkFixture(t, page.surface, (body, turn) => turn === 0 ? cogniaScriptedResponse({ name: "surface-list", input: {} })
    : turn === 1 ? cogniaScriptedResponse({ name: "surface-observe", input: { target: targetId(body, "browser"), kind: "dom" } })
      : turn === 2 ? cogniaScriptedResponse({ name: "surface-act", input: { observation: observationId(body), do: "key", keys: ["Enter"] } }) : cogniaScriptedResponse());
  await f.adapter.start(f.request);
  await until(async () => f.queue.list(f.owner.project_id, "pending")[0], "original review did not appear");
  const includesFailure = (error: unknown): boolean => error === failure || error instanceof AggregateError && error.errors.some(includesFailure);
  await assert.rejects(f.adapter.close(), includesFailure);
  assert.ok("diagnostics" in f.adapter && typeof f.adapter.diagnostics === "function");
  assert.equal(f.adapter.diagnostics().state, "stopped", "Surface failure cannot skip the SDK final drain");
  assert.equal(page.releases.length, 2); assert.equal(page.releases[0], page.releases[1]); assert.deepEqual(page.inputs, []);
  const reopen = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work.surface-round", appVersion: "1.0.0" }, storageRoot: f.root,
    modelConfiguration: async () => { throw new Error("Closing must not request a model"); } });
  const busy = reopen(); await assert.rejects(busy, { code: "agent.storage_busy" }); await busy.close();
  await f.adapter.close(); assert.equal(page.releases.length, 2, "completed driver cleanup must not repeat");
  const next = await reopen(); await next.close();
});

test("APR-11: a dependent Git owner failing after Surface cleanup leaves its actual SDK usable for explicit retry", { timeout: 30_000 }, async t => {
  const page = driver(), failure = new Error("Original Git owner is not finished");
  page.surface.release = async context => { page.releases.push(context); if (page.releases.length === 1) throw new Error("Original Surface cleanup failed"); };
  const f = await sdkFixture(t, page.surface, (body, turn) => turn === 0 ? cogniaScriptedResponse({ name: "surface-list", input: {} })
    : turn === 1 ? cogniaScriptedResponse({ name: "surface-observe", input: { target: targetId(body, "browser"), kind: "dom" } })
      : turn === 2 ? cogniaScriptedResponse({ name: "surface-act", input: { observation: observationId(body), do: "key", keys: ["Enter"] } }) : cogniaScriptedResponse());
  await f.adapter.start(f.request);
  await until(async () => f.queue.list(f.owner.project_id, "pending")[0], "original review did not appear");
  assert.ok(f.adapter.gitReviews);
  const closeGit = f.adapter.gitReviews.close.bind(f.adapter.gitReviews); let attempts = 0;
  f.adapter.gitReviews.close = async () => { if (++attempts === 1) throw failure; await closeGit(); };
  const includesFailure = (error: unknown): boolean => error === failure || error instanceof AggregateError && error.errors.some(includesFailure);
  await assert.rejects(f.adapter.close(), includesFailure);
  assert.equal(page.releases.length, 1, "the SDK drain must not run while Git still needs it");
  assert.ok("diagnostics" in f.adapter && typeof f.adapter.diagnostics === "function");
  assert.equal(f.adapter.diagnostics().state, "ready");
  const next = await f.adapter.createSession({ ...f.owner, workspace: "business", role_id: "helper", title: "Original runtime remains usable" });
  assert.ok(next.session_id);
  await f.adapter.close(); assert.equal(attempts, 2); assert.equal(page.releases.length, 2); assert.deepEqual(page.inputs, []);
});
