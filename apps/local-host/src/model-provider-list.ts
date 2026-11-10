import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ModelApiFormat } from "@molis-ai/molis-work-contracts/modules/model-providers";
import { listProviderModels, modelListErrors, type ListedModel, type ModelListSend } from "@molis-ai/molis-work-service-agent-host";
import { withConnectorConnections } from "./connector-connection-store.js";
import type { MolisWorkProjectCatalog } from "./project-catalog.js";

/**
 * "Fetch models" on the settings page (spec assistant-service-connections §13.2): which key may ask the service at the
 * Base URL on the form, then the request itself through agent-host. A typed key goes where the person typed; a saved key
 * only to the address its connection is pinned to, the same rule the check before a save keeps. Nothing is written: no
 * connection, no pin, no list.
 */

export interface ModelListAsk { base_url: string; api_format: ModelApiFormat; api_key: string }

/** Read the form's fields; throws the words the page shows. */
export function readModelListBody(body: Record<string, unknown>): { base_url: string; api_format: ModelApiFormat; api_key: string; connection_id: string } {
  if (typeof body.base_url !== "string" || !["anthropic-messages", "openai-chat-completions"].includes(String(body.api_format))
    || (body.api_key !== undefined && typeof body.api_key !== "string")
    || (body.connection_id !== undefined && typeof body.connection_id !== "string")) throw new Error(uiText.text("workbench.model-provider-list.provider-settings-not-valid-format"));
  return {
    base_url: body.base_url.trim(), api_format: body.api_format as ModelApiFormat,
    api_key: typeof body.api_key === "string" ? body.api_key.trim() : "",
    connection_id: typeof body.connection_id === "string" ? body.connection_id.trim() : "",
  };
}

/**
 * The key to ask with: the typed one, else the chosen connection's, else the saved provider's. Read-only. A connection
 * pinned to another address is refused before its key is read, so the key never leaves for an address it was not given to.
 */
export function modelListKey(catalog: MolisWorkProjectCatalog, home: string | undefined, providerId: string,
  form: ReturnType<typeof readModelListBody>): ModelListAsk {
  const { base_url, api_format, api_key, connection_id } = form;
  if (api_key && connection_id) throw new Error(uiText.text("workbench.model-provider-list.choose-saved-connection-enter-new-api-key-not"));
  if (api_key) {
    if (api_key.length < 8) throw new Error(uiText.text("workbench.model-provider-list.api-key-too-short"));
    return { base_url, api_format, api_key };
  }
  if (!home) throw new Error(uiText.text("workbench.model-provider-list.local-connection-store-unavailable"));
  let origin: string;
  try { origin = new URL(base_url).origin; } catch { throw new Error(uiText.text("workbench.model-provider-list.base-url-must-be-full-address")); }
  const saved = catalog.models.get(providerId)?.credential_ref;
  if (!connection_id && !saved) throw new Error(uiText.text("workbench.model-provider-list.enter-api-key-choose-saved-connection"));
  const key = withConnectorConnections(home, (store) => {
    const connection = connection_id ? store.require(connection_id, "model-api")
      : saved ? store.list("model-api").find((row) => row.credential_ref === saved) : undefined;
    if (!connection) return "";
    if (store.state(connection) !== "connected") throw new Error(uiText.text("workbench.model-provider-list.chosen-connection-unavailable"));
    const pinned = store.targetOrigin(connection.connection_id);
    if (pinned && pinned !== origin) throw new Error(uiText.text("workbench.model-provider-list.connection-bound-pinned-reach-origin-create-new-connection", { pinned, origin }));
    return store.resolveToken(connection.connection_id, "model-api");
  }, "required");
  if (!key.trim()) throw new Error(uiText.text("workbench.model-provider-list.enter-api-key-choose-saved-connection"));
  return { base_url, api_format, api_key: key };
}

const status = (error: ActionError) => Number(error.details?.status ?? 0);

/** Why the list did not come, from the code agent-host gave, in the page's language. */
function modelListProblem(error: unknown): string {
  if (!(error instanceof ActionError)) return uiText.text("workbench.model-provider-list.could-not-get-model-list-type-model-name");
  switch (error.code) {
    case modelListErrors.invalid_url("").code: return uiText.text("workbench.model-provider-list.base-url-must-use-https-http-machine-no");
    case modelListErrors.key_rejected("").code: return uiText.text("workbench.model-provider-list.service-rejected-api-key-status-check-key-correct", { status: status(error) });
    case modelListErrors.unsupported("").code: return uiText.text("workbench.model-provider-list.service-does-not-list-its-models-type-model");
    case modelListErrors.rate_limited("").code: return uiText.text("workbench.model-provider-list.service-says-there-too-many-requests-quota-used");
    case modelListErrors.provider_failed("").code: return uiText.text("workbench.model-provider-list.service-did-not-return-model-list-status-try", { status: status(error) });
    case modelListErrors.timeout("").code: return uiText.text("workbench.model-provider-list.no-response-came-back-check-address-network-then");
    case modelListErrors.response_invalid("").code: return uiText.text(error.details?.reason === "too_large" ? "workbench.model-provider-list.model-list-service-too-large-type-model-name" : "workbench.model-provider-list.service-s-answer-not-model-list-check-base");
    case modelListErrors.unreachable("").code: return uiText.text(error.details?.reason === "dns"
      ? "workbench.model-provider-setup.host-address-could-not-be-found-check-base" : error.details?.reason === "refused"
        ? "workbench.model-provider-setup.could-not-connect-nothing-listening-there-check-base" : "workbench.model-provider-setup.could-not-connect-address-check-base-url-network");
    default: return uiText.text("workbench.model-provider-list.could-not-get-model-list-type-model-name");
  }
}

/** Ask the service; a failure comes back as the page's words, never with the key or the service's raw answer. */
export async function fetchModelsForSettings(ask: ModelListAsk, signal: AbortSignal, send?: ModelListSend): Promise<ListedModel[]> {
  try { return await listProviderModels(ask, { signal, ...(send ? { send } : {}) }); }
  catch (error) {
    if (signal.aborted) throw error;
    throw new Error(modelListProblem(error));
  }
}
