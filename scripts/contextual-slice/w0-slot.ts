import { el, button, iconButton, placeLayer, riseFrom, type Anchor } from "./w0-dom.js";

export interface PanelSlot {
  root: HTMLElement; body: HTMLElement; note: HTMLElement; actions: HTMLElement; error: HTMLElement;
  close(): void;
  /** Footer pair (DESIGN.md: Cancel then the one specific submit on the right). Returns the submit button. */
  confirm(label: string, action: () => void): HTMLButtonElement;
}
export interface SlotOptions {
  title: string; anchor: Anchor; returnFocus(): void; dispose?(): void;
  /** A short honest label for what is simulated here (模拟改写, 样例材料…). */
  tag?: string;
  /** Rise above the anchor (the Assistant's answer rises above the composer) instead of opening below it. */
  rise?: boolean;
}

/** One local panel slot; it can be anchored at the material or at a different owner's landing. */
export class Slots {
  private current: PanelSlot | null = null;
  private options: SlotOptions | null = null;
  get open() { return this.current !== null; }
  contains(node: Node | null) { return !!node && !!this.current?.root.contains(node); }

  constructor() {
    document.addEventListener("scroll", () => this.position(), true);
    window.addEventListener("resize", () => this.position());
  }
  show(options: SlotOptions): PanelSlot {
    this.close(); this.options = options;
    const root = el("section", { class: "w0-popover", role: "dialog", "aria-label": options.title, "data-w0-panel": "" });
    const body = el("div", { class: "w0-panel-body" }), note = el("p", { class: "w0-panel-note" }), actions = el("div", { class: "w0-actions" });
    const error = el("p", { class: "w0-error", role: "alert", hidden: "", "data-w0-panel-error": "" });
    const close = () => { this.close(); options.returnFocus(); };
    root.append(el("header", { class: "w0-panel-head" }, el("h2", { text: options.title }),
      options.tag ? el("span", { class: "w0-tag", text: options.tag }) : null, iconButton("关闭", "x", close)),
    body, error, el("footer", { class: "w0-panel-foot" }, note, actions));
    root.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
    });
    const confirm = (label: string, action: () => void) => {
      const submit = button(label, action, "primary");
      actions.replaceChildren(button("取消", close, "secondary"), submit);
      return submit;
    };
    this.current = { root, body, note, actions, error, close, confirm };
    document.body.append(root); this.position();
    return this.current;
  }
  position() {
    if (!this.current || !this.options) return;
    const node = this.current.root, anchor = this.options.anchor;
    if (this.options.rise) { const rect = anchor(); if (rect) riseFrom(node, rect); return; }
    if (!placeLayer(node, anchor, true)) {
      // A panel stays reachable when its source scrolls away. Its header still names its destination.
      placeLayer(node, () => ({ left: Math.max(12, (innerWidth - 420) / 2), right: innerWidth / 2, top: 70, bottom: 70 }), true);
    }
  }
  error(message: string) {
    if (!this.current) return;
    this.current.error.textContent = message; this.current.error.hidden = false; this.position();
  }
  clearError() { if (this.current) this.current.error.hidden = true; }
  close() {
    this.current?.root.remove(); this.current = null;
    const dispose = this.options?.dispose; this.options = null; dispose?.();
  }
}
