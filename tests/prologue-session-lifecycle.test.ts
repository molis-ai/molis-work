import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, registerAgentHostCapabilities } from "@molis-ai/molis-work-service-agent-host";
import { agentSessionLifecycleActions as actions, type AgentSessionDecision, type AgentSessionRef, type AgentSessionOwner } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { HostCapabilityDefinition, HostCapabilityInvocation } from "@molis-ai/molis-work-contracts/platform/app-host";

const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk"));
const app = { appId: "io.molis.session-lifecycle-test", appVersion: "1.0.0" };
const owner = { project_id: "project", plugin_id: "io.molis.work.coding", install_id: "installation", actor_id: "person" };
const decision = (view: { version: number | null; state: string }, operation_id: string): AgentSessionDecision => {
  assert.ok(view.version); assert.ok(view.state === "active" || view.state === "archived");
  return { operation_id, expected_version: view.version, expected_state: view.state };
};
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };

test("public prepare persists only the original decision and resumes after reopening before any body deletion", async t => {
  const f = await fixture(t), session = await f.create(), other = await f.create(), run = await f.finishRun(session);
  const preview = await f.call(actions.previewPurge, { session }), change = decision(preview, "prepare-original");
  const root = await f.sdkRoot(session.session_id), child = await f.sdkRun(run.ref), original = await f.readIndex(session.session_id);
  const prepared = await f.call(actions.preparePurge, { session, decision: change, preview });
  assert.deepEqual(prepared, { session, session_ref: { kind: "session", id: session.session_id, revision: 1 }, decision: change, preview });
  assert.deepEqual(await f.sdkRoot(session.session_id), root); assert.deepEqual(await f.sdkRun(run.ref), child);
  assert.deepEqual((await f.readIndex(session.session_id)).attempts, original.attempts);
  assert.equal((await f.readIndex(session.session_id)).title, original.title);
  assert.equal((await f.readIndex(session.session_id)).lifecycle?.phase, "prepared");
  const before = f.records();
  assert.deepEqual(await f.call(actions.preparePurge, { session, decision: change, preview }), prepared);
  assert.deepEqual(f.records(), before, "repeating preparation never rewrites its original");
  await assert.rejects(f.adapter.readSession(session));
  await assert.rejects(f.adapter.start(f.runRequest(session)));
  assert.equal((await f.adapter.readSession(other)).session.session_id, other.session_id);
  await f.reopen();
  for (const input of [{ session, decision: { ...change, operation_id: "replacement" }, preview },
    { session, decision: change, preview: { ...preview, resources: preview.resources + 1 } }]) await assert.rejects(f.call(actions.preparePurge, input));
  await assert.rejects(f.call(actions.preparePurge, { session, decision: change, preview }, { caller: { ...owner, actor_id: "other" } }));
  assert.deepEqual(await f.call(actions.preparePurge, { session, decision: change, preview }), prepared);
  const receipt = await f.call(actions.purge, { session, decision: change, preview });
  assert.equal(receipt.state, "purged"); assert.equal(await f.sdkRun(run.ref), undefined);
});

test("prepared wait pages include ended historical waits, bind the original decision, and expose only metadata", async t => {
  const f = await fixture(t), session = await f.create(), other = await f.create();
  const expected = await f.historicalWaits(session, other);
  const preview = await f.call(actions.previewPurge, { session }), change = decision(preview, "wait-identities");
  await assert.rejects(f.call(actions.purgeWaits, { session, decision: change, page: { limit: 2 } }));
  await f.call(actions.preparePurge, { session, decision: change, preview });
  const before = f.records(), first = await f.call(actions.purgeWaits, { session, decision: change, page: { limit: 2 } });
  assert.equal(first.exhausted, false); assert.equal(first.wait_ids.length, 2); assert.ok(first.cursor);
  assert.deepEqual(Object.keys(first).sort(), ["session", "operation_id", "wait_ids", "exhausted", "cursor"].sort());
  const last = await f.call(actions.purgeWaits, { session, decision: change, page: { limit: 2, cursor: first.cursor } });
  assert.equal(last.exhausted, true); assert.equal(last.cursor, undefined);
  assert.deepEqual([...first.wait_ids, ...last.wait_ids], expected);
  assert.deepEqual(f.records(), before, "reading every page does not write or delete any record");
  for (const page of [{ limit: 0 }, { limit: 201 }, { limit: 1.5 }, { limit: 2, cursor: "bad" }]) {
    await assert.rejects(f.call(actions.purgeWaits, { session, decision: change, page }));
  }
  await assert.rejects(f.call(actions.purgeWaits, { session, decision: { ...change, operation_id: "different" }, page: { limit: 2, cursor: first.cursor } }));
  const otherPreview = await f.call(actions.previewPurge, { session: other }), otherChange = decision(otherPreview, "other-original");
  await f.call(actions.preparePurge, { session: other, decision: otherChange, preview: otherPreview });
  await assert.rejects(f.call(actions.purgeWaits, { session: other, decision: otherChange, page: { limit: 2, cursor: first.cursor } }));
  assert.deepEqual((await f.sdkRoot(session.session_id))?.metadata.state, "active");
  const beforeReopen = f.records(); await f.reopen();
  assert.deepEqual(await f.call(actions.purgeWaits, { session, decision: change, page: { limit: 2 } }), first);
  assert.deepEqual(f.records(), beforeReopen, "reopened wait inspection has no writes");
});

