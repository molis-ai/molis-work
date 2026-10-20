import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';
export const workSyncErrors=defineErrorCodes('work.session',{
  sync_invalid:'invalid',sync_scope:'forbidden',sync_limit:'too_large',sync_unavailable:'unavailable',sync_busy:'unavailable',
});
