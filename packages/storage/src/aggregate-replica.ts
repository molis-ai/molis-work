import { V_FORMAT_AGGREGATE_REPLICA } from "./versions.generated.js";
import { compileAggregateTrackingSql, aggregateTrackingSeedSql } from './aggregate-tracking.js';
import {readDatabaseSpace} from './space.js';
import { syncError } from './project-replica-sync-errors.js';
import type { SyncReplicaAdapter } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { createSqliteReplica, initializeReplica, replicaTransaction, type ReplicaDatabase } from './replica.js';

import type { SyncPortableRow as PortableRow, SyncAggregateRecords as AggregateRecords, SyncAggregateDefinition as AggregateDefinition } from '@molis-ai/molis-work-contracts/platform/plugin-sync';
export type { SyncPortableRow as PortableRow, SyncAggregateRecords as AggregateRecords, SyncAggregateDefinition as AggregateDefinition } from '@molis-ai/molis-work-contracts/platform/plugin-sync';
export const AGGREGATE_REPLICA_SCHEMA_SQL='CREATE TABLE IF NOT EXISTS aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);';
export type {AggregateReplicaContext} from '@molis-ai/molis-work-contracts/platform/plugin-registration';
import type {AggregateReplicaContext} from '@molis-ai/molis-work-contracts/platform/plugin-registration';

