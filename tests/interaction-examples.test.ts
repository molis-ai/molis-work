import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentQuestionHtml, hostQuestionTypes, hostReferenceKinds, questionErrors } from "@molis-ai/molis-work-app-local-host";
import { AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { questionAnswer } from "@molis-ai/molis-work-plugin-sdk";
import { cogniaModelResponse, cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";

// specs/ai-interaction-experience §15.8 example 1 (AC-12, AC-04): the model asks for a moment, a length and a Goal in one card;
// one field filled wrong is named on its own; the corrected answer lets the same run go on. Examples 2 and 3 are covered where
// they live: an operation card in `action-cards` and `agent-host-offers`, Form's ask-first drafting in `form-draft-questions`.

const say = (text: string, values?: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, key: string) => String(values?.[key] ?? ""));
const ASKED = { why: "约下周的复盘会", questions: [
  { id: "at", type: "datetime", prompt: "开会时间" },
  { id: "minutes", type: "number", prompt: "时长", min: 15, max: 120, integer: true, unit: "分钟" },
  { id: "goal", type: "reference", prompt: "关联的 Goal", refKinds: ["goal"] },
] };

test("AC-12 §15.8 example 1: one card asks for a moment, a length and a Goal; a wrong length is named on its own field, and the corrected answer lets the run go on", { timeout: 30_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "interaction-example-1-"));
  const bodies: Array<{ messages?: unknown }> = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(await new Request(input, init).text()) as { messages?: unknown });
    return bodies.length === 1 ? cogniaScriptedResponse({ name: "ask-user", input: ASKED }) : cogniaModelResponse("复盘会已安排。");
  });
  // The Goal's owner names it now; the page's label never reaches the run (S-26).
  const read: Array<readonly { kind: string; id: string }[]> = [];
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.interaction-example-test", appVersion: "1.0.0" },
    storageRoot: join(home, "sdk"), questionTypes: hostQuestionTypes(), referenceKinds: hostReferenceKinds(), reviewQueue: new AgentReviewQueue(),
    readReferences: async (_owner, picked) => { read.push(picked); return picked.map(item => item.id === "g1" ? { label: "Q4 发布" } : null); },
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only",
  });
  t.after(async () => { await adapter.close(); await rm(home, { recursive: true, force: true }); });
  const owner = { project_id: "example", plugin_id: "io.molis.work.test", install_id: "test", actor_id: "person" };
  const session = await adapter.createSession({ ...owner, workspace: "business", title: "Example 1" });
  const role = { role_id: "helper", version: 1, workspace: "business" as const, execution: "operate" as const, prompts: [], host_tools: ["ask-user"] };
  const handle = await adapter.start({ ...owner, session, workspace: "business", role_id: "helper", role, task: "帮我约一个下周的复盘会" });
  const deadline = Date.now() + 20_000;
  let pending: AgentPendingQuestion | undefined;
  while (!(pending = (await adapter.read(handle.ref)).awaiting_input.find(item => item.answerable && item.kind === "questionnaire"))) {
    assert.ok(Date.now() < deadline, "the run did not stop on the questionnaire");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  const questions = pending.questions!;
  assert.deepEqual(questions.map(item => item.type), ["datetime", "number", "reference"]);

  // The shared card draws all three: a date and a time, a stepper with its unit, and a search of Goals only.
  const html = agentQuestionHtml(pending, say);
  assert.match(html, /data-ix-part="time"/);
  assert.match(html, /data-ix-value="n1"[\s\S]*?<span class="mw-ix-unit"[^>]*>分钟<\/span>/);
  assert.match(html, /data-ix-field="r2"[\s\S]*?data-ix-ref-source="goal"/);

  const send = (values: Record<string, unknown>) => {
    const answer = questionAnswer(values);
    assert.ok(answer && "answers" in answer);
    return adapter.control(handle.ref, { kind: "answer", pending_id: pending!.pending_id, pending_revision: pending!.pending_revision, answers: answer.answers });
  };
  const good = { w0: { date: "2026-10-23", time: "15:00" }, n1: "45", r2: [{ value: "goal g1", label: "页面写的标题" }] };
  let problems: Parameters<typeof questionErrors>[0] = [];
  await assert.rejects(send({ ...good, n1: "240" }), (error: unknown) => {
    assert.ok(error instanceof ActionError); assert.equal(error.code, "agent.answer_invalid");
    problems = (error as ActionError & { problems?: typeof problems }).problems ?? [];
    return true;
  });
  assert.deepEqual(questionErrors(problems, say, questions), { n1: "不能超过 120 分钟" }, "only the wrong field gets a line, naming its limit");
  assert.equal((await adapter.read(handle.ref)).phase, "awaiting-input", "the question stays open for the correction");
  assert.equal(bodies.length, 1, "the model heard nothing of the refused answer");

  await send(good);
  while (!["completed", "failed", "stopped", "cancelled"].includes((await adapter.read(handle.ref)).phase)) {
    assert.ok(Date.now() < deadline, "the run did not go on after the answer");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal((await adapter.read(handle.ref)).phase, "completed", "the same run went on");
  assert.deepEqual(read.at(-1), [{ kind: "goal", id: "g1" }], "the Goal was read back from its owner before the run heard it");
  const told = JSON.stringify(bodies[1]!.messages);
  for (const part of ["2026-10-23T15:00", "45", "g1", "Q4 发布"]) assert.ok(told.includes(part), `the run went on with ${part}`);
  assert.ok(!told.includes("页面写的标题"), "under its owner's title, not the page's");
});
