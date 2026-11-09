import assert from 'node:assert/strict';
import test from 'node:test';
import {basename,join} from 'node:path';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {personalStorageSpace} from '@molis-ai/molis-work-storage';
import {accountRefreshFixture,accountProbeCore} from './fixtures/account-refresh.js';

test('ASR-01/02/03/08 account handoff keeps the public listener and waits for every old resource',async t=>{
 let release!:()=>void,closed!:()=>void;const disposed=new Promise<void>(resolve=>{release=resolve;});const oldClosed=new Promise<void>(resolve=>{closed=resolve;});
 const opened:string[]=[];
 const f=await accountRefreshFixture(t,home=>{
  const name=basename(home);opened.push(name);const core=accountProbeCore(home);
  if(opened.length===1){core.spaceDisposed=disposed;core.once('close',closed);}return core;
 });
 try{
  assert.deepEqual(opened,[],'no anonymous business core opens');assert.match(await(await f.request('/')).text(),/data-account-entry/);
  const alice=personalStorageSpace(f.authOrigin,'work','alice').spaceId,bob=personalStorageSpace(f.authOrigin,'work','bob').spaceId;
  const firstA=await f.login('alice');const firstToken=f.control;assert.equal(firstA.ready,true);assert.deepEqual(opened,[alice]);
  const listener=f.server.address(),oldCookie=f.cookie;
  const state=await f.begin('bob'),pending=f.complete(state);await oldClosed;
  assert.deepEqual(opened,[alice],'B cannot open while A resources are releasing');
  const old=await fetch(f.origin+'/api/personal/status',{headers:{Cookie:oldCookie}});assert.equal((await old.json()).identity,null);
  release();assert.equal((await pending).status,200);assert.equal((await f.status()).ready,true);assert.deepEqual(opened,[alice,bob]);
  assert.deepEqual(f.server.address(),listener,'public listener is not restarted');
  const nextA=await f.login('alice');assert.equal(nextA.ready,true);assert.deepEqual(opened,[alice,bob,alice]);
  assert.notEqual(nextA.viewScope,firstA.viewScope,'ASR-03 old A control credentials cannot revive');
  const currentToken=readFileSync(join(f.home,'spaces',alice,'config','web-control-token'),'utf8').trim();assert.equal(currentToken,f.control);
  const oldRead=await fetch(f.origin+'/api/probe',{headers:{Cookie:f.cookie,'x-molis-work-control-token':firstToken}});assert.equal(oldRead.status,409);
  const gateway=(credential:string)=>fetch(f.origin+'/api/internal/action-service',{method:'POST',headers:{Origin:f.origin,'content-type':'application/json','x-molis-work-home-id':createHash('sha256').update(join(f.home,'spaces',alice)).digest('hex'),'x-molis-work-control-token':credential},body:'{}'});
  assert.equal((await gateway(firstToken)).status,403,'old gateway connection credentials are refused after A returns');
  assert.equal((await gateway(currentToken)).status,200,'an explicit new connection can read the current credential');
  assert.equal((await(await fetch(f.origin+'/api/personal/status',{headers:{Cookie:oldCookie}})).json()).identity,null,'old A cannot revive when A logs in again');
  assert.equal((await f.logout()).status,200);assert.equal((await f.status()).identity,null);
  assert.equal((await f.request('/probe')).status,200,'logged out navigation receives the login shell');
  assert.match(await(await f.request('/probe')).text(),/data-account-entry/);
 }finally{release();await f.close();}
});

