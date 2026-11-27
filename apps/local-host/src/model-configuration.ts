import { isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginModelConfigurationInput, PluginModelConfigurationView, PluginModelSelection } from "@molis-ai/molis-work-contracts/platform/plugin";

import { openConfiguredModels as openProviders, selectConfiguredTextModel, modelCredentialMetadata } from "./configured-models.js";
import { hostHasTextModel } from "./host-complete-text.js";
import { atomicWriteFileSync, assertVersionedFileWritable, type VersionedFile, type VersionedFileStep } from "@molis-ai/molis-work-storage";

const errors = defineErrorCodes("host", { model_configuration_invalid: "invalid" });
/** Where a consumer's choice is kept and the provider id reserved by the platform; the Host derives both for a Home package (`sandboxModelDeclaration`, BL-491). */
export interface ConsumerModelConfigurationDeclaration {
  readonly preference: { readonly store_name: string; readonly file_name: string };
  readonly reserved_provider_id: string;
}
/** Synchronous owner calls: after the caller's authority is checked there is no wait before a persistent effect. */
export interface ConsumerModelConfigurationPort {
  selection(): PluginModelSelection | undefined;
  read(): PluginModelConfigurationView;
  save(input: PluginModelConfigurationInput): PluginModelConfigurationView;
}
export const modelConfigurationInvalid = errors.model_configuration_invalid;
const MODEL_PREFERENCE_SCHEMA_VERSION = /* @version format.model.preference */ 1;
const MODEL_PREFERENCE_UPGRADES: readonly VersionedFileStep[] = [];
export interface ModelPreferenceFile {
  schema_version: typeof MODEL_PREFERENCE_SCHEMA_VERSION;
  selection: PluginModelSelection | null;
  revision: number;
}
const invalidFile = () => errors.model_configuration_invalid("模型偏好文件无效，原文件已保留");
function isSelection(value: unknown): value is PluginModelSelection {
  return isRecord(value) && typeof value.provider_id === "string" && !!value.provider_id.trim()
    && typeof value.model_id === "string" && !!value.model_id.trim();
}
function preferencePath(home: string, declaration: ConsumerModelConfigurationDeclaration): string { return join(home, declaration.preference.store_name, declaration.preference.file_name); }
function readModelPreference(home: string, declaration: ConsumerModelConfigurationDeclaration): ModelPreferenceFile {
  const path = preferencePath(home, declaration);
  if (!existsSync(path)) return { schema_version: MODEL_PREFERENCE_SCHEMA_VERSION, selection: null, revision: 0 };
  return parsePreference(JSON.parse(readFileSync(path, "utf8")));
}
/** The host upgrade process applies this same owner definition to every existing model preference. */
export const MODEL_PREFERENCE_FILE: VersionedFile<ModelPreferenceFile> = { version: MODEL_PREFERENCE_SCHEMA_VERSION, field: "schema_version", upgrades: MODEL_PREFERENCE_UPGRADES, parse: parsePreference };
function parsePreference(value: unknown): ModelPreferenceFile {
  if (!isRecord(value) || Object.keys(value).some(key => key !== "schema_version" && key !== "selection" && key !== "revision")
    || value.schema_version !== MODEL_PREFERENCE_SCHEMA_VERSION || !(value.selection === null || isSelection(value.selection) && Object.keys(value.selection).length === 2)
    || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 0) throw invalidFile();
  return { schema_version: MODEL_PREFERENCE_SCHEMA_VERSION, selection: value.selection, revision: value.revision };
}
function readSettings(home: string, declaration: ConsumerModelConfigurationDeclaration): PluginModelConfigurationView {
  const pref = readModelPreference(home, declaration).selection;
  const opened = openProviders(home);
  const settings: PluginModelConfigurationView = { configured: false, providers: [], source: "none", ...(pref ? { selection: pref } : {}) };
  if (opened) try {
    settings.providers = opened.store.list().map(provider => ({
      provider_id: provider.provider_id, name: provider.display_name, enabled: provider.enabled,
      has_credential: modelCredentialMetadata(home, provider).available,
      models: provider.models.map(model => ({ model_id: model.model_id, display_name: model.display_name ?? model.model_id, enabled: model.enabled })),
    }));
    const resolved = selectConfiguredTextModel(home, opened.store, pref ?? undefined);
    if (resolved) return { ...settings, configured: true, source: pref ? "selection" : "provider",
      effective_selection: { provider_id: resolved.provider.provider_id, model_id: resolved.model.model_id } };
  } finally { opened.storage.close(); }
  if (!pref && !settings.providers.length && hostHasTextModel({ homeDirectory: home })) return { ...settings, configured: true, source: "environment" };
  return settings;
}

function saveSettings(home: string, declaration: ConsumerModelConfigurationDeclaration, input: PluginModelConfigurationInput): PluginModelConfigurationView {
  if (!isSelection(input) || Object.keys(input).length !== 2) throw errors.model_configuration_invalid("只能选择已启用的供应商和模型");
  const selection = { provider_id: input.provider_id.trim(), model_id: input.model_id.trim() };
  if (selection.provider_id === declaration.reserved_provider_id || selection.model_id.length > 512) throw errors.model_configuration_invalid("请选择有效的供应商和模型");
  const path = preferencePath(home, declaration);
  assertVersionedFileWritable(MODEL_PREFERENCE_FILE, path, home);
  const opened = openProviders(home);
  if (!opened) throw errors.model_configuration_invalid("Molis Work 工作台尚未初始化，请先打开工作台再保存模型设置");
  try {
    const provider = opened.store.get(selection.provider_id);
    if (!provider?.enabled || !provider.models.some(model => model.model_id === selection.model_id && model.enabled)) throw errors.model_configuration_invalid("所选供应商或模型不存在，或尚未启用");
    if (!modelCredentialMetadata(home, provider).available) throw errors.model_configuration_invalid("所选模型连接不可用，请恢复连接或重新选择；原选择已保留");
    const prior = readModelPreference(home, declaration);
    atomicWriteFileSync(path, JSON.stringify({ schema_version: MODEL_PREFERENCE_SCHEMA_VERSION, selection, revision: prior.revision + 1 }) + "\n", { mode: 0o600, durable: true });
  } finally { opened.storage.close(); }
  return readSettings(home, declaration);
}
/** The Host owns this consumer binding; provider and connector facts remain behind their existing owners. */
export function createConsumerModelConfiguration(home: string, declaration: ConsumerModelConfigurationDeclaration): ConsumerModelConfigurationPort {
  return {
    selection: () => readModelPreference(home, declaration).selection ?? undefined,
    read: () => readSettings(home, declaration),
    save: input => saveSettings(home, declaration, input),
  };
}
