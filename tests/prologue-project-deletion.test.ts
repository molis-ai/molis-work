import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, type ProjectSessionDeletionPlan } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import type { AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";

const sdkRequire = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createNodeHost } = await import(sdkRequire.resolve("@prologue/sdk/node"));
const { createRuntime, createPrologueError } = await import(sdkRequire.resolve("@prologue/sdk"));
const owner = { project_id: "project", plugin_id: "io.molis.work.coding", install_id: "installed", actor_id: "person" };
const control = { beforeEffect() {}, assert_current() {} };
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };

async function fixture(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "molis-project-session-delete-"));
  const app = { appId: "io.molis.project-delete-test", appVersion: "1.0.0" };
  const pending = new Set<string>(), pendingSessions = new Set<string>();
  const queue = new AgentReviewQueue();
  let providerHold: { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> } | undefined;
  let respond: ((body: { messages: Array<{ role: string; content: unknown }> }) => string) | undefined;
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const hold = providerHold; providerHold = undefined; if (hold) { hold.entered.resolve(); await hold.release.promise; }
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(respond?.(body) ?? 'data: {"choices":[{"index":0,"delta":{"content":"Done."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const open = () => createPrologueNodeAdapter({ app, storageRoot: home, reviewQueue: queue, projectDeletionPending: (id, session) => pending.has(id) || !!session && pendingSessions.has(session), resolveCredential: () => "fixture-only",
    modelConfiguration: async () => ({ protocol: "openai-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/chat/completions`, model: "fixture", credential_ref: "fixture" }) });
  let adapter: Awaited<ReturnType<typeof open>>;
  try { adapter = await open(); }
  catch (error) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(home, { recursive: true, force: true }); throw error; }
  const inspector = createNodeHost({ storageRoot: home });
  const kind = `molis-agent-index-${createHash("sha256").update(app.appId).digest("hex").slice(0, 24)}`;
  t.after(async () => { await adapter.close(); await inspector.storage.close?.(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(home, { recursive: true, force: true }); });
  return { app, home, kind, pending, pendingSessions, queue, inspector, holdProvider: () => { const hold = { entered: deferred(), release: deferred() }; providerHold = hold; t.after(() => hold.release.resolve()); return hold; }, respond: (next: typeof respond) => { respond = next; }, get adapter() { return adapter; },
    create: (project_id = owner.project_id) => adapter.createSession({ ...owner, project_id, workspace: "none", title: "Private title" }),
    scope: (associated_sessions: Array<{ session: AgentSessionRef; owner: typeof owner }> = []) => ({ project_id: owner.project_id, associated_sessions }),
    reopen: async (between?: () => Promise<void>) => { await adapter.close(); await between?.(); adapter = await open(); },
    index: async (id: string) => JSON.parse(new TextDecoder().decode(await inspector.storage.readSecure({ kind, id }))),
    sdk: async (id: string) => inspector.storage.get({ kind: `${app.appId}~sessions`, id }),
    settle: async (ref: { session_id: string; run_id: string }) => {
      for (const until = Date.now() + 10_000; ; await new Promise(resolve => setTimeout(resolve, 10))) {
        const view = await adapter.read(ref);
        if (["completed", "failed", "stopped", "cancelled"].includes(view.phase)) return view;
        assert.ok(Date.now() < until, "the accepted run did not settle");
      }
    },
    run: (session: AgentSessionRef) => ({ ...owner, session, workspace: "none" as const, role_id: "reader", task: "Never call model",
      role: { role_id: "reader", version: 1, workspace: "none" as const, execution: "read-only" as const, host_tools: [], prompts: [] } }),
  };
}

test("project preview enumerates archived/unbound own indexes, binds associated personal owner, and purges only its fixed set", async t => {
  const f = await fixture(t), active = await f.create(), archived = await f.create(), other = await f.create("other"), personal = await f.create("personal");
  const before = await f.adapter.sessionLifecycle!.read(archived, owner);
  await f.adapter.sessionLifecycle!.archive(archived, { operation_id: "archive", expected_version: before.version!, expected_state: "active" }, owner);
  await assert.rejects(f.adapter.projectDeletion.withHold(f.scope([{ session: personal, owner }]), held => held.preview("invalid-owner")));
  let plan!: ProjectSessionDeletionPlan;
  let escaped!: () => Promise<ProjectSessionDeletionPlan>;
  await f.adapter.withEffect(control, () => f.adapter.projectDeletion.withHold(f.scope([{ session: personal, owner: { ...owner, project_id: "personal" } }]), async held => {
    escaped = () => held.preview("escaped");
    plan = await held.preview("project-original");
    assert.deepEqual(new Set(plan.sessions.map(item => item.session.session_id)), new Set([active.session_id, archived.session_id, personal.session_id]));
    assert.equal(JSON.stringify(plan).includes("Private title"), false);
    await assert.rejects(f.create(), { code: "agent.session_busy" });
    await assert.rejects(f.adapter.start({ ...f.run(personal), project_id: "personal" }), { code: "agent.session_busy" });
    await held.purge(plan);
  }));
  await assert.rejects(escaped());
  for (const item of plan.sessions) assert.equal((await f.adapter.sessionLifecycle!.read(item.session, item.owner)).state, "purged");
  assert.equal((await f.adapter.sessionLifecycle!.read(other, { ...owner, project_id: "other" })).state, "active");
});

test("project hold refuses an already prepared creation without cancelling it; pending survives reopening", async t => {
  const f = await fixture(t), entered = deferred(), release = deferred();
  let checks = 0;
  const creating = f.adapter.createSession({ ...owner, workspace: "none", title: "Prepared" }, { beforeStart: async () => {
    if (++checks === 2) { entered.resolve(); await release.promise; }
  } });
  try {
    await entered.promise;
    await assert.rejects(f.adapter.projectDeletion.withHold(f.scope(), held => held.preview("during-create")), { code: "agent.session_busy" });
  } finally { release.resolve(); }
  const session = await creating;
  assert.equal((await f.adapter.readSession(session)).owner.project_id, owner.project_id);
  f.pending.add(owner.project_id); await f.reopen();
  await assert.rejects(f.create(), { code: "agent.session_busy" });
  await assert.rejects(f.adapter.start(f.run(session)), { code: "agent.session_busy" });
  assert.deepEqual((await f.index(session.session_id)).attempts, []);
  await f.adapter.withEffect(control, () => f.adapter.projectDeletion.withHold(f.scope(), async held => held.purge(await held.preview("pending-original"))));
});

test("original project plan resumes after SDK purge but failed index completion and restart, without refreshed decisions", async t => {
  const f = await fixture(t), session = await f.create();
  const plan = await f.adapter.projectDeletion.withHold(f.scope(), held => held.preview("fixed"));
  let failed = false;
  await assert.rejects(f.adapter.withEffect({ ...control, beforeEffect: async () => {
    const index = await f.index(session.session_id);
    if (!failed && index.lifecycle?.phase === "prepared" && (await f.sdk(session.session_id))?.metadata.state === "purged") {
      failed = true; throw new Error("index completion unavailable");
    }
  } }, () => f.adapter.projectDeletion.withHold(f.scope(), held => held.purge(plan))), /index completion unavailable/);
  assert.equal(failed, true);
  f.pending.add(owner.project_id); await f.reopen();
  const original = JSON.stringify(plan);
  const forged = structuredClone(plan); forged.sessions[0]!.owner.actor_id = "another";
  await assert.rejects(f.adapter.projectDeletion.withHold(f.scope(), held => held.purge(forged)));
  await f.adapter.withEffect(control, () => f.adapter.projectDeletion.withHold(f.scope(), held => held.purge(plan)));
  assert.equal(JSON.stringify(plan), original);
  assert.equal((await f.adapter.sessionLifecycle!.read(session, owner)).state, "purged");
  assert.deepEqual((await f.index(session.session_id)).attempts, []);
});

test("final effect authorization can refuse a fixed project plan with durable sessions unchanged", async t => {
  const f = await fixture(t), session = await f.create();
  const plan = await f.adapter.projectDeletion.withHold(f.scope(), held => held.preview("revoked"));
  const before = await f.index(session.session_id);
  let revoked = false;
  await assert.rejects(f.adapter.withEffect({ beforeEffect() { revoked = true; }, assert_current() { if (revoked) throw new Error("revoked"); } },
    () => f.adapter.projectDeletion.withHold(f.scope(), held => held.purge(plan))), /revoked/);
  assert.equal(revoked, true, "the final check runs after the authorization wait");
  assert.deepEqual(await f.index(session.session_id), before);
  assert.equal((await f.adapter.sessionLifecycle!.read(session, owner)).state, "active");
});

test("public boards recover an unindexed child after first subagent relationship write fails, then fixed parent-child purge survives restart", { timeout: 30_000 }, async t => {
  const f = await fixture(t), directory = { canonical_path: f.home, realpath_verified: true };
  const parent = await f.adapter.createSession({ ...owner, directory, title: "Actual parent" });
  let childId = "", faults = 0, calls = 0, childCalls = 0;
  const instruction = "CHILD_ORIGINAL: accepted instruction";
  f.respond(body => {
    calls++;
    if (body.messages.some(message => message.role === "user" && JSON.stringify(message.content).includes(instruction))) childCalls++;
    const character = JSON.stringify(body.messages).match(/molis-child-[a-z0-9-]+@\d+/)?.[0];
    const delta = calls === 1 ? { tool_calls: [{ index: 0, id: "dispatch", type: "function", function: { name: "dispatch-subagent",
      arguments: JSON.stringify({ instruction, tools: [], character, idempotencyKey: "child", maxTurns: 2 }) } }] } : { content: "Dispatch failed." };
    return `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: calls === 1 ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`;
  });
  type CommitInput = { kind: string; expectedVersion: number };
  const prototype: { commit(input: CommitInput): Promise<unknown> } = Object.getPrototypeOf(f.inspector.storage), commit = prototype.commit;
  const fault = t.mock.method(prototype, "commit", async function(this: typeof prototype, request: CommitInput) {
    if (String(request.kind).includes("subagents") && request.expectedVersion === 0 && !faults) {
      faults++; throw createPrologueError("STORAGE_UNAVAILABLE", "first relationship persistence rejected");
    }
    return commit.call(this, request);
  });
  const host = new AgentHost({ reviews: f.queue }); host.register(f.adapter);
  const handle = await host.start("prologue", { ...owner, session: parent, directory, role_id: "coordinator", task: "Dispatch one child" },
    { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [f.home] });
  const deadline = Date.now() + 10_000;
  for (;;) {
    const run = await f.adapter.read(handle.ref);
    if (["completed", "failed", "cancelled"].includes(run.phase)) { assert.equal(run.phase, "completed", run.stop_reason); break; }
    for (const review of f.queue.list(owner.project_id, "pending")) await f.queue.respond({ review_id: review.review_id, decision: "approve", actor_id: owner.actor_id });
    assert.ok(Date.now() < deadline); await new Promise(resolve => setTimeout(resolve, 10));
  }
  fault.mock.restore();
  assert.equal(faults, 1); assert.equal(childCalls, 0); assert.equal(calls, 2);
  assert.deepEqual(await f.adapter.subagents!.list(handle.ref), []);
  await f.reopen(async () => {
    const runtime = await createRuntime({ app: f.app, host: createNodeHost({ storageRoot: f.home }), preset: "local-agent" });
    try {
      // A separate Runtime discovers only persisted public board facts; no captured admission ref is used.
      const attempt = runtime.boards.refs().flatMap((ref: { id: string }) => runtime.boards.get(ref).nodes.flatMap((node: { attempts: Array<{ origin?: unknown; session: { id: string } }> }) => node.attempts)).find((item: { origin?: unknown }) => item.origin);
      assert.ok(attempt); childId = attempt.session.id;
      const child = await runtime.sessions.open(attempt.session); assert.ok(child);
      assert.ok(JSON.stringify(await child.conversation()).includes(instruction));
    } finally { await runtime.shutdown(); }
  });
  const plan = await f.adapter.projectDeletion.withHold(f.scope(), held => held.preview("graph-original"));
  assert.deepEqual(plan.sessions.map(item => [item.session.session_id, item.indexed]), [[parent.session_id, true], [childId, false]]);
  assert.equal(plan.sessions[1]!.parent_run?.session_id, parent.session_id);
  const reversed = structuredClone(plan); reversed.sessions.reverse();
  await assert.rejects(f.adapter.projectDeletion.withHold(f.scope(), held => held.purge(reversed)));
  let stopped = false;
  await assert.rejects(f.adapter.withEffect({ ...control, beforeEffect: async () => {
    if ((await f.index(parent.session_id)).lifecycle?.phase === "complete") { stopped = true; throw new Error("before child purge"); }
  } }, () => f.adapter.projectDeletion.withHold(f.scope(), held => held.purge(plan))), /before child purge/);
  assert.equal(stopped, true); f.pending.add(owner.project_id); await f.reopen();
  await f.adapter.withEffect(control, () => f.adapter.projectDeletion.withHold(f.scope(), held => held.purge(plan)));
  assert.equal((await f.adapter.sessionLifecycle!.read(parent, owner)).state, "purged");
  const record = await f.sdk(childId); assert.equal(record?.metadata.state, "purged");
});


test("an accepted original purge decision stays fixed when included in a later project plan", async t => {
  const f = await fixture(t), session = await f.create(), lifecycle = f.adapter.sessionLifecycle!;
  const preview = await lifecycle.previewPurge(session, owner);
  const decision = { operation_id: "earlier-manual-purge", expected_version: preview.version, expected_state: preview.state };
  await lifecycle.purge(session, decision, preview, owner);
  await f.reopen();
  const plan = await f.adapter.projectDeletion.withHold(f.scope(), held => held.preview("later-project"));
  assert.equal(plan.sessions.length, 1); assert.equal(plan.sessions[0]!.state, "purged"); assert.deepEqual(plan.sessions[0]!.decision, decision);
  await f.adapter.withEffect(control, () => f.adapter.projectDeletion.withHold(f.scope(), held => held.purge(plan)));
  assert.equal((await f.adapter.sessionLifecycle!.read(session, owner)).operation?.decision.operation_id, "earlier-manual-purge");
});

test("pending associated personal Session cannot restart while unrelated personal sessions remain usable", async t => {
  const f = await fixture(t), related = await f.create("personal"), unrelated = await f.create("personal");
  f.pendingSessions.add(related.session_id); await f.reopen();
  await assert.rejects(f.adapter.start({ ...f.run(related), project_id: "personal" }), { code: "agent.session_busy" });
  assert.deepEqual((await f.index(related.session_id)).attempts, []);
  const run = await f.adapter.start({ ...f.run(unrelated), project_id: "personal" });
  const deadline = Date.now() + 10_000;
  while ((await f.adapter.read(run.ref)).phase !== "completed") {
    assert.ok(Date.now() < deadline); await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal((await f.adapter.read(run.ref)).phase, "completed");
});

test("project cleanup rejects an actual prepared Run without cancelling its original start", async t => {
  const f = await fixture(t), session = await f.create(), entered = deferred(), release = deferred();
  let waiting = false;
  const starting = f.adapter.withEffect({ ...control, beforeEffect: async () => {
    const saved = await f.index(session.session_id);
    if (!waiting && saved.attempts.some((attempt: { run_id?: string }) => !attempt.run_id)) {
      waiting = true; entered.resolve(); await release.promise;
    }
  } }, () => f.adapter.start(f.run(session)));
  try {
    await Promise.race([entered.promise, starting.then(() => { throw new Error("Run did not reach prepared boundary"); })]);
    await assert.rejects(f.adapter.projectDeletion.withHold(f.scope(), held => held.preview("during-prepared")), { code: "agent.session_busy" });
  } finally { release.resolve(); }
  const run = await starting, deadline = Date.now() + 10_000;
  while ((await f.adapter.read(run.ref)).phase !== "completed") {
    assert.ok(Date.now() < deadline); await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal((await f.adapter.read(run.ref)).phase, "completed");
  assert.equal((await f.adapter.sessionLifecycle!.read(session, owner)).state, "active");
});


for (const damage of ["tombstone", "missing-owner"] as const) test(`project collection refuses ${damage} index instead of reporting an empty cleanup set`, async t => {
  const f = await fixture(t), session = await f.create();
  const record = await f.inspector.storage.get({ kind: f.kind, id: session.session_id }); assert.ok(record);
  if (damage === "tombstone") await f.inspector.storage.remove({ kind: f.kind, id: session.session_id, expectedVersion: record.version });
  else {
    const original = await f.index(session.session_id); delete original.owner.actor_id;
    await f.inspector.storage.commit({ kind: f.kind, id: session.session_id, expectedVersion: record.version,
      metadata: record.metadata, secureBody: new TextEncoder().encode(JSON.stringify(original)) });
  }
  const sdkBefore = await f.sdk(session.session_id);
  await assert.rejects(f.adapter.projectDeletion.withHold(f.scope(), held => held.preview("cannot-prove-owner")));
  assert.deepEqual(await f.sdk(session.session_id), sdkBefore);
});


test("pending cleanup rejects resume, steer and queued additions while cancel and withdrawal remain available", async t => {
  const f = await fixture(t), session = await f.create(), hold = f.holdProvider();
  const run = await f.adapter.start(f.run(session)); await hold.entered.promise;
  try {
    const original = await f.adapter.inputs.send(run.ref, { text: "Earlier queued input", source: "host", mode: "after-run", key: "before-deletion" });
    await f.adapter.control(run.ref, { kind: "pause" });
    f.pending.add(owner.project_id);
    await f.adapter.inputs.withdraw(run.ref, original.input_id);
    const results = await Promise.allSettled([
      f.adapter.control(run.ref, { kind: "resume" }),
      f.adapter.inputs.send(run.ref, { text: "Late steer", source: "host", key: "late-steer" }),
      f.adapter.inputs.send(run.ref, { text: "Late queued input", source: "host", mode: "after-run", key: "late-queue" }),
    ]);
    assert.deepEqual(results.map(result => result.status), ["rejected", "rejected", "rejected"]);
    for (const result of results) if (result.status === "rejected") assert.equal(result.reason.code, "agent.session_busy");
  } finally { await f.adapter.control(run.ref, { kind: "cancel" }); hold.release.resolve(); }
  await f.settle(run.ref);
  await f.reopen();
  assert.deepEqual((await f.adapter.readSession(session)).queued_inputs ?? [], []);
});

for (const mode of ["next-boundary", "after-run"] as const) test(`pending set after ${mode} admission still rejects the actual Host input write`, async t => {
  const f = await fixture(t), session = await f.create(), hold = f.holdProvider();
  const run = await f.adapter.start(f.run(session)); await hold.entered.promise;
  let checked = false, rejectedBodyCommits = 0;
  type Commit = { secureBody?: Uint8Array };
  const prototype: { commit(input: Commit): Promise<unknown> } = Object.getPrototypeOf(f.inspector.storage), commit = prototype.commit;
  t.mock.method(prototype, "commit", async function(this: typeof prototype, input: Commit) {
    const result = await commit.call(this, input);
    if (input.secureBody && new TextDecoder().decode(input.secureBody).includes("Must not persist")) rejectedBodyCommits++;
    return result;
  });
  try {
    await assert.rejects(f.adapter.withEffect({ ...control, beforeEffect: async () => {
      await Promise.resolve(); checked = true; f.pending.add(owner.project_id);
    } }, () => f.adapter.inputs.send(run.ref, { text: "Must not persist", source: "host", key: "late-final-fence", mode })), { code: mode === "next-boundary" ? "SESSION_LEDGER_COMMIT_FAILED" : "agent.session_busy" });
    assert.equal(checked, true);
  } finally { await f.adapter.control(run.ref, { kind: "cancel" }); hold.release.resolve(); }
  if (mode === "next-boundary") {
    await assert.rejects(f.adapter.projectDeletion.withHold(f.scope(), held => held.preview("unfinished-write")));
    await f.reopen();
    await assert.rejects(f.adapter.projectDeletion.withHold(f.scope(), held => held.preview("restarted-unfinished-write")));
    assert.equal(rejectedBodyCommits, 0, "no successful real Host commit contained the rejected input, including terminal cleanup");
    assert.equal((await f.sdk(session.session_id))?.metadata.state, "active");
    return;
  }
  await f.settle(run.ref);
  await f.reopen();
  const view = await f.adapter.read(run.ref);
  assert.equal(JSON.stringify(view.turns).includes("Must not persist"), false);
  assert.deepEqual((await f.adapter.readSession(session)).queued_inputs ?? [], []);
});

test("a purge started inside a hold cannot write after that hold has returned", async t => {
  const f = await fixture(t), session = await f.create(), entered = deferred(), release = deferred();
  const plan = await f.adapter.projectDeletion.withHold(f.scope(), held => held.preview("scope-original"));
  let blocked = false, purging!: Promise<unknown>, before!: unknown;
  await f.adapter.withEffect({ ...control, beforeEffect: async () => {
    if (!blocked && (await f.index(session.session_id)).lifecycle?.phase === "prepared") {
      blocked = true; entered.resolve(); await release.promise;
    }
  } }, async () => {
    await f.adapter.projectDeletion.withHold(f.scope(), async held => {
      purging = held.purge(plan).then(value => ({ value }), error => ({ error }));
      await entered.promise;
      before = await f.sdk(session.session_id);
    });
    release.resolve(); await purging;
  });
  assert.equal(blocked, true, "the actual SDK write waited inside the original hold");
  assert.deepEqual(await f.sdk(session.session_id), before, "expired hold cannot commit the SDK purge");
  await f.reopen();
  assert.equal((await f.adapter.sessionLifecycle!.read(session, owner)).state, "active");
  await f.adapter.withEffect(control, () => f.adapter.projectDeletion.withHold(f.scope(), held => held.purge(plan)));
  assert.equal((await f.adapter.sessionLifecycle!.read(session, owner)).state, "purged");
});

test("pending deletion refuses a new child while the already accepted parent can finish", { timeout: 30_000 }, async t => {
  const f = await fixture(t), directory = { canonical_path: f.home, realpath_verified: true };
  const session = await f.adapter.createSession({ ...owner, directory, title: "Parent already accepted" });
  let calls = 0, busy!: Promise<void>;
  f.respond(body => {
    calls++;
    assert.equal(body.messages.some(message => message.role === "user" && JSON.stringify(message.content).includes("NEW_CHILD_MUST_NOT_START")), false);
    const character = JSON.stringify(body.messages).match(/molis-child-[a-z0-9-]+@\d+/)?.[0];
    if (calls === 1) {
      f.pending.add(owner.project_id);
      busy = assert.rejects(f.adapter.projectDeletion.withHold(f.scope(), held => held.preview("still-live")), { code: "agent.session_busy" });
    }
    const delta = calls === 1 ? { tool_calls: [{ index: 0, id: "dispatch", type: "function", function: { name: "dispatch-subagent",
      arguments: JSON.stringify({ instruction: "NEW_CHILD_MUST_NOT_START", tools: [], character, idempotencyKey: "blocked-child", maxTurns: 2 }) } }] } : { content: "The child was refused." };
    return `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: calls === 1 ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`;
  });
  const host = new AgentHost({ reviews: f.queue }); host.register(f.adapter);
  const run = await host.start("prologue", { ...owner, session, directory, role_id: "coordinator", task: "Dispatch one child" },
    { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [f.home] });
  for (const until = Date.now() + 10_000; ; await new Promise(resolve => setTimeout(resolve, 10))) {
    const view = await f.adapter.read(run.ref);
    if (["completed", "failed", "cancelled"].includes(view.phase)) { assert.equal(view.phase, "completed", view.stop_reason); break; }
    for (const review of f.queue.list(owner.project_id, "pending")) await f.queue.respond({ review_id: review.review_id, decision: "approve", actor_id: owner.actor_id });
    assert.ok(Date.now() < until);
  }
  await busy;
  assert.equal(calls, 2, "the parent receives a refusal and finishes through its original model loop");
  assert.deepEqual(await f.adapter.subagents!.list(run.ref), []);
  await f.reopen();
  const plan = await f.adapter.projectDeletion.withHold(f.scope(), held => held.preview("after-parent"));
  assert.equal(plan.sessions[0]!.session.session_id, session.session_id);
  assert.equal(plan.sessions.length, 2, "SDK admission occurs after fork; the public board retains the unstarted child");
  assert.equal(plan.sessions[1]!.indexed, false);
  assert.deepEqual(plan.sessions[1]!.parent_run, run.ref);
  await f.adapter.withEffect(control, () => f.adapter.projectDeletion.withHold(f.scope(), held => held.purge(plan)));
  for (const item of plan.sessions) assert.equal((await f.sdk(item.session.session_id))?.metadata.state, "purged");
});
