import { syncRoundResponse } from './fixtures/sync-round.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMolisWorkWebServer } from '../apps/desktop/launchers/web/server.js';
import { createServer } from 'node:http';
import { personalReturnPath } from '@molis-ai/molis-work-app-local-host';
import { PERSONAL_ACCOUNT_CLIENT_SCRIPT } from '@molis-ai/molis-work-app-workbench';
import { PersonalWebSessions } from '@molis-ai/molis-work-app-local-host';
import { createPersonalNativeSession, NATIVE_SESSION_FILE, NATIVE_SESSION_HEADER } from '@molis-ai/molis-work-app-local-host';

test('native identity requires an owner-only header capability, never a cookie or desktop hint',()=>{
  const home=mkdtempSync(join(tmpdir(),'molis-native-proof-'));
  try {
    const verify=createPersonalNativeSession(home);
    const token=readFileSync(join(home,NATIVE_SESSION_FILE),'utf8');
    if(process.platform!=='win32')assert.equal(statSync(join(home,NATIVE_SESSION_FILE)).mode&0o777,0o600);
    const request=(headers:Record<string,string|string[]>)=>({headers}) as import("node:http").IncomingMessage;
    assert.equal(verify(request({[NATIVE_SESSION_HEADER]:token})),true);
    assert.equal(createPersonalNativeSession(home)(request({[NATIVE_SESSION_HEADER]:token})),true);
    for(const headers of [{},{'x-molis-work-desktop':'1'},{cookie:'molis-work-native-session='+token},
      {[NATIVE_SESSION_HEADER]:'wrong'},{[NATIVE_SESSION_HEADER]:[token,token]}, {[NATIVE_SESSION_HEADER]:token+', '+token}]) {
      assert.equal(verify(request(headers)),false);
    }
  } finally { rmSync(home,{recursive:true,force:true}); }
});

