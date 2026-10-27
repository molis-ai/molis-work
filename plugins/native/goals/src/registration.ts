import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { createHomeGoalsPlugin } from "./home-plugin.js";
import { createGoalsPlugin } from "./plugin.js";
import { GOALS_PROJECT_PLUGIN_ID, goalsManifest, goalsContextUiContribution, goalsDecisionResultsUiContribution, goalsDialogsUiContribution, goalsDocumentUiContribution, goalsFactorsUiContribution, goalsMomentumUiContribution, goalsPlanningUiContribution, goalsPolicyUiContribution, goalsProposalUiContribution, goalsRelationUiContribution, goalsSettingsUiContribution, goalsStatusUiContribution, goalsTreeUiContribution } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: GOALS_PROJECT_PLUGIN_ID, catalog_order: 6,
  manifest: goalsManifest,
  project_runtime: { create: createGoalsPlugin, package_name: "@molis-ai/molis-work-plugin-goals", factory_export: "createGoalsPlugin" },
  // Each instance supplies its share of the same Manifest, with its own installation grants and service handles.
  runtime: { create: createHomeGoalsPlugin, dual_instance: true,
    package_name: "@molis-ai/molis-work-plugin-goals", factory_export: "createHomeGoalsPlugin" },
  workbench: {
    order: 19,
    contributions: [
    goalsPolicyUiContribution,
    goalsProposalUiContribution,
    goalsDecisionResultsUiContribution,
    goalsRelationUiContribution,
    goalsTreeUiContribution,
    goalsMomentumUiContribution,
    goalsDocumentUiContribution,
    goalsContextUiContribution,
    goalsPlanningUiContribution,
    goalsStatusUiContribution,
    goalsFactorsUiContribution,
    goalsDialogsUiContribution,
    goalsSettingsUiContribution,
  ],
    recordRow: { selector: "[data-tree-item][data-goal-id]", idDataset: "goalId" },
  },
};
