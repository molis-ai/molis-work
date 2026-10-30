import assert from "node:assert/strict";
import test from "node:test";

import { PAGES_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-pages";
import { UI_REQUEST_CLIENT_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { fakeLifetime } from "./fixtures/fake-client-lifetime.js";
import { pagesHost } from "./fixtures/pages-host.js";
import { CONTEXT_ACTIONS_FACTORY_SCRIPT } from "../apps/workbench/src/scripts/client/context-actions.ts";

// Pages and the workbench's fallback naming (context-actions) share one surface element: whoever writes
// data-assistant-context last is what the Assistant and the context toolbar read. Pages' own naming must win.

type Listener = (event: { type: string; detail?: unknown; target?: unknown }) => unknown;

class FakeElement {
  attributes = new Map<string, string>();
  listeners = new Map<string, Listener[]>();
  dataset: Record<string, string> = {};
  isConnected = true;
  hasAttribute(name: string) { return this.attributes.has(name); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, String(value));
    if (name === "data-expanded") this.dataset.expanded = String(value);
  }
  addEventListener(type: string, fn: Listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  dispatchEvent(event: { type: string }) { return dispatch(this, event); }
  querySelector: (selector: string) => unknown = () => null;
  querySelectorAll() { return []; }
  closest() { return null; }
}

// A plain stand-in for every other node the Pages client touches.
function node(): Record<string, unknown> {
  const self: Record<string, unknown> = {
    hidden: true, textContent: "", value: "", title: "", className: "", innerHTML: "", draggable: false, disabled: false,
    dataset: {}, style: {}, children: [] as unknown[], scrollTop: 0,
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute(name: string, value: string) { if (name === "class") self.className = value; }, getAttribute() { return null; }, removeAttribute() {}, toggleAttribute() {}, matches() { return false; }, remove() {},
    getBoundingClientRect() { return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }; }, offsetWidth: 0, offsetHeight: 0, scrollWidth: 0,
    append(...nodes: unknown[]) { (self.children as unknown[]).push(...nodes); },
    prepend(...nodes: unknown[]) { (self.children as unknown[]).unshift(...nodes); },
    replaceChildren(...nodes: unknown[]) { self.children = nodes; },
    querySelector() { return node(); }, querySelectorAll() { return []; },
    closest() { return null; }, contains() { return false; },
    addEventListener() {}, removeEventListener() {}, focus() {}, select() {}, showModal() {}, close() {},
  };
  return self;
}

let documentListeners: Array<{ type: string; fn: Listener; capture: boolean }> = [];

// Capture listeners on the document, then the surface's own, then the document's bubbling ones.
function dispatch(target: FakeElement, event: { type: string; detail?: unknown }) {
  const routed = Object.assign(event, { target });
  documentListeners.filter((entry) => entry.type === event.type && entry.capture).forEach((entry) => entry.fn(routed));
  (target.listeners.get(event.type) ?? []).forEach((fn) => fn(routed));
  documentListeners.filter((entry) => entry.type === event.type && !entry.capture).forEach((entry) => entry.fn(routed));
  return true;
}

interface Deferred { promise: Promise<unknown>; resolve(value: unknown): void }
function deferred(): Deferred {
  let resolve: (value: unknown) => void = () => {};
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const json = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });

