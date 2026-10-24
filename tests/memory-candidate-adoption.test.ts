import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_KINDS, MEMORY_FORMAL_KINDS, type MemoryCandidateDecision, type MemoryCandidate, type MemoryItem } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { memoryRuntimePolicy, prologueMemoryBackend, MolisWorkLocalHost, ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { memoryServiceHome } from "./fixtures/memory-service-home.js";
import { seedLegacyCandidate } from "./fixtures/memory-candidate-adoption.js";
import { openTestHome, serveTestHost } from "./fixtures/test-home.js";

const START = Date.parse("2026-10-24T08:00:00Z"), DAY = 86_400_000;
const caller = (operation_id: string): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", consumer: "ui",
  person: true, purpose: "management", current_scene: "common", operation_id });
const formal: NonNullable<MemoryCandidateDecision["formal"]> = { kind: "habit", classification: { scenes: ["assistant"], lifecycle: "long-term" }, expires_at: null };

test("CAND-01/05: actual candidate HTTP forwards the complete formal decision and lets the shared schema reject invalid choices", { timeout: 60_000 }, async t => {
  const env = await openTestHome(t), project = await env.createProject("Candidate HTTP adoption");
  await env.close(); await env.host.close();
  await seedLegacyCandidate({ home: env.home, storageRoot: join(env.home, "agent-runtime"), project: project.project_id, id: "http-old", at: Date.now() });
  const host = new MolisWorkLocalHost({ homeDirectory: env.home, completeText: null });
  const server = await serveTestHost(null, { home: env.home, host });
  try {
    const system = ensureSystemAgentService(host, env.home); await system.ready;
    const memory = system.agentHost.adapter("prologue").memory!.withCaller({ ...caller("inspect"), project_id: project.project_id });
    const snapshot = async () => ({ entries: await memory.list("project", project.project_id), candidates: await memory.candidates.list("project", project.project_id) });
    const before = await snapshot(), expiry = new Date(Date.now() + 30 * DAY).toISOString();
    const chosen = { kind: "project-decision", classification: { scenes: ["coding"], lifecycle: "short-term" }, expires_at: expiry };
    const post = (formal: unknown) => fetch(server.origin + `/projects/${project.project_id}/api/memory/candidates/http-old/accept`, {
      method: "POST", headers: { origin: server.origin, "content-type": "application/json", "x-molis-work-control-token": server.controlToken,
        "x-molis-work-idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ operation_id: crypto.randomUUID(), expected_version: 1, formal }),
    });
    // Observe the actual Service boundary, without replacing its implementation or result.
    const accept = MemoryService.prototype.accept, received: unknown[] = [];
    t.mock.method(MemoryService.prototype, "accept", function(this: MemoryService, ...args: Parameters<MemoryService["accept"]>) {
      received.push(structuredClone(args[2]?.formal)); return accept.apply(this, args);
    });
    for (const invalid of [{ ...chosen, owner: "forged-owner" }, { ...chosen, classification: { scenes: ["unknown"], lifecycle: "long-term" } },
      { kind: chosen.kind, classification: chosen.classification }]) {
      const refused = await post(invalid); assert.notEqual(refused.status, 200); await refused.arrayBuffer();
      assert.deepEqual(received, [], "shared Action schema rejects invalid formal before Service; the HTTP route must not silently discard it");
      assert.deepEqual(await snapshot(), before);
    }
    const response = await post(chosen), result = await response.json() as { candidate: MemoryCandidate; memory: MemoryItem | null };
    assert.equal(response.status, 200, JSON.stringify(result)); assert.deepEqual(received, [chosen]);
    assert.equal(result.candidate.candidate_id, "http-old"); assert.equal(result.candidate.state, "accepted");
    assert.equal(result.memory!.kind, "project-decision"); assert.equal(result.memory!.expires_at, expiry);
    const after = await snapshot(); assert.equal(after.entries.length, 1); assert.equal(after.candidates[0]!.version, 2);
    assert.deepEqual(after.entries[0]!.meta.classification, chosen.classification);
    assert.equal(after.entries[0]!.meta.expires_at_ms, Date.parse(expiry));
    assert.equal(after.entries[0]!.meta.basis, undefined); assert.deepEqual(after.entries[0]!.meta.evidence ?? [], []);
  } finally { await server.close(); await host.close(); }
});

test("CAND-05: project overview includes its registered character candidates without personal or foreign-project candidates", { timeout: 60_000 }, async t => {
  const env = await openTestHome(t), project = await env.createProject("Character candidate owner"), other = await env.createProject("Other candidate owner");
  await env.close(); await env.host.close();
  const base = { home: env.home, storageRoot: join(env.home, "agent-runtime"), at: Date.now() };
  await seedLegacyCandidate({ ...base, project: project.project_id, id: "project-pending" });
  await seedLegacyCandidate({ ...base, project: project.project_id, id: "role-pending", character: { id: "reviewer", title: "Reviewer" } });
  await seedLegacyCandidate({ ...base, project: other.project_id, id: "foreign-pending", character: { id: "reviewer", title: "Reviewer" } });
  await seedLegacyCandidate({ ...base, project: project.project_id, id: "personal-pending", personal: true });
  const host = new MolisWorkLocalHost({ homeDirectory: env.home, completeText: null }), server = await serveTestHost(null, { home: env.home, host });
  try {
    const pending = async (path: string) => {
      const response = await fetch(server.origin + path), result = await response.json() as { candidates: MemoryCandidate[] };
      assert.equal(response.status, 200, JSON.stringify(result)); return result.candidates.map(item => item.candidate_id).sort();
    };
    const target = `/projects/${project.project_id}/api/memory/overview`;
    assert.deepEqual(await pending(target), ["project-pending", "role-pending"]);
    assert.deepEqual(await pending("/api/memory/overview"), ["personal-pending"]);
    assert.deepEqual(await pending(`/projects/${other.project_id}/api/memory/overview`), ["foreign-pending"]);
    const refused = await fetch(server.origin + `/projects/${other.project_id}/api/memory/candidates/role-pending/accept`, {
      method: "POST", headers: { origin: server.origin, "content-type": "application/json", "x-molis-work-control-token": server.controlToken,
        "x-molis-work-idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ operation_id: crypto.randomUUID(), expected_version: 1, formal }),
    });
    assert.notEqual(refused.status, 200); await refused.arrayBuffer();
    assert.deepEqual(await pending(target), ["project-pending", "role-pending"]);
  } finally { await server.close(); await host.close(); }
});

test("CAND-05: an unrelated project overview cannot expire a personal candidate whose original accept is waiting for finish", { timeout: 60_000 }, async t => {
  let now = START; t.mock.timers.enable({ apis: ["Date"], now });
  const env = await openTestHome(t), project = await env.createProject("Independent project candidates");
  await env.close(); await env.host.close();
  const base = { home: env.home, storageRoot: join(env.home, "agent-runtime"), project: project.project_id };
  await seedLegacyCandidate({ ...base, id: "personal-recover", personal: true, at: now, formalExpiry: null, meta: { classification: formal.classification } });
  await seedLegacyCandidate({ ...base, id: "personal-expired", personal: true, at: now });
  let service!: MemoryService, jointSeen = false, interrupted = false;
  const ledger = openMemoryLedger({ homeDirectory: env.home });
  const policy = memoryRuntimePolicy(() => ({ alive: () => true, prefsFor: (scope, id) => service.prefsFor(LOCAL_PERSON_ACTOR_ID, scope, id),
    owners: id => ledger.owners(id), candidateOwners: id => ledger.candidateOwners(id), projectExists: async id => id === project.project_id, deletingProject: () => undefined }));
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: base.storageRoot, memory: {
    ...policy, promotion: { policy: "memory.write-gate", version: 3, decide: (who, request) => service.promotion.decide(who, request),
      undo: { prepare: (who, request) => service.promotion.undo.prepare(who, request), record: (who, request) => service.promotion.undo.record(who, request) } },
    async authorize(who, requests) {
      const allowed = await policy.authorize(who, requests);
      const joint = requests.some(request => request.action === "accept" && request.target.ref.kind === "memory")
        && requests.some(request => request.action === "accept" && request.target.ref.kind === "memory-candidate");
      if (jointSeen && requests.length === 1 && requests[0]!.action === "accept" && requests[0]!.target.ref.kind === "memory-candidate") {
        interrupted = true; throw new Error("Interrupted personal candidate finish");
      }
      if (joint) jointSeen = true;
      return allowed;
    },
  }, modelConfiguration: async () => { throw new Error("No model in project candidate isolation test"); } });
  const who = { ...caller("personal-original"), project_id: null }, backend = prologueMemoryBackend(async () => adapter.memory!);
  service = new MemoryService({ backend, ledger });
  try {
    await assert.rejects(service.accept(who, "personal-recover", { expected_version: 1, formal }), /Interrupted personal candidate finish/);
    assert.equal(interrupted, true); assert.equal((await backend.withCaller(who).list("personal", LOCAL_PERSON_ACTOR_ID)).length, 1);
    assert.equal((await backend.withCaller(who).candidates.get({ scope: "personal", owner: LOCAL_PERSON_ACTOR_ID, candidate_id: "personal-recover" }))!.state, "pending");
  } finally { await adapter.close(); ledger.close(); }
  now = START + 15 * DAY;
  t.mock.timers.setTime(now);
  await seedLegacyCandidate({ ...base, id: "project-fresh", at: now });
  await seedLegacyCandidate({ ...base, id: "character-fresh", at: now, character: { id: "reviewer", title: "Reviewer" } });
  const host = new MolisWorkLocalHost({ homeDirectory: env.home, completeText: null }), server = await serveTestHost(null, { home: env.home, host });
  try {
    const system = ensureSystemAgentService(host, env.home); await system.ready;
    const memory = prologueMemoryBackend(async () => system.agentHost.adapter("prologue").memory!).withCaller(who);
    const snapshot = async () => {
      const notes = openMemoryLedger({ homeDirectory: env.home });
      try {
        const entries = await memory.list("personal", LOCAL_PERSON_ACTOR_ID);
        return { entries, candidates: await memory.candidates.list("personal", LOCAL_PERSON_ACTOR_ID),
          notes: notes.candidates(LOCAL_PERSON_ACTOR_ID).filter(item => item.scope === "personal"),
          revisions: notes.revisions(entries[0]!.memory_id), changes: notes.changes(LOCAL_PERSON_ACTOR_ID, 100),
          accept: notes.marker(LOCAL_PERSON_ACTOR_ID, "memory-operation:personal-original:accept:personal-recover") };
      } finally { notes.close(); }
    };
    const before = await snapshot(); assert.ok(before.accept); assert.equal(before.candidates.every(item => item.state === "pending"), true);
    // Observe the actual Action's operation identity so an expiry marker cannot hide behind a failed response.
    let overviewOperation: string | undefined;
    const originalCandidates = MemoryService.prototype.candidates;
    t.mock.method(MemoryService.prototype, "candidates", function(this: MemoryService, ...args: Parameters<MemoryService["candidates"]>) {
      if (args[0].project_id === project.project_id) overviewOperation = args[0].operation_id;
      return originalCandidates.apply(this, args);
    });
    const response = await fetch(server.origin + `/projects/${project.project_id}/api/memory/overview`), result = await response.json() as { candidates: MemoryCandidate[]; code?: string };
    t.diagnostic(`Project overview while unrelated personal accept awaits finish: HTTP ${response.status}, code ${result.code ?? "none"}`);
    // The whole personal SDK state and App ledger remain untouched even if this response fails.
    assert.deepEqual(await snapshot(), before);
    assert.ok(overviewOperation);
    const notes = openMemoryLedger({ homeDirectory: env.home });
    try { for (const id of ["personal-recover", "personal-expired"]) assert.equal(notes.marker(LOCAL_PERSON_ACTOR_ID, `memory-operation:${overviewOperation}:expired:${id}`), null); }
    finally { notes.close(); }
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.deepEqual(result.candidates.map(item => item.candidate_id).sort(), ["character-fresh", "project-fresh"]);
  } finally { await server.close(); await host.close(); }
});

