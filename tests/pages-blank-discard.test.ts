import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { PAGES_CLIENT_FACTORY_SCRIPT, PAGES_NATIVE_PLUGIN_ROUTES } from "@molis-ai/molis-work-plugin-pages";
import { fakeLifetime } from "./fixtures/fake-client-lifetime.js";

// W2-18 decision 6: a 「新建文档」 left with nothing written is taken back with the existing pages.discard when the
// person leaves it (back to the list, another document, another new document, the workbench hiding the page for another
// plugin, the page going away). Documents that already existed, were made from a template or an AI result, or have anything
// written in them are never touched.

interface FakeNode {
  hidden: boolean; textContent: string; value: string; title: string; className: string; innerHTML: string; draggable: boolean;
  dataset: Record<string, string>; style: Record<string, string>; children: FakeNode[];
  listeners: Record<string, (event: unknown) => void | Promise<void>>;
  classList: { toggle(): void; add(): void; remove(): void };
  setAttribute(): void; getAttribute(): null; append(...nodes: FakeNode[]): void; replaceChildren(...nodes: FakeNode[]): void;
  querySelector(selector?: string): FakeNode | null; querySelectorAll(): FakeNode[]; closest(): null; contains(): boolean;
  focus(): void; select(): void; removeEventListener(): void; showModal(): void; close(): void;
  addEventListener(type: string, fn: (event: unknown) => void): void;
  readonly lastElementChild: FakeNode;
}
function element(): FakeNode {
  const node: FakeNode = {
    hidden: true, textContent: "", value: "", title: "", className: "", innerHTML: "", draggable: false, dataset: {}, style: {}, children: [], listeners: {},
    classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, getAttribute() { return null; },
    append(...nodes) { node.children.push(...nodes); }, replaceChildren(...nodes) { node.children = nodes.flat(); },
    querySelector() { return element(); }, querySelectorAll() { return []; }, closest() { return null; }, contains() { return false; },
    focus() {}, select() {}, removeEventListener() {}, showModal() {}, close() {},
    addEventListener(type, fn) { node.listeners[type] = fn; },
    get lastElementChild() { return node.children.at(-1) ?? node; },
  };
  return node;
}
const click = (targetSelector: string, dataset: Record<string, string> = {}) => ({
  target: { nodeType: 1, closest: (selector: string) => selector === targetSelector ? { dataset } : null }, preventDefault() {}, stopPropagation() {},
});
const flush = async () => { for (let i = 0; i < 10; i += 1) await new Promise(resolve => setImmediate(resolve)); };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const EMPTY = { type: "doc", content: [{ type: "paragraph" }] };
const text = (value: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: value }] }] });

interface Doc { id: string; title: string; body: unknown; version: number; goal_id: string; artifact_version: number }

