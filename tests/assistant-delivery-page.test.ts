import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import type { AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { ASSISTANT_RECEIPTS_FACTORY_SCRIPT, ASSISTANT_STEP_ROW_FACTORY_SCRIPT } from "@molis-ai/molis-work-app-workbench";
import { deliveryNote, deliveryNoteHtml, deliverySteps } from "@molis-ai/molis-work-app-local-host";

// specs/ai-input-receipts §9.2, stage 3e-2a (RCPT-375): the page side of the delivery note. The Host draws it; the receipts
// factory places it as one record after the tray, redraws it whole only when the Host's html changed, and opens a
// supplement's receipt from its button. A step of the outcome slot then presses the note's own button through the row.
// The shipped scripts run here on small stand-ins for the page.

/** Only what the factory asks of a node. Setting `innerHTML` to one `<div …>` makes that div its `firstChild`, as a browser would. */
class El {
  className = ""; dataset: Record<string, string> = {}; attrs: Record<string, string> = {}; parent: El | null = null; html = ""; firstChild: El | null = null;
  listeners: Record<string, Array<(event: unknown) => void>> = {}; kids: El[] = [];
  /** The note's one click handler, which the shipped script sets as the property (it is the factory's own element). */
  onclick: ((event: unknown) => void) | null = null;
  constructor(public tag: string) {}
  get innerHTML() { return this.html; }
  set innerHTML(value: string) {
    this.html = value;
    const [, attrs, inner] = /^<div([^>]*)>([\s\S]*)<\/div>$/u.exec(value) ?? [];
    if (attrs === undefined) { this.firstChild = null; return; }
    const child = new El("div");
    child.className = /class="([^"]*)"/u.exec(attrs)?.[1] ?? ""; child.attrs["aria-live"] = /aria-live="([^"]*)"/u.exec(attrs)?.[1] ?? "";
    const record = /data-ix-record="([^"]*)"/u.exec(attrs)?.[1]; if (record !== undefined) child.dataset["ixRecord"] = record;
    child.html = inner ?? ""; this.firstChild = child;
  }
  addEventListener(type: string, listener: (event: unknown) => void) { (this.listeners[type] ??= []).push(listener); }
  remove() { if (this.parent) this.parent.kids = this.parent.kids.filter(kid => kid !== this); this.parent = null; }
  /** Only what the factory asks of the thread: its direct child by class. */
  querySelector(selector: string) { const name = /^:scope > \.([\w-]+)$/u.exec(selector)?.[1] ?? ""; return this.kids.find(kid => kid.className.split(" ").includes(name)) ?? null; }
}

/** The record the Host draws: its key, and the words inside. */
const wrap = (work: string, inner: string) => `<div class="mw-receipt" data-ix-record="delivery:${work}" aria-live="off">${inner}</div>`;
const note = (id: string, inner: string) => ({ work: { work_id: id }, rounds: [{ run_id: "run-1", phase: "completed" }], delivery_html: wrap(id, inner) });

function page(tray?: El) {
  const thread = new El("div"), opened: string[] = [], known = new Set(["s1"]), boxes: El[] = [];
  const shared = { tray: () => tray ?? null, agreements: () => null, link: (owner: El, id: string) => (owner === thread && known.has(id) ? { click: () => { opened.push(id); } } : null) };
  const document = { createElement: (tag: string) => { const made = new El(tag); boxes.push(made); return made; } };
  const ui = vm.runInNewContext(`(${ASSISTANT_RECEIPTS_FACTORY_SCRIPT})`, { Error, encodeURIComponent, document })({ L: (text: string) => text, shared, chip: new El("button"), api: () => Promise.resolve({}), work: () => "w1", reload: () => {}, pact: () => {} }) as {
    after(thread: El, put: (node: El) => void, view: object | null): void;
  };
  const put = (node: El) => { if (node.parent !== thread) { node.parent = thread; thread.kids.push(node); } };
  const notes = () => thread.kids.filter(kid => kid.dataset["ixRecord"] !== undefined);
  return { thread, opened, boxes, after: (view: object | null) => ui.after(thread, put, view), put, notes };
}

