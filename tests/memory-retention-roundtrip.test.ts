import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { MemoryService, defaultPrefs, MEMORY_GATE_POLICY, MEMORY_GATE_VERSION, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { prologueMemoryBackend, memoryRuntimePolicy, type MemoryRuntimePolicyOwner } from "@molis-ai/molis-work-app-local-host";

const DAY = 86_400_000, START = Date.parse("2026-10-23T08:00:00Z");
const caller = (operation_id: string, extra: Partial<MemoryCaller> = {}): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID,
  project_id: "project-a", consumer: "ui", person: true, current_scene: "common", purpose: "management", operation_id, ...extra });
const proposal = (text: string) => ({ scope: "project" as const, kind: "convention" as const, text, basis: "inferred" as const,
  why: "A bounded suggestion", from: "extraction" as const });

async function fixture(t: TestContext, extraDimensions = false) {
  t.mock.timers.enable({ apis: ["Date"], now: START });
  const home = await mkdtemp(join(tmpdir(), "molis-memory-retention-"));
  let ledger = openMemoryLedger({ homeDirectory: home }), service!: MemoryService, beforeProject: (() => Promise<void>) | undefined;
  for (const key of ["personal", "project-default"]) ledger.savePrefs(LOCAL_PERSON_ACTOR_ID, key, defaultPrefs(key === "personal" ? "personal" : "project", "reviewed"));
  const owner: MemoryRuntimePolicyOwner = { alive: () => true, prefsFor: (scope, project) => service.prefsFor(LOCAL_PERSON_ACTOR_ID, scope, project),
    owners: project => ledger.owners(project), candidateOwners: project => ledger.candidateOwners(project),
    projectExists: async id => { await beforeProject?.(); return id === "project-a"; }, deletingProject: () => undefined };
  let calls = 0;
  const memory = memoryRuntimePolicy(() => owner);
  if (extraDimensions) memory.policy = { ...memory.policy!, taxonomy: { ...memory.policy!.taxonomy,
    extra: [{ id: "topic", label: "Topic", cardinality: "many", values: [{ id: "format", label: "Format" }, { id: "timing", label: "Timing" }] }] } };
  const open = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), memory: { ...memory,
      promotion: { policy: MEMORY_GATE_POLICY, version: MEMORY_GATE_VERSION, decide: (caller, request) => service.promotion.decide(caller, request),
        undo: { prepare: (caller, request) => service.promotion.undo.prepare(caller, request),
          record: (caller, request) => service.promotion.undo.record(caller, request) } } },
    modelConfiguration: async () => { calls++; throw new Error("No model in retention tests"); } });
  let adapter = await open();
  const backend = prologueMemoryBackend(async () => adapter.memory!);
  service = new MemoryService({ ledger, backend });
  t.after(async () => { await adapter.close(); ledger.close(); await rm(home, { recursive: true, force: true }); assert.equal(calls, 0); });
  return { get service() { return service; }, get ledger() { return ledger; }, get adapter() { return adapter; },
    raw: (who = caller("read")) => backend.withCaller(who),
    reopen: async () => { await adapter.close(); ledger.close(); ledger = openMemoryLedger({ homeDirectory: home }); adapter = await open(); service = new MemoryService({ ledger, backend }); },
    beforeProject: (hook?: () => Promise<void>) => { beforeProject = hook; },
  };
}

