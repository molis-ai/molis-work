import type { PagesEditorHandle, PagesEditorMountOptions, PagesFocus } from "../../plugins/native/pages/src/editor-browser.js";
import type { SurfaceFocus } from "@molis-ai/molis-work-contracts/services/contextual";
import type { PreviewDocument } from "./w0-store.js";
import type { Hand, Landing, Placement } from "./w0-model.js";
import { placementProblem } from "./w0-model.js";
import { $, api, id, type Anchor } from "./w0-dom.js";

type EditorApi = Pick<typeof import("../../plugins/native/pages/src/editor-browser.js"), "mount" | "setDoc" | "getDoc" | "readPagesFocus" | "freezePagesFocus" | "releasePagesFrozen">;
const E = Reflect.get(window, "MolisWorkPagesEditor") as EditorApi;

export class PreviewEditor {
  private handle: PagesEditorHandle | null = null;
  private doc: PreviewDocument | null = null;
  private syncing = false;
  private dirty = false;
  private saving: Promise<void> | null = null;
  private applying = false;
  private loadSequence = 0;
  revision = 0;
  onSelection: () => void = () => undefined;
  onChange: () => void = () => undefined;
  onLoaded: () => void = () => undefined;

  async load(documentId: string) {
    if (this.applying) throw new Error("正在写入预览，请稍后切换文档。");
    const sequence = ++this.loadSequence;
    await this.flush();
    const doc = await api<PreviewDocument>(`/api/docs/${encodeURIComponent(documentId)}`);
    if (sequence !== this.loadSequence) return;
    this.doc = doc; this.revision += 1; this.dirty = false;
    this.syncing = true;
    if (this.handle) E.setDoc(this.handle, doc.body);
    else {
      const options: PagesEditorMountOptions = { doc: doc.body, translate: value => value,
        onFocus: () => { if (!this.syncing) queueMicrotask(() => this.onSelection()); },
        onChange: () => this.changed(),
      };
      this.handle = E.mount($("[data-w0-editor]"), options);
      // Reuse the real command handlers through the new toolbar. The old layer is not on screen.
      this.handle.toolbar.remove();
      this.handle.view.dom.addEventListener("pointerup", () => this.onSelection());
      this.handle.view.dom.addEventListener("keyup", () => this.onSelection());
    }
    this.syncing = false;
    $("[data-w0-title]").textContent = doc.title;
    this.savedLabel(); this.onLoaded();
  }

  private changed() {
    if (this.syncing) return;
    this.revision += 1; this.dirty = true;
    $("[data-w0-save]").textContent = "有修改 · 准备操作时保存到预览";
    this.onChange();
  }

  async flush(): Promise<void> {
    if (this.saving) await this.saving;
    if (!this.dirty || !this.doc || !this.handle) return;
    const doc = this.doc, revision = this.revision, body = E.getDoc(this.handle);
    const save = async () => {
      $("[data-w0-save]").textContent = "正在保存到预览…";
      try {
        const saved = await api<PreviewDocument>(`/api/docs/${encodeURIComponent(doc.id)}`, { body, expected_version: doc.version }, "PUT");
        doc.version = saved.version;
        if (this.revision === revision) { this.dirty = false; doc.body = saved.body; }
        this.savedLabel();
      } catch (error) {
        $("[data-w0-save]").textContent = "保存失败 · 原文仍在，可重试";
        throw error;
      }
    };
    this.saving = save();
    try { await this.saving; } finally { this.saving = null; }
    if (this.dirty) await this.flush();
  }

  private savedLabel() { $("[data-w0-save]").textContent = this.dirty ? "有未保存修改" : `预览已保存 · v${this.doc?.version ?? 0}`; }
  current() { return { documentId: this.doc?.id ?? "", version: this.doc?.version ?? 0, revision: this.revision }; }
  focus() { this.handle?.view.focus(); }
  root() { return this.handle?.view.dom ?? null; }
  title() { return this.doc?.title ?? "文稿"; }
  hasSelection() { return !!this.handle && !this.handle.view.state.selection.empty; }

