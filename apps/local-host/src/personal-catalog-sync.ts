import {catalogSyncLifecycle,type CatalogSyncLifecycle} from './catalog-sync-lifecycle.js';
import {modulesProjectsContract} from '@molis-ai/molis-work-contracts/modules/projects';
import {validatePortableProject,validateProjectSyncKey} from '@molis-ai/molis-work-module-projects';
import {ensureStorageSpace,createLocalPayloadProtection,createLazyFileSecretStore} from '@molis-ai/molis-work-storage';
import {createSyncJsonContent} from '@molis-ai/molis-work-plugin-sdk';
import {syncNamespace,hasProtectedSyncPayloads,type SyncRegistration} from '@molis-ai/molis-work-module-sync-replication';
import {withProjectCatalogReplica,projectCatalogHasProtectedData} from './project-catalog-replication.js';
import {PERSONAL_SPACE_PROJECT_ID} from './personal-space.js';
import type {LocalWebCatalogRunner} from './web-project-settings.js';

/** Project facts are owned by Projects, not by Goals or a synthetic plugin. No discovery or network side effects. */
export function createPersonalCatalogRegistration(home:string,spaceId:string,userId:string,authorize:()=>void,withCatalog:LocalWebCatalogRunner,publisherId:string,lifecycle?:CatalogSyncLifecycle):SyncRegistration {
  authorize();const space=ensureStorageSpace(home);
  if(space.kind!=='personal'||space.spaceId!==spaceId||space.ownerUserId!==userId)throw new Error('项目资料不属于当前个人空间');
  const selection={plugin_id:modulesProjectsContract.contractId,publisher_id:publisherId,publisher_signature:'official-project-catalog-binding',collection_id:'projects',schema_version:1};
  const namespace=syncNamespace(selection),options={spaceId,authorize,excludedProjectIds:[PERSONAL_SPACE_PROJECT_ID]};let available=true;
  const protection=createLocalPayloadProtection({secrets:createLazyFileSecretStore(home),keyRef:'system:sync:project-catalog:payload:v1',scope:JSON.stringify([spaceId,namespace]),authorize,
    hasProtectedData:()=>projectCatalogHasProtectedData(home)||hasProtectedSyncPayloads(home,namespace)});
  const admission=catalogSyncLifecycle(home,authorize,withCatalog,run=>withProjectCatalogReplica(home,authorize,protection,run),lifecycle);
  return {withMutation:admission.withMutation,selection,locate:key=>'/projects/'+encodeURIComponent(key)+'/settings/general',title:'项目资料与插件清单',available:()=>available,protection,content:createSyncJsonContent({spaceId,authorize}),
    async refresh(){authorize();try{await withCatalog({homeDirectory:home},()=>{});withProjectCatalogReplica(home,authorize,protection,()=>{});available=true;}catch(error){authorize();const code=error&&typeof error==='object'&&'code' in error?error.code:undefined;if(code==='SQLITE_BUSY'||code==='SQLITE_BUSY_TIMEOUT'||code==='SQLITE_LOCKED'||code==='storage.catalog_probe_busy')throw error;available=false;}},
    withReplica(run){authorize();if(!available)throw new Error('项目资料库暂不可用，原件已保留');return withProjectCatalogReplica(home,authorize,protection,run,admission.authorizeLifecycle);},
    async prepare(event,receiveOptions){validateProjectSyncKey(event.key,options);if(event.value===null)return;const value=validatePortableProject(event.key,event.value,options);if(withProjectCatalogReplica(home,authorize,protection,r=>r.inspectReceive(event,receiveOptions))!=='apply')return;await withCatalog({homeDirectory:home},async catalog=>{authorize();if(catalog.recycle.isRecycled(event.key)){try{catalog.recycle.inspect(event.key);return;}catch(error){if(!error||typeof error!=='object'||!('code' in error)||error.code!=='catalog.recycle_missing')throw error;}}if(catalog.listProjects().some(p=>p.project_id===event.key))return;const input={project_id:event.key,display_name:value.project.title,actor_id:userId};if(catalog.recycle.isRecycled(event.key))await catalog.prepareSyncedProjectRestore(input,authorize);else await catalog.ensureSyncedProject(input,authorize);authorize();});authorize();},
  };
}
