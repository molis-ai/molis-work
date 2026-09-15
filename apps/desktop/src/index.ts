/** Molis Work Desktop product shell and native bridge public entrypoint. */
export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-app-desktop",
  packagePath: "apps/desktop",
  kind: "app",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/app-host",
  migrationGoals: ["goal-reorg-f2","goal-reorg-ap4","goal-reorg-dv4"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["desktop.shell.v1", "desktop.runtime-launch.v1", "desktop.advance-prompt.v1", "desktop.panels.v1", "desktop.capsule-shell.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export * from "./advance-prompt.js";
export * from "./capsule-shell.js";
export * from "./launch.js";
export * from "./panels.js";
export * from "./shell.js";

export { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "./project-catalog.js";
export { createDesktopWebHost } from "./web-host.js";
export { createDesktopUninstallService } from "./uninstall.js";
export { MolisWorkServer } from "./mcp-host.js";
