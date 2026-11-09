import { pluginTabGlyphs, pluginTabTitles } from "@molis-ai/molis-work-app-workbench";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { shownProjectPlugins } from "../plugin-registry.js";
import { builtinMarketDirectory } from "../plugin-directory.js";
import type { LocalWebCatalogRunner } from "../web-project-settings.js";

/** The project's first page. It is a fixed entry of the workbench rail, not a plugin, so no project lists it. */
const PROJECT_HOME_PAGE = "home";

/**
 * The page ids an attention rule may name (PG-036): the ids the workbench rail can be on. The client reports the page the
 * person is on only from the rail's own `data-plugin-id` (`attention.ts` reads `.plugin-rail-items [aria-current]`), so an
 * id the rail has no entry for (a personal plugin without a rail or island entry, today `shelf` and `characters`) can never
 * match, and a rule that named it would never apply. Those ids are left out using the same declared rail and island placements
 * as the sidebar; checking a rule does not need to read any words.
 * A page counts when some project of the Home shows its plugin (enabled there, or a personal one the person did not hide
 * from it), so a plugin that was taken out of every project drops out of the list. The Host reads this from the project
 * catalog each time a rule is written.
 */
export function installedPagesPort(withCatalog: LocalWebCatalogRunner, homeDirectory: string): () => Promise<readonly string[]> {
  return () => withCatalog({ homeDirectory }, catalog => {
    const railPages = pluginTabGlyphs();
    const pages = new Set<string>([PROJECT_HOME_PAGE]);
    for (const project of catalog.listProjects()) {
      const { plugins, hidden } = catalog.projectPluginMembership(project.project_id);
      for (const id of shownProjectPlugins(plugins, hidden)) {
        if (Object.hasOwn(railPages, id)) pages.add(id);
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
