import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createServer } from "node:http";
import { AsyncLocalStorage } from "node:async_hooks";
import { realpath, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DEMO_PROJECT_ID as project } from "@molis-ai/molis-work-app-local-host";
import { ActionError, type ActionSubjectContext, type ActionSubjectRetention, type SearchEntriesPage } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginPrivateStorage } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingRouteActions } from "@molis-ai/molis-work-plugin-coding";
import { codingSdkRuntime } from "./fixtures/coding-sdk-runtime.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";
import { noEffect } from "./fixtures/coding-sessions.js";
import { maintainCodingKnowledge } from "./fixtures/coding-knowledge-maintenance.mjs";

type Fixture = Awaited<ReturnType<typeof codingSdkRuntime>>;
type Decision = NonNullable<ReturnType<Fixture["sessions"]["lifecycle"]["current"]>>["request"];
const path = (id: string) => `/sessions/${id}`;
const operation = (decision: Decision) => decision.mode === "runtime" ? decision.decision.operation_id : decision.operation_id;

test("Coding2 runtime pending originals keep real SDK receipts across offline adoption and complete only the original operation", async t => {
  for (const archived of [true, false]) await t.test(archived ? "pending SDK archive" : "pending SDK unarchive", async t => {
    const model = t.mock.method(globalThis, "fetch", async () => { throw new Error("runtime adoption cannot call a model"); });
    const first = await codingSdkRuntime(t, { hostActions: true }); let reopened: Fixture | undefined;
    try {
      await first.create("runtime-pending"); await first.create("neighbour");
      const owner = { project_id: project, plugin_id: "io.molis.work.coding", actor_id: "web-user", install_id: first.platform.supervisor.state("io.molis.work.coding")!.install_id! };
      const session = await first.adapter.createSession({ ...owner, title: "Original", directory: { canonical_path: first.home, realpath_verified: true } });
      await first.sessions.setRuntimeSession(noEffect, project, "runtime-pending", session.session_id, new Date().toISOString());
      if (!archived) assert.equal((await apply(first, "runtime-pending", true, await preview(first, "runtime-pending", true)))?.status, 200);
      const request = await preview(first, "runtime-pending", archived); assert.equal(request.mode, "runtime");
      const method = archived ? "archive" : "unarchive", lifecycle = first.adapter.sessionLifecycle!, invoke = lifecycle[method].bind(lifecycle);
      let receipt: Awaited<ReturnType<typeof invoke>> | undefined;
      const lost = t.mock.method(lifecycle, method, async (...args) => { receipt = await invoke(...args); throw new Error("injected-lost-original-receipt"); });
      const refused = await apply(first, "runtime-pending", archived, request); lost.mock.restore();
      assert.ok(refused!.status >= 400); assert.match(JSON.stringify(refused!.body), /injected-lost-original-receipt/); assert.ok(receipt);
      const pending = first.sessions.lifecycle.current(project, "runtime-pending")!;
      assert.equal(pending.completed, false); assert.deepEqual(pending.request, request);
      const sdk = await lifecycle.read(session, owner), neighbour = first.sessions.get(project, "neighbour");
      assert.equal(sdk.state, archived ? "archived" : "active"); assert.equal(receipt.operation_id, operation(request));
      assert.equal(sdk.operation?.completed, true); assert.equal(sdk.version, receipt.version);
      // Shut every genuine writer before making only the old Coding2 shape; the SDK files and receipt are never seeded or edited.
      await first.close();
      const home = await realpath(first.home), file = join(home, "project.db"), db = new DatabaseSync(file);
      const { content_revision: _unknown, ...old } = pending;
      db.prepare("UPDATE coding_sessions SET lifecycle_json=? WHERE session_id='runtime-pending'").run(JSON.stringify(old));
      db.prepare("UPDATE plugin_project_databases SET version=2 WHERE plugin_id='io.molis.work.coding'").run(); db.close();
      const backupDirectory = join(dirname(home), `${basename(home)}-runtime-backup`); t.after(() => rm(backupDirectory, { recursive: true, force: true }));
      await maintainCodingKnowledge("apply", { home, projectDatabase: file, publisher: "official-coding-binding", backupDirectory });
      reopened = await codingSdkRuntime(t, { homeDirectory: first.home, hostActions: true });
      assert.equal(reopened.platform.supervisor.state("io.molis.work.coding")!.install_id, owner.install_id);
      assert.deepEqual(await reopened.adapter.sessionLifecycle!.read(session, owner), sdk);
      assert.deepEqual(reopened.sessions.lifecycle.current(project, "runtime-pending"), { ...old, content_revision: null });
      assert.deepEqual(await preview(reopened, "runtime-pending", archived), request);
      assert.equal((await apply(reopened, "runtime-pending", archived, request))?.status, 200);
      const completed = reopened.sessions.lifecycle.current(project, "runtime-pending");
      assert.deepEqual(completed, { ...old, completed: true, content_revision: null });
      assert.deepEqual(await reopened.adapter.sessionLifecycle!.read(session, owner), sdk, "the real completed SDK operation is not replayed as a new effect");
      assert.equal((await apply(reopened, "runtime-pending", archived, request))?.status, 200);
      assert.deepEqual(reopened.sessions.lifecycle.current(project, "runtime-pending"), completed);
      assert.deepEqual(await reopened.adapter.sessionLifecycle!.read(session, owner), sdk);
      assert.deepEqual(reopened.sessions.get(project, "neighbour"), neighbour);
      assert.equal(model.mock.callCount(), 0);
    } finally { await reopened?.close(); await first.close(); }
  });
});

