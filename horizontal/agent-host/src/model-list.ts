import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { isLoopbackHttpUrl } from "@molis-ai/molis-work-contracts/platform/loopback";
import type { ModelApiFormat } from "@molis-ai/molis-work-contracts/modules/model-providers";

// Asking a model service which models it offers (spec assistant-service-connections §13.2, PF-A04): the settings page lists them to pick
// from instead of copying names by hand. It is not an inference call and Prologue has no such request, so it is built and sent here, by
// the one package that talks to model providers, to the same Base URL a Run uses and under the same rule (HTTPS, or HTTP on this
// machine). Which key may go to that address is the Host's decision, made before it calls. Nothing is kept: the list only feeds the picker.

export const modelListErrors = defineErrorCodes("agent.model_list", {
  invalid_url: "invalid", key_rejected: "forbidden", unsupported: "not_found", rate_limited: "rate_limited",
  provider_failed: "unavailable", unreachable: "unavailable", timeout: "timeout", response_invalid: "invalid",
});

/** Sends one GET and gives back the status and body. The default is `fetchModelList`; tests pass their own. */
export type ModelListSend = (request: { url: URL; headers: Readonly<Record<string, string>> }, signal: AbortSignal) => Promise<{ status: number; body: string }>;
export interface ListedModel { model_id: string; display_name?: string }

const MOST_MODELS = 500, TIMEOUT_MS = 15_000, MAX_BODY = 4 * 1024 * 1024;

/** The request a format's list takes: Anthropic's `/v1/models` beside `/v1/messages`, OpenAI's `/models` beside `/chat/completions`. */
export function modelListRequest(baseUrl: string, format: ModelApiFormat, apiKey: string): { url: URL; headers: Record<string, string> } {
  let endpoint: URL;
  try { endpoint = new URL(baseUrl); } catch { throw modelListErrors.invalid_url("Base URL 必须是完整地址"); }
  if ((endpoint.protocol !== "https:" && !isLoopbackHttpUrl(endpoint)) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw modelListErrors.invalid_url("Base URL 必须使用 HTTPS 或本机 HTTP，不能包含密码、查询参数或片段");
  }
  const base = endpoint.href.replace(/\/+$/u, "");
  return format === "anthropic-messages"
    ? { url: new URL(`${base}/v1/models?limit=1000`), headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", accept: "application/json" } }
    : { url: new URL(`${base}/models`), headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" } };
}

/** Reads `{ data: [{ id, display_name? }] }`, the shape both formats answer with; at most 500 models, each once, sorted by id. */
export function readModelList(body: string): ListedModel[] {
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { throw modelListErrors.response_invalid("服务的回答不是模型列表。检查 Base URL 和 API 格式有没有选对。"); }
  const data = parsed && typeof parsed === "object" && "data" in parsed && Array.isArray(parsed.data) ? parsed.data as unknown[] : null;
  if (!data) throw modelListErrors.response_invalid("服务的回答不是模型列表。检查 Base URL 和 API 格式有没有选对。");
  const models = new Map<string, ListedModel>();
  for (const entry of data) {
    if (!entry || typeof entry !== "object" || !("id" in entry) || typeof entry.id !== "string") continue;
    const id = entry.id.trim();
    if (!id || id.length > 200 || models.has(id)) continue;
    const name = "display_name" in entry && typeof entry.display_name === "string" ? entry.display_name.trim().slice(0, 200) : "";
    models.set(id, { model_id: id, ...(name && name !== id ? { display_name: name } : {}) });
  }
  return [...models.values()].sort((a, b) => a.model_id.localeCompare(b.model_id)).slice(0, MOST_MODELS);
}

/** One GET: no redirect followed (the key would go along), 15 seconds, at most 4 MiB read. */
export async function fetchModelList(request: { url: URL; headers: Readonly<Record<string, string>> }, signal: AbortSignal): Promise<{ status: number; body: string }> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  let response: Response;
  try { response = await fetch(request.url, { headers: request.headers, redirect: "manual", signal: AbortSignal.any([signal, timeout]) }); }
  catch (error) {
    if (signal.aborted) throw signal.reason;
    if (timeout.aborted) throw modelListErrors.timeout("一直没有等到回应。检查地址和网络后重试。");
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
    throw modelListErrors.unreachable(/ENOTFOUND|EAI_AGAIN/u.test(cause) ? "找不到这个地址的主机。检查 Base URL 有没有拼错，再看网络或代理。"
      : /ECONNREFUSED/u.test(cause) ? "连不上这个地址：对方没有在监听。检查 Base URL 和端口。" : "连不上这个地址。检查 Base URL、网络或代理。");
  }
  if (response.status < 200 || response.status >= 300 || !response.body) {
    await response.body?.cancel();
    return { status: response.status, body: "" };
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); throw modelListErrors.response_invalid("服务返回的模型列表太大了，请手填模型名"); }
      chunks.push(value);
    }
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (timeout.aborted) throw modelListErrors.timeout("一直没有等到回应。检查地址和网络后重试。");
    throw error;
  }
  return { status: response.status, body: Buffer.concat(chunks).toString("utf8") };
}

/** The models a service offers to this key. A refusal says why in words the page can show; the key is never in it. */
export async function listProviderModels(
  input: { base_url: string; api_format: ModelApiFormat; api_key: string },
  options: { signal?: AbortSignal; send?: ModelListSend } = {},
): Promise<ListedModel[]> {
  const request = modelListRequest(input.base_url, input.api_format, input.api_key);
  const answer = await (options.send ?? fetchModelList)(request, options.signal ?? new AbortController().signal);
  if (answer.status === 401 || answer.status === 403) throw modelListErrors.key_rejected(`服务拒绝了这个 API Key（${answer.status}）。检查 Key 有没有填对、是不是这个地址的 Key。`, { status: answer.status });
  if (answer.status === 404 || answer.status === 405) throw modelListErrors.unsupported("这个服务不提供模型列表，请手填模型名（看供应商文档）。");
  // The answer carries the status only, so a throttle and an exhausted account read the same (the 11-05 decision on 429).
  if (answer.status === 429) throw modelListErrors.rate_limited("服务说请求太多或额度用完了（429）。稍后再试，或看看账户额度。");
  if (answer.status < 200 || answer.status >= 300) throw modelListErrors.provider_failed(`服务没有给出模型列表（${answer.status}）。稍后再试，或手填模型名。`, { status: answer.status });
  return readModelList(answer.body);
}
