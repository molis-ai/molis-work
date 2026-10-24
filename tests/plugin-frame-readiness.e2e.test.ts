import assert from "node:assert/strict";
import test from "node:test";
import { openLingguangStore } from "@molis-ai/molis-work-plugin-lingguang";
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