test("an exact preparation excludes project holds and same-session commands while another Session stays independent", async t => {
  const f = await fixture(t), session = await f.create(), other = await f.create();
  const preview = await f.call(actions.previewPurge, { session }), change = decision(preview, "held-prepare");
  const entered = deferred(), release = deferred();
  const pending = f.adapter.withEffect({ beforeEffect: async () => { entered.resolve(); await release.promise; }, assert_current() {} },
    () => f.adapter.sessionLifecycle!.preparePurge(session, change, preview, owner));
  await entered.promise;
  try {
    await assert.rejects(f.adapter.projectDeletion.withHold({ project_id: owner.project_id, associated_sessions: [] }, async () => {}));
    await assert.rejects(f.call(actions.preparePurge, { session, decision: change, preview }));
    assert.equal((await f.call(actions.read, { session: other })).state, "active");
  } finally { release.resolve(); await pending; }
});

test("public lifecycle actions bind current owner, keep canonical archive state, and reject an old decision after unarchive", async t => {
  const f = await fixture(t), session = await f.create(), other = await f.create();
  const before = await f.call(actions.read, { session });
  const archive = decision(before, "archive-original");
  for (const changed of [{ actor_id: "other" }, { install_id: "other" }, { project_id: "other" }, { plugin_id: "other" }]) {
    await assert.rejects(f.call(actions.read, { session }, { caller: { ...owner, ...changed } }));
    await assert.rejects(f.call(actions.archive, { session, decision: archive }, { caller: { ...owner, ...changed } }));
  }
  assert.equal((await f.call(actions.read, { session })).state, "active");
  // Ignore the original response, then recover the exact operation through another public handle.
  await f.call(actions.archive, { session, decision: archive });
  const repeated = await f.adapter.sessionLifecycle!.archive(session, archive, owner);
  assert.equal(repeated.state, "archived");
  assert.equal((await f.adapter.readSession(session)).session.session_id, session.session_id, "history restore does not unarchive");
  const archived = await f.call(actions.read, { session }); assert.equal(archived.state, "archived");
  assert.deepEqual(archived.operation, { action: "archive", decision: archive, completed: true, receipt: repeated });
  assert.ok(archived.operation);
  await assert.rejects(f.adapter.start(f.runRequest(session)), /已归档/);
  assert.equal((await f.readIndex(session.session_id)).attempts.length, 0, "archive refusal creates no prepared start");
  const restore = decision(archived, "restore-later");
  const restored = await f.call(actions.unarchive, { session, decision: restore });
  await assert.rejects(f.call(actions.archive, { session, decision: archive }));
  const active = await f.call(actions.read, { session });
  assert.equal(active.state, "active"); assert.equal(active.version, restored.version);
  assert.deepEqual(active.operation, { action: "unarchive", decision: restore, completed: true, receipt: restored });
  assert.equal(archived.operation.receipt?.state, "archived", "a returned archive snapshot does not become the later decision");
  assert.equal((await f.call(actions.read, { session: other })).state, "active");
  await f.reopen();
  await assert.rejects(f.call(actions.archive, { session, decision: archive }));
  const beforeRead = f.records();
  assert.deepEqual(await f.call(actions.read, { session }), active);
  assert.deepEqual(f.records(), beforeRead, "reading the completed original operation never repairs storage");
});

test("public read refuses an in-flight archive after its SDK commit while another Session remains independent", { timeout: 30_000 }, async t => {
  const f = await fixture(t), session = await f.create(), other = await f.create();
  const change = decision(await f.call(actions.read, { session }), "held-archive");
  const entered = deferred(), release = deferred(); let held = false;
  const pending = f.call(actions.archive, { session, decision: change }, { beforeEffect: async () => {
    if (!held && (await f.readIndex(session.session_id)).lifecycle?.phase === "prepared"
      && (await f.sdkRoot(session.session_id))?.metadata.state === "archived") {
      held = true; entered.resolve(); await release.promise;
    }
  } });
  try {
    await Promise.race([entered.promise, pending.then(() => { throw new Error("archive did not reach the durable SDK/Index boundary"); })]);
    const beforeRead = f.records();
    await assert.rejects(f.call(actions.read, { session }), { code: "agent.session_busy" });
    assert.deepEqual(f.records(), beforeRead, "refusing an overlapping read performs no write or recovery");
    const otherView = await f.call(actions.read, { session: other });
    assert.equal(otherView.state, "active");
    const otherReceipt = await f.call(actions.archive, { session: other, decision: decision(otherView, "independent-archive") });
    assert.equal(otherReceipt.state, "archived", "one Session's held lifecycle does not block another's command");
  } finally { release.resolve(); await pending; }
  const receipt = await pending, beforeRead = f.records();
  const completed = await f.call(actions.read, { session });
  assert.equal(completed.state, receipt.state); assert.equal(completed.version, receipt.version);
  assert.deepEqual(completed.operation, { action: "archive", decision: change, completed: true, receipt });
  assert.deepEqual(f.records(), beforeRead, "the completed snapshot is a pure read");
});

