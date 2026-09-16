export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-task",
  packagePath: "plugins/native/task",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["task.ui-contribution.v1", "task.http-routes.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export * from "./ui.js";
export * from "./routes.js";
export { createTaskRouteHandlers } from "./route-handlers.js";
export type { TaskRouteHandlerPorts } from "./route-handlers.js";
export { taskRouteErrorResponse } from "./route-error.js";
