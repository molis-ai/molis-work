import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { openMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import { openGoalBrowser } from './fixtures/goal-browser.js';

for (const [width, height] of [[1440, 900], [390, 640]]) {
  test(`Session association ${width}: failed draft, protected pending request, one saved relation and settings return`, { timeout: 60000 }, async t => {
    const b = await openGoalBrowser(t, true); if (!b) return;
    const { command, sessionId, navigate, origin, projectId, click, evaluate, waitFor } = b;
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: b.homeDirectory });
    catalog.addProjectPlugin({ project_id: projectId!, plugin_id: 'sessions', actor_id: 'journey-test' }); catalog.close();
    const prefix = `${origin}/projects/${projectId}`;
    const sessions = async () => (await (await fetch(prefix + '/api/sessions')).json()).sessions;
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
    await navigate(() => command('Page.navigate', { url: prefix + '/' }, sessionId));
    if (width < 760 && await evaluate("!document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')")) await click('[data-directory-show]');
    await click('[data-plugin-id=sessions]');
    if (width < 760 && await evaluate("!document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')")) await click('[data-directory-show]');
    await click(width < 760 ? '[data-directory-panel=sessions] .project-record-add-compact' : '[data-work-surface=sessions] [data-open-session-add]');
    await click('[data-session-add-toggle]');
    await evaluate(`{
      const set=(selector,value,event='input')=>{const e=document.querySelector(selector);e.value=value;e.dispatchEvent(new Event(event,{bubbles:true}));};
      set('[data-session-add-runtime]','opencode','change');
      set('[data-session-add-goal]','CORE','change');
      set('[data-session-add-title]','跨页面关联验收');
      set('[data-session-native-id]','fixture-existing-session');
      const original=window.fetch;window.sessionRequests=0;
      window.fetch=(url,options)=>{
        if(options?.method==='POST'&&String(url).endsWith('/api/sessions')){
          window.sessionRequests++;
          if(window.sessionRequests===1)return Promise.reject(new TypeError('Failed to fetch'));
          return new Promise(resolve=>{window.releaseSession=()=>resolve(original(url,options));});
        }
        return original(url,options);
      };
    }`);
    await click('[data-session-add-confirm]');
    await click('[data-session-add-submit]');
    await waitFor("document.querySelector('[data-session-add-status]').classList.contains('is-error')");
    assert.equal((await sessions()).length, 0);
    assert.equal(await evaluate("document.querySelector('[data-session-native-id]').value"), 'fixture-existing-session');
    assert.equal(await evaluate("document.querySelector('[data-session-add-submit]').disabled"), false);
    assert.match(await evaluate<string>("document.querySelector('[data-session-add-status]').textContent"), /输入已保留/);
    await click('[data-session-add-submit]');
    await waitFor('window.sessionRequests===2');
    assert.equal(await evaluate("document.querySelector('[data-session-add-form]').getAttribute('aria-busy')"), 'true');
    assert.equal(await evaluate("[...document.querySelectorAll('[data-session-add-form] :is(input,select,textarea)')].every(e=>e.disabled)"), true);
    assert.equal(await evaluate("[...document.querySelectorAll('[data-session-add-form] button')].every(b=>b.disabled)"), true);
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
    assert.equal(await evaluate("document.querySelector('[data-session-add-dialog]').open"), true);
    await evaluate("document.querySelector('[data-session-add-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
    assert.equal(await evaluate('window.sessionRequests'), 2, 'one failed request and one pending retry, no duplicate');
    const dir = '.impeccable/review/journeys-v13'; await mkdir(dir, { recursive: true });
    const shot = await command<{data:string}>('Page.captureScreenshot', {format:'png'}, sessionId);
    await writeFile(`${dir}/session-pending-${width}.png`, Buffer.from(shot.data,'base64'));
    await navigate(() => evaluate('window.releaseSession()'));
    const saved = await sessions(); assert.equal(saved.length, 1);
    assert.equal(saved[0].native_runtime_session_id, 'fixture-existing-session');
    assert.equal(saved[0].current_goal_id, 'CORE'); assert.equal(saved[0].title, '跨页面关联验收');
    await waitFor("document.querySelector('[data-operation-row=session]')");
    await navigate(() => command('Page.navigate', {url: prefix + '/settings'}, sessionId));
    await waitFor("document.body.classList.contains('project-preferences-page')");
    await navigate(() => click('.settings-nav-back'));
    await waitFor("document.querySelector('[data-operation-row=session]')");
    assert.equal((await sessions()).length,1);
    assert.equal(await evaluate('document.scrollingElement.scrollHeight<=innerHeight+1'),true);
  });
}
