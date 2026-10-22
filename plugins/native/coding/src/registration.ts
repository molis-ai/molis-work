import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { CODING_PROJECT_PLUGIN_ID, CODING_INSTRUCTIONS, CODING_WORKBENCH_CLIENT_FACTORY_SCRIPT, codingManifest, codingPrompts, codingMethods, codingSettingsContribution } from "./index.js";
import { CODING_MESSAGES } from "./messages.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
import { CODING_CONTENT_REPLICA_ID, codingContentReplicationDefinition, refreshCodingSavedHistory } from "./index.js";
import { createSyncJsonContent } from "@molis-ai/molis-work-plugin-sdk";
export const registration: PluginRegistration = {
  sync: {sessions:{scope:'project-sections',kind:CODING_CONTENT_REPLICA_ID,namespace:'coding',owners:[{
    create:services=>codingContentReplicationDefinition(services.validateSavedHistory),
    prepareUpload:(db,context)=>refreshCodingSavedHistory(db,context.projectId,context.readSavedHistory,context.authorize,context.validateSavedHistory),
  }],content:context=>createSyncJsonContent(context)}},
  project_plugin_id: CODING_PROJECT_PLUGIN_ID, catalog_order: 22,
  messages: CODING_MESSAGES,
  manifest: codingManifest,
  instructions: CODING_INSTRUCTIONS,
  summary: "和 Agent 一起写代码，留每轮记录。",
  agent: { prompts: codingPrompts, skills: codingMethods },
  workbench: {
    order: 20,
    contributions: [codingSettingsContribution],
    clientFactory: CODING_WORKBENCH_CLIENT_FACTORY_SCRIPT,
    clientUses: ["git", "files"],
  },
};