/** Owner-declared aggregate journal. This is not a database export/discovery API. */
export function initializeAggregateReplication(db: ReplicaDatabase, definitions: readonly AggregateDefinition[]): void {
  const binding=db.prepare('SELECT descriptor FROM molis_storage_space WHERE singleton=1').get();
  if(!binding||JSON.parse(String(binding.descriptor)).kind!=='personal')return;
  replicaTransaction(db, () => {
    initializeReplica(db);
    db.prepare('SELECT key,version FROM aggregate_editor_versions LIMIT 0').all();
    const missing = definitions.filter(d => !db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?").get(`${d.table}_aggregate_insert`));
    if (missing.length) {
      db.exec(aggregateTrackingSeedSql(missing));
      db.exec(compileAggregateTrackingSql(missing));
    }
  });
}

export function createAggregateReplica(db: ReplicaDatabase, definitions: readonly AggregateDefinition[], context: AggregateReplicaContext): SyncReplicaAdapter {
  const binding=db.prepare('SELECT space_id,descriptor FROM molis_storage_space WHERE singleton=1').get();
  if(!binding||JSON.parse(String(binding.descriptor)).kind!=='personal'||binding.space_id!==context.spaceId)throw syncError("scope",'同步空间不匹配');
  return createSqliteReplica(db,createAggregatePortableOwner(db,definitions,context));
}
/** Owner-declared portable facts; local-copy readers do not acquire personal sync permission or technical journals. */
export function createAggregatePortableOwner(db:ReplicaDatabase,definitions:readonly AggregateDefinition[],context:AggregateReplicaContext){
  const binding=readDatabaseSpace(db);context.authorize();if(!binding||binding.spaceId!==context.spaceId)throw syncError('scope','保存内容不属于当前空间');
  const decode=(key:string) => {
    const parts:unknown=JSON.parse(key);
    if(!Array.isArray(parts)||parts.length!==3||!parts.every(v=>typeof v==='string'&&v.length>0&&v.length<=80))invalid();
    const [projectId,kind,id]=parts as string[];
    const definition=definitions.find(d=>d.kind===kind);if(!definition)invalid();
    return {projectId:projectId!,id:id!,definition:definition!};
  };
  const local=(d:AggregateDefinition,id:string,projectId:string) => {
    const row=db.prepare(`SELECT * FROM ${d.table} WHERE id=?`).get(id);
    if(row&&row.project_id!==projectId)throw syncError("scope",'资产标识已属于其他项目');
    if(row&&d.busyColumn&&row[d.busyColumn])throw syncError("busy",'请先恢复本机尚未完成的发布');
    return row;
  };
  return {
    authorize:context.authorize,
    authorizeKey(key:string){context.authorize();context.project(decode(key).projectId);context.authorize();},
    belongsToProject:(key:string,projectId:string)=>decode(key).projectId===projectId,
    conflictState:context.conflictState,
    canUpload:(key:string)=>context.canUploadProject(decode(key).projectId),
    read(key:string) {
      const {projectId,id,definition:d}=decode(key),project=context.project(projectId),row=local(d,id,projectId);
      if(!row)return null;
      const value:AggregateRecords={record:pick(row,d.columns),children:Object.fromEntries(d.children.map(c=>[c.table,db.prepare(`SELECT ${c.columns.join(',')} FROM ${c.table} WHERE ${c.parent}=? ORDER BY ${c.orderBy}`).all(id).map(row=>validateAggregatePortableRow(row,c.columns))]))};
      d.validate(value);
      const envelope={format:V_FORMAT_AGGREGATE_REPLICA,spaceId:context.spaceId,project:{id:projectId,title:project.title},...value};
      size(envelope);return envelope;
    },
    apply(key:string,value:unknown) {
      const {projectId,id,definition:d}=decode(key);context.project(projectId);
      const current=local(d,id,projectId);
      if(value===null){
        for(const c of [...d.children].reverse())db.prepare(`DELETE FROM ${c.table} WHERE ${c.parent}=?`).run(id);
        db.prepare(`DELETE FROM ${d.table} WHERE id=? AND project_id=?`).run(id,projectId);return;
      }
      size(value);const wire=object(value);exact(wire,['format','spaceId','project','record','children']);
      const project=object(wire.project);exact(project,['id','title']);
      if(wire.format!==V_FORMAT_AGGREGATE_REPLICA||wire.spaceId!==context.spaceId||project.id!==projectId||typeof project.title!=='string'||project.title.length>120)invalid();
      const record=validateAggregatePortableRow(wire.record,d.columns),children=object(wire.children);exact(children,d.children.map(c=>c.table));
      if(record.id!==id||record.project_id!==projectId)invalid();
      const parsed:AggregateRecords={record,children:{}};
      for(const c of d.children){
        const rows=children[c.table];if(!Array.isArray(rows)||rows.length>10000)invalid();
        const seen=new Set<string>();
        parsed.children[c.table]=rows.map(row=>{
          const result=validateAggregatePortableRow(row,c.columns);
          const identity=c.identityColumns??['id'],values=identity.map(k=>result[k]);
          if(result[c.parent]!==id||values.some(v=>typeof v!=='string'||!v||v.length>200)||seen.has(JSON.stringify(values)))invalid();
          seen.add(JSON.stringify(values));
          const existing=db.prepare(`SELECT ${c.parent} FROM ${c.table} WHERE ${identity.map(k=>`${k}=?`).join(' AND ')}`).get(...values);
          if(existing&&existing[c.parent]!==id)throw syncError("scope",'子记录标识已属于其他资产');
          return result;
        });
      }
      d.validate(parsed);d.dependencies?.(parsed,context,projectId);
      if(d.timestampVersionColumn){
        const col=d.timestampVersionColumn;
        record[col]=new Date(Math.max(Date.now(),Date.parse(String(record[col])),current?Date.parse(String(current[col]))+1:0)).toISOString();
      }
      const columns=[...d.columns],values=columns.map(k=>record[k]);
      if(d.versionColumn){columns.push(d.versionColumn);values.push(Math.max(Number(current?.[d.versionColumn]??0),Number(db.prepare('SELECT version FROM aggregate_editor_versions WHERE key=?').get(key)?.version??0))+1);}
      // Target editor versions advance independently of remote revisions, invalidating stale forms.
      db.prepare(`INSERT INTO ${d.table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${columns.filter(k=>k!=='id').map(k=>`${k}=excluded.${k}`).join(',')}`).run(...values);
      for(const c of [...d.children].reverse())db.prepare(`DELETE FROM ${c.table} WHERE ${c.parent}=?`).run(id);
      for(const c of d.children)for(const row of parsed.children[c.table]!)db.prepare(`INSERT INTO ${c.table} (${c.columns.join(',')}) VALUES (${c.columns.map(()=>'?').join(',')})`).run(...c.columns.map(k=>row[k]));
    },
  };
}

function pick(row:Readonly<Record<string,unknown>>,columns:readonly string[]):PortableRow{return validateAggregatePortableRow(Object.fromEntries(columns.map(k=>[k,row[k]!])),columns);}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))invalid();return value as Record<string,unknown>;}
function exact(row:Record<string,unknown>,columns:readonly string[]){if(Object.keys(row).length!==columns.length||columns.some(k=>!Object.hasOwn(row,k)))invalid();}
export function validateAggregatePortableRow(value:unknown,columns:readonly string[]):PortableRow{const row=object(value);exact(row,columns);if(Object.values(row).some(v=>v!==null&&typeof v!=='string'&&(typeof v!=='number'||!Number.isFinite(v))))invalid();return row as PortableRow;}
function size(value:unknown){if(Buffer.byteLength(JSON.stringify(value))>100000000)throw syncError("limit",'此资产超过账号容量上限（100 MB），原数据仍保留在本机');}
function invalid():never{throw syncError("invalid",'同步资产格式不合法');}
