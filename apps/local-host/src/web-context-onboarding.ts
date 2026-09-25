import type { IncomingMessage, ServerResponse } from "node:http";
import { readNativePluginJsonBody } from "./native-plugin-http.js";
import { sendLocalWebJson as json } from "./web-http.js";
import { listConnectorConnectionViews } from "./web-connector-connections.js";
import { gmailOAuthConfigured } from "./gmail-oauth.js";
import { withContextJourneys } from "./context-onboarding-store.js";
import { adoptContextJourney, updateContextDraft, contextModel, readContextJourney, reopenContextJourney, selectContextSources, startContextJourney, type ContextOnboardingPorts } from "./context-onboarding-service.js";

export function createContextOnboardingHttp(ports: ContextOnboardingPorts) {
  return async (req: IncomingMessage, res: ServerResponse, url: URL, home: string): Promise<boolean> => {
    const prefix = "/api/onboarding/context";
    if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) return false;
    try {
      if (req.method === "GET" && url.pathname === prefix) {
        const model = await contextModel(home, ports);
        json(res, 200, { gmail_configured: gmailOAuthConfigured(), connections: listConnectorConnectionViews(home, "gmail"), model: model.runtimeLabel ?? null, ai_available: Boolean(model.completeText), resume: withContextJourneys(home, store => store.latestIncomplete()) }); return true;
      }
      if (req.method === "POST" && url.pathname === prefix) {
        const input = await readNativePluginJsonBody(req);
        json(res, 201, withContextJourneys(home, store => store.create(String(input.id ?? "")))); return true;
      }
      const match = url.pathname.match(/^\/api\/onboarding\/context\/([a-z0-9-]+)(?:\/(selection|start|adopt|draft|reopen))?$/u);
      if (!match) { json(res, 404, { error: "找不到这项整理操作" }); return true; }
      const id = match[1]!;
      if (req.method === "GET" && !match[2]) json(res, 200, readContextJourney(home, id));
      else if (req.method === "POST" && match[2] === "reopen") json(res, 200, reopenContextJourney(home, id));
      else if (req.method === "POST" && match[2] === "selection") json(res, 200, selectContextSources(home, id, await readNativePluginJsonBody(req, 12_000_000)));
      else if (req.method === "POST" && match[2] === "start") json(res, 202, startContextJourney(home, id, ports));
      else if (req.method === "POST" && match[2] === "draft") json(res, 200, updateContextDraft(home, id, await readNativePluginJsonBody(req)));
      else if (req.method === "POST" && match[2] === "adopt") json(res, 200, await adoptContextJourney(home, id, await readNativePluginJsonBody(req), ports));
      else json(res, 405, { error: "不支持这项整理操作" });
    } catch (error) { json(res, 400, { error: error instanceof Error ? error.message : "整理请求失败，请重试" }); }
    return true;
  };
}
