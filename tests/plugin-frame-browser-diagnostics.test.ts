import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { buildSync } from "esbuild";
import { inputDeliveryDetails, inputDeliveryValues, type InputDeliverySource } from "./fixtures/plugin-frame-browser.js";

// RAC-2408: an input that was not delivered to a plugin frame names the browser version, the window bounds and the page
// viewport, so a small native window (R-73 on Chrome 151) reads as what it is instead of only `covered=undefined`.
test("RAC-2408 input delivery details name the browser version, the window bounds and the page viewport", () => {
  assert.equal(inputDeliveryDetails({ chrome: "Chrome/151.0.7922.47", window: "22,22 756x556", inner: "1440x960" }),
    "; chrome=Chrome/151.0.7922.47; window=22,22 756x556; inner=1440x960");
  assert.equal(inputDeliveryDetails({}), "; chrome=unavailable; window=unavailable; inner=unavailable");
  assert.equal(inputDeliveryDetails({ chrome: "Chrome/153.0.8010.12" }), "; chrome=Chrome/153.0.8010.12; window=unavailable; inner=unavailable");
  assert.equal(inputDeliveryDetails({ window: "0,0 1440x960" }), "; chrome=unavailable; window=0,0 1440x960; inner=unavailable");
});

test("RAC-2443 only the window read failing leaves the window unavailable and the version and viewport intact", async () => {
  const reads: string[] = [];
  const expressions: string[] = [];
  const browser: InputDeliverySource = {
    sessionId: "SESSION-3",
    command: async <T>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> => {
      reads.push(method + " " + JSON.stringify(params) + " " + (sessionId ?? "-"));
      if (method === "Browser.getVersion") return { product: "Chrome/153.0.8010.12" } as T;
      if (method === "Target.getTargetInfo") return { targetInfo: { targetId: "TARGET-1" } } as T;
      throw new Error("Browser.getWindowForTarget closed");
    },
    evaluate: async <T>(expression: string): Promise<T> => { expressions.push(expression); return { width: 1440, height: 960 } as T; },
  };
  assert.deepEqual(await inputDeliveryValues(browser), { chrome: "Chrome/153.0.8010.12", window: undefined, inner: "1440x960" },
    "the window is unavailable, the version and the viewport are still there, and the diagnostics are not swallowed");
  // The full line, not just its method: a read of the wrong target would have been recorded under the same prefix.
  assert.deepEqual(reads, [
    "Browser.getVersion {} -",
    "Target.getTargetInfo {} SESSION-3",
    'Browser.getWindowForTarget {"targetId":"TARGET-1"} -',
  ], "exactly the version read, the target read and the window read for TARGET-1 are recorded");
  assert.deepEqual(expressions, ["({width: innerWidth, height: innerHeight})"], "the viewport is read through the inner size expression");
});

test("RAC-2408 the diagnostics read the version, the target window and the viewport, and reads that fail are left unavailable", async () => {
  const reads: string[] = [];
  const expressions: string[] = [];
  const browser: InputDeliverySource = {
    sessionId: "SESSION-1",
    command: async <T>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> => {
      reads.push(method + " " + JSON.stringify(params) + " " + (sessionId ?? "-"));
      if (method === "Browser.getVersion") return { product: "Chrome/153.0.8010.12" } as T;
      if (method === "Target.getTargetInfo") return { targetInfo: { targetId: "TARGET-1" } } as T;
      return { bounds: { left: 22, top: 22, width: 756, height: 556 } } as T;
    },
    evaluate: async <T>(expression: string): Promise<T> => { expressions.push(expression); return { width: 1440, height: 960 } as T; },
  };
  assert.deepEqual(await inputDeliveryValues(browser), {
    chrome: "Chrome/153.0.8010.12", window: "22,22 756x556", inner: "1440x960",
  });
  assert.deepEqual(reads, [
    "Browser.getVersion {} -",
    "Target.getTargetInfo {} SESSION-1",
    'Browser.getWindowForTarget {"targetId":"TARGET-1"} -',
  ]);
  assert.deepEqual(expressions, ["({width: innerWidth, height: innerHeight})"], "the viewport is read through the inner size expression, once");
  const unreadable: InputDeliverySource = {
    sessionId: "SESSION-2",
    command: async () => { throw new Error("CDP connection closed"); },
    evaluate: async () => { throw new Error("CDP connection closed"); },
  };
  assert.deepEqual(await inputDeliveryValues(unreadable), { chrome: undefined, window: undefined, inner: undefined });
});

