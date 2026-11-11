import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { createPrologueNodeAdapter, type PrologueNodeAdapterOptions } from "@molis-ai/molis-work-service-agent-host";
import { memoryRuntimePolicy, prologueMemoryBackend, type MemoryRuntimePolicyOwner } from "@molis-ai/molis-work-app-local-host";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { acquireStorageOwner, initializeMemoryForgetting, openMemoryLedger } from "@molis-ai/molis-work-storage";

// BL-1072 end to end on the vendored SDK: the runtime policy's authorizeEach reaches the SDK through the agent-host bridge, a
// recall page is decided in one Authority call, a refused entry drops alone, and the visible set is the one the per-entry path
// gives. Without the option the bridge installs no authorizeEach and the SDK asks one entry at a time, as before.
const person = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "a", consumer: "ui", person: true, current_scene: "common", purpose: "management" as const };
type Memory = NonNullable<PrologueNodeAdapterOptions["memory"]>;
type Request = Parameters<Memory["authorize"]>[1][number];
const isRead = (requests: readonly Request[]) => requests.length > 0 && requests.every(request => request.action === "read" || request.action === "manage-read");

async function fixture(t: TestContext, options: { each: boolean }) {
  const home = await mkdtemp(join(tmpdir(), "molis-authorize-each-")), storageOwner = acquireStorageOwner(join(home, "agent-runtime"));
  initializeMemoryForgetting({ homeDirectory: home, storageOwner, assertCurrent() {} });
  const ledger = openMemoryLedger({ homeDirectory: home, storageOwner });
  let service!: MemoryService, adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined;
  t.after(async () => { await adapter?.close(); ledger.close(); storageOwner.release(); await rm(home, { recursive: true, force: true }); });
  const calls = { single: 0, each: [] as number[] };
  // When set, the first forgetting check of a policy call accepts this forgetting before answering: the facts change mid-call.
  let midCall: (() => void) | undefined;
  const owner: MemoryRuntimePolicyOwner = { alive: () => true, prefsFor: (scope, project) => service.prefsFor(person.actor_id, scope, project),
    forgettingPhase: () => {
      const real = service.forgettingPhase();
      return { ...real, isForgotten: (...args) => { const answer = real.isForgotten(...args); const change = midCall; midCall = undefined; change?.(); return answer; } };
    },
    owners: project => ledger.owners(project), candidateOwners: project => ledger.candidateOwners(project),
    projectExists: async id => id === "a", deletingProject: () => undefined };
  const { authorizeEach, ...policy } = memoryRuntimePolicy(() => owner);
  assert.ok(authorizeEach, "the runtime policy answers each read request");
  const memory: Memory = { ...policy,
    async authorize(caller, requests) { if (isRead(requests) && requests.length === 1) calls.single++; return policy.authorize(caller, requests); },
    ...(options.each ? { async authorizeEach(caller: Parameters<typeof authorizeEach>[0], requests: readonly Request[]) {
      calls.each.push(requests.length); return authorizeEach(caller, requests);
    } } : {}),
    promotion: { policy: "memory.write-gate", version: 1, decide: (caller, request) => service.promotion.decide(caller, request),
      undo: { prepare: (caller, request) => service.promotion.undo.prepare(caller, request), record: (caller, request) => service.promotion.undo.record(caller, request) } },
  };
  adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "agent-runtime"), storageOwner, memory,
    modelConfiguration: async () => { assert.fail("recall and lists must not call a model"); } });
  service = new MemoryService({ ledger, backend: prologueMemoryBackend(async () => adapter!.memory!) });
  const bound = adapter.memory!.withCaller(person);
  const written: Awaited<ReturnType<typeof bound.write>>[] = [];
  for (let at = 0; at < 6; at++) written.push(await bound.write({ scope: "project", owner: "a", operation_id: `amber-${at}`, text: `amber convention ${at}`, origin: "person",
    meta: { kind: "convention", source: "manual", classification: { scenes: ["common"], lifecycle: "long-term" } } }));
  const forget = (entry: (typeof written)[number], operation_id: string) => ledger.forgetting.accept({ selection_mode: "exact-identities", scope: "project", owner: "a",
    operation_id, actor_id: LOCAL_PERSON_ACTOR_ID, memories: [{ memory_id: entry.memory_id, version: entry.version }], candidates: [], source_event_ids: [] });
  const reset = () => { calls.single = 0; calls.each.length = 0; };
  reset();
  return { bound, written, calls, forget, reset, raceWith: (change: () => void) => { midCall = change; } };
}
const recalled = async (f: Awaited<ReturnType<typeof fixture>>) =>
  (await f.bound.recall({ scope: "project", owner: "a", text: "amber" })).map(hit => hit.entry.memory_id).sort();

test("MEM-38 BL-1072 a recall page reaches the policy's authorizeEach once; a forgotten entry drops alone; the visible set is the per-entry path's", async t => {
  const each = await fixture(t, { each: true }), single = await fixture(t, { each: false });
  for (const f of [each, single]) { f.forget(f.written[2]!, "forget-third"); f.reset(); }
  const withEach = await recalled(each), withoutEach = await recalled(single);
  const expected = (f: typeof each) => f.written.filter((_, at) => at !== 2).map(entry => entry.memory_id).sort();
  assert.deepEqual(withEach, expected(each));
  assert.deepEqual(withoutEach, expected(single));
  assert.deepEqual(each.calls.each, [6], "one Authority call carries the whole scanned page");
  assert.equal(each.calls.single, 0, "no candidate needs a grant of its own");
  assert.equal(single.calls.each.length, 0, "without the option the bridge installs no authorizeEach, so the SDK never asks it");
  assert.ok(single.calls.single >= 6, "without it every scanned entry is asked on its own, as before");
});

test("MEM-38 BL-1072 a forgetting accepted while the page is decided fails the whole recall; no old text is delivered", async t => {
  const f = await fixture(t, { each: true });
  f.raceWith(() => f.forget(f.written[4]!, "forget-mid-page"));
  // The policy's closing re-read throws memory.conflict; the SDK reports the recall failed and the bridge refuses to return it.
  await assert.rejects(f.bound.recall({ scope: "project", owner: "a", text: "amber" }), { code: "agent.capability_unavailable" });
  assert.deepEqual(f.calls.each, [6]);
  const after = await recalled(f);
  assert.ok(!after.includes(f.written[4]!.memory_id), "the forgetting stands and its entry stays out");
});

test("MEM-38 BL-1072 a management list returns the same entries with or without authorizeEach", async t => {
  const each = await fixture(t, { each: true }), single = await fixture(t, { each: false });
  const listed = async (f: typeof each) => (await f.bound.list("project", "a")).map(entry => entry.memory_id).sort();
  const [a, b] = [await listed(each), await listed(single)];
  assert.deepEqual(a, each.written.map(entry => entry.memory_id).sort());
  assert.deepEqual(b, single.written.map(entry => entry.memory_id).sort());
  assert.ok(each.calls.each.length > 0 && each.calls.each.every(size => size === 6), "each list read is answered per request in one call");
  assert.equal(single.calls.each.length, 0);
  assert.equal(each.calls.single, 0, "no listed entry needs a grant of its own");
});
