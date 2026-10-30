// RAC-2170–2174: what a surface hands over from a plain DOM selection — each selected paragraph (2000), each heading above it
// (120) and the text given to the Assistant (20000) — is cut by whole characters, in UTF-16 units (what the Host counts). The
// shipped CONTEXT_PANE_FACTORY_SCRIPT (the part every plugin frame and side view runs) is run on a small page port here.
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { CONTEXT_ACTIONS_FACTORY_SCRIPT, renderPluginFrameClientScript } from "@molis-ai/molis-work-app-workbench";

const ORIGIN = "http://127.0.0.1:4173";
const GREEN = "\u{1F7E2}"; // one character, two UTF-16 units
const lone = (text: string) => /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(text);
const whole = (actual: string, expected: string, limit: number, why: string) => {
  assert.equal(actual, expected, why);
  assert.ok(actual.length <= limit, `${why}: ${actual.length} units, limit ${limit}`);
  assert.equal(lone(actual), false, `${why}: half a character left`);
};
const around = (max: number): Array<[string, string, string]> => [
  ["a two-unit character across the limit", "字".repeat(max - 1) + GREEN + "尾", "字".repeat(max - 1)],
  ["a two-unit character ending at the limit", "字".repeat(max - 2) + GREEN + "尾", "字".repeat(max - 2) + GREEN],
  ["only two-unit characters, the limit between two", GREEN.repeat(max), GREEN.repeat(max / 2)],
  ["one unit and two-unit characters, the limit inside one", "字" + GREEN.repeat(max), "字" + GREEN.repeat((max - 2) / 2)],
  ["one unit over the limit, no two-unit character", "字".repeat(max) + "尾", "字".repeat(max)],
  ["inside the limit", "字".repeat(10) + GREEN, "字".repeat(10) + GREEN],
];
const same = (text: string): Array<[string, string, string]> => [["inside the limit, unchanged", text, text]];

/** The pane part as the served frame asset builds it (`globalThis.molisFrameUi = (L) => ({ surfaceFocus: (<pane part>)… })`). */
const PANE_PART = (() => {
  const asset = renderPluginFrameClientScript();
  const start = asset.indexOf("surfaceFocus:("), end = asset.indexOf("),mountPluginClient:");
  assert.ok(start > 0 && end > start, "the served frame asset has the pane part");
  return asset.slice(start + "surfaceFocus:(".length, end);
})();

interface Port { shown: Array<{ context_id: string; targets: Array<{ text: string }>; surroundings?: { heading_path: string[] } }>;
  posted: Array<{ type: string; detail: Record<string, unknown> }>; selection(text: string, headings?: string[]): void; send(data: unknown): void }

