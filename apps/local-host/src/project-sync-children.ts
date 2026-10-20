import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';
import type {SyncRegistration} from '@molis-ai/molis-work-module-sync-replication';
import {catalogErrors} from './project-catalog-contract.js';
const errors=defineErrorCodes('host',{sync_project_unsettled:'unavailable'});
/** All registered owners participate, including disabled uploads. Unknown scope must never mean clean. */
export function assertProjectSyncChildren(children:readonly SyncRegistration[],projectId:string,check:()=>void):void {
 check();for(const child of children){
  check();if(child.available?.()===false)throw catalogErrors.project_storage_invalid('项目内容暂不可检查，原件已保留');
  const dirty=child.withReplica(replica=>{
   if(!replica.hasProjectChanges)throw catalogErrors.project_storage_invalid('项目内容归属检查尚未接入，原件已保留');
   return replica.hasProjectChanges(projectId);
  });
  if(dirty)throw errors.sync_project_unsettled('项目仍有未同步内容或冲突，原件已保留',{sync_waiting:true});
 }check();
}
