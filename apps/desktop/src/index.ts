/** Molis Work Desktop product shell and native bridge public entrypoint. */
export * from "./capsule-shell.js";
export * from "./shell.js";

export { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "./project-catalog.js";
export { createDesktopWebHost } from "./web-host.js";
export { createDesktopUninstallService } from "./uninstall.js";
export { MolisWorkServer } from "./mcp-host.js";
