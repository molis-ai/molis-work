import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createPrologueNodeAdapter, AgentHost, AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";
import { ASSISTANT_STORE_BASELINE, AssistantService, AssistantStore, assistantServiceFor, closeAssistantService, assistantSettingActions, assistantSettingOwner, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentContinuationStarter } from "@molis-ai/molis-work-contracts/services/agent-collaboration";

import { setTimeout as delay } from "node:timers/promises";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { OVERVIEW_PROVIDER_ID, overviewReadAction } from "@molis-ai/molis-work-contracts/platform/plugin";
import { todoActions } from "@molis-ai/molis-work-plugin-todo";
import { openTestHome } from "./fixtures/test-home.js";
import { answeringEndingReviews } from "./fixtures/ending-review.js";
import { cogniaScriptedResponse as respond } from "./fixtures/cognia-model-response.js";

test("ASC-18: rejecting controls on an idle work changes neither its stored choice nor its setup requests", async () => {
  const db = new DatabaseSync(":memory:"), store = new AssistantStore(db);
  let cancellations = 0;
  const host = new AgentHost({ reviews: new AgentReviewQueue() });
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => host,
    authority: async () => { throw new Error("No round should start"); }, cancelSetups: () => { cancellations++; } }, "user");
  const work = store.create({ actor_id: "user", title: "Untouched work", scope: { kind: "personal" }, origin: null });
  try {
    for (const kind of ["pause", "resume", "stop"] as const) {
      await assert.rejects(service.control(work.work_id, { kind }), /没有在执行或等待的工作/);
      assert.deepEqual(store.get("user", work.work_id), work, `${kind} is rejected without changing the work revision or future continuation`);
      assert.equal(cancellations, 0);
    }
  } finally { service.continuations.close(); db.close(); }
});

test("ASC-34: a failed latest Send keeps a durable pause and draft, including when setup ownership cannot be held", async () => {
  for (const holdFails of [false, true]) {
    const db = new DatabaseSync(":memory:"), store = new AssistantStore(db);
    const ports = { pages: async () => ["home"], host: async (): Promise<AgentHost> => { throw new Error("runtime unavailable"); },
      authority: async () => { throw new Error("must not dispatch"); },
      holdSetups: () => { if (holdFails) throw new Error("setup storage unavailable"); } };
    const service = new AssistantService(store, ports, "user");
    const work = store.create({ actor_id: "user", title: "Waiting work", scope: { kind: "personal" }, origin: null });
    store.update("user", work.work_id, null, { session_id: "waiting-session" });
    try {
      await assert.rejects(service.send({ work_id: work.work_id, request_id: `latest-${holdFails}`, text: "只查资料，别保存" }, {}));
      const saved = store.get("user", work.work_id);
      assert.equal(saved.continuation_hold, "input"); assert.equal(saved.draft, "只查资料，别保存");
      service.continuations.close();
      const restarted = new AssistantService(new AssistantStore(db), ports, "user");
      try {
        assert.equal(restarted.continuations.pending(), false, "restart must not launch the old eligible wait");
        assert.equal(await restarted.continuations.state(saved, "completed"), "paused");
      } finally { restarted.continuations.close(); }
    } finally { service.continuations.close(); db.close(); }
  }
});

test("ASC-34: an earlier Send failing after a newer accepted input cannot replace its draft or pause it", async () => {
  const db = new DatabaseSync(":memory:"), store = new AssistantStore(db);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const host = new AgentHost({ reviews: new AgentReviewQueue() });
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => host,
    authority: async () => { throw new Error("must not dispatch old input"); },
    characters: async () => { entered.resolve(); await release.promise; throw new Error("old character lookup failed"); } }, "user");
  const work = store.create({ actor_id: "user", title: "Waiting work", scope: { kind: "project", project_id: "project" },
    project_ref: { project_id: "project", storage_key: "memory:project" }, origin: null });
  try {
    const earlier = assert.rejects(service.send({ work_id: work.work_id, request_id: "earlier-input", text: "Old request", character: { kind: "project", member_id: "character" } }, {}));
    await entered.promise;
    const later = service.continuations.begin(store.get("user", work.work_id), "New draft");
    later.accept(); later.end();
    release.resolve(); await earlier;
    const saved = store.get("user", work.work_id);
    assert.equal(saved.draft, "New draft"); assert.equal(saved.continuation_hold, undefined);
    const failed = service.continuations.begin(saved, "Newest unsent input");
    failed.end();
    assert.equal(store.get("user", work.work_id).continuation_hold, "input");
  } finally { release.resolve(); service.continuations.close(); db.close(); }
});

