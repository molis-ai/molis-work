import { api, el, button, id, toast, type Anchor } from "./w0-dom.js";
import { freezePlacement, placementProblem, type Choice, type Hand, type Landing, type Placement, type PlaceFormat } from "./w0-model.js";
import type { PreviewEditor } from "./w0-editor.js";
import type { Slots } from "./w0-slot.js";

interface PlacementPorts { showDocument(): void; hideToolbar(): void; refresh(): Promise<void>; landed(next: Landing | null): void }
const VERB: Record<string, string> = { cursor: "插入", end: "放到文末" };
/** A quote goes after the landing's block, not inside its line; the label says so. */
const where = (at: Landing, format: PlaceFormat) => format === "quote" && at.position !== "end" ? `${at.label.replace(/(光标处|选中处)$/u, "")}之后` : at.label;

/** Writing into the open document always previews at the landing first (context-program §3.6); nothing is written before 确认. */
export class Placements {
  private frozen: Placement | null = null;
  private release: (() => void) | null = null;
  constructor(private readonly editor: PreviewEditor, private readonly slots: Slots, private readonly ports: PlacementPorts) {}

  changed() {
    if (!this.frozen) return;
    const problem = placementProblem(this.frozen, this.editor.current());
    if (problem) { this.slots.error(problem); this.editor.highlight(null); }
  }
  async prepare(choice: Choice, hand: Hand, at: Landing) {
    const format: PlaceFormat = choice.format ?? "text";
    const frozen = await this.capture(hand, at, format);
    this.preview(frozen, choice.title, hand.place === "main" ? null : `来自 ${hand.source} · ${hand.title}`, "样例材料");
  }
  private async capture(hand: Hand, at: Landing, format: PlaceFormat = "text"): Promise<Placement> {
    if (at.documentId !== this.editor.current().documentId || at.revision !== this.editor.revision) throw new Error("落点已改变，请重新选择。");
    await this.editor.flush();
    if (at.revision !== this.editor.revision) throw new Error("准备期间文档改变，请重新选择。");
    return freezePlacement(hand, { ...at, version: this.editor.current().version }, format);
  }
  async fragment(choice: Choice, hand: Hand, at: Landing, anchor: Anchor) {
    if (!hand.focus || !choice.fragment) return;
    const frozen = await this.capture(hand, at), token = id();
    const release = this.editor.freeze(frozen.landing);
    try {
      const prepared = await api<{ text: string; apply: string; title: string }>("/api/contextual/prepare", {
        key: choice.key, frozen: { focus: hand.focus, token, frozen_at: new Date().toISOString() },
      });
      if (placementProblem(frozen, this.editor.current())) throw new Error("准备期间文档改变，请重新选择。");
      if (prepared.apply === "replace" || prepared.apply === "insert_after") {
        if (prepared.apply === "insert_after") Object.assign(frozen.landing, { from: frozen.landing.to, position: "cursor" });
        frozen.text = prepared.text;
        this.preview(frozen, prepared.title, null, "模拟改写", prepared.apply === "replace" ? hand.text : null);
      } else {
        this.ports.hideToolbar();
        const panel = this.slots.show({ title: prepared.title, tag: "模拟结果", anchor, returnFocus: () => this.editor.focus() });
        panel.body.append(el("p", { class: "w0-preview-text", text: prepared.text }));
        panel.note.textContent = "只读结果，不写入文稿";
        panel.actions.append(button("知道了", panel.close, "secondary")); this.slots.position();
        panel.actions.querySelector<HTMLButtonElement>("button")?.focus();
      }
    } finally { release(); }
  }
  /** The preview shows what changes in its own words: the original that goes (for a replacement) and what will be written. */
  private preview(placement: Placement, title: string, source: string | null, tag: string, original: string | null = null) {
    this.ports.showDocument(); this.ports.hideToolbar();
    const at = placement.landing;
    this.editor.reveal(at);
    const panel = this.slots.show({ title, tag, anchor: this.editor.anchor(at), returnFocus: () => this.editor.focus(), dispose: () => {
      this.release?.(); this.release = null; this.frozen = null; this.editor.highlight(null);
    } });
    this.frozen = placement; this.release = this.editor.freeze(at); this.editor.highlight(at);
    panel.root.dataset.w0Placement = "";
    panel.body.append(el("p", { class: "w0-panel-meta" }, el("span", { text: `→ ${where(at, placement.format)}` }), el("span", { class: "w0-panel-detail", text: at.detail })));
    if (original) panel.body.append(el("div", { class: "w0-original" }, el("span", { text: "原文" }), el("del", { text: original })));
    const text = el("textarea", { class: "mw-input", rows: "5", "data-w0-placement-text": "" }); text.value = placement.text;
    panel.body.append(el("label", {}, el("span", { text: original ? "改为" : placement.format === "quote" ? "将插入的引用" : "将写入的内容" }), text));
    panel.note.textContent = source ?? "确认前文稿不会改变";
    let pending = false, requestId = id(), previousText = placement.text;
    const label = placement.format === "quote" ? "确认插入引用" : original || at.position === "selection" ? "确认替换" : `确认${VERB[at.position] ?? "插入"}`;
    const confirm = panel.confirm(label, () => {
      if (pending) return;
      if (!text.value.trim()) { this.slots.error("内容为空，请补上要写入的内容。"); return; }
      if (text.value !== previousText) requestId = id();
      placement.text = text.value; previousText = text.value;
      pending = true; confirm.disabled = true; text.disabled = true; this.slots.clearError();
      void this.editor.apply(requestId, placement).then(async next => {
        if (panel.root.isConnected) this.slots.close();
        this.editor.landed(at, placement.format === "quote");
        this.ports.landed(next);
        await this.ports.refresh();
        this.written(requestId, at, placement);
      }).catch(error => { if (panel.root.isConnected) this.slots.error(error instanceof Error ? error.message : String(error)); })
        .finally(() => { pending = false; confirm.disabled = false; text.disabled = false; });
    });
    confirm.dataset.w0PlaceConfirm = "";
    this.slots.position(); confirm.focus();
  }
  private written(requestId: string, at: Landing, placement: Placement) {
    const what = placement.format === "quote" ? "引用" : "内容";
    const undo = button("撤销", () => {
      void this.editor.unapply(requestId, at).then(async next => {
        this.ports.landed(next); await this.ports.refresh(); toast("已撤销这次放入，文稿恢复原样");
      })
        .catch(error => toast(error instanceof Error ? error.message : String(error), [], true));
    });
    undo.dataset.w0Unplace = "";
    toast(`已把${what}放进 ${where(at, placement.format).replace(/^Pages · /u, "")}`, [undo]);
  }
}
