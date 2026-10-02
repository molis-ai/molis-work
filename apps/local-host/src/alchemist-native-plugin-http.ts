import type { IncomingMessage, ServerResponse } from "node:http";
import { once } from "node:events";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { createAlchemistHttpApp, type AlchemistActionInvoker } from "@molis-ai/molis-work-plugin-alchemist";
import { readNativePluginJsonBody, writeNativePluginJsonResponse } from "./native-plugin-http.js";

export interface AlchemistHostPorts {
  projectId: string;
  routePrefix: string;
  actions: AlchemistActionInvoker;
}

/** The outer Host verifies origin/control token; all business calls go through its trusted Kernel client. */
export async function handleAlchemistNativePluginHttp(
  request: IncomingMessage, response: ServerResponse, url: URL, ports: AlchemistHostPorts,
): Promise<boolean> {
  if (url.pathname !== "/api/alchemist" && !url.pathname.startsWith("/api/alchemist/")) return false;
  try {
    if (!ports.projectId.trim()) throw new ActionError("actions.project_required", "请先打开一个项目，再使用炼金术士。");
    const requestedProject = url.searchParams.get("project_id");
    if (requestedProject && requestedProject !== ports.projectId) throw new ActionError("actions.scope_mismatch", "请求与当前项目不一致。");
    const base = "/api/alchemist/studio";
    const abort = new AbortController();
    response.once("close", () => abort.abort());
    if (url.pathname.startsWith(base + "/api/")) {
      const method = request.method ?? "GET";
      const body = ["GET", "HEAD"].includes(method) ? undefined : await readNativePluginJsonBody(request);
      if (body?.project_id !== undefined && body.project_id !== ports.projectId) throw new ActionError("actions.scope_mismatch", "请求与当前项目不一致。");
      const innerUrl = new URL(url.pathname.slice(base.length) + url.search, "http://alchemist.local");
      const result = await createAlchemistHttpApp(undefined, ports.actions).fetch(new Request(innerUrl, { method,
        headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: abort.signal }));
      response.writeHead(result.status, { ...Object.fromEntries(result.headers.entries()), "cache-control": "no-store" });
      if (result.body) {
        const reader = result.body.getReader();
        try {
          while (!response.destroyed) {
            const next = await reader.read(); if (next.done) break;
            if (!response.write(next.value)) await once(response, "drain", { signal: abort.signal });
          }
        } finally { await reader.cancel().catch(() => undefined); }
      }
      response.end(); return true;
    }
    writeNativePluginJsonResponse(response, { status: 404, body: { error: "没有这个炼金术士页面。" } }); return true;
  } catch (error) {
    if (response.headersSent) { response.destroy(); return true; }
    const code = error instanceof ActionError ? error.code : "alchemist.request_failed";
    writeNativePluginJsonResponse(response, { status: code === "alchemist.not_found" ? 404 : code === "actions.forbidden" ? 403 : 400,
      body: { code, error: error instanceof Error ? error.message : "炼金术士请求失败" } }); return true;
  }
}
