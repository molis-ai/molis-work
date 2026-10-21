// W3-A3b (specs/context-program §21.2 item 6; 统筹 10-17): a result the work made can be picked up in the Assistant's
// panel. The shipped script runs here on a small stand-in for the page: a click on the card or Enter / Space picks it (the
// whole object goes into hand as the Assistant's surface), a click on its title or buttons or one that ends a text selection
// does not, Esc or a press elsewhere (not on the bar) puts it down, picking it again offers it again, and a result that is gone
// cannot be picked.
// The stand-in can show only that the pick script is transparent to a click that belongs to the title or a button: the click
// is a real cancelable, bubbling event, still not cancelled and still on its way up when the script is done, and the handlers of
// the title and the button each ran once. That the title opens the *right* owner object is the card's own wiring, which this
// stand-in does not contain; context-pick-result.e2e.test.ts (PICK-02, QA-017) proves it on the real card.
// Public entries only (pnpm health:check).
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { ASSISTANT_WORK_OBJECTS_FACTORY_SCRIPT } from "@molis-ai/molis-work-app-workbench";

class Node extends EventTarget {
  readonly attributes = new Map<string, string>();
  tabIndex = -1;
  constructor(readonly tags: readonly string[] = [], readonly parent: Node | null = null) { super(); }
  setAttribute(name: string, value: unknown) { this.attributes.set(name, String(value)); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  removeAttribute(name: string) { this.attributes.delete(name); }
  contains(other: Node | null) { for (let at = other; at; at = at.parent) if (at === this) return true; return false; }
  closest(selector: string) { for (let at: Node | null = this; at; at = at.parent) if (selector.split(",").some((one) => at!.tags.includes(one.trim()))) return at; return null; }
  getBoundingClientRect() { const rect = { left: 10, top: 20, right: 210, bottom: 60, width: 200, height: 40 }; return { ...rect, toJSON: () => rect }; }
}

/** An event as if it came from \`target\` (inside the card, or elsewhere on the page). */
const aimed = (event: Event, target: Node) => Object.defineProperty(event, "target", { value: target });

type Focus = { context_id: string; plugin_id: string; granularity: string; object: { kind: string; id: string; title: string }; targets: { kind: string; text: string }[]; screen: { rect: { top: number } } } | null;

type Calls = { opened: { kind: string; id: string }[]; acted: number; followed: number; reachedPage: boolean[] };

function page() {
  const document = new EventTarget(), state = { selection: { isCollapsed: true, anchorNode: null as Node | null } };
  // The page the cards sit in: a click that the card did not stop still gets here.
  const list = new Node();
  const context = vm.createContext({ document, CustomEvent, Element: Node, crypto, getSelection: () => state.selection });
  const parts = vm.runInContext(`(${ASSISTANT_WORK_OBJECTS_FACTORY_SCRIPT})({ api: () => Promise.resolve({}), joined: new Set(), open: () => true, current: () => null,
    repaint: () => {}, L: (text) => text })`, context) as { pickable(node: Node, object: unknown, title: string): Node };
  const card = (state: string, title = "发布计划") => {
    const node = new Node([], list), reported: Focus[] = [];
    // Read across the script's realm as plain data.
    node.addEventListener("molis:surface-focus", (event) => reported.push(JSON.parse(JSON.stringify((event as CustomEvent<Focus>).detail))));
    parts.pickable(node, { relation: "result", subject: { kind: "pages_document", id: "doc-1" }, title, state }, title);
    // What the card holds besides its body: the title (a button that opens the object), another button, a link, and plain text.
    const holds = { title: new Node(["button"], node), button: new Node(["button"], node), link: new Node(["a"], node), text: new Node([], node) };
    // Each of them does its own thing when clicked, as the real card's do; the witnesses only count that it happened.
    const calls: Calls = { opened: [], acted: 0, followed: 0, reachedPage: [] };
    holds.title.addEventListener("click", () => calls.opened.push({ kind: "pages_document", id: "doc-1" }));
    holds.button.addEventListener("click", () => { calls.acted += 1; });
    holds.link.addEventListener("click", () => { calls.followed += 1; });
    list.addEventListener("click", (event) => { if (node.contains(event.target as Node)) calls.reachedPage.push(event.defaultPrevented); });
    return { node, reported, calls, ...holds };
  };
  const press = (target: Node) => document.dispatchEvent(aimed(new Event("pointerdown"), target));
  return { card, press, state };
}
const key = (node: Node, name: string) => {
  const event = new Event("keydown", { cancelable: true });
  Object.defineProperty(event, "key", { value: name });
  node.dispatchEvent(event);
  return event;
};
/**
 * A click as the browser makes it: it lands on `on`, can be cancelled, and goes up through the card to the page unless something
 * stops it. The same event object is handed to each element on the way, so what the script did to it can be read afterwards.
 */
const click = (on: Node) => {
  const event = aimed(new Event("click", { bubbles: true, cancelable: true }), on);
  for (let at: Node | null = on; at && !event.cancelBubble; at = at.parent) at.dispatchEvent(event);
  return event;
};

test("W3-A3b PICK-01: a click on a result card picks up the whole object as what is in hand on the Assistant's surface", () => {
  const { card } = page(), one = card("current");
  assert.equal(one.node.tabIndex, 0);
  assert.equal(one.node.getAttribute("role"), "group");
  assert.equal(one.node.getAttribute("aria-label"), "拿起：发布计划");
  click(one.node);
  const [focus] = one.reported;
  assert.ok(focus);
  assert.equal(focus.plugin_id, "assistant");
  assert.equal(focus.granularity, "object");
  assert.deepEqual(focus.object, { kind: "pages_document", id: "doc-1", title: "发布计划" });
  assert.deepEqual(focus.targets.map((target) => [target.kind, target.text]), [["object", "发布计划"]]);
  assert.equal(focus.screen.rect.top, 20, "the bar is drawn by the card");
  assert.equal(one.node.getAttribute("aria-current"), "true");
});

test("W3-A3b PICK-05: the card already in hand, picked again (its bar was put away), is offered again as a new context", () => {
  const { card } = page(), one = card("current");
  click(one.node);
  click(one.node);
  key(one.node, "Enter");
  assert.equal(one.reported.length, 3, "each pick offers it again");
  assert.equal(new Set(one.reported.map((focus) => focus!.context_id)).size, 3, "a new context each time, so the bar comes back");
  assert.ok(one.reported.every((focus) => focus!.object.id === "doc-1"));
  assert.equal(one.node.getAttribute("aria-current"), "true", "still the one in hand; nothing was put down");
});

test("W3-A3b PICK-01, PICK-03: Enter and Space pick the focused card the same as a click; Esc puts it down from the same card", () => {
  const { card } = page();
  for (const name of ["Enter", " "]) {
    const one = card("changed");
    const event = key(one.node, name);
    assert.equal(event.defaultPrevented, true);
    assert.equal(one.reported.length, 1, `${JSON.stringify(name)} picks it`);
    assert.equal(one.reported[0]!.granularity, "object");
    const escape = key(one.node, "Escape");
    assert.equal(escape.defaultPrevented, true, "Esc is taken by the card, so the panel stays");
    assert.deepEqual(one.reported.slice(1), [null], "put down from the same card");
    assert.equal(one.node.getAttribute("aria-current"), null);
  }
  const idle = card("current");
  assert.equal(key(idle.node, "Escape").defaultPrevented, false, "Esc on a card not in hand goes on to the panel");
  assert.deepEqual(idle.reported, []);
});

test("W3-A3b PICK-02, QA-017: the title opens the object once and a button acts once, neither click is cancelled or picks, and a click that ends a text selection is reading, not picking", () => {
  const { card, state } = page(), one = card("current");
  const noPick = (what: string) => {
    assert.deepEqual(one.reported, [], `${what} emitted no pick up`);
    assert.equal(one.node.getAttribute("aria-current"), null, `${what} left nothing in hand`);
  };

  // The title opens the card's own object, exactly once; the script neither cancels the click nor stops it on its way up.
  const title = click(one.title);
  assert.equal(title.defaultPrevented, false, "a click on the title is not cancelled");
  assert.deepEqual(one.calls.opened, [{ kind: "pages_document", id: "doc-1" }], "the title's open happened once, for the card's own object");
  assert.deepEqual(one.calls.reachedPage, [false], "the click went on to the page, uncancelled");
  noPick("a click on the title");

  // The original button acts once; so does a link, which also keeps its default (the browser follows it).
  const button = click(one.button);
  assert.equal(button.defaultPrevented, false, "a click on the button is not cancelled");
  assert.equal(one.calls.acted, 1, "the button's own handler ran exactly once");
  assert.equal(one.calls.opened.length, 1, "the button did not open anything");
  noPick("a click on the button");
  const link = click(one.link);
  assert.equal(link.defaultPrevented, false, "a click on a link is not cancelled");
  assert.equal(one.calls.followed, 1);
  assert.deepEqual(one.calls.reachedPage, [false, false, false]);
  noPick("a click on a link");

  // A click that ends a text selection inside the card is reading: nothing is picked and the click is not cancelled, so the
  // selection survives. A selection that is somewhere else does not stop a pick, nor does a selection that is only a caret.
  state.selection = { isCollapsed: false, anchorNode: one.text };
  const reading = click(one.text);
  assert.equal(reading.defaultPrevented, false, "ending a selection is not cancelled");
  noPick("a click that ends a selection in the card");
  state.selection = { isCollapsed: false, anchorNode: one.node };
  click(one.node);
  noPick("a click that ends a selection anchored on the card itself");
  assert.equal(one.calls.opened.length + one.calls.acted + one.calls.followed, 3, "none of the clicks above did anything but its own");

  state.selection = { isCollapsed: false, anchorNode: new Node() };
  assert.equal(click(one.text).defaultPrevented, false);
  assert.equal(one.reported.length, 1, "a selection elsewhere does not stop it (so the silence above is the rule, not a dead listener)");
  state.selection = { isCollapsed: true, anchorNode: null };
  assert.equal(click(one.node).defaultPrevented, false, "even a pick leaves the click alone");
  assert.equal(one.reported.length, 2, "a plain click on the card is still a pick");
});

test("W3-A3b PICK-03: a press elsewhere puts the card down, a press on the bar does not; picking another card puts the first down", () => {
  const { card, press } = page(), one = card("current"), two = card("current", "预算");
  click(one.node);
  press(new Node([".mw-ctx"]));
  assert.equal(one.reported.length, 1, "the bar beside it keeps it in hand");
  press(one.title);
  assert.equal(one.reported.length, 1, "inside the card");
  click(two.node);
  assert.deepEqual(one.reported.slice(1), [null], "one thing in hand at a time");
  assert.equal(two.reported.length, 1);
  press(new Node());
  assert.deepEqual(two.reported.slice(1), [null]);
});

test("W3-A3b PICK-04: a result that is gone, unreadable or moved cannot be picked", () => {
  const { card } = page();
  for (const state of ["missing", "unavailable", "moved"]) {
    const one = card(state);
    assert.equal(one.node.tabIndex, -1, state);
    assert.equal(one.node.getAttribute("role"), null, state);
    click(one.node);
    key(one.node, "Enter");
    assert.deepEqual(one.reported, [], state);
  }
});
