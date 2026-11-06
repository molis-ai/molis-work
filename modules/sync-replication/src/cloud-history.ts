import type {SyncBlobReference,SyncEvent} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type {SyncRegistration} from './index.js';
import {blobTransfer,type BlobChannel} from './blob-transfer.js';
import {decodeContent} from './decode-content.js';
import {pinSyncProtection} from './local-protection.js';
import {syncError} from './sync-errors.js';

interface Page<T,C>{items:T[];more:boolean;next:C|null}
interface HistoryKey {key:string;currentRevision:number;versions:number;retainedAt:number}
interface HistoryVersion {revision:number;createdAt:number;action:'write'|'restore'|'archive';retained:boolean;current:boolean}
interface Inspection {event:SyncEvent&{attachments?:SyncBlobReference[]};createdAt:number;currentRevision:number;retained:boolean}
interface Scope {registration:SyncRegistration;policyRevision:number;channel:BlobChannel}
interface Ports {home:string;scope(namespace:string):Scope;run():Promise<void>}
const positive=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0;
const keyValid=(key:unknown)=>typeof key==='string'&&key.length>0&&key.length<=500;
const invalid=()=>syncError('invalid','保留版本响应无效，原件已保留');
function page<T,C>(value:Page<T,C>,valid:(item:T)=>boolean,cursor:(value:unknown)=>boolean):Page<T,C>{
  if(!value||!Array.isArray(value.items)||value.items.length>20||typeof value.more!=='boolean'||value.items.some(item=>!item||!valid(item))||value.more&&(!value.items.length||!cursor(value.next)))throw invalid();
  return value;
}
function identity(key:string,source:number,current:number){if(!keyValid(key)||!positive(source)||!positive(current)||source===current)throw syncError('invalid','请选择可恢复的保留版本');}

/** Account-scoped history is read without owner preparation, business writes or a new synchronization engine. */
export function cloudHistory(ports:Ports){
  return {
    async keys(namespace:string,after?:string){
      if(after!==undefined&&!keyValid(after))throw invalid();const {channel}=ports.scope(namespace);
      const query=new URLSearchParams({namespace,...(after===undefined?{}:{after})});
      const result=await channel.json<Page<HistoryKey,string>>('/v1/history/keys?'+query);channel.assert();
      const parsed=page(result,item=>keyValid(item.key)&&positive(item.currentRevision)&&positive(item.versions)&&positive(item.retainedAt),keyValid);
      let previous=after??'';for(const item of parsed.items){if(Buffer.compare(Buffer.from(item.key),Buffer.from(previous))<=0)throw invalid();previous=item.key;}
      if(parsed.more&&parsed.next!==previous)throw invalid();return parsed;
    },
    async versions(namespace:string,key:string,before?:number){
      if(!keyValid(key)||before!==undefined&&!positive(before))throw invalid();const {channel}=ports.scope(namespace);
      const query=new URLSearchParams({namespace,key,...(before===undefined?{}:{before:String(before)})});
      const result=await channel.json<Page<HistoryVersion,number>&{currentRevision:number}>('/v1/history?'+query);channel.assert();
      page(result,item=>positive(item.revision)&&positive(item.createdAt)&&['write','restore','archive'].includes(item.action)&&typeof item.retained==='boolean'&&typeof item.current==='boolean',positive);
      if(!positive(result.currentRevision))throw invalid();let previous=before??Number.MAX_SAFE_INTEGER;
      for(const item of result.items){if(item.revision>=previous||item.current!==(item.revision===result.currentRevision))throw invalid();previous=item.revision;}
      if(result.more&&result.next!==previous)throw invalid();
      return result;
    },
    async inspect(namespace:string,key:string,revision:number){
      if(!keyValid(key)||!positive(revision))throw invalid();const {channel,registration}=ports.scope(namespace);
      const result=await channel.json<Inspection>('/v1/history/version?'+new URLSearchParams({namespace,key,revision:String(revision)}));channel.assert();
      if(!result||!result.event||result.event.key!==key||result.event.revision!==revision||!positive(result.currentRevision)||!positive(result.createdAt)||typeof result.retained!=='boolean'||typeof result.event.operationId!=='string'||!result.event.operationId||!Number.isSafeInteger(result.event.base)||result.event.base<0||result.event.base>=revision||!Object.hasOwn(result.event,'value'))throw invalid();
      pinSyncProtection(ports.home,namespace,()=>channel.assert(),registration.protection);
      const transfer=blobTransfer(ports.home,channel),event=await decodeContent(registration,result.event,ref=>transfer.download(namespace,ref,registration.protection));channel.assert();
      transfer.release(namespace,result.event.attachments??[]);
      return {key,revision,createdAt:result.createdAt,currentRevision:result.currentRevision,retained:result.retained,value:event.value};
    },
    async restore(namespace:string,key:string,sourceRevision:number,revision:number,operationId:string){
      identity(key,sourceRevision,revision);if(typeof operationId!=='string'||!operationId||operationId.length>150)throw invalid();
      const {channel,policyRevision}=ports.scope(namespace);
      const receipt=await channel.json<{accepted:boolean;revision:number}>('/v1/history/restore',{namespace,key,sourceRevision,revision,operationId,policyRevision});channel.assert();
      if(receipt.accepted!==true||!positive(receipt.revision)||receipt.revision<=revision)throw invalid();
      await ports.run();channel.assert();return receipt;
    },
    async purge(namespace:string,key:string,sourceRevision:number,revision:number,confirm:boolean){
      identity(key,sourceRevision,revision);if(confirm!==true)throw syncError('invalid','请确认永久删除此保留版本');
      const {channel}=ports.scope(namespace),receipt=await channel.json<{accepted:boolean}>('/v1/history/purge',{namespace,key,sourceRevision,revision,confirm});channel.assert();
      if(receipt.accepted!==true)throw invalid();await ports.run();channel.assert();
    },
  };
}
