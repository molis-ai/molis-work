import { bindActionHandler, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginModelConfigurationInput, PluginModelConfigurationView } from "@molis-ai/molis-work-contracts/platform/plugin";
import { defineJellyAction as define } from "./command-actions.js";
import * as s from "./action-schema.js";

export type JellyModelSettings = PluginModelConfigurationView;
export type JellyModelInput = PluginModelConfigurationInput;
const selection = s.object({ provider_id: s.id, model_id: s.id });
const apiFormat = { enum: ["anthropic-messages", "openai-chat-completions"] } as const;
const settings = s.object({ configured: s.boolean, providers: s.array(s.object({ id: s.id, provider_id: s.id, name: s.text, base_url: s.text, api_format: apiFormat, enabled: s.boolean, has_credential: s.boolean,
  models: s.array(s.object({ model_id: s.id, display_name: s.text, context_tokens: s.revision, vision: s.boolean, enabled: s.boolean }, ["model_id", "enabled"])),
})), selection, effective_selection: selection, source: { enum: ["selection", "provider", "environment", "none"] }, connections: s.array(s.object({ connection_id: s.id, display_name: s.text, state: s.text })), custom_connection_id: s.text }, ["configured", "providers", "source", "connections"]);
export const jellyServiceActions = {
  modelSettings: define<JellyModelSettings>()("model.settings", /* @version action.jelly.model.settings */ 1, "读取 Jelly 模型设置", "读取原供应商目录、连接状态和 Jelly 模型选择，不读取密钥", "query", s.object({}), settings, ["jelly:settings"]),
  saveModelSettings: define<JellyModelSettings>()("model.configure", /* @version action.jelly.model.configure */ 1, "设置 Jelly 文字模型", "选择已有模型连接或修改 Jelly 专用模型配置，沿用统一连接和凭据存储", "command", s.object({ provider_id: s.text, model_id: s.text, base_url: s.text, api_format: apiFormat, connection_id: s.text }, []), settings, ["jelly:settings"]),
};
export interface JellyServicePorts {
  modelSettings(): Promise<JellyModelSettings>;
  saveModelSettings(input: JellyModelInput): Promise<JellyModelSettings>;
}
export function createJellyServiceHandlers(ports: JellyServicePorts): ActionHandlerBinding[] {
  return [
    bindActionHandler(jellyServiceActions.modelSettings, (_input, caller) => { caller.signal?.throwIfAborted(); return ports.modelSettings(); }),
    bindActionHandler(jellyServiceActions.saveModelSettings, (input, caller) => { caller.signal?.throwIfAborted(); return ports.saveModelSettings(input); }),
  ];
}
