import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMolisWorkWebServer } from '../apps/desktop/launchers/web/server.js';
import { createServer } from 'node:http';
import { personalReturnPath } from '../apps/local-host/src/personal-http.js';
import { PERSONAL_ACCOUNT_CLIENT_SCRIPT } from '../apps/workbench/src/scripts/personal-account.js';
import { PersonalWebSessions } from '../apps/local-host/src/personal-web-sessions.js';
import { createPersonalNativeSession, NATIVE_SESSION_FILE, NATIVE_SESSION_HEADER } from '../apps/local-host/src/personal-native-session.js';

test('native identity requires an owner-only header capability, never a cookie or desktop hint',()=>{
  const home=mkdtempSync(join(tmpdir(),'molis-native-proof-'));
  try {
    const verify=createPersonalNativeSession(home);
    const token=readFileSync(join(home,NATIVE_SESSION_FILE),'utf8');
    if(process.platform!=='win32')assert.equal(statSync(join(home,NATIVE_SESSION_FILE)).mode&0o777,0o600);
    const request=(headers:Record<string,string|string[]>)=>({headers}) as any;
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
  let transaction:any, remote='';
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
  let transaction:any, user='alice';
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
    const stolen=await fetch(origin+'/account/callback?code=synthetic&state='+transaction.state,{redirect:'manual'});assert.equal(stolen.status,401);
    const invalid=await browser('/account/callback?code=synthetic&state=wrong',{redirect:'manual'});assert.equal(invalid.status,400);
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
