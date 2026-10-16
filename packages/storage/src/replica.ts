import type {SQLInputValue,SQLOutputValue} from "node:sqlite";
export type ReplicaInputValue=SQLInputValue;
export type ReplicaOutputValue=SQLOutputValue;
import { randomUUID } from 'node:crypto';
import type { SyncMutation, SyncEvent, SyncReplicaAdapter } from '@molis-ai/molis-work-contracts/platform/sync-transport';

/** Common borrowed connection surface for node:sqlite and better-sqlite3 owners. */
export interface ReplicaDatabase {
  exec(sql:string):unknown;
  prepare(sql:string):{get(...params:SQLInputValue[]):Record<string,SQLOutputValue>|undefined;all(...params:SQLInputValue[]):Record<string,SQLOutputValue>[];run(...params:SQLInputValue[]):unknown};
}
/** Only trusted composition code supplies this namespace, never wire data. */
export function namespacedReplicaDatabase(db:ReplicaDatabase,namespace:string):ReplicaDatabase {
  if(!/^[a-z][a-z0-9_]{0,40}$/.test(namespace))throw new Error('INVALID_REPLICA_NAMESPACE');
  const sql=(text:string)=>text.replace(/\breplica_/g,namespace+'_replica_');
  return {exec:text=>db.exec(sql(text)),prepare:text=>db.prepare(sql(text))};
}

