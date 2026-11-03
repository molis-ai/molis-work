import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { PluginStartContext, PluginSyncBinding } from '@molis-ai/molis-work-contracts/platform/plugin';
import { codingSections, CODING_CONTENT_REPLICA_ID } from './session-replication.js';
import { refreshCodingSavedHistory } from './saved-history.js';

export function syncBindings(context:PluginStartContext):PluginSyncBinding[] {
 const scope=context.sync;if(!scope)return [];
 const service=context.services?.sync,history=context.services?.savedHistory,db=context.services?.project_database,projectId=context.project_id;
 if(!service||!history||!db||!projectId)throw new ActionError('actions.unredeemed','Coding 同步服务或历史导出服务未提供');
 const binding=service.sections('sessions',codingSections(json=>history.validate(json)));
 return [{...binding,async prepareUploads(){
  const key=JSON.stringify([projectId,CODING_CONTENT_REPLICA_ID,projectId]);
  try{await refreshCodingSavedHistory(db,projectId,id=>history.read(id),()=>scope.assertActive(),json=>history.validate(json));return [];}
  catch(error){scope.assertActive();return [{key,error}];}
 }}];
}
