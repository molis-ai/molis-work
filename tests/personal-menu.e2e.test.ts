import assert from 'node:assert/strict';
import test from 'node:test';
import { openGoalBrowser } from './fixtures/goal-browser.js';
import { mkdirSync, writeFileSync } from 'node:fs';

test('Auth entry works by keyboard inside the new project menu at desktop and phone widths', { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, evaluate, waitFor, click } = browser;
  // Only mock identity presentation. The HTTP suite tests the real PKCE/session flow.
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `{
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => String(input).startsWith('/api/personal/status')
      ? Promise.resolve(Response.json({configured:true,identity:null,syncEnabled:false}))
      : originalFetch(input, init);
  }` }, sessionId);
  for (const width of [1440, 390]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate(() => command('Page.navigate', { url: origin + '/projects/' + projectId + '/' }, sessionId));
    await waitFor("document.querySelector('#mw-account-menu') && document.querySelector('[data-project-menu]')");
    await click('[data-project-menu] > summary');
    assert.equal(await evaluate("document.querySelector('[data-personal-menu] [data-account-link]').tagName"), 'BUTTON');
    await evaluate("document.querySelector('[data-personal-menu] [data-account-link]').focus()");
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' }, sessionId);
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
    await waitFor("!document.querySelector('#mw-account-menu').hidden && document.activeElement?.dataset.personalAction === 'login'");
    assert.equal(await evaluate("(() => { const r=document.querySelector('#mw-account-menu').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })()"), true);
    assert.equal(await evaluate("document.querySelector('[data-personal-action=switch]').hidden && document.querySelector('[data-personal-action=logout]').hidden"), true);
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
    await waitFor("document.querySelector('#mw-account-menu').hidden");
    assert.equal(await evaluate("!!document.querySelector('[data-personal-menu] [data-capabilities-open]') && !!document.querySelector('[data-personal-menu] [data-directory-open=settings]')"), true);
  }
});

test('signed-in account menu offers explicit local/personal choices without auto-moving assets', {timeout:90_000}, async t => {
  const browser=await openGoalBrowser(t,true);if(!browser)return;
  const {command,sessionId,navigate,origin,projectId,evaluate,waitFor,click}=browser;
  await command('Page.addScriptToEvaluateOnNewDocument',{source:`{
    const original=window.fetch.bind(window);
    window.fetch=(input,init)=>String(input).startsWith('/api/personal/status')
      ? Promise.resolve(Response.json({configured:true,identity:{userId:'test-alice',displayName:'测试用户',emails:['alice@example.test']},space:'local',syncEnabled:false}))
      : original(input,init);
  }`},sessionId);
  await navigate(()=>command('Page.navigate',{url:origin+'/projects/'+projectId+'/'},sessionId));
  await waitFor("document.querySelector('[data-personal-name]')?.textContent === '测试用户'");
  await click('[data-project-menu] > summary');
  await click('[data-personal-menu] [data-account-link]');
  await waitFor("!document.querySelector('#mw-account-menu').hidden");
  assert.equal(await evaluate("document.querySelector('[data-personal-action=local]').getAttribute('aria-pressed')"),'true');
  assert.equal(await evaluate("document.querySelector('[data-personal-action=space]').getAttribute('aria-pressed')"),'false');
  assert.equal(await evaluate("document.querySelector('[data-personal-action=login]').hidden"),true);
  assert.equal(await evaluate("document.querySelector('[data-personal-action=space]').getClientRects().length > 0"),true);
  const shot=await command('Page.captureScreenshot',{format:'png'},sessionId) as {data:string};
  mkdirSync('.impeccable/qa/review',{recursive:true});
  writeFileSync('.impeccable/qa/review/personal-space-menu.png',Buffer.from(shot.data,'base64'));
});
