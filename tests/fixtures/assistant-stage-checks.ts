import assert from "node:assert/strict";
import type { openGoalBrowser } from "./goal-browser.js";

/**
 * POLISH-60 (PAS-11, PAS-12 as the 13th foot has them): maximised, the conversation grows in place over the work — which gives
 * way without being unmounted — and the one input stays where it was, in reach, at every size and in both themes.
 */
export async function checkAssistantStage(browser: NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>): Promise<void> {
  const { command, sessionId, evaluate, waitFor, click } = browser;
  assert.equal(await evaluate(`!document.querySelector('[data-assistant-retract]').hidden && document.querySelector('[data-assistant-expand]').hidden && document.querySelector('[data-assistant-panel-close]').checkVisibility()`), true, 'PAS-12: the key that maximised is the one that restores, and close stays in reach');
  await click('[data-assistant-composer] .mw-composer__input');
  await command('Input.insertText', { text: '长历史检查：保留每一步的讨论。\n'.repeat(36) }, sessionId);
  await click('[data-assistant-composer] [data-composer-send]');
  await waitFor(`document.querySelector('.assistant-msg-more')`);
  await click('.assistant-msg-more');
  for (const theme of ['light', 'dark']) {
    await evaluate(`document.documentElement.dataset.resolvedTheme=${JSON.stringify(theme)}`);
    for (const [width, height] of [[1440, 900], [1024, 600], [390, 640], [390, 480]]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
      await waitFor(`document.querySelector('[data-assistant-panel]').dataset.layout === (innerWidth >= 541 ? 'split' : 'drawer')`);
      const result = await evaluate(`(() => {
        const form=document.querySelector('[data-assistant-composer]'),input=document.querySelector('[data-assistant-composer] .mw-composer__input');
        const main=document.querySelector('.assistant-main').getBoundingClientRect(),composer=form.querySelector('.mw-composer__box').getBoundingClientRect();
        const inside=node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;};
        const hit=node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));};
        const gone=selector=>{const node=document.querySelector(selector);return !node||!node.checkVisibility({visibilityProperty:true});};
        input.blur();
        return {away:gone('[data-plugin-stage]')&&gone('[data-side-panel]'),inside:[form,input,document.querySelector('[data-assistant-composer] [data-composer-send]')].every(inside),hit:hit(input)&&hit(document.querySelector('[data-assistant-composer] [data-composer-send]')),shadow:getComputedStyle(form.querySelector('.mw-composer__box')).boxShadow!=='none',aligned:innerWidth<960||(Math.abs(main.left-composer.left)<=1&&Math.abs(main.right-composer.right)<=1),overflow:document.documentElement.scrollWidth>innerWidth};
      })()`);
      assert.deepEqual(result, { away: true, inside: true, hit: true, shadow: true, aligned: true, overflow: false }, `POLISH-60 PAS-11 ${theme} ${width}×${height}`);
      await click('[data-assistant-composer] [data-composer-add]');
      assert.equal(await evaluate(`(() => {const menu=document.querySelector('[data-assistant-composer] [data-compose-menu]'),r=menu.getBoundingClientRect();return menu.checkVisibility()&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;})()`), true, 'PAS-12: add menu remains in the viewport');
      await click('[data-assistant-composer] [data-composer-add]');
      await click('[data-assistant-composer] .mw-composer__input');
      assert.equal(await evaluate(`document.activeElement===document.querySelector('[data-assistant-composer] .mw-composer__input')`), true, 'PAS-11: actual click focuses the composer');
    }
  }
  await command('Input.insertText', { text: '输入区可见性回归：继续整理' }, sessionId);
  await waitFor(`!document.querySelector('[data-assistant-composer] [data-composer-send]').disabled`);
  await click('[data-assistant-composer] [data-composer-send]');
  await waitFor(`document.querySelector('[data-assistant-thread]').textContent.includes('输入区可见性回归：继续整理')`);
  await evaluate(`document.documentElement.dataset.resolvedTheme='light'`);
}