test("formal retention shorter and longer than the candidate window survives acceptance and restart", async t => {
  const f = await fixture(t);
  for (const days of [1, 30]) {
    const expires = new Date(START + days * DAY).toISOString();
    const pending = await f.service.propose(caller(`propose-${days}`, { current_scene: "assistant" }), proposal(`Use afternoon appointments for ${days} days`), { formal_expires_at: expires });
    assert.equal(pending.formal_expires_at, expires, "formal retention is visible separately from the waiting deadline");
    assert.equal(pending.waiting_expires_at, new Date(START + Math.min(days, 14) * DAY).toISOString());
    const raw = (await f.raw().candidates.list("project", "project-a")).find(item => item.candidate_id === pending.candidate_id)!;
    assert.equal(raw.meta.expires_at_ms, START + Math.min(days, 14) * DAY);
    await f.reopen();
    const accepted = await f.service.accept(caller(`accept-${days}`), pending.candidate_id, { expected_version: pending.version });
    await f.reopen();
    const formal = (await f.raw().list("project", "project-a")).find(item => item.memory_id === accepted.memory!.memory_id)!;
    assert.equal(formal.meta.expires_at_ms, Date.parse(expires));
    assert.deepEqual(formal.meta.classification, { scenes: ["assistant"], lifecycle: "short-term" });
  }
});

test("a candidate correction preserves the target's own formal expiry", async t => {
  const f = await fixture(t), expires = new Date(START + 30 * DAY).toISOString();
  const original = await f.service.write(caller("original", { current_scene: "assistant" }), { scope: "project", text: "Meet at noon this month", expires_at: expires });
  const pending = await f.service.propose(caller("correct"), { ...proposal("Meet in the evening this month"), supersedes: original.memory!.memory_id });
  await f.service.accept(caller("accept"), pending.candidate_id, { expected_version: pending.version });
  const formal = (await f.raw().list("project", "project-a"))[0]!;
  assert.equal(formal.memory_id, original.memory!.memory_id); assert.equal(formal.version, 2);
  assert.equal(formal.meta.expires_at_ms, Date.parse(expires));
  assert.deepEqual(formal.meta.classification, { scenes: ["assistant"], lifecycle: "short-term" });
});

test("public replacement null retains the old expiry while an explicitly recorded new candidate null remains permanent", async t => {
  const f = await fixture(t), expires = new Date(START + 30 * DAY).toISOString();
  const original = await f.service.write(caller("original"), { scope: "project", text: "Prefer concise weekly reports this month", expires_at: expires });
  await f.service.write(caller("replace"), { scope: "project", text: "Prefer short weekly reports this month", replaces: original.memory!.memory_id, expires_at: null });
  const replacement = (await f.raw().list("project", "project-a"))[0]!;
  assert.equal(replacement.meta.expires_at_ms, Date.parse(expires));
  assert.equal(replacement.meta.classification!.lifecycle, "short-term");
  const pending = await f.service.propose(caller("proposal"), proposal("Prefer afternoon calls"), { formal_expires_at: null });
  assert.equal(f.ledger.candidates(LOCAL_PERSON_ACTOR_ID)[0]!.formal_expires_at, null);
  await f.service.accept(caller("accept"), pending.candidate_id, { expected_version: pending.version });
  const permanent = (await f.raw().list("project", "project-a")).find(item => item.text === pending.text)!;
  assert.equal(permanent.meta.expires_at_ms, undefined);
  assert.equal(permanent.meta.classification!.lifecycle, "long-term");
});

test("same-operation ledger repair after the candidate deadline keeps the committed formal deadline", async t => {
  const f = await fixture(t), expires = new Date(START + 30 * DAY).toISOString();
  const pending = await f.service.propose(caller("proposal"), proposal("Keep reports brief this month"), { formal_expires_at: expires });
  const fail = t.mock.method(f.ledger, "addRevision", () => { throw new Error("ledger interrupted"); });
  await assert.rejects(f.service.accept(caller("accept"), pending.candidate_id, { expected_version: pending.version }), /ledger interrupted/);
  fail.mock.restore(); t.mock.timers.setTime(START + 15 * DAY); await f.reopen();
  const accepted = await f.service.accept(caller("accept"), pending.candidate_id, { expected_version: pending.version });
  assert.equal(accepted.memory!.expires_at, expires);
  assert.equal((await f.raw().list("project", "project-a")).length, 1);
  assert.equal(f.ledger.revisions(accepted.memory!.memory_id).length, 1);
});

