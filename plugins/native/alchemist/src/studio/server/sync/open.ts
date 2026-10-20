import Database from 'better-sqlite3';
import {lstatSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {SqliteSchemaVersionError} from '@molis-ai/molis-work-storage';
import {ALCHEMIST_STUDIO_BASELINE,applyStudioBaseline} from '../db/schema.js';
import {openDatabase,type SqliteDatabase} from '../db/open-database.js';
import {studioSyncErrors} from './errors.js';

export function studioSyncPath(home:string,projectId:string):string{
 if(!projectId||projectId.length>80)throw studioSyncErrors.sync_scope('研究空间的项目标识无效');
 let directory=home;
 for(const component of ['alchemist','projects',encodeURIComponent(projectId).replaceAll('.','%2E')]){
  directory=join(directory,component);
  const entry=lstatSync(directory,{throwIfNoEntry:false});
  if(entry&&(!entry.isDirectory()||entry.isSymbolicLink()))throw studioSyncErrors.sync_scope('研究空间目录不允许链接');
  mkdirSync(directory,{recursive:true,mode:0o700});
 }
 return join(directory,'studio.sqlite');
}
/** Refuse an old library read-only before opening WAL or changing any byte. */
export function openStudioDatabase(path:string):SqliteDatabase{
 mkdirSync(dirname(path),{recursive:true});
 for(const file of [path,path+'-wal',path+'-shm',path+'-journal']){const entry=lstatSync(file,{throwIfNoEntry:false});if(entry&&(!entry.isFile()||entry.isSymbolicLink()))throw studioSyncErrors.sync_scope('研究库及其日志不允许链接');}
 if(lstatSync(path,{throwIfNoEntry:false})){
  const previous=new Database(path,{readonly:true,fileMustExist:true});
  try{
   const found=Number(previous.pragma('user_version',{simple:true}));
   const business=previous.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1").get();
   if(found!==ALCHEMIST_STUDIO_BASELINE.version&&(found!==0||business))throw new SqliteSchemaVersionError(path,found,ALCHEMIST_STUDIO_BASELINE.version);
  }finally{previous.close();}
 }
 const db=openDatabase(path);try{applyStudioBaseline(db,path);return db;}catch(error){db.close();throw error;}
}