test("102-1 plugin-frame fetch handles JSON, plain text, URLSearchParams, binary, and case-sensitive multipart FormData without JSON.parse crashes", () => {
  const bundled = buildSync({
    entryPoints: [fileURLToPath(new URL("../apps/workbench/src/browser/plugin-frame/fetch.ts", import.meta.url))],
    bundle: true,
    format: "iife",
    globalName: "frameFetchMod",
    platform: "browser",
    write: false,
  }).outputFiles[0]!.text;
  const ctx: Record<string, unknown> = { Blob, TextDecoder, Object };
  runInNewContext(bundled, ctx);
  const { frameRequestPayload } = ctx.frameFetchMod as {
    frameRequestPayload(rawBody: ArrayBuffer | null | undefined, contentType: string | undefined): { body?: unknown; file?: Blob };
  };
  const buf = (text: string) => new TextEncoder().encode(text).buffer;

  assert.equal(JSON.stringify(frameRequestPayload(null, undefined)), "{}");
  assert.equal(JSON.stringify(frameRequestPayload(new ArrayBuffer(0), "application/json")), "{}");

  const json = frameRequestPayload(buf('{"ok":true}'), "application/json; charset=utf-8");
  assert.deepEqual(JSON.parse(JSON.stringify(json.body)), { ok: true });
  assert.equal(json.file, undefined);

  const multipartType = "multipart/form-data; boundary=----WebKitFormBoundaryAbCdEf123";
  const form = frameRequestPayload(buf("------WebKitFormBoundaryAbCdEf123\r\nContent-Disposition: form-data; name=\"a\"\r\n\r\n1\r\n------WebKitFormBoundaryAbCdEf123--\r\n"), multipartType);
  assert.equal(form.body, undefined);
  assert.ok(form.file instanceof Blob);
  assert.equal(form.file.type, multipartType, "multipart boundary case must be preserved");

  const plain = frameRequestPayload(buf("hello world"), "text/plain; charset=utf-8");
  assert.equal(plain.body, undefined);
  assert.equal(plain.file?.type, "text/plain; charset=utf-8");

  const params = frameRequestPayload(buf("a=1&b=2"), "application/x-www-form-urlencoded");
  assert.equal(params.body, undefined);
  assert.equal(params.file?.type, "application/x-www-form-urlencoded");

  const untypedNonJson = frameRequestPayload(buf("not-json-plain-text"), undefined);
  assert.equal(untypedNonJson.body, undefined);
  assert.equal(untypedNonJson.file?.type, "application/octet-stream");

  // Explicit +json, parameterized JSON, and empty-body non-JSON writes preserve exact Content-Type via raw Blob slot (102-1 P2-2).
  const mergePatch = frameRequestPayload(buf('{"op":"replace"}'), "application/merge-patch+json");
  assert.equal(mergePatch.body, undefined);
  assert.equal(mergePatch.file?.type, "application/merge-patch+json");

  const profiledJson = frameRequestPayload(buf('{"v":2}'), 'application/json; profile="v2"');
  assert.equal(profiledJson.body, undefined);
  assert.equal(profiledJson.file?.type, 'application/json; profile="v2"');

  const emptyText = frameRequestPayload(new ArrayBuffer(0), "text/plain");
  assert.equal(emptyText.body, undefined);
  assert.equal(emptyText.file?.type, "text/plain");
  assert.equal(emptyText.file?.size, 0);
});

test("102-1 plugin-frame navigation normalizes and dispatches platform-aware shortcuts (⌘[/⌘], ⌘⇧T, ⌘⇧↵, ⌘.)", () => {
  const bundled = buildSync({
    entryPoints: [fileURLToPath(new URL("../apps/workbench/src/browser/plugin-frame/navigation.ts", import.meta.url))],
    bundle: true,
    format: "iife",
    globalName: "frameNavMod",
    platform: "browser",
    write: false,
  }).outputFiles[0]!.text;
  const ctx: Record<string, unknown> = { navigator: { platform: "MacIntel" } };
  runInNewContext(bundled, ctx);
  const { normalizeChildShortcut, shortcutKeyboardEventInit } = ctx.frameNavMod as {
    normalizeChildShortcut(key: Partial<KeyboardEvent>, mac?: boolean): string;
    shortcutKeyboardEventInit(chord: string, mac?: boolean): KeyboardEventInit;
  };

  // macOS: Meta is Mod, Ctrl is rejected as Mod
  assert.equal(normalizeChildShortcut({ key: "[", code: "BracketLeft", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }, true), "Mod+BracketLeft");
  assert.equal(normalizeChildShortcut({ key: "]", code: "BracketRight", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }, true), "Mod+BracketRight");
  assert.equal(normalizeChildShortcut({ key: "T", code: "KeyT", metaKey: true, ctrlKey: false, shiftKey: true, altKey: false }, true), "Mod+Shift+T");
  assert.equal(normalizeChildShortcut({ key: "Enter", code: "Enter", metaKey: true, ctrlKey: false, shiftKey: true, altKey: false }, true), "Mod+Shift+Enter");
  assert.equal(normalizeChildShortcut({ key: ".", code: "Period", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }, true), "Mod+Period");
  assert.equal(normalizeChildShortcut({ key: "[", code: "BracketLeft", metaKey: false, ctrlKey: true, shiftKey: false, altKey: false }, true), "");

  // Non-Mac (Linux/Windows): Ctrl is Mod (and exclusive Meta is accepted for cross-platform chords), combined Ctrl+Meta is rejected; Alt+ArrowLeft/Right for history
  assert.equal(normalizeChildShortcut({ key: "ArrowLeft", code: "ArrowLeft", metaKey: false, ctrlKey: false, shiftKey: false, altKey: true }, false), "Alt+ArrowLeft");
  assert.equal(normalizeChildShortcut({ key: "T", code: "KeyT", metaKey: false, ctrlKey: true, shiftKey: true, altKey: false }, false), "Mod+Shift+T");
  assert.equal(normalizeChildShortcut({ key: "Enter", code: "Enter", metaKey: false, ctrlKey: true, shiftKey: true, altKey: false }, false), "Mod+Shift+Enter");
  assert.equal(normalizeChildShortcut({ key: ".", code: "Period", metaKey: false, ctrlKey: true, shiftKey: false, altKey: false }, false), "Mod+Period");
  assert.equal(normalizeChildShortcut({ key: "K", code: "KeyK", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }, false), "Mod+K");
  assert.equal(normalizeChildShortcut({ key: "T", code: "KeyT", metaKey: true, ctrlKey: true, shiftKey: true, altKey: false }, false), "");

  const macBracket = shortcutKeyboardEventInit("Mod+BracketLeft", true);
  assert.equal(macBracket.key, "[");
  assert.equal(macBracket.metaKey, true);
  assert.equal(macBracket.ctrlKey, false);

  const linuxSolo = shortcutKeyboardEventInit("Mod+Shift+Enter", false);
  assert.equal(linuxSolo.key, "Enter");
  assert.equal(linuxSolo.metaKey, false);
  assert.equal(linuxSolo.ctrlKey, true);
  assert.equal(linuxSolo.shiftKey, true);

  // Reduced UA hints may report empty userAgentData.platform; fall back to navigator.platform (P2-4).
  const reducedCtx: Record<string, unknown> = { navigator: { platform: "MacIntel", userAgentData: { platform: "" } } };
  runInNewContext(bundled, reducedCtx);
  const reducedNav = reducedCtx.frameNavMod as typeof ctx.frameNavMod & {
    normalizeChildShortcut(key: Partial<KeyboardEvent>): string;
  };
  assert.equal(reducedNav.normalizeChildShortcut({ key: "[", code: "BracketLeft", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }), "Mod+BracketLeft");

  // P1-6: pageNavigation omits duplicate Mod+Period (handled exclusively by childContext) and childNavigation respects open dialogs/popovers and contenteditable="plaintext-only".
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  let openOverlay = false;
  const posted: unknown[] = [];
  class FakeElement {
    constructor(readonly editable = false) {}
    closest(sel: string) { return this.editable && sel.includes("plaintext-only") ? this : null; }
  }
  class FakeHTMLElement extends FakeElement {
    get isContentEditable() { return this.editable; }
  }
  const navCtx: Record<string, unknown> = {
    navigator: { platform: "MacIntel" },
    Element: FakeElement,
    HTMLElement: FakeHTMLElement,
    window: {
      addEventListener: (type: string, fn: (e: unknown) => void) => {
        (listeners.get(type) ?? listeners.set(type, []).get(type)!).push(fn);
      },
      removeEventListener: () => {},
    },
    parent: undefined as unknown,
    document: {
      querySelectorAll: () => [],
      querySelector: (sel: string) => {
        if (sel === "dialog[open],:popover-open") return openOverlay ? {} : null;
        if (sel.includes("[data-tab-workspace]")) return {};
        return null;
      },
      hasFocus: () => false,
    },
  };
  navCtx.parent = navCtx.window;
  runInNewContext(bundled, navCtx);
  const navApi = navCtx.frameNavMod as {
    pageNavigation(scope: unknown, port: unknown, side: boolean): { shortcuts: string[] };
    childNavigation(port: unknown, scope: unknown, config: { shortcuts: string[]; side: boolean }, itemTab: () => undefined): void;
  };
  const scope = {
    visible: true,
    listen: (_target: unknown, type: string, fn: (e: unknown) => void) => {
      (listeners.get(type) ?? listeners.set(type, []).get(type)!).push(fn);
    },
    own: () => {},
  };
  const port = { postMessage: (msg: unknown) => posted.push(msg) };
  const pageNav = navApi.pageNavigation(scope, port, false);
  assert.ok(!pageNav.shortcuts.includes("Mod+Period"), "Mod+Period must not be duplicated in pageNavigation shortcuts");
  assert.ok(pageNav.shortcuts.includes("Mod+BracketLeft") && pageNav.shortcuts.includes("Mod+Shift+T"));

  navApi.childNavigation(port, scope, { shortcuts: pageNav.shortcuts, side: true }, () => undefined);
  const fireKey = (init: Record<string, unknown>) => {
    let prevented = false;
    const ev = { repeat: false, isComposing: false, defaultPrevented: false, preventDefault: () => { prevented = true; }, ...init };
    for (const fn of listeners.get("keydown") ?? []) fn(ev);
    return prevented;
  };

  // Open dialog/popover blocks both Escape and Mod+[.
  openOverlay = true;
  assert.equal(fireKey({ key: "Escape", code: "Escape", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }), false);
  assert.equal(fireKey({ key: "[", code: "BracketLeft", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }), false);
  assert.equal(posted.length, 0);

  // Closing overlay restores forwarding; plaintext-only contenteditable still suppresses Mod+Shift+T.
  openOverlay = false;
  assert.equal(fireKey({ key: "T", code: "KeyT", metaKey: true, ctrlKey: false, shiftKey: true, altKey: false, target: new FakeHTMLElement(true) }), false);
  assert.equal(posted.length, 0);
  assert.equal(fireKey({ key: "[", code: "BracketLeft", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, target: new FakeElement(false) }), true);
  assert.deepEqual(JSON.parse(JSON.stringify(posted)), [{ type: "shortcut", keys: "Mod+BracketLeft" }]);
});

