import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';
export const studioSyncErrors=defineErrorCodes('alchemist',{sync_invalid:'invalid',sync_busy:'unavailable',sync_scope:'forbidden',sync_limit:'too_large'});
