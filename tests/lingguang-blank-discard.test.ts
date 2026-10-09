import assert from "node:assert/strict";
import test from "node:test";

import { LINGGUANG_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-lingguang";

// W2-18 decision 6, 灵光 side: 「记下第一条灵光」 makes a spark at once; one left with nothing written is thrown away with
// the existing lingguang.discard when the person leaves it (back to the list, another spark, another new spark). A spark that
// already existed, or has anything written in it (as the server sees it when the person leaves), is never touched.

interface FakeNode {
  hidden: boolean; textContent: string; value: string; title: string; className: string; innerHTML: string; disabled: boolean;
  dataset: Record<string, string>; style: Record<string, string>; children: FakeNode[];
  listeners: Record<string, (event: unknown) => void | Promise<void>>;
  classList: { toggle(): void; add(): void; remove(): void };
  setAttribute(): void; getAttribute(): null; append(...nodes: FakeNode[]): void; replaceChildren(...nodes: FakeNode[]): void;
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
const flush = async () => { for (let i = 0; i < 12; i += 1) await new Promise(resolve => setImmediate(resolve)); };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

interface Spark { id: string; project_id: string; title: string; body: string; source_kind: "manual"; status: "inbox" | "discarded"; created_at: string; updated_at: string }
const spark = (id: string, title: string, body = ""): Spark => ({ id, project_id: "p", title, body, source_kind: "manual", status: "inbox", created_at: "2026-10-09T00:00:00.000Z", updated_at: "2026-10-09T00:00:00.000Z" });

async function mounted(initial: Spark[], options: { onGet?: (spark: Spark) => Spark; discard?: () => Response | null } = {}) {
  const store = new Map<string, Spark>(initial.map(item => [item.id, item]));
  const calls: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];
  let created = 0, clock = 0;
  const saved = { fetch: globalThis.fetch, document: (globalThis as { document?: unknown }).document, window: (globalThis as { window?: unknown }).window,
    location: (globalThis as { location?: unknown }).location, molis: (globalThis as { molisWorkControlHeaders?: unknown }).molisWorkControlHeaders };
  const workbench = element();
  const parts = new Map<string, FakeNode>();
  const part = (selector: string) => { let found = parts.get(selector); if (!found) { found = element(); parts.set(selector, found); } return found; };
  workbench.querySelector = (selector?: string) => part(selector ?? "");
  part("[data-lingguang=directory]").contains = () => true;
  Object.assign(globalThis, {
    document: { querySelector: (selector: string) => selector === "[data-lingguang=workbench]" ? workbench : null, createElement: () => element(), addEventListener() {} },
    window: { dispatchEvent() {}, addEventListener() {} },
    location: { search: "" },
  });
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const parsed = new URL(url, "http://lingguang.test"), method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    calls.push({ method, path: parsed.pathname, body });
    if (parsed.pathname === "/api/placement/describe") return json({ associations: [] });
    if (parsed.pathname === "/api/plugins/lingguang") {
      if (method === "GET") return json({ sparks: [...store.values()].filter(item => item.status === "inbox") });
      created += 1;
      const made = spark(`S${created}`, String(body.title ?? "未命名灵光"), String(body.body ?? ""));
      store.set(made.id, made);
      return json({ spark: made });
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
  const factory = Function(`return (${LINGGUANG_CLIENT_FACTORY_SCRIPT})`)() as (host: { translate: (text: string) => string; route: (path: string) => string }) => void;
  factory({ translate: value => value, route: path => path });
  await flush();
  const fire = async (event: ReturnType<typeof click>) => { await workbench.listeners.click!(event); await flush(); };
  return {
    store, calls, fire, parts, part,
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
