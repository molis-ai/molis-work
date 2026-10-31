import { UI_VIEW_GROUPS, UI_VIEW_HUES, UI_VIEW_RAILS, UI_VIEW_SLOTS, type UiViewDeclaration } from "@molis-ai/molis-work-contracts/platform/ui";
import { registeredIconNames } from "@molis-ai/molis-work-design-system";
import { ARTIFACT_NAVIGATION } from "./artifacts/navigation.js";

/**
 * What the shell reads of one plugin that runs in the project (W5-06 余项 2, BL-388, BL-542): the declarations of its Manifest
 * that place it, and nothing else. Built-in and installed-at-run-time plugins have this one shape. The Host takes it from the
 * Manifests its Runtimes run, once per page read; it also satisfies the view registry's Manifest subset, so the rail, the
 * create buttons and the project home's starts read it the way they read any Manifest.
 */
export interface PluginDirectoryEntry {
  /** The shell's key for the plugin: a built-in's project key, else the key the Host gave its surface. Safe in an attribute. */
  readonly id: string;
  readonly plugin_id: string;
  readonly name: string;
  /** The English interface's name for it (the Manifest's `name_en`): drawn only where the shell draws `name` itself. */
  readonly name_en?: string;
  /** Whether the project's plugin list chooses it (a built-in). Otherwise it is in the project because it runs there. */
  readonly chosen: boolean;
  /**
   * Trusted marks the Host sets from its own registry of built-ins (W5-02 B1), never from a Manifest: the plugin holds the
   * person's data across projects (`personal`), is on in every project and cannot be turned off (`always_on`), and the
   * project keys it is shown and chosen together with (`companions`). Absent means not marked. Only a `chosen` entry carries
   * them; the page uses them to draw and to pre-tick, and the Host's own registry decides what a submitted list means.
   */
  readonly personal?: true;
  readonly always_on?: true;
  readonly companions?: readonly string[];
  readonly ui: { readonly views: readonly UiViewDeclaration[] };
}

export type PluginDirectory = readonly PluginDirectoryEntry[];

const MAX_ENTRIES = 200, MAX_VIEWS = 32, MAX_COMPANIONS = 32;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const CONTROL = /[\u0000-\u001f\u007f]/gu;

/** Names the shell shows are one line; a longer one is cut, not refused. */
function line(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cut = [...value.replace(CONTROL, " ").trim()].slice(0, max).join("").trim();
  return cut === "" ? null : cut;
}

const key = (value: unknown): string | null => typeof value === "string" && KEY.test(value) ? value : null;

function sanitizeView(view: UiViewDeclaration, icons: ReadonlySet<string>, chosen: boolean): UiViewDeclaration | null {
  const viewId = key(view.view_id), title = line(view.title, 80);
  // A view that opens nothing from the rail has no title the shell draws, so its English is not kept.
  const titleEn = view.slot === "navigator" || view.slot === "island" ? line(view.title_en, 80) : null;
  if (!viewId || !title || !(UI_VIEW_SLOTS as readonly string[]).includes(view.slot)) return null;
  const known = (name: unknown) => typeof name === "string" && icons.has(name) ? name : undefined;
  const station = view.creates ? key(view.creates.station) : null, createTitle = view.creates ? line(view.creates.title, 40) : null;
  const startTitle = view.start ? line(view.start.title, 80) : null, hint = view.start ? line(view.start.hint, 200) : null;
  const icon = known(view.icon), startIcon = known(view.start?.icon);
  return {
    view_id: viewId, slot: view.slot, title,
    ...(titleEn ? { title_en: titleEn } : {}),
    ...(icon ? { icon } : {}),
    ...(view.accepts_objects === true ? { accepts_objects: true } : {}),
    ...(typeof view.order === "number" && Number.isFinite(view.order) ? { order: view.order } : {}),
    ...(view.group && (UI_VIEW_GROUPS as readonly string[]).includes(view.group) ? { group: view.group } : {}),
    ...(view.hue && (UI_VIEW_HUES as readonly string[]).includes(view.hue) ? { hue: view.hue } : {}),
    // The backbone, the extend entries and the Dock's default pins are the Host's to give: a plugin installed at run time is none of them.
    ...(chosen && view.slot === "navigator" && view.rail && (UI_VIEW_RAILS as readonly string[]).includes(view.rail) ? { rail: view.rail } : {}),
    ...(chosen && view.slot === "navigator" && view.pinned_default === true ? { pinned_default: true as const } : {}),
    ...(station && createTitle ? { creates: { station, title: createTitle } } : {}),
    ...(startTitle && hint ? { start: { title: startTitle, hint, ...(startIcon ? { icon: startIcon } : {}) } } : {}),
  };
}

