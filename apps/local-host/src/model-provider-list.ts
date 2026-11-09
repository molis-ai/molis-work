import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ModelApiFormat } from "@molis-ai/molis-work-contracts/modules/model-providers";
import { listProviderModels, modelListErrors, type ListedModel, type ModelListSend } from "@molis-ai/molis-work-service-agent-host";
import { withConnectorConnections } from "./connector-connection-store.js";
import type { MolisWorkProjectCatalog } from "./project-catalog.js";
import { L } from "./web-locale.js";

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
    || (body.connection_id !== undefined && typeof body.connection_id !== "string")) throw new Error(L("供应商配置格式无效"));
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
  if (api_key && connection_id) throw new Error(L("请只选择已有连接，或填写新的 API Key"));
  if (api_key) {
    if (api_key.length < 8) throw new Error(L("API Key 太短"));
    return { base_url, api_format, api_key };
  }
  if (!home) throw new Error(L("本机连接库不可用"));
  let origin: string;
  try { origin = new URL(base_url).origin; } catch { throw new Error(L("Base URL 必须是完整地址")); }
  const saved = catalog.models.get(providerId)?.credential_ref;
  if (!connection_id && !saved) throw new Error(L("请填写 API Key，或选择一条已保存的连接"));
  const key = withConnectorConnections(home, (store) => {
    const connection = connection_id ? store.require(connection_id, "model-api")
      : saved ? store.list("model-api").find((row) => row.credential_ref === saved) : undefined;
    if (!connection) return "";
    if (store.state(connection) !== "connected") throw new Error(L("所选连接不可用"));
    const pinned = store.targetOrigin(connection.connection_id);
    if (pinned && pinned !== origin) throw new Error(L("这条连接已绑定 {pinned}；如需访问 {origin}，请新建连接", { pinned, origin }));
    return store.resolveToken(connection.connection_id, "model-api");
  }, "required");
  if (!key.trim()) throw new Error(L("请填写 API Key，或选择一条已保存的连接"));
  return { base_url, api_format, api_key: key };
}

const status = (error: ActionError) => Number(error.details?.status ?? 0);

/** Why the list did not come, from the code agent-host gave, in the page's language. */
function modelListProblem(error: unknown): string {
  if (!(error instanceof ActionError)) return L("没有取到模型列表，请手填模型名。");
  switch (error.code) {
    case modelListErrors.invalid_url("").code: return L("Base URL 必须使用 HTTPS 或本机 HTTP，不能包含密码、查询参数或片段");
    case modelListErrors.key_rejected("").code: return L("服务拒绝了这个 API Key（{status}）。检查 Key 有没有填对、是不是这个地址的 Key。", { status: status(error) });
    case modelListErrors.unsupported("").code: return L("这个服务不提供模型列表，请手填模型名（看供应商文档）。");
    case modelListErrors.rate_limited("").code: return L("服务说请求太多或额度用完了（429）。稍后再试，或看看账户额度。");
    case modelListErrors.provider_failed("").code: return L("服务没有给出模型列表（{status}）。稍后再试，或手填模型名。", { status: status(error) });
    case modelListErrors.timeout("").code: return L("一直没有等到回应。检查地址和网络后重试。");
    case modelListErrors.response_invalid("").code: return L(error.message.includes("太大") ? "服务返回的模型列表太大了，请手填模型名" : "服务的回答不是模型列表。检查 Base URL 和 API 格式有没有选对。");
    // The three ways a connection fails carry their own words, already in the catalog.
    case modelListErrors.unreachable("").code: return L(error.message);
    default: return L("没有取到模型列表，请手填模型名。");
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
