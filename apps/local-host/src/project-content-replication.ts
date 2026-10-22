import { LOCAL_PERSON_ACTOR_ID } from '@molis-ai/molis-work-contracts/platform/actions';
import { readSavedAgentHistory } from '@molis-ai/molis-work-service-agent-host';
import { savedHistoryFor } from './saved-history-host.js';
import { installProjectReplicaJournal, initializeReplica, namespacedReplicaDatabase, replicaMarkRowsSql, replicaTransaction, type ReplicaDatabase } from '@molis-ai/molis-work-storage';
import { sourceContentReplicationDefinition } from '@molis-ai/molis-work-module-sources';
import { signalContentReplicationDefinition } from '@molis-ai/molis-work-module-signals';
import { attentionContentReplicationDefinition } from '@molis-ai/molis-work-module-attention-resumption';
import { feedContentReplicationDefinition } from '@molis-ai/molis-work-module-feed';
import { installPrivateValueReplicationJournal } from '@molis-ai/molis-work-plugin-runtime';
import type { ProjectSyncContentOwner } from '@molis-ai/molis-work-contracts/platform/plugin-registration';
import { builtinSyncBindings } from '@molis-ai/molis-work-app-workbench';
import { replicaError } from './project-replication-errors.js';

/** Owner definitions contain SQL facts only; plugin/collection placement has one catalog. */
const PROJECT_CONTENT_OWNERS = [sourceContentReplicationDefinition(),attentionContentReplicationDefinition(),signalContentReplicationDefinition(),feedContentReplicationDefinition()];
export async function refreshProjectContentExports(owners:readonly ProjectSyncContentOwner[],pluginId:string,home:string,db:ReplicaDatabase,projectId:string,authorize:()=>void):Promise<void>{
  projectContentReplicationOwners(owners);
  const context={projectId,authorize,validateSavedHistory:readSavedAgentHistory,async readSavedHistory(id:string){
    authorize();const json=await savedHistoryFor(home).read(id,{project_id:projectId,plugin_id:pluginId,actor_id:LOCAL_PERSON_ACTOR_ID},authorize);authorize();return json;
  }};
  for(const owner of owners)if(typeof owner!=='string'&&owner.prepareUpload){authorize();await owner.prepareUpload(db,context);authorize();}
}
export function projectContentReplicationOwners(owners:readonly ProjectSyncContentOwner[]){
  const definitions=owners.map(owner=>typeof owner==='string'?PROJECT_CONTENT_OWNERS.find(d=>d.id===owner):owner.create({validateSavedHistory:readSavedAgentHistory}));
  if(!definitions.length||definitions.some(d=>!d)||new Set(definitions.map(d=>d?.id)).size!==definitions.length)throw replicaError('replica_project_invalid');
  return definitions.map(d=>d!);
}

/** Owner-provided journals for project-local plugin data, installed before mutations. */
export function installPersonalProjectPluginReplication(db: ReplicaDatabase, projectId: string, available: (pluginId:string)=>boolean): void {
  for(const {entry,binding} of builtinSyncBindings())if(available(entry.manifest.plugin_id)&&binding.scope==='project-database')binding.install?.(db,projectId);
  for(const {entry,binding} of builtinSyncBindings())if(available(entry.manifest.plugin_id)&&binding.scope==='project-sections')installProjectReplicaJournal(db,binding.namespace,projectContentReplicationOwners(binding.owners),[projectId]);
  for(const {binding} of builtinSyncBindings())if(binding.scope==='project-private-values')replicaTransaction(db,()=>{
    initializeReplica(namespacedReplicaDatabase(db,binding.namespace));
    installPrivateValueReplicationJournal(db,binding.owner({}),sql=>replicaMarkRowsSql(sql).replace(/\breplica_/g,binding.namespace+'_replica_'));
  });
}
