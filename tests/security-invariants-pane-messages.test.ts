// Security invariant S-30 (docs/system/SECURITY-INVARIANTS.md): a split pane and the page around it take each other's
// messages only from this origin and from each other's window; a token handed to one pane is taken back by that pane's
// frame alone, and once. The shipped check (every pane-message handler on either side asks it first) runs here on a small
// window port. Public entries only (tests may not reach into package sources: pnpm health:check).
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { CONTEXT_ACTIONS_FACTORY_SCRIPT, PANE_MESSAGES_SCRIPT, SIDE_FORWARD_SCRIPT } from "@molis-ai/molis-work-app-workbench";

const ORIGIN = "http://127.0.0.1:4173";
interface Panes {
  from(event: unknown): unknown;
  fromParent(event: unknown): boolean;
  keep(token: string, frame: unknown, value: unknown): void;
  take(token: string, frame: unknown): unknown;
}

/** The page around the panes: two pane frames, and a frame that is not a pane. */
function page() {
  const top: Record<string, unknown> = {};
  top.parent = top;
  const paneA = { contentWindow: { name: "pane a" }, dataset: { paneOwner: "a" } };
  const paneB = { contentWindow: { name: "pane b" }, dataset: { paneOwner: "b" } };
  const stray = { contentWindow: { name: "not a pane" }, dataset: {} };
  const document = { querySelectorAll: (selector: string) => selector === "iframe[data-pane-owner]" ? [paneA, paneB] : [paneA, paneB, stray] };
  const panes = vm.runInNewContext(PANE_MESSAGES_SCRIPT, { window: top, document, location: { origin: ORIGIN } }) as Panes;
  return { top, paneA, paneB, stray, panes };
}

/** Inside a pane: the page around it, and another window. */
function pane() {
  const around = { name: "page" };
  const self: Record<string, unknown> = { parent: around };
  const panes = vm.runInNewContext(PANE_MESSAGES_SCRIPT, { window: self, document: { querySelectorAll: () => [] }, location: { origin: ORIGIN } }) as Panes;
  return { around, self, panes };
}

test("S-30 the page takes a pane message only from this origin and from the window of one of its panes", () => {
  const { top, paneA, paneB, stray, panes } = page();
  const message = { type: "workbench-surface-landing", landing: null };
  assert.equal(panes.from({ origin: ORIGIN, source: paneA.contentWindow, data: message }), paneA, "a pane's own message names its frame");
  assert.equal(panes.from({ origin: ORIGIN, source: paneB.contentWindow, data: message }), paneB);
  assert.equal(panes.from({ origin: ORIGIN, source: stray.contentWindow, data: message }), null, "a frame that is not a pane");
  assert.equal(panes.from({ origin: ORIGIN, source: top, data: message }), null, "the page itself");
  assert.equal(panes.from({ origin: ORIGIN, source: { name: "another window" }, data: message }), null, "a window that is not a frame here (a popup, an opener)");
  for (const origin of ["http://127.0.0.1:4174", "http://localhost:4173", "https://example.com", "null", ""]) {
    assert.equal(panes.from({ origin, source: paneA.contentWindow, data: message }), null, `from ${JSON.stringify(origin)}`);
  }
  for (const data of [null, undefined, "workbench-surface-landing", { type: 7 }, {}]) {
    assert.equal(panes.from({ origin: ORIGIN, source: paneA.contentWindow, data }), null, `data ${JSON.stringify(data)}`);
  }
});

test("S-30 a pane takes a message only from the page around it, from this origin", () => {
  const { around, self, panes } = pane();
  const message = { type: "workbench-context-attach-chosen", token: "t" };
  assert.equal(panes.fromParent({ origin: ORIGIN, source: around, data: message }), true);
  assert.equal(panes.fromParent({ origin: ORIGIN, source: self, data: message }), false, "the pane's own window");
  assert.equal(panes.fromParent({ origin: ORIGIN, source: { name: "a sibling pane" }, data: message }), false, "another pane or window");
  assert.equal(panes.fromParent({ origin: "https://example.com", source: around, data: message }), false, "another origin");
  assert.equal(panes.fromParent({ origin: ORIGIN, source: around, data: { token: "t" } }), false, "no type");
  // A page that is not framed has no page around it: what it posts to itself is not from a parent.
  const alone: Record<string, unknown> = {};
  alone.parent = alone;
  const top = vm.runInNewContext(PANE_MESSAGES_SCRIPT, { window: alone, document: { querySelectorAll: () => [] }, location: { origin: ORIGIN } }) as Panes;
  assert.equal(top.fromParent({ origin: ORIGIN, source: alone, data: message }), false);
});

