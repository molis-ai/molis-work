import assert from "node:assert/strict";
import test from "node:test";
import { observeRun, type RunObservationStart } from "@molis-ai/molis-work-service-agent-host";
import type { AgentRoundSkill, AgentRunRef, AgentRunView, AgentTextMaterial } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ObservationFactInput } from "@molis-ai/molis-work-contracts/services/observation";

// OCL-01 OCL-05 OCL-06 OCL-08 (specs/observation-collection/design.md §4「各类 AI」): the event projection writes one record for
// every stage a round can report — prompt, tool, usage with the model in force, model switch, compaction, memory, guardrails,
// waiting and retry, changed files, a dispatched subagent, and the end. The runtime's own tool traffic is a pure projection here,
// so every branch is covered without a particular runtime path being the only witness.

const ref: AgentRunRef = { run_id: "run-1", session_id: "session-1" };
const skill: AgentRoundSkill = {
  ref: { source: { kind: "plugin", plugin_id: "io.example", plugin_version: "1", publisher_signature: "fixture" }, skill_id: "release-notes", version: 2,
    install_id: "install-1", installation_generation: "g1" },
  origin: "own", name: "Release notes", tools: [], named: true, body: "Group the notes by area.",
};
const material: AgentTextMaterial = { material_id: "m1", title: "Release notes", text: "v2: faster sync" };
const frozen: AgentRunView["frozen"] = {
  workspace: "business", call_id: "call-1", role_id: "reader", role_version: 3, execution: "read-only", model_id: "m1",
  prompts: [{ prompt_id: "reader.base", version: 4, layer: "base" }], skills: [skill], mcp_tools: [], host_tools: [], text_materials: [], budget: null,
};
const start: RunObservationStart = { task: "Summarise the release notes", prompts: [{ prompt_id: "reader.base", body: "Read carefully." }], skills: [skill], materials: [material] };
const model = { protocol: "openai-compatible", endpoint: "http://127.0.0.1/v1", model: "m1", credential_ref: "fixture" };
const usage = (tokens: number) => ({ input: { source: "reported" as const, tokens }, output: { source: "reported" as const, tokens: 2 },
  cacheRead: { source: "unknown" as const, tokens: undefined }, cacheWrite: { source: "unknown" as const, tokens: undefined },
  cost: { source: "unknown" as const, amount: undefined, currency: undefined } });

test("OCL-01 OCL-05 OCL-06 OCL-08: a round's main event path becomes its work records, with the model in force", () => {
  const facts: ObservationFactInput[] = [];
  const observer = observeRun({ record: fact => { facts.push(fact); } }, ref, frozen, start, model);
  observer.event({ type: "text-delta", text: "Ready to " });
  observer.event({ type: "reasoning-delta", text: "first think" });
  observer.event({ type: "text-delta", text: "help." });
  observer.event({ type: "prompt", role: "system", text: "You are a reader.", source: "app" });
  observer.event({ type: "tool-call", call: { id: "t1", name: "read", input: { path: "notes.md" } } });
  observer.event({ type: "tool-result", callId: "t1", name: "read", text: "the notes", outcome: "returned" });
  observer.event({ type: "usage-recorded", callId: "c1", receipt: usage(10) });
  observer.event({ type: "model-switched", from: { protocol: "openai-compatible", model: "m1" }, to: { protocol: "openai-compatible", model: "m2" } });
  observer.event({ type: "usage-recorded", callId: "c2", receipt: usage(20) });
  observer.event({ type: "compacted", replaced: 2 });
  observer.event({ type: "memory-recalled", injected: [{ id: "memory-1", version: 2 }], omitted: [], unavailable: [], retrieval: { outcome: "ready" } });
  observer.event({ type: "tripped", stage: "input", rail: "prompt", why: "blocked" });
  observer.event({ type: "tripped", stage: "output", rail: "source", why: "failed", failed: true });
  observer.event({ type: "circuit-tripped", reason: "repeated", count: 3 });
  observer.event({ type: "awaiting-approval", effectRef: { kind: "effect", id: "e1", revision: 1 }, pendingRef: { kind: "pending", id: "p1", revision: 1 }, why: "allow?" });
  observer.event({ type: "awaiting-input", pendingRef: { id: "q1" }, kind: "question", why: "answer?" });
  observer.event({ type: "retry-waiting", model: "m2", attempt: 1, waitMs: 100, retryAtMs: 1, reason: "rate-limited", why: "busy" });
  observer.event({ type: "turn-changes", turn: 1, changes: [{ path: "notes.md", byteLength: 10, digest: "digest-1", checkpointId: "checkpoint-1" }] });
  observer.event({ type: "subagent-started", session: { id: "child-session" }, run: { id: "child-run" }, character: "child" });
  observer.event({ type: "subagent-ended", session: { id: "child-session" }, run: { id: "child-run" }, state: "completed" });
  observer.event({ type: "completed" });

  const factsOf = (name: string) => facts.filter(fact => fact.fact === name);
  const line = (fact: ObservationFactInput) => `${fact.fact}:${fact.stage ?? ""}:${fact.outcome}`;
  assert.deepEqual(facts.map(line), [
    "agent.run:started:succeeded", "agent.instructions::succeeded", "agent.materials::succeeded", "agent.skill:effective:succeeded",
    "agent.reply::succeeded", "agent.prompt:system:succeeded", "agent.tool:read:succeeded",
    "agent.usage:model:succeeded", "agent.model:switched:succeeded", "agent.usage:model:succeeded",
    "agent.compaction::succeeded", "agent.memory:recalled:succeeded", "agent.guard:input:refused", "agent.guard:output:failed", "agent.guard:circuit:refused",
    "agent.waiting:approval:waiting", "agent.waiting:input:waiting", "agent.retry::waiting",
    "agent.changes::succeeded", "agent.subagent:started:succeeded", "agent.subagent:ended:succeeded", "agent.run:ended:succeeded",
  ]);
  const reply = factsOf("agent.reply")[0]!;
  assert.deepEqual(reply.evidence?.map(item => item.role), ["reply", "reasoning"], "the reply and the reasoning the model reported");
  const prompt = factsOf("agent.prompt")[0]!;
  assert.equal(prompt.detail?.source, "app");
  const tool = factsOf("agent.tool")[0]!;
  assert.deepEqual(tool.evidence?.map(item => item.ref.kind), ["content", "content"], "a runtime tool's input and result are kept as evidence");
  const uses = factsOf("agent.usage");
  assert.deepEqual(uses.map(fact => fact.conditions?.model), [{ provider: "openai-compatible", model_id: "m1" }, { provider: "openai-compatible", model_id: "m2" }],
    "usage after a switch names the model in force, not only the round's starting model");
  assert.equal(uses[0]!.detail?.model_call_id, "c1"); assert.equal(uses[1]!.detail?.model_call_id, "c2");
  assert.equal(factsOf("agent.compaction")[0]!.detail?.replaced, 2);
  assert.deepEqual(factsOf("agent.memory")[0]!.subjects?.at(-1), { kind: "memory", id: "memory-1", version: 2 });
  assert.deepEqual(factsOf("agent.guard").map(fact => [fact.stage, fact.outcome]), [["input", "refused"], ["output", "failed"], ["circuit", "refused"]]);
  assert.deepEqual(factsOf("agent.retry")[0]!.detail, { reason: "rate-limited", attempt: 1, wait_ms: 100 });
  assert.deepEqual(factsOf("agent.changes")[0]!.evidence?.map(item => item.ref), [{ kind: "owner", owner: "agent-runtime", id: "checkpoint-1", version: "digest-1" }]);
  assert.deepEqual(factsOf("agent.subagent").map(fact => [fact.stage, fact.detail?.child_run_id, fact.subjects?.at(-1)]), [
    ["started", "child-run", { kind: "agent_session", id: "child-session" }], ["ended", "child-run", { kind: "agent_session", id: "child-session" }]]);
  assert.equal(factsOf("agent.run").at(-1)!.stage, "ended");
  assert.ok(facts.every(fact => fact.work?.run_id === "run-1" && fact.subjects?.[0]?.id === "session-1"), "every record belongs to the round");
});

