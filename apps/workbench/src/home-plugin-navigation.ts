import type { PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { PERSONAL_SPACE_PROJECT_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { SHIPPED_WORKBENCH_PARTS } from "./host-surfaces.js";
import type { SidePanelPluginTab } from "./side-panel.js";
import { builtinPluginDirectory, hostSurfaceDirectory } from "./plugin-catalog.js";
import type { PluginDirectory } from "./plugin-directory.js";

/**
 * Home views share their instance; a project side view keeps the project named by its route. A platform part (Shelf, 44B) is in no
 * plugin directory: its tab is drawn from the platform's own surface entry, in every project. A partition plugin with a chord
 * (`project_runtime.keys`, Issues) has its tab in every partition too, showing the personal space's view (R14, batch 108).
 */
export function homePluginSideTabs(routePrefix = "", directory: PluginDirectory = builtinPluginDirectory()): SidePanelPluginTab[] {
  const surfaces = hostSurfaceDirectory();
  const personal = `/projects/${encodeURIComponent(PERSONAL_SPACE_PROJECT_ID)}`;
  return SHIPPED_WORKBENCH_PARTS.filter(entry => entry.manifest.runtime?.scope === "home" || entry.project_runtime?.keys).flatMap(entry =>
    ((directory.find(item => item.id === entry.project_plugin_id) ?? surfaces.find(item => item.id === entry.project_plugin_id))?.ui.views ?? []).filter(view => view.slot === "side").map((view, index) => ({
      key: `${entry.project_plugin_id}/${view.view_id}`, title: view.title,
      ...(view.context_binding ? { contextOwner: entry.manifest.plugin_id, contextSurface: entry.project_plugin_id } : {}),
      icon: (view.icon ?? "package") as PluginIconName, ...(view.order === undefined ? {} : { order: view.order }),
      src: entry.project_runtime?.keys ? `${personal}/side/${encodeURIComponent(entry.project_plugin_id)}/${encodeURIComponent(view.view_id)}`
        : routePrefix ? `${routePrefix}/side/${encodeURIComponent(entry.project_plugin_id)}/${encodeURIComponent(view.view_id)}`
        : `/plugins/${encodeURIComponent(entry.project_plugin_id)}?side=${encodeURIComponent(view.view_id)}`,
      ...(index === 0 && (entry.runtime?.keys ?? entry.project_runtime?.keys) ? { keys: (entry.runtime?.keys ?? entry.project_runtime?.keys)! } : {}),
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