test("S-30 RAC-2687 generic view updates retain the exact pane-window and parent-origin refusals", () => {
  const { paneA, paneB, stray, panes } = page();
  for (const view of ["work", "source-a", "all", undefined]) {
    const data = { type: "workbench-pane-view", view, paneId: "b" };
    assert.equal(panes.from({ origin: ORIGIN, source: paneA.contentWindow, data }), paneA, "a supplied pane id cannot impersonate pane B");
    assert.notEqual(panes.from({ origin: ORIGIN, source: paneA.contentWindow, data }), paneB);
    assert.equal(panes.from({ origin: ORIGIN, source: stray.contentWindow, data }), null);
    assert.equal(panes.from({ origin: "https://example.com", source: paneA.contentWindow, data }), null);
    const inside = pane(), reply = { type: "workbench-view", view };
    assert.equal(inside.panes.fromParent({ origin: ORIGIN, source: inside.around, data: reply }), true);
    assert.equal(inside.panes.fromParent({ origin: ORIGIN, source: paneB.contentWindow, data: reply }), false);
    assert.equal(inside.panes.fromParent({ origin: "null", source: inside.around, data: reply }), false);
  }
});

test("S-30 a token handed to one pane is taken back only by that pane's frame, and only once", () => {
  const { paneA, paneB, panes } = page();
  const choice = { run: "the ranked landing" };
  panes.keep("token-1", paneA, choice);
  assert.equal(panes.take("token-1", paneB), null, "another pane cannot use it");
  assert.equal(panes.take("token-2", paneA), null, "a token that was never handed out");
  assert.equal(panes.take("token-1", paneA), choice, "its own pane takes it");
  assert.equal(panes.take("token-1", paneA), null, "a second time it is gone");
});

test("S-30 a pane shows its landing only when the page around it asks, from this origin", () => {
  const { around, self, panes } = pane();
  const flash = { type: "workbench-surface-landing-flash" };
  assert.equal(panes.fromParent({ origin: ORIGIN, source: around, data: flash }), true, "the page around it");
  assert.equal(panes.fromParent({ origin: ORIGIN, source: self, data: flash }), false, "the pane asking itself");
  assert.equal(panes.fromParent({ origin: ORIGIN, source: { name: "a sibling pane" }, data: flash }), false, "a sibling pane or a popup");
  for (const origin of ["http://127.0.0.1:4174", "https://example.com", "null"]) {
    assert.equal(panes.fromParent({ origin, source: around, data: flash }), false, `from ${JSON.stringify(origin)}`);
  }
  // The page does not take it back from a pane: a pane cannot make the page around it, or another pane, flash.
  const { paneA, panes: top } = page();
  assert.equal(top.fromParent({ origin: ORIGIN, source: paneA.contentWindow, data: flash }), false);
});

test("S-30 the page takes a side view's message only from this origin and from the window of a side panel plugin frame", () => {
  const top: Record<string, unknown> = {};
  top.parent = top;
  const shelf = { contentWindow: { name: "shelf side view" } };
  const pane = { contentWindow: { name: "a split pane" } };
  const document = { querySelectorAll: (selector: string) => selector === "#side-panel iframe[data-side-frame]" ? [shelf] : selector === "iframe[data-pane-owner]" ? [pane] : [] };
  const panes = vm.runInNewContext(SIDE_FORWARD_SCRIPT, { window: top, document, location: { origin: ORIGIN }, CustomEvent: class {} }) as { from(event: unknown): unknown };
  const message = { type: "molis:side-forward", name: "molis:placement-result", detail: {} };
  assert.equal(panes.from({ origin: ORIGIN, source: shelf.contentWindow, data: message }), shelf);
  assert.equal(panes.from({ origin: ORIGIN, source: pane.contentWindow, data: message }), null, "a split pane is not a side view");
  assert.equal(panes.from({ origin: ORIGIN, source: top, data: message }), null, "the page itself");
  assert.equal(panes.from({ origin: ORIGIN, source: { name: "a popup" }, data: message }), null, "a window that is not a frame here");
  for (const origin of ["http://127.0.0.1:4174", "https://example.com", "null", ""]) {
    assert.equal(panes.from({ origin, source: shelf.contentWindow, data: message }), null, `from ${JSON.stringify(origin)}`);
  }
  assert.equal(panes.from({ origin: ORIGIN, source: shelf.contentWindow, data: { name: "molis:placement-result" } }), null, "no type");
});