async function flush() {
  for (let i = 0; i < 12; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

const DOC = { id: "doc-a", title: "Q4 计划", version: 7, body: { type: "doc", content: [] }, goal_id: "", artifact_version: 0, starred: false };

/** One workbench page: the Pages client and the context toolbar's script, with a hand-driven clock and held responses. */
async function workbench(t: { after(fn: () => void): void }, routes: Record<string, unknown> = {}) {
  const dispatched: Array<{ type: string; detail?: unknown }> = [];
  const requested: string[] = [];
  const created: Array<Record<string, unknown>> = [];
  let editorBody: unknown = DOC.body, editorChanged = () => {};
  const surface = new FakeElement();
  surface.setAttribute("data-work-surface", "pages");
  surface.setAttribute("data-pages", "workbench");
  const parts = new Map<string, unknown>();
  surface.querySelector = (selector: string) => {
    if (!parts.has(selector)) parts.set(selector, node());
    return parts.get(selector);
  };
  documentListeners = [];
  let now = 0;
  let timerId = 0;
  const timers = new Map<number, { at: number; fn: () => unknown }>();
  const held = new Map<string, Deferred>();
  const hold = (path: string) => { const gate = deferred(); held.set(path, gate); return gate; };
  const saved = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, fetch: globalThis.fetch,
    document: (globalThis as Record<string, unknown>).document, window: (globalThis as Record<string, unknown>).window,
    Element: (globalThis as Record<string, unknown>).Element, innerWidth: (globalThis as Record<string, unknown>).innerWidth,
    innerHeight: (globalThis as Record<string, unknown>).innerHeight, matchMedia: (globalThis as Record<string, unknown>).matchMedia,
    getSelection: (globalThis as Record<string, unknown>).getSelection, addEventListener: (globalThis as Record<string, unknown>).addEventListener,
    MutationObserver: (globalThis as Record<string, unknown>).MutationObserver,
    location: (globalThis as Record<string, unknown>).location, molisWorkRequest: (globalThis as Record<string, unknown>).molisWorkRequest,
    molisWorkControlHeaders: (globalThis as Record<string, unknown>).molisWorkControlHeaders };
  t.after(() => Object.assign(globalThis, saved));
  globalThis.setTimeout = ((fn: () => unknown, delay = 0) => { const id = ++timerId; timers.set(id, { at: now + delay, fn }); return id; }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((id?: number) => { if (id) timers.delete(id); }) as typeof clearTimeout;
  globalThis.fetch = (async (url: string) => {
    const path = new URL(url, "http://workbench.test").pathname;
    requested.push(path);
    const gate = held.get(path);
    if (gate) await gate.promise;
    if (path === "/api/plugins/io.molis.work.pages/pages") return json({ documents: [DOC], folders: [] });
    if (path === "/api/plugins/io.molis.work.pages/pages/" + DOC.id) return json({ document: DOC });
    if (path === "/api/contextual/surfaces") return json({ surfaces: { pages: { kind: "pages_document", plugin_id: "io.molis.work.pages" } } });
    if (path === "/api/board") return json({ goals: [] });
    if (path in routes) return json(routes[path]);
    return json({});
  }) as typeof fetch;
  const windowStub: Record<string, unknown> = {
    addEventListener() {}, dispatchEvent() { return true; },
    MolisWorkPagesEditor: { bindComments: () => async () => {}, mountPagesLanding: () => ({ report() {} }), emptyDoc: () => ({ type: "doc", content: [] }), canShow: () => true,
      mount: (_host: unknown, options: { doc: unknown; onChange(): void }) => { editorBody = options.doc; editorChanged = options.onChange; return {}; },
      setDoc: (_editor: unknown, body: unknown) => { editorBody = body; }, getDoc: () => editorBody },
  };
  windowStub.parent = windowStub;
  Object.assign(globalThis, {
    Element: FakeElement,
    // What the toolbar program reads from the page it is drawn in.
    innerWidth: 1440, innerHeight: 900, matchMedia: () => ({ matches: false }), getSelection: () => null, addEventListener() {},
    // It watches the panels that can cover a passage (none on this page).
    MutationObserver: class { observe() {} },
    window: windowStub,
    document: {
      body: { dataset: { routePrefix: "" }, hasAttribute: () => false, matches: () => false, append() {} },
      documentElement: { dataset: {} as Record<string, string> },
      activeElement: null,
      querySelector: (selector: string) => selector === "[data-pages=workbench]" ? surface : null,
      // The document's open tab, named after it (tab-workspace's appendTab).
      querySelectorAll: (selector: string) => selector === ".tab-item[data-item-id]"
        ? [{ dataset: { itemId: DOC.id }, getAttribute: (name: string) => name === "title" ? DOC.title : null }] : [],
      getElementById: () => null,
      createElement: () => { const made = node(); created.push(made); return made; },
      addEventListener: (type: string, fn: Listener, capture?: boolean) => { documentListeners.push({ type, fn, capture: capture === true }); },
      dispatchEvent: (event: { type: string; detail?: unknown }) => { dispatched.push(event); return true; },
    },
  });
  // The Workbench page installs the shared request helper (ui-host) before any of its programs runs, and the toolbar program
  // calls it as molisWorkRequest; the real helper runs here over the stubbed fetch.
  Object.assign(globalThis, { location: new URL("http://workbench.test/"), molisWorkRequest: undefined, molisWorkControlHeaders: undefined });
  Function(UI_REQUEST_CLIENT_SCRIPT)();
  const pages = Function(`return (${PAGES_CLIENT_FACTORY_SCRIPT})`)() as (host: unknown) => void;
  pages(pagesHost(fakeLifetime(), { projectId: () => "project-a", mountPluginClient: undefined }));
  const contextRow = Function(`return (${CONTEXT_ACTIONS_FACTORY_SCRIPT})`)() as (host: unknown) => unknown;
  contextRow({ translate: (text: string) => text, route: (path: string) => path, headers: () => ({}) });
  await flush();
  return {
    surface,
    hold,
    dispatched,
    requested,
    // The toolbar's own element and the labels of its buttons (an action, then 更多 and the Assistant).
    toolbar: () => created.find((made) => made.className === "mw-ctx")!,
    actions: () => ((created.find((made) => made.className === "mw-ctx")!.children as Array<{ className: string; children: Array<{ textContent: string }> }>)
      .filter((child) => child.className === "mw-btn mw-btn--ghost").map((child) => child.children[0]?.textContent ?? "")),
    // The surface reports what the person has in hand (or, with null, that it is gone), as Pages and the DOM selection do.
    focus: (detail: unknown) => dispatch(surface, { type: "molis:surface-focus", detail }),
    context: () => JSON.parse(surface.getAttribute("data-assistant-context") ?? "null") as Record<string, unknown> | null,
    serializedContext: () => surface.getAttribute("data-assistant-context"),
    edit(text: string, title?: string) {
      editorBody = { type: "doc", content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }] };
      if (title !== undefined) (parts.get("[data-pages-title]") as { value: string }).value = title;
      editorChanged();
    },
    // The workbench opens an item on the surface (tab-workspace's selectItem / jumpToRecord).
    selectItem: (itemId: string | null) => dispatch(surface, { type: "molis-work:select-item", detail: { itemId } }),
    async advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at > now || !timers.has(id)) continue;
        timers.delete(id);
        // Not awaited: a callback may be waiting on a response the test is still holding.
        void timer.fn();
      }
      await flush();
    },
  };
}

