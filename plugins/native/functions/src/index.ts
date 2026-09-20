export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-functions",
  packagePath: "plugins/native/functions",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["functions.ui-contribution.v1", "functions.http-routes.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export { FUNCTIONS_UI_CONTRIBUTION_ID, functionsUiContribution, functionsUiDescriptor, renderFunctionsDirectory, renderFunctionsWorkbench } from "./ui.js";
export type { FunctionsUiModel, FunctionsUiPrimitives, FunctionsUiSurface } from "./ui.js";
export {
  FUNCTIONS_SETTINGS_UI_CONTRIBUTION_ID,
  functionsSettingsUiContribution,
  functionsSettingsUiDescriptor,
  renderFunctionsSettings,
} from "./settings-ui.js";
export type { FunctionsSettingsUiModel } from "./settings-ui.js";
export { FUNCTIONS_STYLES } from "./styles.js";
export { FUNCTIONS_EN } from "./en.js";
export { FUNCTIONS_CLIENT_FACTORY_SCRIPT } from "./client.js";
export { FUNCTIONS_SETTINGS_CLIENT_SCRIPT } from "./settings-client.js";
export { FUNCTIONS_NATIVE_PLUGIN_ROUTES, FunctionsPluginRouteTable } from "./routes.js";
export type { FunctionsPluginRouteHandler, FunctionsPluginRouteRequest, FunctionsPluginRouteResponse } from "./routes.js";
export { createFunctionsRouteHandlers } from "./route-handlers.js";
export { functionsRouteErrorResponse } from "./route-error.js";
export { FUNCTIONS_PLUGIN_ID, FUNCTIONS_PROJECT_PLUGIN_ID, functionsManifest } from "./manifest.js";
export { openFunctionsStore, FunctionsStore } from "./store.js";
export { createFunctionsService, FunctionsService } from "./service.js";
export type { FunctionsSecretPort } from "./service.js";
export { createHttpTypeSafeProvider, readAnswer, readChoiceAnswer, TYPESAFE_SYSTEMONE_URL } from "./provider.js";
export type { TypeSafeProvider, TypeSafeEvaluateResult } from "./provider.js";
export { hashChoiceConfig, hashFunctionConfig } from "./hash.js";
export { FunctionsError, suggestFunctionKey } from "./keys.js";
