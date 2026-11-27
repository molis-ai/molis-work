import { pluginTabTitles } from "@molis-ai/molis-work-app-workbench";
import { ARTIFACTS_PROJECT_PLUGIN_ID } from "@molis-ai/molis-work-module-artifacts";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "../plugin-registry.js";
import { builtinMarketDirectory } from "../plugin-directory.js";
import type { LocalWebCatalogRunner } from "../web-project-settings.js";

/** The project's first page. It is a fixed entry of the workbench rail, not a plugin, so no project lists it. */
const PROJECT_HOME_PAGE = "home";
const RAIL_PAGES = new Set<string>([ARTIFACTS_PROJECT_PLUGIN_ID, ...PLATFORM_PLUGIN_REGISTRATIONS
  .filter(({ manifest }) => manifest.ui.views?.some(view => view.slot === "navigator" || view.slot === "island"))
  .map(({ project_plugin_id }) => project_plugin_id)]);

/**
 * Attention rules use the page ids reported by the workbench rail (PG-036). A page is available when the plugin
 * declares a rail or island entry and is a member of at least one partition in the current catalog. The project home is always included.
 */
export function installedPagesPort(withCatalog: LocalWebCatalogRunner, homeDirectory: string): () => Promise<readonly string[]> {
  return () => withCatalog({ homeDirectory }, catalog => {
    const pages = new Set<string>([PROJECT_HOME_PAGE]);
    for (const project of catalog.listPartitions()) {
      for (const id of catalog.projectPluginMembership(project.project_id).plugins) {
        if (RAIL_PAGES.has(id)) pages.add(id);
      }
    }
    return [...pages];
  });
}

/**
 * The pages a person can pick when writing a rule: each page id from `installedPagesPort` with the name the workbench rail
 * shows for it, so the settings page lists what is installed instead of keeping its own list. Every id there has a rail
 * entry, so the id is only the fallback for a name the rail does not give.
 */
export function pageChoices(pages: readonly string[]): Array<{ page_id: string; label: string }> {
  const titles = pluginTabTitles(builtinMarketDirectory());
  return pages.map(page => ({ page_id: page, label: page === PROJECT_HOME_PAGE ? t.text("workbench.project-home.project-home") : titles[page] ?? page }));
}
