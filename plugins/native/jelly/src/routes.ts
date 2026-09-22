import type { JellyCommand } from "@molis-ai/molis-work-contracts/modules/jelly";
import { jellyOccurrences, jellyProgress } from "./calendar.js";
import { runJellyAi, type JellyAiInput, type JellyAiPorts } from "./ai.js";
import { jellySourceHash } from "./content.js";
import { jellyNoteToMarkdown, jellyNoteToHtml } from "./markdown.js";
import { JellyError } from "./error.js";
import type { JellyStore } from "./store.js";
export interface JellyRouteRequest { method: "GET" | "POST"; pathname: string; query: URLSearchParams; body: Record<string, unknown> }
export interface JellyRouteResponse { status: number; body: unknown }
export const JELLY_NATIVE_PLUGIN_ROUTES = [
  ["GET", "/api/jelly"], ["GET", "/api/jelly/calendar"], ["GET", "/api/jelly/progress"], ["GET", "/api/jelly/export"],
  ["POST", "/api/jelly/commands"], ["POST", "/api/jelly/preview"], ["POST", "/api/jelly/ai"],
] as const;
export class JellyPluginRouteTable {
  constructor(private readonly store: JellyStore, private readonly ports: JellyAiPorts = {}) {}
  async handle(request: JellyRouteRequest): Promise<JellyRouteResponse | null> {
    const { pathname, method, body, query } = request;
    const ok = (data: unknown): JellyRouteResponse => ({ status: 200, body: data });
    if (method === "GET") {
      if (pathname === "/api/jelly") return ok({ state: this.store.read(), capabilities: { ai: Boolean(this.ports.completeText) } });
      if (pathname === "/api/jelly/export") return ok({ workspace: this.store.export() });
      if (pathname === "/api/jelly/calendar") return ok({ occurrences: jellyOccurrences(this.store.read(), query.get("start") ?? "", query.get("end") ?? "") });
      if (pathname === "/api/jelly/progress") return ok({ progress: jellyProgress(this.store.read(), query.get("start") ?? "", query.get("end") ?? "", query.get("today") ?? "", (query.has("category_id") ? query.getAll("category_id") : undefined)) });
      const noteExport = /^\/api\/jelly\/notes\/([^/]+)\/export$/u.exec(pathname);
      if (noteExport) {
        const note = this.store.read().notes.find(n => n.id === decodeURIComponent(noteExport[1]!));
        if (!note) throw new JellyError("jelly.not_found", "笔记不存在");
        const html = query.get("format") === "html";
        return ok({ content: html ? jellyNoteToHtml(note) : jellyNoteToMarkdown(note), filename: note.title.replace(/[\/\\:*?"<>|]/gu, "-").slice(0, 100) + (html ? ".html" : ".md"), mime: html ? "text/html;charset=utf-8" : "text/markdown;charset=utf-8" });
      }
      return null;
    }
    if (pathname === "/api/jelly/commands") {
      if (!body.command || typeof body.command !== "object" || Array.isArray(body.command)) throw new JellyError("jelly.invalid", "缺少操作");
      if (!Number.isSafeInteger(body.expected_revision)) throw new JellyError("jelly.invalid", "缺少当前版本，请刷新后重试");
      return ok({ state: this.store.execute(body.command as JellyCommand, body.expected_revision as number) });
    }
    if (pathname === "/api/jelly/preview") {
      if (body.kind === "delete-note" && typeof body.id === "string") return ok({ preview: this.store.previewDelete(body.id) });
      if (body.kind === "delete-inspiration" && typeof body.id === "string") return ok({ preview: this.store.previewDeleteInspiration(body.id) });
      if (body.kind === "import") return ok({ preview: this.store.previewImport(body.source) });
      throw new JellyError("jelly.invalid", "未知的预览操作");
    }
    if (pathname === "/api/jelly/ai") {
      const input = body as unknown as JellyAiInput;
      const before = this.store.read();
      const result = await runJellyAi(before, input, this.ports);
      if (this.ports.signal?.aborted) throw new JellyError("jelly.cancelled", "整理已取消，原始内容已保留");
      if ("digest" in result && input.source_type === "inspiration" && input.source_id) {
        const latest = this.store.read();
        if (jellySourceHash(latest, "inspiration", input.source_id) !== result.digest.source_hash) throw new JellyError("jelly.conflict", "提炼时原文发生变化，请重新提炼");
        if (before.inspirations.find(source => source.id === input.source_id)?.material?.content_fingerprint !== latest.inspirations.find(source => source.id === input.source_id)?.material?.content_fingerprint) throw new JellyError("jelly.conflict", "提炼时素材已重新读取，请根据新内容重新提炼");
        const state = this.store.execute({ type: "inspiration.update", id: input.source_id, patch: { digest: result.digest } }, latest.revision);
        return ok({ ...result, state });
      }
      return ok(result);
    }
    return null;
  }
}
export function jellyRouteErrorResponse(error: unknown): JellyRouteResponse {
  const code = error instanceof Error && "code" in error ? String(error.code) : "jelly.failed";
  return { status: error instanceof Error && "status" in error && typeof error.status === "number" ? error.status : code.includes("conflict") || code.includes("stale") ? 409 : code.includes("not_found") ? 404 : code.includes("unavailable") ? 503 : 400, body: { code, error: error instanceof Error ? error.message : "Jelly 请求失败", ...(error instanceof Error && "details" in error && error.details ? { details: error.details } : {}) } };
}
