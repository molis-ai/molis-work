import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { goalsApprovalOutcomesBinding } from "./approval-outcomes.js";
import { createGoalsPlugin } from "./plugin.js";
import { GOALS_PAGE_CLIENT_FACTORY_SCRIPT } from "./page-client.js";
import { GOALS_WORKBENCH_STYLESHEET } from "./workbench-styles.js";
import { goalsStageUiContribution } from "./page/workbench-stage.js";
import { GOALS_PROJECT_PLUGIN_ID, goalsManifest, goalsContextUiContribution, goalsDecisionResultsUiContribution, goalsDialogsUiContribution, goalsDocumentUiContribution, goalsFactorsUiContribution, goalsMomentumUiContribution, goalsPolicyUiContribution, goalsProposalUiContribution, goalsRelationUiContribution, goalsStatusUiContribution, goalsTreeUiContribution } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: GOALS_PROJECT_PLUGIN_ID, catalog_order: 6,
  manifest: goalsManifest,
  approval_outcomes: goalsApprovalOutcomesBinding,
  management_actions: [
    { capability_id: "goals.board.initialize", version: /* @version action.goals.board.initialize */ 1, mcp_tool: { name: "molis_work_v1_initialize", opens_new_database: true } },
    { capability_id: "goals.active.set", version: /* @version action.goals.active.set */ 1 },
    { capability_id: "goals.snapshot.read", version: /* @version action.goals.snapshot.read */ 1 },
    { capability_id: "goals.tree.submit", version: /* @version action.goals.tree.submit */ 1, refused_identity_fields: ["submitted_session_id"] },
    { capability_id: "goals.tree.read", version: /* @version action.goals.tree.read */ 1 },
    { capability_id: "goals.tree.check", version: /* @version action.goals.tree.check */ 1, refused_identity_fields: [] },
  ],
  project_runtime: { create: createGoalsPlugin, package_name: "@molis-ai/molis-work-plugin-goals", factory_export: "createGoalsPlugin" },
  workbench: {
    order: 19,
    contributions: [
    goalsStageUiContribution,
    goalsPolicyUiContribution,
    goalsProposalUiContribution,
    goalsDecisionResultsUiContribution,
    goalsRelationUiContribution,
    goalsTreeUiContribution,
    goalsMomentumUiContribution,
    goalsDocumentUiContribution,
    goalsContextUiContribution,
    goalsStatusUiContribution,
    goalsFactorsUiContribution,
    goalsDialogsUiContribution,
  ],
    stylesheet: GOALS_WORKBENCH_STYLESHEET,
    stylesheetPrefixes: ["goal-"],
    pageClient: GOALS_PAGE_CLIENT_FACTORY_SCRIPT,
    recordRow: { selector: "[data-tree-item][data-goal-id]", idDataset: "goalId" },
  },
};
