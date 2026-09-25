export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-workflows",
  packagePath: "plugins/native/workflows",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["workflows.ui-contribution.v1", "workflows.http-routes.v1"],
} as const;

export * from "./model.js";
export { WORKFLOWS_UI_CONTRIBUTION_ID, workflowsUiContribution, workflowsUiDescriptor, renderWorkflowsWorkbench } from "./ui.js";
export type { WorkflowsUiModel, WorkflowsUiPrimitives, WorkflowsUiSurface } from "./ui.js";
export { WORKFLOWS_STYLES } from "./styles.js";
export { WORKFLOWS_EN } from "./en.js";
export { WORKFLOWS_CLIENT_FACTORY_SCRIPT } from "./client.js";
export { WORKFLOWS_NATIVE_PLUGIN_ROUTES, WorkflowsPluginRouteTable } from "./routes.js";
export type { WorkflowsPluginRouteHandler, WorkflowsPluginRouteRequest, WorkflowsPluginRouteResponse } from "./routes.js";
export { createWorkflowsRouteHandlers, workflowsRouteErrorResponse } from "./route-handlers.js";
export type { WorkflowsRoutePorts, WorkflowStationInfo, WorkflowStartItem } from "./route-handlers.js";
export { workflowsManifest } from "./manifest.js";
export { openWorkflowsStore, WorkflowsStore } from "./store.js";
export type { WorkflowSummary } from "./store.js";

export { createWorkflowContentPorts } from "./content-client.js";