  landing(point?: { x: number; y: number }): Landing | null {
    if (!this.handle || !this.doc) return null;
    const view = this.handle.view, selection = view.state.selection;
    const position = point ? view.posAtCoords({ left: point.x, top: point.y })?.pos : selection.from;
    if (position === undefined || position === null) return null;
    const from = position, to = point ? position : selection.to;
    if (!view.state.doc.resolve(from).parent.isTextblock) return null;
    let paragraph = 0;
    view.state.doc.nodesBetween(0, from, node => { if (node.isTextblock) { paragraph += 1; return false; } return true; });
    return { ...this.current(), from, to, label: `Pages · 第 ${Math.max(1, paragraph)} 段${from === to ? "光标处" : "选区"}` };
  }

  hand(): Hand | null {
    if (!this.handle || !this.doc || !this.hasSelection()) return null;
    const focus: PagesFocus | null = E.readPagesFocus(this.handle.view.state);
    if (!focus || focus.activity !== "selecting") return null;
    const surface: SurfaceFocus = { context_id: `${this.doc.id}:${this.revision}:${focus.local_id}`, plugin_id: "io.molis.work.pages",
      activity: focus.activity, granularity: focus.granularity, object: { kind: "pages_document", id: this.doc.id, title: this.doc.title, version: this.doc.version },
      targets: focus.targets, surroundings: focus.surroundings };
    const selection = this.handle.view.state.selection;
    return { id: surface.context_id, place: "main", title: this.doc.title,
      text: this.handle.view.state.doc.textBetween(selection.from, selection.to, "\n"), focus: surface };
  }

  anchor(at: Pick<Landing, "from" | "to" | "documentId">): Anchor {
    return () => {
      if (!this.handle || this.doc?.id !== at.documentId || !this.handle.view.dom.getClientRects().length) return null;
      try {
        const start = this.handle.view.coordsAtPos(at.from), end = this.handle.view.coordsAtPos(at.to);
        return { left: start.left, right: Math.max(start.right, end.right), top: start.top, bottom: Math.max(start.bottom, end.bottom) };
      } catch { return null; /* A changed document can invalidate the preview's coordinates. */ }
    };
  }

  highlight(at: Landing | null) {
    const mark = $("[data-w0-landing-mark]");
    const rect = at ? this.anchor(at)() : null;
    mark.hidden = !rect;
    if (!rect) return;
    Object.assign(mark.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${Math.max(3, rect.right - rect.left)}px`, height: `${Math.max(20, rect.bottom - rect.top)}px` });
  }

  reveal(at: Landing) {
    if (!this.handle || at.documentId !== this.doc?.id) return;
    const node = this.handle.view.domAtPos(at.from).node;
    (node instanceof HTMLElement ? node : node.parentElement)?.scrollIntoView({ block: "center" });
  }

  freeze(at: Landing): () => void {
    if (!this.handle) return () => undefined;
    const handle = this.handle, token = id();
    E.freezePagesFocus(handle.view, token, { from: at.from, to: at.to });
    return () => E.releasePagesFrozen(handle.view, token);
  }

  async apply(requestId: string, placement: Placement) {
    if (this.applying) throw new Error("正在写入这份预览。");
    const problem = placementProblem(placement, this.current());
    if (problem) throw new Error(problem);
    this.applying = true; this.handle?.view.setProps({ editable: () => false });
    try {
      const next = await api<PreviewDocument>("/api/w0/place", { requestId, placement });
      this.syncing = true;
      this.doc = next; this.dirty = false; this.revision += 1;
      if (this.handle) E.setDoc(this.handle, next.body);
      this.syncing = false;
      this.savedLabel();
    } finally { this.syncing = false; this.applying = false; this.handle?.view.setProps({ editable: () => true }); }
  }

  tool(name: string) { return this.handle?.toolbar.querySelector<HTMLButtonElement>(`[data-mark="${name}"]`) ?? null; }
}