async function fixture(t: Parameters<typeof memoryServiceHome>[0], count = 1, extra: Partial<Parameters<typeof seedLegacyCandidate>[0]> = {}) {
  let now = START;
  const f = await memoryServiceHome(t, { projects: ["project-a"], now: () => new Date(now) });
  for (let i = 0; i < count; i++) await seedLegacyCandidate({ home: f.home, storageRoot: join(f.home, "sdk"), project: "project-a", id: `legacy-${i}`, at: START, ...extra });
  return { ...f, service: await f.open(), time: (at: number) => { now = at; } };
}

test("CAND-01: real old candidate IDs accept all six formal kinds without inventing basis, evidence or sources", async t => {
  const f = await fixture(t, 6);
  assert.deepEqual(MEMORY_KINDS, ["preference", "convention", "fact", "experience"]);
  const pending = await f.service.candidates(caller("list"), { scope: "project" });
  assert.equal(pending.length, 6);
  for (const item of pending) {
    assert.equal(item.classification, null); assert.equal("formal_expires_at" in item, false);
    assert.equal(item.waiting_expires_at, new Date(START + 14 * DAY).toISOString());
  }
  for (const [index, kind] of MEMORY_FORMAL_KINDS.entries()) {
    const id = `legacy-${index}`, result = await f.service.accept(caller(`accept-${index}`), id, { expected_version: 1, formal: { ...formal, kind } });
    assert.equal(result.candidate.candidate_id, id); assert.equal(result.candidate.version, 2);
    assert.equal(result.memory!.kind, kind); assert.equal(result.memory!.basis, null); assert.deepEqual(result.memory!.evidence, []);
    const canonical = (await f.raw(caller("raw")).candidates.list("project", "project-a")).find(one => one.candidate_id === id)!;
    assert.deepEqual(canonical.sources ?? [], []); assert.equal(canonical.state, "accepted");
  }
  await f.close(); const reopened = await f.open();
  assert.deepEqual((await reopened.page(caller("page"), { scope: "project" })).items.map(one => one.kind).sort(), [...MEMORY_FORMAL_KINDS].sort());
});

