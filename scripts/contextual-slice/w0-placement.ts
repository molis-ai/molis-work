import { api, el, button, id, announce, type Anchor } from "./w0-dom.js";
import { freezePlacement, placementProblem, type Choice, type Hand, type Landing, type Placement } from "./w0-model.js";
import type { PreviewEditor } from "./w0-editor.js";
import type { Slots } from "./w0-slot.js";

interface PlacementPorts { showDocument(): void; hideToolbar(): void; refresh(): Promise<void> }

export class Placements {
  private frozen: Placement | null = null;
  private release: (() => void) | null = null;
  constructor(private readonly editor: PreviewEditor, private readonly slots: Slots, private readonly ports: PlacementPorts) {}

  changed() {
    if (!this.frozen) return;
    const problem = placementProblem(this.frozen, this.editor.current());
    if (problem) { this.slots.error(problem); this.editor.highlight(null); }
  }
  async prepare(hand: Hand, at: Landing) {
    const frozen = await this.capture(hand, at);
    this.preview(frozen, "放进左边", false);
  }
  private async capture(hand: Hand, at: Landing): Promise<Placement> {
    if (at.documentId !== this.editor.current().documentId || at.revision !== this.editor.revision) throw new Error("落点已改变，请重新选择。");
    await this.editor.flush();
    if (at.revision !== this.editor.revision) throw new Error("准备期间文档改变，请重新选择。");
    return freezePlacement(hand, { ...at, version: this.editor.current().version });
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
        if (prepared.apply === "insert_after") frozen.landing.from = frozen.landing.to;
        frozen.text = prepared.text;
        this.preview(frozen, prepared.title, true);
      } else {
        this.ports.hideToolbar();
        const panel = this.slots.show(prepared.title, anchor, () => this.editor.focus());
        panel.body.append(el("p", { class: "w0-simulated", text: "模拟生成 · 不写入文档" }), el("p", { class: "w0-preview-text", text: prepared.text }));
        panel.actions.append(button("知道了", panel.close)); this.slots.position();
        panel.actions.querySelector<HTMLButtonElement>("button")?.focus();
      }
    } finally { release(); }
  }
  private preview(placement: Placement, title: string, simulated: boolean) {
    this.ports.showDocument(); this.ports.hideToolbar();
    const at = placement.landing;
    this.editor.reveal(at);
    const panel = this.slots.show(title, this.editor.anchor(at), () => this.editor.focus(), () => {
      this.release?.(); this.release = null; this.frozen = null; this.editor.highlight(null);
    });
    this.frozen = placement; this.release = this.editor.freeze(at); this.editor.highlight(at);
    panel.root.dataset.w0Placement = "";
    panel.body.append(el("p", { text: `→ ${at.label}` }), el("p", { class: "w0-simulated", text: simulated ? "模拟改写 · 确认后只修改预览文档" : "样例材料 · 确认前文稿不会改变" }));
    const text = el("textarea", { class: "mw-input", rows: "5", "data-w0-placement-text": "" }); text.value = placement.text;
    panel.body.append(el("label", {}, "将写入的内容", text));
    let pending = false, requestId = id(), previousText = placement.text;
    const confirm = button(at.from === at.to ? "确认插入" : "确认替换", () => {
      if (pending) return;
      if (!text.value.trim()) { this.slots.error("内容为空，请补上要写入的内容。"); return; }
      if (text.value !== previousText) requestId = id();
      placement.text = text.value; previousText = text.value;
      pending = true; confirm.disabled = true; text.disabled = true;
      void this.editor.apply(requestId, placement).then(async () => {
        if (panel.root.isConnected) this.slots.close();
        await this.ports.refresh(); announce("已写入预览文稿。");
      }).catch(error => { if (panel.root.isConnected) this.slots.error(error instanceof Error ? error.message : String(error)); })
        .finally(() => { pending = false; confirm.disabled = false; text.disabled = false; });
    }, true);
    confirm.dataset.w0PlaceConfirm = "";
    panel.actions.append(confirm, button("取消", panel.close)); this.slots.position(); confirm.focus();
  }
}
