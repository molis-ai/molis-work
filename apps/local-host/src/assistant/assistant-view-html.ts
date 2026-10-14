import { renderInteractionNextSteps, type InteractionNextStep, type InteractionValues } from "@molis-ai/molis-work-design-system";
import type { AssistantCard, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { agentQuestionHtml } from "../agent-question-card.js";

/**
 * What follows the latest round, under it: open what it made (two at most), or send the same words again when it failed.
 * Steps are views of records the work already has; none runs anything by itself. A question or a card waiting on the
 * person is reached from the work's top line, so it is not repeated here.
 */
export function assistantNextSteps(view: AssistantWorkView, say: (text: string, values?: Record<string, string | number>) => string): InteractionNextStep[] {
  const last = view.rounds.at(-1);
  if (last?.phase === "failed") return [{ id: "retry", label: say("用同样的话再试一次"), source: last.text.slice(0, 200) }];
  if (last?.phase !== "completed") return [];
  return view.objects.filter(object => object.relation === "result" && object.open && object.state !== "missing").slice(0, 2)
    .map((object, index) => ({ id: `open:${object.subject.kind}:${object.subject.id}`, label: say("打开「{title}」", { title: object.title }), source: say("这一轮做出的结果"),
      ...(index ? { primary: false } : {}) }));
}

const isCard = (value: unknown): value is AssistantCard => Boolean(value) && typeof (value as AssistantCard).card_id === "string" && Array.isArray((value as AssistantCard).fields);
const isView = (value: unknown): value is AssistantWorkView => Boolean(value) && Array.isArray((value as AssistantWorkView).rounds) && Array.isArray((value as AssistantWorkView).cards);

/**
 * A reply's work views and cards, drawn on the Host so the page only binds them (specs/ai-interaction-experience A1, H2):
 * each waiting question with the person's half-written answer in place, each card, and the steps under the latest round.
 * Read by the Assistant's own page; the records themselves are unchanged.
 */
export function drawAssistantReply(body: unknown, ports: { say: (text: string, values?: Record<string, string | number>) => string; drafts(workId: string): Record<string, InteractionValues>; card(card: AssistantCard): string }): void {
  const drawCard = (card: AssistantCard) => Object.assign(card, { html: ports.card(card) });
  for (const candidate of [body, (body as { view?: unknown } | null)?.view]) {
    if (isView(candidate)) {
      const drafts = ports.drafts(candidate.work.work_id);
      for (const round of candidate.rounds) for (const question of round.awaiting_input) Object.assign(question, { html: agentQuestionHtml(question, ports.say, drafts[question.pending_id]) });
      candidate.cards.forEach(drawCard);
      const steps = assistantNextSteps(candidate, ports.say);
      Object.assign(candidate, { next_html: steps.length ? renderInteractionNextSteps(steps, ports.say("接下来")) : "" });
    }
  }
  const card = isCard(body) ? body : (body as { card?: unknown } | null)?.card;
  if (isCard(card)) drawCard(card);
}
