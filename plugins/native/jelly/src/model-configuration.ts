import type { PluginModelConfigurationDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/** Where Jelly keeps its model choice and the two actions that read and save it; carried by Jelly's Manifest (`model_configuration`). */
export const JELLY_MODEL_CONFIGURATION: PluginModelConfigurationDeclaration = {
  preference: { store_name: "jelly", file_name: "preferences.json" },
  custom_provider: { provider_id: "jelly-text", display_name: "Jelly 模型" },
  actions: { read: { capability_id: "jelly.model.settings", version: 1 }, save: { capability_id: "jelly.model.configure", version: 1 } },
};