test("Coding2 pending archive and unarchive survive actual offline adoption and finish the exact original request", async t => {
  for (const archived of [true, false]) await t.test(archived ? "pending archive" : "pending unarchive", async t => {
    const at = "2026-10-01T00:00:00.000Z", priorAt = "2026-09-30T00:00:00.000Z";
    const request: Decision = { mode: "local", runtime_id: "prologue", operation_id: "original-pending", previous_operation_id: archived ? null : "previous-archive",
      observed: { session_id: "pending", title: "Original", state: "idle", archived: !archived, goal_id: null, updated_at: priorAt } };
    const original = { archived, request, at, completed: false };
    const f = await codingSdkRuntime(t, { hostActions: true, prepareProject: async (home, file) => {
      const db = new DatabaseSync(file);
      db.prepare("INSERT INTO coding_sessions (project_id, session_id, title, state, archived, runtime_id, created_at, updated_at, lifecycle_json) VALUES (?, 'pending', 'Original', 'idle', ?, 'prologue', ?, ?, ?)")
        .run(project, Number(!archived), priorAt, priorAt, JSON.stringify(original));
      db.prepare("UPDATE plugin_project_databases SET version=2 WHERE plugin_id='io.molis.work.coding'").run(); db.close();
      const canonical = await realpath(home);
      const backupDirectory = join(dirname(canonical), `${basename(canonical)}-backup`); t.after(() => rm(backupDirectory, { recursive: true, force: true }));
      await maintainCodingKnowledge("apply", { home: canonical, projectDatabase: await realpath(file), publisher: "official-coding-binding", backupDirectory });
      const after = new DatabaseSync(file);
      try { assert.deepEqual(JSON.parse(String(after.prepare("SELECT lifecycle_json FROM coding_sessions WHERE session_id='pending'").get()!.lifecycle_json)), { ...original, content_revision: null }); }
      finally { after.close(); }
    } });
    await f.create("neighbour"); const neighbour = f.sessions.get(project, "neighbour");
    const sdkArchive = t.mock.method(f.adapter.sessionLifecycle!, "archive", async () => { throw new Error("local original cannot create SDK history"); });
    const sdkRestore = t.mock.method(f.adapter.sessionLifecycle!, "unarchive", async () => { throw new Error("local original cannot create SDK history"); });
    assert.equal((await f.call(path("pending") + "/retention"))?.status, 409);
    assert.deepEqual(await preview(f, "pending", archived), request);
    assert.equal((await apply(f, "pending", archived, request))?.status, 200);
    const completed = f.sessions.lifecycle.current(project, "pending")!;
    assert.deepEqual(completed, { ...original, completed: true, content_revision: null });
    assert.equal((await apply(f, "pending", archived, request))?.status, 200);
    assert.deepEqual(f.sessions.lifecycle.current(project, "pending"), completed);
    assert.deepEqual(f.sessions.get(project, "neighbour"), neighbour);
    assert.equal(sdkArchive.mock.callCount(), 0); assert.equal(sdkRestore.mock.callCount(), 0);
  });
});

