import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginInteractionClient, PluginInteractionNextSteps, PluginInteractionStep } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import type { AssistantCard } from "@molis-ai/molis-work-contracts/services/assistant";
import { renderInteractionNextSteps } from "@molis-ai/molis-work-design-system";
import { currentPluginInvocation } from "@molis-ai/molis-work-plugin-runtime";
import { agentQuestionHtml } from "./agent-question-card.js";
import { CARD_RESULT_OPEN, cardOutcomeSteps, interactionNextSteps } from "./agent-next-steps.js";
import { assistantCardHtml } from "./assistant/assistant-card-view.js";
import { isWebLocale, L, pageLocale, runWithLocale } from "./web-locale.js";

const interactionErrors = defineErrorCodes("host", { plugin_interaction_invalid: "invalid" });

const CARD_STATUSES = new Set<unknown>(["ready", "needs-input", "running", "done", "failed", "unknown", "stale", "dismissed"]);
const EFFECTS = new Set<unknown>(["read", "write", "irreversible"]);
const fieldsOf = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const text = (value: unknown) => typeof value === "string";

/**
 * What a drawing reads before it draws: a value of another shape is refused, not drawn half (a card's status and effect pick
 * its markup, so only the declared ones pass). Every string the drawings put on the page is escaped there.
 */
function question(value: unknown): AgentPendingQuestion {
  const given = fieldsOf(value);
  if (!given || !text(given.pending_id) || !text(given.prompt) || !Array.isArray(given.options) || (given.questions !== undefined && !Array.isArray(given.questions)))
    throw interactionErrors.plugin_interaction_invalid("问题卡需要 pending_id、prompt 和 options");
  return value as AgentPendingQuestion;
}
function card(value: unknown): AssistantCard {
  const given = fieldsOf(value);
  if (!given || !text(given.card_id) || !text(given.title) || !CARD_STATUSES.has(given.status) || !EFFECTS.has(given.effect) || !Array.isArray(given.fields) || !Array.isArray(given.missing))
    throw interactionErrors.plugin_interaction_invalid("操作卡需要 card_id、title、声明过的 status 与 effect、fields 和 missing");
  return value as AssistantCard;
}
function steps(value: unknown): PluginInteractionNextSteps {
  const given = fieldsOf(value), followUps = given?.follow_ups;
  if (!given || !Array.isArray(given.questions) || !Array.isArray(given.cards)
    || (followUps !== undefined && !(Array.isArray(followUps) && followUps.every(step => { const item = fieldsOf(step); return item && text(item.id) && text(item.label) && text(item.source); }))))
    throw interactionErrors.plugin_interaction_invalid("下一步行需要 questions、cards，follow_ups 每项要有 id、label 和 source");
  return { questions: given.questions.map(question), cards: given.cards.map(card), finished: given.finished === true,
    ...(Array.isArray(followUps) ? { follow_ups: followUps as PluginInteractionStep[] } : {}) };
}

/**
 * Drawn in the language of the plugin's call (its page's). A route runs in no action, so it draws in the language of the page
 * request it answers, which is also the one its execution carries; Chinese outside both (a call no page made).
 */
function inCallLanguage<T>(draw: () => T): Promise<T> {
  const scope = currentPluginInvocation(), locale = scope ? scope.caller.locale : pageLocale();
  return Promise.resolve().then(() => runWithLocale(locale !== undefined && isWebLocale(locale) ? locale : "zh", draw));
}

/**
 * `services.interaction` (PG-062): the question card, the action card and the next-step row a plugin's own page shows for an
 * Agent's round, drawn as the Assistant draws them (specs/ai-interaction-experience A1, H2, AC-25). It reads only what the plugin
 * passes and writes nothing, so every activation gets it without a permission (S-56). One frozen object, shared by every activation.
 */
export const pluginInteraction = Object.freeze<PluginInteractionClient>({
  questionHtml: (value, options) => inCallLanguage(() => agentQuestionHtml(question(value), L, undefined, undefined, options?.reask === true)),
  cardHtml: (value, options) => inCallLanguage(() => assistantCardHtml(card(value), L, undefined, options?.redo === true)),
  nextStepsHtml: value => inCallLanguage(() => {
    const input = steps(value);
    // Once the round is over, the result of its card that ran last, pressed by the selector its page keeps the card under.
    const ran = input.finished ? cardOutcomeSteps(input.cards, "", L, item => `[data-card=${JSON.stringify(item.card_id)}] [data-ix-press=${JSON.stringify(CARD_RESULT_OPEN)}]`) : [];
    const all = interactionNextSteps(input.questions, input.cards, [], [...ran, ...(input.follow_ups ?? [])], L);
    return all.length ? renderInteractionNextSteps(all, L("下一步"), { max: all.length }) : "";
  }),
});
