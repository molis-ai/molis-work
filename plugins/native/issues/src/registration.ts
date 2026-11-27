import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { issuesManifest, issuesUiContribution, createIssuesPlugin, ISSUES_CLIENT_FACTORY_SCRIPT } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  preservedMembershipBatch: 108,
  project_plugin_id: "issues", catalog_order: 1, manifest: issuesManifest,
  // ⌘⇧I opens the personal space's Issue from any partition, offering to enable it there first (R14, batch 108).
  project_runtime: { create: createIssuesPlugin, package_name: "@molis-ai/molis-work-plugin-issues", factory_export: "createIssuesPlugin", keys: "Mod+Shift+I" },
  workbench: { order: 5, contributions: [issuesUiContribution], clientFactory: ISSUES_CLIENT_FACTORY_SCRIPT,
    searchRow: { selector: "[data-issue-id]", idDataset: "issueId" } },
};