test("B10-R3: a late failed Send preserves a newer saved or explicitly cleared draft", async () => {
  for (const newer of ["New durable draft", ""]) {
    const db = new DatabaseSync(":memory:"), store = new AssistantStore(db);
    const service = new AssistantService(store, { pages: async () => ["home"], host: async () => { throw new Error("runtime unavailable"); },
      authority: async () => { throw new Error("must not dispatch"); } }, "user");
    try {
      const work = store.create({ actor_id: "user", title: "Draft owner", scope: { kind: "personal" }, origin: null });
      const original = service.saveDraft(work.work_id, "Old unsent text");
      service.saveDraft(work.work_id, newer);
      await assert.rejects(service.send({ work_id: work.work_id, text: "Old unsent text", request_id: "late-draft-request", draft_revision: original.draft_revision }, {}));
      assert.equal(store.get("user", work.work_id).draft, newer, "neither the input hold nor the failure writes an older draft");
      assert.equal(store.rounds(work.work_id).length, 0);
    } finally { service.continuations.close(); db.close(); }
  }
});

test("ASC-34: a newer Send whose setup hold fails invalidates the older Send before failure and preserves its own draft", () => {
  const db = new DatabaseSync(":memory:"), store = new AssistantStore(db);
  const host = new AgentHost({ reviews: new AgentReviewQueue() });
  let holds = 0;
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => host,
    authority: async () => { throw new Error("No round should start"); }, holdSetups: () => {
      if (++holds === 2) {
        assert.equal(first.current(), false, "the old Send loses authority before the new setup hold runs");
        throw new Error("setup storage unavailable");
      }
    } }, "user");
  const work = store.create({ actor_id: "user", title: "Waiting work", scope: { kind: "personal" }, origin: null });
  const first = service.continuations.begin(store.update("user", work.work_id, null, { session_id: "waiting-session" }), "First draft");
  try {
    assert.throws(() => service.continuations.begin(store.get("user", work.work_id), "Newer unsent draft"), /setup storage unavailable/);
    assert.equal(first.current(), false, "failure must not restore the earlier Send's authority");
    assert.equal(service.continuations.currentInput(work.work_id)(), false, "the failed new Send leaves no live token");
    const saved = store.get("user", work.work_id);
    assert.equal(saved.continuation_hold, "input"); assert.equal(saved.draft, "Newer unsent draft");
    first.accept(); first.end();
    assert.deepEqual(store.get("user", work.work_id), saved, "late acceptance cannot clear the failed newer input or change its revision");
    assert.equal(service.continuations.pending(), false);
  } finally { service.continuations.close(); db.close(); }
});

// PWA-136: a late acceptance does not resume a work its parent stopped.
test("ASC-34: late Send acceptance preserves a delegated work stopped directly by its parent", async () => {
  const db = new DatabaseSync(":memory:"), store = new AssistantStore(db);
  const host = new AgentHost({ reviews: new AgentReviewQueue() });
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => host,
    authority: async () => { throw new Error("No round should start"); } }, "user");
  const work = store.create({ actor_id: "user", title: "Child work", scope: { kind: "personal" }, origin: null,
    delegated_by: { graph_id: "parent-graph", node_id: "child", title: "Parent work", acceptance: "Return findings" } });
  const input = service.continuations.begin(work, "Continue the child");
  try {
    // Parent stop writes each child's durable hold directly; it does not invalidate the child's Send token.
    const stopped = store.update("user", work.work_id, null, { continuation_hold: "stopped" }, false);
    assert.equal(input.current(), true);
    input.accept(); input.end();
    assert.deepEqual(store.get("user", work.work_id), stopped, "acceptance cannot erase a stop written after Send began");
    assert.equal(await service.continuations.state(stopped, "completed"), "stopped");
    assert.equal(service.continuations.pending(), false);
  } finally { service.continuations.close(); db.close(); }
});


