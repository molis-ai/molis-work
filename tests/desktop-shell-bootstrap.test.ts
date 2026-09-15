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
  const context = {
    URL,
    console: { warn: (...args: unknown[]) => warnings.push(args) },
    document: { documentElement: { dataset, style: {
      setProperty: (name: string, value: string) => properties.set(name, value),
    } } },
    location: { href: "http://localhost:4173/projects/test", origin: "http://localhost:4173",
      replace: (url: string) => navigations.push(url) },
    ...(native ? { __TAURI__: { core: { invoke: async (command: string, args: { url: string }) => { invocations.push({ command, url: args.url }); } }, window: { getCurrentWindow: () => ({
      isFullscreen: async () => fullscreen,
      onResized: async (handler: () => Promise<void>) => { resized = handler; return () => {}; },
    }) } } } : {}),
  };
  runInNewContext(NATIVE_DESKTOP_BOOTSTRAP_SCRIPT, context);
  return { dataset, properties, warnings, navigations, invocations,
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
});

test("native external links invoke the scoped host command with the complete URL", async () => {
  const page = bootstrap(true);
  await page.openExternal!("https://example.com/docs?q=1#section");
  assert.deepEqual(page.invocations, [{ command: "open_external_url", url: "https://example.com/docs?q=1#section" }]);
});
