import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { createSchedulePlugin, SCHEDULE_PROJECT_PLUGIN_ID, scheduleManifest, SCHEDULE_CLIENT_FACTORY_SCRIPT, SCHEDULE_STYLES, scheduleUiContribution } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: SCHEDULE_PROJECT_PLUGIN_ID, catalog_order: 9,
  default_enabled: true,
  manifest: scheduleManifest,
  project_runtime: { create: createSchedulePlugin, package_name: "@molis-ai/molis-work-plugin-schedule", factory_export: "createSchedulePlugin" },
  workbench: {
    order: 7,
    contributions: [scheduleUiContribution],
    stylesheet: SCHEDULE_STYLES,
    clientFactory: SCHEDULE_CLIENT_FACTORY_SCRIPT,
    searchRow: { selector: "[data-schedule-row][data-schedule-task-id]", idDataset: "scheduleTaskId" },
  },
};
