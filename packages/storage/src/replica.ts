import type {SQLInputValue,SQLOutputValue} from "node:sqlite";
export type ReplicaInputValue=SQLInputValue;
export type ReplicaOutputValue=SQLOutputValue;
import { randomUUID } from 'node:crypto';
import {syncError} from './project-replica-sync-errors.js';
import {platformErrorKind} from '@molis-ai/molis-work-contracts/platform/actions';
import {replicaRecovery} from './replica-recovery.js';
import {replicaSerialization} from './replica-serialization.js';
import type { SyncMutation, SyncEvent, SyncReplicaAdapter } from '@molis-ai/molis-work-contracts/platform/sync-transport';

/** Common borrowed connection surface for node:sqlite and better-sqlite3 owners. */
export interface ReplicaDatabase {
  exec(sql:string):unknown;
  prepare(sql:string):{get(...params:SQLInputValue[]):Record<string,SQLOutputValue>|undefined;all(...params:SQLInputValue[]):Record<string,SQLOutputValue>[];run(...params:SQLInputValue[]):unknown};
}
/** Read-only technical history, including a locally deleted target whose body is now absent. */
export function hasReplicaHistory(db:ReplicaDatabase,key:string):boolean {
 return ['replica_changes','replica_heads','replica_outbox','replica_conflicts','replica_resolutions'].some(table=>!!db.prepare(`SELECT 1 FROM ${table} WHERE key=? LIMIT 1`).get(key));
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
export function initializeReplica(db: ReplicaDatabase,initialize=true): void {
  db.prepare("SELECT waiting FROM replica_conflicts LIMIT 0").all();
  if(initialize)db.prepare('INSERT OR IGNORE INTO replica_state(id,device) VALUES (1,?)').run(randomUUID());
  if(!db.prepare('SELECT device,cursor,applying FROM replica_state WHERE id=1').get())throw syncError('invalid','同步日志状态缺失，原数据已保留');
}

/** Owner supplies an SQL key expression; identifiers/expressions must never come from user input. */
export function replicaMarkSql(keyExpression: string, condition = '1=1'): string {
  return `INSERT INTO replica_changes(key) SELECT ${keyExpression} WHERE (SELECT applying FROM replica_state WHERE id=1)=0 AND (${condition});`;
}

/** Trusted owner SELECT returns a column named key. Enqueue all affected keys in the business transaction. */
export function replicaMarkRowsSql(selectKeys: string): string {
  return `INSERT INTO replica_changes(key) SELECT key FROM (${selectKeys}) WHERE (SELECT applying FROM replica_state WHERE id=1)=0;`;
}

/** Seed or enqueue a known owner key through Storage rather than its journal table. */
export function queueReplicaChange(db: ReplicaDatabase, key: string): void {
  db.prepare('INSERT INTO replica_changes(key) VALUES (?)').run(key);
}

/** Save a complete owner preimage before a local deletion. Call in the same owner transaction as deletion.
 * No server event/revision is invented; unuploaded originals remain durable until an explicit recovery decision.
 */
export function retainLocalReplicaSnapshot(db:ReplicaDatabase,key:string,value:unknown,authorize:()=>void,protection?:import('@molis-ai/molis-work-contracts/platform/sync-transport').SyncLocalProtection):void {
  authorize();if(typeof key!=='string'||!key||key.length>500||value===null)throw syncError('invalid','本机删除保留内容无效');
  const json=canonical(value);if(Buffer.byteLength(json)>100000000)throw syncError('limit','本机删除保留内容超过上限，原件已保留');
  const serial=replicaSerialization(authorize,protection);
  db.prepare("INSERT INTO replica_resolutions(key,choice,local_json,remote_json) VALUES (?,'local_delete',?,?)").run(key,serial.write(value,key,'recovery_local'),serial.write(null,key,'recovery_remote'));authorize();
}

export function replicaTransaction<T>(db: ReplicaDatabase, run: () => T): T {
  db.exec('SAVEPOINT replica_write');
  try { const result=run(); db.exec('RELEASE replica_write'); return result; }
  catch(error) { db.exec('ROLLBACK TO replica_write; RELEASE replica_write'); throw error; }
}

export type ReplicaReceiveDisposition = 'ignore' | 'cursor' | 'acknowledge' | 'conflict' | 'apply';
export interface SqliteReplica extends SyncReplicaAdapter {
  /** Read-only observation for asynchronous Host preparation; receive always decides again in its transaction. */
  inspectReceive(event: SyncEvent, options?: {retry?: boolean}): ReplicaReceiveDisposition;
}
function receiveDecision(db: ReplicaDatabase, serial: ReturnType<typeof replicaSerialization>, event: SyncEvent, options?: {retry?: boolean}): {kind: ReplicaReceiveDisposition; through?: number} {
  if(!Number.isSafeInteger(event.revision)||event.revision<1||typeof event.key!=='string')throw new Error('SYNC_INVALID_EVENT');
  const cursor=Number(db.prepare('SELECT cursor FROM replica_state WHERE id=1').get()!.cursor);
  const head=Number(db.prepare('SELECT revision FROM replica_heads WHERE key=?').get(event.key)?.revision??0);
  if(event.revision<=cursor&&(!options?.retry||event.revision<=head))return {kind:'ignore'};
  if(event.revision<=head)return {kind:'cursor'};
  const out=db.prepare('SELECT through_seq,operation FROM replica_outbox WHERE key=?').get(event.key);
  const mutation=out ? serial.read(out.operation,event.key,'outbox') as SyncMutation : undefined;
  if(mutation&&mutation.operationId===event.operationId){
    if(canonical(mutation)!==canonical({operationId:event.operationId,key:event.key,base:event.base,value:event.value}))throw syncError('invalid','同步回执与待提交内容不一致',{sync_key:event.key});
    return {kind:'acknowledge',through:Number(out!.through_seq)};
  }
  if(db.prepare('SELECT 1 FROM replica_changes WHERE key=?').get(event.key)||db.prepare('SELECT 1 FROM replica_conflicts WHERE key=? AND waiting=0').get(event.key))return {kind:'conflict'};
  return {kind:'apply'};
}

type ProjectMembership = (key:string, projectId:string, retained:()=>readonly SyncMutation[])=>boolean;
function projectChanges(db: ReplicaDatabase, projectId: string, authorize: () => void, belongs: ProjectMembership | undefined, serial: ReturnType<typeof replicaSerialization>): boolean {
  return replicaTransaction(db,()=>{
    authorize();
    if(typeof projectId!=='string'||!projectId||projectId.length>500)throw syncError('invalid','项目同步范围无效');
    if(!belongs)throw syncError('unsupported','此内容尚未提供项目变更判断，原件已保留');
    const keys=db.prepare('SELECT key FROM replica_changes UNION SELECT key FROM replica_outbox UNION SELECT key FROM replica_conflicts').all();
    const changed=keys.some(row=>{
      const key=String(row.key),result=belongs(key,projectId,()=>{
        authorize();const retained:SyncMutation[]=[];
        const out=db.prepare('SELECT operation FROM replica_outbox WHERE key=?').get(key);
        const conflict=db.prepare('SELECT event FROM replica_conflicts WHERE key=?').get(key);
        if(out)retained.push(serial.read(out.operation,key,'outbox') as SyncMutation);
        if(conflict)retained.push(serial.read(conflict.event,key,'conflict') as SyncEvent);
        authorize();return retained;
      });
      if(typeof result!=='boolean')throw syncError('invalid','项目同步范围判断无效');
      return result;
    });
    authorize();return changed;
  });
}

export function createSqliteReplica(db: ReplicaDatabase, owner: {
  authorize(): void;
  maintain?():void;
  conflictState?: import('@molis-ai/molis-work-contracts/platform/sync-transport').SyncConflictState;
  protection?: import('@molis-ai/molis-work-contracts/platform/sync-transport').SyncLocalProtection;
  canUpload?(key: string): boolean;
  locate?(key:string):string|null;
  /** Must resolve deleted/frozen keys too; owner chooses the business scope, Storage never guesses it. */
  belongsToProject?:ProjectMembership;
  read(key: string): unknown | null;
  apply(key: string, value: unknown | null): void;
}): SqliteReplica {
  const serial=replicaSerialization(()=>owner.authorize(),owner.protection);
  const comparison=(key:string,event:SyncEvent,local:unknown)=>{
    if(!owner.conflictState)throw syncError('unsupported','此资产未接入内容比较指纹，原内容已保留');
    const state=owner.conflictState(event,local,Number(db.prepare('SELECT MAX(seq) AS seq FROM replica_changes WHERE key=?').get(key)?.seq??0));
    if(typeof state!=='string'||!/^[a-f0-9]{64}$/.test(state))throw syncError('invalid','内容比较指纹无效');return state;
  };
  const head=(key:string)=>Number(db.prepare('SELECT revision FROM replica_heads WHERE key=?').get(key)?.revision??0);
  const cursor=()=>Number(db.prepare('SELECT cursor FROM replica_state WHERE id=1').get()!.cursor);
  const setHead=(event:SyncEvent)=>db.prepare('INSERT INTO replica_heads VALUES (?,?) ON CONFLICT(key) DO UPDATE SET revision=excluded.revision').run(event.key,event.revision);
  const apply=(event:Pick<SyncEvent,'key'|'value'>)=>{
    db.exec('UPDATE replica_state SET applying=1 WHERE id=1');
    owner.apply(event.key,event.value);
    db.exec('UPDATE replica_state SET applying=0 WHERE id=1');
  };
  const missingDependency=(error:unknown)=>!!error&&typeof error==='object'&&'details' in error&&!!error.details&&typeof error.details==='object'&&'sync_waiting' in error.details&&error.details.sync_waiting===true;
  const conflict=(event:SyncEvent,reason:string,waiting=false)=>db.prepare('INSERT INTO replica_conflicts(key,event,reason,waiting) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET event=excluded.event,reason=excluded.reason,waiting=excluded.waiting').run(event.key,serial.write(event,event.key,'conflict'),reason,waiting?1:0);
  const read=(key:string)=>{
    try{return owner.read(key);}catch(error){owner.authorize();
      const kind=error&&typeof error==='object'?(('kind' in error?error.kind:undefined)??('code' in error&&typeof error.code==='string'?platformErrorKind(error.code):undefined)):undefined;
      const reason=kind==='too_large'?'limit':kind==='forbidden'?'scope':kind&&kind!=='invalid'?'busy':'invalid';
      throw syncError(reason,replicaFailureMessage(error),{sync_key:key});}
  };
  return {
    ...replicaRecovery(db,owner,head,(key,value)=>apply({key,value}),run=>replicaTransaction(db,run),key=>queueReplicaChange(db,key),comparison,serial),
    cursor,
    ...(owner.maintain?{maintain(){owner.authorize();owner.maintain!();owner.authorize();}}:{}),
    ...(owner.locate?{locate(key:string){owner.authorize();const target=owner.locate!(key);owner.authorize();return target;}}:{}),
    hasProjectChanges:projectId=>projectChanges(db,projectId,owner.authorize,owner.belongsToProject,serial),
    inspectReceive(event,options){return replicaTransaction(db,()=>{
      owner.authorize();const decision=receiveDecision(db,serial,event,options);owner.authorize();return decision.kind;
    });},
    acknowledge(key,operationId,revision){replicaTransaction(db,()=>{
      owner.authorize();if(!Number.isSafeInteger(revision)||revision<1)throw syncError('invalid','同步回执版本无效');
      const out=db.prepare('SELECT through_seq,operation FROM replica_outbox WHERE key=?').get(key);
      if(!out){if(head(key)>=revision)return;throw syncError('conflict','同步回执已不属于当前待提交内容');}
      const mutation=serial.read(out.operation,key,'outbox') as SyncMutation;
      if(mutation.operationId!==operationId||mutation.key!==key||revision<=mutation.base)throw syncError('invalid','同步回执与待提交内容不一致');
      db.prepare('DELETE FROM replica_changes WHERE key=? AND seq<=?').run(key,Number(out.through_seq));
      db.prepare('DELETE FROM replica_outbox WHERE key=?').run(key);
      db.prepare('INSERT INTO replica_heads VALUES (?,?) ON CONFLICT(key) DO UPDATE SET revision=MAX(revision,excluded.revision)').run(key,revision);owner.authorize();
    });},
    next(options) { return replicaTransaction(db,()=>{
      owner.authorize();
      const eligible=(row:Record<string,SQLOutputValue>)=>!options?.excludeKeys?.includes(String(row.key))&&owner.canUpload?.(String(row.key))!==false;
      const frozen=db.prepare('SELECT key,operation FROM replica_outbox WHERE key NOT IN (SELECT key FROM replica_conflicts) ORDER BY through_seq').all().find(row=>eligible(row)&&(!options?.deletionsOnly||(serial.read(row.operation,String(row.key),'outbox') as SyncMutation).value===null));
      if(frozen)return serial.read(frozen.operation,String(frozen.key),'outbox') as SyncMutation;
      const row=db.prepare(`SELECT key,MAX(seq) AS seq FROM replica_changes WHERE key NOT IN (SELECT key FROM replica_conflicts) AND key NOT IN (SELECT key FROM replica_outbox) GROUP BY key ORDER BY MIN(seq)`).all().find(row=>eligible(row)&&(!options?.deletionsOnly||read(String(row.key))===null));
      if(!row)return null;
      const key=String(row.key),seq=Number(row.seq);
      const device=String(db.prepare('SELECT device FROM replica_state WHERE id=1').get()!.device);
      const operation:SyncMutation={operationId:`${device}:${seq}`,key,base:head(key),value:read(key)};
      owner.authorize();
      db.prepare('INSERT INTO replica_outbox VALUES (?,?,?)').run(key,seq,serial.write(operation,key,'outbox'));
      return operation;
    }); },
    receive(event,options) { replicaTransaction(db,()=>{
      owner.authorize();
      const decision=receiveDecision(db,serial,event,options);
      if(decision.kind==='ignore')return;
      if(decision.kind==='cursor'){db.prepare('UPDATE replica_state SET cursor=MAX(cursor,?) WHERE id=1').run(event.revision);owner.authorize();return;}
      if(decision.kind==='acknowledge'){
        db.prepare('DELETE FROM replica_changes WHERE key=? AND seq<=?').run(event.key,decision.through!);
        db.prepare('DELETE FROM replica_outbox WHERE key=?').run(event.key);
        setHead(event);
      } else if(decision.kind==='conflict') {
        conflict(event,'两台设备修改了同一项，双方内容均已保留');
      } else {
        try { replicaTransaction(db,()=>{apply(event);setHead(event);db.prepare('DELETE FROM replica_conflicts WHERE key=?').run(event.key);}); }
        catch(error) { owner.authorize(); conflict(event,replicaFailureMessage(error),missingDependency(error)); }
      }
      owner.authorize();
      db.prepare('UPDATE replica_state SET cursor=MAX(cursor,?) WHERE id=1').run(event.revision);
    }); },
    counts(){return {pending:Number(db.prepare('SELECT COUNT(*) AS n FROM (SELECT key FROM replica_changes UNION SELECT key FROM replica_outbox)').get()!.n),conflicts:Number(db.prepare('SELECT COUNT(*) AS n FROM replica_conflicts').get()!.n)};},
    conflicts(){return db.prepare('SELECT key,reason,waiting FROM replica_conflicts ORDER BY key LIMIT 100').all().map(row=>({key:String(row.key),reason:String(row.reason),waiting:!!row.waiting}));},
    retryWaiting(){replicaTransaction(db,()=>{
      owner.authorize();
      for(const row of db.prepare('SELECT key,event FROM replica_conflicts WHERE waiting=1 ORDER BY key').all()){
        const event=serial.read(row.event,String(row.key),'conflict') as SyncEvent;
        if(db.prepare('SELECT 1 FROM replica_changes WHERE key=?').get(event.key)||db.prepare('SELECT 1 FROM replica_outbox WHERE key=?').get(event.key)){
          conflict(event,'两台设备修改了同一项，双方内容均已保留');continue;
        }
        try{replicaTransaction(db,()=>{apply(event);setHead(event);db.prepare('DELETE FROM replica_conflicts WHERE key=?').run(event.key);owner.authorize();});}
        catch(error){owner.authorize();conflict(event,replicaFailureMessage(error),missingDependency(error));}
      }
      owner.authorize();
    });},
    resolve(key,choice,expectedRevision,expectedState){replicaTransaction(db,()=>{
      owner.authorize();
      const row=db.prepare('SELECT key,event,waiting FROM replica_conflicts WHERE key=?').get(key);
      if(!row)throw new Error('SYNC_CONFLICT_MISSING');
      if(row.waiting)throw new Error('关联资产尚未到达，请稍后重试同步');
      const event=serial.read(row.event,String(row.key),'conflict') as SyncEvent;
      if(expectedRevision!==undefined&&event.revision!==expectedRevision)throw syncError('conflict','冲突版本已变化，请重新查看');
      if(expectedState!==undefined&&comparison(key,event,read(key))!==expectedState)throw syncError('conflict','比较内容已变化，请重新查看');
      if(choice!=='local'&&choice!=='remote')throw new Error('SYNC_INVALID_CHOICE');
      db.prepare('INSERT INTO replica_resolutions(key,choice,local_json,remote_json) VALUES (?,?,?,?)').run(key,choice,serial.write(owner.read(key),key,'recovery_local'),serial.write(event,key,'recovery_remote'));
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

/** JSON parser diagnostics may quote source text; never persist it as a sync failure reason. */
function replicaFailureMessage(error:unknown):string {
  return error instanceof SyntaxError?'同步内容格式无效，原内容已保留':error instanceof Error?error.message:'无法应用同步内容';
}

/** SQL fragment for owner triggers; the technical table remains owned here. */
export function replicaApplyingSql():string {return "(SELECT applying FROM replica_state WHERE id=1)";}
