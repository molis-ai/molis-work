import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { issuesManifest, issuesMethods, issuesUiContribution, createIssuesPlugin, ISSUES_DATABASE, ISSUES_CLIENT_FACTORY_SCRIPT, ISSUES_INSTRUCTIONS, ISSUES_MESSAGES } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: "issues", catalog_order: 1, manifest: issuesManifest, messages: ISSUES_MESSAGES, methods: issuesMethods, instructions: ISSUES_INSTRUCTIONS, personal: true, summary: "记录、查看和整理自己的问题。",
  runtime: { scope: "home", create: createIssuesPlugin, database: ISSUES_DATABASE, package_name: "@molis-ai/molis-work-plugin-issues", factory_export: "createIssuesPlugin", keys: "Mod+Shift+I" },
  workbench: { order: 5, contributions: [issuesUiContribution], clientFactory: ISSUES_CLIENT_FACTORY_SCRIPT,
    searchRow: { selector: "[data-issue-id]", idDataset: "issueId" } },
};
