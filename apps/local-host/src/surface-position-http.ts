import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { actionErrorResponse, isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { pluginPageRequest } from "./plugin-page-authority.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";
import { projectRoutePrefix, type ProjectRequestContext } from "./web-project-context.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { positionOfferIntent, takePositionOffer, withPositionOfferWindow } from "./surface-position-offers.js";
import { positionCorrection, positionRecovery } from "./surface-position-correction.js";

export function surfaceClick(input: unknown) {
  if (input === undefined) return null;
  if (!isRecord(input) || Object.keys(input).length !== 2 || typeof input.owner_plugin_id !== "string" || !isRecord(input.target))
    throw new ActionError("actions.input_invalid", "对象操作请求无效");
  return { owner: input.owner_plugin_id, target: input.target };
}

export function positionOfferScope(project: string, ...place: string[]) {
  return JSON.stringify([LOCAL_PERSON_ACTOR_ID, project, ...place]);
}

export function confirmPositionOffer(host: MolisWorkLocalHost, reference: LocalHostProjectReference, signal: AbortSignal,
  current: (() => void) | undefined, claimed: NonNullable<ReturnType<typeof takePositionOffer>>, response: ServerResponse) {
  const { window, confirm } = claimed;
  return host.surfaceOperation(reference, AbortSignal.any([signal, window.signal]), current, async context => {
    const receipt = await confirm(context);
    sendLocalWebJson(response, 200, receipt);
    return true;
  });
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
    if (Object.keys(body).length > 1 || Object.keys(body).some(key => !["click", "count", "offer", "correct", "recovery"].includes(key))
      || body.count !== undefined && body.count !== true)
      throw new ActionError("actions.input_invalid", "等你请求无效");
    const click = surfaceClick(body.click), correction = positionCorrection(body.correct), intent = positionOfferIntent(body.offer), recovery = positionRecovery(body.recovery);
    const scope = positionOfferScope(hostReference.project_id, "attention");
    if (intent) {
      const claimed = takePositionOffer(scope, intent);
      if (!claimed) { sendLocalWebJson(response, 200, { closed: true }); return true; }
      try { return await confirmPositionOffer(localHost, hostReference, signal, undefined, claimed, response); }
      finally { claimed.window.close(); }
    }
    return withPositionOfferWindow(scope, click?.target.kind === "peek", window =>
      localHost.surfacePosition(hostReference, { slot: { kind: "attention" } }, projectRoutePrefix(options), signal, undefined, async position => {
        const value = correction ? await position.correct(correction) : click ? await position.open(click.owner, click.target, 0, window && { window })
          : body.count ? position.count() : await position.display(recovery);
        position.current();
        sendLocalWebJson(response, 200, value);
        return true;
      }, undefined, window));
  });
}
