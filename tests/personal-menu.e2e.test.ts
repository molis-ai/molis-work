import assert from 'node:assert/strict';
import test from 'node:test';
import { openGoalBrowser } from './fixtures/goal-browser.js';
import { mkdirSync, writeFileSync } from 'node:fs';

test('an idle closed account menu does not poll, but focus, opening and a pending login still refresh', { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, evaluate, waitFor, click } = browser;
  // Identity presentation only: the separate personal HTTP tests retain the real PKCE/session exchange.
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `{
    const original = window.fetch.bind(window), interval = window.setInterval.bind(window), now = Date.now.bind(Date);
    window.accountPollProbe = { calls: [], ticks: [], offset: 0, complete: false, loginUrl: '', popupClosed: false };
    const probe = window.accountPollProbe;
    Date.now = () => now() + probe.offset;
    window.setInterval = (callback, delay, ...args) => {
      if (delay === 3000) { probe.ticks.push(() => callback(...args)); return interval(() => {}, delay); }
      return interval(callback, delay, ...args);
    };
    window.open = () => ({ closed: false, opener: null,
      location: { replace(url) { probe.loginUrl = url; } },
      close() { this.closed = true; probe.popupClosed = true; } });
    window.fetch = (input, init) => {
      const url = new URL(String(input), location.href);
      if (url.pathname === '/api/personal/status') {
        probe.calls.push(url.search);
        return Promise.resolve(Response.json({ configured: true, space: 'local',
          identity: probe.complete ? { userId: 'test-alice', displayName: '测试用户', emails: ['alice@example.test'] } : null,
          loginCompleted: probe.complete }));
      }
      if (url.pathname === '/api/personal/login') return Promise.resolve(Response.json({
        loginUrl: location.origin + '/health', loginAttempt: 'presentation-only-attempt' }));
      return original(input, init);
    };
  }` }, sessionId);
  await navigate(() => command('Page.navigate', { url: origin + '/projects/' + projectId + '/' }, sessionId));
  await waitFor("window.accountPollProbe?.calls.length > 0 && window.accountPollProbe.ticks.length > 0 && document.querySelector('#mw-account-menu')");
  await evaluate("new Promise(resolve => setTimeout(resolve, 0))");
  const initial = await evaluate<number>('window.accountPollProbe.calls.length');
  assert.equal(await evaluate("document.querySelector('#mw-account-menu').hidden"), true);
  await evaluate("(async () => { window.accountPollProbe.offset += 61000; window.accountPollProbe.ticks.forEach(tick => tick()); await new Promise(resolve => setTimeout(resolve, 0)); })()");
  assert.equal(await evaluate('window.accountPollProbe.calls.length'), initial, 'a full idle minute must not add an account HTTP request');
  await evaluate("window.dispatchEvent(new Event('focus'))");
  await waitFor(`window.accountPollProbe.calls.length > ${initial}`);
  await click('[data-project-menu] > summary');
  const beforeOpen = await evaluate<number>('window.accountPollProbe.calls.length');
  await click('[data-personal-menu] [data-account-link]');
  await waitFor(`!document.querySelector('#mw-account-menu').hidden && window.accountPollProbe.calls.length > ${beforeOpen}`);
  await click('[data-personal-action=login]');
  await waitFor("window.accountPollProbe.loginUrl.endsWith('/health') && !document.querySelector('[data-personal-action=login]').disabled");
  await evaluate("window.accountPollProbe.ticks.forEach(tick => tick())");
  await waitFor("window.accountPollProbe.calls.some(query => new URLSearchParams(query).get('attempt') === 'presentation-only-attempt')");
  await evaluate("new Promise(resolve => setTimeout(resolve, 0))");
  await evaluate("window.accountPollProbe.complete = true; window.accountPollProbe.ticks.forEach(tick => tick())");
  await waitFor("document.querySelector('[data-personal-name]')?.textContent === '测试用户' && document.querySelector('#mw-account-menu').hidden && window.accountPollProbe.popupClosed");
  assert.equal(await evaluate("document.querySelector('.mw-account-toast:not([hidden])')?.textContent"), '登录成功');
  const completed = await evaluate<number>('window.accountPollProbe.calls.length');
  await evaluate("(async () => { window.accountPollProbe.offset += 61000; window.accountPollProbe.ticks.forEach(tick => tick()); await new Promise(resolve => setTimeout(resolve, 0)); })()");
  assert.equal(await evaluate('window.accountPollProbe.calls.length'), completed, 'completion stops the login poll again');
});

