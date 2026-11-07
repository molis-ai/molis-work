import { syncRoundResponse } from './fixtures/sync-round.js';
import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {PersonalSync,syncNamespace,type SyncRegistration,type SyncSelection} from '@molis-ai/molis-work-module-sync-replication';
import {personalStorageSpace,ensureStorageSpace,replicaSchemaSql,initializeReplica,createSqliteReplica,queueReplicaChange} from '@molis-ai/molis-work-storage';
import type {SyncEvent,SyncMutation} from '@molis-ai/molis-work-contracts/platform/sync-transport';

function fixture(t:TestContext){
 const home=mkdtempSync(join(tmpdir(),'sync-selection-deps-')),space=personalStorageSpace('https://auth.example','work','user');ensureStorageSpace(home,space);t.after(()=>rmSync(home,{recursive:true,force:true}));
 const selection=(id:string):SyncSelection=>({plugin_id:'io.example.records',publisher_id:'example',publisher_signature:'fixed-publisher',collection_id:id,schema_version:1}),ids=['messages','sources','independent'],selections=ids.map(selection),events=new Map<string,SyncEvent[]>(),reads=new Map<string,number>(),requests:string[]=[];
 const registrations:SyncRegistration[]=ids.map((id,n)=>{const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(replicaSchemaSql());initializeReplica(db);queueReplicaChange(db,id);
  const replica=createSqliteReplica(db,{authorize(){},read(){reads.set(id,(reads.get(id)??0)+1);return {id,saved:'unique content'};},apply(){throw new Error('Own receipts must not reapply business contents');}});
  return {selection:selections[n]!,title:id,dependencies:n===0?[selections[1]!]:[],async refresh(){},async prepare(){},withReplica:run=>run(replica)};
 });
 let remote={spaceId:space.spaceId,revision:1,selections:[selections[0]!,selections[2]!]};
 const client=new PersonalSync({home,spaceId:space.spaceId,endpoint:'https://sync.example.test',registrations,authority:{signal:new AbortController().signal,assertCurrent(){},async accessToken(){return 'synthetic';}},fetch:async(input,init)=>{
  const url=new URL(String(input));requests.push((init?.method??'GET')+' '+url.pathname);
  if(url.pathname==='/v1/round')return syncRoundResponse(remote,s=>(events.get(JSON.stringify([s.plugin_id,s.publisher_id,s.publisher_signature,s.collection_id,s.schema_version]))??[]).at(-1)?.revision??0);
  if(url.pathname==='/v1/quota')return Response.json({limitBytes:100000000,usedBytes:0});
  if(url.pathname==='/v1/policy'){if(init?.method==='PUT')remote={...JSON.parse(String(init.body)),revision:remote.revision+1};return Response.json(remote);}
  const namespace=url.searchParams.get('namespace');
  if(init?.method==='POST'){const body=JSON.parse(String(init.body)) as {namespace:string;mutation:SyncMutation},list=events.get(body.namespace)??[],existing=list.find(e=>e.operationId===body.mutation.operationId),event=existing??{...body.mutation,revision:list.length+1};if(!existing)list.push(event);events.set(body.namespace,list);return Response.json({accepted:true,revision:event.revision});}
  return Response.json({events:(events.get(namespace??'')??[]).filter(e=>e.revision>Number(url.searchParams.get('after'))),more:false});
 }});t.after(()=>client.close());
 return {client,selections,registrations,requests,reads,events,policy:()=>remote,validRemote(){remote={...remote,selections};}};
}
test('PCSYNC-03/22 collection prerequisites are exact registered selections; saving never silently opts into them',async t=>{
 const f=fixture(t);await assert.rejects(()=>f.client.save(f.policy()),{code:'sync_replication.sync_dependencies'});assert.equal(f.requests.length,0,'reject before a cloud request or owner read');assert.equal(f.reads.size,0);assert.equal(f.client.policy().selections.length,0);
 await assert.rejects(()=>f.client.save({...f.policy(),selections:[f.selections[0]!,{...f.selections[1]!,publisher_signature:'other-publisher'}]}));assert.equal(f.requests.length,0);
 await f.client.save({...f.policy(),selections:f.selections});assert.deepEqual(f.client.policy().selections,f.selections);assert.equal(f.requests.length,1,'saving valid selections does not transfer business content');
});
test('PCSYNC-03/14 incomplete remote prerequisites stop only their consumer, preserving its original queue while healthy assets sync',async t=>{
 const f=fixture(t);await f.client.run();assert.equal(f.reads.get('messages')??0,0);assert.equal(f.events.get(syncNamespace(f.selections[0]!)),undefined);assert.equal(f.events.get(syncNamespace(f.selections[2]!))?.length,1);assert.match(f.client.status().error??'',/sources/);
 f.validRemote();await f.client.run();assert.equal(f.events.get(syncNamespace(f.selections[0]!))?.length,1);assert.equal(f.events.get(syncNamespace(f.selections[1]!))?.length,1);assert.equal(f.client.status().error,null);
});
