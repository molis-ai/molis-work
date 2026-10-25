import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fs, { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, openPrologueMemoryAdoption, openPrologueMemoryAdoptionInspection, type ProjectSessionDeletionPlan, type PrologueMemoryAdoptionInput } from "@molis-ai/molis-work-service-agent-host";
import { memoryRuntimePolicy } from "@molis-ai/molis-work-app-local-host";
import { assertStorageOwner } from "@molis-ai/molis-work-storage";
import { storageOwnerResources } from "./fixtures/home-storage-owner.js";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import type { AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";

const sdkRequire = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createNodeHost } = await import(sdkRequire.resolve("@prologue/sdk/node"));
const { createRuntime, createPrologueError } = await import(sdkRequire.resolve("@prologue/sdk"));
const owner = { project_id: "project", plugin_id: "io.molis.work.coding", install_id: "installed", actor_id: "person" };
const control = { beforeEffect() {}, assert_current() {} };
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };

function persistentRecords(root: string): Record<string, Buffer> {
  const result: Record<string, Buffer> = {};
  const visit = (directory: string, relative: string) => {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const key = join(relative, item.name), file = join(directory, item.name);
      if (item.isDirectory()) visit(file, key); else result[key] = readFileSync(file);
    }
  };
  visit(join(root, "records"), ""); return result;
}

/** Obtain the real online owner's complete plan for a nonempty raw child retained in the public board. */
async function coldProjectFixture(t: TestContext) {
  const f = await fixture(t, "io.molis.work"), directory = { canonical_path: f.home, realpath_verified: true };
  const parent = await f.adapter.createSession({ ...owner, directory, title: "Cold original parent" });
  const other = await f.create("other");
  const instruction = "RAW ORIGINAL CONTENT survives a failed relationship write";
  let calls = 0, faults = 0;
  f.respond(body => {
    const character = JSON.stringify(body.messages).match(/molis-child-[a-z0-9-]+@\d+/)?.[0];
    const delta = calls++ === 0 ? { tool_calls: [{ index: 0, id: "dispatch", type: "function", function: { name: "dispatch-subagent",
      arguments: JSON.stringify({ instruction, tools: [], character, idempotencyKey: "raw-child", maxTurns: 2 }) } }] } : { content: "The parent finished." };
    return `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: calls === 1 ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`;
  });
  type Commit = { kind: string; expectedVersion: number };
  const prototype: { commit(input: Commit): Promise<unknown> } = Object.getPrototypeOf(f.inspector.storage), commit = prototype.commit;
  const fault = t.mock.method(prototype, "commit", async function(this: typeof prototype, request: Commit) {
    if (request.kind.includes("subagents") && request.expectedVersion === 0 && !faults) { faults++; throw createPrologueError("STORAGE_UNAVAILABLE", "original relationship fault"); }
    return commit.call(this, request);
  });
  const host = new AgentHost({ reviews: f.queue }); host.register(f.adapter);
  const handle = await host.start("prologue", { ...owner, session: parent, directory, role_id: "coordinator", task: "Dispatch one child" },
    { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [f.home] });
  for (const until = Date.now() + 10_000; ; await new Promise(resolve => setTimeout(resolve, 10))) {
    const view = await f.adapter.read(handle.ref);
    if (["completed", "failed", "cancelled"].includes(view.phase)) { assert.equal(view.phase, "completed", view.stop_reason); break; }
    for (const review of f.queue.list(owner.project_id, "pending")) await f.queue.respond({ review_id: review.review_id, decision: "approve", actor_id: owner.actor_id });
    assert.ok(Date.now() < until);
  }
  fault.mock.restore(); assert.equal(faults, 1);
  await f.reopen(async () => {
    const runtime = await createRuntime({ app: f.app, host: createNodeHost({ storageRoot: f.home }), preset: "local-agent" });
    try {
      const attempts = runtime.boards.refs().flatMap((ref: { id: string }) => runtime.boards.get(ref).nodes.flatMap((node: { attempts: Array<{ origin?: unknown; session: { id: string } }> }) => node.attempts));
      const attempt = attempts.find((item: { origin?: unknown }) => item.origin); assert.ok(attempt);
      const child = await runtime.sessions.open(attempt.session); assert.ok(child);
      assert.ok(JSON.stringify(await child.conversation()).includes(instruction));
    } finally { await runtime.shutdown(); }
  });
  const plan = await f.adapter.projectDeletion.withHold(f.scope(), held => held.preview("source-project-original"));
  assert.equal(plan.sessions.length, 2); const raw = plan.sessions.find(item => !item.indexed); assert.ok(raw);
  assert.deepEqual(raw.parent_run, handle.ref);
  await f.adapter.close();
  const input = { storageRoot: f.home, appVersion: f.app.appVersion, scopes: [{ scope: "user" as const, owner: owner.actor_id }], policy: memoryRuntimePolicy(() => undefined).policy };
  return { ...f, get adapter() { return f.adapter; }, plan, raw, parent, other, input,
    open: (extra: Partial<PrologueMemoryAdoptionInput> = {}) => openPrologueMemoryAdoption({ ...input, projectSessionPurges: [plan], ...extra }),
    writeIndex: async (id: string, value: unknown) => {
      const record = await f.inspector.storage.get({ kind: f.kind, id }), bytes = new TextEncoder().encode(JSON.stringify(value));
      try { await f.inspector.storage.commit({ kind: f.kind, id, expectedVersion: record?.version ?? 0, metadata: { schema: 1 }, secureBody: bytes }); }
      finally { bytes.fill(0); }
    },
  };
}