test("102-1 plugin-frame document hoists same-origin /assets/ stylesheets into <head> and rejects foreign/non-asset/embedded links", () => {
  const bundled = buildSync({
    entryPoints: [fileURLToPath(new URL("../apps/workbench/src/browser/plugin-frame/document.ts", import.meta.url))],
    bundle: true,
    format: "iife",
    globalName: "frameDocMod",
    platform: "browser",
    write: false,
  }).outputFiles[0]!.text;
  const ctx: Record<string, unknown> = { URL };
  runInNewContext(bundled, ctx);
  const { extractHeadStyleLinks } = ctx.frameDocMod as {
    extractHeadStyleLinks(content: string, origin: string): { headLinks: string; bodyContent: string };
  };
  const origin = "http://127.0.0.1:4173";
  const input = '<link rel="stylesheet" href="/assets/molis-work-plugins/coding.css">'
    + '<link title="a>b" rel="stylesheet" href="/assets/molis-work-plugins/quoted.css">'
    + '<link title=\'rel="stylesheet" href="/assets/spoof.css"\' rel="icon" href="/favicon.ico">'
    + '<link rel="stylesheet" href="https://evil.invalid/assets/x.css">'
    + '<link rel="stylesheet" href="/api/other.css">'
    + '<link data-rel="stylesheet" data-href="/assets/fake.css" rel="stylesheet" href="https://evil.invalid/b.css">'
    + '<link rel="stylesheet" href="http://user:pass@127.0.0.1:4173/assets/cred.css">'
    + '<main><textarea><link rel="stylesheet" href="/assets/in-body.css"></textarea></main>';
  const result = extractHeadStyleLinks(input, origin);
  assert.equal(result.headLinks,
    '<link rel="stylesheet" href="http://127.0.0.1:4173/assets/molis-work-plugins/coding.css">'
    + '<link rel="stylesheet" href="http://127.0.0.1:4173/assets/molis-work-plugins/quoted.css">');
  assert.ok(!result.bodyContent.includes("coding.css"), "hoisted same-origin /assets/ link removed from body");
  assert.ok(!result.bodyContent.includes("quoted.css"), "quote-aware > inside title attribute still hoists leading link");
  assert.ok(!result.headLinks.includes("spoof.css"), "rel/href inside another attribute value is never hoisted");
  assert.ok(result.bodyContent.includes("https://evil.invalid/assets/x.css"), "foreign-origin link never hoisted");
  assert.ok(result.bodyContent.includes("/api/other.css"), "non-/assets/ link never hoisted");
  assert.ok(result.bodyContent.includes('data-href="/assets/fake.css"'), "data-rel/data-href attributes never falsely matched");
  assert.ok(result.bodyContent.includes("user:pass@127.0.0.1:4173/assets/cred.css"), "credentialed URLs never hoisted");
  assert.ok(result.bodyContent.includes('<textarea><link rel="stylesheet" href="/assets/in-body.css"></textarea>'), "body/textarea content never rewritten");
});

