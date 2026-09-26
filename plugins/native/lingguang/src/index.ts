export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-lingguang",
  packagePath: "plugins/native/lingguang",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["lingguang.ui-contribution.v1", "lingguang.http-routes.v1"],
} as const;

export { LINGGUANG_UI_CONTRIBUTION_ID, lingguangUiContribution, lingguangUiDescriptor, renderLingguangWorkbench } from "./ui.js";
export type { LingguangUiModel, LingguangUiPrimitives, LingguangUiSurface } from "./ui.js";
export { LINGGUANG_STYLES } from "./styles.js";
export { LINGGUANG_EN } from "./en.js";
export { LINGGUANG_CLIENT_FACTORY_SCRIPT } from "./client.js";
export { LINGGUANG_NATIVE_PLUGIN_ROUTES, LingguangPluginRouteTable } from "./routes.js";
export type { LingguangPluginRouteHandler, LingguangPluginRouteRequest, LingguangPluginRouteResponse } from "./routes.js";
export { createLingguangRouteHandlers, lingguangRouteErrorResponse } from "./route-handlers.js";
export type { LingguangRoutePorts } from "./route-handlers.js";
export { LINGGUANG_PLUGIN_ID, LINGGUANG_PROJECT_PLUGIN_ID, lingguangManifest } from "./manifest.js";
export { openLingguangStore, LingguangStore } from "./store.js";
export { LingguangError } from "./error.js";

export { lingguangContentActions, createLingguangContentHandlers } from "./content-actions.js";

export { lingguangActions, LINGGUANG_ACTIONS, LINGGUANG_ACTION_PERMISSIONS, createLingguangActionHandlers } from "./actions.js";
export type { LingguangActionPorts } from "./actions.js";
export type { LingguangConversationState } from "./store.js";