test("expiry while current authority waits produces no new formal write", async t => {
  const f = await fixture(t), expires = new Date(START + DAY).toISOString();
  const pending = await f.service.propose(caller("proposal"), proposal("Use a temporary meeting schedule"), { formal_expires_at: expires });
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  f.beforeProject(async () => { enter(); await gate; });
  const accept = f.service.accept(caller("accept"), pending.candidate_id, { expected_version: pending.version });
  await entered; t.mock.timers.setTime(START + 15 * DAY); release();
  await assert.rejects(accept); f.beforeProject();
  assert.deepEqual(await f.raw().list("project", "project-a"), []);
});

test("v2 export and import retain classification, namespace, repeated basis and the absolute deadline", async t => {
  const f = await fixture(t), expires = START + 30 * DAY;
  await f.raw().write({ scope: "personal", owner: LOCAL_PERSON_ACTOR_ID, text: "Use concise status reports", origin: "Portable convention", operation_id: "raw-seed",
    meta: { kind: "convention", source: "manual", basis: "repeated", approved_by: { by: "person" }, namespace: "example.plugin",
      classification: { scenes: ["assistant"], lifecycle: "short-term" }, expires_at_ms: expires } });
  const pack = await f.service.exportScope(caller("export"), "personal");
  assert.equal(pack.version, 2);
  assert.equal(pack.entries[0]!.basis, "repeated");
  assert.deepEqual(pack.entries[0]!.classification, { scenes: ["assistant"], lifecycle: "short-term" });
  assert.equal(pack.entries[0]!.namespace, "example.plugin");
  await f.service.importScope(caller("import"), "project", pack); await f.reopen();
  const formal = (await f.raw().list("project", "project-a"))[0]!;
  assert.deepEqual(formal.meta.classification, pack.entries[0]!.classification);
  assert.equal(formal.meta.namespace, "example.plugin"); assert.equal(formal.meta.basis, "repeated");
  assert.equal(formal.meta.expires_at_ms, expires);
  assert.deepEqual(await f.service.importScope(caller("import-again"), "project", pack), { written: 0, skipped: 1, refused: 0 });
});

// IMPORT-04: importing an unchanged current package again adds nothing despite canonical omission of empty extra.
test("IMPORT-04: empty extra dimensions deduplicate under a new operation without changing the stored entry across restart", async t => {
  const f = await fixture(t), expires = START + 30 * DAY;
  const pack = { format: "molis.memory", version: 2, exported_at: new Date(START).toISOString(), scope: "personal", redactions: [],
    entries: [{ text: "Use concise status reports", kind: "convention", source: "manual", basis: "repeated",
      origin: "Portable convention", applies: { task: "Before release" }, expires_at: new Date(expires).toISOString(),
      namespace: "example.plugin", classification: { scenes: ["assistant"], lifecycle: "short-term", extra: {} } }] };
  const original = structuredClone(pack);
  assert.deepEqual(await f.service.importScope(caller("empty-extra-first"), "project", pack), { written: 1, skipped: 0, refused: 0 });
  const stored = structuredClone(await f.raw().list("project", "project-a"));
  assert.equal(stored.length, 1);
  assert.equal(stored[0]!.text, "Use concise status reports");
  assert.deepEqual(stored[0]!.meta, { kind: "convention", source: "imported", basis: "repeated",
    classification: { scenes: ["assistant"], lifecycle: "short-term" }, namespace: "example.plugin",
    applies_when: { task: "Before release" }, expires_at_ms: expires });
  await f.reopen();
  assert.deepEqual(await f.raw().list("project", "project-a"), stored);
  // Keep the original package, including extra: {}; exporting again would conceal the different representation.
  assert.deepEqual(await f.service.importScope(caller("empty-extra-second"), "project", pack), { written: 0, skipped: 1, refused: 0 });
  assert.deepEqual(await f.raw().list("project", "project-a"), stored);
  await f.reopen();
  assert.deepEqual(await f.raw().list("project", "project-a"), stored);
  assert.deepEqual(pack, original);
});

