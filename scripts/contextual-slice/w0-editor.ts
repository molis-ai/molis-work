import type { PagesEditorHandle, PagesEditorMountOptions, PagesFocus } from "../../plugins/native/pages/src/editor-browser.js";
import type { SurfaceFocus } from "@molis-ai/molis-work-contracts/services/contextual";
import type { PreviewDocument } from "./w0-store.js";
import type { Hand, Landing, LandingPosition, Placement } from "./w0-model.js";
import { placementProblem } from "./w0-model.js";
import { $, api, id, type Anchor, type Rect } from "./w0-dom.js";

type EditorApi = Pick<typeof import("../../plugins/native/pages/src/editor-browser.js"), "mount" | "setDoc" | "getDoc" | "readPagesFocus" | "freezePagesFocus" | "releasePagesFrozen">;
type View = PagesEditorHandle["view"];
const E = Reflect.get(window, "MolisWorkPagesEditor") as EditorApi;
const snippet = (text: string, length = 16) => { const value = text.replace(/\s+/gu, " ").trim(); return value.length > length ? `${value.slice(0, length)}…` : value; };

export class PreviewEditor {
  private handle: PagesEditorHandle | null = null;
  private doc: PreviewDocument | null = null;
  private syncing = false;
  private dirty = false;
  private saving: Promise<void> | null = null;
  private applying = false;
  private loadSequence = 0;
  revision = 0;
  private marked: Landing | null = null;
  onSelection: () => void = () => undefined;
  onChange: () => void = () => undefined;
  onLoaded: () => void = () => undefined;

  constructor() {
    // The mark is fixed to the window; it follows the document's scroller and the window's size.
    document.addEventListener("scroll", () => { if (this.marked) this.highlight(this.marked); }, true);
    window.addEventListener("resize", () => { if (this.marked) this.highlight(this.marked); });
  }

  async load(documentId: string) {
    if (this.applying) throw new Error("正在写入预览，请稍后切换文档。");
    const sequence = ++this.loadSequence;
    await this.flush();
    const doc = await api<PreviewDocument>(`/api/docs/${encodeURIComponent(documentId)}`);
    if (sequence !== this.loadSequence) return;
    this.doc = doc; this.revision += 1; this.dirty = false;
    this.replace(doc.body);
    $("[data-w0-title]").textContent = doc.title;
    this.savedLabel(); this.onLoaded();
  }

