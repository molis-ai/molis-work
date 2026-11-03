import type { InteractionNextStep } from "@molis-ai/molis-work-contracts/platform/ui";
import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";

/** What a card needs to be a next step, whoever keeps it (the Assistant's works, a Coding session). */
export interface NextStepCard { card_id: string; title: string; status: string; missing: ReadonlyArray<unknown> }
/** An effect held for the person's approval: only ever reached, never approved from a next step. */
export interface NextStepReview { review_id: string; title?: string }
type Say = (text: string, values?: Record<string, string | number>) => string;

/**
 * Where a step leads, read back by the page from the step's id. Every step is another way into a record that is already
 * on screen: the page runs it by pressing that record's own control (FLOW-01), so there is no second execution path.
 * `card:<id>:run` presses the card's run button (the page first checks the card has no unsent edits, FLOW-03);
 * `question:<id>:<field>:<value>` picks that option in the card and presses its submit; the rest only bring the record into view.
 * An outcome record (specs/context-program §21.9) is keyed `<kind>:<id>` by its `data-ix-record`, a card by its `data-card`;
 * `press` names a control the record carries as `data-ix-press="<name>"`, which the Assistant's row presses only when it is
 * enabled and the record has no unsent edits, and otherwise brings the record into view.
 */
export const NEXT_STEP = {
  review: (id: string) => `review:${id}`,
  card: (id: string) => `card:${id}`,
  run: (id: string) => `card:${id}:run`,
  question: (id: string) => `question:${id}`,
  choose: (id: string, field: string, value: string) => `question:${id}:${field}:${value}`,
  record: (kind: string, id: string) => `${kind}:${id}`,
  press: (record: string, name: string) => `${record}:${name}`,
} as const;

/** A card as its result reads (AC-06): when it last changed, and what its owner presented once it ran. */
export interface OutcomeCard extends NextStepCard { updated_at: string; presentation?: { title?: string; link?: { label: string } } }
/** The control a card's result carries for opening what it made (`data-ix-press`), the one a next step presses. */
export const CARD_RESULT_OPEN = "open";
const RAN = new Set(["done", "failed", "unknown"]);

/**
 * The result of the card that ran last (specs/ai-interaction-experience AC-06, context-program §21.9): one step that
 * presses the result's own 「打开」. Only the latest card that ran (done, failed or unconfirmed) since `since` counts; a
 * failed or unconfirmed one is already reached among what waits, and one whose result has nothing to open has no step.
 * `to` names the step as the page that shows the card reads it (the Assistant's key, Coding's selector).
 */
export function cardOutcomeSteps(cards: readonly OutcomeCard[], since: string, say: Say,
  to = (card: OutcomeCard) => NEXT_STEP.press(NEXT_STEP.card(card.card_id), CARD_RESULT_OPEN)): InteractionNextStep[] {
  const ran = cards.filter(card => RAN.has(card.status) && card.updated_at >= since).sort((a, b) => a.updated_at.localeCompare(b.updated_at)).at(-1);
  const result = ran?.status === "done" && ran.presentation?.link ? ran.presentation : null;
  return ran && result ? [{ id: to(ran), label: say("打开「{title}」", { title: result.title ?? ran.title }), source: say("来自操作卡") }] : [];
}

/** The one choice the person can answer with a single press: the set has one question, it is single choice, nothing else is required (FLOW-02). */
function oneChoice(question: AgentPendingQuestion): { field: string; options: Array<{ value: string; label: string; recommended: boolean }> } | null {
  if (question.answerable === false) return null;
  const set = question.questions ?? [];
  if (set.length) {
    const [only] = set;
    if (set.length !== 1 || !only || only.type !== "choice" || only.multiple || !only.options.length) return null;
    return { field: `q${only.index}`, options: only.options.map(option => ({ value: String(option.index), label: option.label, recommended: Boolean(option.recommended) })) };
  }
  if (!question.options.length) return null;
  return { field: "pick", options: question.options.map(option => ({ value: option.value || option.label, label: option.label, recommended: false })) };
}

/**
 * The next steps of a conversation, in one list, derived from its records and kept nowhere (specs/context-program §21,
 * FLOW-01…05): what waits on the person first — approvals to review, questions, cards — then what follows the round.
 * Usable for any run that shows questions and cards (the Assistant, Coding): it reads only their views.
 */
export function interactionNextSteps(questions: readonly AgentPendingQuestion[], cards: readonly NextStepCard[], reviews: readonly NextStepReview[],
  followUps: readonly InteractionNextStep[], say: Say): InteractionNextStep[] {
  const steps: InteractionNextStep[] = [];
  const waiting = say("等你：");
  for (const review of reviews) steps.push({ id: NEXT_STEP.review(review.review_id), label: say("去确认"), source: review.title ?? say("等你确认的操作"), primary: false, waiting: true, waitingLabel: waiting });
  for (const question of questions) {
    const choice = oneChoice(question);
    if (choice) for (const option of choice.options) steps.push({ id: NEXT_STEP.choose(question.pending_id, choice.field, option.value),
      label: option.recommended ? say("{label}（推荐）", { label: option.label }) : option.label, source: question.prompt, primary: false });
    const count = question.questions?.length || 1;
    if (!choice) steps.push({ id: NEXT_STEP.question(question.pending_id), label: say("去回答（{count} 题）", { count }), source: question.prompt, primary: false, waiting: true, waitingLabel: waiting });
  }
  for (const card of cards) {
    // A card that ran, is running, went stale or was put away is not a step (FLOW-04); one that needs an answer or failed is only reached.
    if (card.status === "ready" && !card.missing.length) steps.push({ id: NEXT_STEP.run(card.card_id), label: card.title, source: say("来自操作卡"), primary: false, waiting: true, waitingLabel: waiting });
    else if (card.status === "ready" || card.status === "needs-input" || card.status === "failed" || card.status === "unknown")
      steps.push({ id: NEXT_STEP.card(card.card_id), label: say("去处理：{title}", { title: card.title }), source: say("来自操作卡"), primary: false, waiting: true, waitingLabel: waiting });
  }
  steps.push(...followUps.map(step => ({ ...step, primary: false })));
  // The same thing once (FLOW-05).
  const seen = new Set<string>();
  return steps.filter(step => !seen.has(step.id) && seen.add(step.id));
}