test("public Adapter read owns the Session lane before its first asynchronous read and releases it without writing", async t => {
  const f = await fixture(t), session = await f.create(), other = await f.create(), beforeRead = f.records();
  // Invoke both in the same turn: the first real disk read is still pending, without timers or a fake SDK.
  const reading = f.adapter.sessionLifecycle!.read(session, owner);
  const refused = assert.rejects(f.adapter.sessionLifecycle!.read(session, owner), { code: "agent.session_busy" });
  const independent = f.adapter.sessionLifecycle!.read(other, owner);
  const [view, otherView] = await Promise.all([reading, independent, refused]);
  assert.equal(view.state, "active"); assert.equal(otherView.state, "active");
  assert.deepEqual(f.records(), beforeRead);
  const receipt = await f.call(actions.archive, { session, decision: decision(view, "after-read") });
  const completed = await f.call(actions.read, { session });
  assert.equal(completed.state, receipt.state); assert.equal(completed.version, receipt.version);
});

test("a real background command blocks lifecycle while running and its terminal record does not deadlock archive or purge", { timeout: 30_000 }, async t => {
  const f = await fixture(t), session = await f.startBackground();
  const [running] = await f.adapter.background!.read(owner.project_id, session.session_id);
  assert.ok(running); assert.equal(running.state, "running");
  const before = await f.call(actions.read, { session });
  const archive = decision(before, "after-background-stopped"), recordsBefore = f.records();
  await assert.rejects(f.call(actions.archive, { session, decision: archive }), { code: "agent.session_busy" });
  await assert.rejects(f.call(actions.previewPurge, { session }), { code: "agent.session_busy" });
  assert.deepEqual(f.records(), recordsBefore, "busy lifecycle does not create a decision or change storage");
  assert.equal(await f.adapter.background!.stop(owner.project_id, running.task_id), true);
  // stop acknowledges the Host's cancel request; the process exit publishes the terminal state separately.
  let [stopped] = await f.adapter.background!.read(owner.project_id, session.session_id);
  const deadline = Date.now() + 5_000;
  while (stopped?.state === "running") {
    assert.ok(Date.now() < deadline, "the real cancelled process must reach its terminal state");
    await new Promise(resolve => setTimeout(resolve, 10));
    [stopped] = await f.adapter.background!.read(owner.project_id, session.session_id);
  }
  assert.equal(stopped?.state, "stopped", "the real SDK retains the terminal background record");
  const receipt = await f.call(actions.archive, { session, decision: archive });
  assert.equal(receipt.state, "archived");
  await f.reopen();
  const [restored] = await f.adapter.background!.read(owner.project_id, session.session_id);
  assert.equal(restored?.state, "stopped");
  const preview = await f.call(actions.previewPurge, { session });
  const purged = await f.call(actions.purge, { session, preview, decision: decision(preview, "purge-after-background") });
  assert.equal(purged.state, "purged");
  assert.deepEqual((await f.readIndex(session.session_id)).attempts, []);
});

for (const stage of ["sdk-archived", "index-sdk-complete"] as const) test(`public read recovers the original archive after ${stage} and reopening without rewriting the decision`, async t => {
  const f = await fixture(t), session = await f.create();
  const change = decision(await f.call(actions.read, { session }), `archive-${stage}`);
  let interrupted = false;
  await assert.rejects(f.call(actions.archive, { session, decision: change }, { beforeEffect: async () => {
    const index = await f.readIndex(session.session_id), root = await f.sdkRoot(session.session_id);
    if (stage === "sdk-archived" ? index.lifecycle?.phase === "prepared" && root?.metadata.state === "archived"
      : index.lifecycle?.phase === "sdk-complete") {
      interrupted = true; throw new Error("archive projection fault");
    }
  } }), /archive projection fault/);
  assert.equal(interrupted, true);
  await f.reopen();
  const beforeRead = f.records(), originalIndex = await f.readIndex(session.session_id);
  const view = await f.call(actions.read, { session });
  assert.equal(view.state, "archived"); assert.equal(view.version, change.expected_version + 1);
  assert.deepEqual(view.operation, { action: "archive", decision: change, completed: false });
  assert.ok(view.operation); assert.ok(view.version);
  assert.deepEqual(f.records(), beforeRead, "read does not resume an interrupted archive or publish its receipt");
  view.operation.decision.operation_id = "forged-operation";
  view.operation.decision.expected_version = view.version;
  view.session.session_id = "forged-session";
  const recover = await f.call(actions.read, { session });
  assert.deepEqual(recover.operation, { action: "archive", decision: change, completed: false });
  assert.deepEqual(await f.readIndex(session.session_id), originalIndex);
  assert.deepEqual(f.records(), beforeRead, "mutating the projection does not mutate the stored original");
  assert.ok(recover.operation);
  const result = await f.call(actions.archive, { session: recover.session, decision: recover.operation.decision });
  assert.equal(result.version, view.version, "resuming the original request does not archive a second time");
  const completed = await f.call(actions.read, { session });
  assert.deepEqual(completed.operation, { action: "archive", decision: change, completed: true, receipt: result });
  assert.ok(completed.operation?.receipt);
  completed.operation.receipt!.state = "active";
  assert.deepEqual((await f.call(actions.read, { session })).operation?.receipt, result);
});

