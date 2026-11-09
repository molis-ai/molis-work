import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse, isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { pluginPageRequest } from "./plugin-page-authority.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";
import { projectRoutePrefix, type ProjectRequestContext } from "./web-project-context.js";

export function surfaceClick(input: unknown) {
  if (input === undefined) return null;
  if (!isRecord(input) || Object.keys(input).length !== 2 || typeof input.owner_plugin_id !== "string" || !isRecord(input.target))
    throw new ActionError("actions.input_invalid", "对象操作请求无效");
  return { owner: input.owner_plugin_id, target: input.target };
}

export async function withSurfaceResponse(request: IncomingMessage, response: ServerResponse, use: (signal: AbortSignal) => Promise<boolean | null>) {
  const controller = new AbortController();
  const stop = () => { if (!response.writableEnded) controller.abort(new ActionError("actions.cancelled", "呈现请求已结束")); };
  response.once("close", stop);
  try {
    if (request.method !== "POST" || pluginPageRequest(request)) throw new ActionError("actions.forbidden", "这个位置只向工作台本人开放");
    if (response.destroyed || request.aborted) stop();
    controller.signal.throwIfAborted();
    if (!await use(controller.signal)) throw new ActionError("actions.unavailable", "项目还没有打开");
  } catch (error) {
    if (!response.destroyed) { const failure = actionErrorResponse(error); sendLocalWebJson(response, failure.status, failure.body); }
  } finally { response.off("close", stop); }
  return true;
}

const ATTENTION_PATH = "/api/host/surface-attention";
export function handleSurfaceAttentionHttp({ request, response, url, localHost, hostReference, options }: ProjectRequestContext) {
  if (url.pathname !== ATTENTION_PATH) return false;
  return withSurfaceResponse(request, response, async signal => {
    const body = await readLocalWebBody(request, 16_000);
    if (Object.keys(body).some(key => key !== "click" && key !== "count") || body.count !== undefined && body.count !== true || body.count && body.click !== undefined)
      throw new ActionError("actions.input_invalid", "等你请求无效");
    const click = surfaceClick(body.click);
    return localHost.surfacePosition(hostReference, { slot: { kind: "attention" } }, projectRoutePrefix(options), signal, undefined, async position => {
      const value = click ? await position.open(click.owner, click.target) : body.count ? { count: position.count() } : await position.display();
      position.current();
      sendLocalWebJson(response, 200, value);
      return true;
    });
  });
}
