import assert from "node:assert/strict";
import test from "node:test";

import { LINGGUANG_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-lingguang";
import { fakeLifetime } from "./fixtures/fake-client-lifetime.js";

// W2-18 decision 6, 灵光 side: 「记下第一条灵光」 makes a spark at once; one left with nothing written is thrown away with
// the existing lingguang.discard when the person leaves it (back to the list, another spark, another new spark, the workbench
// hiding the page for another plugin, the page going away). A spark that already existed, went into a brainstorm, or has
// anything written in it (as the server sees it when the person leaves), is never touched.

interface FakeNode {
  hidden: boolean; textContent: string; value: string; title: string; className: string; innerHTML: string; disabled: boolean;
  dataset: Record<string, string>; style: Record<string, string>; children: FakeNode[];
  listeners: Record<string, (event: unknown) => void | Promise<void>>;
  classList: { toggle(): void; add(): void; remove(): void };
  setAttribute(name?: string, value?: string): void; getAttribute(): null; append(...nodes: FakeNode[]): void; replaceChildren(...nodes: FakeNode[]): void;
  querySelector(selector?: string): FakeNode | null; querySelectorAll(): FakeNode[]; closest(): null; contains(): boolean;
  focus(): void; select(): void; removeEventListener(): void; showModal(): void; close(): void;
  addEventListener(type: string, fn: (event: unknown) => void): void;
}
function element(): FakeNode {
  const node: FakeNode = {
    hidden: false, textContent: "", value: "", title: "", className: "", innerHTML: "", disabled: false, dataset: {}, style: {}, children: [], listeners: {},
    classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, getAttribute() { return null; },
    append(...nodes) { node.children.push(...nodes); }, replaceChildren(...nodes) { node.children = nodes.flat(); },
    querySelector() { return element(); }, querySelectorAll() { return []; }, closest() { return null; }, contains() { return false; },
    focus() {}, select() {}, removeEventListener() {}, showModal() {}, close() {},
    addEventListener(type, fn) { node.listeners[type] = fn; },
  };
  return node;
}
const click = (targetSelector: string, dataset: Record<string, string> = {}) => ({
  target: { nodeType: 1, closest: (selector: string) => selector === targetSelector ? { dataset } : null }, preventDefault() {}, stopPropagation() {},
});
const BRAINSTORM = "[data-lingguang-brainstorm], [data-lingguang-brainstorm-current]";
const flush = async () => { for (let i = 0; i < 12; i += 1) await new Promise(resolve => setImmediate(resolve)); };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

interface Spark { id: string; project_id: string; title: string; body: string; source_kind: "manual"; status: "inbox" | "discarded"; created_at: string; updated_at: string }
const spark = (id: string, title: string, body = ""): Spark => ({ id, project_id: "p", title, body, source_kind: "manual", status: "inbox", created_at: "2026-10-09T00:00:00.000Z", updated_at: "2026-10-09T00:00:00.000Z" });

async function mounted(initial: Spark[], options: { onGet?: (spark: Spark) => Spark; discard?: () => Response | null } = {}) {
  const store = new Map<string, Spark>(initial.map(item => [item.id, item]));
  const calls: Array<{ method: string; path: string; body: Record<string, unknown>; keepalive?: boolean }> = [];
  let created = 0, clock = 0;
  const lifetime = fakeLifetime();
  const saved = { fetch: globalThis.fetch, document: (globalThis as { document?: unknown }).document, window: (globalThis as { window?: unknown }).window,
    location: (globalThis as { location?: unknown }).location, molis: (globalThis as { molisWorkControlHeaders?: unknown }).molisWorkControlHeaders };
  const workbench = element();
  // The workbench watches this attribute: a page that says it is back at its list is a record to forget.
  const attributes = new Map<string, string>();
  workbench.setAttribute = (name, value) => { attributes.set(String(name), String(value)); };
  (workbench as { getAttribute(name?: string): string | null }).getAttribute = name => attributes.get(String(name)) ?? null;
  const parts = new Map<string, FakeNode>();
  const part = (selector: string) => { let found = parts.get(selector); if (!found) { found = element(); parts.set(selector, found); } return found; };
  workbench.querySelector = (selector?: string) => part(selector ?? "");
  part("[data-lingguang=directory]").contains = () => true;
  Object.assign(globalThis, {
    document: { querySelector: (selector: string) => selector === "[data-lingguang=workbench]" ? workbench : null, createElement: () => element(), addEventListener() {}, hidden: false },
    window: { dispatchEvent() {}, addEventListener() {} },
    location: { search: "" },
  });
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const parsed = new URL(url, "http://lingguang.test"), method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    calls.push({ method, path: parsed.pathname, body, keepalive: init?.keepalive });
    if (parsed.pathname === "/api/placement/describe") return json({ associations: [] });
    if (parsed.pathname === "/api/plugins/lingguang") {
      if (method === "GET") return json({ sparks: [...store.values()].filter(item => item.status === "inbox") });
      created += 1;
      const made = spark(`S${created}`, String(body.title ?? "未命名灵光"), String(body.body ?? ""));
      store.set(made.id, made);
      return json({ spark: made });
    }
    if (parsed.pathname === "/api/plugins/lingguang/conversations") {
      const ids = body.spark_ids as string[];
      return json({ conversation: { id: "C1" }, sparks: ids.map(id => store.get(id)), messages: [] });
    }
    if (parsed.pathname === "/api/plugins/lingguang/discard") {
      const refused = options.discard?.(); if (refused) return refused;
      for (const id of body.ids as string[]) store.set(id, { ...store.get(id)!, status: "discarded" });
      return json({ ok: true });
    }
    const id = decodeURIComponent(parsed.pathname.split("/").pop() ?? "");
    const current = store.get(id);
    if (!current) return json({ error: "missing" }, 404);
    if (method === "POST") {
      clock += 1;
      const next = { ...current, title: String(body.title ?? current.title), body: String(body.body ?? current.body), updated_at: `2026-10-09T00:00:${String(clock).padStart(2, "0")}.000Z` };
      store.set(id, next);
      return json({ spark: next });
    }
    return json({ spark: options.onGet ? options.onGet(current) : current });
  }) as typeof fetch;
  const factory = Function(`return (${LINGGUANG_CLIENT_FACTORY_SCRIPT})`)() as (host: { translate: (text: string) => string; route: (path: string) => string; mountPluginClient: typeof lifetime.mount }) => void;
  factory({ translate: value => value, route: path => path, mountPluginClient: lifetime.mount });
  await flush();
  const fire = async (event: ReturnType<typeof click>) => { await workbench.listeners.click!(event); await flush(); };
  return {
    store, calls, fire, parts, part, lifetime,
    editorOpen: () => part("[data-lingguang-stage-workspace]").hidden === false,
    expanded: () => attributes.get("data-expanded"),
    /** What the surface tells the Assistant and the placement bar it has in hand (null before the page has said anything). */
    context: () => attributes.has("data-assistant-context") ? JSON.parse(attributes.get("data-assistant-context")!) as { plugin_id: string; object?: { kind: string; id: string } } : null,
    elapse: async () => { await flush(); },
    /** The workbench shows the page without an item (its Back button, the plugin's name on the tab strip, a tab that is not an item); `fold` is whether it then folds the page to its list, as applyPluginDefault does. */
    async workbenchSelectsNothing(fold: boolean) {
      workbench.listeners["molis-work:select-item"]!({ detail: { itemId: null } });
      if (fold) workbench.setAttribute("data-expanded", "false");
      await flush();
    },
    /** The person types in the title or the body; the autosave runs before they leave (the client saves first). */
    async write(next: { title?: string; body?: string }) {
      if (next.title !== undefined) part("[data-lingguang-title]").value = next.title;
      if (next.body !== undefined) part("[data-lingguang-body]").value = next.body;
      await part("[data-lingguang-stage-workspace]").listeners.input?.({ target: { closest: () => ({}) } });
    },
    discards: () => calls.filter(call => call.path === "/api/plugins/lingguang/discard"),
    restore() { Object.assign(globalThis, { fetch: saved.fetch, document: saved.document, window: saved.window, location: saved.location }); },
  };
}