test("S-30 a side view hands the page only the events on the one list; any other name is dropped", () => {
  class CustomEvent { constructor(readonly type: string, readonly init: { detail: unknown }) {} }
  const forwarded = vm.runInNewContext(SIDE_FORWARD_SCRIPT, { CustomEvent }) as { names: string[]; event(name: unknown, detail: unknown): CustomEvent | null };
  assert.deepEqual([...forwarded.names], ["molis:surface-interaction", "molis:placement-convert", "molis:placement-request", "molis:placement-result", "molis:assistant-message"]);
  const made = forwarded.event("molis:placement-result", { verb: "received" });
  assert.equal(made?.type, "molis:placement-result");
  assert.deepEqual(made?.init.detail, { verb: "received" });
  for (const name of ["molis:side-open", "molis:shelf-admit", "molis-work:open-settings-path", "constructor", "toString", "__proto__", "hasOwnProperty", "", 7, null, undefined, ["molis:placement-result"]]) {
    assert.equal(forwarded.event(name, {}), null, `name ${JSON.stringify(name)}`);
  }
});

test("S-30 RAC-916-L5: a known side owner relays the complete Assistant offer; foreign origins, opaque children and other windows remain refused", () => {
  class CustomEvent { constructor(readonly type: string, readonly init: { detail: unknown }) {} }
  const top = {}, side = { contentWindow: {} }, pane = { contentWindow: {} }, opaqueChild = {};
  const document = { querySelectorAll: (selector: string) => selector === "#side-panel iframe[data-side-frame]" ? [side] : [pane] };
  const forwarded = vm.runInNewContext(SIDE_FORWARD_SCRIPT, { window: top, document, location: { origin: ORIGIN }, CustomEvent }) as {
    from(event: unknown): unknown; event(name: unknown, detail: unknown): CustomEvent | null;
  };
  const detail = { message_id: "offer-1", purpose: "suggest", source: { surface: "pages", title: "评论与备注", plugin_id: "io.molis.work.pages" },
    object: { kind: "pages_document", id: "doc-1", title: "周报" }, text: '评论"\n全文',
    thread: { thread_id: "t1", message_id: "m1", draft: { text: '草稿"\n全文', revision: "7" } } };
  const relay = (origin: string, source: unknown, name: unknown) => {
    const data = { type: "molis:side-forward", name, detail };
    return forwarded.from({ origin, source, data }) ? forwarded.event(name, detail) : null;
  };
  const made = relay(ORIGIN, side.contentWindow, "molis:assistant-message");
  assert.equal(made?.type, "molis:assistant-message");
  assert.equal(made?.init.detail, detail, "the complete id, verified source, object, comment, thread and draft are handed on without reinterpreting them");
  for (const origin of ["http://127.0.0.1:4174", "http://localhost:4173", "https://example.com", "null", ""]) {
    assert.equal(relay(origin, side.contentWindow, "molis:assistant-message"), null, `foreign or opaque origin ${JSON.stringify(origin)}`);
  }
  for (const source of [pane.contentWindow, opaqueChild, top, {}, null]) {
    assert.equal(relay(ORIGIN, source, "molis:assistant-message"), null, "a split pane, opaque plugin child, top or unknown window is not the registered side owner");
  }
  for (const name of ["molis:assistant-reply", "molis:threads-start", "constructor", "toString", "__proto__", "hasOwnProperty", "", 7, null, undefined]) {
    assert.equal(relay(ORIGIN, side.contentWindow, name), null, `unknown or prototype event name ${JSON.stringify(name)}`);
  }
});

