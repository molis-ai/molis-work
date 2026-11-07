import type { SyncQuotaStatus } from '@molis-ai/molis-work-contracts/modules/sync-replication';
import { syncError } from './sync-errors.js';

export function parseSyncQuota(value:unknown):SyncQuotaStatus {
  if(!value||typeof value!=='object'||!('limitBytes' in value)||value.limitBytes!==100000000
    ||!('usedBytes' in value)||!Number.isSafeInteger(value.usedBytes)||Number(value.usedBytes)<0)throw syncError('invalid','同步容量响应无效');
  return {limitBytes:value.limitBytes,usedBytes:Number(value.usedBytes)};
}

export function syncResponseMessage(code:unknown):string {
  if(code==='SYNC_READ_ONLY')return '同步服务正在维护，本机原件和待同步内容已保留';
  if(code==='SYNC_INVALID_WRITE_MODE')return '同步服务配置无效，请联系管理员；本机原件和待同步内容已保留';
  if(code==='SYNC_QUOTA_EXCEEDED')return '个人空间云端容量已达 100 MB，内容仍保留在本机；可继续下载和同步删除';
  if(code==='SYNC_SCHEMA_MISMATCH')return '同步服务数据库版本不匹配，请联系管理员；本机数据未修改';
  return typeof code==='string'?code:'同步服务暂时不可用';
}

export function syncQuotaError(){return syncError('limit',syncResponseMessage('SYNC_QUOTA_EXCEEDED'),{sync_quota:true});}
export function isSyncQuotaError(error:unknown):boolean {
  return !!error&&typeof error==='object'&&'details' in error&&!!error.details&&typeof error.details==='object'&&'sync_quota' in error.details&&error.details.sync_quota===true;
}
