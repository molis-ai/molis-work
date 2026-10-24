import assert from "node:assert/strict";
import test from "node:test";
import { openLingguangStore } from "@molis-ai/molis-work-plugin-lingguang";
import { renderPluginFrameClientScript } from "@molis-ai/molis-work-app-workbench";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

test("a visible plugin document precedes its listeners; the owner readiness gate precedes one real click", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "lingguang");
  const handlers = browser.server.listeners("request");
  let held = true, requested = false, posts = 0;
  const waiting: Array<() => void> = [];
  const release = () => { held = false; for (const respond of waiting.splice(0)) respond(); };
  browser.server.removeAllListeners("request");
  browser.server.on("request", (request, response) => {
    if (request.method === "POST" && request.url?.endsWith("/api/plugins/io.molis.work.lingguang/sparks")) posts++;
    const respond = () => { for (const handler of handlers) handler.call(browser.server, request, response); };
    if (held && request.url === "/assets/molis-work-plugins/lingguang.js") { requested = true; waiting.push(respond); }
    else respond();
  });
  t.after(release);
  const count = () => {
    const store = openLingguangStore(browser.homeDirectory);
    try { return store.list(browser.projectId!).length; } finally { store.close(); }
  };
  await browser.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, browser.sessionId);
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/` }, browser.sessionId));
  await browser.waitFor("document.body.dataset.desktopSurface === 'home'");
  await browser.click("[data-plugin-picker-popover] [data-plugin-id=lingguang]");
  // The original journey waited only for this child DOM condition, bypassing the owner's inert surface.
  await child.waitFor("!document.querySelector('[data-work-surface=lingguang]').hidden");
  assert.equal(requested, true);
  assert.deepEqual(await browser.evaluate("(()=>{const root=document.querySelector('[data-work-surface=lingguang]');return [root.dataset.uiClientState,root.inert];})()"), ["loading", true]);
  assert.equal(await child.evaluate("(()=>{const button=[...document.querySelectorAll('[data-work-surface=lingguang] button')].find(button=>button.getClientRects().length&&button.textContent.includes('记下'));button?.click();return !!button;})()"), true);
  assert.equal(posts, 0); assert.equal(count(), 0);
  release();
  await browser.waitFor("document.querySelector('[data-work-surface=lingguang]').dataset.uiClientState === 'ready' && !document.querySelector('[data-work-surface=lingguang]').inert");
  assert.equal(await child.evaluate("document.querySelector('[data-work-surface=lingguang]').dataset.expanded"), "false");
  assert.equal(posts, 0); assert.equal(count(), 0, "a pre-listener DOM click is not replayed when the client becomes ready");
  await child.click("[data-lingguang-capture]");
  await child.waitFor("document.querySelector('[data-work-surface=lingguang]').dataset.expanded === 'true' && !!document.querySelector('[data-lingguang-id]')");
  assert.equal(posts, 1); assert.equal(count(), 1);
});

test("VUX-16: a side document waits through hidden markup and visible unmounted controls before one real capture", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "lingguang");
  const handlers = browser.server.listeners("request");
  let bridgeRequests = 0, posts = 0;
  let releaseBridge = () => {}, releaseClient = () => {};
  let bridgeRequested!: () => void, clientRequested!: () => void;
  const bridgePaused = new Promise<void>(resolve => { bridgeRequested = resolve; });
  const clientPaused = new Promise<void>(resolve => { clientRequested = resolve; });
  browser.server.removeAllListeners("request");
  browser.server.on("request", (request, response) => {
    if (request.method === "POST" && request.url?.endsWith("/api/plugins/io.molis.work.lingguang/sparks")) posts++;
    const respond = () => { for (const handler of handlers) handler.call(browser.server, request, response); };
    if (request.method === "GET" && request.url === "/assets/molis-work-plugin-frame.js") {
      // The owner must mount the real frame first. No-store makes the child's second request observable, even
      // when the same production bridge was just loaded by its owner; neither response changes the program.
      const sendBridge = () => {
        response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
        response.end(renderPluginFrameClientScript());
      };
      if (++bridgeRequests === 2) { releaseBridge = sendBridge; bridgeRequested(); }
      else sendBridge();
    } else if (request.url === "/assets/molis-work-plugins/lingguang.js") {
      releaseClient = respond; clientRequested();
    } else respond();
  });
  t.after(() => { releaseBridge(); releaseClient(); });
  const count = () => {
    const store = openLingguangStore(browser.homeDirectory);
    try { return store.list(browser.projectId!).length; } finally { store.close(); }
  };
  await browser.command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, browser.sessionId);
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/side/lingguang/side` }, browser.sessionId));
  await bridgePaused;
  // This is precisely the old wait: parsed markup is present, but startChild has not shown it yet.
  await child.waitFor("document.querySelector('[data-lingguang=workbench]')", 30_000);
  assert.equal(bridgeRequests, 2);
  assert.deepEqual(await child.evaluate("[document.querySelector('[data-lingguang=workbench]').hidden, [...document.querySelectorAll('[data-lingguang-capture]')].filter(button => button.getClientRects().length).length]"), [true, 0]);
  assert.equal(await browser.evaluate("document.querySelector('[data-side-view-root] > [data-work-surface=lingguang]').dataset.uiClientState === 'ready'"), false);
  assert.equal(posts, 0); assert.equal(count(), 0);
  releaseBridge(); releaseBridge = () => {};
  await clientPaused;
  await child.waitFor("[...document.querySelectorAll('[data-lingguang-capture]')].some(button => button.getClientRects().length)");
  assert.equal(await child.evaluate("document.querySelector('[data-lingguang=workbench]').hidden"), false);
  assert.equal(await browser.evaluate("document.querySelector('[data-side-view-root] > [data-work-surface=lingguang]').dataset.uiClientState === 'ready'"), false);
  assert.equal(posts, 0); assert.equal(count(), 0, "visible markup alone has not created a spark");
  releaseClient(); releaseClient = () => {};
  await browser.waitFor("document.querySelector('[data-side-view-root] > [data-work-surface=lingguang]')?.dataset.uiClientState === 'ready' && document.querySelector('[data-side-view-root] > [data-work-surface=lingguang]').checkVisibility()", 30_000);
  assert.equal(posts, 0); assert.equal(count(), 0, "mounting alone does not create a spark");
  await child.click("[data-lingguang-capture]");
  await child.waitFor("document.querySelector('[data-lingguang-title]')?.getClientRects().length && !!document.querySelector('[data-lingguang-id]')");
  assert.equal(posts, 1); assert.equal(count(), 1, "one real click creates exactly one persisted spark");
});
