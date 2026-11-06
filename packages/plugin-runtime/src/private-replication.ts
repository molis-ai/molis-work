import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';
import type {PrivateValueReplicationOwner} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type {PluginPrivateStorageDatabase} from './private-storage.js';
import {compareAndSetPrivateValue} from './private-value.js';
export {installPrivateValueReplicationJournal} from './private-replication-journal.js';

const errors=defineErrorCodes('plugin',{sync_private_invalid:'invalid',sync_private_conflict:'conflict'});
function invalid():never{throw errors.sync_private_invalid('私有文档同步声明或内容无效');}
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))return invalid();return v as Record<string,unknown>;};
const exact=(v:Record<string,unknown>,keys:readonly string[])=>{if(Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))invalid();};
export interface PrivateValueReplicaContext {spaceId:string;projectId:string;title:string;authorize():void}
export function checkPrivateValueOwner(owner:PrivateValueReplicationOwner):void{
 const name=(s:string)=>/^[a-z][a-z0-9_]*$/.test(s);
 if(!name(owner.id)||!name(owner.assetKind)||!/^[a-zA-Z0-9_.:-]{1,160}:$/.test(owner.namespacePrefix)||!/^[a-zA-Z0-9_.:-]{1,200}$/.test(owner.key)
  ||!Array.isArray(owner.journal)||!owner.journal.length||owner.journal.length>20||owner.journal.some(j=>!j||!name(j.array)||!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(j.id))
  ||new Set(owner.journal.map(j=>j.array)).size!==owner.journal.length)invalid();
}
function item(owner:PrivateValueReplicationOwner,context:PrivateValueReplicaContext,key:string):string{
 checkPrivateValueOwner(owner);const parts:unknown=JSON.parse(key);
 if(!Array.isArray(parts)||parts.length!==3||parts[0]!==context.projectId||parts[1]!==owner.assetKind||typeof parts[2]!=='string'
  ||!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$/.test(parts[2])||['__proto__','constructor','prototype'].includes(parts[2]))return invalid();
 return parts[2];
}
/** Pure full validation before a Host creates a missing target project or stages bytes. */
export function validatePrivateValueReplication(value:unknown,owner:PrivateValueReplicationOwner,context:PrivateValueReplicaContext,key:string):unknown{
 context.authorize();const id=item(owner,context,key);if(value===null)return null;
 const wire=object(value);exact(wire,['format','spaceId','project','content']);const project=object(wire.project);exact(project,['id','title']);
 if(wire.format!==1||wire.spaceId!==context.spaceId||project.id!==context.projectId||typeof project.title!=='string'||!project.title.trim()||project.title.length>120||wire.content===null)invalid();
 if(Buffer.byteLength(JSON.stringify(value))>100000000)invalid();owner.validate(wire.content,context.projectId,id);context.authorize();return wire.content;
}
/** Runtime owns the table; Storage owns the transaction and common queue. No business document is duplicated. */
export function privateValueReplicaOwner(db:PluginPrivateStorageDatabase,owner:PrivateValueReplicationOwner,context:PrivateValueReplicaContext){
 checkPrivateValueOwner(owner);
 const read=()=>{const row=db.prepare('SELECT item_value FROM plugin_private_values WHERE install_id=? AND item_key=?').get(owner.namespacePrefix+context.projectId,owner.key) as {item_value:string}|undefined;
  const raw=row?.item_value??null;const value:unknown=raw===null?null:JSON.parse(raw);if(raw!==null&&value===null)invalid();return {raw,value};};
 return {authorize:context.authorize,
  read(key:string){context.authorize();const id=item(owner,context,key),local=read();if(local.value===null)return null;
   const content=owner.project(local.value,context.projectId,id);if(content===null)return null;
   const value={format:1,spaceId:context.spaceId,project:{id:context.projectId,title:context.title},content};validatePrivateValueReplication(value,owner,context,key);return value;},
  apply(key:string,value:unknown|null){const content=validatePrivateValueReplication(value,owner,context,key),id=item(owner,context,key),local=read();
   owner.beforeClear?.(local.value,context.projectId,id);const restored=owner.restore(content,local.value,context.projectId,id);
   const encoded=restored===null?null:JSON.stringify(restored);context.authorize();
   if(!compareAndSetPrivateValue(db,owner.namespacePrefix+context.projectId,owner.key,local.raw,encoded))throw errors.sync_private_conflict('私有文档已更新，原内容已保留');
   context.authorize();
  },
 };
}
