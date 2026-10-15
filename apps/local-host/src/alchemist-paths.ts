import { join } from "node:path";
import type { HomeStoreDeclaration } from "@molis-ai/molis-work-storage";

/**
 * The Alchemist studios in the Home's store registry (W4-11): one directory per project, with the studio's database (its
 * structure is the plugin's), the search database and the evidence it read (the Host's).
 */
export const ALCHEMIST_HOME_STORE: HomeStoreDeclaration = { path: "alchemist" };

/** Where one project's Alchemist studio lives in the Home: its database, its search database and the evidence it read. */
export function alchemistProjectDirectory(homeDirectory: string, projectId: string): string {
  return join(homeDirectory, ALCHEMIST_HOME_STORE.path, "projects", encodeURIComponent(projectId).replaceAll(".", "%2E"));
}
