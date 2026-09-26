export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-ppt",
  packagePath: "plugins/native/ppt",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["ppt.ui-contribution.v1", "ppt.http-routes.v1"],
} as const;

export { PPT_UI_CONTRIBUTION_ID, pptUiContribution, pptUiDescriptor, renderPptWorkbench } from "./ui.js";
export type { PptUiModel, PptUiPrimitives, PptUiSurface } from "./ui.js";
export { PPT_STYLES } from "./styles.js";
export { PPT_EN } from "./en.js";
export { PPT_CLIENT_FACTORY_SCRIPT } from "./client.js";
export { PPT_NATIVE_PLUGIN_ROUTES, PptPluginRouteTable } from "./routes.js";
export type { PptPluginRouteHandler, PptPluginRouteRequest, PptPluginRouteResponse } from "./routes.js";
export { createPptRouteHandlers, pptRouteErrorResponse } from "./route-handlers.js";
export type { PptRoutePorts } from "./route-handlers.js";
export { promotePpt } from "./promote.js";
export type { PptPublishArtifactPort, PptReadArtifactPort, PptPublicationSnapshot } from "./promote.js";
export { PPT_PLUGIN_ID, PPT_PROJECT_PLUGIN_ID, pptManifest } from "./manifest.js";
export { PPT_MCP_EXPORTS, runPptMcpTool } from "./mcp.js";
export { openPptStore, PptStore } from "./store.js";
export { PptError } from "./error.js";

export { pptActions, PPT_ACTION_PERMISSIONS, createPptActionHandlers } from "./actions.js";
export type { PptActionPorts } from "./actions.js";
