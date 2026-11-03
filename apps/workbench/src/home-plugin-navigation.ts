import { escapeHtml, icon, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { BUILTIN_PLUGIN_CATALOG } from "./builtin-plugins.js";
import type { SidePanelPluginTab } from "./side-panel.js";

/** Home views share their instance; a project side view keeps the project named by its route. */
export function homePluginSideTabs(routePrefix = ""): SidePanelPluginTab[] {
  return BUILTIN_PLUGIN_CATALOG.filter(entry => entry.manifest.runtime?.scope === "home").flatMap(entry =>
    (entry.manifest.ui?.views ?? []).filter(view => view.slot === "side").map((view, index) => ({
      key: `${entry.project_plugin_id}/${view.view_id}`, title: view.title,
      ...(view.context_binding ? { contextOwner: entry.manifest.plugin_id, contextSurface: entry.project_plugin_id } : {}),
      icon: (view.icon ?? "package") as PluginIconName, ...(view.order === undefined ? {} : { order: view.order }),
      src: routePrefix ? `${routePrefix}/side/${encodeURIComponent(entry.project_plugin_id)}/${encodeURIComponent(view.view_id)}`
        : `/plugins/${encodeURIComponent(entry.project_plugin_id)}?side=${encodeURIComponent(view.view_id)}`,
      ...(index === 0 && entry.runtime?.keys ? { keys: entry.runtime.keys } : {}),
    })));
}

/** The chords Home tools answer to, for frames that hand them to the shell. */
function homePluginKeys(): string[] {
  return homePluginSideTabs().flatMap(tab => tab.keys ? [tab.keys] : []);
}

/**
 * In a frame (a side view, an embedded pane), a Home tool's chord goes up to the shell, whose side panel answers it:
 * the chord works wherever the keyboard is. Inline in each document, outside the size-frozen page assets.
 */
export function homeToolKeysScript(keys = homePluginKeys()): string {
  return keys.length ? `(()=>{if(window.top===window)return;const keys=${JSON.stringify(keys)};
addEventListener('keydown',event=>{const chord=(event.metaKey||event.ctrlKey?'Mod+':'')+(event.shiftKey?'Shift+':'')+(event.altKey?'Alt+':'')+String(event.code).replace(/^Key/,'');
if(event.repeat||event.isComposing||!keys.includes(chord))return;event.preventDefault();try{window.top.postMessage({type:'molis:side-key',keys:chord},location.origin);}catch{/* A shell from another origin cannot hear it. */}},true);})();` : "";
}

/** `Mod+Shift+I` as the platform writes it: ⌘⇧I on a Mac, Ctrl+Shift+I elsewhere (rewritten in the page). */
function keysLabel(keys: string): string {
  return keys.replace("Mod+", "⌘").replace("Shift+", "⇧").replace("Alt+", "⌥");
}

/** A signed package installed in the Home, as the tool bar offers it: its name, the stage's icon, and the surface its stage opens as. */
export interface HomePluginNavigationEntry {
  readonly plugin_id: string;
  readonly name: string;
  readonly icon?: string;
  readonly surface: string;
}

/** The icon a package that picked none is drawn with, as every plugin view without one. */
const DEFAULT_ICON: PluginIconName = "package";

/**
 * Home tools stay within reach; declared side views open beside the current work. The signed packages installed in the Home follow the
 * built-in tools, by name: a package has a stage and no side view, so it opens that stage (BL-713).
 */
export function renderHomePluginNavigation(href?: (path: string) => string, installed: readonly HomePluginNavigationEntry[] = []): string {
  const entries = BUILTIN_PLUGIN_CATALOG.filter(entry => entry.manifest.runtime?.scope === "home").flatMap(entry => {
    const stage = entry.manifest.ui?.views?.find(view => view.slot === "stage");
    if (!stage) return [];
    const glyph = entry.manifest.ui?.views?.find(view => view.slot === "navigator")?.icon;
    const side = entry.manifest.ui?.views?.find(view => view.slot === "side");
    const keys = side && entry.runtime?.keys;
    const attrs = `class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" data-home-plugin-open="${escapeHtml(entry.project_plugin_id)}"${keys
      ? ` aria-keyshortcuts="${escapeHtml(keys.replace("Mod+", "Meta+"))}" title="${escapeHtml(`${entry.manifest.name} ${keysLabel(keys)}`)}"` : ""}`;
    // The label stays visible at narrow widths, where other arrival tools become icon-only.
    const content = `${glyph ? icon(glyph as PluginIconName) : ""}${escapeHtml(entry.manifest.name)}`;
    return [side ? `<button ${attrs} type="button" data-side-plugin-open="${escapeHtml(`${entry.project_plugin_id}/${side.view_id}`)}" aria-controls="side-panel" aria-expanded="false">${content}</button>` : href
      ? `<a ${attrs} href="${escapeHtml(href(`/plugins/${encodeURIComponent(entry.project_plugin_id)}`))}">${content}</a>`
      : `<button ${attrs} type="button" data-work-surface-open="${escapeHtml(stage.view_id)}">${content}</button>`];
  }).join("") + installed.map(entry => {
    const attrs = `class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" data-home-plugin-open="${escapeHtml(entry.plugin_id)}"`;
    const content = `${icon((entry.icon ?? DEFAULT_ICON) as PluginIconName)}${escapeHtml(entry.name)}`;
    return href ? `<a ${attrs} href="${escapeHtml(href(`/plugins/${encodeURIComponent(entry.plugin_id)}`))}">${content}</a>`
      : `<button ${attrs} type="button" data-work-surface-open="${escapeHtml(entry.surface)}">${content}</button>`;
  }).join("");
  return `<span class="mw-group" style="order:var(--home-tools-order,4);flex:none;padding:0;margin-left:auto">${entries}</span>`;
}
