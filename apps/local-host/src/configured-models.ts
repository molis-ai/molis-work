import { existsSync } from "node:fs";
import { join } from "node:path";
import { LocalSqliteStorage, createFileSecretStore, peekSealedEntry, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { inspectPromptCacheChoice, type ModelProviderRecord, type ModelRecord } from "@molis-ai/molis-work-contracts/modules/model-providers";
import type { ConnectorConnectionRecord } from "@molis-ai/molis-work-contracts/services/connector-host";
import { ModelProviderStore, type ModelSecretPort, type ModelSecretTarget } from "./model-provider-store.js";
import { assertOwnedCatalog, assertCurrentCatalog } from "./catalog-schema.js";
import { withConnectorConnections, type ConnectorConnectionStore } from "./connector-connection-store.js";
import { isLoopbackHttpUrl } from "@molis-ai/molis-work-contracts/platform/loopback";

export interface TextModelSelection { provider_id: string; model_id: string }
export interface ConfiguredTextModel { provider: ModelProviderRecord; model: ModelRecord; connection_revision: string | null }

/**
 * Shared secret port for `ModelProviderStore`: requires an active, unremoved `model-api` connection
 * pinned to `provider.base_url`'s exact origin before touching `SecretStore.get`.
 */
export function createModelSecretPort(home: string): ModelSecretPort {
  return {
    get(authRef, provider) {
      if (!authRef.trim() || !provider || provider.credential_ref !== authRef) return null;
      const allowed = withConnectorConnections(home, store => {
        const connection = store.list("model-api").find(row => row.credential_ref === authRef);
        return currentModelConnection(store, connection, provider);
      }, true) === true;
      if (!allowed) return null;
      return runWithMolisWorkHome(home, () => createFileSecretStore().get(authRef));
    },
  };
}

/** Opens only the existing catalog owned by the Host; no second provider registry. */
export function openConfiguredModels(home: string): { storage: LocalSqliteStorage; store: ModelProviderStore } | undefined {
  const path = join(home, "projects", "catalog.db");
  if (!existsSync(path)) return undefined;
  const storage = new LocalSqliteStorage(path);
  try {
    assertOwnedCatalog(storage, path);
    assertCurrentCatalog(storage, path);
    return { storage, store: new ModelProviderStore({ db: storage.db, secrets: createModelSecretPort(home) }) };
  } catch (error) { storage.close(); throw error; }
}

/** Available text models from the same catalog, checked through metadata without decrypting credentials. */
export function configuredModelChoices(home: string): { provider_id: string; model_id: string; label: string; vision?: boolean; reasoning_effort: boolean }[] {
  const opened = openConfiguredModels(home);
  if (!opened) return [];
  try {
    const providers = opened.store.list().filter(provider => supportsTextModels(provider)
      && provider.models.some(model => model.enabled) && hasSealedCredential(home, provider));
    if (!providers.length) return [];
    return withConnectorConnections(home, store => {
      const byCredential = new Map<string, ConnectorConnectionRecord>();
      for (const connection of store.list("model-api")) {
        const ref = connection.credential_ref;
        if (ref && !byCredential.has(ref)) byCredential.set(ref, connection);
      }
      return providers.flatMap(provider => {
        if (!currentModelConnection(store, byCredential.get(provider.credential_ref), provider)) return [];
        return provider.models.filter(model => model.enabled).map(model => ({
          provider_id: provider.provider_id, model_id: model.model_id, ...(model.vision === undefined ? {} : { vision: model.vision }),
          reasoning_effort: model.reasoning_effort === true, label: `${provider.display_name} · ${model.display_name ?? model.model_id}`,
        }));
      });
    }, true) ?? [];
  } finally { opened.storage.close(); }
}

export function validateTextModelUrl(address: string): string {
  let url: URL;
  try { url = new URL(address.trim()); } catch { throw new Error("模型地址无效"); }
  const local = isLoopbackHttpUrl(url);
  if ((!local && url.protocol !== "https:") || url.username || url.password || url.search || url.hash) throw new Error("模型地址必须使用 HTTPS 或本机 HTTP，不能包含凭据、查询参数或片段");
  return url.toString().replace(/\/+$/u, "");
}

type CredentialProvider = ModelSecretTarget;

function supportsTextModels(provider: ModelProviderRecord): boolean {
  if (!provider.enabled || !["anthropic-messages", "openai-chat-completions"].includes(provider.api_format) || inspectPromptCacheChoice(provider)) return false;
  try { validateTextModelUrl(provider.base_url); return true; } catch { return false; }
}

function hasSealedCredential(home: string, provider: CredentialProvider): boolean {
  return Boolean(runWithMolisWorkHome(home, () => peekSealedEntry(provider.credential_ref)));
}

function providerOrigin(baseUrl: string): string | null {
  try {
    const origin = new URL(baseUrl).origin;
    return origin === "null" ? null : origin;
  } catch { return null; }
}

function currentModelConnection(store: ConnectorConnectionStore, connection: ConnectorConnectionRecord | undefined, provider: CredentialProvider): boolean {
  if (!connection?.enabled || connection.disconnected_at) return false;
  const origin = providerOrigin(provider.base_url);
  // A credential is usable only at the origin selected for this connection.
  return origin !== null && store.targetOrigin(connection.connection_id) === origin;
}

/** Metadata inspection never decrypts a credential or probes a provider. */
export function modelCredentialMetadata(home: string, provider: CredentialProvider): { available: boolean; revision: string | null } {
  const absent = { available: false, revision: null };
  if (!hasSealedCredential(home, provider)) return absent;
  return withConnectorConnections(home, store => {
    const connection = store.list("model-api").find(row => row.credential_ref === provider.credential_ref);
    return connection && currentModelConnection(store, connection, provider) ? { available: true, revision: connection.updated_at } : absent;
  }, true) ?? absent;
}

export function selectConfiguredTextModel(home: string, store: ModelProviderStore, selection?: TextModelSelection): ConfiguredTextModel | undefined {
  // Same default order as ModelProviderStore.resolveConfiguration; explicit selections never fall back.
  for (const provider of store.list()) {
    if ((selection && provider.provider_id !== selection.provider_id) || !supportsTextModels(provider)) continue;
    const model = provider.models.find(row => row.enabled && (!selection || row.model_id === selection.model_id));
    if (!model) continue;
    const credential = modelCredentialMetadata(home, provider);
    if (credential.available) return { provider, model, connection_revision: credential.revision };
  }
  return undefined;
}

/** Trusted Host snapshot for dispatch and final commit guards; never returned to a plugin or UI. */
export function configuredTextModelSnapshot(home: string, selection: TextModelSelection) {
  const catalog = openConfiguredModels(home);
  try {
    const selected = catalog && selectConfiguredTextModel(home, catalog.store, selection);
    return selected && { ...selected, credential_snapshot: runWithMolisWorkHome(home, () => peekSealedEntry(selected.provider.credential_ref)) };
  } finally { catalog?.storage.close(); }
}
