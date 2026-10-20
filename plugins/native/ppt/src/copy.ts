import {openBaselineHomeSqlite,openAggregateCopyOwner,type AggregateCopyContext} from '@molis-ai/molis-work-storage';
import {PPT_STORE_BASELINE,PPT_HOME_STORE} from './store.js';
import {pptAggregates} from './replication.js';
/** The same owner graph, with a read-only source connection and no missing-store creation. */
export function openPptCopyOwner(home:string,context:AggregateCopyContext){return openAggregateCopyOwner(home,PPT_HOME_STORE.path,PPT_STORE_BASELINE,pptAggregates,context,()=>openBaselineHomeSqlite(home,PPT_HOME_STORE.path,PPT_STORE_BASELINE));}
