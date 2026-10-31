/**
 * The plugins a page without a project's selection shows: the fixture server's one database, the spec board, a fixture. The
 * shell's page default, defined here only; the Host draws such a page with these and the personal plugins (its registry's fact).
 */
export const PAGE_PLUGINS_WITHOUT_SELECTION: readonly string[] = ["goals", "inbox", "feed"];

/**
 * The plugins a page shows. The Host works that out (`shown_plugins`, W5-02 B1) and the shell only reads it; a page drawn with no Host
 * (the spec board, a fixture) shows its enabled plugins, or the default above when there is no selection.
 */
export function shownPagePlugins(view: { readonly enabled_plugins?: readonly string[]; readonly shown_plugins?: readonly string[] }): string[] {
  return [...(view.shown_plugins ?? view.enabled_plugins ?? PAGE_PLUGINS_WITHOUT_SELECTION)];
}
