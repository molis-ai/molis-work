import { generateCogniaDraft, type CogniaAiPorts } from "./ai.js";
import { CogniaError, COGNIA_LIMITS, requireCognia, stringField, type ImportFile } from "./types.js";
import type { CogniaStore } from "./store.js";
export interface CogniaRouteRequest { method: "GET" | "POST"; pathname: string; query: URLSearchParams; body: Record<string, unknown> }
export interface CogniaRouteResponse { status: number; body?: unknown; bytes?: Uint8Array; filename?: string; mime?: string }
export interface CogniaRoutePorts extends CogniaAiPorts { scanDirectory?: (path: string) => Promise<{ locator: string; name: string; files: ImportFile[] }> }
export function cogniaRouteErrorResponse(error: unknown): CogniaRouteResponse { return { status: error instanceof CogniaError ? error.status : 400, body: { error: error instanceof Error ? error.message : "Cognia 请求失败" } }; }
export class CogniaPluginRouteTable {
  constructor(private readonly store: CogniaStore, private readonly ports: CogniaRoutePorts = {}) {}
  async handle(request: CogniaRouteRequest): Promise<CogniaRouteResponse | null> {
    const { method, pathname, query, body } = request; const ok = (value: unknown): CogniaRouteResponse => ({ status: 200, body: value });
    requireCognia(body && typeof body === "object" && !Array.isArray(body), "请求必须是 JSON 对象");
    if (method === "GET" && pathname === "/api/cognia") return ok({ materials: this.store.materials(query.get("q") ?? "", query.get("domain_id") ?? "", query.get("source_id") ?? "").map(({ body: text, frontmatter: _, ...m }) => ({ ...m, excerpt: (() => { const term = query.get("q")?.trim().split(/\s+/u)[0]; const index = term ? text.toLocaleLowerCase().indexOf(term.toLocaleLowerCase()) : -1; return index < 0 ? "" : text.slice(Math.max(0, index - 60), index + 120); })() })), domains: this.store.domains(), sources: this.store.sources(), drafts: this.store.drafts().map(({ references: _, body: _body, ...d }) => d), ai_available: !!this.ports.completeText, ai_runtime: this.ports.runtimeLabel ?? null, limits: COGNIA_LIMITS });
    if (method === "POST" && pathname === "/api/cognia/domains") return ok({ domain: this.store.createDomain(body.name) });
    if (method === "POST" && pathname === "/api/cognia/materials") return ok({ material: this.store.createMaterial({ title: body.title, body: body.body, domain_id: body.domain_id }) });
    if (method === "POST" && pathname === "/api/cognia/import/preview") {
      let input: { locator: string; name: unknown; files: ImportFile[] };
      if (body.path !== undefined) { requireCognia(this.ports.scanDirectory, "本机目录导入不可用", 503); input = await this.ports.scanDirectory(stringField(body.path, "请输入绝对目录路径", 2000)); }
      else { requireCognia(Array.isArray(body.files), "请选择目录"); input = { locator: "upload", name: body.name, files: body.files as ImportFile[] }; }
      return ok({ preview: this.store.preview({ ...input, kind: body.kind, domain_id: body.domain_id, source_id: body.source_id }) });
    }
    if (method === "POST" && pathname === "/api/cognia/import/commit") return ok({ receipt: this.store.commit(stringField(body.preview_id, "缺少预览编号")) });
    if (method === "POST" && pathname === "/api/cognia/import/cancel") { this.store.cancelPreview(stringField(body.preview_id, "缺少预览编号")); return ok({ cancelled: true }); }
    if (method === "POST" && pathname === "/api/cognia/ai") return ok({ draft: await generateCogniaDraft(this.store, body, this.ports) });
    const draft = /^\/api\/cognia\/drafts\/([^/]+)(\/save)?$/u.exec(pathname);
    if (draft) { const id = decodeURIComponent(draft[1]!); if (method === "POST" && draft[2]) return ok({ material: this.store.saveDraft(id) }); if (method === "GET" && !draft[2]) { const found = this.store.drafts().find(d => d.id === id); requireCognia(found, "草稿不存在", 404); return ok({ draft: found }); } }
    const material = /^\/api\/cognia\/materials\/([^/]+)(\/download)?$/u.exec(pathname);
    if (method === "GET" && material) {
      const id = decodeURIComponent(material[1]!), revision = query.has("revision") ? Number(query.get("revision")) : undefined;
      requireCognia(revision === undefined || Number.isSafeInteger(revision) && revision > 0, "版本无效");
      if (material[2]) { const found = this.store.download(id, revision); return { status: 200, bytes: found.bytes, filename: found.material.path.split("/").at(-1), mime: found.material.mime }; }
      return ok(this.store.detail(id, revision));
    }
    return null;
  }
}
