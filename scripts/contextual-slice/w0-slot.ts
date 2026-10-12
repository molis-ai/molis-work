import { el, button, placeLayer, type Anchor } from "./w0-dom.js";

export interface PanelSlot { root: HTMLElement; body: HTMLElement; actions: HTMLElement; error: HTMLElement; close(): void }

/** One local panel slot; it can be anchored at the material or at a different owner's landing. */
export class Slots {
  private current: PanelSlot | null = null;
  private dispose: (() => void) | null = null;
  private anchor: Anchor | null = null;
  get open() { return this.current !== null; }
  contains(node: Node | null) { return !!node && !!this.current?.root.contains(node); }

  constructor() {
    document.addEventListener("scroll", () => this.position(), true);
    window.addEventListener("resize", () => this.position());
  }
  show(title: string, anchor: Anchor, returnFocus: () => void, dispose?: () => void): PanelSlot {
    this.close(); this.anchor = anchor; this.dispose = dispose ?? null;
    const root = el("section", { class: "w0-popover", role: "dialog", "aria-label": title, "data-w0-panel": "" });
    const body = el("div"), actions = el("div", { class: "w0-actions" });
    const error = el("p", { class: "w0-error", role: "alert", hidden: "", "data-w0-panel-error": "" });
    const close = () => { this.close(); returnFocus(); };
    root.append(el("header", {}, el("h2", { text: title }), button("关闭", close)), body, error, actions);
    root.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
    });
    this.current = { root, body, actions, error, close };
    document.body.append(root); this.position();
    return this.current;
  }
  position() {
    if (!this.current || !this.anchor) return;
    if (!placeLayer(this.current.root, this.anchor, true)) {
      // A panel stays reachable when its source scrolls away. The target label still identifies its destination.
      placeLayer(this.current.root, () => ({ left: Math.max(12, (innerWidth - 420) / 2), right: innerWidth / 2, top: 70, bottom: 70 }), true);
    }
  }
  error(message: string) {
    if (!this.current) return;
    this.current.error.textContent = message; this.current.error.hidden = false; this.position();
  }
  close() {
    this.current?.root.remove(); this.current = null;
    const dispose = this.dispose; this.dispose = null; this.anchor = null; dispose?.();
  }
}