test('native login and restart remain isolated from ordinary browser sessions and UI hints',async()=>{
  const home=mkdtempSync(join(tmpdir(),'molis-native-login-'));
  let transaction:{state:string;codeChallenge:string;clientId:string;forceLogin?:boolean}, remote='';
  const upstream=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    res.setHeader('content-type','application/json');
    if(req.url==='/api/v1/auth/transactions') {transaction=JSON.parse(raw);res.end(JSON.stringify({data:{loginUrl:remote+'/login'}}));}
    else if(req.url==='/oauth2/token')res.end(JSON.stringify({access_token:'synthetic-native',refresh_token:'synthetic-refresh',expires_in:3600}));
    else if(req.url==='/api/v1/users/me')res.end(JSON.stringify({data:{userId:'native-alice',displayName:'Alice',emails:[],applicationId:'work',clientId:'desktop-test'}}));
    else res.end('{}');
  });
  const listen=async(server:ReturnType<typeof createServer>)=>{
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const addr=server.address();assert.ok(addr&&typeof addr==='object');return 'http://127.0.0.1:'+addr.port;
  };
  const close=async(server:ReturnType<typeof createServer>)=>new Promise<void>(resolve=>server.close(()=>resolve()));
  remote=await listen(upstream);
  const names=['MOLIS_WORK_AUTH_ORIGIN','MOLIS_WORK_AUTH_CLIENT_ID','MOLIS_WORK_AUTH_DESKTOP_CLIENT_ID','MOLIS_WORK_CLOUD_ORIGIN'];
  const before=names.map(name=>process.env[name]);[remote,'web-test','desktop-test',remote].forEach((value,i)=>process.env[names[i]]=value);
  const controlToken='synthetic-native-control-token-0123456789';
  let server=createMolisWorkWebServer({homeDirectory:home,controlToken}), origin=await listen(server), seq=0;
  const proof=readFileSync(join(home,NATIVE_SESSION_FILE),'utf8');
  const native=(path:string,post=false)=>fetch(origin+path,{method:post?'POST':'GET',headers:{Origin:origin,[NATIVE_SESSION_HEADER]:proof,
    'content-type':'application/json','x-molis-work-control-token':controlToken,'x-molis-work-idempotency-key':'native-test-'+(++seq)},...(post?{body:'{}'}:{})});
  try {
    const spoof=await fetch(origin+'/api/personal/status?desktop=1',{headers:{'x-molis-work-desktop':'1'}});
    assert.equal((await spoof.json()).identity,null);
    assert.equal(existsSync(join(home,'feed','secrets.json')),false);
    const begin=await native('/api/personal/login?returnTo=%2F',true);
    assert.equal(begin.status,200);const attempt=(await begin.json()).loginAttempt;
    assert.equal(transaction.clientId,'desktop-test');
    const callback=await fetch(origin+'/account/callback?code=synthetic&state='+transaction.state,{redirect:'manual'});
    assert.equal(callback.status,303);assert.equal(callback.headers.get('location'),'/?desktop=1');
    assert.doesNotMatch(callback.headers.get('set-cookie')??'',new RegExp(proof));
    const status=await (await native('/api/personal/status?attempt='+attempt)).json();
    assert.equal(status.identity.userId,'native-alice');assert.equal(status.loginCompleted,true);
    assert.equal(status.space,'local','native account Home is not opened before PTY/Shelf isolation');
    for(const path of ['/api/personal/status','/api/personal/status?desktop=1']) {
      const response=await fetch(origin+path,{headers:{'x-molis-work-desktop':'1',cookie:'molis-work-native-session='+proof}});
      assert.equal((await response.json()).identity,null);
    }
    const ordinary=await fetch(origin+'/api/personal/logout?desktop=1',{method:'POST',headers:{Origin:origin,'content-type':'application/json',
      'x-molis-work-control-token':controlToken,'x-molis-work-idempotency-key':'spoof-native-logout'},body:'{}'});
    assert.equal(ordinary.status,401);assert.equal((await(await native('/api/personal/status')).json()).identity.userId,'native-alice');
    assert.equal((await native('/api/personal/space',true)).status,400,'space selection must name an allowed kind');
    const attached=await fetch(origin+'/api/personal/native-attach?ticket='+status.browserSessionTicket,{method:'POST',headers:{Origin:origin,
      'content-type':'application/json','x-molis-work-control-token':controlToken,'x-molis-work-idempotency-key':'native-attach-test'},body:'{}'});
    assert.equal(attached.status,200);
    const webCookie=attached.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await(await fetch(origin+'/api/personal/status',{headers:{Cookie:webCookie}})).json()).identity.userId,'native-alice');
    assert.equal((await native('/api/personal/space?kind=personal',true)).status,200);
    const scopes=await(await fetch(origin+'/api/spaces',{headers:{Cookie:webCookie}})).json();
    assert.equal(scopes.current.kind,'personal');assert.equal(scopes.current.ownerUserId,'native-alice');
    await close(server);server=createMolisWorkWebServer({homeDirectory:home,controlToken});origin=await listen(server);
    assert.equal((await(await native('/api/personal/status')).json()).identity.userId,'native-alice','host shutdown must preserve native login');
    const logout=await native('/api/personal/logout',true);assert.equal(logout.status,200);
    assert.equal((await(await native('/api/personal/status')).json()).identity,null);
    assert.equal(existsSync(join(home,'personal')),false,'native login never claims existing local assets');
  } finally {
    await close(server);await close(upstream);
    names.forEach((name,i)=>{if(before[i]===undefined)delete process.env[name];else process.env[name]=before[i];});
    rmSync(home,{recursive:true,force:true});
  }
});

