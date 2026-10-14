import assert from "node:assert/strict";
import test from "node:test";
import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import type { AssistantCard, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import {
  assistantAnswerFrom, assistantCardHtml, assistantNextSteps, assistantQuestionHtml, cardInputValues, drawAssistantReply, instantIn, questionErrors,
} from "@molis-ai/molis-work-app-local-host";

// The Assistant's questions, action cards and next steps are drawn on the Host with the design system's shared parts
// (specs/ai-interaction-experience A1, H2); the page only binds them. `say` stands in for the request's translation.
/** The opening tag of the option with this value inside the field with this id, whatever order its attributes are written in. */
const optionTag = (html: string, field: string, value: string) => html.slice(html.indexOf(`data-ix-field="${field}"`)).match(new RegExp(`<button[^>]*data-ix-option="${value}"[^>]*>`))?.[0] ?? "";
const say = (text: string, values?: Record<string, string | number>) => Object.entries(values ?? {}).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, String(value)), text);

const questionnaire: AgentPendingQuestion = {
  pending_id: "pending-1", pending_revision: 2, kind: "questionnaire", prompt: "怎么安排<复盘>？", options: [], allows_free_text: false,
  questions: [
    { index: 0, prompt: "方式", type: "choice", required: true, multiple: false, allow_other: true,
      options: [{ index: 0, label: "一起复盘", description: "先对齐", recommended: true }, { index: 1, label: "异步审阅" }] },
    { index: 1, prompt: "材料", type: "choice", required: false, multiple: true, allow_other: false, options: [{ index: 0, label: "周报" }, { index: 1, label: "纪要" }] },
  ],
};

test("AC-21: a questionnaire is drawn as the shared question card, escaped, with the person's half-written answer in place", () => {
  const html = assistantQuestionHtml(questionnaire, say, { q0: { picked: ["1"], other: "看情况" }, q1: ["0"] });
  assert.match(html, /data-ix-question="q-pending-1"/);
  assert.match(html, /怎么安排&lt;复盘&gt;？/, "the Runtime's words are shown as text, never as markup");
  assert.match(html, /data-ix-field="q0"[\s\S]*role="radiogroup"/, "one pick is a radio group");
  assert.match(html, /data-ix-option="1" role="radio" aria-checked="true"/, "the drafted pick is selected again");
  assert.match(html, /data-ix-option="0" role="radio" aria-checked="false"[\s\S]*推荐/, "the recommendation is marked, not picked");
  assert.match(html, /data-ix-other="q0"[^>]*value="看情况"|value="看情况"[^>]*data-ix-other="q0"/, "the drafted other answer is back");
  assert.match(html, /data-ix-field="q1"[\s\S]*data-ix-multiple/, "several picks are a plain group");
  assert.match(html, /<span class="mw-ix-optional">选填<\/span>/, "an optional question is marked");
  assert.match(html, /data-ix-action="answer"[^>]*type="submit"|type="submit"[^>]*data-ix-action="answer"/);
});

test("AC-21: a plain question offers its options and words; a question that can no longer be answered says why and offers no answer", () => {
  const plain: AgentPendingQuestion = { pending_id: "p2", kind: "clarify", prompt: "要发给谁？", options: [{ value: "team", label: "团队" }], allows_free_text: true };
  const html = assistantQuestionHtml(plain, say, { text: "只发给我" });
  assert.match(html, /data-ix-field="pick"/);
  assert.match(html, /data-ix-field="text"[\s\S]*只发给我<\/textarea>/);
  const closed = assistantQuestionHtml({ ...plain, answerable: false, unavailable_reason: "这个问题已经过期" }, say);
  assert.match(closed, /data-ix-banner[^>]*>\s*<p data-ix-banner-text>这个问题已经过期/);
  assert.doesNotMatch(closed, /data-ix-action="answer"/);
});