test("cold original project purges a real nonempty raw child, reopens the same decision and preserves successors", async t => {
  const f = await coldProjectFixture(t), otherIndex = await f.index(f.other.session_id), otherSdk = await f.sdk(f.other.session_id);
  const writer = await f.open();
  let version: number;
  try {
    const receipt = await writer.purgeSessionTarget({ session: f.raw.session }); version = receipt.version;
    assert.equal(receipt.version, f.raw.preview.version + 2);
    assert.equal(await f.inspector.storage.get({ kind: f.kind, id: f.raw.session.session_id }), undefined, "raw cleanup must not manufacture an Index");
    await assert.rejects(writer.verifyProjectSessionPurge({ plan: f.plan }), "the parent is still present");
    await writer.purgeSessionTarget({ session: f.parent });
    await writer.verifyProjectSessionPurge({ plan: f.plan });
  } finally { await writer.close(); }
  const beforeRetry = persistentRecords(f.home), retry = await f.open();
  try {
    assert.equal((await retry.purgeSessionTarget({ session: f.raw.session })).version, version);
    await retry.purgeSessionTarget({ session: f.parent }); await retry.verifyProjectSessionPurge({ plan: f.plan });
  } finally { await retry.close(); }
  assert.deepEqual(persistentRecords(f.home), beforeRetry);
  assert.deepEqual(await f.index(f.other.session_id), otherIndex); assert.deepEqual(await f.sdk(f.other.session_id), otherSdk);
  const successor = { ...otherIndex, ref: { kind: "session", id: f.raw.session.session_id, revision: 1 }, title: "Later same-ID Index must remain" };
  await f.writeIndex(f.raw.session.session_id, successor);
  const later = persistentRecords(f.home), inspection = await openPrologueMemoryAdoptionInspection(f.input);
  try { await assert.rejects(inspection.verifyProjectSessionPurge({ plan: f.plan })); }
  finally { await inspection.close(); }
  assert.deepEqual(persistentRecords(f.home), later); assert.deepEqual(await f.index(f.raw.session.session_id), successor);
});

