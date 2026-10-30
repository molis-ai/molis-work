import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { TODO_PROJECT_PLUGIN_ID, todoManifest, TODO_CLIENT_FACTORY_SCRIPT, TODO_STYLES, todoUiContribution, createTodoPlugin } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: TODO_PROJECT_PLUGIN_ID, catalog_order: 13,
  manifest: todoManifest,
  runtime: { create: createTodoPlugin, package_name: "@molis-ai/molis-work-plugin-todo", factory_export: "createTodoPlugin" },
  personal: true,
  workbench: {
    order: 14,
    contributions: [todoUiContribution],
    stylesheet: TODO_STYLES,
    clientFactory: TODO_CLIENT_FACTORY_SCRIPT,
    searchRow: { selector: "[data-todo-id]", idDataset: "todoId" },
  },
};
