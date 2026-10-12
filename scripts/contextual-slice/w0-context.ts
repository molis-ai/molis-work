import { $, el } from "./w0-dom.js";
import type { Hand, Landing } from "./w0-model.js";

/** Removing a chip changes the Assistant submission only, never the source or its owner's state. */
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
  get() { return { hand: this.useHand ? this.hand : null, landing: this.useLanding ? this.landing : null }; }
  private render() {
    const root = $("[data-w0-context]"), chips: HTMLElement[] = [];
    const chip = (text: string, name: string, remove: () => void) => {
      const close = el("button", { type: "button", text: "×", "aria-label": `不把${name}带给助理` });
      close.addEventListener("click", () => { remove(); this.render(); });
      return el("span", { class: "w0-context-chip", title: text }, el("span", { text }), close);
    };
    if (this.hand && this.useHand) chips.push(chip(`手上 · ${this.hand.title}`, "手上内容", () => { this.useHand = false; }));
    if (this.landing && this.useLanding) chips.push(chip(`→ ${this.landing.label}`, "落点", () => { this.useLanding = false; }));
    root.replaceChildren(...chips);
  }
}
