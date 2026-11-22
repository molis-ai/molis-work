import {v2AccountPeer} from './fixtures/v2-account-peer.js';
import {completeInstallationLogin} from './fixtures/installation-login.js';
import {trialAccountConfig} from '../examples/personal-trial-tools/mock-auth.mjs';
import {accountRefreshFixture,accountProbeCore} from './fixtures/account-refresh.js';
import {pagesManifest} from '@molis-ai/molis-work-plugin-pages';
import { syncRoundResponse } from './fixtures/sync-round.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMolisWorkWebServer } from '../apps/desktop/launchers/web/server.js';
import { createServer } from 'node:http';
import { PersonalAuth, personalReturnPath } from '@molis-ai/molis-work-app-local-host';
import { PERSONAL_ACCOUNT_CLIENT_SCRIPT } from '@molis-ai/molis-work-app-workbench';
import { PersonalWebSessions } from '@molis-ai/molis-work-app-local-host';
import { createPersonalNativeSession, NATIVE_SESSION_FILE, NATIVE_SESSION_HEADER, changeMcpClientCredential } from '@molis-ai/molis-work-app-local-host';
import { MolisWorkServer, withMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';

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

test('S-141 native login and restart remain isolated from ordinary browser sessions and UI hints',async()=>{
  const home=mkdtempSync(join(tmpdir(),'molis-native-login-'));
  // A restarted listener has a new transport; do not reuse undici's sockets from the stopped server.
  // Existing connection-revocation assertions remain in account-process-connection.test.ts.
  const request=(input:string,init:RequestInit={})=>globalThis.fetch(input,{...init,headers:{...Object.fromEntries(new Headers(init.headers)),Connection:'close'}});
  let remote='', user='native-alice';
  let authUnavailable=false;
  const peer=v2AccountPeer(()=>user,async()=>{if(authUnavailable)throw Error('offline');}),upstream=peer.server;
  const listen=async(server:ReturnType<typeof createServer>,port=0)=>{
    await new Promise<void>(resolve=>server.listen(port,'127.0.0.1',resolve));const addr=server.address();assert.ok(addr&&typeof addr==='object');return 'http://127.0.0.1:'+addr.port;
  };
  const close=async(server:ReturnType<typeof createServer>)=>new Promise<void>(resolve=>server.close(()=>resolve()));
  remote=await listen(upstream);
  const names=['MOLIS_WORK_ACCOUNT_CONFIG'];
  const before=names.map(name=>process.env[name]);process.env.MOLIS_WORK_ACCOUNT_CONFIG='';
  const controlToken='synthetic-native-control-token-0123456789';
  let server=createMolisWorkWebServer({homeDirectory:home,controlToken}), origin=await listen(server), seq=0;
  process.env.MOLIS_WORK_ACCOUNT_CONFIG=peer.configure(origin);
  const proof=readFileSync(join(home,NATIVE_SESSION_FILE),'utf8');
  const native=(path:string,post=false,body:unknown={},extra:Record<string,string>={})=>request(origin+path,{method:post?'POST':'GET',headers:{Origin:origin,[NATIVE_SESSION_HEADER]:proof,
    'content-type':'application/json','x-molis-work-control-token':controlToken,'x-molis-work-idempotency-key':'native-test-'+(++seq),...extra},...(post?{body:JSON.stringify(body)}:{})});
  try {
    const spoof=await request(origin+'/api/personal/status?desktop=1',{headers:{'x-molis-work-desktop':'1'}});
    assert.equal((await spoof.json()).identity,null);
    assert.equal(existsSync(join(home,'security','secrets.json')),false);
    const begin=await native('/api/personal/login?returnTo=%2F',true);
    assert.equal(begin.status,200);const started=await begin.json(),attempt=started.loginAttempt;
    const callback=await completeInstallationLogin((path,init)=>native(path,true,JSON.parse(String(init?.body)),Object.fromEntries(new Headers(init?.headers))),started.loginUrl,'native-alice@example.test');
    assert.equal(callback.status,200);
    assert.doesNotMatch(callback.headers.get('set-cookie')??'',new RegExp(proof));
    const status=await (await native('/api/personal/status?attempt='+attempt)).json();
    assert.equal(status.identity.userId,'native-alice');assert.equal(status.loginCompleted,true);
    assert.equal(status.space,'account','ASR-02 login selects the installation account Home');
    for(const path of ['/api/personal/status','/api/personal/status?desktop=1']) {
      const response=await request(origin+path,{headers:{'x-molis-work-desktop':'1',cookie:'molis-work-native-session='+proof}});
      assert.equal((await response.json()).identity,null);
    }
    const ordinary=await request(origin+'/api/personal/logout?desktop=1',{method:'POST',headers:{Origin:origin,'content-type':'application/json',
      'x-molis-work-control-token':controlToken,'x-molis-work-idempotency-key':'spoof-native-logout'},body:'{}'});
    assert.equal(ordinary.status,401);assert.equal((await(await native('/api/personal/status')).json()).identity.userId,'native-alice');
    assert.equal((await native('/api/personal/space',true)).status,400,'space selection must name an allowed kind');
    const attached=await request(origin+'/api/personal/native-attach?ticket='+status.browserSessionTicket,{method:'POST',headers:{Origin:origin,
      'content-type':'application/json','x-molis-work-control-token':controlToken,'x-molis-work-idempotency-key':'native-attach-test'},body:'{}'});
    assert.equal(attached.status,200);
    const webCookie=attached.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await(await request(origin+'/api/personal/status',{headers:{Cookie:webCookie}})).json()).identity.userId,'native-alice');
    assert.equal((await native('/api/personal/space?kind=personal',true)).status,200);
    const scopes=await(await request(origin+'/api/spaces',{headers:{Cookie:webCookie}})).json();
    assert.equal(scopes.current.kind,'personal');assert.equal(scopes.current.ownerUserId,'native-alice');
    await close(server);server=createMolisWorkWebServer({homeDirectory:home,controlToken});origin=await listen(server,Number(new URL(origin).port));
    authUnavailable=true;
    const offline=await(await native('/api/personal/status')).json();
    assert.equal(offline.identity.userId,'native-alice','host shutdown must preserve native login');
    assert.equal(offline.offline,true);
    assert.equal(typeof offline.browserSessionTicket,'string','only the native caller can reattach while Auth is unavailable');
    const staleWeb=await(await request(origin+'/api/personal/status?desktop=1',{headers:{Cookie:webCookie,'x-molis-work-desktop':'1'}})).json();
    assert.equal(staleWeb.identity,null);
    assert.equal(staleWeb.browserSessionTicket,undefined,'old WebView cookie and desktop hint are not native proof');
    authUnavailable=false;
    const prepareNative=async(intent:'switch'|'logout')=>{
      const page='native-main';await native('/api/personal/status?page='+page);
      const start=await native('/api/personal/prepare?action=start&page='+page+'&intent='+intent,true);assert.equal(start.status,200);
      const {id}=await start.json();const ack=await native('/api/personal/prepare?action=ack&page='+page+'&id='+id,true);assert.equal((await ack.json()).ready,true);
      return '&page='+page+'&preparation='+id;
    };
    const staleTicket=offline.browserSessionTicket;
    const prepared=await prepareNative('switch');
    user='native-bob';const switched=await native('/api/personal/switch?returnTo=%2F'+prepared,true);assert.equal(switched.status,200);
    assert.equal((await completeInstallationLogin((path,init)=>native(path,true,JSON.parse(String(init?.body)),Object.fromEntries(new Headers(init?.headers))),(await switched.json()).loginUrl,'native-bob@example.test')).status,200);
    const bob=await(await native('/api/personal/status')).json();assert.equal(bob.identity.userId,'native-bob');
    const attachTicket=(ticket:string,id:string)=>request(origin+'/api/personal/native-attach?ticket='+ticket,{method:'POST',headers:{Origin:origin,
      'content-type':'application/json','x-molis-work-control-token':controlToken,'x-molis-work-idempotency-key':id},body:'{}'});
    const stale=await attachTicket(staleTicket,'stale-alice-ticket');
    assert.equal(stale.status,401,'S-141 an old login generation ticket is refused');
    assert.equal(stale.headers.get('set-cookie'),null,'refusal issues no browser session');
    const fresh=await attachTicket(bob.browserSessionTicket,'fresh-bob-ticket');assert.equal(fresh.status,200);
    assert.equal((await attachTicket(bob.browserSessionTicket,'replayed-bob-ticket')).status,401,'tickets remain single use');
    const logoutPrepared=await prepareNative('logout');assert.equal((await native('/api/personal/logout?'+logoutPrepared.slice(1),true)).status,200);
    assert.equal((await(await native('/api/personal/status')).json()).identity,null);
    assert.equal(existsSync(join(home,'personal')),false,'login never claims existing local assets');
  } finally {
    await close(server);await close(upstream);
    names.forEach((name,i)=>{if(before[i]===undefined)delete process.env[name];else process.env[name]=before[i];});
    rmSync(home,{recursive:true,force:true});
  }
});

