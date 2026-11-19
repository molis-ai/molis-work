import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";

for (const [surface, last, failFirst] of [["cognia", "Latest edited text", false], ["todo", null, false], ["cognia", "Saved after failed earlier write", true]] as const) {
  test(`QEA-39: ${surface} ordered draft ${last === null ? "deletion" : "save"} survives a late earlier ${failFirst ? "failed write" : "write"} and account preparation`, { timeout: 90_000 }, async t => {
    const browser = await openGoalBrowser(t, "seeded");
    if (!browser) return;
    const page = await pluginFrameBrowser(t, browser, surface);
    await pluginFrameInitScript(t, browser, `window.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,factory){
      target[key]=host=>{window.testPageDrafts=host.drafts;return factory(host)};return true;
    }});`);
    const open = () => browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?openPlugin=${surface}` }, browser.sessionId));
    await open(); await page.waitFor("window.testPageDrafts");
    await page.evaluate("testPageDrafts.write('order-seed','seed')");
    // Hold only the first real put. Later operations and a separate-key barrier use the actual Cache.
    // Intercept the actual Cache prototype; CacheStorage.open may return distinct wrappers for the same cache.
    await browser.evaluate(`(async () => {
      const originalPut = Cache.prototype.put, originalDelete = Cache.prototype.delete;
      let targetCalls = 0, later = Promise.resolve();
      Cache.prototype.put = function(key, response) {
        const name = new URL(typeof key === 'string' ? key : key.url).pathname;
        if (name.endsWith('/ordered-draft')) {
          if (++targetCalls === 1) {
            window.__firstDraftEntered = true;
            return new Promise(resolve => { window.__releaseFirstDraft = resolve; }).then(() => { if (${failFirst}) throw Error("Earlier cache write failed"); return originalPut.call(this, key, response); });
          }
          later = originalPut.call(this, key, response); return later;
        }
        return name.endsWith('/order-barrier') ? later.then(() => originalPut.call(this, key, response)) : originalPut.call(this, key, response);
      };
      Cache.prototype.delete = function(key) {
        const name = new URL(typeof key === 'string' ? key : key.url).pathname;
        if (name.endsWith('/ordered-draft')) { later = originalDelete.call(this, key); return later; }
        return originalDelete.call(this, key);
      };
    })()`);
    await page.evaluate("void (window.__firstWrite = testPageDrafts.write('ordered-draft','Earlier text'))");
    await browser.waitFor("window.__firstDraftEntered === true");
    await page.evaluate(`(() => {
      window.__lastWrite = testPageDrafts.write('ordered-draft', ${JSON.stringify(last)});
      window.__writes = Promise.allSettled([window.__firstWrite, window.__lastWrite]);
      window.__orderedRead = testPageDrafts.read('ordered-draft');
    })()`);
    await page.evaluate("testPageDrafts.write('order-barrier','barrier')");
    await browser.evaluate("void molisWorkAccountTransition.prepare().then(() => { window.__prepared = true; })");
    assert.equal(await browser.evaluate("molisWorkAccountTransition.preparing && !window.__prepared"), true);
    await browser.evaluate("window.__releaseFirstDraft()");
    await browser.waitFor("window.__prepared === true");
    assert.deepEqual(await page.evaluate("window.__writes.then(items => items.map(item => item.status))"), [failFirst ? "rejected" : "fulfilled", "fulfilled"]);
    assert.equal(await page.evaluate("window.__orderedRead"), last, "reads observe all preceding writes to this key");
    await browser.evaluate("molisWorkAccountTransition.resume()");
    await page.waitFor("!document.body.inert");
    assert.equal(await page.evaluate("testPageDrafts.read('ordered-draft')"), last);
    await open(); await page.waitFor("window.testPageDrafts");
    assert.equal(await page.evaluate("testPageDrafts.read('ordered-draft')"), last, "the actual browser cache survives remount");
  });
}