test("CAND-02: unknown retention requires complete choice; short-term deadline and legacy App TTL are independent", async t => {
  const f = await fixture(t, 3);
  await assert.rejects(f.service.accept(caller("unknown"), "legacy-0", { expected_version: 1 }));
  await assert.rejects(f.service.accept(caller("short-no-date"), "legacy-0", { expected_version: 1,
    formal: { ...formal, classification: { scenes: ["coding"], lifecycle: "short-term" } } }));
  assert.deepEqual(await f.raw(caller("before")).list("project", "project-a"), []);
  const expiry = new Date(START + 30 * DAY).toISOString();
  const kept = await f.service.accept(caller("short"), "legacy-0", { expected_version: 1,
    formal: { ...formal, classification: { scenes: ["coding"], lifecycle: "short-term" }, expires_at: expiry } });
  assert.equal(kept.memory!.expires_at, expiry);
  const raw = (await f.raw(caller("raw")).list("project", "project-a"))[0]!;
  assert.deepEqual(raw.meta.classification, { scenes: ["coding"], lifecycle: "short-term" });
  f.time(START + 14 * DAY);
  await assert.rejects(f.service.accept(caller("expired"), "legacy-1", { expected_version: 1, formal }));
  assert.equal((await f.raw(caller("after")).list("project", "project-a")).length, 1);
});