const ownNaming = { kind: "pages_document", id: DOC.id, version: DOC.version, title: DOC.title };
const unsavedMetadata = { plugin_id: "io.molis.work.pages", surface_title: "Pages", object: ownNaming, unsaved: true };

test("PAGESCTX-01: the production client keeps fitting short and ordinary long context output unchanged", async t => {
  const page = await workbench(t);page.selectItem(DOC.id);await flush();
  for (const text of ['短稿："引号"、反斜杠\\和😀', "普通正文".repeat(6000)]) {
    page.edit(text);
    assert.equal(page.serializedContext(), JSON.stringify({ ...unsavedMetadata, draft_text: text.slice(0, 20000) }));
  }
});

test("PAGESCTX-02 PAGESCTX-04: the real client budgets the complete escaped context and preserves draft identity", async t => {
  const page = await workbench(t);page.selectItem(DOC.id);await flush();
  for (const text of ['"'.repeat(44000), "\\".repeat(22000), "\0\n\t\r\b\f".repeat(4000)]) {
    page.edit(text);
    const serialized = page.serializedContext()!;
    assert.ok(serialized.length < 32000, `actual production JSON length ${serialized.length} must pass the unchanged parent string-length gate`);
    const { draft_text: excerpt, ...metadata } = JSON.parse(serialized) as Record<string, unknown>;
    assert.deepEqual(metadata, unsavedMetadata);
    assert.equal(typeof excerpt, "string");assert.ok((excerpt as string).length <= 20000);
    assert.ok(text.startsWith(excerpt as string));
    assert.ok(JSON.stringify({ ...unsavedMetadata, draft_text: text.slice(0, 20000) }).length >= 32000, "this same business input exceeded the old raw-slice path");
  }
});

