import { createAccountSessionManager, createAccountAuthentication } from "@molis-ai/molis-work-service-account";

// WUA-19/20/21/22 and S-114: real Host, real Auth, mock providers, tenant actions and browser paths.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMolisWorkLocalHost } from '@molis-ai/molis-work-app-local-host';
import { createDesktopWebHost } from '@molis-ai/molis-work-app-desktop';
import { ChromeHarness } from '@molis-ai/molis-work-test-kit/browser';
const source = process.env.MOLIS_AUTH_SOURCE; assert.ok(source && isAbsolute(source));
const { getRustProxy, initializeLocalRuntime } = await import(pathToFileURL(resolve(source, 'worker/scripts/local-runtime.mjs')).href);
const home = await mkdtemp(join(tmpdir(), 'work06-')), control = randomBytes(32).toString('hex');
process.env.MOLIS_WORK_SECRET_BACKEND = 'file'; process.env.MOLIS_WORK_ENCRYPTION_KEY = '';
let proxy, host, server, browser, page, origin, authOrigin, otherSession, otherAuth;
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
    server = createDesktopWebHost({ ptyClientFilePath: () => join(home, 'unused.js') })({ homeDirectory: home, localHost: host, controlToken: control, account: { environment: config, fetch: async (url, init) => {
      const result = await proxy.fetch(new Request(url, init));
      return result;
    } } }); await new Promise(r => server.listen(Number(new URL(origin).port), '127.0.0.1', r));
  }; await boot();

  const db=proxy.env.DB, ownerPhone='+8613800000607', memberPhone='+8613800000608';
  const code=async target=>(await db.prepare('SELECT m.credential FROM auth_mock_delivery m JOIN auth_verification_challenge c ON c.delivery_id=m.delivery_id WHERE c.canonical_target=? ORDER BY c.created_at DESC LIMIT 1').bind(target).first()).credential;
  async function login(phone){
    await db.prepare('UPDATE auth_rate_bucket SET expires_at=0 WHERE bucket_hash=?').bind(createHash('sha256').update('v2-delivery-resend:SMS:'+phone).digest('hex')).run();
    const tx=await create('PHONE_OTP'), sent=await step(tx,{step:'REQUEST_CHALLENGE',address:phone});
    await step(tx,{step:'VERIFY_CHALLENGE',challengeHandle:sent.challengeHandle,credential:await code(phone)});await step(tx,{step:'PHONE_LOGIN'});return (await step(tx,{step:'COMPLETE'})).account;
  }
  let owner=await login(ownerPhone);
  for(const permission of ['TENANT_CREATE','TENANT_READ','TENANT_STATUS','CATALOG_WRITE','SUBSCRIPTION_READ','SUBSCRIPTION_WRITE'])
    await db.prepare("INSERT INTO auth_platform_permission(user_id,permission,status,granted_by,granted_at) VALUES (?,?,'ACTIVE',?,?)").bind(owner.user.userId,permission,owner.user.userId,Date.now()).run();
  owner=await api('/session');assert.ok(owner.capabilities.includes('TENANT_CREATE'));
  let saved=null;const current={assertCurrent(){}};
  otherSession=createAccountSessionManager(config,{storage:{read:()=>saved,write:value=>{saved=structuredClone(value);}},fetch:(url,init)=>proxy.fetch(new Request(url,init))});
  otherAuth=createAccountAuthentication(config,otherSession,(url,init)=>proxy.fetch(new Request(url,init)));
  await db.prepare('UPDATE auth_rate_bucket SET expires_at=0 WHERE bucket_hash=?').bind(createHash('sha256').update('v2-delivery-resend:SMS:'+ownerPhone).digest('hex')).run();
  const st=await otherAuth.create({purpose:'LOGIN',method:'PHONE_OTP'},current);
  const sent=await otherAuth.submit(st.handle,{step:'REQUEST_CHALLENGE',address:ownerPhone},current);
  await otherAuth.submit(st.handle,{step:'VERIFY_CHALLENGE',challengeHandle:sent.challengeHandle,credential:await code(ownerPhone)},current);
  await otherAuth.submit(st.handle,{step:'PHONE_LOGIN'},current);await otherAuth.submit(st.handle,{step:'COMPLETE'},current);
  const central=async(id,body,params)=>(await otherSession.invoke(id,{...(body?{body,idempotencyKey:crypto.randomUUID()}:{}),params},current)).data;
  const beta=await api('/platform/tenants',{name:'Work Beta',ownerUserId:owner.user.userId,reason:'WUA-19 fixture'});
  await api('/tenants?unknown=1',undefined,400);await api('/tenants?limit=1&limit=2',undefined,400);
  await api('/platform/tenants',{name:'Forged',ownerUserId:owner.user.userId,reason:'test',actorId:'foreign'},400);
  browser=await ChromeHarness.start(join(home,'chrome'));assert.ok(browser);page=await browser.page();await page.command('Page.enable');await page.viewport(1440,900);
  const ready=()=>page.wait("!document.querySelector('.account-form')?.hasAttribute('aria-busy')");
  const click=async text=>{await page.command('Page.bringToFront');await ready();await page.evaluate(`{const b=[...document.querySelectorAll('.account-dialog button')].find(b=>b.textContent===${JSON.stringify(text)});if(!b||b.disabled)throw Error('Unavailable '+${JSON.stringify(text)});document.querySelectorAll('[data-test-click]').forEach(b=>b.removeAttribute('data-test-click'));b.dataset.testClick='';}`);await page.click('[data-test-click]');};
  const confirmed=async text=>{const opened=browser.event('Page.javascriptDialogOpening');const clicked=click(text);await opened;await page.command('Page.handleJavaScriptDialog',{accept:true});await clicked;};
  const open=async()=>{await Promise.all([browser.event('Page.domContentEventFired'),page.command('Page.navigate',{url:origin})]);await page.wait("document.readyState==='complete'");
  // T01-ACCOUNT-READY-01: wait for the initial client paint before selecting its exit button.
  await page.wait("!document.querySelector('#cx-app') || document.querySelector('#cx-app').getAttribute('aria-busy')==='false'");if(await page.evaluate("Boolean(document.querySelector('#cx-exit'))")){await Promise.all([browser.event('Page.domContentEventFired'),page.click('#cx-exit')]);await page.wait("!document.querySelector('#cx-exit')");}await page.click('[data-account-link]');await page.wait("document.querySelector('.account-form')?.textContent.includes('个人与租户')");await click('个人与租户');await page.wait("Boolean(document.querySelector('select[name=accountScope]'))");await ready();};
  const select=async id=>{await ready();await page.evaluate(`{const s=document.querySelector('select[name=accountScope]');s.value=${JSON.stringify(id)};s.dispatchEvent(new Event('change',{bubbles:true}));}`);await page.wait("!document.querySelector('select[name=accountScope]')");await ready();};
  await open();await click('平台租户管理');await page.wait("document.querySelector('.account-form').textContent.includes('创建并分配租户')");await click('创建并分配租户');
  await page.fill('input[name=tenantName]','Work Alpha');await page.fill('input[name=ownerUserId]',owner.user.userId);await page.fill('input[name=reason]','WUA-22 isolated UI fixture');await click('确认创建');await page.wait("document.querySelector('.account-message').textContent.includes('租户已创建')");
  const all=await api('/tenants?limit=1');assert.equal(all.items.length,1);assert.ok(all.nextCursor);assert.equal((await api('/tenants?limit=1&cursor='+encodeURIComponent(all.nextCursor))).items.length,1);
  let alpha=(await api('/tenants')).items.find(t=>t.name==='Work Alpha'), root='/tenants/'+alpha.tenantId;
  await click('返回空间选择');await page.wait("Boolean(document.querySelector('select[name=accountScope]'))");await select(alpha.tenantId);
  await click('修改租户资料');await page.fill('input[name=tenantName]','Work Alpha renamed');await click('保存租户资料');await page.wait("document.querySelector('.account-message').textContent.includes('租户资料已保存')");
  await api(root,{name:'Stale',expectedVersion:alpha.version},409,'PATCH');
  await select(alpha.tenantId);await click('邀请成员');await page.evaluate("{const s=document.querySelector('select[name=inviteKind]');s.value='PHONE';s.dispatchEvent(new Event('change',{bubbles:true}));}");await page.fill('input[name=inviteTarget]',memberPhone);await click('发送邀请');await page.wait("document.querySelector('.account-message').textContent.includes('邀请已创建')");
  assert.equal((await api(root+'/members')).items.length,1);
  // Switching from phone to account ID must clear the phone pattern and allow a valid invitation.
  await select(alpha.tenantId);await click('邀请成员');await page.evaluate("{const s=document.querySelector('select[name=inviteKind]');s.value='PHONE';s.dispatchEvent(new Event('change',{bubbles:true}));s.value='USER';s.dispatchEvent(new Event('change',{bubbles:true}));}");
  assert.equal(await page.evaluate("document.querySelector('input[name=inviteTarget]').hasAttribute('pattern')"),false);
  await page.fill('input[name=inviteTarget]',owner.user.userId);assert.ok(await page.evaluate("document.querySelector('input[name=inviteTarget]').checkValidity()"));await click('取消');await click('返回空间选择');

  await logout();const member=await login(memberPhone);await open();assert.ok(!(await page.evaluate("document.querySelector('.account-form').textContent.includes('平台租户管理')")));
  await api('/platform/tenants',undefined,403);await api('/platform/tenants',{name:'No',ownerUserId:member.user.userId,reason:'No'},403);
  await click('确认加入');await page.wait("document.querySelector('.account-message').textContent.includes('已加入租户')");await select(alpha.tenantId);
  assert.ok(!(await page.evaluate("document.querySelector('.account-form').textContent.includes('邀请成员')")));await api(root+'/invitations',{target:{kind:'USER',value:owner.user.userId}},403);
  await logout();await login(ownerPhone);await open();await select(alpha.tenantId);await click('设为管理员');await page.wait("document.querySelector('.account-message').textContent.includes('成员角色已更新')");
  let members=(await api(root+'/members')).items, ownerMember=members.find(m=>m.userId===owner.user.userId), memberMembership=members.find(m=>m.userId===member.user.userId);
  assert.equal(memberMembership.role,'ADMIN');await api(root+'/leave',{expectedVersion:ownerMember.version},409);
  // Paid state is created through central operations, not direct table inserts.
  await central('createFeature',{featureId:'work06.paid',product:'WORK',name:'Work paid fixture',reason:'WUA-21'});
  await central('publishPlanVersion',{planVersion:1,name:'Work fixture',personalFeatureIds:[],seatTypes:[{seatTypeId:'work06-seat',name:'Work seat',featureIds:['work06.paid']}],reason:'WUA-21'},{planId:'work06-plan'});
  const sub=await central('createSubscription',{owner:{kind:'TENANT',id:alpha.tenantId},planId:'work06-plan',planVersion:1,startsAt:new Date(Date.now()-86400000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),seatQuantities:{'work06-seat':1},reason:'WUA-21'});
  const pool=(await central('listSeatPools',undefined,{tenantId:alpha.tenantId})).items[0];
  const assigned=(await central('assignSeat',{subscriptionId:sub.subscriptionId,seatTypeId:'work06-seat',membershipId:ownerMember.membershipId,expectedVersion:pool.version},{tenantId:alpha.tenantId})).assignment;
  await select(alpha.tenantId);await click('所有权交接');await page.evaluate(`document.querySelector('select[name=nextOwner]').value=${JSON.stringify(memberMembership.membershipId)}`);await confirmed('发起交接');await page.wait("document.querySelector('.account-message').textContent.includes('交接已发起')");
  await logout();await login(memberPhone);await open();await confirmed('确认接收所有权');await page.wait("document.querySelector('.account-message').textContent.includes('已完成所有权交接')");
  assert.equal((await central('getTenant',undefined,{tenantId:alpha.tenantId})).myRole,'MEMBER');assert.equal((await central('listSeatAssignments',undefined,{tenantId:alpha.tenantId})).items[0].assignmentId,assigned.assignmentId);
  await select(alpha.tenantId);
  const evidence=resolve('.impeccable/qa/review/account');await mkdir(evidence,{recursive:true});
  for(const width of [1440,1024,390])for(const theme of ['light','dark']){await page.viewport(width,900);await page.evaluate(`document.documentElement.dataset.theme=document.documentElement.dataset.resolvedTheme=${JSON.stringify(theme)}`);await page.screenshot(join(evidence,`tenant-${width}-${theme}.png`));assert.ok(await page.evaluate('document.querySelector(".account-dialog").getBoundingClientRect().right<=innerWidth'));}
  // Removal must atomically release the retained seat; old membership cannot regain it.
  ownerMember=(await api(root+'/members')).items.find(m=>m.userId===owner.user.userId);await api(root+'/members/'+ownerMember.membershipId+'/remove',{expectedVersion:ownerMember.version});
  assert.equal((await api(root+'/seat-assignments')).items.length,0); // WORK-07 exposes current assignments through the same action gateway.
  const row=await db.prepare('SELECT status,end_reason FROM billing_seat_assignment WHERE id=?').bind(assigned.assignmentId).first();assert.equal(row.status,'ENDED');assert.equal(row.end_reason,'MEMBER_REMOVED');
  await logout();await login(ownerPhone);await open();await click('平台租户管理');await page.wait("document.querySelector('.account-form').textContent.includes('Work Alpha renamed')");
  // Select exact tenant row, preserving separate Beta status.
  await page.evaluate("{const row=[...document.querySelectorAll('.account-method')].find(r=>r.textContent.includes('Work Alpha renamed'));row.querySelector('button').click();}");await page.wait("Boolean(document.querySelector('input[name=reason]'))");await page.fill('input[name=reason]','WUA-22 disabled');await click('确认操作');await page.wait("document.querySelector('.account-message').textContent.includes('租户状态已更新')");
  assert.equal((await api('/platform/tenants/'+alpha.tenantId)).status,'DISABLED');assert.equal((await api('/platform/tenants/'+beta.tenantId)).status,'ACTIVE');
  await logout();await login(memberPhone);await api(root+'/members',undefined,403);await open();await select(alpha.tenantId);await page.wait("document.querySelector('.account-form').textContent.includes('租户已停用')");await click('返回空间选择');assert.equal((await api('/session')).state,'AUTHENTICATED');
  await logout();await login(ownerPhone);await open();await click('平台租户管理');await page.wait("document.querySelector('.account-form').textContent.includes('Work Alpha renamed')");

  await page.evaluate("{const row=[...document.querySelectorAll('.account-method')].find(r=>r.textContent.includes('Work Alpha renamed'));row.querySelector('button').click();}");await page.wait("Boolean(document.querySelector('input[name=reason]'))");await page.fill('input[name=reason]','WUA-22 restored');await click('确认操作');await page.wait("document.querySelector('.account-message').textContent.includes('租户状态已更新')");
  assert.equal((await api('/platform/tenants/'+alpha.tenantId)).status,'ACTIVE');assert.equal((await api('/session')).user.userId,owner.user.userId);
  process.stdout.write('PASS WORK-06 WUA-19/20/21/22: actual Host actions/Auth/Chrome, platform create/assign/status, tenant pagination/switch/edit, phone invite and confirmation, role denial, two-party ownership handoff, retained seat then atomic removal release, responsive light/dark, local Home preserved\n');
} catch(error){if(page){process.stderr.write(JSON.stringify(await page.evaluate('({text:document.querySelector(".account-dialog")?.innerText})').catch(()=>null))+'\n');await page.screenshot('/private/tmp/work06-browser-failure.png').catch(()=>{});}throw error;} finally {await browser?.close();otherAuth?.close();await otherSession?.close();if(server)await stop(server);await host?.close();await stop(authServer);await proxy?.dispose();await rm(home,{recursive:true,force:true});}
