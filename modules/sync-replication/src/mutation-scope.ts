import type {SyncEvent,SyncReplicaAdapter} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type {SyncRegistration} from './index.js';
export type SyncMutationScope =
 | {kind:'receive';event:SyncEvent;retry:boolean}
 | {kind:'retry-waiting'}
 | {kind:'resolve';key:string;choice:'local'|'remote';revision:number;state:string}
 | {kind:'restore-recovery';id:string;choice:'local'|'remote';revision:number};
/** Lifecycle owners may hold an asynchronous reservation; the final synchronous adapter still owns CAS and writes. */
export async function withSyncMutation<T>(registration:SyncRegistration,scope:SyncMutationScope,check:()=>void,run:(replica:SyncReplicaAdapter)=>T):Promise<T> {
 check();let invoked=false,active=true;
 const commit=()=>{check();if(!active)throw new Error('SYNC_MUTATION_SCOPE_CLOSED');if(invoked)throw new Error('SYNC_MUTATION_SCOPE_REUSED');invoked=true;const result=registration.withReplica(run);check();return result;};
 try{const result=registration.withMutation?await registration.withMutation(scope,commit):commit();
 check();if(!invoked)throw new Error('SYNC_MUTATION_SCOPE_NOT_COMMITTED');return result;}finally{active=false;}
}
