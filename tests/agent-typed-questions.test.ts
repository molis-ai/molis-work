import assert from "node:assert/strict";
import test from "node:test";

import { ASSISTANT_QUESTION_TYPES, CODING_QUESTION_TYPES, hostQuestionTypes } from "@molis-ai/molis-work-app-local-host";
import { AGENT_QUESTION_PROBLEM_REASONS, AGENT_QUESTION_TYPES } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { answerProblems, projectQuestion } from "@molis-ai/molis-work-service-agent-host";

type Sdk = Parameters<typeof projectQuestion>[0];
const choice: Sdk = { index: 0, prompt: "沟通方式", options: [{ index: 0, label: "一起复盘", description: "先对齐", recommended: true }, { index: 1, label: "异步审阅" }] };
const typed: Sdk[] = [
  { index: 0, id: "format", prompt: "沟通方式", options: [{ index: 0, label: "一起复盘" }, { index: 1, label: "异步审阅" }], default: [0], allowOther: true },
  { index: 1, id: "notes", prompt: "补充要求", options: [], type: "text", multiline: true, maxLength: 200, required: false, help: "说清想解决什么。" },
  { index: 2, id: "minutes", prompt: "时长", options: [], type: "number", min: 15, max: 120, integer: true },
  { index: 3, id: "deadline", prompt: "截止", options: [], type: "date", min: "2026-01-01" },
  { index: 4, id: "goal", prompt: "关联 Goal", options: [], type: "reference", refKinds: ["goal"], maxCount: 1 },
];

test("AC-17 / AC-04: a choice question from the Runtime is shown with an explicit type and requiredness and no SDK object", () => {
  const shown = projectQuestion(choice);
  assert.deepEqual(shown, { index: 0, prompt: "沟通方式", type: "choice", required: true, multiple: false, allow_other: false,
    options: [{ index: 0, label: "一起复盘", description: "先对齐", recommended: true }, { index: 1, label: "异步审阅" }] });
  assert.ok(!("id" in shown) && !("help" in shown), "an absent field stays absent rather than becoming undefined");
});

test("AC-17: every typed field is carried under its snake_case name, and a default is copied, not shared", () => {
  const shown = typed.map(projectQuestion);
  assert.deepEqual(shown[0]?.default, [0]);
  assert.notEqual(shown[0]?.default, (typed[0] as { default: unknown }).default);
  assert.equal(shown[0]?.id, "format"); assert.equal(shown[0]?.allow_other, true);
  assert.deepEqual([shown[1]?.type, shown[1]?.required, shown[1]?.multiline, shown[1]?.max_length, shown[1]?.help], ["text", false, true, 200, "说清想解决什么。"]);
  assert.deepEqual([shown[2]?.min, shown[2]?.max, shown[2]?.integer], [15, 120, true]);
  assert.deepEqual([shown[3]?.type, shown[3]?.min], ["date", "2026-01-01"]);
  assert.deepEqual([shown[4]?.ref_kinds, shown[4]?.max_count], [["goal"], 1]);
});

test("AC-17 / AC-04: a complete, in-range answer has no problems", () => {
  assert.deepEqual(answerProblems(typed, [
    { question: 0, indexes: [0] }, { question: 1, value: "" }, { question: 2, value: 45 },
    { question: 3, value: "2026-10-30" }, { question: 4, value: [{ kind: "goal", id: "g1", label: "内部试用" }] },
  ]), []);
});

test("AC-04 / AC-17: each wrong answer is named on its own question with the SDK's closed reason, and the others stay quiet", () => {
  const problems = answerProblems(typed, [
    { question: 0, indexes: [0] }, { question: 1, value: "" }, { question: 2, value: 999 },
    { question: 3, value: "2026-02-31" }, { question: 4, value: [] },
  ]);
  const by = new Map(problems.map(problem => [problem.question, problem]));
  assert.equal(by.get(2)?.reason, "too-large"); assert.equal(by.get(2)?.id, "minutes");
  assert.equal(by.get(3)?.reason, "bad-date");
  assert.equal(by.get(4)?.reason, "required");
  assert.ok(!by.has(0) && !by.has(1), "answered and optional questions carry no problem");
  for (const problem of problems) assert.ok((AGENT_QUESTION_PROBLEM_REASONS as readonly string[]).includes(problem.reason), problem.reason);
  assert.ok(problems.every(problem => !("message" in problem)), "the person reads the reason through the surface's own text, not the SDK's");
});

test("AC-17: the contract's closed sets are the SDK's (19 reasons, six types)", () => {
  assert.equal(AGENT_QUESTION_PROBLEM_REASONS.length, 19);
  assert.deepEqual([...AGENT_QUESTION_TYPES], ["choice", "text", "number", "date", "datetime", "reference"]);
});

test("AC-17: the Runtime is offered only the types every surface that draws questions can draw", () => {
  // Offering even "choice" puts the model on the typed form. The Assistant draws typed choice questions now (A1); Coding does
  // not yet (A2), so the Host still offers nothing and the Runtime keeps the plain question (guarded by issue-clarification-page ISSUE-34).
  assert.deepEqual(hostQuestionTypes(), [], "until both surfaces draw the typed questionnaire, nothing is offered");
  assert.deepEqual(ASSISTANT_QUESTION_TYPES, ["choice"], "AC-21: the Assistant declares what it draws"); assert.deepEqual(CODING_QUESTION_TYPES, []);
  assert.deepEqual(hostQuestionTypes([["choice", "text", "date"], ["choice", "date"]]), ["choice", "date"]);
  assert.deepEqual(hostQuestionTypes([["choice", "text"], []]), [], "a surface that draws nothing leaves nothing to offer");
  assert.deepEqual(hostQuestionTypes([["choice", "text"]]), ["choice", "text"]);
});
