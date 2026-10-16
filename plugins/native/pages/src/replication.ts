import type { DatabaseSync } from 'node:sqlite';
import type { StorageSpace } from '@molis-ai/molis-work-contracts/platform/storage';
import { initializeReplica, replicaMarkSql, queueReplicaChange, replicaTransaction, createSqliteReplica } from '@molis-ai/molis-work-storage';
import { createPagesSyncAdapter, type PagesSyncContext } from './sync.js';

export interface PagesReplicationContext {
  authorize(): void;
  canUploadProject?(projectId: string): boolean;
  project(projectId: string): { title: string; context: PagesSyncContext };
}

/** Seed once, then observe every owner mutation transaction (including deletes). */
export function initializePagesReplication(db: DatabaseSync): void {
  replicaTransaction(db,()=>{
    initializeReplica(db);
    const installed=db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='pages_replica_insert'").get();
    if(installed)return;
    for(const [table,kind] of [['folders','folder'],['pages','document']]) {
      for(const row of db.prepare(`SELECT project_id,id FROM ${table} ORDER BY id`).all() as Array<{project_id:string;id:string}>)
        queueReplicaChange(db,JSON.stringify([row.project_id,kind,row.id]));
      const key=(row:string)=>`json_array(${row}.project_id,'${kind}',${row}.id)`;
      db.exec(`
        CREATE TRIGGER ${table}_replica_insert AFTER INSERT ON ${table} BEGIN ${replicaMarkSql(key('NEW'))} END;
        CREATE TRIGGER ${table}_replica_delete AFTER DELETE ON ${table} BEGIN ${replicaMarkSql(key('OLD'))} END;
        CREATE TRIGGER ${table}_replica_update AFTER UPDATE ON ${table} BEGIN
          ${replicaMarkSql(key('NEW'))}
          ${replicaMarkSql(key('OLD'),'OLD.project_id<>NEW.project_id')}
        END;
      `);
    }
  });
}

export function createPagesReplica(db: DatabaseSync, space: StorageSpace | undefined, caller: PagesReplicationContext) {
  if(space?.kind!=='personal')throw new Error('SYNC_PERSONAL_SPACE_REQUIRED');
  const decode=(key:string):[string,'folder'|'document',string]=>{
    const parts=JSON.parse(key);
    if(!Array.isArray(parts)||parts.length!==3||!parts.every(p=>typeof p==='string'&&p.length>0&&p.length<=80)||!['folder','document'].includes(parts[1]))throw new Error('SYNC_INVALID_KEY');
    return parts as [string,'folder'|'document',string];
  };
  return createSqliteReplica(db,{
    authorize:()=>caller.authorize(),
    canUpload:key=>caller.canUploadProject?.(decode(key)[0])!==false,
    read(key){
      const [projectId,kind,id]=decode(key), project=caller.project(projectId);
      const snapshot=createPagesSyncAdapter(db,space,project.context).read('documents');
      const payload=snapshot.payload as {folders:{id:string}[];documents:{id:string}[]};
      const value=payload[kind==='folder'?'folders':'documents'].find(item=>item.id===id);
      return value?{project:{id:projectId,title:project.title},record:value}:null;
    },
    apply(key,value){
      const [projectId,kind,id]=decode(key),project=caller.project(projectId);
      const adapter=createPagesSyncAdapter(db,space,project.context),snapshot=adapter.read('documents');
      const payload=snapshot.payload as {folders:{id:string}[];documents:{id:string}[]};
      const field=kind==='folder'?'folders':'documents';
      payload[field]=payload[field].filter(row=>row.id!==id);
      if(value!==null){
        const envelope=value as {project?:{id:string;title:string};record?:{id:string}};
        if(!envelope||envelope.project?.id!==projectId||envelope.record?.id!==id)throw new Error('SYNC_INVALID_RECORD');
        payload[field].push(envelope.record);
      }
      adapter.apply({...snapshot,payload},snapshot.source_revision);
    },
  });
}
