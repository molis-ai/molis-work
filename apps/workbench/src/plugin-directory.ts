import { UI_VIEW_GROUPS, UI_VIEW_HUES, UI_VIEW_RAILS, UI_VIEW_SLOTS } from "@molis-ai/molis-work-contracts/platform/ui";
import type { DirectoryView, PluginDirectory, PluginDirectoryEntry } from "@molis-ai/molis-work-ui-host";
import { registeredIconNames } from "@molis-ai/molis-work-design-system";
import { ARTIFACT_NAVIGATION } from "./artifacts/navigation.js";

export type { PluginDirectory, PluginDirectoryEntry } from "@molis-ai/molis-work-ui-host";

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

function sanitizeView(view: DirectoryView, icons: ReadonlySet<string>, chosen: boolean): DirectoryView | null {
  const viewId = key(view.view_id), title = line(view.title, 80);
  if (!viewId || !title || !(UI_VIEW_SLOTS as readonly string[]).includes(view.slot)) return null;
  const known = (name: unknown) => typeof name === "string" && icons.has(name) ? name : undefined;
  const station = view.creates ? key(view.creates.station) : null, createTitle = view.creates ? line(view.creates.title, 40) : null;
  const createLabel = line(view.creates?.label, 40);
  const startTitle = view.start ? line(view.start.title, 80) : null, hint = view.start ? line(view.start.hint, 200) : null;
  const icon = known(view.icon), startIcon = known(view.start?.icon);
  return {
    view_id: viewId, slot: view.slot, title,
    ...(icon ? { icon } : {}),
    ...(view.accepts_objects === true ? { accepts_objects: true } : {}),
    ...(typeof view.order === "number" && Number.isFinite(view.order) ? { order: view.order } : {}),
    ...(view.group && (UI_VIEW_GROUPS as readonly string[]).includes(view.group) ? { group: view.group } : {}),
    ...(view.hue && (UI_VIEW_HUES as readonly string[]).includes(view.hue) ? { hue: view.hue } : {}),
    // The backbone, the extend entries and the Dock's default pins are the Host's to give: a plugin installed at run time is none of them.
    ...(chosen && view.slot === "navigator" && view.rail && (UI_VIEW_RAILS as readonly string[]).includes(view.rail) ? { rail: view.rail } : {}),
    ...(chosen && view.slot === "navigator" && view.pinned_default === true ? { pinned_default: true as const } : {}),
    ...(station && createTitle ? { creates: { station, title: createTitle, ...(createLabel ? { label: createLabel } : {}) } } : {}),
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
    const id = key(entry.id), pluginId = key(entry.plugin_id), name = line(entry.name, 80), summary = line(entry.summary, 120);
    if (!id || !pluginId || !name || seen.has(id)) continue;
    seen.add(id);
    const chosen = entry.chosen === true;
    const views = (entry.ui.views ?? []).slice(0, MAX_VIEWS).flatMap(view => { const clean = sanitizeView(view, icons, chosen); return clean ? [clean] : []; });
    entries.push({ id, plugin_id: pluginId, name, ...(summary ? { summary } : {}), chosen,
      ...(chosen ? trustedMarks(entry) : homeMarks(entry)), ui: { views } });
  }
  return entries;
}

/** The two marks a package installed in the Home carries as a built-in Home plugin does: each only when exactly `true`. */
function homeMarks(entry: PluginDirectoryEntry): Pick<PluginDirectoryEntry, "personal" | "home"> {
  return { ...(entry.personal === true ? { personal: true as const } : {}), ...(entry.home === true ? { home: true as const } : {}) };
}

/** The Host's marks on a chosen entry: a flag only when exactly `true`, companions as distinct keys (at most {@link MAX_COMPANIONS}). */
function trustedMarks(entry: PluginDirectoryEntry): Pick<PluginDirectoryEntry, "personal" | "home" | "always_on" | "companions"> {
  const companions = [...new Set((Array.isArray(entry.companions) ? entry.companions : []).flatMap(value => { const clean = key(value); return clean ? [clean] : []; }))].slice(0, MAX_COMPANIONS);
  return {
    ...homeMarks(entry),
    ...(entry.always_on === true ? { always_on: true as const } : {}),
    ...(companions.length ? { companions } : {}),
  };
}

/**
 * Whether a plugin is the person's own, as the switcher's 个人 group, the bar's right tray and ＋'s 「个人 · 所有项目共用」 all list it
 * (docs/design/workbench-navigation ②; 07-1 S4b): one the Host marks as holding the person's data across projects *and* running in
 * the Home's Runtime — the built-in Home plugins and every package installed in the Home. A personal plugin that runs per project
 * (Pages, 灵光) and a Home plugin not registered as the person's (Goals, Feed) are not. Running an instance on each side decides
 * nothing (Shelf does and is personal). The one rule; nothing else decides it.
 */
export function isPersonalPlugin(entry: Pick<PluginDirectoryEntry, "personal" | "home">): boolean {
  return entry.personal === true && entry.home === true;
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
 * on the tab strip (the first `hue` its views declare; null when none does, and the strip picks one by the key). A plugin this
 * project offers a place for carries its position on the rail (`order`, 0 first; the rail's keys in the rail's order), and `personal`
 * when it is the person's own ({@link isPersonalPlugin}): the tab workspace's ＋ lists those, in two sections (07-S2, 口径 8), instead
 * of reading the page's buttons.
 */
export interface ClientDirectoryEntry {
  readonly id: string;
  readonly accepts_objects: boolean;
  readonly hue: string | null;
  readonly order?: number;
  readonly personal?: true;
}

export function clientPluginDirectory(directory: PluginDirectory, offered: readonly string[] = []): ClientDirectoryEntry[] {
  const place = (id: string) => { const at = offered.indexOf(id); return at < 0 ? {} : { order: at }; };
  return [{ id: ARTIFACT_NAVIGATION.id, accepts_objects: true, hue: ARTIFACT_NAVIGATION.hue, ...place(ARTIFACT_NAVIGATION.id) }, ...directory.map(entry => ({
    id: entry.id,
    accepts_objects: entry.ui.views.some(view => view.accepts_objects === true),
    hue: entry.ui.views.find(view => view.hue !== undefined)?.hue ?? null,
    ...place(entry.id),
    ...(isPersonalPlugin(entry) ? { personal: true as const } : {}),
  }))];
}

/** Placement facts are separate from the publisher's display words. */
export function renderPluginDirectoryData(directory: PluginDirectory, offered: readonly string[] = []): string {
  return `<script type="application/json" data-plugin-directory>${scriptJson(clientPluginDirectory(directory, offered))}</script>`;
}

/** The shell's selected display words are data, never executable script or a reader selector. */
export function renderPluginTabTitlesData(titles: Readonly<Record<string, string>>): string {
  return `<script type="application/json" id="workbench-plugin-titles" data-ui-language-model>${scriptJson(titles)}</script>`;
}

type ScriptDocument = { querySelector(selector: string): { textContent: string | null } | null };

/** Deliberately serializable with the browser script factories. */
export function readClientPluginDirectory(doc: ScriptDocument | null): ClientDirectoryEntry[] {
  return JSON.parse(doc?.querySelector("script[data-plugin-directory]")?.textContent || "[]");
}

export function readClientPluginTitles(doc: ScriptDocument): Record<string, string> {
  return JSON.parse(doc.querySelector("#workbench-plugin-titles")?.textContent || "{}");
}
