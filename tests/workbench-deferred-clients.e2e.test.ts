import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { BUILTIN_PLUGIN_WORKBENCH } from "../apps/workbench/src/plugin-workbench.js";

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
