import { MATERIALS, type CreatedItem, type CreateTarget, type Draft, type Material, type Placement, type PlaceFormat } from "./w0-model.js";

export interface PreviewDocument { id: string; title: string; version: number; body: Record<string, unknown> }
export type EditBody = (body: Record<string, unknown>, from: number, to: number, text: string, format: PlaceFormat) => Record<string, unknown>;
const problem = (message: string, status = 409) => Object.assign(new Error(message), { status });

/** Isolated preview data only. No Home, database, model or plugin writes. */
export class PreviewStore {
  readonly documents: Map<string, PreviewDocument>;
  readonly materials = new Map<string, Material>(MATERIALS.map(item => [item.id, { ...item }]));
  readonly created = new Map<string, CreatedItem>();
  private readonly requests = new Map<string, { input: string; result: CreatedItem }>();
  private readonly placements = new Map<string, { input: string; before: PreviewDocument; document: PreviewDocument; undone?: PreviewDocument }>();

  constructor(documents: readonly PreviewDocument[], private readonly edit: EditBody) {
    this.documents = new Map(documents.map(doc => [doc.id, structuredClone(doc)]));
  }

  document(id: string): PreviewDocument {
    const doc = this.documents.get(id);
    if (!doc) throw problem("预览文档不存在", 404);
    return structuredClone(doc);
  }

  save(id: string, expected: number, body: Record<string, unknown>): PreviewDocument {
    const doc = this.document(id);
    if (doc.version !== expected) throw problem("文档已被其他页面修改。请重新打开文档。");
    const next = { ...doc, body: structuredClone(body), version: doc.version + 1 };
    this.documents.set(id, next);
    return structuredClone(next);
  }

  /** AC-P03 / AC-S05: refusal happens before the editor transform or any document mutation. */
  place(requestId: string, placement: Placement): PreviewDocument {
    const input = JSON.stringify(placement), prior = this.placements.get(requestId);
    if (prior) {
      if (prior.input !== input) throw problem("同一请求号不能提交不同的预览");
      return structuredClone(prior.document);
    }
    const at = placement.landing, doc = this.document(at.documentId);
    if (at.version !== doc.version) throw problem("文档已经改变，这份预览不会写入。请重新选择落点。");
    if (!Number.isSafeInteger(at.from) || !Number.isSafeInteger(at.to) || at.from < 0 || at.to < at.from) throw problem("落点已失效");
    const next = this.save(doc.id, doc.version, this.edit(doc.body, at.from, at.to, placement.text, placement.format));
    this.placements.set(requestId, { input, before: doc, document: next });
    return next;
  }

  /** Taking a placement back restores the body it replaced, as a new version, only while nothing else changed the document. */
  unplace(requestId: string): PreviewDocument {
    const record = this.placements.get(requestId);
    if (!record) throw problem("没有这次放入的记录", 404);
    if (record.undone) return structuredClone(record.undone);
    const current = this.document(record.document.id);
    if (current.version !== record.document.version) throw problem("文稿之后又改过，这次放入不能直接撤销。请在文稿里用 ⌘Z 或手动修改。");
    record.undone = this.save(current.id, current.version, record.before.body);
    return structuredClone(record.undone);
  }

  /** Q04: retries with identical input reuse the result; an edited draft gets a new request id. */
  create(requestId: string, target: CreateTarget, draft: Draft, replaceId?: string): CreatedItem {
    const input = JSON.stringify({ target, draft, replaceId }), previous = this.requests.get(requestId);
    if (previous) {
      if (previous.input !== input) throw problem("这份草稿已更改，请重新确认");
      return { ...previous.result };
    }
    if (!draft.title.trim() || !draft.text.trim()) throw problem("请补上标题和内容", 400);
    if (replaceId && !this.created.has(replaceId)) throw problem("原条目已撤销，请重新创建");
    const id = `preview-${crypto.randomUUID()}`, result: CreatedItem = { id, target, title: draft.title.trim(), text: draft.text };
    if (target === "pages") {
      result.documentId = id;
      this.documents.set(id, { id, title: result.title, version: 1, body: { type: "doc", content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: result.title }] },
        ...result.text.split("\n").map(text => ({ type: "paragraph", ...(text ? { content: [{ type: "text", text }] } : {}) })),
      ] } });
    } else if (target === "shelf") {
      result.materialId = id;
      this.materials.set(id, { id, title: result.title, text: result.text, kind: "note" });
    }
    if (replaceId) this.undo(replaceId);
    this.created.set(id, result);
    this.requests.set(requestId, { input, result });
    return { ...result };
  }

  undo(id: string): void {
    const item = this.created.get(id);
    if (!item) return;
    this.created.delete(id);
    if (item.materialId) this.materials.delete(item.materialId);
    if (item.documentId) this.documents.delete(item.documentId);
  }
}
