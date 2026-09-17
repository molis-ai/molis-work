export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-shelf",
  packagePath: "plugins/native/shelf",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["shelf.ui-contribution.v1", "shelf.http-routes.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export { SHELF_UI_CONTRIBUTION_ID, shelfUiContribution, shelfUiDescriptor, renderShelfDirectory, renderShelfWorkbench } from "./ui.js";
export type { ShelfUiModel, ShelfUiPrimitives, ShelfUiSurface } from "./ui.js";
export {
  SHELF_SETTINGS_UI_CONTRIBUTION_ID,
  shelfSettingsUiContribution,
  shelfSettingsUiDescriptor,
  renderShelfSettings,
} from "./settings-ui.js";
export type { ShelfSettingsUiModel } from "./settings-ui.js";
export { SHELF_STYLES } from "./styles.js";
export { SHELF_EN } from "./en.js";
export { SHELF_CLIENT_FACTORY_SCRIPT } from "./client.js";
export { SHELF_SETTINGS_CLIENT_SCRIPT } from "./settings-client.js";
export { SHELF_NATIVE_PLUGIN_ROUTES, ShelfPluginRouteTable } from "./routes.js";
export type { ShelfPluginRouteHandler, ShelfPluginRouteRequest, ShelfPluginRouteResponse } from "./routes.js";
export { createShelfRouteHandlers } from "./route-handlers.js";
export type { ShelfRouteHandlerPorts } from "./route-handlers.js";
export { shelfRouteErrorResponse } from "./route-error.js";
