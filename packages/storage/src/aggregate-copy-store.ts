import {lstatSync} from 'node:fs';
import {dirname} from 'node:path';
import type {DatabaseSync} from 'node:sqlite';
import type {ProjectCopyOwner} from '@molis-ai/molis-work-contracts/services/placement';
import {homeSqlitePath,openReadOnlyHomeSqlite} from './home-sqlite.js';
import {SqliteSchemaVersionError,type SqliteBaseline} from './sqlite-baseline.js';
import {readStorageSpace,readDatabaseSpace} from './space.js';
import {createAggregateCopy,scopeAggregateCopyContext,type AggregateCopyContext} from './aggregate-copy.js';
import {initializeAggregateReplication,type AggregateDefinition} from './aggregate-replica.js';
import type {ReplicaDatabase} from './replica.js';
import {syncError} from './project-replica-sync-errors.js';

/** Source opens are read-only and absent stores stay absent. Owner constants choose all paths and tables. */
export function openAggregateCopyOwner(home:string,storeName:string,baseline:SqliteBaseline,definitions:readonly AggregateDefinition[]|((db:ReplicaDatabase)=>readonly AggregateDefinition[]),context:AggregateCopyContext,openTarget?:()=>DatabaseSync):{owner:ProjectCopyOwner;close():void}|null {
 return openOwnerCopyStore(home,storeName,baseline,context,(db,scope)=>{const owners=typeof definitions==='function'?definitions(db):definitions;if(scope.direction==='target')initializeAggregateReplication(db,owners);return createAggregateCopy(db,owners,scope);},openTarget);
}
/** Owner chooses its projection and journaling; this function only owns readonly paths, schema and handle lifetime. */
export function openOwnerCopyStore(home:string,storeName:string,baseline:SqliteBaseline,context:AggregateCopyContext,create:(db:DatabaseSync,context:AggregateCopyContext)=>ProjectCopyOwner,openTarget?:()=>DatabaseSync):{owner:ProjectCopyOwner;close():void}|null {
 context=scopeAggregateCopyContext(context);context.authorize();if(!/^[a-z][a-z0-9_-]*$/.test(storeName))throw syncError('invalid','复制资料库定位无效');
 const space=readStorageSpace(home);if(!space||space.spaceId!==context.spaceId||context.direction==='target'&&space.kind!=='personal')throw syncError('scope','复制资料库不属于当前空间');
 const filename=homeSqlitePath(home,storeName);
 const present=(name:string,directory:boolean)=>{try{const stat=lstatSync(name);if(stat.isSymbolicLink()||!(directory?stat.isDirectory():stat.isFile()))throw syncError('invalid','复制资料库不能通过链接读取');return true;}catch(error){if(error&&typeof error==='object'&&'code' in error&&error.code==='ENOENT')return false;throw error;}};
 if(context.direction==='source'&&(!present(dirname(filename),true)||!present(filename,false)))return null;
 if(context.direction==='target'){if(!openTarget)throw syncError('unsupported','目标资料库必须由 owner 显式打开当前基线');present(dirname(filename),true);present(filename,false);}
 const db=context.direction==='source'?openReadOnlyHomeSqlite(home,storeName):openTarget!();
 try{
  if(JSON.stringify(readDatabaseSpace(db))!==JSON.stringify(space))throw syncError('scope','复制连接不属于当前 owner 空间');
  const found=Number(db.prepare('PRAGMA user_version').get()!.user_version);if(found!==baseline.version)throw new SqliteSchemaVersionError(filename,found,baseline.version);
  let alive=true;const check=()=>{if(!alive)throw syncError('unavailable','原复制接口已关闭');context.authorize();};
  const owner=create(db,{...context,authorize:check});check();return {owner,close(){if(!alive)return;alive=false;db.close();}};
 }catch(error){db.close();throw error;}
}
