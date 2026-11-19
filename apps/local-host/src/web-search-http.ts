import type { IncomingMessage, ServerResponse } from "node:http";
import type { WebSearchSettingsView } from "@molis-ai/molis-work-contracts/services/web-search";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { readLocalWebBody, sendLocalWebJson as sendJson } from "./web-http.js";
import { webSearchActions } from "./web-search-actions.js";

/**
 * 设置 › 网页搜索 (specs/assistant-service-connections §13.7 ②B): the page's facts and its one change, both through the actions as the
 * person — `connectors.web_search.sources@1` to draw it, `connectors.web_search.default.set@1` to pick another default. The page names
 * only the source; which sources there are and whether one can be the default is the action's to say.
 */
const DEFAULT_PATH = "/api/settings/web-search/default";

export async function webSearchSettingsView(host: MolisWorkLocalHost): Promise<WebSearchSettingsView | undefined> {
  return await bindLocalWebActions(host, undefined, LOCAL_OWNER_PERMISSIONS).invoke(webSearchActions.sources, {}) as WebSearchSettingsView;
}

export async function handleWebSearchSettingsHttp(request: IncomingMessage, response: ServerResponse, url: URL, host: MolisWorkLocalHost): Promise<boolean> {
  if (url.pathname !== DEFAULT_PATH) return false;
  if (request.method !== "POST") { sendJson(response, 405, { error: "不支持的操作" }); return true; }
  if ([...url.searchParams.keys()].length) { sendJson(response, 400, { error: "请求参数无效" }); return true; }
  try {
    const body: unknown = await readLocalWebBody(request, 1_024);
    // The name is checked here: a name the action does not take would otherwise be dropped. The action checks the value.
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).join() !== "source_id") { sendJson(response, 400, { error: "请求内容无效" }); return true; }
    sendJson(response, 200, await bindLocalWebActions(host, undefined, LOCAL_OWNER_PERMISSIONS).invoke(webSearchActions.set_default, body));
  } catch (error) { const failure = actionErrorResponse(error); sendJson(response, failure.status, failure.body); }
  return true;
}