test('PCSYNC-KBD-01: account entry and Escape work by keyboard at desktop, tablet and phone widths', { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, evaluate, waitFor } = browser;
  const press = async (key: 'Enter' | ' ' | 'Tab' | 'Escape') => {
    const code = key === ' ' ? 'Space' : key;
    const windowsVirtualKeyCode = { Enter: 13, ' ': 32, Tab: 9, Escape: 27 }[key];
    const text = key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined;
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, text, unmodifiedText: text }, sessionId);
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode }, sessionId);
  };
  // Only mock identity presentation. The HTTP suite tests the real PKCE/session flow.
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `{
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => new URL(String(input),location.href).pathname.startsWith('/api/personal/status')
      ? Promise.resolve(Response.json({configured:true,identity:null,syncEnabled:false}))
      : originalFetch(input, init);
  }` }, sessionId);
  for (const width of [1440, 1024, 390]) for (const theme of ['light', 'dark']) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] }, sessionId);
    await navigate(() => command('Page.navigate', { url: origin + '/projects/' + projectId + '/' }, sessionId));
    await waitFor("document.querySelector('#mw-account-menu') && document.querySelector('[data-project-menu]')");
    await evaluate("document.querySelector('[data-project-menu] > summary').focus()");
    await press('Enter');
    // Opening <details> has a content-visibility transition. A box alone does not mean its children can take focus yet.
    await waitFor("document.querySelector('[data-account-link]').checkVisibility({visibilityProperty:true})");
    assert.equal(await evaluate("document.querySelector('[data-personal-menu] [data-account-link]').tagName"), 'BUTTON');
    for (let step = 0; step < 8 && !await evaluate("document.activeElement?.matches('[data-account-link]')"); step++) await press('Tab');
    assert.equal(await evaluate("document.activeElement?.matches('[data-account-link]')"), true, 'Tab must reach the actual account trigger');
    await press(theme === 'light' ? 'Enter' : ' ');
    await waitFor("!document.querySelector('#mw-account-menu').hidden && document.activeElement?.dataset.personalAction === 'login'");
    assert.equal(await evaluate("(() => { const r=document.querySelector('#mw-account-menu').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })()"), true);
    assert.equal(await evaluate("document.querySelector('[data-personal-action=switch]').hidden && document.querySelector('[data-personal-action=logout]').hidden"), true);
    assert.equal(await evaluate("document.querySelector('[data-account-link]').getAttribute('aria-expanded')"), 'true');
    const shot = await command('Page.captureScreenshot', { format: 'png' }, sessionId) as { data: string };
    mkdirSync('.impeccable/qa/review', { recursive: true });
    writeFileSync(`.impeccable/qa/review/account-keyboard-${width}-${theme}.png`, Buffer.from(shot.data, 'base64'));
    await press('Escape');
    await waitFor("document.querySelector('#mw-account-menu').hidden");
    assert.equal(await evaluate("document.activeElement === document.querySelector('[data-project-menu] > summary')"), true, 'Escape must restore focus to the visible project trigger, not its hidden account row');
    assert.equal(await evaluate("document.querySelector('[data-account-link]').getAttribute('aria-expanded')"), 'false');
    assert.equal(await evaluate("!!document.querySelector('[data-personal-menu] [data-capabilities-open]') && !!document.querySelector('[data-personal-menu] [data-directory-open=settings]')"), true);
  }
  // Outside the project menu, Escape still returns to the account button itself.
  await navigate(() => command('Page.navigate', { url: origin + '/' }, sessionId));
  await waitFor("document.querySelector('#mw-account-menu') && document.querySelector('[data-account-link]').checkVisibility()");
  await evaluate("document.querySelector('[data-account-link]').focus()");
  await press('Enter');
  await waitFor("document.activeElement?.dataset.personalAction === 'login'");
  await press('Escape');
  assert.equal(await evaluate("document.querySelector('#mw-account-menu').hidden && document.activeElement === document.querySelector('[data-account-link]')"), true);
});

test('signed-in account menu offers explicit local/personal choices without auto-moving assets', {timeout:90_000}, async t => {
  const browser=await openGoalBrowser(t,true);if(!browser)return;
  const {command,sessionId,navigate,origin,projectId,evaluate,waitFor,click}=browser;
  await command('Page.addScriptToEvaluateOnNewDocument',{source:`{
    const original=window.fetch.bind(window);
    window.fetch=(input,init)=>new URL(String(input),location.href).pathname.startsWith('/api/personal/status')
      ? Promise.resolve(Response.json({configured:true,identity:{userId:'test-alice',displayName:'测试用户',emails:['alice@example.test']},space:'local',syncEnabled:false}))
      : original(input,init);
  }`},sessionId);
  await navigate(()=>command('Page.navigate',{url:origin+'/projects/'+projectId+'/'},sessionId));
  await waitFor("document.querySelector('[data-personal-name]')?.textContent === '测试用户'");
  await click('[data-project-menu] > summary');
  await click('[data-personal-menu] [data-account-link]');
  await waitFor("!document.querySelector('#mw-account-menu').hidden");
  // PCSYNC-KBD-01: an authenticated identity starts at the first visible space choice, not the hidden login button.
  assert.equal(await evaluate("document.activeElement?.dataset.personalAction"), 'local');
  assert.equal(await evaluate("document.querySelector('[data-personal-action=local]').getAttribute('aria-pressed')"),'true');
  assert.equal(await evaluate("document.querySelector('[data-personal-action=space]').getAttribute('aria-pressed')"),'false');
  assert.equal(await evaluate("document.querySelector('[data-personal-action=login]').hidden"),true);
  assert.equal(await evaluate("document.querySelector('[data-personal-action=space]').getClientRects().length > 0"),true);
  const shot=await command('Page.captureScreenshot',{format:'png'},sessionId) as {data:string};
  mkdirSync('.impeccable/qa/review',{recursive:true});
  writeFileSync('.impeccable/qa/review/personal-space-menu.png',Buffer.from(shot.data,'base64'));
});
