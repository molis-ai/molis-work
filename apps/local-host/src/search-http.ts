import type { IncomingMessage, ServerResponse } from "node:http";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { searchActions, type SearchOpenRequest, type SearchQueryRequest, type SearchScope } from "@molis-ai/molis-work-contracts/services/search";
import { readLocalWebBody as readBody, sendLocalWebJson as sendJson } from "./web-http.js";

/** Workbench transport for the system search; the bound client carries the local person's own authority and project. */
export async function handleSearchHttp(request: IncomingMessage, response: ServerResponse, url: URL, actions: () => BoundActionClient): Promise<boolean> {
  const routes: Record<string, "query" | "open" | "status"> = { "/api/search/query": "query", "/api/search/open": "open", "/api/search/status": "status" };
  const route = routes[url.pathname];
  if (!route) return false;
  if (request.method !== (route === "status" ? "GET" : "POST")) { sendJson(response, 405, { error: "请求方法不受支持" }); return true; }
  try {
    const client = actions();
    if (route === "status") {
      const scope = url.searchParams.get("scope");
      sendJson(response, 200, await client.invoke(searchActions.status, scope ? { scope: scope as SearchScope } : {}));
    } else if (route === "open") {
      sendJson(response, 200, await client.invoke(searchActions.open, await readBody(request) as unknown as SearchOpenRequest));
    } else {
      sendJson(response, 200, await client.invoke(searchActions.query, await readBody(request) as unknown as SearchQueryRequest));
    }
  } catch (error) {
    const failure = actionErrorResponse(error);
    sendJson(response, failure.status, failure.body);
  }
  return true;
}