test("IMPORT-04: different nonempty extra dimensions remain independent across import and restart", async t => {
  const f = await fixture(t, true);
  const pack = { format: "molis.memory", version: 2, exported_at: new Date(START).toISOString(), scope: "personal", redactions: [],
    entries: ["format", "timing"].map(topic => ({ text: "Use concise status reports", kind: "convention", source: "manual", basis: "repeated",
      origin: "Portable convention", applies: { task: "Before release" }, expires_at: null,
      classification: { scenes: ["assistant"], lifecycle: "long-term", extra: { topic: [topic] } } })) };
  const original = structuredClone(pack);
  assert.deepEqual(await f.service.importScope(caller("distinct-extra-first"), "project", pack), { written: 2, skipped: 0, refused: 0 });
  const read = async () => (await f.raw().list("project", "project-a")).toSorted((a, b) => a.memory_id.localeCompare(b.memory_id));
  const stored = structuredClone(await read());
  assert.equal(stored.length, 2); assert.notEqual(stored[0]!.memory_id, stored[1]!.memory_id);
  assert.deepEqual(stored.map(one => one.meta.classification!.extra!.topic).sort(), [["format"], ["timing"]]);
  for (const item of stored) assert.equal(item.text, "Use concise status reports");
  await f.reopen(); assert.deepEqual(await read(), stored);
  assert.deepEqual(await f.service.importScope(caller("distinct-extra-second"), "project", pack), { written: 0, skipped: 2, refused: 0 });
  assert.deepEqual(await read(), stored);
  await f.reopen(); assert.deepEqual(await read(), stored);
  assert.deepEqual(pack, original);
});

test("expiry undo cannot turn a short-term item into permanent memory", async t => {
  const f = await fixture(t), expires = new Date(START + DAY).toISOString();
  const saved = await f.service.write(caller("save"), { scope: "project", text: "Temporary weekly routine", expires_at: expires });
  const disabled = await f.service.change(caller("disable", { person: false, consumer: "assistant", current_scene: "assistant" }),
    { memory_id: saved.memory!.memory_id, action: "disable", expected_version: saved.memory!.version });
  t.mock.timers.setTime(START + 2 * DAY);
  const change = disabled.change;
  await assert.rejects(f.service.undo(caller("undo"), change.change_id), /到期.*期限/);
  const formal = (await f.raw().list("project", "project-a"))[0]!;
  assert.equal(formal.meta.expires_at_ms, Date.parse(expires));
  assert.equal(f.ledger.change(change.change_id)!.state, "active", "an unsuccessful undo is not recorded as undone");
});

test("a proposal's original formal deadline survives ledger failure without accepting a changed same-operation deadline", async t => {
  const f = await fixture(t), who = caller("proposal"), input = proposal("Use a temporary reporting convention");
  const thirty = new Date(START + 30 * DAY).toISOString(), sixty = new Date(START + 60 * DAY).toISOString();
  const fail = t.mock.method(f.ledger, "saveCandidate", () => { throw new Error("candidate ledger interrupted"); });
  await assert.rejects(f.service.propose(who, input, { formal_expires_at: thirty }), /candidate ledger interrupted/);
  fail.mock.restore(); await f.reopen();
  const held = await f.raw().candidates.list("project", "project-a");
  assert.equal(held.length, 1); assert.equal(held[0]!.meta.expires_at_ms, START + 14 * DAY);
  await assert.rejects(f.service.propose(who, input, { formal_expires_at: sixty }), { code: "memory.conflict" });
  await assert.rejects(f.service.propose(who, input, { formal_expires_at: null }), { code: "memory.conflict" });
  const repaired = await f.service.propose(who, input, { formal_expires_at: thirty });
  assert.equal(repaired.candidate_id, held[0]!.candidate_id);
  assert.equal(f.ledger.candidates(who.actor_id)[0]!.formal_expires_at, thirty);
  const marker = f.ledger.marker(who.actor_id, "memory-operation:proposal:propose")!;
  assert.deepEqual(Object.keys(marker.body as object).sort(), ["at", "expected_version", "formal_expires_at", "kind", "operation_id", "owner", "phase", "result", "scope"]);
  assert.equal(JSON.stringify(marker).includes(input.text), false, "the operation marker has no proposed body");
  assert.equal((await f.raw().candidates.list("project", "project-a")).length, 1);
});

