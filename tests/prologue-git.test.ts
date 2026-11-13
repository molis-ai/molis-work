import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { createPrologueGitReviews } from "../horizontal/agent-host/dist/adapters/prologue-git.js";

const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk"));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
type GitReviewPorts = Parameters<typeof createPrologueGitReviews>[0];
type StoredDecision = NonNullable<Awaited<ReturnType<GitReviewPorts["readDecision"]>>>;

/** A real port implementation: decisions live on this instance, not in the reader's closure. */
class StoredGitReviewPorts implements GitReviewPorts {
  readonly decisions = new Map<string, StoredDecision>();
  reads = 0;
  failOnRead?: number;
  readFailure?: Error;
  decisionFailure?: Error;
  constructor(readonly runtime: GitReviewPorts["runtime"], public queue: AgentReviewQueue) {}
  async publish(value: unknown) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const stage = this.runtime.resources.stage({ mediaKind: "text", byteLength: bytes.byteLength, label: "receiver review" });
    try { stage.write(bytes); return (await stage.publishDurable()).ref; }
    catch (error) { stage.discard(); throw error; }
  }
  async read(ref: Parameters<GitReviewPorts["read"]>[0]) {
    const handle = this.runtime.resources.inspect(ref);
    assert.ok(handle);
    const chunk = await this.runtime.resources.readChunk(ref, 0, handle.byteLength);
    assert.equal(chunk.done, true);
    return JSON.parse(new TextDecoder().decode(chunk.bytes));
  }
  async saveDecision(key: string, value: StoredDecision) {
    if (this.decisionFailure) throw this.decisionFailure;
    this.decisions.set(key, structuredClone(value));
  }
  async saveFailure(key: string, reason: string) {
    const decision = this.decisions.get(key); assert.ok(decision);
    this.decisions.set(key, { ...decision, failure_reason: reason });
  }
  async saveReconciliation(key: string, value: NonNullable<StoredDecision["reconciliation"]>) {
    const decision = this.decisions.get(key); assert.ok(decision);
    this.decisions.set(key, { ...decision, reconciliation: value });
  }
  async readDecision(key: string) {
    this.reads++;
    if (this.reads === this.failOnRead) throw this.readFailure;
    return this.decisions.get(key);
  }
}

/** Restore an actual SDK effect that never dispatched, with its original persisted human decision. */
async function restoredGitDecision(t: import("node:test").TestContext, freeReader = false) {
  const root = await mkdtemp(path.join(tmpdir(), "git-decision-receiver-"));
  let runtime: GitReviewPorts["runtime"] | undefined, reviews: ReturnType<typeof createPrologueGitReviews> | undefined;
  t.after(async () => {
    try { await reviews?.close(); }
    finally { try { await runtime?.shutdown(); } finally { await rm(root, { recursive: true, force: true }); } }
  });
  const sdk: GitReviewPorts["runtime"] = await createRuntime({ app: { appId: "molis.git.receiver", appVersion: "1.0.0" },
    host: createNodeHost({ storageRoot: path.join(root, "sdk") }), preset: "local-agent", posture: { sandbox: "workspace-write" } });
  runtime = sdk;
  const ports = new StoredGitReviewPorts(sdk, new AgentReviewQueue());
  reviews = createPrologueGitReviews(ports);
  const request = await reviews.prepare({ project_id: "board", workspace_id: "workspace", operation_id: "receiver-operation",
    document: { kind: "git-index", action: "stage", workspace_name: "fixture", files: [
      { path: "note", before_text: "before", after_text: "after", before_mode: "100644", after_mode: "100644" },
    ] } }, { authority: held, check: async () => {}, execute: async () => { assert.fail("the restored effect must never execute"); } });
  const effect = (await sdk.effects.readRecovery()).effects.find(value => request.review_id === `prologue-git:${value.pending?.ref.id}`);
  assert.ok(effect?.pending);
  const receipt = ports.queue.decide({ review_id: request.review_id, decision: "approve", actor_id: "original-reviewer", note: "the original decision" });
  const decision: StoredDecision = { status: receipt.status, decided_by: receipt.decided_by, decided_at: receipt.decided_at, note: receipt.note,
    reconciliation: { actor_id: "original-verifier", at: new Date().toISOString(), reason: "The original effect was checked and did not dispatch." } };
  await ports.saveDecision(effect.proposal.inputFingerprint, decision);
  const answered = await sdk.effects.pendings.answer(effect.pending.ref, { kind: "effect-approval", answer: "allow" }, await sdk.readClock());
  assert.equal(answered.authorized, true);
  let executions = 0;
  await assert.rejects(sdk.effects.dispatch(effect.ref, { recheck: async () => false, run: async () => { executions++; } }), { code: "POLICY_DENIED" });
  assert.equal(executions, 0);
  assert.equal(sdk.effects.get(effect.ref)?.state, "failed");
  assert.equal((await sdk.effects.inspectDispatch(effect.ref)).state, "not-dispatched");
  await reviews.close();
  ports.queue = new AgentReviewQueue();
  if (freeReader) {
    const decisions = ports.decisions;
    ports.readDecision = async key => decisions.get(key);
  }
  reviews = createPrologueGitReviews(ports);
  return { ports, decision, request, refresh: () => ports.queue.refresh("board") };
}

