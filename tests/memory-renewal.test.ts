import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryChangeRequest } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { memoryServiceHome, observeMemoryBackend } from "./fixtures/memory-service-home.js";

const START = Date.parse("2026-10-24T08:00:00Z"), DAY = 86_400_000;
const caller = (operation_id: string, extra: Partial<MemoryCaller> = {}): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID,
  project_id: "project-a", consumer: "ui", person: true, purpose: "management", current_scene: "common", operation_id, ...extra });
const renewal = (memory_id: string, expected_version: number, expiry = START + DAY): MemoryChangeRequest => ({
  action: "renew", memory_id, expected_version, expires_at: new Date(expiry).toISOString() });
async function fixture(t: Parameters<typeof memoryServiceHome>[0]) {
  let now = START;
  const f = await memoryServiceHome(t, { projects: ["project-a", "project-b"], now: () => new Date(now) });
  const service = await f.open();
  const saved = (await service.write(caller("seed"), { scope: "project", text: "Retain the original expiry decision", kind: "convention",
    expires_at: new Date(START + 1000).toISOString() })).memory!;
  return { ...f, service, saved, advance: (millis = START + 2000) => { now = millis; }, now: () => new Date(now) };
}

// MEM-08/17/28/29: real Service -> production policy/adapter -> Node storage; no replacement execution or model.
for (const state of ["active", "paused", "disabled"] as const) test(`explicit renewal preserves ${state} identity, facts and raw state across restart`, async t => {
  const f = await fixture(t), raw = f.raw(caller("raw"));
  let original = (await raw.list("project", "project-a"))[0]!;
  if (state !== "active") original = await raw[state === "paused" ? "pause" : "disable"]({ scope: "project", owner: "project-a",
    memory_id: original.memory_id, expected_version: original.version, operation_id: "original-state", reason: "Original state reason" });
  f.advance();
  const task = caller("task", { person: false, consumer: "assistant", purpose: "task", current_scene: "assistant" });
  assert.deepEqual((await f.service.recall(task, { scopes: ["project"] })).items, []);
  const request = renewal(original.memory_id, original.version), who = caller("renewal");
  const result = await f.service.change(who, request), stored = (await raw.list("project", "project-a"))[0]!;
  assert.deepEqual(stored, { ...original, version: original.version + 1, updated_at_ms: f.now().getTime(),
    meta: { ...original.meta, expires_at_ms: START + DAY } });
  assert.equal(result.memory!.state, state); assert.equal(result.memory!.expires_at, request.expires_at);
  assert.equal(result.change.kind, "edited"); assert.equal(result.change.undoable, false);
  assert.equal((await f.service.recall(task, { scopes: ["project"] })).items.length, state === "active" ? 1 : 0);
  await f.close(); const reopened = await f.open();
  assert.deepEqual((await f.raw().list("project", "project-a"))[0], stored);
  const replayed = await reopened.change(who, request); assert.equal(replayed.memory!.version, stored.version);
  assert.deepEqual((await reopened.history(caller("history"), original.memory_id)).revisions.map(row => row.expires_at),
    [f.saved.expires_at, request.expires_at]);
  await assert.rejects(reopened.change(who, renewal(original.memory_id, original.version, START + 2 * DAY)), { code: "memory.conflict" });
});