test("ASC-36: explicit keep-connections stops and withdraws business before retaining setups; default stop cancels", async t => {
  const home = await mkdtemp(join(tmpdir(), "assistant-control-keep-"));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.keep-control", appVersion: "1.0.0" }, storageRoot: home, reviewQueue: queue,
    modelConfiguration: async () => null, resolveCredential: () => null });
  host.register(adapter);
  const db = new DatabaseSync(":memory:"), store = new AssistantStore(db), events: string[] = [];
  let workId = "";
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => host, authority: async () => { throw new Error("No business round may start"); },
    cancelSetups: () => { events.push("cancel"); }, retainSetups: async () => {
      assert.equal(store.get("user", workId).continuation_hold, "stopped"); assert.ok(events.includes("withdraw")); events.push("retain");
    } }, "user");
  // The SDK wait mechanism has separate live coverage; this test isolates the control/owner ordering.
  t.mock.method(service.continuations, "view", async () => ({ wait: { wait_id: "control-fixture", state: "waiting" } }));
  t.mock.method(service.continuations, "withdraw", async () => { events.push("withdraw"); return true; });
  try {
    for (const keep of [true, false]) {
      const work = store.create({ actor_id: "user", title: "Waiting connection", scope: { kind: "personal" }, origin: null }); workId = work.work_id;
      const session = await adapter.createSession({ project_id: "assistant-personal", plugin_id: "system.assistant", actor_id: "user", install_id: "assistant",
        directory: { canonical_path: home, realpath_verified: true }, title: work.title });
      store.update("user", workId, null, { session_id: session.session_id }); events.length = 0;
      const stopped = await service.control(workId, { kind: "stop", ...(keep ? { keep_connections: true } : {}) });
      assert.equal(stopped.work.state, "stopped"); assert.equal(service.continuations.pending(), false);
      assert.deepEqual(events, keep ? ["withdraw", "retain"] : ["cancel", "withdraw"]);
    }
    for (const input of [{ kind: "stop", keep_connections: "yes" }, { kind: "pause", keep_connections: true }]) {
      await assert.rejects(service.control(workId, input as never), /明确选择/);
    }
  } finally { service.continuations.close(); db.close(); await adapter.close(); await rm(home, { recursive: true, force: true }); }
});

test("ASC-18 ASC-25: closing the Assistant withdraws its continuation starter and does not serve it again on later store changes", async t => {
  const directory = await mkdtemp(join(tmpdir(), "assistant-watcher-close-"));
  const host = new AgentHost({ reviews: new AgentReviewQueue() });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.wait-close", appVersion: "1.0.0" }, storageRoot: directory,
    modelConfiguration: async () => null, resolveCredential: () => null });
  host.register(adapter);
  // The starter the Home serves to the runtime, as the runtime holds it.
  let starter: AgentContinuationStarter | undefined;
  const serving = t.mock.method(adapter.collaboration!, "serveStarts", (served: AgentContinuationStarter) => { starter = served; return () => {}; });
  const db = new DatabaseSync(":memory:"), store = new AssistantStore(db);
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => host, authority: async () => { throw new Error("No round should start"); } }, "user");
  const ask = () => starter!({ runtime_id: "prologue", project_id: ASSISTANT_PERSONAL_OWNER, session_id: "owned-session", owner: { plugin_id: ASSISTANT_PLUGIN_ID, install_id: "assistant" },
    request_key: "k", wait_id: "w", graph_id: "g", node_id: "n" });
  try {
    const work = store.create({ actor_id: "user", title: "Pending work", scope: { kind: "personal" }, origin: null });
    store.update("user", work.work_id, null, { session_id: "owned-session" });
    service.continuations.attach();
    for (let i = 0; i < 100 && !starter; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(starter, "the Assistant serves the Home's starter");
    assert.notDeepEqual(await ask(), { later: { code: "assistant.not_attached" } }, "the Assistant answers while attached");
    service.continuations.close();
    assert.deepEqual(await ask(), { later: { code: "assistant.not_attached" } }, "closed, it answers no start");
    store.update("user", work.work_id, null, { title: "A later change" });
    service.continuations.attach();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(await ask(), { later: { code: "assistant.not_attached" } }, "the closed owner does not serve again");
    assert.equal(serving.mock.callCount(), 1, "the runtime was served one starter");
  } finally { service.continuations.close(); await adapter.close(); db.close(); await rm(directory, { recursive: true, force: true }); }
});

