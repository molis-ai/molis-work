// W3-A3b (specs/context-program §21.2 item 6; 统筹 10-17): a result the work made can be picked up in the Assistant's
// panel. The shipped script runs here on a small stand-in for the page: a click on the card or Enter / Space picks it (the
// whole object goes into hand as the Assistant's surface), a click on its title or buttons or one that ends a text selection
// does not, Esc or a press elsewhere (not on the bar) puts it down, picking it again offers it again, and a result that is gone
// cannot be picked.
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

function page() {
  const document = new EventTarget(), state = { selection: { isCollapsed: true, anchorNode: null as Node | null } };
  const context = vm.createContext({ document, CustomEvent, Element: Node, crypto, getSelection: () => state.selection });
  const parts = vm.runInContext(`(${ASSISTANT_WORK_OBJECTS_FACTORY_SCRIPT})({ api: () => Promise.resolve({}), joined: new Set(), open: () => true, current: () => null,
    repaint: () => {}, L: (text) => text })`, context) as { pickable(node: Node, object: unknown, title: string): Node };
  const card = (state: string, title = "发布计划") => {
    const node = new Node(), reported: Focus[] = [];
    // Read across the script's realm as plain data.
    node.addEventListener("molis:surface-focus", (event) => reported.push(JSON.parse(JSON.stringify((event as CustomEvent<Focus>).detail))));
    parts.pickable(node, { relation: "result", subject: { kind: "pages_document", id: "doc-1" }, title, state }, title);
    return { node, reported, title: new Node(["button"], node) };
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
const click = (node: Node, on: Node = node) => node.dispatchEvent(aimed(new Event("click"), on));

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

test("W3-A3b PICK-02: the title opens and buttons act; a click that ends a text selection is reading, not picking", () => {
  const { card, state } = page(), one = card("current");
  click(one.node, one.title);
  assert.deepEqual(one.reported, [], "a click on the title (or a button) is not a pick");
  state.selection = { isCollapsed: false, anchorNode: one.node };
  click(one.node);
  assert.deepEqual(one.reported, [], "a selection inside the card");
  state.selection = { isCollapsed: false, anchorNode: new Node() };
  click(one.node);
  assert.equal(one.reported.length, 1, "a selection elsewhere does not stop it");
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
