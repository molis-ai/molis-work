import type { PluginManifest, PluginModelConfigurationDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { defineSettingsActions } from "@molis-ai/molis-work-plugin-sdk";

const actions = defineSettingsActions({ scope: "home",
  read: { capability_id: "probe.preferences.read", version: 1, title: "读取", description: "读取模型偏好", permissions: ["storage:private"] },
  write: { capability_id: "probe.preferences.write", version: 1, title: "保存", description: "保存模型偏好", permissions: ["storage:private"] },
});
export function modelPreferenceDeclaration(model: PluginModelConfigurationDeclaration, existing: PluginManifest["actions"] = []): Pick<PluginManifest, "actions" | "settings_entries"> {
  const key = "probe.model";
  return { actions: [...existing, actions.read, actions.write], settings_entries: { model_configuration: { key, ...model },
    entries: [{ key, title: { key: "common.save" }, layers: ["personal"], schema: { type: "object", additionalProperties: false,
      required: ["provider_id", "model_id"], properties: { provider_id: { type: "string" }, model_id: { type: "string" } } } }],
    read: { capability_id: actions.read.capability_id, version: 1 }, write: { capability_id: actions.write.capability_id, version: 1 } } };
}
