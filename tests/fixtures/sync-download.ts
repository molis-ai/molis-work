import { syncRoundResponse } from './sync-round.js';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import type {SyncBlobSource,SyncEvent} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type {SpaceSyncPolicy} from '@molis-ai/molis-work-contracts/modules/sync-replication';

/** A bounded network substitute only. Business owners, file validation, Host composition and SQLite remain real. */
export function fixedSyncDownload(policy:SpaceSyncPolicy,event:SyncEvent&{attachments?:{digest:string;size:number}[]},blobs:readonly SyncBlobSource[],uploads:readonly SyncBlobSource[]=[]):typeof fetch{
 const original=globalThis.fetch,byDigest=new Map(blobs.map(b=>[b.digest,b]));
 const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
 return async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input));if(url.origin!=='https://sync.example.test')return original(input,init);
  const method=init?.method??'GET';
  if(url.pathname==='/v1/round')return syncRoundResponse(policy,event.revision);
  if(url.pathname==='/v1/policy')return Response.json(policy);
  if(url.pathname==='/v1/quota')return Response.json({limitBytes:100000000,usedBytes:0});
  if(url.pathname==='/v1/changes')return method==='GET'?Response.json({events:Number(url.searchParams.get('after')??0)<event.revision?[event]:[],more:false}):Response.json({accepted:true,revision:event.revision+1});
  if(url.pathname==='/v1/history/archive'){
   assert.equal(method,'POST');const payload=JSON.parse(String(init?.body));
   assert.equal(payload.namespace,JSON.stringify([policy.selections[0]!.plugin_id,policy.selections[0]!.publisher_id,policy.selections[0]!.publisher_signature,policy.selections[0]!.collection_id,policy.selections[0]!.schema_version]));
   assert.equal(payload.policyRevision,policy.revision);assert.equal(payload.mutation.key,event.key);assert.equal(payload.mutation.base,event.revision);assert.match(payload.mutation.operationId,/^conflict-[a-f0-9]{64}$/);
   for(const reference of payload.attachments){const source=byDigest.get(reference.digest)??uploads.find(b=>b.digest===reference.digest);assert.ok(source);assert.equal(reference.size,source.size);assert.equal(hash(source.bytes),source.digest);}
   return Response.json({accepted:true,revision:event.revision+1});
  }
  const digest=url.searchParams.get('digest')??(typeof init?.body==='string'?String(JSON.parse(init.body).digest):'');
  const blob=byDigest.get(digest)??uploads.find(b=>b.digest===digest);assert.ok(blob,'only declared, frozen fixture bytes can be requested');assert.equal(hash(blob.bytes),digest);
  if(url.pathname==='/v1/blobs/chunk'){assert.equal(method,'GET');const part=Number(url.searchParams.get('part'));return new Response(Buffer.from(blob.bytes.subarray(part*4194304,(part+1)*4194304)));}
  assert.ok(['/v1/blobs/status','/v1/blobs/reserve'].includes(url.pathname));
  const parts=[];for(let offset=0,part=0;offset<blob.size;offset+=4194304,part++)parts.push({part,checksum:hash(blob.bytes.subarray(offset,offset+4194304))});
  return Response.json({digest:blob.digest,size:blob.size,ready:true,parts});
 };
}
