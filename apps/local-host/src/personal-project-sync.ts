import { replicaError } from './project-replication-errors.js';
import { ensureStorageSpace } from '@molis-ai/molis-work-storage';
import { partitionedReplica, syncNamespace, type SyncRegistration } from '@molis-ai/molis-work-module-sync-replication';
import type { SyncSelection } from '@molis-ai/molis-work-module-sync-replication';
import { BUILTIN_PLUGIN_CATALOG, availableProjectPluginIds } from '@molis-ai/molis-work-app-workbench';
import { LocalProjectDatabase } from './project-database.js';
import { createProjectGoalReplica } from './project-replication.js';
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
    selection, title: '目标、关系与工作记录',
    async refresh() {
      check(); projects = await withCatalog({ homeDirectory: home }, c => new Map(c.listProjects().map(p => [p.project_id, { title: p.display_name, path: p.database_path, enabled: availableProjectPluginIds(c.listProjectPlugins(p.project_id)).has('goals') }]))); check();
    },
    withReplica(run) {
      return run(partitionedReplica({ home, namespace: syncNamespace(selection), authorize: check,
        partitions: () => [...projects].filter(([, p]) => p.enabled).map(([id]) => id), partition: projectId,
        withPartition(id, operation) {
          check(); const project = projects.get(id);
          if (!project?.enabled) throw replicaError('replica_project_unavailable');
          const store = new LocalProjectDatabase(project.path);
          try { return operation(createProjectGoalReplica(store.replicationDatabase, { spaceId, projectId: id, title: project.title, authorize: check })); }
          finally { store.close(); }
        },
      }));
    },
    async prepare(event) {
      check(); const id = projectId(event.key);
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
 return BUILTIN_PLUGIN_CATALOG.flatMap(entry=>{
  const binding=entry.sync;if(binding?.scope!=='project-database')return [];
  const collection=entry.manifest.sync!.collections[0]!;
  const selection={plugin_id:entry.manifest.plugin_id,publisher_id:entry.manifest.publisher.publisher_id,publisher_signature:entry.manifest.publisher.signature,collection_id:collection.id,schema_version:collection.schema_version};
  let projects=new Map<string,{title:string;path:string;enabled:boolean}>();
  const projectId=(key:string)=>{const parts:unknown=JSON.parse(key);if(!Array.isArray(parts)||parts.length!==3||parts[1]!==binding.kind||typeof parts[0]!=='string'||typeof parts[2]!=='string')throw replicaError('replica_key_invalid');return parts[0];};
  return [{selection,title:collection.title,
   async refresh(){check();projects=await withCatalog({homeDirectory:home},c=>new Map(c.listProjects().map(p=>[p.project_id,{title:p.display_name,path:p.database_path,enabled:availableProjectPluginIds(c.listProjectPlugins(p.project_id)).has(entry.project_plugin_id)}])));check();},
   withReplica(run){return run(partitionedReplica({home,namespace:syncNamespace(selection),authorize:check,partitions:()=>[...projects].filter(([,p])=>p.enabled).map(([id])=>id),partition:projectId,
    withPartition(id,operation){check();const p=projects.get(id);if(!p?.enabled)throw replicaError('replica_project_unavailable');const store=new LocalProjectDatabase(p.path);try{return operation(binding.create(store.replicationDatabase,{spaceId,projectId:id,title:p.title,authorize:check}));}finally{store.close();}}}));},
   async prepare(event){check();const id=projectId(event.key);if(event.value===null)return;const value=event.value as {format?:unknown;spaceId?:unknown;project?:{id?:unknown;title?:unknown}};
    if(value?.format!==1||value.spaceId!==spaceId||value.project?.id!==id||typeof value.project.title!=='string'||!value.project.title.trim()||value.project.title.length>120)throw replicaError('replica_project_invalid');
    await withCatalog({homeDirectory:home},async c=>{check();const existing=c.listProjects().find(p=>p.project_id===id);const p=existing??await c.ensureSyncedProject({project_id:id,display_name:value.project!.title as string,actor_id:userId},check);check();if(!availableProjectPluginIds(c.listProjectPlugins(id)).has(entry.project_plugin_id)&&!c.wasProjectPluginRemoved(id,entry.project_plugin_id))c.addProjectPlugin({project_id:p.project_id,plugin_id:entry.project_plugin_id,actor_id:userId});});check();
   },
  } satisfies SyncRegistration];
 });
}
