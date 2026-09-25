import type { IncomingMessage, ServerResponse } from "node:http";
import type { ModelApiFormat, ModelPromptCacheMode, ModelRecord, ModelThinkingMode } from "@molis-ai/molis-work-contracts/modules/model-providers";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { testConfiguredModel } from "./model-provider-test.js";

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
        const provider = catalog.models.upsert({
          provider_id: providerId, display_name: body.display_name as string, base_url: body.base_url as string,
          api_format: body.api_format as ModelApiFormat, enabled: body.enabled as boolean,
          prompt_cache: body.prompt_cache as ModelPromptCacheMode, models,
          ...(body.thinking === undefined ? {} : { thinking: body.thinking as ModelThinkingMode }),
        });
        if (typeof body.api_key === "string" && body.api_key.trim()) catalog.models.setCredential(providerId, body.api_key);
        return { provider, health: catalog.models.health().find((entry) => entry.provider_id === providerId) };
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