test('ASR-05/08 failed old-owner disposal keeps both old authorization and new business closed until explicit retry',async t=>{
 const opened:string[]=[];let closes=0;
 const f=await accountRefreshFixture(t,home=>{
  opened.push(basename(home));const core=accountProbeCore(home);
  if(opened.length===1)Object.defineProperty(core,'spaceDisposed',{get(){closes++;return closes===1?Promise.reject(new Error('synthetic disposal failure')):Promise.resolve();}});
  return core;
 });
 try{
  await f.login('alice');const oldCookie=f.cookie,state=await f.begin('bob');assert.equal((await f.complete(state)).status,503);
  assert.equal(opened.length,1);const failed=await f.status();assert.equal(failed.ready,false);assert.ok(failed.error);
  assert.equal((await(await fetch(f.origin+'/api/personal/status',{headers:{Cookie:oldCookie}})).json()).identity,null);
  assert.equal((await f.request('/api/personal/space?kind=personal','POST')).status,200);assert.equal((await f.status()).ready,true);assert.equal(opened.length,2);
 }finally{await f.close();}
});

test('ASR-02 a new browser can prove current A, cannot replace A with B, and cannot interrupt an active account operation',async t=>{
 const opened:string[]=[];const f=await accountRefreshFixture(t,home=>{opened.push(basename(home));return accountProbeCore(home);});
 let cookie='',seq=0,browserNonce='';
 const browser=async(path:string,post=false,body:unknown={},extra:Record<string,string>={})=>{
  const response=await fetch(f.origin+path,{method:post?'POST':'GET',redirect:'manual',headers:{Cookie:cookie,Origin:f.origin,'content-type':'application/json','x-molis-work-control-token':f.rootToken,'x-molis-work-idempotency-key':'new-browser-'+(++seq),...extra},...(post?{body:JSON.stringify(body)}:{})});
  if(response.status===200&&path==='/api/personal/login')browserNonce=new URL((await response.clone().json()).loginUrl).searchParams.get('accountLogin')!;
  const set=response.headers.get('set-cookie');if(set?.startsWith('molis-work-session='))cookie=set.split(';')[0]!;return response;
 };
 const completeBrowser=async(email:string)=>{
   const headers={'x-molis-account-login':browserNonce};
   const created=await browser('/api/account/auth/transactions',true,{purpose:'LOGIN',method:'EMAIL_PASSWORD'},headers);
   if(created.status!==200)return created;const {data:t}=await created.json();
   const path='/api/account/auth/transactions/'+t.handle+'/submit';
   const verified=await browser(path,true,{step:'PASSWORD_LOGIN',email,password:'synthetic-fixture-password'},headers);
   if(verified.status!==200)return verified;
   return browser(path,true,{step:'COMPLETE'},headers);
 };
 try{
  const a=await f.login('alice'),originalCookie=f.cookie;
  f.setAuthUser('bob');assert.equal((await browser('/api/personal/login',true)).status,200);
  const unproved=await(await browser('/api/personal/status')).json();assert.equal(unproved.identity,null,'a pending browser login has no account authority');assert.equal(unproved.viewToken,undefined,'the pending browser must never receive any Host control credential');assert.notEqual(unproved.viewScope,a.viewScope);
  assert.equal((await browser('/api/personal/logout',true)).status,401,'an unproved browser cannot sign out installation A');
  assert.equal((await f.status()).identity.userId,'alice','refusing the pending browser logout preserves A');
  assert.equal((await completeBrowser('bob@example.test')).status,403,'B cannot replace installed A through an unauthenticated browser');
  assert.equal((await f.status()).identity.userId,'alice');assert.equal((await f.status()).accountGeneration,a.accountGeneration);assert.equal(opened.length,1);
  cookie='';f.setAuthUser('alice');assert.equal((await browser('/api/personal/login',true)).status,200);
  assert.equal((await completeBrowser('alice@example.test')).status,200);
  assert.equal((await(await browser('/api/personal/status')).json()).identity.userId,'alice');
  assert.equal((await f.status()).accountGeneration,a.accountGeneration);assert.equal(f.cookie,originalCookie,'proving A does not rotate an existing page credential');
  const pending=await f.begin('bob');cookie='';assert.equal((await browser('/api/personal/login',true)).status,409,'a new browser cannot replace a prepared login transaction');
  assert.equal((await f.complete(pending)).status,200);assert.equal((await f.status()).identity.userId,'bob');
 }finally{await f.close();}
});