test('ASR-02/10 PCSYNC-02/04/05/06 Host keeps manual runs separate and preserves opted-in sync across explicit logout/login',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const home=mkdtempSync(join(tmpdir(),'sync-host-device-'));
  let remote='',syncRequests=0;
  const peer=v2AccountPeer(()=> 'alice'),upstream=peer.server;
  const listen=async(value:ReturnType<typeof createServer>,port=0)=>{
    await new Promise<void>(resolve=>value.listen(port,'127.0.0.1',resolve));const address=value.address();assert.ok(address&&typeof address==='object');return 'http://127.0.0.1:'+address.port;
  };
  const close=async(value:ReturnType<typeof createServer>)=>new Promise<void>(resolve=>value.close(()=>resolve()));
  remote=await listen(upstream);
  const names=['MOLIS_WORK_ACCOUNT_CONFIG','MOLIS_WORK_SYNC_LOCAL'];
  const previous=names.map(name=>process.env[name]);process.env.MOLIS_WORK_ACCOUNT_CONFIG='';process.env.MOLIS_WORK_SYNC_LOCAL='1';
  let spaceId='',historyKey='';const original=fetch;
  const historyCollection=pagesManifest.sync!.collections.find(row=>row.id==='documents')!;
  const historySelection={plugin_id:pagesManifest.plugin_id,publisher_id:pagesManifest.publisher.publisher_id,publisher_signature:pagesManifest.publisher.signature,collection_id:historyCollection.id,schema_version:historyCollection.schema_version};let syncSelections:typeof historySelection[]=[];const historyWrites:unknown[]=[];
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
  process.env.MOLIS_WORK_ACCOUNT_CONFIG=peer.configure(origin);
  const request=async(path:string,method='GET',body:object={},extra:Record<string,string>={})=>{
    const response=await fetch(origin+path,{method,headers:{Cookie:cookie,Origin:origin,'content-type':'application/json','x-molis-work-control-token':token,'x-molis-work-idempotency-key':'device-'+(++sequence),...extra},...(method==='GET'?{}:{body:JSON.stringify(body)}),redirect:'manual'});
    if(response.headers.get('set-cookie')?.startsWith('molis-work-session='))cookie=response.headers.get('set-cookie')!.split(';')[0];
    assert.ok(response.status<400,'unexpected HTTP '+response.status+' for '+path+': '+(response.status>=400?await response.clone().text():''));return response;
  };
  const prepareLogout=async()=>{
    await request('/api/personal/status?page=device');const start=await request('/api/personal/prepare?action=start&page=device&intent=logout','POST');const {id}=await start.json();
    const ack=await request('/api/personal/prepare?action=ack&page=device&id='+id,'POST');assert.equal((await ack.json()).ready,true);return '?page=device&preparation='+id;
  };
  let historyProject: {project_id:string} | undefined;
  const login=async()=>{
    const begun=await request('/api/personal/login','POST');await completeInstallationLogin((path,init)=>request(path,'POST',JSON.parse(String(init?.body)),Object.fromEntries(new Headers(init?.headers))),(await begun.json()).loginUrl,'alice@example.test');
    await request('/api/personal/space?kind=personal','POST');
    const scopes=await(await request('/api/spaces')).json();spaceId=scopes.current.spaceId;
    token=readFileSync(join(home,'spaces',spaceId,'config/web-control-token'),'utf8').trim();
    // Pages is a project Runtime owner on main; opening that project is the person's activation, not sync discovery.
    const project=historyProject??=(await(await request('/api/settings/projects','POST',{display_name:'History fixture',user_confirmed:true})).json()).project;
    historyKey=JSON.stringify([null,JSON.stringify([project.project_id,'document','page'])]);
    await request('/projects/'+encodeURIComponent(project.project_id)+'/');
  };
  try{
    await login();const initial=await(await request('/api/sync')).json();
    assert.deepEqual(initial.device,{automatic:null});assert.equal(syncRequests,0);
    const projectsCol=initial.collections.find((c:{selection:{plugin_id:string;collection_id:string}})=>c.selection.plugin_id==='io.molis.work.module.projects.v1');
    const artifactsCol=initial.collections.find((c:{selection:{plugin_id:string;collection_id:string}})=>c.selection.plugin_id==='io.molis.work.artifacts');
    assert.equal(projectsCol?.group,'platform','Host marks project catalog collection as platform');
    assert.equal(artifactsCol?.group,'platform','Host marks platform artifacts collection as platform');
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
    const selectedStatus=await(await request('/api/sync')).json();assert.equal(selectedStatus.error,null,JSON.stringify(selectedStatus));
    const ns=JSON.stringify([historySelection.plugin_id,historySelection.publisher_id,historySelection.publisher_signature,historySelection.collection_id,historySelection.schema_version]),query='?'+new URLSearchParams({namespace:ns,key:historyKey,revision:'2'});
    const listed=await(await request('/api/sync/history/keys?'+new URLSearchParams({namespace:ns}))).json();assert.equal(listed.items[0].key,historyKey);
    assert.equal((await(await request('/api/sync/history'+query)).json()).items[0].revision,2);
    const inspected=await(await request('/api/sync/history/version'+query)).json();assert.equal(inspected.value,null);assert.equal(inspected.currentRevision,1);
    const source={namespace:ns,key:historyKey,sourceRevision:2,revision:1};
    await request('/api/sync/history/restore','POST',{...source,operationId:'inspect-then-restore'});
    const beforePurge=syncRequests;
    const purge=(confirm:boolean)=>fetch(origin+'/api/sync/history/purge',{method:'POST',headers:{Cookie:cookie,Origin:origin,'content-type':'application/json','x-molis-work-control-token':token,'x-molis-work-idempotency-key':'history-purge-'+confirm,'x-molis-sync-space':spaceId},body:JSON.stringify({...source,confirm})});
    const refusedPurge=await purge(false);
    assert.equal(refusedPurge.status,409);assert.match((await refusedPurge.json()).error,/确认永久清理/);assert.equal(syncRequests,beforePurge);
    assert.equal((await purge(true)).status,200);
    assert.deepEqual(historyWrites,[{...source,operationId:'inspect-then-restore',policyRevision:1},{...source,confirm:true}],'Host forwards the inspected revisions and only forwards purge after confirmation');
    await request('/api/sync/device','PUT',{automatic:true});
    await request('/api/sync/run','POST');const enabled=syncRequests;assert.ok(enabled>=2);
    await request('/api/personal/logout'+await prepareLogout(),'POST');
    t.mock.timers.tick(60000);assert.equal(syncRequests,enabled,'ASR-10 explicit logout cancels the old timer');
    token=rootToken;await login();
    await request('/api/sync/run','POST');assert.ok(syncRequests>enabled,'re-entering restores the opted-in loop');
    await close(server);server=createMolisWorkWebServer({homeDirectory:home,controlToken:rootToken});origin=await listen(server,Number(new URL(origin).port));cookie='';token=rootToken;
    const before=syncRequests;await login();await request('/api/sync/run','POST');assert.ok(syncRequests>before);
    assert.deepEqual((await(await request('/api/sync')).json()).device,{automatic:true});
    await request('/api/personal/logout'+await prepareLogout(),'POST');const signedOut=syncRequests;t.mock.timers.tick(60000);assert.equal(syncRequests,signedOut);
  }finally{
    await close(server);await close(upstream);
    names.forEach((name,index)=>{if(previous[index]===undefined)delete process.env[name];else process.env[name]=previous[index];});rmSync(home,{recursive:true,force:true});
  }
});