test('PCSYNC-02/04/05/06 Host keeps manual runs separate, resumes opted-in accounts and stops on local switch/logout',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const home=mkdtempSync(join(tmpdir(),'sync-host-device-'));
  let state='',remote='',syncRequests=0;
  const upstream=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    res.setHeader('content-type','application/json');
    if(req.url==='/api/v1/auth/transactions'){state=JSON.parse(raw).state;res.end(JSON.stringify({data:{loginUrl:remote+'/login'}}));}
    else if(req.url==='/oauth2/token')res.end(JSON.stringify({access_token:'synthetic-sync',refresh_token:'synthetic-refresh',expires_in:3600}));
    else if(req.url==='/api/v1/users/me')res.end(JSON.stringify({data:{userId:'alice',displayName:'Alice',emails:[],applicationId:'work',clientId:'web-test'}}));
    else res.end('{}');
  });
  const listen=async(value:ReturnType<typeof createServer>)=>{
    await new Promise<void>(resolve=>value.listen(0,'127.0.0.1',resolve));const address=value.address();assert.ok(address&&typeof address==='object');return 'http://127.0.0.1:'+address.port;
  };
  const close=async(value:ReturnType<typeof createServer>)=>new Promise<void>(resolve=>value.close(()=>resolve()));
  remote=await listen(upstream);
  const names=['MOLIS_WORK_AUTH_ORIGIN','MOLIS_WORK_AUTH_CLIENT_ID','MOLIS_WORK_CLOUD_ORIGIN','MOLIS_WORK_SYNC_LOCAL'];
  const previous=names.map(name=>process.env[name]);[remote,'web-test',remote,'1'].forEach((value,index)=>process.env[names[index]]=value);
  let spaceId='';const original=fetch,historyKey=JSON.stringify(['project','document','page']);
  const historySelection={plugin_id:'io.molis.work.pages',publisher_id:'molis',publisher_signature:'official-pages-binding',collection_id:'documents',schema_version:1};let syncSelections:typeof historySelection[]=[];const historyWrites:unknown[]=[];
  t.mock.method(globalThis,'fetch',(async(input,init)=>{
    if(new URL(String(input)).origin!=='http://127.0.0.1:8788')return original(input,init);
    syncRequests++;const url=new URL(String(input));
    if(url.pathname==='/v1/round')return syncRoundResponse({spaceId,revision:1,selections:syncSelections},0);
    if(url.pathname==='/v1/quota')return Response.json({limitBytes:100000000,usedBytes:0});
    if(url.pathname==='/v1/changes')return Response.json({events:[],more:false});
    if(url.pathname==='/v1/history/keys')return Response.json({items:[{key:historyKey,currentRevision:1,versions:1,retainedAt:1000}],more:false,next:null});
    if(url.pathname==='/v1/history')return Response.json({items:[{revision:2,createdAt:1000,current:false,retained:true,action:'archive'}],more:false,next:null,currentRevision:1});
    if(url.pathname==='/v1/history/version')return Response.json({event:{key:historyKey,revision:2,base:1,operationId:'archive',value:null,attachments:[]},createdAt:1000,currentRevision:1,retained:true});
    if(url.pathname==='/v1/history/restore'||url.pathname==='/v1/history/purge'){historyWrites.push(JSON.parse(String(init?.body)));return Response.json({accepted:true,revision:3});}
    return Response.json({spaceId,revision:1,selections:syncSelections});
  }) as typeof fetch);
  const rootToken='synthetic-device-root-control-0123456789';
  let server=createMolisWorkWebServer({homeDirectory:home,controlToken:rootToken}),origin=await listen(server),cookie='',token=rootToken,sequence=0;
  const request=async(path:string,method='GET',body:object={})=>{
    const response=await fetch(origin+path,{method,headers:{Cookie:cookie,Origin:origin,'content-type':'application/json',...(method!=='GET'||path.startsWith('/api/sync')?{'x-molis-work-control-token':token}:{}),'x-molis-work-idempotency-key':'device-'+(++sequence)},...(method==='GET'?{}:{body:JSON.stringify(body)}),redirect:'manual'});
    if(response.headers.get('set-cookie')?.startsWith('molis-work-session='))cookie=response.headers.get('set-cookie')!.split(';')[0];
    assert.ok(response.status<400,'unexpected HTTP '+response.status+' for '+path);return response;
  };
  const login=async()=>{
    await request('/api/personal/login','POST');await request('/account/callback?code=synthetic&state='+state);
    await request('/api/personal/space?kind=personal','POST');
    const scopes=await(await request('/api/spaces')).json();spaceId=scopes.current.spaceId;
    token=(await(await request('/api/personal/status')).json()).viewToken;
  };
  try{
    await login();const initial=await(await request('/api/sync')).json();
    assert.deepEqual(initial.device,{automatic:null});assert.equal(syncRequests,0);
    const stale=await fetch(origin+'/api/sync/run',{method:'POST',headers:{Cookie:cookie,Origin:origin,'content-type':'application/json','x-molis-work-control-token':token,'x-molis-work-idempotency-key':'stale-sync-space','x-molis-sync-space':'another-account-space'},body:'{}'});
    assert.equal(stale.status,409);assert.equal(syncRequests,0,'a stale dialog cannot start another space sync');
    for(const state of [undefined,'', 'not-a-comparison', 'A'.repeat(64)]){
      const refused=await fetch(origin+'/api/sync/resolve',{method:'POST',headers:{Cookie:cookie,Origin:origin,'content-type':'application/json','x-molis-work-control-token':token,'x-molis-work-idempotency-key':'uninspected-choice-'+(++sequence),'x-molis-sync-space':spaceId},body:JSON.stringify({namespace:'unknown',key:'asset',choice:'remote',revision:1,state})});
      assert.equal(refused.status,409);assert.match((await refused.json()).error,/请先查看当前冲突版本/);
    }
    assert.equal(syncRequests,0,'PCSYNC-15/16 no inspected content token means no conflict decision or remote call');
    await request('/api/sync/run','POST');assert.equal(syncRequests,1,'one authenticated idle summary includes policy and quota without separate reads');
    t.mock.timers.tick(60000);assert.equal(syncRequests,1);
    for(const path of ['/history/keys','/history','/history/version']){
      const refused=await fetch(origin+'/api/sync'+path+'?namespace=unknown&key=asset&revision=2',{headers:{Cookie:cookie,Origin:origin,'x-molis-work-control-token':token,'x-molis-sync-space':spaceId}});
      assert.equal(refused.status,409);
    }
    assert.equal(syncRequests,1,'history reads cannot bypass selection or create a remote request');
    syncSelections=[historySelection];await request('/api/sync/run','POST');
    const ns=JSON.stringify([historySelection.plugin_id,historySelection.publisher_id,historySelection.publisher_signature,historySelection.collection_id,1]),query='?'+new URLSearchParams({namespace:ns,key:historyKey,revision:'2'});
    const listed=await(await request('/api/sync/history/keys?'+new URLSearchParams({namespace:ns}))).json();assert.equal(listed.items[0].key,historyKey);
    assert.equal((await(await request('/api/sync/history'+query)).json()).items[0].revision,2);
    const inspected=await(await request('/api/sync/history/version'+query)).json();assert.equal(inspected.value,null);assert.equal(inspected.currentRevision,1);
    const source={namespace:ns,key:historyKey,sourceRevision:2,revision:1};await request('/api/sync/history/restore','POST',{...source,operationId:'inspect-then-restore'});const beforePurge=syncRequests;const refusedPurge=await fetch(origin+'/api/sync/history/purge',{method:'POST',headers:{Cookie:cookie,Origin:origin,'content-type':'application/json','x-molis-work-control-token':token,'x-molis-work-idempotency-key':'refused-history-purge','x-molis-sync-space':spaceId},body:JSON.stringify({...source,confirm:true})});assert.equal(refusedPurge.status,409);assert.match((await refusedPurge.json()).error,/永久清理暂未开放/);assert.equal(syncRequests,beforePurge);
    assert.deepEqual(historyWrites,[{...source,operationId:'inspect-then-restore',policyRevision:1}],'Host forwards the inspected source/head while the coordinator injects current policy');
    await request('/api/sync/device','PUT',{automatic:true});
    await request('/api/sync/run','POST');const enabled=syncRequests;assert.ok(enabled>=2);
    await request('/api/personal/space?kind=local','POST');
    t.mock.timers.tick(60000);assert.equal(syncRequests,enabled,'switching local cancels the old timer');
    token=rootToken;await request('/api/personal/space?kind=personal','POST');
    token=(await(await request('/api/personal/status')).json()).viewToken;
    await request('/api/sync/run','POST');assert.ok(syncRequests>enabled,'re-entering restores the opted-in loop');
    await close(server);server=createMolisWorkWebServer({homeDirectory:home,controlToken:rootToken});origin=await listen(server);cookie='';token=rootToken;
    const before=syncRequests;await login();await request('/api/sync/run','POST');assert.ok(syncRequests>before);
    assert.deepEqual((await(await request('/api/sync')).json()).device,{automatic:true});
    await request('/api/personal/logout','POST');const signedOut=syncRequests;t.mock.timers.tick(60000);assert.equal(syncRequests,signedOut);
  }finally{
    await close(server);await close(upstream);
    names.forEach((name,index)=>{if(previous[index]===undefined)delete process.env[name];else process.env[name]=previous[index];});rmSync(home,{recursive:true,force:true});
  }
});

