import { shownProjectPlugins } from "@molis-ai/molis-work-app-workbench";
import type { LocalWebCatalogRunner } from "../web-project-settings.js";

/** The project's first page. It is a fixed entry of the workbench rail, not a plugin, so no project lists it. */
export const PROJECT_HOME_PAGE = "home";

/**
 * The page ids an attention rule may name (PG-036): the ids the workbench rail marks as shown, which are what the client
 * reports as the page the person is on. A page counts when some project of the Home shows its plugin (enabled there, or a
 * personal one the person did not hide from it), so a plugin that was taken out of every project drops out of the list.
 * The Host reads this from the project catalog each time a rule is written; it keeps no list of plugin names of its own.
 */
export function installedPagesPort(withCatalog: LocalWebCatalogRunner, homeDirectory: string): () => Promise<readonly string[]> {
  return () => withCatalog({ homeDirectory }, catalog => {
    const pages = new Set<string>([PROJECT_HOME_PAGE]);
    for (const project of catalog.listProjects()) {
      for (const id of shownProjectPlugins(catalog.listProjectPlugins(project.project_id), catalog.listHiddenPlugins(project.project_id))) pages.add(id);
    }
    return [...pages];
  });
}
