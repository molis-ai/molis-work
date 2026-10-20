import type {SyncRegistration} from '@molis-ai/molis-work-module-sync-replication';
import type {SqliteReplica} from '@molis-ai/molis-work-storage';
import type {ProjectDeletionService} from './project-deletion-service.js';
import type {LocalWebCatalogRunner} from './web-project-settings.js';
import {catalogErrors} from './project-catalog-contract.js';
export interface CatalogSyncLifecycle {service:ProjectDeletionService;assertChildrenSettled(projectId:string):void;refreshChildren?():Promise<void>}
/** Capabilities exist only during the final receiver callback, never during asynchronous preparation. */
export function catalogSyncLifecycle(home:string,check:()=>void,withCatalog:LocalWebCatalogRunner,withReplica:<T>(run:(r:SqliteReplica)=>T)=>T,lifecycle?:CatalogSyncLifecycle):{authorizeLifecycle(key:string,recycled:boolean):void;withMutation:NonNullable<SyncRegistration['withMutation']>}{
 const permits=new Map<string,boolean>();
 const authorizeLifecycle=(key:string,recycled:boolean)=>{check();if(permits.get(key)!==recycled)throw catalogErrors.project_storage_invalid('项目生命周期未获得服务接纳，原件已保留');};
 const withMutation:NonNullable<SyncRegistration['withMutation']>=async(scope,commit)=>{
  check();const candidates=withReplica(r=>{
   if(scope.kind==='receive')return r.inspectReceive(scope.event,{retry:scope.retry})==='apply'?[{key:scope.event.key,value:scope.event.value}]:[];
   if(scope.kind==='resolve'){const view=r.inspectConflict?.(scope.key);if(view&&(view.revision!==scope.revision||view.state!==scope.state))throw catalogErrors.project_storage_invalid('项目冲突版本已变化，请重新查看');return scope.choice==='remote'&&view?[{key:scope.key,value:view.remote}]:[];}
   if(scope.kind==='restore-recovery'){const view=r.inspectRecovery?.(scope.id);if(view&&view.revision!==scope.revision)throw catalogErrors.project_storage_invalid('项目恢复版本已变化，请重新查看');return view?[{key:view.key,value:view[scope.choice]}]:[];}
   return r.conflicts().filter(c=>c.waiting).flatMap(c=>{const view=r.inspectConflict?.(c.key);return view?[{key:c.key,value:view.remote}]:[];});
  });
  const changes=await withCatalog({homeDirectory:home},catalog=>candidates.filter(c=>c.value===null||catalog.recycle.isRecycled(c.key)).sort((a,b)=>a.key.localeCompare(b.key)));check();
  if(!changes.length)return commit();
  if(!lifecycle)throw catalogErrors.project_storage_invalid('项目生命周期服务尚未接入，原件已保留');
  await lifecycle.refreshChildren?.();check();
  const enter=async(index:number):Promise<ReturnType<typeof commit>>=>{
   const change=changes[index];if(!change){check();for(const c of changes)permits.set(c.key,c.value===null);try{return commit();}finally{permits.clear();}}
   return lifecycle.service.admitSync(home,change.key,change.value===null,check,()=>lifecycle.assertChildrenSettled(change.key),()=>enter(index+1));
  };
  return enter(0);
 };
 return {authorizeLifecycle,withMutation};
}
