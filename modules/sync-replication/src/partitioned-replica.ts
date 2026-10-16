import {openSyncDatabase} from './database.js';
import type {SyncReplicaAdapter} from '@molis-ai/molis-work-contracts/platform/sync-transport';

/** Business data and its receipt commit in the partition first. A crash before the shared
 * cursor commits safely replays that receipt; never advance the cursor before owner data. */
export function partitionedReplica(options:{home:string;namespace:string;authorize():void;partitions():string[];partition(key:string):string;withPartition<T>(id:string,run:(adapter:SyncReplicaAdapter)=>T):T}):SyncReplicaAdapter {
  const db=<T>(run:(db:ReturnType<typeof openSyncDatabase>)=>T):T=>{
    options.authorize();const connection=openSyncDatabase(options.home);
    try{return run(connection);}finally{connection.close();}
  };
  const cursor=()=>db(d=>Number(d.prepare('SELECT cursor FROM sync_partition_cursors WHERE namespace=?').get(options.namespace)?.cursor??0));
  return {
    cursor,
    next(){for(const id of options.partitions()){options.authorize();const value=options.withPartition(id,p=>p.next());if(value)return value;}return null;},
    receive(event){
      options.authorize();if(event.revision<=cursor())return;
      options.withPartition(options.partition(event.key),p=>p.receive(event));
      db(d=>d.prepare('INSERT INTO sync_partition_cursors VALUES (?,?) ON CONFLICT(namespace) DO UPDATE SET cursor=MAX(cursor,excluded.cursor)').run(options.namespace,event.revision));
    },
    counts(){return options.partitions().reduce((sum,id)=>{options.authorize();const c=options.withPartition(id,p=>p.counts());return {pending:sum.pending+c.pending,conflicts:sum.conflicts+c.conflicts};},{pending:0,conflicts:0});},
    conflicts(){return options.partitions().flatMap(id=>{options.authorize();return options.withPartition(id,p=>p.conflicts());}).slice(0,100);},
    retryWaiting(){for(const id of options.partitions()){options.authorize();options.withPartition(id,p=>p.retryWaiting?.());}},
    resolve(key,choice){options.authorize();options.withPartition(options.partition(key),p=>p.resolve(key,choice));},
  };
}
