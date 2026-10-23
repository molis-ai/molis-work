import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { AgentMemoryCaller, AgentMemoryExecutionControl, AgentMemoryMeta } from "@molis-ai/molis-work-contracts/services/agent-host";
import { createPrologueNodeAdapter, type PrologueNodeAdapterOptions } from "@molis-ai/molis-work-service-agent-host";
import { currentMemoryOptions } from "./fixtures/current-memory.ts";

const APP = { appId: "io.molis.memory-current-authority-test", appVersion: "1.0.0" };
const alice: AgentMemoryCaller = { actor_id: "alice", project_id: "project-a", consumer: "ui", current_scene: "coding", purpose: "management", person: true };
const bob: AgentMemoryCaller = { actor_id: "bob", project_id: "project-b", consumer: "ui", current_scene: "coding", purpose: "management", person: true };
const where = { scope: "project", owner: "project-a" } as const;
const save = { ...where, text: "Publish release notes before the release.", origin: "person", operation_id: "manual-save" };

test("maintenance preview has no record writes and logical removal retains an exact current-authority receipt", async t => {
  const f = await fixture(t), memory = f.bound();
  const entry = await memory.write(save);
  const command = { ...where, memory_id: entry.memory_id, expected_version: entry.version, operation_id: "logical-remove" };
  const before = f.bytes();
  await memory.previewMutation({ ...command, mutation: { kind: "remove" } });
  assert.deepEqual(f.bytes(), before);
  await assert.rejects(f.adapter.memory!.previewMutation({ ...command, mutation: { kind: "remove" } }));
  const removed = await memory.tombstone(command);
  assert.equal(removed.tombstoned, true); assert.equal(removed.version, entry.version + 1);
  assert.deepEqual(await memory.list(where.scope, where.owner), []);
  await f.reopen();
  assert.equal((await f.bound().tombstone(command)).version, removed.version);
  f.revoked.add(alice.actor_id);
  const committed = f.bytes();
  await assert.rejects(f.bound().tombstone(command));
  assert.deepEqual(f.bytes(), committed);
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function records(directory: string): Record<string, string> {
  if (!existsSync(directory)) return {};
  return Object.fromEntries(readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? Object.entries(records(path)).map(([name, bytes]) => [`${entry.name}/${name}`, bytes])
      : [[entry.name, readFileSync(path).toString("base64")]];
  }));
}

async function fixture(t: TestContext, options: { configured?: boolean; beforeAuthorize?: NonNullable<PrologueNodeAdapterOptions["memory"]>["authorize"] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "molis-memory-current-authority-")), storageRoot = join(root, "sdk");
  const revoked = new Set<string>();
  const memory = currentMemoryOptions({ appId: APP.appId,
    scopesFor: caller => [{ scope: "user", owner: caller.actor_id }, ...(caller.project_id ? [{ scope: "project" as const, owner: caller.project_id }] : [])],
    allowed: caller => !revoked.has(caller.actor_id), beforeAuthorize: options.beforeAuthorize });
  let networkCalls = 0;
  t.mock.method(globalThis, "fetch", async () => { networkCalls++; throw new Error("Memory persistence must not call a model"); });
  const open = (configured = options.configured !== false) => createPrologueNodeAdapter({ app: APP, storageRoot,
    modelConfiguration: async () => { throw new Error("Memory persistence must not resolve a model"); }, ...(configured ? { memory } : {}) });
  let adapter = await open();
  t.after(async () => { await adapter.close(); rmSync(root, { recursive: true, force: true }); assert.equal(networkCalls, 0); });
  return { root, storageRoot, revoked, get adapter() { return adapter; },
    bound: (caller = alice) => adapter.memory!.withCaller(caller),
    reopen: async () => { await adapter.close(); adapter = await open(true); },
    bytes: () => records(join(storageRoot, "records")),
  };
}

test("a missing caller or absent policy refuses real SDK persistence without falling back to management authority", async t => {
  const f = await fixture(t), before = f.bytes();
  await assert.rejects(f.adapter.memory!.write(save), { code: "agent.capability_unavailable" });
  await assert.rejects(f.adapter.memory!.list(where.scope, where.owner), { code: "agent.capability_unavailable" });
  assert.deepEqual(f.bytes(), before); await f.reopen();
  assert.deepEqual(await f.bound().list(where.scope, where.owner), []);
  const missing = await fixture(t, { configured: false }), absentBefore = missing.bytes();
  await assert.rejects(missing.bound().write(save));
  assert.deepEqual(missing.bytes(), absentBefore); await missing.reopen();
  assert.deepEqual(await missing.bound().list(where.scope, where.owner), []);
});

