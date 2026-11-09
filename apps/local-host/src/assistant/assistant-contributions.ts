/**
 * What each plugin contributes for the Assistant, read from the unified action directory, and what is missing with
 * why it matters. A plugin that follows the conventions is used without an Assistant branch of its own; one that does
 * not is named here with the exact gap, so its developer can close it.
 */
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { dateTimeLocale } from "../web-locale.js";
import { actionEffect, isSubjectReader, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantContribution } from "@molis-ai/molis-work-contracts/services/assistant";
import { boundReferenceKinds, type ReferenceKindProblem } from "@molis-ai/molis-work-service-agent-host";
import { projectReferenceKinds } from "../agent-question-surfaces.js";

const joined = (items: readonly string[]) => items.join(uiText.text("common.list.separator"));

type Schema = { properties?: Record<string, { title?: unknown; description?: unknown }> };

// A kind left out of the reference questions' list (BL-152), said to the plugin's author; the model never sees this.
const REFERENCE_GAPS: Record<ReferenceKindProblem["reason"], (problem: ReferenceKindProblem) => string> = {
  kind: problem => uiText.text("workbench.assistant-contributions.reference-kind", { kinds: joined(problem.kinds), limit: problem.limit }),
  title: problem => uiText.text("workbench.assistant-contributions.reference-title", { kinds: joined(problem.kinds), limit: problem.limit }),
  limit: problem => uiText.text("workbench.assistant-contributions.reference-limit", { kinds: joined(problem.kinds), limit: problem.limit }),
};

const examples = (views: readonly ActionView[]) => joined(views.slice(0, 3).map(view => view.action.title));

export function assistantContributions(views: readonly ActionView[]): AssistantContribution[] {
  const referenceGaps = new Map<string, AssistantContribution["gaps"]>();
  for (const problem of boundReferenceKinds(projectReferenceKinds(views, undefined, new Set())).problems) {
    referenceGaps.set(problem.plugin_id, [...referenceGaps.get(problem.plugin_id) ?? [], { area: "context", text: REFERENCE_GAPS[problem.reason](problem) }]);
  }
  const agents = views.filter(view => view.action.audiences.includes("agent"));
  // A result is read back by whichever provider reads its kind, as the Assistant's work does.
  const readableAnywhere = new Set(agents.filter(view => isSubjectReader(view.action)).flatMap(view => view.action.subject_kinds));
  const providers = new Map<string, ActionView[]>();
  for (const view of agents) providers.set(view.provider.provider_id, [...providers.get(view.provider.provider_id) ?? [], view]);
  return [...providers.values()].map(rows => {
    const provider = rows[0]!.provider;
    const readers = rows.filter(view => isSubjectReader(view.action));
    const kinds = [...new Set(rows.flatMap(view => view.action.subject_kinds))];
    const readable = [...new Set(readers.flatMap(view => view.action.subject_kinds))];
    const commands = rows.filter(view => view.operation === "command" && actionEffect(view.action, view.capability_id) !== "read");
    // Linked: the change names one kind of object as its result (result_subject is read with it), and that kind can be
    // read back. A result whose kind nobody reads would sit in the work as a bare identifier.
    const named = commands.filter(view => view.action.subject_kinds.length === 1);
    const linked = named.filter(view => readableAnywhere.has(view.action.subject_kinds[0]!));
    const searchable = rows.some(view => Boolean((view.action as { search_source?: unknown }).search_source));
    const undescribed = rows.filter(view => !view.action.description?.trim() || view.action.description.trim() === view.action.title.trim());
    const untitled = rows.filter(view => Object.values((view.action.input_schema as Schema | undefined)?.properties ?? {}).some(field => !field.title && !field.description));
    const gaps: AssistantContribution["gaps"] = [...referenceGaps.get(provider.plugin_id ?? provider.provider_id) ?? []];
    const unread = kinds.filter(kind => !readableAnywhere.has(kind));
    if (unread.length && !readable.length) gaps.push({ area: "context", text: uiText.text("workbench.assistant-contributions.without-reader", { kinds: joined(unread) }) });
    else for (const kind of unread) gaps.push({ area: "context", text: uiText.text("workbench.assistant-contributions.unreadable-kind", { kind }) });
    const unnamed = commands.filter(view => !named.includes(view)), unreadable = named.filter(view => !linked.includes(view));
    if (unnamed.length) gaps.push({ area: "results", text: uiText.text("workbench.assistant-contributions.unnamed-result", { count: unnamed.length, examples: examples(unnamed) }) });
    if (unreadable.length) gaps.push({ area: "results", text: uiText.text("workbench.assistant-contributions.unreadable-result", { count: unreadable.length, kinds: joined([...new Set(unreadable.flatMap(view => view.action.subject_kinds.slice(0, 1)))]), examples: examples(unreadable) }) });
    if (undescribed.length) gaps.push({ area: "capabilities", text: uiText.text("workbench.assistant-contributions.no-purpose", { count: undescribed.length, examples: examples(undescribed) }) });
    if (untitled.length) gaps.push({ area: "capabilities", text: uiText.text("workbench.assistant-contributions.unlabeled-input", { count: untitled.length, examples: examples(untitled) }) });
    return { provider_id: provider.provider_id, title: provider.title, ...(provider.plugin_id ? { plugin_id: provider.plugin_id } : {}),
      actions: rows.length, reads: rows.filter(view => actionEffect(view.action, view.capability_id) === "read").length, changes: commands.length,
      readable_kinds: readable, linked_changes: linked.length, searchable, gaps };
  }).sort((a, b) => b.gaps.length - a.gaps.length || a.title.localeCompare(b.title, dateTimeLocale()));
}
