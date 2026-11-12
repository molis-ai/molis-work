import type { PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { BUILTIN_PLUGIN_CATALOG } from "./builtin-plugins.js";
import type { SidePanelPluginTab } from "./side-panel.js";
import { builtinPluginDirectory } from "./plugin-catalog.js";
import type { PluginDirectory } from "./plugin-directory.js";

/** Home views share their instance; a project side view keeps the project named by its route. */
export function homePluginSideTabs(routePrefix = "", directory: PluginDirectory = builtinPluginDirectory()): SidePanelPluginTab[] {
  return BUILTIN_PLUGIN_CATALOG.filter(entry => entry.manifest.runtime?.scope === "home").flatMap(entry =>
    (directory.find(item => item.id === entry.project_plugin_id)?.ui.views ?? []).filter(view => view.slot === "side").map((view, index) => ({
      key: `${entry.project_plugin_id}/${view.view_id}`, title: view.title,
      ...(view.context_binding ? { contextOwner: entry.manifest.plugin_id, contextSurface: entry.project_plugin_id } : {}),
      icon: (view.icon ?? "package") as PluginIconName, ...(view.order === undefined ? {} : { order: view.order }),
      src: routePrefix ? `${routePrefix}/side/${encodeURIComponent(entry.project_plugin_id)}/${encodeURIComponent(view.view_id)}`
        : `/plugins/${encodeURIComponent(entry.project_plugin_id)}?side=${encodeURIComponent(view.view_id)}`,
      ...(index === 0 && entry.runtime?.keys ? { keys: entry.runtime.keys } : {}),
    })));
}

/** The chords frames hand to the shell: the Home tools', and ⌘\ / Ctrl+\, which collapses or opens the right side. */
function homePluginKeys(): string[] {
  return ["Mod+Backslash", ...homePluginSideTabs().flatMap(tab => tab.keys ? [tab.keys] : [])];
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
