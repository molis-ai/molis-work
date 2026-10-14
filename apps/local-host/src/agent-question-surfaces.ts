import type { AgentQuestionType } from "@molis-ai/molis-work-contracts/services/agent-interaction";

/**
 * The typed-questionnaire question types each surface that renders `awaiting_input` can draw and validate.
 * Prologue offers question types per Runtime, not per run, so the Host may offer only the types every surface below
 * can render: a type is added to its surface's list in the same change that teaches the surface to draw it.
 *
 * Empty means the surface draws only the plain question (options as labels). Offering even `choice` switches the model
 * to the typed form (options with descriptions, a recommendation and a default), which these surfaces do not draw yet;
 * so until both learn it, the Host offers nothing and the Runtime keeps the plain question.
 */
export const ASSISTANT_QUESTION_TYPES: readonly AgentQuestionType[] = [];
export const CODING_QUESTION_TYPES: readonly AgentQuestionType[] = [];

/** The types the Runtime may offer: the ones every question-rendering surface can draw. */
export function hostQuestionTypes(
  surfaces: ReadonlyArray<readonly AgentQuestionType[]> = [ASSISTANT_QUESTION_TYPES, CODING_QUESTION_TYPES],
): AgentQuestionType[] {
  const [first = [], ...rest] = surfaces;
  return first.filter(type => rest.every(surface => surface.includes(type)));
}