test("the ordinary write gate preserves its formal expiry when an unverified statement waits for acceptance", async t => {
  const f = await fixture(t), expires = new Date(START + 30 * DAY).toISOString();
  const pending = await f.service.write(caller("write", { person: false, consumer: "assistant", current_scene: "assistant" }), {
    scope: "project", kind: "preference", text: "Prefer an evening meeting this month", said: "Prefer an evening meeting this month", expires_at: expires,
  }, { originals: ["Could we discuss a schedule?"] });
  assert.equal(pending.outcome, "candidate"); assert.equal(pending.memory, null);
  const accepted = await f.service.accept(caller("accept"), pending.candidate!.candidate_id, { expected_version: pending.candidate!.version });
  await f.reopen();
  const entry = (await f.raw().list("project", "project-a")).find(item => item.memory_id === accepted.memory!.memory_id)!;
  assert.equal(entry.meta.expires_at_ms, Date.parse(expires));
  assert.deepEqual(entry.meta.classification, { scenes: ["assistant"], lifecycle: "short-term" });
  assert.equal(entry.meta.basis, "inferred", "acceptance does not rewrite an inference into explicit evidence");
});

test("v2 rejects missing classification and older envelopes before any import writes", async t => {
  const f = await fixture(t);
  await f.service.write(caller("seed"), { scope: "personal", text: "Keep reports concise" });
  const pack = await f.service.exportScope(caller("export"), "personal");
  const { classification: _classification, ...legacy } = pack.entries[0]!;
  for (const invalid of [{ ...pack, version: 1 }, { ...pack, entries: [pack.entries[0]!, legacy] }]) {
    await assert.rejects(f.service.importScope(caller("invalid"), "project", invalid), { code: "memory.invalid" });
    assert.deepEqual(await f.raw().list("project", "project-a"), []);
  }
  const changed = { ...pack, entries: [pack.entries[0]!, { ...pack.entries[0]!, classification: { scenes: ["assistant"], lifecycle: "short-term" }, expires_at: new Date(START + DAY).toISOString() }] };
  assert.deepEqual(await f.service.importScope(caller("different-constraints"), "project", changed), { written: 2, skipped: 0, refused: 0 });
  assert.equal((await f.raw().list("project", "project-a")).length, 2, "same text with different lifecycle is not silently deduplicated");
});

test("importing an existing automatic value preserves repeated basis while the person adopts it", async t => {
  const f = await fixture(t), classification = { scenes: ["common"], lifecycle: "long-term" };
  const entry = await f.raw().write({ scope: "project", owner: "project-a", text: "Keep the release summary concise", origin: "Repeated request", operation_id: "seed",
    meta: { kind: "convention", source: "auto", basis: "repeated", approved_by: { by: "person" }, classification } });
  const pack = await f.service.exportScope(caller("export"), "project");
  assert.deepEqual(await f.service.importScope(caller("import"), "project", pack), { written: 0, skipped: 1, refused: 0 });
  await f.reopen();
  const current = (await f.raw().list("project", "project-a"))[0]!;
  assert.equal(current.memory_id, entry.memory_id); assert.equal(current.meta.source, "imported");
  assert.equal(current.meta.basis, "repeated");
  assert.deepEqual(await f.service.importScope(caller("import-again"), "project", pack), { written: 0, skipped: 1, refused: 0 });
  assert.equal((await f.raw().list("project", "project-a"))[0]!.version, current.version, "repeated import does not rewrite the adopted value");
});

