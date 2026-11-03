// RAC-2170–2174: what the workbench's context script hands on is cut on a whole character. The limits stay in UTF-16 units, the way the
// Host counts them (contextual-request.ts reads a target at 4000 and a heading at 200, and the Assistant's card check refuses a material over
// 20000). Three places in the shared part of the script (context-actions.ts): the passage the person selected (2000 a target), the headings
// above it (120 each) and the text a card carries to the Assistant (20000). The shipped factory runs on a small page port, as the host sends
// it (the same esbuild pass as served-page-text.ts); the plugin frame's own copy of the part is cut out of the script the host sends to frames.
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { CONTEXT_ACTIONS_FACTORY_SCRIPT, PANE_MESSAGES_SCRIPT, renderPluginFrameClientScript } from "@molis-ai/molis-work-app-workbench";

const ORIGIN = "http://127.0.0.1:4173";
const PAIR = "\u{1F7E2}"; // two UTF-16 units: U+D83D U+DFE2
const HALF = "\ud83d"; // the first half of PAIR, as a page could hand it over
const lone = (text: string) => /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(text);

interface Target { kind: string; role?: string; text: string; truncated?: boolean }
interface Focus { context_id: string; targets: Target[]; surroundings?: { heading_path: string[] } }
interface Request { path: string; body: Record<string, unknown> }

/** A script as the host sends it: the same whitespace and syntax pass as `tightenServedJs` (apps/local-host/src/served-page-text.ts). */
const served = (script: string): string => transformSync(`globalThis.factory = ${script};`, { loader: "js", minifyWhitespace: true, minifySyntax: true, legalComments: "none", charset: "utf8" }).code;

/** The copy of the part that a plugin's frame runs, cut out of the script the host sends to frames (apps/workbench/src/plugin-frame.ts). */
const frameCopy = (): string => {
  const sent = renderPluginFrameClientScript(), open = "return {surfaceFocus:(", close = "),mountPluginClient:(";
  const from = sent.indexOf(open), to = sent.indexOf(close, from);
  assert.ok(from >= 0 && to > from, "the frame script still hands out the selection reader as surfaceFocus");
  return sent.slice(from + open.length, to);
};

/**
 * The page's context script on a small port: what the shipped factory asks the Host (copied out of the vm as JSON), what a surface reports
 * of the passage selected in it (likewise), and the listeners it set on the document. A copy of `contextPage()` in
 * security-invariants-pane-messages.test.ts, with a selection the person makes in a surface that declares its object, and without the
 * panes and the side panel. `frame` runs it as a plugin frame does (`surfaceOnly`: the selection reader alone); `full` is the workbench's own page.
 */