for (const freeReader of [false, true]) test(`${freeReader ? "R38-GIT-RECEIVER-02" : "R38-GIT-RECEIVER-01"} production Git settlement restores the stored decision with ${freeReader ? "a receiver-free reader" : "a stateful Ports method"}`, async t => {
  const fixture = await restoredGitDecision(t, freeReader);
  await fixture.refresh();
  const receipt = fixture.ports.queue.receipt(fixture.request.review_id);
  assert.ok(receipt);
  assert.equal(receipt.status, fixture.decision.status);
  assert.equal(receipt.decided_by, "original-reviewer");
  assert.equal(receipt.note, "the original decision");
  assert.deepEqual(receipt.reconciliation, fixture.decision.reconciliation);
  assert.match(receipt.effect_error!, /原操作未发生/);
  assert.equal(receipt.effect_settled, false);
  if (!freeReader) assert.equal(fixture.ports.reads, 2, "restore and production settleReview both read the original Ports instance");
});

test("R38-GIT-RECEIVER-03 production Git settlement propagates the original reader error", async t => {
  const fixture = await restoredGitDecision(t);
  const failure = new Error("stored decision could not be read at settlement");
  fixture.ports.failOnRead = 2; fixture.ports.readFailure = failure;
  await assert.rejects(fixture.refresh(), error => error === failure);
  assert.equal(fixture.ports.reads, 2, "the failure came from settlement, after the initial restore read");
  assert.equal(fixture.ports.queue.receipt(fixture.request.review_id)?.effect_settled, false);
  assert.equal(fixture.ports.queue.receipt(fixture.request.review_id)?.reconciliation, undefined);
});

/** The installation asking, as the Host passes it (PG-009): here one that holds its kind throughout. */
const held = { plugin_id: "io.molis.work.git", install_id: "fixture", holds: () => true };

async function liveGitDecision(t: import("node:test").TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), "git-decision-lifecycle-"));
  const sdk: GitReviewPorts["runtime"] = await createRuntime({ app: { appId: "molis.git.lifecycle", appVersion: "1.0.0" },
    host: createNodeHost({ storageRoot: path.join(root, "sdk") }), preset: "local-agent", posture: { sandbox: "workspace-write" } });
  const ports = new StoredGitReviewPorts(sdk, new AgentReviewQueue()), reviews = createPrologueGitReviews(ports);
  t.after(async () => { try { await reviews.close(); await sdk.shutdown(); } finally { ports.queue.close(); await rm(root, { recursive: true, force: true }); } });
  const prepare = (operation_id: string, execute: () => Promise<void> = async () => { assert.fail("unapproved operation ran"); }) =>
    reviews.prepare({ project_id: "board", workspace_id: "workspace", operation_id, document: { kind: "git-index", action: "stage", workspace_name: "fixture", files: [] } },
      { authority: held, check: async () => {}, execute });
  return { sdk, ports, reviews, prepare };
}

