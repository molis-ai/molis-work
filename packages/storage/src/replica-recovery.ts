import type {SyncEvent,SyncReplicaAdapter} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type {ReplicaDatabase} from './replica.js';
import {syncError} from './project-replica-sync-errors.js';
import type {replicaSerialization} from './replica-serialization.js';
import {authorizeReplicaValue,replicaKeyVisible,type ReplicaScopeOwner} from './replica-authorization.js';

export function replicaRecovery(db:ReplicaDatabase,owner:ReplicaScopeOwner&{read(key:string):unknown},head:(key:string)=>number,apply:(key:string,value:unknown)=>void,transaction:<T>(run:()=>T)=>T,enqueue:(key:string)=>void,comparison:(key:string,event:SyncEvent,local:unknown)=>string,serial:ReturnType<typeof replicaSerialization>):Pick<SyncReplicaAdapter,'inspectConflict'|'recoveries'|'inspectRecovery'|'restoreRecovery'> {
  const recovery=(id:string)=>{
    owner.authorize();if(!/^[1-9][0-9]*$/.test(id))throw syncError('invalid','恢复版本标识无效');
    const row=db.prepare('SELECT id,key,choice,local_json,remote_json FROM replica_resolutions WHERE id=?').get(Number(id));
    if(row)authorizeReplicaValue(owner,String(row.key));return row;
  };
  return {
    inspectConflict(key){
      authorizeReplicaValue(owner,key);const row=db.prepare('SELECT key,event,reason FROM replica_conflicts WHERE key=?').get(key);if(!row)return null;
      const event=serial.read(row.event,key,'conflict') as SyncEvent;
      authorizeReplicaValue(owner,key,event.value);const local=owner.read(key);authorizeReplicaValue(owner,key,local);
      return {key,revision:event.revision,state:comparison(key,event,local),reason:String(row.reason),local,remote:event?.value??null};
    },
    recoveries(){
      owner.authorize();return db.prepare('SELECT id,key,choice,local_json,remote_json FROM replica_resolutions ORDER BY id DESC LIMIT 50').all().filter(row=>{
        const key=String(row.key);if(!replicaKeyVisible(owner,key))return false;
        if(!replicaKeyVisible(owner,key,serial.read(row.local_json,key,'recovery_local')))return false;
        const event=serial.read(row.remote_json,key,'recovery_remote') as SyncEvent|null;
        return replicaKeyVisible(owner,key,event?.value??null);
      }).map(row=>({id:String(row.id),key:String(row.key),choice:String(row.choice),revision:head(String(row.key))}));
    },
    inspectRecovery(id){
      const row=recovery(id);if(!row)return null;const key=String(row.key),event=serial.read(row.remote_json,key,'recovery_remote') as SyncEvent|null;
      const local=serial.read(row.local_json,key,'recovery_local');authorizeReplicaValue(owner,key,local);authorizeReplicaValue(owner,key,event?.value??null);
      return {id,key,choice:String(row.choice),revision:head(key),local,remote:event?.value??null};
    },
    restoreRecovery(id,choice,expectedRevision){transaction(()=>{
      const row=recovery(id);if(!row||!['local','remote'].includes(choice)||!Number.isSafeInteger(expectedRevision))throw syncError('invalid','恢复版本不存在或选择无效');
      const key=String(row.key);
      const localUndo=row.choice==='local_delete'&&choice==='local'&&owner.read(key)===null;
      if(head(key)!==expectedRevision||!localUndo&&db.prepare('SELECT 1 FROM replica_changes WHERE key=?').get(key)||db.prepare('SELECT 1 FROM replica_outbox WHERE key=?').get(key)||db.prepare('SELECT 1 FROM replica_conflicts WHERE key=?').get(key))throw syncError('conflict','此资产已有新修改或待处理内容，请重新查看');
      const event=serial.read(row.remote_json,String(row.key),'recovery_remote') as SyncEvent|null,value=choice==='local'?serial.read(row.local_json,String(row.key),'recovery_local'):event?.value??null;
      authorizeReplicaValue(owner,key,serial.read(row.local_json,key,'recovery_local'));authorizeReplicaValue(owner,key,event?.value??null);
      db.prepare('INSERT INTO replica_resolutions(key,choice,local_json,remote_json) VALUES (?,?,?,?)').run(key,'restore_'+choice,serial.write(owner.read(key),key,'recovery_local'),serial.write(event,key,'recovery_remote'));
      apply(key,value);owner.authorize();enqueue(key);
    });},
  };
}
