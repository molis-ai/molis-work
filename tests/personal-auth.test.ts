import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { PersonalAuth, personalCloudConfig } from "@molis-ai/molis-work-app-local-host";
import type { SecretStore } from "@molis-ai/molis-work-storage";

const config={authOrigin:'https://auth.example',clientId:'molis-work-desktop'};
test('login configuration needs Auth only, not a personal-sync cloud server', () => {
  assert.deepEqual(personalCloudConfig({MOLIS_WORK_AUTH_ORIGIN:config.authOrigin,
    MOLIS_WORK_AUTH_CLIENT_ID:config.clientId}), config);
});

test('Auth profiles for another login client are rejected without saving tokens', async () => {
  const f=fixture();
  const http:typeof fetch=async(url,init)=>String(url).endsWith('/api/v1/users/me')
    ? Response.json({data:{userId:'alice',displayName:'Alice',emails:[],applicationId:'work',clientId:'another-client'}})
    : f.http(url,init);
  const auth=new PersonalAuth(config,f.store,http);
  await auth.begin('http://127.0.0.1:4173/account/callback');
  await assert.rejects(auth.complete('code',f.transaction.state),/LOGIN_REQUIRED/);
  assert.equal(auth.identity(),null);
});
function fixture(desktop = false) {
  const activeConfig={...config,...(desktop?{desktopClientId:'molis-work-desktop-local'}:{})};
  const values=new Map<string,string>();let transaction!:{state:string;codeChallenge:string;clientId:string;forceLogin?:boolean};let tokenCalls=0;let now=1000;let failRefresh=false;let identityFailure='';let logoutFailure=false;
  const store={get:(key:string)=>values.get(key)??null,put:(key:string,value:string)=>values.set(key,value),delete:(key:string)=>values.delete(key)};
  const http:typeof fetch=async(url,init)=>{
    if(String(url).endsWith('/transactions')){transaction=JSON.parse(String(init?.body));return Response.json({data:{loginUrl:'https://auth.example/login#transaction=synthetic'}});}
    if(String(url).endsWith('/oauth2/token')){
      tokenCalls++;const fields=new URLSearchParams(String(init?.body));
      assert.equal(fields.get('client_id'),desktop?activeConfig.desktopClientId:config.clientId);
      if(fields.get('grant_type')==='authorization_code')assert.equal(createHash('sha256').update(fields.get('code_verifier')!).digest('base64url'),transaction.codeChallenge);
      else if(failRefresh)throw new Error('response lost');
      return Response.json({access_token:`synthetic-access-${tokenCalls}`,refresh_token:`synthetic-refresh-${tokenCalls}`,expires_in:120});
    }
    if(String(url)==='https://auth.example/api/v1/users/me'){
      if(identityFailure==='network')throw new Error('offline');
      if(identityFailure==='revoked')return Response.json({}, {status:401});
      return Response.json({data:{userId:'alice',displayName:'Alice',emails:['alice@example.test'],applicationId:'work',clientId:desktop?activeConfig.desktopClientId:config.clientId}});
    }
    if(logoutFailure)throw new Error('offline');
    return Response.json({});
  };
  const auth=new PersonalAuth(activeConfig,store,http,()=>now);
  return {auth,values,store,http,get transaction(){return transaction;},get tokenCalls(){return tokenCalls;},advance:()=>now+=70000,fail:()=>failRefresh=true,failIdentity:(mode:string)=>identityFailure=mode,failLogout:()=>logoutFailure=true};
}

test('login uses PKCE, consumes callback once and stores credentials outside UI identity',async()=>{
  const f=fixture();await f.auth.begin('http://127.0.0.1:4173/account/callback');
  await assert.rejects(f.auth.complete('code','wrong-state'),/INVALID_LOGIN_CALLBACK/);
  const identity=await f.auth.complete('code',f.transaction.state);
  assert.equal(identity.userId,'alice');assert.ok(!JSON.stringify(identity).includes('synthetic-access'));
  await assert.rejects(f.auth.complete('code',f.transaction.state),/INVALID_LOGIN_CALLBACK/);
  const restarted=new PersonalAuth(config,f.store,f.http);assert.equal(restarted.identity()?.userId,'alice');
  await f.auth.logout();assert.equal(f.values.size,0);assert.equal(f.auth.identity(),null);
});