test("CAND-01/02: recorded null retains canonical classification, namespace, applicability and basis without extra source evidence", async t => {
  const f = await fixture(t, 1, { formalExpiry: null, meta: { classification: { scenes: ["assistant"], lifecycle: "long-term" },
    namespace: "example.plugin", basis: "repeated", appliesWhen: { task: "Before publication" }, evidence: [{ kind: "quote", text: "Existing evidence" }] } });
  const projected = (await f.service.candidates(caller("list"), { scope: "project" }))[0]!;
  assert.equal(projected.formal_expires_at, null); assert.deepEqual(projected.classification, { scenes: ["assistant"], lifecycle: "long-term" });
  await f.service.accept(caller("accept"), projected.candidate_id, { expected_version: projected.version });
  const kept = (await f.raw(caller("raw")).list("project", "project-a"))[0]!;
  assert.equal(kept.meta.namespace, "example.plugin"); assert.equal(kept.meta.basis, "repeated");
  assert.deepEqual(kept.meta.applies_when, { task: "Before publication" });
  assert.deepEqual(kept.meta.evidence, [{ kind: "quote", text: "Existing evidence" }]); assert.equal(kept.meta.expires_at_ms, undefined);
});

test("CAND-02: Session authority cannot be replaced by an explicit classification decision", async t => {
  const f = await fixture(t, 1, { sessionBound: true });
  assert.ok((await f.raw(caller("before")).candidates.list("project", "project-a"))[0]!.meta.session_ref);
  await assert.rejects(f.service.accept(caller("accept"), "legacy-0", { expected_version: 1, formal }), /会话记忆需要可信会话管理入口/);
  assert.deepEqual(await f.raw(caller("raw")).list("project", "project-a"), []);
  assert.equal(f.ledger().candidates(LOCAL_PERSON_ACTOR_ID)[0]!.state, "pending");
});

