import { projectReplicationOwner,projectPluginRequirements } from '@molis-ai/molis-work-module-projects';
import { LocalSqliteStorage,ensureStorageSpace,readDatabaseSpace,initializeReplica,createSqliteReplica,hasReplicaBodies,inspectCatalogFile,type SqliteReplica } from '@molis-ai/molis-work-storage';
import type { SyncLocalProtection } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import {createSyncConflictState} from '@molis-ai/molis-work-plugin-sdk';
import {join} from 'node:path';
import {assertCurrentCatalog,assertOwnedCatalog,assertCatalogMetadata} from './catalog-schema.js';
import {PERSONAL_SPACE_PROJECT_ID} from './personal-space.js';
import {projectCatalogJournal as journal} from './project-catalog-replication-schema.js';

/** Refuse old/foreign stores read-only before a writer can change journal_mode or create sidecars. */
export function preflightProjectCatalog(databasePath:string){
  assertCatalogMetadata(inspectCatalogFile(databasePath),databasePath);
}
function open(home:string,authorize:()=>void){
  authorize();const path=join(home,'projects','catalog.db');preflightProjectCatalog(path);authorize();
  const store=new LocalSqliteStorage(path,{fileMustExist:true});
  try{
    const space=ensureStorageSpace(home),bound=readDatabaseSpace(store.db);
    if(space.kind!=='personal'||bound?.spaceId!==space.spaceId||bound.ownerUserId!==space.ownerUserId)throw new Error('项目资料库不属于当前个人空间');
    assertOwnedCatalog(store,path);assertCurrentCatalog(store,path);initializeReplica(journal(store.db),false);
    return {store,space};
  }catch(error){store.close();throw error;}
}
export function withProjectCatalogReplica<T>(home:string,authorize:()=>void,protection:SyncLocalProtection,run:(replica:SqliteReplica)=>T,authorizeLifecycle?:(key:string,recycled:boolean)=>void):T{
  const {store,space}=open(home,authorize);
  try{return run(createSqliteReplica(journal(store.db),{...projectReplicationOwner(store.db,{spaceId:space.spaceId,authorize,authorizeLifecycle,excludedProjectIds:[PERSONAL_SPACE_PROJECT_ID]}),protection,conflictState:createSyncConflictState}));}finally{store.close();}
}
export function projectCatalogHasProtectedData(home:string):boolean{
  const path=join(home,'projects','catalog.db');preflightProjectCatalog(path);
  const store=new LocalSqliteStorage(path,{readonly:true});try{return hasReplicaBodies(journal(store.db));}finally{store.close();}
}
export {projectPluginRequirements};
