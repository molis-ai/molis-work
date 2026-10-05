import type { IncomingMessage, ServerResponse } from "node:http";
import type { ModelApiFormat, ModelPromptCacheMode, ModelRecord, ModelThinkingMode } from "@molis-ai/molis-work-contracts/modules/model-providers";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { testConfiguredModel } from "./model-provider-test.js";
import { withConnectorConnections } from "./connector-connection-store.js";

/** Global settings reuse the catalog's configuration and Host-owned secret store. */
export async function handleModelSettingsHttp(
  request: IncomingMessage, response: ServerResponse, url: URL,
  withCatalog: LocalWebCatalogRunner, homeDirectory?: string,
): Promise<boolean> {
  const match = url.pathname.match(/^\/api\/settings\/models(?:\/([a-z0-9-]+)(\/test)?)?$/);
  if (!match) return false;
  try {
    const providerId = match[1];
    if (request.method === "GET" && !providerId) {
      const result = await withCatalog({ homeDirectory }, (catalog) => ({
        providers: catalog.models.list(), health: catalog.models.health(),
      }));
      sendLocalWebJson(response, 200, result);
    } else if (request.method === "POST" && providerId && match[2]) {
      const body = await readLocalWebBody(request);
      const selection = await withCatalog({ homeDirectory }, (catalog) => catalog.models.resolveConfiguration({
        provider_id: providerId, model_id: typeof body.model_id === "string" ? body.model_id : "",
      }));
      if (!selection) throw new Error("请先保存供应商、密钥和启用的模型");
      const result = await testConfiguredModel(selection);
      sendLocalWebJson(response, 200, result);
    } else if (request.method === "POST" && providerId && !match[2]) {
      const body = await readLocalWebBody(request);
      if (typeof body.display_name !== "string" || typeof body.base_url !== "string"
        || !["anthropic-messages", "openai-chat-completions"].includes(String(body.api_format))
        || typeof body.enabled !== "boolean" || !Array.isArray(body.models)
        || !["off", "best-effort", "required"].includes(String(body.prompt_cache))
        || (body.thinking !== undefined && !["off", "adaptive"].includes(String(body.thinking)))
        || (body.connection_id !== undefined && typeof body.connection_id !== "string")
        || (body.api_key !== undefined && typeof body.api_key !== "string")) throw new Error("供应商配置格式无效");
      const models: ModelRecord[] = body.models.map((entry: unknown) => {
        if (!entry || typeof entry !== "object" || !("model_id" in entry) || typeof entry.model_id !== "string"
          || !("enabled" in entry) || typeof entry.enabled !== "boolean") throw new Error("模型配置格式无效");
        if (("display_name" in entry && typeof entry.display_name !== "string")
          || ("context_tokens" in entry && typeof entry.context_tokens !== "number")
          || ("vision" in entry && typeof entry.vision !== "boolean")) throw new Error("模型元数据格式无效");
        return { model_id: entry.model_id.trim(), enabled: entry.enabled,
          ...("display_name" in entry ? { display_name: entry.display_name as string } : {}),
          ...("context_tokens" in entry ? { context_tokens: entry.context_tokens as number } : {}),
          ...("vision" in entry ? { vision: entry.vision as boolean } : {}),
        };
      });
      const result = await withCatalog({ homeDirectory }, (catalog) => {
        const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
        const requestedConnection = typeof body.connection_id === "string" ? body.connection_id.trim() : "";
        if (apiKey && requestedConnection) throw new Error("请只选择已有连接，或填写新的 API Key");
        if (apiKey && apiKey.length < 8) throw new Error("API Key 太短");
        const alreadyStored = Boolean(catalog.models.get(providerId) && catalog.models.hasCredential(providerId));
        if (!apiKey && !requestedConnection && !alreadyStored) throw new Error("请填写 API Key，或选择一条已保存的连接");
        const input = {
          provider_id: providerId, display_name: body.display_name as string, base_url: body.base_url as string,
          api_format: body.api_format as ModelApiFormat, enabled: body.enabled as boolean,
          prompt_cache: body.prompt_cache as ModelPromptCacheMode, models,
          ...(body.thinking === undefined ? {} : { thinking: body.thinking as ModelThinkingMode }),
        };
        // Refused before a new key becomes a connection, so a rejected form leaves nothing behind.
        catalog.models.check(input);
        if (!homeDirectory && (apiKey || requestedConnection)) throw new Error("本机连接库不可用");
        // The key lives in a model-api connection: a typed key becomes a new one, otherwise the chosen or current one is used.
        const credentialRef = homeDirectory ? withConnectorConnections(homeDirectory, (store) => {
          if (apiKey) {
            const created = store.createToken({ serviceId: "model-api", displayName: input.display_name.trim() || "模型", token: apiKey });
            store.assertTarget(created.connection_id, "model-api", input.base_url);
            return created.credential_ref ?? undefined;
          }
          const current = catalog.models.get(providerId)?.credential_ref;
          const connection = requestedConnection ? store.require(requestedConnection, "model-api")
            : store.list("model-api").find((row) => row.credential_ref === current);
          if (requestedConnection && (!connection?.credential_ref || store.state(connection) !== "connected")) throw new Error("所选连接不可用");
          if (connection) store.assertTarget(connection.connection_id, "model-api", input.base_url);
          return connection?.credential_ref ?? undefined;
        }) : undefined;
        const provider = catalog.models.upsert({ ...input, ...(credentialRef ? { credential_ref: credentialRef } : {}) });
        return { provider: catalog.models.get(providerId) ?? provider,
          health: catalog.models.health().find((entry) => entry.provider_id === providerId) };
      });
      sendLocalWebJson(response, 200, result);
    } else if (request.method === "DELETE" && providerId && !match[2]) {
      const removed = await withCatalog({ homeDirectory }, (catalog) => catalog.models.remove(providerId));
      sendLocalWebJson(response, 200, { removed });
    } else sendLocalWebJson(response, 405, { error: "不支持的模型设置操作" });
  } catch (error) {
    sendLocalWebJson(response, 400, { error: error instanceof Error ? error.message : "模型设置操作失败" });
  }
  return true;
}
