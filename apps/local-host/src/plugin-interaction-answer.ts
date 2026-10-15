import type { AgentQuestion, AgentQuestionProblem, InteractionRequestResult } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { agentQuestionHtml, questionErrors } from "./agent-question-card.js";
import { L } from "./web-locale.js";

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const isQuestion = (value: unknown): value is AgentQuestion => isRecord(value) && Number.isInteger(value.index) && typeof value.prompt === "string" && Array.isArray(value.options);
const isProblem = (value: unknown): value is AgentQuestionProblem => isRecord(value) && Number.isInteger(value.question) && typeof value.reason === "string";

/** A plugin answer that asks the person first (contracts `InteractionRequestResult`), whichever plugin gave it. */
function isInteractionRequest(body: Record<string, unknown>): body is Record<string, unknown> & InteractionRequestResult {
  const interaction = body.interaction;
  return body.status === "needs_input" && isRecord(interaction) && typeof interaction.interaction_id === "string" && typeof interaction.why === "string"
    && Array.isArray(interaction.questions) && interaction.questions.length > 0 && interaction.questions.every(isQuestion);
}

/**
 * What the Host adds to a plugin route's answer on its way to the page, for every plugin alike (specs/ai-interaction-experience
 * S1): a plugin action that asks the person first gets the shared question card the Assistant and Coding show, with the
 * plugin's own footer line; a refusal whose `details.problems` are question problems gets each field's line in the reader's
 * language, worded as the Assistant's card words them. Anything else passes through unchanged. The plugin decides what to ask
 * and checks the answer; the Host only draws and words.
 */
export function withPluginInteraction(body: unknown): unknown {
  if (!isRecord(body)) return body;
  if (isInteractionRequest(body)) {
    const { interaction } = body;
    const html = agentQuestionHtml({ pending_id: interaction.interaction_id, kind: "plugin-interaction", prompt: interaction.why, options: [], allows_free_text: false,
      questions: interaction.questions }, L, {}, interaction.note ? L(interaction.note) : L("回答后接着做。"));
    return { ...body, interaction: { ...interaction, html } };
  }
  const details = body.details;
  if (!isRecord(details) || details.errors !== undefined || !Array.isArray(details.problems) || !details.problems.length || !details.problems.every(isProblem)) return body;
  return { ...body, details: { ...details, errors: questionErrors(details.problems, L) } };
}
