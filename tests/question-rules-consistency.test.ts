import assert from "node:assert/strict";
import test from "node:test";

import { AGENT_QUESTION_PROBLEM_REASONS, type AgentQuestionAnswer } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { questionProblems, questionSetFlaw } from "@molis-ai/molis-work-plugin-sdk";
import { answerProblems, projectQuestion } from "@molis-ai/molis-work-service-agent-host";

// specs/ai-interaction-experience S1: a plugin that asks without an Agent run checks answers with the plugin SDK's rules; an
// Agent's answers are checked by Prologue (`validateQuestionnaireAnswer`, behind agent-host's `answerProblems`). The same
// inputs must get the same verdicts from both, or a question would pass in one surface and fail in the other.

type Sdk = Parameters<typeof projectQuestion>[0];
const questions: Sdk[] = [
  { index: 0, id: "format", prompt: "方式", options: [{ index: 0, label: "一起" }, { index: 1, label: "异步" }], allowOther: true },
  { index: 1, prompt: "渠道", options: [{ index: 0, label: "邮件" }, { index: 1, label: "群聊" }, { index: 2, label: "电话" }], multiple: true, required: false },
  { index: 2, id: "notes", prompt: "要求", options: [], type: "text", maxLength: 10 },
  { index: 3, prompt: "人数", options: [], type: "number", min: 1, max: 10, integer: true },
  { index: 4, prompt: "截止", options: [], type: "date", min: "2026-01-01", max: "2026-12-31" },
  { index: 5, prompt: "开始", options: [], type: "datetime", min: "2026-10-01T00:00:00+08:00" },
  { index: 6, prompt: "关联", options: [], type: "reference", refKinds: ["goal"], multiple: true, maxCount: 2 },
  { index: 7, prompt: "备注", options: [], type: "text", required: false },
];
const goal = (id: string, kind = "goal") => ({ kind, id, label: `Goal ${id}` });
const good: AgentQuestionAnswer[] = [
  { question: 0, indexes: [0] }, { question: 1, indexes: [] }, { question: 2, value: "短" }, { question: 3, value: 4 },
  { question: 4, value: "2026-10-30" }, { question: 5, value: "2026-10-20T09:30:00+08:00" }, { question: 6, value: [goal("g1")] }, { question: 7, value: null },
];
const swap = (index: number, answer: Partial<AgentQuestionAnswer>): AgentQuestionAnswer[] => good.map(item => item.question === index ? { question: index, ...answer } : item);

/** One answer per way it can go wrong, and a few that are right in less obvious ways. */
const cases: Array<[string, AgentQuestionAnswer[]]> = [
  ["all right", good],
  ["an unknown question", [...good, { question: 9, indexes: [0] }]],
  ["answered twice", [...good, { question: 3, value: 5 }]],
  ["a question left out", good.filter(item => item.question !== 4)],
  ["a required choice left blank", swap(0, { indexes: [] })],
  ["a choice given a value", swap(0, { value: "一起" })],
  ["an option that was never offered", swap(0, { indexes: [5] })],
  ["two picks on a single-select", swap(0, { indexes: [0, 1] })],
  ["the same option twice", swap(1, { indexes: [1, 1] })],
  ["an answer of their own where allowed", swap(0, { indexes: [], other: "看情况" })],
  ["an answer of their own where not allowed", swap(1, { indexes: [], other: "看情况" })],
  ["an answer of their own that is too long", swap(0, { indexes: [], other: "长".repeat(501) })],
  ["text too long", swap(2, { value: "长".repeat(11) })],
  ["text given a number", swap(2, { value: 3 })],
  ["required text left blank", swap(2, { value: "   " })],
  ["optional text left blank", swap(7, { value: "" })],
  ["a typed question given option numbers", swap(3, { indexes: [1] })],
  ["a typed question with no value", swap(3, {})],
  ["not a number", swap(3, { value: "四" })],
  ["not a whole number", swap(3, { value: 2.5 })],
  ["below the minimum", swap(3, { value: 0 })],
  ["above the maximum", swap(3, { value: 11 })],
  ["a date that does not exist", swap(4, { value: "2026-02-30" })],
  ["a date written another way", swap(4, { value: "2026/10/30" })],
  ["a date too early", swap(4, { value: "2025-12-31" })],
  ["a date too late", swap(4, { value: "2027-01-01" })],
  ["a moment without a zone", swap(5, { value: "2026-10-20T09:30:00" })],
  ["a moment before the minimum, in another zone", swap(5, { value: "2026-09-30T15:59:00Z" })],
  ["a moment at the minimum, in another zone", swap(5, { value: "2026-09-30T16:00:00Z" })],
  ["a reference of a kind not asked for", swap(6, { value: [goal("p1", "page")] })],
  ["too many references", swap(6, { value: [goal("g1"), goal("g2"), goal("g3")] })],
  ["the same reference twice", swap(6, { value: [goal("g1"), goal("g1")] })],
  ["a reference without a label", swap(6, { value: [{ kind: "goal", id: "g1", label: "" }] })],
  ["a reference that is not a list", swap(6, { value: "g1" })],
  ["a required reference left empty", swap(6, { value: [] })],
  ["an other on a typed question", swap(3, { value: 4, other: "大概" })],
];

test("S1 the plugin SDK's rules and the Agent runtime's give the same verdict, question by question, on every case", () => {
  const shown = questions.map(projectQuestion);
  const seen = new Set<string>();
  for (const [name, answers] of cases) {
    const runtime = answerProblems(questions, answers).map(({ question, id, reason }) => ({ question, ...(id === undefined ? {} : { id }), reason }));
    const plugin = questionProblems(shown, answers);
    assert.deepEqual(plugin, runtime, name);
    for (const problem of runtime) seen.add(problem.reason);
  }
  // Every reason is reached by at least one case, so a rule the two disagree on cannot hide behind an untested reason.
  assert.deepEqual([...AGENT_QUESTION_PROBLEM_REASONS].filter(reason => !seen.has(reason)), []);
});

test("S1 a question set a plugin's model wrote is checked before anyone is asked it", () => {
  const shown = questions.map(projectQuestion);
  assert.equal(questionSetFlaw(shown), null);
  const one = (change: Record<string, unknown>) => questionSetFlaw([{ ...shown[3]!, ...change }]);
  assert.equal(questionSetFlaw([]), "A question set has 1 to 10 questions.");
  assert.match(questionSetFlaw([shown[0]!, shown[0]!]) ?? "", /appears twice/);
  assert.match(one({ type: "rating" }) ?? "", /unknown type/);
  assert.match(one({ max_length: 4 }) ?? "", /does not apply/);
  assert.match(one({ min: 9, max: 2 }) ?? "", /min is above its max/);
  assert.match(one({ default: 50 }) ?? "", /default does not fit/);
  assert.match(questionSetFlaw([{ ...shown[6]!, default: [0] }]) ?? "", /nothing is prefilled/);
  assert.match(questionSetFlaw([{ ...shown[6]!, ref_kinds: [] }]) ?? "", /distinct kinds/);
  assert.match(questionSetFlaw([{ ...shown[0]!, options: [] }]) ?? "", /carry options/);
  assert.match(questionSetFlaw([{ ...shown[2]!, id: "Bad Id" }]) ?? "", /id must be unique/);
});