test("SDK commit with ledger failure repairs once after restart; a later edit or deletion never supplies the old renewal history", async t => {
  const f = await fixture(t); f.advance();
  const request = renewal(f.saved.memory_id, f.saved.version), who = caller("interrupted");
  const fail = t.mock.method(f.ledger(), "addRevision", () => { throw new Error("ledger interrupted"); });
  await assert.rejects(f.service.change(who, request), /ledger interrupted/);
  assert.equal((await f.raw().list("project", "project-a"))[0]!.version, f.saved.version + 1);
  fail.mock.restore(); await f.close(); const service = await f.open();
  const replay = await service.change(who, request); assert.equal(replay.memory!.version, f.saved.version + 1);
  assert.equal((await service.history(caller("history"), f.saved.memory_id)).revisions.length, 2);
  const later = await service.change(caller("later"), { action: "update", memory_id: f.saved.memory_id,
    expected_version: replay.memory!.version, text: "The person's later decision" });
  const history = f.ledger().revisions(f.saved.memory_id);
  await assert.rejects(service.change(who, request));
  assert.deepEqual(f.ledger().revisions(f.saved.memory_id), history);
  assert.equal((await f.raw().list("project", "project-a"))[0]!.text, later.memory!.text);
  await service.change(caller("delete"), { action: "remove", memory_id: f.saved.memory_id, expected_version: later.memory!.version });
  await f.close(); const final = await f.open(); await assert.rejects(final.change(who, request));
  assert.deepEqual(await f.raw().list("project", "project-a"), []); assert.deepEqual(f.ledger().revisions(f.saved.memory_id), []);
});

test("an unrecorded renewal followed by a human edit cannot backfill that later body as the renewal", async t => {
  const f = await fixture(t); f.advance();
  const request = renewal(f.saved.memory_id, f.saved.version), who = caller("unrecorded");
  const fail = t.mock.method(f.ledger(), "addRevision", () => { throw new Error("ledger interrupted"); });
  await assert.rejects(f.service.change(who, request)); fail.mock.restore();
  const committed = (await f.raw().list("project", "project-a"))[0]!;
  const later = await f.service.change(caller("later"), { action: "update", memory_id: committed.memory_id,
    expected_version: committed.version, text: "A later body must not enter the earlier revision" });
  await f.close(); const service = await f.open(); await assert.rejects(service.change(who, request));
  assert.deepEqual(f.ledger().revisions(f.saved.memory_id).map(row => row.version), [f.saved.version, later.memory!.version]);
  assert.equal((await f.raw().list("project", "project-a"))[0]!.text, later.memory!.text);
});

test("same-version competitors permit one renewal, and the whole operation fixes its deadline before asynchronous dispatch", async t => {
  const f = await fixture(t); f.advance();
  const request = renewal(f.saved.memory_id, f.saved.version), who = caller("fixed");
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const service = new MemoryService({ ledger: f.ledger(), now: f.now, backend: observeMemoryBackend(f.raw(), bound => ({ ...bound,
    renew: async input => { entered.resolve(); await release.promise; return bound.renew(input); } })) });
  const pending = service.change(who, request); await entered.promise;
  try {
    await assert.rejects(service.change(who, renewal(f.saved.memory_id, f.saved.version, START + 2 * DAY)), { code: "memory.conflict" });
    await assert.rejects(service.change(who, { action: "remove", memory_id: f.saved.memory_id, expected_version: f.saved.version }), { code: "memory.conflict" });
    const competitor = await f.service.change(caller("competitor"), renewal(f.saved.memory_id, f.saved.version, START + 3 * DAY));
    assert.equal(competitor.memory!.version, f.saved.version + 1);
  } finally { release.resolve(); }
  await assert.rejects(pending);
  const current = (await f.raw().list("project", "project-a"))[0]!;
  assert.equal(current.meta.expires_at_ms, START + 3 * DAY); assert.equal(current.version, f.saved.version + 1);
  assert.equal(f.ledger().revisions(f.saved.memory_id).length, 2);
});