test('ASR-06 active account dispatch retains the synchronous core request-guard fast path',async t=>{
 const order:string[]=[];
 const f=await accountRefreshFixture(t,home=>{const core=accountProbeCore(home);core.on('request',request=>{if(request.url==='/probe')order.push('core');});return core;});
 f.server.on('request',request=>{if(request.url==='/probe')order.push('outer-return');});
 try{
  await f.login('alice');await f.request('/probe');assert.deepEqual(order,['core','outer-return'],'no await precedes cached core body guards');
  await f.logout();order.length=0;assert.match(await(await f.request('/probe')).text(),/data-account-entry/);assert.deepEqual(order,['outer-return'],'revoked account never reaches old core');
 }finally{await f.close();}
});

for(const phase of ['token','identity'] as const)for(const action of ['cancel','leave'] as const)test(`ASR-04/05 ${action} while replacement ${phase} waits keeps A and rejects the late B result`,async t=>{
 const opened:string[]=[];const f=await accountRefreshFixture(t,home=>{opened.push(basename(home));return accountProbeCore(home);});
 let release!:()=>void,reached!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;}),waiting=new Promise<void>(resolve=>{reached=resolve;});
 try{
  const before=await f.login('alice');
  f.authWaits[phase]=async user=>{if(user==='bob'){reached();await gate;}};
  const state=await f.begin('bob'),pending=f.complete(state);await waiting;
  const waitingStatus=await f.status();assert.equal(waitingStatus.loginPending,true,"exchange remains pending after the one-use callback state is consumed");
  const preparation=waitingStatus.preparation;assert.ok(preparation);
  const stopped=await f.request('/api/personal/prepare?action='+action+'&page=account-refresh-page&id='+preparation.id,'POST');assert.equal(stopped.status,200);assert.equal((await (await f.request('/api/personal/status')).json()).loginPending,false,'cancel invalidates the original in-flight attempt before its response arrives');
  release();assert.equal((await pending).status,499,'a late authorization cannot commit after the page barrier is cancelled');
  // Observe the installation without re-registering the document that just left.
  const observed=await f.request('/api/personal/status');assert.equal(observed.status,200);
  const after=await observed.json();assert.equal(after.identity.userId,'alice');assert.equal(after.accountGeneration,before.accountGeneration);assert.equal(after.ready,true);assert.equal(after.preparation,null);assert.equal(after.loginPending,false);assert.equal(opened.length,1);
 }finally{release();await f.close();}
});


test('ASR-04 losing a page event stream retains its draft participant until explicit page departure',async t=>{
 const f=await accountRefreshFixture(t,accountProbeCore),controller=new AbortController();let ended!:()=>void;
 const closed=new Promise<void>(resolve=>{ended=resolve;});
 f.server.on('request',(request,response)=>{if(request.url?.startsWith('/api/personal/events?page=other-page&'))response.once('close',ended);});
 try{
  await f.login('alice');const {pageBinding}=await (await f.request('/api/personal/status?page=other-page')).json();
  const stream=await fetch(f.origin+'/api/personal/events?page=other-page&binding='+encodeURIComponent(pageBinding),{signal:controller.signal,headers:{Cookie:f.cookie,Origin:f.origin,'x-molis-work-control-token':f.control}});assert.equal(stream.status,200);
  const reader=stream.body!.getReader();await reader.read();const readerClosed=reader.closed.catch(()=>{});controller.abort();await readerClosed;await closed;
  const start=await f.request('/api/personal/prepare?action=start&page=account-refresh-page&intent=switch','POST');assert.equal(start.status,200);const {id}=await start.json();
  const ack=await f.request('/api/personal/prepare?action=ack&page=account-refresh-page&id='+id,'POST');assert.equal(ack.status,200);assert.equal((await ack.json()).ready,false,'a disconnected live page still owes its own saved-draft acknowledgement');
  const refused=await f.request('/api/personal/switch?page=account-refresh-page&preparation='+id,'POST');assert.ok(refused.status>=400);assert.equal((await f.status()).identity.userId,'alice');
 }finally{controller.abort();await f.close();}
});


