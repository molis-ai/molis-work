import { projectSyncCatalog } from './project-sync-catalog.js';
import { replicaError } from './project-replication-errors.js';
import { createSyncConflictState } from '@molis-ai/molis-work-plugin-sdk';
import { createSqliteReplica, namespacedReplicaDatabase } from '@molis-ai/molis-work-storage';
import { privateValueReplicaOwner, validatePrivateValueReplication } from '@molis-ai/molis-work-plugin-runtime';
import { assertPassiveSyncIdle } from './passive-sync-execution.js';
import { partitionedReplica, syncNamespace, type SyncRegistration } from '@molis-ai/molis-work-module-sync-replication';
import { builtinSyncBindings } from './builtin-sync.js';
import { projectPluginJudge } from './project-action-availability.js';
import { LocalProjectDatabase } from './project-database.js';
import type { LocalWebCatalogRunner } from './web-project-settings.js';
import type { SyncCatalogReader } from './personal-runtime-sync-authority.js';

/** The two approved native Studio owners retain their separate stores. All other plugin collections come from Runtime. */
export function createPersonalProjectRegistrations(home:string,spaceId:string,_userId:string,check:()=>void,withCatalog:LocalWebCatalogRunner,readCatalog?:SyncCatalogReader):SyncRegistration[]{
 return builtinSyncBindings().flatMap(({entry,collection,binding,selection,dependencies})=>{
  if(binding.scope!=='project-library'&&binding.scope!=='project-private-values')return [];
  const projects=()=>{
   check();if(!readCatalog)throw replicaError('replica_project_unavailable');
   const values=readCatalog(c=>new Map(projectSyncCatalog(c).map(p=>[p.project_id,{title:p.display_name,path:p.database_path,recycled:p.recycled,allowed:projectPluginJudge(c,p.project_id,home)(entry.manifest.plugin_id)===true}])));
   check();return values;
  };
  const project=(id:string,passive=false)=>{const p=projects().get(id);if(!p||!p.allowed||!passive&&p.recycled)throw replicaError('replica_project_unavailable');return p;};
  const projectId=(key:string)=>{const parts:unknown=JSON.parse(key);if(!Array.isArray(parts)||parts.length!==3||parts[1]!==binding.kind||typeof parts[0]!=='string'||typeof parts[2]!=='string')throw replicaError('replica_key_invalid');return parts[0];};
  const authorizeKey=(key:string)=>{project(projectId(key));};
  const content=binding.content?.({spaceId,authorize:check});
  return [{selection,dependencies,locate:key=>{authorizeKey(key);return '/projects/'+encodeURIComponent(projectId(key))+'/?openPlugin='+encodeURIComponent(entry.project_plugin_id);},title:collection.title,
   ...(content?{content:{
    ...(content.prepare?{async prepare(key,value){authorizeKey(key);await content.prepare!(key,value);authorizeKey(key);}}:{}),
    encode(key,value){authorizeKey(key);const result=content.encode(key,value);authorizeKey(key);return result;},
    async decode(key,value,read){authorizeKey(key);const result=await content.decode(key,value,async reference=>{authorizeKey(key);const bytes=await read(reference);authorizeKey(key);return bytes;});authorizeKey(key);return result;},
   }}:{}),
   async refresh(){check();await withCatalog({homeDirectory:home},()=>undefined);check();if(readCatalog)projects();},
   withReplica(run){check();return run(partitionedReplica({home,namespace:syncNamespace(selection),authorize:check,partitions:()=>[...projects()].filter(([,p])=>p.allowed&&!p.recycled).map(([id])=>id),partition:projectId,projectPartition:id=>id,projectPartitions:()=>[...projects().keys()],projectAbsent:id=>!projects().has(id),
    withPartition(id,operation,passive){const p=project(id,passive),authorize=()=>{const current=project(id,passive);if(current.path!==p.path)throw replicaError('replica_project_unavailable');};const context={spaceId,projectId:id,title:p.title,authorize,conflictState:createSyncConflictState};
     if(binding.scope==='project-library'){const library=binding.open(home,id);try{authorize();const result=operation(library.replica(context));authorize();return result;}finally{library.close();}}
     const store=new LocalProjectDatabase(p.path);
     try{const result=operation(createSqliteReplica(namespacedReplicaDatabase(store.replicationDatabase,binding.namespace),{...privateValueReplicaOwner(store.db,binding.owner({home,authorize,assertIdle:(pid,item)=>assertPassiveSyncIdle(home,pid,entry.manifest.plugin_id,item)}),context),conflictState:createSyncConflictState}));authorize();return result;}finally{store.close();}
    }}));},
   async prepare(event){
    check();const id=projectId(event.key);project(id);if(event.value===null)return;
    if(binding.scope==='project-private-values')validatePrivateValueReplication(event.value,binding.owner({}),{spaceId,projectId:id,title:'validation',authorize:()=>{project(id);}},event.key);
    const value=event.value as {format?:unknown;spaceId?:unknown;project?:{id?:unknown;title?:unknown}};
    if(value?.format!==1||value.spaceId!==spaceId||value.project?.id!==id||typeof value.project.title!=='string'||!value.project.title.trim()||value.project.title.length>120)throw replicaError('replica_project_invalid');
    // Receiving content cannot install or grant a plugin, including after an asynchronous catalog operation.
    await withCatalog({homeDirectory:home},c=>{check();c.getProject(id);if(projectPluginJudge(c,id,home)(entry.manifest.plugin_id)!==true)throw replicaError('replica_project_unavailable');});project(id);
   },
  } satisfies SyncRegistration];
 });
}
