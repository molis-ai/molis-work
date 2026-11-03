import type { InteractionNextStep } from "@molis-ai/molis-work-contracts/platform/ui";
import { isTerminalAgentPhase } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { cardOutcomeSteps } from "../agent-next-steps.js";
import { deliveryNote, deliverySteps, isOpenable, type DeliveryNote } from "./assistant-delivery.js";

type Say = (text: string, values?: Record<string, string | number>) => string;

/** The most steps the outcome slot gives the row; the row shows three in all and folds the rest. */
const OUTCOME_STEPS = 2;

/**
 * The outcome slot of the row above the input (specs/context-program §21.9, SLOT-01): what the latest finished thing came
 * to, placed after whatever waits on the person. One outcome at a time, the first that has something: the work's delivery
 * note (receipts 3e), then the result of the card that ran last (interaction AC-06), then what the latest round made, or
 * its retry when it failed. Each owner adds its own branch here and draws its record in the conversation; nothing else
 * draws an outcome. A step leads to that record by `NEXT_STEP.record` or `NEXT_STEP.press`, so pressing it does only what
 * the record's own control does. A caller that has the view's delivery note already passes it (null for none).
 */
export function assistantOutcomeSteps(view: AssistantWorkView, say: Say, note: DeliveryNote | null = deliveryNote(view)): InteractionNextStep[] {
  const delivery = deliverySteps(view, say, note);
  if (delivery.length) return delivery.slice(0, OUTCOME_STEPS);
  for (const outcome of [cardOutcome, roundOutcome]) {
    const steps = outcome(view, say);
    if (steps.length) return steps.slice(0, OUTCOME_STEPS);
  }
  return [];
}

/**
 * The result of the card that ran last, once the latest round is over, and only a card that ran since that round began.
 * A failed round leaves the slot to its retry alone (context-program §21.9); the card still shows its result in the conversation.
 */
function cardOutcome(view: AssistantWorkView, say: Say): InteractionNextStep[] {
  const last = view.rounds.at(-1);
  if (last && (last.phase === "unknown" || last.phase === "failed" || !isTerminalAgentPhase(last.phase))) return [];
  return cardOutcomeSteps(view.cards, last?.started_at ?? "", say);
}

/** What the latest round made, or the same words again when it failed. */
function roundOutcome(view: AssistantWorkView, say: Say): InteractionNextStep[] {
  const last = view.rounds.at(-1);
  if (last?.phase === "failed") return [{ id: "retry", label: say("用同样的话再试一次"), source: last.text.slice(0, 200) }];
  if (last?.phase !== "completed") return [];
  return view.objects.filter(object => object.relation === "result" && isOpenable(object)).slice(0, OUTCOME_STEPS)
    .map((object, index) => ({ id: `open:${object.subject.kind}:${object.subject.id}`, label: say("打开「{title}」", { title: object.title }), source: say("这一轮做出的结果"),
      ...(index ? { primary: false } : {}) }));
}
