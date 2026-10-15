import assert from "node:assert/strict";
import test from "node:test";
import { interactionNextSteps, NEXT_STEP, type NextStepCard } from "@molis-ai/molis-work-app-local-host";
import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";

// specs/context-program §21.2: the conversation's next steps beside the composer, derived from the records (FLOW-01…05).
const say = (text: string, values: Record<string, string | number> = {}) => text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
const choice = (index: number, extra: Partial<NonNullable<AgentPendingQuestion["questions"]>[number]> = {}) => ({ index, prompt: `题 ${index}`, type: "choice" as const, required: true,
  options: [{ index: 0, label: "团队", recommended: true }, { index: 1, label: "只给经理" }], multiple: false, allow_other: false, ...extra });
const question = (id: string, questions: AgentPendingQuestion["questions"], extra: Partial<AgentPendingQuestion> = {}): AgentPendingQuestion =>
  ({ pending_id: id, pending_revision: 3, kind: "questionnaire", prompt: `问卷 ${id}`, options: [], allows_free_text: false, questions, ...extra });
const card = (card_id: string, status: string, missing: unknown[] = []): NextStepCard => ({ card_id, title: `卡 ${card_id}`, status, missing });
const ids = (steps: { id: string }[]) => steps.map(step => step.id);

test("FLOW-02: only a set of one single-choice question is answered from a step; anything else only leads to the card", () => {
  const one = interactionNextSteps([question("p1", [choice(0)])], [], [], [], say);
  assert.deepEqual(ids(one), [NEXT_STEP.choose("p1", "q0", "0"), NEXT_STEP.choose("p1", "q0", "1")]);
  assert.equal(one[0]!.label, "团队（推荐）");
  for (const set of [[choice(0), choice(1, { required: false })], [choice(0, { multiple: true })], [{ ...choice(0), type: "text" as const, options: [] }]]) {
    assert.deepEqual(ids(interactionNextSteps([question("p2", set)], [], [], [], say)), [NEXT_STEP.question("p2")], JSON.stringify(set));
  }
  assert.deepEqual(ids(interactionNextSteps([question("p3", [choice(0)], { answerable: false })], [], [], [], say)), [NEXT_STEP.question("p3")], "a question that cannot be answered is only reached");
  const plain = interactionNextSteps([question("p4", undefined, { options: [{ value: "a", label: "甲" }], allows_free_text: true })], [], [], [], say);
  assert.deepEqual(ids(plain), [NEXT_STEP.choose("p4", "pick", "a")], "the free text beside the options is optional");
});

test("FLOW-03 / FLOW-04: a ready card runs; one that needs input, failed or whose result is unknown is only reached; the rest are not steps", () => {
  const steps = interactionNextSteps([], [card("r", "ready"), card("m", "ready", [{ field: "due", question: "哪天？" }]), card("n", "needs-input"), card("f", "failed"),
    card("u", "unknown"), card("s", "stale"), card("g", "running"), card("d", "done"), card("x", "dismissed")], [], [], say);
  assert.deepEqual(ids(steps), [NEXT_STEP.run("r"), NEXT_STEP.card("m"), NEXT_STEP.card("n"), NEXT_STEP.card("f"), NEXT_STEP.card("u")]);
  assert.ok(steps.every(step => step.waiting && step.waitingLabel), "each waits on the person and says so in words");
});

test("FLOW-04: a card whose result is unknown is never run again from a step, only brought into view to be checked", () => {
  const steps = interactionNextSteps([], [card("u", "unknown")], [], [], say);
  assert.deepEqual(ids(steps), [NEXT_STEP.card("u")]);
  assert.ok(!steps.some(step => step.id.endsWith(":run")));
});

test("FLOW-05: approvals first, then questions, cards and what follows the round; each thing once; an approval is only reached", () => {
  const follow = [{ id: "retry", label: "用同样的话再试一次", source: "上一轮" }, { id: "retry", label: "重复", source: "x" }];
  const steps = interactionNextSteps([question("p1", [choice(0)])], [card("r", "ready"), card("r", "ready")], [{ review_id: "v1", title: "改文件" }], follow, say);
  assert.deepEqual(ids(steps), [NEXT_STEP.review("v1"), NEXT_STEP.choose("p1", "q0", "0"), NEXT_STEP.choose("p1", "q0", "1"), NEXT_STEP.run("r"), "retry"]);
  assert.equal(steps[0]!.label, "去确认");
  assert.ok(steps.every(step => step.primary === false), "beside the composer every step is secondary; the one filled primary stays on its card");
});
