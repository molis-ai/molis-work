import assert from 'node:assert/strict';
import { test } from 'node:test';
import { personalRuntimeSyncAuthority } from '@molis-ai/molis-work-app-local-host';
import { pluginSyncAuthority } from '@molis-ai/molis-work-app-local-host';
import type { LocalWebCatalogRunner } from '@molis-ai/molis-work-app-local-host';
import type { SyncRegistration } from '@molis-ai/molis-work-module-sync-replication';

const selection={plugin_id:'example.plugin',publisher_id:'example',publisher_signature:'verified',collection_id:'items',schema_version:1};
function fixture(){
 let active=true,revision=1,selected=true,release:()=>void=()=>{};
 const home='/tmp/authority-only',spaceId='personal-test';
 const catalog={listProjects:()=>[{project_id:'current',display_name:'Current',database_path:'/unused'}],projectPluginMembership:()=>({plugins:[],hidden:[]}),recycle:{list:()=>[]}};
 const withCatalog:LocalWebCatalogRunner=async(_options,read)=>read(catalog as Parameters<typeof read>[0]);
 const current=()=>pluginSyncAuthority(home,selection);
 const source:SyncRegistration={selection,title:'Items',refresh:async()=>{},prepare:async()=>{},
  withReplica(run){current();return run({authorizeKey(){current().project('current');},counts:()=>{current();return {pending:1,conflicts:0};}} as Parameters<Parameters<SyncRegistration['withReplica']>[0]>[0]);},
  content:{encode(_key,value){current();return {value,blobs:[]};},async decode(_key,value){current();await new Promise<void>(resolve=>{release=resolve;});return value;}},
 };
 const authority=personalRuntimeSyncAuthority({home,spaceId,withCatalog,readCatalog:read=>read(catalog as Parameters<typeof read>[0]),authorize(){if(!active)throw new Error('REVOKED');},policy:()=>({revision,selections:selected?[selection]:[]}),hasArtifact:()=>false,hasReference:()=>false});
 return {home,authority,registration:authority.bind(source),unselect(){selected=false;revision++;},revoke(){active=false;},release(){release();},current};
}
test('Runtime sync authority confines a callback to its current collection and ends on return',async()=>{
 const f=fixture();await f.authority.refresh();
 f.registration.withReplica(replica=>{assert.equal(replica.counts().pending,1);assert.equal(f.current().project('current').title,'Current');assert.throws(()=>f.current().project('foreign'));assert.throws(()=>pluginSyncAuthority(f.home,{...selection,collection_id:'other'}));});
 assert.throws(f.current);
 f.unselect();assert.throws(()=>f.registration.withReplica(replica=>replica.counts()));
});
test('a content read crossing policy or account revocation cannot return its old authority result',async()=>{
 for(const revoke of ['policy','account']){
  const f=fixture();await f.authority.refresh();const pending=f.registration.content!.decode('key',{retained:true},async()=>new Uint8Array());
  if(revoke==='policy')f.unselect();else f.revoke();f.release();await assert.rejects(pending);
 }
});