test("AC-21: what the card sends becomes the Runtime's answer: every question once, words before a pick, nothing for nothing", () => {
  assert.deepEqual(assistantAnswerFrom({ q0: { picked: ["1"], other: " 看情况 " }, q1: [] }), { answers: [{ question: 0, indexes: [1], other: "看情况" }, { question: 1, indexes: [] }] });
  assert.deepEqual(assistantAnswerFrom({ pick: ["team"], text: "" }), { text: "team" });
  assert.deepEqual(assistantAnswerFrom({ pick: ["team"], text: " 只发给我 " }), { text: "只发给我" });
  assert.equal(assistantAnswerFrom({ pick: [], text: "  " }), null);
  assert.equal(assistantAnswerFrom("q0"), null);
  assert.deepEqual(questionErrors([{ question: 0, reason: "required" }, { question: 1, reason: "too-early" }], say),
    { q0: "这一题需要回答", q1: "这一题的回答不能提交，请改一下" }, "each refused question gets a line beside its own field");
});

const card = (status: AssistantCard["status"], fields: AssistantCard["fields"] = []): AssistantCard => ({
  card_id: "card-1", revision: 3, run_id: "run-1", title: "新建待办", summary: "把「报销」记成待办", provider: "待办", capability_title: "新建待办", capability_id: "todo.items.create",
  effect: "write", fields, missing: [], status, created_at: "2026-10-13T00:00:00.000Z", updated_at: "2026-10-13T00:00:00.000Z" });

test("AC-23: an open card is the shared operation card: the fields the person may change, the rest as exactly what runs, run or set aside", () => {
  const html = assistantCardHtml({ ...card("needs-input", [
    { key: "title", label: "标题", value: "报销", editable: false },
    { key: "list", label: "清单", value: "收件箱", editable: true, raw: "inbox", options: [{ value: "inbox", label: "收件箱" }, { value: "work", label: "工作" }] },
    { key: "due", label: "截止", value: "2026-10-20", editable: true, raw: "2026-10-20", input: "date" },
    { key: "remind_at", label: "提醒", value: "", editable: true, raw: "2026-10-20T16:30:00.000Z", input: "datetime" },
  ]), missing: [{ field: "due", question: "哪天截止？" }] }, say, "America/Los_Angeles");
  assert.match(html, /data-ix-operation="card-1"/);
  assert.match(optionTag(html, "list", "inbox"), /role="radio" aria-checked="true"/, "a declared choice is picked, its current value selected");
  assert.match(optionTag(html, "list", "work"), /aria-checked="false"/);
  assert.match(html, /<label id="card-1-due-label" for="card-1-due">哪天截止？<\/label>/, "a missing field is asked by its question");
  assert.match(html, /data-ix-field="due"[\s\S]*value="2026-10-20"/);
  assert.match(html, /data-ix-part="date"[^>]*value="2026-10-20"|value="2026-10-20"[^>]*data-ix-part="date"/, "a moment shows its day in the person's zone");
  assert.match(html, /value="09:30"/, "and its time there");
  assert.match(html, /GMT-7/, "and the zone it is read in");
  assert.match(html, /data-ix-preview[\s\S]*<dt>标题<\/dt><dd>报销<\/dd>/, "what the person cannot change shows as exactly what runs");
  assert.match(html, /data-ix-preview[\s\S]*data-ix-preview-actions[\s\S]*data-ix-action="run"[\s\S]*data-ix-action="dismiss"/, "run and set aside sit under everything that would run");
  assert.match(html, /data-ix-weekday aria-hidden="true">周二</, "a day shows its weekday from the start");
  assert.match(html, /会修改，可在原处撤回/, "its effect is named");
});

test("AC-23: a card that ran or went stale says how it stands; a stale one only offers to be prepared again", () => {
  const done = assistantCardHtml({ ...card("done"), outcome: "「报销」" }, say);
  assert.match(done, /data-ix-status role="status">已完成：「报销」/);
  assert.doesNotMatch(done, /data-ix-action="run"/);
  const stale = assistantCardHtml({ ...card("stale"), outcome: "数据在建议之后变化了" }, say);
  assert.match(stale, /data-ix-status role="status" data-tone="waiting">已失效：数据在建议之后变化了/);
  assert.match(stale, /data-ix-recovery[\s\S]*data-ix-action="redo"/);
  assert.doesNotMatch(stale, /data-ix-action="(run|dismiss)"/);
  const page = assistantCardHtml({ ...card("ready"), from: { surface: "todo", title: "待办" }, source_object: { kind: "todo_item", id: "t1", title: "报销" } }, say);
  assert.match(page, /来自「待办」页面 · 选中自《报销》/, "a page's card says where it came from");
});

