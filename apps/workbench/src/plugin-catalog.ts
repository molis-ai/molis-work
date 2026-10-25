import type { ProjectPluginId } from "@molis-ai/molis-work-contracts/modules/projects";
import { UiViewRegistry, type UiPlacedView } from "@molis-ai/molis-work-ui-host";
import { browserSiteDeclarations, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiViewGroup, UiViewRail } from "@molis-ai/molis-work-contracts/platform/ui";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { BUILTIN_PLUGIN_CATALOG } from "./builtin-plugins.js";
import { sanitizePluginDirectory, type PluginDirectory, type PluginDirectoryEntry } from "./plugin-directory.js";
export { BUILTIN_PLUGIN_CATALOG } from "./builtin-plugins.js";

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
 * The plugins the Dock keeps until the person chooses others (their choice is kept in the browser, per viewer): the ones whose
 * navigator view declares `pinned_default`, in the order of their views. Only a plugin the project chooses can be one.
 */
export function dockDefaultPins(directory: PluginDirectory = builtinPluginDirectory()): string[] {
  const chosen = directory.filter(entry => entry.chosen);
  return railEntries(chosen.map(entry => entry.id), chosen).filter(entry => entry.pinned_default).map(entry => entry.id);
}

/** The shell keys of the plugins that are a way to extend the workbench (a navigator view with `rail: "extend"`), kept out of the list of tools. */
export function extendPluginIds(directory: PluginDirectory = builtinPluginDirectory()): ReadonlySet<string> {
  return new Set(directory.filter(entry => entry.chosen && entry.ui.views.some(view => view.slot === "navigator" && view.rail === "extend")).map(entry => entry.id));
}

/**
 * Plugins whose page parts the workbench wires once, when the page loads and cannot change after, so adding or removing one
 * brings the page back once (saved first). None today: Feed's source directory and Coding's settings row both attach and detach
 * live (specs/archive/plugin-picker-dock). A plugin that cannot is listed here and nothing else needs to change.
 */
export const RELOAD_ON_MEMBERSHIP_IDS: readonly string[] = [];

export interface RailEntry {
  id: ProjectPluginId;
  surface: string;
  label: string;
  glyph: string;
  /** The rail group the plugin's view names (W5-06 2b); null is 更多. */
  group: UiViewGroup | null;
  /** The view's place in the rail apart from its group: `core` (the backbone) or `extend` (a way to extend the workbench); null is an ordinary tool. */
  rail: UiViewRail | null;
  /** Whether the Dock keeps the plugin until the person chooses others (the view's `pinned_default`). */
  pinned_default: boolean;
  /** Whether the project's plugin list chooses it (a built-in); a plugin installed at run time is in the project because it runs there. */
  chosen: boolean;
}

/** A kind a person can make new from a Goal, as the plugin's view declares it (`creates`). */
export interface PluginCreatableKind {
  readonly id: ProjectPluginId;
  /** The plugin's create station, which `placement.create` calls. */
  readonly station: string;
  /** The kind's name; a new one is called 未命名 followed by it. */
  readonly title: string;
}

/** One way to start something from the project home, as the plugin's view declares it (`start`); it opens that plugin. */
export interface PluginHomeStart {
  readonly id: ProjectPluginId;
  readonly title: string;
  readonly hint: string;
  readonly glyph: string;
}

function entryFor(projectPluginId: ProjectPluginId): PluginRegistration | undefined {
  return BUILTIN_PLUGIN_CATALOG.find((entry) => entry.project_plugin_id === projectPluginId);
}