test("CAND-03: SDK commit with ledger failure repairs the same decision after restart and TTL; changed decisions and later versions conflict", async t => {
  const f = await fixture(t), who = caller("accept"), request = { expected_version: 1, text: "Approved exact wording", formal };
  const fail = t.mock.method(f.ledger(), "addRevision", () => { throw new Error("ledger interrupted"); });
  await assert.rejects(f.service.accept(who, "legacy-0", request), /ledger interrupted/);
  fail.mock.restore();
  assert.equal((await f.raw(caller("raw")).candidates.list("project", "project-a"))[0]!.state, "accepted");
  await f.close(); f.time(START + 15 * DAY); const reopened = await f.open();
  for (const changed of [{ ...request, text: "Changed words" }, { ...request, expected_version: 2 },
    { ...request, formal: { ...formal, kind: "fact" as const } }, { ...request, formal: { ...formal, expires_at: new Date(START + 30 * DAY).toISOString() } }]) {
    await assert.rejects(reopened.accept(who, "legacy-0", changed));
  }
  const result = await reopened.accept(who, "legacy-0", request);
  assert.equal(result.memory!.version, 1); assert.equal(f.ledger().revisions(result.memory!.memory_id).length, 1);
  await reopened.accept(who, "legacy-0", request);
  assert.equal(f.ledger().revisions(result.memory!.memory_id).length, 1);
  const changed = await reopened.change(caller("later"), { memory_id: result.memory!.memory_id, expected_version: 1, action: "update", text: "Later independent wording" });
  await assert.rejects(reopened.accept(who, "legacy-0", request));
  assert.equal((await f.raw(caller("final")).list("project", "project-a"))[0]!.version, changed.memory!.version);
});

