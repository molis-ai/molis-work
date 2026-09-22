import assert from "node:assert/strict";
import test from "node:test";

import { PAGES_CLIENT_FACTORY_SCRIPT } from "../plugins/native/pages/src/client.ts";

interface FakeNode {
  hidden: boolean;
  textContent: string;
  value: string;
  title: string;
  className: string;
  innerHTML: string;
  draggable: boolean;
  dataset: Record<string, string>;
  style: Record<string, string>;
  children: FakeNode[];
  listeners: Record<string, (event: unknown) => void | Promise<void>>;
  classList: { toggle(): void; add(): void; remove(): void };
  setAttribute(): void;
  getAttribute(): null;
  append(...nodes: FakeNode[]): void;
  replaceChildren(...nodes: FakeNode[]): void;
  querySelector(): null;
  querySelectorAll(): FakeNode[];
  closest(): null;
  contains(): boolean;
  focus(): void;
  select(): void;
  removeEventListener(): void;
  showModal(): void;
  close(): void;
  readonly lastElementChild: FakeNode;
}

function element(): FakeNode {
  const node = {
    hidden: true,
    textContent: "",
    value: "",
    title: "",
    className: "",
    innerHTML: "",
    draggable: false,
    dataset: {},
    style: {},
    children: [] as FakeNode[],
    listeners: {} as FakeNode["listeners"],
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {},
    getAttribute() { return null; },
    append(...nodes: FakeNode[]) { node.children.push(...nodes); },
    replaceChildren(...nodes: FakeNode[]) { node.children = nodes.flat(); },
    querySelector() { return element(); },
    querySelectorAll() { return [] as FakeNode[]; },
    closest() { return null; },
    contains() { return false; },
    focus() {},
    select() {},
    removeEventListener() {},
    showModal() {},
    close() {},
    get lastElementChild() { return node.children.at(-1) ?? node; },
  };
  node.addEventListener = (type: string, fn: (event: unknown) => void) => { node.listeners[type] = fn; };
  return node as FakeNode & { addEventListener(type: string, fn: (event: unknown) => void): void };
}

function click(targetSelector: string, dataset: Record<string, string>) {
  return {
    target: {
      nodeType: 1,
      closest(selector: string) {
        return selector === targetSelector ? { dataset } : null;
      },
    },
    preventDefault() {},
    stopPropagation() {},
  };
}

