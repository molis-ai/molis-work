import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { memoryActions, type MemoryWriteResult, type MemoryChangeResult, type MemoryRecallResponse, type MemoryPageResponse } from "@molis-ai/molis-work-contracts/services/memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { openTestHome } from "./fixtures/test-home.js";

// S-memory-pair-query: a read grant cannot settle a person's pending decision.
async function pairedHome(t: TestContext, expires_at?: string) {
  const home = await openTestHome(t);
  const write = (text: string) => home.web.post<MemoryWriteResult>("/api/memory/items", { scope: "personal", text });
  const a = (await home.web.post<MemoryWriteResult>("/api/memory/items", { scope: "personal", text: "周报使用表格", ...(expires_at ? { expires_at } : {}) })).memory!,
    b = (await write("周报使用要点列表")).memory!;
  // Only the tidy model's classification is controlled; the normal HTTP, owner upkeep and pair write run unchanged.
  const upkeep = MemoryService.prototype.upkeep;
  const classify = t.mock.method(MemoryService.prototype, "upkeep", function (this: MemoryService, caller: Parameters<typeof upkeep>[0], options: Parameters<typeof upkeep>[1]) {
    return upkeep.call(this, caller, { ...options, tidy: async () => ({ duplicates: [], conflicts: [{ a: a.memory_id, b: b.memory_id, why: "周报格式不一致" }] }) });
  });
  try { await home.web.post("/api/memory/upkeep", {}); } finally { classify.mock.restore(); }
  const client = home.host.homeActionClient(), reader = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user" as const, permissions: ["memory:read"] };
  const query = () => client.invoke(reader, memoryActions.pairs, { scope: "personal" });
  const initial = await query(); assert.equal(initial.pairs.length, 1);
  const ledger = openMemoryLedger({ homeDirectory: home.home }); t.after(() => ledger.close());
  const recall = () => home.web.post<MemoryRecallResponse>("/api/memory/recall", { query: "周报", limit: 10 });
  return { home, a, recall, client, reader, query, initial, ledger };
}

test("QEA-58 · read-only pair queries preserve pending decisions while one actual memory is disabled, then recover the conflict", { timeout: 60_000 }, async t => {
  const { home, a, recall, query, initial, ledger } = await pairedHome(t);
  const original = ledger.pairs(LOCAL_PERSON_ACTOR_ID);
  const disabled = await home.web.post<MemoryChangeResult>("/api/memory/change", { memory_id: a.memory_id, expected_version: a.version, action: "disable" });
  assert.deepEqual((await query()).pairs, []);
  assert.deepEqual(ledger.pairs(LOCAL_PERSON_ACTOR_ID), original, "reading does not decide or rewrite the pending pair");
  await home.web.post("/api/memory/change", { memory_id: a.memory_id, expected_version: disabled.memory!.version, action: "enable" });
  assert.equal((await query()).pairs[0]?.pair_id, initial.pairs[0]!.pair_id);
  const recalled = await recall();
  assert.equal(recalled.items.length, 1); assert.equal(recalled.omitted.filter(item => item.reason === "conflict").length, 1);
  await home.web.post(`/api/memory/pairs/${initial.pairs[0]!.pair_id}/resolve`, { keep: "both" });
  assert.deepEqual((await query()).pairs, []);
  assert.equal(ledger.pairs(LOCAL_PERSON_ACTOR_ID)[0]?.state, "resolved");
  assert.equal((await recall()).items.length, 2);
});

test("QEA-59 · failed and cancelled actual owner reads preserve pair decisions; successful deletion cleans the pair", { timeout: 60_000 }, async t => {
  const { home, a, client, reader, query, initial, ledger } = await pairedHome(t);
  const original = ledger.pairs(LOCAL_PERSON_ACTOR_ID), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  t.after(() => release.resolve());
  const system = ensureSystemAgentService(home.host, home.home); await system.ready;
  const capability = system.agentHost.adapter("prologue").memory!, withCaller = capability.withCaller.bind(capability);
  let mode: "fail" | "hold" | "ok" = "fail";
  t.mock.method(capability, "withCaller", (owner: Parameters<typeof withCaller>[0]) => {
    const bound = withCaller(owner), withExecution = bound.withExecution!.bind(bound);
    bound.withExecution = control => {
      const managed = withExecution(control), list = managed.list.bind(managed);
      managed.list = async (...args: Parameters<typeof list>) => {
        const value = await list(...args);
        if (mode === "fail") throw new Error("Fixture pair read unavailable");
        if (mode === "hold") { entered.resolve(); await release.promise; }
        return value;
      };
      return managed;
    };
    return bound;
  });
  await assert.rejects(query(), /Fixture pair read unavailable/);
  assert.deepEqual(ledger.pairs(LOCAL_PERSON_ACTOR_ID), original);
  mode = "hold";
  const controller = new AbortController();
  const pending = client.invoke({ ...reader, signal: controller.signal }, memoryActions.pairs, { scope: "personal" });
  const cancelled = assert.rejects(pending, { name: "AbortError" });
  await entered.promise; controller.abort(); release.resolve(); await cancelled;
  assert.deepEqual(ledger.pairs(LOCAL_PERSON_ACTOR_ID), original);
  mode = "ok";
  assert.deepEqual(await home.web.get("/api/memory/pairs?scope=personal"), initial);
  await home.web.post("/api/memory/change", { memory_id: a.memory_id, expected_version: a.version, action: "remove" });
  assert.deepEqual((await query()).pairs, []);
  assert.deepEqual(ledger.pairs(LOCAL_PERSON_ACTOR_ID), [], "existing forgetting cleanup removes the pair, without a query write");
});

test("QEA-58 · the formal expiry hides an inapplicable pair without deciding it or waiting for upkeep", { timeout: 60_000 }, async t => {
  const { home, a, query, ledger } = await pairedHome(t, new Date(Date.now() + 120_000).toISOString());
  const original = ledger.pairs(LOCAL_PERSON_ACTOR_ID);
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 180_000 });
  const expired = (await home.web.get<MemoryPageResponse>("/api/memory/overview?scope=personal")).items.find(item => item.memory_id === a.memory_id)!;
  assert.equal(expired.expired, true);
  assert.equal(expired.state, "active", "management preserves the owner's state and projects expiry separately");
  assert.deepEqual((await query()).pairs, []);
  assert.deepEqual(ledger.pairs(LOCAL_PERSON_ACTOR_ID), original);
});