for (const change of ["close", "latest-input"] as const) test(`ASC-18 ASC-34: a terminal status read finishing after ${change} cannot overwrite the work`, { timeout: 10_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "assistant-late-status-"));
  const host = new AgentHost({ reviews: new AgentReviewQueue() });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.late-status", appVersion: "1.0.0" }, storageRoot: directory,
    modelConfiguration: async () => null, resolveCredential: () => null });
  host.register(adapter);
  const db = new DatabaseSync(":memory:"), store = new AssistantStore(db);
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => host, authority: async () => { throw new Error("No round should start"); } }, "user");
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const observer = Promise.withResolvers<Parameters<typeof adapter.observe>[1]>();
  t.mock.method(adapter, "observe", (_run, callback) => { observer.resolve(callback); return () => {}; });
  t.mock.method(service.continuations, "state", async () => { entered.resolve(); await release.promise; return "completed" as const; });
  try {
    const session = await adapter.createSession({ project_id: "assistant-personal", plugin_id: "system.assistant", actor_id: "user", install_id: "assistant",
      directory: { canonical_path: directory, realpath_verified: true }, title: change });
    const work = store.create({ actor_id: "user", title: change, scope: { kind: "personal" }, origin: null });
    const saved = store.update("user", work.work_id, null, { session_id: session.session_id });
    store.observed.set("user", work.work_id, "running");
    service.continuations.watch(saved, { runtime_id: "prologue", session_id: session.session_id, run_id: "finished-round" });
    // Freeze the read after the terminal notification; the production callback still owns the eventual write.
    (await observer.promise)({ phase: "completed" } as never);
    await entered.promise;
    if (change === "close") service.continuations.close();
    else store.update("user", work.work_id, null, { continuation_hold: "paused", draft: "Newest intent" });
    release.resolve(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(store.observed.of("user", work.work_id), "running", "the obsolete observation must not be committed");
    assert.deepEqual(service.notices.notices(null), [], "there is no false completed notification");
    if (change === "latest-input") assert.equal(store.get("user", work.work_id).draft, "Newest intent");
  } finally { release.resolve(); service.continuations.close(); await adapter.close(); db.close(); await rm(directory, { recursive: true, force: true }); }
});


test("B10-R3: draft generations distinguish same-text rewrites from unrelated work updates", () => {
  const db = new DatabaseSync(":memory:"), store = new AssistantStore(db);
  try {
    const work = store.create({ actor_id: "user", title: "Draft generations", scope: { kind: "personal" }, origin: null });
    const first = store.update("user", work.work_id, null, { draft: "X" });
    const title = store.update("user", work.work_id, null, { title: "Renamed" });
    assert.equal(title.draft_revision, first.draft_revision);
    store.update("user", work.work_id, null, { draft: "" });
    const retyped = store.update("user", work.work_id, null, { draft: "X" });
    assert.equal(retyped.draft_revision, first.draft_revision + 2);
    assert.equal(retyped.draft, first.draft);
  } finally { db.close(); }
});

