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

  // Non-Mac (Linux/Windows): Ctrl is Mod, Meta is rejected as Mod; Alt+ArrowLeft/Right for history
  assert.equal(normalizeChildShortcut({ key: "ArrowLeft", code: "ArrowLeft", metaKey: false, ctrlKey: false, shiftKey: false, altKey: true }, false), "Alt+ArrowLeft");
  assert.equal(normalizeChildShortcut({ key: "T", code: "KeyT", metaKey: false, ctrlKey: true, shiftKey: true, altKey: false }, false), "Mod+Shift+T");
  assert.equal(normalizeChildShortcut({ key: "Enter", code: "Enter", metaKey: false, ctrlKey: true, shiftKey: true, altKey: false }, false), "Mod+Shift+Enter");
  assert.equal(normalizeChildShortcut({ key: ".", code: "Period", metaKey: false, ctrlKey: true, shiftKey: false, altKey: false }, false), "Mod+Period");
  assert.equal(normalizeChildShortcut({ key: "T", code: "KeyT", metaKey: true, ctrlKey: false, shiftKey: true, altKey: false }, false), "");

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
    + '<link rel="stylesheet" href="https://evil.invalid/assets/x.css">'
    + '<link rel="stylesheet" href="/api/other.css">'
    + '<link data-rel="stylesheet" data-href="/assets/fake.css" rel="stylesheet" href="https://evil.invalid/b.css">'
    + '<link rel="stylesheet" href="http://user:pass@127.0.0.1:4173/assets/cred.css">'
    + '<main><textarea><link rel="stylesheet" href="/assets/in-body.css"></textarea></main>';
  const result = extractHeadStyleLinks(input, origin);
  assert.equal(result.headLinks, '<link rel="stylesheet" href="http://127.0.0.1:4173/assets/molis-work-plugins/coding.css">');
  assert.ok(!result.bodyContent.includes("coding.css"), "hoisted same-origin /assets/ link removed from body");
  assert.ok(result.bodyContent.includes("https://evil.invalid/assets/x.css"), "foreign-origin link never hoisted");
  assert.ok(result.bodyContent.includes("/api/other.css"), "non-/assets/ link never hoisted");
  assert.ok(result.bodyContent.includes('data-href="/assets/fake.css"'), "data-rel/data-href attributes never falsely matched");
  assert.ok(result.bodyContent.includes("user:pass@127.0.0.1:4173/assets/cred.css"), "credentialed URLs never hoisted");
  assert.ok(result.bodyContent.includes('<textarea><link rel="stylesheet" href="/assets/in-body.css"></textarea>'), "body/textarea content never rewritten");
});
