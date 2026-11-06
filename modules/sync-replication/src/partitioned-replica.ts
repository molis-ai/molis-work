import {syncError} from './sync-errors.js';
import {openSyncDatabase} from './database.js';
import type {SyncReplicaAdapter} from '@molis-ai/molis-work-contracts/platform/sync-transport';

/** Business data and its receipt commit in the partition first. A crash before the shared
 * cursor commits safely replays that receipt; never advance the cursor before owner data. */
export function partitionedReplica(options:{home:string;namespace:string;authorize():void;partitions():string[];projectPartitions?():string[];projectAbsent?(projectId:string):boolean;partition(key:string):string;projectPartition?(projectId:string):string;withPartition<T>(id:string,run:(adapter:SyncReplicaAdapter)=>T,passive?:boolean):T}):SyncReplicaAdapter {
  const db=<T>(run:(db:ReturnType<typeof openSyncDatabase>)=>T):T=>{
    options.authorize();const connection=openSyncDatabase(options.home);
    try{return run(connection);}finally{connection.close();}
  };
  const cursor=()=>db(d=>Number(d.prepare('SELECT cursor FROM sync_partition_cursors WHERE namespace=?').get(options.namespace)?.cursor??0));
  return {
    cursor,
    maintain(){for(const id of options.partitions()){options.authorize();options.withPartition(id,p=>p.maintain?.());options.authorize();}},
    locate(key){options.authorize();return options.withPartition(options.partition(key),p=>p.locate?.(key)??null,true);},
    hasProjectChanges(projectId){
      options.authorize();
      if(!options.projectPartition)throw syncError('unsupported','此集合尚未提供项目分区判断，原件已保留');
      const id=options.projectPartition(projectId);
      if(options.projectAbsent?.(projectId)===true){options.authorize();return false;}
      if(!(options.projectPartitions?.()??options.partitions()).includes(id))throw syncError('unavailable','此项目分区暂不可用，不能确认内容已同步');
      const counts=options.withPartition(id,p=>p.counts(),true);options.authorize();
      return counts.pending>0||counts.conflicts>0;
    },
    acknowledge(key,operationId,revision){options.authorize();options.withPartition(options.partition(key),p=>p.acknowledge(key,operationId,revision));},
    next(filter){for(const id of options.partitions()){options.authorize();const value=options.withPartition(id,p=>p.next(filter));if(value)return value;}return null;},
    receive(event,filter){
      options.authorize();if(event.revision<=cursor()&&!filter?.retry)return;
      options.withPartition(options.partition(event.key),p=>p.receive(event,filter));
      db(d=>d.prepare('INSERT INTO sync_partition_cursors VALUES (?,?) ON CONFLICT(namespace) DO UPDATE SET cursor=MAX(cursor,excluded.cursor)').run(options.namespace,event.revision));
    },
    counts(){return options.partitions().reduce((sum,id)=>{options.authorize();const c=options.withPartition(id,p=>p.counts(),true);return {pending:sum.pending+c.pending,conflicts:sum.conflicts+c.conflicts};},{pending:0,conflicts:0});},
    conflicts(){return options.partitions().flatMap(id=>{options.authorize();return options.withPartition(id,p=>p.conflicts());}).slice(0,100);},
    retryWaiting(){for(const id of options.partitions()){options.authorize();options.withPartition(id,p=>p.retryWaiting?.());}},
    resolve(key,choice,revision,state){options.authorize();options.withPartition(options.partition(key),p=>p.resolve(key,choice,revision,state));},
    inspectConflict(key){options.authorize();return options.withPartition(options.partition(key),p=>p.inspectConflict?.(key)??null);},
    recoveries(){return options.partitions().flatMap(id=>{options.authorize();return options.withPartition(id,p=>(p.recoveries?.()??[]).map(row=>({...row,id:JSON.stringify([id,row.id])})));}).slice(0,100);},
    inspectRecovery(id){options.authorize();const [partition,local]=recoveryId(id);return options.withPartition(partition,p=>{const row=p.inspectRecovery?.(local);return row?{...row,id}:null;});},
    restoreRecovery(id,choice,revision){options.authorize();const [partition,local]=recoveryId(id);options.withPartition(partition,p=>{if(!p.restoreRecovery)throw new Error('SYNC_RECOVERY_UNAVAILABLE');p.restoreRecovery(local,choice,revision);});},
  };
}
function recoveryId(id:string):[string,string]{const value:unknown=JSON.parse(id);if(!Array.isArray(value)||value.length!==2||value.some(part=>typeof part!=='string'||!part||part.length>500))throw new Error('SYNC_RECOVERY_INVALID');return value as [string,string];}
