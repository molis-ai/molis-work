export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-form",
  packagePath: "plugins/native/form",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["form.ui-contribution.v1", "form.http-routes.v1"],
} as const;

export { FORM_UI_CONTRIBUTION_ID, formUiContribution, formUiDescriptor, renderFormWorkbench } from "./ui.js";
export type { FormUiModel, FormUiPrimitives, FormUiSurface } from "./ui.js";
export { FORM_STYLES } from "./styles.js";
export { FORM_EN } from "./en.js";
export { FORM_CLIENT_FACTORY_SCRIPT } from "./client.js";
export { FORM_NATIVE_PLUGIN_ROUTES, FormPluginRouteTable } from "./routes.js";
export type { FormPluginRouteHandler, FormPluginRouteRequest, FormPluginRouteResponse } from "./routes.js";
export { createFormRouteHandlers, formRouteErrorResponse } from "./route-handlers.js";
export { FORM_PLUGIN_ID, FORM_PROJECT_PLUGIN_ID, formManifest } from "./manifest.js";
export { FORM_MCP_EXPORTS, runFormMcpTool } from "./mcp.js";
export { openFormStore, FormStore } from "./store.js";
export { FormError } from "./error.js";
