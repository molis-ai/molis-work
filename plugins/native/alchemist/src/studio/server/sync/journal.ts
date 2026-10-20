import {bindDatabaseSpace,initializeReplica,queueReplicaChange,readDatabaseSpace,replicaMarkSql,replicaTransaction,type StorageSpace} from '@molis-ai/molis-work-storage';
import type {SqliteDatabase} from '../db/open-database.js';
import {STUDIO_CONTENT_TABLES} from './content-tables.js';
import {studioSyncErrors} from './errors.js';
import {studioReplicaDatabase} from './replica-db.js';

export const studioSyncKey=(projectId:string)=>JSON.stringify([projectId,'project_studio',projectId]);
/** Trusted identity is bound before the first business write, not when sync happens to start. */
export function initializeStudioReplication(db:SqliteDatabase,space:StorageSpace,projectId:string):void{
 if(!projectId||projectId.length>80)throw studioSyncErrors.sync_scope('研究空间的项目标识无效');
 const journal=studioReplicaDatabase(db);replicaTransaction(journal,()=>{
  bindDatabaseSpace(db,space);
  const bound=db.prepare('SELECT project_id FROM studio_sync_identity WHERE singleton=1').get() as {project_id:string}|undefined;
  if(bound&&bound.project_id!==projectId)throw studioSyncErrors.sync_scope('研究库已经属于另一个项目');
  db.prepare('INSERT OR IGNORE INTO studio_sync_identity VALUES (1,?)').run(projectId);
  if(readDatabaseSpace(db)?.kind!=='personal')return;
  initializeReplica(journal);
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='studio_content_directions_insert'").get())return;
  const key=studioSyncKey(projectId),literal="'"+key.replaceAll("'","''")+"'";
  if(STUDIO_CONTENT_TABLES.some(t=>db.prepare(`SELECT 1 FROM ${t.name} LIMIT 1`).get()))queueReplicaChange(journal,key);
  for(const table of STUDIO_CONTENT_TABLES)for(const event of ['INSERT','UPDATE','DELETE'])
   db.exec(`CREATE TRIGGER studio_content_${table.name}_${event.toLowerCase()} AFTER ${event} ON ${table.name} BEGIN ${replicaMarkSql(literal)} END`);
 });
}
