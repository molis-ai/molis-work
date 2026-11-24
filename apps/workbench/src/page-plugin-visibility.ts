import { BUILTIN_PLUGIN_CATALOG } from "./builtin-plugins.js";

/**
 * Default plugins when a page has no project selection: derived from the built-in catalog's `default_enabled` entries rather
 * than a hardcoded plugin list (H9, PEQ-12).
 */
export function defaultPagePlugins(): string[] {
  return BUILTIN_PLUGIN_CATALOG
    .filter(entry => entry.default_enabled === true)
    .map(entry => entry.project_plugin_id);
}

/**
 * The plugins a page shows. The Host works that out (`shown_plugins`, W5-02 B1) and the shell only reads it; a page drawn with no Host
 * (the spec board, a fixture) shows its enabled plugins, or the catalog defaults above when there is no selection.
 */
export function shownPagePlugins(view: { readonly enabled_plugins?: readonly string[]; readonly shown_plugins?: readonly string[] }): string[] {
  return [...(view.shown_plugins ?? view.enabled_plugins ?? defaultPagePlugins())];
}
