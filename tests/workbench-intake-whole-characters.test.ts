// RAC-1869–1871: the three places where the workbench bounds what a "put it in" control (data-context-intake) carries, by whole characters:
// the frame bridge (browser/plugin-frame/intake.ts, bundled here from its source), and the context bus's intake handler and starters
// (the shipped CONTEXT_ACTIONS_FACTORY_SCRIPT on a small page port). The limits stay in UTF-16 units, as the Host counts them.
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { buildSync } from "esbuild";
import { CONTEXT_ACTIONS_FACTORY_SCRIPT, PANE_MESSAGES_SCRIPT } from "@molis-ai/molis-work-app-workbench";

const ORIGIN = "http://127.0.0.1:4173";
const GREEN = "\u{1F7E2}"; // two UTF-16 units
const HALF = "字".repeat(10) + "\ud83d"; // half of GREEN, as a page could hand it over
const lone = (text: string) => /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(text);
const whole = (actual: string, expected: string, limit: number, why: string) => {
  assert.equal(actual, expected, why);
  assert.ok(actual.length <= limit, `${why}: ${actual.length} units, limit ${limit}`);
  if (expected !== HALF) assert.equal(lone(actual), false, `${why}: half a character`);
};
/** Values around the limit `max` (even): [name, given, expected]. The first and the fourth are cut across a two-unit character. */
const around = (max: number): Array<[string, string, string]> => [
  ["a two-unit character across the limit", "字".repeat(max - 1) + GREEN + "尾", "字".repeat(max - 1)],
  ["a two-unit character ending at the limit", "字".repeat(max - 2) + GREEN + "尾", "字".repeat(max - 2) + GREEN],
  ["only two-unit characters, the limit between two of them", GREEN.repeat(max), GREEN.repeat(max / 2)],
  ["only two-unit characters after one unit, the limit inside one", "字" + GREEN.repeat(max), "字" + GREEN.repeat((max - 2) / 2)],
  ["one unit over the limit, no two-unit character", "字".repeat(max) + "尾", "字".repeat(max)],
  ["inside the limit", "字".repeat(10) + GREEN, "字".repeat(10) + GREEN],
];
/** The same, plus a half character that arrived inside the limit: only a value over the limit is the cut's to repair. */
const cases = (max: number): Array<[string, string, string]> => [...around(max), ["a half character that arrived inside the limit stays", HALF, HALF]];
const FIELDS = [["title", 200], ["text", 4000]] as const;

// The frame bridge, bundled from its source: the shell's side of one frame. What the page posts goes through `pageIntake`; what it
// dispatches on the surface is kept.
const FRAME = buildSync({ entryPoints: [fileURLToPath(new URL("../apps/workbench/src/browser/plugin-frame/intake.ts", import.meta.url))],
  bundle: true, write: false, format: "iife", globalName: "Intake", platform: "browser", target: "es2022" }).outputFiles[0]!.text;
interface Detail { intake_id: string; id: string; title: string; text: string }
function frameBridge() {
  const asked: Detail[] = [], frame = {};
  class FakeEvent { constructor(readonly type: string, readonly init: { detail: Detail }) {} }
  const context = vm.createContext({ CustomEvent: FakeEvent, document: { activeElement: frame }, navigator: { userActivation: { isActive: true } } });
  vm.runInContext(FRAME, context);
  const pageIntake = vm.runInContext("Intake.pageIntake", context) as (scope: unknown, frame: unknown, root: unknown) => (message: unknown) => void;
  const root = { dispatchEvent: (event: FakeEvent) => { asked.push(JSON.parse(JSON.stringify(event.init.detail)) as Detail); return true; } };
  return { asked, post: pageIntake({ visible: true }, frame, root) };
}

