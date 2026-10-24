export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-workflows",
  packagePath: "plugins/native/workflows",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["workflows.ui-contribution.v1", "workflows.http-routes.v1", "workflows.actions.v1"],
} as const;

export * from "./model.js";
export { WORKFLOWS_UI_CONTRIBUTION_ID, workflowsUiContribution, workflowsUiDescriptor, renderWorkflowsWorkbench } from "./ui.js";
export type { WorkflowsUiModel, WorkflowsUiPrimitives, WorkflowsUiSurface } from "./ui.js";
export { WORKFLOWS_STYLES } from "./styles.js";
export { WORKFLOWS_EN } from "./en.js";
export { WORKFLOWS_MESSAGES } from "./messages.js";
export { WORKFLOWS_INSTRUCTIONS } from "./prompts.js";
export { WORKFLOWS_CLIENT_FACTORY_SCRIPT } from "./client.js";
export { createWorkflowsPlugin } from "./plugin.js";
export { workflowsErrors } from "./error.js";
export type { WorkflowStartItem } from "@molis-ai/molis-work-contracts/platform/actions";
export { WORKFLOWS_ACTIONS, WORKFLOWS_ACTION_PERMISSIONS, createWorkflowsActionHandlers, workflowsActions,
  type WorkflowContentPorts, type WorkflowStationInfo, type WorkflowsActionPorts } from "./actions.js";
export { workflowsManifest } from "./manifest.js";
export { openWorkflowsStore, ownWorkflowsStores, WorkflowsStore, WORKFLOWS_DATABASE, WORKFLOWS_HOME_STORE } from "./store.js";
export type { WorkflowsSql, WorkflowsSqlValue, WorkflowsStores } from "./store.js";
export { purgeWorkflowsProject, workflowsProjectData } from "./project-data.js";
export type { WorkflowSummary } from "./store.js";

export { createWorkflowContentPorts } from "./content-client.js";
