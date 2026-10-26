import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createPrologueNodeAdapter, AgentHost, AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";
import { AssistantService, AssistantStore } from "@molis-ai/molis-work-app-local-host";

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
      assert.equal(saved.continuation_hold, "paused"); assert.equal(saved.draft, "只查资料，别保存");
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
    const earlier = assert.rejects(service.send({ work_id: work.work_id, request_id: "earlier-input", text: "Old request", character: { artifact_id: "character", version: 1 } }, {}));
    await entered.promise;
    const later = service.continuations.begin(store.get("user", work.work_id), "New draft");
    later.accept(); later.end();
    release.resolve(); await earlier;
    const saved = store.get("user", work.work_id);
    assert.equal(saved.draft, "New draft"); assert.equal(saved.continuation_hold, undefined);
    const failed = service.continuations.begin(saved, "Newest unsent input");
    failed.end();
    assert.equal(store.get("user", work.work_id).continuation_hold, "paused");
  } finally { release.resolve(); service.continuations.close(); db.close(); }
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
      const session = await adapter.createSession({ project_id: "assistant-personal", plugin_id: "io.molis.work.assistant", actor_id: "user", install_id: "assistant",
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

test("ASC-18 ASC-25: closing the Assistant aborts its runtime wait and does not reattach on later store changes", async t => {
  const directory = await mkdtemp(join(tmpdir(), "assistant-watcher-close-"));
  const host = new AgentHost({ reviews: new AgentReviewQueue() });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.wait-close", appVersion: "1.0.0" }, storageRoot: directory,
    modelConfiguration: async () => null, resolveCredential: () => null });
  host.register(adapter);
  const db = new DatabaseSync(":memory:"), store = new AssistantStore(db);
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => host, authority: async () => { throw new Error("No round should start"); } }, "user");
  const entered = Promise.withResolvers<AbortSignal>(), settled = Promise.withResolvers<void>();
  const actualWait = adapter.collaboration!.awaitReady.bind(adapter.collaboration);
  const waiting = t.mock.method(adapter.collaboration!, "awaitReady", async (project, timeout, exclude, signal) => {
    assert.ok(signal); entered.resolve(signal);
    try { return await actualWait(project, timeout, exclude, signal); } finally { settled.resolve(); }
  });
  try {
    const work = store.create({ actor_id: "user", title: "Pending work", scope: { kind: "personal" }, origin: null });
    store.update("user", work.work_id, null, { session_id: "owned-session" });
    service.continuations.attach();
    const signal = await entered.promise;
    assert.equal(signal.aborted, false);
    service.continuations.close();
    assert.equal(signal.aborted, true);
    await settled.promise;
    store.update("user", work.work_id, null, { title: "A later change" });
    service.continuations.attach();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(waiting.mock.callCount(), 1, "the closed owner cannot create another long wait");
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
    const session = await adapter.createSession({ project_id: "assistant-personal", plugin_id: "io.molis.work.assistant", actor_id: "user", install_id: "assistant",
      directory: { canonical_path: directory, realpath_verified: true }, title: change });
    const work = store.create({ actor_id: "user", title: change, scope: { kind: "personal" }, origin: null });
    const saved = store.update("user", work.work_id, null, { session_id: session.session_id });
    store.observe("user", work.work_id, "running");
    service.continuations.watch(saved, { runtime_id: "prologue", session_id: session.session_id, run_id: "finished-round" });
    // Freeze the read after the terminal notification; the production callback still owns the eventual write.
    (await observer.promise)({ phase: "completed" } as never);
    await entered.promise;
    if (change === "close") service.continuations.close();
    else store.update("user", work.work_id, null, { continuation_hold: "paused", draft: "Newest intent" });
    release.resolve(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(store.observed("user", work.work_id), "running", "the obsolete observation must not be committed");
    assert.deepEqual(service.notices.notices(null), [], "there is no false completed notification");
    if (change === "latest-input") assert.equal(store.get("user", work.work_id).draft, "Newest intent");
  } finally { release.resolve(); service.continuations.close(); await adapter.close(); db.close(); await rm(directory, { recursive: true, force: true }); }
});
