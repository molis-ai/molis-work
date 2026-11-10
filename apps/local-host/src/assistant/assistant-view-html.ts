import type { InteractionNextStep } from "@molis-ai/molis-work-contracts/platform/ui";
import type { InteractionValues } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { renderInteractionNextSteps } from "@molis-ai/molis-work-design-system";
import type { AssistantCard, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { assistantTextHtml, assistantReviewHtml, readAssistantReviewWords } from "@molis-ai/molis-work-app-workbench";
import { escapeHtml, say as uiSay } from "@molis-ai/molis-work-plugin-sdk/ui";
import { agentQuestionHtml } from "../agent-question-card.js";
import { interactionNextSteps, type NextStep, type NextStepSay } from "../agent-next-steps.js";
import { composerQuestion } from "./assistant-inputs.js";
import { assistantOutcomeSteps } from "./assistant-outcome.js";
import { deliveryNote, deliveryNoteHtml, type DeliveryNote } from "./assistant-delivery.js";
import { assistantReviewDisplay } from "./assistant-review-words.js";

interface NextWord { readonly value: string; readonly ref: { key: string; args?: Record<string, string | number> } }

function projectNextStep({ label, source, waitingLabel, ...state }: NextStep<NextWord>) {
  const value = (word: string | NextWord) => typeof word === "string" ? word : word.value;
  const ref = (word: string | NextWord | undefined) => typeof word === "string" ? undefined : word?.ref;
  const step: InteractionNextStep = { ...state, label: value(label), source: value(source), waitingLabel: waitingLabel === undefined ? undefined : value(waitingLabel) };
  return { step, words: [step.id, { label: ref(label), title: ref(source), waiting: ref(waitingLabel) }] as const };
}

function renderNextRow(steps: ReturnType<typeof projectNextStep>[], label: string, max: number, more?: (count: number) => string): string {
  const html = renderInteractionNextSteps(steps.map(row => row.step), label, { max, more });
  const words = steps.slice(0, max).map(row => row.words);
  return html + `<template data-assistant-next-words="${escapeHtml(JSON.stringify(words))}"></template>`;
}

/**
 * The conversation's next steps for the row above the input (specs/context-program §21.2, FLOW-01…05): what waits on the
 * person, then the outcome slot (§21.9); the first three, the rest folded into 「还有 N 项」, and every one of them for when
 * the person unfolds it. A caller that has the view's delivery note already passes it (null for none), so a reply works it out once.
 */
export function assistantStepRow(view: AssistantWorkView, say: NextStepSay, note: DeliveryNote | null = deliveryNote(view)): { next_html: string; next_all_html: string } {
  const copy: NextStepSay<NextWord> = (key, args) => ({ value: say(key, args), ref: { key, args } });
  const waiting = copy("workbench.assistant-view-html.waiting");
  // What else waits on the person in this work: a round whose outcome must be checked, a sub-task it handed out.
  const elsewhere: NextStep<NextWord>[] = [
    ...(view.work.state === "needs-check" ? [{ id: "check", label: copy("workbench.assistant-view-html.check"), source: copy("workbench.assistant-view-html.turn-s-outcome-needs-checking"), primary: false, waiting: true, waitingLabel: waiting }] : []),
    ...(view.delegated ?? []).filter(child => !child.taken_back && (child.state === "waiting-input" || child.state === "waiting-review" || child.state === "needs-check")).slice(0, 1)
      .map(child => ({ id: `work:${child.work_id}`, label: copy("workbench.assistant-view-html.open-sub-task-waiting"), source: child.title, primary: false, waiting: true, waitingLabel: waiting })),
  ];
  const steps = interactionNextSteps(view.rounds.flatMap(round => round.awaiting_input), view.cards,
    view.reviews.map(review => ({ review_id: review.review_id, title: readAssistantReviewWords(assistantReviewDisplay(review)?.summary ?? [review.summary], uiSay.text) })),
    [...elsewhere, ...assistantOutcomeSteps(view, copy, note)], copy).map(projectNextStep);
  if (!steps.length) return { next_html: "", next_all_html: "" };
  const label = say("workbench.assistant-view-html.next");
  return { next_html: renderNextRow(steps, label, 3, count => say("workbench.assistant-view-html.count-more", { count })),
    next_all_html: renderNextRow(steps, label, steps.length) };
}

const isCard = (value: unknown): value is AssistantCard => Boolean(value) && typeof (value as AssistantCard).card_id === "string" && Array.isArray((value as AssistantCard).fields);
const isView = (value: unknown): value is AssistantWorkView => Boolean(value) && Array.isArray((value as AssistantWorkView).rounds) && Array.isArray((value as AssistantWorkView).cards);

/**
 * A reply's work views and cards, drawn on the Host so the page only binds them (specs/ai-interaction-experience A1, H2):
 * each waiting question with the person's half-written answer (and whether words from the composer answer it or go into its draft), each card, text, review, the next steps above the input, and the delivery note.
 * Read by the Assistant's own page; the records themselves are unchanged.
 */
export function drawAssistantReply(body: unknown, ports: { say: (text: string, values?: Record<string, string | number>) => string; drafts(workId: string): Record<string, InteractionValues>; card(card: AssistantCard): string }): void {
  const drawCard = (card: AssistantCard) => Object.assign(card, { html: ports.card(card) });
  for (const candidate of [body, (body as { view?: unknown } | null)?.view]) {
    if (isView(candidate)) {
      const drafts = ports.drafts(candidate.work.work_id);
      for (const round of candidate.rounds) {
        const words = composerQuestion(round.awaiting_input);
        // A closed question is asked again by a new round of the Assistant's own; an executor plugin's work has questions of the plugin's own.
        const reask = candidate.work.executor.kind !== "plugin";
        for (const question of round.awaiting_input) Object.assign(question, { html: agentQuestionHtml(question, ports.say, drafts[question.pending_id], undefined, reask), ...(question !== words?.question ? {} : words.field ? { draft_from_composer: words.field } : { from_composer: true }) });
      }
      for (const round of candidate.rounds) for (const turn of round.turns) {
        if (turn.kind === "assistant") Object.assign(turn, { html: assistantTextHtml(turn.text, candidate.objects, ports.say) });
      }
      for (const review of candidate.reviews) Object.assign(review, { html: assistantReviewHtml(review, ports.say, assistantReviewDisplay(review)) });
      candidate.cards.forEach(drawCard);
      // The work's delivery note (receipts 3e-2a), worked out once for the row's outcome step and for the note itself: drawn here, placed after the rounds by the page; empty when there is none.
      const note = deliveryNote(candidate);
      Object.assign(candidate, assistantStepRow(candidate, ports.say, note), { delivery_html: note ? deliveryNoteHtml(note, ports.say) : "" });
    }
  }
  const card = isCard(body) ? body : (body as { card?: unknown } | null)?.card;
  if (isCard(card)) drawCard(card);
}