// The page's context bus on a small port: what the shipped factory asks the Host (copied out of the vm as JSON), and the listeners it set
// on the document. A copy of `contextPage()` in security-invariants-pane-messages.test.ts without the side panel and the panes.
interface Focus { object: { title?: string }; targets: Array<{ text: string }> }
interface Request { path: string; body: { intake_id?: string; focus: Focus } }
function contextPage() {
  const requests: Request[] = [], timers: Array<() => void> = [], documentListeners: Record<string, Array<(event: unknown) => void>> = {};
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
  const top: Record<string, unknown> = { addEventListener() {}, dispatchEvent: () => true };
  top.parent = top;
  const document = {
    body: element({ append() {} }), documentElement: element(), activeElement: null, createElement: () => element(),
    querySelector: () => null, getElementById: () => null, dispatchEvent: () => true, querySelectorAll: () => [],
    addEventListener: (type: string, fn: (event: unknown) => void) => { (documentListeners[type] ||= []).push(fn); },
  };
  class PageElement {}
  const plan = { context_id: "ctx-1", primary: ["k"], more: [], candidates: [{ key: "k", title: "放进 Goal", available: true, source: { provider_id: "io.molis.work.goals" } }] };
  const context = vm.createContext({
    window: top, document, location: { origin: ORIGIN, href: ORIGIN + "/projects/p/" }, innerWidth: 1440, innerHeight: 900,
    matchMedia: () => ({ matches: false }), getSelection: () => null, addEventListener() {}, MutationObserver: class { observe() {} },
    setTimeout: (fn: () => void) => { timers.push(fn); return timers.length; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    CustomEvent: class { constructor(readonly type: string, readonly init: unknown) {} }, crypto: { randomUUID: () => "id" }, AbortController,
    HTMLIFrameElement: class {}, Element: PageElement, molisPlacement: { card() {} },
    molisWorkRequest: (path: string, options: { body?: unknown } = {}) => {
      requests.push({ path, body: JSON.parse(JSON.stringify(options.body ?? {})) as Request["body"] });
      if (path.endsWith("/surfaces")) return Promise.resolve({ surfaces: { lingguang: { plugin_id: "io.molis.work.lingguang", kind: "lingguang_spark" } } });
      if (path.endsWith("/create")) return Promise.resolve({ created: true, draft: { summary: "", title: "" } });
      return Promise.resolve(path.endsWith("/candidates") || path.endsWith("/judge") ? { plan, receipt: {} } : {});
    },
  });
  const factory = vm.runInContext(`(${CONTEXT_ACTIONS_FACTORY_SCRIPT})`, context) as (host: unknown) => unknown;
  factory({ translate: (text: string) => text, route: (path: string) => path, showToast() {}, paneMessages: vm.runInContext(PANE_MESSAGES_SCRIPT, context) });
  const settle = async () => { for (let round = 0; round < 6; round += 1) { await new Promise(resolve => setImmediate(resolve)); timers.splice(0).forEach(fn => fn()); } };
  const surface = { getAttribute: (name: string) => name === "data-work-surface" ? "lingguang" : null };
  const control = Object.setPrototypeOf(element({ closest: (selector: string) => selector === "[data-work-surface]" ? surface : null }), PageElement.prototype);
  return {
    settle, asked: (path: string) => requests.filter(request => request.path === path),
    /** A "put it in" control on the lingguang surface asks the workbench (what the frame bridge, or a click on a control in the page, dispatches). */
    intake: (detail: Record<string, unknown>) => (documentListeners["molis:context-intake"] ?? []).forEach(fn => fn({ target: control, detail })),
    /** The Assistant asks for the starters of the object open now. */
    starters: (object: Record<string, unknown>) => (documentListeners["molis:assistant-starters-request"] ?? []).forEach(fn => fn({ detail: { context: object, request_id: "r1" } })),
  };
}

test("RAC-1869 the frame bridge cuts a control's title (200) and text (4000) by whole characters, in units", async t => {
  for (const [field, max] of FIELDS) for (const [name, given, expected] of around(max)) await t.test(`${field}: ${name}`, () => {
    const { asked, post } = frameBridge();
    post({ type: "context-intake", intake_id: "todo", id: "spark-1", title: field === "title" ? given : "标题", text: field === "text" ? given : "正文" });
    assert.equal(asked.length, 1, "one request reaches the surface");
    whole(asked[0]![field], expected, max, `${field}: ${name}`);
    assert.equal(asked[0]![field === "title" ? "text" : "title"], field === "title" ? "正文" : "标题", "the other field is untouched");
  });
});

test("RAC-1869 the frame bridge still cuts intake_id at 40 units (an identifier, ASCII only) and sends nothing for an empty title or text", () => {
  const { asked, post } = frameBridge();
  post({ type: "context-intake", intake_id: "a".repeat(45), id: "spark-1" });
  assert.deepEqual([asked[0]!.intake_id, asked[0]!.id, asked[0]!.title, asked[0]!.text], ["a".repeat(40), "spark-1", "", ""]);
});

test("RAC-1870 the intake handler asks the Host to make it with a title (200) and text (4000) cut by whole characters", async t => {
  for (const [field, max] of FIELDS) for (const [name, given, expected] of cases(max)) await t.test(`${field}: ${name}`, async () => {
    const page = contextPage();
    page.intake({ intake_id: "todo", id: "spark-1", title: field === "title" ? given : "标题", text: field === "text" ? given : "正文" });
    await page.settle();
    const made = page.asked("/api/contextual/create");
    assert.equal(made.length, 1, "one request to make it");
    assert.equal(made[0]!.body.intake_id, "todo");
    whole(field === "title" ? made[0]!.body.focus.object.title! : made[0]!.body.focus.targets[0]!.text, expected, max, `${field}: ${name}`);
  });
});

test("RAC-1871 the starters ask the Host for the candidates with the text of the object in hand (4000) cut by whole characters", async t => {
  for (const [name, given, expected] of cases(4000)) await t.test(name, async () => {
    const page = contextPage();
    page.starters({ plugin_id: "io.molis.work.lingguang", object: { kind: "lingguang_spark", id: "spark-1", title: "标题" }, draft_text: given });
    await page.settle();
    const asked = page.asked("/api/contextual/candidates");
    assert.equal(asked.length, 1, "one request for the candidates");
    whole(asked[0]!.body.focus.targets[0]!.text, expected, 4000, name);
  });
});
