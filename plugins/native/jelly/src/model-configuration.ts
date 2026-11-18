import { defineSettingsActions } from "@molis-ai/molis-work-plugin-sdk";
import type { SettingsDeclaration } from "@molis-ai/molis-work-contracts/platform/settings";
import type { PluginModelConfigurationDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/** Where Jelly keeps its model choice and the two actions that read and save it; carried by Jelly's Manifest (`model_configuration`). */
export const JELLY_MODEL_CONFIGURATION = {
  key: "jelly.model_selection",
  preference: { store_name: "jelly", file_name: "preferences.json" },
  custom_provider: { provider_id: "jelly-text", display_name: "Jelly 模型" },
  actions: { read: { capability_id: "jelly.model.settings", version: /* @version action.jelly.model.settings */ 1 }, save: { capability_id: "jelly.model.configure", version: /* @version action.jelly.model.configure */ 1 } },
} satisfies PluginModelConfigurationDeclaration & { key: string };

export const jellyPreferenceActions = defineSettingsActions({ scope: "home",
  read: { capability_id: "jelly.preferences.read", version: /* @version action.jelly.preferences.read */ 1,
    title: "查看 Jelly 拆解模型", description: "查看 Jelly 拆解任务时使用的模型，以及是否沿用默认设置", permissions: ["jelly:settings"] },
  write: { capability_id: "jelly.preferences.write", version: /* @version action.jelly.preferences.write */ 1,
    title: "选择 Jelly 拆解模型", description: "选择已启用的模型或恢复继承", permissions: ["jelly:settings"] },
});
export const jellySettings: SettingsDeclaration = {
  model_configuration: JELLY_MODEL_CONFIGURATION,
  entries: [{ key: JELLY_MODEL_CONFIGURATION.key, title: { key: "jelly.model.title" }, summary: { key: "jelly.model.privacy" },
    layers: ["personal"], consequence: ["cost", "external"], schema: { type: "object", required: ["provider_id", "model_id"], additionalProperties: false,
      properties: { provider_id: { type: "string", minLength: 1 }, model_id: { type: "string", minLength: 1, maxLength: 512 } } } }],
  read: { capability_id: jellyPreferenceActions.read.capability_id, version: jellyPreferenceActions.read.version },
  write: { capability_id: jellyPreferenceActions.write.capability_id, version: jellyPreferenceActions.write.version },
};
