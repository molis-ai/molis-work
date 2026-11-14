import { defaultPrefs } from '@molis-ai/molis-work-service-memory';
import { LOCAL_PERSON_ACTOR_ID } from '@molis-ai/molis-work-contracts/platform/actions';
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireStorageOwner,ensureStorageSpace,initializeMemoryForgetting,personalStorageSpace,openMemoryLedger } from '@molis-ai/molis-work-storage';
import { PersonalSync,syncNamespace,type SyncRegistration } from '@molis-ai/molis-work-module-sync-replication';
import type { SyncEvent,SyncMutation } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { createSyncConflictState } from '@molis-ai/molis-work-plugin-sdk';
import { pagesManifest } from '@molis-ai/molis-work-plugin-pages';
import { openPagesStore } from './plugin-sync-stores.js';
import { syncRoundResponse } from './sync-round.js';
const collection=pagesManifest.sync!.collections.find(row=>row.id==='documents')!;
export const pagesSyncSelection={plugin_id:pagesManifest.plugin_id,publisher_id:pagesManifest.publisher.publisher_id,publisher_signature:pagesManifest.publisher.signature,collection_id:collection.id,schema_version:collection.schema_version};
const selection=pagesSyncSelection;
export function personalSyncFixture(t:TestContext){
  const root=mkdtempSync(join(tmpdir(),'personal-sync-'));
  const space=personalStorageSpace('http://127.0.0.1:8787','work','alice');
  const homes=['a','b'].map(name=>join(root,name));homes.forEach(h=>{ensureStorageSpace(h,space);const owner=acquireStorageOwner(join(h,'agent-runtime'));try{initializeMemoryForgetting({homeDirectory:h,storageOwner:owner,assertCurrent(){}});}finally{owner.release();}const memory=openMemoryLedger({homeDirectory:h});try{memory.transaction(()=>{memory.savePrefs(LOCAL_PERSON_ACTOR_ID,'personal',defaultPrefs('personal','reviewed'));memory.savePrefs(LOCAL_PERSON_ACTOR_ID,'project-default',defaultPrefs('project','reviewed'));});}finally{memory.close();}});
  let active=true;
  const authorize=()=>{if(!active)throw new Error('REVOKED');};
  const context={spaceId:space.spaceId,canUploadProject:()=>true,hasArtifact:()=>true,hasReference:()=>true,authorize,conflictState:createSyncConflictState,project:()=>({title:'文档项目',context:{spaceId:space.spaceId,projectId:'project',authorize,hasReference:()=>true}})};
  const withStore=<T>(i:number,run:(store:ReturnType<typeof openPagesStore>)=>T)=>{const store=openPagesStore(homes[i]);try{return run(store);}finally{store.close();}};
  const withReplica=<T>(i:number,run:(r:ReturnType<ReturnType<typeof openPagesStore>['replica']>)=>T)=>withStore(i,s=>run(s.replica(context)));
  const registrations=homes.map((_,i):SyncRegistration=>({selection,title:'文档与文件夹',refresh:async()=>{},prepare:async()=>{},withReplica:run=>withReplica(i,run)}));
  const events:SyncEvent[]=[];const namespaces=new WeakMap<SyncEvent,string>();let revision=0,online=true,drop=false,usedBytes=0;
  const retained:Array<{namespace:string;mutation:SyncMutation;revision:number}>=[];
  let retentionHook:(route:string,payload:unknown)=>Promise<Response|undefined>=async()=>undefined;
  let beforeDownload:()=>void=()=>{};
  let afterQuotaSnapshot:()=>void=()=>{};
  let policy={spaceId:space.spaceId,revision:0,selections:[] as typeof selection[]};
  const transport:typeof fetch=async(input,init)=>{
    if(!online)throw new Error('OFFLINE');
    const url=new URL(String(input));const payload=init?.body?JSON.parse(String(init.body)):null;
    if(url.pathname==='/v1/round'){const snapshot=syncRoundResponse(policy,s=>events.filter(event=>namespaces.get(event)===syncNamespace(s)).at(-1)?.revision??0,usedBytes);afterQuotaSnapshot();return snapshot;}
    if(url.pathname==='/v1/quota')return Response.json({limitBytes:100000000,usedBytes});
    if(url.pathname==='/v1/policy'){
      if(init?.method==='PUT'){
        if(payload.revision!==policy.revision)return Response.json({error:'CONFLICT'},{status:409});
        policy={...payload,revision:policy.revision+1};
      }return Response.json(policy);
    }
    if(url.pathname==='/v1/history/pin'||url.pathname==='/v1/history/archive'){
      assert.equal(init?.method,'POST');const intercepted=await retentionHook(url.pathname,payload);if(intercepted)return intercepted;
      const key=payload.key??payload.mutation?.key,head=events.filter(e=>namespaces.get(e)===payload.namespace&&e.key===key).at(-1);
      if(!head||head.revision!==(payload.revision??payload.mutation?.base))return Response.json({error:'CONFLICT'},{status:409});
      assert.equal(payload.policyRevision,policy.revision);
      if(url.pathname==='/v1/history/pin')return Response.json({accepted:true,revision:head.revision});
      if(usedBytes>=100000000)return Response.json({error:'SYNC_QUOTA_EXCEEDED'},{status:413});
      const prior=retained.find(row=>row.namespace===payload.namespace&&row.mutation.operationId===payload.mutation.operationId);
      if(prior)assert.deepEqual(prior.mutation,payload.mutation);else retained.push({namespace:payload.namespace,mutation:payload.mutation,revision:++revision});
      return Response.json({accepted:true,revision:(prior??retained.at(-1))!.revision});
    }
    if(init?.method==='POST'){
      assert.equal(url.pathname,'/v1/changes');
      const m=payload.mutation as SyncMutation;
      if(m.value!==null&&usedBytes>=100000000)return Response.json({error:'SYNC_QUOTA_EXCEEDED'},{status:413});
      const previous=events.find(e=>namespaces.get(e)===payload.namespace&&e.operationId===m.operationId);
      if(!previous){
        const head=events.filter(e=>namespaces.get(e)===payload.namespace&&e.key===m.key).at(-1)?.revision??0;
        if(head!==m.base)return Response.json({error:'CONFLICT'},{status:409});
        assert.ok(policy.selections.some(s=>syncNamespace(s)===payload.namespace));const event={...m,revision:++revision};events.push(event);namespaces.set(event,payload.namespace);
      }
      if(drop){drop=false;throw new Error('RECEIPT_LOST');}
      return Response.json({accepted:true,revision:events.find(e=>namespaces.get(e)===payload.namespace&&e.operationId===m.operationId)!.revision});
    }
    const rows=events.filter(e=>namespaces.get(e)===url.searchParams.get('namespace')&&e.revision>Number(url.searchParams.get('after')));
    beforeDownload();
    return Response.json({events:rows.slice(0,2),more:rows.length>2});
  };
  const controller=new AbortController();
  const clients=homes.map((home,i)=>new PersonalSync({home,spaceId:space.spaceId,endpoint:'http://127.0.0.1:8788',authority:{signal:controller.signal,assertCurrent:authorize,accessToken:async()=>{authorize();return 'synthetic-only';}},registrations:[registrations[i]],fetch:transport}));
  const enable=async()=>{await clients[0].save({spaceId:space.spaceId,revision:policy.revision,selections:[selection]});await clients[0].run();};
  const closers:Array<()=>Promise<void>>=[];
  t.after(async()=>{clients.forEach(c=>c.close());for(const close of closers)await close();rmSync(root,{recursive:true,force:true});});
  return {closeWith:(close:()=>Promise<void>)=>closers.push(close),space,homes,clients,events,retained,withStore,withReplica,enable,transport,onRetention:(hook:typeof retentionHook)=>retentionHook=hook,used:(bytes:number)=>usedBytes=bytes,beforeDownload:(run:()=>void)=>beforeDownload=run,afterQuotaSnapshot:(run:()=>void)=>afterQuotaSnapshot=run,offline:()=>online=false,online:()=>online=true,drop:()=>drop=true,revoke:()=>{active=false;controller.abort();}};
}
