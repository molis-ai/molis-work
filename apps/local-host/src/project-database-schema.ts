import {LOCAL_PERSON_ACTOR_ID} from '@molis-ai/molis-work-contracts/platform/actions';
import {readSavedAgentHistory} from '@molis-ai/molis-work-service-agent-host';
import {savedHistoryFor} from './saved-history-host.js';
import { replicaSchemaSql,installProjectReplicaJournal,STORAGE_SPACE_SCHEMA_SQL,initializeReplica,namespacedReplicaDatabase,replicaMarkRowsSql,replicaTransaction } from "@molis-ai/molis-work-storage";
import { LOCAL_JOURNAL_SCHEMA_SQL, LOCAL_OPAQUE_BLOB_SCHEMA_SQL, type SqliteBaseline } from "@molis-ai/molis-work-storage";
import {
  GOAL_BOARDS_SCHEMA_SQL,
  GOAL_EVENT_FACTS_SCHEMA_SQL,
  GOAL_EVENT_STATE_SCHEMA_SQL,
  GOAL_INPUT_BINDINGS_SCHEMA_SQL,
  GOALS_SCHEMA_SQL,
} from "@molis-ai/molis-work-module-goals";
import { GOVERNANCE_SCHEMA_SQL } from "@molis-ai/molis-work-module-governance-collaboration";
import { ARTIFACTS_SCHEMA_SQL, PROCESS_ITEMS_SCHEMA_SQL } from "@molis-ai/molis-work-module-artifacts";
import { CONTEXT_LEDGER_SCHEMA } from "@molis-ai/molis-work-module-context-ledger";
import { SOURCES_SCHEMA_SQL,sourceContentReplicationDefinition } from "@molis-ai/molis-work-module-sources";
import { SIGNALS_SCHEMA_SQL,signalContentReplicationDefinition } from "@molis-ai/molis-work-module-signals";
import { ATTENTION_SCHEMA_SQL,attentionContentReplicationDefinition } from "@molis-ai/molis-work-module-attention-resumption";
import { FEED_SCHEMA_SQL,feedContentReplicationDefinition } from "@molis-ai/molis-work-module-feed";
import { LISTENER_HOST_SCHEMA_SQL } from "@molis-ai/molis-work-service-listener-host";
import { SCHEDULER_SCHEMA_SQL } from "@molis-ai/molis-work-service-scheduler";
import {
  PLUGIN_EVENTS_SCHEMA_SQL,
  PLUGIN_PRIVATE_STORAGE_SCHEMA_SQL,
  PLUGIN_RELEASE_ARTIFACTS_SCHEMA_SQL,
  PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL,
  PLUGIN_WIRING_SCHEMA_SQL,
  installPrivateValueReplicationJournal,
} from "@molis-ai/molis-work-plugin-runtime";
import { FEED_OUT_RULES_SCHEMA_SQL, installFeedReplication } from "@molis-ai/molis-work-plugin-feed";
import { SCHEDULE_REMINDERS_SCHEMA_SQL, SCHEDULE_TASKS_SCHEMA_SQL, SCHEDULED_OPERATIONS_SCHEMA_SQL, installScheduleReplication } from "@molis-ai/molis-work-plugin-schedule";
import type { ReplicaDatabase } from "@molis-ai/molis-work-storage";
import { CODING_SCHEMA_SQL,codingContentReplicationDefinition,refreshCodingSavedHistory } from "@molis-ai/molis-work-plugin-coding";
import { PROJECT_BROWSING_SETTINGS_SCHEMA_SQL } from "./project-browsing-settings.js";
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

/**
 * A project's database (`projects/<id>/molis-work.db`) as one current schema (repository-anti-corruption §4.1): every
 * owner that keeps tables there hands over its creation statements, and the host creates them all at once with the
 * version. A database at another version is refused, never upgraded in place. Owners still create their own tables
 * when they open (`IF NOT EXISTS`), which is a no-op here; changing any of them means a new version.
 */
export const PROJECT_DATABASE_BASELINE: SqliteBaseline = {
  version: 15,
  schema: ([
    STORAGE_SPACE_SCHEMA_SQL,
    GOAL_BOARDS_SCHEMA_SQL,
    GOALS_SCHEMA_SQL,
    GOAL_INPUT_BINDINGS_SCHEMA_SQL,
    GOAL_EVENT_FACTS_SCHEMA_SQL,
    GOAL_EVENT_STATE_SCHEMA_SQL,
    GOVERNANCE_SCHEMA_SQL,
    ARTIFACTS_SCHEMA_SQL,
    PROCESS_ITEMS_SCHEMA_SQL,
    LOCAL_JOURNAL_SCHEMA_SQL,
    CONTEXT_LEDGER_SCHEMA,
    SOURCES_SCHEMA_SQL,
    SIGNALS_SCHEMA_SQL,
    LISTENER_HOST_SCHEMA_SQL,
    ATTENTION_SCHEMA_SQL,
    FEED_SCHEMA_SQL,
    FEED_OUT_RULES_SCHEMA_SQL,
    LOCAL_OPAQUE_BLOB_SCHEMA_SQL,
    PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL,
    PLUGIN_RELEASE_ARTIFACTS_SCHEMA_SQL,
    PLUGIN_PRIVATE_STORAGE_SCHEMA_SQL,
    PLUGIN_EVENTS_SCHEMA_SQL,
    PLUGIN_WIRING_SCHEMA_SQL,
    SCHEDULER_SCHEMA_SQL,
    SCHEDULE_TASKS_SCHEMA_SQL,
    SCHEDULE_REMINDERS_SCHEMA_SQL,
    SCHEDULED_OPERATIONS_SCHEMA_SQL,
    CODING_SCHEMA_SQL,
    PROJECT_BROWSING_SETTINGS_SCHEMA_SQL,
  ].join("\n"))+replicaSchemaSql('goals')+replicaSchemaSql('artifacts')+replicaSchemaSql('process_items')+replicaSchemaSql('schedule')+replicaSchemaSql('feed')+replicaSchemaSql('sources')+replicaSchemaSql('attention')+replicaSchemaSql('messages')+replicaSchemaSql('coding')+replicaSchemaSql('builder'),
};

/** Owner-provided journals for project-local plugin data, installed before mutations. */
export function installPersonalProjectPluginReplication(db: ReplicaDatabase, projectId: string): void {
  installScheduleReplication(db, projectId);
  installFeedReplication(db, projectId);
  for(const {binding} of builtinSyncBindings())if(binding.scope==='project-sections')installProjectReplicaJournal(db,binding.namespace,projectContentReplicationOwners(binding.owners),[projectId]);
  for(const {binding} of builtinSyncBindings())if(binding.scope==='project-private-values')replicaTransaction(db,()=>{
    initializeReplica(namespacedReplicaDatabase(db,binding.namespace));
    installPrivateValueReplicationJournal(db,binding.owner({}),sql=>replicaMarkRowsSql(sql).replace(/\breplica_/g,binding.namespace+'_replica_'));
  });
}