test('web sessions expire, rotate identifiers, reject duplicate cookies and do not survive restart',()=>{
  let now=1000;const sessions=new PersonalWebSessions(()=>now);
  const config={authOrigin:'https://auth.example',clientId:'web',cloudOrigin:'https://cloud.example'};
  const a=sessions.create(config),b=sessions.create(config);
  const before=sessions.cookie(a,true).split(';')[0];
  assert.equal(sessions.get(before),a);assert.match(sessions.cookie(a,true),/HttpOnly; SameSite=Lax; Max-Age=28800; Secure/);
  assert.equal(sessions.get(before+'; '+before),null);
  sessions.rotate(a);assert.equal(sessions.get(before),null);
  assert.equal(sessions.get(sessions.cookie(b,false).split(';')[0]),b);
  assert.equal(new PersonalWebSessions().get(sessions.cookie(a,false).split(';')[0]),null);
  const current=sessions.cookie(a,false).split(';')[0];now+=8*60*60*1000;
  assert.equal(sessions.get(current),null);assert.equal(a.auth.identity(),null);
});

test('account scripts parse and return destinations reject external and auth routes',()=>{
  assert.doesNotThrow(()=>new Function(PERSONAL_ACCOUNT_CLIENT_SCRIPT));
  assert.equal(personalReturnPath('/projects/demo?view=work#task'),'/projects/demo?view=work#task');
  assert.equal(personalReturnPath('/projects/demo',true),'/projects/demo?desktop=1');
  for(const input of ['https://evil.test','//evil.test','/\\evil.test','/account/callback','/api/personal/logout','/projects/../account','/projects/x\n'])assert.equal(personalReturnPath(input),'/');
});

