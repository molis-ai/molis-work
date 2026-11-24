import { createHomeShelfPlugin } from "./home-plugin.js";
import type { HostSurfaceRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { SHELF_PROJECT_PLUGIN_ID, shelfManifest, SHELF_CLIENT_FACTORY_SCRIPT, SHELF_SETTINGS_CLIENT_SCRIPT, SHELF_STYLES, shelfSettingsUiContribution, shelfSyncDocument, shelfUiContribution } from "./index.js";
import { shelfBoardSpecimens } from "./board-specimens.js";

/**
 * Shelf as the platform hosts it (44B, decision 66): a platform part the runtime runs once in the Home, listed with the platform's own
 * surfaces (apps/local-host/src/host-surfaces.ts and apps/workbench/src/host-surfaces.ts), never in the plugin catalog. No install a person
 * makes, no switch to turn it off, nothing to add to or remove from a project: the side panel always has it. The sample goes on a new shelf
 * once, in the instance's own `start`: reading the shelf writes nothing.
 */
export const shelfSurface: HostSurfaceRegistration = {
  sync: { copies: shelfSyncDocument },
  project_plugin_id: SHELF_PROJECT_PLUGIN_ID,
  manifest: shelfManifest,
  home_store: { path: "shelf" },
  runtime: { create: createHomeShelfPlugin, package_name: "@molis-ai/molis-work-module-shelf/surface", factory_export: "createHomeShelfPlugin" },
  workbench: {
    order: 8,
    contributions: [shelfUiContribution, shelfSettingsUiContribution],
    stylesheet: SHELF_STYLES,
    frameStyleFeatures: ["settings-document"],
    clientFactory: SHELF_CLIENT_FACTORY_SCRIPT,
    settingsClient: SHELF_SETTINGS_CLIENT_SCRIPT,
    specimens: shelfBoardSpecimens,
  },
};
