import {bindDatabaseSpace,initializeReplica,queueReplicaChange,readDatabaseSpace,replicaMarkSql,replicaTransaction,type StorageSpace} from '@molis-ai/molis-work-storage';
import type {SqliteDatabase} from '../db/open-database.js';
import {STUDIO_CONTENT_TABLES} from './content-tables.js';
import {studioSyncErrors} from './errors.js';
import {studioReplicaDatabase} from './replica-db.js';

export const studioSyncKey=(projectId:string)=>JSON.stringify([projectId,'project_studio',projectId]);
/** Static schema references the identity bound by the Host, never a project id spliced into SQL. */
const projectKey = "(SELECT json_array(project_id,'project_studio',project_id) FROM studio_sync_identity WHERE singleton=1)";
export const STUDIO_SYNC_TRIGGERS = STUDIO_CONTENT_TABLES.flatMap(table => ["INSERT","UPDATE","DELETE"].map(event =>
  `CREATE TRIGGER studio_content_${table.name}_${event.toLowerCase()} AFTER ${event} ON ${table.name} BEGIN ${replicaMarkSql(projectKey)} END;`
)).join("\n");
/** Archive inspection reads the immutable project bound by the Host without opening or initializing a studio. */
export function assertStudioProjectIdentity(db: Pick<SqliteDatabase,"prepare">, projectId:string):void {
  const row = db.prepare('SELECT project_id FROM studio_sync_identity WHERE singleton=1').get() as {project_id:string} | undefined;
  if (!row || row.project_id !== projectId) throw studioSyncErrors.sync_scope('研究库归属与项目不符');
}
/** Trusted identity is bound before the first business write, not when sync happens to start. */
export function initializeStudioReplication(db:SqliteDatabase,space:StorageSpace,projectId:string):void{
 if(!projectId||projectId.length>80)throw studioSyncErrors.sync_scope('研究空间的项目标识无效');
 const journal=studioReplicaDatabase(db);replicaTransaction(journal,()=>{
  bindDatabaseSpace(db,space);
  db.prepare('INSERT OR IGNORE INTO studio_sync_identity VALUES (1,?)').run(projectId);
  assertStudioProjectIdentity(db,projectId);
  if(readDatabaseSpace(db)?.kind!=='personal')return;
  const first = initializeReplica(journal);
  if(first && STUDIO_CONTENT_TABLES.some(table=>db.prepare(`SELECT 1 FROM ${table.name} LIMIT 1`).get()))
    queueReplicaChange(journal,studioSyncKey(projectId));
 });
}