test("PAGESCTX-03: exact serialized threshold, intact emoji, empty/saved context and oversized metadata keep their semantics", async t => {
  const page = await workbench(t);
  assert.equal(page.context(), null);
  page.selectItem(DOC.id);await flush();
  assert.deepEqual(page.context(), { plugin_id: "io.molis.work.pages", surface_title: "Pages", object: ownNaming });
  const room = 31999 - JSON.stringify({ ...unsavedMetadata, draft_text: "" }).length;
  const edge = '"'.repeat(Math.floor(room / 2)) + (room % 2 ? "x" : "");
  page.edit(edge);assert.equal(page.serializedContext()!.length, 31999);assert.equal(page.context()!.draft_text, edge);
  page.edit(edge + "x");assert.equal(page.serializedContext()!.length, 31999);assert.equal(page.context()!.draft_text, edge);
  const beforeEmoji = '"'.repeat(Math.floor((room - 1) / 2)) + ((room - 1) % 2 ? "x" : "");
  page.edit(beforeEmoji + "😀tail");assert.equal(page.context()!.draft_text, beforeEmoji, "a complete emoji cannot be cut to make the serialized budget fit");
  page.edit("x".repeat(19999) + "😀tail");assert.equal(page.context()!.draft_text, "x".repeat(19999), "the original 20k excerpt cap also keeps surrogate pairs intact");
  page.edit("");assert.deepEqual(page.context(), unsavedMetadata, "empty unsaved content has no invented draft text");
  const bare = { ...unsavedMetadata, object: { ...ownNaming, title: "" } };
  const nearTitle = "m".repeat(31999 - JSON.stringify(bare).length);
  page.edit("正文", nearTitle);
  assert.equal(page.serializedContext(), JSON.stringify({ ...bare, object: { ...ownNaming, title: nearTitle } }), "omit the optional empty excerpt when only metadata fits");
  assert.equal(page.serializedContext()!.length, 31999);
  page.edit("正文", nearTitle + "m");assert.equal(page.serializedContext()!.length, 32000, "metadata itself at the strict limit still remains refused");
  assert.deepEqual(page.context()!.object, { ...ownNaming, title: nearTitle + "m" });assert.equal(page.context()!.unsaved, true);
  const title = '"'.repeat(16000);page.edit("正文", title);
  const context = page.context()!;
  assert.deepEqual(context.object, { ...ownNaming, title });assert.equal(context.plugin_id, unsavedMetadata.plugin_id);assert.equal(context.unsaved, true);
  assert.ok(page.serializedContext()!.length >= 32000, "oversized temporary metadata is still refused by the existing parent, never rewritten to manufacture a fit");
});

test("reloaded into an open document: Pages names it itself, even when it finishes while the workbench reads the surfaces", async (t) => {
  const page = await workbench(t);
  // A reload: the document and the surfaces directory both answer slowly; the workbench's 250 ms check finds nothing yet.
  const documentRead = page.hold("/api/plugins/io.molis.work.pages/pages/" + DOC.id);
  const surfacesRead = page.hold("/api/contextual/surfaces");
  page.selectItem(DOC.id);
  await page.advance(250);
  assert.equal(page.context(), null, "nothing named before the document arrives");
  documentRead.resolve(undefined);
  await flush();
  assert.deepEqual(page.context()?.object, ownNaming);
  surfacesRead.resolve(undefined);
  await flush();
  const context = page.context();
  assert.deepEqual(context?.object, ownNaming, "the workbench's fallback does not write over what Pages named meanwhile");
  assert.equal(context?.surface_title, "Pages");
  assert.equal(context?.named_by, undefined);
});

