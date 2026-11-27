import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { NATIVE_DESKTOP_BOOTSTRAP_SCRIPT } from "@molis-ai/molis-work-app-desktop";

function bootstrap(native: boolean, initialFullscreen = false) {
  let fullscreen = initialFullscreen;
  let resized: () => Promise<void> = async () => {};
  const dataset: Record<string, string> = {};
  const properties = new Map<string, string>();
  const warnings: unknown[] = [];
  const navigations: string[] = [];
  const invocations: { command: string; url: string }[] = [];
  const accountCalls: unknown[] = [];
  const context = {
    URL,
    Response,
    console: { warn: (...args: unknown[]) => warnings.push(args) },
    document: { documentElement: { dataset, style: {
      setProperty: (name: string, value: string) => properties.set(name, value),
    } } },
    location: { href: "http://localhost:4173/projects/test", origin: "http://localhost:4173",
      replace: (url: string) => navigations.push(url) },
    ...(native ? { __TAURI__: { core: { invoke: async (command: string, args: { url: string }) => {
      if(command === 'personal_account_request'){accountCalls.push(args);return {status:200,body:{identity:null}};}
      invocations.push({ command, url: args.url });
    } }, window: { getCurrentWindow: () => ({
      isFullscreen: async () => fullscreen,
      onResized: async (handler: () => Promise<void>) => { resized = handler; return () => {}; },
    }) } } } : {}),
  };
  runInNewContext(NATIVE_DESKTOP_BOOTSTRAP_SCRIPT, context);
  return { dataset, properties, warnings, navigations, invocations, accountCalls,
    accountFetch: (context as typeof context & { molisWorkPersonalAccountFetch?: (path: string, options?: unknown) => Promise<Response> }).molisWorkPersonalAccountFetch,
    openExternal: (context as typeof context & { molisWorkOpenExternalUrl?: (url: string) => Promise<void> }).molisWorkOpenExternalUrl,
    resize: async (value: boolean) => { fullscreen = value; await resized(); } };
}

test("native navigation and resize use real fullscreen state for both titlebar safe areas", async () => {
  const page = bootstrap(true);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(page.dataset.nativeFullscreen, "false");
  assert.equal(page.properties.get("--desktop-window-safe-inline-start"), "88px");
  assert.deepEqual(page.navigations, ["http://localhost:4173/projects/test?desktop=1"]);
  await page.resize(true);
  assert.equal(page.dataset.nativeFullscreen, "true");
  assert.equal(page.properties.get("--desktop-window-safe-inline-start"), "2px");
  const nextPage = bootstrap(true, true);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(nextPage.properties.get("--desktop-window-safe-inline-start"), "2px");
  await page.resize(false);
  assert.equal(page.dataset.nativeFullscreen, "false");
  assert.equal(page.properties.get("--desktop-window-safe-inline-start"), "88px");
  assert.deepEqual(page.warnings, []);
});

test("ordinary Web does not activate native layout or rewrite navigation", () => {
  const page = bootstrap(false);
  assert.deepEqual(page.dataset, {});
  assert.equal(page.properties.size, 0);
  assert.deepEqual(page.navigations, []);
  assert.equal(page.openExternal, undefined);
  assert.equal(page.accountFetch, undefined);
});

test('native account UI calls the fixed host bridge without forwarding browser headers or credentials', async () => {
  const page=bootstrap(true);
  const response=await page.accountFetch!('/api/personal/status?desktop=1',{headers:{authorization:'must-not-forward'}});
  assert.deepEqual(await response.json(),{identity:null});
  assert.equal(JSON.stringify(page.accountCalls),JSON.stringify([{path:'/api/personal/status?desktop=1',method:'GET'}]));
  await page.accountFetch!('/api/personal/login',{method:'POST',body:'must-not-forward'});
  assert.equal(JSON.stringify(page.accountCalls[1]),JSON.stringify({path:'/api/personal/login',method:'POST'}));
});

test("native external links invoke the scoped host command with the complete URL", async () => {
  const page = bootstrap(true);
  await page.openExternal!("https://example.com/docs?q=1#section");
  assert.deepEqual(page.invocations, [{ command: "open_external_url", url: "https://example.com/docs?q=1#section" }]);
});

