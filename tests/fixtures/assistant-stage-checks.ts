import assert from "node:assert/strict";
import type { openGoalBrowser } from "./goal-browser.js";

/** PAS-11 PAS-12: the visible composer, not just its DOM node, survives the main surface. */
export async function checkAssistantStage(browser: NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>): Promise<void> {
  const { command, sessionId, evaluate, waitFor, click } = browser;
  assert.equal(await evaluate(`document.querySelector('[data-assistant-retract]').matches('.mw-btn--ghost') && document.querySelector('[data-assistant-retract]').textContent.includes('收回底部') && !document.querySelector('[data-assistant-panel-close]').checkVisibility() && !document.querySelector('[data-assistant-new]').checkVisibility()`), true, 'PAS-12: one clearly named standard return action');
  await click('[data-assistant-input]');
  await command('Input.insertText', { text: '长历史检查：保留每一步的讨论。\n'.repeat(36) }, sessionId);
  await click('[data-assistant-send]');
  await waitFor(`document.querySelector('.assistant-msg-more')`);
  await click('.assistant-msg-more');
  for (const theme of ['light', 'dark']) {
    await evaluate(`document.documentElement.dataset.resolvedTheme=${JSON.stringify(theme)}`);
    for (const [width, height] of [[1440, 900], [1024, 600], [390, 640], [390, 480]]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
      await waitFor(`document.querySelector('[data-assistant-panel]').dataset.layout === (innerWidth >= 1240 ? 'split' : 'drawer')`);
      const result = await evaluate(`(() => {
        const form=document.querySelector('[data-assistant-composer]'),input=document.querySelector('[data-assistant-input]');
        const main=document.querySelector('.assistant-main').getBoundingClientRect(),composer=form.getBoundingClientRect();
        const surface=document.querySelector('[data-system-tab]').getBoundingClientRect();
        const inside=node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=surface.left&&r.right<=surface.right+1&&r.top>=surface.top&&r.bottom<=Math.min(surface.bottom,innerHeight)+1;};
        const hit=node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));};
        const side=document.querySelector('.assistant-side'),panel=document.querySelector('[data-assistant-panel]').getBoundingClientRect();
        const fullHeight=!side.checkVisibility()||Math.abs(side.getBoundingClientRect().bottom-panel.bottom)<1;
        input.blur();
        return {fullHeight,footer:!!form.closest('.assistant-main'),inside:[form,input,document.querySelector('[data-assistant-send]')].every(inside),hit:hit(input)&&hit(document.querySelector('[data-assistant-send]')),shadow:getComputedStyle(form).boxShadow!=='none',aligned:Math.abs((composer.left+composer.right-main.left-main.right)/2)<1,overflow:document.documentElement.scrollWidth>innerWidth};
      })()`);
      assert.deepEqual(result, { fullHeight: true, footer: true, inside: true, hit: true, shadow: true, aligned: true, overflow: false }, `PAS-11 ${theme} ${width}×${height}`);
      await click('[data-assistant-attach]');
      assert.equal(await evaluate(`(() => {const menu=document.querySelector('[data-assistant-more]'),r=menu.getBoundingClientRect();return menu.checkVisibility()&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;})()`), true, 'PAS-12: add menu remains in the viewport');
      await click('[data-assistant-attach]');
      await click('[data-assistant-input]');
      assert.equal(await evaluate(`document.activeElement===document.querySelector('[data-assistant-input]')`), true, 'PAS-11: actual click focuses the composer');
    }
  }
  await command('Input.insertText', { text: '输入区可见性回归：继续整理' }, sessionId);
  await waitFor(`!document.querySelector('[data-assistant-send]').disabled`);
  await click('[data-assistant-send]');
  await waitFor(`document.querySelector('[data-assistant-thread]').textContent.includes('输入区可见性回归：继续整理')`);
  await evaluate(`document.documentElement.dataset.resolvedTheme='light'`);
}