test("cold first target preparation uses real target versions and leaves the later source unchanged", async t => {
  const f = await coldProjectFixture(t), targetRoot = fs.realpathSync(mkdtempSync(join(tmpdir(), "molis-raw-target-")));
  t.after(() => rmSync(targetRoot, { recursive: true, force: true })); cpSync(f.home, targetRoot, { recursive: true });
  const original = f.plan.sessions.find(item => item.indexed)!;
  await f.reopen();
  await f.adapter.sessionLifecycle!.archive(f.parent, { operation_id: "source-after-backup", expected_version: original.preview.version, expected_state: "active" }, owner);
  const sourcePlan = await f.adapter.projectDeletion.withHold(f.scope(), held => held.preview("source-later-plan"));
  await f.adapter.close(); assert.notEqual(sourcePlan.sessions[0]!.preview.version, original.preview.version);
  const sourceRecords = persistentRecords(f.home), targetBefore = persistentRecords(targetRoot);
  const input = { ...f.input, storageRoot: targetRoot }, inspection = await openPrologueMemoryAdoptionInspection(input);
  let plan: ProjectSessionDeletionPlan;
  try { plan = await inspection.prepareProjectSessionPurge({ sourcePlan, operationId: "fixed-target-deletion" }); }
  finally { await inspection.close(); }
  assert.equal(plan.operation_id, "fixed-target-deletion"); assert.equal(plan.sessions[0]!.preview.version, original.preview.version);
  assert.equal(plan.sessions[0]!.preview.state, "active"); assert.deepEqual(plan.sessions[1]!.parent_run, f.raw.parent_run);
  assert.deepEqual(persistentRecords(targetRoot), targetBefore, "preparation is read only");
  const writer = await openPrologueMemoryAdoption({ ...input, projectSessionPurges: [plan] });
  try { for (const item of plan.sessions) await writer.purgeSessionTarget({ session: item.session }); await writer.verifyProjectSessionPurge({ plan }); }
  finally { await writer.close(); }
  assert.deepEqual(persistentRecords(f.home), sourceRecords);
});

test("cold preparation preserves an indexed original purge decision while preparing the remaining raw child", async t => {
  const f = await coldProjectFixture(t), writer = await f.open();
  try { await writer.purgeSessionTarget({ session: f.parent }); } finally { await writer.close(); }
  const inspection = await openPrologueMemoryAdoptionInspection(f.input);
  let prepared: ProjectSessionDeletionPlan;
  try { prepared = await inspection.prepareProjectSessionPurge({ sourcePlan: f.plan, operationId: "target-project-request" }); }
  finally { await inspection.close(); }
  assert.deepEqual(prepared.sessions[0]!.decision, f.plan.sessions[0]!.decision);
  assert.deepEqual(prepared.sessions[0]!.preview, f.plan.sessions[0]!.preview);
  assert.equal(prepared.sessions[0]!.state, "purged"); assert.equal(prepared.sessions[1]!.decision.operation_id, "target-project-request:1");
  const retry = await f.open({ projectSessionPurges: [prepared] });
  try { for (const item of prepared.sessions) await retry.purgeSessionTarget({ session: item.session }); await retry.verifyProjectSessionPurge({ plan: prepared }); }
  finally { await retry.close(); }
});

test("cold project validates the complete original relationship and refuses conflicting shared targets before writing", async t => {
  const f = await coldProjectFixture(t), before = persistentRecords(f.home);
  for (const change of [
    (plan: ProjectSessionDeletionPlan) => { plan.sessions.reverse(); },
    (plan: ProjectSessionDeletionPlan) => { plan.sessions[1]!.parent_run!.session_id = "wrong-parent"; },
    (plan: ProjectSessionDeletionPlan) => { plan.sessions[1]!.owner.actor_id = "wrong-owner"; },
    (plan: ProjectSessionDeletionPlan) => { delete plan.sessions[1]!.parent_run; },
  ]) { const invalid = structuredClone(f.plan); change(invalid); await assert.rejects(f.open({ projectSessionPurges: [invalid] })); }
  await assert.rejects(f.open({ sessionPurges: [f.plan.sessions[0]!] }));
  const conflict = structuredClone(f.plan); conflict.sessions[1]!.decision.operation_id = "replacement-decision";
  await assert.rejects(f.open({ projectSessionPurges: [f.plan, conflict] }));
  assert.deepEqual(persistentRecords(f.home), before);
  const snapshot = structuredClone(f.plan), writer = await f.open({ projectSessionPurges: [snapshot, structuredClone(snapshot)] });
  snapshot.sessions[1]!.decision.operation_id = "mutated-after-open";
  try { assert.equal((await writer.purgeSessionTarget({ session: f.raw.session })).operation_id, f.raw.decision.operation_id); }
  finally { await writer.close(); }
});

