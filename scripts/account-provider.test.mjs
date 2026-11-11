// WUA-13/14/15 and S-unified-account-provider-callback: real Host, real Auth, mock providers, browser/native-bridge paths.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMolisWorkLocalHost } from '@molis-ai/molis-work-app-local-host';
import { createDesktopWebCore } from '@molis-ai/molis-work-app-desktop';
import { ChromeHarness } from '@molis-ai/molis-work-test-kit/browser';
const source = process.env.MOLIS_AUTH_SOURCE; assert.ok(source && isAbsolute(source));
const { getRustProxy, initializeLocalRuntime } = await import(pathToFileURL(resolve(source, 'worker/scripts/local-runtime.mjs')).href);
const home = await mkdtemp(join(tmpdir(), 'work04-')), control = randomBytes(32).toString('hex');
process.env.MOLIS_WORK_SECRET_BACKEND = 'file'; process.env.MOLIS_WORK_ENCRYPTION_KEY = '';
let proxy, host, server, browser, page, origin, authOrigin, barrier, maliciousStart = false;
const authServer = http.createServer(async (req, res) => {
  try {
    const chunks = []; for await (const c of req) chunks.push(c);
    const reply = await proxy.fetch(new Request(authOrigin + req.url, { method: req.method, headers: req.headers,
      ...(req.method === 'GET' || req.method === 'HEAD' ? {} : { body: Buffer.concat(chunks) }) }));
    res.writeHead(reply.status, Object.fromEntries(reply.headers)); res.end(Buffer.from(await reply.arrayBuffer()));
  } catch { res.writeHead(500); res.end('Isolated provider unavailable'); }
});
const listen = async s => { await new Promise(r => s.listen(0, '127.0.0.1', r)); return 'http://127.0.0.1:' + s.address().port; };
const stop = async s => { s.closeAllConnections(); await new Promise(r => s.close(r)); };
async function api(path, body, status = 200) {
  const r = await fetch(origin + '/api/account' + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { Connection: 'close', Origin: origin, 'x-molis-work-control-token': control, ...(body === undefined ? {} : { 'content-type': 'application/json', 'x-molis-work-idempotency-key': crypto.randomUUID(), 'Idempotency-Key': crypto.randomUUID() }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await r.text(); assert.equal(r.status, status, text); assert.doesNotMatch(text, /"(?:accessToken|refreshToken|operationProof|codeVerifier|initiatorProof)"/); return JSON.parse(text).data;
}
const create = method => api('/auth/transactions', { purpose: 'LOGIN', method });
const step = (tx, input, status) => api('/auth/transactions/' + tx.handle + '/submit', input, status);
const logout = () => api('/logout', { scope: 'CURRENT_LOGIN' });
async function callback(url, status = 200, init = {}) {
  const r = await new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'GET', agent: false, ...init }, response => {
      const chunks = []; response.on('data', c => chunks.push(c)); response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, text: Buffer.concat(chunks).toString() }));
    }); req.on('error', reject); req.end();
  });
  assert.equal(r.status, status, r.text);
  if (status === 200) {
    // T01-CALLBACK-01: the callback acknowledges in plain text; account UI stays in the original workbench.
    assert.equal(r.headers['content-type'], 'text/plain; charset=utf-8');
    assert.equal(r.headers['cache-control'], 'no-store'); assert.equal(r.headers['referrer-policy'], 'no-referrer');
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['content-security-policy'], "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    assert.match(r.text, /^Molis Work\n\n验证(?:完成|已取消)\n请回到 Molis Work，可关闭此窗口。\n$/);
    assert.doesNotMatch(r.text, /accessToken|refreshToken|<|>/);
  }
  return r.text;
}
async function grant(method, outcome = 'SUCCESS', accountId = 'mock-' + method.toLowerCase() + '-local') {
  const tx = await create(method), started = await step(tx, { step: 'START_PROVIDER' });
  const response = await proxy.fetch(new Request(started.browserStartUrl)); assert.equal(response.status, 303);
  const cookie = response.headers.get('set-cookie').split(';')[0], authorize = response.headers.get('location');
  const html = await (await proxy.fetch(new Request(authorize, { headers: { Cookie: cookie } }))).text();
  const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
  const accepted = await proxy.fetch(new Request(authOrigin + '/api/v2/auth/mock/' + method.toLowerCase() + '/authorize', {
    method: 'POST', headers: { Origin: authOrigin, Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ state: new URL(authorize).searchParams.get('state'), csrf, accountId, outcome }),
  })); assert.equal(accepted.status, 303);
  const returned = await proxy.fetch(new Request(accepted.headers.get('location'), { headers: { Cookie: cookie } }));
  assert.equal(returned.status, 303); return { tx, url: returned.headers.get('location') };
}
try {
  authOrigin = await listen(authServer);
  const reserve = http.createServer(); origin = await listen(reserve); await stop(reserve);
  proxy = await getRustProxy({ AUTH_ORIGIN: authOrigin, PROVIDER_STATE_KEY: randomBytes(32).toString('base64url'), UNIFIED_ACCOUNT_CONFIG: JSON.stringify({ environmentId: 'unified-local', kind: 'LOCAL', authOrigin, deliveryMode: 'MOCK', providerMode: 'MOCK' }) });
  await initializeLocalRuntime(proxy,false);
  for (const file of ['unified-account-local-seed.sql', 'mock-provider-local-seed.sql']) for (const sql of readFileSync(resolve(source, 'worker', file), 'utf8')
    .replaceAll('http://127.0.0.1:4207', origin).replaceAll('http://127.0.0.1:8787', authOrigin).replace(/--[^\n]*/g, '').split(';').map(v => v.trim()).filter(Boolean)) await proxy.env.DB.prepare(sql).run();
  const config = { environmentId: 'unified-local', environmentKind: 'LOCAL', authOrigin, productOrigin: origin, clientId: 'molis-work-unified-local', applicationId: 'molis-work-unified-local-app', policyProfile: 'unified-account-v2', redirectAllowlist: [origin + '/account/callback'], providerMode: 'MOCK', deliveryMode: 'MOCK' };
  const boot = async () => {
    host = createMolisWorkLocalHost({ homeDirectory: home, completeText: null });
    server = createDesktopWebCore({ ptyClientFilePath: () => join(home, 'unused.js') })({ homeDirectory: home, localHost: host, controlToken: control, account: { environment: config, fetch: async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (maliciousStart && path.endsWith('/start')) return Response.json({ requestId: 'test', data: { browserStartUrl: 'https://example.test/steal' } });
      const result = await proxy.fetch(new Request(url, init));
      if (barrier && path === '/api/v2/auth/token') { const gate = barrier; barrier = null; gate.enter(); await gate.wait; }
      return result;
    } } }); await new Promise(r => server.listen(Number(new URL(origin).port), '127.0.0.1', r));
  }; await boot();
  for (const method of ['GOOGLE', 'GITHUB']) {
    const p = await grant(method); const wrong = new URL(p.url); wrong.searchParams.set('state', randomBytes(32).toString('base64url'));
    await callback(wrong, 403); await callback(p.url, 403, { headers: { Origin: 'https://wrong.example' } });
    await callback(p.url + '&clientId=other', 403); await callback(p.url, 403, { headers: { 'Sec-Fetch-Mode': 'cors' } });
    assert.match(await callback(p.url), /验证完成/); const view = await api('/session'); assert.equal(view.state, 'AUTHENTICATED');
    await callback(p.url, 403); await logout();
  }
  const cancelled = await grant('GOOGLE', 'CANCEL'); assert.match(await callback(cancelled.url), /验证已取消/); assert.equal((await api('/session')).state, 'ANONYMOUS');
  const late = await grant('GITHUB'); let entered, release; const arrived = new Promise(r => { entered = r; }); barrier = { enter: entered, wait: new Promise(r => { release = r; }) };
  const callbackPending = callback(late.url, 400); await arrived; await api('/auth/transactions/' + late.tx.handle + '/cancel', {}); release(); await callbackPending;
  assert.equal((await api('/session')).state, 'ANONYMOUS');
  const abandoned = await grant('GOOGLE'); await stop(server); await host.close(); await boot(); await callback(abandoned.url, 403);
  const invalid = await create('GOOGLE'); maliciousStart = true; await step(invalid, { step: 'START_PROVIDER' }, 502); maliciousStart = false;
  await api('/auth/transactions/' + invalid.handle + '/cancel', {});
  process.stdout.write('PASS WORK-04 HTTP: both providers, callback state/origin/shape/replay, cancellation, late token refusal, restart, unsafe provider URL\n');
  browser = await ChromeHarness.start(join(home, 'chrome')); assert.ok(browser);
  page = await browser.page(); process.stdout.write('Chrome: navigating Work entry\n'); await page.command('Page.enable'); await page.viewport(1440, 900); await Promise.all([browser.event('Page.domContentEventFired'), page.command('Page.navigate', { url: origin })]); await page.wait("document.readyState==='complete'");
  // T01-ACCOUNT-READY-01: wait for the initial client paint before selecting its exit button.
  await page.wait("!document.querySelector('#cx-app') || document.querySelector('#cx-app').getAttribute('aria-busy')==='false'");
  process.stdout.write('Chrome: entry loaded\n');
  if (await page.evaluate("Boolean(document.querySelector('#cx-exit'))")) { await Promise.all([browser.event('Page.domContentEventFired'), page.click('#cx-exit')]); await page.wait("!document.querySelector('#cx-exit')"); }
  process.stdout.write('Chrome: local entry ready\n');
  const clickText = async text => { await page.command('Page.bringToFront'); await page.evaluate(`{const b=[...document.querySelectorAll('.account-dialog button')].find(b=>b.textContent===${JSON.stringify(text)});if(!b)throw Error('Button missing');document.querySelectorAll('[data-click]').forEach(b=>b.removeAttribute('data-click'));b.dataset.click='';}`); await page.click('[data-click]'); };
  await page.click('[data-unified-account-link]'); await page.wait("document.querySelector('.account-form button[type=submit]')&&!document.querySelector('.account-form button[type=submit]').disabled");
  const evidence = resolve('.impeccable/qa/review/account'); await mkdir(evidence, { recursive: true });
  for (const width of [1440, 1024, 390]) for (const theme of ['light', 'dark']) { await page.viewport(width, 900); await page.evaluate(`document.documentElement.dataset.theme=document.documentElement.dataset.resolvedTheme=${JSON.stringify(theme)}`); await page.screenshot(join(evidence, `providers-${width}-${theme}.png`)); assert.ok(await page.evaluate('document.querySelector(".account-dialog").getBoundingClientRect().right<=innerWidth')); }
  // Browser opens its own popup. Desktop bridge uses the same URL and Host state; no Token travels through IPC.
  for (const [name, desktop] of [['Google', false], ['GitHub', true]]) {
    let providerPage;
    if (desktop) await page.evaluate('globalThis.molisWorkOpenExternalUrl=async url=>{globalThis.__openedProvider=url;}');
    const beforeTargets = new Set((await browser.command('Target.getTargets')).targetInfos.map(t => t.targetId));
    await clickText('使用 ' + name + ' 登录'); await page.wait("document.querySelector('.account-form')?.textContent.includes('浏览器')");
    if (desktop) { const url = await page.evaluate('globalThis.__openedProvider'); assert.ok(url.startsWith(authOrigin + '/api/v2/auth/external/github/browser-start?ticket=')); providerPage = await browser.page(); await providerPage.command('Page.navigate', { url }); }
    else { const targets = (await browser.command('Target.getTargets')).targetInfos; const target = targets.find(t => t.type === 'page' && !beforeTargets.has(t.targetId)); assert.ok(target); providerPage = await browser.page(target.targetId); }
    await providerPage.wait("Boolean(document.querySelector('button[name=outcome]'))"); await providerPage.command('Network.enable');
    // Observe the navigation response before the opener closes its completed popup; do not inspect a destroyed document.
    const [returned] = await Promise.all([
      browser.event('Network.responseReceived', event => event.response?.url.startsWith(origin + '/account/callback?')),
      providerPage.click('button[name=outcome][value=SUCCESS]'),
    ]);
    assert.equal(returned.response.mimeType, 'text/plain');
    await page.wait("document.querySelector('.account-form')?.textContent.includes('退出登录')");
    assert.equal((await api('/session')).state, 'AUTHENTICATED');
    // Reset only the core fixture; account-installation.test.mjs verifies the actual installation logout through Chrome.
    await logout(); assert.equal((await api('/session')).state, 'ANONYMOUS'); await clickText('关闭'); await page.click('[data-unified-account-link]'); await page.wait("document.querySelector('.account-form button[type=submit]')&&!document.querySelector('.account-form button[type=submit]').disabled");
  }
  process.stdout.write('PASS WORK-04 Chrome: browser popup and desktop bridge to mock providers, real local callback and original dialog recovery, responsive screenshots\n');
} catch (error) { if(page) { process.stderr.write(JSON.stringify(await page.evaluate('({url:location.href, text:document.body?.innerText?.slice(0,1200),state:document.readyState})').catch(()=>null))+'\n'); await page.screenshot('/private/tmp/work04-browser-failure.png').catch(()=>{}); } throw error; } finally { await browser?.close(); if (server) await stop(server); await host?.close(); await stop(authServer); await proxy?.dispose(); await rm(home, { recursive: true, force: true }); }
