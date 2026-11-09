import {personalStorageSpace} from "@molis-ai/molis-work-storage";
import {createTrialAuthPeer,trialAccountConfig} from '../../examples/personal-trial-tools/mock-auth.mjs';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import type {TestContext} from 'node:test';
import {createSpaceWebServer,type SpaceWebSurface,type WebServerOptions} from '@molis-ai/molis-work-app-local-host';

/** Real installation account entry and Auth exchange; only the scoped business core and remote Auth are test doubles. */
export async function accountRefreshFixture(t:TestContext,createCore:(home:string,options:WebServerOptions)=>SpaceWebSurface){
 const home=mkdtempSync(join(tmpdir(),'account-refresh-')),authOrigin='https://auth.example.test';
 const env={MOLIS_WORK_ACCOUNT_CONFIG:''};
 const before=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 let state='',user='alice';const original=fetch;
 const authWaits:{token?:(user:string)=>Promise<void>;identity?:(user:string)=>Promise<void>}={};
 let config:ReturnType<typeof trialAccountConfig>;
 const peer=createTrialAuthPeer({configuration:()=>config,user:()=>user,waits:authWaits});
 t.mock.method(globalThis,'fetch',(async(input,init)=>new URL(String(input)).origin===authOrigin?peer.fetch(input,init):original(input,init)) as typeof fetch);
 const token='synthetic-refresh-control-token-0123456789';
 const server=createSpaceWebServer({homeDirectory:home,controlToken:token},options=>createCore(options.homeDirectory!,options),undefined,{
  render:()=>'<p data-account-entry>登录</p>',asset:()=>false,
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address==='object');
 const origin='http://127.0.0.1:'+address.port;config={...trialAccountConfig(authOrigin,origin,'work','web-test'),environmentKind:'TEST'};process.env.MOLIS_WORK_ACCOUNT_CONFIG=JSON.stringify(config);let cookie='',control=token,sequence=0;
 const page='account-refresh-page';
 const request=async(path:string,method='GET',headers:Record<string,string>={},body:unknown={})=>{
  const response=await fetch(origin+path,{method,redirect:'manual',headers:{Cookie:cookie,Origin:origin,'content-type':'application/json','x-molis-work-control-token':control,'x-molis-work-idempotency-key':'refresh-'+(++sequence),...headers},...(method==='GET'?{}:{body:JSON.stringify(body)})});
  if(response.status===200&&/^\/api\/personal\/(login|switch)(?:\?|$)/.test(path)){const value=await response.clone().json();state=new URL(value.loginUrl).searchParams.get('accountLogin')!;}
  const set=response.headers.get('set-cookie');if(set?.startsWith('molis-work-session='))cookie=set.split(';')[0]!;
  return response;
 };
 const status=async()=>{const response=await request('/api/personal/status?page='+page);assert.equal(response.status,200);const value=await response.json();if(value.identity)control=readFileSync(join(home,"spaces",personalStorageSpace(authOrigin,value.identity.applicationId,value.identity.userId).spaceId,"config/web-control-token"),"utf8").trim();return value;};
 const prepare=async(intent:'switch'|'logout')=>{
  await status();const started=await request('/api/personal/prepare?action=start&page='+page+'&intent='+intent,'POST');assert.equal(started.status,200,await started.clone().text());
  const {id}=await started.json();const ack=await request('/api/personal/prepare?action=ack&page='+page+'&id='+id,'POST');assert.equal(ack.status,200);assert.equal((await ack.json()).ready,true);return '&page='+page+'&preparation='+id;
 };
 const begin=async(next:string)=>{const previous=await status();const prepared=previous.identity?await prepare('switch'):'';user=next;const response=await request('/api/personal/'+(previous.identity?'switch':'login')+'?returnTo=%2F'+prepared,'POST');assert.equal(response.status,200,await response.clone().text());state=new URL((await response.json()).loginUrl).searchParams.get('accountLogin')!;return state;};
 const complete=async(current:string)=>{
   const headers={'x-molis-account-login':current};
   const created=await request('/api/account/auth/transactions','POST',headers,{purpose:'LOGIN',method:'EMAIL_PASSWORD'});
   if(created.status!==200)return created;
   const {data:t}=await created.json(),path='/api/account/auth/transactions/'+t.handle+'/submit';
   const verified=await request(path,'POST',headers,{step:'PASSWORD_LOGIN',email:user+'@example.test',password:'synthetic-fixture-password'});
   if(verified.status!==200)return verified;
   return request(path,'POST',headers,{step:'COMPLETE'});
 };
 const login=async(next:string)=>{const current=await begin(next);const response=await complete(current);assert.equal(response.status,200,await response.clone().text());return status();};
 const logout=async()=>{const prepared=await prepare('logout');const response=await request('/api/personal/logout?'+prepared.slice(1),'POST');return response;};
 let closing:Promise<void>|undefined;
 const close=()=>closing??=(async()=>{
  try{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  finally{for(const[key,value]of Object.entries(before))if(value===undefined)delete process.env[key];else process.env[key]=value;rmSync(home,{recursive:true,force:true});}
 })();
 return {home,authOrigin,server,origin,authWaits,rootToken:token,setAuthUser:(value:string)=>{user=value;},get loginState(){return state;},request,status,begin,complete,login,logout,prepare,close,get control(){return control;},get cookie(){return cookie;}};
}

export const accountProbeCore=(home:string)=>createServer((_request,response)=>response.end(home)) as SpaceWebSurface;
