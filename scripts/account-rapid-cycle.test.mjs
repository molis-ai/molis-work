// V2U-04/06/07: actual installation Host + actual Auth/D1 + Chrome. Only delivery is an explicit mock.
import assert from 'node:assert/strict';
import {channel} from 'node:diagnostics_channel';
const pageEvents=[];channel('molis-work.account-pages').subscribe(event=>pageEvents.push({event:event.event,reason:event.reason}));
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createDesktopWebHost} from '@molis-ai/molis-work-app-desktop';
import {NATIVE_SESSION_FILE,NATIVE_SESSION_HEADER} from '@molis-ai/molis-work-app-local-host';
import {ChromeHarness} from '@molis-ai/molis-work-test-kit/browser';
const source=process.env.MOLIS_AUTH_SOURCE;assert.ok(source&&isAbsolute(source));
const {getRustProxy,initializeLocalRuntime}=await import(pathToFileURL(resolve(source,'worker/scripts/local-runtime.mjs')).href);
const home=mkdtempSync(join(tmpdir(),'v2-rapid-cycle-')),rootToken=randomBytes(32).toString('hex'),evidence=resolve('.impeccable/qa/review/account-rapid-cycle-v2');mkdirSync(evidence,{recursive:true});
process.env.MOLIS_WORK_SECRET_BACKEND='file';
let proxy,server,browser,page,origin,authOrigin,externalServer,cookie='',control=rootToken;
const authServer=http.createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const r=await proxy.fetch(new Request(authOrigin+req.url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})}));res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));}catch{res.writeHead(500).end();}});
const listen=async(s,port=0)=>{await new Promise(r=>s.listen(port,'127.0.0.1',r));return 'http://127.0.0.1:'+s.address().port;};
const close=async s=>{s.closeAllConnections();await new Promise((resolve,reject)=>s.close(e=>e?reject(e):resolve()));};
// Keep the test driver independent from a retired Home's reusable HTTP connection; Chrome exercises its own transport.
async function request(path,body,expected=200,headers={}){const r=await fetch(origin+path,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{Connection:'close',Cookie:cookie,Origin:origin,'content-type':'application/json','x-molis-work-control-token':control,'x-molis-work-idempotency-key':crypto.randomUUID(),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});const set=r.headers.get('set-cookie');if(set?.startsWith('molis-work-session='))cookie=set.split(';')[0];assert.equal(r.status,expected,await r.clone().text());return r;}
async function json(path,body,expected,headers){return (await request(path,body,expected,headers)).json();}
async function readControl(){const {current}=await json('/api/spaces',undefined,200,{'x-molis-work-control-token':rootToken});control=readFileSync(join(home,'spaces',current.spaceId,'config/web-control-token'),'utf8').trim();}
async function browserCookie(){const result=await page.command('Network.getCookies',{urls:[origin]});cookie=result.cookies.filter(c=>c.name==='molis-work-session').map(c=>c.name+'='+c.value).join('; ');assert.ok(cookie);}

