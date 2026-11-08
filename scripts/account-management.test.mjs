import { createAccountSessionManager, createAccountAuthentication } from "@molis-ai/molis-work-service-account";
import { createRequire } from "node:module";
// WUA-16/17/18 and S-unified-account-sensitive-operations: real Host, real Auth, mock providers, browser/native-bridge paths.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMolisWorkLocalHost } from '@molis-ai/molis-work-app-local-host';
import { createDesktopWebCore } from '@molis-ai/molis-work-app-desktop';
import { ChromeHarness } from '@molis-ai/molis-work-test-kit/browser';
const source = process.env.MOLIS_AUTH_SOURCE; assert.ok(source && isAbsolute(source));
const { getRustProxy, initializeLocalRuntime } = await import(pathToFileURL(resolve(source, 'worker/scripts/local-runtime.mjs')).href);
const home = await mkdtemp(join(tmpdir(), 'work05-')), control = randomBytes(32).toString('hex');
process.env.MOLIS_WORK_SECRET_BACKEND = 'file'; process.env.MOLIS_WORK_ENCRYPTION_KEY = '';
let proxy, host, server, browser, page, origin, authOrigin, barrier, maliciousStart = false, otherSession, otherAuth;
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
async function api(path, body, status = 200, method = body === undefined ? "GET" : "POST") {
  const r = await fetch(origin + '/api/account' + path, { method,
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
  if (status === 200) { assert.equal(r.headers['referrer-policy'], 'no-referrer'); assert.match(r.text, /Molis Work/); assert.doesNotMatch(r.text, /accessToken|refreshToken|<script/); }
  return r.text;
}
async function grant(method, outcome = 'SUCCESS', accountId = 'mock-' + method.toLowerCase() + '-local', existing) {
  const tx = existing ?? await create(method), started = await step(tx, { step: 'START_PROVIDER' });
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
  await initializeLocalRuntime(proxy);
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
  const db=proxy.env.DB, email='work05@example.test', password=randomBytes(24).toString('base64url'), phone='+8613800000509';
  const code=async target=>(await db.prepare('SELECT m.credential FROM auth_mock_delivery m JOIN auth_verification_challenge c ON c.delivery_id=m.delivery_id WHERE c.canonical_target=? ORDER BY c.created_at DESC LIMIT 1').bind(target).first()).credential;
  async function verify(tx,target){await db.prepare('UPDATE auth_rate_bucket SET expires_at=0 WHERE bucket_hash=?').bind(createHash('sha256').update('v2-delivery-resend:'+(target.startsWith('+')?'SMS:':'EMAIL:')+target).digest('hex')).run();const sent=await step(tx,{step:'REQUEST_CHALLENGE',address:target});return step(tx,{step:'VERIFY_CHALLENGE',challengeHandle:sent.challengeHandle,credential:await code(target)});}
  let tx=await api('/auth/transactions',{purpose:'EMAIL_SIGNUP',method:'EMAIL_CODE'});await verify(tx,email);await step(tx,{step:'EMAIL_SIGNUP',email,password});const signed=await step(tx,{step:'COMPLETE'}), user=signed.account.user.userId;
  let view=await api('/session');
  await api('/profile',{displayName:'Work five',expectedVersion:view.user.version},200,'PATCH');
  await api('/profile',{displayName:'Stale',expectedVersion:view.user.version},409,'PATCH');
  assert.equal((await api('/session')).user.displayName,'Work five');
  await api('/profile',{displayName:'Forged',expectedVersion:view.user.version,actorId:'foreign'},400,'PATCH');
  async function reauth(operation,target,method='EMAIL_PASSWORD'){
    const t=await api('/reauthentications',{operation,target,method});
    if(method==='EMAIL_PASSWORD')await step(t,{step:'PASSWORD_LOGIN',email,password});
    else if(method==='PHONE_OTP')await verify(t,phone);
    else { const g=await grant(method,'SUCCESS',undefined,t);await callback(g.url);return t; }
    assert.equal((await step(t,{step:'COMPLETE'})).operationReady,true);return t;
  }
  let methods=await api('/login-methods'), emailBinding=methods.loginMethods[0].bindingId;
  let r=await reauth('UNLINK_METHOD',{bindingId:emailBinding});
  await api('/login-methods/'+emailBinding+'/unlink',{reauthHandle:r.handle,expectedVersion:methods.version},409);
  r=await reauth('BIND_METHOD',{method:'PHONE'});
  await api('/auth/transactions',{purpose:'BIND',method:'EMAIL_CODE',reauthHandle:r.handle},403);
  let identity=await api('/auth/transactions',{purpose:'BIND',method:'PHONE_OTP',reauthHandle:r.handle});await verify(identity,phone);await step(identity,{step:'COMPLETE'});
  methods=await api('/login-methods/bind',{reauthHandle:r.handle,identityHandle:identity.handle,expectedVersion:methods.version});assert.equal(methods.loginMethods.length,2);
  r=await reauth('BIND_METHOD',{method:'GOOGLE'},'PHONE_OTP');identity=await api('/auth/transactions',{purpose:'BIND',method:'GOOGLE',reauthHandle:r.handle});
  let g=await grant('GOOGLE','SUCCESS',undefined,identity);await callback(g.url);
  methods=await api('/login-methods/bind',{reauthHandle:r.handle,identityHandle:identity.handle,expectedVersion:methods.version});
  r=await reauth('BIND_METHOD',{method:'GITHUB'},'GOOGLE');identity=await api('/auth/transactions',{purpose:'BIND',method:'GITHUB',reauthHandle:r.handle});g=await grant('GITHUB','SUCCESS',undefined,identity);await callback(g.url);
  methods=await api('/login-methods/bind',{reauthHandle:r.handle,identityHandle:identity.handle,expectedVersion:methods.version});assert.equal(methods.loginMethods.length,4);
  let phoneBinding=methods.loginMethods.find(m=>m.type==='PHONE').bindingId;
  r=await reauth('REPLACE_METHOD',{bindingId:phoneBinding},'GITHUB');identity=await api('/auth/transactions',{purpose:'REPLACE',method:'PHONE_OTP',bindingId:phoneBinding,reauthHandle:r.handle});await verify(identity,'+8613800000510');await step(identity,{step:'COMPLETE'});
  methods=await api('/login-methods/'+phoneBinding+'/replace',{reauthHandle:r.handle,identityHandle:identity.handle,expectedVersion:methods.version});
  phoneBinding=methods.loginMethods.find(m=>m.type==='PHONE').bindingId;
  r=await reauth('UNLINK_METHOD',{bindingId:phoneBinding});await api('/auth/transactions/'+r.handle+'/cancel',{});
  await api('/login-methods/'+phoneBinding+'/unlink',{reauthHandle:r.handle,expectedVersion:methods.version},409);
  r=await reauth('UNLINK_METHOD',{bindingId:phoneBinding});methods=await api('/login-methods/'+phoneBinding+'/unlink',{reauthHandle:r.handle,expectedVersion:methods.version});assert.equal(methods.loginMethods.length,3);
  r=await reauth('CHANGE_PASSWORD',{kind:'PASSWORD'});await logout();await api('/password/change',{reauthHandle:r.handle,newPassword:randomBytes(24).toString('base64url'),expectedVersion:methods.version},409);
  tx=await create('EMAIL_PASSWORD');await step(tx,{step:'PASSWORD_LOGIN',email,password});await step(tx,{step:'COMPLETE'});
  process.stdout.write('PASS WORK-05 HTTP: action profile/list, revisions, last method refusal, all four reauth methods, bind/replace/unlink, exact target proof, cancellation and logout fencing\n');
  let saved=null;
  const otherConfig={...config,clientId:'molis-club-unified-local',applicationId:'molis-club-unified-local-app',productOrigin:'http://127.0.0.1:3000',redirectAllowlist:['http://127.0.0.1:3000/account/callback']}, currentControl={assertCurrent(){}};
  otherSession=createAccountSessionManager(otherConfig,{storage:{read:()=>saved,write:value=>{saved=structuredClone(value);}},fetch:(url,init)=>proxy.fetch(new Request(url,init))});
  otherAuth=createAccountAuthentication(otherConfig,otherSession,(url,init)=>proxy.fetch(new Request(url,init)));
  const otherTx=await otherAuth.create({purpose:'LOGIN',method:'EMAIL_PASSWORD'},currentControl);await otherAuth.submit(otherTx.handle,{step:'PASSWORD_LOGIN',email,password},currentControl);await otherAuth.submit(otherTx.handle,{step:'COMPLETE'},currentControl);
  assert.equal((await otherSession.readSession(currentControl)).user.displayName,'Work five','other product reads central profile');
  browser=await ChromeHarness.start(join(home,'chrome'));assert.ok(browser);page=await browser.page();await page.command('Page.enable');await page.viewport(1440,900);await Promise.all([browser.event('Page.domContentEventFired'),page.command('Page.navigate',{url:origin})]);await page.wait("document.readyState==='complete'");
  // T01-ACCOUNT-READY-01: wait for the initial client paint before selecting its exit button.
  await page.wait("!document.querySelector('#cx-app') || document.querySelector('#cx-app').getAttribute('aria-busy')==='false'");
  if(await page.evaluate("Boolean(document.querySelector('#cx-exit'))")){await Promise.all([browser.event('Page.domContentEventFired'),page.click('#cx-exit')]);await page.wait("!document.querySelector('#cx-exit')");}
  const clickText=async text=>{await page.command('Page.bringToFront');await page.evaluate(`{const b=[...document.querySelectorAll('.account-dialog button')].find(b=>b.textContent===${JSON.stringify(text)});if(!b)throw Error('Missing '+${JSON.stringify(text)});document.querySelectorAll('[data-test-click]').forEach(b=>b.removeAttribute('data-test-click'));b.dataset.testClick='';}`);await page.click('[data-test-click]');};
  const ready=()=>page.wait("!document.querySelector('.account-form').hasAttribute('aria-busy')");
  await page.click('[data-unified-account-link]');await page.wait("document.querySelector('.account-form')?.textContent.includes('个人资料与安全')");await ready();await clickText('个人资料与安全');
  const {PNG}=createRequire(resolve(source,'worker/package.json'))('pngjs'), avatar=new PNG({width:1,height:1});avatar.data.fill(127);const avatarFile=join(home,'avatar.png');await writeFile(avatarFile,PNG.sync.write(avatar));
  const doc=await page.command('DOM.getDocument'), fileNode=await page.command('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[name=avatar]'});await page.command('DOM.setFileInputFiles',{nodeId:fileNode.nodeId,files:[avatarFile]});
  await page.fill('input[name=name]','Work profile UI');await page.click('.account-form button[type=submit]');await page.wait("document.querySelector('.account-message').textContent.includes('资料已保存')");
  assert.equal((await api('/session')).user.displayName,'Work profile UI');
  const evidence=resolve('.impeccable/qa/review/account');await mkdir(evidence,{recursive:true});
  for(const width of [1440,1024,390])for(const theme of ['light','dark']){await page.viewport(width,900);await page.evaluate(`document.documentElement.dataset.theme=document.documentElement.dataset.resolvedTheme=${JSON.stringify(theme)}`);await page.screenshot(join(evidence,`profile-${width}-${theme}.png`));assert.ok(await page.evaluate('document.querySelector(".account-dialog").getBoundingClientRect().right<=innerWidth'));}
  assert.ok((await api('/session')).user.avatarUrl);await ready();await clickText('移除头像');await page.wait("!document.querySelector('.account-form img')");assert.equal((await api('/session')).user.avatarUrl,null);
  await ready();await clickText('登录方式与安全');await page.wait("document.querySelector('.account-form').textContent.includes('绑定手机')");await ready();await clickText('绑定手机');await clickText('开始验证');await page.wait("Boolean(document.querySelector('input[name=password]'))");await ready();await page.fill('input[name=address]',email);await page.fill('input[name=password]',password);await page.click('.account-form button[type=submit]');
  await page.wait("Boolean(document.querySelector('input[type=tel]'))");await ready();const uiPhone='+8613800000511';await page.fill('input[name=address]',uiPhone.slice(3));await page.click('.account-form button[type=submit]');await page.wait("Boolean(document.querySelector('input[name=code]'))");await ready();await page.fill('input[name=code]',await code(uiPhone));await page.click('.account-form button[type=submit]');await page.wait("document.querySelector('.account-form').textContent.includes('确认更新登录方式')");await ready();await clickText('确认保存');await page.wait("document.querySelector('.account-message').textContent.includes('账号设置已保存')");
  await ready();await clickText('设置或修改密码');await page.evaluate("document.querySelector('.account-form select').value='PHONE_OTP'");await clickText('开始验证');await page.wait("Boolean(document.querySelector('input[type=tel]'))");await ready();await db.prepare('UPDATE auth_rate_bucket SET expires_at=0 WHERE bucket_hash=?').bind(createHash('sha256').update('v2-delivery-resend:SMS:'+uiPhone).digest('hex')).run();
  await page.fill('input[name=address]',uiPhone.slice(3));await page.click('.account-form button[type=submit]');await page.wait("Boolean(document.querySelector('input[name=code]'))");await ready();await page.fill('input[name=code]',await code(uiPhone));await page.click('.account-form button[type=submit]');await page.wait("Boolean(document.querySelector('input[name=confirm]'))");await ready();const replacement=randomBytes(24).toString('base64url');await page.fill('input[name=password]',replacement);await page.fill('input[name=confirm]',replacement);await clickText('确认保存');await page.wait("document.querySelector('.account-message').textContent.includes('账号设置已保存')");
  assert.equal((await api('/session')).user.userId,user);assert.equal((await otherSession.readSession(currentControl)).state,'EXPIRED','password change revokes the other product login');
  await page.screenshot(join(evidence,'methods-390-dark.png'));
  assert.ok(await page.evaluate('!localStorage.getItem("accessToken")&&!sessionStorage.getItem("operationProof")'));
  process.stdout.write('PASS WORK-05 Chrome: profile, email reauth and phone bind, phone reauth password change, same local account session, responsive light/dark screenshots\n');
} catch(error){if(page){process.stderr.write(JSON.stringify(await page.evaluate('({text:document.querySelector(".account-dialog")?.innerText})').catch(()=>null))+'\n');await page.screenshot('/private/tmp/work05-browser-failure.png').catch(()=>{});}throw error;} finally {await browser?.close();otherAuth?.close();await otherSession?.close();if(server)await stop(server);await host?.close();await stop(authServer);await proxy?.dispose();await rm(home,{recursive:true,force:true});}
