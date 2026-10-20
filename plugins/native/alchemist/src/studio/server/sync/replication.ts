import {createSqliteReplica,ensureStorageSpace,readDatabaseSpace,type StorageSpace} from '@molis-ai/molis-work-storage';
import type {PluginSyncDeclaration} from '@molis-ai/molis-work-contracts/platform/plugin';
import type {SqliteDatabase} from '../db/open-database.js';
import {STUDIO_CONTENT_TABLES,type StudioContentGraph} from './content-tables.js';
import {assertStudioSyncIdle} from './activity.js';
import {initializeStudioReplication,studioSyncKey} from './journal.js';
import {openStudioDatabase,studioSyncPath} from './open.js';
import {studioSyncErrors} from './errors.js';
import {invalidStudio,studioExact,studioGraph,studioObject} from './shape.js';
import {validateStudioSaved} from './semantic.js';
import {studioReplicaDatabase} from './replica-db.js';

export const alchemistSync:PluginSyncDeclaration={protocol_version:1,collections:[{id:'studio',title:'探索、研究证据、决策与方法历史',schema_version:1,requires:[]}]};
interface Context{spaceId:string;projectId:string;title:string;authorize():void;conflictState?:import('@molis-ai/molis-work-contracts/platform/sync-transport').SyncConflictState}
export function openAlchemistSyncStore(home:string,projectId:string){
 const space=ensureStorageSpace(home);if(space.kind!=='personal')throw studioSyncErrors.sync_scope('仅个人空间允许同步研究');
 const path=studioSyncPath(home,projectId),db=openStudioDatabase(path);
 try{initializeStudioReplication(db,space,projectId);return {close:()=>{db.close();},replica:(context:Context)=>replica(db,path,space,projectId,context)};}catch(error){db.close();throw error;}
}
function graph(db:SqliteDatabase):StudioContentGraph{
 return Object.fromEntries(STUDIO_CONTENT_TABLES.map(t=>[t.name,db.prepare(`SELECT ${t.columns.join(',')} FROM ${t.name} ORDER BY ${t.keys.join(',')}`).all()])) as StudioContentGraph;
}
function idle(db:SqliteDatabase,path:string):void{
 assertStudioSyncIdle(path);
 if(db.prepare("SELECT 1 FROM jobs WHERE status IN ('queued','running') LIMIT 1").get())throw studioSyncErrors.sync_busy('本机研究任务尚未结束');
}
function replace(db:SqliteDatabase,g:StudioContentGraph|null):void{
 db.pragma('defer_foreign_keys = ON');
 for(const t of [...STUDIO_CONTENT_TABLES].reverse())if(!t.root)db.exec(`DELETE FROM ${t.name}`);
 if(!g)return;
 for(const t of STUDIO_CONTENT_TABLES){
  const columns=[...t.columns,...(t.name==='jobs'?['input_json','lease_owner','lease_expires_at','attempt','checkpoint_json']:[])];
  const conflict=t.root?` ON CONFLICT(${t.keys.join(',')}) DO UPDATE SET ${columns.filter(c=>!t.keys.includes(c)).map(c=>c+'=excluded.'+c).join(',')}`:'';
  const insert=db.prepare(`INSERT INTO ${t.name} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})${conflict}`);
  for(const row of g[t.name]!)insert.run(...columns.map(c=>c==='input_json'?'{}':c==='attempt'?0:row[c]??null));
 }
 if(db.prepare('PRAGMA foreign_key_check').get())invalidStudio();
 validateStudioSaved(db,g);
}
function replica(db:SqliteDatabase,path:string,space:StorageSpace,projectId:string,context:Context){
 if(space.spaceId!==context.spaceId||context.projectId!==projectId||readDatabaseSpace(db)?.spaceId!==space.spaceId)throw studioSyncErrors.sync_scope('研究库的空间或项目不匹配');
 const key=studioSyncKey(projectId),check=(input:string)=>{if(input!==key)throw studioSyncErrors.sync_scope('研究资产标识不匹配');};
 return createSqliteReplica(studioReplicaDatabase(db),{authorize:context.authorize,conflictState:context.conflictState,
  read(input){check(input);idle(db,path);try{const raw=graph(db);if(!raw.workspaces!.length)return null;const g=studioGraph(raw);validateStudioSaved(db,g);return {format:1,spaceId:space.spaceId,project:{id:projectId,title:context.title},graph:g};}catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='alchemist.sync_limit')throw error;invalidStudio();}},
  apply(input,value){check(input);idle(db,path);try{
   if(value===null){replace(db,null);return;}
   const w=studioObject(value);studioExact(w,['format','spaceId','project','graph']);const project=studioObject(w.project);studioExact(project,['id','title']);
   if(w.format!==1||w.spaceId!==context.spaceId||project.id!==projectId||typeof project.title!=='string'||!project.title.trim()||project.title.length>120)invalidStudio();
   replace(db,studioGraph(w.graph));
  }catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='alchemist.sync_limit')throw error;invalidStudio();}},
 });
}