/** Minimal DOM stub for deterministic unit testing of design-system & plugin-frame browser primitives (91-0b). */
function createMiniDom() {
  type Listener = (event: Record<string, unknown>) => void;
  class MiniNode {
    tagName: string;
    nodeType = 1;
    className = "";
    dataset: Record<string, string> = {};
    style: Record<string, string> = {};
    attributes = new Map<string, string>();
    children: Array<MiniNode | { nodeType: number; textContent: string; childNodes: unknown[]; parentNode: MiniNode | null; remove(): void }> = [];
    parentNode: MiniNode | null = null;
    hidden = false;
    disabled = false;
    required = false;
    readOnly = false;
    checked = false;
    type = "";
    value = "";
    id = "";
    content?: MiniNode;
    #text = "";
    #listeners = new Map<string, { fn: Listener; once?: boolean }[]>();
    #classes = new Set<string>();
    animated: { frames: unknown; options: Record<string, unknown> }[] = [];
    scrolled: unknown[] = [];
    scrollTop = 0;
    scrollHeight = 400;
    clientHeight = 100;
    focused = false;
    modalOpen = false;
    classList = {
      add: (...names: string[]) => { for (const n of names) this.#classes.add(n); this.className = [...this.#classes].join(" "); },
      remove: (...names: string[]) => { for (const n of names) this.#classes.delete(n); this.className = [...this.#classes].join(" "); },
      toggle: (name: string, force?: boolean) => { const on = force ?? !this.#classes.has(name); if (on) this.#classes.add(name); else this.#classes.delete(name); this.className = [...this.#classes].join(" "); return on; },
      contains: (name: string) => this.#classes.has(name) || this.className.split(/\s+/).includes(name),
    };
    constructor(tag = "div") { this.tagName = tag.toUpperCase(); }
    get isConnected() { return true; }
    get childNodes() { return this.children; }
    get parentElement() { return this.parentNode; }
    get textContent() { return this.#text || this.children.map(c => c.textContent).join(""); }
    set textContent(v: string) { this.#text = v; this.children = []; }
    get outerHTML() { return `<${this.tagName.toLowerCase()}>${this.textContent}</${this.tagName.toLowerCase()}>`; }
    cloneNode() { return new MiniNode(this.tagName); }
    setAttribute(k: string, v: string) {
      this.attributes.set(k, v);
      if (k === "class") this.className = v;
      if (k.startsWith("data-")) {
        const key = k.slice(5).replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
        this.dataset[key] = v;
      }
    }
    getAttribute(k: string) { return this.attributes.get(k) ?? null; }
    hasAttribute(k: string) {
      if (this.attributes.has(k)) return true;
      if (k.startsWith("data-")) {
        const key = k.slice(5).replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
        return key in this.dataset;
      }
      return false;
    }
    removeAttribute(k: string) {
      this.attributes.delete(k);
      if (k.startsWith("data-")) {
        const key = k.slice(5).replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
        delete this.dataset[key];
      }
    }
    append(...nodes: MiniNode[]) { for (const n of nodes) { n.parentNode = this; this.children.push(n); } }
    appendChild<T extends MiniNode | { nodeType: number; textContent: string; childNodes: unknown[]; parentNode: MiniNode | null; remove(): void }>(n: T): T { n.parentNode = this; this.children.push(n); return n; }
    prepend(...nodes: MiniNode[]) { for (const n of [...nodes].reverse()) { n.parentNode = this; this.children.unshift(n); } }
    insertBefore(n: MiniNode, ref: MiniNode) { const i = this.children.indexOf(ref); n.parentNode = this; if (i >= 0) this.children.splice(i, 0, n); else this.children.push(n); }
    before(...nodes: MiniNode[]) { if (!this.parentNode) return; for (const n of nodes) this.parentNode.insertBefore(n, this); }
    replaceChildren(...nodes: MiniNode[]) { this.children = []; this.#text = ""; this.append(...nodes); }
    remove() { if (!this.parentNode) return; this.parentNode.children = this.parentNode.children.filter(c => c !== this); this.parentNode = null; }
    contains(target: unknown): boolean { return target === this || this.children.some(c => c instanceof MiniNode && c.contains(target)); }
    focus() { this.focused = true; }
    blur() { this.focused = false; }
    select() {}
    showModal() { this.modalOpen = true; }
    close() { this.modalOpen = false; }
    normalize() {}
    getAnimations() { return []; }
    getBoundingClientRect() { return { left: 0, top: this.children.length * 10, width: 200, height: Math.max(40, this.children.length * 40) }; }
    animate(frames: unknown, options: Record<string, unknown>) { this.animated.push({ frames, options }); return { cancel() {} }; }
    scrollTo(opts: unknown) { this.scrolled.push(opts); }
    addEventListener(type: string, fn: Listener, opts?: { once?: boolean }) {
      const list = this.#listeners.get(type) ?? [];
      list.push({ fn, once: opts?.once });
      this.#listeners.set(type, list);
    }
    removeEventListener(type: string, fn: Listener) {
      const list = this.#listeners.get(type);
      if (list) this.#listeners.set(type, list.filter(item => item.fn !== fn));
    }
    dispatchEvent(event: Record<string, unknown>) {
      const type = String(event.type);
      const list = [...(this.#listeners.get(type) ?? [])];
      for (const item of list) {
        if (item.once) this.removeEventListener(type, item.fn);
        item.fn(event);
      }
      return !event.defaultPrevented;
    }
    matches(selector: string): boolean {
      return selector.split(",").map(s => s.trim()).some(part => {
        if (part.startsWith(".")) return this.classList.contains(part.slice(1));
        if (part.startsWith("[") && part.endsWith("]")) {
          const inner = part.slice(1, -1);
          const eq = inner.indexOf("=");
          if (eq < 0) return this.hasAttribute(inner);
          const val = inner.slice(eq + 1).replace(/^["']|["']$/g, "");
          return this.getAttribute(inner.slice(0, eq)) === val;
        }
        const tagMatch = /^([a-z]+)(?:\[type="([^"]+)"\])?(?:\[([^\]]+)\])?$/i.exec(part);
        if (tagMatch) {
          if (this.tagName !== tagMatch[1]!.toUpperCase()) return false;
          if (tagMatch[2] && this.type !== tagMatch[2]) return false;
          if (tagMatch[3] && !this.hasAttribute(tagMatch[3])) return false;
          return true;
        }
        return this.tagName === part.toUpperCase();
      });
    }
    closest(selector: string): MiniNode | null {
      let cur: MiniNode | null = this;
      while (cur) { if (cur.matches(selector)) return cur; cur = cur.parentNode; }
      return null;
    }
    querySelectorAll(selector: string): MiniNode[] {
      const found: MiniNode[] = [];
      const walk = (n: MiniNode) => {
        for (const c of n.children) {
          if (!(c instanceof MiniNode)) continue;
          if (selector.startsWith(":scope > ")) {
            const sub = selector.slice(":scope > ".length).replace(/:first-of-type$/, "");
            if (n === this && c.matches(sub)) found.push(c);
          } else {
            if (c.matches(selector)) found.push(c);
            walk(c);
          }
        }
      };
      walk(this);
      return found;
    }
    querySelector(selector: string): MiniNode | null { return this.querySelectorAll(selector)[0] ?? null; }
  }
  const documentElement = new MiniNode("html");
  const body = new MiniNode("body");
  const docListeners = new Map<string, Listener[]>();
  const document = {
    readyState: "complete",
    documentElement,
    body,
    activeElement: null as MiniNode | null,
    createElement: (tag: string) => new MiniNode(tag),
    querySelector: (s: string) => body.querySelector(s),
    querySelectorAll: (s: string) => body.querySelectorAll(s),
    addEventListener: (type: string, fn: Listener) => { const l = docListeners.get(type) ?? []; l.push(fn); docListeners.set(type, l); },
    dispatch: (type: string, event: Record<string, unknown>) => { for (const fn of docListeners.get(type) ?? []) fn(event); },
  };
  return { MiniNode, document, documentElement, body };
}

test("91-0b molisReflow parses both .25s and 250ms duration tokens accurately for FLIP and height animations", () => {
  const bundled = buildSync({
    entryPoints: [fileURLToPath(new URL("../packages/design-system/src/browser/reflow.ts", import.meta.url))],
    bundle: true, format: "iife", platform: "browser", write: false,
  }).outputFiles[0]!.text;
  const runCase = (durToken: string) => {
    const { MiniNode, document } = createMiniDom();
    const list = new MiniNode("div");
    const first = new MiniNode("div");
    list.append(first);
    const win: Record<string, unknown> = {
      document,
      matchMedia: () => ({ matches: false }),
      getComputedStyle: () => ({ getPropertyValue: (name: string) => (name === "--dur-move" ? durToken : "cubic-bezier(.22, 1, .36, 1)") }),
    };
    win.window = win;
    runInNewContext(bundled, win);
    const second = new MiniNode("div");
    (win.molisReflow as (el: unknown, fn: () => void) => void)(list, () => { list.append(second); });
    return { boxDur: list.animated[0]?.options.duration, childDur: second.animated[0]?.options.duration };
  };
  assert.deepEqual(runCase(".25s"), { boxDur: 250, childDur: 250 }, "compressed .25s must resolve to 250ms, not 0.25ms");
  assert.deepEqual(runCase("0.42s"), { boxDur: 420, childDur: 420 });
  assert.deepEqual(runCase("250ms"), { boxDur: 250, childDur: 250 });
  assert.deepEqual(runCase("-10ms"), { boxDur: 250, childDur: 250 });
  assert.deepEqual(runCase(""), { boxDur: 250, childDur: 250 });
});

test("91-0b feedback runtime covers molisBusy Esc/icon swap, molisToast alert/undo/hover-pause, autosave, optimisticToggle lock, and date clear", async () => {
  const bundled = buildSync({
    entryPoints: [fileURLToPath(new URL("../packages/design-system/src/browser/feedback.ts", import.meta.url))],
    bundle: true, format: "iife", platform: "browser", write: false,
  }).outputFiles[0]!.text;
  const { MiniNode, document, body } = createMiniDom();
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let nextTimer = 1;
  const win: Record<string, unknown> = {
    document,
    Node: MiniNode,
    HTMLInputElement: MiniNode,
    HTMLElement: MiniNode,
    Event: class { type: string; bubbles: boolean; defaultPrevented = false; constructor(t: string, init?: { bubbles?: boolean }) { this.type = t; this.bubbles = Boolean(init?.bubbles); } preventDefault() { this.defaultPrevented = true; } },
    t: { text: (k: string) => ({ "common.control.undo": "撤销", "common.control.clear": "清除", "common.confirm-box.action-failed": "操作失败" }[k] ?? k) },
    setTimeout: (fn: () => void, ms: number) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id: number) => { timers.delete(id); },
    Date,
  };
  win.window = win;
  win.globalThis = win;
  runInNewContext(bundled, win);

  // 1. molisBusy: blocks dialog Esc, swaps leading SVG after delayMs, rejects concurrent calls, restores on settle
  const dialog = new MiniNode("dialog");
  const btn = new MiniNode("button");
  const svg = new MiniNode("svg");
  svg.style.display = "";
  btn.append(svg);
  dialog.append(btn);
  body.append(dialog);
  let releaseBusy!: () => void;
  const busyPromise = (win.molisBusy as (b: unknown, w: () => Promise<string>, o?: { delayMs?: number }) => Promise<string>)(
    btn,
    () => new Promise(resolve => { releaseBusy = () => resolve("ok"); }),
    { delayMs: 250 },
  );
  await assert.rejects(() => (win.molisBusy as (b: unknown, w: () => Promise<string>) => Promise<string>)(btn, async () => "dup"), /already in progress/);
  const escWhileBusy = { type: "cancel", defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  dialog.dispatchEvent(escWhileBusy);
  assert.equal(escWhileBusy.defaultPrevented, true, "molisBusy blocks dialog cancel (Esc) while work is running");
  // Trigger the 250ms timer
  const busyTimer = [...timers.values()][0]!;
  assert.equal(busyTimer.ms, 250);
  busyTimer.fn();
  assert.equal(svg.style.display, "none", "leading svg hidden while spinner is shown");
  assert.ok(btn.querySelector(".mw-spinner"), "spinner inserted");
  releaseBusy();
  assert.equal(await busyPromise, "ok");
  assert.equal(svg.style.display, "", "leading svg restored after settle");
  assert.equal(btn.querySelector(".mw-spinner"), null, "spinner removed after settle");
  const escAfterBusy = { type: "cancel", defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  dialog.dispatchEvent(escAfterBusy);
  assert.equal(escAfterBusy.defaultPrevented, false, "dialog Esc restored after settle");

  // 2. molisToast: role="alert" on error, localized Undo, preserves pause when hovered
  let undone = false;
  (win.molisToast as (m: string, o?: Record<string, unknown>) => void)("已删除", { undo: () => { undone = true; } });
  const toastNode = body.querySelector("[data-molis-host-toast]")!;
  assert.equal(toastNode.getAttribute("role"), "status");
  assert.equal(toastNode.querySelector("[data-toast-action]")?.textContent, "撤销");
  toastNode.dispatchEvent({ type: "pointerenter" });
  (win.molisToast as (m: string, o?: Record<string, unknown>) => void)("保存失败", { tone: "error", duration: Number.NaN });
  assert.equal(toastNode.getAttribute("role"), "alert");
  assert.equal(toastNode.getAttribute("aria-live"), "assertive");
  assert.equal(timers.size, 0, "replacement toast keeps paused state while pointer is inside");
  toastNode.dispatchEvent({ type: "pointerleave" });
  assert.equal(timers.size, 1, "leaving hovered toast resumes countdown");
  toastNode.dispatchEvent({ type: "pointerleave" });
  // Verify undo click triggers callback
  (win.molisToast as (m: string, o?: Record<string, unknown>) => void)("可撤销", { undo: () => { undone = true; } });
  toastNode.querySelector("[data-toast-action]")!.dispatchEvent({ type: "click" });
  assert.equal(undone, true);

  // 3. molisOptimisticToggle: concurrency lock prevents double-click race + rollback on error
  const toggle = new MiniNode("input");
  toggle.type = "checkbox";
  toggle.checked = false;
  let calls = 0;
  let failToggle!: (err: Error) => void;
  const firstToggle = (win.molisOptimisticToggle as (c: unknown, w: (n: boolean) => Promise<void>) => Promise<boolean>)(
    toggle,
    () => { calls += 1; return new Promise((_, reject) => { failToggle = reject; }); },
  );
  assert.equal(toggle.checked, true, "flips optimistically");
  const secondToggle = await (win.molisOptimisticToggle as (c: unknown, w: (n: boolean) => Promise<void>) => Promise<boolean>)(
    toggle,
    async () => { calls += 1; },
  );
  assert.equal(calls, 1, "concurrent click ignored while first toggle is in flight");
  assert.equal(secondToggle, true);
  failToggle(new Error("boom"));
  assert.equal(await firstToggle, false, "rolls back to previous value on error");
  assert.equal(toggle.checked, false);

  // 4. molisEnhanceDateInputs: supports month + clear button
  const form = new MiniNode("form");
  const monthInput = new MiniNode("input");
  monthInput.type = "month";
  monthInput.setAttribute("data-mw-date", "");
  monthInput.value = "2026-11";
  form.append(monthInput);
  body.append(form);
  (win.molisEnhanceDateInputs as (r: unknown) => void)(form);
  const clearBtn = form.querySelector("[data-mw-date-clear-button]")!;
  assert.ok(clearBtn, "month input gets progressive clear button");
  assert.equal(clearBtn.getAttribute("aria-label"), "清除");
  assert.equal(clearBtn.hidden, false);
  clearBtn.dispatchEvent({ type: "click" });
  assert.equal(monthInput.value, "");
  assert.equal(clearBtn.hidden, true);

  // 5. molisAutosave: idle -> dirty -> saving -> saved -> idle, and error -> retry()
  const statusEl = new MiniNode("span");
  const target = new MiniNode("form");
  let shouldFail = true;
  let resolveSave!: () => void;
  const states: string[] = [];
  const auto = (win.molisAutosave as (t: unknown, s: () => Promise<void>, o: Record<string, unknown>) => {
    readonly state: string; markDirty(): void; flush(): Promise<boolean>; retry(): Promise<boolean>; dispose(): void;
  })(target, () => new Promise((resolve, reject) => {
    resolveSave = () => (shouldFail ? reject(new Error("net")) : resolve());
  }), {
    debounceMs: 100, delayMs: 50, savedHoldMs: 500, statusEl,
    labels: { idle: "", dirty: "未保存", saving: "保存中…", saved: "已保存", error: "保存失败" },
    onStateChange: (s: string) => states.push(s),
  });
  assert.equal(auto.state, "idle");
  auto.markDirty();
  assert.equal(auto.state, "dirty");
  const flushFail = auto.flush();
  // Fire delayMs timer so saving state appears
  for (const [, t] of [...timers.entries()]) { if (t.ms === 50) t.fn(); }
  assert.equal(auto.state, "saving");
  resolveSave();
  assert.equal(await flushFail, false);
  assert.equal(auto.state, "error");
  assert.equal(statusEl.textContent, "保存失败");
  shouldFail = false;
  const retryOk = auto.retry();
  resolveSave();
  assert.equal(await retryOk, true);
  assert.equal(auto.state, "saved");
  assert.equal(statusEl.textContent, "已保存");
  auto.dispose();
  assert.deepEqual(states, ["idle", "dirty", "saving", "error", "saved"]);
});

test("91-0b pageDialogs sanitizes malformed UiConfirmOptions without poisoning the dialog queue and falls back on blank labels", async () => {
  const dialogsEntry = fileURLToPath(new URL("../apps/workbench/src/browser/plugin-frame/dialogs.ts", import.meta.url));
  const bundled = buildSync({
    stdin: {
      contents: `export { pageDialogs } from ${JSON.stringify(dialogsEntry)}; export { installUiText } from "@molis-ai/molis-work-plugin-sdk/ui";`,
      resolveDir: fileURLToPath(new URL("../apps/workbench", import.meta.url)),
      loader: "ts",
    },
    bundle: true, format: "iife", globalName: "frameDialogsMod", platform: "browser", write: false,
  }).outputFiles[0]!.text;
  const { document, body } = createMiniDom();
  const ctx: Record<string, unknown> = { document, crypto: { randomUUID: () => "id-1" }, HTMLElement: class {} };
  runInNewContext(bundled, ctx);
  const { pageDialogs, installUiText } = ctx.frameDialogsMod as {
    installUiText(config: Record<string, unknown>): void;
    pageDialogs(scope: { alive: boolean; visible: boolean; own(fn: () => void): () => void; whenVisible(fn: () => () => void): () => void }, L: (k: string) => string): {
      confirm(msg: unknown): Promise<boolean>;
    };
  };
  installUiText({
    locale: () => "zh",
    intlLocale: () => "zh-CN",
    noContext: () => "default",
    ownerOfPrefix: () => "workbench",
    defaultLocale: () => "zh",
    message: (_o: string, key: string) => ({ "common.control.cancel": "取消", "common.control.confirm": "确定" }[key] ?? null),
  });
  const scope = { alive: true, visible: true, own: () => () => {}, whenVisible: () => () => {} };
  const dialogs = pageDialogs(scope, (k) => k);
  // Malformed inputs must return false without rejecting or wedging subsequent confirms
  assert.equal(await dialogs.confirm(null), false);
  assert.equal(await dialogs.confirm(123), false);
  assert.equal(await dialogs.confirm({}), false);

  const pendingConfirm = dialogs.confirm({ title: "删除项目？", body: "此操作不可撤销", tone: "danger", confirmLabel: "  ", cancelLabel: "" });
  await Promise.resolve();
  const openDialog = body.querySelector("dialog")!;
  assert.ok(openDialog, "subsequent valid confirm still opens after malformed calls");
  assert.equal(openDialog.dataset.tone, "danger");
  const buttons = openDialog.querySelectorAll("button");
  assert.equal(buttons[0]!.textContent, "取消", "blank cancelLabel falls back to localized default");
  assert.equal(buttons[1]!.textContent, "确定", "blank confirmLabel falls back to localized default");
  assert.ok(buttons[1]!.className.includes("mw-btn--danger"));
  const form = openDialog.querySelector("form")!;
  form.dispatchEvent({ type: "submit", isTrusted: true, preventDefault() {} });
  assert.equal(await pendingConfirm, true);
});

test("91-0b scroll-follow toLatest respects data-craft-still and navigator.webdriver", () => {
  const bundled = buildSync({
    entryPoints: [fileURLToPath(new URL("../packages/design-system/src/browser/scroll-follow.ts", import.meta.url))],
    bundle: true, format: "iife", platform: "browser", write: false,
  }).outputFiles[0]!.text;
  const { MiniNode, document, documentElement } = createMiniDom();
  const scroller = new MiniNode("div");
  scroller.scrollTop = 0;
  documentElement.setAttribute("data-craft-still", "");
  const win: Record<string, unknown> = {
    document,
    navigator: { webdriver: false },
    matchMedia: () => ({ matches: false }),
    performance: { now: () => 1000 },
    AbortController,
    ResizeObserver: class { observe() {} disconnect() {} },
    addEventListener() {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    getSelection: () => null,
  };
  win.window = win;
  runInNewContext(bundled, win);
  const follower = (win.molisFollow as (el: unknown) => { toLatest(): void })(scroller);
  follower.toLatest();
  assert.deepEqual(JSON.parse(JSON.stringify(scroller.scrolled[0])), { top: 400, behavior: "instant" }, "data-craft-still forces instant scroll on toLatest()");
});

test("91-0b molisStreamText pace:true coalesces burst mid-stream updates to one rAF patch and flushes immediately on final", () => {
  const bundled = buildSync({
    entryPoints: [fileURLToPath(new URL("../packages/design-system/src/browser/stream-text.ts", import.meta.url))],
    bundle: true, format: "iife", platform: "browser", write: false,
  }).outputFiles[0]!.text;
  const { MiniNode, document } = createMiniDom();
  const frames = new Map<number, () => void>();
  let nextFrame = 1;
  let innerHtmlWrites = 0;
  class MiniText {
    nodeType = 3;
    textContent: string;
    childNodes: unknown[] = [];
    parentNode: InstanceType<typeof MiniNode> | null = null;
    constructor(text: string) { this.textContent = text; }
    remove() {
      if (!this.parentNode) return;
      this.parentNode.children = this.parentNode.children.filter((c: unknown) => c !== this);
      this.parentNode = null;
    }
  }
  const docWithTemplate = {
    ...document,
    createElement: (tag: string) => {
      const node = new MiniNode(tag);
      if (tag === "template") {
        const content = new MiniNode("fragment");
        let raw = "";
        Object.defineProperty(node, "innerHTML", {
          get: () => raw,
          set: (html: string) => {
            innerHtmlWrites += 1;
            raw = html;
            const p = new MiniNode("p");
            const txt = new MiniText(html.replace(/<[^>]+>/g, ""));
            txt.parentNode = p;
            p.children = [txt];
            content.children = [p];
          },
        });
        node.content = content;
      }
      return node;
    },
    createTreeWalker: () => ({ nextNode: () => null }),
  };
  const win: Record<string, unknown> = {
    document: docWithTemplate,
    Element: MiniNode,
    Text: MiniText,
    NodeFilter: { SHOW_TEXT: 4 },
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (cb: () => void) => { const id = nextFrame++; frames.set(id, cb); return id; },
    cancelAnimationFrame: (id: number) => { frames.delete(id); },
  };
  win.window = win;
  runInNewContext(bundled, win);
  const container = new MiniNode("div");
  const stream = win.molisStreamText as (el: unknown, html: string, opts?: Record<string, unknown>) => { replaced: number };
  stream(container, "<p>a</p>", { reveal: true, pace: true });
  stream(container, "<p>ab</p>", { reveal: true, pace: true });
  stream(container, "<p>abc</p>", { reveal: true, pace: true });
  assert.equal(frames.size, 1, "burst updates share a single scheduled rAF");
  assert.equal(innerHtmlWrites, 0, "DOM is not patched until rAF fires");
  const pendingCallbacks = [...frames.entries()];
  frames.clear();
  for (const [, fn] of pendingCallbacks) fn();
  assert.equal(innerHtmlWrites, 1, "single coalesced patch applied on rAF");
  assert.equal(container.textContent, "abc");
  // Final update cancels any pending paced frame and flushes synchronously
  stream(container, "<p>abcd</p>", { reveal: true, pace: true });
  assert.equal(frames.size, 1);
  stream(container, "<p>done</p>", { reveal: false, pace: true });
  assert.equal(frames.size, 0, "final reveal:false cancels pending paced frame");
  assert.equal(container.textContent, "done");
});

test("91-0b settings nav filter hides non-matching items, collapses empty groups, shows empty state, and resets on Escape", () => {
  const bundled = buildSync({
    entryPoints: [fileURLToPath(new URL("../apps/workbench/src/browser/settings-view-height.ts", import.meta.url))],
    bundle: true, format: "iife", platform: "browser", write: false,
  }).outputFiles[0]!.text;
  const { MiniNode, document, body } = createMiniDom();
  const nav = new MiniNode("nav");
  nav.className = "settings-navigation";
  const input = new MiniNode("input");
  input.setAttribute("data-settings-nav-filter", "");
  const list = new MiniNode("div");
  list.className = "settings-nav-body";
  const g1 = new MiniNode("div"); g1.className = "settings-nav-group-label"; g1.textContent = "通用";
  const a1 = new MiniNode("a"); a1.textContent = "界面与语言";
  const g2 = new MiniNode("div"); g2.className = "settings-nav-group-label"; g2.textContent = "连接";
  const a2 = new MiniNode("a"); a2.textContent = "模型与密钥";
  list.append(g1, a1, g2, a2);
  const empty = new MiniNode("p");
  empty.setAttribute("data-settings-nav-empty", "");
  empty.hidden = true;
  nav.append(input, list, empty);
  body.append(nav);
  const ctx: Record<string, unknown> = { document, HTMLInputElement: MiniNode };
  ctx.globalThis = ctx;
  runInNewContext(bundled, ctx);

  input.value = "模型";
  document.dispatch("input", { target: input });
  assert.equal(a1.hidden, true);
  assert.equal(g1.hidden, true, "empty group header hides");
  assert.equal(a2.hidden, false);
  assert.equal(g2.hidden, false);
  assert.equal(empty.hidden, true);

  input.value = "不存在的设置";
  document.dispatch("input", { target: input });
  assert.equal(empty.hidden, false, "empty state shown on 0 matches");

  document.dispatch("keydown", { key: "Escape", target: input, preventDefault() {} });
  assert.equal(input.value, "");
  assert.equal(a1.hidden, false);
  assert.equal(a2.hidden, false);
  assert.equal(empty.hidden, true);
});

test("91-0b sanitizeFrameToastOptions validates tone and rejects non-finite or negative durations while clamping upper bound", () => {
  const bundled = buildSync({
    entryPoints: [fileURLToPath(new URL("../apps/workbench/src/browser/plugin-frame/parent.ts", import.meta.url))],
    bundle: true, format: "iife", globalName: "frameParentMod", platform: "browser", write: false,
  }).outputFiles[0]!.text;
  const ctx: Record<string, unknown> = {};
  runInNewContext(bundled, ctx);
  const { sanitizeFrameToastOptions } = ctx.frameParentMod as {
    sanitizeFrameToastOptions(opt: unknown): unknown;
  };
  const norm = (x: unknown) => JSON.parse(JSON.stringify(sanitizeFrameToastOptions(x)));
  assert.equal(norm(undefined), false);
  assert.equal(norm(true), true);
  assert.equal(norm(["bad"]), null);
  assert.deepEqual(norm({ tone: "error", duration: "long" }), { tone: "error", duration: "long" });
  assert.deepEqual(norm({ tone: "bogus", duration: Number.NaN }), {});
  assert.deepEqual(norm({ tone: "warning", duration: Number.POSITIVE_INFINITY }), { tone: "warning" });
  assert.deepEqual(norm({ tone: "success", duration: -50 }), { tone: "success" });
  assert.deepEqual(norm({ tone: "default", duration: 999_999 }), { tone: "default", duration: 30_000 });
});
