import type { IncomingMessage, ServerResponse } from "node:http";
import { toUSVString } from "node:util";
import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginExecutionControl, PluginRouteResponse } from "@molis-ai/molis-work-contracts/platform/plugin";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import type { PluginPlatform } from "./plugin-platform.js";
import { sendLocalWebJson } from "./web-http.js";

const failures = defineErrorCodes("host", {
  request_body_too_large: "too_large", invalid_json: "invalid",
});

/** The Web guard has already established the caller. JSON never supplies execution control. */
export async function dispatchPluginHttpRequest(
  request: IncomingMessage, response: ServerResponse, url: URL, platform: PluginPlatform,
  pluginId: string, actorId: string, prepare: (execution: PluginExecutionControl) => Promise<void>,
  finish?: (result: PluginRouteResponse) => Promise<void>,
): Promise<PluginRouteResponse | null> {
  const abort = new AbortController();
  const cancel = () => abort.abort(new ActionError("actions.cancelled", "请求已取消；不再保存迟到结果"));
  const closed = () => { if (!response.writableEnded) cancel(); };
  request.once("aborted", cancel); response.once("close", closed);
  try {
    if (request.aborted || response.destroyed) cancel();
    const instance = await platform.supervisor.ensureStarted(pluginId);
    const execution: PluginExecutionControl = { signal: abort.signal, async beforeEffect() {
      abort.signal.throwIfAborted();
      if (!instance?.active()) throw new ActionError("actions.forbidden", "插件已停用或重新启动；本次请求不再有效");
    } };
    await execution.beforeEffect();
    const router = platform.router(), method = request.method ?? "GET", match = router.match(method, url.pathname);
    if (!match) return null;
    const budget = platform.supervisor.manifest(pluginId)?.routes?.find(route => route.route_id === match.route_id)?.max_body_bytes;
    const body = ["GET", "HEAD"].includes(method) ? undefined : await readPluginHttpBody(request, abort.signal, budget);
    await execution.beforeEffect();
    await prepare(execution);
    const result = await router.dispatch({ method, pathname: url.pathname, actor_id: actorId,
      query: Object.fromEntries(url.searchParams), body, execution });
    await platform.wiring.drain();
    await execution.beforeEffect();
    if (result) await finish?.(result);
    await execution.beforeEffect();
    return result;
  } catch (error) {
    return actionErrorResponse(error);
  } finally {
    request.off("aborted", cancel); response.off("close", closed);
    abort.abort(new ActionError("actions.cancelled", "本次插件请求已结束"));
  }
}

/** Retain at most the declared bytes. Rejection drains transport without dispatching a partial body. */
export function readPluginHttpBody(request: IncomingMessage, signal: AbortSignal, budget = 256_000): Promise<unknown> {
  const limit = Math.min(budget, 14 * 1024 * 1024);
  return new Promise((resolve, reject) => {
    let chunks: Buffer[] = [], size = 0, done = false;
    const finish = (error?: unknown) => {
      if (done) return; done = true;
      request.off("data", data); request.off("end", end); request.off("error", failed); request.off("aborted", aborted);
      signal.removeEventListener("abort", aborted);
      if (error) { chunks = []; request.resume(); reject(error); return; }
      try {
        const raw = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
        chunks = []; resolve(raw ? JSON.parse(raw) : {});
      } catch { reject(failures.invalid_json("请求不是有效 JSON")); }
    };
    const data = (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > limit) { finish(failures.request_body_too_large("请求内容超过此操作允许的大小")); return; }
      chunks.push(bytes);
    };
    const end = () => finish();
    const failed = (error: Error) => finish(error);
    const aborted = () => finish(signal.reason ?? new ActionError("actions.cancelled", "读取请求已取消"));
    request.on("data", data); request.once("end", end); request.once("error", failed); request.once("aborted", aborted);
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted || request.aborted) aborted();
  });
}

/** Keep the declared binary response intact rather than JSON-encoding its bytes. */
export function sendPluginHttpResponse(response: ServerResponse, result: PluginRouteResponse): void {
  if (response.destroyed || response.writableEnded) return;
  for (const [name, value] of Object.entries(result.headers ?? {})) response.setHeader(name, value);
  response.setHeader("x-content-type-options", "nosniff");
  if (result.bytes === undefined) { sendLocalWebJson(response, result.status, result.body); return; }
  response.setHeader("content-type", result.mime ?? "application/octet-stream");
  response.setHeader("content-length", result.bytes.byteLength);
  if (!response.hasHeader("cache-control")) response.setHeader("cache-control", "no-store");
  if (result.filename && !response.hasHeader("content-disposition")) {
    const name = encodeURIComponent(toUSVString(result.filename)).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    response.setHeader("content-disposition", `attachment; filename*=UTF-8''${name}`);
  }
  response.writeHead(result.status); response.end(result.bytes);
}
