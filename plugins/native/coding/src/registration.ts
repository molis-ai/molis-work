import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { CODING_PROJECT_PLUGIN_ID, CODING_STYLES, CODING_WORKBENCH_CLIENT_FACTORY_SCRIPT, codingManifest, codingSettingsContribution, codingUiView } from "./index.js";
import { codingBoardSpecimens } from "./board-specimens.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: CODING_PROJECT_PLUGIN_ID, catalog_order: 22,
  manifest: codingManifest,
  workbench: {
    order: 20,
    // The stage as the shell draws it when no instance runs (no session directory); a running instance draws its own (plugin.ts).
    contributions: [codingUiView(() => []), codingSettingsContribution],
    clientFactory: CODING_WORKBENCH_CLIENT_FACTORY_SCRIPT,
    stylesheet: CODING_STYLES,
    clientUses: ["git", "files"],
    specimens: codingBoardSpecimens,
  },
};
