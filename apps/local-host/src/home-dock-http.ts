import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, type BoundActionClient, type SubjectOffersInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody } from "./web-http.js";
import { parseSceneFunctionKey } from "./judgment-rules-host.js";
import { homeActions } from "./home-actions.js";
import type { HomeOfferExecutionInput } from "./home-offer-actions.js";
import type { HomeEventOpenInput } from "./home-event-actions.js";
import type { HomeEventWindow } from "@molis-ai/molis-work-contracts/platform/actions";

export interface HomeDockHttpOptions { actions: BoundActionClient; invalidateWebView(): void }

/** Retains the public URL; configuration and discovery use the same system actions as other callers. */
export async function handleHomeDockJudgmentHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  options: HomeDockHttpOptions): Promise<boolean> {
  if (["/api/home/events", "/api/home/events/open"].includes(url.pathname) && request.method === "POST") {
    try {
      const body: unknown = await readBody(request);
      sendJson(response, 200, url.pathname.endsWith("/open") ? await options.actions.invoke(homeActions.openEvent, body as HomeEventOpenInput)
        : await options.actions.invoke(homeActions.events, body as HomeEventWindow));
    } catch (error) {
      const failure = actionErrorResponse(error);
      sendJson(response, failure.status, failure.body);
    }
    return true;
  }
  if (["/api/home/actions/choices", "/api/home/actions/prepare", "/api/home/actions/execute"].includes(url.pathname) && request.method === "POST") {
    try {
      const body: unknown = await readBody(request);
      const result = url.pathname.endsWith("/choices") ? await options.actions.invoke(homeActions.choices, body as { subject_kind?: string }) : url.pathname.endsWith("/execute")
        ? await options.actions.invoke(homeActions.execute, body as HomeOfferExecutionInput)
        : await options.actions.invoke(homeActions.offers, body as SubjectOffersInput);
      if (url.pathname.endsWith("/execute")) options.invalidateWebView();
      sendJson(response, 200, result);
    } catch (error) {
      const failure = actionErrorResponse(error);
      sendJson(response, failure.status, failure.body);
    }
    return true;
  }
  if (url.pathname !== "/api/home/dock-judgment" || !["GET", "POST"].includes(request.method ?? "")) return false;
  try {
    if (request.method === "POST") {
      const functionKey = parseSceneFunctionKey(await readBody(request));
      if (functionKey === undefined) throw new ActionError("actions.input_invalid", "请选择已发布函数，或留空");
      await options.actions.invoke(homeActions.writeJudgment, { function_key: functionKey });
      options.invalidateWebView();
    }
    sendJson(response, 200, await options.actions.invoke(homeActions.readJudgment, {}));
  } catch (error) {
    const failure = actionErrorResponse(error);
    sendJson(response, failure.status, failure.body);
  }
  return true;
}
