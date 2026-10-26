import { randomUUID } from "node:crypto";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";

/** One model the Home's provider catalog is given. */
export interface SeededModel { provider_id: string; model_id: string; enabled?: boolean; display_name?: string }

/**
 * Put these models in the Home's own provider catalog, the one list every plugin's `services.model` reads (PG-047, V-13). A model
 * counts as configured only with a connection pinned to its address, so each provider gets a real one; nothing here reaches a
 * network, and a test that sends a request points the provider at its own server instead.
 */
export async function seedConfiguredModels(home: string, models: readonly SeededModel[] = [{ provider_id: "p", model_id: "m" }], endpoint = "http://127.0.0.1:1"): Promise<void> {
  process.env.MOLIS_WORK_SECRET_BACKEND ??= "file";
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    for (const providerId of new Set(models.map(model => model.provider_id))) {
      const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "model-api", displayName: `${providerId} fixture`, token: randomUUID() }));
      withConnectorConnections(home, store => store.assertTarget(connection.connection_id, "model-api", endpoint));
      catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: providerId, display_name: models.find(model => model.provider_id === providerId)?.display_name ?? "fixture", base_url: endpoint, api_format: "anthropic-messages",
        models: models.filter(model => model.provider_id === providerId).map(model => ({ model_id: model.model_id, enabled: model.enabled !== false })) });
    }
  } finally { catalog.close(); }
}
