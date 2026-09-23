export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-alchemist",
  packagePath: "plugins/native/alchemist",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["alchemist.ui-contribution.v1", "alchemist.http-routes.v1"],
} as const;

export { ALCHEMIST_UI_CONTRIBUTION_ID, alchemistUiContribution, alchemistUiDescriptor, renderAlchemistWorkbench } from "./ui.js";
export type { AlchemistUiModel, AlchemistUiPrimitives, AlchemistUiSurface } from "./ui.js";
export { ALCHEMIST_STYLES } from "./styles.js";
export { ALCHEMIST_EN } from "./en.js";
export { ALCHEMIST_CLIENT_FACTORY_SCRIPT } from "./client.js";
export { ALCHEMIST_NATIVE_PLUGIN_ROUTES, AlchemistPluginRouteTable } from "./routes.js";
export type { AlchemistPluginRouteHandler, AlchemistPluginRouteRequest, AlchemistPluginRouteResponse } from "./routes.js";
export { createAlchemistRouteHandlers, alchemistRouteErrorResponse } from "./route-handlers.js";
export { ALCHEMIST_PLUGIN_ID, ALCHEMIST_PROJECT_PLUGIN_ID, alchemistManifest } from "./manifest.js";
export { openAlchemistStore, AlchemistStore, demoIdeaCards } from "./store.js";
export { AlchemistError } from "./error.js";
export { createLocalRuntime as createAlchemistStudioRuntime } from "./studio/server/bootstrap/local-runtime.js";
export type { LocalRuntime as AlchemistStudioRuntime } from "./studio/server/bootstrap/local-runtime.js";
export type { AlchemistAiPort } from "./studio/server/runtime/host-port.js";