test("a new spark left blank is discarded when the person goes back to the list, without asking", async () => {
  const page = await mounted([spark("OLD", "想法", "有内容")]);
  try {
    await page.fire(click("[data-lingguang-capture]"));
    assert.equal(page.store.get("S1")?.status, "inbox", "made at once, as before");
    await page.fire(click("[data-lingguang-back]"));
    assert.equal(page.discards().length, 1);
    assert.deepEqual(page.discards()[0]!.body, { ids: ["S1"] });
    assert.equal(page.store.get("S1")?.status, "discarded");
    assert.equal(page.store.get("OLD")?.status, "inbox");
  } finally { page.restore(); }
});

test("a new spark with a body is kept, and so is one that only got a title", async () => {
  const page = await mounted([]);
  try {
    await page.fire(click("[data-lingguang-capture]"));
    await page.write({ body: "刚冒出来的想法" });
    await page.fire(click("[data-lingguang-back]"));
    await page.fire(click("[data-lingguang-capture]"));
    await page.write({ title: "只有标题" });
    await page.fire(click("[data-lingguang-back]"));
    assert.equal(page.discards().length, 0);
    assert.deepEqual([...page.store.values()].map(item => item.status), ["inbox", "inbox"]);
  } finally { page.restore(); }
});

test("opening another spark or making another new one also leaves the blank one", async () => {
  const page = await mounted([spark("OLD", "想法", "有内容")]);
  try {
    await page.fire(click("[data-lingguang-capture]"));
    await page.fire(click("[data-lingguang-id]", { lingguangId: "OLD" }));
    assert.deepEqual(page.discards().map(call => call.body.ids), [["S1"]]);
    await page.fire(click("[data-lingguang-capture]"));
    await page.fire(click("[data-lingguang-capture]"));
    assert.deepEqual(page.discards().map(call => call.body.ids), [["S1"], ["S2"]]);
    assert.deepEqual([...page.store.values()].filter(item => item.status === "inbox").map(item => item.id).sort(), ["OLD", "S3"]);
  } finally { page.restore(); }
});

