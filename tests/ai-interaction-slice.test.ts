import assert from "node:assert/strict";
import test from "node:test";
import { createDemo, references, type DemoState } from "../scripts/ai-interaction-slice/model.ts";
import { answers, validDate, validateValues } from "../scripts/ai-interaction-slice/validation.ts";
import { backgroundUpdate, beginAnswer, cancelAnswer, edit, finishComposition, invalidate, reopen, resolveConflict, settleAnswer } from "../scripts/ai-interaction-slice/state.ts";
import { beginExecution, continueDraft, preparePreview, reconcile, settleExecution } from "../scripts/ai-interaction-slice/execution.ts";
import { createRecommendation, setEligible, setInteraction } from "../scripts/ai-interaction-slice/recommendation.ts";

function filled(): DemoState {
  const state = createDemo("assistant");
  edit(state, "notes", "聚焦首次使用，保留失败恢复的讨论时间。");
  edit(state, "references", [{ ...references[0]! }]);
  return state;
}
function received(): DemoState {
  const state = filled();
  const ticket = beginAnswer(state);
  assert.notEqual(ticket, null);
  assert.equal(settleAnswer(state, ticket!), true);
  return state;
}
test("AC-13 / AC-03: defaults, edits and preview never execute; six SDK-shaped types submit explicitly", () => {
  const state = createDemo("assistant");
  assert.equal(state.answerAttempts, 0);
  assert.equal(state.effectAttempts, 0);
  assert.equal(beginExecution(state), null);
  edit(state, "notes", "只讨论试用反馈");
  edit(state, "references", [{ ...references[0]! }]);
  assert.deepEqual(answers(state.values), [
    { question: 0, indexes: [0] }, { question: 1, indexes: [0, 1] },
    { question: 2, value: "只讨论试用反馈" }, { question: 3, value: 30 },
    { question: 4, value: "2026-10-15" }, { question: 5, value: "2026-10-16T10:00-07:00" },
    { question: 6, value: [{ kind: "goal", id: "sample-review", label: "秋季工作台 · 内部试用" }] },
  ]);
  const ticket = beginAnswer(state)!;
  settleAnswer(state, ticket);
  assert.equal(beginExecution(state), null, "receiving an answer is not execution approval");
  assert.equal(preparePreview(state), true);
  assert.equal(state.effectAttempts, 0);
  assert.notEqual(beginExecution(state), null);
  assert.equal(state.effectAttempts, 1);
});
test("AC-13 / AC-04: every invalid field is reported while raw drafts survive correction", () => {
  const state = filled();
  edit(state, "minutes", "two");
  edit(state, "date", "2026-02-30");
  edit(state, "when", "2026-10-16T25:00-07:00");
  const before = structuredClone(state.values);
  assert.equal(beginAnswer(state), null);
  assert.deepEqual(Object.keys(state.errors).sort(), ["date", "minutes", "when"]);
  assert.deepEqual(state.values, before);
  edit(state, "minutes", "45"); edit(state, "date", "2026-10-15"); edit(state, "when", "2026-10-16T10:00-07:00");
  assert.notEqual(beginAnswer(state), null);
});
test("AC-13: semantic bounds reject invalid dates, empty multi-choice, wrong references and numeric blanks", () => {
  const state = filled();
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("2026-02-29"), false);
  state.values.minutes = " "; state.values.topics = [];
  state.values.references = [{ kind: "document", id: "outside-example", label: "Not a candidate" }];
  assert.deepEqual(Object.keys(validateValues(state.values)).sort(), ["minutes", "references", "topics"]);
  assert.throws(() => answers(state.values));
});
test("AC-13 / AC-02: natural-language conflict is explicit and resolves into the same values", () => {
  const state = filled();
  edit(state, "notes", "时长改为 45 分钟，先看失败恢复");
  assert.equal(state.values.minutes, "30");
  assert.equal(beginAnswer(state), null);
  resolveConflict(state, true);
  assert.equal(state.values.minutes, "45");
  assert.equal(state.values.notes, "时长改为 45 分钟，先看失败恢复");
  edit(state, "notes", "时长改为 90 分钟");
  resolveConflict(state, false);
  assert.equal(state.values.minutes, "45");
  assert.notEqual(beginAnswer(state), null);
});
test("AC-14 / AC-08: background updates merge untouched defaults only, both layouts keep separate drafts", () => {
  const assistant = filled(), coding = createDemo("coding");
  edit(assistant, "minutes", "37"); edit(assistant, "notes", "保留我输入的文字");
  assistant.questionClosed = true;
  backgroundUpdate(assistant); backgroundUpdate(coding);
  assert.equal(assistant.values.minutes, "37"); assert.equal(assistant.values.notes, "保留我输入的文字");
  assert.equal(coding.values.minutes, "45"); assert.equal(coding.values.notes, "");
  assert.equal(assistant.questionClosed, true);
});
test("AC-14 / AC-07: duplicate clicks and late completion after cancel cannot settle an answer twice", () => {
  const state = filled();
  const ticket = beginAnswer(state)!;
  assert.equal(beginAnswer(state), null);
  assert.equal(edit(state, "minutes", "90"), false);
  cancelAnswer(state);
  assert.equal(settleAnswer(state, ticket), false);
  assert.equal(state.received, null);
  assert.equal(reopen(state), true);
  const retry = beginAnswer(state)!;
  assert.equal(settleAnswer(state, ticket), false);
  assert.equal(settleAnswer(state, retry), true);
  assert.equal(settleAnswer(state, retry), false);
  assert.equal(state.answerAttempts, 2);
});
test("AC-14: expired, replaced and changed-object interactions reject stale answers with drafts intact", () => {
  for (const reason of ["expired", "replaced", "object"] as const) {
    const state = filled(), draft = structuredClone(state.values);
    const ticket = beginAnswer(state)!;
    invalidate(state, reason);
    assert.equal(settleAnswer(state, ticket), false);
    assert.equal(beginAnswer(state), null);
    assert.deepEqual(state.values, draft);
    assert.equal(reopen(state), true);
    assert.notEqual(beginAnswer(state), null);
  }
});
test("AC-14: answer failure is retryable without clearing or automatically resubmitting the draft", () => {
  const state = filled(), draft = structuredClone(state.values);
  const ticket = beginAnswer(state)!;
  assert.equal(settleAnswer(state, ticket, true), true);
  assert.equal(state.question, "failed"); assert.deepEqual(state.values, draft);
  assert.equal(state.answerAttempts, 1);
  assert.notEqual(beginAnswer(state), null);
});
test("AC-14 / AC-06: frozen preview, single execution, failure retry and follow-up stay explicit", () => {
  const state = received(); preparePreview(state);
  assert.notEqual(state.preview, state.received);
  const ticket = beginExecution(state)!;
  assert.equal(beginExecution(state), null);
  assert.equal(reopen(state), false);
  settleExecution(state, ticket, "failed");
  assert.equal(state.effectAttempts, 1);
  const retry = beginExecution(state)!;
  assert.equal(settleExecution(state, ticket, "done"), false);
  settleExecution(state, retry, "done");
  assert.equal(state.effectAttempts, 2);
  assert.equal(beginExecution(state), null);
  assert.equal(continueDraft(state), true);
  assert.equal(state.question, "open"); assert.equal(state.effectAttempts, 2);
  assert.equal(beginExecution(state), null);
});
test("AC-14: unknown execution only reconciles, even after object change; old completion cannot revive it", () => {
  const state = received(); preparePreview(state);
  const ticket = beginExecution(state)!;
  settleExecution(state, ticket, "unknown");
  assert.equal(beginExecution(state), null); assert.equal(reopen(state), false);
  invalidate(state, "object");
  assert.equal(state.execution, "unknown"); assert.equal(reopen(state), false);
  assert.equal(settleExecution(state, ticket, "done"), false);
  assert.equal(reconcile(state), true);
  assert.equal(state.effectAttempts, 1);
  assert.equal(state.execution, "stale");
  assert.equal(reopen(state), true);
});
test("AC-14: unknown successful result is read without another execution", () => {
  const state = received(); preparePreview(state);
  settleExecution(state, beginExecution(state)!, "unknown");
  assert.equal(reconcile(state), true);
  assert.equal(state.execution, "done"); assert.equal(state.effectAttempts, 1);
  assert.equal(reconcile(state), false);
});
test("AC-15 / AC-02: recommendation locks preserve placement while stale actions disable immediately", () => {
  for (const kind of ["focused", "hovered", "composing"] as const) {
    const recommendation = createRecommendation();
    setInteraction(recommendation, kind, true);
    setEligible(recommendation, false);
    assert.equal(recommendation.visible, true);
    assert.equal(recommendation.eligible, false);
    setInteraction(recommendation, kind, false);
    assert.equal(recommendation.visible, false);
  }
});
test("AC-15: composition ending after expiry preserves final text without submitting an expired question", () => {
  const state = filled();
  invalidate(state, "expired");
  finishComposition(state, "notes", "时长改为 60 分钟");
  assert.equal(state.values.notes, "时长改为 60 分钟");
  assert.equal(beginAnswer(state), null);
  reopen(state);
  assert.equal(beginAnswer(state), null, "the preserved natural-language conflict still needs a decision");
  resolveConflict(state, true);
  assert.equal(state.values.minutes, "60");
  assert.notEqual(beginAnswer(state), null);
});
