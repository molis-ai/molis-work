import { createAccountSessionManager, createAccountAuthentication } from "@molis-ai/molis-work-service-account";

// WUA-23 WUA-24 WUA-25 and S-unified-account-billing: real Host/Auth, mock providers, subscription and seat actions and browser paths.
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
const home = await mkdtemp(join(tmpdir(), 'work07-')), control = randomBytes(32).toString('hex');
process.env.MOLIS_WORK_SECRET_BACKEND = 'file'; process.env.MOLIS_WORK_ENCRYPTION_KEY = '';
let upstreamOffline = false;
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
    headers: { Connection: 'close', Origin: origin, 'x-molis-work-control-token': control, ...(body === undefined ? {} : { 'content-type': 'application/json', 'x-molis-work-idempotency-key': crypto.randomUUID(), ...(path === '/entitlements/check' ? {} : { 'Idempotency-Key': crypto.randomUUID() }) }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
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
      if (upstreamOffline) throw Error("Isolated network outage");
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
  browser=await ChromeHarness.start(join(home,'chrome'));assert.ok(browser);page=await browser.page();await page.command('Page.enable');await page.viewport(1440,900);
  const ready=()=>page.wait("!document.querySelector('.account-form')?.hasAttribute('aria-busy')");
  const click=async text=>{await page.command('Page.bringToFront');await ready();await page.evaluate(`{const b=[...document.querySelectorAll('.account-dialog button')].find(b=>b.textContent===${JSON.stringify(text)});if(!b||b.disabled)throw Error('Unavailable '+${JSON.stringify(text)});document.querySelectorAll('[data-test-click]').forEach(b=>b.removeAttribute('data-test-click'));b.dataset.testClick='';}`);await page.click('[data-test-click]');};
  const confirmed=async text=>{const opened=browser.event('Page.javascriptDialogOpening');const clicked=click(text);await opened;await page.command('Page.handleJavaScriptDialog',{accept:true});await clicked;};
  const open=async()=>{await Promise.all([browser.event('Page.domContentEventFired'),page.command('Page.navigate',{url:origin})]);await page.wait("document.readyState==='complete'");
  // T01-ACCOUNT-READY-01: wait for the initial client paint before selecting its exit button.
  await page.wait("!document.querySelector('#cx-app') || document.querySelector('#cx-app').getAttribute('aria-busy')==='false'");if(await page.evaluate("Boolean(document.querySelector('#cx-exit'))")){await Promise.all([browser.event('Page.domContentEventFired'),page.click('#cx-exit')]);await page.wait("!document.querySelector('#cx-exit')");}await page.click('[data-unified-account-link]');await page.wait("document.querySelector('.account-form')?.textContent.includes('个人与租户')");await click('个人与租户');await page.wait("Boolean(document.querySelector('select[name=accountScope]'))");await ready();};
  const select=async id=>{await ready();await page.evaluate(`{const s=document.querySelector('select[name=accountScope]');s.value=${JSON.stringify(id)};s.dispatchEvent(new Event('change',{bubbles:true}));}`);await page.wait("!document.querySelector('select[name=accountScope]')");await ready();};
  const reason='WUA-23/24/25 isolated fixture';
  await db.prepare("INSERT INTO auth_platform_permission(user_id,permission,status,granted_by,granted_at) VALUES (?,'AUDIT_READ','ACTIVE',?,?)").bind(owner.user.userId,owner.user.userId,Date.now()).run();
  await central('createFeature',{featureId:'work07.paid',product:'WORK',name:'Work paid',reason});
  await central('createFeature',{featureId:'work08.personal',product:'SHARED',name:'Personal shared feature',reason});
  await central('createFeature',{featureId:'work08.seat',product:'WORK',name:'Tenant seat feature',reason});
  await central('publishPlanVersion',{planVersion:1,name:'Work paid plan',personalFeatureIds:['work07.paid','work08.personal'],seatTypes:[{seatTypeId:'work07.standard',name:'Standard seat',featureIds:['work07.paid','work08.seat']}],reason},{planId:'work07.plan'});
  await central('publishPlanVersion',{planVersion:2,name:'Work alternate plan',personalFeatureIds:['work07.paid','work08.personal'],seatTypes:[{seatTypeId:'work07.other',name:'Other seat',featureIds:['work07.paid','work08.seat']}],reason},{planId:'work07.plan'});
  const tenant=await api('/platform/tenants',{name:'Work subscription tenant',ownerUserId:owner.user.userId,reason}),root='/tenants/'+tenant.tenantId;
  await logout();const member=await login(memberPhone);
  const invite=await central('createInvitation',{target:{kind:'USER',value:member.user.userId}},{tenantId:tenant.tenantId});
  await api('/invitations/'+invite.invitationId+'/accept',{expectedVersion:invite.version});
  await logout();await login(ownerPhone);
  const choose=async(name,value)=>{await page.evaluate(`{const s=document.querySelector('select[name="${name}"]');s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}));}`);};
  const done=async text=>{await page.wait('document.querySelector(".account-message").textContent.includes('+JSON.stringify(text)+')');await ready();};
  await open();await click('平台订阅管理');await click('开通订阅');await page.wait('Boolean(document.querySelector("input[name=subscriptionOwner]"))');
  await choose('subscriptionKind','TENANT');await page.fill('input[name=subscriptionOwner]',tenant.tenantId);
  await page.evaluate("{const s=document.querySelector('select[name=subscriptionPlan]');s.value=[...s.options].find(o=>o.textContent.includes('v1')).value;s.dispatchEvent(new Event('change',{bubbles:true}));}");
  await page.fill('input[name="quantity:work07.standard"]','1');await page.fill('input[name=reason]',reason);await confirmed('确认订阅操作');await done('订阅已更新');
  let sub=(await api('/platform/subscriptions')).items[0];assert.equal(sub.owner.id,tenant.tenantId);
  const currentSub=()=>api('/platform/subscriptions/'+sub.subscriptionId);
  const edit=async label=>{await ready();await click(label);await page.wait('Boolean(document.querySelector("input[name=reason]"))');await ready();await page.fill('input[name=reason]',reason);};
  const changeDates=async(name,delta)=>{await page.evaluate(`{const e=document.querySelector('input[name=${name}]');const d=new Date(e.value);d.setDate(d.getDate()+${delta});e.value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);e.dispatchEvent(new Event('input',{bubbles:true}));}`);};
  await edit('续期订阅');await changeDates('subscriptionEnd',30);await confirmed('确认订阅操作');await done('订阅已更新');assert.ok(Date.parse((await currentSub()).endsAt)>Date.parse(sub.endsAt));sub=await currentSub();
  await edit('调整有效期');await changeDates('subscriptionStart',-1);await confirmed('确认订阅操作');await done('订阅已更新');assert.equal((await currentSub()).endsAt,sub.endsAt);sub=await currentSub();
  await edit('停用订阅');await confirmed('确认订阅操作');await done('订阅已更新');assert.equal((await currentSub()).enabled,false);
  await edit('恢复订阅');await confirmed('确认订阅操作');await done('订阅已更新');assert.equal((await currentSub()).endsAt,sub.endsAt);
  await click('返回空间选择');await select(tenant.tenantId);await click('订阅与席位');await ready();
  await click('分配席位');await page.wait('Boolean(document.querySelector("select[name=seatMember]"))');await choose('seatPool','0');
  const members=(await api(root+'/members')).items,ownerMember=members.find(m=>m.userId===owner.user.userId),memberMembership=members.find(m=>m.userId===member.user.userId);
  await choose('seatMember',ownerMember.membershipId);await confirmed('确认席位操作');await done('席位已更新');let assignment=(await api(root+'/seat-assignments')).items[0];assert.equal(assignment.userId,owner.user.userId);
  await click('换绑席位');await page.wait('Boolean(document.querySelector("select[name=seatMember]"))');await choose('seatMember',memberMembership.membershipId);await confirmed('确认席位操作');await done('席位已更新');assert.equal((await api(root+'/seat-assignments')).items[0].userId,member.user.userId);
  await click('查看分配历史');await ready();assert.ok(await page.evaluate('document.querySelector(".account-form").textContent.includes("已换绑")'));await click('查看当前分配');await ready();
  // Capacity and type deletion must reject atomically through the action gateway, including retained assignments.
  await click('返回空间选择');await click('平台订阅管理');await edit('变更套餐与数量');await page.fill('input[name="quantity:work07.standard"]','0');await confirmed('确认订阅操作');await done('席位容量或分配已变化');
  assert.equal((await api('/platform/subscriptions/'+sub.subscriptionId+'/seat-pools')).items[0].quantity,1);
  sub=await currentSub();await api('/platform/subscriptions/'+sub.subscriptionId,{expectedVersion:sub.version,reason,plan:{planId:'work07.plan',planVersion:2},seatQuantities:{'work07.other':1}},409,'PATCH');
  sub=await currentSub();await api('/platform/subscriptions/'+sub.subscriptionId,{expectedVersion:sub.version,reason,startsAt:new Date(Date.now()-172800000).toISOString(),endsAt:new Date(Date.now()-86400000).toISOString()},200,'PATCH');
  sub=await currentSub();await api('/platform/subscriptions/'+sub.subscriptionId,{expectedVersion:sub.version,reason,seatQuantities:{'work07.standard':0}},409,'PATCH');
  const retained=(await api(root+'/seat-assignments')).items[0];await api('/platform/subscriptions/'+sub.subscriptionId+'/renew',{expectedVersion:sub.version,reason,endsAt:new Date(Date.now()+86400000).toISOString()});assert.equal((await api(root+'/seat-assignments')).items[0].assignmentId,retained.assignmentId);
  await click('返回空间选择');await select(tenant.tenantId);await click('订阅与席位');await ready();await confirmed('回收席位');await done('席位已更新');assert.equal((await api(root+'/seat-assignments')).items.length,0);
  await click('返回空间选择');await click('平台订阅管理');await edit('变更套餐与数量');await page.fill('input[name="quantity:work07.standard"]','0');await confirmed('确认订阅操作');await done('订阅已更新');assert.equal((await api('/platform/subscriptions/'+sub.subscriptionId+'/seat-pools')).items[0].quantity,0);
  await edit('变更套餐与数量');await page.evaluate("{const s=document.querySelector('select[name=subscriptionPlan]');s.value=[...s.options].find(o=>o.textContent.includes('v2')).value;s.dispatchEvent(new Event('change',{bubbles:true}));}");await page.fill('input[name="quantity:work07.other"]','2');await confirmed('确认订阅操作');await done('订阅已更新');assert.equal((await currentSub()).planVersion,2);
  const evidence=resolve('.impeccable/qa/review/account');await mkdir(evidence,{recursive:true});
  await edit('变更套餐与数量');for(const width of [1440,1024,390])for(const theme of ['light','dark']){await page.viewport(width,900);await page.evaluate(`document.documentElement.dataset.theme=document.documentElement.dataset.resolvedTheme=${JSON.stringify(theme)}`);await page.screenshot(join(evidence,`subscriptions-${width}-${theme}.png`));assert.ok(await page.evaluate('document.querySelector(".account-dialog").getBoundingClientRect().right<=innerWidth'));}await click('取消');
  await click('订阅与席位操作记录');await ready();assert.ok(await page.evaluate('document.querySelector(".account-form").textContent.includes("subscription.update")'));await click('返回订阅管理');
  // Personal subscription uses the same UI and has no seat quantities.
  await click('开通订阅');await page.wait('Boolean(document.querySelector("input[name=subscriptionOwner]"))');await page.fill('input[name=subscriptionOwner]',owner.user.userId);await choose('subscriptionPlan','0');await page.fill('input[name=reason]',reason);await confirmed('确认订阅操作');await done('订阅已更新');assert.equal((await api('/subscriptions')).items.length,1);
  await click('返回空间选择');await click('个人订阅');await ready();assert.ok(await page.evaluate('document.querySelector(".account-form").textContent.includes("Work paid plan")'));
  // WUA-26 WUA-27 WUA-28: the UI and HTTP/action entry use the same real Auth decision.
  const entitlementScope = {kind:'TENANT',tenantId:tenant.tenantId};
  const featureIds=['work07.paid','work08.personal','work08.seat'];
  const check=scope=>api('/entitlements/check',{scope,featureIds});
  const seatPool=(await api(root+'/seat-pools')).items.find(p=>p.seatTypeId==='work07.other');
  await api(root+'/seat-assignments',{subscriptionId:sub.subscriptionId,seatTypeId:seatPool.seatTypeId,membershipId:ownerMember.membershipId,expectedVersion:seatPool.version});
  const union=await check(entitlementScope);assert.ok(union.decisions.every(d=>d.allowed));
  assert.deepEqual(new Set(union.decisions.find(d=>d.featureId==='work07.paid').sources.map(s=>s.kind)),new Set(['PERSONAL_SUBSCRIPTION','TENANT_SEAT']));
  assert.equal((await check({kind:'PERSONAL'})).decisions.find(d=>d.featureId==='work08.seat').allowed,false);
  await api('/entitlements/check',{scope:{kind:'TENANT',tenantId:'unrelated-tenant'},featureIds},404);
  await api('/entitlements/check',{scope:{kind:'PERSONAL'},featureIds,userId:member.user.userId},400);
  await api('/entitlements/check',{scope:{kind:'PERSONAL'},featureIds:['unknown-feature']},400);
  await click('查看当前权益');await ready();assert.ok(await page.evaluate('document.querySelector(".account-form").textContent.includes("未获得权益")'));
  await click('返回订阅与席位');await click('返回空间选择');await select(tenant.tenantId);await click('订阅与席位');await click('查看当前权益');await ready();
  assert.ok(await page.evaluate('document.querySelector(`[data-entitlement="work07.paid"]`).textContent.includes("当前租户席位")'));
  assert.ok(await page.evaluate('document.querySelector(`[data-entitlement="work07.paid"]`).textContent.includes("个人订阅")'));
  for(const width of [1440,1024,390])for(const theme of ['light','dark']){await page.viewport(width,900);await page.evaluate(`document.documentElement.dataset.theme=document.documentElement.dataset.resolvedTheme=${JSON.stringify(theme)}`);await page.screenshot(join(evidence,`entitlements-${width}-${theme}.png`));assert.ok(await page.evaluate('document.querySelector(".account-dialog").getBoundingClientRect().right<=innerWidth'));}
  upstreamOffline=true;await click('刷新权益');await ready();assert.equal(await page.evaluate('document.querySelectorAll("[data-entitlement]").length'),0);assert.ok(await page.evaluate('document.querySelector(".account-form").textContent.includes("权益暂不可确认")'));upstreamOffline=false;
  const personalSub=(await api('/subscriptions')).items[0];
  await api('/platform/subscriptions/'+personalSub.subscriptionId,{expectedVersion:personalSub.version,reason,endsAt:new Date(Date.now()+4000).toISOString()},200,'PATCH');
  await click('刷新权益');await ready();await page.wait('document.querySelector(`[data-entitlement="work08.personal"]`)?.textContent.includes("未获得权益")',15000);
  assert.ok(await page.evaluate('document.querySelector(`[data-entitlement="work07.paid"]`).textContent.includes("当前租户席位")'));
  const seat=(await api(root+'/seat-assignments')).items.find(a=>a.userId===owner.user.userId);
  await api(root+'/seat-assignments/'+seat.assignmentId+'/release',{expectedVersion:seat.version});
  assert.equal((await check(entitlementScope)).decisions.some(d=>d.allowed),false);
  await click('刷新权益');await ready();assert.equal(await page.evaluate('[...document.querySelectorAll("[data-entitlement]")].some(e=>e.textContent.includes("已获得权益"))'),false);
  // WUA-27: catalog pagination and >100 feature batches have distinct Auth revisions.
  for(let i=0;i<98;i++) await central('createFeature',{featureId:'work08.extra.'+i,product:'WORK',name:'Catalog feature '+i,reason});
  await central('createFeature',{featureId:'work08.club',product:'CLUB',name:'Club-only feature',reason});
  await api('/entitlements/check',{scope:{kind:'PERSONAL'},featureIds:['work08.club']},400);
  await click('刷新权益');await ready();assert.equal(await page.evaluate('document.querySelectorAll("[data-entitlement]").length'),101);
  assert.equal(await page.evaluate('[...document.querySelectorAll("[data-entitlement]")].some(e=>e.dataset.entitlement==="work08.club")'),false);
  process.stdout.write('PASS WORK-08 WUA-26/27/28: central union, scope/identity denial, sources, expiry reread, offline unknown and seat release\n');
  await logout();await login(memberPhone);await open();assert.ok(!(await page.evaluate('document.querySelector(".account-form").textContent.includes("平台订阅管理")')));await api('/platform/subscriptions',undefined,403);await api('/platform/subscriptions/'+sub.subscriptionId+'/seat-pools',undefined,403);await api(root+'/seat-pools',undefined,403);
  await select(tenant.tenantId);await click('订阅与席位');await ready();assert.ok(!(await page.evaluate('document.querySelector(".account-form").textContent.includes("分配席位")')));
  await api(root+'/seat-assignments',{subscriptionId:sub.subscriptionId,seatTypeId:'work07.other',membershipId:memberMembership.membershipId,expectedVersion:1},403);
  process.stdout.write('PASS WORK-07 WUA-23/24/25: real Host/Auth/Chrome subscription create/renew/term/status/plan/capacity, seat assign/reassign/release/history, retained expiry, atomic capacity refusal, personal view and role denial, responsive light/dark\n');
} catch(error){if(page){process.stderr.write(JSON.stringify(await page.evaluate('({text:document.querySelector(".account-dialog")?.innerText})').catch(()=>null))+'\n');await page.screenshot('/private/tmp/work07-browser-failure.png').catch(()=>{});}throw error;} finally {await browser?.close();otherAuth?.close();await otherSession?.close();if(server)await stop(server);await host?.close();await stop(authServer);await proxy?.dispose();await rm(home,{recursive:true,force:true});}