test('web login is cookie-bound, isolated and never opens the local credential store',async()=>{
  const home=mkdtempSync(join(tmpdir(),'molis-personal-flow-'));
  let transaction:{state:string;codeChallenge:string;clientId:string;forceLogin?:boolean}, user='alice';
  const upstream=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    res.setHeader('content-type','application/json');
    if(req.url==='/api/v1/auth/transactions'){
      transaction=JSON.parse(raw);res.end(JSON.stringify({data:{loginUrl:remote+'/login#transaction=synthetic'}}));
    }else if(req.url==='/oauth2/token')res.end(JSON.stringify({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600}));
    else if(req.url==='/api/v1/users/me')res.end(JSON.stringify({data:{userId:user,displayName:user,emails:[user+'@example.test'],applicationId:'work',clientId:transaction.clientId}}));
    else res.end('{}');
  });
  await new Promise<void>(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const address=upstream.address();assert.ok(address&&typeof address==='object');const remote=`http://127.0.0.1:${address.port}`;
  const names=['MOLIS_WORK_AUTH_ORIGIN','MOLIS_WORK_AUTH_CLIENT_ID','MOLIS_WORK_CLOUD_ORIGIN'];
  const old=names.map(name=>process.env[name]);[remote,'work-local',remote].forEach((value,i)=>process.env[names[i]]=value);
  const controlToken='synthetic-control-token-0123456789abcdef';
  const server=createMolisWorkWebServer({homeDirectory:home,controlToken});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const local=server.address();assert.ok(local&&typeof local==='object');const origin=`http://127.0.0.1:${local.port}`;
  let sequence=0, cookie='';
  const browser=async(path:string,init:RequestInit={})=>{
    const response=await fetch(origin+path,{...init,headers:{Cookie:cookie,...init.headers}});
    if(response.headers.get('set-cookie')?.startsWith('molis-work-session='))cookie=response.headers.get('set-cookie')!.split(';')[0];
    return response;
  };
  const post=(path:string)=>browser(path,{method:'POST',headers:{Origin:origin,'content-type':'application/json','x-molis-work-control-token':controlToken,'x-molis-work-idempotency-key':'account-flow-'+(++sequence)},body:'{}'});
  const status=async(query='')=>(await browser('/api/personal/status'+query)).json();
  try{
    const start=await post('/api/personal/login?returnTo='+encodeURIComponent('/projects/demo?view=work#task'));
    assert.equal(start.status,200);
    const login=await start.json();assert.ok(login.loginAttempt);assert.equal(transaction.forceLogin,undefined);
    const preLoginCookie=cookie;
    const stolen=await fetch(origin+'/account/callback?code=synthetic&state='+transaction.state,{redirect:'manual'});assert.equal(stolen.status,401);assert.match(stolen.headers.get('content-type')??'',/application\/json/);
    const invalid=await browser('/account/callback?code=synthetic&state=wrong',{redirect:'manual'});assert.equal(invalid.status,400);
    // Host account protocol response, not plugin content (user confirmed 2026-10-18).
    assert.match(invalid.headers.get('content-type')??'',/^text\/html/);assert.equal(invalid.headers.get('cache-control'),'no-store');
    assert.equal(invalid.headers.get('referrer-policy'),'no-referrer');assert.equal(invalid.headers.get('x-frame-options'),'DENY');
    const failure=await invalid.text();assert.equal((failure.match(/<!doctype html>/gi)??[]).length,1);
    assert.match(failure,/登录未完成或请求已失效/);assert.deepEqual([...failure.matchAll(/href="([^"]*)"/g)].map(match=>match[1]),['/']);
    assert.doesNotMatch(failure,/<(?:script|form|iframe|nav|main)\b|data-plugin|synthetic|wrong|access_token|refresh_token|code=|state=/i);
    const callback=await browser('/account/callback?code=synthetic&state='+transaction.state,{redirect:'manual'});
    assert.equal(callback.status,303);assert.equal(callback.headers.get('location'),'/projects/demo?view=work#task');assert.equal(await callback.text(),'');
    assert.match(callback.headers.get('set-cookie')!,/HttpOnly; SameSite=Lax/);assert.notEqual(cookie,preLoginCookie);
    const another=await fetch(origin+'/api/personal/status',{headers:{Cookie:preLoginCookie}});assert.equal((await another.json()).identity,null);
    assert.equal((await(await fetch(origin+'/api/personal/status')).json()).identity,null);
    assert.equal(existsSync(join(home,'feed','secrets.json')),false);assert.equal(existsSync(join(home,'feed','secrets.key')),false);
    const legacy=await fetch(origin+'/account',{redirect:'manual'});assert.equal(legacy.status,303);assert.equal(legacy.headers.get('location'),'/');
    const switchResponse=await post('/api/personal/switch?returnTo=%2Fprojects%2Fdemo');
    const switching=await switchResponse.json();assert.equal(transaction.forceLogin,true);
    const waiting=await status('?pending=1&attempt='+switching.loginAttempt);assert.equal(waiting.identity.userId,'alice');assert.equal(waiting.loginCompleted,undefined);
    user='bob';
    const switched=await browser('/account/callback?code=synthetic&state='+transaction.state,{redirect:'manual'});
    assert.equal(switched.status,303);assert.equal(switched.headers.get('location'),'/projects/demo');
    assert.equal((await status('?pending=1&attempt='+login.loginAttempt)).loginCompleted,undefined);
    const done=await status('?pending=1&attempt='+switching.loginAttempt);assert.equal(done.loginCompleted,true);assert.equal(done.identity.userId,'bob');
    const logout=await post('/api/personal/logout?returnTo=%2Fprojects%2Fdemo');
    assert.deepEqual(await logout.json(),{signedOut:true,remoteRevoked:true,redirectTo:'/projects/demo'});
    assert.equal((await status()).identity,null);assert.match(logout.headers.get('set-cookie')!,/molis-work-session=;.*Max-Age=0/);
    const unsafe=await post('/api/personal/local?returnTo=https%3A%2F%2Fevil.test');assert.deepEqual(await unsafe.json(),{redirectTo:'/'});
  }finally{
    await new Promise<void>(resolve=>server.close(()=>resolve()));await new Promise<void>(resolve=>upstream.close(()=>resolve()));
    names.forEach((name,i)=>{if(old[i]===undefined)delete process.env[name];else process.env[name]=old[i];});rmSync(home,{recursive:true,force:true});
  }
});