/**
 * The page's context bus with what a side view has in hand (specs/context-program §21.4 W3-C, specs/side-shelf AC-S04): the
 * shipped factory runs on a small page port. A `workbench-surface-focus` counts only from the window of a side panel plugin
 * frame (the same `SIDE_FRAME_FROM_SCRIPT` check as `molis:side-forward`) or of a split pane; from anywhere else it is dropped:
 * nothing is asked of the Host and no toolbar is drawn, here or in any frame.
 */
function contextPage() {
  const requests: Array<{ path: string; body: Record<string, unknown> }> = [], told: Array<{ to: string; message: Record<string, unknown> }> = [];
  const windowListeners: Array<(event: unknown) => void> = [];
  const timers: Array<() => void> = [];
  const made: Array<Record<string, unknown>> = [];
  const element = (extra: Record<string, unknown> = {}): Record<string, unknown> => {
    const self: Record<string, unknown> = {
      hidden: true, textContent: "", className: "", dataset: {}, style: { setProperty() {} }, children: [], isConnected: true,
      classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, setAttribute() {}, getAttribute: () => null, removeAttribute() {},
      toggleAttribute() {}, hasAttribute: () => false, matches: () => false, closest: () => null, contains: () => false, remove() {}, focus() {},
      append(...nodes: unknown[]) { (self.children as unknown[]).push(...nodes); }, replaceChildren(...nodes: unknown[]) { self.children = nodes; },
      querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
      getBoundingClientRect: () => ({ left: 0, right: 10, top: 0, bottom: 10, width: 10, height: 10 }), getClientRects: () => [{}], ...extra,
    };
    return self;
  };
  const frameWindow = (to: string) => ({ postMessage: (message: Record<string, unknown>) => told.push({ to, message }) });
  // The Shelf tab's frame sits in the side panel's cell for that tab (context-landing's `place`).
  const cell = { dataset: { sideBody: "plugin:shelf/side" } };
  const shelf = element({ contentWindow: frameWindow("shelf"), closest: (selector: string) => selector === "[data-side-panel] [data-side-body]" ? cell : null });
  const pane = element({ contentWindow: frameWindow("pane"), dataset: { paneOwner: "pane-b" } });
  // A same-origin frame that is neither: a plugin's own preview inside the work area, say.
  const stray = element({ contentWindow: frameWindow("stray") });
  const top: Record<string, unknown> = { addEventListener: (type: string, fn: (event: unknown) => void) => { if (type === "message") windowListeners.push(fn); }, dispatchEvent: () => true };
  top.parent = top;
  const document = {
    body: element({ append() {} }), documentElement: element(), activeElement: null,
    createElement: () => { const node = element(); made.push(node); return node; },
    querySelector: () => null, getElementById: () => null, dispatchEvent: () => true,
    addEventListener: (type: string, fn: (event: unknown) => void) => { (documentListeners[type] ||= []).push(fn); },
    querySelectorAll: (selector: string) => selector === "#side-panel iframe[data-side-frame]" ? [shelf] : selector === "iframe[data-pane-owner]" ? [pane] : [],
  };
  const documentListeners: Record<string, Array<(event: unknown) => void>> = {};
  class PageElement {}
  // A write, and 「插入到光标处」 for the landing on the left (W3-C2).
  const plan = { context_id: "ctx-1", primary: ["k"], more: [], candidates: [{ key: "k", title: "放进 Goal", available: true, source: { provider_id: "io.molis.work.goals" } },
    { key: "attach.cursor", origin: "attach", title: "插入到光标处", available: true, source: { provider_id: "io.molis.work.pages" } }] };
  const context = vm.createContext({
    window: top, document, location: { origin: ORIGIN, href: ORIGIN + "/projects/p/" }, innerWidth: 1440, innerHeight: 900,
    matchMedia: () => ({ matches: false }), getSelection: () => null, addEventListener() {}, MutationObserver: class { observe() {} },
    setTimeout: (fn: () => void) => { timers.push(fn); return timers.length; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    CustomEvent: class { constructor(readonly type: string, readonly init: unknown) {} }, crypto: { randomUUID: () => "id" }, AbortController,
    HTMLIFrameElement: class {}, Element: PageElement,
    molisWorkRequest: (path: string, options: { body?: Record<string, unknown> } = {}) => {
      requests.push({ path, body: options.body ?? {} });
      return Promise.resolve(path.endsWith("/candidates") || path.endsWith("/judge") ? { plan, receipt: {} } : {});
    },
  });
  const factory = vm.runInContext(`(${CONTEXT_ACTIONS_FACTORY_SCRIPT})`, context) as (host: unknown) => unknown;
  factory({ translate: (text: string) => text, route: (path: string) => path, showToast() {}, paneMessages: vm.runInContext(PANE_MESSAGES_SCRIPT, context) });
  const settle = async () => { for (let round = 0; round < 6; round += 1) { await new Promise(resolve => setImmediate(resolve)); timers.splice(0).forEach(fn => fn()); } };
  const focus = { context_id: "ctx-1", plugin_id: "io.molis.work.shelf", activity: "selecting", granularity: "range",
    object: { kind: "shelf_item", id: "item-1", title: "在手材料.md" }, targets: [{ kind: "text_range", role: "paragraph", text: "右栏里选中的一段" }] };
  const send = (source: unknown, origin = ORIGIN, claims: Record<string, unknown> = {}) =>
    windowListeners.forEach(fn => fn({ origin, source, data: { type: "workbench-surface-focus", focus: { ...focus, ...claims } } }));
  const toolbarShown = () => made.some(node => node.className === "mw-ctx" && node.hidden === false);
  // Pages on the left reports where a thing in hand would go: its editor is the landing's element, and hears the flash.
  const flashes: string[] = [];
  const editor = Object.setPrototypeOf(element({ dispatchEvent: (event: { type: string }) => { flashes.push(event.type); return true; } }), PageElement.prototype);
  const land = () => (documentListeners["molis:surface-landing"] ?? []).forEach(fn => fn({ target: editor, detail: { plugin_id: "io.molis.work.pages", object: { kind: "pages_document", id: "doc-1" }, position: "cursor", version: 1 } }));
  const hold = (source: unknown, pointed: unknown, context_id = focus.context_id) =>
    windowListeners.forEach(fn => fn({ origin: ORIGIN, source, data: { type: "workbench-context-hold", context_id, interacting: true, pinned: [], pointed } }));
  // A card in the Assistant on this page.
  const inAssistant = Object.setPrototypeOf(element({ closest: (selector: string) => selector === "[data-assistant-island]" ? {} : null }), PageElement.prototype);
  // A surface in this document reports what it has in hand: by default one on the left (not in the right panel or the Assistant).
  const focusHere = (claims: Record<string, unknown>, target: unknown = editor) => (documentListeners["molis:surface-focus"] ?? []).forEach(fn => fn({ target, detail: { ...focus, ...claims } }));
  return { top, shelf, pane, stray, requests, told, send, settle, toolbarShown, land, hold, flashes, focusHere, inAssistant };
}

test("S-30 AC-S04 a workbench-surface-focus that is not from a side panel plugin frame (or a split pane) is dropped: nothing is asked, no toolbar", async () => {
  type Page = ReturnType<typeof contextPage>;
  const refused: Array<[string, (page: Page) => unknown, string?]> = [
    ["a same-origin frame that is not a side tab", page => page.stray.contentWindow],
    ["the page itself", page => page.top],
    ["a window that is not a frame here", () => ({ postMessage() {} })],
    ...["http://127.0.0.1:4174", "https://example.com", "null", ""].map((origin): [string, (page: Page) => unknown, string] => [`the Shelf frame, from ${JSON.stringify(origin)}`, page => page.shelf.contentWindow, origin]),
  ];
  for (const [why, source, origin] of refused) {
    const page = contextPage();
    page.send(source(page), origin);
    await page.settle();
    assert.deepEqual(page.requests.filter(request => request.path.startsWith("/api/contextual/")), [], `${why}: nothing asked of the Host`);
    assert.deepEqual(page.told, [], `${why}: no toolbar drawn in any frame`);
    assert.equal(page.toolbarShown(), false, `${why}: no toolbar on the page`);
  }

  // From the Shelf tab's frame it counts: marked as in the side panel and which tab, and that frame draws the toolbar.
  const page = contextPage();
  page.send(page.shelf.contentWindow);
  await page.settle();
  const asked = page.requests.find(request => request.path === "/api/contextual/candidates");
  assert.ok(asked, "the Host is asked for the candidates");
  assert.equal(asked.body.pane_id, "side");
  assert.deepEqual([(asked.body.focus as Record<string, unknown>).place, (asked.body.focus as Record<string, unknown>).side_tab], ["side", "plugin:shelf/side"]);
  assert.ok(page.told.some(({ to, message }) => to === "shelf" && message.type === "workbench-context-view" && message.op === "render"), "the Shelf frame is told to draw it");
  assert.ok(page.told.every(({ to }) => to === "shelf"), "no other frame hears of it");
  assert.equal(page.toolbarShown(), false, "the page draws none of its own");
});

// Anti-corruption §10.28 on #712 and #720: where a surface is (left, right panel and which cell, Assistant) is read from its
// element on this page, never from what it says; before, a split pane or this page's own surface that said "side" kept it.
test("S-30 §10.28 a place or side tab a surface reports of itself is replaced by where its element is", async () => {
  const asked = async (page: ReturnType<typeof contextPage>) => {
    await page.settle();
    const request = page.requests.find(one => one.path === "/api/contextual/candidates");
    assert.ok(request, "the Host is asked for the candidates");
    const focus = request.body.focus as Record<string, unknown>;
    return [focus.place, focus.side_tab];
  };
  const forged = { place: "side", side_tab: "plugin:forged/side" };
  const pane = contextPage();
  pane.send(pane.pane.contentWindow, ORIGIN, forged);
  assert.deepEqual(await asked(pane), ["main", undefined], "a split pane is on the left, whatever it says");
  const here = contextPage();
  here.focusHere(forged);
  assert.deepEqual(await asked(here), ["main", undefined], "this page's own surface is on the left, whatever it says");
  const island = contextPage();
  island.focusHere({ place: "main", side_tab: "plugin:forged/side" }, island.inAssistant);
  assert.deepEqual(await asked(island), ["assistant", undefined], "a surface in the Assistant is in the Assistant, whatever it says");
  const shelf = contextPage();
  shelf.send(shelf.shelf.contentWindow, ORIGIN, { place: "assistant", side_tab: "plugin:forged/side" });
  assert.deepEqual(await asked(shelf), ["side", "plugin:shelf/side"], "the Shelf tab is in its own cell of the right panel, whatever it says");
});

test("S-30 W3-C2 a side tab's hold flashes the landing on the left only for an attach key of the page's own plan, and only from that tab", async () => {
  const page = contextPage();
  page.land();
  page.send(page.shelf.contentWindow);
  await page.settle();
  // Whatever the frame names is looked up in the plan this page holds; anything else flashes nothing.
  for (const pointed of [["k"], [7, null, {}], "attach.cursor", { 0: "attach.cursor", length: 1 }, ["attach.other"], [], undefined]) {
    page.hold(page.shelf.contentWindow, pointed);
    assert.deepEqual(page.flashes, [], `pointed ${JSON.stringify(pointed)}: nothing flashes`);
  }
  // Another source with a valid key, or the tab about a passage it no longer holds: dropped before the key is read.
  page.hold(page.stray.contentWindow, ["attach.cursor"]);
  page.hold(page.top, ["attach.cursor"]);
  page.hold(page.pane.contentWindow, ["attach.cursor"]);
  page.hold(page.shelf.contentWindow, ["attach.cursor"], "ctx-old");
  assert.deepEqual(page.flashes, [], "not from the frame that holds what is in hand: nothing flashes");
  // From the Shelf tab, hovering 「插入到光标处」 (on its bar or in its menu): the landing flashes once, not again while it stays under the pointer.
  page.hold(page.shelf.contentWindow, ["k", "attach.cursor"]);
  page.hold(page.shelf.contentWindow, ["attach.cursor"]);
  assert.deepEqual(page.flashes, ["molis:surface-landing-flash"]);
  page.hold(page.shelf.contentWindow, []);
  page.hold(page.shelf.contentWindow, ["attach.cursor"]);
  assert.deepEqual(page.flashes, ["molis:surface-landing-flash", "molis:surface-landing-flash"], "left and came back: it flashes again");
});
