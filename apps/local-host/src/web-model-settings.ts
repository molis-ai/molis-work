import type { IncomingMessage, ServerResponse } from "node:http";
import type { ModelApiFormat, ModelPromptCacheMode, ModelRecord, ModelThinkingMode } from "@molis-ai/molis-work-contracts/modules/model-providers";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { testConfiguredModel } from "./model-provider-test.js";
import { commitModelProvider, modelCheckProblem, modelSetupOffer, planConnectionCheck, removeModelProvider, verifyModelConnection, type ModelProviderSave } from "./model-provider-setup.js";
import { fetchModelsForSettings, modelListKey, readModelListBody } from "./model-provider-list.js";
import { modelCheckReason, modelCheckTarget, rememberModelCheck, withModelChecks } from "./model-provider-checks.js";

/** Global settings reuse the catalog's configuration and Host-owned secret store. */
export async function handleModelSettingsHttp(
  request: IncomingMessage, response: ServerResponse, url: URL,
  withCatalog: LocalWebCatalogRunner, homeDirectory?: string,
): Promise<boolean> {
  const match = url.pathname.match(/^\/api\/settings\/models(?:\/([a-z0-9-]+)(\/test|\/models)?)?$/);
  if (!match) return false;
  try {
    const providerId = match[1];
    if (request.method === "GET" && !providerId) {
      const read = await withCatalog({ homeDirectory }, (catalog) => ({
        providers: catalog.models.list(), health: catalog.models.health(),
      }));
      // Each provider's last real check comes with it, so the page can tell "never verified" from "verified" (PF-A04).
      const listed = { ...read, health: withModelChecks(homeDirectory, read.providers, read.health) };
      if (url.searchParams.get("setup") !== "1") sendLocalWebJson(response, 200, listed);
      else {
        const offer = modelSetupOffer(url.searchParams.get("template"));
        sendLocalWebJson(response, 200, { ...listed, templates: offer.templates, ...(offer.draft ? { draft: offer.draft } : {}) });
      }
    } else if (request.method === "POST" && providerId && match[2] === "/models") {
      // The models the service offers, to pick from (§13.2). Nothing is stored; the key is resolved inside the catalog,
      // the request waits on the network outside it.
      const form = readModelListBody(await readLocalWebBody(request));
      const ask = await withCatalog({ homeDirectory }, (catalog) => modelListKey(catalog, homeDirectory, providerId, form));
      const closed = new AbortController();
      response.once("close", () => { if (!response.writableFinished) closed.abort(); });
      sendLocalWebJson(response, 200, { models: await fetchModelsForSettings(ask, closed.signal) });
    } else if (request.method === "POST" && providerId && match[2] === "/test") {
      const body = await readLocalWebBody(request);
      const selection = await withCatalog({ homeDirectory }, (catalog) => catalog.models.resolveConfiguration({
        provider_id: providerId, model_id: typeof body.model_id === "string" ? body.model_id : "",
      }));
      if (!selection) throw new Error("请先保存供应商、密钥和启用的模型");
      const target = homeDirectory ? modelCheckTarget(homeDirectory, selection.provider) : undefined;
      let result: Awaited<ReturnType<typeof testConfiguredModel>>;
      try { result = await testConfiguredModel(selection); }
      catch (error) {
        const raw = error instanceof Error ? error.message : "";
        if (homeDirectory) rememberModelCheck(homeDirectory, selection.provider, target, "failed", modelCheckReason(raw));
        // The person reads the same reason a save would give, not the provider's raw error (PF-A04).
        throw new Error(modelCheckProblem(raw));
      }
      if (homeDirectory) rememberModelCheck(homeDirectory, selection.provider, target, "connected");
      sendLocalWebJson(response, 200, result);
    } else if (request.method === "POST" && providerId && !match[2]) {
      const body = await readLocalWebBody(request);
      if (typeof body.display_name !== "string" || typeof body.base_url !== "string"
        || !["anthropic-messages", "openai-chat-completions"].includes(String(body.api_format))
        || typeof body.enabled !== "boolean" || !Array.isArray(body.models)
        || !["off", "best-effort", "required"].includes(String(body.prompt_cache))
        || (body.thinking !== undefined && !["off", "adaptive"].includes(String(body.thinking)))
        || (body.connection_id !== undefined && typeof body.connection_id !== "string")
        || (body.check_connection !== undefined && typeof body.check_connection !== "boolean")
        || (body.api_key !== undefined && typeof body.api_key !== "string")) throw new Error("供应商配置格式无效");
      const models: ModelRecord[] = body.models.map((entry: unknown) => {
        if (!entry || typeof entry !== "object" || !("model_id" in entry) || typeof entry.model_id !== "string"
          || !("enabled" in entry) || typeof entry.enabled !== "boolean") throw new Error("模型配置格式无效");
        if (("display_name" in entry && typeof entry.display_name !== "string")
          || ("context_tokens" in entry && typeof entry.context_tokens !== "number")
          || ("vision" in entry && typeof entry.vision !== "boolean")
          || ("reasoning_effort" in entry && typeof entry.reasoning_effort !== "boolean")) throw new Error("模型元数据格式无效");
        return { model_id: entry.model_id.trim(), enabled: entry.enabled,
          ...("display_name" in entry ? { display_name: entry.display_name as string } : {}),
          ...("context_tokens" in entry ? { context_tokens: entry.context_tokens as number } : {}),
          ...("vision" in entry ? { vision: entry.vision as boolean } : {}),
          ...("reasoning_effort" in entry && entry.reasoning_effort === true ? { reasoning_effort: true } : {}),
        };
      });
      const save: ModelProviderSave = {
        provider_id: providerId, api_key: typeof body.api_key === "string" ? body.api_key.trim() : "",
        connection_id: typeof body.connection_id === "string" ? body.connection_id.trim() : "",
        check_connection: body.check_connection === true,
        input: {
          provider_id: providerId, display_name: body.display_name as string, base_url: body.base_url as string,
          api_format: body.api_format as ModelApiFormat, enabled: body.enabled as boolean,
          prompt_cache: body.prompt_cache as ModelPromptCacheMode, models,
          ...(body.thinking === undefined ? {} : { thinking: body.thinking as ModelThinkingMode }),
        },
      };
      // Refused before a key becomes a connection, and checked before anything is written: a rejected form or a
      // failed check leaves nothing behind. The check waits on the network outside the catalog.
      const selection = await withCatalog({ homeDirectory }, (catalog) => planConnectionCheck(catalog, homeDirectory, save));
      if (selection) await verifyModelConnection(selection);
      const result = await withCatalog({ homeDirectory }, (catalog) => commitModelProvider(catalog, homeDirectory, save));
      // The check passed for exactly what was just written: remember it against that version of the provider and its key.
      // The commit has just written the key's connection; its version is read right after, with nothing awaited in between.
      if (selection && homeDirectory) rememberModelCheck(homeDirectory, result.provider, modelCheckTarget(homeDirectory, result.provider), "connected");
      const [health] = result.health ? withModelChecks(homeDirectory, [result.provider], [result.health]) : [];
      sendLocalWebJson(response, 200, { ...result, ...(health ? { health } : {}), checked: selection !== null });
    } else if (request.method === "DELETE" && providerId && !match[2]) {
      sendLocalWebJson(response, 200, await withCatalog({ homeDirectory }, (catalog) => removeModelProvider(catalog, homeDirectory, providerId)));
    } else sendLocalWebJson(response, 405, { error: "不支持的模型设置操作" });
  } catch (error) {
    // A failed check says why with its `model_provider.*` code: the page puts a refused key under its field and a rate limit with
    // when it checks again. Other refusals carry their words only.
    const code = error instanceof ActionError && error.code.startsWith("model_provider.") ? { code: error.code } : {};
    sendLocalWebJson(response, 400, { error: error instanceof Error ? error.message : "模型设置操作失败", ...code });
  }
  return true;
}
