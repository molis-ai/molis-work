import { join } from "node:path";

/** Where one project's Alchemist studio lives in the Home: its database, its search database and the evidence it read. */
export function alchemistProjectDirectory(homeDirectory: string, projectId: string): string {
  return join(homeDirectory, "alchemist", "projects", encodeURIComponent(projectId).replaceAll(".", "%2E"));
}
