import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { MemoryService, characterOwner, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";
import { currentMemoryOptions } from "./fixtures/current-memory.js";

const caller = (operation_id: string): MemoryCaller => ({ actor_id: "memory-owner", project_id: "project-a", consumer: "ui",
  current_scene: "coding", purpose: "management", person: true, operation_id });

test("MEM-20 candidate decisions retain the observed candidate version and replay the same discard", async t => {
  const setup = await fixture(t), env = await setup.open();
  const candidate = await env.service.propose(caller("proposal-cas"), { scope: "personal", text: "Prefer short summaries", kind: "preference",
    basis: "inferred", why: "One bounded observation", from: "gate" });
  await assert.rejects(env.service.discard(caller("stale-discard"), candidate.candidate_id, candidate.version + 1), { code: "memory.conflict" });
  await assert.rejects(env.service.accept(caller("stale-accept"), candidate.candidate_id, { expected_version: candidate.version + 1 }));
  assert.deepEqual((await env.raw.candidates.list("personal", "memory-owner")).map(item => [item.state, item.version]), [["pending", candidate.version]]);
  assert.deepEqual(await env.raw.list("personal", "memory-owner"), []);
  const acceptedVersion = candidate.version;
  const first = await env.service.discard(caller("discard-once"), candidate.candidate_id, acceptedVersion);
  const again = await env.service.discard(caller("discard-once"), candidate.candidate_id, acceptedVersion);
  assert.equal(first.candidate.state, "discarded");
  assert.equal(again.candidate.version, first.candidate.version);
  assert.equal((await env.raw.candidates.list("personal", "memory-owner"))[0]!.version, acceptedVersion + 1);
});

async function fixture(t: TestContext, character?: { project_id: string; owner: string }) {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-cas-"));
  const appId = "io.molis.work.memory-cas";
  let denied: string | undefined;
  let afterWrite: (() => Promise<void>) | undefined;
  const memory = currentMemoryOptions({ appId, scopesFor: who => [{ scope: "user", owner: who.actor_id },
    ...(who.project_id ? [{ scope: "project" as const, owner: who.project_id }] : []),
    ...(character && who.project_id === character.project_id ? [{ scope: "character" as const, owner: character.owner }] : [])],
    beforeAuthorize: async (_who, requests) => requests.every(request => request.action !== "delete" || request.target.ref.id !== denied) });
  const open = async () => {
    const adapter = await createPrologueNodeAdapter({ app: { appId, appVersion: "0.0.0" }, storageRoot: join(home, "sdk"),
      reviewQueue: new AgentReviewQueue(), memory, modelConfiguration: async () => null as never, resolveCredential: () => null });
    const ledger = openMemoryLedger({ homeDirectory: home });
    let closed = false;
    const close = async () => { if (closed) return; closed = true; ledger.close(); await adapter.close(); };
    t.after(close);
    const backend = prologueMemoryBackend(async () => adapter.memory!);
    const bind = backend.withCaller.bind(backend);
    backend.withCaller = who => {
      const bound = bind(who);
      return { ...bound, write: async input => { const result = await bound.write(input); await afterWrite?.(); return result; } };
    };
    const service = new MemoryService({ backend, ledger, timeZone: "Asia/Shanghai" });
    return { service, ledger, backend, raw: backend.withCaller(caller("raw-read")), close };
  };
  t.after(() => rm(home, { recursive: true, force: true }));
  return { open, denyDelete: (id?: string) => { denied = id; }, afterWrite: (hook?: () => Promise<void>) => { afterWrite = hook; } };
}

test("an SDK append survives ledger failure; the same original request repairs one history after restart without a body marker", async t => {
  const setup = await fixture(t); let env = await setup.open();
  const who = caller("append-a"), input = { scope: "personal" as const, text: "Prefer short release notes", kind: "preference" as const };
  const fail = t.mock.method(env.ledger, "addRevision", () => { throw new Error("ledger interrupted"); });
  await assert.rejects(env.service.write(who, input), /ledger interrupted/);
  const original = (await env.raw.list("personal", who.actor_id))[0]!;
  assert.equal(original.version, 1);
  assert.deepEqual(env.ledger.revisions(original.memory_id), []);
  for (const key of ["write", "commit", "append"]) {
    const body = JSON.stringify(env.ledger.marker(who.actor_id, `memory-operation:append-a:${key}`));
    assert.equal(body.includes(input.text), false); assert.equal(body.includes('"meta"'), false);
  }
  fail.mock.restore(); await env.close(); env = await setup.open();
  try {
    const recovered = await env.service.write(who, input);
    assert.equal(recovered.memory!.memory_id, original.memory_id);
    assert.equal((await env.raw.list("personal", who.actor_id)).length, 1);
    assert.equal(env.ledger.revisions(original.memory_id).length, 1);
    assert.equal(env.ledger.changesOf(original.memory_id).length, 1);
    await assert.rejects(env.service.write(who, { ...input, text: "Changed original command" }));
    assert.equal((await env.raw.list("personal", who.actor_id))[0]!.text, input.text);
  } finally { await env.close(); }
});

test("text and metadata update is one CAS; ledger repair replays its old version and never overwrites a later editor", async t => {
  const setup = await fixture(t), env = await setup.open();
  try {
    const saved = await env.service.write(caller("seed"), { scope: "personal", text: "Use brief notes", kind: "preference" });
    const id = saved.memory!.memory_id, who = caller("edit-a");
    const request = { action: "update" as const, memory_id: id, expected_version: 1, text: "Use numbered release notes", kind: "convention" as const, applies: { task: "release" } };
    const fail = t.mock.method(env.ledger, "addRevision", () => { throw new Error("ledger interrupted"); });
    await assert.rejects(env.service.change(who, request), /ledger interrupted/);
    const current = (await env.raw.list("personal", who.actor_id))[0]!;
    assert.equal(current.version, 2); assert.equal(current.meta.kind, "convention"); assert.equal(current.text, request.text);
    fail.mock.restore();
    assert.equal((await env.service.change(who, request)).memory!.version, 2);
    assert.deepEqual(env.ledger.revisions(id).map(row => row.version), [1, 2]);
    await env.service.change(caller("edit-b"), { action: "update", memory_id: id, expected_version: 2, text: "A newer human edit" });
    await assert.rejects(env.service.change(who, request));
    assert.equal((await env.raw.list("personal", who.actor_id))[0]!.text, "A newer human edit");
    assert.equal(env.ledger.revisions(id).find(row => row.version === 2)!.text, request.text);
  } finally { await env.close(); }
});

test("accepting a correction uses candidate and target CAS together; a ledger failure repairs the existing accepted decision", async t => {
  const setup = await fixture(t); let env = await setup.open();
  const saved = await env.service.write(caller("seed"), { scope: "personal", text: "Prefer summaries at noon", kind: "preference" });
  const proposed = await env.service.propose(caller("proposal"), { scope: "personal", text: "Prefer summaries in the evening", kind: "preference",
    basis: "explicit", why: "The person corrected the time", from: "extraction", supersedes: saved.memory!.memory_id });
  const who = caller("accept-a"), fail = t.mock.method(env.ledger, "addRevision", () => { throw new Error("ledger interrupted"); });
  await assert.rejects(env.service.accept(who, proposed.candidate_id, { expected_version: proposed.version }), /ledger interrupted/);
  const actual = (await env.raw.candidates.list("personal", who.actor_id))[0]!;
  assert.equal(actual.state, "accepted"); assert.equal(actual.version, proposed.version + 1);
  assert.equal((await env.raw.list("personal", who.actor_id))[0]!.version, 2);
  fail.mock.restore(); await env.close(); env = await setup.open();
  try {
    const result = await env.service.accept(who, proposed.candidate_id, { expected_version: proposed.version });
    assert.equal(result.memory!.version, 2); assert.equal(result.candidate.version, actual.version);
    assert.deepEqual(env.ledger.revisions(saved.memory!.memory_id).map(row => row.version), [1, 2]);
    assert.equal((await env.raw.list("personal", who.actor_id)).length, 1);
  } finally { await env.close(); }
});

test("clear returns partial results and retries its fixed preview; a later entry is not silently included", async t => {
  const setup = await fixture(t), env = await setup.open();
  try {
    const one = await env.service.write(caller("seed-a"), { scope: "personal", text: "Prefer concise notes", kind: "preference" });
    const two = await env.service.write(caller("seed-b"), { scope: "personal", text: "Prefer numbered headings", kind: "preference" });
    const preview = await env.service.previewScope(caller("preview"), "personal");
    setup.denyDelete(two.memory!.memory_id);
    const partial = await env.service.clearScope(caller("clear"), "personal", preview.fingerprint);
    assert.equal(partial.complete, false); assert.equal(partial.removed, 1);
    assert.equal(env.ledger.revisions(one.memory!.memory_id).length, 0);
    assert.equal(env.ledger.revisions(two.memory!.memory_id).length, 1);
    const later = await env.service.write(caller("seed-c"), { scope: "personal", text: "Prefer Sunday planning", kind: "preference" });
    setup.denyDelete();
    const done = await env.service.clearScope(caller("clear"), "personal", preview.fingerprint);
    assert.equal(done.complete, true);
    assert.deepEqual((await env.raw.list("personal", caller("read").actor_id)).map(row => row.memory_id), [later.memory!.memory_id]);
  } finally { await env.close(); }
});

test("a project clear stops later Character parts after an unknown receipt and retries only the fixed decision", async t => {
  const character = { id: "character:project-a:writer", title: "Writer" }, owner = characterOwner("project-a", character.id);
  const setup = await fixture(t, { project_id: "project-a", owner }), env = await setup.open();
  try {
    const project = (await env.service.write(caller("project-seed"), { scope: "project", text: "Prefer concise release notes", kind: "preference" })).memory!;
    const characterMemory = (await env.service.write({ ...caller("character-seed"), character }, { scope: "character", text: "Prefer numbered examples", kind: "preference" })).memory!;
    const preview = await env.service.previewScope(caller("preview"), "project");
    assert.equal(preview.count, 2);
    const calls: Array<Parameters<typeof env.raw.clearScope>[0]> = [];
    const receipts: Array<Awaited<ReturnType<typeof env.raw.clearScope>>> = [];
    const bind = env.backend.withCaller.bind(env.backend);
    t.mock.method(env.backend, "withCaller", (who: MemoryCaller) => {
      const bound = bind(who);
      return { ...bound, clearScope: async (input: Parameters<typeof bound.clearScope>[0]) => {
        calls.push(structuredClone(input));
        const result = await bound.clearScope(input); receipts.push(result);
        // The real SDK purge commits; only its first reply is lost at the App boundary.
        return calls.length === 1 ? { items: result.items.map(item => ({ memory_id: item.memory_id, outcome: "unknown" as const })) } : result;
      } };
    });
    const partial = await env.service.clearScope(caller("clear"), "project", preview.fingerprint);
    assert.deepEqual(calls.map(call => call.scope), ["project"], "an unknown project receipt must prevent dispatch to the Character scope");
    assert.deepEqual(partial, { removed: 0, complete: false, items: [
      { memory_id: project.memory_id, outcome: "unknown" }, { memory_id: characterMemory.memory_id, outcome: "not-executed" },
    ] });
    assert.deepEqual(await env.raw.list("project", "project-a"), [], "the lost receipt does not undo the committed SDK purge");
    assert.deepEqual((await env.raw.list("character", owner)).map(item => item.memory_id), [characterMemory.memory_id]);
    assert.equal(env.ledger.revisions(project.memory_id).length, 1, "unknown is not proof to clear history");
    assert.equal(env.ledger.revisions(characterMemory.memory_id).length, 1);
    const done = await env.service.clearScope(caller("clear"), "project", preview.fingerprint);
    assert.deepEqual(calls.map(call => call.scope), ["project", "project", "character"]);
    assert.deepEqual(calls[1], calls[0], "retry preserves every original project target, version and operation");
    assert.equal(receipts[0]!.items[0]!.outcome, "completed");
    assert.equal(receipts[1]!.items[0]!.outcome, "already-absent", "the already committed purge is reconciled, not committed twice");
    assert.deepEqual(done, { removed: 2, complete: true, items: [
      { memory_id: project.memory_id, outcome: "already-absent" }, { memory_id: characterMemory.memory_id, outcome: "completed" },
    ] });
    assert.deepEqual(await env.raw.list("character", owner), []);
    assert.deepEqual(env.ledger.revisions(project.memory_id), []); assert.deepEqual(env.ledger.revisions(characterMemory.memory_id), []);
  } finally { await env.close(); }
});

test("cancellation creates no marker, and a purged operation cannot reintroduce body or history", async t => {
  const setup = await fixture(t), env = await setup.open();
  try {
    const controller = new AbortController(); controller.abort();
    await assert.rejects(env.service.write({ ...caller("cancelled"), signal: controller.signal }, { scope: "personal", text: "Cancelled preference" }));
    assert.equal(env.ledger.marker("memory-owner", "memory-operation:cancelled:commit"), null);
    const request = { scope: "personal" as const, text: "A preference to forget" };
    const saved = await env.service.write(caller("save"), request);
    const fail = t.mock.method(env.ledger, "forget", () => { throw new Error("forget ledger interrupted"); });
    await assert.rejects(env.service.change(caller("delete"), { action: "remove", memory_id: saved.memory!.memory_id, expected_version: 1 }), /forget ledger interrupted/);
    fail.mock.restore();
    await env.service.change(caller("delete"), { action: "remove", memory_id: saved.memory!.memory_id, expected_version: 1 });
    await assert.rejects(env.service.write(caller("save"), request));
    assert.deepEqual(await env.raw.list("personal", "memory-owner"), []);
    assert.deepEqual(env.ledger.revisions(saved.memory!.memory_id), []);
  } finally { await env.close(); }
});

test("accepted-create replay cannot relabel a later edit as the original accepted history", async t => {
  const setup = await fixture(t), env = await setup.open();
  try {
    const proposal = await env.service.propose(caller("suggest"), { scope: "personal", text: "Prefer release summaries", kind: "preference", basis: "explicit", why: "The person asked", from: "extraction" });
    const accepted = await env.service.accept(caller("accept"), proposal.candidate_id, { expected_version: proposal.version });
    await env.service.change(caller("later-edit"), { action: "update", memory_id: accepted.memory!.memory_id, expected_version: 1, text: "Prefer detailed release summaries" });
    const before = env.ledger.revisions(accepted.memory!.memory_id);
    await env.service.accept(caller("accept"), proposal.candidate_id, { expected_version: proposal.version }).catch(error => {
      assert.match(String((error as { code?: string }).code), /CONFLICT|conflict/);
    });
    assert.deepEqual(env.ledger.revisions(accepted.memory!.memory_id), before);
    assert.equal((await env.raw.list("personal", "memory-owner"))[0]!.text, "Prefer detailed release summaries");
  } finally { await env.close(); }
});

test("undo refuses a newer formal version instead of rebasing an old assistant decision", async t => {
  const setup = await fixture(t), env = await setup.open();
  try {
    const first = await env.service.write(caller("seed"), { scope: "personal", text: "Prefer compact headings", kind: "preference" });
    const disabled = await env.service.change({ ...caller("disable"), person: false }, { action: "disable", memory_id: first.memory!.memory_id, expected_version: 1 });
    assert.equal(disabled.change.undoable, true);
    const held = (await env.raw.list("personal", "memory-owner"))[0]!;
    await env.raw.update({ scope: "personal", owner: "memory-owner", memory_id: held.memory_id, expected_version: held.version,
      operation_id: "outside-editor", change: { text: "Newer heading instruction", meta: held.meta } });
    await assert.rejects(env.service.undo(caller("undo"), disabled.change.change_id), /变化|版本|冲突/);
    const latest = (await env.raw.list("personal", "memory-owner"))[0]!;
    assert.equal(latest.version, held.version + 1); assert.ok(latest.disabled);
  } finally { await env.close(); }
});

test("restore preserves the historical metadata snapshot and repairs ledger failure with the original CAS", async t => {
  const setup = await fixture(t), env = await setup.open();
  try {
    const saved = await env.service.write(caller("seed"), { scope: "personal", text: "Original preference", kind: "preference", applies: { task: "release" } });
    const id = saved.memory!.memory_id, initial = (await env.raw.list("personal", "memory-owner"))[0]!;
    await env.service.change(caller("edit"), { action: "update", memory_id: id, expected_version: 1, text: "New convention", kind: "convention", applies: { task: "review" } });
    const who = caller("restore"), input = { action: "restore" as const, memory_id: id, expected_version: 2, version: 1 };
    const fail = t.mock.method(env.ledger, "addRevision", () => { throw new Error("history interrupted"); });
    await assert.rejects(env.service.change(who, input), /history interrupted/); fail.mock.restore();
    const result = await env.service.change(who, input);
    assert.equal(result.memory!.version, 3); assert.equal(result.memory!.text, initial.text);
    assert.deepEqual((await env.raw.list("personal", "memory-owner"))[0]!.meta, initial.meta);
    assert.deepEqual(env.ledger.revisions(id).map(item => item.version), [1, 2, 3]);
  } finally { await env.close(); }
});

test("state changes replay their same CAS after projection failure and a normal undo restores the approved version", async t => {
  const setup = await fixture(t), env = await setup.open();
  try {
    const saved = await env.service.write(caller("seed"), { scope: "personal", text: "Prefer concise examples", kind: "preference" });
    const who = { ...caller("disable"), person: false }, request = { action: "disable" as const, memory_id: saved.memory!.memory_id, expected_version: 1 };
    const fail = t.mock.method(env.ledger, "saveChange", () => { throw new Error("change interrupted"); });
    await assert.rejects(env.service.change(who, request), /change interrupted/); fail.mock.restore();
    const result = await env.service.change(who, request);
    assert.equal(result.memory!.version, 2); assert.equal(result.memory!.state, "disabled");
    await env.service.undo(caller("undo"), result.change.change_id);
    const restored = (await env.raw.list("personal", "memory-owner"))[0]!;
    assert.equal(restored.version, 3); assert.equal(restored.disabled, undefined);
    assert.equal((await env.service.undo(caller("undo"), result.change.change_id)).change.state, "undone");
    assert.equal((await env.raw.list("personal", "memory-owner"))[0]!.version, 3);
  } finally { await env.close(); }
});

test("import keeps committed entries after a later ledger failure and original-request retry adds neither duplicates nor false history", async t => {
  const setup = await fixture(t), env = await setup.open();
  try {
    const entry = (text: string) => ({ text, kind: "preference", source: "manual", basis: "explicit", applies: {}, origin: "a portable preference", expires_at: null, classification: { scenes: ["coding"], lifecycle: "long-term" } });
    const pack = { format: "molis.memory", version: 2, exported_at: "2026-10-23T00:00:00.000Z", scope: "personal", entries: [entry("Prefer short summaries"), entry("Prefer numbered examples")], redactions: [] };
    const original = env.ledger.addRevision.bind(env.ledger); let writes = 0;
    const fail = t.mock.method(env.ledger, "addRevision", (...args: Parameters<typeof env.ledger.addRevision>) => {
      if (++writes === 2) throw new Error("second history interrupted");
      return original(...args);
    });
    await assert.rejects(env.service.importScope(caller("import"), "personal", pack), error => {
      const failure = error as { code?: string; details?: Record<string, unknown> };
      assert.equal(failure.code, "memory.conflict"); assert.equal(failure.details?.failed_index, 1);
      assert.equal((failure.details?.completed_memory_ids as string[]).length, 1);
      assert.equal(failure.details?.failed_outcome, "unknown");
      assert.equal(JSON.stringify(failure.details).includes("Prefer"), false);
      return true;
    }); fail.mock.restore();
    assert.equal((await env.raw.list("personal", "memory-owner")).length, 2);
    await env.service.importScope(caller("import"), "personal", pack);
    const items = await env.raw.list("personal", "memory-owner");
    assert.equal(items.length, 2);
    for (const item of items) assert.equal(env.ledger.revisions(item.memory_id).length, 1);
    const exported = await env.service.exportScope(caller("export"), "personal");
    assert.deepEqual(exported.entries.map(item => item.text).sort(), pack.entries.map(item => item.text).sort());
  } finally { await env.close(); }
});

test("an append receipt arriving after an observed deletion cannot restore history or recent-change contents", async t => {
  const setup = await fixture(t); let env = await setup.open();
  let reached!: () => void, release!: () => void;
  const committed = new Promise<void>(resolve => { reached = resolve; });
  const barrier = new Promise<void>(resolve => { release = resolve; });
  setup.afterWrite(async () => { reached(); await barrier; });
  try {
    const pending = env.service.write(caller("late-create"), { scope: "personal", text: "A later-forgotten preference", kind: "preference" });
    await committed;
    const held = (await env.raw.list("personal", "memory-owner"))[0]!;
    await env.service.change(caller("delete-during-receipt"), { action: "remove", memory_id: held.memory_id, expected_version: held.version });
    release();
    await assert.rejects(pending, /删除|关闭|清除|冲突/);
    assert.deepEqual(env.ledger.revisions(held.memory_id), []);
    assert.equal(JSON.stringify(env.ledger.changesOf(held.memory_id)).includes("A later-forgotten preference"), false);
    env.ledger.forgetScopes({ scopes: [{ scope: "personal", owner: "memory-owner" }], project_id: "project-a", prefs_keys: [], signal_prefixes: [], marker_keys: [`memory-forgotten:${held.memory_id}`] });
    await env.close(); env = await setup.open(); setup.afterWrite();
    await assert.rejects(env.service.write(caller("late-create"), { scope: "personal", text: "A later-forgotten preference", kind: "preference" }));
    assert.throws(() => env.ledger.addRevision(held.memory_id, { version: 1, text: "A later-forgotten preference", kind: "preference", applies: {}, change: "created", by: "person", at: "2026-10-23T00:00:00Z" }), /已经删除/);
    assert.deepEqual(env.ledger.revisions(held.memory_id), []);
  } finally { release(); await env.close(); }
});