/** The pane part (what every plugin frame and side view runs) on a small page port: it reports the focus it read and posts to its parent. */
function panePort(): Port {
  const posted: Port["posted"] = [], shown: Port["shown"] = [], documentListeners: Record<string, Array<(event: unknown) => void>> = {};
  const windowListeners: Record<string, Array<(event: unknown) => void>> = {};
  const timers: Array<() => void> = [];
  let selection: unknown = null, headings: unknown[] = [];
  const root = {
    isConnected: true, matches: () => false,
    dispatchEvent: (event: { type?: string; detail?: unknown }) => {
      if (event.detail) shown.push(event.detail as Port["shown"][number]);
      // The real event bubbles from the surface to the document, whose listener keeps it as what is in hand.
      try { (documentListeners[event.type ?? ""] ?? []).forEach(fn => fn(event)); } catch { /* the toolbar's DOM is not this port's business */ }
      return true;
    },
    querySelectorAll: () => headings, contains: () => true,
    getAttribute: (name: string) => name === "data-assistant-context" ? JSON.stringify({ plugin_id: "io.molis.work.test", object: { kind: "note", id: "n1", title: "笔记" } }) : null,
    closest: (selector: string) => selector === "[data-assistant-context]" ? root : null,
  };
  const element = (extra: Record<string, unknown> = {}) => ({ nodeType: 1, parentElement: null, isConnected: true, tagName: "P", closest: () => null, matches: () => false, ...extra });
  const textNode = (parent: Record<string, unknown>) => ({ nodeType: 3, parentElement: parent, parentNode: parent });
  const anchor = element({ closest: (selector: string) => selector === "[data-assistant-context]" ? root : null, contains: () => true, matches: () => false });
  const body = element({ dataset: {}, matches: (selector: string) => selector === "[data-pane-embedded]" });
  const document = {
    body, documentElement: element(), activeElement: null, createElement: () => element(), querySelector: () => null, querySelectorAll: () => [],
    getElementById: () => null, dispatchEvent: () => true,
    addEventListener: (type: string, fn: (event: unknown) => void) => { (documentListeners[type] ||= []).push(fn); },
  };
  const parent = { postMessage: (message: { type: string; detail?: unknown }) => posted.push(message as Port["posted"][number]) };
  const window: Record<string, unknown> = { parent, innerWidth: 1440, innerHeight: 900, addEventListener: (type: string, fn: (event: unknown) => void) => { (windowListeners[type] ||= []).push(fn); },
    dispatchEvent: () => true };
  window.window = window;
  const context = vm.createContext({ window, document, location: { origin: ORIGIN, href: ORIGIN + "/projects/p/" }, innerWidth: 1440, innerHeight: 900,
    matchMedia: () => ({ matches: false }), getSelection: () => selection, MutationObserver: class { observe() {} disconnect() {} }, setTimeout: (fn: () => void) => { timers.push(fn); return timers.length; },
    clearTimeout() {}, setInterval: () => 0, clearInterval: () => {}, crypto: { randomUUID: () => "id" }, AbortController, Element: class {},
    CustomEvent: class { type: string; detail: unknown; defaultPrevented = false; constructor(type: string, init: { detail?: unknown } = {}) { this.type = type; this.detail = init.detail; } preventDefault() { this.defaultPrevented = true; } },
    Node: { DOCUMENT_POSITION_FOLLOWING: 4 }, HTMLIFrameElement: class {},
    molisWorkRequest: () => Promise.resolve({}) });
  const factory = vm.runInContext(`(${PANE_PART})`, context) as (host: unknown) => unknown;
  const paneMessages = { from: () => null, fromParent: (event: { origin: string; source: unknown }) => event.origin === ORIGIN && event.source === parent, keep() {}, take: () => null };
  factory({ translate: (text: string) => text, route: (path: string) => path, paneMessages });
  return {
    shown, posted,
    selection(text: string, headingTexts: string[] = []) {
      const node = textNode(anchor);
      selection = { isCollapsed: false, rangeCount: 1, anchorNode: node, focusNode: node,
        getRangeAt: () => ({ startContainer: node, getBoundingClientRect: () => ({ left: 0, right: 1, top: 0, bottom: 1, width: 1, height: 1 }) }),
        toString: () => text };
      headings = headingTexts.map(text => ({ tagName: "H2", textContent: text, compareDocumentPosition: () => 4, closest: () => null }));
      (documentListeners["selectionchange"] ?? []).forEach(fn => fn({}));
      timers.splice(0).forEach(run => run());
    },
    send(data: unknown) { (windowListeners["message"] ?? []).forEach(fn => fn({ origin: ORIGIN, source: parent, data })); },
  };
}

const focusOf = (text: string, headings: string[] = []) => {
  const port = panePort();
  port.selection(text, headings);
  assert.equal(port.shown.length, 1, "the reader reports one focus");
  return { port, focus: port.shown[0]! };
};
/** The page's shipped factory on a small port: a pane reports a focus, then asks the page to bring what is in hand to the Assistant. */
function pagePort(): { quoted: (focus: Record<string, unknown>) => string } {
  const documentListeners: Record<string, Array<(event: unknown) => void>> = {}, windowListeners: Record<string, Array<(event: unknown) => void>> = {};
  const opened: Array<{ materials: Array<{ text: string }> }> = [], timers: Array<() => void> = [];
  const element = () => ({ hidden: true, textContent: "", dataset: {}, style: { setProperty() {} }, children: [], isConnected: true, classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, toggleAttribute() {}, hasAttribute: () => false, matches: () => false, closest: () => null,
    contains: () => false, remove() {}, focus() {}, append() {}, replaceChildren() {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
    removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, right: 1, top: 0, bottom: 1, width: 1, height: 1 }), getClientRects: () => [{}] });
  const document = {
    body: element(), documentElement: element(), activeElement: null, createElement: () => element(), querySelector: () => null, getElementById: () => null,
    querySelectorAll: () => [], addEventListener: (type: string, fn: (event: unknown) => void) => { (documentListeners[type] ||= []).push(fn); },
    dispatchEvent: (event: { type: string; detail?: unknown }) => { if (event.type === "molis:assistant-open") opened.push(event.detail as { materials: Array<{ text: string }> }); return true; },
  };
  const window = { addEventListener: (type: string, fn: (event: unknown) => void) => { (windowListeners[type] ||= []).push(fn); }, dispatchEvent: () => true, innerWidth: 1440, innerHeight: 900 };
  const frame = { dataset: { paneOwner: "side" }, contentWindow: {}, isConnected: true, closest: () => null, matches: () => false, getClientRects: () => [{}], hasAttribute: () => false };
  const context = vm.createContext({ window, document, location: { origin: ORIGIN, href: ORIGIN + "/projects/p/" }, innerWidth: 1440, innerHeight: 900,
    matchMedia: () => ({ matches: false }), getSelection: () => null, MutationObserver: class { observe() {} }, setTimeout: (fn: () => void) => { timers.push(fn); return timers.length; },
    clearTimeout() {}, setInterval: () => 0, clearInterval() {}, crypto: { randomUUID: () => "id" }, AbortController, Element: class {}, HTMLIFrameElement: class {},
    CustomEvent: class { type: string; detail: unknown; defaultPrevented = false; constructor(type: string, init: { detail?: unknown } = {}) { this.type = type; this.detail = init.detail; } preventDefault() { this.defaultPrevented = true; } },
    addEventListener() {}, removeEventListener() {}, molisWorkRequest: () => Promise.resolve({ plan: { context_id: "", candidates: [] }, receipt: {} }) });
  const factory = vm.runInContext(`(${CONTEXT_ACTIONS_FACTORY_SCRIPT})`, context) as (host: unknown) => unknown;
  factory({ translate: (text: string) => text, route: (path: string) => path, showToast() {},
    paneMessages: { from: () => frame, fromParent: () => false, keep() {}, take: () => null } });
  return { quoted(focus) {
    (windowListeners["message"] ?? []).forEach(fn => fn({ origin: ORIGIN, source: frame.contentWindow, data: { type: "workbench-surface-focus", focus } }));
    timers.splice(0).forEach(run => run());
    (windowListeners["message"] ?? []).forEach(fn => fn({ origin: ORIGIN, source: frame.contentWindow, data: { type: "workbench-context-assistant", context_id: (focus as { context_id: string }).context_id } }));
    const last = opened.at(-1);
    assert.ok(last, "the Assistant is told what is in hand");
    return last.materials[0]!.text;
  } };
}
const quotedOf = (text: string): string => pagePort().quoted({ context_id: "ctx-1", plugin_id: "io.molis.work.test", object: { kind: "note", id: "n1" }, activity: "selecting",
  granularity: "range", targets: [{ kind: "text_range", role: "paragraph", text }] });