test('ASR-05 cancelling the original popup attempt is owner-bound, idempotent and allows a fresh login',async t=>{
 const f=await accountRefreshFixture(t,accountProbeCore);
 try{
  const start=await f.request('/api/personal/login','POST');assert.equal(start.status,200);const {loginAttempt}=await start.json(),oldState=f.loginState,oldCookie=f.cookie;
  assert.equal((await f.status()).loginPending,true);
  const stolen=await fetch(f.origin+'/api/personal/login-cancel?attempt='+loginAttempt,{method:'POST',headers:{Origin:f.origin,'x-molis-work-control-token':f.rootToken,'x-molis-work-idempotency-key':'unowned-popup-cancel'},body:'{}'});assert.equal(stolen.status,401);
  assert.equal((await f.request('/api/personal/login-cancel?attempt=wrong','POST')).status,409);assert.equal((await f.status()).loginPending,true);
  const cancelled=await f.request('/api/personal/login-cancel?attempt='+loginAttempt,'POST');assert.equal(cancelled.status,200);assert.equal((await f.status()).loginPending,false);
  assert.equal((await f.request('/api/personal/login-cancel?attempt='+loginAttempt,'POST')).status,200,'repeating this page cancellation is harmless');
  assert.equal((await f.complete(oldState)).status,403,'the cancelled callback cannot sign in late');
  const next=await f.request('/api/personal/login','POST');assert.equal(next.status,200);const nextState=f.loginState;
  assert.equal((await fetch(f.origin+'/api/personal/login-cancel?attempt='+loginAttempt,{method:'POST',headers:{Cookie:oldCookie,Origin:f.origin,'x-molis-work-control-token':f.rootToken,'x-molis-work-idempotency-key':'old-popup-cancel-new'},body:'{}'})).status,409);
  assert.equal((await f.complete(nextState)).status,200);assert.equal((await f.status()).identity.userId,'alice');
 }finally{await f.close();}
});

test('ASR-05 an expired unconsumed popup attempt does not permanently block the next login',async t=>{
 const f=await accountRefreshFixture(t,accountProbeCore);let now=Date.now();t.mock.method(Date,'now',()=>now);
 try{
  const first=await f.request('/api/personal/login','POST');assert.equal(first.status,200);const oldState=f.loginState;
  now+=11*60*1000;
  const second=await f.request('/api/personal/login','POST');assert.equal(second.status,200,'the original Auth owner expires the consumed waiting slot');const state=f.loginState;assert.notEqual(state,oldState);
  assert.equal((await f.complete(oldState)).status,403);assert.equal((await f.complete(state)).status,200);assert.equal((await f.status()).identity.userId,'alice');
 }finally{await f.close();}
});


test('ASR-05 cancelling the first token exchange permits a new login before the old exchange settles',async t=>{
 const f=await accountRefreshFixture(t,accountProbeCore);let release!:()=>void,reached!:()=>void,calls=0;
 const gate=new Promise<void>(resolve=>{release=resolve;}),waiting=new Promise<void>(resolve=>{reached=resolve;});
 f.authWaits.token=async()=>{if(++calls===1){reached();await gate;}};
 try{
  const first=await f.request('/api/personal/login','POST');assert.equal(first.status,200);const {loginAttempt}=await first.json(),old=f.complete(f.loginState);await waiting;
  assert.equal((await f.status()).loginPending,true);
  assert.equal((await f.request('/api/personal/login-cancel?attempt='+loginAttempt,'POST')).status,200);
  assert.equal((await f.status()).loginPending,false);
  const next=await f.request('/api/personal/login','POST');assert.equal(next.status,200,'the consumed old callback cannot hold the login slot after cancellation');const state=f.loginState;
  release();assert.equal((await old).status,499,'the old late exchange cannot authenticate or cancel the new attempt');
  assert.equal((await f.status()).loginPending,true,'old failure cleanup must not cancel the replacement pending owner');
  assert.equal((await f.complete(state)).status,200);assert.equal((await f.status()).identity.userId,'alice');
 }finally{release();await f.close();}
});


