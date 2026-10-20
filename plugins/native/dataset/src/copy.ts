import {openBaselineHomeSqlite,openAggregateCopyOwner,type AggregateCopyContext} from '@molis-ai/molis-work-storage';
import {DATASET_STORE_BASELINE,DATASET_HOME_STORE} from './store.js';
import {datasetAggregates} from './replication.js';
/** The same owner graph, with a read-only source connection and no missing-store creation. */
export function openDatasetCopyOwner(home:string,context:AggregateCopyContext){return openAggregateCopyOwner(home,DATASET_HOME_STORE.path,DATASET_STORE_BASELINE,datasetAggregates,context,()=>openBaselineHomeSqlite(home,DATASET_HOME_STORE.path,DATASET_STORE_BASELINE));}
