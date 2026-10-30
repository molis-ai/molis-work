import assert from "node:assert/strict";
import test from "node:test";
import type { AgentMemoryUseReceipt } from "@molis-ai/molis-work-contracts/services/agent-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { memoryServiceHome } from "./fixtures/memory-service-home.js";

const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project", consumer: "ui", person: true } as const;
const at = "2026-10-23T01:00:00.000Z";
function receipt(state: AgentMemoryUseReceipt["contexts"][number]["status"], ids: readonly string[], call = "call-1"): AgentMemoryUseReceipt {
  return { run: { session_id: "session", run_id: "run" }, owner: { actor_id: caller.actor_id, project_id: "project", plugin_id: "coding", install_id: "coding" },
    started_at: at, consumer: "agent", usage: { title: "Release preparation", work_id: "work" }, contexts: [{ call_id: call, status: state,
      tokens: 80, budget_tokens: 800, basis: "conservative-estimate", parts: [{ index: 0, tokens: 80, form: "entry" }],
      references: ids.map(memory_id => ({ memory_id, version: 1, receipt_id: "retrieval" })) }] };
}

test("only final dispatch facts advance recent reference; duplicates, unknown and legacy records cannot claim model use", async t => {
  const env = await memoryServiceHome(t, { projects: ["project"] });
  const service = await env.open(), ledger = env.ledger();
  const saved = await service.write({ ...caller, operation_id: "seed" }, { scope: "project", kind: "convention", text: "Release notes go in CHANGELOG.md" });
  assert.ok(saved.memory); const id = saved.memory.memory_id;
  service.settleUses(receipt("prepared", [id])); assert.deepEqual(service.uses({ work_id: "work" }), []);
  service.settleUses(receipt("not-dispatched", [id])); assert.equal(ledger.lastUse(id), null);
  service.settleUses(receipt("dispatched-or-unknown", [id])); assert.equal(ledger.lastUse(id), null);
  assert.equal(service.uses({ work_id: "work" })[0]!.state, "dispatched-or-unknown");
  service.settleUses(receipt("response-observed", [id]));
  const observed = ledger.lastUse(id); assert.equal(observed?.state, "response-observed");
  service.settleUses(receipt("not-dispatched", [id], "call-2"));
  service.settleUses(receipt("dispatched-or-unknown", [id], "call-3"));
  service.settleUses(receipt("response-observed", [id], "call-4"));
  assert.deepEqual(ledger.lastUse(id), observed, "one summary retains the original strongest call evidence, not a fabricated call count");
  assert.equal(service.uses({ work_id: "work" }).length, 1);
  const changed = receipt("response-observed", [id]); changed.contexts[0]!.references[0]!.version = 2;
  assert.throws(() => service.settleUses(changed), { code: "memory.conflict" });
  ledger.recordUses([{ memory_id: id, receipt_id: "legacy", at: "2099-01-01T00:00:00.000Z", consumer: "agent", title: "Legacy", work_id: null, state: "used" }]);
  assert.deepEqual(ledger.lastUse(id), observed, "old used labels carry no dispatch evidence");
  const result = await service.recall(caller, { scopes: ["project"], query: "Release notes" });
  assert.ok(result.items.some(item => item.memory_id === id));
  const recalled = service.uses({ receipt_id: result.receipt_id });
  assert.equal(recalled[0]!.source, "recall"); assert.equal(recalled[0]!.state, "returned");
  assert.deepEqual(ledger.lastUse(id), observed);
  await env.close(); await env.open();
  assert.deepEqual(env.ledger().lastUse(id), observed, "receipt summary survives reopening the real ledger");
});

test("late multi-reference receipt skips a forgotten identity and still records the surviving reference", async t => {
  const env = await memoryServiceHome(t, { projects: ["project"] }); const service = await env.open();
  const first = await service.write({ ...caller, operation_id: "first" }, { scope: "project", text: "Release notes use markdown" });
  const second = await service.write({ ...caller, operation_id: "second" }, { scope: "project", text: "Keep review comments concise" });
  assert.ok(first.memory && second.memory);
  env.ledger().forget(first.memory.memory_id);
  service.settleUses(receipt("response-observed", [first.memory.memory_id, second.memory.memory_id]));
  assert.deepEqual(service.uses({ work_id: "work" }).map(use => use.memory_id), [second.memory.memory_id]);
  assert.equal(env.ledger().lastUse(first.memory.memory_id), null);
});
