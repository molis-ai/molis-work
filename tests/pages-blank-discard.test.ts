import assert from "node:assert/strict";
import test from "node:test";

import { PAGES_CLIENT_FACTORY_SCRIPT, PAGES_NATIVE_PLUGIN_ROUTES } from "@molis-ai/molis-work-plugin-pages";

// W2-18 decision 6: a 「新建文档」 left with nothing written is taken back with the existing pages.discard when the
// person leaves it (back to the list, another document, another new document). Documents that already existed, were
// made from a template or an AI result, or have anything written in them are never touched.

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

async function mounted(initial: Doc[], options: { discard?: (doc: Doc, expected: number) => Response | null } = {}) {
  const store = new Map<string, Doc>(initial.map(doc => [doc.id, doc]));
  const calls: Array<{ method: string; path: string; body: Record<string, unknown>; stored_version?: number }> = [];
  let editorBody: unknown = EMPTY, change: (() => void) | null = null, created = 0;
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const saved = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, fetch: globalThis.fetch,
    document: (globalThis as { document?: unknown }).document, window: (globalThis as { window?: unknown }).window };
  globalThis.setTimeout = ((fn: () => void) => { const id = ++timerId; timers.set(id, fn); return id as unknown as ReturnType<typeof setTimeout>; }) as typeof setTimeout;
  globalThis.clearTimeout = ((id?: number) => { if (id) timers.delete(id); }) as typeof clearTimeout;
  const workbench = element(), rows = element(), titleInput = element(), note = element();
  const parts = new Map<string, FakeNode>([["[data-pages-rows]", rows], ["[data-pages-title]", titleInput], ["[data-pages-note]", note]]);
  workbench.querySelector = (selector?: string) => {
    const found = parts.get(selector ?? ""); if (found) return found;
    const made = element(); parts.set(selector ?? "", made); return made;
  };
  Object.assign(globalThis, {
    document: { querySelector: (selector: string) => selector === "[data-pages=workbench]" ? workbench : null, createElement: () => element(),
      addEventListener() {}, activeElement: null, body: { dataset: { routePrefix: "" } } },
    window: {
      dispatchEvent() {}, addEventListener() {},
      MolisWorkPagesEditor: {
        emptyDoc: () => EMPTY,
        mount: (_host: unknown, config: { doc: unknown; onChange: () => void }) => { editorBody = config.doc; change = config.onChange; return { id: "editor" }; },
        setDoc: (_editor: unknown, doc: unknown) => { editorBody = doc; }, getDoc: () => editorBody,
      },
    },
  });
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const parsed = new URL(url, "http://pages.test"), method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    calls.push({ method, path: parsed.pathname, body });
    if (parsed.pathname === "/api/board") return json({ goals: [] });
    if (parsed.pathname === "/api/plugins/pages") {
      if (method === "GET") return json({ documents: [...store.values()], folders: [] });
      created += 1;
      const doc: Doc = { id: `N${created}`, title: String(body.title ?? (body.template_id ? "周报模板" : "未命名文档")), body: body.body ?? (body.template_id ? text("模板正文") : EMPTY), version: 1, goal_id: "", artifact_version: 0 };
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
      const next = { ...current, title: String(body.title ?? current.title), body: body.body ?? current.body, version: current.version + 1 };
      store.set(current.id, next);
      return json({ document: next });
    }
    return json({ document: current });
  }) as typeof fetch;
  const factory = Function(`return (${PAGES_CLIENT_FACTORY_SCRIPT})`)() as (host: { translate: (text: string) => string; projectId: string }) => void;
  factory({ translate: value => value, projectId: "project-pages" });
  await flush();
  const fire = async (event: ReturnType<typeof click>) => { await workbench.listeners.click!(event); await flush(); };
  return {
    store, calls, titleInput, note, fire, parts,
    editor: () => editorBody,
    /** The person types: the editor and title change, and the 400 ms autosave runs. */
    async write(next: { title?: string; body?: unknown }) {
      if (next.title !== undefined) { titleInput.value = next.title; await titleInput.listeners.input?.({}); }
      if (next.body !== undefined) { editorBody = next.body; change?.(); }
      for (const fn of [...timers.values()]) fn();
      timers.clear(); await flush();
    },
    discards: () => calls.filter(call => call.path.endsWith("/discard")),
    restore() { Object.assign(globalThis, { setTimeout: saved.setTimeout, clearTimeout: saved.clearTimeout, fetch: saved.fetch, document: saved.document, window: saved.window }); },
  };
}
const existing = (id: string, title: string, body: unknown = EMPTY): Doc => ({ id, title, body, version: 4, goal_id: "", artifact_version: 0 });

test("the discard route exists next to delete and maps to pages.discard", () => {
  assert.ok(PAGES_NATIVE_PLUGIN_ROUTES.some(route => route.route_id === "pages.discard" && route.method === "POST" && route.pattern.test("/api/pages/abc/discard")));
});

test("a new document left blank is discarded when the person goes back to the list", async () => {
  const page = await mounted([existing("A", "周报", text("本周"))]);
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

test("a new document the person wrote in is kept, and so is one that only has a title", async () => {
  const page = await mounted([]);
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

test("a body that has anything other than empty paragraphs is not blank", async () => {
  const page = await mounted([]);
  try {
    await page.fire(click("[data-pages-new]"));
    await page.write({ body: { type: "doc", content: [{ type: "paragraph" }, { type: "horizontal_rule" }] } });
    await page.fire(click("[data-pages-back]"));
    assert.equal(page.discards().length, 0, "a divider, an image or a table is content");
  } finally { page.restore(); }
});

test("typing and then clearing everything again still leaves a blank document, discarded at its latest version", async () => {
  const page = await mounted([]);
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

test("opening another document or making another new one also leaves the blank one", async () => {
  const page = await mounted([existing("A", "周报", text("本周"))]);
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

test("an existing blank document, a template and an AI result are never discarded on leaving", async () => {
  const page = await mounted([existing("OLD", "未命名文档")]);
  try {
    await page.fire(click("button[data-page-id]", { pageId: "OLD" }));
    await page.fire(click("[data-pages-back]"));
    await page.fire(click("[data-pages-template]", { pagesTemplate: "weekly" }));
    await page.fire(click("[data-pages-back]"));
    assert.equal(page.discards().length, 0);
    assert.deepEqual([...page.store.keys()].sort(), ["N1", "OLD"]);
  } finally { page.restore(); }
});

test("when the discard is refused (it changed elsewhere) or fails, the document stays and the person is not interrupted", async () => {
  const page = await mounted([], { discard: () => json({ error: "改过了", code: "pages.conflict" }, 409) });
  try {
    await page.fire(click("[data-pages-new]"));
    await page.fire(click("[data-pages-back]"));
    assert.equal(page.discards().length, 1);
    assert.equal(page.store.has("N1"), true);
    assert.equal(page.note.textContent, "", "no error shown for a refused tidy-up");
    assert.equal(page.parts.get("[data-pages-stage-workspace]")?.hidden, true, "the editor is closed all the same");
  } finally { page.restore(); }
});
