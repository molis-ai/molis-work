import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// A completion card arrives a moment after its action (it first reads where the object went), often after the stage has
// shown the record's toolbar. On a phone the 灵光 text field fills the stage under that toolbar: the card may cover the
// field, but its buttons must never sit on one of the stage's buttons (they used to cover 「转为待办」).
for (const width of [1440, 390]) test(`placement card ${width}px: a card that arrives after the toolbar keeps its buttons off the stage's buttons`, { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null); if (!browser) return;
  const child = await pluginFrameBrowser(t,browser,"lingguang");
  const { origin, projectId, command, sessionId, navigate, evaluate, waitFor, click, surfaceReady } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-work-surface=lingguang]')");
  const visible = (selector: string) => `(() => { const node = document.querySelector(${JSON.stringify(selector)}); return Boolean(node && node.getClientRects().length); })()`;
  await click("[data-plugin-picker-popover] [data-plugin-id=lingguang]");
  await waitFor("document.body.dataset.desktopSurface === 'lingguang'");
  await surfaceReady("lingguang");
  await child.evaluate(`document.querySelector("[data-lingguang-capture]").click()`);
  await child.waitFor(visible("[data-lingguang-todo]"), 10_000);
  await waitFor("Boolean(document.querySelector('.placement-toast'))", 10_000);
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const covered = await evaluate<string[]>(`(() => {
    const region = document.querySelector('.placement-toasts'), found = [];
    for (const button of region.querySelectorAll('button')) {
      const rect = button.getBoundingClientRect(); if (!rect.width) continue;
      for (const [x, y] of [[rect.left + 2, rect.top + 2], [rect.right - 2, rect.top + 2], [rect.left + 2, rect.bottom - 2], [rect.right - 2, rect.bottom - 2]]) {
        const under = document.elementsFromPoint(x, y).find(element => !region.contains(element));
        const control = under?.closest('button, a[href], select, [role=button]');
        if (control) found.push(button.textContent.trim() + ' over ' + (control.textContent.trim() || control.getAttribute('aria-label') || control.tagName));
      }
    }
    return [...new Set(found)];
  })()`);
  const points = await evaluate<Array<{x:number;y:number;label:string}>>(`(()=>{
    const frame=document.querySelector('iframe[data-plugin-frame=lingguang]').getBoundingClientRect();
    return [...document.querySelectorAll('.placement-toasts button')].flatMap(button=>{const r=button.getBoundingClientRect();return !r.width?[]:[[r.left+2,r.top+2],[r.right-2,r.top+2],[r.left+2,r.bottom-2],[r.right-2,r.bottom-2]].map(([x,y])=>({x:x-frame.left,y:y-frame.top,label:button.textContent.trim()}))});})()`);
  const childCovered = await child.evaluate<string[]>(`(${JSON.stringify(points)}).flatMap(point=>{const control=document.elementFromPoint(point.x,point.y)?.closest('button,a[href],select,[role=button]');return control?[point.label+' over '+(control.textContent.trim()||control.getAttribute('aria-label')||control.tagName)]:[]})`);
  assert.deepEqual([...covered, ...childCovered], [], "the card's buttons cover none of the stage's buttons");
});
