import {withPassiveProjectChange} from './passive-sync-execution.js';
import {catalogErrors} from './project-catalog-contract.js';
import {PERSONAL_SPACE_PROJECT_ID} from './personal-space.js';
import type {LocalWebCatalogRunner} from './web-project-settings.js';
import type {ProjectDeletionPorts} from './project-deletion-service.js';

/** No owner write precedes commit. The receiver, not admission, owns the final CAS and lifecycle transaction. */
export async function admitProjectSync<T>(withCatalog:LocalWebCatalogRunner,ports:ProjectDeletionPorts,home:string,projectId:string,recycled:boolean,check:()=>void,assertChildrenSettled:()=>void,commit:()=>T):Promise<T> {
 check();if(projectId===PERSONAL_SPACE_PROJECT_ID)throw catalogErrors.personal_space('个人空间不能回收');
 return withCatalog({homeDirectory:home},async catalog=>{
  const observe=()=>{try{return catalog.recycle.inspect(projectId);}catch(error){if(error&&typeof error==='object'&&'code' in error&&error.code==='catalog.recycle_missing')return null;throw error;}};
  check();const observed=observe();
  const ready=()=>{
   check();
   if(!ports.isProjectBusy)throw catalogErrors.project_storage_invalid('项目运行状态尚未接入，原件已保留');
   if(observed&&ports.isProjectBusy(observed.database_path))throw catalogErrors.project_task_live('项目仍有运行或排队的任务，请结束后重试',{sync_waiting:true});
   if(catalog.listDesktopPanels(projectId).some(panel=>ports.isPanelAlive(panel.panel_id)))throw catalogErrors.project_terminal_live('请先关闭这个项目中正在运行的终端，再接收项目状态');
   assertChildrenSettled();check();
  };
  ready();
  return withPassiveProjectChange(home,projectId,async()=>{
   ready();if(recycled&&observed)await ports.releaseProject(observed.database_path);ready();
   if(observe()?.state!==observed?.state)throw catalogErrors.project_storage_invalid('等待期间项目已变化，原件已保留');
   // No catalog transaction is held across a wait or across another connection's receive transaction.
   return commit();
  });
 });
}