test("AC-23: a card's controls come back as the strings its input takes; a moment is the exact instant it names in the person's zone", () => {
  assert.deepEqual(cardInputValues({ list: ["work"], due: "2026-10-21", remind_at: { date: "2026-10-21", time: "09:30" }, note: { picked: [] }, cleared: { date: "", time: "" } }, "America/Los_Angeles"),
    { list: "work", due: "2026-10-21", remind_at: "2026-10-21T16:30:00.000Z", note: "", cleared: "" });
  assert.equal(cardInputValues({ at: { date: "2026-10-21", time: "25:00" } }, "UTC").at, "2026-10-21 25:00", "a time that names nothing goes as written, so the input's check says why");
  assert.equal(instantIn("2026-02-30", "09:00", "UTC"), null, "nor does a day the month does not have");
  assert.equal(instantIn("2026-10-21", "9:05", "UTC"), "2026-10-21T09:05:00.000Z", "an hour may be written with one digit");
  assert.equal(instantIn("2026-03-08", "02:30", "America/Los_Angeles"), null, "a time the clock skips names no instant");
  assert.equal(instantIn("2026-11-01", "12:00", "America/Los_Angeles"), "2026-11-01T20:00:00.000Z");
  assert.deepEqual(cardInputValues(["x"], "UTC"), {});
});

const view = (phase: string, extra: Partial<AssistantWorkView> = {}): AssistantWorkView => ({
  work: { work_id: "w1" }, reviews: [], cards: [], objects: [],
  rounds: [{ run_id: "run-1", text: "整理周报", phase, awaiting_input: [], turns: [], activity: [], materials: [], context: null, started_at: "", ended_at: null }],
  ...extra } as AssistantWorkView);

test("AC-23: the steps under the latest round derive from the work: open what it made, or send the same words again", () => {
  assert.deepEqual(assistantNextSteps(view("failed"), say), [{ id: "retry", label: "用同样的话再试一次", source: "整理周报" }]);
  const made = (id: string, title: string): AssistantWorkView["objects"][number] => ({ relation: "result", open: { surface: "pages", id }, state: "current", subject: { kind: "page", id }, title,
    recorded_revision: null, current_revision: null, recorded_at: "2026-10-13T00:00:00.000Z" });
  const steps = assistantNextSteps(view("completed", { objects: [made("a", "周报"), made("b", "纪要"), made("c", "附件")] }), say);
  assert.deepEqual(steps.map(step => [step.id, step.label, step.primary]), [["open:page:a", "打开「周报」", undefined], ["open:page:b", "打开「纪要」", false]]);
  assert.deepEqual(assistantNextSteps(view("running"), say), []);
});

test("AC-21, AC-23: a reply's views and cards are drawn wherever it carries them, with each question's draft", () => {
  const waiting = view("awaiting-input", { cards: [card("ready")] });
  waiting.rounds[0]!.awaiting_input = [questionnaire];
  const reply = { version: "v1", view: waiting };
  drawAssistantReply(reply, { say, drafts: () => ({ "pending-1": { q1: ["1"] } }), card: shown => `<card ${shown.card_id}>` });
  const drawn = waiting.rounds[0]!.awaiting_input[0] as AgentPendingQuestion & { html?: string };
  assert.match(optionTag(drawn.html ?? "", "q1", "1"), /aria-pressed="true"/, "the question is drawn with its draft");
  assert.match(optionTag(drawn.html ?? "", "q1", "0"), /aria-pressed="false"/);
  assert.equal((waiting.cards[0] as AssistantCard & { html?: string }).html, "<card card-1>");
  assert.equal((waiting as AssistantWorkView & { next_html?: string }).next_html, "", "no steps while the round waits on the person");
  const single = { work_id: "w1", card: card("done") };
  drawAssistantReply(single, { say, drafts: () => ({}), card: () => "<drawn>" });
  assert.equal((single.card as AssistantCard & { html?: string }).html, "<drawn>", "a reply that carries one card gets it drawn");
});