type EditorConfig = { doc: unknown; onChange: () => void; onCreateFromAi: (input: { title: string; text: string }) => Promise<void> };
async function mounted(t: TestContext, initial: Doc[], options: { discard?: (doc: Doc, expected: number) => Response | null; template?: Partial<Doc>; update?: () => Response | null } = {}) {
  const store = new Map<string, Doc>(initial.map(doc => [doc.id, doc]));
  const calls: Array<{ method: string; path: string; body: Record<string, unknown>; keepalive?: boolean; stored_version?: number }> = [];
  let editorBody: unknown = EMPTY, change: (() => void) | null = null, created = 0, config: EditorConfig | null = null;
  const lifetime = fakeLifetime();
  const saved = { fetch: globalThis.fetch, document: (globalThis as { document?: unknown }).document, window: (globalThis as { window?: unknown }).window };
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const workbench = element(), rows = element(), titleInput = element(), note = element();
  const parts = new Map<string, FakeNode>([["[data-pages-rows]", rows], ["[data-pages-title]", titleInput], ["[data-pages-note]", note]]);
  workbench.querySelector = (selector?: string) => {
    const found = parts.get(selector ?? ""); if (found) return found;
    const made = element(); parts.set(selector ?? "", made); return made;
  };
  Object.assign(globalThis, {
    document: { querySelector: (selector: string) => selector === "[data-pages=workbench]" ? workbench : null, createElement: () => element(),
      addEventListener() {}, activeElement: null, hidden: false, body: { dataset: { routePrefix: "" } } },
    window: {
      dispatchEvent() {}, addEventListener() {},
      MolisWorkPagesEditor: {
        emptyDoc: () => EMPTY,
        mount: (_host: unknown, given: EditorConfig) => { config = given; editorBody = given.doc; change = given.onChange; return { id: "editor" }; },
        setDoc: (_editor: unknown, doc: unknown) => { editorBody = doc; }, getDoc: () => editorBody,
      },
    },
  });
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const parsed = new URL(url, "http://pages.test"), method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    calls.push({ method, path: parsed.pathname, body, keepalive: init?.keepalive });
    if (parsed.pathname === "/api/board") return json({ goals: [] });
    if (parsed.pathname === "/api/plugins/pages") {
      if (method === "GET") return json({ documents: [...store.values()], folders: [] });
      created += 1;
      const doc: Doc = { id: `N${created}`, title: String(body.title ?? (body.template_id ? "周报模板" : "未命名文档")), body: body.body ?? (body.template_id ? text("模板正文") : EMPTY), version: 1, goal_id: "", artifact_version: 0,
        ...(body.template_id ? options.template : {}) };
      store.set(doc.id, doc);
      return json({ document: doc });
    }
    const [, id, action] = /^\/api\/plugins\/pages\/([^/]+)(?:\/(.+))?$/.exec(parsed.pathname) ?? [];
    const current = store.get(decodeURIComponent(id ?? ""));
    if (!current) return json({ error: "missing" }, 404);
    if (action === "discard") {
      calls.at(-1)!.stored_version = current.version;
      const refused = options.discard?.(current, Number(body.expected_version));
      if (refused) return refused;
      if (current.version !== body.expected_version) return json({ error: "改过了", code: "pages.conflict" }, 409);
      store.delete(current.id);
      return json({ ok: true });
    }
    if (method === "POST") {
      const refusedUpdate = options.update?.(); if (refusedUpdate) return refusedUpdate;
      const next = { ...current, title: String(body.title ?? current.title), body: body.body ?? current.body, version: current.version + 1 };
      store.set(current.id, next);
      return json({ document: next });
    }
    return json({ document: current });
  }) as typeof fetch;
  const factory = Function(`return (${PAGES_CLIENT_FACTORY_SCRIPT})`)() as (host: { translate: (text: string) => string; projectId: string; mountPluginClient: typeof lifetime.mount }) => void;
  factory({ translate: value => value, projectId: "project-pages", mountPluginClient: lifetime.mount });
  await flush();
  const fire = async (event: ReturnType<typeof click>) => { await workbench.listeners.click!(event); await flush(); };
  return {
    store, calls, titleInput, note, fire, parts, lifetime,
    editor: () => editorBody,
    aiResult: async (input: { title: string; text: string }) => { await config!.onCreateFromAi(input); await flush(); },
    /** The person types: the editor and title change, and the 400 ms autosave runs unless `wait` is false (it is still pending). */
    async write(next: { title?: string; body?: unknown }, wait = true) {
      if (next.title !== undefined) { titleInput.value = next.title; await titleInput.listeners.input?.({}); }
      if (next.body !== undefined) { editorBody = next.body; change?.(); }
      if (wait) t.mock.timers.tick(400);
      await flush();
    },
    elapse: async (ms: number) => { t.mock.timers.tick(ms); await flush(); },
    discards: () => calls.filter(call => call.path.endsWith("/discard")),
    restore() { t.mock.timers.reset(); Object.assign(globalThis, { fetch: saved.fetch, document: saved.document, window: saved.window }); },
    editorOpen: () => parts.get("[data-pages-stage-workspace]")?.hidden === false,
  };
}
const existing = (id: string, title: string, body: unknown = EMPTY): Doc => ({ id, title, body, version: 4, goal_id: "", artifact_version: 0 });

test("the discard route exists next to delete and maps to pages.discard", () => {
  assert.ok(PAGES_NATIVE_PLUGIN_ROUTES.some(route => route.route_id === "pages.discard" && route.method === "POST" && route.pattern.test("/api/pages/abc/discard")));
});

