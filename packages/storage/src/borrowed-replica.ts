import type {ReplicaDatabase,ReplicaInputValue,ReplicaOutputValue} from './replica.js';
import {syncError} from './project-replica-sync-errors.js';

interface BorrowedConnection {
  exec(sql:string):unknown;
  prepare(sql:string):{get(...args:ReplicaInputValue[]):unknown;all(...args:ReplicaInputValue[]):unknown[];run(...args:ReplicaInputValue[]):unknown};
}
function row(value:unknown):Record<string,ReplicaOutputValue> {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.values(value).some(v=>v!==null&&!['string','number','bigint'].includes(typeof v)&&!(v instanceof Uint8Array)))throw syncError('invalid','同步日志行格式无效');
  return value as Record<string,ReplicaOutputValue>;
}
/** One checked bridge for borrowed SQLite drivers whose result type is unknown. No owner tables are inspected. */
export function borrowedReplicaDatabase(db:BorrowedConnection):ReplicaDatabase {
  return {exec:sql=>db.exec(sql),prepare(sql){const s=db.prepare(sql);return {
    get(...args){const value=s.get(...args);return value===undefined?undefined:row(value);},
    all:(...args)=>s.all(...args).map(row),run:(...args)=>s.run(...args),
  };}};
}
/** Complete body-presence predicate for a journal's frozen, conflict and recovery data. */
export function hasReplicaBodies(db:ReplicaDatabase):boolean {
  return !!db.prepare(`SELECT 1 WHERE EXISTS(SELECT 1 FROM replica_outbox) OR
    EXISTS(SELECT 1 FROM replica_conflicts) OR EXISTS(SELECT 1 FROM replica_resolutions)`).get();
}
