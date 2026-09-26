import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, type BoundActionClient, type SubjectOffersInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody } from "./web-http.js";
import { parseSceneFunctionKey } from "./functions-host.js";
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
      const code = error instanceof ActionError ? error.code : "actions.failed";
      sendJson(response, !(error instanceof ActionError) ? 500 : code === "actions.forbidden" ? 403 : code.startsWith("actions.event_") ? 409 : 400,
        { code, error: error instanceof ActionError ? error.message : "暂时无法读取事项，请重新载入" });
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
      const code = error instanceof ActionError ? error.code : "actions.failed";
      sendJson(response, !(error instanceof ActionError) ? 500 : code === "actions.forbidden" ? 403 : code.startsWith("actions.offer_") ? 409 : 400,
        { code, error: error instanceof ActionError ? error.message : "暂时无法取得动作结果，请先检查事项状态" });
    }
    return true;
  }
  if (url.pathname === "/api/home/talk/prepare" && request.method === "POST") {
    try {
      const body = await readBody(request);
      sendJson(response, 200, await options.actions.invoke(homeActions.prepareTalk, body as { subject: { kind: string; id: string } }));
    } catch (error) {
      sendJson(response, error instanceof ActionError && error.code === "actions.forbidden" ? 403 : 400,
        { error: error instanceof Error ? error.message : "无法准备此事项", ...(error instanceof ActionError ? { code: error.code } : {}) });
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
    sendJson(response, error instanceof ActionError && error.code === "actions.forbidden" ? 403 : 400,
      { error: error instanceof Error ? error.message : String(error), ...(error instanceof ActionError ? { code: error.code } : {}) });
  }
  return true;
}
