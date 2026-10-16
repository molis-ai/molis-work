import {openBaselineHomeSqlite,type SqliteBaseline} from '@molis-ai/molis-work-storage';
export const SYNC_STORE_BASELINE:SqliteBaseline={version:1,schema:`
CREATE TABLE sync_policy(id INTEGER PRIMARY KEY CHECK(id=1),json TEXT NOT NULL);
CREATE TABLE sync_partition_cursors(namespace TEXT PRIMARY KEY,cursor INTEGER NOT NULL);
`};
export function openSyncDatabase(home:string){return openBaselineHomeSqlite(home,'sync',SYNC_STORE_BASELINE);}
export const SYNC_HOME_STORE={path:'sync',library:{baseline:SYNC_STORE_BASELINE}} as const;