for (const stage of ["prepared", "sdk-cleaning", "sdk-complete", "index-sdk-complete"] as const) {
  test(`M4 purge resumes only its original decision after ${stage}${stage === "sdk-cleaning" ? " caller cancellation" : " interruption"}, including a closed and reopened Node owner`, async t => {
    const f = await fixture(t), session = await f.create(), other = await f.create();
    const run = await f.finishRun(session), originalRun = await f.sdkRun(run.ref);
    assert.equal(originalRun?.hasSecureBody, true, "the purge must have a real persisted child body to clean");
    const held = await f.readIndex(session.session_id);
    assert.ok(held.attempts.length && JSON.stringify(held).includes("ORIGINAL PRIVATE INPUT"));
    const preview = await f.call(actions.previewPurge, { session }), change = decision(preview, `purge-${stage}`);
    const cancellation = new AbortController();
    let interrupted = false, cancelledRecords: Record<string, string> | undefined;
    await assert.rejects(f.call(actions.purge, { session, decision: change, preview }, { signal: cancellation.signal, beforeEffect: async () => {
      const index = await f.readIndex(session.session_id), sdk = await f.sdkRoot(session.session_id);
      const at = index.lifecycle?.phase === "prepared" && !sdk?.metadata.purge ? "prepared"
        : index.lifecycle?.phase === "sdk-complete" ? "index-sdk-complete"
          : sdk?.metadata.purge?.phase === "cleaning" ? "sdk-cleaning" : sdk?.metadata.purge?.phase === "complete" ? "sdk-complete" : undefined;
      if (at === stage) {
        interrupted = true;
        if (stage === "sdk-cleaning") {
          cancelledRecords = f.records();
          cancellation.abort(new Error("original purge cancelled"));
          return; // The async hook succeeds; the production effect path must still invoke the synchronous Host fence.
        }
        throw new Error("lifecycle fault");
      }
    } }), stage === "sdk-cleaning" ? /original purge cancelled/ : /lifecycle fault/);
    assert.equal(interrupted, true, "the real durable phase must have been reached");
    if (stage === "sdk-cleaning") {
      assert.ok(cancelledRecords);
      assert.deepEqual(f.records(), cancelledRecords, "no SDK child, root-complete or Index write may follow cancellation");
      assert.equal((await f.sdkRoot(session.session_id))?.metadata.purge?.phase, "cleaning");
      assert.deepEqual(await f.sdkRun(run.ref), originalRun, "the child remains pending, not silently cleaned after root acceptance");
      const pending = await f.readIndex(session.session_id);
      assert.equal(pending.lifecycle?.phase, "prepared");
      assert.deepEqual(pending.lifecycle?.decision, change);
      assert.deepEqual(pending.attempts, held.attempts, "the already-persisted original input must remain available for reconciliation");
    }
    await assert.rejects(f.adapter.readSession(session));
    await assert.rejects(f.call(actions.unarchive, { session, decision: { ...change, operation_id: "opposite" } }));
    await assert.rejects(f.call(actions.purge, { session, decision: change, preview: { ...preview, resources: preview.resources + 1 } }));
    assert.equal((await f.adapter.readSession(other)).session.session_id, other.session_id);
    await f.reopen();
    await assert.rejects(f.adapter.readSession(session));
    if (stage === "sdk-cleaning") {
      assert.equal((await f.sdkRoot(session.session_id))?.metadata.purge?.phase, "cleaning");
      assert.deepEqual(await f.sdkRun(run.ref), originalRun, "reopening alone does not resume cancelled cleanup");
      const beforeRetry = f.records();
      await assert.rejects(f.call(actions.purge, { session, decision: { ...change, operation_id: "replacement-after-cancel" }, preview }));
      assert.deepEqual(f.records(), beforeRetry, "a replacement operation cannot continue the original purge");
    }
    const beforeRead = f.records();
    const view = await f.call(actions.read, { session });
    assert.deepEqual(view.operation, { action: "purge", decision: change, completed: false, preview });
    assert.ok(view.operation?.preview);
    assert.deepEqual(f.records(), beforeRead, "public inspection does not resume purge or expose an incomplete receipt");
    view.operation.decision.expected_version += 1;
    view.operation.preview!.resources += 1;
    view.operation.preview!.session.session_id = "forged-session";
    const recover = await f.call(actions.read, { session });
    assert.deepEqual(recover.operation, { action: "purge", decision: change, completed: false, preview });
    assert.deepEqual(f.records(), beforeRead);
    assert.ok(recover.operation?.preview);
    const result = await f.call(actions.purge, { session: recover.session, decision: recover.operation.decision, preview: recover.operation.preview });
    assert.equal(result.scope, "agent-host-session"); assert.equal(result.state, "purged");
    assert.deepEqual(await f.call(actions.purge, { session, decision: change, preview }), result);
    const afterPurge = f.records();
    const completed = await f.call(actions.read, { session });
    assert.deepEqual(completed.operation, { action: "purge", decision: change, completed: true, preview, receipt: result });
    assert.equal(completed.state, "purged"); assert.equal(completed.version, result.version);
    assert.deepEqual(f.records(), afterPurge);
    const minimal = await f.readIndex(session.session_id);
    assert.deepEqual(Object.keys(minimal).sort(), ["schema", "ref", "owner", "title", "attempts", "lifecycle"].sort());
    assert.equal(minimal.title, ""); assert.deepEqual(minimal.attempts, []);
    assert.equal(JSON.stringify(minimal).includes("ORIGINAL PRIVATE INPUT"), false);
    const root = await f.sdkRoot(session.session_id);
    assert.equal(root?.metadata.purge?.phase, "complete"); assert.equal(root?.hasSecureBody, false);
    assert.equal(await f.sdkRun(run.ref), undefined, "the original decision eventually purges the child record");
    await assert.rejects(f.adapter.readOriginalInput({ session_id: session.session_id, input_id: "original", version: 1 }));
    assert.equal((await f.call(actions.read, { session: other })).state, "active");
  });
}