test("a spark that was already there, even a blank one, is never discarded on leaving", async () => {
  const page = await mounted([spark("OLD", "未命名灵光")]);
  try {
    await page.fire(click("[data-lingguang-id]", { lingguangId: "OLD" }));
    await page.fire(click("[data-lingguang-back]"));
    assert.equal(page.discards().length, 0);
  } finally { page.restore(); }
});

test("it is the server's copy that decides: a spark written elsewhere meanwhile is kept", async () => {
  const page = await mounted([], { onGet: current => ({ ...current, body: "助理刚替你记了一句" }) });
  try {
    await page.fire(click("[data-lingguang-capture]"));
    await page.fire(click("[data-lingguang-back]"));
    assert.equal(page.discards().length, 0);
    assert.equal(page.store.get("S1")?.status, "inbox");
  } finally { page.restore(); }
});

test("a failed tidy-up is silent: the spark stays and the person still gets back to the list", async () => {
  const page = await mounted([], { discard: () => json({ error: "暂时丢不掉" }, 503) });
  try {
    await page.fire(click("[data-lingguang-capture]"));
    await page.fire(click("[data-lingguang-back]"));
    assert.equal(page.discards().length, 1);
    assert.equal(page.store.get("S1")?.status, "inbox");
    assert.equal(page.part("[data-lingguang-note]").textContent, "");
    assert.equal(page.part("[data-lingguang-stage-workspace]").hidden, true);
  } finally { page.restore(); }
});

test("a spark that went into a brainstorm is in use: leaving it does not throw it away", async () => {
  const page = await mounted([]);
  try {
    await page.fire(click("[data-lingguang-capture]"));
    await page.fire(click(BRAINSTORM));
    assert.deepEqual(page.calls.filter(call => call.path === "/api/plugins/lingguang/conversations").map(call => call.body.spark_ids), [["S1"]]);
    await page.fire(click("[data-lingguang-back]"));
    assert.equal(page.discards().length, 0);
    assert.equal(page.calls.some(call => call.method === "GET" && call.path === "/api/plugins/lingguang/S1"), false, "it is not even read: it was never going to be thrown away");
    assert.equal(page.store.get("S1")?.status, "inbox");
    // The same when it is left by the page being hidden while the chat is open.
    await page.fire(click("[data-lingguang-capture]"));
    await page.fire(click(BRAINSTORM));
    page.lifetime.hideSurface(); await page.elapse();
    assert.equal(page.discards().length, 0);
    assert.equal(page.store.get("S2")?.status, "inbox");
  } finally { page.restore(); }
});

