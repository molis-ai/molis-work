import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { MemoryService, memoryErrors, characterOwner, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";
import type { MemoryExportPackage } from "@molis-ai/molis-work-contracts/services/memory";
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

async function fixture(t: TestContext, character?: { project_id: string; owner: string; additionalOwners?: string[] }, plugin?: string, formedKinds = false) {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-cas-"));
  const appId = "io.molis.work.memory-cas";
  let denied: string | undefined;
  let afterWrite: (() => Promise<void>) | undefined;
  let afterUpdate: (() => Promise<void>) | undefined;
  let beforeUpdate: (() => Promise<void>) | undefined;
  let beforeEffect: (() => Promise<void>) | undefined;
  let afterCandidatePurge: (() => Promise<void>) | undefined;
  let afterCandidateList: (() => Promise<void>) | undefined;
  let afterRemove: (() => void) | undefined;
  let authorized = true;
  const memory = currentMemoryOptions({ appId, scopesFor: who => [{ scope: "user", owner: who.actor_id },
    ...(who.project_id ? [{ scope: "project" as const, owner: who.project_id }] : []),
    ...(character && who.project_id === character.project_id ? [character.owner, ...character.additionalOwners ?? []].map(owner => ({ scope: "character" as const, owner })) : [])],
    allowed: () => authorized,
    beforeAuthorize: async (_who, requests) => requests.every(request => request.action !== "delete" || request.target.ref.id !== denied) });
  if (formedKinds) memory.policy = { ...memory.policy!, taxonomy: { ...memory.policy!.taxonomy,
    kinds: { ...memory.policy!.taxonomy.kinds, values: [...memory.policy!.taxonomy.kinds.values, { id: "fact", label: "Fact" }, { id: "experience", label: "Experience" }] } } };
  if (plugin) {
    const original = { ...memory };
    const identity = (who: Parameters<NonNullable<typeof memory.authorize>>[0]) => authorized && who.actor_id === "memory-owner"
      && who.consumer === "plugin" && who.plugin_id === plugin && who.current_scene === "coding" && who.purpose === "management";
    const scope = (who: Parameters<typeof identity>[0], target: { scope: string; owner: string }) => target.scope === "user" && target.owner === who.actor_id
      || target.scope === "project" && target.owner === who.project_id;
    memory.authorize = async (who, requests) => who.consumer !== "plugin" ? original.authorize!(who, requests) : identity(who)
      && requests.every(request => request.appId === appId && scope(who, request.target) && request.target.namespace === plugin
        && request.context.consumer === who.consumer && request.context.currentScene === who.current_scene && request.context.purpose === who.purpose
        && (request.action !== "delete" || request.target.ref.id !== denied));
    memory.authorizeManagement = async (who, request) => who.consumer !== "plugin" ? original.authorizeManagement!(who, request)
      : { allowed: identity(who) && request.appId === appId && scope(who, request) && (request.filter.namespace === undefined || request.filter.namespace === plugin) };
    memory.authorizeRecall = async (who, request) => who.consumer !== "plugin" ? original.authorizeRecall!(who, request)
      : { allowed: identity(who) && request.appId === appId && request.scopes.every(target => scope(who, target)) && (request.filter.namespace === undefined || request.filter.namespace === plugin) };
    // The person can manage the same explicitly allowed plugin namespace.
    const authorize = memory.authorize;
    memory.authorize = async (who, requests) => who.consumer === "ui" && requests.some(request => request.target.namespace === plugin)
      ? authorized && who.actor_id === "memory-owner" && who.person === true && who.current_scene === "coding" && who.purpose === "management"
        && requests.every(request => request.appId === appId && scope(who, request.target) && (request.target.namespace === undefined || request.target.namespace === plugin)
          && (request.action !== "delete" || request.target.ref.id !== denied))
      : authorize(who, requests);
  }
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
      return { ...bound, write: async input => { const result = await bound.write(input); await afterWrite?.(); return result; },
        update: async input => { await beforeUpdate?.(); const result = await bound.update(input); await afterUpdate?.(); return result; },
        remove: async input => { await bound.remove(input); afterRemove?.(); },
        candidates: { ...bound.candidates, list: async (...args) => { const result = await bound.candidates.list(...args); await afterCandidateList?.(); return result; }, purge: async input => { await bound.candidates.purge(input); await afterCandidatePurge?.(); } } };
    };
    // SDK grants and App ledger authority are separate boundaries, governed by the same current test grant.
    const service = new MemoryService({ backend, ledger, timeZone: "Asia/Shanghai", beforeEffect: async () => {
      await beforeEffect?.();
      if (!authorized) throw new Error("fixture App ledger authority revoked");
    } });
    return { service, ledger, backend, raw: backend.withCaller(caller("raw-read")), close };
  };
  t.after(() => rm(home, { recursive: true, force: true }));
  return { open, beforeUpdate: (hook?: () => Promise<void>) => { beforeUpdate = hook; }, beforeEffect: (hook?: () => Promise<void>) => { beforeEffect = hook; }, afterUpdate: (hook?: () => Promise<void>) => { afterUpdate = hook; }, denyDelete: (id?: string) => { denied = id; }, afterWrite: (hook?: () => Promise<void>) => { afterWrite = hook; },
    afterCandidatePurge: (hook?: () => Promise<void>) => { afterCandidatePurge = hook; }, afterCandidateList: (hook?: () => Promise<void>) => { afterCandidateList = hook; },
    afterRemove: (hook?: () => void) => { afterRemove = hook; }, authorize: (allowed: boolean) => { authorized = allowed; } };
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
  const setup = await fixture(t); let env = await setup.open();
  try {
    const controller = new AbortController(); controller.abort();
    await assert.rejects(env.service.write({ ...caller("cancelled"), signal: controller.signal }, { scope: "personal", text: "Cancelled preference" }));
    assert.equal(env.ledger.marker("memory-owner", "memory-operation:cancelled:commit"), null);
    const request = { scope: "personal" as const, text: "A preference to forget" };
    const saved = await env.service.write(caller("save"), request);
    const fail = t.mock.method(env.ledger, "forget", () => { throw new Error("forget ledger interrupted"); });
    await assert.rejects(env.service.change(caller("delete"), { action: "remove", memory_id: saved.memory!.memory_id, expected_version: 1 }), /forget ledger interrupted/);
    fail.mock.restore();
    assert.deepEqual(await env.raw.list("personal", "memory-owner"), []);
    assert.equal(env.ledger.revisions(saved.memory!.memory_id).length, 1, "the SDK committed before ledger cleanup");
    await env.close(); env = await setup.open();
    await env.service.change(caller("delete"), { action: "remove", memory_id: saved.memory!.memory_id, expected_version: 1 });
    await assert.rejects(env.service.write(caller("save"), request));
    assert.deepEqual(await env.raw.list("personal", "memory-owner"), []);
    assert.deepEqual(env.ledger.revisions(saved.memory!.memory_id), []);
  } finally { await env.close(); }
});

for (const interrupted of ["candidate-response", "candidate-projection"] as const) for (const edited of [false, true])
  test(`a delete interrupted at ${interrupted} retains its original CAS after restart${edited ? " and refuses a newer edit" : " and completes the same version"}`, async t => {
    const setup = await fixture(t); let env = await setup.open();
    try {
      const saved = await env.service.write(caller("seed"), { scope: "personal", text: "Original release preference", kind: "preference" });
      const id = saved.memory!.memory_id, who = caller("delete-original");
      const proposal = await env.service.propose(caller("replacement"), { scope: "personal", text: "Suggested release correction", kind: "preference",
        basis: "explicit", why: "A correction awaiting acceptance", from: "extraction", supersedes: id });
      const request = { action: "remove" as const, memory_id: id, expected_version: saved.memory!.version };
      const fail = () => { throw new Error("candidate cleanup interrupted"); };
      const projection = interrupted === "candidate-projection" ? t.mock.method(env.ledger, "dropCandidate", fail) : undefined;
      if (interrupted === "candidate-response") setup.afterCandidatePurge(async () => fail());
      await assert.rejects(env.service.change(who, request), /candidate cleanup interrupted/);
      setup.afterCandidatePurge(); projection?.mock.restore();
      assert.equal((await env.raw.list("personal", who.actor_id))[0]!.version, 1);
      assert.deepEqual(await env.raw.candidates.list("personal", who.actor_id), [], "the related SDK candidate purge actually committed");
      assert.ok(env.ledger.candidates(who.actor_id).some(item => item.candidate_id === proposal.candidate_id), "the interrupted ledger projection still needs repair");
      const purgeKey = `memory-operation:${who.operation_id}:purge:${id}`;
      assert.equal((env.ledger.marker(who.actor_id, purgeKey)!.body as { expected_version: number }).expected_version, 1);
      if (edited) await env.service.change(caller("external-editor"), { action: "update", memory_id: id, expected_version: 1, text: "The newer human edit must survive" });
      const before = { formal: await env.raw.list("personal", who.actor_id), revisions: env.ledger.revisions(id), changes: env.ledger.changesOf(id) };
      await env.close(); env = await setup.open();
      assert.deepEqual(await env.raw.candidates.list("personal", who.actor_id), []);
      assert.ok(env.ledger.candidates(who.actor_id).some(item => item.candidate_id === proposal.candidate_id), "the incomplete projection survives restart");
      if (edited) {
        await assert.rejects(env.service.change(who, request), { code: "agent.memory_conflict" });
        assert.deepEqual(await env.raw.list("personal", who.actor_id), before.formal);
        assert.deepEqual(env.ledger.revisions(id), before.revisions);
        assert.deepEqual(env.ledger.changesOf(id), before.changes);
      } else {
        const completed = await env.service.change(who, request);
        assert.equal(completed.memory, null);
        assert.equal((await env.service.change(who, request)).change.change_id, completed.change.change_id);
        assert.deepEqual(await env.raw.list("personal", who.actor_id), []);
        assert.deepEqual(env.ledger.revisions(id), []);
        assert.equal(env.ledger.changesOf(id).filter(item => item.kind === "removed").length, 1);
      }
      assert.deepEqual(await env.raw.candidates.list("personal", who.actor_id), []);
      assert.deepEqual(env.ledger.candidates(who.actor_id), [], "the original candidate purge receipt repairs the missing projection even when the formal delete conflicts");
      assert.equal((env.ledger.marker(who.actor_id, purgeKey)!.body as { expected_version: number }).expected_version, 1);
    } finally { await env.close(); }
  });

