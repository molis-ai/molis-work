import {openBaselineHomeSqlite,openAggregateCopyOwner,type AggregateCopyContext} from '@molis-ai/molis-work-storage';
import {LINGGUANG_DATABASE,LINGGUANG_HOME_STORE} from './store.js';
import {lingguangAggregates} from './replication.js';
/** The same owner graph, with a read-only source connection and no missing-store creation. */
export function openLingguangCopyOwner(home:string,context:AggregateCopyContext){return openAggregateCopyOwner(home,LINGGUANG_HOME_STORE.path,LINGGUANG_DATABASE,lingguangAggregates,context,()=>openBaselineHomeSqlite(home,LINGGUANG_HOME_STORE.path,LINGGUANG_DATABASE));}