test("BL-359: a real Git decision storage failure cancels before dispatch, releases the workspace and sends no change event", async t => {
  const { sdk, ports, prepare } = await liveGitDecision(t);
  const events: string[] = [];
  ports.queue.observeSettlement(review => events.push(review.review_id));
  const first = await prepare("save-fails");
  const effect = (await sdk.effects.readRecovery()).effects.find(item => item.pending?.ref.id === first.review_id.slice("prologue-git:".length));
  assert.ok(effect);
  ports.decisionFailure = new Error("decision storage unavailable");
  await assert.rejects(ports.queue.respond({ review_id: first.review_id, decision: "approve", actor_id: "person" }), /decision storage unavailable/);
  assert.equal(sdk.effects.get(effect.ref)?.state, "cancelled");
  assert.equal((await sdk.effects.inspectDispatch(effect.ref)).state, "not-dispatched");
  assert.equal(ports.decisions.size, 0);
  assert.match(ports.queue.receipt(first.review_id)?.effect_error ?? "", /确认未执行/);
  assert.equal(ports.queue.receipt(first.review_id)?.effect_uncertain, undefined);
  assert.deepEqual(events, []);
  ports.decisionFailure = undefined;
  const next = await prepare("new-operation");
  assert.equal(ports.queue.receipt(next.review_id)?.status, "pending", "the cancelled operation no longer blocks this workspace");
  await ports.queue.respond({ review_id: next.review_id, decision: "reject", actor_id: "person" });
});

test("BL-359: a failed Git dispatch inspection cannot turn a delivery failure into a no-dispatch conclusion", async t => {
  const { sdk, ports, prepare } = await liveGitDecision(t);
  const first = await prepare("unreadable-dispatch");
  ports.decisionFailure = new Error("decision storage unavailable");
  const inspection = t.mock.method(sdk.effects, "inspectDispatch", async () => { throw new Error("dispatch ledger unavailable"); });
  await assert.rejects(ports.queue.respond({ review_id: first.review_id, decision: "approve", actor_id: "person" }), /dispatch ledger unavailable/);
  assert.equal(ports.queue.receipt(first.review_id)?.effect_error, null);
  assert.match(ports.queue.receipt(first.review_id)?.delivery_error ?? "", /storage unavailable/);
  await assert.rejects(prepare("not-allowed-yet"), /结果未知/);
  inspection.mock.restore();
});

test("BL-359: closing while a Git decision is saving proves cancellation without dispatch or notification", async t => {
  const { sdk, ports, reviews, prepare } = await liveGitDecision(t);
  const saving = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), cancelled = Promise.withResolvers<void>();
  const saveDecision = ports.saveDecision.bind(ports), cancel = sdk.effects.cancel.bind(sdk.effects);
  t.mock.method(ports, "saveDecision", async (key: string, value: StoredDecision) => {
    saving.resolve(); await release.promise; await saveDecision(key, value);
  });
  t.mock.method(sdk.effects, "cancel", async (ref: Parameters<typeof cancel>[0]) => {
    const result = await cancel(ref); cancelled.resolve(); return result;
  });
  let executions = 0;
  const events: string[] = [];
  ports.queue.observeSettlement(review => events.push(review.review_id));
  const request = await prepare("closing-before-dispatch", async () => { executions++; });
  const decision = ports.queue.respond({ review_id: request.review_id, decision: "approve", actor_id: "person" });
  const rejected = assert.rejects(decision);
  await saving.promise;
  const closing = reviews.close();
  try { await cancelled.promise; } finally { release.resolve(); }
  await rejected; await closing;
  const effect = (await sdk.effects.readRecovery()).effects.find(item => item.pending?.ref.id === request.review_id.slice("prologue-git:".length));
  assert.ok(effect);
  assert.equal(sdk.effects.get(effect.ref)?.state, "cancelled");
  assert.equal((await sdk.effects.inspectDispatch(effect.ref)).state, "not-dispatched");
  assert.equal(executions, 0);
  assert.equal(ports.decisions.size, 1, "saving finished before the original wait rejected the answer");
  assert.match(ports.queue.receipt(request.review_id)?.effect_error ?? "", /确认未执行/);
  assert.equal(ports.queue.receipt(request.review_id)?.delivery_error, undefined);
  assert.deepEqual(events, []);
});