test("business-only restore cancellation preserves SDK state and any original pending decision through reopening", async t => {
  for (const afterPrepare of [false, true]) await t.test(afterPrepare ? "after prepare" : "before prepare", async t => {
    const f = await codingSdkRuntime(t, { hostActions: true }); await f.create("cancelled"); await f.create("neighbour");
    const owner = { project_id: project, plugin_id: "io.molis.work.coding", actor_id: "web-user", install_id: f.platform.supervisor.state("io.molis.work.coding")!.install_id! };
    const session = await f.adapter.createSession({ ...owner, title: "Original", directory: { canonical_path: f.home, realpath_verified: true } });
    await f.sessions.setRuntimeSession(noEffect, project, "cancelled", session.session_id, new Date().toISOString());
    f.store.db.prepare("UPDATE coding_sessions SET archived=1 WHERE session_id='cancelled'").run();
    const original = f.sessions.get(project, "cancelled"), neighbour = f.sessions.get(project, "neighbour"), request = await preview(f, "cancelled", false);
    const sdk = await f.adapter.sessionLifecycle!.read(session, owner), abort = new AbortController(); let injected = false;
    const read = f.adapter.sessionLifecycle!.read.bind(f.adapter.sessionLifecycle);
    const gate = t.mock.method(f.adapter.sessionLifecycle!, "read", async (...args) => {
      const result = await read(...args);
      if (!injected && Boolean(f.sessions.lifecycle.current(project, "cancelled")) === afterPrepare) {
        injected = true; abort.abort(new Error("injected-business-cancel"));
      }
      return result;
    });
    const current = () => abort.signal.throwIfAborted();
    const failed = await f.call(path("cancelled") + "/unarchive", { unarchive_decision: request }, "POST", { signal: abort.signal, beforeEffect: async () => current(), assert_authority_current: current });
    gate.mock.restore(); assert.equal(injected, true); assert.ok(failed!.status >= 400); assert.match(JSON.stringify(failed!.body), /injected-business-cancel/);
    assert.deepEqual(await f.adapter.sessionLifecycle!.read(session, owner), sdk); assert.deepEqual(f.sessions.get(project, "cancelled"), original);
    const saved = f.sessions.lifecycle.current(project, "cancelled");
    if (afterPrepare) { assert.equal(saved?.completed, false); assert.deepEqual(saved?.request, request); }
    else assert.equal(saved, null);
    await restart(f); assert.deepEqual(f.sessions.lifecycle.current(project, "cancelled"), saved);
    assert.equal((await apply(f, "cancelled", false, request))?.status, 200);
    assert.deepEqual(await f.adapter.sessionLifecycle!.read(session, owner), sdk); assert.deepEqual(f.sessions.get(project, "neighbour"), neighbour);
  });
});

test("a business-only restore refuses the original preview after the real SDK lifecycle changes, with no Coding write", async t => {
  const f = await codingSdkRuntime(t, { hostActions: true }); await f.create("adopted");
  const owner = { project_id: project, plugin_id: "io.molis.work.coding", actor_id: "web-user",
    install_id: f.platform.supervisor.state("io.molis.work.coding")!.install_id! };
  const session = await f.adapter.createSession({ ...owner, title: "Original", directory: { canonical_path: f.home, realpath_verified: true } });
  await f.sessions.setRuntimeSession(noEffect, project, "adopted", session.session_id, new Date().toISOString());
  f.store.db.prepare("UPDATE coding_sessions SET archived = 1 WHERE session_id = 'adopted'").run();
  const original = f.sessions.get(project, "adopted"), request = await preview(f, "adopted", false);
  assert.equal(request.mode, "business");
  const initial = await f.adapter.sessionLifecycle!.read(session, owner);
  await f.adapter.sessionLifecycle!.archive(session, { operation_id: "independent-archive", expected_state: "active", expected_version: initial.version! }, owner);
  const changed = await f.adapter.sessionLifecycle!.read(session, owner);
  assert.equal((await apply(f, "adopted", false, request))!.status, 409);
  assert.deepEqual(f.sessions.get(project, "adopted"), original); assert.equal(f.sessions.lifecycle.current(project, "adopted"), null);
  assert.deepEqual(await f.adapter.sessionLifecycle!.read(session, owner), changed);
});