test('web sessions expire, reject duplicate cookies and do not survive restart',()=>{
  let now=1000;const sessions=new PersonalWebSessions(()=>now);
  const config=trialAccountConfig('http://127.0.0.1:8787','http://127.0.0.1:4173');
  const auth=new PersonalAuth(config,{get:()=>null,put:()=>{},delete:()=>{},assertWritable:()=>{}});
  const a=sessions.adopt(auth),b=sessions.adopt(auth);
  const before=sessions.cookie(a,true).split(';')[0];
  assert.equal(sessions.get(before),a);assert.match(sessions.cookie(a,true),/HttpOnly; SameSite=Lax; Max-Age=28800; Secure/);
  assert.equal(sessions.get(before+'; '+before),null);
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

test('ASR-02/03 web login binds the installation account and stale browser cookies never select another account',async()=>{
  const home=mkdtempSync(join(tmpdir(),'molis-personal-flow-'));
  let user='alice';
  const peer=v2AccountPeer(()=>user),upstream=peer.server;
  await new Promise<void>(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const address=upstream.address();assert.ok(address&&typeof address==='object');const remote=`http://127.0.0.1:${address.port}`;
  const names=['MOLIS_WORK_ACCOUNT_CONFIG'];
  const old=names.map(name=>process.env[name]);process.env.MOLIS_WORK_ACCOUNT_CONFIG='';
  const controlToken='synthetic-control-token-0123456789abcdef';
  const server=createMolisWorkWebServer({homeDirectory:home,controlToken});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const local=server.address();assert.ok(local&&typeof local==='object');const origin=`http://127.0.0.1:${local.port}`;
  process.env.MOLIS_WORK_ACCOUNT_CONFIG=peer.configure(origin);
  let sequence=0, cookie='';
  const browser=async(path:string,init:RequestInit={})=>{
    const response=await fetch(origin+path,{...init,headers:{Cookie:cookie,Origin:origin,'x-molis-work-control-token':controlToken,'x-molis-work-idempotency-key':'account-request-'+(++sequence),...init.headers}});
    if(response.headers.get('set-cookie')?.startsWith('molis-work-session='))cookie=response.headers.get('set-cookie')!.split(';')[0];
    return response;
  };
  const post=(path:string)=>browser(path,{method:'POST',headers:{Origin:origin,'content-type':'application/json','x-molis-work-control-token':controlToken,'x-molis-work-idempotency-key':'account-flow-'+(++sequence)},body:'{}'});
  const status=async(query='')=>(await browser('/api/personal/status'+query)).json();
  try{
    // WAS-11: an external top-level entry issues no credentials or login; only its same-origin follow-up may do so.
    const external=await fetch(origin+'/',{headers:{'sec-fetch-site':'cross-site','sec-fetch-dest':'document'}});
    assert.equal(external.status,200);assert.equal(external.headers.get('set-cookie'),null);
    const entry=await external.text();assert.match(entry,/location\.replace\(location\.href\)/);assert.doesNotMatch(entry,/molis-work-page-session|molisWorkRequest/);
    const crossWrite=await fetch(origin+'/api/personal/login',{method:'POST',headers:{Origin:'https://outside.invalid','content-type':'application/json','sec-fetch-site':'cross-site'},body:'{}'});
    assert.equal(crossWrite.status,403);assert.equal(crossWrite.headers.get('set-cookie'),null);
    const start=await post('/api/personal/login?returnTo='+encodeURIComponent('/projects/demo?view=work#task'));
    assert.equal(start.status,200);
    const login=await start.json();assert.ok(login.loginAttempt);const preLoginCookie=cookie;
    // WUA-29: reload/reopen resumes the owner's anonymous attempt, never steals a different browser's attempt.
    const resumed=await post('/api/personal/login');assert.equal(resumed.status,200);assert.deepEqual(await resumed.json(),login);
    const foreign=await fetch(origin+'/api/personal/login',{method:'POST',headers:{Origin:origin,'content-type':'application/json','x-molis-work-control-token':controlToken,'x-molis-work-idempotency-key':'foreign-resume'},body:'{}'});
    assert.equal(foreign.status,409);assert.equal(foreign.headers.get('set-cookie'),null,'a refused parallel entry cannot overwrite the pending login cookie');assert.equal((await status()).loginPending,true);
    const nonce=new URL(login.loginUrl).searchParams.get('accountLogin')!;
    const stolen=await fetch(origin+'/api/account/auth/transactions',{method:'POST',headers:{Origin:origin,'content-type':'application/json','x-molis-account-login':nonce,'x-molis-work-control-token':controlToken,'x-molis-work-idempotency-key':'stolen-login'},body:JSON.stringify({purpose:'LOGIN',method:'EMAIL_PASSWORD'})});
    assert.equal(stolen.status,403,'a page control token without the browser login cookie cannot use the pending login');
    const callback=await completeInstallationLogin(browser,login.loginUrl,'alice@example.test');assert.equal(callback.status,200);assert.match(callback.headers.get('set-cookie')!,/HttpOnly; SameSite=Lax/);assert.notEqual(cookie,preLoginCookie);
    const another=await fetch(origin+'/api/personal/status',{headers:{Cookie:preLoginCookie}});assert.equal((await another.json()).identity,null);
    assert.equal((await(await fetch(origin+'/api/personal/status')).json()).identity,null);
    assert.doesNotMatch(JSON.stringify(await status()),/access_token|refresh_token|synthetic-access|synthetic-refresh/,'account controls never return installation credentials');
    const legacy=await fetch(origin+'/account',{redirect:'manual'});assert.equal(legacy.status,303);assert.equal(legacy.headers.get('location'),'/');
    const prepare=async(intent:'switch'|'logout')=>{
      await status('?page=flow');const start=await post('/api/personal/prepare?action=start&page=flow&intent='+intent);assert.equal(start.status,200);
      const {id}=await start.json();const ack=await post('/api/personal/prepare?action=ack&page=flow&id='+id);assert.equal((await ack.json()).ready,true);return '&page=flow&preparation='+id;
    };
    const switchPrepared=await prepare('switch');
    const switchResponse=await post('/api/personal/switch?returnTo=%2Fprojects%2Fdemo'+switchPrepared);
    const switching=await switchResponse.json();
    const waiting=await status('?pending=1&attempt='+switching.loginAttempt);assert.equal(waiting.identity.userId,'alice');assert.equal(waiting.loginCompleted,undefined);
    user='bob';
    const switched=await completeInstallationLogin(browser,switching.loginUrl,'bob@example.test');
    assert.equal(switched.status,200);
    assert.equal((await status('?pending=1&attempt='+login.loginAttempt)).loginCompleted,undefined);
    const done=await status('?pending=1&attempt='+switching.loginAttempt);assert.equal(done.loginCompleted,true);assert.equal(done.identity.userId,'bob');
    const logoutPrepared=await prepare('logout');const logout=await post('/api/personal/logout?returnTo=%2Fprojects%2Fdemo'+logoutPrepared);
    assert.deepEqual(await logout.json(),{signedOut:true,remoteRevoked:true,redirectTo:'/projects/demo'});
    assert.equal((await status()).identity,null);assert.match(logout.headers.get('set-cookie')!,/molis-work-session=;.*Max-Age=0/);
    const unsafe=await post('/api/personal/local?returnTo=https%3A%2F%2Fevil.test');assert.equal(unsafe.status,400,'ASR-02 an anonymous business workspace is not available');assert.equal(unsafe.headers.get('location'),null);
  }finally{
    await new Promise<void>(resolve=>server.close(()=>resolve()));await new Promise<void>(resolve=>upstream.close(()=>resolve()));
    names.forEach((name,i)=>{if(old[i]===undefined)delete process.env[name];else process.env[name]=old[i];});rmSync(home,{recursive:true,force:true});
  }
});

test('AC-T5-03 and AC-T5-04: account page reports missing or invalid config and rejects cross-origin login',async()=>{
  const home=mkdtempSync(join(tmpdir(),'molis-personal-http-'));
  const names=['MOLIS_WORK_ACCOUNT_CONFIG'];
  const old=names.map(name=>process.env[name]);names.forEach(name=>delete process.env[name]);
  const server=createMolisWorkWebServer({homeDirectory:home,controlToken:'synthetic-control-token-0123456789abcdef'});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address==='object');const origin=`http://127.0.0.1:${address.port}`;
  try{
    const account=await fetch(`${origin}/account`,{redirect:'manual'});assert.equal(account.status,303);
    const html=await(await fetch(origin)).text();assert.match(html,/data-account-entry/);assert.match(html,/api\/personal\/login/);assert.doesNotMatch(html,/data-account-link/);
    assert.doesNotMatch(html,/refresh_token|access_token/);
    const expectedStatus={configured:false,identity:null,accountChanged:false,ready:false,switching:false};
    const status=await fetch(`${origin}/api/personal/status`);
    assert.equal(status.status,200);
    assert.deepEqual(await status.json(),{
      ...expectedStatus,configReason:'missing_env',
      configHint:'当前未配置账号服务环境（缺少 MOLIS_WORK_ACCOUNT_CONFIG）。本地测试请使用账号环境启动脚本，或联系管理员提供专用测试配置。',
    });
    for(const malformed of ['{bad-json-test-private-value','[]','{}','null','{"foo":"bar"}']){
      process.env.MOLIS_WORK_ACCOUNT_CONFIG=malformed;
      const invalid=await fetch(`${origin}/api/personal/status`);
      assert.equal(invalid.status,200);
      const invalidStatus=await invalid.json();
      assert.deepEqual(invalidStatus,{
        ...expectedStatus,configReason:'invalid_json',
        configHint:'账号服务环境配置格式无效，请检查 MOLIS_WORK_ACCOUNT_CONFIG。',
      });
      assert.equal(Object.values(invalidStatus).includes(malformed),false);
    }
    delete process.env.MOLIS_WORK_ACCOUNT_CONFIG;
    const rejected=await fetch(`${origin}/api/personal/login`,{method:'POST',headers:{Origin:'https://attacker.example','content-type':'application/json'},body:'{}'});
    assert.equal(rejected.status,403);
  }finally{
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    names.forEach((name,i)=>{if(old[i]===undefined)delete process.env[name];else process.env[name]=old[i];});
    rmSync(home,{recursive:true,force:true});
  }
});

test('ASR-02 first launch shows the login entry and refuses an anonymous business workspace',async()=>{
  const home=mkdtempSync(join(tmpdir(),'molis-personal-local-'));
  const names=['MOLIS_WORK_ACCOUNT_CONFIG'];
  const old=names.map(name=>process.env[name]);
  const values=[JSON.stringify({...trialAccountConfig('https://auth.example.test','http://127.0.0.1:4173'),environmentKind:'TEST'})];
  names.forEach((name,i)=>process.env[name]=values[i]);
  const controlToken='synthetic-control-token-0123456789abcdef';
  const server=createMolisWorkWebServer({homeDirectory:home,controlToken});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address==='object');const origin=`http://127.0.0.1:${address.port}`;
  try{
    const first=await fetch(origin+'/?desktop=1',{redirect:'manual'});
    assert.notEqual(first.headers.get('location'),'/welcome?desktop=1');
    const welcome=await fetch(origin+'/welcome',{redirect:'manual'});assert.equal(welcome.status,303);assert.equal(welcome.headers.get('location'),'/');
    const html=await(await fetch(origin+'/')).text();assert.match(html,/data-account-entry/);assert.match(html,/api\/personal\/login/);assert.doesNotMatch(html,/data-account-link/);assert.doesNotMatch(html,/欢迎使用 molis-work/);
    const bad=await fetch(origin+'/api/personal/local',{method:'POST',headers:{Origin:'https://attacker.example'},body:'{}'});
    assert.equal(bad.status,403);
    const choice=await fetch(origin+'/api/personal/local?desktop=1',{method:'POST',headers:{Origin:origin,'content-type':'application/json','x-molis-work-control-token':controlToken,'x-molis-work-idempotency-key':'test-local-choice-001'},body:'{}'});
    assert.equal(choice.status,400);assert.equal(choice.headers.get('set-cookie'),null);
    assert.match((await choice.json()).error,/不能切换匿名工作区/);
    const headers={};
    const status=await fetch(origin+'/api/personal/status',{headers});
    assert.deepEqual(await status.json(),{configured:true,identity:null,accountChanged:false,ready:false,switching:false});
    const denied=await fetch(origin+'/api/settings/projects',{headers});assert.equal(denied.status,401,'anonymous installation control never reaches business data');
    const account=await fetch(origin+'/account',{headers,redirect:'manual'});assert.equal(account.headers.get('location'),'/');
    assert.equal(existsSync(join(home,'security','secrets.key')),false,'onboarding and local account must not open credentials');
    const next=await fetch(origin+'/',{headers,redirect:'manual'});assert.notEqual(next.headers.get('location'),'/welcome');
    assert.equal(existsSync(join(home,'security','secrets.key')),false,'local use must not create credential material');
    assert.equal(existsSync(join(home,'security','secrets.json')),false,'local use must not access an account store');
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
  assert.equal(existsSync(join(home,'security','secrets.json')),false,'refusal does not open credentials or a sync service');
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(home,{recursive:true,force:true});}
});

for(const replacement of ['native','same-browser'] as const)test(`ASR-03 delayed failed A status never returns B identity or credential after ${replacement} account replacement`,async t=>{
 const f=await accountRefreshFixture(t,accountProbeCore);let release!:()=>void,reached!:()=>void,sequence=0;
 const gate=new Promise<void>(resolve=>{release=resolve;}),waiting=new Promise<void>(resolve=>{reached=resolve;});
 const proof=readFileSync(join(f.home,NATIVE_SESSION_FILE),'utf8');
 const native=(path:string,post=false)=>fetch(f.origin+path,{method:post?'POST':'GET',redirect:'manual',headers:{Origin:f.origin,[NATIVE_SESSION_HEADER]:proof,'content-type':'application/json','x-molis-work-control-token':f.rootToken,'x-molis-work-idempotency-key':'status-native-'+(++sequence)},...(post?{body:'{}'}:{})});
 try{
  const alice=await f.login('alice');let state:string;
  if(replacement==='native'){
   const registered=await native('/api/personal/status?page=native-status-owner');assert.equal(registered.status,200);
   const start=await native('/api/personal/prepare?action=start&page=native-status-owner&intent=switch',true);assert.equal(start.status,200);const {id}=await start.json();
   const oldPage=await f.request('/api/personal/prepare?action=ack&page=account-refresh-page&id='+id,'POST');assert.equal(oldPage.status,200);
   const owner=await native('/api/personal/prepare?action=ack&page=native-status-owner&id='+id,true);assert.equal((await owner.json()).ready,true);
   f.setAuthUser('bob');const begin=await native('/api/personal/switch?page=native-status-owner&preparation='+id,true);assert.equal(begin.status,200);state=new URL((await begin.json()).loginUrl).searchParams.get('accountLogin')!;
  }else state=await f.begin('bob');
  f.authWaits.identity=async user=>{if(user==='alice'){reached();await gate;throw new Error('synthetic delayed identity network failure');}};
  const originalCookie=f.cookie,oldStatus=f.request('/api/personal/status');await waiting;
  const complete=await f.complete(state);assert.equal(complete.status,200);
  const current=await(await native('/api/personal/status')).json();assert.equal(current.identity.userId,'bob');assert.equal(current.ready,true);assert.notEqual(current.viewScope,alice.viewScope);
  release();const response=await oldStatus;assert.equal(response.status,200);const refused=await response.json();
  assert.equal(refused.accountChanged,true);assert.equal(refused.identity,null);assert.equal(refused.ready,false);assert.notEqual(refused.viewScope,current.viewScope);
  assert.doesNotMatch(JSON.stringify(refused),/"bob"/,'an old authenticated request cannot receive the current installation identity');
  const stale=await fetch(f.origin+'/api/personal/status',{headers:{Cookie:originalCookie}});assert.equal((await stale.json()).identity,null);
  assert.equal((await(await native('/api/personal/status')).json()).identity.userId,'bob','rejecting A does not revoke the current native account');
 }finally{release();await f.close();}
});

test('PCSYNC-OPT-06 internal forwarded writes and /api/sync/copy/execute immediately notify personal sync', async t => {
  const home = mkdtempSync(join(tmpdir(), 'sync-notify-internal-'));
  const peer = v2AccountPeer(() => 'alice');
  const upstream = peer.server;
  const listen = async (value: ReturnType<typeof createServer>, port = 0) => {
    await new Promise<void>(resolve => value.listen(port, '127.0.0.1', resolve));
    const address = value.address();
    assert.ok(address && typeof address === 'object');
    return 'http://127.0.0.1:' + address.port;
  };
  const close = async (value: ReturnType<typeof createServer>) => new Promise<void>(resolve => value.close(() => resolve()));
  await listen(upstream);
  const previousAccount = process.env.MOLIS_WORK_ACCOUNT_CONFIG;
  const previousLocal = process.env.MOLIS_WORK_SYNC_LOCAL;
  process.env.MOLIS_WORK_ACCOUNT_CONFIG = '';
  process.env.MOLIS_WORK_SYNC_LOCAL = '1';
  let spaceId = '';
  let policyRevision = 0;
  let selections: unknown[] = [];
  let rev = 0;
  const originalFetch = fetch;
  t.mock.method(globalThis, 'fetch', (async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== 'http://127.0.0.1:8788') return originalFetch(input, init);
    if (url.pathname === '/v1/policy' && init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as { selections: unknown[] };
      policyRevision++;
      selections = body.selections;
      return Response.json({ spaceId, revision: policyRevision, selections });
    }
    if (url.pathname === '/v1/round') {
      return syncRoundResponse({ spaceId, revision: policyRevision, selections: selections as never[] }, rev);
    }
    if (url.pathname === '/v1/quota') {
      return Response.json({ limitBytes: 100000000, usedBytes: 0 });
    }
    if (url.pathname === '/v1/changes' && init?.method === 'POST') {
      rev++;
      return Response.json({ accepted: true, revision: rev });
    }
    if (url.pathname === '/v1/changes') {
      return Response.json({ events: [], more: false });
    }
    return Response.json({ ok: true });
  }) as typeof fetch);

  let server: ReturnType<typeof createMolisWorkWebServer> | undefined;
  let mcpServer: MolisWorkServer | undefined;
  try {
    server = createMolisWorkWebServer({ homeDirectory: home });
    const rootToken = readFileSync(join(home, 'config/web-control-token'), 'utf8').trim();
    const origin = await listen(server);
    process.env.MOLIS_WORK_ACCOUNT_CONFIG = peer.configure(origin);
    let cookie = '';
    let token = rootToken;
    let seq = 0;
    const req = async (path: string, method = 'GET', body: object = {}, extra: Record<string, string> = {}) => {
      const response = await fetch(origin + path, {
        method,
        headers: {
          Cookie: cookie,
          Origin: origin,
          'content-type': 'application/json',
          'x-molis-work-control-token': token,
          'x-molis-work-idempotency-key': 'notify-' + (++seq),
          ...extra,
        },
        ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
        redirect: 'manual',
      });
      if (response.headers.get('set-cookie')?.startsWith('molis-work-session=')) {
        cookie = response.headers.get('set-cookie')!.split(';')[0]!;
      }
      assert.ok(response.status < 400, `HTTP ${response.status} on ${path}: ${response.status >= 400 ? await response.clone().text() : ''}`);
      return response;
    };
    const localProject = await withMolisWorkProjectCatalog({ homeDirectory: home }, c => c.createProject({ display_name: '待复制本地项目', actor_id: 'local-user' }));
    changeMcpClientCredential(home, 'runtime:codex', 'connect');
    const begun = await req('/api/personal/login', 'POST');
    await completeInstallationLogin((path, init) => req(path, 'POST', JSON.parse(String(init?.body)), Object.fromEntries(new Headers(init?.headers))), (await begun.json()).loginUrl, 'alice@example.test');
    await req('/api/personal/space?kind=personal', 'POST');
    const scopes = await (await req('/api/spaces')).json();
    spaceId = scopes.current.spaceId;
    token = readFileSync(join(home, 'spaces', spaceId, 'config/web-control-token'), 'utf8').trim();
    const initial = await (await req('/api/sync')).json();
    const projectSelection = initial.collections.find((c: { selection: { plugin_id: string } }) => c.selection.plugin_id === 'io.molis.work.module.projects.v1')!.selection;
    await req('/api/sync/device', 'PUT', { automatic: false });
    await req('/api/sync/policy', 'PUT', { spaceId, revision: 0, selections: [projectSelection] });
    await req('/api/sync/run', 'POST');
    const settledBeforeCopy = await (await req('/api/sync?view=indicator')).json();
    assert.equal(settledBeforeCopy.progress.pending, 0);

    // 1) POST /api/sync/copy/execute must trigger notifySyncChange so indicator immediately sees the copied project.
    const preview = await (await req('/api/sync/copy/preview', 'POST', { projectIds: [localProject.project_id] })).json();
    await req('/api/sync/copy/execute', 'POST', { projectIds: [localProject.project_id], fingerprint: preview.preview.fingerprint, operationId: 'copy-notify-1' });
    const afterCopy = await (await req('/api/sync?view=indicator')).json();
    assert.ok(afterCopy.progress.pending >= 1, `POST /api/sync/copy/execute must notify sync indicator, got ${JSON.stringify(afterCopy.progress)}`);

    // Drain pending uploads so indicator returns to 0.
    await req('/api/sync/run', 'POST');
    const settledBeforeMcp = await (await req('/api/sync?view=indicator')).json();
    assert.equal(settledBeforeMcp.progress.pending, 0);

    // 2) Internal forwarded write (MCP_CONTEXT_PATH) to personal space must also trigger notifySyncChange.
    mcpServer = new MolisWorkServer('runtime', null, {
      homeDirectory: home,
      webBaseUrl: origin,
      runtimeContext: { runtime_id: 'codex', stable_work_context_id: 'notify-session', host_declares_stable: true, workspace: null },
      molisWorkSessionId: null,
      nativeRuntimeSessionId: null,
      hostWorkContextId: 'notify-session',
      focus: null,
      panelId: null,
      projectSuggestionClues: [],
    }, undefined, origin);
    const created = await mcpServer.callTool('molis_work_v1_context_create_and_bind', {
      display_name: 'MCP转发触发同步项目',
      user_confirmed: true,
      idempotency_key: 'mcp-notify-create',
    });
    assert.equal((JSON.parse(created) as { status: string }).status, 'bound');
    const afterMcp = await (await req('/api/sync?view=indicator')).json();
    assert.ok(afterMcp.progress.pending >= 1, `internal forwarded MCP write must notify sync indicator, got ${JSON.stringify(afterMcp.progress)}`);
  } finally {
    await mcpServer?.close();
    if (server) await close(server);
    await close(upstream);
    if (previousAccount === undefined) delete process.env.MOLIS_WORK_ACCOUNT_CONFIG;
    else process.env.MOLIS_WORK_ACCOUNT_CONFIG = previousAccount;
    if (previousLocal === undefined) delete process.env.MOLIS_WORK_SYNC_LOCAL;
    else process.env.MOLIS_WORK_SYNC_LOCAL = previousLocal;
    rmSync(home, { recursive: true, force: true });
  }
});

