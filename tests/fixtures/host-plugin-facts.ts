import { builtinMarketDirectory, mergePluginDirectories, shownProjectPlugins } from "@molis-ai/molis-work-app-local-host";

/** The selection a page starts from when the view names none, the same default the shell draws with (`shownPagePlugins`). */
const PAGE_DEFAULT = ["goals", "inbox", "feed", "artifacts"];

type PluginDirectory = Parameters<typeof mergePluginDirectories>[0];

/**
 * What the Host adds to a page's view before it is drawn (W5-02 B1): the plugins the page shows, worked out by the Host's own
 * registry, and the plugin directory ending with the built-ins and the Host's marks on them (personal, 常开, companions). A test
 * that draws a page without a Host passes its view through here, so the page reads the same facts it would read from the Host.
 */
export function withHostPluginFacts<V extends {
  readonly enabled_plugins?: readonly string[]; readonly hidden_plugins?: readonly string[]; readonly plugin_directory?: PluginDirectory;
}>(view: V): V & { shown_plugins: string[]; plugin_directory: PluginDirectory } {
  return { ...view, shown_plugins: shownProjectPlugins(view.enabled_plugins ?? PAGE_DEFAULT, view.hidden_plugins ?? []),
    plugin_directory: mergePluginDirectories(view.plugin_directory ?? [], builtinMarketDirectory()) };
}
