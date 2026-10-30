import { CHARACTER_ARTIFACT_PRODUCER, characterArtifactPreviewAction } from "@molis-ai/molis-work-contracts/modules/characters";
import { isArtifactLinkSubjectsAction, isArtifactReferrersAction, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { ARTIFACTS_HOST_PRODUCER, type ArtifactLinkKinds } from "@molis-ai/molis-work-module-artifacts";
import type { ArtifactFileDeclaration, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginRuntime, PluginSupervisor } from "@molis-ai/molis-work-plugin-runtime";
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
  readonly process_items?: PluginManifest["process_items"];
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
  // The 成果库's own imported-file type (PG-077): the platform writes it, so it is declared here and not in the 成果 plugin's Manifest.
  { ...ARTIFACTS_HOST_PRODUCER, surface: "artifacts" },
];

/** What one Plugin supervisor says is in effect: the Manifests of the installs that are enabled, and every Plugin it has held. */
export interface InstalledArtifactView {
  effectiveManifests(): readonly PluginManifest[];
  knownPluginIds(): readonly string[];
  /** False once the project the supervisor belongs to has closed; a closed view has no installs in effect. */
  alive(): boolean;
}

/**
 * The supervisors whose installs the registry reads (a project's, the Home's). The registry asks them each time it is read, so an
 * install, an uninstall, an enable, a disable and an upgrade show at once, with nothing rebuilt (RAC-415).
 */
class InstalledArtifactDirectory {
  readonly #views = new Set<InstalledArtifactView>();

  watch(view: InstalledArtifactView): () => void {
    this.#views.add(view);
    return () => { this.#views.delete(view); };
  }

  effective(): PluginManifest[] {
    const seen = new Set<string>();
    return this.#ask(view => view.effectiveManifests()).filter(manifest => !seen.has(manifest.plugin_id) && seen.add(manifest.plugin_id));
  }

  known(): Set<string> {
    return new Set(this.#ask(view => view.knownPluginIds()));
  }

  /** A view whose project has closed is dropped; any other failure of a view is the reader's to see. */
  #ask<T>(read: (view: InstalledArtifactView) => readonly T[]): T[] {
    return [...this.#views].flatMap(view => {
      if (view.alive()) return [...read(view)];
      this.#views.delete(view);
      return [];
    });
  }
}

export const installedArtifacts = new InstalledArtifactDirectory();

/** What a supervisor and its Runtime say is in effect: the Manifests of enabled installs that are not uninstalled and have not failed to start, and every Plugin they have held. */
export function supervisedArtifacts(supervisor: PluginSupervisor, runtime: PluginRuntime, alive: () => boolean): InstalledArtifactView {
  return {
    alive,
    effectiveManifests: () => supervisor.enabledPluginIds().flatMap(pluginId => {
      const manifest = supervisor.manifest(pluginId);
      return manifest && supervisor.installation(pluginId) && (supervisor.state(pluginId)?.status ?? "running") === "running" ? [manifest] : [];
    }),
    knownPluginIds: () => [...new Set([...supervisor.states().map(state => state.plugin_id), ...runtime.list().map(record => record.plugin_id)])],
  };
}

const sourceOf = (manifest: PluginManifest, surface: string): ArtifactProducerSource => ({ plugin_id: manifest.plugin_id, name: manifest.name, surface,
  artifacts: manifest.artifacts, ...manifest.process_items ? { process_items: manifest.process_items } : {}, actions: manifest.actions ?? [] });

/**
 * Every producer the registry reads: the plugins this build ships, the Host's own, and the plugins installed on this Host. A plugin
 * that is installed and enabled is read from its installed Manifest (an upgrade shows); one that has been installed here but is no
 * longer in effect (disabled, uninstalled) declares nothing, so its types and link kinds are no longer written.
 */
export function artifactProducerSources(): readonly ArtifactProducerSource[] {
  const effective = installedArtifacts.effective(), byId = new Map(effective.map(manifest => [manifest.plugin_id, manifest] as const)), known = installedArtifacts.known();
  const shipped = PLATFORM_PLUGIN_REGISTRATIONS.flatMap(entry => {
    const installed = byId.get(entry.manifest.plugin_id);
    if (installed) return [sourceOf(installed, entry.project_plugin_id)];
    return known.has(entry.manifest.plugin_id) ? [] : [sourceOf(entry.manifest, entry.project_plugin_id)];
  });
  const shippedIds = new Set(PLATFORM_PLUGIN_REGISTRATIONS.map(entry => entry.manifest.plugin_id));
  return [
    ...shipped,
    ...HOST_ARTIFACT_PRODUCERS.map(host => ({ plugin_id: host.plugin_id, name: host.name, surface: host.surface, artifacts: { produces: host.produces, consumes: [] }, actions: host.actions })),
    ...effective.filter(manifest => !shippedIds.has(manifest.plugin_id)).map(manifest => sourceOf(manifest, manifest.plugin_id)),
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

/** The plugins that name their own objects behind the link kinds they declare (「被谁引用」, BL-646), by plugin id. */
export function artifactLinkSubjectActions(sources: readonly ArtifactProducerSource[] = artifactProducerSources()): ReadonlyMap<string, ArtifactProducerSource["actions"][number]> {
  return new Map(sources.flatMap(source => {
    const action = source.actions.find(item => isArtifactLinkSubjectsAction(item.action));
    return action ? [[source.plugin_id, action] as const] : [];
  }));
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

/**
 * The kinds of ledger edge Plugins declare from their objects to a 成果 version (`artifacts.links`), by kind; the 成果库 reads links
 * with this and names no kind itself. A kind has one owner: where two producers declare it, the first stays and `linkKindProblems`
 * names the other.
 */
export function artifactLinkKinds(sources: readonly ArtifactProducerSource[] = artifactProducerSources()): ArtifactLinkKinds {
  const kinds = new Map<string, { module: string; plugin_id: string; plugin_title: string; role: "input" | "output"; proposal: boolean }>();
  for (const source of sources) for (const link of source.artifacts.links ?? []) {
    if (!kinds.has(link.kind)) kinds.set(link.kind, { module: source.surface, plugin_id: source.plugin_id, plugin_title: source.name, role: link.role, proposal: link.proposal === true });
  }
  return kinds;
}

/** What stops the producers' link kinds from being one table: a kind declared by more than one Plugin (S-70.3). */
export function linkKindProblems(sources: readonly ArtifactProducerSource[]): string[] {
  const owners = new Map<string, string>(), problems: string[] = [];
  for (const source of sources) for (const link of source.artifacts.links ?? []) {
    const owner = owners.get(link.kind);
    if (owner === undefined) owners.set(link.kind, source.plugin_id);
    else if (owner !== source.plugin_id) problems.push(`链接种类 ${link.kind} 已由 ${owner} 声明，${source.plugin_id} 不能再声明`);
  }
  return problems;
}
