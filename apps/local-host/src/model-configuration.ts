import { isRecord, type SettingsWriteReceipt } from "@molis-ai/molis-work-plugin-sdk";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { peekSealedEntry, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";

import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginModelConfigurationInput, PluginModelConfigurationView, PluginModelSelection } from "@molis-ai/molis-work-contracts/platform/plugin";

import { openConfiguredModels as openProviders, selectConfiguredTextModel, modelCredentialMetadata, validateTextModelUrl as validBaseUrl } from "./configured-models.js";
import { hostHasTextModel } from "./host-complete-text.js";
import { listConnectorConnectionViews } from "./connector-connection-views.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { atomicWriteFileSync, assertVersionedFileWritable, type VersionedFile, type VersionedFileStep } from "@molis-ai/molis-work-storage";

const errors = defineErrorCodes("host", { model_configuration_invalid: "invalid" });
/** Where a consumer's choice is kept and the id of its own provider; the Host derives both for a Home package (`sandboxModelDeclaration`, BL-491). */
export interface ConsumerModelConfigurationDeclaration {
  readonly preference: { readonly store_name: string; readonly file_name: string };
  readonly custom_provider: { readonly provider_id: string; readonly display_name: string };
}
/** Synchronous owner calls: after the caller's authority is checked there is no wait before a persistent effect. */
export interface ConsumerModelConfigurationPort {
  selection(): PluginModelSelection | undefined;
  read(options?: { preference_revision: true }): PluginModelConfigurationView;
  save(input: PluginModelConfigurationInput): PluginModelConfigurationView;
}
export const modelConfigurationInvalid = errors.model_configuration_invalid;
const MODEL_PREFERENCE_SCHEMA_VERSION = /* @version format.model.preference */ 1;
const MODEL_PREFERENCE_UPGRADES: readonly VersionedFileStep[] = [];
export interface ModelPreferenceFile {
  schema_version: typeof MODEL_PREFERENCE_SCHEMA_VERSION;
  selection: PluginModelSelection | null;
  revision: number;
  receipts: Record<string, SettingsWriteReceipt>;
}
const invalidFile = () => errors.model_configuration_invalid("模型偏好文件无效，原文件已保留");
function isSelection(value: unknown): value is PluginModelSelection {
  return isRecord(value) && typeof value.provider_id === "string" && !!value.provider_id.trim()
    && typeof value.model_id === "string" && !!value.model_id.trim();
}
function preferencePath(home: string, declaration: ConsumerModelConfigurationDeclaration): string { return join(home, declaration.preference.store_name, declaration.preference.file_name); }
export function readModelPreference(home: string, declaration: ConsumerModelConfigurationDeclaration): ModelPreferenceFile {
  const path = preferencePath(home, declaration);
  if (!existsSync(path)) return { schema_version: MODEL_PREFERENCE_SCHEMA_VERSION, selection: null, revision: 0, receipts: {} };
  return parsePreference(JSON.parse(readFileSync(path, "utf8")));
}
/** The host upgrade process applies this same owner definition to every existing model preference. */
export const MODEL_PREFERENCE_FILE: VersionedFile<ModelPreferenceFile> = { version: MODEL_PREFERENCE_SCHEMA_VERSION, field: "schema_version", upgrades: MODEL_PREFERENCE_UPGRADES, parse: parsePreference };
function isModelReceipt(receipt: unknown): receipt is SettingsWriteReceipt {
  if (!isRecord(receipt) || !isRecord(receipt.request) || !isRecord(receipt.result)) return false;
  const { key, layer, request_id, expected_revision, change } = receipt.request;
  const values = receipt.result.values;
  if (typeof key !== "string" || layer !== "personal" || typeof request_id !== "string" || typeof expected_revision !== "string" ||
      !isRecord(change) || !(change.inherit === true || isSelection(change.set)) || !Array.isArray(values) || values.length !== 1) return false;
  const saved = values[0];
  return isRecord(saved) && saved.key === key && saved.state === "ok" && typeof saved.revision === "string" &&
    (saved.source === "personal" || saved.source === "provider_default") && (saved.value === null || isSelection(saved.value));
}
function parsePreference(value: unknown): ModelPreferenceFile {
  if (!isRecord(value) || value.schema_version !== MODEL_PREFERENCE_SCHEMA_VERSION || !(value.selection === null || isSelection(value.selection) && Object.keys(value.selection).length === 2)
    || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 0 || !isRecord(value.receipts)) throw invalidFile();
  const receipts: ModelPreferenceFile["receipts"] = Object.create(null);
  for (const [id, receipt] of Object.entries(value.receipts)) {
    if (!isModelReceipt(receipt)) throw invalidFile();
    receipts[id] = receipt;
  }
  return { schema_version: MODEL_PREFERENCE_SCHEMA_VERSION, selection: value.selection, revision: value.revision, receipts };
}
export function commitModelPreference(home: string, declaration: ConsumerModelConfigurationDeclaration, state: ModelPreferenceFile): void {
  const path = preferencePath(home, declaration);
  assertVersionedFileWritable(MODEL_PREFERENCE_FILE, path, home);
  atomicWriteFileSync(path, JSON.stringify(state) + "\n", { durable: true });
}
function atomicWrite(path: string, body: string): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, body, { mode: 0o600, flag: "wx" }); renameSync(temporary, path); }
  finally { if (existsSync(temporary)) unlinkSync(temporary); }
}
export function modelPreferenceRevision(revision: number, fallback: PluginModelSelection | null, unavailable: boolean): string {
  return JSON.stringify([revision, fallback, unavailable]);
}