test("B10-R3: the current version works and saved send receipts survive a real database reopen without writes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "assistant-v1-reopen-")), file = join(directory, "assistant.db");
  let db = new DatabaseSync(file);
  const store = new AssistantStore(db), host = new AgentHost({ reviews: new AgentReviewQueue() });
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => host,
    authority: async () => { throw new Error("This storage check starts no model"); } }, "user");
  try {
    const work = store.create({ actor_id: "user", title: "Durable draft", scope: { kind: "personal" }, origin: null });
    const originalDraft = service.saveDraft(work.work_id, "Keep this draft");
    service.saveDraft(work.work_id, "");
    const view = service.saveDraft(work.work_id, "Keep this draft");
    assert.equal(service.saveDraft(work.work_id, "", originalDraft.draft_revision).draft, "Keep this draft");
    assert.equal(service.saveDraft(work.work_id, "", originalDraft.draft_revision).draft_revision, view.draft_revision);
    assert.equal(view.draft_revision, 4, "create plus three real draft edits, including the same-text new generation");
    assert.deepEqual(store.requests.claimRequest("user", "v1-reopen-request"), { claimed: true });
    const receipt = { work: view, outcome: "queued" as const, submission_id: "v1-reopen-content" };
    store.requests.finishRequest("user", "v1-reopen-request", receipt);
    const saved = store.get("user", work.work_id);
    service.continuations.close(); db.close();
    const bytes = await readFile(file);
    db = new DatabaseSync(file);
    assert.equal(ASSISTANT_STORE_BASELINE.version, 1);
    assert.deepEqual(ASSISTANT_STORE_BASELINE.upgrades ?? [], []);
    const changes = db.prepare("SELECT total_changes() AS count").get()!.count;
    const reopened = new AssistantStore(db);
    assert.deepEqual(reopened.get("user", work.work_id), saved);
    assert.equal(reopened.get("user", work.work_id).draft, "Keep this draft");
    assert.equal(reopened.get("user", work.work_id).draft_revision, 4);
    assert.deepEqual(reopened.requests.read("user", "v1-reopen-request"), { state: "sent", result: receipt });
    assert.equal(db.prepare("SELECT total_changes() AS count").get()!.count, changes, "opening and reading do not rewrite stored facts");
    assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 1);
    assert.deepEqual(await readFile(file), bytes, "reopening the current version does not rewrite its bytes");
  } finally { service.continuations.close(); db.close(); await rm(directory, { recursive: true, force: true }); }
});

test("101-2: concurrent startFor reuses settled same-key run and re-evaluates after deferred attempt instead of stranding with start_in_progress", async t => {
  const db = new DatabaseSync(":memory:");
  const store = new AssistantStore(db);
  const work = store.create({ actor_id: "user", title: "Concurrent continuation", scope: { kind: "personal" }, origin: null });
  store.update("user", work.work_id, null, { session_id: "sess-concurrent" });
  const request = {
    runtime_id: "prologue",
    project_id: ASSISTANT_PERSONAL_OWNER,
    session_id: "sess-concurrent",
    owner: { plugin_id: ASSISTANT_PLUGIN_ID, install_id: "assistant" },
    request_key: "req-k1",
    wait_id: "wait-1",
    graph_id: "graph-1",
    node_id: "node-1",
  };
  let startCount = 0;
  const gate = Promise.withResolvers<void>();
  const adapter = {
    collaboration: {
      read: async () => [{ wait: { wait_id: "wait-1", state: "satisfied", reason: "ready" }, continuation: { state: "eligible", auto: true, request_key: "req-k1", graph_id: "graph-1", node_id: "node-1" } }],
    },
    readSession: async () => ({ latest_run: null }),
  };
  const service = new AssistantService(store, {
    pages: async () => ["home"],
    host: async () => ({ adapter: () => adapter } as never),
    authority: async () => { throw new Error("No real dispatch expected"); },
  }, "user");
  const continuations = service.continuations;
  const ports = Reflect.get(continuations, "ports") as { start: () => Promise<{ run_id: string }> };
  t.mock.method(ports, "start", async () => {
    startCount += 1;
    await gate.promise;
    return { run_id: `run-${startCount}` };
  });
  try {
    // 1. Same request_key arriving concurrently: second caller receives the settled run, never `{ later: "assistant.start_in_progress" }`.
    const first = continuations.startFor(request);
    const second = continuations.startFor(request);
    gate.resolve();
    const [a1, a2] = await Promise.all([first, second]);
    assert.deepEqual(a1, { run: { run_id: "run-1", session_id: "sess-concurrent" } });
    assert.deepEqual(a2, { run: { run_id: "run-1", session_id: "sess-concurrent" } });
    assert.equal(startCount, 1);

    // 2. If the in-flight start returns `later` (busy held when attempt 1 checks), the queued caller must re-evaluate once free instead of stranding.
    const releaseSend = continuations.blockStart(work.work_id);
    const gateView = Promise.withResolvers<void>();
    const origRead = adapter.collaboration.read;
    let calls = 0;
    adapter.collaboration.read = async () => {
      calls += 1;
      if (calls === 1) await gateView.promise;
      if (calls === 2) releaseSend();
      return origRead();
    };
    const deferred = continuations.startFor({ ...request, request_key: "req-k2" });
    const queued = continuations.startFor({ ...request, request_key: "req-k2" });
    // Attempt 1 checks while busy is held → returns `{ later: "assistant.send_in_progress" }`.
    // Attempt 2 runs only when `queued` re-evaluates via `continue`, releases busy, and starts `run-2`.
    gateView.resolve();
    const [d1, d2] = await Promise.all([deferred, queued]);
    assert.deepEqual(d1, { later: { code: "assistant.send_in_progress" } });
    assert.deepEqual(d2, { run: { run_id: "run-2", session_id: "sess-concurrent" } });
    assert.equal(calls, 2);
  } finally {
    continuations.close();
    store.close();
    store.close(); // idempotent close must not throw
  }
});

