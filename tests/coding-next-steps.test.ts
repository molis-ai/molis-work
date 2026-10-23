import assert from "node:assert/strict";
import test from "node:test";
import { NEXT_STEP, pluginInteraction, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { CODING_NEXT_STEP, codingInteractionHtml, type CodingFollowUpRun } from "@molis-ai/molis-work-plugin-coding";
import type { ActionCard } from "@molis-ai/molis-work-plugin-sdk";
import type { ActionLocale } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";

// specs/ai-interaction-experience AC-25 (first part): Coding's next steps beside its composer are its round's questions and
// the round card's own follow-ups, each one a press of a control already on screen (specs/context-program FLOW-01).
// PG062-12: the row is Coding's, drawn by the platform's `services.interaction` as the Assistant's is; the Host adds nothing.
type Run = CodingFollowUpRun & { awaiting_input: AgentPendingQuestion[] };
type Card = ActionCard & { run_id: string };
type Drawn = { runs: Array<Run & { turns: unknown[]; cards: Array<Card & { html?: string }>; next_html?: string }> };
const wrote = (target: string, state = "completed") => ({ name: "edit", state, target });
const run = (phase: string, extra: Partial<Run> = {}): Run => ({ ref: { run_id: "run-1" }, phase, awaiting_input: [], activity: [], ...extra });
const question = (questions: AgentPendingQuestion["questions"]): AgentPendingQuestion =>
  ({ pending_id: "p1", pending_revision: 2, kind: "questionnaire", prompt: "先修哪一个？", options: [], allows_free_text: false, questions });
const pick = { index: 0, prompt: "先修哪一个？", type: "choice" as const, required: true, multiple: false, allow_other: false,
  options: [{ index: 0, label: "登录", recommended: true }, { index: 1, label: "导出" }] };

/** A round as Coding's route answers its page: Coding's round and cards, drawn by the platform in the page's language. */
async function drawn(round: Run, cards: Card[] = [], locale: ActionLocale = "zh") {
  const body: Drawn = { runs: [{ ...structuredClone(round), turns: [], cards: structuredClone(cards) }] };
  return (await runWithLocale(locale, () => codingInteractionHtml(body, pluginInteraction, locale))).runs[0]!;
}
const codingStepRow = async (round: Run, cards: Card[] = [], locale: ActionLocale = "zh") => (await drawn(round, cards, locale)).next_html ?? "";
const unescape = (value: string) => value.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
/** The steps the row draws, by their ids, in order. */
const ids = (html: string) => [...html.matchAll(/data-ix-step-id="([^"]*)"/g)].map(match => unescape(match[1]!));
const codingNextSteps = async (round: Run, cards: Card[] = []) => ids(await codingStepRow(round, cards));

test("AC-25: a waiting round's steps are its question, derived as the Assistant's are", async () => {
  assert.deepEqual(await codingNextSteps(run("awaiting-input", { awaiting_input: [question([pick])] })),
    [NEXT_STEP.choose("p1", "q0", "0"), NEXT_STEP.choose("p1", "q0", "1")], "one single choice is answered from the row");
  const two = await codingStepRow(run("awaiting-input", { awaiting_input: [question([pick, { ...pick, index: 1, required: false }])] }));
  assert.deepEqual(ids(two), [NEXT_STEP.question("p1")]);
  assert.match(two, /去回答（2 题）/, "anything else only leads to the card");
});

test("AC-25: an ended round offers what its card offers — check and continue, and its changes", async () => {
  assert.deepEqual(await codingNextSteps(run("completed", { activity: [wrote("src/a.ts")] })), [CODING_NEXT_STEP.changes("run-1")]);
  assert.deepEqual(await codingNextSteps(run("reconcile-required", { activity: [wrote("src/a.ts")] })),
    [CODING_NEXT_STEP.recover("run-1"), CODING_NEXT_STEP.changes("run-1")], "checking the result comes first");
  assert.deepEqual(await codingNextSteps(run("reconcile-required")), [CODING_NEXT_STEP.recover("run-1")]);
  for (const phase of ["failed", "stopped", "cancelled"]) assert.deepEqual(await codingNextSteps(run(phase, { activity: [wrote("a")] })), [CODING_NEXT_STEP.changes("run-1")], phase);
});

test("AC-25: nothing to view, nothing to continue — no step; a live round has none of its follow-ups yet", async () => {
  assert.deepEqual(await codingNextSteps(run("completed")), []);
  assert.deepEqual(await codingNextSteps(run("completed", { activity: [wrote("a", "failed"), { name: "read", state: "completed", target: "a" }, { name: "write", state: "completed", target: null }] })), [],
    "a file is counted as the card counts it: a completed edit or write with a target");
  assert.deepEqual(await codingNextSteps(run("running", { activity: [wrote("a")] })), []);
  assert.equal(await codingStepRow(run("running")), "", "no row at all");
});

test("AC-25: a step's id is the selector of the control it presses, and the row draws every step", async () => {
  assert.equal(CODING_NEXT_STEP.recover("run-1"), '[data-coding-recover-continue="run-1"]');
  assert.equal(CODING_NEXT_STEP.changes('a"b'), '[data-coding-change-open="a\\"b"]', "a run id cannot end the attribute it is named in");
  const html = await codingStepRow(run("reconcile-required", { awaiting_input: [question([pick])], activity: [wrote("a")] }));
  assert.equal((html.match(/data-ix-step-id=/g) ?? []).length, 4, "two options, check and continue, the changes");
  assert.match(html, /data-ix-step-id="\[data-coding-recover-continue=&quot;run-1&quot;\]"/);
  assert.match(html, /aria-label="下一步"/);
  assert.match(html, /核对并继续/); assert.match(html, /这一轮需要核对结果/); assert.match(html, /查看变更/); assert.match(html, /这一轮改过的文件/);
  assert.doesNotMatch(html, /data-ix-steps-more/);
});

test("PG062-12: the row is in the page's language — Coding's follow-ups in Coding's own words, the rest in the platform's", async () => {
  const html = await codingStepRow(run("reconcile-required", { activity: [wrote("a")] }), [], "en");
  assert.deepEqual(ids(html), [CODING_NEXT_STEP.recover("run-1"), CODING_NEXT_STEP.changes("run-1")]);
  for (const words of ["Check and continue", "This turn&#039;s results need checking", "View changes", "Files this turn changed"]) assert.ok(html.includes(words), words);
  assert.doesNotMatch(html.replace(/<[^>]*>/g, ""), /[一-鿿]/u, "nothing in the English row is Chinese");
});

// specs/ai-interaction-experience §15.11 (AC-06, H4): the result of the round's card that ran last, in Coding's row.
const ranCard = (id: string, status: ActionCard["status"], at: string): Card => ({ card_id: id, revision: 1, run_id: "run-1", title: "新建待办",
  summary: "把「报销」记成待办", provider: "待办", capability_title: "新建待办", effect: "write", reference: { capability_id: "todo.items.create", version: 1, provider_id: "todo" },
  input: {}, input_schema: {}, editable: [], missing: [], status,
  ...(status === "done" ? { presentation: { summary: "已建好", title: "报销", link: { label: "打开待办", href: "/todo?item=t1" } } } : {}),
  created_at: "2026-10-13T00:00:00.000Z", updated_at: at });

test("AC-06-5: once the round is over, the card that ran last offers its result before the round's follow-ups, by the selector of its 「打开」", async () => {
  const cards = [ranCard("c1", "done", "2026-10-13T01:05:00.000Z"), ranCard('c"2', "done", "2026-10-13T01:09:00.000Z")];
  const round = await drawn(run("completed", { activity: [wrote("src/a.ts")] }), cards);
  assert.deepEqual(ids(round.next_html ?? ""), ['[data-card="c\\"2"] [data-ix-press="open"]', CODING_NEXT_STEP.changes("run-1")], "the later card, then the round's changes; a card id cannot end its attribute");
  assert.match(round.next_html ?? "", /打开「报销」/);
  assert.match(round.cards[0]!.html ?? "", /<a href="\/todo\?item=t1"[^>]*data-ix-press="open"/, "the control the selector names is drawn on the card Coding shows");
  for (const phase of ["running", "awaiting-input", "reconcile-required"]) assert.deepEqual((await codingNextSteps(run(phase), cards)).filter(id => id.startsWith("[data-card")), [], phase);
  assert.deepEqual((await codingNextSteps(run("failed"), cards)).filter(id => id.startsWith("[data-card")), ['[data-card="c\\"2"] [data-ix-press="open"]'],
    "Coding's row has no retry, so a failed round still offers the card's result (§15.11)");
  assert.deepEqual(await codingNextSteps(run("completed"), [ranCard("c1", "done", "2026-10-13T01:05:00.000Z"), ranCard("c2", "failed", "2026-10-13T01:09:00.000Z")]),
    [NEXT_STEP.card("c2")], "the card that ran last failed: it is reached among what waits, and has no result step");
});