test("a prepared start closes lifecycle admission, a failed start releases it, and a newer Run invalidates the old preview", async t => {
  const f = await fixture(t), session = await f.create(), preview = await f.call(actions.previewPurge, { session });
  const reached = deferred(), release = deferred(); let held = false;
  const starting = f.adapter.start(f.runRequest(session), { beforeStart: async () => {
    if (!held && (await f.readIndex(session.session_id)).attempts.length) { held = true; reached.resolve(); await release.promise; throw new Error("start cancelled before acceptance"); }
  } });
  const rejected = assert.rejects(starting, /start cancelled before acceptance/);
  await reached.promise;
  await assert.rejects(f.call(actions.previewPurge, { session }));
  await assert.rejects(f.call(actions.archive, { session, decision: decision(preview, "during-start") }));
  await assert.rejects(f.call(actions.purge, { session, decision: decision(preview, "purge-during-start"), preview }));
  assert.equal((await f.readIndex(session.session_id)).lifecycle, undefined);
  release.resolve(); await rejected;
  await f.finishRun(session);
  await assert.rejects(f.call(actions.purge, { session, decision: decision(preview, "stale-preview"), preview }));
  assert.equal((await f.readIndex(session.session_id)).lifecycle, undefined, "stale confirmation performs no cleanup");
  assert.equal((await f.adapter.readSession(session)).latest_run?.phase, "completed");
});

test("current authority is rechecked while the original lifecycle decision waits to commit", async t => {
  const f = await fixture(t), session = await f.create(), preview = await f.call(actions.previewPurge, { session });
  let current = true, calls = 0;
  await assert.rejects(f.call(actions.purge, { session, decision: decision(preview, "revoked"), preview }, {
    beforeEffect: async () => { if (++calls === 3) current = false; },
    assertCurrent: () => { if (!current) throw new Error("revoked owner"); },
  }), /revoked owner/);
  assert.equal((await f.sdkRoot(session.session_id))?.metadata.state, "active");
});

for (const gate of [1, 2]) test(`revocation at local cleanup gate ${gate} keeps the prepared decision and later review cleanup pending`, async t => {
  const f = await fixture(t), session = await f.create(), run = await f.finishRun(session);
  f.queue.restoreDecision({ review_id: "keep-until-authorized", run: run.ref, project_id: owner.project_id, plugin_id: owner.plugin_id, kind: "text-edit",
    document: { kind: "text-edit", target_path: "note.txt", exists: true, before_text: "PRIVATE REVIEW", after_text: "CHANGED REVIEW" },
    requested_at: "2026-10-24T00:00:00Z", expires_at: null }, { status: "cancelled", decided_by: null, decided_at: null, note: null });
  const preview = await f.call(actions.previewPurge, { session }), change = decision(preview, `cleanup-revoked-${gate}`);
  const entered = deferred(), release = deferred(); let current = true, reached = 0;
  t.after(() => release.resolve());
  const pending = f.call(actions.purge, { session, preview, decision: change }, {
    beforeEffect: async () => {
      if ((await f.readIndex(session.session_id)).lifecycle?.phase === "prepared" && ++reached === gate) { entered.resolve(); await release.promise; }
    }, assertCurrent: () => { if (!current) throw new Error("cleanup authority revoked"); },
  });
  const rejected = assert.rejects(pending, /cleanup authority revoked/);
  await entered.promise; current = false; release.resolve(); await rejected;
  assert.equal((await f.readIndex(session.session_id)).lifecycle?.phase, "prepared");
  assert.equal((await f.sdkRoot(session.session_id))?.metadata.state, "active");
  assert.ok(f.queue.get("keep-until-authorized"), "revocation must stop later body/handler cleanup");
  // Earlier authorized observer/target cleanup is not rolled back; the same decision finishes what remains.
  await f.call(actions.purge, { session, preview, decision: change });
  assert.equal(f.queue.get("keep-until-authorized"), null);
});