for (const cause of ["raw-index", "raw-index-tombstone", "parent-owner", "parent-index-absent", "raw-sdk-absent", "raw-sdk-changed"] as const)
  test(`cold raw fixed plan rejects ${cause} and preserves all persistent records`, async t => {
    const f = await coldProjectFixture(t), id = f.raw.session.session_id;
    if (cause.startsWith("raw-index")) {
      await f.writeIndex(id, { ...await f.index(f.parent.session_id), ref: { kind: "session", id, revision: 1 }, title: "Another Index" });
      if (cause === "raw-index-tombstone") await f.inspector.storage.remove({ kind: f.kind, id, expectedVersion: 1 });
    }
    if (cause === "parent-owner") await f.writeIndex(f.parent.session_id, { ...await f.index(f.parent.session_id), owner: { ...owner, actor_id: "another-person" } });
    if (cause === "parent-index-absent") {
      const record = await f.inspector.storage.get({ kind: f.kind, id: f.parent.session_id }); assert.ok(record);
      await f.inspector.storage.remove({ kind: f.kind, id: f.parent.session_id, expectedVersion: record.version });
    }
    if (cause === "raw-sdk-absent") {
      const files = persistentRecords(f.home), file = Object.keys(files).find(file => file.endsWith(`/${id}.json`) && !file.includes(f.kind)); assert.ok(file);
      rmSync(join(f.home, "records", file));
    }
    if (cause === "raw-sdk-changed") {
      await f.reopen(async () => {
        const runtime = await createRuntime({ app: f.app, host: createNodeHost({ storageRoot: f.home }), preset: "local-agent" });
        try { const child = await runtime.sessions.open({ kind: "session", id, revision: 1 }); assert.ok(child); await child.archive(); }
        finally { await runtime.shutdown(); }
      });
      await f.adapter.close();
    }
    const before = persistentRecords(f.home), writer = await f.open();
    try { await assert.rejects(writer.purgeSessionTarget({ session: f.raw.session })); } finally { await writer.close(); }
    const inspection = await openPrologueMemoryAdoptionInspection(f.input);
    try {
      if (cause === "raw-sdk-changed") {
        const fresh = await inspection.prepareProjectSessionPurge({ sourcePlan: f.plan, operationId: "target-new" });
        assert.equal(fresh.sessions[1]!.preview.state, "archived"); assert.equal(fresh.sessions[1]!.preview.version, f.raw.preview.version + 1);
      } else await assert.rejects(inspection.prepareProjectSessionPurge({ sourcePlan: f.plan, operationId: "target-new" }));
    }
    finally { await inspection.close(); }
    assert.deepEqual(persistentRecords(f.home), before);
  });

for (const stage of ["group", "later-observation"] as const) test(`cold raw rejects a parent Index change during ${stage} SDK metadata read`, async t => {
  const f = await coldProjectFixture(t), parent = await f.index(f.parent.session_id), writer = await f.open();
  type Get = { kind: string; id: string };
  const prototype: { get(request: Get): Promise<unknown> } = Object.getPrototypeOf(Object.getPrototypeOf(f.inspector.storage)), get = prototype.get;
  const readers = new Set<object>(); let changed = false, afterForeignWrite: ReturnType<typeof persistentRecords> | undefined;
  const boundary = t.mock.method(prototype, "get", async function(this: typeof prototype, request: Get) {
    const result = await get.call(this, request);
    if (request.kind === `${f.app.appId}~sessions` && request.id === f.raw.session.session_id) {
      readers.add(this);
      if (!changed && (stage === "group" || readers.size === 2)) {
        changed = true;
        await f.writeIndex(f.parent.session_id, { ...parent, owner: { ...parent.owner, actor_id: "foreign-current-owner" } });
        afterForeignWrite = persistentRecords(f.home);
      }
    }
    return result;
  });
  try {
    await assert.rejects(writer.purgeSessionTarget({ session: f.raw.session }), { code: "agent.session_busy" });
    assert.equal(changed, true); if (stage === "later-observation") assert.equal(readers.size, 2);
    assert.equal((await f.sdk(f.raw.session.session_id)).metadata.state, "active");
    assert.deepEqual(persistentRecords(f.home), afterForeignWrite, "no deletion after the unrelated durable Index mutation");
    boundary.mock.restore(); await f.writeIndex(f.parent.session_id, parent);
    assert.equal((await writer.purgeSessionTarget({ session: f.raw.session })).operation_id, f.raw.decision.operation_id);
  } finally { boundary.mock.restore(); await writer.close(); }
});

