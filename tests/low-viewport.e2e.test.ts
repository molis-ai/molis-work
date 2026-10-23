import assert from "node:assert/strict";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

for (const [width, height] of [[1024, 400], [390, 500]]) {
  test(`Low viewport ${width}×${height} keeps directory entries and the Feed source dialog reachable`, { timeout: 60_000 }, async t => {
    const b = await openGoalBrowser(t, true); if (!b) return;
    const { command, sessionId, navigate, origin, projectId, evaluate, click, waitFor } = b;
    const catalog = await openMolisWorkProjectCatalog({homeDirectory:b.homeDirectory});
    for (const plugin_id of ["feed"]) catalog.addProjectPlugin({project_id:projectId!,plugin_id,actor_id:"viewport-test"});
    catalog.close();
    await command("Emulation.setDeviceMetricsOverride", {width,height,deviceScaleFactor:1,mobile:false}, sessionId);
    await navigate(()=>command("Page.navigate",{url:`${origin}/projects/${projectId}/`},sessionId));
    if (width < 760 && await evaluate("!document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open') && Boolean(document.querySelector('[data-directory-show]')?.getClientRects().length)")) await click('[data-directory-show]');
    await click('[data-plugin-id="feed"]');
    if (width < 760 && await evaluate("!document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open') && Boolean(document.querySelector('[data-directory-show]')?.getClientRects().length)")) await click('[data-directory-show]');
    await click('[data-feed-add-toggle]');
    await waitFor("!document.querySelector('[data-feed-sources-dialog]').hidden");
    await click('[data-feed-choose-kind="custom_rss"]');
    const contained = async (selector: string) => {
      const rect = await evaluate<{top:number;bottom:number}>(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {top:r.top,bottom:r.bottom}})()`);
      assert.ok(rect.top >= 0 && rect.bottom <= height, `${selector}: ${JSON.stringify(rect)}`);
      return rect;
    };
    await contained('[data-feed-sources-dialog] footer');
    await click('[data-feed-sources-dialog] footer [data-feed-sources-close]');
    await waitFor("document.querySelector('[data-feed-sources-dialog]').hidden");
    assert.equal(await evaluate("document.scrollingElement.scrollHeight<=innerHeight+1 && document.scrollingElement.scrollTop===0"),true);
  });
}