test("OCL-08: a round's failures, cancellation, action tools and compaction variants keep their outcomes", () => {
  const facts: ObservationFactInput[] = [];
  const observer = observeRun({ record: fact => { facts.push(fact); } }, ref, frozen, start, model);
  observer.event({ type: "tool-call", call: { id: "a1", name: "molis-action-scope-notes", input: { note: "x" } } });
  observer.event({ type: "tool-result", callId: "a1", name: "molis-action-scope-notes", text: "recorded", outcome: "returned" });
  observer.event({ type: "tool-call", call: { id: "t2", name: "read", input: { path: "notes.md" } } });
  observer.event({ type: "tool-result", callId: "t2", name: "read", text: "denied", outcome: "failed", errorCode: "files.forbidden" });
  observer.event({ type: "compaction-skipped" });
  observer.event({ type: "compaction-failed", why: "too large" });
  observer.event({ type: "compaction-cancelled" });
  observer.event({ type: "compaction-usage-recorded", callId: "c3", receipt: usage(30) });
  observer.event({ type: "subagent-ended", session: { id: "child-session" }, run: { id: "child-run" }, state: "failed" });
  observer.event({ type: "subagent-ended", session: { id: "child-session-2" }, run: { id: "child-run-2" }, state: "cancelled" });
  observer.event({ type: "failed", error: { code: "agent.timeout", safeMessage: "timed out" } });
  observer.event({ type: "cancelled" });
  const factsOf = (name: string) => facts.filter(fact => fact.fact === name);
  assert.deepEqual(factsOf("agent.tool").map(fact => [fact.stage, fact.outcome, fact.evidence?.map(item => item.ref.kind)]), [
    ["molis-action-scope-notes", "succeeded", ["missing", "missing"]], ["read", "failed", ["content", "content"]]]);
  assert.equal(factsOf("agent.tool")[0]!.evidence?.every(item => item.ref.kind === "missing" && item.ref.reason === "by_rule"), true);
  assert.equal(factsOf("agent.tool")[1]!.detail?.code, "files.forbidden");
  assert.deepEqual(factsOf("agent.compaction").map(fact => [fact.stage, fact.outcome]), [[undefined, "no_action"], [undefined, "failed"], [undefined, "cancelled"]]);
  assert.deepEqual(factsOf("agent.usage").map(fact => [fact.stage, fact.detail?.model_call_id]), [["compaction", undefined]]);
  assert.deepEqual(factsOf("agent.subagent").map(fact => [fact.stage, fact.outcome]), [["ended", "failed"], ["ended", "cancelled"]]);
  assert.deepEqual(factsOf("agent.run").map(fact => [fact.stage, fact.outcome, fact.detail?.code]).slice(-2), [["ended", "failed", "agent.timeout"], ["ended", "cancelled", undefined]]);
});
