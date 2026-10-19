import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { codingQuestionAnswered } from "@molis-ai/molis-work-plugin-coding";

// specs/ai-interaction-experience §15.10 (AC-10-3, AC-10-8): what Coding's question card becomes once the Host takes the answer.
// The shipped script runs here against a small DOM port; the card in a real page is checked by coding-question-card.e2e.
class Element {
  parentNode: Element | null = null;
  children: Element[] = [];
  textContent = "";
  focusedWith: { preventScroll?: boolean } | undefined;
  constructor(readonly name: string, readonly page: Page, readonly attributes: Record<string, string> = {}) {}
  append(...nodes: Element[]) { for (const node of nodes) { node.parentNode = this; this.children.push(node); } return this; }
  remove() {
    if (!this.parentNode) return;
    this.page.removed.push(this);
    this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }
  contains(other: Element | null): boolean { for (let at = other; at; at = at.parentNode) if (at === this) return true; return false; }
  querySelector(selector: string): Element | null {
    assert.equal(selector, "h3");
    return this.querySelectorAll("*").find(node => node.name === "h3") ?? null;
  }
  querySelectorAll(selector: string): Element[] {
    assert.equal(selector, "*");
    return this.children.flatMap(child => [child, ...child.querySelectorAll("*")]);
  }
  focus(options?: { preventScroll?: boolean }) { this.page.focused = this; this.focusedWith = options; }
}

/** A page with Coding's thread, a question card as the Host draws it, and the composer. Focus that leaves the page falls to body. */
class Page {
  removed: Element[] = [];
  focused: Element | null = null;
  readonly body = this.make("body");
  readonly document = { body: this.body, page: this, get activeElement(): Element { const { focused, body } = this.page; return focused && body.contains(focused) ? focused : body; } };
  readonly note = this.make("p", { "data-ix-note": "", role: "status" });
  readonly option = this.make("button", { role: "radio" });
  readonly submit = this.make("button", { type: "submit" });
  readonly title = this.make("h3", { id: "q-1-title" });
  readonly card = this.make("article", { "aria-labelledby": "q-1-title" }).append(
    this.make("header").append(this.make("div").append(this.make("span"), this.title)),
    this.make("form").append(this.make("fieldset").append(this.option), this.make("footer").append(this.note, this.make("kbd"), this.make("div").append(this.submit))),
  );
  readonly input = this.make("textarea");
  readonly elsewhere = this.make("button");
  constructor() { this.body.append(this.make("section").append(this.card), this.elsewhere, this.input); }
  make(name: string, attributes: Record<string, string> = {}) { return new Element(name, this, attributes); }
  /** `here`: this is still the session on screen and the card still on the page, as the shipped client passes it. */
  answered(said = "已收到回答，这一轮接着做。", here = true) {
    const run = vm.runInNewContext(`(${codingQuestionAnswered.toString()})`, { document: this.document }) as (card: Element, note: Element, said: string, input: Element, here: boolean) => void;
    run(this.card, this.note, said, this.input, here);
  }
}

test("AC-10-8: the receipt is the card's own status line, which never leaves the page, carrying the Host's words", () => {
  const page = new Page();
  page.answered();
  assert.equal(page.note.textContent, "已收到回答，这一轮接着做。");
  assert.equal(page.note.attributes.role, "status", "the line the receipt is written in is the live region the card was drawn with");
  assert.ok(page.body.contains(page.note), "the status line is still on the page");
  assert.equal(page.removed.filter(node => node.contains(page.note)).length, 0, "nothing that holds the status line was taken off the page, even for a moment");
  // The title the card is named by stays (see the next case), so what is left is the title, the status line and what holds either.
  assert.deepEqual(page.card.querySelectorAll("*").map(node => node.name), ["header", "div", "h3", "form", "footer", "p"], "only the title, the status line and what holds them are left");
  assert.ok(!page.body.contains(page.submit) && !page.body.contains(page.option), "the controls are gone with the fields");
});

test("AC-10-8: the card keeps its name while the receipt shows, because the title it is labelled by stays", () => {
  const page = new Page();
  page.answered();
  assert.equal(page.card.attributes["aria-labelledby"], page.title.attributes.id);
  assert.ok(page.card.contains(page.title) && page.body.contains(page.title), "the title the card is named by is still in the card, on the page");
  assert.equal(page.removed.filter(node => node.contains(page.title)).length, 0, "nothing that holds the title was taken off the page, even for a moment");
  assert.ok(page.removed.some(node => node.name === "span"), "what else the header said (its kicker) goes, so it does not still ask for an answer");
});

test("AC-10-3: focus that was in the card comes back to the composer, without scrolling the thread", () => {
  const page = new Page();
  page.option.focus();
  page.answered();
  assert.equal(page.document.activeElement, page.input);
  assert.equal(page.input.focusedWith?.preventScroll, true);
});

test("AC-10-3: focus that already fell to the page while the answer was sent comes back to the composer", () => {
  const page = new Page();
  // The card locks its fields and button while the answer is on its way; a browser drops focus from a disabled control.
  page.focused = null;
  page.answered();
  assert.equal(page.document.activeElement, page.input);
});

test("AC-10-3: focus the person moved elsewhere while the answer was on its way stays where they put it", () => {
  const page = new Page();
  page.elsewhere.focus();
  page.answered();
  assert.equal(page.document.activeElement, page.elsewhere);
  assert.equal(page.input.focusedWith, undefined);
});

test("AC-10-3: once this is no longer the session on screen, focus that fell to the page is not pulled into its composer", () => {
  const page = new Page();
  page.focused = null;
  page.answered("已收到回答，这一轮接着做。", false);
  assert.equal(page.document.activeElement, page.body, "the person's place in the page they are on is theirs");
  assert.equal(page.input.focusedWith, undefined);
  assert.equal(page.note.textContent, "已收到回答，这一轮接着做。", "the receipt is still written");
});
