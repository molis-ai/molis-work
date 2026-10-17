import type { AgentQuestionType } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { isSubjectReader } from "@molis-ai/molis-work-contracts/platform/actions";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";

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

type DeclaredActions = { actions?: ReadonlyArray<{ action: Parameters<typeof isSubjectReader>[0] & { subject_kinds: readonly string[];
  search_source?: { kinds: ReadonlyArray<{ kind: string; title: string }> } } }> };

/**
 * The kinds of object a reference question may ask for (T2, AC-28-1), each with the name its owner gives it: a kind a
 * plugin lists for search and also reads back, since a pick is found by search and named by its owner's reader (S-26).
 * Prologue fixes the list when the Runtime is made, so it comes from the manifests the Host ships; a kind the first
 * plugin names keeps that plugin's title.
 */
export function hostReferenceKinds(manifests: readonly DeclaredActions[] = BUILTIN_PLUGIN_CATALOG.map(entry => entry.manifest)): Array<{ kind: string; title: string }> {
  const kinds = new Map<string, string>();
  for (const manifest of manifests) {
    const read = new Set((manifest.actions ?? []).filter(definition => isSubjectReader(definition.action)).flatMap(definition => definition.action.subject_kinds));
    for (const definition of manifest.actions ?? []) for (const entry of definition.action.search_source?.kinds ?? []) {
      if (read.has(entry.kind) && !kinds.has(entry.kind)) kinds.set(entry.kind, entry.title);
    }
  }
  return [...kinds].map(([kind, title]) => ({ kind, title }));
}
