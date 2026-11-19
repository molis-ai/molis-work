import {createHash} from 'node:crypto';
import type {SyncConflictInspection} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type {SyncRegistration} from './index.js';
import {blobReference,blobTransfer,type BlobChannel} from './blob-transfer.js';
import {pinSyncProtection} from './local-protection.js';
import {syncError} from './sync-errors.js';

/** Preserve the losing branch before the owner's original compare-and-swap resolves it. */
export async function retainConflict(options:{home:string;namespace:string;key:string;choice:'local'|'remote';revision?:number;state?:string;policyRevision:number;registration:SyncRegistration;channel:BlobChannel}):Promise<SyncConflictInspection>{
  const {home,namespace,key,choice,registration,channel}=options;
  channel.assert();
  if(choice!=='local'&&choice!=='remote')throw syncError('invalid','请选择要保留的版本');
  const inspection=registration.withReplica(replica=>{
    if(replica.conflicts().find(conflict=>conflict.key===key)?.waiting)throw syncError('conflict','关联资产尚未到达，请稍后重试同步');
    if(!replica.inspectConflict)throw syncError('unsupported','此集合未提供冲突比较，原件已保留');
    return replica.inspectConflict(key);
  });
  if(!inspection)throw syncError('conflict','冲突已变化，请重新查看');
  if(inspection.key!==key||!Number.isSafeInteger(inspection.revision)||inspection.revision<1||typeof inspection.state!=='string'||!inspection.state)throw syncError('invalid','冲突比较无效，原件已保留');
  if(options.revision!==undefined&&options.revision!==inspection.revision)throw syncError('conflict','冲突版本已变化，请重新查看');
  if(options.state!==undefined&&options.state!==inspection.state)throw syncError('conflict','比较内容已变化，请重新查看');
  if(choice==='local'){
    const receipt=await channel.json<{accepted:boolean;revision:number}>('/v1/history/pin',{namespace,key,revision:inspection.revision,policyRevision:options.policyRevision});
    channel.assert();
    if(receipt.accepted!==true||receipt.revision!==inspection.revision)throw syncError('invalid','保留版本回执无效，原件已保留');
  }else{
    pinSyncProtection(home,namespace,()=>channel.assert(),registration.protection);
    const encoded=registration.content&&inspection.local!==null?registration.content.encode(key,inspection.local):{value:inspection.local,blobs:[]};
    const operationId='conflict-'+createHash('sha256').update(JSON.stringify([namespace,key,inspection.revision,inspection.state,choice])).digest('hex');
    const transfer=blobTransfer(home,channel);
    for(const source of encoded.blobs)await transfer.upload(namespace,operationId,source);
    try{
      const receipt=await channel.json<{accepted:boolean;revision:number}>('/v1/history/archive',{namespace,policyRevision:options.policyRevision,mutation:{operationId,key,base:inspection.revision,value:encoded.value},attachments:encoded.blobs.map(blobReference)});
      channel.assert();
      if(receipt.accepted!==true||!Number.isSafeInteger(receipt.revision)||receipt.revision<=inspection.revision)throw syncError('invalid','保留版本回执无效，原件已保留');
    }finally{transfer.forget(namespace,operationId);}
  }
  channel.assert();return inspection;
}