test("a new document left blank is discarded when the person goes back to the list", async t => {
  const page = await mounted(t, [existing("A", "周报", text("本周"))]);
  try {
    await page.fire(click("[data-pages-new]"));
    assert.deepEqual([...page.store.keys()].sort(), ["A", "N1"], "created at once, as before");
    await page.fire(click("[data-pages-back]"));
    assert.equal(page.discards().length, 1);
    assert.equal(page.discards()[0]!.path, "/api/plugins/pages/N1/discard");
    assert.equal(page.discards()[0]!.body.expected_version, page.discards()[0]!.stored_version, "asked at the version the Host holds, so a change made elsewhere would refuse it");
    assert.deepEqual([...page.store.keys()], ["A"], "nothing is left behind");
    assert.equal(page.note.textContent, "", "no message: nothing was lost");
  } finally { page.restore(); }
});

test("a new document the person wrote in is kept, and so is one that only has a title", async t => {
  const page = await mounted(t, []);
  try {
    await page.fire(click("[data-pages-new]"));
    await page.write({ body: text("开头一句") });
    await page.fire(click("[data-pages-back]"));
    await page.fire(click("[data-pages-new]"));
    await page.write({ title: "只有标题" });
    await page.fire(click("[data-pages-back]"));
    assert.equal(page.discards().length, 0);
    assert.deepEqual([...page.store.values()].map(doc => doc.title).sort(), ["只有标题", "未命名文档"].sort());
  } finally { page.restore(); }
});

test("a body that has anything other than empty paragraphs is not blank", async t => {
  const page = await mounted(t, []);
  try {
    await page.fire(click("[data-pages-new]"));
    await page.write({ body: { type: "doc", content: [{ type: "paragraph" }, { type: "horizontal_rule" }] } });
    await page.fire(click("[data-pages-back]"));
    assert.equal(page.discards().length, 0, "a divider, an image or a table is content");
  } finally { page.restore(); }
});

test("typing and then clearing everything again still leaves a blank document, discarded at its latest version", async t => {
  const page = await mounted(t, []);
  try {
    await page.fire(click("[data-pages-new]"));
    await page.write({ body: text("写了又删") });
    await page.write({ body: EMPTY });
    assert.ok(page.store.get("N1")!.version >= 3, "saved twice on the way");
    await page.fire(click("[data-pages-back]"));
    assert.equal(page.discards().length, 1);
    assert.ok(Number(page.discards()[0]!.body.expected_version) >= 3);
    assert.equal(page.discards()[0]!.body.expected_version, page.discards()[0]!.stored_version, "the latest version, not the one it was made at");
    assert.equal(page.store.size, 0);
  } finally { page.restore(); }
});

test("opening another document or making another new one also leaves the blank one", async t => {
  const page = await mounted(t, [existing("A", "周报", text("本周"))]);
  try {
    await page.fire(click("[data-pages-new]"));
    await page.fire(click("button[data-page-id]", { pageId: "A" }));
    assert.deepEqual(page.discards().map(call => call.path), ["/api/plugins/pages/N1/discard"]);
    assert.deepEqual(page.editor(), text("本周"), "the other document is the one open now");
    await page.fire(click("[data-pages-new]"));
    await page.fire(click("[data-pages-new]"));
    assert.deepEqual(page.discards().map(call => call.path), ["/api/plugins/pages/N1/discard", "/api/plugins/pages/N2/discard"]);
    assert.deepEqual([...page.store.keys()].sort(), ["A", "N3"], "only the one now open remains");
  } finally { page.restore(); }
});

test("an existing blank document, a template and an AI result are never discarded on leaving", async t => {
  const page = await mounted(t, [existing("OLD", "未命名文档")]);
  try {
    await page.fire(click("button[data-page-id]", { pageId: "OLD" }));
    await page.fire(click("[data-pages-back]"));
    await page.fire(click("[data-pages-template]", { pagesTemplate: "weekly" }));
    await page.fire(click("[data-pages-back]"));
    assert.equal(page.discards().length, 0);
    assert.deepEqual([...page.store.keys()].sort(), ["N1", "OLD"]);
  } finally { page.restore(); }
});