test("when the workbench hides the page for another plugin, the blank spark is thrown away and the editor is closed", async () => {
  const page = await mounted([spark("OLD", "想法", "有内容")]);
  try {
    await page.fire(click("[data-lingguang-capture]"));
    assert.equal(page.editorOpen(), true);
    page.lifetime.hideSurface(); await page.elapse();
    assert.deepEqual(page.discards().map(call => call.body.ids), [["S1"]]);
    assert.equal(page.discards()[0]!.keepalive, undefined, "an ordinary call: the page is still here");
    assert.ok(page.calls.findIndex(call => call.method === "GET" && call.path === "/api/plugins/lingguang/S1") < page.calls.indexOf(page.discards()[0]!), "the Host's copy was read first");
    assert.equal(page.editorOpen(), false, "what comes back is the list");
    assert.equal(page.store.get("S1")?.status, "discarded");
    assert.equal(page.store.get("OLD")?.status, "inbox");
    page.lifetime.showSurface(); await page.elapse();
    assert.equal(page.discards().length, 1);
  } finally { page.restore(); }
});

test("hiding the page leaves alone a spark with words, one that was already there, and one written to elsewhere meanwhile", async () => {
  const written = await mounted([]);
  try {
    await written.fire(click("[data-lingguang-capture]"));
    await written.write({ body: "刚冒出来的想法" });
    written.lifetime.hideSurface(); await written.elapse();
    assert.equal(written.discards().length, 0);
    assert.equal(written.editorOpen(), true, "words on screen: nothing is closed under the person");
  } finally { written.restore(); }
  const old = await mounted([spark("OLD", "")]);
  try {
    await old.fire(click("[data-lingguang-id]", { lingguangId: "OLD" }));
    old.lifetime.hideSurface(); await old.elapse();
    assert.equal(old.discards().length, 0);
    assert.equal(old.editorOpen(), true);
  } finally { old.restore(); }
  const elsewhere = await mounted([], { onGet: current => ({ ...current, body: "助理刚替你记了一句" }) });
  try {
    await elsewhere.fire(click("[data-lingguang-capture]"));
    elsewhere.lifetime.hideSurface(); await elsewhere.elapse();
    assert.equal(elsewhere.discards().length, 0);
    assert.equal(elsewhere.store.get("S1")?.status, "inbox");
  } finally { elsewhere.restore(); }
});

test("words saved and then erased inside the save delay: the erasure is saved before the spark is judged, so it is blank and goes", async () => {
  // The judgement reads the Host's copy. Closing the editor without saving first would throw away the erasure and judge the old words.
  for (const leave of ["hide", "back"] as const) {
    const page = await mounted([]);
    try {
      await page.fire(click("[data-lingguang-capture]"));
      await page.write({ body: "存过的话" });
      await page.fire(click("[data-lingguang-save-retry]"));
      assert.equal(page.store.get("S1")?.body, "存过的话", "typed and saved");
      await page.write({ body: "" });
      assert.equal(page.store.get("S1")?.body, "存过的话", "erased on screen, its save still waiting out the delay");
      if (leave === "hide") { page.lifetime.hideSurface(); await page.elapse(); } else await page.fire(click("[data-lingguang-back]"));
      assert.equal(page.store.get("S1")?.body, "", `${leave}: the erasure was saved first`);
      assert.deepEqual(page.discards().map(call => call.body.ids), [["S1"]], leave);
      assert.equal(page.store.get("S1")?.status, "discarded", leave);
      assert.equal(page.editorOpen(), false, leave);
    } finally { page.restore(); }
  }
});

test("a tab or window that is only hidden is not leaving", async () => {
  const page = await mounted([]);
  try {
    await page.fire(click("[data-lingguang-capture]"));
    page.lifetime.hideDocument(); await page.elapse();
    page.lifetime.showDocument(); await page.elapse();
    assert.equal(page.discards().length, 0);
    assert.equal(page.editorOpen(), true);
    assert.equal(page.store.get("S1")?.status, "inbox");
  } finally { page.restore(); }
});