const rounds=Number(process.env.MOLIS_ACCOUNT_RAPID_ROUNDS||10);
assert.ok(Number.isInteger(rounds)&&rounds>=1&&rounds<=100);
let stage='setup',completed=0,activePopup;const streams=new Set();
const users=new Map(),projects=new Map(),retired=[];
async function until(check,label){const deadline=Date.now()+15000;while(!await check()){assert.ok(Date.now()<deadline,label);await new Promise(resolve=>setTimeout(resolve,25));}}
function navigation(target,matches){const pending=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(Error('Navigation timeout: '+stage));},15000);const off=browser.on('Page.frameNavigated',(params,session)=>{if(session===target.sessionId&&!params.frame.parentId&&matches(new URL(params.frame.url))){clearTimeout(timer);off();resolve();}});});void pending.catch(()=>{});return pending;}
async function ready(){await page.command('Page.bringToFront');await page.wait("document.readyState==='complete' && !document.body.inert && !document.body.hasAttribute('data-account-registering') && Boolean(document.querySelector('[data-account-link]')) && document.querySelector('[data-personal-action=logout]')?.hidden===false");}
async function form(target,phone){
 // Isolated Auth fixture: keep this lifecycle stress separate from OTP rate-limit coverage.
 await proxy.env.DB.prepare('UPDATE auth_rate_bucket SET expires_at=0').run();
 await target.command('Page.bringToFront');await target.wait("document.visibilityState==='visible'");await target.wait("Boolean(document.querySelector('.account-dialog input[name=address]')) && !document.querySelector('.account-form').hasAttribute('aria-busy')");
 await target.evaluate("{const b=[...document.querySelectorAll('.account-modes button')].find(b=>b.textContent==='手机验证码');b.dataset.rapidPhone='';}");await target.click('[data-rapid-phone]');await target.fill('input[name=address]',phone.slice(3));await target.click('.account-form button[type=submit]');await target.wait("Boolean(document.querySelector('input[name=code]'))");
 const sent=await proxy.env.DB.prepare('SELECT credential FROM auth_mock_delivery WHERE destination=? ORDER BY created_at DESC LIMIT 1').bind(phone).first();assert.ok(sent);await target.fill('input[name=code]',sent.credential);await target.click('.account-form button[type=submit]');
}
async function verified(phone){
 await browserCookie();await readControl();let state=await json('/api/personal/status');assert.ok(state.identity);assert.equal(state.ready,true);assert.equal(state.preparation,null);assert.equal(state.loginPending,false);
 const view=(await json('/api/account/session')).data;assert.equal(view.state,'AUTHENTICATED');assert.equal(view.user.userId,state.identity.userId);
 if(users.has(phone))assert.equal(state.identity.userId,users.get(phone));else users.set(phone,state.identity.userId);
 if(await page.evaluate("location.pathname==='/onboarding'")){await json('/api/onboarding/dismiss',{kind:'first_run',user_confirmed:true});const arrived=navigation(page,url=>url.origin===origin);await page.command('Page.navigate',{url:origin});await arrived;}
 await ready();
 if(!projects.has(phone)){const created=(await json('/api/settings/projects',{display_name:'rapid-'+users.size,user_confirmed:true},201)).project;projects.set(phone,created.project_id);}
 const visible=(await json('/api/settings/projects')).projects.map(p=>p.project_id);assert.ok(visible.includes(projects.get(phone)));for(const [other,id]of projects)if(other!==phone)assert.ok(!visible.includes(id),'another account project leaked');
 for(const stale of retired.slice(-2)){const old=await fetch(origin+'/api/personal/status',{headers:{Cookie:stale.cookie}});assert.equal((await old.json()).identity,null);const denied=await fetch(origin+'/api/settings/projects',{headers:{Cookie:cookie,'x-molis-work-control-token':stale.token}});assert.equal(denied.status,409);}
}
async function signIn(phone){stage='sign in '+(completed+1);if(!await page.evaluate("Boolean(document.querySelector('.account-dialog input[name=address]'))")){const arrived=navigation(page,url=>url.searchParams.get('accountEntry')==='1');await page.command('Page.navigate',{url:origin});await arrived;}
 const landed=navigation(page,url=>url.origin===origin&&!url.searchParams.has('accountLogin'));await form(page,phone);await landed;await page.wait("document.readyState==='complete' && !document.body.hasAttribute('data-account-entry')");await verified(phone);}
