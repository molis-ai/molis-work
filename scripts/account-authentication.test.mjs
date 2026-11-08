// WUA-10/11/12: real Host HTTP + real Auth WASM/D1. Only delivery/providers are mocked.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import net from 'node:net';
import { createMolisWorkLocalHost } from '@molis-ai/molis-work-app-local-host';
import { createDesktopWebCore } from '@molis-ai/molis-work-app-desktop';
import { ChromeHarness } from '@molis-ai/molis-work-test-kit/browser';
const source=process.env.MOLIS_AUTH_SOURCE;assert.ok(source&&isAbsolute(source));
const {getRustProxy,initializeLocalRuntime}=await import(pathToFileURL(resolve(source,'worker/scripts/local-runtime.mjs')).href);
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const origin=`http://127.0.0.1:${port}`, authOrigin='http://127.0.0.1:8787';
const proxy=await getRustProxy({AUTH_ORIGIN:authOrigin,UNIFIED_ACCOUNT_CONFIG:JSON.stringify({environmentId:'unified-local',kind:'LOCAL',authOrigin,deliveryMode:'MOCK',providerMode:'MOCK'})});
const home=await mkdtemp(join(tmpdir(),'work03-auth-')),control=randomBytes(32).toString('hex');
process.env.MOLIS_WORK_SECRET_BACKEND='file';process.env.MOLIS_WORK_ENCRYPTION_KEY='';
let host,server,browser,exchangeGate;
const config={environmentId:'unified-local',environmentKind:'LOCAL',authOrigin,productOrigin:origin,clientId:'molis-work-unified-local',applicationId:'molis-work-unified-local-app',policyProfile:'unified-account-v2',redirectAllowlist:[origin+'/account/callback'],providerMode:'MOCK',deliveryMode:'MOCK'};
const allSecrets=[];
async function api(path,body,status=200,headers={}) {
  const response=await fetch(origin+'/api/account'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'x-molis-work-control-token':control,...(body===undefined?{}:{'content-type':'application/json','x-molis-work-idempotency-key':crypto.randomUUID()}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const text=await response.text();assert.equal(response.status,status,text);
  for(const secret of allSecrets)assert.ok(!text.includes(secret),'No credential in product response');
  return JSON.parse(text).data;
}
const create=(purpose,method)=>api('/auth/transactions',{purpose,method});
const step=(tx,body,status=200)=>api('/auth/transactions/'+tx.handle+'/submit',body,status);
const code=async target=>(await proxy.env.DB.prepare('SELECT m.credential FROM auth_mock_delivery m JOIN auth_verification_challenge c ON c.delivery_id=m.delivery_id WHERE c.canonical_target=? ORDER BY c.created_at DESC LIMIT 1').bind(target).first()).credential;
const end=()=>api('/logout',{scope:'CURRENT_LOGIN'},200,{'Idempotency-Key':crypto.randomUUID()});
async function verify(tx,target) {const sent=await step(tx,{step:'REQUEST_CHALLENGE',address:target});const credential=await code(target);allSecrets.push(credential);await step(tx,{step:'VERIFY_CHALLENGE',challengeHandle:sent.challengeHandle,credential:'000000'},403);return step(tx,{step:'VERIFY_CHALLENGE',challengeHandle:sent.challengeHandle,credential});}
try {
 await initializeLocalRuntime(proxy);
 for(const sql of readFileSync(resolve(source,'worker/unified-account-local-seed.sql'),'utf8').replaceAll('http://127.0.0.1:4207',origin).replace(/--[^\n]*/g,'').split(';').map(v=>v.trim()).filter(Boolean))await proxy.env.DB.prepare(sql).run();
 host=createMolisWorkLocalHost({homeDirectory:home,completeText:null});server=createDesktopWebCore({ptyClientFilePath:()=>join(home,'unused.js')})({homeDirectory:home,localHost:host,controlToken:control,account:{environment:config,fetch:async(url,init)=>{const req=new Request(url,init);const response=await proxy.fetch(req);if(exchangeGate&&new URL(req.url).pathname==='/api/v2/auth/token'){const gate=exchangeGate;exchangeGate=undefined;gate.enter();await gate.wait;}return response;}}});await new Promise(r=>server.listen(port,'127.0.0.1',r));
 const email='work03@example.test',password=randomBytes(20).toString('base64url');allSecrets.push(password);
 let tx=await create('EMAIL_SIGNUP','EMAIL_CODE');let verified=await verify(tx,email);assert.equal(verified.nextStep,'EMAIL_SIGNUP');
 await step(tx,{step:'EMAIL_SIGNUP',email,password});let result=await step(tx,{step:'COMPLETE'});assert.equal(result.account.state,'AUTHENTICATED');const user=result.account.user.userId;await end();
 tx=await create('LOGIN','EMAIL_PASSWORD');await step(tx,{step:'PASSWORD_LOGIN',email,password:'incorrect-pass'},403);await step(tx,{step:'PASSWORD_LOGIN',email,password});assert.equal((await step(tx,{step:'COMPLETE'})).account.user.userId,user);await end();
 tx=await create('LOGIN','PHONE_OTP');await verify(tx,'+8613800000603');await step(tx,{step:'PHONE_LOGIN'});assert.equal((await step(tx,{step:'COMPLETE'})).account.state,'AUTHENTICATED');await end();
 // Advance only this synthetic email's resend cooldown; production limit checks stay enabled.
 await proxy.env.DB.prepare('UPDATE auth_rate_bucket SET expires_at=0 WHERE bucket_hash=?').bind(createHash('sha256').update('v2-delivery-resend:EMAIL:'+email).digest('hex')).run();
 tx=await create('PASSWORD_RESET','EMAIL_CODE');await verify(tx,email);assert.equal((await step(tx,{step:'COMPLETE'})).operationReady,true);const replacement=randomBytes(20).toString('base64url');allSecrets.push(replacement);
 await api('/password/reset',{resetHandle:tx.handle,newPassword:replacement});assert.equal((await api('/session')).state,'ANONYMOUS');
 tx=await create('LOGIN','EMAIL_PASSWORD');await step(tx,{step:'PASSWORD_LOGIN',email,password},403);await step(tx,{step:'PASSWORD_LOGIN',email,password:replacement});await step(tx,{step:'COMPLETE'});await end();
 // WUA-11: cancellation while issued credentials are in flight must revoke, never adopt, the late login.
 tx=await create('LOGIN','EMAIL_PASSWORD');await step(tx,{step:'PASSWORD_LOGIN',email,password:replacement});
 let release,entered;const arrived=new Promise(r=>{entered=r;});exchangeGate={enter:entered,wait:new Promise(r=>{release=r;})};
 const late=step(tx,{step:'COMPLETE'},400);await arrived;await api('/auth/transactions/'+tx.handle+'/cancel',{});release();await late;
 assert.equal((await api('/session')).state,'ANONYMOUS');
 tx=await create('LOGIN','EMAIL_PASSWORD');await api('/auth/transactions/'+tx.handle+'/cancel',{});await step(tx,{step:'PASSWORD_LOGIN',email,password:replacement},409);
 await api('/auth/transactions',{purpose:'LOGIN',method:'EMAIL_PASSWORD',accessToken:'browser-injection'},400);
 const noControl=await fetch(origin+'/api/account/auth/transactions',{method:'POST',headers:{Origin:origin,'content-type':'application/json'},body:JSON.stringify({purpose:'LOGIN',method:'EMAIL_PASSWORD'})});assert.equal(noControl.status,403);
 process.stdout.write('PASS WORK-03 HTTP: email signup/login/reset, phone auto-registration, wrong credentials, cancellation, injection guards\n');
 browser=await ChromeHarness.start(join(home,'chrome'));assert.ok(browser,'Chrome is required for this explicit UI verification');const page=await browser.page();await page.command("Page.enable");const navigate=action=>Promise.all([browser.event("Page.domContentEventFired"),action()]);await navigate(()=>page.command("Page.navigate",{url:origin}));
 await page.viewport(1440,900);await page.wait("document.readyState==='complete'");if(await page.evaluate("Boolean(document.querySelector('#cx-exit'))")){await navigate(()=>page.click('#cx-exit'));await page.wait("!document.querySelector('#cx-exit')");}await page.wait("Boolean(document.querySelector('[data-unified-account-link]'))");await page.viewport(390,900);assert.ok(await page.evaluate(`{const b=document.querySelector('[data-unified-account-link]').getBoundingClientRect(), h=document.querySelector('.arrival-titlebar').getBoundingClientRect();b.top>=h.top&&b.bottom<=h.bottom&&b.right<=innerWidth}`),'K03-01: compact account entry stays within titlebar');await page.screenshot('/private/tmp/work03-before-login.png');await page.click('[data-unified-account-link]');await page.wait("Boolean(document.querySelector('.account-form input[name=address]')) && !document.querySelector('.account-form button[type=submit]').disabled");
 assert.ok(await page.evaluate("document.querySelector('[data-account-link]')?.getAttribute('aria-expanded')==='false' && document.querySelector('#mw-account-menu')?.hidden"),'Unified entry leaves the Personal space menu closed');
 // K03-01 / UAS-08: help is reachable before login and in security, without changing form/session state.
 const help=async()=>{await page.click('.account-dialog .mw-disclosure summary');await page.wait('document.querySelector(".account-dialog .mw-disclosure").open');const text=await page.evaluate('document.querySelector(".account-dialog .mw-disclosure").innerText');for(const part of ['还有可用方式','找回密码','邮箱服务商','手机运营商','Google','GitHub','暂不提供人工账号恢复','不会自动继承'])assert.ok(text.includes(part),part);assert.equal(await page.evaluate('document.querySelectorAll(".account-dialog .mw-disclosure button,.account-dialog .mw-disclosure form").length'),0);};
 await page.fill('.account-form input[name=address]',email);await help();
 const screenshots=resolve('.impeccable/qa/review/account');await mkdir(screenshots,{recursive:true});
 for(const width of [1440,1024,390])for(const theme of ['light','dark']){await page.viewport(width,900);await page.evaluate(`document.documentElement.dataset.theme=document.documentElement.dataset.resolvedTheme=${JSON.stringify(theme)}`);await page.screenshot(join(screenshots,`login-${width}-${theme}.png`));assert.ok(await page.evaluate('document.querySelector(".account-dialog").getBoundingClientRect().right<=innerWidth'));}
 await page.click('.account-dialog .mw-disclosure summary');assert.equal(await page.evaluate('document.querySelector(".account-form input[name=address]").value'),email);assert.equal((await api('/session')).state,'ANONYMOUS');
 await page.fill('.account-form input[name=address]',email);await page.fill('.account-form input[name=password]',replacement);await page.click('.account-form button[type=submit]');await page.wait("document.querySelector('.account-form')?.textContent.includes('退出登录')");
 assert.equal((await api('/session')).user.userId,user);
 assert.ok(await page.evaluate('!localStorage.getItem("accessToken")&&!sessionStorage.getItem("accessToken")'));
 const clickText=async text=>{await page.evaluate(`{const b=[...document.querySelectorAll('.account-dialog button')].find(b=>b.textContent===${JSON.stringify(text)});if(!b)throw Error('Button missing');document.querySelectorAll('[data-test-click]').forEach(e=>e.removeAttribute('data-test-click'));b.dataset.testClick='';}`);await page.click('[data-test-click]');};
 await clickText('个人资料与安全');await page.wait("document.querySelector('.account-form')?.textContent.includes('登录方式与安全')");await clickText('登录方式与安全');await page.wait("document.querySelector('.account-form')?.textContent.includes('绑定手机')");await help();for(const width of [1440,1024,390])for(const theme of ['light','dark']){await page.viewport(width,900);await page.evaluate(`document.documentElement.dataset.theme=document.documentElement.dataset.resolvedTheme=${JSON.stringify(theme)}`);await page.screenshot(join(screenshots,`security-help-${width}-${theme}.png`));assert.ok(await page.evaluate('document.querySelector(".account-dialog").getBoundingClientRect().right<=innerWidth'));}assert.equal((await api('/session')).user.userId,user);await page.click('.account-dialog .mw-disclosure summary');await clickText('返回账号');await page.wait("document.querySelector('.account-form')?.textContent.includes('退出登录')");
 process.stdout.write('PASS K03-01 / UAS-08 Work: lost-method help from login/security, form retained, original account unchanged\n');
 await clickText('退出登录');await page.wait("document.querySelector('.account-message').textContent.includes('已退出')");await clickText('返回登录');await page.wait("Boolean(document.querySelector('.account-form button[type=submit]'))&&!document.querySelector('.account-form button[type=submit]').disabled");await clickText('邮箱注册');
 const uiEmail='work03-ui@example.test';await page.fill('.account-form input[name=address]',uiEmail);await page.click('.account-form button[type=submit]');await page.wait("Boolean(document.querySelector('.account-form input[name=code]'))");
 await page.fill('.account-form input[name=code]',await code(uiEmail));await page.click('.account-form button[type=submit]');await page.wait("Boolean(document.querySelector('.account-form input[name=confirm]'))");
 await page.fill('.account-form input[name=password]',password);await page.fill('.account-form input[name=confirm]',password);await page.click('.account-form button[type=submit]');await page.wait("document.querySelector('.account-form')?.textContent.includes('退出登录')");
 assert.equal((await api('/session')).state,'AUTHENTICATED');assert.notEqual((await api('/session')).user.userId,user);

 process.stdout.write('PASS WORK-03 Chrome: real arrival entry, password login and verified email signup, responsive light/dark screenshots\n');
} finally {await browser?.close();server?.closeAllConnections();if(server)await new Promise(r=>server.close(r));await host?.close();await proxy.dispose();await rm(home,{recursive:true,force:true});}
