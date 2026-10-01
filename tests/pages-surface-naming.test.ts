import assert from "node:assert/strict";
import test from "node:test";

import { PAGES_CLIENT_FACTORY_SCRIPT } from "../plugins/native/pages/src/client.ts";
import { CONTEXT_ACTIONS_FACTORY_SCRIPT } from "../apps/workbench/src/scripts/client/context-actions.ts";

// Pages and the workbench's fallback naming (context-actions) share one surface element: whoever writes
// data-assistant-context last is what the Assistant and the context row read. Pages' own naming must win.

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
}

// A plain stand-in for every other node the Pages client touches.
function node(): Record<string, unknown> {
  const self: Record<string, unknown> = {
    hidden: true, textContent: "", value: "", title: "", className: "", innerHTML: "", draggable: false, disabled: false,
    dataset: {}, style: {}, children: [] as unknown[], scrollTop: 0,
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    append(...nodes: unknown[]) { (self.children as unknown[]).push(...nodes); },
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

/** One workbench page: the Pages client and the context row's script, with a hand-driven clock and held responses. */
async function workbench(t: { after(fn: () => void): void }) {
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
    Element: (globalThis as Record<string, unknown>).Element };
  t.after(() => Object.assign(globalThis, saved));
  globalThis.setTimeout = ((fn: () => unknown, delay = 0) => { const id = ++timerId; timers.set(id, { at: now + delay, fn }); return id; }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((id?: number) => { if (id) timers.delete(id); }) as typeof clearTimeout;
  globalThis.fetch = (async (url: string) => {
    const path = new URL(url, "http://workbench.test").pathname;
    const gate = held.get(path);
    if (gate) await gate.promise;
    if (path === "/api/plugins/pages") return json({ documents: [DOC], folders: [] });
    if (path === "/api/plugins/pages/" + DOC.id) return json({ document: DOC });
    if (path === "/api/contextual/surfaces") return json({ surfaces: { pages: { kind: "pages_document", plugin_id: "io.molis.work.pages" } } });
    if (path === "/api/board") return json({ goals: [] });
    return json({});
  }) as typeof fetch;
  const windowStub: Record<string, unknown> = {
    addEventListener() {}, dispatchEvent() { return true; },
    MolisWorkPagesEditor: { emptyDoc: () => ({ type: "doc", content: [] }), mount: () => ({}), setDoc() {}, getDoc: () => DOC.body },
  };
  windowStub.parent = windowStub;
  Object.assign(globalThis, {
    Element: FakeElement,
    window: windowStub,
    document: {
      body: { dataset: { routePrefix: "" }, hasAttribute: () => false, append() {} },
      activeElement: null,
      querySelector: (selector: string) => selector === "[data-pages=workbench]" ? surface : null,
      createElement: () => node(),
      addEventListener: (type: string, fn: Listener, capture?: boolean) => { documentListeners.push({ type, fn, capture: capture === true }); },
      dispatchEvent: () => true,
    },
  });
  const pages = Function(`return (${PAGES_CLIENT_FACTORY_SCRIPT})`)() as (host: unknown) => void;
  pages({ translate: (text: string) => text, projectId: "project-a" });
  const contextRow = Function(`return (${CONTEXT_ACTIONS_FACTORY_SCRIPT})`)() as (host: unknown) => unknown;
  contextRow({ translate: (text: string) => text, route: (path: string) => path, headers: () => ({}) });
  await flush();
  return {
    surface,
    hold,
    context: () => JSON.parse(surface.getAttribute("data-assistant-context") ?? "null") as Record<string, unknown> | null,
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

test("reloaded into an open document: Pages names it itself, even when it finishes while the workbench reads the surfaces", async (t) => {
  const page = await workbench(t);
  // A reload: the document and the surfaces directory both answer slowly; the workbench's 250 ms check finds nothing yet.
  const documentRead = page.hold("/api/plugins/pages/" + DOC.id);
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
  const documentRead = page.hold("/api/plugins/pages/" + DOC.id);
  page.selectItem(DOC.id);
  await page.advance(250);
  assert.equal(page.context()?.named_by, "workbench");
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
