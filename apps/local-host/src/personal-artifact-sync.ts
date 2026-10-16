import {createArtifactReplication,ArtifactsRepository} from '@molis-ai/molis-work-module-artifacts';
import {createSqliteReplica,namespacedReplicaDatabase,ensureStorageSpace,readDatabaseSpace} from '@molis-ai/molis-work-storage';
import {partitionedReplica,type SyncRegistration,syncNamespace} from '@molis-ai/molis-work-module-sync-replication';
import {availableProjectPluginIds} from '@molis-ai/molis-work-app-workbench';
import {LocalProjectDatabase} from './project-database.js';
import {artifactsManifest} from '@molis-ai/molis-work-plugin-artifacts';
import type {LocalWebCatalogRunner} from './web-project-settings.js';

export const artifactSyncSelection={plugin_id:artifactsManifest.plugin_id,publisher_id:artifactsManifest.publisher.publisher_id,publisher_signature:artifactsManifest.publisher.signature,collection_id:artifactsManifest.sync!.collections[0].id,schema_version:artifactsManifest.sync!.collections[0].schema_version};
export function createPersonalArtifactRegistration(home:string,spaceId:string,userId:string,check:()=>void,withCatalog:LocalWebCatalogRunner){
  check();const homeSpace=ensureStorageSpace(home);
  if(homeSpace.kind!=='personal'||homeSpace.spaceId!==spaceId||homeSpace.ownerUserId!==userId)throw new Error('SPACE_OWNERSHIP_MISMATCH');
  let projects=new Map<string,{title:string;path:string;enabled:boolean}>();
  const decode=(key:string):[string,string,string]=>{const value=JSON.parse(key);if(!Array.isArray(value)||value.length!==3||value[1]!=='artifact'||!value.every(v=>typeof v==='string'&&v.length>0&&v.length<=200))throw new Error('SYNC_INVALID_ARTIFACT_KEY');return value as [string,string,string];};
  const withProject=<T>(id:string,run:(store:LocalProjectDatabase,project:NonNullable<ReturnType<typeof projects.get>>)=>T,requiresArtifacts=true):T=>{
    check();const project=projects.get(id);if(!project)throw new Error('同步项目不存在');
    if(requiresArtifacts&&!project.enabled)throw new Error('项目的成果插件已停用');
    const store=new LocalProjectDatabase(project.path);
    try{
      const binding=readDatabaseSpace(store.db);
      if(binding?.spaceId!==spaceId)throw new Error('SPACE_OWNERSHIP_MISMATCH');
      check();return run(store,project);
    }finally{store.close();}
  };
  const registration:SyncRegistration={
    selection:artifactSyncSelection,title:'成果及固定版本',
    async refresh(){check();projects=await withCatalog({homeDirectory:home},catalog=>new Map(catalog.listProjects().map(p=>[p.project_id,{title:p.display_name,path:p.database_path,enabled:availableProjectPluginIds(catalog.listProjectPlugins(p.project_id)).has('artifacts')}])));check();},
    withReplica(run){return run(partitionedReplica({home,namespace:syncNamespace(artifactSyncSelection),authorize:check,partitions:()=>[...projects].filter(([,p])=>p.enabled).map(([id])=>id),partition:key=>decode(key)[0],
      withPartition(id,operation){return withProject(id,(store,project)=>{
        const owner=createArtifactReplication(store.db,{spaceId,projectId:id,authorize:check},{appendEvent:event=>store.appendEvent(event),eventCursor:projectId=>store.eventCursor(projectId)});
        return operation(createSqliteReplica(namespacedReplicaDatabase(store.db,'artifacts'),{authorize:check,
          read(key){const [projectId,,artifactId]=decode(key);if(projectId!==id)throw new Error('SYNC_WRONG_PROJECT');const artifact=owner.read(artifactId);return artifact?{project:{id,title:project.title},artifact}:null;},
          apply(key,value){const [projectId,,artifactId]=decode(key);const payload=value as {project?:{id:string};artifact?:{identity?:{artifact_id:string}}}|null;
            if(projectId!==id||payload?.project?.id!==id||payload.artifact?.identity?.artifact_id!==artifactId)throw new Error('SYNC_INVALID_ARTIFACT');owner.apply(payload.artifact);
          },
        }));
      });},
    }));},
    async prepare(event){
      check();const [id]=decode(event.key);const value=event.value as {project?:{id?:unknown;title?:unknown}}|null;
      if(!value?.project||value.project.id!==id||typeof value.project.title!=='string'||!value.project.title.trim()||value.project.title.length>120)throw new Error('SYNC_INVALID_PROJECT');
      await withCatalog({homeDirectory:home},async catalog=>{
        check();if(catalog.listProjects().some(p=>p.project_id===id))return;
        const project=await catalog.ensureSyncedProject({project_id:id,display_name:value.project!.title as string,actor_id:userId},check);
        check();catalog.addProjectPlugin({project_id:project.project_id,plugin_id:'artifacts',actor_id:userId});
      });check();
    },
  };
  return {registration,hasReference(projectId:string,reference:{owner:'goals'|'artifacts';assetId:string;version?:number}):boolean{
    check();const p=projects.get(projectId);if(!p)return false;
    if(reference.owner==='artifacts'&&!p.enabled)return false;
    return withProject(projectId,store=>reference.owner==='goals'?store.goalsQuery.listGoals(projectId).some(goal=>goal.goal_id===reference.assetId):reference.version!==undefined&&!!new ArtifactsRepository(store.db).getVersion(projectId,reference.assetId,reference.version),reference.owner==='artifacts');
  }};
}
