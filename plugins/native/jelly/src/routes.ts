import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { jellyActions } from "./actions.js";
import { jellyCommandActions } from "./command-actions.js";
import { jellyServiceActions } from "./service-actions.js";
import { JellyError } from "./error.js";
export interface JellyRouteRequest { method: "GET" | "POST"; pathname: string; query: URLSearchParams; body: Record<string, unknown> }
export interface JellyRouteResponse { status: number; body: unknown }
export const JELLY_NATIVE_PLUGIN_ROUTES = [
  ["GET", "/api/jelly"], ["GET", "/api/jelly/calendar"], ["GET", "/api/jelly/progress"], ["GET", "/api/jelly/export"],
  ["POST", "/api/jelly/commands"], ["POST", "/api/jelly/preview"], ["POST", "/api/jelly/ai"],
  ["POST", "/api/jelly/material"], ["POST", "/api/jelly/material/reread"], ["POST", "/api/jelly/source"],
  ["GET", "/api/jelly/model-settings"], ["POST", "/api/jelly/model-settings"],
] as const;
/** Historical URL and response shapes; all business work goes through the bound Host. */
export class JellyPluginRouteTable {
  constructor(private readonly actions: BoundActionClient) {}
  async handle(request: JellyRouteRequest): Promise<JellyRouteResponse | null> {
    const { pathname, method, body, query } = request;
    const ok = (data: unknown): JellyRouteResponse => ({ status: 200, body: data });
    if (method === "GET") {
      if (pathname === "/api/jelly") return ok(await this.actions.invoke(jellyActions.state, {}));
      if (pathname === "/api/jelly/export") return ok(await this.actions.invoke(jellyActions.export, {}));
      if (pathname === "/api/jelly/calendar") return ok({ occurrences: (await this.actions.invoke(jellyActions.calendar, { start: query.get("start") ?? "", end: query.get("end") ?? "" })).items });
      if (pathname === "/api/jelly/progress") return ok(await this.actions.invoke(jellyActions.progress, { start: query.get("start") ?? "", end: query.get("end") ?? "", today: query.get("today") ?? "", ...(query.has("category_id") ? { category_ids: query.getAll("category_id") } : {}) }));
      if (pathname === "/api/jelly/model-settings") return ok(await this.actions.invoke(jellyServiceActions.modelSettings, {}));
      const noteExport = /^\/api\/jelly\/notes\/([^/]+)\/export$/u.exec(pathname);
      if (noteExport) return ok(await this.actions.invoke(jellyActions.exportNote, { id: decodeURIComponent(noteExport[1]!), format: query.get("format") === "html" ? "html" : "markdown" }));
      return null;
    }
    if (pathname === "/api/jelly/commands") {
      if (!body.command || typeof body.command !== "object" || Array.isArray(body.command)) throw new JellyError("jelly.invalid", "缺少操作");
      const { type, ...fields } = body.command as Record<string, unknown>;
      if (typeof type !== "string" || !Object.hasOwn(jellyCommandActions, type)) throw new JellyError("jelly.invalid", "不支持的 Jelly 命令");
      return ok(await this.actions.invoke(jellyCommandActions[type as keyof typeof jellyCommandActions], { ...fields, expected_revision: body.expected_revision as number }));
    }
    if (pathname === "/api/jelly/preview") {
      if (body.kind === "delete-note") return ok(await this.actions.invoke(jellyActions.previewNoteDelete, { id: body.id as string }));
      if (body.kind === "delete-inspiration") return ok(await this.actions.invoke(jellyActions.previewInspirationDelete, { id: body.id as string }));
      if (body.kind === "import") return ok(await this.actions.invoke(jellyActions.previewImport, { source: body.source }));
      throw new JellyError("jelly.invalid", "未知的预览操作");
    }
    if (pathname === "/api/jelly/ai") {
      const { kind, manual, ...input } = body;
      if ((kind !== "decompose" && kind !== "digest") || (manual !== undefined && typeof manual !== "boolean")) throw new JellyError("jelly.invalid", "整理方式无效");
      const action = kind === "digest" ? jellyActions.digest : manual === true ? jellyActions.manualPlan : jellyActions.modelPlan;
      return ok(await this.actions.invoke(action, input as never));
    }
    if (pathname === "/api/jelly/material") return ok(await this.actions.invoke(jellyServiceActions.material, body as never));
    if (pathname === "/api/jelly/material/reread") return ok(await this.actions.invoke(jellyServiceActions.reread, body as never));
    if (pathname === "/api/jelly/source") return ok(await this.actions.invoke(jellyServiceActions.source, body as never));
    if (pathname === "/api/jelly/model-settings") return ok(await this.actions.invoke(jellyServiceActions.saveModelSettings, body as never));
    return null;
  }
}
export function jellyRouteErrorResponse(error: unknown): JellyRouteResponse {
  const code = error instanceof Error && "code" in error ? String(error.code) : "jelly.failed";
  return { status: error instanceof Error && "status" in error && typeof error.status === "number" ? error.status : code.includes("forbidden") ? 403 : code.includes("connection_required") ? 503 : code.includes("conflict") || code.includes("stale") ? 409 : code.includes("not_found") ? 404 : code.includes("unavailable") ? 503 : 400, body: { code, error: error instanceof Error ? error.message : "Jelly 请求失败", ...(error instanceof Error && "details" in error && error.details ? { details: error.details } : {}) } };
}
