import {openBaselineHomeSqlite,type SqliteBaseline} from '@molis-ai/molis-work-storage';
import {AsyncLocalStorage} from 'node:async_hooks';
import type {DatabaseSync} from 'node:sqlite';

export const SYNC_STORE_BASELINE:SqliteBaseline={version: /* @version database.sync_store_baseline */ 2,schema:`
CREATE TABLE sync_policy(id INTEGER PRIMARY KEY CHECK(id=1),json TEXT NOT NULL);
CREATE TABLE sync_partition_cursors(namespace TEXT PRIMARY KEY,cursor INTEGER NOT NULL);
CREATE TABLE sync_blob_parts(namespace TEXT NOT NULL,digest TEXT NOT NULL,part INTEGER NOT NULL,checksum TEXT NOT NULL,bytes BLOB NOT NULL,PRIMARY KEY(namespace,digest,part));
CREATE TABLE sync_payload_modes(namespace TEXT PRIMARY KEY,protected INTEGER NOT NULL CHECK(protected IN (0,1)));
CREATE TABLE sync_blob_uploads(namespace TEXT NOT NULL,operation TEXT NOT NULL,digest TEXT NOT NULL,PRIMARY KEY(namespace,operation,digest));
CREATE TABLE sync_stream_cursors(namespace TEXT PRIMARY KEY,cursor INTEGER NOT NULL);
CREATE TABLE sync_failures(namespace TEXT NOT NULL,key TEXT NOT NULL,direction TEXT NOT NULL CHECK(direction IN ('upload','download')),event TEXT,reason TEXT NOT NULL,revision INTEGER NOT NULL,automatic INTEGER NOT NULL CHECK(automatic IN (0,1)),attempts INTEGER NOT NULL DEFAULT 0,next_retry_at INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(namespace,key,direction));
`,upgrades:[{from:1,sql:`
ALTER TABLE sync_failures ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_failures ADD COLUMN next_retry_at INTEGER NOT NULL DEFAULT 0;
`}]};
export function openSyncDatabase(home:string){return openBaselineHomeSqlite(home,'sync',SYNC_STORE_BASELINE);}
export const SYNC_HOME_STORE={path:'sync',library:{baseline:SYNC_STORE_BASELINE}} as const;

const cycleDatabase=new AsyncLocalStorage<{home:string;signal:AbortSignal;database:DatabaseSync|null}>();

/** A cycle owns the connection. Each borrow is synchronous and only for its exact Home. */
export function withSyncDatabase<T>(home:string,run:(db:DatabaseSync)=>T):T {
  const cycle=cycleDatabase.getStore();
  if(cycle?.home===home){
    cycle.signal.throwIfAborted();
    if(!cycle.database)throw new Error('SYNC_CYCLE_CLOSED');
    return run(cycle.database);
  }
  const db=openSyncDatabase(home);
  try{return run(db);}finally{db.close();}
}

export async function withSyncCycleDatabase<T>(home:string,signal:AbortSignal,run:()=>Promise<T>):Promise<T> {
  signal.throwIfAborted();
  const cycle={home,signal,database:openSyncDatabase(home) as DatabaseSync|null};
  const close=()=>{
    const db=cycle.database;
    cycle.database=null;
    db?.close();
  };
  // All uses are synchronous. Deferring the close allows an interrupted transaction to unwind.
  const abort=()=>queueMicrotask(close);
  signal.addEventListener('abort',abort,{once:true});
  try{return await cycleDatabase.run(cycle,run);}
  finally{signal.removeEventListener('abort',abort);close();}
}
