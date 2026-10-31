import type { IncomingMessage, ServerResponse } from "node:http";
import { readNativePluginJsonBody } from "./native-plugin-http.js";
import { sendLocalWebJson as json } from "./web-http.js";
import { listConnectorConnectionViews } from "./connector-connection-views.js";
import { connectorLoginReady } from "./connector-directory.js";
import { withContextJourneys } from "./context-onboarding-store.js";
import { adoptContextJourney, contextReferenceText, stageContextFile, updateContextDraft, contextModel, readContextJourney, reopenContextJourney, selectContextSources, startContextJourney, type ContextOnboardingPorts } from "./context-onboarding-service.js";

export function createContextOnboardingHttp(ports: ContextOnboardingPorts) {
  return async (req: IncomingMessage, res: ServerResponse, url: URL, home: string): Promise<boolean> => {
    const prefix = "/api/onboarding/context";
    if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) return false;
    try {
      if (req.method === "GET" && url.pathname === prefix) {
        const model = await contextModel(home, ports);
        json(res, 200, { gmail_configured: await connectorLoginReady(home, "gmail"), connections: listConnectorConnectionViews(home, "gmail").filter(row => row.auth_method === "oauth" || row.auth_method === "token"), model: model.runtimeLabel ?? null, ai_available: Boolean(model.completeText), resume: withContextJourneys(home, store => store.latestIncomplete()) }); return true;
      }
      if (req.method === "POST" && url.pathname === prefix) {
        const input = await readNativePluginJsonBody(req);
        json(res, 201, withContextJourneys(home, store => store.create(String(input.id ?? "")))); return true;
      }
      const match = url.pathname.match(/^\/api\/onboarding\/context\/([a-z0-9-]+)(?:\/(selection|start|adopt|draft|reopen|files)|\/text\/([0-9a-f]{64}))?$/u);
      if (!match) { json(res, 404, { error: "找不到这项整理操作" }); return true; }
      const id = match[1]!;
      // One chosen file per request, as the raw body (no size limit, user 2026-10-22); the selection names it by the digest returned.
      if (req.method === "POST" && match[2] === "files") json(res, 201, await stageContextFile(home, id, url.searchParams.get("path"), req));
      else if (req.method === "GET" && match[3]) { const text = await contextReferenceText(home, id, match[3]); json(res, 200, { text: text.slice(0, 200_000), chars: text.length }); }
      else if (req.method === "GET" && !match[2]) json(res, 200, readContextJourney(home, id));
      else if (req.method === "POST" && match[2] === "reopen") json(res, 200, reopenContextJourney(home, id));
      else if (req.method === "POST" && match[2] === "selection") json(res, 200, selectContextSources(home, id, await readNativePluginJsonBody(req, 72_000_000)));
      else if (req.method === "POST" && match[2] === "start") json(res, 202, startContextJourney(home, id, ports));
      else if (req.method === "POST" && match[2] === "draft") json(res, 200, updateContextDraft(home, id, await readNativePluginJsonBody(req)));
      else if (req.method === "POST" && match[2] === "adopt") json(res, 200, await adoptContextJourney(home, id, await readNativePluginJsonBody(req), ports));
      else json(res, 405, { error: "不支持这项整理操作" });
    } catch (error) { json(res, 400, { error: error instanceof Error ? error.message : "整理请求失败，请重试" }); }
    return true;
  };
}