test("a legacy purge marker that rebased the original delete refuses replay after authorization returns and restart", async t => {
  const setup = await fixture(t); let env = await setup.open();
  try {
    const saved = await env.service.write(caller("seed"), { scope: "personal", text: "Original release preference", kind: "preference" });
    const id = saved.memory!.memory_id, who = caller("legacy-delete"), request = { action: "remove" as const, memory_id: id, expected_version: 1 };
    await env.service.propose(caller("replacement"), { scope: "personal", text: "Suggested release correction", kind: "preference",
      basis: "explicit", why: "A correction awaiting acceptance", from: "extraction", supersedes: id });
    setup.afterCandidatePurge(async () => { throw new Error("candidate purge response lost"); });
    await assert.rejects(env.service.change(who, request), /candidate purge response lost/);
    setup.afterCandidatePurge();
    await env.service.change(caller("external-editor"), { action: "update", memory_id: id, expected_version: 1, text: "The newer human edit must survive" });
    const key = `memory-operation:${who.operation_id}:purge:${id}`, original = env.ledger.marker(who.actor_id, key)!;
    // Persisted upgrade fixture: c416 creates this v2 condition before a denied SDK purge, while change still confirms v1.
    const legacy = { ...(original.body as { operation_id: string }), expected_version: 2 };
    env.ledger.setMarker(who.actor_id, key, legacy, original.at);
    setup.denyDelete(id);
    await assert.rejects(env.raw.remove({ scope: "personal", owner: who.actor_id, memory_id: id, expected_version: 2, operation_id: legacy.operation_id }), { code: "MEMORY_SCOPE_DENIED" });
    const before = { formal: await env.raw.list("personal", who.actor_id), revisions: env.ledger.revisions(id), changes: env.ledger.changesOf(id),
      candidateNotes: env.ledger.candidates(who.actor_id), marker: env.ledger.marker(who.actor_id, key),
      changeMarker: env.ledger.marker(who.actor_id, `memory-operation:${who.operation_id}:change:${id}`) };
    await env.close(); setup.denyDelete(); env = await setup.open();
    await assert.rejects(env.service.change(who, request), { code: "memory.conflict" });
    assert.deepEqual(await env.raw.list("personal", who.actor_id), before.formal);
    assert.deepEqual(env.ledger.revisions(id), before.revisions);
    assert.deepEqual(env.ledger.changesOf(id), before.changes);
    assert.deepEqual(env.ledger.candidates(who.actor_id), before.candidateNotes, "inconsistent formal identity is refused before further cleanup");
    assert.deepEqual(env.ledger.marker(who.actor_id, key), before.marker);
    assert.deepEqual(env.ledger.marker(who.actor_id, `memory-operation:${who.operation_id}:change:${id}`), before.changeMarker);
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


for (const kind of ["undo", "move"] as const) for (const originalTargetReceipt of kind === "move" ? [true, false] : [true])
  test(`${kind} finishes source ledger cleanup after SDK purge and restart${originalTargetReceipt ? "" : " using the original SDK creation"}`, async t => {
    const plugin = "io.example.memory-cas", setup = await fixture(t, undefined, plugin); let env = await setup.open();
    const seed = kind === "undo" ? { ...caller("seed-plugin"), consumer: "plugin" as const, plugin_id: plugin, person: false } : caller("seed-move");
    const saved = await env.service.write(seed, { scope: "personal", text: "Keep release conventions concise", kind: "convention" });
    const id = saved.memory!.memory_id, who = caller(`${kind}-cleanup`);
    await env.service.recall(seed, { scopes: ["personal"], query: "release conventions" }, { readMode: "explicit" });
    assert.equal(env.ledger.revisions(id).length, 1); assert.equal(env.ledger.uses({ memory_id: id }).length, 1);
    const request = { action: "move" as const, memory_id: id, expected_version: 1, to: "project" as const };
    const invoke = (actor = who) => kind === "undo" ? env.service.undo(actor, saved.change_id!) : env.service.change(actor, request);
    const failure = t.mock.method(env.ledger, "forget", () => { throw new Error("ledger forget interrupted"); });
    await assert.rejects(invoke(), /ledger forget interrupted/); failure.mock.restore();
    assert.deepEqual(await env.raw.list("personal", who.actor_id), []);
    const target = kind === "move" ? (await env.raw.list("project", "project-a"))[0]! : undefined;
    const targetHistory = target ? env.ledger.revisions(target.memory_id) : [];
    if (kind === "move" && !originalTargetReceipt) {
      // c416 wrote the target and its revision before purge, but left move-create pending without result.
      const key = `memory-operation:${who.operation_id}:move-create`, marker = env.ledger.marker(who.actor_id, key)!;
      const { result: _result, ...body } = marker.body as Record<string, unknown>;
      env.ledger.setMarker(who.actor_id, key, { ...body, phase: "pending" }, marker.at);
    }
    await env.close(); env = await setup.open();
    const sourceHistory = env.ledger.revisions(id), sourceUses = env.ledger.uses({ memory_id: id }), sourceChanges = env.ledger.changesOf(id);
    setup.authorize(false);
    await assert.rejects(invoke());
    assert.deepEqual(env.ledger.revisions(id), sourceHistory); assert.deepEqual(env.ledger.uses({ memory_id: id }), sourceUses);
    assert.deepEqual(env.ledger.changesOf(id), sourceChanges);
    setup.authorize(true);
    const cancelled = new AbortController(); setup.afterRemove(() => cancelled.abort());
    await assert.rejects(invoke({ ...who, signal: cancelled.signal })); setup.afterRemove();
    assert.deepEqual(env.ledger.revisions(id), sourceHistory); assert.deepEqual(env.ledger.uses({ memory_id: id }), sourceUses);
    assert.deepEqual(env.ledger.changesOf(id), sourceChanges);
    const result = await invoke();
    assert.deepEqual(env.ledger.revisions(id), []); assert.deepEqual(env.ledger.uses({ memory_id: id }), []);
    assert.ok(env.ledger.changesOf(id).every(change => change.text === ""));
    assert.deepEqual(await invoke(), result, "the original completed operation remains repeatable after markers close");
    if (kind === "undo") assert.equal(env.ledger.change(saved.change_id!)!.state, "undone");
    else {
      assert.deepEqual(await env.raw.list("project", "project-a"), [target]);
      assert.deepEqual(env.ledger.revisions(target!.memory_id), targetHistory);
      assert.equal(env.ledger.changesOf(target!.memory_id).filter(change => change.kind === "moved").length, 1);
    }
  });

for (const action of ["remove", "move", "undo"] as const)
  test(`a missing ${action} target cannot reuse project A's cleanup marker from project B`, async t => {
    const plugin = "io.example.memory-cas", setup = await fixture(t, undefined, plugin); let env = await setup.open();
    const seed = action === "undo" ? { ...caller("project-seed"), consumer: "plugin" as const, plugin_id: plugin, person: false } : caller("project-seed");
    const saved = await env.service.write(seed, { scope: "project", text: "Project A release convention", kind: "convention" });
    const id = saved.memory!.memory_id, who = caller(`${action}-project-original`);
    const invoke = (actor = who) => action === "undo" ? env.service.undo(actor, saved.change_id!)
      : env.service.change(actor, { action, memory_id: id, expected_version: 1, ...(action === "move" ? { to: "personal" as const } : {}) });
    if (action === "undo") {
      await assert.rejects(invoke({ ...who, project_id: "project-b" }), { code: "memory.scope" });
      assert.equal((await env.raw.list("project", "project-a"))[0]!.version, 1, "a still-present source cannot be reached through undo's holder");
      assert.equal(env.ledger.marker(who.actor_id, `memory-operation:${who.operation_id}:undo:${saved.change_id}`), null);
    }
    const failure = t.mock.method(env.ledger, "forget", () => { throw new Error("ledger forget interrupted"); });
    await assert.rejects(invoke(), /ledger forget interrupted/); failure.mock.restore();
    await env.close(); env = await setup.open();
    const revisions = env.ledger.revisions(id), changes = env.ledger.changesOf(id);
    const marker = env.ledger.marker(who.actor_id, `memory-operation:${who.operation_id}:purge:${id}`);
    const forget = t.mock.method(env.ledger, "forget");
    await assert.rejects(invoke({ ...who, project_id: "project-b" }), { code: "memory.scope" });
    assert.equal(forget.mock.callCount(), 0); assert.deepEqual(env.ledger.revisions(id), revisions);
    assert.deepEqual(env.ledger.changesOf(id), changes);
    assert.deepEqual(env.ledger.marker(who.actor_id, `memory-operation:${who.operation_id}:purge:${id}`), marker);
    await invoke(); assert.deepEqual(env.ledger.revisions(id), []);
    if (action === "undo") await assert.rejects(invoke({ ...who, project_id: "project-b" }), { code: "memory.scope" });
  });

test("undo commits source cleanup and its undone receipt together, then recovers after saveChange failure and restart", async t => {
  const plugin = "io.example.memory-cas", setup = await fixture(t, undefined, plugin); let env = await setup.open();
  const seed = { ...caller("atomic-undo-seed"), consumer: "plugin" as const, plugin_id: plugin, person: false };
  const saved = await env.service.write(seed, { scope: "personal", text: "Keep atomic release conventions", kind: "convention" });
  const id = saved.memory!.memory_id, who = caller("atomic-undo");
  await env.service.recall(seed, { scopes: ["personal"], query: "release conventions" }, { readMode: "explicit" });
  const before = { revisions: env.ledger.revisions(id), uses: env.ledger.uses({ memory_id: id }), changes: env.ledger.changesOf(id) };
  assert.ok(before.revisions.length); assert.ok(before.uses.length);
  const save = env.ledger.saveChange.bind(env.ledger);
  const failure = t.mock.method(env.ledger, "saveChange", change => {
    if (change.state === "undone") throw new Error("undone receipt interrupted");
    return save(change);
  });
  await assert.rejects(env.service.undo(who, saved.change_id!), /undone receipt interrupted/); failure.mock.restore();
  assert.deepEqual(await env.raw.list("personal", who.actor_id), [], "SDK purge committed outside the ledger transaction");
  assert.deepEqual({ revisions: env.ledger.revisions(id), uses: env.ledger.uses({ memory_id: id }), changes: env.ledger.changesOf(id) }, before);
  await env.close(); env = await setup.open();
  const result = await env.service.undo(who, saved.change_id!);
  assert.equal(result.change.state, "undone");
  assert.deepEqual(env.ledger.revisions(id), []); assert.deepEqual(env.ledger.uses({ memory_id: id }), []);
  assert.ok(env.ledger.changesOf(id).every(change => change.text === ""));
  assert.deepEqual(await env.service.undo(who, saved.change_id!), result);
});

for (const disabled of ["personal", "project"] as const)
  test(`a prepared move finishes cleanup and repeats with ${disabled} memory disabled`, async t => {
    const setup = await fixture(t); let env = await setup.open();
    const saved = await env.service.write(caller("move-off-seed"), { scope: "personal", text: "Move this release convention", kind: "convention" });
    const who = caller(`move-off-${disabled}`), id = saved.memory!.memory_id;
    const request = { action: "move" as const, memory_id: id, expected_version: 1, to: "project" as const };
    const failure = t.mock.method(env.ledger, "forget", () => { throw new Error("ledger forget interrupted"); });
    await assert.rejects(env.service.change(who, request), /ledger forget interrupted/); failure.mock.restore();
    const target = (await env.raw.list("project", "project-a"))[0]!, history = env.ledger.revisions(target.memory_id);
    env.service.savePrefs(caller("disable-move-scope"), disabled, { enabled: false });
    await env.close(); env = await setup.open();
    let creates = 0; setup.afterWrite(async () => { creates++; });
    const result = await env.service.change(who, request);
    assert.equal(result.memory!.memory_id, target.memory_id);
    assert.deepEqual(await env.service.change(who, request), result);
    assert.equal(creates, 0); assert.deepEqual(await env.raw.list("project", "project-a"), [target]);
    assert.deepEqual(env.ledger.revisions(target.memory_id), history); assert.deepEqual(env.ledger.revisions(id), []);
    assert.equal(env.ledger.changesOf(target.memory_id).filter(change => change.kind === "moved").length, 1);
  });

for (const targetReceipt of [true, false])
  test(`move recovery preserves a later target edit${targetReceipt ? "" : " when the old marker has no result"}`, async t => {
    const setup = await fixture(t); let env = await setup.open();
    const saved = await env.service.write(caller("move-seed"), { scope: "personal", text: "Original release notes", kind: "convention" });
    const who = caller("move-edited-target"), request = { action: "move" as const, memory_id: saved.memory!.memory_id, expected_version: 1, to: "project" as const };
    const failure = t.mock.method(env.ledger, "forget", () => { throw new Error("ledger forget interrupted"); });
    await assert.rejects(env.service.change(who, request), /ledger forget interrupted/); failure.mock.restore();
    const target = (await env.raw.list("project", "project-a"))[0]!;
    if (!targetReceipt) {
      const key = `memory-operation:${who.operation_id}:move-create`, marker = env.ledger.marker(who.actor_id, key)!;
      const { result: _result, ...body } = marker.body as Record<string, unknown>;
      env.ledger.setMarker(who.actor_id, key, { ...body, phase: "pending" }, marker.at);
    }
    await env.service.change(caller("target-editor"), { action: "update", memory_id: target.memory_id, expected_version: target.version, text: "Later target edit" });
    const current = await env.raw.list("project", "project-a"), history = env.ledger.revisions(target.memory_id);
    const sourceHistory = env.ledger.revisions(saved.memory!.memory_id);
    await env.close(); env = await setup.open();
    await assert.rejects(env.service.change(who, request), { code: "memory.conflict" });
    assert.deepEqual(await env.raw.list("project", "project-a"), current); assert.deepEqual(env.ledger.revisions(target.memory_id), history);
    assert.deepEqual(env.ledger.revisions(saved.memory!.memory_id), sourceHistory);
    assert.equal(env.ledger.changesOf(target.memory_id).filter(change => change.kind === "moved").length, 0);
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


// MEM-03: every actual commit entrypoint keeps its first duplicate decision across restart.
for (const source of ["manual", "said", "unverified", "plugin", "auto"] as const)
  test(`${source} duplicate retries retain one target without a new append`, async t => {
    const plugin = source === "plugin" ? "notes-owner" : undefined;
    const setup = await fixture(t, undefined, plugin); let env = await setup.open();
    try {
      const base = source === "plugin" ? { ...caller("duplicate-seed"), consumer: "plugin" as const, plugin_id: plugin, person: false } : caller("duplicate-seed");
      const input = { scope: "personal" as const, text: "Prefer short release summaries", kind: "preference" as const };
      const saved = await env.service.write(base, input), id = saved.memory!.memory_id;
      const who = { ...base, operation_id: "ordinary-duplicate", ...(source === "said" || source === "unverified" ? { person: false } : {}) };
      const perform = () => source === "auto"
        ? env.service.offer(who, { ...input, basis: "inferred", why: "One observation", from: "gate" })
        : env.service.write(who, { ...input, ...(source === "said" || source === "unverified" ? { said: input.text } : {}) },
          source === "said" ? { originals: [input.text] } : {});
      assert.equal((await perform()).outcome, "duplicate");
      const markerKey = "memory-operation:ordinary-duplicate:duplicate", marker = env.ledger.marker(who.actor_id, markerKey)!;
      assert.deepEqual((marker.body as { result: unknown }).result, { outcome: "duplicate", memory_id: id, version: 1 });
      assert.equal(JSON.stringify(marker).includes(input.text), false);
      const before = await env.raw.list("personal", "memory-owner"), revisions = env.ledger.revisions(id), changes = env.ledger.changesOf(id);
      let appends = 0; setup.afterWrite(async () => { appends++; });
      await env.close(); env = await setup.open();
      assert.equal((await perform()).outcome, "duplicate");
      assert.equal(appends, 0); assert.deepEqual(await env.raw.list("personal", "memory-owner"), before);
      assert.deepEqual(env.ledger.revisions(id), revisions); assert.deepEqual(env.ledger.changesOf(id), changes);
      assert.deepEqual(env.ledger.marker(who.actor_id, markerKey), marker);
    } finally { await env.close(); }
  });

for (const state of ["active", "paused", "disabled"] as const) for (const failure of ["sdk-response", "ledger"] as const)
  test(`ordinary adoption recovers ${failure} with bounded evidence and unchanged ${state}`, async t => {
    const setup = await fixture(t); let env = await setup.open();
    try {
      const text = "Prefer concise release notes";
      const oldEvidence = Array.from({ length: 6 }, (_, index) => ({ kind: "observation", text: `Original evidence ${index}`, at_ms: 1700000000000 + index }));
      let original = await env.raw.write({ scope: "personal", owner: "memory-owner", operation_id: "ordinary-auto", text, origin: "Original observation",
        meta: { kind: "preference", source: "auto", evidence: oldEvidence, classification: { scenes: ["coding"], lifecycle: "long-term" } } });
      if (state !== "active") original = await env.raw[state === "paused" ? "pause" : "disable"]({ scope: "personal", owner: "memory-owner", memory_id: original.memory_id,
        expected_version: original.version, operation_id: "ordinary-original-state", reason: "Original state reason" });
      const who = { ...caller("ordinary-adopt"), person: false };
      // Long object references exercise the existing bounded evidence serializer on both attempts.
      const input = { scope: "personal" as const, text, said: text, kind: "preference" as const, rests_on: { kind: "document", id: "reference-".repeat(30) } };
      let responses = 0;
      setup.afterUpdate(async () => { responses++; if (failure === "sdk-response") throw new Error("ordinary adoption response lost"); });
      const setMarker = env.ledger.setMarker.bind(env.ledger);
      const fail = failure === "ledger" ? t.mock.method(env.ledger, "setMarker", (...args: Parameters<typeof env.ledger.setMarker>) => {
        if (args[1].endsWith(":duplicate") && (args[2] as { phase?: string }).phase === "committed") throw new Error("ordinary duplicate ledger interrupted");
        return setMarker(...args);
      }) : undefined;
      await assert.rejects(env.service.write(who, input, { originals: [text] }));
      fail?.mock.restore(); setup.afterUpdate(async () => { responses++; });
      const applied = (await env.raw.list("personal", "memory-owner"))[0]!;
      assert.equal(applied.version, original.version + 1); assert.equal(applied.meta.source, "said");
      assert.equal(applied.meta.evidence!.length, 6);
      assert.deepEqual(applied.meta.evidence!.slice(0, 4), oldEvidence.slice(2));
      assert.deepEqual(applied.meta.evidence!.slice(-2).map(item => item.kind), ["said", "object"]);
      assert.deepEqual(applied.paused, original.paused); assert.deepEqual(applied.disabled, original.disabled);
      const key = "memory-operation:ordinary-adopt:duplicate", mark = env.ledger.marker(who.actor_id, key)!;
      assert.equal((mark.body as { evidence_count: number }).evidence_count, 2);
      assert.equal(JSON.stringify(mark).includes(text), false); assert.equal(JSON.stringify(mark).includes("Original evidence"), false);
      await env.close(); env = await setup.open();
      assert.equal((await env.service.write(who, input, { originals: [text] })).outcome, "duplicate");
      assert.equal(responses, 2, "the SDK validates the original facts input after its response was lost");
      assert.deepEqual(await env.raw.list("personal", "memory-owner"), [applied], "neither evidence nor state is applied twice");
      assert.deepEqual(env.ledger.revisions(original.memory_id), []); assert.deepEqual(env.ledger.changesOf(original.memory_id), []);
      assert.equal((await env.service.write(who, input, { originals: [text] })).outcome, "duplicate");
      assert.equal(responses, 2);
    } finally { setup.afterUpdate(); await env.close(); }
  });

for (const changed of ["replace-evidence", "delete-evidence", "same-text-edit"] as const)
  test(`ordinary adoption rejects ${changed} after a lost SDK response`, async t => {
    const setup = await fixture(t); let env = await setup.open();
    try {
      const text = "Prefer concise release notes", who = caller("evidence-adopt");
      const original = await env.raw.write({ scope: "personal", owner: "memory-owner", operation_id: "evidence-auto", text, origin: "Original observation",
        meta: { kind: "preference", source: "auto", classification: { scenes: ["coding"], lifecycle: "long-term" } } });
      const input = { scope: "personal" as const, text, said: text, kind: "preference" as const, rests_on: { kind: "document", id: "first-evidence" } };
      setup.afterUpdate(async () => { throw new Error("adoption response lost"); });
      await assert.rejects(env.service.write(who, input)); setup.afterUpdate();
      const applied = (await env.raw.list("personal", "memory-owner"))[0]!;
      if (changed === "same-text-edit") await env.raw.update({ scope: "personal", owner: "memory-owner", memory_id: original.memory_id,
        expected_version: applied.version, operation_id: "external-same-text", change: { text: applied.text, meta: applied.meta } });
      const before = await env.raw.list("personal", "memory-owner"), key = "memory-operation:evidence-adopt:duplicate", marker = env.ledger.marker(who.actor_id, key);
      const { rests_on: _removed, ...withoutEvidence } = input;
      const retry = changed === "replace-evidence" ? { ...input, rests_on: { kind: "document", id: "replacement-evidence" } } : changed === "delete-evidence" ? withoutEvidence : input;
      await env.close(); env = await setup.open();
      await assert.rejects(env.service.write(who, retry), { code: "memory.conflict" });
      assert.deepEqual(await env.raw.list("personal", "memory-owner"), before);
      assert.deepEqual(env.ledger.marker(who.actor_id, key), marker);
      assert.equal(env.ledger.marker(who.actor_id, "memory-operation:evidence-adopt:append"), null);
      assert.deepEqual(env.ledger.revisions(original.memory_id), []); assert.deepEqual(env.ledger.changesOf(original.memory_id), []);
      if (changed !== "same-text-edit") {
        assert.equal((await env.service.write(who, input)).outcome, "duplicate", "the unchanged original input still repairs its receipt");
        assert.deepEqual(await env.raw.list("personal", "memory-owner"), before);
      }
    } finally { setup.afterUpdate(); await env.close(); }
  });

for (const after of ["edit", "delete", "revoke", "cancel", "other-project"] as const)
  test(`ordinary duplicate refuses ${after} without another append or ledger result`, async t => {
    const setup = await fixture(t); let env = await setup.open();
    try {
      const who = caller("ordinary-guard"), input = { scope: "project" as const, text: "Prefer short release summaries", kind: "preference" as const };
      const saved = await env.service.write(caller("ordinary-guard-seed"), input), id = saved.memory!.memory_id;
      assert.equal((await env.service.write(who, input)).outcome, "duplicate");
      if (after === "edit") await env.service.change(caller("ordinary-later-edit"), { memory_id: id, action: "update", text: input.text, expected_version: 1 });
      if (after === "delete") await env.service.change(caller("ordinary-later-delete"), { memory_id: id, action: "remove", expected_version: 1 });
      const before = await env.raw.list("project", "project-a"), key = "memory-operation:ordinary-guard:duplicate", mark = env.ledger.marker(who.actor_id, key);
      const revisions = env.ledger.revisions(id), changes = env.ledger.changesOf(id);
      let appends = 0; setup.afterWrite(async () => { appends++; });
      await env.close(); env = await setup.open();
      const controller = new AbortController(); if (after === "cancel") controller.abort();
      if (after === "revoke") setup.authorize(false);
      await assert.rejects(env.service.write({ ...who, signal: controller.signal, ...(after === "other-project" ? { project_id: "project-b" } : {}) }, input));
      setup.authorize(true);
      assert.equal(appends, 0); assert.deepEqual(await env.raw.list("project", "project-a"), before);
      assert.deepEqual(env.ledger.marker(who.actor_id, key), mark);
      assert.deepEqual(env.ledger.revisions(id), revisions); assert.deepEqual(env.ledger.changesOf(id), changes);
    } finally { setup.authorize(true); await env.close(); }
  });


for (const revoke of [false, true]) test(`ordinary adoption stops ledger completion after ${revoke ? "revocation" : "cancellation"}`, async t => {
  const setup = await fixture(t); let env = await setup.open();
  try {
    const text = "Prefer concise release notes", who = caller("ordinary-tail"), controller = new AbortController();
    const original = await env.raw.write({ scope: "personal", owner: "memory-owner", operation_id: "ordinary-tail-seed", text, origin: "Original observation",
      meta: { kind: "preference", source: "auto", classification: { scenes: ["coding"], lifecycle: "long-term" } } });
    const input = { scope: "personal" as const, text, said: text, kind: "preference" as const }, key = "memory-operation:ordinary-tail:duplicate";
    let checkpoint: ReturnType<typeof env.ledger.marker>;
    setup.afterUpdate(async () => { checkpoint = env.ledger.marker(who.actor_id, key); if (revoke) setup.authorize(false); else controller.abort(); });
    await assert.rejects(env.service.write({ ...who, signal: controller.signal }, input));
    setup.authorize(true); setup.afterUpdate();
    const applied = (await env.raw.list("personal", "memory-owner"))[0]!;
    assert.equal(applied.version, original.version + 1);
    assert.equal((checkpoint!.body as { phase: string }).phase, "pending");
    assert.deepEqual(env.ledger.marker(who.actor_id, key), checkpoint!);
    assert.deepEqual(env.ledger.revisions(original.memory_id), []); assert.deepEqual(env.ledger.changesOf(original.memory_id), []);
    await env.close(); env = await setup.open();
    assert.equal((await env.service.write(who, input)).outcome, "duplicate");
    assert.deepEqual(await env.raw.list("personal", "memory-owner"), [applied]);
  } finally { setup.authorize(true); setup.afterUpdate(); await env.close(); }
});

test("matching adoption metadata at version plus one is not an original SDK receipt", async t => {
  const setup = await fixture(t); let env = await setup.open();
  try {
    const text = "Prefer concise release notes", who = caller("uncommitted-adopt");
    const original = await env.raw.write({ scope: "personal", owner: "memory-owner", operation_id: "uncommitted-auto", text, origin: "Original observation",
      meta: { kind: "preference", source: "auto", classification: { scenes: ["coding"], lifecycle: "long-term" } } });
    const input = { scope: "personal" as const, text, said: text, kind: "preference" as const };
    const bind = env.backend.withCaller.bind(env.backend);
    const fail = t.mock.method(env.backend, "withCaller", (actor: MemoryCaller) => {
      const bound = bind(actor);
      return { ...bound, update: async () => { throw new Error("stopped before SDK update"); } };
    });
    await assert.rejects(env.service.write(who, input), /stopped before SDK update/); fail.mock.restore();
    const write = env.ledger.marker(who.actor_id, "memory-operation:uncommitted-adopt:write")!;
    await env.raw.update({ scope: "personal", owner: "memory-owner", memory_id: original.memory_id, expected_version: original.version,
      operation_id: "unrelated-same-adoption", change: { text, meta: { ...original.meta, source: "manual", basis: "explicit", approved_by: { by: "person" },
        evidence: [{ kind: "said", text, at_ms: Date.parse(write.at) }] } } });
    const before = await env.raw.list("personal", "memory-owner"), key = "memory-operation:uncommitted-adopt:duplicate", mark = env.ledger.marker(who.actor_id, key);
    assert.equal(before[0]!.version, original.version + 1);
    assert.ok(env.ledger.marker(who.actor_id, `memory-operation:uncommitted-adopt:facts:${original.memory_id}`));
    await env.close(); env = await setup.open();
    await assert.rejects(env.service.write(who, input), { code: "agent.memory_conflict" });
    assert.deepEqual(await env.raw.list("personal", "memory-owner"), before); assert.deepEqual(env.ledger.marker(who.actor_id, key), mark);
    assert.deepEqual(env.ledger.revisions(original.memory_id), []); assert.deepEqual(env.ledger.changesOf(original.memory_id), []);
  } finally { await env.close(); }
});

test("ordinary saving without a durable branch stays unknown after restart", async t => {
  const setup = await fixture(t); let env = await setup.open();
  try {
    const input = { scope: "personal" as const, text: "Prefer short release notes", kind: "preference" as const }, who = caller("ordinary-undecided");
    await env.service.write(caller("ordinary-undecided-seed"), input);
    const setMarker = env.ledger.setMarker.bind(env.ledger);
    const fail = t.mock.method(env.ledger, "setMarker", (...args: Parameters<typeof env.ledger.setMarker>) => {
      if (args[1].endsWith(":duplicate")) throw new Error("duplicate decision interrupted");
      return setMarker(...args);
    });
    await assert.rejects(env.service.write(who, input), /duplicate decision interrupted/); fail.mock.restore();
    const before = await env.raw.list("personal", "memory-owner");
    await env.close(); env = await setup.open();
    await assert.rejects(env.service.write(who, input), { code: "memory.conflict" });
    assert.deepEqual(await env.raw.list("personal", "memory-owner"), before);
    assert.equal(env.ledger.marker(who.actor_id, "memory-operation:ordinary-undecided:append"), null);
  } finally { await env.close(); }
});


for (const kind of ["fact", "preference"] as const) test(`formed repeated ${kind} keeps its original waiting decision after restart`, async t => {
  const setup = await fixture(t, undefined, undefined, true); let env = await setup.open();
  try {
    env.service.savePrefs(caller("wait-for-person"), "personal", { auto: false });
    const who = caller("repeat-offer"), draft = { scope: "personal" as const, text: "Release review needs a named owner", kind, basis: "repeated" as const,
      why: "Two original observations", from: "extraction" as const };
    const candidate = await env.service.propose(caller("formed-candidate"), draft);
    const input = { ...draft, candidate_id: candidate.candidate_id, candidate_version: candidate.version };
    const first = await env.service.offer(who, input);
    assert.equal(first.outcome, "candidate"); assert.equal(first.candidate!.candidate_id, candidate.candidate_id);
    const key = "memory-operation:repeat-offer:candidate-hold", mark = env.ledger.marker(who.actor_id, key)!;
    assert.deepEqual((mark.body as { result: unknown }).result, { outcome: "candidate", candidate_id: candidate.candidate_id, version: candidate.version });
    assert.equal(JSON.stringify(mark).includes(draft.text), false);
    env.service.savePrefs(caller("enable-auto-after-hold"), "personal", { auto: true });
    await env.close(); env = await setup.open();
    const retry = await env.service.offer(who, input);
    assert.equal(retry.outcome, "candidate"); assert.equal(retry.reason, first.reason);
    assert.deepEqual(retry.candidate, first.candidate);
    assert.deepEqual(await env.raw.list("personal", "memory-owner"), []);
    assert.deepEqual((await env.raw.candidates.list("personal", "memory-owner")).map(item => [item.candidate_id, item.version, item.state]), [[candidate.candidate_id, candidate.version, "pending"]]);
    assert.deepEqual(env.ledger.marker(who.actor_id, key), mark);
    assert.equal(env.ledger.marker(who.actor_id, "memory-operation:repeat-offer:append"), null);
  } finally { await env.close(); }
});

for (const change of ["omit-id", "replace-id", "version", "decided", "scope", "revoke", "cancel"] as const)
  test(`waiting offer rejects ${change} instead of using candidate input as an unknown bypass`, async t => {
    const setup = await fixture(t, undefined, undefined, true); let env = await setup.open();
    try {
      const draft = { scope: "project" as const, text: "Release review needs a named owner", kind: "fact" as const, basis: "repeated" as const,
        why: "Two original observations", from: "extraction" as const };
      const candidate = await env.service.propose(caller("hold-guard-seed"), draft), who = caller("hold-guard");
      const input = { ...draft, candidate_id: candidate.candidate_id, candidate_version: candidate.version };
      assert.equal((await env.service.offer(who, input)).outcome, "candidate");
      const other = change === "replace-id" ? await env.service.propose(caller("other-hold"), { ...draft, text: "Use another release reviewer" }) : undefined;
      if (change === "decided") await env.raw.candidates.discard({ scope: "project", owner: "project-a", candidate_id: candidate.candidate_id,
        expected_version: candidate.version, operation_id: "external-discard" });
      const notes = env.ledger.candidates(who.actor_id), key = "memory-operation:hold-guard:candidate-hold", mark = env.ledger.marker(who.actor_id, key);
      await env.close(); env = await setup.open();
      const controller = new AbortController(); if (change === "cancel") controller.abort();
      if (change === "revoke") setup.authorize(false);
      const { candidate_id: _removed, ...withoutId } = input;
      const retry = change === "omit-id" ? withoutId : change === "replace-id" ? { ...input, candidate_id: other!.candidate_id }
        : change === "version" ? { ...input, candidate_version: candidate.version + 1 } : input;
      await assert.rejects(env.service.offer({ ...who, signal: controller.signal, ...(change === "scope" ? { project_id: "project-b" } : {}) }, retry));
      setup.authorize(true);
      assert.deepEqual(env.ledger.candidates(who.actor_id), notes); assert.deepEqual(env.ledger.marker(who.actor_id, key), mark);
      assert.deepEqual(await env.raw.list("project", "project-a"), []);
      assert.equal(env.ledger.marker(who.actor_id, "memory-operation:hold-guard:append"), null);
    } finally { setup.authorize(true); await env.close(); }
  });


test("a source forgotten while the SDK candidate list waits cannot settle its held offer", async t => {
  const setup = await fixture(t, undefined, undefined, true), env = await setup.open();
  let entered!: () => void, release!: () => void;
  const reached = new Promise<void>(resolve => { entered = resolve; }), barrier = new Promise<void>(resolve => { release = resolve; });
  try {
    const source = { event_id: "host-original-release-1", version: "1" };
    const sourceEntry = await env.service.write(caller("source-for-hold"), { scope: "personal", text: "Keep the original release preference", kind: "preference" }, { sources: [source] });
    const draft = { scope: "personal" as const, text: "Release review needs a named owner", kind: "fact" as const,
      basis: "repeated" as const, why: "Two original observations", from: "extraction" as const };
    const candidate = await env.service.propose(caller("source-held-candidate"), draft), who = caller("source-held-offer");
    // The Host's async source guard uses the actual suppression owner. This is the Service source Port,
    // not a claim to exercise queued Run/original-input resolution.
    let sourceChecks = 0;
    const controlled = new MemoryService({ backend: env.backend, ledger: env.ledger, beforeEffect: async () => {
      sourceChecks++;
      const allowed = await Promise.resolve(env.service.sourceAllowed(who.actor_id, "personal", who.actor_id, [source]));
      if (!allowed) throw memoryErrors.forbidden("原来源已遗忘，停止候选记账");
    } });
    assert.equal(env.service.sourceAllowed(who.actor_id, "personal", who.actor_id, [source]), true);
    let firstList = true;
    setup.afterCandidateList(async () => { if (firstList) { firstList = false; entered(); await barrier; } });
    const pending = controlled.offer(who, { ...draft, candidate_id: candidate.candidate_id, candidate_version: candidate.version });
    const rejected = assert.rejects(pending, { code: "memory.forbidden" });
    await reached;
    const before = env.ledger.candidates(who.actor_id), commit = env.ledger.marker(who.actor_id, "memory-operation:source-held-offer:commit");
    await env.service.change(caller("forget-source-during-candidate-read"), { action: "remove", memory_id: sourceEntry.memory!.memory_id, expected_version: sourceEntry.memory!.version });
    assert.equal(env.service.sourceAllowed(who.actor_id, "personal", who.actor_id, [source]), false, "public removal actually suppresses the original event/version");
    release(); await rejected;
    assert.ok(sourceChecks > 0);
    assert.deepEqual(env.ledger.candidates(who.actor_id), before);
    assert.deepEqual(env.ledger.marker(who.actor_id, "memory-operation:source-held-offer:commit"), commit);
    assert.equal(env.ledger.marker(who.actor_id, "memory-operation:source-held-offer:candidate-hold"), null);
    assert.equal(env.ledger.marker(who.actor_id, "memory-operation:source-held-offer:append"), null);
    assert.deepEqual((await env.raw.candidates.list("personal", "memory-owner")).map(item => [item.candidate_id, item.state, item.version]), [[candidate.candidate_id, "pending", candidate.version]]);
    assert.deepEqual(await env.raw.list("personal", "memory-owner"), []);
  } finally { release(); setup.afterCandidateList(); await env.close(); }
});

test("a concurrent same-operation request cannot validate changed evidence against its stale pre-adoption version", async t => {
  const setup = await fixture(t); const env = await setup.open();
  let enterFirst!: () => void, releaseFirst!: () => void, enterSecond!: () => void, releaseSecond!: () => void;
  const firstEntered = new Promise<void>(resolve => { enterFirst = resolve; });
  const firstRelease = new Promise<void>(resolve => { releaseFirst = resolve; });
  const secondEntered = new Promise<void>(resolve => { enterSecond = resolve; });
  const secondRelease = new Promise<void>(resolve => { releaseSecond = resolve; });
  try {
    const text = "Prefer concise release notes", who = caller("interleaved-adopt");
    const original = await env.raw.write({ scope: "personal", owner: "memory-owner", operation_id: "interleaved-auto", text, origin: "Original observation",
      meta: { kind: "preference", source: "auto", classification: { scenes: ["coding"], lifecycle: "long-term" } } });
    const input = { scope: "personal" as const, text, said: text, kind: "preference" as const, rests_on: { kind: "document", id: "original-proof" } };
    setup.beforeUpdate(async () => { enterFirst(); await firstRelease; });
    const first = env.service.write(who, input);
    await firstEntered;
    let waiting = true;
    setup.beforeEffect(async () => { if (waiting) { waiting = false; enterSecond(); await secondRelease; } });
    const second = env.service.write(who, { ...input, rests_on: { kind: "document", id: "changed-proof" } });
    const rejected = assert.rejects(second, { code: "memory.conflict" });
    await secondEntered;
    assert.equal((await env.raw.list("personal", "memory-owner"))[0]!.version, original.version, "both callers observed the pre-adoption version");
    releaseFirst(); assert.equal((await first).outcome, "duplicate");
    const before = await env.raw.list("personal", "memory-owner"), key = "memory-operation:interleaved-adopt:duplicate", mark = env.ledger.marker(who.actor_id, key);
    assert.equal(before[0]!.version, original.version + 1); assert.equal((mark!.body as { phase: string }).phase, "committed");
    releaseSecond(); await rejected;
    assert.deepEqual(await env.raw.list("personal", "memory-owner"), before); assert.deepEqual(env.ledger.marker(who.actor_id, key), mark);
    assert.deepEqual(env.ledger.revisions(original.memory_id), []); assert.deepEqual(env.ledger.changesOf(original.memory_id), []);
  } finally { releaseFirst(); releaseSecond(); setup.beforeUpdate(); setup.beforeEffect(); await env.close(); }
});

// MEM-03: App duplicate decisions must survive before any SDK creation key has been used.
for (const interruptLater of [false, true]) test(`import retains a skipped target across restart${interruptLater ? " after a later entry fails" : " after success"}`, async t => {
  const setup = await fixture(t); let env = await setup.open();
  try {
    const saved = await env.service.write(caller("duplicate-seed"), { scope: "personal", text: "Prefer short release summaries", kind: "preference" });
    const id = saved.memory!.memory_id, pack = await env.service.exportScope(caller("export-duplicate"), "personal");
    if (interruptLater) pack.entries.push({ ...pack.entries[0]!, text: "Prefer numbered examples" });
    const revisions = env.ledger.revisions(id), changes = env.ledger.changesOf(id);
    const fail = interruptLater ? t.mock.method(env.ledger, "addRevision", () => { throw new Error("later import history interrupted"); }) : undefined;
    const who = caller("fixed-duplicate-import");
    if (interruptLater) await assert.rejects(env.service.importScope(who, "personal", pack), { code: "memory.conflict" });
    else assert.deepEqual(await env.service.importScope(who, "personal", pack), { written: 0, skipped: 1, refused: 0 });
    fail?.mock.restore();
    const marker = env.ledger.marker(who.actor_id, "memory-operation:fixed-duplicate-import:import:0:import-duplicate")!;
    assert.deepEqual((marker.body as { result: unknown }).result, { outcome: "duplicate", memory_id: id, version: 1 });
    assert.equal(JSON.stringify(marker).includes(pack.entries[0]!.text), false, "the operation has no body copy");
    await env.close(); env = await setup.open();
    assert.deepEqual(await env.service.importScope(who, "personal", pack), { written: interruptLater ? 1 : 0, skipped: 1, refused: 0 });
    const entries = await env.raw.list("personal", "memory-owner");
    assert.equal(entries.length, interruptLater ? 2 : 1);
    assert.equal(entries.filter(item => item.text === pack.entries[0]!.text).length, 1);
    assert.equal(entries.find(item => item.memory_id === id)!.version, 1);
    assert.deepEqual(env.ledger.revisions(id), revisions); assert.deepEqual(env.ledger.changesOf(id), changes);
  } finally { await env.close(); }
});

test("an import interrupted before a reliable duplicate decision stays unknown rather than guessing a new branch", async t => {
  const setup = await fixture(t); let env = await setup.open();
  try {
    await env.service.write(caller("undecided-seed"), { scope: "personal", text: "Prefer short release summaries", kind: "preference" });
    const pack = await env.service.exportScope(caller("undecided-export"), "personal"), who = caller("undecided-import");
    const setMarker = env.ledger.setMarker.bind(env.ledger);
    const fail = t.mock.method(env.ledger, "setMarker", (...args: Parameters<typeof env.ledger.setMarker>) => {
      if (args[1].endsWith(":import-duplicate")) throw new Error("decision transaction interrupted");
      return setMarker(...args);
    });
    await assert.rejects(env.service.importScope(who, "personal", pack)); fail.mock.restore();
    const before = await env.raw.list("personal", "memory-owner");
    await env.close(); env = await setup.open();
    await assert.rejects(env.service.importScope(who, "personal", pack), error => {
      const failure = error as { code?: string; details?: Record<string, unknown> };
      assert.equal(failure.code, "memory.conflict"); assert.equal(failure.details?.failed_outcome, "unknown"); return true;
    });
    assert.deepEqual(await env.raw.list("personal", "memory-owner"), before);
    assert.equal(env.ledger.marker(who.actor_id, "memory-operation:undecided-import:import:0:append"), null);
  } finally { await env.close(); }
});

for (const state of ["active", "paused", "disabled"] as const) for (const failure of ["sdk-response", "ledger"] as const)
  test(`import adoption replays its facts CAS after ${failure} failure while preserving ${state}`, async t => {
    const setup = await fixture(t); let env = await setup.open();
    try {
      let original = await env.raw.write({ scope: "personal", owner: "memory-owner", operation_id: "automatic-seed", text: "Prefer concise release notes", origin: "Original automatic observation",
        meta: { kind: "preference", source: "auto", classification: { scenes: ["coding"], lifecycle: "long-term" } } });
      if (state !== "active") original = await env.raw[state === "paused" ? "pause" : "disable"]({ scope: "personal", owner: "memory-owner", memory_id: original.memory_id,
        expected_version: original.version, operation_id: "original-state", reason: "Original state reason" });
      const pack = await env.service.exportScope(caller("export-adopt"), "personal"), who = caller("adopt-import");
      let responses = 0;
      setup.afterUpdate(async () => { responses++; if (failure === "sdk-response") throw new Error("facts response interrupted"); });
      const setMarker = env.ledger.setMarker.bind(env.ledger);
      const fail = failure === "ledger" ? t.mock.method(env.ledger, "setMarker", (...args: Parameters<typeof env.ledger.setMarker>) => {
        if (args[1].endsWith(":import-duplicate") && (args[2] as { phase?: string }).phase === "committed") throw new Error("duplicate receipt interrupted");
        return setMarker(...args);
      }) : undefined;
      await assert.rejects(env.service.importScope(who, "personal", pack), { code: "memory.conflict" });
      fail?.mock.restore(); setup.afterUpdate(async () => { responses++; });
      assert.equal((await env.raw.list("personal", "memory-owner"))[0]!.version, original.version + 1);
      await env.close(); env = await setup.open();
      assert.deepEqual(await env.service.importScope(who, "personal", pack), { written: 0, skipped: 1, refused: 0 });
      assert.equal(responses, 2, "recovery asks the original SDK CAS, not the current source label");
      const entries = await env.raw.list("personal", "memory-owner"); assert.equal(entries.length, 1);
      const current = entries[0]!;
      assert.equal(current.memory_id, original.memory_id); assert.equal(current.version, original.version + 1);
      assert.deepEqual(current.meta, { ...original.meta, source: "imported" });
      assert.deepEqual(current.paused, original.paused); assert.deepEqual(current.disabled, original.disabled);
      assert.equal(current.origin, original.origin); assert.deepEqual(env.ledger.revisions(current.memory_id), []);
      assert.deepEqual(env.ledger.changesOf(current.memory_id), []);
      assert.deepEqual(await env.service.importScope(who, "personal", pack), { written: 0, skipped: 1, refused: 0 });
      assert.equal(responses, 2, "completed duplicate has no new SDK mutation");
    } finally { setup.afterUpdate(); await env.close(); }
  });

for (const revoke of [false, true]) test(`import adoption ${revoke ? "revocation" : "cancellation"} after SDK commit leaves completion pending`, async t => {
  const setup = await fixture(t); let env = await setup.open();
  try {
    const original = await env.raw.write({ scope: "personal", owner: "memory-owner", operation_id: "tail-seed", text: "Prefer concise release notes", origin: "Original observation",
      meta: { kind: "preference", source: "auto", classification: { scenes: ["coding"], lifecycle: "long-term" } } });
    const pack = await env.service.exportScope(caller("tail-export"), "personal"), who = caller("tail-import"), controller = new AbortController();
    const key = "memory-operation:tail-import:import:0:import-duplicate";
    let checkpoint: ReturnType<typeof env.ledger.marker>;
    setup.afterUpdate(async () => {
      checkpoint = env.ledger.marker(who.actor_id, key);
      if (revoke) setup.authorize(false); else controller.abort();
    });
    await assert.rejects(env.service.importScope({ ...who, signal: controller.signal }, "personal", pack));
    setup.authorize(true); setup.afterUpdate();
    assert.deepEqual(env.ledger.marker(who.actor_id, key), checkpoint!);
    assert.equal((checkpoint!.body as { phase: string }).phase, "pending");
    assert.deepEqual(env.ledger.revisions(original.memory_id), []); assert.deepEqual(env.ledger.changesOf(original.memory_id), []);
    assert.equal((await env.raw.list("personal", "memory-owner"))[0]!.version, 2, "SDK committed before the authority changed");
    await env.close(); env = await setup.open();
    assert.deepEqual(await env.service.importScope(who, "personal", pack), { written: 0, skipped: 1, refused: 0 });
    const entries = await env.raw.list("personal", "memory-owner"); assert.equal(entries.length, 1); assert.equal(entries[0]!.version, 2);
  } finally { setup.authorize(true); setup.afterUpdate(); await env.close(); }
});

test("an interrupted import adoption cannot use a later imported label as its SDK receipt", async t => {
  const setup = await fixture(t); let env = await setup.open();
  try {
    const original = await env.raw.write({ scope: "personal", owner: "memory-owner", operation_id: "successor-seed", text: "Prefer concise release notes", origin: "Original observation",
      meta: { kind: "preference", source: "auto", classification: { scenes: ["coding"], lifecycle: "long-term" } } });
    const pack = await env.service.exportScope(caller("successor-export"), "personal"), who = caller("successor-import");
    setup.afterUpdate(async () => { throw new Error("original adoption response lost"); });
    await assert.rejects(env.service.importScope(who, "personal", pack)); setup.afterUpdate();
    const adopted = (await env.raw.list("personal", "memory-owner"))[0]!;
    await env.raw.update({ scope: "personal", owner: "memory-owner", memory_id: original.memory_id, expected_version: adopted.version,
      operation_id: "external-same-content-edit", change: { text: adopted.text, meta: adopted.meta } });
    const before = await env.raw.list("personal", "memory-owner"), key = "memory-operation:successor-import:import:0:import-duplicate";
    const marker = env.ledger.marker(who.actor_id, key);
    await env.close(); env = await setup.open();
    await assert.rejects(env.service.importScope(who, "personal", pack), { code: "memory.conflict" });
    assert.deepEqual(await env.raw.list("personal", "memory-owner"), before);
    assert.deepEqual(env.ledger.marker(who.actor_id, key), marker);
    assert.deepEqual(env.ledger.revisions(original.memory_id), []); assert.deepEqual(env.ledger.changesOf(original.memory_id), []);
  } finally { setup.afterUpdate(); await env.close(); }
});

for (const after of ["edit", "delete", "revoke", "cancel"] as const)
  test(`a fixed duplicate refuses ${after} without appending or changing its receipt`, async t => {
    const setup = await fixture(t); let env = await setup.open();
    try {
      const saved = await env.service.write(caller("guard-seed"), { scope: "personal", text: "Prefer short release summaries", kind: "preference" });
      const id = saved.memory!.memory_id, pack = await env.service.exportScope(caller("export-guard"), "personal"), who = caller("guard-import");
      await env.service.importScope(who, "personal", pack);
      if (after === "edit") await env.service.change(caller("later-edit"), { memory_id: id, action: "update", text: "A later human decision", expected_version: 1 });
      if (after === "delete") await env.service.change(caller("later-delete"), { memory_id: id, action: "remove", expected_version: 1 });
      const before = await env.raw.list("personal", "memory-owner"), markerKey = "memory-operation:guard-import:import:0:import-duplicate";
      const marker = env.ledger.marker(who.actor_id, markerKey), revisions = env.ledger.revisions(id), changes = env.ledger.changesOf(id);
      let appends = 0; setup.afterWrite(async () => { appends++; });
      await env.close(); env = await setup.open();
      if (after === "revoke") setup.authorize(false);
      const controller = new AbortController(); if (after === "cancel") controller.abort();
      await assert.rejects(env.service.importScope({ ...who, signal: controller.signal }, "personal", pack));
      setup.authorize(true);
      assert.equal(appends, 0); assert.deepEqual(await env.raw.list("personal", "memory-owner"), before);
      assert.deepEqual(env.ledger.marker(who.actor_id, markerKey), marker);
      assert.deepEqual(env.ledger.revisions(id), revisions); assert.deepEqual(env.ledger.changesOf(id), changes);
    } finally { setup.authorize(true); await env.close(); }
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

test("selected forget previews the actual SDK purge grant without deleting, and rechecks it before execution", async t => {
  const setup = await fixture(t), env = await setup.open();
  const saved = await env.service.write(caller("seed-batch-preview"), { scope: "personal", text: "Keep the original until confirmed", kind: "preference" });
  const item = { scope: "personal" as const, owner: "memory-owner", memory_id: saved.memory!.memory_id, expected_version: saved.memory!.version };
  const request = { action: "remove" as const, items: [item] }, mutations: string[] = [];
  const bind = env.backend.withCaller.bind(env.backend);
  t.mock.method(env.backend, "withCaller", who => {
    const bound = bind(who);
    return { ...bound, previewMutation: async input => { mutations.push(input.mutation.kind); await bound.previewMutation(input); } };
  });
  setup.denyDelete(item.memory_id);
  await assert.rejects(env.service.batches.preview(caller("preview-denied"), request), { code: "MEMORY_SCOPE_DENIED" });
  assert.equal(env.ledger.marker("memory-owner", "memory-selection:preview-denied"), null);
  assert.deepEqual((await env.raw.list("personal", "memory-owner")).map(entry => entry.memory_id), [item.memory_id]);
  setup.denyDelete();
  const preview = await env.service.batches.preview(caller("preview-purge"), request);
  assert.deepEqual((await env.raw.list("personal", "memory-owner")).map(entry => entry.version), [item.expected_version]);
  setup.denyDelete(item.memory_id);
  const refused = await env.service.batches.apply(caller("apply-denied"), preview.preview_id);
  assert.equal(refused.complete, false); assert.equal(refused.items[0]!.outcome, "refused");
  assert.ok(mutations.length >= 3); assert.ok(mutations.every(kind => kind === "purge"));
  assert.ok(env.ledger.revisions(item.memory_id).length > 0);
  setup.denyDelete();
  assert.equal((await env.service.batches.apply(caller("retry-allowed"), preview.preview_id)).complete, true);
  assert.deepEqual(await env.raw.list("personal", "memory-owner"), []); assert.deepEqual(env.ledger.revisions(item.memory_id), []);
});

// MEM-03/20: the operation fixes the whole package, including entries not yet dispatched.
test("an interrupted import cannot replace an unstarted entry under the same operation", async t => {
  const setup = await fixture(t); let env = await setup.open();
  const texts = ["Prefer concise changelogs", "Use numbered review steps", "Keep original release examples"];
  const pack = { format: "molis.memory" as const, version: 2 as const, scope: "personal" as const, exported_at: "2026-10-24T00:00:00Z", redactions: [],
    entries: texts.map(text => ({ text, kind: "preference" as const, source: "imported" as const, basis: null, applies: {},
      origin: "Original package", expires_at: null, classification: { scenes: ["coding"], lifecycle: "long-term" } })) };
  const who = caller("whole-package-retry"), replacement = "Keep substituted release examples";
  try {
    const bind = env.backend.withCaller.bind(env.backend);
    const fail = t.mock.method(env.backend, "withCaller", (actor: MemoryCaller) => {
      const bound = bind(actor);
      return { ...bound, write: async (input: Parameters<typeof bound.write>[0]) => {
        if (input.text === texts[1]) throw new Error("second entry stopped before SDK write");
        return bound.write(input);
      } };
    });
    await assert.rejects(env.service.importScope(who, "personal", pack), error => {
      const failure = error as { code?: string; details?: Record<string, unknown> };
      assert.equal(failure.code, "memory.conflict"); assert.equal(failure.details?.failed_index, 1);
      assert.equal(failure.details?.not_started, 1); return true;
    });
    fail.mock.restore();
    const before = await env.raw.list("personal", who.actor_id);
    assert.deepEqual(before.map(entry => entry.text), [texts[0]]);
    assert.equal(env.ledger.marker(who.actor_id, "memory-operation:whole-package-retry:import:2:import"), null);
    const firstHistory = env.ledger.revisions(before[0]!.memory_id), firstChanges = env.ledger.changesOf(before[0]!.memory_id);
    await env.close(); env = await setup.open();
    const changed = structuredClone(pack); changed.entries[2]!.text = replacement;
    const retry = await env.service.importScope(who, "personal", changed).then(result => ({ result }), error => ({ error }));
    const afterChanged = await env.raw.list("personal", who.actor_id);
    assert.deepEqual(afterChanged, before, `changed-package retry must write nothing; actual texts: ${JSON.stringify(afterChanged.map(entry => entry.text))}`);
    assert.ok("error" in retry); assert.equal((retry.error as { code?: string }).code, "memory.conflict");
    assert.deepEqual(await env.service.importScope(who, "personal", pack), { written: 3, skipped: 0, refused: 0 });
    const restored = await env.raw.list("personal", who.actor_id);
    assert.deepEqual(restored.map(entry => entry.text).sort(), [...texts].sort());
    assert.deepEqual(env.ledger.revisions(before[0]!.memory_id), firstHistory);
    assert.deepEqual(env.ledger.changesOf(before[0]!.memory_id), firstChanges);
    assert.deepEqual(await env.service.importScope(who, "personal", pack), { written: 3, skipped: 0, refused: 0 });
    assert.deepEqual(await env.raw.list("personal", who.actor_id), restored);
  } finally { await env.close(); }
});

function importPackage(texts: string[]): MemoryExportPackage {
  return { format: "molis.memory" as const, version: 2 as const, scope: "personal" as const, exported_at: "2026-10-24T00:00:00Z", redactions: [],
    entries: texts.map(text => ({ text, kind: "preference" as const, source: "imported" as const, basis: null, applies: { task: "release", plugin_ids: ["first", "second"] },
      origin: "Original package", expires_at: null, classification: { scenes: ["coding"], lifecycle: "long-term" } })) };
}

test("import snapshots nested input before awaiting its first SDK write", async t => {
  const setup = await fixture(t); const env = await setup.open();
  let reached!: () => void, release!: () => void;
  const paused = new Promise<void>(resolve => { reached = resolve; });
  const barrier = new Promise<void>(resolve => { release = resolve; });
  let writes = 0;
  setup.afterWrite(async () => { if (++writes === 1) { reached(); await barrier; } });
  const pack = importPackage(["Use concise summaries", "Include original release examples"]), original = structuredClone(pack);
  const who = caller("package-input-snapshot"), pending = env.service.importScope(who, "personal", pack);
  try {
    await paused;
    pack.entries[1]!.text = "Substituted text";
    pack.entries[1]!.applies.task = "changed task"; pack.entries[1]!.applies.plugin_ids!.reverse();
    pack.entries[1]!.classification!.scenes[0] = "common";
    release();
    assert.deepEqual(await pending, { written: 2, skipped: 0, refused: 0 });
    const entries = await env.raw.list("personal", who.actor_id), second = entries.find(entry => entry.text === original.entries[1]!.text)!;
    assert.ok(second); assert.equal(second.meta.applies_when!.task, "release");
    assert.deepEqual(second.meta.applies_when!.plugins, ["first", "second"]);
    assert.deepEqual(second.meta.classification!.scenes, ["coding"]);
    await env.service.importScope(who, "personal", original);
    assert.deepEqual(await env.raw.list("personal", who.actor_id), entries);
  } finally { release(); await pending.catch(() => undefined); await env.close(); }
});

test("concurrent imports with one operation cannot dispatch different whole packages", async t => {
  const setup = await fixture(t); const env = await setup.open();
  let reached!: () => void, release!: () => void;
  const paused = new Promise<void>(resolve => { reached = resolve; });
  const barrier = new Promise<void>(resolve => { release = resolve; });
  let writes = 0;
  setup.afterWrite(async () => { if (++writes === 1) { reached(); await barrier; } });
  const pack = importPackage(["Use concise summaries", "Keep original review steps"]), changed = structuredClone(pack);
  changed.entries[1]!.text = "Keep competing review steps";
  const who = caller("concurrent-whole-package"), pending = env.service.importScope(who, "personal", pack);
  try {
    await paused;
    const before = await env.raw.list("personal", who.actor_id);
    const rival = await env.service.importScope(who, "personal", changed).then(result => ({ result }), error => ({ error }));
    assert.deepEqual(await env.raw.list("personal", who.actor_id), before, "the rival must not dispatch any new item while the original awaits its first receipt");
    assert.ok("error" in rival); assert.equal((rival.error as { code?: string }).code, "memory.conflict");
    assert.equal(env.ledger.marker(who.actor_id, "memory-operation:concurrent-whole-package:import:1:import"), null);
    release(); assert.deepEqual(await pending, { written: 2, skipped: 0, refused: 0 });
    const entries = await env.raw.list("personal", who.actor_id);
    assert.deepEqual(entries.map(entry => entry.text).sort(), pack.entries.map(entry => entry.text).sort());
    await env.service.importScope(who, "personal", pack);
    assert.deepEqual(await env.raw.list("personal", who.actor_id), entries);
  } finally { release(); await pending.catch(() => undefined); await env.close(); }
});

test("whole import identity includes ordered content and every retained constraint but ignores object key order", async t => {
  const setup = await fixture(t); const env = await setup.open();
  const who = caller("package-field-identity"), pack = importPackage(["Use concise summaries", "Keep original release examples"]);
  try {
    assert.deepEqual(await env.service.importScope(who, "personal", pack), { written: 2, skipped: 0, refused: 0 });
    const before = await env.raw.list("personal", who.actor_id);
    const snapshots = before.map(entry => ({ revisions: env.ledger.revisions(entry.memory_id), changes: env.ledger.changesOf(entry.memory_id) }));
    const markKey = "memory-operation:package-field-identity:import-package", mark = env.ledger.marker(who.actor_id, markKey);
    assert.ok(mark); for (const entry of pack.entries) assert.equal(JSON.stringify(mark).includes(entry.text), false);
    const changes: Array<[string, (value: MemoryExportPackage) => void]> = [
      ["text", value => { value.entries[1]!.text = "Different release examples"; }],
      ["kind", value => { value.entries[1]!.kind = "convention"; }],
      ["origin", value => { value.entries[1]!.origin = "Another original source"; }],
      ["basis", value => { value.entries[1]!.basis = "explicit"; }],
      ["expiry", value => { value.entries[1]!.expires_at = "2099-01-01T00:00:00Z"; }],
      ["task", value => { value.entries[1]!.applies.task = "Another task"; }],
      ["applicability order", value => { value.entries[1]!.applies.plugin_ids!.reverse(); }],
      ["scenes", value => { value.entries[1]!.classification!.scenes.push("common"); }],
      ["lifecycle", value => { value.entries[1]!.classification!.lifecycle = "short-term"; }],
      ["extra classification", value => { value.entries[1]!.classification!.extra = { topic: ["release"] }; }],
      ["session", value => { value.entries[1]!.session_ref = { kind: "session", id: "other-session", revision: 1 }; }],
      ["namespace", value => { value.entries[1]!.namespace = "other-namespace"; }],
      ["fewer entries", value => { value.entries.pop(); }],
      ["more entries", value => { value.entries.push({ ...value.entries[0]!, text: "One more decision" }); }],
      ["entry order", value => { value.entries.reverse(); }],
    ];
    for (const [label, change] of changes) {
      const changed = structuredClone(pack); change(changed);
      await assert.rejects(env.service.importScope(who, "personal", changed), { code: "memory.conflict" }, label);
    }
    await assert.rejects(env.service.importScope(who, "project", pack), { code: "memory.conflict" });
    // Actor identities own separate operation namespaces; owner binding is checked within the same actor's project operation.
    await env.service.importScope(caller("project-package"), "project", importPackage([]));
    await assert.rejects(env.service.importScope({ ...caller("project-package"), project_id: "project-b" }, "project", importPackage([])), { code: "memory.conflict" });
    const reordered = structuredClone(pack);
    reordered.entries = reordered.entries.map(entry => ({ ...Object.fromEntries(Object.entries(entry).reverse()),
      applies: { plugin_ids: entry.applies.plugin_ids, task: entry.applies.task },
      classification: { lifecycle: entry.classification!.lifecycle, scenes: entry.classification!.scenes } } as typeof entry));
    reordered.exported_at = "2099-01-01T00:00:00Z"; reordered.scope = "project";
    reordered.entries[0]!.source = "auto"; reordered.entries[0]!.text = `  ${reordered.entries[0]!.text}  `;
    assert.deepEqual(await env.service.importScope(who, "personal", reordered), { written: 2, skipped: 0, refused: 0 });
    assert.deepEqual(await env.raw.list("personal", who.actor_id), before);
    assert.deepEqual(before.map(entry => ({ revisions: env.ledger.revisions(entry.memory_id), changes: env.ledger.changesOf(entry.memory_id) })), snapshots);
    assert.deepEqual(env.ledger.marker(who.actor_id, markKey), mark);
  } finally { await env.close(); }
});

test("an import with an existing first child cannot guess a missing whole-package identity", async t => {
  const setup = await fixture(t); const env = await setup.open(), who = caller("unbound-package");
  const key = "memory-operation:unbound-package:import:0:import", at = "2026-10-24T00:00:00Z";
  // The exact marker shape left by importScope before whole-package identities existed.
  env.ledger.setMarker(who.actor_id, key, { kind: "import", scope: "personal", owner: who.actor_id,
    operation_id: "unbound-package:import:0:import", at, phase: "pending" }, at);
  try {
    const first = env.ledger.marker(who.actor_id, key);
    await assert.rejects(env.service.importScope(who, "personal", importPackage(["An unproven continuation"])), { code: "memory.conflict" });
    assert.deepEqual(await env.raw.list("personal", who.actor_id), []);
    assert.deepEqual(env.ledger.marker(who.actor_id, key), first);
    assert.equal(env.ledger.marker(who.actor_id, "memory-operation:unbound-package:import-package"), null);
    assert.equal(env.ledger.marker(who.actor_id, "memory-operation:unbound-package:import:0:append"), null);
  } finally { await env.close(); }
});

test("concurrent imports keep the original character owner while caller identity is mutated", async t => {
  const firstOwner = characterOwner("project-a", "first"), secondOwner = characterOwner("project-a", "second");
  const setup = await fixture(t, { project_id: "project-a", owner: firstOwner, additionalOwners: [secondOwner] });
  const env = await setup.open();
  let reached!: () => void, release!: () => void;
  const paused = new Promise<void>(resolve => { reached = resolve; });
  const barrier = new Promise<void>(resolve => { release = resolve; });
  let writes = 0;
  setup.afterWrite(async () => { if (++writes === 1) { reached(); await barrier; } });
  const who = { ...caller("character-package-snapshot"), character: { id: "first", title: "First character" } };
  const original = structuredClone(who), pack = importPackage(["Use concise character summaries", "Keep original character examples"]);
  const pending = env.service.importScope(who, "character", pack);
  try {
    await paused;
    who.character.id = "second"; who.character.title = "Second character";
    release(); assert.deepEqual(await pending, { written: 2, skipped: 0, refused: 0 });
    const first = await env.raw.list("character", firstOwner), second = await env.raw.list("character", secondOwner);
    assert.deepEqual(second, [], "no later item may follow a changed caller reference into another authorized owner");
    assert.deepEqual(first.map(entry => entry.text).sort(), pack.entries.map(entry => entry.text).sort());
    assert.equal((env.ledger.marker(who.actor_id, "memory-operation:character-package-snapshot:import-package")!.body as { owner: string }).owner, firstOwner);
    await env.service.importScope(original, "character", pack);
    assert.deepEqual(await env.raw.list("character", firstOwner), first);
  } finally { release(); await pending.catch(() => undefined); await env.close(); }
});