test('account page works without cloud, never exposes credentials, and rejects cross-origin login',async()=>{
  const home=mkdtempSync(join(tmpdir(),'molis-personal-http-'));
  const names=['MOLIS_WORK_AUTH_ORIGIN','MOLIS_WORK_AUTH_CLIENT_ID','MOLIS_WORK_CLOUD_ORIGIN'];
  const old=names.map(name=>process.env[name]);names.forEach(name=>delete process.env[name]);
  const server=createMolisWorkWebServer({homeDirectory:home,controlToken:'synthetic-control-token-0123456789abcdef'});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address==='object');const origin=`http://127.0.0.1:${address.port}`;
  try{
    const account=await fetch(`${origin}/account`,{redirect:'manual'});assert.equal(account.status,303);
    const html=await(await fetch(origin)).text();assert.match(html,/data-account-link/);
    assert.doesNotMatch(html,/refresh_token|access_token/);
    const status=await fetch(`${origin}/api/personal/status`);assert.deepEqual(await status.json(),{configured:false,identity:null,syncEnabled:false});
    const rejected=await fetch(`${origin}/api/personal/login`,{method:'POST',headers:{Origin:'https://attacker.example','content-type':'application/json'},body:'{}'});
    assert.equal(rejected.status,403);
  }finally{
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    names.forEach((name,i)=>{if(old[i]===undefined)delete process.env[name];else process.env[name]=old[i];});
    rmSync(home,{recursive:true,force:true});
  }
});