test('desktop login and refresh retain the registered desktop client rather than the web client',async()=>{
  const f=fixture(true);
  await f.auth.begin('http://127.0.0.1:4173/account/callback',true);
  assert.equal(f.transaction.clientId,'molis-work-desktop-local');
  await f.auth.complete('code',f.transaction.state);
  f.advance();await f.auth.accessToken();
  assert.equal(f.tokenCalls,2);
});

test('host suspension invalidates native work and pending callbacks without deleting saved login',async()=>{
  const f=fixture();
  await f.auth.begin('http://127.0.0.1:4173/account/callback');
  await f.auth.complete('code',f.transaction.state);
  const lease=f.auth.accountLease();
  await f.auth.begin('http://127.0.0.1:4173/account/callback');
  const state=f.transaction.state;
  f.auth.suspend();
  assert.equal(lease.signal.aborted,true);
  assert.throws(()=>lease.assertCurrent(),/REPLICA_ACCOUNT_MISMATCH/);
  await assert.rejects(f.auth.complete('code',state),/INVALID_LOGIN_CALLBACK/);
  assert.equal(new PersonalAuth(config,f.store,f.http).identity()?.userId,'alice');
});

test('switching forces a fresh Auth login and cancellation retains the existing account',async()=>{
  const f=fixture();await f.auth.begin('http://127.0.0.1:4173/account/callback');
  await f.auth.complete('code',f.transaction.state);
  await f.auth.begin('http://127.0.0.1:4173/account/callback',false,true);
  assert.equal(f.transaction.forceLogin,true);
  assert.equal(f.auth.identity()?.userId,'alice');
  f.auth.cancel(f.transaction.state);
  assert.equal(f.auth.identity()?.userId,'alice');
});

test('an older in-flight callback cannot overwrite a newer login attempt',async()=>{
  const f=fixture();let release!:()=>void;
  const gate=new Promise<void>(resolve=>release=resolve);
  const delayed:typeof fetch=async(url,init)=>{if(String(url).endsWith('/oauth2/token'))await gate;return f.http(url,init);};
  const auth=new PersonalAuth(config,f.store,delayed);
  await auth.begin('http://127.0.0.1:4173/account/callback');
  const finishing=auth.complete('code',f.transaction.state);
  // Do not replace the fixture transaction until the first exchange validates PKCE.
  const oldTransaction=f.transaction;
  const newer=auth.begin('http://127.0.0.1:4173/account/callback',false,true);
  // Use the old challenge for the synthetic delayed token endpoint.
  Object.assign(f.transaction,{codeChallenge:oldTransaction.codeChallenge});
  release();await newer;
  await assert.rejects(finishing,/LOGIN_CANCELLED/);assert.equal(auth.identity(),null);
});

test('refresh is single-flight and rotates; unknown outcome never replays old refresh',async()=>{
  const f=fixture();await f.auth.begin('http://127.0.0.1:4173/account/callback');await f.auth.complete('code',f.transaction.state);
  f.advance();const values=await Promise.all([f.auth.accessToken(),f.auth.accessToken(),f.auth.accessToken()]);
  assert.equal(new Set(values).size,1);assert.equal(f.tokenCalls,2);
  f.advance();f.fail();await assert.rejects(f.auth.accessToken());assert.equal(f.auth.identity()?.userId,"alice");
  assert.ok([...f.values.values()].every(value=>!value.includes("synthetic-refresh")));
  await assert.rejects(f.auth.accessToken(),/LOGIN_REQUIRED/);assert.equal(f.tokenCalls,3);
});