test("RCPT-375: the Assistant places the Host's delivery note as one record after the tray, drawn from the Host's html, never a second one", () => {
  const tray = new El("details");
  const { thread, after, put, notes, boxes } = page(tray);
  put(new El("section"));
  after(note("w1", "<p>一</p>")); after(note("w1", "<p>一</p>"));
  assert.equal(notes().length, 1, "one note, never a second");
  const block = notes()[0]!;
  assert.deepEqual([block.tag, block.className, block.dataset["ixRecord"], block.attrs["aria-live"], block.html], ["div", "mw-receipt", "delivery:w1", "off", "<p>一</p>"], "not folded, silent to a screen reader, keyed by the Host");
  assert.deepEqual(thread.kids.slice(-2), [tray, block], "after the tray, which is after the rounds");
  assert.equal(boxes.length, 1, "the same html is not drawn again");
  assert.equal(notes()[0], block, "…and the record keeps its element, so the row does not bind it again");
});

test("RCPT-375: a changed note is redrawn whole as a new element; a note of another work is another record; no note removes it", () => {
  const { after, notes, thread } = page();
  after(note("w1", "<p>一</p>"));
  const first = notes()[0]!;
  after(note("w1", "<p>二</p>"));
  assert.equal(notes().length, 1);
  assert.notEqual(notes()[0], first, "a new element, so the row sees a new first child and binds its buttons again");
  assert.equal(first.parent, null, "the old one is gone");
  assert.equal(notes()[0]!.html, "<p>二</p>");
  after(note("w2", "<p>二</p>"));
  assert.equal(notes().length, 1);
  assert.equal(notes()[0]!.dataset["ixRecord"], "delivery:w2", "the same words in another work are that work's record");
  after({ ...note("w2", ""), delivery_html: "" });
  assert.equal(notes().length, 0, "the Host drew no note: none stays");
  after(note("w2", "<p>三</p>"));
  assert.equal(notes().length, 1);
  after(null);
  assert.equal(notes().length, 0, "no work open");
  assert.equal(thread.kids.length, 0);
  after({ work: { work_id: "w1" }, rounds: [{ run_id: "run-1", phase: "completed" }] });
  assert.equal(notes().length, 0, "a view with no note at all");
});

test("RCPT-375: a supplement's button in the note opens its receipt; nothing else in it does", () => {
  const { after, notes, opened } = page();
  after(note("w1", '<button data-input="s1">「补一句」</button><button data-input="gone">「别的」</button><button data-assistant-object="0">周报</button>'));
  const click = notes()[0]!.onclick!;
  const target = (match: { dataset: { input: string } } | null) => ({ target: { closest: (selector: string) => selector === "[data-input]" ? match : null } });
  click(target({ dataset: { input: "s1" } }));
  assert.deepEqual(opened, ["s1"], "the shared receipt's own link, on this thread");
  click(target({ dataset: { input: "gone" } }));
  click(target(null));
  assert.deepEqual(opened, ["s1"], "a receipt that is not drawn, or a click elsewhere in the note, opens nothing");
});

/** The buttons of the Host's html as a browser would make them: their `data-` attributes, and what the row asks of a control. */
interface Control { dataset: Record<string, string>; children: Control[]; disabled: boolean; pressed: number; firstChild: Control | null; click(): void; querySelector(selector: string): Control | null; querySelectorAll(selector: string): Control[] }
const unescape = (text: string) => text.replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&#39;", "'").replaceAll("&amp;", "&");
/** `[data-<name>]` or `[data-<name>="<escaped value>"]`: what the row's script asks of a node. */
const matches = (node: Control, selector: string): boolean => {
  const [, name, value] = selector.match(/^\[data-([a-z-]+)(?:="((?:\\.|[^"\\])*)")?\]$/) ?? [];
  assert.ok(name, `a selector the stand-in reads: ${selector}`);
  const key = name.replace(/-([a-z])/g, (_all, letter: string) => letter.toUpperCase());
  return value === undefined ? node.dataset[key] !== undefined : node.dataset[key] === value.replace(/\\(.)/g, "$1");
};
const control = (dataset: Record<string, string>, children: Control[] = []): Control => {
  const all = (from: Control): Control[] => from.children.flatMap(child => [child, ...all(child)]);
  return { dataset, children, disabled: false, pressed: 0, get firstChild() { return this.children[0] ?? null; }, click() { this.pressed += 1; },
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; },
    querySelectorAll(selector) {
      if (!selector.includes('"') && selector.includes(",")) return all(this).filter(one => selector.split(",").some(part => matches(one, part)));
      return all(this).filter(one => matches(one, selector));
    } };
};
const fromHtml = (html: string) => [...html.matchAll(/<button([^>]*)>/g)].map(([, attrs]) => control(Object.fromEntries([...attrs!.matchAll(/data-([a-z-]+)="([^"]*)"/g)]
  .map(([, name, value]) => [name!.replace(/-([a-z])/g, (_all, letter: string) => letter.toUpperCase()), unescape(value!)]))));