function readSettings(home: string, declaration: ConsumerModelConfigurationDeclaration, withRevision = false): PluginModelConfigurationView {
  const state = readModelPreference(home, declaration), pref = state.selection ?? undefined, opened = openProviders(home);
  let inherited: PluginModelSelection | null = null;
  const connections = existsSync(join(home, "connectors", "connectors.db"))
    ? withConnectorConnections(home, store => store.list("model-api").map(connection => ({ connection_id: connection.connection_id,
      display_name: connection.display_name, state: !connection.enabled || connection.disconnected_at ? "disconnected" : connection.credential_ref
        && runWithMolisWorkHome(home, () => peekSealedEntry(connection.credential_ref!)) ? "connected" : "reauth_required" })), true) ?? [] : [];
  let settings: { -readonly [Key in keyof PluginModelConfigurationView]: PluginModelConfigurationView[Key] } = { configured: false, providers: [], connections,
    ...(pref ? { selection: { provider_id: pref.provider_id, model_id: pref.model_id } } : {}), source: "none" };
  if (opened) try {
    settings.providers = opened.store.list().map(provider => ({ id: provider.provider_id, provider_id: provider.provider_id, name: provider.display_name, base_url: provider.base_url, api_format: provider.api_format, enabled: provider.enabled, has_credential: modelCredentialMetadata(home, provider).available, models: provider.models.map(model => ({ ...model })) }));
    const custom = opened.store.get(declaration.custom_provider.provider_id);
    if (custom) settings.custom_connection_id = connections.find((connection) => withConnectorConnections(home, (store) => store.require(connection.connection_id).credential_ref === custom.credential_ref, "required"))?.connection_id;
    const resolved = selectConfiguredTextModel(home, opened.store, pref);
    if (withRevision) {
      const fallback = pref ? selectConfiguredTextModel(home, opened.store) : resolved;
      if (fallback) inherited = { provider_id: fallback.provider.provider_id, model_id: fallback.model.model_id };
    }
    if (resolved) settings = { ...settings, configured: true, source: pref ? "selection" : "provider", effective_selection: { provider_id: resolved.provider.provider_id, model_id: resolved.model.model_id } };
  } finally { opened.storage.close(); }
  if (!settings.configured && !pref && !settings.providers.length && hostHasTextModel({ homeDirectory: home })) { settings.configured = true; settings.source = "environment"; }
  if (withRevision) settings.preference_revision = modelPreferenceRevision(state.revision, inherited, Boolean(pref && !settings.configured));
  return settings;
}
function saveSettings(home: string, declaration: ConsumerModelConfigurationDeclaration, input: PluginModelConfigurationInput): PluginModelConfigurationView {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw errors.model_configuration_invalid("模型设置必须是对象");
  if (Object.keys(input).some(key => !["provider_id", "model_id", "base_url", "api_format", "connection_id"].includes(key))) throw errors.model_configuration_invalid("模型设置包含不支持的字段；请在「设置 › 服务连接」中管理模型 API Key");
  for (const key of ["provider_id", "model_id", "base_url", "api_format", "connection_id"] as const) if (input[key] !== undefined && typeof input[key] !== "string") throw errors.model_configuration_invalid("模型设置字段必须是文本");
  const custom = input.base_url !== undefined || input.api_format !== undefined || input.connection_id !== undefined || input.provider_id === declaration.custom_provider.provider_id;
  if (custom && input.provider_id && input.provider_id !== declaration.custom_provider.provider_id) throw errors.model_configuration_invalid("只能选择已有供应商；自定义设置仅修改此消费者专用供应商");
  const providerId = custom ? declaration.custom_provider.provider_id : input.provider_id?.trim(), modelId = input.model_id?.trim();
  if (!providerId || !modelId || modelId.length > 512) throw errors.model_configuration_invalid("请选择供应商并填写有效模型 ID");
  const format = input.api_format;
  if (format !== undefined && !["anthropic-messages", "openai-chat-completions"].includes(format)) throw errors.model_configuration_invalid("模型接口格式无效");
  const suppliedUrl = input.base_url !== undefined ? validBaseUrl(input.base_url) : undefined;
  const prefPath = preferencePath(home, declaration);
  // Before anything this save does (the custom provider, the connection's first origin, the file): a choice file too new for this build, not
  // yet upgraded or unreadable is not this build's to replace (upgrade-chain-design §2.6), and refusing it here leaves all of them as they were.
  // Nothing in this save waits, and only this Host writes the file, so what passes here is what the write below replaces.
  assertVersionedFileWritable(MODEL_PREFERENCE_FILE, prefPath, home);
  // The catalog is created and owned by the normal Host lifecycle. Never write an incomplete lookalike catalog.
  const opened = openProviders(home); if (!opened) throw errors.model_configuration_invalid("Molis Work 工作台尚未初始化，请先打开工作台再保存模型设置");
  const prior = readModelPreference(home, declaration);
  const oldPreference = existsSync(prefPath) ? readFileSync(prefPath, "utf8") : undefined;
  let preferenceWritten = false;
  try {
    const existing = opened.store.get(providerId);
    if (!custom && (!existing || !existing.enabled || !existing.models.some(model => model.model_id === modelId && model.enabled))) throw errors.model_configuration_invalid("所选供应商或模型不存在，或尚未启用");
    const baseUrl = custom ? suppliedUrl ?? (existing ? validBaseUrl(existing.base_url) : undefined) : undefined;
    if (custom && !baseUrl) throw errors.model_configuration_invalid("请填写自定义模型的 Base URL");
    const selectedConnection = input.connection_id?.trim()
      ? withConnectorConnections(home, (store) => store.require(input.connection_id!.trim(), "model-api"), "required") : null;
    if (selectedConnection && (!selectedConnection.enabled || !selectedConnection.credential_ref || selectedConnection.disconnected_at)) throw errors.model_configuration_invalid("所选模型连接不可用");
    if (!selectedConnection && (!existing || !modelCredentialMetadata(home, { ...existing, base_url: baseUrl ?? existing.base_url }).available)) {
      throw errors.model_configuration_invalid("所选模型连接不可用，请恢复连接或重新选择；原选择已保留");
    }
    if (custom && baseUrl) {
      const connectionId = selectedConnection?.connection_id
        ?? listConnectorConnectionViews(home, "model-api").find((connection) =>
          withConnectorConnections(home, (store) => store.require(connection.connection_id).credential_ref === existing?.credential_ref, "required"))?.connection_id;
      if (connectionId) withConnectorConnections(home, (store) => store.assertTarget(connectionId, "model-api", baseUrl));
    }
    mkdirSync(join(home, declaration.preference.store_name), { recursive: true, mode: 0o700 });
    opened.storage.db.transaction(() => {
      if (custom) {
        const models = [...(existing?.models ?? [])]; const entry = models.find(model => model.model_id === modelId); if (entry) entry.enabled = true; else models.push({ model_id: modelId, display_name: modelId, enabled: true });
        opened.store.upsert({ provider_id: declaration.custom_provider.provider_id, display_name: declaration.custom_provider.display_name, base_url: baseUrl!, api_format: format ?? existing?.api_format ?? "openai-chat-completions", enabled: true, models,
          ...(selectedConnection?.credential_ref ? { credential_ref: selectedConnection.credential_ref } : {}) });
      }
      atomicWrite(prefPath, JSON.stringify({ ...prior, selection: { provider_id: providerId, model_id: modelId }, revision: prior.revision + 1 } satisfies ModelPreferenceFile, null, 2) + "\n"); preferenceWritten = true;
    }).immediate();
  } catch (error) {
    if (preferenceWritten) { if (oldPreference !== undefined) atomicWrite(prefPath, oldPreference); else unlinkSync(prefPath); }
    throw error;
  } finally { opened.storage.close(); }
  return readSettings(home, declaration);
}
/** The Host owns this consumer binding; provider and connector facts remain behind their existing owners. */
export function createConsumerModelConfiguration(home: string, declaration: ConsumerModelConfigurationDeclaration): ConsumerModelConfigurationPort {
  return {
    selection: () => readModelPreference(home, declaration).selection ?? undefined,
    read: options => readSettings(home, declaration, options?.preference_revision),
    save: input => saveSettings(home, declaration, input),
  };
}
