import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {createServer} from 'node:http';
import {createSpaceWebServer,type SpaceWebSurface} from '@molis-ai/molis-work-app-local-host';
import {personalStorageSpace} from '@molis-ai/molis-work-storage';

test('a surface delayed behind disposal cannot bootstrap the old account Home with the replacement login lease',async t=>{
  const home=mkdtempSync(join(tmpdir(),'space-retire-race-')),authOrigin='https://auth.example.test';
  const env={MOLIS_WORK_AUTH_ORIGIN:authOrigin,MOLIS_WORK_AUTH_CLIENT_ID:'web-test',MOLIS_WORK_CLOUD_ORIGIN:authOrigin};
  const before=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
  let state='',user='alice';const original=fetch;
  t.mock.method(globalThis,'fetch',(async(input,init)=>{
    const url=new URL(String(input));if(url.origin!==authOrigin)return original(input,init);
    if(url.pathname==='/api/v1/auth/transactions'){state=JSON.parse(String(init?.body)).state;return Response.json({data:{loginUrl:authOrigin+'/login'}});}
    if(url.pathname==='/oauth2/token')return Response.json({access_token:'synthetic-'+user,refresh_token:'synthetic-refresh',expires_in:3600});
    if(url.pathname==='/api/v1/users/me')return Response.json({data:{userId:user,displayName:user,emails:[],applicationId:'work',clientId:'web-test'}});
    return Response.json({});
  }) as typeof fetch);
  const alice=personalStorageSpace(authOrigin,'work','alice').spaceId;
  let release!:()=>void;const disposed=new Promise<void>(resolve=>{release=resolve;});
  const opened:string[]=[];
  const token='synthetic-race-root-control-token-0123456789';
  const server=createSpaceWebServer({homeDirectory:home,controlToken:token},options=>{
    const name=basename(options.homeDirectory!);opened.push(name);
    const core=createServer((_request,response)=>{response.end(name);}) as SpaceWebSurface;
    core.spaceDisposed=name===alice?disposed:Promise.resolve();return core;
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address==='object');
  const origin='http://127.0.0.1:'+address.port;let cookie='',control=token,sequence=0;
  const request=async(path:string,method='GET')=>{
    const response=await fetch(origin+path,{method,redirect:'manual',headers:{Cookie:cookie,Origin:origin,'content-type':'application/json','x-molis-work-control-token':control,'x-molis-work-idempotency-key':'account-race-'+(++sequence)},...(method==='GET'?{}:{body:'{}'})});
    const set=response.headers.get('set-cookie');if(set?.startsWith('molis-work-session='))cookie=set.split(';')[0]!;
    return response;
  };
  const okay=async(path:string,method='GET')=>{const response=await request(path,method);assert.ok(response.status<400,await response.clone().text());return response;};
  try {
    await okay('/api/personal/login','POST');await okay('/account/callback?code=alice&state='+state);
    await okay('/api/personal/space?kind=personal','POST');control=(await(await okay('/api/personal/status')).json()).viewToken;
    assert.equal(await(await okay('/probe')).text(),alice);
    await okay('/api/personal/space?kind=local','POST');control=token;
    await okay('/api/personal/space?kind=personal','POST');control=(await(await okay('/api/personal/status')).json()).viewToken;
    let reached!:()=>void;const pendingReached=new Promise<void>(resolve=>{reached=resolve;});
    server.on('request',request=>{if(request.url==='/probe?pending')reached();});
    const pending=request('/probe?pending');await pendingReached;
    await okay('/api/personal/switch','POST');user='bob';await okay('/account/callback?code=bob&state='+state);
    release();assert.equal((await pending).status,403);
    assert.equal(opened.filter(name=>name===alice).length,1,'no second Alice core may start under the Bob login');
    control=(await(await request('/api/personal/status')).json()).viewToken;
    assert.equal(await(await okay('/probe')).text(),personalStorageSpace(authOrigin,'work','bob').spaceId);
  } finally {
    release();await new Promise<void>(resolve=>server.close(()=>resolve()));
    for(const [key,value]of Object.entries(before))if(value===undefined)delete process.env[key];else process.env[key]=value;
    rmSync(home,{recursive:true,force:true});
  }
});