test('P1-3 /api/sync/copy/* gates on account.preparing() and cold-starts surface(selected) without catalog lock conflict', async t => {
  const home = mkdtempSync(join(tmpdir(), 'sync-copy-cold-prep-'));
  const peer = v2AccountPeer(() => 'alice');
  const upstream = peer.server;
  const listen = async (value: ReturnType<typeof createServer>, port = 0) => {
    await new Promise<void>(resolve => value.listen(port, '127.0.0.1', resolve));
    const address = value.address();
    assert.ok(address && typeof address === 'object');
    return 'http://127.0.0.1:' + address.port;
  };
  const close = async (value: ReturnType<typeof createServer>) => new Promise<void>(resolve => value.close(() => resolve()));
  await listen(upstream);
  const previousAccount = process.env.MOLIS_WORK_ACCOUNT_CONFIG;
  const previousLocal = process.env.MOLIS_WORK_SYNC_LOCAL;
  process.env.MOLIS_WORK_ACCOUNT_CONFIG = '';
  process.env.MOLIS_WORK_SYNC_LOCAL = '1';
  let spaceId = '';
  const originalFetch = fetch;
  t.mock.method(globalThis, 'fetch', (async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== 'http://127.0.0.1:8788') return originalFetch(input, init);
    if (url.pathname === '/v1/round') {
      return syncRoundResponse({ spaceId, revision: 0, selections: [] }, 0);
    }
    if (url.pathname === '/v1/quota') return Response.json({ limitBytes: 100000000, usedBytes: 0 });
    return Response.json({ ok: true });
  }) as typeof fetch);

  let server: ReturnType<typeof createMolisWorkWebServer> | undefined;
  let coldServer: ReturnType<typeof createMolisWorkWebServer> | undefined;
  try {
    server = createMolisWorkWebServer({ homeDirectory: home });
    const rootToken = readFileSync(join(home, 'config/web-control-token'), 'utf8').trim();
    const origin = await listen(server);
    process.env.MOLIS_WORK_ACCOUNT_CONFIG = peer.configure(origin);
    let cookie = '';
    let token = rootToken;
    let seq = 0;
    const rawReq = async (base: string, path: string, method = 'GET', body?: object, extra: Record<string, string> = {}) => {
      const response = await fetch(base + path, {
        method,
        headers: {
          Connection: 'close',
          Cookie: cookie,
          Origin: base,
          'content-type': 'application/json',
          'x-molis-work-control-token': token,
          'x-molis-work-idempotency-key': 'copy-gate-' + (++seq),
          ...extra,
        },
        ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
        redirect: 'manual',
      });
      if (response.headers.get('set-cookie')?.startsWith('molis-work-session=')) {
        cookie = response.headers.get('set-cookie')!.split(';')[0]!;
      }
      return response;
    };

    const localProject = await withMolisWorkProjectCatalog({ homeDirectory: home }, c => c.createProject({ display_name: '冷启动复制项目', actor_id: 'local-user' }));
    const proof = readFileSync(join(home, NATIVE_SESSION_FILE), 'utf8');
    const nativeHeaders = { [NATIVE_SESSION_HEADER]: proof, 'x-molis-work-control-token': rootToken };
    const begun = await rawReq(origin, '/api/personal/login', 'POST', {}, nativeHeaders);
    assert.equal(begun.status, 200);
    await completeInstallationLogin((path, init) => rawReq(origin, path, 'POST', JSON.parse(String(init?.body)), { ...nativeHeaders, ...Object.fromEntries(new Headers(init?.headers)) }), (await begun.json()).loginUrl, 'alice@example.test');
    assert.equal((await rawReq(origin, '/api/personal/space?kind=personal', 'POST', {}, nativeHeaders)).status, 200);
    const statusBefore = await (await rawReq(origin, '/api/personal/status', 'GET', undefined, nativeHeaders)).json() as { browserSessionTicket: string };
    const attached = await rawReq(origin, '/api/personal/native-attach?ticket=' + statusBefore.browserSessionTicket, 'POST', {}, nativeHeaders);
    assert.equal(attached.status, 200);
    const scopes = await (await rawReq(origin, '/api/spaces')).json();
    spaceId = scopes.current.spaceId;
    token = readFileSync(join(home, 'spaces', spaceId, 'config/web-control-token'), 'utf8').trim();

    // 1) While account.preparing() is active (two pages registered, switch preparation started without acking page-b),
    //    /api/sync/copy/* MUST be refused with 409 immediately.
    assert.equal((await rawReq(origin, '/api/personal/status?page=prep-page-a', 'GET', undefined, nativeHeaders)).status, 200);
    assert.equal((await rawReq(origin, '/api/personal/status?page=prep-page-b', 'GET')).status, 200);
    const startPrep = await rawReq(origin, '/api/personal/prepare?action=start&page=prep-page-a&intent=switch', 'POST', {}, nativeHeaders);
    assert.equal(startPrep.status, 200);
    const { id: prepId } = await startPrep.json() as { id: string };

    for (const [method, path, payload] of [
      ['GET', '/api/sync/copy/projects', undefined],
      ['POST', '/api/sync/copy/preview', { projectIds: [localProject.project_id] }],
      ['POST', '/api/sync/copy/execute', { projectIds: [localProject.project_id], fingerprint: 'a'.repeat(64), operationId: 'blocked-during-prep' }],
    ] as const) {
      const blocked = await rawReq(origin, path, method, payload);
      assert.equal(blocked.status, 409, `${method} ${path} must return 409 while account.preparing() is true`);
    }
    // Cancel preparation cleanly before closing server 1.
    assert.equal((await rawReq(origin, `/api/personal/prepare?action=cancel&page=prep-page-a&id=${encodeURIComponent(prepId)}`, 'POST', {}, nativeHeaders)).status, 200);
    const port = Number(new URL(origin).port);
    await close(server);
    server = undefined;

    // 2) Cold start a fresh server on the same port where no personal surface or sync service has been opened yet;
    //    restore native session via /api/personal/status, then issue /api/sync/copy/preview + /api/sync/copy/execute
    //    concurrently with /api/settings/projects.
    coldServer = createMolisWorkWebServer({ homeDirectory: home });
    const coldOrigin = await listen(coldServer, port);
    process.env.MOLIS_WORK_ACCOUNT_CONFIG = peer.configure(coldOrigin);
    cookie = '';
    const coldProof = readFileSync(join(home, NATIVE_SESSION_FILE), 'utf8');
    const coldNative = { [NATIVE_SESSION_HEADER]: coldProof };
    token = readFileSync(join(home, 'config/web-control-token'), 'utf8').trim();
    const coldStatus = await rawReq(coldOrigin, '/api/personal/status', 'GET', undefined, coldNative);
    assert.equal(coldStatus.status, 200);
    assert.equal((await coldStatus.json() as { identity?: { userId?: string } }).identity?.userId, 'alice');
    token = readFileSync(join(home, 'spaces', spaceId, 'config/web-control-token'), 'utf8').trim();

    const [previewRes, spacesRes] = await Promise.all([
      rawReq(coldOrigin, '/api/sync/copy/preview', 'POST', { projectIds: [localProject.project_id] }, coldNative),
      rawReq(coldOrigin, '/api/settings/projects', 'GET', undefined, coldNative),
    ]);
    assert.equal(previewRes.status, 200, `cold-start /api/sync/copy/preview must succeed without 409 lock conflict: ${await previewRes.clone().text()}`);
    assert.equal(spacesRes.status, 200);
    const previewBody = await previewRes.json() as { preview: { fingerprint: string } };

    const execRes = await rawReq(coldOrigin, '/api/sync/copy/execute', 'POST', {
      projectIds: [localProject.project_id],
      fingerprint: previewBody.preview.fingerprint,
      operationId: 'cold-start-copy-1',
    }, coldNative);
    assert.equal(execRes.status, 200, `cold-start /api/sync/copy/execute must succeed: ${await execRes.clone().text()}`);
    const execBody = await execRes.json() as { receipt: { state: string } };
    assert.equal(execBody.receipt.state, 'complete');
  } finally {
    if (coldServer) await close(coldServer);
    if (server) await close(server);
    await close(upstream);
    if (previousAccount === undefined) delete process.env.MOLIS_WORK_ACCOUNT_CONFIG;
    else process.env.MOLIS_WORK_ACCOUNT_CONFIG = previousAccount;
    if (previousLocal === undefined) delete process.env.MOLIS_WORK_SYNC_LOCAL;
    else process.env.MOLIS_WORK_SYNC_LOCAL = previousLocal;
    rmSync(home, { recursive: true, force: true });
  }
});