async function flush() {
  for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

test("Pages 切换文档会先保存离开的草稿，旧响应不能把新正文写进旧文档", async () => {
  const posts: Array<{ url: string; body: { title?: string; body?: string } }> = [];
  const documents = new Map<string, { id: string; title: string; body: string; goal_id: string; artifact_version: number }>([
    ["A", { id: "A", title: "A", body: "A stored", goal_id: "", artifact_version: 0 }],
    ["B", { id: "B", title: "B", body: "B stored", goal_id: "", artifact_version: 0 }],
  ]);
  let editorBody = "";
  let change: (() => void) | null = null;
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const previousTimeout = globalThis.setTimeout;
  const previousClear = globalThis.clearTimeout;
  globalThis.setTimeout = ((fn: () => void) => {
    const id = ++timerId;
    timers.set(id, fn);
    return id as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id?: number) => { if (id) timers.delete(id); }) as typeof clearTimeout;

  const workbench = element();
  const rows = element();
  const titleInput = element();
  const titleEl = element();
  const statusEl = element();
  const note = element();
  const parts = new Map<string, FakeNode>([
    ["[data-pages=directory]", element()],
    ["[data-pages-rows]", rows],
    ["[data-pages-empty]", element()],
    ["[data-pages-search-empty]", element()],
    ["[data-pages-search]", element()],
    ["[data-pages-stage-workspace]", element()],
    ["[data-pages-editor-title]", titleEl],
    ["[data-pages-editor-status]", statusEl],
    ["[data-pages-title]", titleInput],
    ["[data-pages-goal]", element()],
    ["[data-pages-star-editor]", element()],
    ["[data-pages-editor]", element()],
    ["[data-pages-note]", note],
    ["[data-pages-confirm]", element()],
    ["[data-pages-name]", element()],
    ["[data-pages-template-dialog]", element()],
    ["[data-pages-more-menu]", element()],
    ["[data-pages-more]", element()],
    ["[data-pages-create-menu]", element()],
    ["[data-pages-create-more]", element()],
    ["[data-pages-move-menu]", element()],
  ]);
  workbench.querySelector = ((selector: string) => {
    const found = parts.get(selector);
    if (found) return found;
    const created = element();
    parts.set(selector, created);
    return created;
  }) as FakeNode["querySelector"];
  workbench.querySelectorAll = (() => []) as FakeNode["querySelectorAll"];
  workbench.addEventListener = (type: string, fn: (event: unknown) => void) => { workbench.listeners[type] = fn; };
  const documentStub = {
    querySelector: (selector: string) => selector === "[data-pages=workbench]" ? workbench : null,
    createElement: () => element(),
    addEventListener() {},
    activeElement: null as FakeNode | null,
    body: { dataset: { routePrefix: "" } },
  };
  const windowStub = {
    MolisWorkPagesEditor: {
      emptyDoc: () => "empty",
      mount: (_host: unknown, options: { doc: string; onChange: () => void }) => {
        editorBody = options.doc;
        change = options.onChange;
        return { id: "editor" };
      },
      setDoc: (_editor: unknown, doc: string) => { editorBody = doc; },
      getDoc: () => editorBody,
    },
  };
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  Object.assign(globalThis, { document: documentStub, window: windowStub });
  const fetchStub = (async (url: string, init?: RequestInit) => {
    const parsed = new URL(url, "http://pages.test");
    const payload = init?.body ? JSON.parse(String(init.body)) as { title?: string; body?: string } : {};
    if (init?.method === "POST") posts.push({ url: parsed.pathname, body: payload });
    if (parsed.pathname === "/api/plugins/pages" && (!init?.method || init.method === "GET")) {
      return json({ documents: [...documents.values()], folders: [] });
    }
    if (parsed.pathname === "/api/board") return json({ goals: [] });
    const id = decodeURIComponent(parsed.pathname.split("/").pop() || "");
    if (parsed.pathname.endsWith("/promote")) return json({ error: "promote should not run" }, 500);
    const current = documents.get(id);
    if (!current) return json({ error: "missing" }, 404);
    if (init?.method === "POST") {
      const next = { ...current, title: payload.title ?? current.title, body: payload.body ?? current.body };
      documents.set(id, next);
      return json({ document: next });
    }
    return json({ document: current });
  }) as typeof fetch;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = fetchStub;
  try {
    const factory = Function(`return (${PAGES_CLIENT_FACTORY_SCRIPT})`)() as (host: { translate: (text: string) => string; projectId: string }) => void;
    factory({ translate: (text) => text, projectId: "project-pages" });
    await flush();
    await workbench.listeners.click(click("button[data-page-id]", { pageId: "A" }));
    await flush();
    assert.equal(editorBody, "A stored");
    editorBody = "A edited";
    titleInput.value = "A edited title";
    change?.();
    assert.equal(posts.length, 0);
    await workbench.listeners.click(click("button[data-page-id]", { pageId: "B" }));
    await flush();
    assert.equal(timers.size, 0);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].url, "/api/plugins/pages/A");
    assert.equal(posts[0].body.body, "A edited");
    assert.equal(posts[0].body.title, "A edited title");
    assert.equal(editorBody, "B stored");
    assert.equal(documents.get("A")?.body, "A edited");
    assert.equal(documents.get("B")?.body, "B stored");

    let releaseSave: () => void = () => {};
    const blocked = new Promise<void>((resolve) => { releaseSave = resolve; });
    editorBody = "B edited";
    change?.();
    const pending = [...timers.values()];
    assert.equal(pending.length, 1);
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const parsed = new URL(url, "http://pages.test");
      if (init?.method === "POST" && parsed.pathname === "/api/plugins/pages/B") {
        const payload = JSON.parse(String(init.body)) as { title?: string; body?: string };
        posts.push({ url: parsed.pathname, body: payload });
        await blocked;
        const next = { ...documents.get("B")!, title: payload.title ?? "B", body: payload.body ?? "B" };
        documents.set("B", next);
        return json({ document: next });
      }
      return fetchStub(url, init);
    }) as typeof fetch;
    pending[0]();
    await flush();
    const switched = workbench.listeners.click(click("button[data-page-id]", { pageId: "A" }));
    await flush();
    assert.equal(editorBody, "B edited", "在途保存完成前不能切走正在保存的文档");
    assert.equal(posts.at(-1)?.body.body, "B edited");
    releaseSave();
    await switched;
    await flush();
    assert.equal(documents.get("B")?.body, "B edited");
    assert.equal(posts.some((post) => post.url === "/api/plugins/pages/A" && post.body.body === "B edited"), false);
    assert.equal(editorBody, "A edited");
    editorBody = "A again";
    change?.();
    for (const fn of timers.values()) fn();
    await flush();
    assert.equal(posts.at(-1)?.url, "/api/plugins/pages/A");
    assert.equal(posts.at(-1)?.body.body, "A again");
  } finally {
    globalThis.setTimeout = previousTimeout;
    globalThis.clearTimeout = previousClear;
    globalThis.fetch = previousFetch;
    Object.assign(globalThis, { document: previousDocument, window: previousWindow });
  }
});

