import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { LocalCatalogMetadata, LocalSqliteStorage, createFileSecretStore, runWithMolisWorkHome, type SecretStore } from "@molis-ai/molis-work-storage";
import type { ModelApiFormat, ModelRecord } from "@molis-ai/molis-work-contracts/modules/model-providers";
import { ModelProviderStore, modelCredentialRef, type ModelSecretPort } from "./model-provider-store.js";
import { catalogSchemaCompatibilityError } from "./project-catalog-contract.js";
import { assertOwnedCatalog } from "./catalog-migrations.js";
import { hostCompleteText, type HostCompleteText } from "./host-complete-text.js";

const CUSTOM_PROVIDER_ID = "jelly-text";
export interface JellyModelSelection { provider_id: string; model_id: string }
export interface JellyModelSettings {
  configured: boolean;
  providers: { id: string; provider_id: string; name: string; base_url: string; api_format: ModelApiFormat; enabled: boolean; has_credential: boolean; models: ModelRecord[] }[];
  selection?: JellyModelSelection;
  effective_selection?: JellyModelSelection;
  source: "selection" | "provider" | "environment" | "none";
}
export interface JellyModelInput { provider_id?: string; model_id?: string; base_url?: string; api_format?: ModelApiFormat; api_key?: string }
interface PreferenceFile extends JellyModelSelection { schema_version: 1 }
function preferencePath(home: string): string { return join(home, "jelly", "preferences.json"); }
function readPreference(home: string): PreferenceFile | undefined {
  const path = preferencePath(home); if (!existsSync(path)) return undefined;
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Jelly 模型偏好文件无效，原文件已保留");
  const pref = value as Partial<PreferenceFile>;
  if (pref.schema_version !== 1 || typeof pref.provider_id !== "string" || !pref.provider_id.trim() || typeof pref.model_id !== "string" || !pref.model_id.trim()) throw new Error("Jelly 模型偏好文件无效，原文件已保留");
  return { schema_version: 1, provider_id: pref.provider_id, model_id: pref.model_id };
}
function atomicWrite(path: string, body: string): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, body, { mode: 0o600, flag: "wx" }); renameSync(temporary, path); }
  finally { if (existsSync(temporary)) unlinkSync(temporary); }
}
function validBaseUrl(input: string): string {
  let url: URL; try { url = new URL(input.trim()); } catch { throw new Error("模型地址无效"); }
  if (url.username || url.password || url.search || url.hash) throw new Error("模型地址不能包含凭据、查询参数或片段");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("模型地址必须使用 HTTPS 或本机 loopback HTTP");
  return url.toString().replace(/\/+$/, "");
}
function scopedSecrets(home: string): ModelSecretPort {
  let secrets: SecretStore | undefined;
  const get = () => secrets ??= runWithMolisWorkHome(home, () => createFileSecretStore());
  return { get: ref => get().get(ref), put: (ref, plaintext) => get().put(ref, plaintext), delete: ref => get().delete(ref) };
}
function openProviders(home: string): { storage: LocalSqliteStorage; store: ModelProviderStore; secrets: ModelSecretPort } | undefined {
  const path = join(home, "projects", "catalog.db"); if (!existsSync(path)) return undefined;
  const storage = new LocalSqliteStorage(path);
  try { assertOwnedCatalog(storage, path); const compatibility = catalogSchemaCompatibilityError(new LocalCatalogMetadata(storage.db).version()); if (compatibility) throw compatibility; const secrets = scopedSecrets(home); return { storage, secrets, store: new ModelProviderStore({ db: storage.db, secrets }) }; }
  catch (error) { storage.close(); throw error; }
}
function usableConfiguration(store: ModelProviderStore, pref?: JellyModelSelection): { config: NonNullable<ReturnType<ModelProviderStore["resolveConfiguration"]>>; source: "selection" | "provider" } | undefined {
  const chosen = pref ? store.resolveConfiguration(pref) : null;
  if (chosen) { validBaseUrl(chosen.provider.base_url); return { config: chosen, source: "selection" }; }
  // Existing provider records may predate URL validation. Skip unsuitable ones instead of sending keys to plain HTTP.
  for (const provider of store.list()) {
    const config = store.resolveConfiguration({ provider_id: provider.provider_id }); if (!config) continue;
    try { validBaseUrl(config.provider.base_url); return { config, source: "provider" }; } catch { continue; }
  }
  return undefined;
}
export function readJellyModelSettings(home: string): JellyModelSettings {
  const pref = readPreference(home), opened = openProviders(home);
  let settings: JellyModelSettings = { configured: false, providers: [], ...(pref ? { selection: { provider_id: pref.provider_id, model_id: pref.model_id } } : {}), source: "none" };
  if (opened) try {
    settings.providers = opened.store.list().map(provider => ({ id: provider.provider_id, provider_id: provider.provider_id, name: provider.display_name, base_url: provider.base_url, api_format: provider.api_format, enabled: provider.enabled, has_credential: opened.store.hasCredential(provider.provider_id), models: provider.models.map(model => ({ ...model })) }));
    const resolved = usableConfiguration(opened.store, pref);
    if (resolved) settings = { ...settings, configured: true, source: resolved.source, effective_selection: { provider_id: resolved.config.provider.provider_id, model_id: resolved.config.model.model_id } };
  } finally { opened.storage.close(); }
  if (!settings.configured && hostCompleteText({ env: process.env })) { settings.configured = true; settings.source = "environment"; }
  return settings;
}
export function saveJellyModelSettings(home: string, input: JellyModelInput): JellyModelSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("模型设置必须是对象");
  for (const key of ["provider_id", "model_id", "base_url", "api_format", "api_key"] as const) if (input[key] !== undefined && typeof input[key] !== "string") throw new Error("模型设置字段必须是文本");
  if (input.api_key && input.api_key.length > 16_384) throw new Error("API Key 过长");
  const custom = input.base_url !== undefined || input.api_format !== undefined || input.api_key !== undefined || input.provider_id === CUSTOM_PROVIDER_ID;
  if (custom && input.provider_id && input.provider_id !== CUSTOM_PROVIDER_ID) throw new Error("只能选择已有供应商；自定义设置仅修改 Jelly 专用供应商");
  const providerId = custom ? CUSTOM_PROVIDER_ID : input.provider_id?.trim(), modelId = input.model_id?.trim();
  if (!providerId || !modelId || modelId.length > 512) throw new Error("请选择供应商并填写有效模型 ID");
  const format = input.api_format;
  if (format !== undefined && !["anthropic-messages", "openai-chat-completions"].includes(format)) throw new Error("模型接口格式无效");
  const suppliedUrl = input.base_url !== undefined ? validBaseUrl(input.base_url) : undefined;
  // The catalog is created and owned by the normal Host lifecycle. Never write an incomplete lookalike catalog.
  const opened = openProviders(home); if (!opened) throw new Error("Molis Work 工作台尚未初始化，请先打开工作台再保存模型设置");
  const prefPath = preferencePath(home), oldPreference = existsSync(prefPath) ? readFileSync(prefPath, "utf8") : undefined;
  let priorKey: string | null | undefined, keyWritten = false, preferenceWritten = false;
  try {
    const existing = opened.store.get(providerId);
    if (!custom && (!existing || !existing.enabled || !existing.models.some(model => model.model_id === modelId && model.enabled))) throw new Error("所选供应商或模型不存在，或尚未启用");
    const baseUrl = custom ? suppliedUrl ?? (existing ? validBaseUrl(existing.base_url) : undefined) : undefined;
    if (custom && !baseUrl) throw new Error("请填写自定义模型的 Base URL");
    const trimmedKey = input.api_key?.trim();
    if (trimmedKey) priorKey = opened.secrets.get(modelCredentialRef(CUSTOM_PROVIDER_ID));
    mkdirSync(join(home, "jelly"), { recursive: true, mode: 0o700 });
    opened.storage.db.transaction(() => {
      if (custom) {
        const models = [...(existing?.models ?? [])]; const entry = models.find(model => model.model_id === modelId); if (entry) entry.enabled = true; else models.push({ model_id: modelId, display_name: modelId, enabled: true });
        opened.store.upsert({ provider_id: CUSTOM_PROVIDER_ID, display_name: "Jelly 模型", base_url: baseUrl!, api_format: format ?? existing?.api_format ?? "openai-chat-completions", enabled: true, models });
        if (trimmedKey) { opened.store.setCredential(CUSTOM_PROVIDER_ID, trimmedKey); keyWritten = true; }
      }
      atomicWrite(prefPath, JSON.stringify({ schema_version: 1, provider_id: providerId, model_id: modelId } satisfies PreferenceFile, null, 2) + "\n"); preferenceWritten = true;
    }).immediate();
  } catch (error) {
    if (keyWritten) { if (priorKey) opened.secrets.put(modelCredentialRef(CUSTOM_PROVIDER_ID), priorKey); else opened.secrets.delete(modelCredentialRef(CUSTOM_PROVIDER_ID)); }
    if (preferenceWritten) { if (oldPreference !== undefined) atomicWrite(prefPath, oldPreference); else unlinkSync(prefPath); }
    throw error;
  } finally { opened.storage.close(); }
  return readJellyModelSettings(home);
}
export function createJellyCompletion(home: string): HostCompleteText | undefined {
  const pref = readPreference(home), opened = openProviders(home);
  if (opened) try {
    const resolved = usableConfiguration(opened.store, pref);
    if (resolved) {
      const { provider, model, api_key } = resolved.config;
      return hostCompleteText({ env: { MOLIS_WORK_TEXT_API_KEY: api_key, MOLIS_WORK_TEXT_API_FORMAT: provider.api_format, MOLIS_WORK_TEXT_BASE_URL: validBaseUrl(provider.base_url), MOLIS_WORK_TEXT_MODEL: model.model_id } });
    }
  } finally { opened.storage.close(); }
  return hostCompleteText({ env: process.env });
}
