import assert from "node:assert/strict";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

for (const [width, height] of [[1024, 400], [390, 500]]) {
  test(`Low viewport ${width}×${height} keeps directory entries reachable and Session actions outside field scrolling`, { timeout: 60_000 }, async t => {
    const b = await openGoalBrowser(t, true); if (!b) return;
    const { command, sessionId, navigate, origin, projectId, evaluate, click, waitFor } = b;
    const catalog = await openMolisWorkProjectCatalog({homeDirectory:b.homeDirectory});
    for (const plugin_id of ["feed", "sessions"]) catalog.addProjectPlugin({project_id:projectId!,plugin_id,actor_id:"viewport-test"});
    catalog.close();
    await command("Emulation.setDeviceMetricsOverride", {width,height,deviceScaleFactor:1,mobile:false}, sessionId);
    await navigate(()=>command("Page.navigate",{url:`${origin}/projects/${projectId}/`},sessionId));
    if (width < 760 && await evaluate("!document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')")) await click('[data-directory-show]');
    await click('[data-plugin-id="feed"]');
    if (width < 760 && await evaluate("!document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')")) await click('[data-directory-show]');
    await click('[data-directory-panel="feed"] [data-feed-add-toggle]');
    await waitFor("document.querySelector('[data-feed-sources-dialog]').open");
    await click('[data-feed-choose-kind="custom_rss"]');
    const contained = async (selector: string) => {
      const rect = await evaluate<{top:number;bottom:number}>(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {top:r.top,bottom:r.bottom}})()`);
      assert.ok(rect.top >= 0 && rect.bottom <= height, `${selector}: ${JSON.stringify(rect)}`);
      return rect;
    };
    await contained('[data-feed-sources-dialog] footer');
    await click('[data-feed-sources-dialog] footer [data-feed-sources-close]');
    await waitFor("!document.querySelector('[data-feed-sources-dialog]').open");
    if (width < 760 && await evaluate("document.querySelector('[data-workspace]').dataset.mobileView!=='tree'")) await click('[data-directory-show]');
    await click('[data-plugin-id="sessions"]');
    await click(width < 760 ? '[data-directory-panel="sessions"] [data-open-session-add]' : '[data-work-surface="sessions"] [data-open-session-add]');
    await waitFor("document.querySelector('[data-session-add-dialog]').open");
    await click('[data-session-add-toggle]');
    await evaluate("Promise.all(document.querySelector('[data-session-add-dialog]').getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})))");
    await evaluate("document.querySelector('[data-session-add-title]').value='取消时不能创建的草稿'");
    const header = await contained('[data-session-add-form] > header');
    const footer = await contained('[data-session-add-form] > footer');
    const section = '[data-session-add-form] > section';
    const metrics = await evaluate<{ch:number;sh:number;x:number;y:number}>(`(()=>{const e=document.querySelector('${section}'),r=e.getBoundingClientRect();return {ch:e.clientHeight,sh:e.scrollHeight,x:r.x+20,y:r.y+20}})()`);
    assert.ok(metrics.ch > 60 && metrics.sh > metrics.ch, "real association fields overflow a usable field region");
    await command("Input.dispatchMouseEvent",{type:"mouseWheel",x:metrics.x,y:metrics.y,deltaX:0,deltaY:500},sessionId);
    await waitFor(`document.querySelector('${section}').scrollTop>0`);
    assert.deepEqual(await contained('[data-session-add-form] > header'),header);
    assert.deepEqual(await contained('[data-session-add-form] > footer'),footer);
    await click('[data-session-workspace-menu] > summary');
    await click('[data-session-workspace-custom]');
    await waitFor("!document.querySelector('[data-session-workspace-custom-panel]').hidden");
    await click('[data-session-workspace-custom-input]');
    await command("Input.insertText",{text:"/tmp/local-viewport-test"},sessionId);
    await contained('[data-session-add-form] > footer');
    await click('[data-session-add-form] > footer [data-dialog-close]');
    await waitFor("!document.querySelector('[data-session-add-dialog]').open");
    await b.reloadPage();
    assert.equal(await evaluate("document.querySelectorAll('[data-operation-row=session]').length"),0,"cancelled draft does not become a persisted Session");
    assert.equal(await evaluate("document.scrollingElement.scrollHeight<=innerHeight+1 && document.scrollingElement.scrollTop===0"),true);
  });
}
