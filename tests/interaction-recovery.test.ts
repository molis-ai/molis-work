import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hostQuestionTypes, hostReferenceKinds } from "@molis-ai/molis-work-app-local-host";
import { AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { questionAnswer } from "@molis-ai/molis-work-plugin-sdk";
import { cogniaModelResponse, cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";

// specs/ai-interaction-experience AC-08: two places answer one question. AC-07 (a question outliving the Host closing) is met
// by BL-156: a normal shutdown parks the waiting round and its question is answered after reopening (interaction-parked-answer,
// prologue-start-refusal; its refusals in security-invariants-parked-answer).

const ASKED = { why: "约下周的复盘会", questions: [
  { id: "at", type: "datetime", prompt: "开会时间" },
  { id: "minutes", type: "number", prompt: "时长", min: 15, max: 120, integer: true, unit: "分钟" },
  { id: "goal", type: "reference", prompt: "关联的 Goal", refKinds: ["goal"] },
] };
const GOOD = { w0: { date: "2026-10-23", time: "15:00" }, n1: "45", r2: [{ value: "goal g1", label: "页面写的标题" }] };
const owner = { project_id: "recovery", plugin_id: "io.molis.work.test", install_id: "test", actor_id: "person" };
const role = { role_id: "helper", version: 1, workspace: "business" as const, execution: "operate" as const, prompts: [], host_tools: ["ask-user"] };
const ENDED = ["completed", "failed", "stopped", "cancelled"];

async function fixture(t: import("node:test").TestContext, name: string) {
  const home = await mkdtemp(join(tmpdir(), `interaction-${name}-`));
  const bodies: Array<{ messages?: unknown }> = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(await new Request(input, init).text()) as { messages?: unknown });
    return bodies.length === 1 ? cogniaScriptedResponse({ name: "ask-user", input: ASKED }) : cogniaModelResponse("复盘会已安排。");
  });
  const open = () => createPrologueNodeAdapter({ app: { appId: `io.molis.work.interaction-${name}-test`, appVersion: "1.0.0" },
    storageRoot: join(home, "sdk"), questionTypes: hostQuestionTypes(), referenceKinds: hostReferenceKinds(), reviewQueue: new AgentReviewQueue(),
    readReferences: async (_owner, picked) => picked.map(item => item.id === "g1" ? { label: "Q4 发布" } : null),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only",
  });
  t.after(() => rm(home, { recursive: true, force: true }));
  return { bodies, open };
}

type Adapter = Awaited<ReturnType<typeof createPrologueNodeAdapter>>;
async function waiting(adapter: Adapter, run: Parameters<Adapter["read"]>[0], deadline: number): Promise<AgentPendingQuestion> {
  for (;;) {
    const pending = (await adapter.read(run)).awaiting_input.find(item => item.answerable && item.kind === "questionnaire");
    if (pending) return pending;
    assert.ok(Date.now() < deadline, "the run did not stop on the questionnaire");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
async function ended(adapter: Adapter, run: Parameters<Adapter["read"]>[0], deadline: number): Promise<string> {
  for (;;) {
    const { phase } = await adapter.read(run);
    if (ENDED.includes(phase)) return phase;
    assert.ok(Date.now() < deadline, "the run did not go on after the answer");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
const answer = (pending: AgentPendingQuestion) => {
  const read = questionAnswer(GOOD);
  assert.ok(read && "answers" in read);
  return { kind: "answer" as const, pending_id: pending.pending_id, pending_revision: pending.pending_revision, answers: read.answers };
};

test("AC-08: two places answering the same question at once: one answer is taken, the other is refused, and the model hears once", { timeout: 60_000 }, async t => {
  const { bodies, open } = await fixture(t, "race");
  const adapter = await open();
  t.after(() => adapter.close());
  const session = await adapter.createSession({ ...owner, workspace: "business", title: "Race" });
  const handle = await adapter.start({ ...owner, session, workspace: "business", role_id: "helper", role, task: "帮我约一个下周的复盘会" });
  const deadline = Date.now() + 40_000;
  const pending = await waiting(adapter, handle.ref, deadline);

  const results = await Promise.allSettled([adapter.control(handle.ref, answer(pending)), adapter.control(handle.ref, answer(pending))]);
  assert.deepEqual(results.map(result => result.status).sort(), ["fulfilled", "rejected"], "exactly one answer is taken");
  const refused = results.find((result): result is PromiseRejectedResult => result.status === "rejected")!.reason as { code?: string };
  // The answer that loses the race reaches the SDK after the other one settled the question there; the SDK's code is mapped.
  assert.equal(refused.code, "agent.pending_not_open", "the other is refused because the question was already answered");
  assert.equal(await ended(adapter, handle.ref, deadline), "completed");
  assert.equal(bodies.length, 2, "the model heard the answer once");

  // Answering again after the run went on is refused too.
  await assert.rejects(adapter.control(handle.ref, answer(pending)), (error: { code?: string }) => error.code === "agent.pending_not_open",
    "the Host refuses it as not an open question of this round");
  assert.equal(bodies.length, 2);
});