test("renewal rejects malformed, implicit, mixed, foreign, non-person and expired retry decisions without rewriting facts", async t => {
  const f = await fixture(t), request = renewal(f.saved.memory_id, f.saved.version);
  await assert.rejects(f.service.change(caller("not-expired"), request));
  const timeless = (await f.service.write(caller("timeless"), { scope: "project", text: "A distinct timeless memory" })).memory!;
  f.advance(); await assert.rejects(f.service.change(caller("no-expiry"), renewal(timeless.memory_id, timeless.version)));
  const before = await f.raw().list("project", "project-a"), history = f.ledger().revisions(f.saved.memory_id);
  for (const invalid of [ { expires_at: undefined }, { expires_at: null }, { expires_at: "tomorrow" }, { expires_at: "2026-12-01T12:00:00" },
    { expires_at: "2026-02-30T12:00:00.000Z" }, { expires_at: new Date(START).toISOString() }, { expected_version: undefined },
    { text: "Mixed edit" }, { kind: "fact" as const }, { classification: { scenes: ["common"], lifecycle: "long-term" } },
    { applies: {} }, { version: 1 }, { to: "personal" as const } ])
    await assert.rejects(f.service.change(caller(crypto.randomUUID()), { ...request, ...invalid } as MemoryChangeRequest), { code: "memory.invalid" });
  await assert.rejects(f.service.change(caller("agent", { person: false, consumer: "agent" }), request));
  await assert.rejects(f.service.change(caller("foreign", { project_id: "project-b" }), request));
  assert.deepEqual(await f.raw().list("project", "project-a"), before); assert.deepEqual(f.ledger().revisions(f.saved.memory_id), history);
  const renewed = await f.service.change(caller("valid"), request); f.advance(START + 2 * DAY);
  await assert.rejects(f.service.change(caller("valid"), request));
  assert.equal((await f.raw().list("project", "project-a")).find(one => one.memory_id === f.saved.memory_id)!.version, renewed.memory!.version);
});

for (const failure of ["cancel", "revoke", "expiry"] as const) test(`renewal waiting for dispatch respects ${failure} and creates no revision`, async t => {
  const f = await fixture(t); f.advance();
  const request = renewal(f.saved.memory_id, f.saved.version), controller = new AbortController();
  const before = (await f.raw().list("project", "project-a"))[0]!;
  const service = new MemoryService({ ledger: f.ledger(), now: f.now, backend: observeMemoryBackend(f.raw(), bound => ({ ...bound,
    renew: async input => {
      if (failure === "cancel") controller.abort();
      if (failure === "revoke") f.service.savePrefs(caller("off"), "project", { enabled: false });
      if (failure === "expiry") f.advance(START + 2 * DAY);
      return bound.renew(input);
    } })) });
  await assert.rejects(service.change(caller("waiting", { signal: controller.signal }), request));
  assert.deepEqual((await f.raw().list("project", "project-a"))[0], before); assert.equal(f.ledger().revisions(before.memory_id).length, 1);
});

// MEM-17/28/29: direct public Service callers retain cancellation without the Action ledger proxy.
test("direct Service cancellation after SDK renewal commit leaves the ledger unchanged and the original operation repairs once", async t => {
  const f = await fixture(t); f.advance();
  const id = f.saved.memory_id, who = caller("direct-cancel-after-sdk"), request = renewal(id, f.saved.version);
  const snapshot = () => ({ revisions: f.ledger().revisions(id), changes: f.ledger().changesOf(id), uses: f.ledger().uses({ memory_id: id }),
    operations: ["change-request", `change:${id}`, `renew:${id}`].map(key => f.ledger().marker(who.actor_id, `memory-operation:${who.operation_id}:${key}`)) });
  const before = snapshot(), controller = new AbortController(), cancellation = new Error("Original caller cancelled after SDK commit");
  let atCommit: ReturnType<typeof snapshot> | undefined;
  const service = new MemoryService({ ledger: f.ledger(), now: f.now, backend: observeMemoryBackend(f.raw(), bound => ({ ...bound,
    renew: async input => {
      const committed = await bound.renew(input);
      assert.equal(committed.version, f.saved.version + 1, "the real SDK committed before cancellation");
      atCommit = snapshot();
      controller.abort(cancellation);
      return committed;
    } })) });
  await assert.rejects(service.change({ ...who, signal: controller.signal }, request), error => error === cancellation);
  assert.ok(atCommit);
  assert.deepEqual(snapshot(), atCommit, "neither history nor the pending operation markers change after cancellation");
  assert.deepEqual(atCommit.revisions, before.revisions); assert.deepEqual(atCommit.changes, before.changes);
  const committed = (await f.raw().list("project", "project-a"))[0]!;
  assert.equal(committed.version, f.saved.version + 1); assert.equal(committed.meta.expires_at_ms, START + DAY);
  await f.close(); const reopened = await f.open();
  assert.deepEqual((await f.raw().list("project", "project-a"))[0], committed);
  const recovered = await reopened.change(who, request);
  assert.equal(recovered.memory!.version, committed.version);
  assert.deepEqual((await f.raw().list("project", "project-a"))[0], committed, "repair must not repeat the SDK write");
  const repaired = snapshot();
  assert.deepEqual(repaired.revisions.map(row => row.version), [...before.revisions.map(row => row.version), committed.version]);
  assert.equal(repaired.changes.length, before.changes.length + 1);
  await reopened.change(who, request);
  assert.deepEqual(snapshot(), repaired, "the original operation repairs ledger state exactly once");
});

