import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { TEXT_STATS_PROJECT_PLUGIN_ID, textStatsManifest, textStatsUiContribution } from "./index.js";
import { TEXT_STATS_MESSAGES } from "./messages.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: TEXT_STATS_PROJECT_PLUGIN_ID, catalog_order: 26,
  messages: TEXT_STATS_MESSAGES,
  manifest: textStatsManifest,
  developer: true,
  workbench: { order: 24, contributions: [textStatsUiContribution], clientFrom: "coding" },
  summary: "统计文件快照的字数、字节与行数。",
};