test("BL-360: a Git pending closed during entry waiting cannot be approved or dispatched", async t => {
  const { sdk, ports, prepare } = await liveGitDecision(t);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  t.after(() => release.resolve());
  let executions = 0;
  const request = await prepare("pending-ended-before-commit", async () => { executions++; });
  const effect = (await sdk.effects.readRecovery()).effects.find(item => item.pending?.ref.id === request.review_id.slice("prologue-git:".length));
  assert.ok(effect?.pending);
  const result = ports.queue.respond({ review_id: request.review_id, decision: "approve", actor_id: "person" }, {
    beforeEffect: async () => { entered.resolve(); await release.promise; },
  });
  const rejected = assert.rejects(result, /等待已经结束/);
  await entered.promise;
  await sdk.effects.pendings.answer(effect.pending.ref, { kind: "effect-approval", answer: "deny" }, await sdk.readClock());
  assert.notEqual(sdk.effects.pendings.get(effect.pending.ref)?.state, "open");
  release.resolve(); await rejected;
  assert.equal(ports.queue.receipt(request.review_id)?.status, "pending");
  assert.equal(ports.queue.receipt(request.review_id)?.decided_by, null);
  assert.equal(ports.decisions.size, 0); assert.equal(executions, 0);
  assert.equal((await sdk.effects.inspectDispatch(effect.ref)).state, "not-dispatched");
});

test("BL-359: Git close waits for an already-dispatched decision to publish its actual settlement", async t => {
  const { ports, reviews, prepare } = await liveGitDecision(t);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const events: string[] = [];
  ports.queue.observeSettlement(review => events.push(review.review_id));
  const request = await prepare("in-flight", async () => { entered.resolve(); await release.promise; });
  const decision = ports.queue.respond({ review_id: request.review_id, decision: "approve", actor_id: "person" });
  await entered.promise;
  let closed = false;
  const closing = reviews.close().then(() => { closed = true; });
  try {
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(closed, false, "storage and queue notifications remain available to the dispatched operation");
  } finally { release.resolve(); }
  await decision; await closing;
  assert.equal(ports.queue.receipt(request.review_id)?.effect_settled, true);
  assert.deepEqual(events, [request.review_id]);
});

