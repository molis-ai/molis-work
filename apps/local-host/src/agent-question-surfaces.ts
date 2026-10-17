import type { AgentQuestionType } from "@molis-ai/molis-work-contracts/services/agent-interaction";

/**
 * The typed-questionnaire question types each surface that renders `awaiting_input` can draw and validate.
 * Prologue offers question types per Runtime, not per run, so the Host may offer only the types every surface below
 * can render: a type is added to its surface's list in the same change that teaches the surface to draw it.
 *
 * Empty means the surface draws only the plain question (options as labels). Offering even `choice` switches the model
 * to the typed form (options with descriptions, a recommendation and a default). Both surfaces draw it with the Host's
 * shared question card (A1, A2), which also draws words, numbers, dates and a date and time (T1) and objects found by name (T2).
 */
export const ASSISTANT_QUESTION_TYPES: readonly AgentQuestionType[] = ["choice", "text", "number", "date", "datetime", "reference"];
export const CODING_QUESTION_TYPES: readonly AgentQuestionType[] = ["choice", "text", "number", "date", "datetime", "reference"];

/** The types the Runtime may offer: the ones every question-rendering surface can draw. */
export function hostQuestionTypes(
  surfaces: ReadonlyArray<readonly AgentQuestionType[]> = [ASSISTANT_QUESTION_TYPES, CODING_QUESTION_TYPES],
): AgentQuestionType[] {
  const [first = [], ...rest] = surfaces;
  return first.filter(type => rest.every(surface => surface.includes(type)));
}
