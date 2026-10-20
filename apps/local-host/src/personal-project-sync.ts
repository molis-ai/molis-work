import {projectSyncCatalog} from './project-sync-catalog.js';
import { replicaError } from './project-replication-errors.js';
import { createSyncConflictState } from '@molis-ai/molis-work-plugin-sdk';
import { ensureStorageSpace, createProjectContentReplicaFactory, validateProjectContentReplication,createSqliteReplica,namespacedReplicaDatabase } from '@molis-ai/molis-work-storage';
import {privateValueReplicaOwner,validatePrivateValueReplication} from '@molis-ai/molis-work-plugin-runtime';
import {assertPassiveSyncIdle} from './passive-sync-execution.js';
import { projectContentReplicationOwners,refreshProjectContentExports } from './project-database-schema.js';
import {createProjectEvidenceContent} from './project-replication-content.js';
import { partitionedReplica, syncNamespace, type SyncRegistration } from '@molis-ai/molis-work-module-sync-replication';
import type { SyncSelection } from '@molis-ai/molis-work-module-sync-replication';
import { builtinSyncBindings, availableProjectPluginIds } from '@molis-ai/molis-work-app-workbench';
import { LocalProjectDatabase } from './project-database.js';
import { createProjectGoalReplica, validateProjectGoalReplication } from './project-replication.js';
import { createProjectGoalContent } from './project-goal-content.js';
import type { LocalWebCatalogRunner } from './web-project-settings.js';

export function createPersonalGoalRegistration(home: string, spaceId: string, userId: string, check: () => void, withCatalog: LocalWebCatalogRunner, selection: SyncSelection): SyncRegistration {
  const space = ensureStorageSpace(home);
  if (space.kind !== 'personal' || space.spaceId !== spaceId || space.ownerUserId !== userId) throw replicaError('replica_scope_mismatch');
  let projects = new Map<string, { title: string; path: string; enabled: boolean }>();
  const projectId = (key: string): string => {
    const value: unknown = JSON.parse(key);
    if (!Array.isArray(value) || value.length !== 3 || value[1] !== 'project_goals' || value[0] !== value[2] || typeof value[0] !== 'string') throw replicaError('replica_key_invalid');
    return value[0];
  };
  return {
    selection, locate:key=>'/projects/'+encodeURIComponent(projectId(key))+'/', title: '目标、关系与工作记录', content: createProjectGoalContent(spaceId, projectId, check),
    async refresh() {
      check(); projects = await withCatalog({ homeDirectory: home }, c => new Map(projectSyncCatalog(c).map(p => [p.project_id, { title: p.display_name, path: p.database_path, enabled: !p.recycled && availableProjectPluginIds(c.listProjectPlugins(p.project_id)).has('goals') }]))); check();
    },
    withReplica(run) {
      return run(partitionedReplica({ home, namespace: syncNamespace(selection), authorize: check,
        partitions: () => [...projects].filter(([, p]) => p.enabled).map(([id]) => id), partition: projectId, projectPartition:id=>id, projectPartitions:()=>[...projects.keys()],projectAbsent:id=>!projects.has(id),
        withPartition(id, operation,passive) {
          check(); const project = projects.get(id);
          if (!project||!passive&&!project.enabled) throw replicaError('replica_project_unavailable');
          const store = new LocalProjectDatabase(project.path);
          try { return operation(createProjectGoalReplica(store.replicationDatabase, { spaceId, projectId: id, title: project.title, authorize: check })); }
          finally { store.close(); }
        },
      }));
    },
    async prepare(event) {
      check(); const id = projectId(event.key);
      validateProjectGoalReplication(event.value,{spaceId,projectId:id,authorize:check});
      const value = event.value as { format?: unknown; spaceId?: unknown; project?: { id?: unknown; title?: unknown } } | null;
      if (value?.format !== 1 || value.spaceId !== spaceId || value.project?.id !== id || typeof value.project.title !== 'string' || !value.project.title.trim() || value.project.title.length > 120) throw replicaError('replica_project_invalid');
      await withCatalog({ homeDirectory: home }, async catalog => {
        check(); if (catalog.listProjects().some(p => p.project_id === id)) return;
        await catalog.ensureSyncedProject({ project_id: id, display_name: value.project!.title as string, actor_id: userId }, check); check();
      }); check();
    },
  };
}