test("BL-359: Git close waits for accepted recovery to save its result and rejects new recovery", async t => {
  const { sdk, ports, reviews, prepare } = await liveGitDecision(t);
  const request = await prepare("recovering-at-close", async () => {
    throw Object.assign(new Error("lost dispatch receipt"), { code: "EFFECT_RECONCILE_REQUIRED" });
  });
  await ports.queue.respond({ review_id: request.review_id, decision: "approve", actor_id: "person" });
  assert.ok(ports.queue.receipt(request.review_id)?.effect_uncertain);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const saveReconciliation = ports.saveReconciliation.bind(ports);
  t.mock.method(ports, "saveReconciliation", async (key: string, value: NonNullable<StoredDecision["reconciliation"]>) => {
    entered.resolve(); await release.promise; await saveReconciliation(key, value);
  });
  const observe = async () => ({ revision: "original-index", observed_at: new Date().toISOString(), files: [], matches_before: true, matches_after: false });
  const events: string[] = [];
  ports.queue.observeSettlement(review => events.push(review.review_id));
  const input = { review_id: request.review_id, action: "not-happened" as const, actor_id: "person", revision: "original-index", reason: "The fixture stopped before applying an index change." };
  const recovery = ports.queue.recover(input, observe);
  await entered.promise;
  const scanned = Promise.withResolvers<void>(), readRecovery = sdk.effects.readRecovery.bind(sdk.effects);
  t.mock.method(sdk.effects, "readRecovery", async () => {
    const report = await readRecovery(); scanned.resolve(); return report;
  });
  let closed = false;
  const closing = reviews.close().then(() => { closed = true; });
  try {
    await assert.rejects(ports.queue.recover(input, observe), /仍在处理/);
    await assert.rejects(ports.queue.inspectRecovery(request.review_id, observe), /正在关闭/);
    await scanned.promise;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(closed, false);
  } finally { release.resolve(); }
  const result = await recovery; await closing;
  assert.equal(result.receipt.effect_uncertain, undefined);
  assert.match(result.receipt.effect_error ?? "", /未发生/);
  assert.equal(result.receipt.reconciliation?.reason, input.reason);
  assert.equal((await sdk.effects.readRecovery()).effects.find(effect => effect.pending?.ref.id === request.review_id.slice("prologue-git:".length))?.state, "failed");
  assert.deepEqual(events, [request.review_id]);
});

test("worktree creation with a missing dispatch receipt remains unknown after restart and cannot be retried as an index operation", async () => {
  const root=await mkdtemp(path.join(tmpdir(),"worktree-uncertain-"));let queue=new AgentReviewQueue(),calls=0;
  const make=()=>createPrologueNodeAdapter({app:{appId:"molis.worktree.unknown",appVersion:"1.0.0"},storageRoot:path.join(root,"sdk"),reviewQueue:queue,modelConfiguration:async()=>{throw new Error("no model for directory preparation");}});
  let adapter=await make();
  const intent={project_id:"b",workspace_id:"w",operation_id:"worktree-unknown",operation_kind:"git-worktree" as const,document:{kind:"tool-operation" as const,tool:"git-worktree-create",summary:"prepare",fields:[{label:"directory",value:root}]}};
  const execution={authority:held,check:async()=>{},execute:async()=>{calls++;await writeFile(path.join(root,"created"),"created once");throw Object.assign(new Error("lost receipt"),{code:"EFFECT_RECONCILE_REQUIRED"});}};
  try {
    const request=await adapter.gitReviews!.prepare(intent,execution);
    await queue.respond({review_id:request.review_id,decision:"approve",actor_id:"test"});
    assert.equal(queue.receipt(request.review_id)?.effect_settled,false);assert.ok(queue.receipt(request.review_id)?.effect_uncertain);
    await adapter.close();queue=new AgentReviewQueue();adapter=await make();await queue.refresh("b");
    assert.equal(queue.get(request.review_id)?.operation?.kind,"git-worktree");assert.ok(queue.receipt(request.review_id)?.effect_uncertain);
    await assert.rejects(adapter.gitReviews!.prepare({...intent,operation_id:"worktree-next"},execution),/结果未知/);
    await assert.rejects(queue.respond({review_id:request.review_id,decision:"approve",actor_id:"test"}));
    assert.equal(calls,1);assert.equal(await readFile(path.join(root,"created"),"utf8"),"created once");
  } finally {await adapter.close();await rm(root,{recursive:true,force:true});}
});

