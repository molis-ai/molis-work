import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginInteractionClient, PluginInteractionNextSteps, PluginInteractionStep } from "@molis-ai/molis-work-contracts/platform/plugin";
import { AGENT_QUESTION_TYPES, type AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";
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
const CARD_INPUTS = new Set<unknown>(["date", "datetime"]);
const QUESTION_TYPES = new Set<unknown>(AGENT_QUESTION_TYPES);
const fieldsOf = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const text = (value: unknown) => typeof value === "string";
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const optionalText = (item: Record<string, unknown>, keys: readonly string[]) => keys.every(key => item[key] === undefined || text(item[key]));
const optionalBoolean = (item: Record<string, unknown>, keys: readonly string[]) => keys.every(key => item[key] === undefined || typeof item[key] === "boolean");
const optionalNumber = (item: Record<string, unknown>, keys: readonly string[]) => keys.every(key => item[key] === undefined || number(item[key]));
const choice = (value: unknown) => { const item = fieldsOf(value); return !!item && text(item.value) && text(item.label); };
const cardFieldOf = (value: unknown) => { const item = fieldsOf(value); return !!item && text(item.key) && text(item.label) && text(item.value) && typeof item.editable === "boolean"
  && (item.raw === undefined || text(item.raw)) && (item.options === undefined || Array.isArray(item.options) && item.options.every(choice)) && (item.input === undefined || CARD_INPUTS.has(item.input)); };
const missingOf = (value: unknown) => { const item = fieldsOf(value); return !!item && text(item.field) && text(item.question); };
const presentationOf = (value: unknown) => { const item = fieldsOf(value); if (!item || !text(item.summary)) return false;
  if (item.title !== undefined && !text(item.title) || item.text !== undefined && !text(item.text) || item.text_truncated !== undefined && item.text_truncated !== true) return false;
  if (item.link === undefined) return true; const link = fieldsOf(item.link); return !!link && text(link.label) && text(link.href); };
const originOf = (value: unknown) => { if (value === undefined) return true; const item = fieldsOf(value); return !!item && text(item.surface) && (item.title === undefined || text(item.title)); };
const sourceObjectOf = (value: unknown) => { if (value === undefined) return true; const item = fieldsOf(value); return !!item && text(item.kind) && text(item.id)
  && (item.version === undefined || item.version === null || text(item.version) || number(item.version)) && (item.title === undefined || text(item.title)); };
const questionDefaultOf = (value: unknown) => value === undefined || text(value) || number(value) || Array.isArray(value) && value.every(number);
const agentOptionOf = (value: unknown) => { const item = fieldsOf(value); return !!item && number(item.index) && text(item.label)
  && (item.description === undefined || text(item.description)) && (item.recommended === undefined || typeof item.recommended === "boolean"); };
const agentQuestionOf = (value: unknown) => { const item = fieldsOf(value); return !!item && number(item.index) && text(item.prompt) && QUESTION_TYPES.has(item.type)
  && typeof item.required === "boolean" && Array.isArray(item.options) && item.options.every(agentOptionOf) && typeof item.multiple === "boolean" && typeof item.allow_other === "boolean"
  && optionalText(item, ["id", "help", "unit"]) && optionalBoolean(item, ["multiline", "integer"]) && optionalNumber(item, ["max_length", "max_count"])
  && questionDefaultOf(item.default) && (item.min === undefined || text(item.min) || number(item.min)) && (item.max === undefined || text(item.max) || number(item.max))
  && (item.ref_kinds === undefined || Array.isArray(item.ref_kinds) && item.ref_kinds.every(text)); };

/**
 * What a drawing reads before it draws: a value of another shape is refused, not drawn half (a card's status and effect pick
 * its markup, so only the declared ones pass). A card, a question and their nested fields are checked where the drawing reads
 * them: an object of the right top-level shape but a nested field of another type would otherwise draw nothing or throw.
 * Every string the drawings put on the page is escaped there.
 */
function question(value: unknown): AgentPendingQuestion {
  const given = fieldsOf(value);
  if (!given || !text(given.pending_id) || !text(given.kind) || !text(given.prompt) || !Array.isArray(given.options) || !given.options.every(choice)
    || typeof given.allows_free_text !== "boolean" || !optionalNumber(given, ["pending_revision", "sequence"]) || !optionalBoolean(given, ["answerable"])
    || (given.parked !== undefined && given.parked !== true) || !optionalText(given, ["unavailable_reason"])
    || (given.questions !== undefined && !(Array.isArray(given.questions) && given.questions.every(agentQuestionOf))))
    throw interactionErrors.plugin_interaction_invalid("问题卡需要 pending_id、kind、prompt、options 与 allows_free_text，questions 的每一项要是一个完整的问题");
  return value as AgentPendingQuestion;
}
function card(value: unknown): AssistantCard {
  const given = fieldsOf(value);
  if (!given || !text(given.card_id) || !text(given.title) || !text(given.summary) || !text(given.provider) || !text(given.capability_title)
    || !CARD_STATUSES.has(given.status) || !EFFECTS.has(given.effect) || !Array.isArray(given.fields) || !given.fields.every(cardFieldOf)
    || !Array.isArray(given.missing) || !given.missing.every(missingOf) || (given.presentation !== undefined && !presentationOf(given.presentation))
    || !originOf(given.from) || !sourceObjectOf(given.source_object) || !optionalText(given, ["outcome"]))
    throw interactionErrors.plugin_interaction_invalid("操作卡需要 card_id、title、summary、provider、capability_title、声明过的 status 与 effect、fields、missing，嵌套字段也要是对的形状");
  return value as AssistantCard;
}
function steps(value: unknown): PluginInteractionNextSteps {
  const given = fieldsOf(value), followUps = given?.follow_ups;
  if (!given || !Array.isArray(given.questions) || !Array.isArray(given.cards) || (given.finished !== undefined && typeof given.finished !== "boolean")
    || (followUps !== undefined && !(Array.isArray(followUps) && followUps.every(step => { const item = fieldsOf(step); return item && text(item.id) && text(item.label) && text(item.source); }))))
    throw interactionErrors.plugin_interaction_invalid("下一步行需要 questions、cards，finished 若是给出则要 boolean，follow_ups 每项要有 id、label 和 source");
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