test("a session-bound v2 entry retains its original Session and requires that trusted binding after restart", async t => {
  const f = await fixture(t);
  const session = await f.adapter.createSession({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", plugin_id: "io.molis.work.coding",
    install_id: "coding", workspace: "none", role_id: "coding", title: "Session retention" });
  const who = caller("session", { session_id: session.session_id, current_scene: "coding" });
  const session_ref = { kind: "session" as const, id: session.session_id, revision: 1 };
  await f.raw(who).write({ scope: "personal", owner: who.actor_id, text: "Use the session's working assumptions", origin: "Session note", operation_id: "session-seed",
    meta: { kind: "convention", source: "manual", basis: "explicit", approved_by: { by: "person" }, classification: { scenes: ["coding"], lifecycle: "session" }, session_ref } });
  const pack = await f.service.exportScope(who, "personal");
  assert.deepEqual(pack.entries[0]!.session_ref, session_ref);
  await f.reopen();
  await assert.rejects(f.service.importScope(caller("wrong-session"), "project", pack));
  assert.deepEqual(await f.raw().list("project", "project-a"), []);
  assert.deepEqual(await f.service.importScope({ ...who, operation_id: "right-session" }, "project", pack), { written: 1, skipped: 0, refused: 0 });
  await f.reopen();
  const entry = (await f.raw(who).list("project", "project-a"))[0]!;
  assert.deepEqual(entry.meta.session_ref, session_ref);
  assert.deepEqual(entry.meta.classification, { scenes: ["coding"], lifecycle: "session" });
});

test("merge undo recreates the removed canonical classification and retention snapshot after restart", async t => {
  const f = await fixture(t), expires = START + 30 * DAY;
  // Seed existing automatic records through the actual authorized backend; this does not test automatic promotion.
  const meta = { kind: "convention" as const, source: "auto" as const, basis: "repeated" as const, approved_by: { by: "person" as const },
    classification: { scenes: ["assistant"], lifecycle: "short-term" }, expires_at_ms: expires, namespace: "example.plugin" };
  const a = await f.raw().write({ scope: "project", owner: "project-a", text: "Keep release notes concise before launch", origin: "First evidence", meta, operation_id: "a" });
  t.mock.timers.setTime(START + 1);
  const b = await f.raw().write({ scope: "project", owner: "project-a", text: "Keep release notes concise after launch", origin: "Second evidence", meta, operation_id: "b" });
  // A raw SDK seed has no App history. Confirm the same content through the real public edit path,
  // which validates the current version and records the safe snapshot required by merge undo.
  for (const [index, entry] of [a, b].entries()) {
    const confirmed = await f.service.change(caller(`confirm-history-${index}`), {
      action: "update", memory_id: entry.memory_id, expected_version: entry.version, text: entry.text,
    });
    assert.ok(confirmed.memory);
    const current = (await f.raw().list("project", "project-a")).find(item => item.memory_id === entry.memory_id)!;
    assert.equal(current.version, confirmed.memory.version);
    assert.deepEqual(current.meta, entry.meta, "the confirmation keeps every canonical classification and retention fact");
    assert.equal(current.origin, entry.origin); assert.equal(current.text, entry.text);
  }
  const report = await f.service.upkeep(caller("merge"), { projects: ["project-a"], tidy: async () => ({ duplicates: [[a.memory_id, b.memory_id]], conflicts: [] }) });
  assert.equal(report.merged, 1);
  const change = f.service.changes(caller("changes")).find(item => item.kind === "merged")!;
  await f.reopen(); await f.service.undo(caller("undo-merge"), change.change_id); await f.reopen();
  const restored = (await f.raw().list("project", "project-a")).find(item => item.text === b.text)!;
  assert.notEqual(restored.memory_id, b.memory_id, "recreate retains the existing new-ref contract");
  assert.deepEqual(restored.meta.classification, meta.classification);
  assert.equal(restored.meta.namespace, meta.namespace); assert.equal(restored.meta.expires_at_ms, expires);
  assert.equal(restored.meta.basis, "repeated"); assert.equal(restored.origin, b.origin);
  assert.equal(f.ledger.change(change.change_id)!.state, "undone");
});