test("Git uses the SDK's durable effect receipt and blocks redispatch after an uncertain result across restart", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "git-effect-")), target = path.join(root, "effect-count");
  let queue: AgentReviewQueue, adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>>, calls = 0;
  const start = async () => {
    queue = new AgentReviewQueue();
    adapter = await createPrologueNodeAdapter({ app: { appId: "molis.git.test", appVersion: "1.0.0" }, storageRoot: path.join(root, "sdk"), reviewQueue: queue,
      modelConfiguration: async () => { throw new Error("manual Git operations must not request a model"); } });
  };
  const intent = { project_id: "board", workspace_id: "workspace", operation_id: "operation-uncertain",
    document: { kind: "git-index" as const, action: "stage" as const, workspace_name: "fixture",
      files: [{ path: "note", before_text: "before", after_text: "after", before_mode: "100644" as const, after_mode: "100644" as const }] } };
  try {
    await start();
    const request = await adapter.gitReviews!.prepare(intent, { authority: held, check: async () => {}, execute: async () => {
      calls++; await writeFile(target, String(calls)); throw Object.assign(new Error("receipt unavailable after dispatch"), { code: "EFFECT_RECONCILE_REQUIRED" });
    } });
    const duplicate = await adapter.gitReviews!.prepare(intent, { authority: held, check: async () => {}, execute: async () => { calls++; } });
    assert.equal(duplicate.review_id, request.review_id); assert.equal(calls, 0);
    await assert.rejects(adapter.gitReviews!.prepare({ ...intent, document: { ...intent.document, action: "unstage" } }, { authority: held, check: async () => {}, execute: async () => {} }), /另一份/);
    const result = await queue.respond({ review_id: request.review_id, decision: "approve", actor_id: "tester" });
    assert.equal(result.effect_settled, false); assert.ok(result.effect_uncertain); assert.equal(await readFile(target, "utf8"), "1");
    await adapter.close(); await start(); await queue.refresh("board");
    assert.ok(queue.receipt(request.review_id)?.effect_uncertain);
    await assert.rejects(adapter.gitReviews!.prepare({ ...intent, operation_id: "second-operation" }, { authority: held, check: async () => {}, execute: async () => { calls++; } }), /结果未知/);
    await assert.rejects(queue.respond({ review_id: request.review_id, decision: "approve", actor_id: "tester" }));
    assert.equal(calls, 1); assert.equal(await readFile(target, "utf8"), "1");
  } finally { await adapter!?.close(); await rm(root, { recursive: true, force: true }); }
});


test("integration with an uncertain write retains its original review and blocks replay after restart", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "integration-uncertain-"));
  let queue = new AgentReviewQueue(), calls = 0;
  const make = () => createPrologueNodeAdapter({ app: { appId: "molis.integration.unknown", appVersion: "1.0.0" }, storageRoot: path.join(root, "sdk"), reviewQueue: queue, modelConfiguration: async () => { throw new Error("manual operation"); } });
  let adapter = await make();
  const intent = { project_id: "b", workspace_id: "w", operation_id: "integration-original", operation_kind: "git-integration" as const,
    document: { kind: "git-integration" as const, target_directory: root, source: { session_id: "s", run_id: "r", subagent_id: "child", branch: "branch", base_commit: "base", directory: root + "/child" },
      files: [{ path: "created", before_text: null, after_text: "once", before_mode: null, after_mode: "100644" as const }] } };
  const execution = { authority: held, check: async () => {}, execute: async () => { calls++; await writeFile(path.join(root, "created"), "once"); throw Object.assign(new Error("write result uncertain"), { code: "EFFECT_RECONCILE_REQUIRED" }); } };
  try {
    const original = await adapter.gitReviews!.prepare(intent, execution);
    await queue.respond({ review_id: original.review_id, decision: "approve", actor_id: "user" });
    assert.ok(queue.receipt(original.review_id)?.effect_uncertain);
    await adapter.close(); queue = new AgentReviewQueue(); adapter = await make(); await queue.refresh("b");
    assert.deepEqual(queue.get(original.review_id)?.document, intent.document);
    assert.ok(queue.receipt(original.review_id)?.effect_uncertain);
    await assert.rejects(adapter.gitReviews!.prepare({ ...intent, operation_id: "integration-retry" }, execution), /结果未知/);
    assert.equal(calls, 1); assert.equal(await readFile(path.join(root, "created"), "utf8"), "once");
  } finally { await adapter.close(); await rm(root, { recursive: true, force: true }); }
});

