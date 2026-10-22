import assert from "node:assert/strict";
import test from "node:test";
import { BUILTIN_PLUGIN_CATALOG, pluginSurfaceClients } from "@molis-ai/molis-work-app-workbench";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

// SYS-15: every registered client must actually open through the common isolated document.
for (const pack of pluginSurfaceClients()) test(`SYS-15 ${pack.id} opens its isolated registered page`, { timeout: 25_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, pack.id);
  const registration = BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === pack.id)!;
  const setting = registration.manifest.ui?.views?.some(view => view.slot === "settings") && ["characters", "plugin-builder"].includes(pack.id);
  const side = registration.manifest.ui?.views?.find(view => view.slot === "side" && !registration.manifest.ui?.views?.some(item => item.slot === "main"));
  const query = setting ? "settings=" : "openPlugin=";
  await browser.navigate(() => browser.command("Page.navigate", { url: side ? `${browser.origin}/projects/${browser.projectId}/side/${pack.id}/${side.view_id}` : `${browser.origin}/projects/${browser.projectId}/?${query}${pack.id}` }, browser.sessionId));
  try {
    if (side) await browser.waitFor(`document.querySelector('iframe[data-plugin-frame="${pack.id}"]')`);
    else await browser.surfaceReady(pack.id, 5000);
    await child.waitFor("document.querySelector('[data-work-surface]') && globalThis.molisWorkRequest");
  } catch (error) {
    t.diagnostic(JSON.stringify(await browser.evaluate(`({surface:document.querySelector('[data-work-surface=${JSON.stringify(pack.id)}]')?.outerHTML.slice(0,500),toast:document.querySelector('[data-toast]')?.textContent})`)));
    throw error;
  }
  assert.equal(await child.evaluate("(()=>{try{return Boolean(parent.document)}catch(error){return error.name}})()"), "SecurityError");
  assert.equal(await child.evaluate("Boolean(document.querySelector('meta[name=molis-work-control-token]'))"), false);
});
