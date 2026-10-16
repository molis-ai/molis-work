import { syncError } from './project-replica-sync-errors.js';
import type { SyncReplicaAdapter } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { createSqliteReplica, initializeReplica, replicaMarkSql, replicaTransaction, type ReplicaDatabase } from './replica.js';

export type PortableRow = Record<string, string | number | null>;
export interface AggregateRecords { record: PortableRow; children: Record<string, PortableRow[]> }
export const AGGREGATE_REPLICA_SCHEMA_SQL='CREATE TABLE IF NOT EXISTS aggregate_editor_versions (key TEXT PRIMARY KEY, version INTEGER NOT NULL);';
export interface AggregateDefinition {
  /** All SQL identifiers are trusted owner constants, never wire data. */
  kind: string;
  table: string;
  columns: readonly string[];
  children: readonly { table: string; parent: string; columns: readonly string[]; orderBy: string; identityColumns?:readonly string[] }[];
  versionColumn?: string;
  timestampVersionColumn?: string;
  busyColumn?: string;
  validate(value: AggregateRecords): void;
  dependencies?(value: AggregateRecords, context: AggregateReplicaContext, projectId: string): void;
}
export interface AggregateReplicaContext {
  spaceId: string;
  authorize(): void;
  canUploadProject(projectId: string): boolean;
  project(projectId: string): { title: string };
  hasReference?(projectId:string,reference:{owner:'goals'|'artifacts';assetId:string;version?:number}):boolean;
  hasArtifact(projectId: string, id: string, version: number): boolean;
}

/** Owner-declared aggregate journal. This is not a database export/discovery API. */
export function initializeAggregateReplication(db: ReplicaDatabase, definitions: readonly AggregateDefinition[]): void {
  const binding=db.prepare('SELECT descriptor FROM molis_storage_space WHERE singleton=1').get();
  if(!binding||JSON.parse(String(binding.descriptor)).kind!=='personal')return;
  replicaTransaction(db, () => {
    initializeReplica(db);
    db.prepare('SELECT key,version FROM aggregate_editor_versions LIMIT 0').all();
    for (const d of definitions) {
      for (const id of [d.kind, d.table, ...d.columns, ...d.children.flatMap(c => [c.table,c.parent,...c.columns])]) {
        if (!/^[a-z][a-z0-9_]*$/.test(id)) throw new Error('INVALID_AGGREGATE_IDENTIFIER');
      }
      const marker = `${d.table}_aggregate_insert`;
      if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?").get(marker)) continue;
      const key = (row:string) => `json_array(${row}.project_id,'${d.kind}',${row}.id)`;
      if(d.versionColumn)db.exec(`INSERT INTO aggregate_editor_versions(key,version) SELECT json_array(project_id,'${d.kind}',id),${d.versionColumn} FROM ${d.table} WHERE 1 ON CONFLICT(key) DO UPDATE SET version=MAX(version,excluded.version)`);
      db.exec(`INSERT INTO replica_changes(key) SELECT json_array(project_id,'${d.kind}',id) FROM ${d.table} ORDER BY id`);
      for (const [event,row] of [['INSERT','NEW'],['DELETE','OLD'],['UPDATE','NEW']]) {
        db.exec(`CREATE TRIGGER ${d.table}_aggregate_${event.toLowerCase()} AFTER ${event} ON ${d.table} BEGIN ${replicaMarkSql(key(row))}
          ${d.versionColumn?`INSERT INTO aggregate_editor_versions VALUES (${key(row)},${row}.${d.versionColumn}) ON CONFLICT(key) DO UPDATE SET version=MAX(version,excluded.version);`:''}
          ${event==='UPDATE'?`INSERT INTO replica_changes(key) SELECT ${key('OLD')} WHERE OLD.project_id<>NEW.project_id AND (SELECT applying FROM replica_state WHERE id=1)=0;`:''} END`);
      }
      for (const child of d.children) {
        const mark = (row:string) => `INSERT INTO replica_changes(key) SELECT json_array(project_id,'${d.kind}',id) FROM ${d.table} WHERE id=${row}.${child.parent} AND (SELECT applying FROM replica_state WHERE id=1)=0;`;
        for (const [event,row] of [['INSERT','NEW'],['DELETE','OLD'],['UPDATE','NEW']]) {
          db.exec(`CREATE TRIGGER ${child.table}_aggregate_${event.toLowerCase()} AFTER ${event} ON ${child.table} BEGIN ${mark(row)} ${event==='UPDATE'?mark('OLD'):''} END`);
        }
      }
    }
  });
}