/** Project-local owners declare their factories in the same catalog as their manifest. */
export function createPersonalProjectRegistrations(home:string,spaceId:string,userId:string,check:()=>void,withCatalog:LocalWebCatalogRunner):SyncRegistration[]{
 return builtinSyncBindings().flatMap(({entry,collection,binding,selection,dependencies})=>{
  if(binding.scope!=='project-database'&&binding.scope!=='project-library'&&binding.scope!=='project-sections'&&binding.scope!=='project-private-values')return [];
  const definitions=binding.scope==='project-sections'?projectContentReplicationOwners(binding.owners):[];
  let projects=new Map<string,{title:string;path:string;enabled:boolean}>();
  const projectId=(key:string)=>{const parts:unknown=JSON.parse(key);if(!Array.isArray(parts)||parts.length!==3||parts[1]!==binding.kind||typeof parts[0]!=='string'||typeof parts[2]!=='string')throw replicaError('replica_key_invalid');return parts[0];};
  return [{selection,dependencies,locate:key=>'/projects/'+encodeURIComponent(projectId(key))+'/?openPlugin='+encodeURIComponent(entry.project_plugin_id),title:collection.title,content:definitions.some(d=>d.contentRefs)?createProjectEvidenceContent(home,definitions,binding.kind,spaceId,check):binding.content?.({spaceId,authorize:check}),
   async refresh(){check();projects=await withCatalog({homeDirectory:home},c=>new Map(projectSyncCatalog(c).map(p=>[p.project_id,{title:p.display_name,path:p.database_path,enabled:!p.recycled&&availableProjectPluginIds(c.listProjectPlugins(p.project_id)).has(entry.project_plugin_id)}])));check();},
   async prepareUploads(){const failures:{key:string;error:unknown}[]=[];if(binding.scope==='project-sections')for(const [id,p] of projects){if(!p.enabled)continue;check();const store=new LocalProjectDatabase(p.path);try{await refreshProjectContentExports(binding.owners,home,store.replicationDatabase,id,check);}catch(error){check();failures.push({key:JSON.stringify([id,binding.kind,id]),error});}finally{store.close();}check();}return failures;},
   withReplica(run){return run(partitionedReplica({home,namespace:syncNamespace(selection),authorize:check,partitions:()=>[...projects].filter(([,p])=>p.enabled).map(([id])=>id),partition:projectId,projectPartition:id=>id,projectPartitions:()=>[...projects.keys()],projectAbsent:id=>!projects.has(id),
    withPartition(id,operation,passive){check();const p=projects.get(id);if(!p||!passive&&!p.enabled)throw replicaError('replica_project_unavailable');const context={spaceId,projectId:id,title:p.title,authorize:check,conflictState:createSyncConflictState};
     if(binding.scope==='project-library'){const library=binding.open(home,id);try{return operation(library.replica(context));}finally{library.close();}}
     const store=new LocalProjectDatabase(p.path);try{if(binding.scope==='project-private-values')return operation(createSqliteReplica(namespacedReplicaDatabase(store.replicationDatabase,binding.namespace),{...privateValueReplicaOwner(store.db,binding.owner({home,authorize:check,assertIdle:(pid,item)=>assertPassiveSyncIdle(home,pid,entry.manifest.plugin_id,item)}),context),conflictState:createSyncConflictState}));const create=binding.scope==='project-sections'?createProjectContentReplicaFactory(projectContentReplicationOwners(binding.owners),binding.namespace,binding.kind):binding.create;return operation(create(store.replicationDatabase,context));}finally{store.close();}}}));},
   async prepare(event){check();const id=projectId(event.key);if(event.value===null)return;const value=event.value as {format?:unknown;spaceId?:unknown;project?:{id?:unknown;title?:unknown}};
    if(binding.scope==='project-sections')validateProjectContentReplication(event.value,definitions,{spaceId,projectId:id,authorize:check});
    if(binding.scope==='project-private-values')validatePrivateValueReplication(event.value,binding.owner({}),{spaceId,projectId:id,title:'validation',authorize:check},event.key);
    if(value?.format!==1||value.spaceId!==spaceId||value.project?.id!==id||typeof value.project.title!=='string'||!value.project.title.trim()||value.project.title.length>120)throw replicaError('replica_project_invalid');
    await withCatalog({homeDirectory:home},async c=>{check();const existing=c.listProjects().find(p=>p.project_id===id);const p=existing??await c.ensureSyncedProject({project_id:id,display_name:value.project!.title as string,actor_id:userId},check);check();if(!availableProjectPluginIds(c.listProjectPlugins(id)).has(entry.project_plugin_id)&&!c.wasProjectPluginRemoved(id,entry.project_plugin_id))c.addProjectPlugin({project_id:p.project_id,plugin_id:entry.project_plugin_id,actor_id:userId});});check();
   },
  } satisfies SyncRegistration];
 });
}