const REPLICA_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS replica_state (id INTEGER PRIMARY KEY CHECK(id=1), device TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, applying INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS replica_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS replica_changes_key ON replica_changes(key);
    CREATE TABLE IF NOT EXISTS replica_heads (key TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS replica_outbox (key TEXT PRIMARY KEY, through_seq INTEGER NOT NULL, operation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS replica_conflicts (key TEXT PRIMARY KEY, event TEXT NOT NULL, reason TEXT NOT NULL, waiting INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS replica_resolutions (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, choice TEXT NOT NULL, local_json TEXT NOT NULL, remote_json TEXT NOT NULL);
  `;
/** Complete journal fragment, included in its owner's versioned baseline. */
export function replicaSchemaSql(namespace?:string):string {
 if(namespace&&!/^[a-z][a-z0-9_]{0,40}$/.test(namespace))throw new Error('INVALID_REPLICA_NAMESPACE');
 return namespace?REPLICA_SCHEMA_SQL.replace(/\breplica_/g,namespace+'_replica_'):REPLICA_SCHEMA_SQL;
}

/** Technical ledger borrowed by an owner. Triggers and owner writes share one transaction. */
export function initializeReplica(db: ReplicaDatabase): void {
  db.prepare("SELECT waiting FROM replica_conflicts LIMIT 0").all();
  db.prepare('INSERT OR IGNORE INTO replica_state(id,device) VALUES (1,?)').run(randomUUID());
}

/** Owner supplies an SQL key expression; identifiers/expressions must never come from user input. */
export function replicaMarkSql(keyExpression: string, condition = '1=1'): string {
  return `INSERT INTO replica_changes(key) SELECT ${keyExpression} WHERE (SELECT applying FROM replica_state WHERE id=1)=0 AND (${condition});`;
}

/** Seed or enqueue a known owner key through Storage rather than its journal table. */
export function queueReplicaChange(db: ReplicaDatabase, key: string): void {
  db.prepare('INSERT INTO replica_changes(key) VALUES (?)').run(key);
}

export function replicaTransaction<T>(db: ReplicaDatabase, run: () => T): T {
  db.exec('SAVEPOINT replica_write');
  try { const result=run(); db.exec('RELEASE replica_write'); return result; }
  catch(error) { db.exec('ROLLBACK TO replica_write; RELEASE replica_write'); throw error; }
}

export function createSqliteReplica(db: ReplicaDatabase, owner: {
  authorize(): void;
  canUpload?(key: string): boolean;
  read(key: string): unknown | null;
  apply(key: string, value: unknown | null): void;
}): SyncReplicaAdapter {
  const head=(key:string)=>Number(db.prepare('SELECT revision FROM replica_heads WHERE key=?').get(key)?.revision??0);
  const cursor=()=>Number(db.prepare('SELECT cursor FROM replica_state WHERE id=1').get()!.cursor);
  const setHead=(event:SyncEvent)=>db.prepare('INSERT INTO replica_heads VALUES (?,?) ON CONFLICT(key) DO UPDATE SET revision=excluded.revision').run(event.key,event.revision);
  const apply=(event:SyncEvent)=>{
    db.exec('UPDATE replica_state SET applying=1 WHERE id=1');
    owner.apply(event.key,event.value);
    db.exec('UPDATE replica_state SET applying=0 WHERE id=1');
  };
  const missingDependency=(error:unknown)=>!!error&&typeof error==='object'&&'details' in error&&!!error.details&&typeof error.details==='object'&&'sync_waiting' in error.details&&error.details.sync_waiting===true;
  const conflict=(event:SyncEvent,reason:string,waiting=false)=>db.prepare('INSERT INTO replica_conflicts(key,event,reason,waiting) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET event=excluded.event,reason=excluded.reason,waiting=excluded.waiting').run(event.key,JSON.stringify(event),reason,waiting?1:0);
  return {
    cursor,
    next() { return replicaTransaction(db,()=>{
      owner.authorize();
      const frozen=db.prepare('SELECT key,operation FROM replica_outbox WHERE key NOT IN (SELECT key FROM replica_conflicts) ORDER BY through_seq').all().find(row=>owner.canUpload?.(String(row.key))!==false);
      if(frozen)return JSON.parse(String(frozen.operation)) as SyncMutation;
      const row=db.prepare(`SELECT key,MAX(seq) AS seq FROM replica_changes WHERE key NOT IN (SELECT key FROM replica_conflicts) GROUP BY key ORDER BY MIN(seq)`).all().find(row=>owner.canUpload?.(String(row.key))!==false);
      if(!row)return null;
      const key=String(row.key),seq=Number(row.seq);
      const device=String(db.prepare('SELECT device FROM replica_state WHERE id=1').get()!.device);
      const operation:SyncMutation={operationId:`${device}:${seq}`,key,base:head(key),value:owner.read(key)};
      owner.authorize();
      db.prepare('INSERT INTO replica_outbox VALUES (?,?,?)').run(key,seq,JSON.stringify(operation));
      return operation;
    }); },
    receive(event) { replicaTransaction(db,()=>{
      owner.authorize();
      if(!Number.isSafeInteger(event.revision)||event.revision<1||typeof event.key!=='string')throw new Error('SYNC_INVALID_EVENT');
      if(event.revision<=cursor())return;
      const out=db.prepare('SELECT through_seq,operation FROM replica_outbox WHERE key=?').get(event.key);
      const own=out && JSON.parse(String(out.operation)).operationId===event.operationId;
      if(own){
        if(canonical(JSON.parse(String(out.operation)))!==canonical({operationId:event.operationId,key:event.key,base:event.base,value:event.value}))throw new Error('SYNC_RECEIPT_MISMATCH');
        db.prepare('DELETE FROM replica_changes WHERE key=? AND seq<=?').run(event.key,Number(out.through_seq));
        db.prepare('DELETE FROM replica_outbox WHERE key=?').run(event.key);
        setHead(event);
      } else if(db.prepare('SELECT 1 FROM replica_changes WHERE key=?').get(event.key)||db.prepare('SELECT 1 FROM replica_conflicts WHERE key=? AND waiting=0').get(event.key)) {
        conflict(event,'两台设备修改了同一项，双方内容均已保留');
      } else {
        try { replicaTransaction(db,()=>{apply(event);setHead(event);db.prepare('DELETE FROM replica_conflicts WHERE key=?').run(event.key);}); }
        catch(error) { owner.authorize(); conflict(event,error instanceof Error?error.message:'无法应用云端内容',missingDependency(error)); }
      }
      owner.authorize();
      db.prepare('UPDATE replica_state SET cursor=? WHERE id=1').run(event.revision);
    }); },
    counts(){return {pending:Number(db.prepare('SELECT COUNT(DISTINCT key) AS n FROM replica_changes').get()!.n),conflicts:Number(db.prepare('SELECT COUNT(*) AS n FROM replica_conflicts').get()!.n)};},
    conflicts(){return db.prepare('SELECT key,reason,waiting FROM replica_conflicts ORDER BY key LIMIT 100').all().map(row=>({key:String(row.key),reason:String(row.reason),waiting:!!row.waiting}));},
    retryWaiting(){replicaTransaction(db,()=>{
      owner.authorize();
      for(const row of db.prepare('SELECT key,event FROM replica_conflicts WHERE waiting=1 ORDER BY key').all()){
        const event=JSON.parse(String(row.event)) as SyncEvent;
        if(db.prepare('SELECT 1 FROM replica_changes WHERE key=?').get(event.key)||db.prepare('SELECT 1 FROM replica_outbox WHERE key=?').get(event.key)){
          conflict(event,'两台设备修改了同一项，双方内容均已保留');continue;
        }
        try{replicaTransaction(db,()=>{apply(event);setHead(event);db.prepare('DELETE FROM replica_conflicts WHERE key=?').run(event.key);owner.authorize();});}
        catch(error){owner.authorize();conflict(event,error instanceof Error?error.message:'无法应用云端内容',missingDependency(error));}
      }
      owner.authorize();
    });},
    resolve(key,choice){replicaTransaction(db,()=>{
      owner.authorize();
      const row=db.prepare('SELECT event,waiting FROM replica_conflicts WHERE key=?').get(key);
      if(!row)throw new Error('SYNC_CONFLICT_MISSING');
      if(row.waiting)throw new Error('关联资产尚未到达，请稍后重试同步');
      const event=JSON.parse(String(row.event)) as SyncEvent;
      if(choice!=='local'&&choice!=='remote')throw new Error('SYNC_INVALID_CHOICE');
      db.prepare('INSERT INTO replica_resolutions(key,choice,local_json,remote_json) VALUES (?,?,?,?)').run(key,choice,JSON.stringify(owner.read(key)),JSON.stringify(event));
      if(choice==='remote')apply(event);
      db.prepare('DELETE FROM replica_changes WHERE key=?').run(key);
      db.prepare('DELETE FROM replica_outbox WHERE key=?').run(key);
      db.prepare('DELETE FROM replica_conflicts WHERE key=?').run(key);
      setHead(event);
      if(choice==='local')db.prepare('INSERT INTO replica_changes(key) VALUES (?)').run(key);
      owner.authorize();
    });},
  };
}

function canonical(value:unknown):string {
  const sort=(v:unknown):unknown=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,sort(x)])):v;
  return JSON.stringify(sort(value));
}

/** SQL fragment for owner triggers; the technical table remains owned here. */
export function replicaApplyingSql():string {return "(SELECT applying FROM replica_state WHERE id=1)";}
