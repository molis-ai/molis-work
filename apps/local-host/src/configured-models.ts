import { existsSync } from "node:fs";
import { join } from "node:path";
import { LocalCatalogMetadata, LocalSqliteStorage, createFileSecretStore, peekSealedEntry, runWithMolisWorkHome, type SecretStore } from "@molis-ai/molis-work-storage";
import { inspectPromptCacheChoice, type ModelProviderRecord, type ModelRecord } from "@molis-ai/molis-work-contracts/modules/model-providers";
import { ModelProviderStore, type ModelSecretPort } from "./model-provider-store.js";
import { assertOwnedCatalog } from "./catalog-migrations.js";
import { catalogSchemaCompatibilityError } from "./project-catalog-contract.js";
import { withConnectorConnections } from "./connector-connection-store.js";

export interface TextModelSelection { provider_id: string; model_id: string }
export interface ConfiguredTextModel { provider: ModelProviderRecord; model: ModelRecord; connection_revision: string | null }

/** Opens only the existing catalog owned by the Host; no second provider registry. */
export function openConfiguredModels(home: string): { storage: LocalSqliteStorage; store: ModelProviderStore } | undefined {
  const path = join(home, "projects", "catalog.db");
  if (!existsSync(path)) return undefined;
  const storage = new LocalSqliteStorage(path);
  try {
    assertOwnedCatalog(storage, path);
    const problem = catalogSchemaCompatibilityError(new LocalCatalogMetadata(storage.db).version());
    if (problem) throw problem;
    let secrets: SecretStore | undefined;
    const get = () => secrets ??= runWithMolisWorkHome(home, () => createFileSecretStore());
    const port: ModelSecretPort = { get: ref => get().get(ref), put: (ref, value) => get().put(ref, value), delete: ref => get().delete(ref) };
    return { storage, store: new ModelProviderStore({ db: storage.db, secrets: port }) };
  } catch (error) { storage.close(); throw error; }
}

export function validateTextModelUrl(address: string): string {
  let url: URL;
  try { url = new URL(address.trim()); } catch { throw new Error("模型地址无效"); }
  const local = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!local && url.protocol !== "https:") || url.username || url.password || url.search || url.hash) throw new Error("模型地址必须使用 HTTPS 或本机 HTTP，不能包含凭据、查询参数或片段");
  return url.toString().replace(/\/+$/u, "");
}

/** Metadata inspection never decrypts a credential or probes a provider. */
export function modelCredentialMetadata(home: string, provider: Pick<ModelProviderRecord, "credential_ref" | "base_url">): { available: boolean; revision: string | null } {
  const absent = { available: false, revision: null };
  if (!runWithMolisWorkHome(home, () => peekSealedEntry(provider.credential_ref))) return absent;
  if (!existsSync(join(home, "connectors", "connectors.db"))) return { available: !provider.credential_ref.startsWith("connector-connection:"), revision: null };
  return withConnectorConnections(home, store => {
    const connection = store.list().find(row => row.credential_ref === provider.credential_ref);
    if (!connection) return { available: !provider.credential_ref.startsWith("connector-connection:"), revision: null };
    if (connection.service_id !== "model-api" || connection.disconnected_at) return absent;
    const origin = store.targetOrigin(connection.connection_id);
    if (origin && origin !== new URL(provider.base_url).origin) return absent;
    if (!origin && connection.source === "managed") return absent;
    return { available: true, revision: connection.updated_at };
  });
}

export function selectConfiguredTextModel(home: string, store: ModelProviderStore, selection?: TextModelSelection): ConfiguredTextModel | undefined {
  // Same default order as ModelProviderStore.resolveConfiguration; explicit selections never fall back.
  for (const provider of store.list()) {
    if (!["anthropic-messages", "openai-chat-completions"].includes(provider.api_format) || inspectPromptCacheChoice(provider)) continue;
    if (!provider.enabled || (selection && provider.provider_id !== selection.provider_id)) continue;
    const model = provider.models.find(row => row.enabled && (!selection || row.model_id === selection.model_id));
    if (!model) continue;
    try { validateTextModelUrl(provider.base_url); } catch { continue; }
    const credential = modelCredentialMetadata(home, provider);
    if (credential.available) return { provider, model, connection_revision: credential.revision };
  }
  return undefined;
}