test("when the discard is refused (it changed elsewhere) or fails, the document stays and the person is not interrupted", async t => {
  const page = await mounted(t, [], { discard: () => json({ error: "改过了", code: "pages.conflict" }, 409) });
  try {
    await page.fire(click("[data-pages-new]"));
    await page.fire(click("[data-pages-back]"));
    assert.equal(page.discards().length, 1);
    assert.equal(page.store.has("N1"), true);
    assert.equal(page.note.textContent, "", "no error shown for a refused tidy-up");
    assert.equal(page.parts.get("[data-pages-stage-workspace]")?.hidden, true, "the editor is closed all the same");
  } finally { page.restore(); }
});

test("an existing document is never discarded, not even once its title is cleared and nothing is left in it", async t => {
  // The title and body checks alone would let it go: only "this client made it blank just now" protects a document that was already there.
  const page = await mounted(t, [existing("OLD", "未命名文档", text("旧内容"))]);
  try {
    await page.fire(click("button[data-page-id]", { pageId: "OLD" }));
    await page.write({ title: "" });
    await page.write({ body: EMPTY });
    assert.equal(page.store.get("OLD")!.title, "", "the person emptied it and it was saved");
    await page.fire(click("[data-pages-back]"));
    assert.equal(page.discards().length, 0);
    await page.fire(click("button[data-page-id]", { pageId: "OLD" }));
    await page.fire(click("[data-pages-new]"));
    assert.deepEqual(page.discards().map(call => call.path), [], "going to another document does not take it back either");
    assert.equal(page.store.has("OLD"), true);
  } finally { page.restore(); }
});

test("a document made from a template or an AI result is not tracked as new, whatever it looks like when the person leaves", async t => {
  // Made so that it would be blank if it were tracked: the exclusion is in how the client treats the way it was made, not in the content.
  const page = await mounted(t, [], { template: { title: "未命名文档", body: EMPTY } });
  try {
    await page.fire(click("[data-pages-template]", { pagesTemplate: "empty" }));
    await page.fire(click("[data-pages-back]"));
    assert.equal(page.discards().length, 0, "a template result");
    await page.fire(click("[data-pages-new]"));
    await page.aiResult({ title: "", text: "" });
    await page.fire(click("[data-pages-back]"));
    assert.deepEqual(page.discards().map(call => call.path), ["/api/plugins/pages/N2/discard"], "only the plain new document N2 was taken back when the AI result replaced it");
    assert.deepEqual([...page.store.keys()].sort(), ["N1", "N3"], "the template result and the AI result stay");
  } finally { page.restore(); }
});

test("a document made in a folder with 「在此新建」 is tracked like a new one", async t => {
  const page = await mounted(t, []);
  try {
    await page.fire({ target: { nodeType: 1, closest: (selector: string) => selector === "[data-pages-folder-new]" ? { dataset: { pagesFolderNew: "F1" } } : null }, preventDefault() {}, stopPropagation() {} });
    assert.equal(page.store.size, 1);
    await page.fire(click("[data-pages-back]"));
    assert.equal(page.store.size, 0);
  } finally { page.restore(); }
});

test("when the workbench hides the page for another plugin, the blank document is taken back and the editor is closed", async t => {
  const page = await mounted(t, [existing("A", "周报", text("本周"))]);
  try {
    await page.fire(click("[data-pages-new]"));
    assert.equal(page.editorOpen(), true);
    page.lifetime.hideSurface(); await page.elapse(0);
    assert.deepEqual(page.discards().map(call => call.path), ["/api/plugins/pages/N1/discard"]);
    assert.equal(page.discards()[0]!.body.expected_version, page.discards()[0]!.stored_version);
    assert.equal(page.discards()[0]!.keepalive, undefined, "an ordinary call: the page is still here to see how it went");
    assert.equal(page.editorOpen(), false, "what comes back is the list, not an editor on a document that is gone");
    assert.deepEqual([...page.store.keys()], ["A"]);
    assert.equal(page.note.textContent, "");
    page.lifetime.showSurface(); await page.elapse(0);
    assert.equal(page.discards().length, 1, "showing the page again takes nothing more");
  } finally { page.restore(); }
});

