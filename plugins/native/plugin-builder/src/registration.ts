import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { PLUGIN_COMPONENT_STYLES } from "@molis-ai/molis-work-design-system";
import { BUILDER_CHOICE_INSTRUCTIONS, builderManifest, builderUiContribution, AGENT_STUDIO_STYLES, AGENT_STUDIO_WORKBENCH_CLIENT_FACTORY_SCRIPT } from "./index.js";

/**
 * This plugin's entry in the built-in catalog (W5-02). `node scripts/generate-plugin-registry.mjs` lists it in
 * apps/workbench/src/builtin-plugins.ts; change the entry here, then regenerate.
 */
export const registration: PluginRegistration = {
  project_plugin_id: "plugin-builder", catalog_order: 3,
  manifest: builderManifest,
  instructions: BUILDER_CHOICE_INSTRUCTIONS,
  personal: true,
  summary: "用自然语言设计、构建并使用自己的插件。",
  workbench: {
    order: 1,
    contributions: [builderUiContribution],
    // The studio is drawn in the plugin's stage; generated plugin parts in its canvas use the plugin components.
    stylesheet: AGENT_STUDIO_STYLES + PLUGIN_COMPONENT_STYLES,
    clientFactory: AGENT_STUDIO_WORKBENCH_CLIENT_FACTORY_SCRIPT,
  },
};
