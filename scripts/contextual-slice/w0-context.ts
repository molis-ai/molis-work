import { $, el, glyph } from "./w0-dom.js";
import type { Hand, Landing } from "./w0-model.js";

/** 手上 + 落点 above the Assistant's input (context-program §6): carried by default, each removable.
 * Removing a chip changes the Assistant submission only, never the source or its owner's state. */
export class ContextStrip {
  private hand: Hand | null = null;
  private landing: Landing | null = null;
  private useHand = true;
  private useLanding = true;
  set(hand: Hand | null, landing: Landing | null) {
    if (hand?.id !== this.hand?.id) this.useHand = true;
    if (JSON.stringify(landing) !== JSON.stringify(this.landing)) this.useLanding = true;
    this.hand = hand; this.landing = landing; this.render();
  }
  /** 带到助理: put back what was removed. */
  include() { this.useHand = true; this.useLanding = true; this.render(); }
  get() { return { hand: this.useHand ? this.hand : null, landing: this.useLanding && this.hand && this.hand.place !== "main" ? this.landing : null }; }
  private render() {
    const root = $("[data-w0-context]"), chips: HTMLElement[] = [];
    const chip = (icon: string, text: string, title: string, name: string, remove: () => void) => {
      const close = el("button", { type: "button", class: "w0-chip-remove", "aria-label": `不把${name}带给助理`, title: `不带${name}` }, glyph("x"));
      close.addEventListener("click", () => { remove(); this.render(); });
      return el("span", { class: "w0-context-chip", title }, glyph(icon), el("span", { text }), close);
    };
    if (this.hand && this.useHand) {
      const text = this.hand.place === "main" ? `选中的文字 · ${this.hand.title}` : `${this.hand.source} · ${this.hand.title}`;
      chips.push(chip("paperclip", text, `${text}\n${this.hand.text}`, "手上的内容", () => { this.useHand = false; }));
    }
    // The landing travels with something in hand from elsewhere; a selection on the left is its own landing.
    if (this.landing && this.useLanding && this.hand && this.hand.place !== "main") chips.push(chip("arrow", this.landing.label, `${this.landing.label} ${this.landing.detail}`, "落点", () => { this.useLanding = false; }));
    root.replaceChildren(...chips);
    root.hidden = chips.length === 0;
  }
}