  private replace(body: Record<string, unknown>) {
    this.syncing = true;
    try {
      if (this.handle) E.setDoc(this.handle, body);
      else {
        const options: PagesEditorMountOptions = { doc: body, translate: value => value,
          onFocus: () => { if (!this.syncing) queueMicrotask(() => this.onSelection()); },
          onChange: () => this.changed(),
        };
        this.handle = E.mount($("[data-w0-editor]"), options);
        // Reuse the real command handlers through the new toolbar. The old layer is not on screen.
        this.handle.toolbar.remove();
        this.handle.view.dom.addEventListener("keyup", () => this.onSelection());
      }
    } finally { this.syncing = false; }
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

  /** Blocks the page does not show (the title heading is drawn by the page header) are never a landing. */
  private visible(view: View, pos: number): boolean {
    const { node } = view.domAtPos(pos), element = node instanceof Element ? node : node.parentElement;
    return !!element && element.getClientRects().length > 0;
  }
  /** Where a landing is, in the reader's terms: the nearest heading above it and the paragraph under that heading. */
  private where(view: View, pos: number): string {
    // Blocks as the reader sees them: a quote or a list is one block under its heading, however many paragraphs it holds.
    let heading = this.doc?.title ?? "文稿", count = 0;
    view.state.doc.forEach((node, offset) => {
      if (offset > pos) return;
      if (node.type.name === "heading") { heading = node.textContent || heading; count = 0; } else count += 1;
    });
    return `${snippet(heading, 10)} · 第 ${Math.max(1, count)} 段`;
  }

  /** The landing is read from the editor's state after it has taken the DOM selection; a point gives the drop position. */
  landing(point?: { x: number; y: number }): Landing | null {
    if (!this.handle || !this.doc) return null;
    const view = this.handle.view, selection = view.state.selection;
    const found = point ? view.posAtCoords({ left: point.x, top: point.y })?.pos : selection.from;
    if (found === undefined || found === null) return null;
    return this.landingAt(found, point ? found : selection.to);
  }
  private landingAt(from: number, to: number): Landing | null {
    if (!this.handle || !this.doc) return null;
    const view = this.handle.view;
    if (from < 0 || to > view.state.doc.content.size) return null;
    const $from = view.state.doc.resolve(from);
    if (!$from.parent.isTextblock || !this.visible(view, from)) return null;
    const position: LandingPosition = from === to ? "cursor" : "selection", where = this.where(view, from);
    const detail = position === "selection" ? `「${snippet(view.state.doc.textBetween(from, to, " "), 24)}」` : `「${snippet($from.parent.textContent)}」`;
    return { ...this.current(), from, to, position, detail, label: `Pages · ${where}${position === "cursor" ? "光标处" : "选中处"}` };
  }

  /** With nothing chosen yet, the open document itself is the landing: its end (ItemAttach position `end`). */
  endLanding(): Landing | null {
    if (!this.handle || !this.doc) return null;
    const doc = this.handle.view.state.doc, size = doc.content.size;
    return { ...this.current(), from: size, to: size, position: "end", label: "Pages · 文末", detail: `「${snippet(doc.lastChild?.textContent ?? "")}」之后` };
  }

  hand(): Hand | null {
    if (!this.handle || !this.doc || !this.hasSelection()) return null;
    const focus: PagesFocus | null = E.readPagesFocus(this.handle.view.state);
    if (!focus || focus.activity !== "selecting") return null;
    const surface: SurfaceFocus = { context_id: `${this.doc.id}:${this.revision}:${focus.local_id}`, plugin_id: "io.molis.work.pages",
      activity: focus.activity, granularity: focus.granularity, object: { kind: "pages_document", id: this.doc.id, title: this.doc.title, version: this.doc.version },
      targets: focus.targets, surroundings: focus.surroundings };
    const selection = this.handle.view.state.selection;
    return { id: surface.context_id, place: "main", kind: "selection", source: "Pages", title: this.doc.title,
      text: this.handle.view.state.doc.textBetween(selection.from, selection.to, "\n"), focus: surface };
  }

  anchor(at: Pick<Landing, "from" | "to" | "documentId">): Anchor {
    return () => {
      if (!this.handle || this.doc?.id !== at.documentId || !this.handle.view.dom.getClientRects().length) return null;
      const view = this.handle.view, size = view.state.doc.content.size;
      try {
        if (at.from >= size) {
          const last = view.dom.lastElementChild?.getBoundingClientRect();
          return last ? { left: last.left, right: last.left + 2, top: last.bottom + 4, bottom: last.bottom + 24 } : null;
        }
        const start = view.coordsAtPos(at.from), end = view.coordsAtPos(at.to);
        return { left: start.left, right: Math.max(start.right, end.right), top: start.top, bottom: Math.max(start.bottom, end.bottom) };
      } catch { return null; /* A changed document can invalidate the preview's coordinates. */ }
    };
  }

  /** The landing's mark sits beside the text, never over it: a copper caret for a cursor or the end, a light wash for a range. */
  highlight(at: Landing | null, pulse = false) {
    this.marked = at;
    const mark = $("[data-w0-landing-mark]"), view = $("[data-w0-reading]").getBoundingClientRect();
    const found: Rect | null = at ? this.anchor(at)() : null;
    // Only where the reader can see it: a landing scrolled out of the document's own scroller shows no mark.
    const rect = found && found.bottom > view.top && found.top < view.bottom ? found : null;
    mark.hidden = !rect;
    if (!rect || !at) return;
    mark.dataset.shape = at.position === "selection" ? "range" : "caret";
    const width = at.position === "selection" ? Math.max(3, rect.right - rect.left) : 2;
    Object.assign(mark.style, { left: `${rect.left - (width === 2 ? 1 : 0)}px`, top: `${rect.top}px`, width: `${width}px`, height: `${Math.max(18, rect.bottom - rect.top)}px` });
    mark.classList.remove("is-pulsing");
    if (pulse) { void mark.offsetWidth; mark.classList.add("is-pulsing"); }
  }

  reveal(at: Landing) {
    if (!this.handle || at.documentId !== this.doc?.id) return;
    const size = this.handle.view.state.doc.content.size;
    const node = at.from >= size ? this.handle.view.dom.lastElementChild : this.handle.view.domAtPos(at.from).node;
    (node instanceof HTMLElement ? node : node?.parentElement)?.scrollIntoView({ block: "center" });
  }

  /** After a write, the block that changed takes the arrival wash once (DESIGN.md: new item landing). */
  landed(at: Landing, quote: boolean) {
    if (!this.handle) return;
    const view = this.handle.view, size = view.state.doc.content.size;
    // Pages draws insert lines between blocks (ProseMirror widgets); the wash belongs to the block that changed.
    const blocks = [...view.dom.children].filter(node => !node.classList.contains("ProseMirror-widget"));
    let target: Element | undefined;
    if (at.position === "end") target = blocks.at(-1);
    else {
      const { node } = view.domAtPos(Math.min(at.from, size)), element = node instanceof Element ? node : node.parentElement;
      const block = element?.closest(".ProseMirror > *") ?? undefined;
      target = quote && block ? blocks[blocks.indexOf(block) + 1] ?? blocks.at(-1) : block;
    }
    if (!target) return;
    target.classList.remove("w0-landed"); void (target as HTMLElement).offsetWidth; target.classList.add("w0-landed");
    setTimeout(() => target?.classList.remove("w0-landed"), 1400);
  }

  freeze(at: Landing): () => void {
    if (!this.handle || at.position === "end") return () => undefined;
    const handle = this.handle, token = id();
    E.freezePagesFocus(handle.view, token, { from: at.from, to: at.to });
    return () => E.releasePagesFrozen(handle.view, token);
  }

  private adopt(next: PreviewDocument) {
    this.doc = next; this.dirty = false; this.revision += 1;
    this.replace(next.body);
    this.savedLabel();
  }

  /** Writes the frozen placement and returns where the landing is now: just after what was written, so a second
   * material follows the first (the end stays the end). */
  async apply(requestId: string, placement: Placement): Promise<Landing | null> {
    if (this.applying) throw new Error("正在写入这份预览。");
    const problem = placementProblem(placement, this.current());
    if (problem) throw new Error(problem);
    const at = placement.landing, view = this.handle?.view;
    const size = view?.state.doc.content.size ?? 0, blockEnd = view && at.position !== "end" ? view.state.doc.resolve(at.from).after(1) : size;
    this.applying = true; view?.setProps({ editable: () => false });
    try { this.adopt(await api<PreviewDocument>("/api/w0/place", { requestId, placement })); }
    finally { this.applying = false; this.handle?.view.setProps({ editable: () => true }); }
    const delta = (this.handle?.view.state.doc.content.size ?? size) - size;
    if (at.position === "end") return this.endLanding();
    const after = placement.format === "quote" ? blockEnd + delta - 2 : at.to + delta;
    return this.landingAt(after, after) ?? this.endLanding();
  }

  async unapply(requestId: string, at: Landing): Promise<Landing | null> {
    await this.flush();
    const next = await api<PreviewDocument>("/api/w0/unplace", { requestId });
    if (next.id !== this.doc?.id) return null;
    this.adopt(next);
    return at.position === "end" ? this.endLanding() : this.landingAt(at.from, at.to) ?? this.endLanding();
  }

  tool(name: string) { return this.handle?.toolbar.querySelector<HTMLButtonElement>(`[data-mark="${name}"]`) ?? null; }
}
