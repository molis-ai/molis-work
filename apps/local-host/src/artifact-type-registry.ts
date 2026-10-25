import { CHARACTER_ARTIFACT_PRODUCER, characterArtifactPreviewAction } from "@molis-ai/molis-work-contracts/modules/characters";
import { isArtifactReferrersAction, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ArtifactFileDeclaration, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";

// The platform's table of 成果 types, read from what each producer's Manifest declares (PG-079, PG-064 in
// specs/repository-anti-corruption/privileges.md; slices/ac-artifacts.md §3.3). It lives in the Host with the other platform
// registrations (`plugin-registry.ts`); the workbench draws from what the Host hands it and exports none of it.

/** A visible 成果 type as its owner declares it (specs/artifact-positioning A4). */
export interface ArtifactTypeDeclaration {
  readonly title: string;
  readonly plugin_id: string;
  readonly plugin_title: string;
  /** The owner's surface in the workbench, where its work objects open. */
  readonly surface: string;
  readonly preview: ActionDefinition | null;
  /** The owner's action that pins one of its work objects on the spot (A5), when the type has one. */
  readonly pin: ActionDefinition | null;
  /** The owner's action that says whether a version still matches its work object (A4b). */
  readonly compare: ActionDefinition | null;
}

/** A plugin that can start new work from a 成果 type (「从这一版继续」, A4b), whether it owns the type or only reads it. */
export interface ArtifactContinuer {
  readonly plugin_id: string;
  readonly plugin_title: string;
  readonly action: ActionDefinition;
  /** The files it reads when the type is an imported file (`artifacts.consumes[].file`); none means it takes every one. */
  readonly file?: ArtifactFileDeclaration;
}

/** Whether a plugin that continues from an imported file can read this one: by its declared extensions, or by the text kept for a stored original. */
export function continuerReadsFile(continuer: Pick<ArtifactContinuer, "file">, file: { filename: string; stored?: unknown; text?: string | null }): boolean {
  const declared = continuer.file;
  if (!declared) return true;
  if (file.stored && declared.stored_text) return Boolean(file.text?.trim());
  const name = file.filename.toLowerCase();
  return declared.extensions.some(extension => name.endsWith(extension));
}

/** What the registry reads of one producer: the Manifest's declarations, and the workbench surface its work objects open on. */
export interface ArtifactProducerSource {
  readonly plugin_id: string;
  readonly name: string;
  readonly surface: string;
  readonly artifacts: PluginManifest["artifacts"];
  readonly actions: readonly ActionDefinition[];
}

/**
 * A 成果 producer that is part of the Host, not a plugin (Characters): what it writes, declared as a Manifest's `artifacts.produces`
 * would be, its actions, and the workbench surface its work objects open on. Wherever the Manifests' declarations are read, these
 * are read with them.
 */
export interface HostArtifactProducer {
  readonly plugin_id: string;
  readonly name: string;
  readonly surface: string;
  readonly produces: PluginManifest["artifacts"]["produces"];
  readonly actions: readonly ActionDefinition[];
}

export const HOST_ARTIFACT_PRODUCERS: readonly HostArtifactProducer[] = [
  { ...CHARACTER_ARTIFACT_PRODUCER, produces: [...CHARACTER_ARTIFACT_PRODUCER.produces], surface: "characters", actions: [characterArtifactPreviewAction] },
];

/** Every producer the registry reads: the plugins this build ships, and the Host's own. */
export function artifactProducerSources(): readonly ArtifactProducerSource[] {
  return [
    ...PLATFORM_PLUGIN_REGISTRATIONS.map(entry => ({ plugin_id: entry.manifest.plugin_id, name: entry.manifest.name, surface: entry.project_plugin_id,
      artifacts: entry.manifest.artifacts, actions: entry.manifest.actions ?? [] })),
    ...HOST_ARTIFACT_PRODUCERS.map(host => ({ plugin_id: host.plugin_id, name: host.name, surface: host.surface, artifacts: { produces: host.produces, consumes: [] }, actions: host.actions })),
  ];
}

/** For each 成果 type, the plugins that declare they can continue from it. */
export function artifactContinuers(sources: readonly ArtifactProducerSource[] = artifactProducerSources()): ReadonlyMap<string, readonly ArtifactContinuer[]> {
  const continuers = new Map<string, ArtifactContinuer[]>();
  for (const source of sources) for (const type of [...source.artifacts.produces, ...source.artifacts.consumes]) {
    const declared = type.continue, action = declared ? source.actions.find(item => item.capability_id === declared.capability_id && item.version === declared.version) : undefined;
    const file = "file" in type ? type.file : undefined;
    if (action) continuers.set(type.artifact_type_id, [...continuers.get(type.artifact_type_id) ?? [], { plugin_id: source.plugin_id, plugin_title: source.name, action, ...(file ? { file } : {}) }]);
  }
  return continuers;
}

/** The plugins that can say which of their objects link to a 成果 version (「被谁引用」, artifact-positioning 五.1). */
export function artifactReferrerActions(sources: readonly ArtifactProducerSource[] = artifactProducerSources()): readonly ArtifactContinuer[] {
  return sources.flatMap(source => source.actions.filter(action => isArtifactReferrersAction(action.action))
    .map(action => ({ plugin_id: source.plugin_id, plugin_title: source.name, action })));
}

/** Each declared 成果 type: display name, preview and pin actions and owner. */
export function artifactTypeDeclarations(sources: readonly ArtifactProducerSource[] = artifactProducerSources()): ReadonlyMap<string, ArtifactTypeDeclaration> {
  const declarations = new Map<string, ArtifactTypeDeclaration>();
  for (const source of sources) for (const type of source.artifacts.produces) {
    if (!type.title) continue;
    const action = (declared?: { capability_id: string; version: number }) => declared ? source.actions.find(item => item.capability_id === declared.capability_id && item.version === declared.version) ?? null : null;
    declarations.set(type.artifact_type_id, { title: type.title, plugin_id: source.plugin_id, plugin_title: source.name,
      surface: source.surface, preview: action(type.preview), pin: action(type.pin), compare: action(type.compare) });
  }
  return declarations;
}

/** Every 成果 type the producers declare, as consumers name types (id and schema version). */
export function declaredArtifactTypes(sources: readonly ArtifactProducerSource[] = artifactProducerSources()): Array<{ artifact_type_id: string; schema_version: number }> {
  return sources.flatMap(source => source.artifacts.produces).map(type => ({ artifact_type_id: type.artifact_type_id, schema_version: type.schema_version }));
}
