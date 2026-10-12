import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_QUESTION_PROBLEM_REASONS, AGENT_QUESTION_TYPES, servicesAgentInteractionContract,
  type AgentQuestion, type AgentQuestionAnswer, type InteractionOutcome,
} from "@molis-ai/molis-work-contracts/services/agent-interaction";

test("AC-19: the interaction contract names its owner and states the closed sets a consumer switches on", () => {
  assert.equal(servicesAgentInteractionContract.contractId, "io.molis.work.service.agent-interaction.v1");
  assert.deepEqual([...AGENT_QUESTION_TYPES], ["choice", "text", "number", "date", "datetime", "reference"]);
  assert.equal(new Set(AGENT_QUESTION_PROBLEM_REASONS).size, AGENT_QUESTION_PROBLEM_REASONS.length, "no reason is listed twice");
  assert.equal(AGENT_QUESTION_PROBLEM_REASONS.length, 19, "the SDK's closed set of machine reasons, spelled the same");
});
test("AC-19: a typed question set, its answers and a single-call plugin's need are expressible without any SDK or domain type", () => {
  const questions: AgentQuestion[] = [
    { index: 0, id: "format", prompt: "沟通方式", type: "choice", required: true, options: [{ index: 0, label: "一起复盘", description: "先对齐", recommended: true }], multiple: false, allow_other: true },
    { index: 1, id: "minutes", prompt: "时长", type: "number", required: true, options: [], multiple: false, allow_other: false, min: 15, max: 120, integer: true, default: 30 },
    { index: 2, id: "goal", prompt: "关联 Goal", type: "reference", required: false, options: [], multiple: false, allow_other: false, ref_kinds: ["goal"], max_count: 1 },
  ];
  const answers: AgentQuestionAnswer[] = [{ question: 0, indexes: [0] }, { question: 1, value: 45 }, { question: 2, value: null }];
  assert.equal(answers.length, questions.length, "every question is answered exactly once");
  const outcome: InteractionOutcome<{ form_id: string }> = { status: "needs_input", request: { request_id: "ask-1", title: "还差几项", questions, subject: { kind: "form", id: "f1", revision: "3" } } };
  assert.equal(outcome.status === "needs_input" && outcome.request.questions[1]!.type, "number");
  const done: InteractionOutcome<{ form_id: string }> = { status: "done", result: { form_id: "f1" } };
  assert.equal(done.status === "done" && done.result.form_id, "f1");
});