test("CAND-03: a development-era marker without complete identity cannot reconstruct an already committed SDK decision", async t => {
  const classification = { scenes: ["assistant"], lifecycle: "long-term" };
  const f = await fixture(t, 1, { formalExpiry: null, meta: { classification } }), who = caller("legacy-no-digest");
  const operation_id = `${who.operation_id}:accept:legacy-0`, key = `memory-operation:${operation_id}`;
  const at = new Date(START).toISOString();
  // The unmerged earlier contract stored the candidate version here, without a full decision digest.
  f.ledger().setMarker(LOCAL_PERSON_ACTOR_ID, key, { kind: "accept", scope: "project", owner: "project-a",
    candidate_id: "legacy-0", expected_version: 1, operation_id, at, phase: "pending" }, at);
  const committed = await f.raw(who).candidates.accept({ scope: "project", owner: "project-a", candidate_id: "legacy-0",
    expected_version: 1, operation_id, text: "Historical suggestion legacy-0", origin: "Original approved suggestion",
    meta: { kind: "convention", source: "accepted", classification, approved_by: { by: "person" } } });
  await f.close(); const reopened = await f.open();
  const snapshot = async () => ({
    formal: await f.raw(who).list("project", "project-a"),
    canonicalCandidates: await f.raw(who).candidates.list("project", "project-a"),
    candidateNotes: f.ledger().candidates(LOCAL_PERSON_ACTOR_ID),
    revisions: f.ledger().revisions(committed.memory_id), changes: f.ledger().changes(LOCAL_PERSON_ACTOR_ID, 100),
    marker: f.ledger().marker(LOCAL_PERSON_ACTOR_ID, key),
  });
  const before = await snapshot();
  assert.equal(before.formal.length, 1); assert.equal(before.canonicalCandidates[0]!.state, "accepted");
  assert.equal(before.candidateNotes[0]!.state, "pending"); assert.deepEqual(before.revisions, []); assert.deepEqual(before.changes, []);
  await assert.rejects(reopened.accept(who, "legacy-0", { expected_version: 1 }), { code: "memory.conflict" });
  assert.deepEqual(await snapshot(), before);
});

test("CAND-04: the existing same-text target is fixed once; stale target cannot become an append", async t => {
  const f = await fixture(t), who = caller("target");
  const saved = (await f.service.write(caller("save"), { scope: "project", text: "Historical suggestion legacy-0" })).memory!;
  const fail = t.mock.method(f.ledger(), "addRevision", () => { throw new Error("ledger interrupted"); });
  await assert.rejects(f.service.accept(who, "legacy-0", { expected_version: 1, formal }), /ledger interrupted/); fail.mock.restore();
  await f.close(); const reopened = await f.open();
  const repaired = await reopened.accept(who, "legacy-0", { expected_version: 1, formal });
  assert.equal(repaired.memory!.memory_id, saved.memory_id); assert.equal(repaired.memory!.version, saved.version + 1);
  await reopened.change(caller("remove"), { memory_id: saved.memory_id, expected_version: repaired.memory!.version, action: "remove" });
  await assert.rejects(reopened.accept(who, "legacy-0", { expected_version: 1, formal }));
  assert.deepEqual(await f.raw(caller("empty")).list("project", "project-a"), []);
});

test("CAND-03/04: overlapping truncated evidence stays identical through real settleInto, ledger failure and restart", async t => {
  const quote = (text: string) => ({ kind: "quote", text });
  const f = await fixture(t, 1, { formalExpiry: null, meta: { classification: formal.classification, evidence: [quote("a"), quote("g")] } });
  const target = await f.raw(caller("target")).write({ scope: "project", owner: "project-a", operation_id: "target",
    text: "Historical suggestion legacy-0", origin: "Original target", meta: { kind: "convention", source: "manual",
      classification: formal.classification, evidence: ["a", "b", "c", "d", "e", "f"].map(quote), approved_by: { by: "person" } } });
  const who = caller("evidence"), request = { expected_version: 1, formal };
  const fail = t.mock.method(f.ledger(), "addRevision", () => { throw new Error("ledger interrupted"); });
  await assert.rejects(f.service.accept(who, "legacy-0", request), /ledger interrupted/); fail.mock.restore();
  const committed = await f.raw(who).list("project", "project-a");
  assert.equal(committed.length, 1); assert.equal(committed[0]!.memory_id, target.memory_id);
  assert.equal(committed[0]!.version, target.version + 1);
  assert.deepEqual(committed[0]!.meta.evidence, ["c", "d", "e", "f", "a", "g"].map(quote));
  assert.deepEqual(f.ledger().revisions(target.memory_id), []);
  await f.close(); const reopened = await f.open();
  const repaired = await reopened.accept(who, "legacy-0", request);
  assert.equal(repaired.memory!.memory_id, target.memory_id); assert.equal(repaired.memory!.version, target.version + 1);
  assert.deepEqual(await f.raw(who).list("project", "project-a"), committed);
  const revisions = f.ledger().revisions(target.memory_id); assert.equal(revisions.length, 1);
  assert.deepEqual(revisions[0]!.snapshot!.meta.evidence, committed[0]!.meta.evidence);
  await reopened.accept(who, "legacy-0", request);
  assert.deepEqual(f.ledger().revisions(target.memory_id), revisions);
});