test("RAC-2170 each selected paragraph is cut at 2000 units by whole characters", async t => {
  for (const [name, given, expected] of around(2000)) await t.test(name, () => {
    const { focus } = focusOf(given);
    assert.equal(focus.targets.length, 1);
    whole(focus.targets[0]!.text, expected, 2000, `paragraph: ${name}`);
  });
});

test("RAC-2171 each heading above the selection is cut at 120 units by whole characters", async t => {
  for (const [name, given, expected] of [...around(120), ["inside the limit, unchanged", "字".repeat(10) + GREEN, "字".repeat(10) + GREEN]]) await t.test(name, () => {
    const { focus } = focusOf("正文", [given]);
    assert.equal(focus.surroundings?.heading_path?.length, 1, `heading: ${name}`);
    assert.equal(String(focus.surroundings!.heading_path![0]), expected, `heading: ${name}`);
    assert.equal(lone(expected), false);
  });
});

test("RAC-2172 the text given to the Assistant is cut at 20000 units by whole characters", async t => {
  for (const [name, given, expected] of [...around(20000), ["exactly the limit", "字".repeat(10) + GREEN, "字".repeat(10) + GREEN]]) await t.test(name, () => {
    const text = quotedOf(given);
    whole(text, expected, 20000, `quoted: ${name}`);
  });
});

test("RAC-2173 values at or under a limit are returned as they are, never repaired", async t => {
  for (const [name, given, limit] of [["paragraph exactly 2000", "字".repeat(1998) + GREEN, 2000], ["heading exactly 120", "字".repeat(118) + GREEN, 120]] as const) await t.test(name, () => {
    const { focus } = focusOf(given, name.startsWith("heading") ? [given] : []);
    const actual = name.startsWith("heading") ? focus.surroundings!.heading_path![0]! : focus.targets[0]!.text;
    assert.equal(actual, given, `${name} is inside the limit, so it is not touched`);
    assert.equal(actual.length, limit);
  });
  await t.test("just under 20000 for the Assistant", () => {
    const given = "字".repeat(19998) + GREEN;
    assert.equal(quotedOf(given), given, "inside the limit, the text is handed over as it is");
  });
});

test("RAC-2174 the copy every plugin frame and side view runs cuts the same way", async t => {
  for (const [name, given, expected] of around(2000).slice(0, 2)) await t.test(`paragraph: ${name}`, () => {
    const { focus } = focusOf(given);
    whole(focus.targets[0]!.text, expected, 2000, `pane paragraph: ${name}`);
  });
  await t.test("the Assistant's text", () => {
    const given = "字".repeat(19999) + GREEN + "尾";
    whole(quotedOf(given), "字".repeat(19999), 20000, "pane quoted");
  });
});