test("two concurrent callers with the same consumer and scene keep their distinct current owner grants", async t => {
  const entered = new Map<string, ReturnType<typeof deferred>>([["alice", deferred()], ["bob", deferred()]]);
  const released = new Map<string, ReturnType<typeof deferred>>([["alice", deferred()], ["bob", deferred()]]);
  const first = new Set<string>();
  const f = await fixture(t, { beforeAuthorize: async (caller, requests) => {
    if (requests.some(request => request.action === "save") && !first.has(caller.actor_id)) {
      first.add(caller.actor_id); entered.get(caller.actor_id)!.resolve(); await released.get(caller.actor_id)!.promise;
    }
    return true;
  } });
  const a = f.bound(alice).write(save);
  const b = f.bound(bob).write({ ...save, owner: "project-b", text: "Archive the project notes.", operation_id: "bob-save" });
  await entered.get("alice")!.promise;
  // Both invocations overlap, while the SDK's one writer serializes their commits.
  released.get("alice")!.resolve(); await a;
  await entered.get("bob")!.promise; released.get("bob")!.resolve(); await b;
  assert.deepEqual((await f.bound(alice).list("project", "project-a")).map(entry => entry.text), [save.text]);
  assert.deepEqual((await f.bound(bob).list("project", "project-b")).map(entry => entry.text), ["Archive the project notes."]);
  assert.deepEqual(await f.bound(alice).list("project", "project-b"), [], "list exposes only individually authorized entries");
  assert.deepEqual(await f.bound(bob).list("project", "project-a"), []);
  const before = f.bytes();
  await assert.rejects(f.bound(alice).write({ ...save, owner: "project-b", operation_id: "alice-foreign-project" }));
  assert.deepEqual(f.bytes(), before);
});

for (const order of ["caller-first", "execution-first"] as const) test(`${order} retains the final execution guard after an awaited permission check`, async t => {
  const f = await fixture(t), entered = deferred(), release = deferred();
  let current = true, finalChecks = 0;
  const control: AgentMemoryExecutionControl = { beforeEffect: async () => { entered.resolve(); await release.promise; },
    assert_current: () => { finalChecks++; assert.ok(current, "execution was revoked"); } };
  const base = f.adapter.memory!;
  const memory = order === "caller-first" ? base.withCaller(alice).withExecution!(control) : base.withExecution!(control).withCaller(alice);
  const before = f.bytes(), pending = memory.write(save);
  await entered.promise; current = false; release.resolve();
  await assert.rejects(pending, /execution was revoked/);
  assert.equal(finalChecks, 1); assert.deepEqual(f.bytes(), before);
  await f.reopen(); assert.deepEqual(await f.bound().list(where.scope, where.owner), []);
});

test("current authority revoked while admission waits refuses the append with zero durable records", async t => {
  const entered = deferred(), release = deferred();
  const f = await fixture(t, { beforeAuthorize: async (_caller, requests) => {
    if (requests.some(request => request.action === "save")) { entered.resolve(); await release.promise; }
    return true;
  } });
  const before = f.bytes(), pending = f.bound().write(save);
  await entered.promise; f.revoked.add("alice"); release.resolve();
  await assert.rejects(pending); assert.deepEqual(f.bytes(), before);
  f.revoked.clear(); await f.reopen(); assert.deepEqual(await f.bound().list(where.scope, where.owner), []);
});

test("append retries retain their operation identity after restart and stale updates cannot overwrite a later version", async t => {
  const f = await fixture(t), original = await f.bound().write(save);
  await f.reopen();
  const retried = await f.bound().write(save);
  assert.equal(retried.memory_id, original.memory_id); assert.equal(retried.version, original.version);
  assert.equal((await f.bound().list(where.scope, where.owner)).length, 1);
  await assert.rejects(f.bound().write({ ...save, text: "Different input under the same append operation" }));
  const update = { ...where, memory_id: original.memory_id, expected_version: original.version, operation_id: "manual-update",
    change: { text: "Release notes must include rollback steps.", meta: { kind: "convention", classification: { scenes: ["coding"], lifecycle: "long-term" } } } };
  const next = await f.bound().update(update);
  assert.equal(next.version, original.version + 1); assert.deepEqual(next.meta, update.change.meta);
  assert.equal((await f.bound().update(update)).version, next.version);
  await assert.rejects(f.bound().update({ ...update, operation_id: "stale-update", change: { text: "stale" } }), { code: "agent.memory_conflict" });
  await f.reopen(); const kept = (await f.bound().list(where.scope, where.owner))[0]!;
  assert.equal(kept.text, next.text); assert.equal(kept.version, next.version);
});

