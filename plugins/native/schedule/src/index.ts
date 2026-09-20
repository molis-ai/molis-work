export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-schedule",
  packagePath: "plugins/native/schedule",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["schedule.ui-contribution.v1", "schedule.http-routes.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export * from "./ui.js";
export * from "./routes.js";
export { createScheduleRouteHandlers, scheduleRouteErrorResponse } from "./route-handlers.js";
export type { ScheduleRouteHandlerPorts } from "./route-handlers.js";
export { SCHEDULE_CLIENT_FACTORY_SCRIPT } from "./client.js";
export { SCHEDULE_EN } from "./en.js";
export { SCHEDULE_PLUGIN_ID, SCHEDULE_PROJECT_PLUGIN_ID, scheduleManifest } from "./manifest.js";