export function createAggregateReplica(db: ReplicaDatabase, definitions: readonly AggregateDefinition[], context: AggregateReplicaContext): SyncReplicaAdapter {
  const binding=db.prepare('SELECT space_id,descriptor FROM molis_storage_space WHERE singleton=1').get();
  if(!binding||JSON.parse(String(binding.descriptor)).kind!=='personal'||binding.space_id!==context.spaceId)throw syncError("scope",'同步空间不匹配');
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
  return createSqliteReplica(db,{
    authorize:context.authorize,
    canUpload:key=>context.canUploadProject(decode(key).projectId),
    read(key) {
      const {projectId,id,definition:d}=decode(key),project=context.project(projectId),row=local(d,id,projectId);
      if(!row)return null;
      const value:AggregateRecords={record:pick(row,d.columns),children:Object.fromEntries(d.children.map(c=>[c.table,db.prepare(`SELECT ${c.columns.join(',')} FROM ${c.table} WHERE ${c.parent}=? ORDER BY ${c.orderBy}`).all(id).map(row=>portableRow(row,c.columns))]))};
      d.validate(value);
      const envelope={format:1,spaceId:context.spaceId,project:{id:projectId,title:project.title},...value};
      size(envelope);return envelope;
    },
    apply(key,value) {
      const {projectId,id,definition:d}=decode(key);context.project(projectId);
      const current=local(d,id,projectId);
      if(value===null){
        for(const c of [...d.children].reverse())db.prepare(`DELETE FROM ${c.table} WHERE ${c.parent}=?`).run(id);
        db.prepare(`DELETE FROM ${d.table} WHERE id=? AND project_id=?`).run(id,projectId);return;
      }
      size(value);const wire=object(value);exact(wire,['format','spaceId','project','record','children']);
      const project=object(wire.project);exact(project,['id','title']);
      if(wire.format!==1||wire.spaceId!==context.spaceId||project.id!==projectId||typeof project.title!=='string'||project.title.length>120)invalid();
      const record=portableRow(wire.record,d.columns),children=object(wire.children);exact(children,d.children.map(c=>c.table));
      if(record.id!==id||record.project_id!==projectId)invalid();
      const parsed:AggregateRecords={record,children:{}};
      for(const c of d.children){
        const rows=children[c.table];if(!Array.isArray(rows)||rows.length>10000)invalid();
        const seen=new Set<string>();
        parsed.children[c.table]=rows.map(row=>{
          const result=portableRow(row,c.columns);
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
  });
}

function pick(row:Readonly<Record<string,unknown>>,columns:readonly string[]):PortableRow{return portableRow(Object.fromEntries(columns.map(k=>[k,row[k]!])),columns);}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))invalid();return value as Record<string,unknown>;}
function exact(row:Record<string,unknown>,columns:readonly string[]){if(Object.keys(row).length!==columns.length||columns.some(k=>!Object.hasOwn(row,k)))invalid();}
function portableRow(value:unknown,columns:readonly string[]):PortableRow{const row=object(value);exact(row,columns);if(Object.values(row).some(v=>v!==null&&typeof v!=='string'&&(typeof v!=='number'||!Number.isFinite(v))))invalid();return row as PortableRow;}
function size(value:unknown){if(Buffer.byteLength(JSON.stringify(value))>512*1024)throw syncError("limit",'此资产超过当前同步上限（512 KiB），原数据仍保留在本机');}
function invalid():never{throw syncError("invalid",'同步资产格式不合法');}
