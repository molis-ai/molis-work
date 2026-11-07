import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import type {TestContext} from 'node:test';
import {createSpaceWebServer,type SpaceWebSurface,type WebServerOptions} from '@molis-ai/molis-work-app-local-host';

/** Real installation account entry and Auth exchange; only the scoped business core and remote Auth are test doubles. */
export async function accountRefreshFixture(t:TestContext,createCore:(home:string,options:WebServerOptions)=>SpaceWebSurface){
 const home=mkdtempSync(join(tmpdir(),'account-refresh-')),authOrigin='https://auth.example.test';
 const env={MOLIS_WORK_AUTH_ORIGIN:authOrigin,MOLIS_WORK_AUTH_CLIENT_ID:'web-test'};
 const before=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 let state='',user='alice';const original=fetch;
 const authWaits:{token?:(user:string)=>Promise<void>;identity?:(user:string)=>Promise<void>}={};
 t.mock.method(globalThis,'fetch',(async(input,init)=>{
  const url=new URL(String(input));if(url.origin!==authOrigin)return original(input,init);
  if(url.pathname==='/api/v1/auth/transactions'){state=JSON.parse(String(init?.body)).state;return Response.json({data:{loginUrl:authOrigin+'/login'}});}
  if(url.pathname==='/oauth2/token'){await authWaits.token?.(user);return Response.json({access_token:'synthetic-'+user,refresh_token:'synthetic-refresh',expires_in:3600});}
  if(url.pathname==='/api/v1/users/me'){const name=(new Headers(init?.headers).get('authorization')??'').replace('Bearer synthetic-','');await authWaits.identity?.(name);return Response.json({data:{userId:name,displayName:name,emails:[],applicationId:'work',clientId:'web-test'}});}
  return Response.json({});
 }) as typeof fetch);
 const token='synthetic-refresh-control-token-0123456789';
 const server=createSpaceWebServer({homeDirectory:home,controlToken:token},options=>createCore(options.homeDirectory!,options),undefined,{
  render:()=>'<p data-account-entry>登录</p>',asset:()=>false,
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address==='object');
 const origin='http://127.0.0.1:'+address.port;let cookie='',control=token,sequence=0;
 const page='account-refresh-page';
 const request=async(path:string,method='GET',headers:Record<string,string>={})=>{
  const response=await fetch(origin+path,{method,redirect:'manual',headers:{Cookie:cookie,Origin:origin,'content-type':'application/json','x-molis-work-control-token':control,'x-molis-work-idempotency-key':'refresh-'+(++sequence),...headers},...(method==='GET'?{}:{body:'{}'})});
  const set=response.headers.get('set-cookie');if(set?.startsWith('molis-work-session='))cookie=set.split(';')[0]!;
  return response;
 };
 const status=async()=>{const response=await request('/api/personal/status?page='+page);assert.equal(response.status,200);const value=await response.json();if(value.viewToken)control=value.viewToken;return value;};
 const prepare=async(intent:'switch'|'logout')=>{
  await status();const started=await request('/api/personal/prepare?action=start&page='+page+'&intent='+intent,'POST');assert.equal(started.status,200,await started.clone().text());
  const {id}=await started.json();const ack=await request('/api/personal/prepare?action=ack&page='+page+'&id='+id,'POST');assert.equal(ack.status,200);assert.equal((await ack.json()).ready,true);return '&page='+page+'&preparation='+id;
 };
 const begin=async(next:string)=>{const previous=await status();const prepared=previous.identity?await prepare('switch'):'';user=next;const response=await request('/api/personal/'+(previous.identity?'switch':'login')+'?returnTo=%2F'+prepared,'POST');assert.equal(response.status,200,await response.clone().text());return state;};
 const complete=(current:string)=>request('/account/callback?code=synthetic&state='+current);
 const login=async(next:string)=>{const current=await begin(next);const response=await complete(current);assert.equal(response.status,303,await response.clone().text());return status();};
 const logout=async()=>{const prepared=await prepare('logout');const response=await request('/api/personal/logout?'+prepared.slice(1),'POST');return response;};
 let closing:Promise<void>|undefined;
 const close=()=>closing??=(async()=>{
  try{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  finally{for(const[key,value]of Object.entries(before))if(value===undefined)delete process.env[key];else process.env[key]=value;rmSync(home,{recursive:true,force:true});}
 })();
 return {home,authOrigin,server,origin,authWaits,rootToken:token,setAuthUser:(value:string)=>{user=value;},get loginState(){return state;},request,status,begin,complete,login,logout,prepare,close,get control(){return control;},get cookie(){return cookie;}};
}

export const accountProbeCore=(home:string)=>createServer((_request,response)=>response.end(home)) as SpaceWebSurface;
