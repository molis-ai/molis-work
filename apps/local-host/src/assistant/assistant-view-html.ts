import type { InteractionNextStep } from "@molis-ai/molis-work-contracts/platform/ui";
import type { InteractionValues } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { renderInteractionNextSteps } from "@molis-ai/molis-work-design-system";
import type { AssistantCard, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { assistantTextHtml, assistantReviewHtml } from "@molis-ai/molis-work-app-workbench";
import { agentQuestionHtml } from "../agent-question-card.js";
import { interactionNextSteps } from "../agent-next-steps.js";
import { composerQuestion } from "./assistant-inputs.js";
import { assistantOutcomeSteps } from "./assistant-outcome.js";
import { deliveryNote, deliveryNoteHtml, type DeliveryNote } from "./assistant-delivery.js";

/**
 * The conversation's next steps for the row above the input (specs/context-program §21.2, FLOW-01…05): what waits on the
 * person, then the outcome slot (§21.9); the first three, the rest folded into 「还有 N 项」, and every one of them for when
 * the person unfolds it. A caller that has the view's delivery note already passes it (null for none), so a reply works it out once.
 */
export function assistantStepRow(view: AssistantWorkView, say: (text: string, values?: Record<string, string | number>) => string, note: DeliveryNote | null = deliveryNote(view)): { next_html: string; next_all_html: string } {
  const waiting = say("等你：");
  // What else waits on the person in this work: a round whose outcome must be checked, a sub-task it handed out.
  const elsewhere: InteractionNextStep[] = [
    ...(view.work.state === "needs-check" ? [{ id: "check", label: say("去核对"), source: say("这一轮的结果需要核对"), primary: false, waiting: true, waitingLabel: waiting }] : []),
    ...(view.delegated ?? []).filter(child => !child.taken_back && (child.state === "waiting-input" || child.state === "waiting-review" || child.state === "needs-check")).slice(0, 1)
      .map(child => ({ id: `work:${child.work_id}`, label: say("看等你的子任务"), source: child.title, primary: false, waiting: true, waitingLabel: waiting })),
  ];
  const steps = interactionNextSteps(view.rounds.flatMap(round => round.awaiting_input), view.cards,
    view.reviews.map(review => ({ review_id: review.review_id, title: review.summary })), [...elsewhere, ...assistantOutcomeSteps(view, say, note)], say);
  if (!steps.length) return { next_html: "", next_all_html: "" };
  const label = say("下一步");
  return { next_html: renderInteractionNextSteps(steps, label, { max: 3, more: count => say("还有 {count} 项", { count }) }),
    next_all_html: renderInteractionNextSteps(steps, label, { max: steps.length }) };
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
      for (const review of candidate.reviews) Object.assign(review, { html: assistantReviewHtml(review, ports.say) });
      candidate.cards.forEach(drawCard);
      // The work's delivery note (receipts 3e-2a), worked out once for the row's outcome step and for the note itself: drawn here, placed after the rounds by the page; empty when there is none.
      const note = deliveryNote(candidate);
      Object.assign(candidate, assistantStepRow(candidate, ports.say, note), { delivery_html: note ? deliveryNoteHtml(note, ports.say) : "" });
    }
  }
  const card = isCard(body) ? body : (body as { card?: unknown } | null)?.card;
  if (isCard(card)) drawCard(card);
}
