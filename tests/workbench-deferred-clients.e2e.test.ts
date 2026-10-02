import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { BUILTIN_PLUGIN_WORKBENCH } from "../apps/workbench/src/plugin-workbench.js";

test("a hung UI asset times out, retries and ignores the late first response without remounting or losing the last selection", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, click, waitFor, command, sessionId, navigate } = browser;
  await navigate(() => command("Page.navigate", { url: browser.origin + "/projects/" + browser.projectId + "/" }, sessionId));
  await evaluate(`(() => {
    window.reviewPagesMounts = 0;
    window.molisWorkbenchPluginFactories = new Proxy(window.molisWorkbenchPluginFactories || {}, {
      set(target, key, value) { target[key] = key === 'pages' ? (...args) => { window.reviewPagesMounts++; return value(...args); } : value; return true; }
    });
    const root = document.querySelector('[data-work-surface=pages]'); root.retainedClientRoot = true;
    root.addEventListener('molis-work:select-item', event => { window.reviewLastSelection = event.detail; });
  })()`);
  await command("Fetch.enable", { patterns: [{ urlPattern: "*/assets/molis-work-plugins/pages.js", requestStage: "Request" }] }, sessionId);
  await click('[data-plugin-strip] [data-plugin-id="pages"]');
  await waitFor("document.querySelector('[data-work-surface=pages]').dataset.uiClientState === 'loading'");
  await evaluate(`(() => {
    const root = document.querySelector('[data-work-surface=pages]');
    root.dispatchEvent(new CustomEvent('molis-work:select-item', { bubbles: true, detail: { itemId: 'superseded-selection' } }));
    root.dispatchEvent(new CustomEvent('molis-work:select-item', { bubbles: true, detail: { itemId: null } }));
  })()`);
  await waitFor("document.querySelector('[data-work-surface=pages]').dataset.uiClientState === 'failed'", 13_000);
  assert.equal(await evaluate("document.querySelector('[data-work-surface=pages]').inert"), false);
  assert.equal(await evaluate("document.querySelector('[data-work-surface=pages]').hasAttribute('aria-busy')"), false);
  await click('[data-work-surface=pages] [data-ui-client-retry]');
  await waitFor("document.querySelector('[data-work-surface=pages]').dataset.uiClientState === 'loading'");
  // Release both the removed first script's network request and the retry's request.
  await command("Fetch.disable", {}, sessionId);
  await waitFor("document.querySelector('[data-work-surface=pages]').dataset.uiClientState === 'ready'");
  assert.equal(await evaluate("window.reviewPagesMounts"), 1);
  assert.deepEqual(await evaluate("window.reviewLastSelection"), { itemId: null });
  assert.equal(await evaluate("document.querySelector('[data-work-surface=pages]').retainedClientRoot"), true);
  await click('[data-plugin-strip] [data-plugin-id="home"]');
  await click('[data-plugin-strip] [data-plugin-id="pages"]');
  assert.equal(await evaluate("window.reviewPagesMounts"), 1);
});

test("registered clients mount on demand, retry resources and retain their original surfaces", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, click, waitFor, command, sessionId, navigate } = browser;
  await navigate(() => command("Page.navigate", { url: browser.origin + "/projects/" + browser.projectId + "/" }, sessionId));
  assert.equal(await evaluate("typeof window.MolisWorkPagesEditor"), "undefined");
  assert.equal(await evaluate("Object.keys(window.molisWorkbenchPluginFactories || {}).length"), 0);
  assert.ok(await evaluate<number>("document.querySelectorAll('template[data-deferred-content]').length") > 10);
  await command("Network.enable", {}, sessionId);
  await command("Network.setBlockedURLs", { urls: [browser.origin + "/assets/molis-work-pages-editor.js"] }, sessionId);
  await click('[data-plugin-strip] [data-plugin-id="pages"]');
  await waitFor("document.querySelector('[data-work-surface=pages] [data-ui-client-retry]')");
  assert.equal(await evaluate("document.querySelector('[data-work-surface=pages]').inert"), false);
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  await click('[data-work-surface=pages] [data-ui-client-retry]');
  await waitFor("document.querySelector('[data-work-surface=pages]').dataset.uiClientState === 'ready'");
  assert.equal(await evaluate("typeof window.MolisWorkPagesEditor.mount"), "function");
  for (const pack of BUILTIN_PLUGIN_WORKBENCH.filter(pack => pack.clientFactory)) {
    const id = pack.project_plugin_id;
    const link = `[data-plugin-strip] [data-plugin-id="${id}"]`;
    // Characters is a settings page; its existing dedicated browser test exercises that entry.
    if (!await evaluate(`!!document.querySelector(${JSON.stringify(link)})`)) continue;
    await click(link);
    const root = `[data-work-surface="${id}"]`;
    await waitFor(`document.querySelector(${JSON.stringify(root)})?.dataset.uiClientState === 'ready'`);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(root)}).inert`), false, id);
    await evaluate(`document.querySelector(${JSON.stringify(root)}).retainedClientRoot = true`);
    await click('[data-plugin-strip] [data-plugin-id="home"]');
    await click(link);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(root)}).retainedClientRoot`), true, id);
    assert.equal(await evaluate(`performance.getEntriesByType('resource').filter(entry => entry.name.endsWith('/assets/molis-work-plugins/${id}.js')).length`), 1, id);
  }
});