for (const mode of ["append", "settleInto"] as const) for (const point of ["before-formal", "before-finish"] as const)
test(`CAND-03: ${mode} ${point} failure restarts after TTL with only the original committed work recoverable`, async t => {
  // Known canonical classification isolates recovery from the separate SDK unknown-class adoption dependency.
  const f = await fixture(t, 1, { formalExpiry: null, meta: { classification: formal.classification } }); await f.close();
  let service!: MemoryService, ledger!: ReturnType<typeof openMemoryLedger>;
  let adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined;
  let armed = true, jointSeen = false, faultHit = false, expiredJointDenied = false;
  const open = async () => {
    ledger = openMemoryLedger({ homeDirectory: f.home });
    const policy = memoryRuntimePolicy(() => ({ alive: () => true, prefsFor: (scope, project) => service.prefsFor(LOCAL_PERSON_ACTOR_ID, scope, project),
      owners: project => ledger.owners(project), candidateOwners: project => ledger.candidateOwners(project), projectExists: async () => true, deletingProject: () => undefined }));
    adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(f.home, "sdk"), memory: {
      ...policy, promotion: { policy: "memory.write-gate", version: 3, decide: (who, request) => service.promotion.decide(who, request),
        undo: { prepare: (who, request) => service.promotion.undo.prepare(who, request), record: (who, request) => service.promotion.undo.record(who, request) } },
      async authorize(who, requests) {
        const joint = requests.some(request => request.action === "accept" && request.target.ref.kind === "memory")
          && requests.some(request => request.action === "accept" && request.target.ref.kind === "memory-candidate");
        const allowed = await policy.authorize(who, requests);
        if (joint && !allowed && Date.now() >= START + 14 * DAY) expiredJointDenied = true;
        // SDK invokes the single-candidate reconcile guard in finish, after the formal writer returns.
        const finish = jointSeen && requests.length === 1 && requests[0]!.action === "accept"
          && requests[0]!.target.ref.kind === "memory-candidate";
        if (joint) jointSeen = true;
        if (armed && (point === "before-formal" ? joint : finish)) {
          armed = false; faultHit = true; throw new Error(`Interrupted ${point}`);
        }
        return allowed;
      },
    }, modelConfiguration: async () => { throw new Error("No model in candidate recovery tests"); } });
    const backend = prologueMemoryBackend(async () => adapter!.memory!);
    service = new MemoryService({ backend, ledger, now: () => new Date(Date.now()) });
    return backend.withCaller(caller("inspect"));
  };
  const close = async () => { await adapter?.close(); adapter = undefined; ledger.close(); };
  try {
    let raw = await open();
    if (mode === "settleInto") await service.write(caller("target"), { scope: "project", text: "Historical suggestion legacy-0" });
    const before = await raw.list("project", "project-a"), who = caller("recover"), request = { expected_version: 1, formal };
    await assert.rejects(service.accept(who, "legacy-0", request)); assert.equal(faultHit, true);
    const committed = await raw.list("project", "project-a"), candidate = (await raw.candidates.list("project", "project-a"))[0]!;
    assert.equal(candidate.state, "pending"); assert.equal(candidate.version, 1);
    const mark = ledger.marker(LOCAL_PERSON_ACTOR_ID, "memory-operation:recover:accept:legacy-0")!.body as { input_digest: string; candidate_expected_version: number };
    assert.equal(typeof mark.input_digest, "string"); assert.equal(mark.candidate_expected_version, 1);
    if (point === "before-formal") assert.deepEqual(committed, before);
    else { assert.equal(committed.length, 1); assert.equal(committed[0]!.version, mode === "append" ? 1 : before[0]!.version + 1); }
    await close(); f.time(START + 15 * DAY); raw = await open();
    if (point === "before-formal") {
      await assert.rejects(service.accept(who, "legacy-0", request));
      assert.equal(expiredJointDenied, true, "the original marker reaches SDK but cannot authorize a new formal commit after TTL");
      assert.deepEqual(await raw.list("project", "project-a"), before);
      assert.equal((await raw.candidates.list("project", "project-a"))[0]!.state, "pending");
    } else {
      const repaired = await service.accept(who, "legacy-0", request);
      assert.equal(repaired.candidate.state, "accepted"); assert.equal(repaired.candidate.version, 2);
      assert.equal(repaired.memory!.memory_id, committed[0]!.memory_id); assert.deepEqual(await raw.list("project", "project-a"), committed);
      assert.equal(ledger.revisions(committed[0]!.memory_id).filter(revision => revision.version === committed[0]!.version).length, 1);
      await service.accept(who, "legacy-0", request); assert.deepEqual(await raw.list("project", "project-a"), committed);
    }
  } finally { await close(); }
});