test("a restart retains an unaccepted prepared intent while the complete SDK ledger allows preview and purge", async t => {
  const f = await fixture(t), session = await f.create(); let intent: RawIndex | undefined;
  await assert.rejects(f.adapter.start(f.runRequest(session), { beforeStart: async () => {
    const snapshot = await f.readIndex(session.session_id);
    if (snapshot.attempts.length) { intent = snapshot; throw new Error("simulate exit before SDK acceptance"); }
  } }), /simulate exit before SDK acceptance/);
  assert.ok(intent); assert.equal(intent.attempts[0]?.run_id, undefined); assert.equal(intent.attempts[0]?.refused, undefined);
  // Preserve precisely the durable snapshot a process exit would leave, without running a second SDK owner.
  await f.reopen(() => f.writeIndex(session.session_id, intent!));
  const recovery = await f.adapter.recovery!.inspect(session);
  assert.deepEqual(recovery.blockers, []); assert.deepEqual(recovery.runs, []);
  const preview = await f.call(actions.previewPurge, { session });
  assert.equal(preview.runs, 0); assert.deepEqual((await f.readIndex(session.session_id)).attempts, intent.attempts);
  await f.call(actions.purge, { session, preview, decision: decision(preview, "historical-intent") });
  assert.deepEqual((await f.readIndex(session.session_id)).attempts, []);
});

for (const source of ["unclaimed", "unavailable"] as const) test(`a historical intent remains busy when the SDK ledger is ${source}`, async t => {
  const f = await fixture(t), session = await f.create(); await f.finishRun(session);
  const preview = await f.call(actions.previewPurge, { session }); let intent = await f.readIndex(session.session_id);
  if (source === "unclaimed") delete intent.attempts[0]!.run_id;
  else {
    const next = f.runRequest(session); next.original_input.input_id = "second-original";
    await assert.rejects(f.adapter.start(next, { beforeStart: async () => {
      const snapshot = await f.readIndex(session.session_id);
      if (snapshot.attempts.length > 1) { intent = snapshot; throw new Error("second intent left by exit"); }
    } }), /second intent left by exit/);
    assert.ok(intent.attempts[0]!.run_id, "all actual SDK runs remain claimed; only unavailable work may block this case");
    assert.equal(intent.attempts[1]!.run_id, undefined);
  }
  await f.reopen(async () => { await f.writeIndex(session.session_id, intent); if (source === "unavailable") await f.addUnreadableRun(); });
  const recovery = await f.adapter.recovery!.inspect(session); assert.ok(recovery.blockers.length);
  if (source === "unavailable") assert.ok(recovery.blockers.some(reason => reason.includes("不可读取")), "SDK reports unavailable work, not an empty ledger");
  await assert.rejects(f.call(actions.previewPurge, { session }), { code: "agent.session_busy" });
  await assert.rejects(f.call(actions.purge, { session, preview, decision: decision(preview, `busy-${source}`) }));
  assert.equal((await f.readIndex(session.session_id)).lifecycle, undefined);
  assert.deepEqual((await f.readIndex(session.session_id)).attempts, intent.attempts);
});

test("a missing SDK root cannot turn a persisted original purge decision into success", async t => {
  const f = await fixture(t), session = await f.create(), preview = await f.call(actions.previewPurge, { session });
  const change = decision(preview, "missing-root");
  await assert.rejects(f.call(actions.purge, { session, decision: change, preview }, { beforeEffect: async () => {
    if ((await f.readIndex(session.session_id)).lifecycle?.phase === "prepared") throw new Error("before permanent gate");
  } }), /before permanent gate/);
  await f.removeSdkRoot(session.session_id);
  await f.reopen();
  await assert.rejects(f.call(actions.purge, { session, decision: change, preview }));
  const view = await f.call(actions.read, { session });
  assert.equal(view.state, "unknown");
  assert.deepEqual(view.operation, { action: "purge", decision: change, completed: false, preview });
  assert.equal((await f.readIndex(session.session_id)).lifecycle?.phase, "prepared");
});

test("public Node purge releases only review documents explicitly owned by its Session", async t => {
  const f = await fixture(t), session = await f.create(), other = await f.create();
  const run = await f.finishRun(session), otherRun = await f.finishRun(other);
  for (const [review_id, ref, project_id] of [["target", run.ref, owner.project_id], ["other", otherRun.ref, owner.project_id], ["other-project", run.ref, "elsewhere"]] as const) {
    f.queue.restoreDecision({ review_id, run: ref, project_id, plugin_id: owner.plugin_id, kind: "text-edit",
      document: { kind: "text-edit", target_path: "note.txt", exists: true, before_text: "PRIVATE REVIEW", after_text: "CHANGED REVIEW" },
      requested_at: "2026-10-24T00:00:00Z", expires_at: null }, { status: "cancelled", decided_by: null, decided_at: null, note: null });
  }
  const preview = await f.call(actions.previewPurge, { session });
  await f.call(actions.purge, { session, preview, decision: decision(preview, "review-cleanup") });
  assert.equal(f.queue.get("target"), null); assert.equal(f.queue.receipt("target"), null);
  assert.ok(f.queue.get("other")); assert.ok(f.queue.get("other-project"));
  assert.equal((await f.adapter.read(otherRun.ref)).phase, "completed");
});

