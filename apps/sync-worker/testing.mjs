import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {personalStorageSpace} from '@molis-ai/molis-work-storage';

/** Synthetic upstream + ephemeral D1 only. No Cloudflare credentials or live Auth. */
export async function cloudFixture(t,{authOrigin='https://auth.example.test',mode='cloud',schema=true}={}) {
  const {Miniflare,Response,convertV4MiniflareOptions}=await import(process.env.MOLIS_SYNC_MINIFLARE_MODULE||'miniflare');
  const requests=[];
  const options={modulesRoot:fileURLToPath(new URL('./dist/',import.meta.url)),modules:[{type:'ESModule',path:fileURLToPath(new URL('./dist/index.js',import.meta.url))},{type:'CompiledWasm',path:fileURLToPath(new URL('./dist/index_bg.wasm',import.meta.url))}],compatibilityDate:'2026-09-19',d1Persist:false,r2Persist:false,r2Buckets:{BLOBS:"isolated-blobs"},d1Databases:{DB:'cloud-quota-test'},bindings:{DEPLOYMENT_MODE:mode,AUTH_ORIGIN:authOrigin,APPLICATION_ID:'work'},outboundService:async request=>{
    requests.push(request.url);assert.equal(new URL(request.url).origin,new URL(authOrigin).origin);
    const user=request.headers.get('Authorization')?.replace('Bearer ','');
    if(user==='redirect')return new Response(null,{status:302,headers:{Location:'https://other.example.test/token-leak'}});
    if(!['alice','bob','wrong-app'].includes(user))return Response.json({error:'invalid'},{status:401});
    return Response.json({data:{userId:user,applicationId:user==='wrong-app'?'other':'work'}});
  }};
  const mf=new Miniflare(convertV4MiniflareOptions(options));
  t.after(()=>mf.dispose());
  let db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BLOBS');
  if(schema){
    const sql=readFileSync(new URL('../../server/migrations/sync/0001_sync.sql',import.meta.url),'utf8');
    for(const [statement] of sql.matchAll(/CREATE TRIGGER[\s\S]*?\nEND;|CREATE (?:TABLE|INDEX)[\s\S]*?;|INSERT INTO sync_schema[\s\S]*?;/g))await db.prepare(statement).run();
  }
  const call=(path,user='alice',body,method=body===undefined?'GET':'POST',origin='https://sync.example.test')=>mf.dispatchFetch(origin+path,{method,headers:{Authorization:'Bearer '+user,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const space=user=>personalStorageSpace(authOrigin,'work',user).spaceId;
  const selection={plugin_id:'io.example.quota',publisher_id:'example',publisher_signature:'synthetic-only',collection_id:'records',schema_version:1};
  const namespace=JSON.stringify([selection.plugin_id,selection.publisher_id,selection.publisher_signature,selection.collection_id,selection.schema_version]);
  const enable=async(user='alice')=>{
    const policy={spaceId:space(user),revision:0,selections:[selection]};const result=await call('/v1/policy',user,policy,'PUT');assert.equal(result.status,200);return result.json();
  };
  const write=(operation,key,value,{user='alice',base=0,policyRevision=1,attachments=[]}={})=>call('/v1/changes',user,{namespace,policyRevision,mutation:{operationId:operation,key,base,value},attachments});
  const transport=(url,options={})=>{const headers=new Headers(options.headers);if(options.body instanceof Uint8Array)headers.set('Content-Length',String(options.body.byteLength));return mf.dispatchFetch(String(url),{...options,headers});};
  const writeMode=async value=>{options.bindings.SYNC_WRITE_MODE=value;await mf.setOptions(convertV4MiniflareOptions(options));db=await mf.getD1Database('DB');bucket=await mf.getR2Bucket('BLOBS');};
  return {get db(){return db;},call,space,namespace,selection,enable,write,requests,transport,writeMode,get bucket(){return bucket;},scheduled:async()=>{const worker=await mf.getWorker();return worker.scheduled({cron:'17 * * * *',scheduledTime:Date.now()});}};
}