test("renewal preserves unknown source facts and makes the original automatic undo unavailable", async t => {
  const f = await fixture(t), raw = f.raw();
  const entry = await raw.write({ scope: "project", owner: "project-a", text: "Unknown old approval remains unknown", origin: "Original source",
    operation_id: "unknown", meta: { kind: "habit", source: "auto", classification: { scenes: ["common"], lifecycle: "short-term" },
      evidence: [{ kind: "unknown-old-kind", ref: "original-reference" }], expires_at_ms: START + 1000 } });
  f.ledger().saveChange({ change_id: "old-auto", actor_id: LOCAL_PERSON_ACTOR_ID, owner: "project-a", project_id: "project-a", scope: "project",
    memory_id: entry.memory_id, kind: "auto_kept", by: "policy", text: entry.text, rule: "original", reason: null, work: null,
    at: new Date(START).toISOString(), state: "active", undoable: true, undo: { action: "remove" } });
  f.advance(); const result = await f.service.change(caller("renew-unknown"), renewal(entry.memory_id, entry.version));
  assert.equal(result.memory!.basis, null); assert.equal(result.memory!.approved_by, null);
  assert.deepEqual(result.memory!.evidence, [{ kind: "unknown-old-kind", ref: "original-reference", at: null }]);
  assert.equal(f.ledger().change("old-auto")!.undoable, false); await assert.rejects(f.service.undo(caller("undo"), "old-auto"));
  const canonical = (await raw.list("project", "project-a")).find(one => one.memory_id === entry.memory_id)!;
  assert.deepEqual(canonical.meta, { ...entry.meta, expires_at_ms: START + DAY });
});

test("App renewal refuses Session memory even when its original Session is active and explicitly bound", async t => {
  const f = await fixture(t);
  const session = await f.adapter().createSession({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", plugin_id: "io.molis.work.coding",
    install_id: "coding", workspace: "none", role_id: "coding", title: "Renewal Session boundary" });
  const who = caller("session", { session_id: session.session_id, current_scene: "coding" });
  const entry = await f.raw(who).write({ scope: "personal", owner: who.actor_id, text: "Only in this original Session", origin: "Session source", operation_id: "session-entry",
    meta: { kind: "convention", source: "manual", classification: { scenes: ["coding"], lifecycle: "session" },
      session_ref: { kind: "session", id: session.session_id, revision: 1 }, expires_at_ms: START + 1000 } });
  f.advance(); const request = renewal(entry.memory_id, entry.version);
  await assert.rejects(f.service.change(who, request), { code: "memory.invalid" });
  await assert.rejects(f.service.change(caller("no-session"), request));
  assert.deepEqual((await f.raw(who).list("personal", who.actor_id))[0], entry);
  assert.deepEqual(f.ledger().revisions(entry.memory_id), []);
});


test("candidate identity cannot be renewed as a formal entry", async t => {
  const f = await fixture(t);
  const candidate = await f.service.propose(caller("candidate"), { scope: "project", text: "Candidate remains waiting for a separate decision",
    kind: "fact", basis: "inferred", why: "A proposal only", from: "work" });
  await assert.rejects(f.service.change(caller("candidate-renew"), renewal(candidate.candidate_id, candidate.version)));
  assert.equal((await f.service.candidates(caller("candidates")))[0]!.version, candidate.version);
  assert.equal((await f.raw().list("project", "project-a")).length, 1);
});