for (const removal of ["project", "title"] as const) test(`B2R-02 the next model request after withdrawing A's ${removal} can read B again on the same work`, { timeout: 65_000 }, async t => {
  const home = await openTestHome(t), a = await home.createProject("A", ["todo"]), b = await home.createProject("B", ["todo"]);
  const self = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user" as const, project_id: null, permissions: [] };
  const aTitle = "orchid-19273", bTitle = "plum-62011";
  for (const [project, title] of [[a, aTitle], [b, bTitle]] as const) {
    await home.host.actionClient(project.reference).invoke({ ...self, permissions: todoActions.create.action.permissions, project_id: project.project_id }, todoActions.create, { title });
  }
  const grant = (revision: string, fields: string[]) => home.host.homeActionClient().invoke(self, { ...assistantSettingActions.write, provider_id: assistantSettingOwner.provider_id },
    { layer: "personal", key: "assistant.overview_grants", expected_revision: revision, request_id: "overview-" + revision,
      change: { set: { grants: [...(fields.length ? [{ partition_id: a.project_id, fields }] : []), { partition_id: b.project_id, fields: ["title"] }] } } });
  await grant("0", ["title", "status"]);

  let round = 0;
  const wire: string[][] = [[], []];
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => respond(undefined, text), async (_url: unknown, init?: RequestInit) => {
    assert.equal(typeof init?.body, "string");
    wire[round]!.push(String(init!.body));
    return wire[round]!.length === 1 ? respond({ name: "read-capability", input: { capability_id: overviewReadAction.capability_id, version: 1,
      provider_id: OVERVIEW_PROVIDER_ID, input: { kinds: ["task"] } } }) : respond();
  }));
  const queue = new AgentReviewQueue(), agents = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.overview-test", appVersion: "1.0" },
    storageRoot: join(home.home, "test-model"), reviewQueue: queue, modelConfiguration: async () => ({
      protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture" });
  agents.register(adapter);
  closeAssistantService(home.host);
  const { service } = assistantServiceFor({ localHost: home.host, homeDirectory: home.home, agentHost: agents, agentReady: async () => {},
    projectTitle: async () => "Overview", pages: async () => [], projectReference: async id => {
      if (id === a.project_id) return a.reference;
      if (id === b.project_id) return b.reference;
      assert.equal(id, "personal");
      return molisWorkHostProjectReference({ projectId: id, databasePath: join(home.home, "personal-space", "molis-work.db") });
    } });
  t.after(async () => { service.continuations.close(); await adapter.close(); });
  async function send(workId?: string) {
    const started = await service.send({ text: "读取已获准的待办摘要", request_id: "overview-round-" + round, work_id: workId }, {});
    const end = Date.now() + 25_000;
    for (;;) {
      const { work } = await service.read(started.work.work_id);
      if (work.state === "completed") return work.work_id;
      assert.ok(Date.now() < end && !["failed", "blocked"].includes(work.state), "round ends successfully");
      await delay(50);
    }
  }
  const workId = await send();
  assert.ok(wire[0]!.some(body => body.includes(aTitle) && body.includes(bTitle)));
  await grant("1", removal === "title" ? ["status"] : []);
  round = 1;
  assert.equal(await send(workId), workId);
  assert.ok(wire[1]!.every(body => !body.includes(aTitle)), "no outgoing request contains the former A title");
  assert.ok(wire[1]!.some(body => body.includes(bTitle)), "fresh tool output with B reaches the model in this work");
});
