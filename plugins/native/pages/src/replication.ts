import { syncError } from './sync-errors.js';
import type { DatabaseSync } from 'node:sqlite';
import type { StorageSpace } from '@molis-ai/molis-work-contracts/platform/storage';
import { initializeReplica, replicaMarkSql, queueReplicaChange, replicaTransaction, createSqliteReplica } from '@molis-ai/molis-work-storage';
import { parsePayload, type PagesSyncContext } from './sync.js';

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
  if(space?.kind!=='personal')throw syncError("scope",'仅支持已绑定的个人空间');
  const decode=(key:string):[string,'folder'|'document',string]=>{
    const parts=JSON.parse(key);
    if(!Array.isArray(parts)||parts.length!==3||!parts.every(p=>typeof p==='string'&&p.length>0&&p.length<=80)||!['folder','document'].includes(parts[1]))throw syncError("invalid",'文档同步标识无效');
    return parts as [string,'folder'|'document',string];
  };
  return createSqliteReplica(db,{
    authorize:()=>caller.authorize(),
    canUpload:key=>caller.canUploadProject?.(decode(key)[0])!==false,
    read(key){
      const [projectId,kind,id]=decode(key),project=caller.project(projectId);
      const record=readRecord(db,projectId,kind,id);
      if(!record)return null;
      const value={project:{id:projectId,title:project.title},record};
      limit(value);return value;
    },
    apply(key,value){
      const [projectId,kind,id]=decode(key),project=caller.project(projectId);
      caller.authorize();
      const table=kind==='folder'?'folders':'pages';
      const current=db.prepare('SELECT project_id FROM '+table+' WHERE id=?').get(id);
      if(current&&current.project_id!==projectId)throw syncError('scope','资产标识与其他项目冲突');
      if(db.prepare("SELECT 1 FROM pages WHERE id=? AND project_id=? AND publication_pending_json IS NOT NULL").get(id,projectId)
        ||db.prepare("SELECT 1 FROM page_generations WHERE project_id=? AND json_extract(record_json,'$.status')='running' LIMIT 1").get(projectId))throw syncError('busy','请先完成或恢复文档生成、成果发布');
      if(value===null){
        if(kind==='folder'&&db.prepare('SELECT 1 FROM pages WHERE project_id=? AND folder_id=? LIMIT 1').get(projectId,id))throw syncError('dependencies','等待文件夹内文档更新');
        db.prepare('DELETE FROM '+table+' WHERE id=? AND project_id=?').run(id,projectId);return;
      }
      limit(value);
      if(typeof value!=='object'||Array.isArray(value)||!value||Object.keys(value).sort().join(',')!=='project,record')throw syncError('invalid','文档同步格式不合法');
      const envelope=value as {project?:{id:string;title:string};record?:{id:string;folder_id?:string}};
      if(envelope.project?.id!==projectId||typeof envelope.project.title!=='string'||envelope.project.title.length>120||envelope.record?.id!==id)throw syncError('invalid','文档同步记录与项目或资产标识不一致');
      const folders=kind==='folder'?[envelope.record]:dependencyFolder(db,projectId,envelope.record.folder_id);
      const parsed=parsePayload({folders,documents:kind==='document'?[envelope.record]:[]});
      if(kind==='folder'){
        const row=parsed.folders[0]!;
        db.prepare('INSERT INTO folders(id,project_id,title,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,created_at=excluded.created_at,updated_at=excluded.updated_at').run(id,projectId,row.title,row.created_at,row.updated_at);
      }else{
        const row=parsed.documents[0]!;
        if(row.goal_id&&!project.context.hasReference({owner:'goals',assetId:row.goal_id}))throw syncError('dependencies','关联目标尚未到达');
        if(row.artifact_id&&!project.context.hasReference({owner:'artifacts',assetId:row.artifact_id,version:row.artifact_version}))throw syncError('dependencies','关联成果版本尚未到达');
        const high=Number(db.prepare('SELECT revision FROM pages_sync_revisions WHERE project_id=?').get(projectId)?.revision??0);
        db.prepare(`INSERT INTO pages(id,project_id,title,body_json,folder_id,starred,goal_id,artifact_id,artifact_version,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET title=excluded.title,body_json=excluded.body_json,folder_id=excluded.folder_id,starred=excluded.starred,goal_id=excluded.goal_id,artifact_id=excluded.artifact_id,artifact_version=excluded.artifact_version,created_at=excluded.created_at,updated_at=excluded.updated_at,version=MAX(pages.version+1,excluded.version)`)
          .run(id,projectId,row.title,JSON.stringify(row.body),row.folder_id,row.starred?1:0,row.goal_id,row.artifact_id,row.artifact_version,row.created_at,row.updated_at,high+1);
      }
      caller.authorize();
    },
  });
}

function dependencyFolder(db:DatabaseSync,projectId:string,folderId:unknown){
 if(!folderId)return [];
 if(typeof folderId!=='string')throw syncError('invalid','文档文件夹标识无效');
 const folder=db.prepare('SELECT id,title,created_at,updated_at FROM folders WHERE id=? AND project_id=?').get(folderId,projectId);
 if(!folder)throw syncError('dependencies','等待文档所属文件夹');
 return [folder];
}
function readRecord(db:DatabaseSync,projectId:string,kind:'folder'|'document',id:string){
 if(kind==='folder'){
  const folder=db.prepare('SELECT id,title,created_at,updated_at FROM folders WHERE id=? AND project_id=?').get(id,projectId);
  return folder?parsePayload({folders:[folder],documents:[]}).folders[0]:null;
 }
 const row=db.prepare('SELECT id,title,body_json,folder_id,starred,goal_id,artifact_id,artifact_version,created_at,updated_at,publication_pending_json FROM pages WHERE id=? AND project_id=?').get(id,projectId);
 if(!row)return null;
 if(row.publication_pending_json)throw syncError('busy','请先恢复文档成果发布');
 const {body_json,starred,publication_pending_json:_pending,...record}=row;
 return parsePayload({folders:dependencyFolder(db,projectId,row.folder_id),documents:[{...record,body:JSON.parse(String(body_json)),starred:!!starred}]}).documents[0];
}
function limit(value:unknown){if(Buffer.byteLength(JSON.stringify(value))>512*1024)throw syncError('limit','文档超过当前同步上限（512 KiB），原数据仍保留在本机');}

export function bindPagesReplication(store:{close():void;replica(context:PagesReplicationContext):ReturnType<typeof createPagesReplica>}){
 return {close:()=>store.close(),replica(context:import('@molis-ai/molis-work-storage').AggregateReplicaContext){
  return store.replica({authorize:context.authorize,canUploadProject:context.canUploadProject,project(projectId){return {title:context.project(projectId).title,context:{spaceId:context.spaceId,projectId,authorize:context.authorize,hasReference:ref=>context.hasReference?.(projectId,ref)===true}};}});
 }};
}
