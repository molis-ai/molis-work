import type { ActionCallContext, ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ModelApiFormat, ModelRecord } from "@molis-ai/molis-work-contracts/modules/model-providers";
import { defineJellyAction as define } from "./command-actions.js";
import type { JellyMaterialExtraction } from "./material.js";
import * as s from "./action-schema.js";

export interface JellyModelSelection { provider_id: string; model_id: string }
export interface JellyModelSettings {
  configured: boolean;
  providers: { id: string; provider_id: string; name: string; base_url: string; api_format: ModelApiFormat; enabled: boolean; has_credential: boolean; models: ModelRecord[] }[];
  selection?: JellyModelSelection; effective_selection?: JellyModelSelection;
  source: "selection" | "provider" | "environment" | "none";
  connections: { connection_id: string; display_name: string; state: string }[];
  custom_connection_id?: string;
}
export interface JellyModelInput { provider_id?: string; model_id?: string; base_url?: string; api_format?: ModelApiFormat; connection_id?: string }
const selection = s.object({ provider_id: s.id, model_id: s.id });
const apiFormat = { enum: ["anthropic-messages", "openai-chat-completions"] };
const settings = s.object({ configured: s.boolean, providers: s.array(s.object({ id: s.id, provider_id: s.id, name: s.text, base_url: s.text, api_format: apiFormat, enabled: s.boolean, has_credential: s.boolean,
  models: s.array(s.object({ model_id: s.id, display_name: s.text, context_tokens: s.revision, vision: s.boolean, enabled: s.boolean }, ["model_id", "enabled"])),
})), selection, effective_selection: selection, source: { enum: ["selection", "provider", "environment", "none"] }, connections: s.array(s.object({ connection_id: s.id, display_name: s.text, state: s.text })), custom_connection_id: s.text }, ["configured", "providers", "source", "connections"]);
type Upload = { file_name: string; data_base64: string; allow_model_download?: boolean };
type Stored = { file_name: string; sha256: string; allow_model_download?: boolean };
type Source = { url: string; allow_model_download?: boolean };
const file = { type: "string", minLength: 1, maxLength: 240 };
export const jellyServiceActions = {
  material: define<Upload, JellyMaterialExtraction>("material.extract", "读取上传材料", "保存原附件并提取文字及定位证据；仅在明确允许时下载本地识别模型", "command", s.object({ file_name: file, data_base64: { type: "string", maxLength: 34952536 }, allow_model_download: s.boolean }, ["file_name", "data_base64"]), s.extraction, ["jelly:read", "jelly:write"], "concurrent"),
  reread: define<Stored, JellyMaterialExtraction>("material.reread", "重新读取已有附件", "按文件名和 SHA256 验证原附件并重新提取，不接受任意文件路径", "command", s.object({ file_name: file, sha256: { type: "string", pattern: "^[a-f0-9]{64}$" }, allow_model_download: s.boolean }, ["file_name", "sha256"]), s.extraction, ["jelly:read", "jelly:write"], "concurrent"),
  source: define<Source, JellyMaterialExtraction>("source.read", "读取公开来源", "从公开来源读取正文或媒体证据；遵守原来源边界，可保存下载材料", "command", s.object({ url: s.id, allow_model_download: s.boolean }, ["url"]), s.extraction, ["jelly:read", "jelly:write"], "concurrent"),
  modelSettings: define<Record<string, never>, JellyModelSettings>("model.settings", "读取 Jelly 模型设置", "读取原供应商目录、连接状态和 Jelly 模型选择，不读取密钥", "query", s.object({}), settings, ["jelly:settings"]),
  saveModelSettings: define<JellyModelInput, JellyModelSettings>("model.configure", "设置 Jelly 文字模型", "选择已有模型连接或修改 Jelly 专用模型配置，沿用统一连接和凭据存储", "command", s.object({ provider_id: s.text, model_id: s.text, base_url: s.text, api_format: apiFormat, connection_id: s.text }, []), settings, ["jelly:settings"]),
};
export interface JellyServicePorts {
  material(input: Upload, caller: ActionCallContext): Promise<JellyMaterialExtraction>;
  reread(input: Stored, caller: ActionCallContext): Promise<JellyMaterialExtraction>;
  source(input: Source, caller: ActionCallContext): Promise<JellyMaterialExtraction>;
  modelSettings(): JellyModelSettings;
  saveModelSettings(input: JellyModelInput): JellyModelSettings;
}
export function createJellyServiceHandlers(ports: JellyServicePorts): ActionHandlerBinding[] {
  return Object.entries(jellyServiceActions).map(([key, definition]) => ({ capability_id: definition.capability_id, version: definition.version,
    handle: (caller, input) => { caller.signal?.throwIfAborted(); return (ports[key as keyof JellyServicePorts] as (input: unknown, caller: ActionCallContext) => unknown)(input, caller); },
  }));
}
