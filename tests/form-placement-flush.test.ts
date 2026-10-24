import assert from "node:assert/strict";
import test from "node:test";

import { FORM_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-form";

// LOGIC-08: the placement bar asks the open form to store editor edits before it moves the form.

interface Node {
  hidden: boolean; textContent: string; value: string; className: string; innerHTML: string; disabled: boolean; inert: boolean;
  type: string; checked: boolean; placeholder: string; title: string; id: string; htmlFor: string; maxLength: number;
  dataset: Record<string, string>; style: Record<string, string>; children: Node[];
  listeners: Record<string, (event: unknown) => void>;
  classList: { toggle(): void; add(): void; remove(): void; contains(): boolean };
  setAttribute(name?: string, value?: string): void; getAttribute(): string | null; removeAttribute(): void;
  append(...nodes: Node[]): void; replaceChildren(...nodes: Node[]): void;
  querySelector(selector?: string): Node | null; querySelectorAll(selector?: string): Node[];
  closest(selector?: string): Node | null; matches(selector?: string): boolean; contains(): boolean; focus(): void; click(): void; scrollIntoView(): void;
  addEventListener(type: string, fn: (event: unknown) => void): void; removeEventListener(): void;
  showModal(): void; close(): void;
  readonly offsetWidth: number;
  readonly lastElementChild: Node;
}
function element(): Node {
  const node = {
    hidden: false, textContent: "", value: "", className: "", innerHTML: "", disabled: false, inert: false,
    type: "button", checked: false, placeholder: "", title: "", id: "", htmlFor: "", maxLength: 0,
    dataset: {}, style: {}, children: [] as Node[], listeners: {} as Record<string, (event: unknown) => void>,
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    append(...nodes: Node[]) { node.children.push(...nodes); },
    replaceChildren(...nodes: Node[]) { node.children = nodes.flat(); },
    querySelector(): Node | null { return element(); },
    querySelectorAll(): Node[] { return []; },
    closest(): Node | null { return null; },
    // The form client script asks `event.target.matches(selector)` on change events; like closest/contains, the fake node matches nothing.
    matches: () => false,
    contains: () => false, focus() {}, click() {}, scrollIntoView() {},
    addEventListener(type: string, fn: (event: unknown) => void) { node.listeners[type] = fn; },
    removeEventListener() {}, showModal() {}, close() {},
    offsetWidth: 0,
    get lastElementChild() { return node.children.at(-1) ?? node; },
  };
  return node;
}

test("LOGIC-08 moving the open form stores its unsaved editor edits first", async () => {
  const calls: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];
  const form = { id: "f1", project_id: "p", title: "试用反馈", description: "", status: "draft", questions: [], version: 3, updated_at: "2026-10-16T00:00:00.000Z", created_at: "2026-10-16T00:00:00.000Z", artifact_version: 0 };
  const bench = element();
  const parts = new Map<string, Node>();
  bench.querySelector = (selector?: string) => {
    const key = selector ?? "";
    let found = parts.get(key);
    if (!found) { found = element(); parts.set(key, found); }
    return found;
  };
  const saved = { document: globalThis.document, window: (globalThis as { window?: unknown }).window, molisWorkRequest: (globalThis as { molisWorkRequest?: unknown }).molisWorkRequest };
  const windowListeners = new Map<string, Array<(event: { type: string; detail?: unknown }) => void>>();
  try {
    Object.assign(globalThis, {
      document: {
        querySelector: (selector: string) => selector === "[data-form=workbench]" ? bench : null,
        createElement: () => element(),
        createTextNode: (text: string) => ({ textContent: text }),
        addEventListener() {},
      },
      window: {
        addEventListener(type: string, fn: (event: { type: string; detail?: unknown }) => void) {
          const list = windowListeners.get(type) ?? []; list.push(fn); windowListeners.set(type, list);
        },
        dispatchEvent(event: { type: string; detail?: unknown }) { for (const fn of windowListeners.get(event.type) ?? []) fn(event); },
      },
      molisWorkRequest: async (url: string, init?: { method?: string; body?: Record<string, unknown> }) => {
        const method = init?.method ?? "GET";
        calls.push({ method, url, body: init?.body });
        if (url.includes("/forms/f1")) return { form: { ...form, title: String(init?.body?.title ?? form.title), version: method === "POST" ? form.version + 1 : form.version } };
        return { forms: [form], ai_available: false };
      },
    });
    const factory = Function(`return (${FORM_CLIENT_FACTORY_SCRIPT})`)() as (host: { translate: (text: string) => string; projectId: () => string; pluginId: string; route: (path: string) => string; pluginRoute: (path: string) => string }) => void;
    factory({ translate: text => text, projectId: () => "p", pluginId: "io.molis.work.form", route: path => path, pluginRoute: path => path });
    for (let i = 0; i < 8; i += 1) await new Promise(resolve => setImmediate(resolve));
    const row = element();
    row.dataset.formId = "f1";
    row.closest = (selector?: string) => selector === "button" || selector === "[data-form-id]" ? row : null;
    await bench.listeners.click?.({ target: row, preventDefault() {}, stopPropagation() {} });
    for (let i = 0; i < 8; i += 1) await new Promise(resolve => setImmediate(resolve));
    assert.equal(parts.get("[data-form-title]")!.value, "试用反馈", "the form is open");
    const title = parts.get("[data-form-title]")!;
    title.value = "改过的问卷";
    title.closest = (selector?: string) => selector?.includes("data-form-title") ? title : null;
    bench.listeners.input?.({ target: title });
    const settle: Array<Promise<unknown>> = [];
    for (const fn of windowListeners.get("molis:placement-flush") ?? []) fn({ type: "molis:placement-flush", detail: { mode: "move", object: { kind: "form", id: "f1" }, settle } });
    await Promise.all(settle);
    const savedCall = calls.find(call => call.body?.title === "改过的问卷");
    assert.ok(savedCall, "the editor title is stored before the move");
    assert.equal(savedCall?.body?.expected_version, 3);
  } finally {
    Object.assign(globalThis, saved);
  }
});
