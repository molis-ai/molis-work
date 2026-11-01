import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { peekSealedEntry, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";

import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginModelConfigurationDeclaration, PluginModelConfigurationInput, PluginModelConfigurationView, PluginModelSelection } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginModelConfigurationPort } from "@molis-ai/molis-work-plugin-runtime";

import { openConfiguredModels as openProviders, selectConfiguredTextModel, modelCredentialMetadata, validateTextModelUrl as validBaseUrl } from "./configured-models.js";
import { hostCompleteText } from "./host-complete-text.js";
import { listConnectorConnectionViews } from "./connector-connection-views.js";
import { withConnectorConnections } from "./connector-connection-store.js";

const errors = defineErrorCodes("host", { model_configuration_invalid: "invalid" });
/** What the settings need of a declaration: where the choice is kept and the id of the consumer's own provider (a Home package's settings are derived without actions, BL-491). */
export type ConsumerModelConfigurationDeclaration = Pick<PluginModelConfigurationDeclaration, "preference" | "custom_provider">;
export const modelConfigurationInvalid = errors.model_configuration_invalid;
interface PreferenceFile extends PluginModelSelection { schema_version: 1 }
function preferencePath(home: string, declaration: ConsumerModelConfigurationDeclaration): string { return join(home, declaration.preference.store_name, declaration.preference.file_name); }
function readPreference(home: string, declaration: ConsumerModelConfigurationDeclaration): PreferenceFile | undefined {
  const path = preferencePath(home, declaration); if (!existsSync(path)) return undefined;
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.model_configuration_invalid("模型偏好文件无效，原文件已保留");
  const pref = value as Partial<PreferenceFile>;
  if (pref.schema_version !== 1 || typeof pref.provider_id !== "string" || !pref.provider_id.trim() || typeof pref.model_id !== "string" || !pref.model_id.trim()) throw errors.model_configuration_invalid("模型偏好文件无效，原文件已保留");
  return { schema_version: 1, provider_id: pref.provider_id, model_id: pref.model_id };
}
function atomicWrite(path: string, body: string): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, body, { mode: 0o600, flag: "wx" }); renameSync(temporary, path); }
  finally { if (existsSync(temporary)) unlinkSync(temporary); }
}
function readSettings(home: string, declaration: ConsumerModelConfigurationDeclaration): PluginModelConfigurationView {
  const pref = readPreference(home, declaration), opened = openProviders(home);
  const connections = existsSync(join(home, "connectors", "connectors.db"))
    ? withConnectorConnections(home, store => store.list("model-api").map(connection => ({ connection_id: connection.connection_id,
      display_name: connection.display_name, state: !connection.enabled || connection.disconnected_at ? "disconnected" : connection.credential_ref
        && runWithMolisWorkHome(home, () => peekSealedEntry(connection.credential_ref!)) ? "connected" : "reauth_required" }))) : [];
  let settings: { -readonly [Key in keyof PluginModelConfigurationView]: PluginModelConfigurationView[Key] } = { configured: false, providers: [], connections,
    ...(pref ? { selection: { provider_id: pref.provider_id, model_id: pref.model_id } } : {}), source: "none" };
  if (opened) try {
    settings.providers = opened.store.list().map(provider => ({ id: provider.provider_id, provider_id: provider.provider_id, name: provider.display_name, base_url: provider.base_url, api_format: provider.api_format, enabled: provider.enabled, has_credential: modelCredentialMetadata(home, provider).available, models: provider.models.map(model => ({ ...model })) }));
    const custom = opened.store.get(declaration.custom_provider.provider_id);
    if (custom) settings.custom_connection_id = connections.find((connection) => withConnectorConnections(home, (store) => store.require(connection.connection_id).credential_ref === custom.credential_ref))?.connection_id;
    const resolved = selectConfiguredTextModel(home, opened.store, pref);
    if (resolved) settings = { ...settings, configured: true, source: pref ? "selection" : "provider", effective_selection: { provider_id: resolved.provider.provider_id, model_id: resolved.model.model_id } };
  } finally { opened.storage.close(); }
  if (!settings.configured && !pref && !settings.providers.length && hostCompleteText({ homeDirectory: home })) { settings.configured = true; settings.source = "environment"; }
  return settings;
}
function saveSettings(home: string, declaration: ConsumerModelConfigurationDeclaration, input: PluginModelConfigurationInput): PluginModelConfigurationView {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw errors.model_configuration_invalid("模型设置必须是对象");
  if (Object.keys(input).some(key => !["provider_id", "model_id", "base_url", "api_format", "connection_id"].includes(key))) throw errors.model_configuration_invalid("模型设置包含不支持的字段；请在 Connectors 中管理模型 API Key");
  for (const key of ["provider_id", "model_id", "base_url", "api_format", "connection_id"] as const) if (input[key] !== undefined && typeof input[key] !== "string") throw errors.model_configuration_invalid("模型设置字段必须是文本");
  const custom = input.base_url !== undefined || input.api_format !== undefined || input.connection_id !== undefined || input.provider_id === declaration.custom_provider.provider_id;
  if (custom && input.provider_id && input.provider_id !== declaration.custom_provider.provider_id) throw errors.model_configuration_invalid("只能选择已有供应商；自定义设置仅修改此消费者专用供应商");
  const providerId = custom ? declaration.custom_provider.provider_id : input.provider_id?.trim(), modelId = input.model_id?.trim();
  if (!providerId || !modelId || modelId.length > 512) throw errors.model_configuration_invalid("请选择供应商并填写有效模型 ID");
  const format = input.api_format;
  if (format !== undefined && !["anthropic-messages", "openai-chat-completions"].includes(format)) throw errors.model_configuration_invalid("模型接口格式无效");
  const suppliedUrl = input.base_url !== undefined ? validBaseUrl(input.base_url) : undefined;
  // The catalog is created and owned by the normal Host lifecycle. Never write an incomplete lookalike catalog.
  const opened = openProviders(home); if (!opened) throw errors.model_configuration_invalid("Molis Work 工作台尚未初始化，请先打开工作台再保存模型设置");
  const prefPath = preferencePath(home, declaration), oldPreference = existsSync(prefPath) ? readFileSync(prefPath, "utf8") : undefined;
  let preferenceWritten = false;
  try {
    const existing = opened.store.get(providerId);
    if (!custom && (!existing || !existing.enabled || !existing.models.some(model => model.model_id === modelId && model.enabled))) throw errors.model_configuration_invalid("所选供应商或模型不存在，或尚未启用");
    const baseUrl = custom ? suppliedUrl ?? (existing ? validBaseUrl(existing.base_url) : undefined) : undefined;
    if (custom && !baseUrl) throw errors.model_configuration_invalid("请填写自定义模型的 Base URL");
    const selectedConnection = input.connection_id?.trim()
      ? withConnectorConnections(home, (store) => store.require(input.connection_id!.trim(), "model-api")) : null;
    if (selectedConnection && (!selectedConnection.enabled || !selectedConnection.credential_ref || selectedConnection.disconnected_at)) throw errors.model_configuration_invalid("所选模型连接不可用");
    if (!selectedConnection && (!existing || !modelCredentialMetadata(home, { ...existing, base_url: baseUrl ?? existing.base_url }).available)) {
      throw errors.model_configuration_invalid("所选模型连接不可用，请恢复连接或重新选择；原选择已保留");
    }
    if (custom && baseUrl) {
      const connectionId = selectedConnection?.connection_id
        ?? listConnectorConnectionViews(home, "model-api").find((connection) =>
          withConnectorConnections(home, (store) => store.require(connection.connection_id).credential_ref === existing?.credential_ref))?.connection_id;
      if (connectionId) withConnectorConnections(home, (store) => store.assertTarget(connectionId, "model-api", baseUrl));
    }
    mkdirSync(join(home, declaration.preference.store_name), { recursive: true, mode: 0o700 });
    opened.storage.db.transaction(() => {
      if (custom) {
        const models = [...(existing?.models ?? [])]; const entry = models.find(model => model.model_id === modelId); if (entry) entry.enabled = true; else models.push({ model_id: modelId, display_name: modelId, enabled: true });
        opened.store.upsert({ provider_id: declaration.custom_provider.provider_id, display_name: declaration.custom_provider.display_name, base_url: baseUrl!, api_format: format ?? existing?.api_format ?? "openai-chat-completions", enabled: true, models,
          ...(selectedConnection?.credential_ref ? { credential_ref: selectedConnection.credential_ref } : {}) });
      }
      atomicWrite(prefPath, JSON.stringify({ schema_version: 1, provider_id: providerId, model_id: modelId } satisfies PreferenceFile, null, 2) + "\n"); preferenceWritten = true;
    }).immediate();
  } catch (error) {
    if (preferenceWritten) { if (oldPreference !== undefined) atomicWrite(prefPath, oldPreference); else unlinkSync(prefPath); }
    throw error;
  } finally { opened.storage.close(); }
  return readSettings(home, declaration);
}
/** The Host owns this consumer binding; provider and connector facts remain behind their existing owners. */
export function createConsumerModelConfiguration(home: string, declaration: ConsumerModelConfigurationDeclaration): PluginModelConfigurationPort {
  return {
    selection: () => { const value = readPreference(home, declaration); return value ? { provider_id: value.provider_id, model_id: value.model_id } : undefined; },
    read: () => readSettings(home, declaration),
    save: input => saveSettings(home, declaration, input),
  };
}