test("hiding the page leaves alone a document with words in it, an existing one, and a failed discard still closes the editor", async t => {
  const page = await mounted(t, [existing("OLD", "未命名文档")]);
  try {
    await page.fire(click("button[data-page-id]", { pageId: "OLD" }));
    page.lifetime.hideSurface(); await page.elapse(0);
    assert.equal(page.editorOpen(), true, "an existing document: the editor stays as it was");
    page.lifetime.showSurface();
    await page.fire(click("[data-pages-new]"));
    await page.write({ body: text("写了一句") });
    page.lifetime.hideSurface(); await page.elapse(0);
    assert.equal(page.discards().length, 0);
    assert.equal(page.editorOpen(), true);
    assert.deepEqual([...page.store.keys()].sort(), ["N1", "OLD"]);
  } finally { page.restore(); }
  const refused = await mounted(t, [], { discard: () => json({ error: "改过了", code: "pages.conflict" }, 409) });
  try {
    await refused.fire(click("[data-pages-new]"));
    refused.lifetime.hideSurface(); await refused.elapse(0);
    assert.equal(refused.discards().length, 1);
    assert.equal(refused.store.has("N1"), true, "refused: it stays");
    assert.equal(refused.note.textContent, "");
  } finally { refused.restore(); }
});

test("a tab or window that is only hidden is not leaving", async t => {
  const page = await mounted(t, []);
  try {
    await page.fire(click("[data-pages-new]"));
    page.lifetime.hideDocument(); await page.elapse(0);
    page.lifetime.showDocument(); await page.elapse(0);
    assert.equal(page.discards().length, 0);
    assert.equal(page.editorOpen(), true, "the person comes back to the same editor");
    assert.equal(page.store.size, 1);
  } finally { page.restore(); }
});

test("a document with a save still pending is not taken back when the page is hidden: the save and the discard would race", async t => {
  const page = await mounted(t, []);
  try {
    await page.fire(click("[data-pages-new]"));
    await page.write({ body: text("一") }, false);
    await page.write({ body: EMPTY }, false);
    page.lifetime.hideSurface(); await page.elapse(0);
    assert.equal(page.discards().length, 0, "typed in and cleared inside the 400 ms: the save has not gone out yet");
    assert.equal(page.editorOpen(), true);
    await page.elapse(400);
    assert.equal(page.note.textContent, "", "and the save did not fail on a document taken from under it");
    assert.equal(page.store.get("N1")!.version, 2, "it went through");
    assert.equal(page.store.has("N1"), true);
  } finally { page.restore(); }
});

test("when the page goes away, the blank document is taken back with a call that outlives the page, and the editor is left alone", async t => {
  const page = await mounted(t, []);
  try {
    await page.fire(click("[data-pages-new]"));
    page.lifetime.unload(); await page.elapse(0);
    assert.equal(page.discards().length, 1);
    assert.equal(page.discards()[0]!.keepalive, true);
    assert.equal(page.discards()[0]!.body.expected_version, page.discards()[0]!.stored_version);
    assert.equal(page.store.size, 0);
    assert.equal(page.editorOpen(), true, "the page is going away anyway: nothing on it is redrawn");
  } finally { page.restore(); }
  const written = await mounted(t, []);
  try {
    await written.fire(click("[data-pages-new]"));
    await written.write({ body: text("写了") });
    written.lifetime.unload(); await written.elapse(0);
    assert.equal(written.discards().length, 0, "words in it");
  } finally { written.restore(); }
  const pending = await mounted(t, []);
  try {
    await pending.fire(click("[data-pages-new]"));
    await pending.write({ body: text("一") }, false);
    await pending.write({ body: EMPTY }, false);
    pending.lifetime.unload(); await pending.elapse(0);
    assert.equal(pending.discards().length, 0, "a save still pending");
  } finally { pending.restore(); }
});

test("a document whose last save failed is not taken back either: what the person typed is still on screen, unsaved", async t => {
  let failing = false;
  const page = await mounted(t, [], { update: () => failing ? json({ error: "暂时存不了" }, 503) : null });
  try {
    await page.fire(click("[data-pages-new]"));
    failing = true;
    await page.write({ body: text("一") });
    await page.write({ body: EMPTY }, false);
    await page.elapse(400);
    page.lifetime.hideSurface(); await page.elapse(0);
    assert.equal(page.discards().length, 0);
    assert.equal(page.editorOpen(), true);
    assert.equal(page.store.has("N1"), true);
  } finally { page.restore(); }
});
