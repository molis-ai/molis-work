import {withWorkSessionReplica,hasSessionSyncProtectedData,sessionSyncReferenceDeclaration,modulesPrivateWorkContextContract} from '@molis-ai/molis-work-module-private-work-context';
import {createContextLedger,createContextHistoryReplication} from '@molis-ai/molis-work-module-context-ledger';
import {createLocalPayloadProtection,createLazyFileSecretStore,ensureStorageSpace} from '@molis-ai/molis-work-storage';
import {createSyncConflictState,createSyncJsonContent} from '@molis-ai/molis-work-plugin-sdk';
import {hasProtectedSyncPayloads,syncNamespace,type SyncRegistration} from '@molis-ai/molis-work-module-sync-replication';
import type {StorageSpace} from '@molis-ai/molis-work-contracts/platform/storage';
import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';
import {createSessionReplicationSupport} from './session-replication-support.js';

const errors=defineErrorCodes('host',{work_sync_scope:'forbidden',work_sync_unavailable:'unavailable'});
/** A system Module owner, not a fabricated plugin. The protocol's plugin_id field carries the existing Module contract identity. */
export function createPersonalWorkRegistration(home:string,space:StorageSpace,userId:string,authorize:()=>void,publisher:{publisher_id:string}):SyncRegistration {
  authorize();const bound=ensureStorageSpace(home);
  if(space.kind!=='personal'||bound.spaceId!==space.spaceId||bound.ownerUserId!==userId)throw errors.work_sync_scope('工作会话不属于当前个人空间');
  const selection={plugin_id:modulesPrivateWorkContextContract.contractId,publisher_id:publisher.publisher_id,publisher_signature:'official-private-work-context-binding',collection_id:'sessions',schema_version:1};
  const namespace=syncNamespace(selection),replication=createSessionReplicationSupport();let unavailable=false;
  const protection=createLocalPayloadProtection({secrets:createLazyFileSecretStore(home),keyRef:'system:sync:private-work-context:payload:v1',scope:JSON.stringify([space.spaceId,namespace]),authorize,
    hasProtectedData:()=>hasSessionSyncProtectedData(home,replication)||hasProtectedSyncPayloads(home,namespace)});
  const options={home,spaceId:space.spaceId,replication,authorize,protection,conflictState:createSyncConflictState,
    createLedger:(db:Parameters<typeof createContextLedger>[0],initializeSchema:boolean)=>createContextLedger(db,{initializeSchema,authorize:access=>{authorize();return access.scope.kind===sessionSyncReferenceDeclaration.scope.kind&&access.scope.id===sessionSyncReferenceDeclaration.scope.id;}}),
    createReferences:(db:Parameters<typeof createContextHistoryReplication>[0])=>createContextHistoryReplication(db,{...sessionSyncReferenceDeclaration,authorize}),
  };
  return {selection,title:'工作会话与交接',available:()=>!unavailable,protection,content:createSyncJsonContent({spaceId:space.spaceId,authorize}),
    async refresh(){authorize();try{withWorkSessionReplica(options,()=>{});unavailable=false;}catch(error){authorize();
      const code=error&&typeof error==='object'&&'code' in error?error.code:undefined;
      if(code==='SQLITE_BUSY'||code==='SQLITE_BUSY_TIMEOUT'||code==='SQLITE_LOCKED')throw error;
      unavailable=true; // Version/format refusal is unavailable, never an empty successful collection. Restart after explicit maintenance.
    }},
    async prepare(){authorize();},withReplica(run){authorize();if(unavailable)throw errors.work_sync_unavailable('工作会话库暂不可用，请检查当前格式并重启');return withWorkSessionReplica(options,run);},
  };
}