test("a failed tidy-up on hiding is silent: the spark stays", async () => {
  const page = await mounted([], { discard: () => json({ error: "暂时丢不掉" }, 503) });
  try {
    await page.fire(click("[data-lingguang-capture]"));
    page.lifetime.hideSurface(); await page.elapse();
    assert.equal(page.discards().length, 1);
    assert.equal(page.store.get("S1")?.status, "inbox");
    assert.equal(page.part("[data-lingguang-note]").textContent, "");
  } finally { page.restore(); }
});

test("when the page goes away, the blank spark is thrown away with a call that outlives the page, judged by the copy the page last saw", async () => {
  const page = await mounted([]);
  try {
    await page.fire(click("[data-lingguang-capture]"));
    page.lifetime.unload(); await page.elapse();
    assert.deepEqual(page.discards().map(call => [call.body.ids, call.keepalive]), [[["S1"], true]]);
    assert.equal(page.calls.some(call => call.method === "GET" && call.path === "/api/plugins/lingguang/S1"), false, "no time to read the Host's copy first");
    assert.equal(page.store.get("S1")?.status, "discarded");
    // The workbench keeps the record open in a page so a reload reopens it, and forgets it when the page reports it is back at its
    // list (data-expanded false). A reopen of a spark that was just thrown away would show 「这条灵光已丢掉或不存在」 on every reload.
    assert.equal(page.editorOpen(), false);
    assert.equal(page.expanded(), "false", "the editor is closed with the discard, so the workbench forgets the record to reopen");
  } finally { page.restore(); }
  // Words saved a moment ago and then cleared on screen: the copy last saved still has them, so it stays.
  const cleared = await mounted([]);
  try {
    await cleared.fire(click("[data-lingguang-capture]"));
    await cleared.write({ body: "存过的话" });
    await cleared.fire(click("[data-lingguang-save-retry]"));
    assert.equal(cleared.store.get("S1")?.body, "存过的话", "saved");
    await cleared.write({ body: "" });
    cleared.lifetime.unload(); await cleared.elapse();
    assert.equal(cleared.discards().length, 0);
    assert.equal(cleared.expanded(), "true", "nothing was thrown away, so the record stays to be reopened");
    assert.equal(cleared.editorOpen(), true);
  } finally { cleared.restore(); }
  const written = await mounted([]);
  try {
    await written.fire(click("[data-lingguang-capture]"));
    await written.write({ body: "屏幕上有字" });
    written.lifetime.unload(); await written.elapse();
    assert.equal(written.discards().length, 0);
    assert.equal(written.expanded(), "true");
  } finally { written.restore(); }
  const refused = await mounted([], { discard: () => json({ error: "暂时丢不掉" }, 503) });
  try {
    await refused.fire(click("[data-lingguang-capture]"));
    refused.lifetime.unload(); await refused.elapse();
    assert.equal(refused.discards().length, 1);
    assert.equal(refused.store.get("S1")?.status, "inbox", "refused: it stays, in the list the page comes back as");
    assert.equal(refused.expanded(), "false");
    assert.equal(refused.part("[data-lingguang-note]").textContent, "", "and nothing is said about it");
  } finally { refused.restore(); }
});

test("once the editor is closed the surface stops naming the spark as the current object: back, hidden and going away alike", async () => {
  // The workbench reads this attribute to decide whether a record is already open (its Back and reload reopening); the placement
  // bar and the Assistant read it for the object in hand.
  const page = await mounted([]);
  try {
    await page.fire(click("[data-lingguang-capture]"));
    assert.equal(page.context()?.object?.id, "S1", "named while it is open");
    await page.fire(click("[data-lingguang-back]"));
    assert.equal(page.store.get("S1")?.status, "discarded");
    assert.equal(page.context()?.object, undefined, "back to the list");
    assert.equal(page.context()?.plugin_id, "io.molis.work.lingguang");
    await page.fire(click("[data-lingguang-capture]"));
    assert.equal(page.context()?.object?.id, "S2");
    page.lifetime.hideSurface(); await page.elapse();
    assert.equal(page.store.get("S2")?.status, "discarded");
    assert.equal(page.context()?.object, undefined, "hidden by the workbench");
    page.lifetime.showSurface();
    await page.fire(click("[data-lingguang-capture]"));
    assert.equal(page.context()?.object?.id, "S3");
    page.lifetime.unload(); await page.elapse();
    assert.equal(page.store.get("S3")?.status, "discarded");
    assert.equal(page.context()?.object, undefined, "the page going away");
  } finally { page.restore(); }
});