test('logout invalidates pending login and configuration refuses unsafe origins',async()=>{
  const f=fixture();await f.auth.begin('http://127.0.0.1:4173/account/callback');await f.auth.logout();
  await assert.rejects(f.auth.complete('code',f.transaction.state),/INVALID_LOGIN_CALLBACK/);
  assert.equal(personalCloudConfig({}),null);
  assert.throws(()=>personalCloudConfig({MOLIS_WORK_AUTH_ORIGIN:'https://auth.example'}),/INCOMPLETE/);
  assert.throws(()=>personalCloudConfig({MOLIS_WORK_AUTH_ORIGIN:'http://evil.example',MOLIS_WORK_AUTH_CLIENT_ID:'work',MOLIS_WORK_CLOUD_ORIGIN:'https://cloud.example'}),/INVALID_CLOUD_ORIGIN/);
  await assert.rejects(f.auth.begin('https://evil.example/account/callback'),/INVALID_LOGIN_CALLBACK/);
});

test('concurrent status checks wait for token rotation without reporting signed out',async()=>{
  const f=fixture();await f.auth.begin('http://127.0.0.1:4173/account/callback');await f.auth.complete('code',f.transaction.state);
  f.advance();const token=f.auth.accessToken();
  assert.equal(f.auth.identity()?.userId,'alice','space routing must retain the verified owner while refresh rotates');
  assert.doesNotThrow(()=>f.auth.accountLease().assertCurrent());
  const identities=await Promise.all([f.auth.currentIdentity(),f.auth.currentIdentity()]);
  await token;assert.deepEqual(identities.map(identity=>identity?.userId),['alice','alice']);assert.equal(f.tokenCalls,2);
});

test('status preserves offline identity but clears revoked credentials',async()=>{
  const f=fixture();await f.auth.begin('http://127.0.0.1:4173/account/callback');await f.auth.complete('code',f.transaction.state);
  const lease=f.auth.accountLease();
  f.failIdentity('network');await assert.rejects(f.auth.currentIdentity(),/offline/);assert.equal(f.auth.identity()?.userId,'alice');
  lease.assertCurrent();assert.equal(lease.signal.aborted,false);
  f.failIdentity('revoked');assert.equal(await f.auth.currentIdentity(),null);assert.equal(f.values.size,0);
  assert.equal(lease.signal.aborted,true);
});

test('PERSAF-01 uncertain refresh preserves offline ownership across restart without replaying the burned token',async()=>{
  const f=fixture();await f.auth.begin('http://127.0.0.1:4173/account/callback');
  await f.auth.complete('code',f.transaction.state);
  const lease=f.auth.accountLease();f.advance();f.fail();
  await assert.rejects(f.auth.currentIdentity(),/response lost/);
  assert.equal(f.auth.identity()?.userId,'alice');assert.equal(lease.signal.aborted,false);lease.assertCurrent();
  const requests=f.tokenCalls;
  const restarted=new PersonalAuth(config,f.store,f.http);
  assert.equal((await restarted.currentIdentity())?.userId,'alice');
  await assert.rejects(restarted.accessToken(),/LOGIN_REQUIRED/);
  assert.equal(f.tokenCalls,requests,'offline status never replays an uncertain refresh');
  assert.ok([...f.values.values()].every(value=>!value.includes('synthetic-refresh')&&!value.includes('synthetic-access')));
  await restarted.logout();assert.equal(restarted.identity(),null);assert.equal(f.values.size,0);
});

test('cancellation validates state and offline logout still clears local credentials',async()=>{
  const f=fixture();await f.auth.begin('http://127.0.0.1:4173/account/callback');
  assert.throws(()=>f.auth.cancel('wrong'),/INVALID_LOGIN_CALLBACK/);
  f.auth.cancel(f.transaction.state);await assert.rejects(f.auth.complete('code',f.transaction.state),/INVALID_LOGIN_CALLBACK/);
  await f.auth.begin('http://127.0.0.1:4173/account/callback');await f.auth.complete('code',f.transaction.state);
  f.failLogout();assert.equal(await f.auth.logout(),false);assert.equal(f.auth.identity(),null);
});