test("adopted Coding1 restores business-only active Sessions without inventing SDK history, and real archived Sessions still unarchive", async t => {
  for (const sdkArchived of [false, true]) await t.test(sdkArchived ? "SDK archived" : "SDK active", async t => {
    let failComplete = false, injected = false;
    const f = await codingSdkRuntime(t, { hostActions: true, wrapCoding: definition => ({ ...definition, start: context => {
      const database = context.services!.project_database!;
      return definition.start({ ...context, services: { ...context.services, project_database: { ...database,
        transaction: (beforeEffect, write) => database.transaction(beforeEffect, tx => {
          const result = write(tx);
          const row = tx.get("SELECT lifecycle_json FROM coding_sessions WHERE project_id=? AND session_id=?", [project, "adopted"]);
          if (failComplete && row?.lifecycle_json && JSON.parse(String(row.lifecycle_json)).completed === true) {
            injected = true; throw new Error("injected-complete");
          }
          return result;
        }),
      } } });
    } }) }); await f.create("adopted"); await f.create("neighbour");
    const owner = { project_id: project, plugin_id: "io.molis.work.coding", actor_id: "web-user",
      install_id: f.platform.supervisor.state("io.molis.work.coding")!.install_id! };
    const session = await f.adapter.createSession({ ...owner, title: "Original", directory: { canonical_path: f.home, realpath_verified: true } });
    await f.sessions.setRuntimeSession(noEffect, project, "adopted", session.session_id, new Date().toISOString());
    const initial = await f.adapter.sessionLifecycle!.read(session, owner);
    if (sdkArchived) await f.adapter.sessionLifecycle!.archive(session, { operation_id: "actual-sdk-archive", expected_state: "active", expected_version: initial.version! }, owner);
    f.store.db.prepare("UPDATE coding_sessions SET archived = 1, lifecycle_json = NULL WHERE session_id = 'adopted'").run();
    const original = f.sessions.get(project, "adopted"), neighbour = f.sessions.get(project, "neighbour");
    const beforeSdk = await f.adapter.sessionLifecycle!.read(session, owner);
    const model = t.mock.method(globalThis, "fetch", async () => { throw new Error("old restoration must not request a model"); });
    assert.equal((await retention(f, "adopted")).retained?.content_revision, null);
    const decision = await preview(f, "adopted", false);
    assert.equal(decision.mode, sdkArchived ? "runtime" : "business");
    assert.deepEqual(f.sessions.get(project, "adopted"), original, "preview does not fill missing history");
    if (!sdkArchived) {
      failComplete = true;
      const failed = await apply(f, "adopted", false, decision);
      assert.ok(failed!.status >= 400); assert.match(JSON.stringify(failed!.body), /injected-complete/); assert.equal(injected, true);
      assert.equal(f.sessions.lifecycle.current(project, "adopted")?.completed, false);
      assert.equal(f.sessions.get(project, "adopted").archived, true);
      assert.deepEqual(await f.adapter.sessionLifecycle!.read(session, owner), beforeSdk);
      failComplete = false;
      await restart(f);
      assert.deepEqual(await preview(f, "adopted", false), decision, "reopening keeps the exact original operation");
    }
    assert.equal((await apply(f, "adopted", false, decision))?.status, 200);
    const kept = f.sessions.lifecycle.current(project, "adopted")!;
    assert.equal(kept.content_revision, null); assert.equal(kept.completed, true);
    assert.deepEqual(kept.request, decision); assert.equal(f.sessions.get(project, "adopted").updated_at, original.updated_at);
    assert.equal((await apply(f, "adopted", false, decision))?.status, 200);
    assert.deepEqual(f.sessions.lifecycle.current(project, "adopted"), kept);
    const afterSdk = await f.adapter.sessionLifecycle!.read(session, owner);
    if (sdkArchived) { assert.equal(afterSdk.state, "active"); assert.equal(afterSdk.version, beforeSdk.version! + 1); }
    else assert.deepEqual(afterSdk, beforeSdk, "business-only restore produces no SDK operation or version");
    assert.deepEqual(f.sessions.get(project, "neighbour"), neighbour); assert.equal(model.mock.callCount(), 0);
  });
});
/** Real Node Host HTTP requests, including any background requests; none are filtered from the count. */
async function loopbackModel(t: TestContext, text: string) {
  const requests: Array<{ method: string | undefined; path: string | undefined; body: unknown }> = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({ method: request.method, path: request.url, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
    if (request.method !== "POST" || request.url !== "/v1/messages") { response.writeHead(404).end(); return; }
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(await cogniaModelResponse(text).text());
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  return { endpoint: `http://127.0.0.1:${address.port}/v1/messages`, requests };
}
async function source(f: Fixture, id: string): Promise<ActionSubjectContext> {
  const result = await f.call(path(id) + "/subject");
  assert.equal(result?.status, 200, JSON.stringify(result?.body)); return result!.body as ActionSubjectContext;
}
async function retention(f: Fixture, id: string): Promise<ActionSubjectRetention> {
  const result = await f.call(path(id) + "/retention");
  assert.equal(result?.status, 200, JSON.stringify(result?.body)); return result!.body as ActionSubjectRetention;
}
async function preview(f: Fixture, id: string, archived: boolean): Promise<Decision> {
  const result = await f.call(path(id) + (archived ? "/archive-preview" : "/unarchive-preview"));
  assert.equal(result?.status, 200, JSON.stringify(result?.body));
  return (result!.body as { archive_decision: Decision; unarchive_decision: Decision })[archived ? "archive_decision" : "unarchive_decision"];
}
const apply = (f: Fixture, id: string, archived: boolean, decision: Decision) => archived
  ? f.call(path(id), { archive: true, archive_decision: decision }, "PATCH")
  : f.call(path(id) + "/unarchive", { unarchive_decision: decision });
async function restart(f: Fixture) {
  const install = f.platform.supervisor.state("io.molis.work.coding")!.install_id!;
  await f.platform.runtime.stop(install); await f.reopenSdk(); await f.platform.runtime.start(install);
}
async function complete(f: Fixture, id: string) {
  const result = await f.call(path(id) + "/runs", { task: "Explain this project.", intent: "discuss", workspace_id: "work", provider_id: "fixture", model_id: "fixture" });
  assert.equal(result?.status, 200, JSON.stringify(result?.body));
  for (const deadline = Date.now() + 15_000; f.sessions.get(project, id).state !== "done";) {
    assert.ok(Date.now() < deadline, "the real Coding follower must finish"); await new Promise(resolve => setTimeout(resolve, 10));
  }
}

test("Coding retention is body-free, reads no Run, and preserves the same frozen version and restore operation after restart/retry", async t => {
  const f = await codingSdkRuntime(t, { hostActions: true }); await f.create("local");
  const reads = t.mock.method(f.adapter, "read", async () => { throw new Error("retention must not read a Run"); });
  const sessions = t.mock.method(f.adapter, "readSession", async () => { throw new Error("local retention must not read a Runtime Session"); });
  const before = await source(f, "local");
  assert.deepEqual(await retention(f, "local"), { subject: before.subject, state: "active", retained: null });
  const archive = await preview(f, "local", true);
  assert.equal((await apply(f, "local", true, archive))?.status, 200);
  const frozen = { subject: before.subject, state: "temporarily_archived", retained: { content_revision: before.revision, restoration_operation_id: null } };
  assert.deepEqual(await retention(f, "local"), frozen);
  assert.equal((await f.call(path("local") + "/subject"))?.status, 404);
  assert.equal((await f.call(path("local")))?.status, 200, "explicit user history remains readable");
  assert.equal(reads.mock.callCount(), 0); assert.equal(sessions.mock.callCount(), 0);
  reads.mock.restore(); sessions.mock.restore(); await restart(f);
  assert.deepEqual(await retention(f, "local"), frozen);
  const restore = await preview(f, "local", false);
  assert.equal((await apply(f, "local", false, restore))?.status, 200);
  const restored = { subject: before.subject, state: "active", retained: { content_revision: before.revision, restoration_operation_id: operation(restore) } };
  assert.deepEqual(await retention(f, "local"), restored);
  assert.equal((await source(f, "local")).revision, before.revision, "archive timestamp and restore operation are not content");
  await restart(f);
  assert.equal((await apply(f, "local", false, restore))?.status, 200);
  assert.deepEqual(await retention(f, "local"), restored);
  assert.equal(f.sessions.lifecycle.current(project, "local")?.content_revision, before.revision);
});

test("Coding content/list revisions reflect title, intent and Goal facts while restoration retains the original content version", async t => {
  let storage!: PluginPrivateStorage;
  const f = await codingSdkRuntime(t, { hostActions: true, wrapCoding: definition => ({ ...definition, start: context => {
    storage = context.services!.storage!; return definition.start(context);
  } }) });
  await f.create("facts");
  const listRevision = async () => {
    const result = await f.call("/search/entries"); assert.equal(result?.status, 200);
    return (result!.body as SearchEntriesPage).entries.find(row => row.subject.id === "facts")!.revision;
  };
  const initial = await source(f, "facts"), listed = await listRevision();
  const renamed = await f.call(path("facts"), { title: "Changed title" }, "PATCH"); assert.equal(renamed?.status, 200);
  const named = await source(f, "facts");
  assert.notEqual(named.revision, initial.revision); assert.notEqual(await listRevision(), listed);
  assert.equal((await f.call(path("facts"), { configuration: { intent: "discuss", provider_id: "fixture", model_id: "fixture", workspace_id: "work" } }, "PATCH"))?.status, 200);
  assert.notEqual((await source(f, "facts")).revision, named.revision, "intent is content even without a Run");
  await f.sessions.setGoal(noEffect, project, "facts", "retention-goal", f.sessions.get(project, "facts").updated_at);
  storage.set("goal-title:retention-goal", "Original Goal title");
  const linked = await source(f, "facts"), linkedList = await listRevision();
  assert.match(linked.content, /Original Goal title/);
  assert.equal((await apply(f, "facts", true, await preview(f, "facts", true)))?.status, 200);
  storage.set("goal-title:retention-goal", "Updated Goal title"); await restart(f);
  assert.equal((await retention(f, "facts")).retained?.content_revision, linked.revision);
  assert.equal((await apply(f, "facts", false, await preview(f, "facts", false)))?.status, 200);
  const current = await source(f, "facts"); assert.match(current.content, /Updated Goal title/);
  assert.notEqual(current.revision, linked.revision); assert.notEqual(await listRevision(), linkedList);
  assert.equal((await retention(f, "facts")).retained?.content_revision, linked.revision, "restoration does not recompute the archived original");
});

test("Coding source hashes full already-read text past display cuts and rejects an in-flight read overtaken by archive", { timeout: 60_000 }, async t => {
  const model = await loopbackModel(t, "A".repeat(1300) + "original tail");
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), readingScope = new AsyncLocalStorage<boolean>(); let held = false;
  const f = await codingSdkRuntime(t, { hostActions: true, modelEndpoint: model.endpoint, wrapCoding: definition => ({ ...definition, start: context => {
    const actions = context.services!.actions!;
    return definition.start({ ...context, services: { ...context.services, actions: { ...actions, invoke: async (definition, input, control, transport) => {
      const result = await actions.invoke(definition, input, control, transport);
      // Hold the actual result after the Host Action released its project queue, before Coding consumes it.
      if (!held && definition.capability_id === agent.readRun.capability_id && readingScope.getStore() === true) {
        held = true; entered.resolve(); await release.promise;
      }
      return result;
    } } } });
  } }) });
  await f.create("text"); await complete(f, "text");
  const listReads = t.mock.method(f.adapter, "read", async () => { throw new Error("list must not read a Run"); });
  assert.equal((await f.call("/search/entries"))?.status, 200); assert.equal(listReads.mock.callCount(), 0); listReads.mock.restore();
  const before = await source(f, "text"), realRead = f.adapter.read.bind(f.adapter);
  const tail = t.mock.method(f.adapter, "read", async (...args) => {
    const run = structuredClone(await realRead(...args)), reply = [...run.turns].reverse().find(turn => turn.kind === "assistant");
    assert.ok(reply); reply.text += " changed beyond display"; return run;
  });
  const after = await source(f, "text"); assert.equal(after.content, before.content); assert.notEqual(after.revision, before.revision);
  tail.mock.restore();
  const reading = readingScope.run(true, () => f.call(path("text") + "/subject"));
  try {
    await Promise.race([entered.promise, reading.then(() => { throw new Error("source did not reach its Run read"); })]);
    assert.equal((await apply(f, "text", true, await preview(f, "text", true)))?.status, 200);
  } finally { release.resolve(); }
  assert.equal((await reading)?.status, 409);
  const readCount = t.mock.method(f.adapter, "read", async () => { throw new Error("retention must not read a Run"); });
  const sessionCount = t.mock.method(f.adapter, "readSession", async () => { throw new Error("retention must not read a Session"); });
  assert.equal((await retention(f, "text")).retained?.content_revision, before.revision);
  assert.equal(readCount.mock.callCount(), 0); assert.equal(sessionCount.mock.callCount(), 0);
  readCount.mock.restore(); sessionCount.mock.restore();
  assert.equal((await f.call(path("text")))?.status, 200);
  assert.equal(model.requests.length, 1);
});

test("Coding pending originals are unavailable to retention and ordinary source but exact retry and user history remain available", { timeout: 60_000 }, async t => {
  const model = await loopbackModel(t, "Completed before archive.");
  const f = await codingSdkRuntime(t, { hostActions: true, modelEndpoint: model.endpoint });
  await f.create("pending"); await complete(f, "pending");
  const originalSource = await source(f, "pending"), archive = await preview(f, "pending", true);
  const realArchive = f.adapter.sessionLifecycle!.archive.bind(f.adapter.sessionLifecycle);
  const fault = t.mock.method(f.adapter.sessionLifecycle!, "archive", async (...args) => { await realArchive(...args); throw new Error("lost archive receipt"); });
  assert.ok((await apply(f, "pending", true, archive))!.status >= 400);
  assert.equal(f.sessions.lifecycle.current(project, "pending")?.content_revision, originalSource.revision);
  assert.equal((await f.call(path("pending") + "/retention"))?.status, 409);
  assert.equal((await f.call(path("pending") + "/subject"))?.status, 409);
  assert.equal((await f.call(path("pending")))?.status, 200);
  fault.mock.restore(); await restart(f);
  assert.equal((await f.call(path("pending") + "/retention"))?.status, 409);
  const read = t.mock.method(f.adapter, "read", async () => { throw new Error("original retry must not read or recompute Run content"); });
  assert.equal((await apply(f, "pending", true, archive))?.status, 200);
  assert.equal((await retention(f, "pending")).retained?.content_revision, originalSource.revision);
  assert.equal(read.mock.callCount(), 0); assert.equal(model.requests.length, 1);
});

test("Coding authoritative row absence differs from denied, cancelled, foreign-owner and storage failure", async t => {
  let failRead = false, revokeAfterRead = false, allowed = true;
  const f = await codingSdkRuntime(t, { hostActions: true, wrapCoding: definition => ({ ...definition, start: context => {
    const database = context.services!.project_database!;
    return definition.start({ ...context, services: { ...context.services, project_database: { ...database, get(sql, parameters) {
      if (sql.startsWith("SELECT * FROM coding_sessions") && parameters?.[1] === "absent") {
        if (failRead) throw new Error("injected owner storage unavailable");
        if (revokeAfterRead) allowed = false;
      }
      return database.get(sql, parameters);
    } } } });
  } }) });
  assert.deepEqual(await retention(f, "absent"), { subject: { kind: "coding_session", id: "absent" }, state: "deleted", retained: null });
  const definition = codingRouteActions["coding.subject-retention"]!.definition;
  const caller = { actor_id: "web-user", project_id: project, audience: "user" as const, permissions: ["artifact:read", "storage:private"] };
  await assert.rejects(f.service.invoke({ ...caller, permissions: [] }, definition, { subject_id: "absent" }));
  await assert.rejects(f.service.invoke({ ...caller, actor_id: "other-user" }, definition, { subject_id: "absent" }), { code: "actions.owner_mismatch" });
  await assert.rejects(f.service.invoke({ ...caller, project_id: "other-project" }, definition, { subject_id: "absent" }));
  const current = () => { throw new ActionError("actions.forbidden", "authority revoked"); };
  const denied = await f.call(path("absent") + "/retention", undefined, "GET", { beforeEffect: async () => current(), assert_authority_current: current });
  assert.equal(denied?.status, 403);
  const authority = () => { if (!allowed) current(); };
  revokeAfterRead = true;
  assert.equal((await f.call(path("absent") + "/retention", undefined, "GET", { beforeEffect: async () => authority(), assert_authority_current: authority }))?.status, 403,
    "authority lost at the exact absence read is refused before returning deleted");
  revokeAfterRead = false; allowed = true; failRead = true;
  assert.ok((await f.call(path("absent") + "/retention"))!.status >= 400); failRead = false;
  const aborted = new AbortController(); aborted.abort();
  assert.notEqual((await f.call(path("absent") + "/retention", undefined, "GET", { signal: aborted.signal }))?.status, 200);
  // Stop the actual owner registration; absence must no longer be answered from any cached state.
  const install = f.platform.supervisor.state("io.molis.work.coding")!.install_id!; await f.platform.runtime.stop(install);
  await assert.rejects(f.service.invoke(caller, definition, { subject_id: "absent" }));
});