function page(script: string, mode: "frame" | "full") {
  const requests: Request[] = [], reported: Array<Focus | null> = [], timers: Array<() => void> = [];
  const documentListeners: Record<string, Array<(event: unknown) => void>> = {};
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
  // The surface that declares its object (data-assistant-context), the headings above the passage, and the text the person selected in it.
  let passage = "", above: string[] = [];
  const surface = element({
    contains: () => true,
    getAttribute: (name: string) => name === "data-assistant-context"
      ? JSON.stringify({ plugin_id: "io.molis.work.pages", object: { kind: "pages_document", id: "doc-1", title: "计划" } }) : null,
    querySelectorAll: () => above.map(textContent => ({ tagName: "H2", textContent, compareDocumentPosition: () => 4 })),
    dispatchEvent: (event: { init: { detail: Focus | null } }) => { reported.push(JSON.parse(JSON.stringify(event.init.detail)) as Focus | null); return true; },
  });
  const paragraph = element({ nodeType: 1, closest: (selector: string) => selector === "[data-assistant-context]" ? surface : null });
  const textNode = { nodeType: 3, parentElement: paragraph };
  const selection = { isCollapsed: false, rangeCount: 1, anchorNode: textNode, focusNode: textNode, toString: () => passage, getRangeAt: () => ({ startContainer: textNode }) };
  const top: Record<string, unknown> = { addEventListener() {}, dispatchEvent: () => true };
  top.parent = top;
  const document = {
    body: element({ append() {} }), documentElement: element(), activeElement: null, createElement: () => element(),
    querySelector: () => null, getElementById: () => null, dispatchEvent: () => true, querySelectorAll: () => [],
    addEventListener: (type: string, fn: (event: unknown) => void) => { (documentListeners[type] ||= []).push(fn); },
  };
  class PageElement {}
  // One write on the bar: the page turns it into a card for the Assistant (candidate.apply "record").
  const action = { capability_id: "pages.docs.update", version: 1, provider_id: "io.molis.work.pages" };
  const plan = { context_id: "ctx-1", primary: ["k"], more: [], candidates: [{ key: "k", title: "记下这段", hint: "", available: true, apply: "record", action, source: { provider_id: "io.molis.work.pages" } }] };
  const context = vm.createContext({
    window: top, document, location: { origin: ORIGIN, href: ORIGIN + "/projects/p/" }, innerWidth: 1440, innerHeight: 900, Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
    matchMedia: () => ({ matches: false }), getSelection: () => passage ? selection : null, addEventListener() {}, MutationObserver: class { observe() {} },
    setTimeout: (fn: () => void) => { timers.push(fn); return timers.length; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    CustomEvent: class { type: string; init: unknown; constructor(type: string, init: unknown) { this.type = type; this.init = init; } },
    crypto: { randomUUID: () => "id" }, AbortController, HTMLIFrameElement: class {}, Element: PageElement,
    molisWorkRequest: (path: string, options: { body?: Record<string, unknown> } = {}) => {
      requests.push({ path, body: JSON.parse(JSON.stringify(options.body ?? {})) as Record<string, unknown> });
      if (path.endsWith("/candidates") || path.endsWith("/judge")) return Promise.resolve({ plan, receipt: {} });
      if (path.endsWith("/prepare")) return Promise.resolve({ summary: "记下这段", action, input: { text: "x" } });
      return Promise.resolve({});
    },
  });
  const factory = vm.runInContext(`${served(script)}\nglobalThis.factory`, context) as (host: unknown) => unknown;
  factory(mode === "frame" ? { translate: (text: string) => text, surfaceOnly: true }
    : { translate: (text: string) => text, route: (path: string) => path, showToast() {}, paneMessages: vm.runInContext(PANE_MESSAGES_SCRIPT, context) });
  const settle = async () => { for (let round = 0; round < 6; round += 1) { await new Promise(resolve => setImmediate(resolve)); timers.splice(0).forEach(fn => fn()); } };
  return {
    /** The person selects `text` under the headings `titles`; what the surface reports of it (the page settles 120 ms after the selection changes). */
    select(text: string, titles: string[] = []): Focus | null {
      passage = text; above = titles;
      (documentListeners.selectionchange ?? []).forEach(fn => fn({}));
      timers.splice(0).forEach(fn => fn());
      return reported.at(-1) ?? null;
    },
    /** A surface reports `targets` as what is in hand, and the person picks the write on the bar: the texts of the cards the page places in the Assistant. */
    async cards(targets: string[]): Promise<string[]> {
      const editor = Object.setPrototypeOf(element(), PageElement.prototype) as Record<string, unknown>;
      const focus = { context_id: "ctx-1", plugin_id: "io.molis.work.pages", activity: "selecting", granularity: "range",
        object: { kind: "pages_document", id: "doc-1", title: "计划" }, targets: targets.map(text => ({ kind: "text_range", role: "paragraph", text })) };
      (documentListeners["molis:surface-focus"] ?? []).forEach(fn => fn({ target: editor, detail: focus }));
      await settle();
      (documentListeners["molis:assistant-starter-choose"] ?? []).forEach(fn => fn({ detail: { object_key: "ctx-1", key: "k" } }));
      await settle();
      return requests.filter(request => request.path === "/api/assistant/cards")
        .map(request => (request.body.card as { materials: Array<{ text: string }> }).materials[0]!.text);
    },
  };
}

const targetsOf = (focus: Focus | null): Target[] => { assert.ok(focus, "the surface reported what is in hand"); return focus.targets; };
const SAYS = "选中的一句话";

const PASSAGES = [
  { name: "unit 2000 is the first half of a pair", text: "字".repeat(1999) + PAIR + "字".repeat(5), expected: "字".repeat(1999) },
  { name: "a pair ends exactly at unit 2000", text: "字".repeat(1998) + PAIR + "字".repeat(5), expected: "字".repeat(1998) + PAIR },
  { name: "1000 pairs after one plain character", text: "a" + PAIR.repeat(1000), expected: "a" + PAIR.repeat(999) },
  { name: "3000 plain characters", text: "a".repeat(3000), expected: "a".repeat(2000) },
];
const HEADINGS = [
  { name: "unit 120 is the first half of a pair", title: "章".repeat(119) + PAIR + "章".repeat(5), expected: "章".repeat(119) },
  { name: "a pair ends exactly at unit 120", title: "章".repeat(118) + PAIR + "章".repeat(5), expected: "章".repeat(118) + PAIR },
  { name: "spaces around it go before it is cut", title: "  " + "章".repeat(119) + PAIR + "章".repeat(5) + "  ", expected: "章".repeat(119) },
];
const FIRST = "字".repeat(10000);
const CARDS = [
  { name: "unit 20000 is the first half of a pair", second: "字".repeat(9997) + PAIR + "字".repeat(5), expected: "字".repeat(9997) },
  { name: "a pair ends exactly at unit 20000", second: "字".repeat(9996) + PAIR + "字".repeat(5), expected: "字".repeat(9996) + PAIR },
];

for (const { name, text, expected } of PASSAGES) {
  test(`RAC-2170 a selected passage over 2000 units is cut on a whole character, still marked cut: ${name}`, () => {
    const targets = targetsOf(page(CONTEXT_ACTIONS_FACTORY_SCRIPT, "frame").select(text));
    assert.deepEqual(targets, [{ kind: "text_range", role: "paragraph", text: expected, truncated: true }]);
    assert.equal(lone(targets[0]!.text), false, "no half of a character is left");
  });
}

for (const { name, title, expected } of HEADINGS) {
  test(`RAC-2171 a heading above the passage is cut at 120 units on a whole character: ${name}`, () => {
    const focus = page(CONTEXT_ACTIONS_FACTORY_SCRIPT, "frame").select(SAYS, [title]);
    assert.ok(focus);
    assert.deepEqual(focus.surroundings?.heading_path, [expected]);
  });
}

for (const { name, second, expected } of CARDS) {
  test(`RAC-2172 the passage a card carries to the Assistant is cut at 20000 units on a whole character: ${name}`, async () => {
    const texts = await page(CONTEXT_ACTIONS_FACTORY_SCRIPT, "full").cards([FIRST, second]);
    assert.deepEqual(texts, [FIRST + "\n\n" + expected]);
    assert.equal(lone(texts[0]!), false, "no half of a character is left");
    assert.ok(texts[0]!.length <= 20000, "the Host's card check takes at most 20000 units");
  });
}

test("RAC-2173 a passage of exactly 2000 units is not cut and not marked", () => {
  const text = "字".repeat(1998) + PAIR;
  assert.deepEqual(targetsOf(page(CONTEXT_ACTIONS_FACTORY_SCRIPT, "frame").select(text)), [{ kind: "text_range", role: "paragraph", text }]);
});

test("RAC-2173 a heading of exactly 120 units stays as it is, also when it ends on a pair or on half of one a page handed over", () => {
  for (const title of ["章".repeat(118) + PAIR, "章".repeat(119) + HALF]) {
    assert.deepEqual(page(CONTEXT_ACTIONS_FACTORY_SCRIPT, "frame").select(SAYS, [title])?.surroundings?.heading_path, [title]);
  }
});

test("RAC-2173 what a card carries, exactly 20000 units, stays as it is, also when it ends on a pair or on half of one a page handed over", async () => {
  for (const second of ["字".repeat(9996) + PAIR, "字".repeat(9997) + HALF]) {
    assert.deepEqual(await page(CONTEXT_ACTIONS_FACTORY_SCRIPT, "full").cards([FIRST, second]), [FIRST + "\n\n" + second]);
  }
});

for (const { name, text, expected } of PASSAGES.slice(0, 2)) {
  test(`RAC-2174 the reader a plugin frame runs cuts a passage on a whole character as well: ${name}`, () => {
    const targets = targetsOf(page(frameCopy(), "frame").select(text));
    assert.deepEqual(targets, [{ kind: "text_range", role: "paragraph", text: expected, truncated: true }]);
  });
}

for (const { name, title, expected } of HEADINGS.slice(0, 2)) {
  test(`RAC-2174 the reader a plugin frame runs cuts a heading on a whole character as well: ${name}`, () => {
    assert.deepEqual(page(frameCopy(), "frame").select(SAYS, [title])?.surroundings?.heading_path, [expected]);
  });
}
