import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteFileSync } from '@molis-ai/molis-work-storage';
import type { SyncDevicePreference } from '@molis-ai/molis-work-contracts/modules/sync-replication';
import { syncError } from './sync-errors.js';

/** Device-local, account-partitioned preference. Never sent to the sync Worker. */
export function syncDevicePreference(home:string,spaceId:string) {
  const file=path.join(home,'sync','device.json');
  const read=():SyncDevicePreference=>{
    if(!fs.existsSync(file))return {automatic:null};
    if(!fs.lstatSync(file).isFile())throw syncError('invalid','无法读取本机同步设置');
    const value:unknown=JSON.parse(fs.readFileSync(file,'utf8'));
    if(!value||typeof value!=='object'||!('version' in value)||value.version!==1||!('spaceId' in value)||value.spaceId!==spaceId||!('automatic' in value)||typeof value.automatic!=='boolean')throw syncError('invalid','本机同步设置无效，请检查当前账号空间');
    return {automatic:value.automatic};
  };
  const write=(automatic:boolean)=>{
    read();
    atomicWriteFileSync(file,JSON.stringify({version:1,spaceId,automatic}),{mode:0o600});
  };
  return {read,write};
}