test("102-2 soft host reconnect refreshes attention and shelf state without reloading the page", () => {
  const dispatched: Array<{ type: string; detail?: unknown }> = [];
  const navigations: string[] = [];
  let shelfRefreshed = 0;
  let listener: (() => void) | undefined;
  const context: Record<string, unknown> = {
    URL,
    Response,
    CustomEvent: class MockCustomEvent {
      type: string;
      detail?: unknown;
      constructor(type: string, init?: { detail?: unknown }) { this.type = type; this.detail = init?.detail; }
    },
    console: { warn: () => {} },
    document: {
      documentElement: { dataset: {}, style: { setProperty: () => {} } },
      dispatchEvent: (event: { type: string; detail?: unknown }) => { dispatched.push({ type: event.type, detail: event.detail }); },
    },
    location: {
      href: "http://127.0.0.1:4173/projects/test?desktop=1",
      origin: "http://127.0.0.1:4173",
      replace: (url: string) => navigations.push(url),
    },
    __TAURI__: {
      core: { invoke: async () => ({}) },
      event: { listen: async (name: string, fn: () => void) => { if (name === "molis:host-reconnected") listener = fn; return () => {}; } },
      window: { getCurrentWindow: () => ({ isFullscreen: async () => false, onResized: async () => () => {} }) },
    },
  };
  runInNewContext(NATIVE_DESKTOP_BOOTSTRAP_SCRIPT, context);
  context.molisWorkRefreshShelfPreferences = () => { shelfRefreshed += 1; };
  assert.ok(typeof listener === "function", "listens for molis:host-reconnected");
  listener!();
  assert.deepEqual(navigations, [], "soft reconnect never reloads or replaces location");
  assert.equal(shelfRefreshed, 1);
  assert.equal(JSON.stringify(dispatched), JSON.stringify([{ type: "molis-work:attention-refresh", detail: { reconnected: true } }]));
});

test("F-host-subsystems-w3-05 desktop shelf bridge relays refresh, send-tui, and notice to the Shelf side iframe", () => {
  const topEvents: Array<{ type: string; detail?: unknown }> = [];
  const posted: Array<{ message: unknown; targetOrigin: string }> = [];
  const shelfFrame = {
    contentWindow: {
      postMessage: (message: unknown, targetOrigin: string) => {
        posted.push({ message, targetOrigin });
      },
    },
  };
  const context: Record<string, unknown> = {
    URL,
    Response,
    CustomEvent: class MockCustomEvent {
      type: string;
      detail?: unknown;
      constructor(type: string, init?: { detail?: unknown }) { this.type = type; this.detail = init?.detail; }
    },
    console: { warn: () => {} },
    window: {
      dispatchEvent: (event: { type: string; detail?: unknown }) => { topEvents.push({ type: event.type, detail: event.detail }); },
    },
    document: {
      documentElement: { dataset: {}, style: { setProperty: () => {} } },
      querySelector: (selector: string) => selector === '[data-side-body^="plugin:shelf/"] > iframe[data-side-frame]' ? shelfFrame : null,
    },
    location: {
      href: "http://127.0.0.1:4173/projects/test?desktop=1",
      origin: "http://127.0.0.1:4173",
      replace: () => {},
    },
    __TAURI__: {
      core: { invoke: async () => ({}) },
      window: { getCurrentWindow: () => ({ isFullscreen: async () => false, onResized: async () => () => {} }) },
    },
  };
  runInNewContext(NATIVE_DESKTOP_BOOTSTRAP_SCRIPT, context);
  (context.molisWorkShelfRefresh as (detail?: unknown) => void)({ item_ids: ["item-1"] });
  (context.molisWorkShelfSendTui as (detail?: unknown) => void)({ item_ids: ["item-1"], text: "https://example.com" });
  (context.molisWorkShelfNotice as (message: string) => void)("saved");
  assert.equal(JSON.stringify(topEvents), JSON.stringify([
    { type: "molis:shelf-refresh", detail: { item_ids: ["item-1"] } },
    { type: "molis:shelf-send-tui", detail: { item_ids: ["item-1"], text: "https://example.com" } },
    { type: "molis:shelf-notice", detail: { message: "saved" } },
  ]));
  assert.equal(JSON.stringify(posted), JSON.stringify([
    { message: { type: "molis:shelf-desktop-event", name: "molis:shelf-refresh", detail: { item_ids: ["item-1"] } }, targetOrigin: "http://127.0.0.1:4173" },
    { message: { type: "molis:shelf-desktop-event", name: "molis:shelf-send-tui", detail: { item_ids: ["item-1"], text: "https://example.com" } }, targetOrigin: "http://127.0.0.1:4173" },
    { message: { type: "molis:shelf-desktop-event", name: "molis:shelf-notice", detail: { message: "saved" } }, targetOrigin: "http://127.0.0.1:4173" },
  ]));
});