test("the workbench names the document first when Pages is slower, and Pages' own naming replaces it", async (t) => {
  const page = await workbench(t);
  const documentRead = page.hold("/api/plugins/io.molis.work.pages/pages/" + DOC.id);
  page.selectItem(DOC.id);
  await page.advance(250);
  assert.equal(page.context()?.named_by, "workbench");
  // Named after its open tab, so the Assistant shows the document's title rather than its id.
  assert.equal((page.context()?.object as { title?: string } | undefined)?.title, DOC.title);
  documentRead.resolve(undefined);
  await flush();
  assert.deepEqual(page.context()?.object, ownNaming);
  assert.equal(page.context()?.named_by, undefined);
});

test("shown again after the workbench hid it (its tab, after the Pages list): Pages names the open document again", async (t) => {
  const page = await workbench(t);
  page.selectItem(DOC.id);
  await flush();
  await page.advance(250);
  assert.deepEqual(page.context()?.object, ownNaming);
  // The workbench shows the Pages list: it collapses the stage and takes the object off the surface (collapsePluginStage).
  page.surface.setAttribute("data-expanded", "false");
  const hidden = page.context()!;
  delete hidden.object;
  page.surface.setAttribute("data-assistant-context", JSON.stringify(hidden));
  page.selectItem(null);
  await page.advance(250);
  // Back to the document's tab: Pages still has it open and only shows it again.
  page.selectItem(DOC.id);
  assert.equal(page.surface.getAttribute("data-expanded"), "true");
  assert.deepEqual(page.context()?.object, ownNaming, "named at once, before the workbench's 250 ms fallback");
  await page.advance(250);
  assert.deepEqual(page.context()?.object, ownNaming);
  assert.equal(page.context()?.named_by, undefined);
});

// W2-00: the bus works on its own: a document takes the focus, asks the Host and has the toolbar draw the plan once the
// selection has been steady; it holds no timer and shows nothing once nothing is in hand.
test("W2-00: the bus takes the focus, asks the Host and has the toolbar show the plan", async (t) => {
  const plan = { context_id: "ctx-1", basis: "rules", primary: ["k1"], emphasis: null, more: [], assistant: null,
    candidates: [{ key: "k1", title: "解释", hint: "h", provider_title: "Pages", available: true, source: { provider_id: "pages" }, action: { capability_id: "pages.ai" } }] };
  const answer = { plan, judgment: null, receipt: { context_id: "ctx-1", state_digest: null, candidate_count: 1, screened: [] } };
  const page = await workbench(t, { "/api/contextual/candidates": answer, "/api/contextual/judge": answer, "/api/contextual/cancel": {} });
  const focus = { context_id: "ctx-1", plugin_id: "io.molis.work.pages", activity: "selecting", granularity: "range",
    object: { kind: "pages_document", id: DOC.id, title: DOC.title }, targets: [{ kind: "text_range", role: "paragraph", text: "一段文字" }] };
  assert.equal(page.toolbar().hidden, true, "nothing in hand, nothing shown");
  try {
    page.focus(focus);
    await page.advance(0);
    assert.ok(page.requested.includes("/api/contextual/candidates"), "the Host is asked what can be done with it");
    assert.equal(page.toolbar().hidden, true, "a selection that has only just changed is not drawn yet");
    await page.advance(400);
    assert.equal(page.toolbar().hidden, false);
    assert.deepEqual(page.actions(), ["解释", "更多 ▾", "✦ 助理"]);
    assert.ok(page.requested.includes("/api/contextual/judge"), "the judged plan follows");
  } finally {
    page.focus(null);
    await page.advance(0);
  }
  assert.equal(page.toolbar().hidden, true, "putting the focus away takes the toolbar down");
});
