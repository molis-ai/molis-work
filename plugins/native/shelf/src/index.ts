export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-shelf",
  packagePath: "plugins/native/shelf",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["shelf.ui-contribution.v1", "shelf.http-routes.v1", "shelf.actions.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export { SHELF_UI_CONTRIBUTION_ID, shelfUiContribution, shelfUiDescriptor, renderShelfWorkbench } from "./ui.js";
export type { ShelfListModel, ShelfUiModel, ShelfUiPrimitives, ShelfUiSurface } from "./ui.js";
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
export type { ShelfPluginRouteHandler, ShelfPluginRouteRequest, ShelfPluginRouteResponse } from "./routes.js";
export { createShelfRouteHandlers } from "./route-handlers.js";
export type { ShelfRouteHandlerPorts } from "./route-handlers.js";
export {
  SHELF_ACTIONS, SHELF_ACTION_PERMISSIONS, SHELF_PROJECT_ACTIONS, SHELF_PROJECT_ACTION_PERMISSIONS,
  createShelfActionHandlers, createShelfProjectActionHandlers, shelfActions, shelfProjectActions,
  type ShelfActionPorts, type ShelfAdmitActionInput, type ShelfMaterialPreview, type ShelfProjectActionPorts, type ShelfTextView,
} from "./actions.js";
export { SHELF_PLUGIN_ID, SHELF_PROJECT_PLUGIN_ID, shelfManifest } from "./manifest.js";

export { SHELF_RUNTIME_ACTIONS, shelfRuntimeActions } from "./runtime-actions.js";
export { createShelfPlugin } from "./plugin.js";
export { SHELF_OWNER_FILES } from "./owner-files.js";
export { createHomeShelfPlugin, shelfStorePorts } from "./home-plugin.js";
export { shelfAiPorts } from "./ai.js";
export { initializeShelfFiles } from "@molis-ai/molis-work-module-shelf";

export { SHELF_INSTRUCTIONS, shelfInstruction } from "./prompts.js";