test("classification, trusted session identity and disabled state survive the public snake-case mapping and restart", async t => {
  const f = await fixture(t);
  const session = await f.adapter.createSession({ project_id: "project-a", plugin_id: "test.plugin", install_id: "test-install", actor_id: "alice",
    title: "Session memory", directory: { canonical_path: f.root, realpath_verified: true } });
  const caller = { ...alice, session_id: session.session_id };
  const meta: AgentMemoryMeta = { kind: "preference", classification: { scenes: ["coding"], lifecycle: "session", extra: { topic: ["format"] } },
    session_ref: { kind: "session", id: session.session_id, revision: 1 }, source: "manual", basis: "explicit",
    approved_by: { by: "person" }, evidence: [{ kind: "person", ref: "input-1", at_ms: 1 }] };
  const entry = await f.bound(caller).write({ ...save, meta });
  assert.deepEqual(entry.meta, meta);
  const disabled = await f.bound(caller).disable({ ...where, memory_id: entry.memory_id, reason: "The person switched it off", expected_version: entry.version, operation_id: "disable" });
  assert.equal(disabled.version, entry.version + 1); assert.equal(disabled.disabled!.reason, "The person switched it off");
  assert.ok(disabled.disabled!.at_ms > 0); assert.equal(disabled.paused, undefined);
  assert.deepEqual(await f.bound(caller).recall({ ...where, keywords: ["release"] }), []);
  await f.reopen();
  const restored = (await f.bound(caller).list(where.scope, where.owner))[0]!;
  assert.deepEqual(restored.meta, meta); assert.deepEqual(restored.disabled, disabled.disabled);
  const resumed = await f.bound(caller).resume({ ...where, memory_id: entry.memory_id, expected_version: restored.version, operation_id: "resume" });
  assert.equal(resumed.disabled, undefined); assert.equal(resumed.version, disabled.version + 1);
});

test("settling a versioned candidate changes formal text and metadata with one CAS and replays only the same decision", async t => {
  const f = await fixture(t), formal = await f.bound().write(save);
  const proposed = await f.bound().candidates.propose({ ...where, text: "Use a short release checklist", origin: "person", expected_version: 0, operation_id: "propose-checklist" });
  assert.ok(proposed.version > 0); assert.equal(proposed.state, "pending");
  const command = { ...where, candidate_id: proposed.candidate_id, candidate_expected_version: proposed.version, operation_id: "settle-checklist",
    target: { memory_id: formal.memory_id, expected_version: formal.version,
      change: { text: "Publish a short release checklist before the release.", meta: { kind: "convention", classification: { scenes: ["coding"], lifecycle: "long-term" } } } },
    by: { by: "person" as const } };
  const settled = await f.bound().candidates.settleInto(command);
  assert.equal(settled.memory_id, formal.memory_id); assert.equal(settled.version, formal.version + 1);
  assert.equal(settled.text, command.target.change.text); assert.equal(settled.meta.kind, "convention");
  const candidate = (await f.bound().candidates.list(where.scope, where.owner)).find(item => item.candidate_id === proposed.candidate_id)!;
  assert.ok(candidate.version > proposed.version); assert.equal(candidate.state, "accepted"); assert.equal(candidate.memory_id, formal.memory_id);
  await f.reopen();
  assert.equal((await f.bound().candidates.settleInto(command)).version, settled.version);
  const again = (await f.bound().candidates.list(where.scope, where.owner)).find(item => item.candidate_id === proposed.candidate_id)!;
  assert.equal(again.version, candidate.version);
  await assert.rejects(f.bound().candidates.settleInto({ ...command, operation_id: "different-decision" }));
  assert.equal((await f.bound().list(where.scope, where.owner))[0]!.version, settled.version);
});

test("clearing a fixed preview retries its original references and never deletes an item saved later", async t => {
  const f = await fixture(t), old = await f.bound().write(save);
  const preview = await f.bound().previewScope(where.scope, where.owner);
  assert.deepEqual(preview.items, [{ memory_id: old.memory_id, version: old.version }]);
  const command = { ...where, preview, operation_id: preview.operation_id };
  const cleared = await f.bound().clearScope(command);
  assert.deepEqual(cleared.items.map(item => item.outcome), ["completed"]);
  const later = await f.bound().write({ ...save, operation_id: "saved-after-preview", text: "A new convention after the confirmed clear." });
  await f.reopen();
  const retried = await f.bound().clearScope(command);
  assert.deepEqual(retried.items.map(item => item.outcome), ["already-absent"]);
  assert.deepEqual((await f.bound().list(where.scope, where.owner)).map(item => item.memory_id), [later.memory_id]);
  await assert.rejects(f.bound().clearScope({ ...command, operation_id: "replacement-clear" }));
});
