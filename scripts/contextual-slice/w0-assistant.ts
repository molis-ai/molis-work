import { $, el, button, glyph, type Anchor } from "./w0-dom.js";
import { choicesFor, DIRECT, type Choice, type Hand, type Landing } from "./w0-model.js";
import type { ContextualLayoutPlan } from "@molis-ai/molis-work-contracts/services/contextual";
import type { ContextStrip } from "./w0-context.js";
import type { Slots } from "./w0-slot.js";

interface AssistantPorts {
  choose(choice: Choice, hand: Hand, landing: Landing | null): void;
  plan(hand: Hand): ContextualLayoutPlan | undefined;
  hideToolbar(): void;
}

/** The Assistant handoff is simulated: no model, no input receipt. What it shows is the same candidate list the bar uses
 * (AC-P01), so 「放到左边」 from the Assistant still previews at the landing before writing. */
export class AssistantHandoff {
  constructor(private readonly slots: Slots, private readonly strip: ContextStrip, private readonly ports: AssistantPorts) {}

  /** ✦助理 on the bar: a one-line ask in the panel slot under the thing in hand. */
  ask(hand: Hand, landing: Landing | null, anchor: Anchor, back: () => void) {
    this.ports.hideToolbar();
    const panel = this.slots.show({ title: "交给助理", tag: "模拟交接", anchor, returnFocus: back });
    const input = el("input", { class: "mw-input", type: "text", placeholder: "说出要做什么，例如：整理成两句放到光标处", "aria-label": "交给助理的要求", "data-w0-ask": "" });
    const form = el("form", { class: "w0-oneline" }, glyph("sparkles"), input);
    const result = el("div", { class: "w0-handoff", hidden: "" });
    panel.body.append(this.carried(hand, landing), form, result);
    panel.note.textContent = "不发送给模型，没有输入回执";
    form.addEventListener("submit", event => { event.preventDefault(); this.card(result, input.value, hand, landing); this.slots.position(); });
    this.slots.position(); input.focus();
  }

  /** The composer: what the strip carries goes with the words; the answer rises above the composer. */
  submit() {
    const input = $<HTMLInputElement>("[data-w0-assistant-input]"), context = this.strip.get();
    this.ports.hideToolbar();
    const panel = this.slots.show({ title: "交给助理", tag: "模拟交接", anchor: () => $(".w0-composer").getBoundingClientRect(), returnFocus: () => input.focus(), rise: true });
    panel.body.dataset.w0Handoff = "";
    panel.note.textContent = "不发送给模型，没有输入回执";
    if (context.hand) panel.body.append(this.carried(context.hand, context.landing));
    else panel.body.append(el("p", { class: "w0-panel-meta", text: context.landing ? `落点：${context.landing.label}` : "没有带上材料或落点。" }));
    const result = el("div", { class: "w0-handoff" }); panel.body.append(result);
    this.card(result, input.value, context.hand, context.landing);
    this.slots.position(); panel.root.querySelector<HTMLButtonElement>(".w0-handoff button, header button")?.focus();
  }

  private carried(hand: Hand, landing: Landing | null) {
    return el("div", { class: "w0-carried" },
      el("span", { class: "w0-carried-chip" }, glyph("paperclip"), el("span", { text: hand.place === "main" ? "选中的文字" : `${hand.source} · ${hand.title}` })),
      landing ? el("span", { class: "w0-carried-chip" }, glyph("arrow"), el("span", { text: landing.label })) : null);
  }

  private card(root: HTMLElement, words: string, hand: Hand | null, landing: Landing | null) {
    root.hidden = false;
    const said = words.trim() ? el("blockquote", { class: "w0-said", text: words.trim() }) : el("p", { class: "w0-panel-meta", text: "没有补充要求，按手上的内容给出下一步。" });
    if (!hand) { root.replaceChildren(said, el("p", { class: "w0-panel-meta", text: "先选中一样东西，助理才有候选可以给。" })); return; }
    const choices = choicesFor(hand, landing, this.ports.plan(hand)).primary.slice(0, 4);
    const rows = choices.map(choice => {
      const row = button(choice.title, () => { this.slots.close(); this.ports.choose(choice, hand, landing); }, "ghost", choice.kind === "place" ? "arrow" : choice.kind === "create" ? "plus" : "wand");
      row.dataset.w0AssistantChoice = choice.key; row.classList.add("w0-card-row");
      const how = choice.kind === "place" ? "先在落点预览" : choice.kind === "fragment" ? "先预览" : DIRECT[choice.target!] ? "直接创建，可撤销" : "出卡片确认";
      row.append(el("small", { text: how }));
      return row;
    });
    root.replaceChildren(said, el("p", { class: "w0-group-label", text: "助理会从这些里选（与浮条同一份候选）" }), ...rows);
  }
}
