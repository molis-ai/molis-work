import { isLoopbackHostname } from '@molis-ai/molis-work-contracts/platform/loopback';
import { syncError } from './sync-errors.js';

/** Only a trusted Host configuration selects a destination; never a browser request. */
export function validateSyncEndpoint(input:string):string {
  let url:URL;
  try{url=new URL(input);}catch{throw syncError('invalid','同步服务地址配置无效');}
  const local=url.origin==='http://127.0.0.1:8788';
  if(input!==url.origin||url.username||url.password||url.search||url.hash||url.pathname!=='/'
    ||(!local&&(url.protocol!=='https:'||isLoopbackHostname(url.hostname))))throw syncError('invalid','同步服务须使用 HTTPS 来源地址；本机联调仅允许 127.0.0.1:8788');
  return url.origin;
}

export function resolveSyncEndpoint(config:{origin?:string;local:boolean}):string|null {
  if(config.origin&&config.local)throw syncError('invalid','云端同步与本机联调不能同时启用');
  if(!config.origin)return config.local?'http://127.0.0.1:8788':null;
  const origin=validateSyncEndpoint(config.origin);
  if(new URL(origin).protocol!=='https:')throw syncError('invalid','本机同步地址请通过联调开关启用');
  return origin;
}
