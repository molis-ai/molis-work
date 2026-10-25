import type { AgentQuestionType } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { isSubjectReader, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { boundReferenceKinds, type ReferenceKindCandidate } from "@molis-ai/molis-work-service-agent-host";

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

type Declared = Parameters<typeof isSubjectReader>[0] & { subject_kinds: readonly string[]; search_source?: { kinds: ReadonlyArray<{ kind: string; title: string }> } };

/**
 * One plugin's kinds a reference question may ask for (T2, AC-28-1), each with the name the plugin gives it: a kind the
 * plugin lists for search and also reads back, since a pick is found by search and named by its owner's reader (S-26).
 */
export function pluginReferenceKinds(plugin_id: string, installation: string, actions: readonly Declared[]): ReferenceKindCandidate[] {
  const read = new Set(actions.filter(action => isSubjectReader(action)).flatMap(action => action.subject_kinds));
  return actions.flatMap(action => action.search_source?.kinds ?? []).filter(entry => read.has(entry.kind)).map(entry => ({ plugin_id, installation, kind: entry.kind, title: entry.title }));
}

/**
 * The Runtime's kinds: the plugins the Host ships, bounded and ordered as each round's own list is (BL-152). A round in a
 * project replaces it with that project's (agent-reference-kinds.ts); a round the Host cannot list for keeps this one.
 */
export function hostReferenceKinds(manifests: ReadonlyArray<{ plugin_id: string; actions?: ReadonlyArray<{ action: Declared }> }> = BUILTIN_PLUGIN_CATALOG.map(entry => entry.manifest)): Array<{ kind: string; title: string }> {
  return boundReferenceKinds(manifests.flatMap(manifest => pluginReferenceKinds(manifest.plugin_id, manifest.plugin_id, (manifest.actions ?? []).map(definition => definition.action)))).kinds;
}

/** A plugin that ships with the Host registers under its own id; any other installation under its installation id. */
const builtinOf = (view: ActionView) => {
  const pluginId = view.provider.plugin_id ?? view.provider.provider_id;
  const entry = BUILTIN_PLUGIN_CATALOG.find(candidate => candidate.manifest.plugin_id === pluginId);
  // The Host registers a bundled Runtime plugin under its plugin_id; an external installation registers under its install id,
  // even when its Manifest names a built-in plugin's id. The install id is a hash for both, so it cannot make this choice.
  return entry && view.provider.provider_id === pluginId ? entry : undefined;
};

/**
 * The kinds a round in a project may ask for (BL-152): those of the plugins installed and shown in it. An action that is
 * not available here, a built-in plugin the project does not show, and a plugin the project hid are left out, as the side
 * panel's files leave them out (side-files-http.ts). `shown` is undefined when the project has no catalog entry.
 */
export function projectReferenceKinds(views: readonly ActionView[], shown: ReadonlySet<string> | undefined, hidden: ReadonlySet<string>): ReferenceKindCandidate[] {
  const plugins = new Map<string, { pluginId: string; installation: string; views: ActionView[] }>();
  for (const view of views) {
    const pluginId = view.provider.plugin_id ?? view.provider.provider_id, builtin = builtinOf(view);
    if (!view.availability.available || hidden.has(builtin?.project_plugin_id ?? pluginId) || (builtin && shown && !shown.has(builtin.project_plugin_id))) continue;
    // One installation is one plugin: another installation that names a built-in plugin's id is not that plugin.
    const key = builtin ? `builtin:${pluginId}` : `installed:${view.provider.plugin_install_id ?? pluginId}`;
    if (!plugins.has(key)) plugins.set(key, { pluginId, installation: key, views: [] });
    plugins.get(key)!.views.push(view);
  }
  return [...plugins.values()].flatMap(plugin => pluginReferenceKinds(plugin.pluginId, plugin.installation, plugin.views.map(view => view.action)));
}
