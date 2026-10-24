import type { ProjectPluginId, ProjectPluginRegistry } from "@molis-ai/molis-work-contracts/modules/projects";
import { UiViewRegistry, type UiPlacedView } from "@molis-ai/molis-work-ui-host";
import { browserSiteDeclarations, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { isArtifactReferrersAction, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { BUILTIN_PLUGIN_CATALOG } from "./builtin-plugins.js";
import { CHARACTER_ARTIFACT_PRODUCER, characterArtifactPreviewAction } from "@molis-ai/molis-work-contracts/modules/characters";
export { BUILTIN_PLUGIN_CATALOG } from "./builtin-plugins.js";

/**
 * What makes a catalog unusable (W5-02-REG-02): two entries with one project key, Manifest id or position, or a short id in
 * `companions`, `workbench.clientFrom` or `workbench.clientUses` that names no entry. scripts/generate-plugin-registry.mjs
 * refuses these in the plugins' sources; this holds the built catalog to the same, and the Host does not start on one.
 */
export function catalogProblems(catalog: readonly PluginRegistration[]): string[] {
  const problems: string[] = [];
  const once = (what: string, values: readonly (string | number)[]) => {
    const seen = new Set<string | number>();
    for (const value of values) {
      if (seen.has(value)) problems.push(`two plugins have ${what} ${value}`);
      seen.add(value);
    }
  };
  once("the project key", catalog.map(entry => entry.project_plugin_id));
  once("the Manifest id", catalog.map(entry => entry.manifest.plugin_id));
  once("the catalog position", catalog.map(entry => entry.catalog_order));
  const listed = new Set(catalog.map(entry => entry.project_plugin_id));
  for (const entry of catalog) {
    const named: Array<readonly [string, string]> = [
      ...(entry.companions ?? []).map(id => ["companions", id] as const),
      ...(entry.workbench.clientFrom === undefined ? [] : [["workbench.clientFrom", entry.workbench.clientFrom] as const]),
      ...(entry.workbench.clientUses ?? []).map(id => ["workbench.clientUses", id] as const),
    ];
    for (const [field, id] of named) if (!listed.has(id)) problems.push(`${entry.project_plugin_id} names ${id} in ${field}, which is not in the catalog`);
  }
  return problems;
}

const CATALOG_PROBLEMS = catalogProblems(BUILTIN_PLUGIN_CATALOG);
if (CATALOG_PROBLEMS.length > 0) throw new Error(`Built-in plugin catalog: ${CATALOG_PROBLEMS.join("; ")}`);

export interface PluginMarketCard {
  readonly id: ProjectPluginId;
  readonly runtime_id: string;
  readonly label: string;
  readonly glyph: string;
  readonly copy: string;
  readonly personal: boolean;
  /** Websites the Plugin says it uses in the side panel browser (its `surface:browser` declaration), shown before adding. */
  readonly sites: readonly string[];
}

/**
 * The plugins a project shows: those enabled there, and the personal ones unless the person hid them from it. The page,
 * its side panel tabs and the side panel's file sources all use this one list.
 */
export function shownProjectPlugins(enabled: readonly string[], hidden: readonly string[] = []): string[] {
  const excluded = new Set(hidden);
  const next = [...enabled];
  for (const personal of PERSONAL_PLUGIN_IDS) {
    if ((excluded.has(personal) && !ALWAYS_ON_PLUGIN_IDS.includes(personal)) || next.includes(personal)) continue;
    const artifactsAt = next.indexOf("artifacts");
    if (artifactsAt >= 0) next.splice(artifactsAt, 0, personal);
    else next.push(personal);
  }
  return next;
}

/** Enabled surfaces and their declared embedded dependencies; no installation or grant mutation. */
export function availableProjectPluginIds(
  enabled: readonly string[], catalog: readonly PluginRegistration[] = BUILTIN_PLUGIN_CATALOG,
): ReadonlySet<string> {
  const byProjectId = new Map(catalog.map(entry => [entry.project_plugin_id, entry]));
  const byManifestId = new Map(catalog.map(entry => [entry.manifest.plugin_id, entry]));
  const available = new Set<string>();
  const pending = [...enabled, ...catalog.filter(entry => entry.personal).map(entry => entry.project_plugin_id)];
  while (pending.length) {
    const id = pending.pop()!;
    const entry = byProjectId.get(id);
    if (!entry || available.has(id)) continue;
    available.add(id);
    for (const dependency of entry.manifest.ui.embedded_plugins ?? []) {
      const embedded = byManifestId.get(dependency);
      if (embedded) pending.push(embedded.project_plugin_id);
    }
  }
  return available;
}

/** Plugins a project can enable. Personal Plugins are always on and not listed. */
export const PROJECT_SCOPED_PLUGIN_IDS: readonly ProjectPluginId[] = BUILTIN_PLUGIN_CATALOG
  .filter((entry) => entry.personal !== true)
  .map((entry) => entry.project_plugin_id);

/** Personal Plugins are enabled for every project without being stored per project. */
export const PERSONAL_PLUGIN_IDS: readonly ProjectPluginId[] = BUILTIN_PLUGIN_CATALOG
  .filter((entry) => entry.personal === true)
  .map((entry) => entry.project_plugin_id);

/**
 * 常开插件 (the Manifest's `always_on`, specs/side-shelf §3.2): personal, shown in every project whatever it hid, and never
 * offered where plugins are chosen, added or removed. Only the built-in catalog has them (the Runtime refuses the mark elsewhere).
 */
export const ALWAYS_ON_PLUGIN_IDS: readonly ProjectPluginId[] = BUILTIN_PLUGIN_CATALOG
  .filter((entry) => entry.personal === true && entry.manifest.always_on === true)
  .map((entry) => entry.project_plugin_id);

/** The plugins the Dock keeps until the person chooses others (their choice is kept in the browser, per viewer). */
export const DOCK_DEFAULT_PINS: readonly string[] = ["goals", "inbox", "feed"];

/**
 * Plugins whose page parts the workbench wires once, when the page loads and cannot change after, so adding or removing one
 * brings the page back once (saved first). None today: Feed's source directory and Coding's settings row both attach and detach
 * live (specs/archive/plugin-picker-dock). A plugin that cannot is listed here and nothing else needs to change.
 */
export const RELOAD_ON_MEMBERSHIP_IDS: readonly string[] = [];

/**
 * Plugins that must come along, worked out from the Manifests.
 *
 * A Plugin with a **required** input port needs somebody in this project able
 * to publish that type; enabled on its own it could never be bound, and the
 * user would get a navigation entry that is permanently empty with no way to
 * tell why. Optional ports pull in nothing: Diff with nothing connected is a
 * legitimate state that explains itself.
 *
 * The closure is computed here because the Projects service applies companions
 * one level deep — it enables what this returns, not what that in turn needs.
 * Deriving it from the Manifests is also what keeps the promise above this
 * file true: adding a Plugin is adding a catalog entry and nothing else.
 */
function requiredCompanions(projectPluginId: ProjectPluginId): ProjectPluginId[] {
  const producers = new Map<string, ProjectPluginId>();
  for (const entry of BUILTIN_PLUGIN_CATALOG) {
    for (const port of entry.manifest.ports?.outputs ?? []) {
      const key = `${port.artifact_type_id}@${port.schema_version}`;
      if (!producers.has(key)) producers.set(key, entry.project_plugin_id);
    }
  }
  const needed = new Set<ProjectPluginId>();
  const pending = [projectPluginId];
  while (pending.length > 0) {
    const current = pending.pop()!;
    const manifest = entryFor(current)?.manifest;
    if (manifest === undefined) continue;
    for (const port of manifest.ports?.inputs ?? []) {
      if (port.optional === true) continue;
      const producer = producers.get(`${port.artifact_type_id}@${port.schema_version}`);
      // A required port with no producer in this build is left alone: enabling
      // an unrelated Plugin would not help, and saying nothing is honest.
      if (producer === undefined || producer === projectPluginId || needed.has(producer)) continue;
      needed.add(producer);
      pending.push(producer);
    }
  }
  return [...needed];
}

/** The registry Projects validates against, derived from what this build ships. */
export const BUILTIN_PLUGIN_REGISTRY: ProjectPluginRegistry = {
  has: (pluginId) => PROJECT_SCOPED_PLUGIN_IDS.includes(pluginId),
  initial: () => BUILTIN_PLUGIN_CATALOG.filter(entry => entry.default_enabled).map(entry => entry.project_plugin_id),
  companions: (pluginId) => [
    ...(entryFor(pluginId)?.companions ?? []),
    ...requiredCompanions(pluginId),
  ],
  isPersonal: (pluginId) => PERSONAL_PLUGIN_IDS.includes(pluginId),
  isAlwaysOn: (pluginId) => ALWAYS_ON_PLUGIN_IDS.includes(pluginId),
};

export interface RailEntry {
  id: ProjectPluginId;
  surface: string;
  label: string;
  glyph: string;
}

function entryFor(projectPluginId: ProjectPluginId): PluginRegistration | undefined {
  return BUILTIN_PLUGIN_CATALOG.find((entry) => entry.project_plugin_id === projectPluginId);
}

/** Navigator entries for the enabled set, in the order the Manifests declare. */
export function railEntries(enabled: readonly ProjectPluginId[]): RailEntry[] {
  return placedEntries(enabled, "navigator");
}

/** Personal island entries above the project card. */
export function islandEntries(enabled: readonly ProjectPluginId[]): RailEntry[] {
  return placedEntries(enabled, "island");
}

function shippedDirectoryIds(): string[] {
  const shipped = BUILTIN_PLUGIN_CATALOG
    .filter((entry) => entry.personal === true || Boolean(entry.summary))
    .map((entry) => entry.project_plugin_id);
  const ids = [
    ...railEntries(shipped).map((entry) => entry.id),
    ...islandEntries(shipped).map((entry) => entry.id),
  ];
  const unique = [...new Set(ids)];
  if (unique.includes("feed") && !unique.includes("sources")) unique.push("sources");
  return unique;
}

/**
 * Host chrome that opens a Plugin's own stage instead of a nested directory.
 * Derived from catalog navigator/island views of shipped plugins (personal or market summary).
 */
export const DIRECT_WORK_SURFACE_IDS: ReadonlySet<string> = new Set([
  "home",
  "market",
  ...shippedDirectoryIds().filter((id) => id !== "sources"),
]);

/** Directory panels owned by a Plugin stage, including Feed's sources alias. */
export const OWN_DIRECTORY_SURFACES: readonly string[] = shippedDirectoryIds();

function placedEntries(enabled: readonly ProjectPluginId[], slot: "navigator" | "island"): RailEntry[] {
  const registry = new UiViewRegistry(BUILTIN_PLUGIN_CATALOG.map((entry) => ({
    manifest: entry.manifest,
    enabled: enabled.includes(entry.project_plugin_id),
  })));
  return registry.slot(slot).map((view: UiPlacedView) => {
    const entry = BUILTIN_PLUGIN_CATALOG.find((item) => item.manifest.plugin_id === view.plugin_id);
    return {
      id: entry?.project_plugin_id ?? view.plugin_id,
      surface: entry?.project_plugin_id ?? view.plugin_id,
      label: view.title,
      glyph: view.icon ?? "package",
    };
  });
}

/**
 * Where opening a plugin lands (specs/context-program §21.6, W2'-2): `?openPlugin=`, a search hit's `open.surface` and an
 * opener's plugin name say which plugin, never where. A plugin whose UI has a work-area surface (main or directory) opens
 * there, as it always has, even when it also has a side view; one whose only place is a side view opens that tab of the
 * side panel. The answer is the side tab (`plugin:<plugin>/<view>`) of each plugin that opens in the panel.
 */
interface PlacedPluginDeclarations {
  readonly project_plugin_id: string;
  readonly manifest: { readonly ui: { readonly views?: readonly { readonly view_id: string; readonly slot: string }[] } };
  readonly workbench?: { readonly contributions: readonly { readonly descriptor: { readonly surfaces?: readonly { readonly target_slot_id: string }[] } }[] };
}
export function sideOpenedPlugins(entries: readonly PlacedPluginDeclarations[] = BUILTIN_PLUGIN_CATALOG): Record<string, string> {
  const placed: Record<string, string> = {};
  for (const entry of entries) {
    const surfaces = (entry.workbench?.contributions ?? []).flatMap((contribution) => contribution.descriptor.surfaces ?? []);
    if (surfaces.some((surface) => surface.target_slot_id === "workbench.main" || surface.target_slot_id === "workbench.directory")) continue;
    const side = entry.manifest.ui.views?.find((view) => view.slot === "side");
    if (side) placed[entry.project_plugin_id] = `plugin:${entry.project_plugin_id}/${side.view_id}`;
  }
  return placed;
}

/** Side panel tabs the enabled plugins declare (`slot: "side"`), in Manifest order; the Host serves each one's document. */
export function sideEntries(enabled: readonly ProjectPluginId[]): Array<UiPlacedView & { project_plugin_id: string }> {
  const registry = new UiViewRegistry(BUILTIN_PLUGIN_CATALOG.map((entry) => ({
    manifest: entry.manifest,
    enabled: enabled.includes(entry.project_plugin_id),
  })));
  return registry.slot("side").map((view) => ({
    ...view,
    project_plugin_id: BUILTIN_PLUGIN_CATALOG.find((item) => item.manifest.plugin_id === view.plugin_id)?.project_plugin_id ?? view.plugin_id,
  }));
}

/** Settings pages for the enabled set, in Manifest order. */
export function settingsEntries(enabled: readonly ProjectPluginId[]): UiPlacedView[] {
  const registry = new UiViewRegistry(BUILTIN_PLUGIN_CATALOG.map((entry) => ({
    manifest: entry.manifest,
    enabled: enabled.includes(entry.project_plugin_id),
  })));
  return registry.slot("settings");
}

export function manifestFor(projectPluginId: ProjectPluginId): PluginManifest | undefined {
  return entryFor(projectPluginId)?.manifest;
}

/** What a person can pick from. Plugins marked `developer` (Text Stats) appear only when the Host is in developer mode. */
export function pluginMarketCards(options: { readonly developerMode?: boolean } = {}): readonly PluginMarketCard[] {
  return BUILTIN_PLUGIN_CATALOG.flatMap((entry) => {
    if (!entry.summary || entry.manifest.always_on === true || (entry.developer && !options.developerMode)) return [];
    // A plugin whose page lives only in settings (角色) is part of the settings, not something a project adds or
    // removes: it stays out of the market (decision 2026-10-01, specs/post-merge-review §9).
    const views = entry.manifest.ui?.views ?? [];
    const nav = views.find((view) => view.slot === "navigator" || view.slot === "island");
    if (!nav) return [];
    return [{
      id: entry.project_plugin_id,
      runtime_id: entry.manifest.plugin_id,
      label: nav.title ?? entry.manifest.name,
      glyph: nav.icon ?? "package",
      copy: entry.summary,
      personal: entry.personal === true,
      sites: browserSiteDeclarations(entry.manifest),
    }];
  });
}

export function pluginTabGlyphs(): Record<string, string> {
  const enabled = [...PROJECT_SCOPED_PLUGIN_IDS, ...PERSONAL_PLUGIN_IDS];
  return Object.fromEntries([
    ["home", "home"],
    ["market", "grid"],
    ...railEntries(enabled).map((entry) => [entry.id, entry.glyph]),
    ...islandEntries(enabled).map((entry) => [entry.id, entry.glyph]),
  ]);
}

/** One sentence per plugin (the market summary) for the page heading's description line, keyed by work surface; a plugin that opens in the side panel has none (`sideOpenedPlugins`). */
export function pluginStageSummaries(): Record<string, string> {
  const side = sideOpenedPlugins();
  return Object.fromEntries(BUILTIN_PLUGIN_CATALOG
    .filter((entry) => Boolean(entry.summary) && !Object.hasOwn(side, entry.project_plugin_id))
    .map((entry) => [entry.project_plugin_id, entry.summary as string]));
}

/**
 * The English interface's names for the built-in plugins whose Manifest name is Chinese (user decision 2026-10-15). The
 * Chinese interface keeps the Manifest name; the plugins already named in English keep theirs in both.
 */
const PLUGIN_ENGLISH_NAMES: Readonly<Record<string, string>> = {
  artifacts: "Artifacts", "plugin-builder": "Plugin Studio", images: "Images", lingguang: "Lingguang", todo: "To-do",
  alchemist: "Alchemist", workflows: "Workflows",
};

/** A built-in plugin's name in the interface language. */
export const pluginLabel = (id: string, label: string, english: boolean): string => (english && PLUGIN_ENGLISH_NAMES[id]) || label;

export function pluginTabTitles(english = false): Record<string, string> {
  const enabled = [...PROJECT_SCOPED_PLUGIN_IDS, ...PERSONAL_PLUGIN_IDS];
  return Object.fromEntries([...railEntries(enabled), ...islandEntries(enabled)].map((entry) => [entry.id, pluginLabel(entry.id, entry.label, english)]));
}

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
export interface ArtifactContinuer { readonly plugin_id: string; readonly plugin_title: string; readonly action: ActionDefinition }

/** For each 成果 type, the built-in plugins that declare they can continue from it. */
export function artifactContinuers(): ReadonlyMap<string, readonly ArtifactContinuer[]> {
  const continuers = new Map<string, ArtifactContinuer[]>();
  for (const entry of BUILTIN_PLUGIN_CATALOG) for (const type of [...entry.manifest.artifacts.produces, ...entry.manifest.artifacts.consumes]) {
    const declared = type.continue, action = declared ? entry.manifest.actions?.find(item => item.capability_id === declared.capability_id && item.version === declared.version) : undefined;
    if (action) continuers.set(type.artifact_type_id, [...continuers.get(type.artifact_type_id) ?? [], { plugin_id: entry.manifest.plugin_id, plugin_title: entry.manifest.name, action }]);
  }
  return continuers;
}

/** The plugins that can say which of their objects link to a 成果 version (「被谁引用」, artifact-positioning 五.1). */
export function artifactReferrerActions(): readonly ArtifactContinuer[] {
  return BUILTIN_PLUGIN_CATALOG.flatMap(entry => (entry.manifest.actions ?? []).filter(action => isArtifactReferrersAction(action.action))
    .map(action => ({ plugin_id: entry.manifest.plugin_id, plugin_title: entry.manifest.name, action })));
}

/**
 * A 成果 producer that is part of the Host, not a plugin (Characters): what it writes, declared as a Manifest's `artifacts.produces`
 * would be, its actions, and the workbench surface its work objects open on. Wherever the built-in Manifests' declarations are
 * read, these are read with them.
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

/** Each declared 成果 type: display name, preview and pin actions and owner, from the built-in Manifests and the Host's own producers. */
export function artifactTypeDeclarations(): ReadonlyMap<string, ArtifactTypeDeclaration> {
  const declarations = new Map<string, ArtifactTypeDeclaration>();
  const producers = [...BUILTIN_PLUGIN_CATALOG.map(entry => ({ plugin_id: entry.manifest.plugin_id, name: entry.manifest.name, surface: entry.project_plugin_id,
    produces: entry.manifest.artifacts.produces, actions: entry.manifest.actions ?? [] })), ...HOST_ARTIFACT_PRODUCERS];
  for (const producer of producers) for (const type of producer.produces) {
    if (!type.title) continue;
    const action = (declared?: { capability_id: string; version: number }) => declared ? producer.actions.find(item => item.capability_id === declared.capability_id && item.version === declared.version) ?? null : null;
    declarations.set(type.artifact_type_id, { title: type.title, plugin_id: producer.plugin_id, plugin_title: producer.name,
      surface: producer.surface, preview: action(type.preview), pin: action(type.pin), compare: action(type.compare) });
  }
  return declarations;
}

/** Every 成果 type the built-in Manifests and the Host's own producers declare, as consumers name types (id and schema version). */
export function declaredArtifactTypes(): Array<{ artifact_type_id: string; schema_version: number }> {
  return [...BUILTIN_PLUGIN_CATALOG.map(entry => entry.manifest.artifacts.produces), ...HOST_ARTIFACT_PRODUCERS.map(producer => producer.produces)].flat()
    .map(type => ({ artifact_type_id: type.artifact_type_id, schema_version: type.schema_version }));
}