async function menu(){await ready();if(await page.evaluate("document.querySelector('#mw-account-menu').hidden"))await page.click('[data-account-link]');await page.wait("!document.querySelector('#mw-account-menu').hidden");}
async function switchAccount(phone){stage='switch '+(completed+1);retired.push({cookie,token:control});await page.evaluate("(()=>{const old=fetch;let hold=true;window.fetch=async(...args)=>{const r=await old(...args);if(hold && new URL(args[0],location.href).pathname==='/api/personal/status'){hold=false;window.heldStatus=true;await new Promise(resolve=>window.releaseHeldStatus=resolve);}return r;};})()");await menu();await page.wait('window.heldStatus===true');const targets=new Set((await browser.command('Target.getTargets')).targetInfos.map(t=>t.targetId));await page.click('[data-personal-action=switch]');let target;
 await until(async()=>{target=(await browser.command('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&!targets.has(t.targetId)&&t.url.includes('accountLogin='));return !!target;},'switch popup did not open');await page.evaluate('window.releaseHeldStatus()');const popup=await browser.page(target.targetId);activePopup=popup;await popup.command('Page.enable');await popup.viewport(1440,900);await popup.evaluate("(()=>{const old=fetch;window.fetch=async(...args)=>{const r=await old(...args);if(!r.ok)window.qaFailure={status:r.status,body:await r.clone().json().catch(()=>null)};return r;};})()");if(completed===0){await page.evaluate("{const c=new BroadcastChannel('molis-work-account');c.postMessage({login:'not-this-attempt'});c.close();}");assert.ok((await browser.command('Target.getTargets')).targetInfos.some(t=>t.targetId===target.targetId),'unrelated completion must not close the login popup');}
 const landed=navigation(page,url=>url.origin===origin&&!url.searchParams.has('accountLogin'));await form(popup,phone);await landed;await page.wait("document.readyState==='complete' && !document.body.hasAttribute('data-account-entry')");await verified(phone);
 await until(async()=>!(await browser.command('Target.getTargets')).targetInfos.some(t=>t.targetId===target.targetId),'completed switch popup did not close');}
async function signOut(){stage='logout '+(completed+1);retired.push({cookie,token:control});await menu();const arrived=navigation(page,url=>url.searchParams.get('accountEntry')==='1');await page.click('[data-personal-action=logout]');await arrived;await page.wait("Boolean(document.querySelector('.account-dialog input[name=address]')) && !document.querySelector('.account-form').hasAttribute('aria-busy')");await browserCookie();control=rootToken;const state=await json('/api/personal/status');assert.equal(state.identity,null);assert.equal(state.preparation,null);assert.equal(streams.size,0,'logout must close all previous account event streams');const denied=await fetch(origin+'/api/settings/projects',{headers:{Cookie:cookie,'x-molis-work-control-token':rootToken}});assert.equal(denied.status,401);}
try{
 authOrigin=await listen(authServer);const reserve=http.createServer();origin=await listen(reserve);await close(reserve);
 proxy=await getRustProxy({AUTH_ORIGIN:authOrigin,UNIFIED_ACCOUNT_CONFIG:JSON.stringify({environmentId:'unified-local',kind:'LOCAL',authOrigin,providerMode:'MOCK',deliveryMode:'MOCK'})});await initializeLocalRuntime(proxy,false);
 for(const sql of readFileSync(resolve(source,'worker/unified-account-local-seed.sql'),'utf8').replaceAll('http://127.0.0.1:8787',authOrigin).replaceAll('http://127.0.0.1:4207',origin).replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean))await proxy.env.DB.prepare(sql).run();
 process.env.MOLIS_WORK_ACCOUNT_CONFIG=JSON.stringify({environmentId:'unified-local',environmentKind:'LOCAL',authOrigin,productOrigin:origin,applicationId:'molis-work-unified-local-app',clientId:'molis-work-unified-local',policyProfile:'unified-account-v2',redirectAllowlist:[origin+'/account/callback'],providerMode:'MOCK',deliveryMode:'MOCK'});
 const boot=()=>createDesktopWebHost({ptyClientFilePath:()=>resolve('dist/web/pty-client.js')})({homeDirectory:home,controlToken:rootToken});server=boot();server.prependListener('request',(req,res)=>{if(req.url?.startsWith('/api/personal/events')){streams.add(res);res.once('close',()=>streams.delete(res));}});await listen(server,Number(new URL(origin).port));
 browser=await ChromeHarness.start(join(home,'chrome'));assert.ok(browser);page=await browser.page();await page.command('Page.enable');await page.command('Network.enable');await page.command('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const original=fetch;window.fetch=async(...args)=>{if(String(args[0]).includes('action=cancel')||String(args[0]).includes('login-cancel'))(window.rapidCancels??=[]).push(new Error('cancel request').stack);const r=await original(...args);if(!r.ok)window.qaFailure={path:new URL(args[0],location.href).pathname,status:r.status,step:args[1]?.body?JSON.parse(args[1].body).step:undefined,body:await r.clone().json().catch(()=>null)};return r;};})()`});await page.viewport(1440,900);

 // WAS-11: a real cross-site hyperlink must reach the same login form without a 403 or exposing credentials on the first navigation.
 externalServer=http.createServer((_req,res)=>res.end('<!doctype html><a id="work" href="'+origin+'/">Open Work</a>'));
 const externalOrigin=(await listen(externalServer)).replace('127.0.0.1','localhost');
 let externalEntry=false;
 server.prependListener('request',(req,res)=>{if(req.url==='/'&&req.headers['sec-fetch-site']==='cross-site'){externalEntry=true;res.once('finish',()=>assert.equal(res.getHeader('set-cookie'),undefined));}});
 await page.command('Page.navigate',{url:externalOrigin});await page.wait("Boolean(document.querySelector('#work'))");const entered=navigation(page,url=>url.origin===origin&&url.searchParams.get('accountEntry')==='1');await page.click('#work');await entered;
 await page.wait("Boolean(document.querySelector('.account-dialog input[name=address]'))");assert.ok(externalEntry,'the browser actually sent a cross-site document navigation');assert.equal(await page.evaluate('window.qaFailure??null'),null);
 const phones=['+8613800000711','+8613800000712'];
 for(let round=0;round<rounds;round++){
   const started=Date.now();await signIn(phones[round%2]);await switchAccount(phones[(round+1)%2]);await signOut();completed++;
   process.stdout.write(JSON.stringify({round:completed,actions:completed*3,elapsedMs:Date.now()-started,result:'PASS'})+'\n');
 }

 const interruptions=Number(process.env.MOLIS_ACCOUNT_RAPID_INTERRUPTS||5);assert.ok(Number.isInteger(interruptions)&&interruptions>=0&&interruptions<=100);
 for(let i=0;i<interruptions;i++){
   await signIn(phones[i%2]);await menu();const before=new Set((await browser.command('Target.getTargets')).targetInfos.map(t=>t.targetId));await page.click('[data-personal-action=switch]');let pending;
   await until(async()=>{pending=(await browser.command('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&!before.has(t.targetId)&&t.url.includes('accountLogin='));return !!pending;},'interrupted switch must start');
   stage='logout during pending switch '+(i+1);await signOut();
   assert.ok(!(await browser.command('Target.getTargets')).targetInfos.some(t=>t.targetId===pending.targetId),'logout must close its pending switch window');
   process.stdout.write(JSON.stringify({interruption:i+1,result:'PASS'})+'\n');
 }
 assert.equal(new Set(users.values()).size,2);assert.equal(pageEvents.filter(e=>e.event==='cancelled').length,interruptions,'only explicitly interrupted switches may cancel preparation');
 process.stdout.write(JSON.stringify({result:'PASS',rounds:completed,interruptions,actions:(completed+interruptions)*3,checks:['real UI login/switch/logout','two-account project isolation','stale cookies and tokens refused','no stuck preparation','popup closed']})+'\n');
}catch(error){if(activePopup){process.stderr.write(String(await activePopup.evaluate('document.body.innerText').catch(()=>''))+'\n');process.stderr.write(JSON.stringify(await activePopup.evaluate('window.qaFailure').catch(()=>null))+'\n');}process.stderr.write(JSON.stringify({stage,completed,pageEvents})+'\n');if(page){process.stderr.write(JSON.stringify(await page.evaluate('window.rapidCancels').catch(()=>null))+'\n');process.stderr.write(String(await page.evaluate('document.body.innerText').catch(()=>''))+'\n');process.stderr.write(JSON.stringify(await page.evaluate('window.qaFailure').catch(()=>null))+'\n');await page.screenshot(join(evidence,'failure.png')).catch(()=>undefined);}throw error;}
finally{await browser?.close();if(externalServer)await close(externalServer);if(server)await close(server);await close(authServer);await proxy?.dispose();rmSync(home,{recursive:true,force:true});}
