import { createLocalUninstallService, type MolisWorkUninstallServiceOptions } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "./project-catalog.js";

export function createDesktopUninstallService(options: Omit<MolisWorkUninstallServiceOptions, "projects"> = {}) {
  return createLocalUninstallService(options, withMolisWorkProjectCatalog);
}
