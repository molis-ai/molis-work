import { syncRoundResponse } from './sync-round.js';
import type {TestContext} from "node:test";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {PersonalSync,type SyncRegistration} from "@molis-ai/molis-work-module-sync-replication";
import {createSqliteReplica,initializeReplica,replicaSchemaSql,queueReplicaChange,ensureStorageSpace,personalStorageSpace} from "@molis-ai/molis-work-storage";
import {ActionError} from "@molis-ai/molis-work-plugin-sdk";
import type {SyncEvent,SyncMutation} from "@molis-ai/molis-work-contracts/platform/sync-transport";

export function createSyncItemFixture(t:TestContext,withMutation?:SyncRegistration['withMutation']){
 const home=mkdtempSync(join(tmpdir(),'molis-item-isolation-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
 const space=personalStorageSpace('https://auth.example.test','work','alice');ensureStorageSpace(home,space);
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(replicaSchemaSql());initializeReplica(db);db.exec('CREATE TABLE items(key TEXT PRIMARY KEY,value TEXT)');
 const selection={plugin_id:'io.example.notes',publisher_id:'example',publisher_signature:'test',collection_id:'notes',schema_version:1},events:SyncEvent[]=[];
 let badRead=false,badDecode=true,unavailable=false,unavailableEncode=false,syntax=false;
 const replica=createSqliteReplica(db,{authorize(){},read(key){if(key==='broken'&&syntax)throw new SyntaxError('PRIVATE_DIAGNOSTIC_SENTINEL');if(key==='broken'&&unavailable)throw new ActionError('actions.plugin_unavailable','这项资产正在本机处理');if(key==='broken'&&badRead)throw new ActionError('actions.input_invalid','这项源内容损坏');return db.prepare('SELECT value FROM items WHERE key=?').get(key)?.value??null;},apply(key,value){if(key==='broken'&&syntax)throw new SyntaxError('PRIVATE_DIAGNOSTIC_SENTINEL');db.prepare('INSERT OR REPLACE INTO items VALUES (?,?)').run(key,value as string);}});
  const prepared:{key:string;retry:boolean}[]=[];
 const make=()=>new PersonalSync({home,spaceId:space.spaceId,endpoint:'https://sync.example.test',authority:{signal:new AbortController().signal,assertCurrent(){},async accessToken(){return 'test';}},registrations:[{selection,title:'Notes',withMutation,async refresh(){},async prepare(event,options){prepared.push({key:event.key,retry:options?.retry===true});},withReplica:run=>run(replica),content:{encode(key,value){if(key==='broken'&&unavailableEncode)throw new ActionError('actions.plugin_unavailable','这项资产正文暂不可读');return {value,blobs:[]};},async decode(key,value){if(key==='broken'&&syntax)throw new SyntaxError('PRIVATE_DIAGNOSTIC_SENTINEL');if(key==='broken'&&unavailable)throw new ActionError('actions.plugin_unavailable','这项资产正在本机处理');if(key==='broken'&&badDecode)throw new ActionError('actions.input_invalid','未知内容格式');return value;}}}],fetch:async(input,init)=>{
  const url=new URL(String(input));
  if(url.pathname==='/v1/round')return syncRoundResponse({spaceId:space.spaceId,revision:1,selections:[selection]},events.at(-1)?.revision??0);
  if(url.pathname==='/v1/quota')return Response.json({limitBytes:100000000,usedBytes:0});
  if(url.pathname==='/v1/policy')return Response.json({spaceId:space.spaceId,revision:1,selections:[selection]});
  if(init?.method==='POST'){const {mutation}=JSON.parse(String(init.body)) as {mutation:SyncMutation};if(!events.some(e=>e.operationId===mutation.operationId))events.push({...mutation,revision:events.length+1});return Response.json({accepted:true,revision:events.find(e=>e.operationId===mutation.operationId)!.revision});}
  return Response.json({events:events.filter(e=>e.revision>Number(url.searchParams.get('after'))),more:false});
 }});
 let client=make();t.after(()=>client.close());
 const edit=(key:string,value:string)=>{db.prepare('INSERT OR REPLACE INTO items VALUES (?,?)').run(key,value);queueReplicaChange(db,key);};
 return {db,replica,events,selection,edit,prepared,get client(){return client;},restart(){client.close();client=make();},setBadRead(value:boolean){badRead=value;},setUnavailable(value:boolean){unavailable=value;},setUnavailableEncode(value:boolean){unavailableEncode=value;},setSyntax(value:boolean){syntax=value;},repair(){badDecode=false;badRead=false;}};
}