const worked = { work: { work_id: "w1", executor: { kind: "assistant" }, state: "completed" }, reviews: [], cards: [],
  objects: [{ relation: "result", open: { surface: "pages", id: "a" }, state: "current", subject: { kind: "page", id: "a" }, title: "周报", recorded_revision: null, current_revision: null, recorded_at: "" }],
  rounds: [{ run_id: "run-1", text: "整理周报", phase: "completed", awaiting_input: [], activity: [], materials: [], context: null, started_at: "", ended_at: null,
    turns: [{ turn_id: "t1", kind: "user", text: "再加上第三季度的数字", at: null, steer: { id: "s1", state: "read" } }] }] } as AssistantWorkView;
const say = (text: string, values?: Record<string, string | number>) => Object.entries(values ?? {}).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, String(value)), text);

/** The row as the island makes it, over a conversation whose records are given. */
function row(records: Control[]) {
  const jumped: Control[] = [], other: string[] = [], bound: Control[] = [];
  let onStep: ((index: number, button: { dataset: { ixStepId: string } }) => void) | null = null;
  const context = vm.createContext({ CSS: { escape: (value: string) => value.replace(/["\\]/g, "\\$&") } });
  const factory = vm.runInContext(`(${ASSISTANT_STEP_ROW_FACTORY_SCRIPT})`, context) as (input: unknown) => { paint(): void };
  factory({ row: { hidden: false, querySelector: () => null, addEventListener: () => {} }, thread: control({}, records), L: (text: string) => text, el: () => ({}),
    drawn: (_row: unknown, _html: string, handlers: { onStep: typeof onStep }) => { onStep = handlers.onStep; },
    jumpTo: (record: Control) => { jumped.push(record); }, bindText: (record: Control) => { bound.push(record); },
    view: () => ({ work: { work_id: "w1" }, next_html: "<steps>", next_all_html: "<steps>" }), open: () => true, take: () => {}, other: (id: string) => { other.push(id); } }).paint();
  return { go: (id: string) => { assert.ok(onStep); onStep(0, { dataset: { ixStepId: id } }); }, jumped, other, bound };
}

test("RCPT-375: the outcome slot's step presses the note's own button for the result, as the person would; a disabled button or no note only brings it into view", () => {
  const html = deliveryNoteHtml(deliveryNote(worked)!, say), steps = deliverySteps(worked, say).map(step => step.id);
  assert.deepEqual(steps, ["delivery:w1", "delivery:w1:open:page:a"]);
  assert.ok(html.startsWith(wrap("w1", "").slice(0, -"</div>".length)), "the record the Host writes is keyed as the first step names it");
  const buttons = fromHtml(html), supplement = buttons.find(one => one.dataset["input"] !== undefined)!, result = buttons.find(one => one.dataset["assistantObject"] !== undefined)!;
  assert.deepEqual([supplement.dataset["input"], result.dataset["assistantObject"], result.dataset["ixPress"]], ["s1", "0", "open:page:a"], "the buttons the Host wrote");
  const record = control({ ixRecord: "delivery:w1" }, [supplement, result]);
  const shown = row([record]);
  assert.deepEqual(shown.bound, [record], "the row binds the note once, so the result button opens as a reply's does");
  shown.go(steps[0]!);
  assert.deepEqual([result.pressed, supplement.pressed, shown.jumped.length], [0, 0, 1], "the note itself: brought into view, nothing pressed");
  shown.go(steps[1]!);
  assert.deepEqual([result.pressed, supplement.pressed, shown.jumped.length], [1, 0, 2], "the result's button, and the note is brought into view with it");
  result.disabled = true;
  shown.go(steps[1]!);
  assert.deepEqual([result.pressed, shown.jumped.length], [1, 3], "a disabled button is not pressed");
  const gone = row([control({ card: "c1" })]);
  gone.go(steps[1]!);
  assert.deepEqual([gone.jumped.length, gone.other], [0, [steps[1]]], "no note in the conversation: the step goes to the island, nothing is pressed");
});
