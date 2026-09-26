import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { cogniaActions as actions } from "./actions.js";
import { CogniaError, requireCognia } from "./types.js";
export interface CogniaRouteRequest { method: "GET" | "POST"; pathname: string; query: URLSearchParams; body: Record<string, unknown> }
export interface CogniaRouteResponse { status: number; body?: unknown; bytes?: Uint8Array; filename?: string; mime?: string }
export function cogniaRouteErrorResponse(error: unknown): CogniaRouteResponse {
  const code = error instanceof Error && "code" in error ? String(error.code) : "cognia.failed";
  return { status: error instanceof CogniaError ? error.status : code.includes("forbidden") ? 403 : code.includes("connection_required") || code.includes("unavailable") ? 503 : code.includes("conflict") || code.includes("configuration_changed") ? 409 : code.includes("not_found") ? 404 : 400, body: { code, error: error instanceof Error ? error.message : "Cognia 请求失败" } };
}
/** Historical URLs and response shape; business handlers belong to the registered provider. */
export class CogniaPluginRouteTable {
  constructor(private readonly actions: BoundActionClient) {}
  async handle({ method, pathname, query, body }: CogniaRouteRequest): Promise<CogniaRouteResponse | null> {
    const ok = (value: unknown): CogniaRouteResponse => ({ status: 200, body: value });
    requireCognia(body && typeof body === "object" && !Array.isArray(body), "请求必须是 JSON 对象");
    if (method === "GET" && pathname === "/api/cognia") return ok(await this.actions.invoke(actions.workspace, { query: query.get("q") ?? "", domain_id: query.get("domain_id") ?? "", source_id: query.get("source_id") ?? "" }));
    if (method === "POST" && pathname === "/api/cognia/domains") return ok(await this.actions.invoke(actions.createDomain, body as never));
    const domain = /^\/api\/cognia\/domains\/([^/]+)\/(update|delete)$/u.exec(pathname);
    if (method === "POST" && domain) return ok(await this.actions.invoke<unknown, unknown>(domain[2] === "update" ? actions.updateDomain : actions.deleteDomain, { ...body, id: decodeURIComponent(domain[1]!) } as never));
    const source = /^\/api\/cognia\/sources\/([^/]+)\/(update|delete)$/u.exec(pathname);
    if (method === "POST" && source) return ok(await this.actions.invoke<unknown, unknown>(source[2] === "update" ? actions.updateSource : actions.deleteSource, { ...body, id: decodeURIComponent(source[1]!) } as never));
    if (method === "POST" && pathname === "/api/cognia/materials") return ok(await this.actions.invoke(actions.createMaterial, body as never));
    if (method === "POST" && pathname === "/api/cognia/import/preview") return ok(await this.actions.invoke<unknown, unknown>(body.path !== undefined ? actions.previewDirectory : actions.preview, body as never));
    if (method === "POST" && pathname === "/api/cognia/import/commit") return ok(await this.actions.invoke(actions.commit, body as never));
    if (method === "POST" && pathname === "/api/cognia/import/cancel") return ok(await this.actions.invoke(actions.cancel, body as never));
    if (method === "POST" && pathname === "/api/cognia/ai") {
      const { mode, ...input } = body;
      requireCognia(mode === "synthesize" || mode === "query", "整理方式无效");
      // UI sends the same form for both modes; only the selected mode's fields are business input.
      return ok(await this.actions.invoke<unknown, unknown>(mode === "synthesize" ? actions.synthesize : actions.query,
        mode === "synthesize" ? { ...(input.material_refs !== undefined ? { material_refs: input.material_refs } : {}), ...(input.material_ids !== undefined ? { material_ids: input.material_ids } : {}), ...(input.question ? { question: input.question } : {}) } as never
          : { question: input.question, ...(input.domain_id !== undefined ? { domain_id: input.domain_id } : {}) } as never));
    }
    const draft = /^\/api\/cognia\/drafts\/([^/]+)(\/(save|delete))?$/u.exec(pathname);
    if (draft && (method === "GET" && !draft[2] || method === "POST" && draft[2])) return ok(await this.actions.invoke<unknown, unknown>(draft[3] === "save" ? actions.saveDraft : draft[3] === "delete" ? actions.archiveDraft : actions.draft, { id: decodeURIComponent(draft[1]!) }));
    const mutation = /^\/api\/cognia\/materials\/([^/]+)\/(update|delete)$/u.exec(pathname);
    if (method === "POST" && mutation) return ok(await this.actions.invoke<unknown, unknown>(mutation[2] === "update" ? actions.updateMaterial : actions.deleteMaterial, { ...body, id: decodeURIComponent(mutation[1]!) } as never));
    const material = /^\/api\/cognia\/materials\/([^/]+)(\/download)?$/u.exec(pathname);
    if (method === "GET" && material) {
      const input = { id: decodeURIComponent(material[1]!), ...(query.has("revision") ? { revision: Number(query.get("revision")) } : {}) };
      if (material[2]) { const result = await this.actions.invoke(actions.download, input); return { status: 200, bytes: Buffer.from(result.data, "base64"), filename: result.filename, mime: result.mime }; }
      return ok(await this.actions.invoke(actions.read, input));
    }
    return null;
  }
}
