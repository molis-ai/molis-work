import { LOCAL_PERSON_ACTOR_ID } from '@molis-ai/molis-work-contracts/platform/actions';
import { readSavedAgentHistory } from '@molis-ai/molis-work-service-agent-host';
import { savedHistoryFor } from './saved-history-host.js';
import { installProjectReplicaJournal, initializeReplica, namespacedReplicaDatabase, replicaMarkRowsSql, replicaTransaction, type ReplicaDatabase } from '@molis-ai/molis-work-storage';
import { sourceContentReplicationDefinition } from '@molis-ai/molis-work-module-sources';
import { signalContentReplicationDefinition } from '@molis-ai/molis-work-module-signals';
import { attentionContentReplicationDefinition } from '@molis-ai/molis-work-module-attention-resumption';
import { feedContentReplicationDefinition } from '@molis-ai/molis-work-module-feed';
import { installPrivateValueReplicationJournal } from '@molis-ai/molis-work-plugin-runtime';
import { installFeedReplication } from '@molis-ai/molis-work-plugin-feed';
import { installScheduleReplication } from '@molis-ai/molis-work-plugin-schedule';
import { codingContentReplicationDefinition, refreshCodingSavedHistory } from '@molis-ai/molis-work-plugin-coding';
import { builtinSyncBindings } from '@molis-ai/molis-work-app-workbench';
import { replicaError } from './project-replication-errors.js';

/** Owner definitions contain SQL facts only; plugin/collection placement has one catalog. */
type ContentOwner=import('@molis-ai/molis-work-contracts/platform/sync-transport').ProjectReplicaDefinition & {refreshExport?(home:string,db:ReplicaDatabase,projectId:string,authorize:()=>void):Promise<void>};
const PROJECT_CONTENT_OWNERS:readonly ContentOwner[] = [sourceContentReplicationDefinition(),attentionContentReplicationDefinition(),signalContentReplicationDefinition(),feedContentReplicationDefinition(),Object.assign(codingContentReplicationDefinition(readSavedAgentHistory),{async refreshExport(home:string,db:ReplicaDatabase,projectId:string,authorize:()=>void){await refreshCodingSavedHistory(db,projectId,id=>savedHistoryFor(home).read(id,{project_id:projectId,plugin_id:'io.molis.work.coding',actor_id:LOCAL_PERSON_ACTOR_ID},authorize),authorize,readSavedAgentHistory);}})];
export async function refreshProjectContentExports(ids:readonly string[],home:string,db:ReplicaDatabase,projectId:string,authorize:()=>void):Promise<void>{for(const owner of projectContentReplicationOwners(ids)){if(owner.refreshExport)await owner.refreshExport(home,db,projectId,authorize);}}
export function projectContentReplicationOwners(ids:readonly string[]){
  if(!ids.length||new Set(ids).size!==ids.length)throw replicaError('replica_project_invalid');
  return ids.map(id=>{const owner=PROJECT_CONTENT_OWNERS.find(d=>d.id===id);if(!owner)throw replicaError('replica_project_invalid');return owner;});
}

/** Owner-provided journals for project-local plugin data, installed before mutations. */
export function installPersonalProjectPluginReplication(db: ReplicaDatabase, projectId: string, available: (pluginId:string)=>boolean): void {
  if(available('io.molis.work.schedule'))installScheduleReplication(db, projectId);
  if(available('io.molis.work.feed'))installFeedReplication(db, projectId);
  for(const {entry,binding} of builtinSyncBindings())if(available(entry.manifest.plugin_id)&&binding.scope==='project-sections')installProjectReplicaJournal(db,binding.namespace,projectContentReplicationOwners(binding.owners),[projectId]);
  for(const {binding} of builtinSyncBindings())if(binding.scope==='project-private-values')replicaTransaction(db,()=>{
    initializeReplica(namespacedReplicaDatabase(db,binding.namespace));
    installPrivateValueReplicationJournal(db,binding.owner({}),sql=>replicaMarkRowsSql(sql).replace(/\breplica_/g,binding.namespace+'_replica_'));
  });
}