function shippedDirectoryIds(): string[] {
  const shipped = BUILTIN_PLUGIN_CATALOG
    .filter((entry) => entry.personal === true || Boolean(entry.manifest.summary))
    .map((entry) => entry.project_plugin_id);
  const market = builtinPluginDirectory();
  const ids = [
    ...railEntries(shipped, market).map((entry) => entry.id),
    ...islandEntries(shipped, market).map((entry) => entry.id),
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

/**
 * The built-in catalog as a directory: what the market lists, and what a page drawn with no Runtime (the spec board, a fixture)
 * is drawn from. A page drawn by the Host is drawn from `pluginDirectoryFor` instead.
 */
export function builtinPluginDirectory(): PluginDirectory {
  return BUILTIN_PLUGIN_CATALOG.map(entry => ({ id: entry.project_plugin_id, plugin_id: entry.manifest.plugin_id, name: entry.manifest.name,
    chosen: true, ui: { views: entry.manifest.ui.views ?? [] } }));
}

/**
 * The directory a page is drawn with (W5-06 余项 2): the declarations of the plugins the Host's Runtimes run, and the market's for a
 * built-in none runs in this project (it stays one to add). Without a Host-supplied directory it is the built-in catalog's. What a
 * Runtime supplied is text from the plugin's publisher: it is sanitized here, the one place the shell takes it in.
 */
export function pluginDirectoryFor(running?: PluginDirectory): PluginDirectory {
  const market = builtinPluginDirectory();
  if (!running) return market;
  const clean = sanitizePluginDirectory(running);
  const present = new Set(clean.map(entry => entry.id));
  return [...clean, ...market.filter(entry => !present.has(entry.id))];
}

function registryFor(directory: PluginDirectory, enabled: readonly ProjectPluginId[]): UiViewRegistry {
  return new UiViewRegistry(directory.map((entry) => ({ manifest: entry, enabled: !entry.chosen || enabled.includes(entry.id) })));
}

/** The enabled plugins' views in one slot, in the order the Manifests declare, each with its plugin's shell key and whether the project chooses it. */
function placedViews(directory: PluginDirectory, enabled: readonly ProjectPluginId[], slot: "navigator" | "island" | "side" | "stage"): Array<{ id: ProjectPluginId; entry: PluginDirectoryEntry; view: UiPlacedView }> {
  return directory.flatMap(entry => registryFor([entry], enabled).slot(slot).map(view => ({ id: entry.id, entry, view })))
    .sort((left, right) => left.view.order - right.view.order
      || left.view.plugin_id.localeCompare(right.view.plugin_id)
      || left.view.view_id.localeCompare(right.view.view_id));
}

function railEntry({ id, entry, view }: { id: ProjectPluginId; entry: PluginDirectoryEntry; view: UiPlacedView }): RailEntry {
  return { id, surface: id, label: view.slot === "stage" ? entry.name : view.title, glyph: view.icon ?? "package", group: view.group,
    // Only a plugin the project chooses can be the backbone, an extend entry or pinned by default, whoever built the directory.
    rail: entry.chosen ? view.rail ?? null : null, pinned_default: entry.chosen && view.pinned_default === true, chosen: entry.chosen };
}

/** Navigator entries for the enabled set, in the order the Manifests declare. */
export function railEntries(enabled: readonly ProjectPluginId[], directory: PluginDirectory = builtinPluginDirectory()): RailEntry[] {
  return [...placedViews(directory, enabled, "navigator"), ...stageOnlyViews(directory, enabled)].map(railEntry);
}

/** Personal island entries above the project card. */
export function islandEntries(enabled: readonly ProjectPluginId[], directory: PluginDirectory = builtinPluginDirectory()): RailEntry[] {
  return placedViews(directory, enabled, "island").map(railEntry);
}

/** The plugins the project does not choose that have no directory view: they open at their stage. */
function stageOnlyViews(directory: PluginDirectory, enabled: readonly ProjectPluginId[]) {
  const placed = new Set([...placedViews(directory, enabled, "navigator"), ...placedViews(directory, enabled, "island")].map(item => item.id));
  const seen = new Set<string>();
  return placedViews(directory, enabled, "stage").filter(item => {
    if (item.entry.chosen || placed.has(item.id) || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/**
 * What can be made new from a Goal with the enabled plugins (their views' `creates`; W5-06 2b, BL-387): the directory views by
 * their `order`, then the islands. Not the rail's order, which puts the islands first.
 */
export function creatableKinds(enabled: readonly ProjectPluginId[], directory: PluginDirectory = builtinPluginDirectory()): PluginCreatableKind[] {
  return [...placedViews(directory, enabled, "navigator"), ...placedViews(directory, enabled, "island")]
    .flatMap(({ id, view }) => view.creates ? [{ id, station: view.creates.station, title: view.creates.title }] : []);
}

/** The project home's ways to start with the enabled plugins (their views' `start`), in the same order as `creatableKinds`. */
export function homeStarts(enabled: readonly ProjectPluginId[], directory: PluginDirectory = builtinPluginDirectory()): PluginHomeStart[] {
  return [...placedViews(directory, enabled, "navigator"), ...placedViews(directory, enabled, "island")].flatMap(({ id, view }) => view.start
    ? [{ id, title: view.start.title, hint: view.start.hint, glyph: view.start.icon ?? view.icon ?? "package" }] : []);
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
export function sideEntries(enabled: readonly ProjectPluginId[], directory: PluginDirectory = builtinPluginDirectory()): Array<UiPlacedView & { project_plugin_id: string }> {
  return placedViews(directory, enabled, "side").map(({ id, view }) => ({ ...view, project_plugin_id: id }));
}

/** Settings pages for the enabled set, in Manifest order. */
export function settingsEntries(enabled: readonly ProjectPluginId[], directory: PluginDirectory = builtinPluginDirectory()): UiPlacedView[] {
  return registryFor(directory, enabled).slot("settings");
}

export function manifestFor(projectPluginId: ProjectPluginId): PluginManifest | undefined {
  return entryFor(projectPluginId)?.manifest;
}

/** What a person can pick from. Plugins marked `developer` (Text Stats) appear only when the Host is in developer mode. */
/**
 * The market's cards. Whether one is the person's (`personal`) is the Host's mark on the page's directory (W5-02 B1); a page drawn with
 * no Host has none, so none of its cards is.
 */
export function pluginMarketCards(options: { readonly developerMode?: boolean } = {}, directory: PluginDirectory = builtinPluginDirectory()): readonly PluginMarketCard[] {
  const marked = new Map(directory.map((entry) => [entry.id, entry]));
  return BUILTIN_PLUGIN_CATALOG.flatMap((entry) => {
    if (!entry.manifest.summary || entry.manifest.always_on === true || (entry.manifest.developer && !options.developerMode)) return [];
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
      copy: entry.manifest.summary,
      personal: marked.get(entry.project_plugin_id)?.personal === true,
      sites: browserSiteDeclarations(entry.manifest),
    }];
  });
}

export function pluginTabGlyphs(): Record<string, string> {
  const market = builtinPluginDirectory(), enabled = market.map((entry) => entry.id);
  return Object.fromEntries([
    ["home", "home"],
    ["market", "grid"],
    ...railEntries(enabled, market).map((entry) => [entry.id, entry.glyph]),
    ...islandEntries(enabled, market).map((entry) => [entry.id, entry.glyph]),
  ]);
}

/** One sentence per plugin (the market summary) for the page heading's description line, keyed by work surface; a plugin that opens in the side panel has none (`sideOpenedPlugins`). */
export function pluginStageSummaries(): Record<string, string> {
  const side = sideOpenedPlugins();
  return Object.fromEntries(BUILTIN_PLUGIN_CATALOG
    .filter((entry) => Boolean(entry.manifest.summary) && !Object.hasOwn(side, entry.project_plugin_id))
    .map((entry) => [entry.project_plugin_id, entry.manifest.summary as string]));
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

/** The rail and island titles of a directory's plugins; the Host passes its own (`builtinMarketDirectory`), a page drawn without one uses the catalog's. */
export function pluginTabTitles(english = false, market: PluginDirectory = builtinPluginDirectory()): Record<string, string> {
  const enabled = market.map((entry) => entry.id);
  return Object.fromEntries([...railEntries(enabled, market), ...islandEntries(enabled, market)].map((entry) => [entry.id, pluginLabel(entry.id, entry.label, english)]));
}
