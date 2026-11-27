import type { AgentQuestionType } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { isSubjectReader, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { shippedParts, builtinPluginByManifestId } from "./plugin-registry.js";
import { boundReferenceKinds, type ReferenceKindCandidate } from "@molis-ai/molis-work-service-agent-host";

/**
 * The typed-questionnaire question types the Host's question card (`agent-question-card.ts`) draws and validates. Every surface that
 * shows `awaiting_input` draws it with that one card, a plugin's stage through `plugin-interaction.ts` as much as the assistant (A1, A2), so the card says it once and
 * no surface has a list of its own (44C). Prologue offers question types per Runtime, not per run: a type is added here in the change
 * that teaches the card to draw it.
 *
 * Offering even `choice` switches the model to the typed form (options with descriptions, a recommendation and a default). The card also
 * draws words, numbers, dates and a date and time (T1) and objects found by name (T2).
 */
export const QUESTION_CARD_TYPES: readonly AgentQuestionType[] = ["choice", "text", "number", "date", "datetime", "reference"];

/** The types the Runtime may offer: the ones the question card can draw. */
export function hostQuestionTypes(): AgentQuestionType[] {
  return [...QUESTION_CARD_TYPES];
}

type Declared = Parameters<typeof isSubjectReader>[0] & {
  audiences: readonly string[];
  subject_kinds: readonly string[];
  search_source?: { kinds: ReadonlyArray<{ kind: string; title: string }> };
};

/**
 * One plugin's kinds a reference question may ask for (T2, AC-28-1), each with the name the plugin gives it: a kind the
 * plugin lists for search and also reads back for `agent`, since a pick is found by search and named by its owner's reader (S-26).
 */
export function pluginReferenceKinds(plugin_id: string, installation: string, actions: readonly Declared[]): ReferenceKindCandidate[] {
  const read = new Set(actions.filter(action => isSubjectReader(action) && action.audiences.includes("agent")).flatMap(action => action.subject_kinds));
  return actions.flatMap(action => action.search_source?.kinds ?? []).filter(entry => read.has(entry.kind)).map(entry => ({ plugin_id, installation, kind: entry.kind, title: entry.title }));
}

/**
 * The Runtime's kinds: the plugins the Host ships, bounded and ordered as each round's own list is (BL-152). A round in a
 * project replaces it with that project's (agent-reference-kinds.ts); a round the Host cannot list for keeps this one.
 */
export function hostReferenceKinds(manifests: ReadonlyArray<{ plugin_id: string; actions?: ReadonlyArray<{ action: Declared }> }> = shippedParts().map(entry => entry.manifest)): Array<{ kind: string; title: string }> {
  return boundReferenceKinds(manifests.flatMap(manifest => pluginReferenceKinds(manifest.plugin_id, manifest.plugin_id, (manifest.actions ?? []).map(definition => definition.action)))).kinds;
}

/** A plugin that ships with the Host registers under its own id; any other installation under its installation id. */
const builtinOf = (view: ActionView) => {
  const pluginId = view.provider.plugin_id ?? view.provider.provider_id;
  const entry = builtinPluginByManifestId(pluginId);
  // The Host registers a bundled Runtime plugin under its plugin_id; an external installation registers under its install id,
  // even when its Manifest names a built-in plugin's id. The install id is a hash for both, so it cannot make this choice.
  return entry && view.provider.provider_id === pluginId ? entry : undefined;
};

/**
 * The kinds a round in a project may ask for (BL-152): those of the plugins installed and shown in it. An action that is
 * not available here, a built-in plugin the project does not show, and a plugin the project hid are left out, as the side
 * panel's files leave them out (side-files-http.ts). `shown` is undefined when the project has no catalog entry.
 */
export function projectReferenceKinds(views: readonly ActionView[], shown: ReadonlySet<string> | undefined): ReferenceKindCandidate[] {
  const plugins = new Map<string, { pluginId: string; installation: string; views: ActionView[] }>();
  for (const view of views) {
    const pluginId = view.provider.plugin_id ?? view.provider.provider_id, builtin = builtinOf(view);
    if (!view.availability.available || (shown && !shown.has(builtin?.project_plugin_id ?? pluginId) && (builtin || view.action.scope === "home"))) continue;
    // One installation is one plugin: another installation that names a built-in plugin's id is not that plugin.
    const key = builtin ? `builtin:${pluginId}` : `installed:${view.provider.plugin_install_id ?? pluginId}`;
    if (!plugins.has(key)) plugins.set(key, { pluginId, installation: key, views: [] });
    plugins.get(key)!.views.push(view);
  }
  return [...plugins.values()].flatMap(plugin => pluginReferenceKinds(plugin.pluginId, plugin.installation, plugin.views.map(view => view.action)));
}
