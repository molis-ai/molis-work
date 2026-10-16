import { defineErrorCodes, type ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { SyncFailureReason } from '@molis-ai/molis-work-contracts/platform/plugin';
const errors=defineErrorCodes('sync_replication', {
 sync_invalid:'invalid',sync_unsupported:'invalid',sync_scope:'forbidden',sync_conflict:'conflict',
 sync_dependencies:'conflict',sync_busy:'conflict',sync_limit:'too_large',
});
export function syncError(reason:SyncFailureReason,message:string):ActionError {
 return errors[`sync_${reason}`](message,{sync_waiting:reason==='dependencies'});
}