test("the workbench's own ways back to the list (its Back button, the plugin's name on the tab strip) also leave the blank spark", async () => {
  // It says "no item" with a select-item event and then folds the page (data-expanded false, the editor hidden) without asking the
  // plugin to close its editor; the plugin was left with a blank spark selected behind the list.
  const page = await mounted([spark("OLD", "想法", "有内容")]);
  try {
    await page.fire(click("[data-lingguang-capture]"));
    assert.equal(page.context()?.object?.id, "S1");
    await page.workbenchSelectsNothing(true);
    assert.deepEqual(page.discards().map(call => call.body.ids), [["S1"]]);
    assert.equal(page.store.get("S1")?.status, "discarded");
    assert.equal(page.store.get("OLD")?.status, "inbox");
    assert.equal(page.editorOpen(), false);
    assert.equal(page.expanded(), "false");
    assert.equal(page.context()?.object, undefined, "and the spark thrown away is not the object in hand");
    assert.equal(page.part("[data-lingguang-note]").textContent, "");
    await page.workbenchSelectsNothing(true);
    assert.equal(page.discards().length, 1, "saying it again takes nothing more");
  } finally { page.restore(); }
});

test("the workbench saying 「no item」 without folding the page leaves the blank spark where it is", async () => {
  const page = await mounted([]);
  try {
    await page.fire(click("[data-lingguang-capture]"));
    await page.workbenchSelectsNothing(false);
    assert.equal(page.discards().length, 0);
    assert.equal(page.editorOpen(), true);
    assert.equal(page.expanded(), "true");
    assert.equal(page.store.get("S1")?.status, "inbox");
  } finally { page.restore(); }
});

test("when the workbench folds the page, a spark with words, one that was already there, one written to elsewhere, one in a brainstorm and a refused discard all stay", async () => {
  const written = await mounted([]);
  try {
    await written.fire(click("[data-lingguang-capture]"));
    await written.write({ body: "刚冒出来的想法" });
    await written.workbenchSelectsNothing(true);
    assert.equal(written.discards().length, 0);
    assert.equal(written.store.get("S1")?.status, "inbox");
  } finally { written.restore(); }
  const old = await mounted([spark("OLD", "")]);
  try {
    await old.fire(click("[data-lingguang-id]", { lingguangId: "OLD" }));
    await old.workbenchSelectsNothing(true);
    assert.equal(old.discards().length, 0);
  } finally { old.restore(); }
  const elsewhere = await mounted([], { onGet: current => ({ ...current, body: "助理刚替你记了一句" }) });
  try {
    await elsewhere.fire(click("[data-lingguang-capture]"));
    await elsewhere.workbenchSelectsNothing(true);
    assert.equal(elsewhere.discards().length, 0);
    assert.equal(elsewhere.store.get("S1")?.status, "inbox");
  } finally { elsewhere.restore(); }
  const brainstorm = await mounted([]);
  try {
    await brainstorm.fire(click("[data-lingguang-capture]"));
    await brainstorm.fire(click(BRAINSTORM));
    await brainstorm.workbenchSelectsNothing(true);
    assert.equal(brainstorm.discards().length, 0);
    assert.equal(brainstorm.store.get("S1")?.status, "inbox");
  } finally { brainstorm.restore(); }
  const refused = await mounted([], { discard: () => json({ error: "暂时丢不掉" }, 503) });
  try {
    await refused.fire(click("[data-lingguang-capture]"));
    await refused.workbenchSelectsNothing(true);
    assert.equal(refused.discards().length, 1);
    assert.equal(refused.store.get("S1")?.status, "inbox");
    assert.equal(refused.editorOpen(), false);
    assert.equal(refused.part("[data-lingguang-note]").textContent, "");
  } finally { refused.restore(); }
});
