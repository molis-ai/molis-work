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

async function fixture(t: TestContext, character?: { project_id: string; owner: string }, plugin?: string) {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-cas-"));
  const appId = "io.molis.work.memory-cas";
  let denied: string | undefined;
  let afterWrite: (() => Promise<void>) | undefined;
  let afterCandidatePurge: (() => Promise<void>) | undefined;
  let afterRemove: (() => void) | undefined;
  let authorized = true;
  const memory = currentMemoryOptions({ appId, scopesFor: who => [{ scope: "user", owner: who.actor_id },
    ...(who.project_id ? [{ scope: "project" as const, owner: who.project_id }] : []),
    ...(character && who.project_id === character.project_id ? [{ scope: "character" as const, owner: character.owner }] : [])],
    allowed: () => authorized,
    beforeAuthorize: async (_who, requests) => requests.every(request => request.action !== "delete" || request.target.ref.id !== denied) });
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
        remove: async input => { await bound.remove(input); afterRemove?.(); },
        candidates: { ...bound.candidates, purge: async input => { await bound.candidates.purge(input); await afterCandidatePurge?.(); } } };
    };
    // SDK grants and App ledger authority are separate boundaries, governed by the same current test grant.
    const service = new MemoryService({ backend, ledger, timeZone: "Asia/Shanghai", beforeEffect: async () => {
      if (!authorized) throw new Error("fixture App ledger authority revoked");
    } });
    return { service, ledger, backend, raw: backend.withCaller(caller("raw-read")), close };
  };
  t.after(() => rm(home, { recursive: true, force: true }));
  return { open, denyDelete: (id?: string) => { denied = id; }, afterWrite: (hook?: () => Promise<void>) => { afterWrite = hook; },
    afterCandidatePurge: (hook?: () => Promise<void>) => { afterCandidatePurge = hook; },
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
        await assert.rejects(env.service.change(who, request), { code: "STORAGE_CONFLICT" });
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
