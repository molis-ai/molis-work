import { escapeHtml, icon, type MolisWorkIcon } from "@molis-ai/molis-work-design-system";
import { BUILTIN_PLUGIN_CATALOG } from "./builtin-plugins.js";

/** Home tools stay within reach in the shared chrome; project pages use the existing in-place surface. */
export function renderHomePluginNavigation(href?: (path: string) => string): string {
  const entries = BUILTIN_PLUGIN_CATALOG.filter(entry => entry.runtime?.scope === "home").flatMap(entry => {
    const stage = entry.manifest.ui?.views?.find(view => view.slot === "stage");
    if (!stage) return [];
    const glyph = entry.manifest.ui?.views?.find(view => view.slot === "navigator")?.icon;
    const attrs = `class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" data-home-plugin-open="${escapeHtml(entry.project_plugin_id)}"`;
    // The label stays visible at narrow widths, where other arrival tools become icon-only.
    const content = `${glyph ? icon(glyph as MolisWorkIcon) : ""}${escapeHtml(entry.manifest.name)}`;
    return [href
      ? `<a ${attrs} href="${escapeHtml(href(`/plugins/${encodeURIComponent(entry.project_plugin_id)}`))}">${content}</a>`
      : `<button ${attrs} type="button" data-work-surface-open="${escapeHtml(stage.view_id)}">${content}</button>`];
  }).join("");
  return `<span class="mw-group" style="order:var(--home-tools-order,4);flex:none;padding:0;margin-left:auto">${entries}</span>`;
}