test("cold original project hold blocks a related purge and another online writer during raw inspection", async t => {
  const f = await coldProjectFixture(t), writer = await f.open(), entered = deferred(), release = deferred();
  const parentBefore = await f.index(f.parent.session_id), parentSdk = await f.sdk(f.parent.session_id);
  type Get = { kind: string; id: string };
  const prototype: { get(request: Get): Promise<unknown> } = Object.getPrototypeOf(Object.getPrototypeOf(f.inspector.storage)), get = prototype.get;
  let paused = false;
  const boundary = t.mock.method(prototype, "get", async function(this: typeof prototype, request: Get) {
    const result = await get.call(this, request);
    if (!paused && request.kind === `${f.app.appId}~sessions` && request.id === f.raw.session.session_id) {
      paused = true; entered.resolve(); await release.promise;
    }
    return result;
  });
  const pending = writer.purgeSessionTarget({ session: f.raw.session });
  try {
    await entered.promise;
    await assert.rejects(writer.purgeSessionTarget({ session: f.parent }), { code: "agent.session_busy" });
    const online = createPrologueNodeAdapter({ app: f.app, storageRoot: f.home, reviewQueue: f.queue,
      modelConfiguration: async () => { throw new Error("the Home owner must reject before online configuration"); } });
    try { await assert.rejects(online, { code: "agent.storage_busy" }); } finally { await online.close(); }
    assert.deepEqual(await f.index(f.parent.session_id), parentBefore); assert.deepEqual(await f.sdk(f.parent.session_id), parentSdk);
    release.resolve(); assert.equal((await pending).state, "purged");
    await writer.purgeSessionTarget({ session: f.parent }); await writer.verifyProjectSessionPurge({ plan: f.plan });
  } finally { release.resolve(); await pending.catch(() => undefined); boundary.mock.restore(); await writer.close(); }
});

