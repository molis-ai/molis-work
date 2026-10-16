import assert from "node:assert/strict";
import test from "node:test";
import { NEXT_STEP, interactionNextSteps } from "@molis-ai/molis-work-app-local-host";
import { CODING_NEXT_STEP, codingFollowUps, type CodingFollowUpRun } from "@molis-ai/molis-work-plugin-coding";
import { renderInteractionNextSteps } from "@molis-ai/molis-work-design-system";
import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";

// specs/ai-interaction-experience AC-25 (first part): Coding's next steps beside its composer are its round's questions and
// the round card's own follow-ups, each one a press of a control already on screen (specs/context-program FLOW-01).
const say = (text: string, values: Record<string, string | number> = {}) => text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
const ids = (steps: { id: string }[]) => steps.map(step => step.id);
const wrote = (target: string, state = "completed") => ({ name: "edit", state, target });
type Run = CodingFollowUpRun & { awaiting_input: AgentPendingQuestion[] };
const run = (phase: string, extra: Partial<Run> = {}): Run => ({ ref: { run_id: "run-1" }, phase, awaiting_input: [], activity: [], ...extra });
const question = (questions: AgentPendingQuestion["questions"]): AgentPendingQuestion =>
  ({ pending_id: "p1", pending_revision: 2, kind: "questionnaire", prompt: "先修哪一个？", options: [], allows_free_text: false, questions });
// As the Host composes them for Coding's page (apps/local-host/src/coding-surface.ts).
const codingNextSteps = (round: Run, words: typeof say) => interactionNextSteps(round.awaiting_input, [], [], codingFollowUps(round, words), words);
const codingStepRow = (round: Run, words: typeof say) => { const steps = codingNextSteps(round, words); return steps.length ? renderInteractionNextSteps(steps, words("下一步"), { max: steps.length }) : ""; };
const pick = { index: 0, prompt: "先修哪一个？", type: "choice" as const, required: true, multiple: false, allow_other: false,
  options: [{ index: 0, label: "登录", recommended: true }, { index: 1, label: "导出" }] };

test("AC-25: a waiting round's steps are its question, derived as the Assistant's are", () => {
  assert.deepEqual(ids(codingNextSteps(run("awaiting-input", { awaiting_input: [question([pick])] }), say)),
    [NEXT_STEP.choose("p1", "q0", "0"), NEXT_STEP.choose("p1", "q0", "1")], "one single choice is answered from the row");
  const two = codingNextSteps(run("awaiting-input", { awaiting_input: [question([pick, { ...pick, index: 1, required: false }])] }), say);
  assert.deepEqual(ids(two), [NEXT_STEP.question("p1")]);
  assert.equal(two[0]!.label, "去回答（2 题）", "anything else only leads to the card");
});

test("AC-25: an ended round offers what its card offers — check and continue, and its changes", () => {
  assert.deepEqual(ids(codingNextSteps(run("completed", { activity: [wrote("src/a.ts")] }), say)), [CODING_NEXT_STEP.changes("run-1")]);
  assert.deepEqual(ids(codingNextSteps(run("reconcile-required", { activity: [wrote("src/a.ts")] }), say)),
    [CODING_NEXT_STEP.recover("run-1"), CODING_NEXT_STEP.changes("run-1")], "checking the result comes first");
  assert.deepEqual(ids(codingNextSteps(run("reconcile-required"), say)), [CODING_NEXT_STEP.recover("run-1")]);
  for (const phase of ["failed", "stopped", "cancelled"]) assert.deepEqual(ids(codingNextSteps(run(phase, { activity: [wrote("a")] }), say)), [CODING_NEXT_STEP.changes("run-1")], phase);
});

test("AC-25: nothing to view, nothing to continue — no step; a live round has none of its follow-ups yet", () => {
  assert.deepEqual(codingNextSteps(run("completed"), say), []);
  assert.deepEqual(codingNextSteps(run("completed", { activity: [wrote("a", "failed"), { name: "read", state: "completed", target: "a" }, { name: "write", state: "completed", target: null }] }), say), [],
    "a file is counted as the card counts it: a completed edit or write with a target");
  assert.deepEqual(codingNextSteps(run("running", { activity: [wrote("a")] }), say), []);
  assert.equal(codingStepRow(run("running"), say), "", "no row at all");
});

test("AC-25: a step's id is the selector of the control it presses, and the row draws every step", () => {
  assert.equal(CODING_NEXT_STEP.recover("run-1"), '[data-coding-recover-continue="run-1"]');
  assert.equal(CODING_NEXT_STEP.changes('a"b'), '[data-coding-change-open="a\\"b"]', "a run id cannot end the attribute it is named in");
  const html = codingStepRow(run("reconcile-required", { awaiting_input: [question([pick])], activity: [wrote("a")] }), say);
  assert.equal((html.match(/data-ix-step-id=/g) ?? []).length, 4, "two options, check and continue, the changes");
  assert.match(html, /data-ix-step-id="\[data-coding-recover-continue=&quot;run-1&quot;\]"/);
  assert.match(html, /aria-label="下一步"/);
  assert.doesNotMatch(html, /data-ix-steps-more/);
});