test('ASR-09 event reconnect refuses missing, forged and departed page bindings without registering a new participant', async t => {
 const f=await accountRefreshFixture(t,accountProbeCore);
 try {
  await f.login('alice');
  for (const Cookie of ['', 'molis-work-session=expired']) {
   const refused=await f.request('/api/personal/events?page=old&binding=old','GET',{Cookie});
   assert.equal(refused.status,200);assert.match(await refused.text(), /"type":"revoked"/u,'expired or absent cookies must stop reconnecting instead of looping on 401');
  }
  const {pageBinding}=await (await f.request('/api/personal/status?page=departing')).json();
  await f.request('/api/personal/prepare?action=leave&page=departing','POST');
  for(const suffix of ['page=unknown','page=account-refresh-page&binding=forged','page=departing&binding='+pageBinding]){
   const response=await f.request('/api/personal/events?'+suffix);
   assert.equal(response.status,200);
   assert.match(await response.text(), /"type":"revoked"/u);
  }
  assert.equal((await f.logout()).status,200,'refused connections do not create phantom participants');
 } finally { await f.close(); }
});


test('WAS-10 installation page survives old Home revocation but its proof never authorizes business or another login',async t=>{
 const f=await accountRefreshFixture(t,home=>accountProbeCore(home));
 try{
  await f.login('alice');const nonce=await f.begin('bob');
  const page=await fetch(f.origin+'/?accountLogin='+nonce,{headers:{Cookie:f.cookie}});
  assert.equal(page.status,200);const html=await page.text();assert.ok(!html.includes(f.rootToken));
  const proof=/<meta name="molis-work-page-session" content="([^"]+)"/.exec(html)?.[1];assert.ok(proof);
  let cookie=[f.cookie,...page.headers.getSetCookie().map(value=>value.split(';')[0])].join('; ');
  const request=(path:string,body?:unknown,headers:Record<string,string>={})=>fetch(f.origin+path,{
   method:body===undefined?'GET':'POST',headers:{Cookie:cookie,Origin:f.origin,'content-type':'application/json',
    'x-molis-work-page-session':proof,'x-molis-account-login':nonce,'x-molis-work-idempotency-key':crypto.randomUUID(),...headers},
   ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const input={purpose:'LOGIN',method:'EMAIL_PASSWORD'};
  for(const headers of [{'x-molis-account-login':'another-attempt'},{Cookie:f.cookie}]){
   assert.equal((await request('/api/account/auth/transactions',input,headers)).status,403);
  }
  assert.equal((await request('/api/spaces')).status,409,'business stays frozen during account preparation');
  const created=await request('/api/account/auth/transactions',input);assert.equal(created.status,200);
  const {data:transaction}=await created.json(),path='/api/account/auth/transactions/'+transaction.handle+'/submit';
  assert.equal((await request(path,{step:'PASSWORD_LOGIN',email:'bob@example.test',password:'synthetic-fixture-password'})).status,200);
  const completed=await request(path,{step:'COMPLETE'});assert.equal(completed.status,200,await completed.clone().text());
  assert.equal((await completed.json()).data.account.user.userId,'bob','retiring A must not abort the successful response');
  const nextCookie=completed.headers.getSetCookie().find(value=>value.startsWith('molis-work-session='));assert.ok(nextCookie);
  cookie=[nextCookie.split(';')[0],...page.headers.getSetCookie().map(value=>value.split(';')[0])].join('; ');
  assert.equal((await request('/api/spaces')).status,403,'the same login proof cannot acquire the new business Home');
  assert.equal((await request('/api/account/auth/transactions',input)).status,403,'a completed login nonce must not start another login or bypass preparation');
  assert.equal((await request('/api/account/activity',{eventId:crypto.randomUUID(),kind:'OPEN'})).status,403,'a completed login window is not an account-write entry');
  assert.equal((await (await request('/api/account/session')).json()).data.user.userId,'bob','completed login reads still report the adopted account');
 }finally{await f.close();}
});
