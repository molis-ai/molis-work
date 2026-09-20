export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-dataset",
  packagePath: "plugins/native/dataset",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["dataset.ui-contribution.v1", "dataset.http-routes.v1"],
} as const;

export { DATASET_UI_CONTRIBUTION_ID, datasetUiContribution, datasetUiDescriptor, renderDatasetWorkbench } from "./ui.js";
export type { DatasetUiModel, DatasetUiPrimitives, DatasetUiSurface } from "./ui.js";
export { DATASET_STYLES } from "./styles.js";
export { DATASET_EN } from "./en.js";
export { DATASET_CLIENT_FACTORY_SCRIPT } from "./client.js";
export { DATASET_NATIVE_PLUGIN_ROUTES, DatasetPluginRouteTable } from "./routes.js";
export type { DatasetPluginRouteHandler, DatasetPluginRouteRequest, DatasetPluginRouteResponse } from "./routes.js";
export { createDatasetRouteHandlers, datasetRouteErrorResponse } from "./route-handlers.js";
export { DATASET_PLUGIN_ID, DATASET_PROJECT_PLUGIN_ID, datasetManifest } from "./manifest.js";
export { DATASET_MCP_EXPORTS, runDatasetMcpTool } from "./mcp.js";
export { openDatasetStore, DatasetStore, parseCsv, toCsv } from "./store.js";
export { DatasetError } from "./error.js";