for (const cause of ["revoke", "cancel"] as const) test(`cold raw ${cause} after a real SDK read preserves the original decision`, async t => {
  const f = await coldProjectFixture(t), before = persistentRecords(f.home);
  let revoked = false, observed = false; const stop = new AbortController();
  const writer = await f.open({ signal: stop.signal, assertCurrent: () => { if (revoked) throw new Error("permission withdrawn after read"); } });
  const file = Object.keys(before).find(file => file.endsWith(`/${f.raw.session.session_id}.json`) && !file.includes(f.kind)); assert.ok(file);
  const identity = fs.statSync(join(f.home, "records", file), { bigint: true }), read = fs.readFileSync;
  const fault = t.mock.method(fs, "readFileSync", (...args: Parameters<typeof read>) => {
    const value = Reflect.apply(read, fs, args), held = typeof args[0] === "number" ? fs.fstatSync(args[0], { bigint: true }) : undefined;
    if (!observed && held?.dev === identity.dev && held?.ino === identity.ino) {
      observed = true; queueMicrotask(() => { if (cause === "cancel") stop.abort(); else revoked = true; });
    }
    return value;
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(writer.purgeSessionTarget({ session: f.raw.session }));
    assert.equal(observed, true); assert.deepEqual(persistentRecords(f.home), before);
    fault.mock.restore(); syncBuiltinESMExports(); revoked = false;
    if (cause === "revoke") assert.equal((await writer.purgeSessionTarget({ session: f.raw.session })).operation_id, f.raw.decision.operation_id);
    else await assert.rejects(writer.purgeSessionTarget({ session: f.raw.session }));
  } finally { fault.mock.restore(); syncBuiltinESMExports(); revoked = false; await writer.close(); }
});

test("cold original plans accept real associated roots and merge equal decisions across projects", async t => {
  const f = await fixture(t, "io.molis.work"), session = await f.create();
  const first = await f.adapter.projectDeletion.withHold(f.scope(), held => held.preview("first-catalog-request"));
  await f.adapter.withEffect(control, () => f.adapter.projectDeletion.withHold(f.scope(), held => held.purge(first)));
  const second = await f.adapter.projectDeletion.withHold({ project_id: "associated-project", associated_sessions: [{ session, owner }] }, held => held.preview("associated-catalog-request"));
  assert.notEqual(second.project_id, second.sessions[0]!.owner.project_id);
  assert.deepEqual(second.sessions[0]!.decision, first.sessions[0]!.decision); await f.adapter.close();
  const input = { storageRoot: f.home, appVersion: f.app.appVersion, scopes: [{ scope: "user" as const, owner: owner.actor_id }], policy: memoryRuntimePolicy(() => undefined).policy };
  const before = persistentRecords(f.home), writer = await openPrologueMemoryAdoption({ ...input, projectSessionPurges: [first, second] });
  try { await writer.purgeSessionTarget({ session }); await writer.verifyProjectSessionPurge({ plan: first }); await writer.verifyProjectSessionPurge({ plan: second }); }
  finally { await writer.close(); }
  assert.deepEqual(persistentRecords(f.home), before);
});

test("cold empty original Session plan proves only its empty selection and preserves a later same-project Session", async t => {
  const f = await fixture(t, "io.molis.work");
  const sourcePlan = await f.adapter.projectDeletion.withHold(f.scope(), held => held.preview("old-empty-project"));
  assert.deepEqual(sourcePlan.sessions, []); const later = await f.create(); await f.adapter.close();
  const input = { storageRoot: f.home, appVersion: f.app.appVersion, scopes: [{ scope: "user" as const, owner: owner.actor_id }], policy: memoryRuntimePolicy(() => undefined).policy };
  const before = persistentRecords(f.home), inspection = await openPrologueMemoryAdoptionInspection(input);
  try {
    const target = await inspection.prepareProjectSessionPurge({ sourcePlan, operationId: "empty-target" }); assert.deepEqual(target.sessions, []);
    await inspection.verifyProjectSessionPurge({ plan: sourcePlan });
  } finally { await inspection.close(); }
  assert.deepEqual(persistentRecords(f.home), before); assert.equal((await f.sdk(later.session_id)).metadata.state, "active");
});

test("cold raw uses the original same-Session hold for overlapping calls", async t => {
  const f = await coldProjectFixture(t), writer = await f.open(); let settled = false;
  try {
    const first = writer.purgeSessionTarget({ session: f.raw.session }).then(value => { settled = true; return value; });
    assert.equal(settled, false);
    await assert.rejects(writer.purgeSessionTarget({ session: f.raw.session }), { code: "agent.session_busy" });
    assert.equal((await first).state, "purged");
    assert.equal((await writer.purgeSessionTarget({ session: f.raw.session })).version, f.raw.preview.version + 2);
  } finally { await writer.close(); }
});

test("cold Session reader close failure stops business until the same reader is cleaned before parent release", async t => {
  const f = await coldProjectFixture(t), resources = storageOwnerResources(t), parent = resources.acquire(f.home);
  const writer = await f.open({ storageOwner: parent }), before = persistentRecords(f.home);
  const file = Object.keys(before).find(file => file.endsWith(`/${f.parent.session_id}.json`) && !file.includes(f.kind)); assert.ok(file);
  const identity = fs.statSync(join(f.home, "records", file), { bigint: true }), read = fs.readFileSync, fill = Buffer.prototype.fill;
  let armed = false, failing = true, attempts = 0, published = 0, originalKey: Buffer | undefined;
  const reading = t.mock.method(fs, "readFileSync", (...args: Parameters<typeof read>) => {
    const value = Reflect.apply(read, fs, args), held = typeof args[0] === "number" ? fs.fstatSync(args[0], { bigint: true }) : undefined;
    if (held?.dev === identity.dev && held?.ino === identity.ino) armed = true;
    return value;
  });
  const zeroing = t.mock.method(Buffer.prototype, "fill", function(this: Buffer, ...args: unknown[]) {
    if (armed && this.length === 32 && args[0] === 0) {
      originalKey ??= this;
      if (this === originalKey) { attempts++; if (failing) throw new Error("original Session reader cleanup failed"); }
    }
    return Reflect.apply(fill, this, args);
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(writer.purgeSessionTarget({ session: f.raw.session }), /original Session reader cleanup failed/);
    assert.ok(armed && originalKey); assert.equal(attempts, 1);
    await assert.rejects(writer.purgeSessionTarget({ session: f.parent })); assert.equal(attempts, 1, "failed cleanup must stop subsequent business reads");
    await assert.rejects(writer.close(() => { published++; }), /original Session reader cleanup failed/);
    assert.equal(attempts, 2); assert.equal(published, 0); assertStorageOwner(f.home, parent);
    assert.throws(() => parent.release(), { code: "storage.owner.borrowed" });
    failing = false; await writer.close(); assert.equal(attempts, 3); assert.equal(published, 1);
    assertStorageOwner(f.home, parent); await assert.rejects(writer.purgeSessionTarget({ session: f.raw.session }));
    parent.release(); assert.deepEqual(persistentRecords(f.home), before);
  } finally { failing = false; reading.mock.restore(); zeroing.mock.restore(); syncBuiltinESMExports(); await writer.close(); }
});

async function fixture(t: TestContext, appId = "io.molis.project-delete-test") {
  const home = await mkdtemp(join(tmpdir(), "molis-project-session-delete-"));
  const app = { appId, appVersion: "1.0.0" };
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
    create: (project_id = owner.project_id) => adapter.createSession({ ...owner, project_id, workspace: "none", role_id: "reader", title: "Private title" }),
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

test("project hold and persisted pending reject ordinary lifecycle mutations while the exact original purge remains usable", async t => {
  const f = await fixture(t), active = await f.create(), archived = await f.create(), personal = await f.create("personal");
  const life = f.adapter.sessionLifecycle!;
  const archivedBefore = await life.read(archived, owner);
  await life.archive(archived, { operation_id: "prior-archive", expected_version: archivedBefore.version!, expected_state: "active" }, owner);
  const activeBefore = await life.read(active, owner), archivedNow = await life.read(archived, owner);
  const preview = await life.previewPurge(active, owner), personalBefore = await life.read(personal, { ...owner, project_id: "personal" });
  const mutations = () => [
    () => f.adapter.sessionLifecycle!.archive(active, { operation_id: "outside-archive", expected_version: activeBefore.version!, expected_state: "active" }, owner),
    () => f.adapter.sessionLifecycle!.unarchive(archived, { operation_id: "outside-unarchive", expected_version: archivedNow.version!, expected_state: "archived" }, owner),
    () => f.adapter.sessionLifecycle!.purge(active, { operation_id: "outside-purge", expected_version: preview.version, expected_state: preview.state }, preview, owner),
    () => f.adapter.sessionLifecycle!.archive(personal, { operation_id: "outside-personal", expected_version: personalBefore.version!, expected_state: "active" }, { ...owner, project_id: "personal" }),
  ];
  const scope = f.scope([{ session: personal, owner: { ...owner, project_id: "personal" } }]);
  let plan!: ProjectSessionDeletionPlan;
  await f.adapter.projectDeletion.withHold(scope, async held => {
    plan = await held.preview("held-original");
    for (const mutation of mutations()) await assert.rejects(mutation, { code: "agent.session_busy" });
    assert.equal((await life.read(active, owner)).version, activeBefore.version);
  });
  f.pending.add(owner.project_id); f.pendingSessions.add(personal.session_id);
  await f.reopen();
  for (const mutation of mutations()) await assert.rejects(mutation, { code: "agent.session_busy" });
  await f.adapter.withEffect(control, () => f.adapter.projectDeletion.withHold(scope, held => held.purge(plan)));
  for (const item of plan.sessions) assert.equal((await f.adapter.sessionLifecycle!.read(item.session, item.owner)).state, "purged");
});

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
  const creating = f.adapter.createSession({ ...owner, workspace: "none", role_id: "reader", title: "Prepared" }, { beforeStart: async () => {
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
    assert.ok(f.adapter.inputs.withdraw); await f.adapter.inputs.withdraw(run.ref, original.input_id);
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
