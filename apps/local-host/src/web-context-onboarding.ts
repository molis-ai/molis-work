import type { IncomingMessage, ServerResponse } from "node:http";
import { readNativePluginJsonBody } from "./native-plugin-http.js";
import { sendLocalWebJson as json } from "./web-http.js";
import { listConnectorConnectionViews } from "./connector-connection-views.js";
import { connectorLoginReady } from "./connector-directory.js";
import { withContextJourneys } from "./context-onboarding-store.js";
import { codeRoot } from "./context-onboarding-sources.js";
import { contextReferenceText, contextModel, readContextJourney, type ContextOnboardingPorts } from "./context-onboarding-service.js";
import { contextOnboardingActions as actions, contextOnboardingDoor as door, type ContextOnboardingEntry } from "./context-onboarding-actions.js";
import type { MolisWorkLocalHost } from "./project-host.js";

/** Reads stay HTTP; each write is the person's call of its `onboarding.context.*` action through the page's door (B9). */
export function createContextOnboardingHttp(ports: ContextOnboardingPorts, host: MolisWorkLocalHost) {
  return async (req: IncomingMessage, res: ServerResponse, url: URL, home: string): Promise<boolean> => {
    const as = (entry: Partial<ContextOnboardingEntry> = {}) => ({ host, request: req, entry: { home, ports, ...entry } });
    const prefix = "/api/onboarding/context";
    if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) return false;
    try {
      if (req.method === "GET" && url.pathname === prefix) {
        const model = await contextModel(home, ports);
        json(res, 200, { gmail_configured: await connectorLoginReady(home, "gmail"), connections: listConnectorConnectionViews(home, "gmail").filter(row => row.auth_method === "oauth" || row.auth_method === "token"), model: model.runtimeLabel ?? null, ai_available: Boolean(model.completeText), resume: withContextJourneys(home, store => store.latestIncomplete()) }); return true;
      }
      if (req.method === "POST" && url.pathname === prefix) {
        const input = await readNativePluginJsonBody(req);
        json(res, 201, await door.invoke(as(), actions.create.definition, { id: String(input.id ?? "") })); return true;
      }
      const match = url.pathname.match(/^\/api\/onboarding\/context\/([a-z0-9-]+)(?:\/(selection|start|adopt|draft|reopen|files)|\/text\/([0-9a-f]{64}))?$/u);
      if (!match) { json(res, 404, { error: "找不到这项整理操作" }); return true; }
      const id = match[1]!;
      // One chosen file per request, as the raw body (no size limit, user 2026-10-22); the selection names it by the digest returned.
      if (req.method === "POST" && match[2] === "files") json(res, 201, await door.invoke(as({ body: req }), actions.stageFile.definition, { journey: id, path: url.searchParams.get("path") }));
      else if (req.method === "GET" && match[3]) { const text = await contextReferenceText(home, id, match[3]); json(res, 200, { text: text.slice(0, 200_000), chars: text.length }); }
      else if (req.method === "GET" && !match[2]) {
        // The plugins that declare they take a code folder, by name, only while this round has one to hand over (batch12-design §7.3).
        const journey = readContextJourney(home, id);
        json(res, 200, { ...journey, takers: codeRoot(journey) ? (ports.takers?.() ?? []).map(({ plugin_id, name }) => ({ plugin_id, name })) : [] });
      }
      else if (req.method === "POST" && match[2] === "reopen") json(res, 200, await door.invoke(as(), actions.reopen.definition, { journey: id }));
      else if (req.method === "POST" && match[2] === "selection") json(res, 200, await door.invoke(as(), actions.select.definition, { journey: id, body: await readNativePluginJsonBody(req, 72_000_000) }));
      else if (req.method === "POST" && match[2] === "start") json(res, 202, await door.invoke(as(), actions.start.definition, { journey: id }));
      else if (req.method === "POST" && match[2] === "draft") json(res, 200, await door.invoke(as(), actions.draft.definition, { journey: id, body: await readNativePluginJsonBody(req) }));
      else if (req.method === "POST" && match[2] === "adopt") json(res, 200, await door.invoke(as(), actions.adopt.definition, { journey: id, body: await readNativePluginJsonBody(req) }));
      else json(res, 405, { error: "不支持这项整理操作" });
    } catch (error) { json(res, 400, { error: error instanceof Error ? error.message : "整理请求失败，请重试" }); }
    return true;
  };
}