test("purging an idle Session leaves another Session's real Run executing", async t => {
  const f = await fixture(t), session = await f.create(), other = await f.create(), held = f.holdProvider();
  const run = await f.adapter.start(f.runRequest(other));
  await held.entered;
  const preview = await f.call(actions.previewPurge, { session });
  await f.call(actions.purge, { session, preview, decision: decision(preview, "other-run-unaffected") });
  assert.equal((await f.adapter.read(run.ref)).phase, "running");
  held.release(); await f.waitRun(run.ref);
  assert.equal((await f.adapter.read(run.ref)).phase, "completed");
});

type RawIndex = { title: string; attempts: Array<{ run_id?: string; refused?: unknown }>; lifecycle?: { phase: string; decision: AgentSessionDecision } };
type Root = { hasSecureBody: boolean; metadata: { state?: string; purge?: { phase: string } } };
function records(directory: string): Record<string, string> {
  if (!existsSync(directory)) return {};
  return Object.fromEntries(readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? Object.entries(records(path)).map(([name, bytes]) => [`${entry.name}/${name}`, bytes])
      : [[entry.name, readFileSync(path).toString("base64")]];
  }));
}
async function fixture(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "molis-session-lifecycle-"));
  let providerHold: { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> } | undefined;
  let backgroundRequest = false;
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* Consume the real local provider request. */ }
    const held = providerHold; providerHold = undefined;
    if (held) { held.entered.resolve(); await held.release.promise; }
    response.writeHead(200, { "content-type": "text/event-stream" });
    if (backgroundRequest) {
      backgroundRequest = false;
      const call = { index: 0, id: "background-command", type: "function", function: { name: "start-command", arguments: JSON.stringify({ executable: "/bin/sleep", argv: ["60"] }) } };
      response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [call] }, finish_reason: null }] })}\n\n`
        + 'data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n');
      return;
    }
    response.end('data: {"choices":[{"index":0,"delta":{"content":"Done."},"finish_reason":null}]}\n\n'
      + 'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const queue = new AgentReviewQueue();
  const open = () => createPrologueNodeAdapter({ app, storageRoot: home, reviewQueue: queue, resolveCredential: () => "test-only",
    modelConfiguration: async () => ({ protocol: "openai-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/chat/completions`, model: "fixture", credential_ref: "fixture" }) });
  let adapter = await open();
  const inspector = createNodeHost({ storageRoot: home });
  const indexKind = `molis-agent-index-${createHash("sha256").update(app.appId).digest("hex").slice(0, 24)}`;
  const handlers = new Map<string, (input: unknown, invocation: HostCapabilityInvocation) => Promise<unknown>>();
  const wire = () => {
    handlers.clear(); const host = new AgentHost(); host.register(adapter);
    registerAgentHostCapabilities({ register<I, O>(definition: HostCapabilityDefinition<I, O>, handler: (context: null, input: I, invocation: HostCapabilityInvocation) => O | Promise<O>) {
      handlers.set(definition.capability_id, async (input, invocation) => handler(null, input as I, invocation)); return () => {};
    } }, { agentHost: () => host, projectId: () => owner.project_id, authority: () => ({ manifest: { roles: [] }, authorizedDirectories: [] }) });
  };
  wire();
  t.after(async () => { await adapter.close(); await inspector.storage.close?.(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(home, { recursive: true, force: true }); });
  const runRequest = (session: AgentSessionRef) => ({ ...owner, session, workspace: "none" as const, role_id: "reader", task: "Complete this task.",
    original_input: { input_id: "original", text: "ORIGINAL PRIVATE INPUT", written_by: "person" as const, occurred_at: "2026-10-24T00:00:00Z" },
    role: { role_id: "reader", version: 1, workspace: "none" as const, execution: "read-only" as const, host_tools: [], prompts: [] } });
  const waitRun = async (ref: { session_id: string; run_id: string }) => {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const view = await adapter.read(ref);
      if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) { assert.equal(view.phase, "completed", view.stop_reason); return; }
      assert.ok(Date.now() < deadline, "real SDK Run must terminate"); await new Promise(resolve => setTimeout(resolve, 10));
    }
  };
  return {
    get adapter() { return adapter; }, runRequest, queue, waitRun,
    async startBackground() {
      const directory = { canonical_path: home, realpath_verified: true };
      const session = await adapter.createSession({ ...owner, directory, title: "Background command" });
      backgroundRequest = true;
      const run = await adapter.start({ ...owner, session, directory, role_id: "command", task: "Start the approved background command.",
        role: { role_id: "command", version: 1, execution: "workspace-write", host_tools: ["start-command"], prompts: [] } });
      const deadline = Date.now() + 10_000;
      for (;;) {
        for (const review of queue.list(owner.project_id, "pending")) await queue.respond({ review_id: review.review_id, decision: "approve", actor_id: owner.actor_id });
        const view = await adapter.read(run.ref);
        if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) { assert.equal(view.phase, "completed", view.stop_reason); break; }
        assert.ok(Date.now() < deadline, "the background command's original Run must end");
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      return session;
    },
    holdProvider() { const held = { entered: deferred(), release: deferred() }; providerHold = held; t.after(() => held.release.resolve()); return { entered: held.entered.promise, release: held.release.resolve }; },
    create: () => adapter.createSession({ ...owner, workspace: "none", role_id: "reader", title: "Private Session title" }),
    reopen: async (beforeOpen?: () => Promise<void>) => { await adapter.close(); await beforeOpen?.(); adapter = await open(); wire(); },
    async historicalWaits(session: AgentSessionRef, other: AgentSessionRef): Promise<string[]> {
      await adapter.close();
      const runtime = await createRuntime({ app, host: createNodeHost({ storageRoot: home }), config: { waits: { autoContinue: false } } });
      const ids: string[] = [];
      try {
        const ref = (id: string) => ({ kind: "session" as const, id, revision: 1 });
        const board = await runtime.boards.admit({ nodes: ["one", "two", "three", "other", "blocker"].map(id => ({ id, title: "PRIVATE WAIT TITLE", dependsOn: [], onFailure: "block-for-human" as const,
          assignee: ref(id === "other" || id === "blocker" ? other.session_id : session.session_id) })) });
        for (const node of ["one", "two", "three", "other"]) {
          await runtime.boards.transition({ ref: board.ref, nodeId: node, to: "running" });
          const target = node === "other" ? other : session;
          const { wait } = await runtime.waits.arm({ session: ref(target.session_id), by: "app", reason: "PRIVATE WAIT REASON", arrangement: {
            scope: { board: board.ref.id, node, generation: 1 }, on: [{ kind: "node", board: board.ref.id, node: "blocker" }],
            mode: "all", until: "success", onFailure: "block", onEarlyContinue: "keep", deadlineMs: Date.now() + 60_000, autoContinue: false, afterwards: "end-step",
          } }, Date.now());
          if (runtime.waits.get(wait.ref.id)?.state === "waiting") await runtime.waits.cancel(wait.ref.id, Date.now(), "PRIVATE CANCELLATION NOTE");
          assert.notEqual(runtime.waits.get(wait.ref.id)?.state, "waiting", "the historical wait must be terminal before preparation");
          if (node !== "other") ids.push(wait.ref.id);
        }
        await runtime.boards.transition({ ref: board.ref, nodeId: "blocker", to: "cancelled" });
      } finally { await runtime.shutdown(); adapter = await open(); wire(); }
      return ids.sort();
    },
    async readIndex(id: string): Promise<RawIndex> { const bytes = await inspector.storage.readSecure({ kind: indexKind, id }); try { return JSON.parse(new TextDecoder().decode(bytes)); } finally { bytes.fill(0); } },
    async writeIndex(id: string, value: RawIndex) {
      const record = await inspector.storage.get({ kind: indexKind, id }); assert.ok(record);
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      try { await inspector.storage.commit({ kind: indexKind, id, expectedVersion: record.version, metadata: record.metadata, secureBody: bytes }); } finally { bytes.fill(0); }
    },
    async addUnreadableRun() { await inspector.storage.commit({ kind: `${app.appId}~runs`, id: "unreadable-other-session", expectedVersion: 0, metadata: { state: "running" } }); },
    sdkRoot: async (id: string): Promise<Root | undefined> => inspector.storage.get({ kind: `${app.appId}~sessions`, id }),
    sdkRun: async (ref: { session_id: string; run_id: string }): Promise<Root | undefined> => inspector.storage.get({ kind: `${app.appId}~runs`, id: `${ref.session_id}.${ref.run_id}` }),
    records: () => records(join(home, "records")),
    async removeSdkRoot(id: string) { const kind = `${app.appId}~sessions`, record = await inspector.storage.get({ kind, id }); assert.ok(record); await inspector.storage.remove({ kind, id, expectedVersion: record.version }); await inspector.storage.purge({ kind, id }); },
    async call<I, O>(definition: HostCapabilityDefinition<I, O>, input: I, options: { caller?: AgentSessionOwner; signal?: AbortSignal; beforeEffect?(): Promise<void>; assertCurrent?(): void } = {}): Promise<O> {
      const caller = options.caller ?? owner;
      return await handlers.get(definition.capability_id)!(input, { consumer: "plugin", signal: options.signal,
        plugin: { ...caller, declaration: { manifest: {} as never }, assertActive: () => options.assertCurrent?.() },
        beforeEffect: options.beforeEffect ?? (async () => {}),
        // HostCapabilityInvocation owns this fence, as typedCapabilityInvocation does in the real local Host.
        assertAuthorityCurrent: () => { options.signal?.throwIfAborted(); options.assertCurrent?.(); } }) as O;
    },
    async finishRun(session: AgentSessionRef) {
      const run = await adapter.start(runRequest(session));
      await waitRun(run.ref); return run;
    },
  };
}