test('first launch skips account onboarding and never opens credentials in local mode',async()=>{
  const home=mkdtempSync(join(tmpdir(),'molis-personal-local-'));
  const names=['MOLIS_WORK_AUTH_ORIGIN','MOLIS_WORK_AUTH_CLIENT_ID','MOLIS_WORK_CLOUD_ORIGIN'];
  const old=names.map(name=>process.env[name]);
  const values=['https://auth.example.test','work-local','https://cloud.example.test'];
  names.forEach((name,i)=>process.env[name]=values[i]);
  const controlToken='synthetic-control-token-0123456789abcdef';
  const server=createMolisWorkWebServer({homeDirectory:home,controlToken});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address==='object');const origin=`http://127.0.0.1:${address.port}`;
  try{
    const first=await fetch(origin+'/?desktop=1',{redirect:'manual'});
    assert.notEqual(first.headers.get('location'),'/welcome?desktop=1');
    const welcome=await fetch(origin+'/welcome',{redirect:'manual'});assert.equal(welcome.status,303);assert.equal(welcome.headers.get('location'),'/');
    const html=await(await fetch(origin+'/')).text();assert.match(html,/data-account-link/);assert.doesNotMatch(html,/欢迎使用 molis-work/);
    const bad=await fetch(origin+'/api/personal/local',{method:'POST',headers:{Origin:'https://attacker.example'},body:'{}'});
    assert.equal(bad.status,403);
    const choice=await fetch(origin+'/api/personal/local?desktop=1',{method:'POST',headers:{Origin:origin,'content-type':'application/json','x-molis-work-control-token':controlToken,'x-molis-work-idempotency-key':'test-local-choice-001'},body:'{}'});
    assert.equal(choice.status,200);assert.deepEqual(await choice.json(),{redirectTo:'/?desktop=1'});
    const cookie=choice.headers.get('set-cookie')!;assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);
    const headers={Cookie:cookie.split(';')[0]};
    const status=await fetch(origin+'/api/personal/status',{headers});
    assert.deepEqual(await status.json(),{configured:true,identity:null,syncEnabled:false});
    const account=await fetch(origin+'/account',{headers,redirect:'manual'});assert.equal(account.headers.get('location'),'/');
    assert.equal(existsSync(join(home,'feed','secrets.key')),false,'onboarding and local account must not open credentials');
    const next=await fetch(origin+'/',{headers,redirect:'manual'});assert.notEqual(next.headers.get('location'),'/welcome');
    assert.equal(existsSync(join(home,'feed','secrets.key')),false,'local use must not create credential material');
    assert.equal(existsSync(join(home,'feed','secrets.json')),false,'local use must not access an account store');
  }finally{
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    names.forEach((name,i)=>{if(old[i]===undefined)delete process.env[name];else process.env[name]=old[i];});
    rmSync(home,{recursive:true,force:true});
  }
});

// PTR-01: real authenticated local HTTP boundary refuses permanent cleanup even with confirmation.
test('PTR-01 permanent cloud cleanup is refused before opening the sync service',async()=>{
 const home=mkdtempSync(join(tmpdir(),'molis-trial-purge-refusal-')),controlToken='synthetic-trial-control-token-0123456789';
 const server=createMolisWorkWebServer({homeDirectory:home,controlToken});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address==='object');
 const origin='http://127.0.0.1:'+address.port;
 try{
  for(const [i,path] of ['/api/sync/purge-trash','/api/sync/history/purge'].entries()){
   const response=await fetch(origin+path,{method:'POST',headers:{Origin:origin,'content-type':'application/json','x-molis-work-control-token':controlToken,'x-molis-work-idempotency-key':'trial-refusal-'+i},body:JSON.stringify({namespace:'anything',key:'unique',revision:1,confirm:true})});
   assert.equal(response.status,409);assert.match((await response.json()).error,/永久清理暂未开放/);
  }
  assert.equal(existsSync(join(home,'feed','secrets.json')),false,'refusal does not open credentials or a sync service');
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(home,{recursive:true,force:true});}
});