test("Pages 保存失败时不发布、不关闭、不切走草稿", async () => {
  const calls: string[] = [];
  const documents = [{ id: "A", title: "A", body: "stored", goal_id: "", artifact_version: 0, starred: false }];
  let editorBody = "";
  let change: (() => void) | null = null;
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const previousTimeout = globalThis.setTimeout;
  const previousClear = globalThis.clearTimeout;
  globalThis.setTimeout = ((fn: () => void) => {
    const id = ++timerId;
    timers.set(id, fn);
    return id as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id?: number) => { if (id) timers.delete(id); }) as typeof clearTimeout;
  const workbench = element();
  const titleInput = element();
  const note = element();
  const parts = new Map<string, FakeNode>([
    ["[data-pages=directory]", element()],
    ["[data-pages-rows]", element()],
    ["[data-pages-empty]", element()],
    ["[data-pages-search-empty]", element()],
    ["[data-pages-search]", element()],
    ["[data-pages-stage-workspace]", element()],
    ["[data-pages-editor-title]", element()],
    ["[data-pages-editor-status]", element()],
    ["[data-pages-title]", titleInput],
    ["[data-pages-goal]", element()],
    ["[data-pages-star-editor]", element()],
    ["[data-pages-editor]", element()],
    ["[data-pages-note]", note],
    ["[data-pages-confirm]", element()],
    ["[data-pages-name]", element()],
    ["[data-pages-template-dialog]", element()],
    ["[data-pages-more-menu]", element()],
    ["[data-pages-more]", element()],
    ["[data-pages-create-menu]", element()],
    ["[data-pages-create-more]", element()],
    ["[data-pages-move-menu]", element()],
  ]);
  workbench.querySelector = ((selector: string) => {
    const found = parts.get(selector);
    if (found) return found;
    const created = element();
    parts.set(selector, created);
    return created;
  }) as FakeNode["querySelector"];
  workbench.querySelectorAll = (() => []) as FakeNode["querySelectorAll"];
  const documentStub = {
    querySelector: (selector: string) => selector === "[data-pages=workbench]" ? workbench : null,
    createElement: () => element(),
    addEventListener() {},
    activeElement: null,
    body: { dataset: { routePrefix: "" } },
  };
  Object.assign(globalThis, {
    document: documentStub,
    window: {
      MolisWorkPagesEditor: {
        emptyDoc: () => "empty",
        mount: (_host: unknown, options: { doc: string; onChange: () => void }) => {
          editorBody = options.doc;
          change = options.onChange;
          return { id: "editor" };
        },
        setDoc: (_editor: unknown, doc: string) => { editorBody = doc; },
        getDoc: () => editorBody,
      },
    },
  });
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const parsed = new URL(url, "http://pages.test");
    calls.push(`${init?.method || "GET"} ${parsed.pathname}`);
    if (parsed.pathname === "/api/plugins/pages" && (!init?.method || init.method === "GET")) return json({ documents, folders: [] });
    if (parsed.pathname === "/api/board") return json({ goals: [] });
    if (init?.method === "POST" && parsed.pathname === "/api/plugins/pages/A") return json({ error: "磁盘满了" }, 500);
    if (parsed.pathname.endsWith("/promote")) return json({ document: documents[0], artifact: { artifact_id: "wrong", version: 1 } });
    return json({ document: documents[0] });
  }) as typeof fetch;
  try {
    const factory = Function(`return (${PAGES_CLIENT_FACTORY_SCRIPT})`)() as (host: { translate: (text: string) => string; projectId: string }) => void;
    factory({ translate: (text) => text, projectId: "project-pages" });
    await flush();
    await workbench.listeners.click(click("button[data-page-id]", { pageId: "A" }));
    editorBody = "unsaved";
    titleInput.value = "unsaved title";
    change?.();
    await workbench.listeners.click(click("[data-pages-promote]", {}));
    await flush();
    assert.equal(editorBody, "unsaved");
    assert.equal(titleInput.value, "unsaved title");
    assert.equal(note.textContent, "磁盘满了");
    assert.equal(calls.some((call) => call.includes("/promote")), false);
    await workbench.listeners.click(click("[data-pages-back]", {}));
    await flush();
    assert.equal(parts.get("[data-pages-stage-workspace]")?.hidden, false);
    assert.equal(editorBody, "unsaved");
  } finally {
    globalThis.setTimeout = previousTimeout;
    globalThis.clearTimeout = previousClear;
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