/**
 * The directory as the shell may draw it. What a Manifest declares is text from whoever published the plugin: keys are held to a
 * plain pattern (they sit in attributes and selectors), names and titles are cut to a line, an icon the design system does not
 * know is dropped (the shell falls back to its default; a plugin never names a URL or artwork), and a group, slot or view that
 * is not one the Host defines is dropped. Escaping for HTML is the writer's, at each place the text is written.
 */
export function sanitizePluginDirectory(directory: PluginDirectory): PluginDirectory {
  const icons = new Set<string>(registeredIconNames());
  const seen = new Set<string>();
  const entries: PluginDirectoryEntry[] = [];
  for (const entry of directory.slice(0, MAX_ENTRIES)) {
    const id = key(entry.id), pluginId = key(entry.plugin_id), name = line(entry.name, 80), nameEn = line(entry.name_en, 80);
    if (!id || !pluginId || !name || seen.has(id)) continue;
    seen.add(id);
    const chosen = entry.chosen === true;
    const views = (entry.ui.views ?? []).slice(0, MAX_VIEWS).flatMap(view => { const clean = sanitizeView(view, icons, chosen); return clean ? [clean] : []; });
    entries.push({ id, plugin_id: pluginId, name, ...(nameEn ? { name_en: nameEn } : {}), chosen, ...(chosen ? trustedMarks(entry) : {}), ui: { views } });
  }
  return entries;
}

/** The Host's marks on a chosen entry: a flag only when exactly `true`, companions as distinct keys (at most {@link MAX_COMPANIONS}). */
function trustedMarks(entry: PluginDirectoryEntry): Pick<PluginDirectoryEntry, "personal" | "always_on" | "companions"> {
  const companions = [...new Set((Array.isArray(entry.companions) ? entry.companions : []).flatMap(value => { const clean = key(value); return clean ? [clean] : []; }))].slice(0, MAX_COMPANIONS);
  return {
    ...(entry.personal === true ? { personal: true as const } : {}),
    ...(entry.always_on === true ? { always_on: true as const } : {}),
    ...(companions.length ? { companions } : {}),
  };
}

/**
 * JSON that is safe to write inside a `<script>` element: `<`, `>`, `&`, U+2028 and U+2029 are written as `\uXXXX`, so no text
 * in it can end the element, open a comment or break a line for the parser. The one serializer for such JSON in the workbench.
 */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/gu, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/**
 * What the page's scripts read of the directory: each plugin's key, whether its views accept objects, and the colour of its group
 * on the tab strip (the first `hue` its views declare; null when none does, and the strip picks one by the key).
 */
export interface ClientDirectoryEntry { readonly id: string; readonly accepts_objects: boolean; readonly hue: string | null }

export function clientPluginDirectory(directory: PluginDirectory): ClientDirectoryEntry[] {
  return [{ id: ARTIFACT_NAVIGATION.id, accepts_objects: true, hue: ARTIFACT_NAVIGATION.hue }, ...directory.map(entry => ({
    id: entry.id,
    accepts_objects: entry.ui.views.some(view => view.accepts_objects === true),
    hue: entry.ui.views.find(view => view.hue !== undefined)?.hue ?? null,
  }))];
}

/** The directory element the page's scripts read once at start (`data-plugin-directory`). */
export function renderPluginDirectoryData(directory: PluginDirectory): string {
  return `<script type="application/json" data-plugin-directory>${scriptJson(clientPluginDirectory(directory))}</script>`;
}