for (const mode of ["append", "settleInto"] as const) test(`CAND-02: ${mode} crosses the legacy TTL inside SDK joint authorization without a formal side effect`, { timeout: 60_000 }, async t => {
  const f = await fixture(t); await f.close();
  const ledger = openMemoryLedger({ homeDirectory: f.home });
  let service!: MemoryService, armed = false, enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  const policy = memoryRuntimePolicy(() => ({ alive: () => true, prefsFor: (scope, project) => service.prefsFor(LOCAL_PERSON_ACTOR_ID, scope, project),
    owners: project => ledger.owners(project), candidateOwners: project => ledger.candidateOwners(project), projectExists: async () => true, deletingProject: () => undefined }));
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(f.home, "sdk"), memory: {
    ...policy, promotion: { policy: "memory.write-gate", version: 3, decide: (who, request) => service.promotion.decide(who, request),
      undo: { prepare: (who, request) => service.promotion.undo.prepare(who, request), record: (who, request) => service.promotion.undo.record(who, request) } },
    async authorize(who, requests) {
      const allowed = await policy.authorize(who, requests);
      if (armed && requests.some(request => request.action === "accept" && request.target.ref.kind === "memory")
        && requests.some(request => request.action === "accept" && request.target.ref.kind === "memory-candidate")) {
        armed = false; enter(); await gate;
      }
      return allowed;
    },
  }, modelConfiguration: async () => { throw new Error("No model in candidate acceptance tests"); } });
  const backend = prologueMemoryBackend(async () => adapter.memory!);
  service = new MemoryService({ backend, ledger, now: () => new Date(Date.now()) });
  try {
    if (mode === "settleInto") await service.write(caller("target"), { scope: "project", text: "Historical suggestion legacy-0" });
    const before = await backend.withCaller(caller("before")).list("project", "project-a");
    armed = true;
    const accepting = service.accept(caller("accept"), "legacy-0", { expected_version: 1, formal });
    await Promise.race([entered, accepting.then(() => assert.fail("accept must wait at the real joint commit"))]);
    f.time(START + 14 * DAY); release();
    await assert.rejects(accepting);
    assert.deepEqual(await backend.withCaller(caller("after")).list("project", "project-a"), before);
    assert.equal(ledger.candidates(LOCAL_PERSON_ACTOR_ID)[0]!.state, "pending");
  } finally { release?.(); await adapter.close(); ledger.close(); }
});