test("after a restart, review refreshes bring earlier Git operations back once and do not reread the whole execution ledger", async () => {
  const fs = (await import("node:fs")).default, { syncBuiltinESMExports } = await import("node:module");
  const root = await mkdtemp(path.join(tmpdir(), "git-refresh-once-"));
  let queue = new AgentReviewQueue();
  const make = () => createPrologueNodeAdapter({ app: { appId: "molis.git.refresh", appVersion: "1.0.0" }, storageRoot: path.join(root, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => { throw new Error("manual Git operations must not request a model"); } });
  let adapter = await make();
  const original = fs.readFileSync;
  try {
    for (const operation_id of ["operation-one", "operation-two", "operation-three"]) {
      const request = await adapter.gitReviews!.prepare({ project_id: "board", workspace_id: "workspace", operation_id,
        document: { kind: "git-index", action: "stage", workspace_name: "fixture", files: [{ path: operation_id, before_text: "a", after_text: "b", before_mode: "100644", after_mode: "100644" }] } },
        { authority: held, check: async () => {}, execute: async () => {} });
      await queue.respond({ review_id: request.review_id, decision: "approve", actor_id: "tester" });
    }
    await adapter.close(); queue = new AgentReviewQueue(); adapter = await make();
    await queue.refresh("board");
    assert.equal(queue.list("board").filter(item => item.operation?.kind === "git-index").length, 3, "the earlier operations are back after the restart");
    let reads = 0;
    fs.readFileSync = ((...args: Parameters<typeof original>) => { reads++; return original(...args); }) as typeof original; syncBuiltinESMExports();
    for (let index = 0; index < 5; index++) await queue.refresh("board");
    fs.readFileSync = original; syncBuiltinESMExports();
    assert.equal(reads, 0, "a refresh after the first finds nothing new to bring back and reads no stored record");
    assert.equal(queue.list("board").filter(item => item.operation?.kind === "git-index").length, 3);
  } finally { fs.readFileSync = original; syncBuiltinESMExports(); await adapter.close(); await rm(root, { recursive: true, force: true }); }
});

test("BL-360: a real persisted Git wait restored after adapter shutdown offers neither decision and never dispatches", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "git-decisions-restart-"));
  let queue = new AgentReviewQueue(), executions = 0;
  const make = () => createPrologueNodeAdapter({ app: { appId: "molis.git.decisions", appVersion: "1.0.0" }, storageRoot: path.join(root, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => { throw new Error("this operation needs no model"); } });
  let adapter = await make();
  try {
    const original = await adapter.gitReviews!.prepare({ project_id: "board", workspace_id: "workspace", operation_id: "waiting-1",
      document: { kind: "git-index", action: "stage", workspace_name: "fixture", files: [
        { path: "note", before_text: "before", after_text: "after", before_mode: "100644", after_mode: "100644" },
      ] } }, { authority: held, check: async () => {}, execute: async () => { executions++; } });
    assert.equal((await queue.decisions(original.review_id)).approve.available, true);
    await adapter.close(); queue.close(); queue = new AgentReviewQueue(); adapter = await make(); await queue.refresh("board");
    assert.equal(queue.receipt(original.review_id)?.status, "cancelled");
    const decisions = await queue.decisions(original.review_id);
    assert.equal(decisions.approve.available, false); assert.equal(decisions.reject.available, false);
    await assert.rejects(queue.respond({ review_id: original.review_id, decision: "reject", actor_id: "person" }));
    await assert.rejects(queue.respond({ review_id: original.review_id, decision: "approve", actor_id: "person" }));
    assert.equal(executions, 0); assert.equal(queue.receipt(original.review_id)?.decided_by, null);
  } finally { await adapter.close(); queue.close(); await rm(root, { recursive: true, force: true }); }
});
