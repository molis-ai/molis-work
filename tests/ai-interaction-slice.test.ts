import assert from "node:assert/strict";
import test from "node:test";
import { createDemo, references, type DemoState } from "../scripts/ai-interaction-slice/model.ts";
import { answers, validDate, validateValues } from "../scripts/ai-interaction-slice/validation.ts";
import { appendDraft, backgroundUpdate, beginAnswer, cancelAnswer, edit, editWhen, finishComposition, invalidate, reopen, resolveConflict, setDraft, settleAnswer } from "../scripts/ai-interaction-slice/state.ts";
import { beginExecution, continueDraft, preparePreview, reconcile, settleExecution } from "../scripts/ai-interaction-slice/execution.ts";
import { adoptSteps, createRecommendation, nextSteps, offerSteps, setEligible, setInteraction, stepLive } from "../scripts/ai-interaction-slice/recommendation.ts";

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

test("AC-13 / AC-02: composer words join the same notes draft, raise the duration question and answer nothing", () => {
  const state = filled();
  setDraft(state, "时长改为 45 分钟");
  assert.equal(appendDraft(state), true);
  assert.equal(state.draft, "");
  assert.equal(state.values.notes, "聚焦首次使用，保留失败恢复的讨论时间。\n时长改为 45 分钟");
  assert.equal(state.conflict, "45");
  assert.equal(state.values.minutes, "30", "a stated duration waits for a decision");
  assert.equal(state.answerAttempts, 0);
  assert.equal(state.question, "open");
  setDraft(state, "   ");
  assert.equal(appendDraft(state), false);
  const ticket = beginAnswer(state);
  assert.equal(ticket, null, "the open duration question blocks the answer");
  resolveConflict(state, true);
  settleAnswer(state, beginAnswer(state)!);
  setDraft(state, "再加一句");
  assert.equal(appendDraft(state), false, "a received answer is fixed");
  assert.equal(state.draft, "再加一句", "the composer keeps words it could not place");
});
test("AC-13: the start time is typed as date and 24-hour time; the answer carries the question's zone", () => {
  const state = filled();
  editWhen(state, "time", "9:30");
  assert.equal(state.values.when, "2026-10-16T09:30-07:00");
  editWhen(state, "time", "九点半");
  assert.deepEqual(state.whenParts, { date: "2026-10-16", time: "九点半" }, "the raw draft survives");
  assert.equal(beginAnswer(state), null);
  assert.deepEqual(Object.keys(state.errors), ["when"]);
  editWhen(state, "date", "2026-10-20"); editWhen(state, "time", "14:00");
  assert.notEqual(beginAnswer(state), null);
  assert.equal(answers(state.values)[5]!.value, "2026-10-20T14:00-07:00");
});
test("AC-14: after expiry, replacement or declining, the draft stays editable but cannot be answered", () => {
  for (const reason of ["expired", "replaced", "object"] as const) {
    const state = filled();
    invalidate(state, reason);
    assert.equal(edit(state, "notes", "接着改草稿"), true);
    assert.equal(editWhen(state, "time", "11:00"), true);
    assert.equal(beginAnswer(state), null);
    assert.equal(state.answerAttempts, 0);
  }
  const declined = filled();
  cancelAnswer(declined);
  assert.equal(edit(declined, "minutes", "40"), true);
  assert.equal(beginAnswer(declined), null);
  const submitting = filled();
  beginAnswer(submitting);
  assert.equal(edit(submitting, "notes", "改不了"), false, "a submitted answer is fixed while it travels");
});
test("AC-14 / AC-08: a background update marks the untouched value it changed until the person edits it", () => {
  const state = createDemo("assistant");
  backgroundUpdate(state);
  assert.deepEqual(state.refreshed, ["minutes"]);
  assert.equal(state.values.minutes, "45");
  edit(state, "minutes", "50");
  assert.deepEqual(state.refreshed, []);
  backgroundUpdate(state);
  assert.equal(state.values.minutes, "50");
  assert.deepEqual(state.refreshed, []);
});
test("AC-03 / AC-06: next steps are views of the records; each label names what that record does now", () => {
  const labels = (state: DemoState) => nextSteps(state).map(step => `${step.label}:${step.action}${step.primary ? "" : "?"}${step.busy ? "…" : ""}`);
  const state = filled();
  assert.deepEqual(labels(state), [], "an open question is answered in its card, not beside the composer");
  state.questionClosed = true;
  assert.deepEqual(labels(state), ["继续填写:open"]);
  state.questionClosed = false;
  settleAnswer(state, beginAnswer(state)!);
  assert.deepEqual(labels(state), ["预览参数:preview"]);
  preparePreview(state);
  assert.deepEqual(labels(state), ["执行（模拟）:execute"]);
  const ticket = beginExecution(state)!;
  assert.deepEqual(labels(state), ["执行中…:execute…"]);
  settleExecution(state, ticket, "unknown");
  assert.deepEqual(labels(state), ["核对结果:reconcile"]);
  reconcile(state);
  assert.deepEqual(labels(state), ["打开结果:result", "继续调整:continue?"]);
  const coding = createDemo("coding");
  edit(coding, "notes", "只核对"); edit(coding, "references", [{ ...references[2]! }]);
  settleAnswer(coding, beginAnswer(coding)!); preparePreview(coding);
  settleExecution(coding, beginExecution(coding)!, "done");
  assert.deepEqual(labels(coding), ["查看变更:changes", "继续调整:continue?"], "Coding offers its professional follow-up");
  const expired = filled(); invalidate(expired, "expired");
  assert.deepEqual(labels(expired), ["请助理重新问:reopen"]);
  const moved = filled(); invalidate(moved, "object");
  assert.deepEqual(labels(moved), ["按新版本重新准备:reopen"]);
  assert.equal(beginExecution(state), null, "offering a step never executes it");
});
test("AC-15: a shown step keeps its slot and disables when its record changes under the person's hand", () => {
  const state = filled();
  settleAnswer(state, beginAnswer(state)!);
  const recommendation = createRecommendation();
  offerSteps(recommendation, nextSteps(state));
  const shown = recommendation.shown[0]!;
  assert.equal(shown.label, "预览参数");
  assert.equal(stepLive(recommendation, shown), true);
  setInteraction(recommendation, "composing", true);
  invalidate(state, "object");
  offerSteps(recommendation, nextSteps(state));
  assert.equal(recommendation.shown[0], shown, "the slot does not move while composing");
  assert.equal(stepLive(recommendation, shown), false, "the stale step cannot run");
  setInteraction(recommendation, "composing", false);
  assert.equal(recommendation.shown[0]!.label, "按新版本重新准备");
  assert.equal(stepLive(recommendation, recommendation.shown[0]!), true);
});
test("AC-15: pressing a step shows its consequence at once; a pointer does not hold steps that are only in progress", () => {
  const state = filled();
  settleAnswer(state, beginAnswer(state)!);
  const recommendation = createRecommendation();
  offerSteps(recommendation, nextSteps(state));
  setInteraction(recommendation, "hovered", true);
  preparePreview(state);
  offerSteps(recommendation, nextSteps(state));
  assert.equal(recommendation.shown[0]!.label, "预览参数", "a change from elsewhere waits for the pointer to leave");
  adoptSteps(recommendation);
  assert.equal(recommendation.shown[0]!.label, "执行（模拟）", "the person's own press shows its result under their hand");
  const ticket = beginExecution(state)!;
  offerSteps(recommendation, nextSteps(state)); adoptSteps(recommendation);
  settleExecution(state, ticket, "done");
  offerSteps(recommendation, nextSteps(state));
  assert.equal(recommendation.shown[0]!.label, "打开结果", "a busy step is not held by hovering");
});
